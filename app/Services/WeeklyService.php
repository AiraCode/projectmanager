<?php

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;

class WeeklyService
{
    /**
     * Generate weekly S-Curve data (Planned vs Actual Cumulative)
     */
    public function getWeeklyData($projectId)
    {
        $project = Project::with(['mainWbs'])->findOrFail($projectId);

        if (!$project->start || !$project->end) {
            return [];
        }

        $minDate = Carbon::parse($project->start);
        $maxDate = Carbon::parse($project->end);

        // 1. Generate Week Boundaries
        $weeks = [];
        $currentStart = $minDate->copy();
        $weekNum = 1;

        while ($currentStart->lte($maxDate)) {
            $currentEnd = $currentStart->copy()->addDays(6);
            $weeks[] = [
                'week' => $weekNum,
                'startDate' => $currentStart->copy(),
                'endDate' => $currentEnd->copy(),
            ];
            $currentStart = $currentEnd->copy()->addDay();
            $weekNum++;
        }

        // 2. Extract Schedulable Leaf Items with Daily Rate ("Dibagi Hari")
        $schedulableItems = [];

        foreach ($project->mainWbs as $mj) {
            $mjWeight = (float) ($mj->percentage ?? 0);
            if ($mjWeight <= 0) continue;

            $mjStart = $mj->start ? Carbon::parse($mj->start)->startOfDay() : ($mj->actual_start ? Carbon::parse($mj->actual_start)->startOfDay() : null);
            $mjEnd   = $mj->end ? Carbon::parse($mj->end)->startOfDay() : ($mj->actual_end ? Carbon::parse($mj->actual_end)->startOfDay() : null);

            $subItems = [];
            foreach ($mj->subWbs ?? [] as $smj) {
                $smjStart = $smj->start ? Carbon::parse($smj->start)->startOfDay() : ($smj->actual_start ? Carbon::parse($smj->actual_start)->startOfDay() : null);
                $smjEnd   = $smj->end ? Carbon::parse($smj->end)->startOfDay() : ($smj->actual_end ? Carbon::parse($smj->actual_end)->startOfDay() : null);

                $taskItems = [];
                foreach ($smj->wbsTasks ?? [] as $st) {
                    $stStart = $st->start ? Carbon::parse($st->start)->startOfDay() : null;
                    $stEnd   = $st->end ? Carbon::parse($st->end)->startOfDay() : null;
                    if ($stStart && $stEnd) {
                        $taskItems[] = [
                            'name'   => $st->name,
                            'weight' => (float) ($st->weight ?? 0),
                            'start'  => $stStart,
                            'end'    => $stEnd,
                        ];
                    }
                }

                if (!empty($taskItems)) {
                    $smjWeight = (float) ($smj->weight ?: ($mjWeight / max(count($mj->subWbs), 1)));
                    $rawTaskSum = array_sum(array_column($taskItems, 'weight'));
                    $norm = $rawTaskSum > 0 ? ($smjWeight / $rawTaskSum) : ($smjWeight / count($taskItems));
                    foreach ($taskItems as $t) {
                        $subItems[] = [
                            'name'   => $t['name'],
                            'weight' => $rawTaskSum > 0 ? ($t['weight'] * $norm) : $norm,
                            'start'  => $t['start'],
                            'end'    => $t['end'],
                        ];
                    }
                } elseif ($smjStart && $smjEnd) {
                    $subItems[] = [
                        'name'   => $smj->name,
                        'weight' => (float) ($smj->weight ?: ($mjWeight / max(count($mj->subWbs), 1))),
                        'start'  => $smjStart,
                        'end'    => $smjEnd,
                    ];
                }
            }

            if (!empty($subItems)) {
                $rawSubSum = array_sum(array_column($subItems, 'weight'));
                $norm = $rawSubSum > 0 ? ($mjWeight / $rawSubSum) : ($mjWeight / count($subItems));
                foreach ($subItems as $s) {
                    $schedulableItems[] = [
                        'name'   => $s['name'],
                        'weight' => $rawSubSum > 0 ? ($s['weight'] * $norm) : $norm,
                        'start'  => $s['start'],
                        'end'    => $s['end'],
                    ];
                }
            } elseif ($mjStart && $mjEnd) {
                $schedulableItems[] = [
                    'name'   => $mj->name,
                    'weight' => $mjWeight,
                    'start'  => $mjStart,
                    'end'    => $mjEnd,
                ];
            }
        }

        // Normalize across all schedulable items to 100%
        $totalRawWeight = array_sum(array_column($schedulableItems, 'weight'));
        $targetTotal = $totalRawWeight > 0 ? min(100.0, round($totalRawWeight, 2)) : 0;
        $globalNorm = $totalRawWeight > 0 ? (100.0 / $totalRawWeight) : 1.0;

        foreach ($schedulableItems as &$item) {
            $item['weight'] = $item['weight'] * $globalNorm;
            $durationDays = max(1, $item['start']->diffInDays($item['end']) + 1);
            $item['dailyRate'] = $item['weight'] / $durationDays; // Bobot dibagi hari
        }
        unset($item);

        // 3. Distribute Planned Progress across weeks (Pure Daily Division + Telescoping Delta)
        $weeklyData = [];
        $rawCumulative = 0;
        $prevPlannedCum = 0;
        $actualCumulative = 0;
        $currentDate = Carbon::now()->startOfDay();
        $totalWeeks = count($weeks);

        foreach ($weeks as $idx => $w) {
            $weekPlannedRaw = 0;

            foreach ($schedulableItems as $item) {
                if ($item['start']->lte($w['endDate']) && $item['end']->gte($w['startDate'])) {
                    $overlapStart = $item['start']->greaterThan($w['startDate']) ? $item['start'] : $w['startDate'];
                    $overlapEnd   = $item['end']->lessThan($w['endDate']) ? $item['end'] : $w['endDate'];
                    $overlapDays  = max(0, $overlapStart->diffInDays($overlapEnd) + 1);
                    $weekPlannedRaw += ($item['dailyRate'] * $overlapDays);
                }
            }

            $rawCumulative += $weekPlannedRaw;

            if ($idx === $totalWeeks - 1) {
                $plannedCumulative = 100.00;
                $weekPlanned = round(max(0, 100.00 - $prevPlannedCum), 2);
            } else {
                $plannedCumulative = round(min(100.00, $rawCumulative), 2);
                $weekPlanned = round(max(0, $plannedCumulative - $prevPlannedCum), 2);
            }
            $prevPlannedCum = $plannedCumulative;

            // Actual progress curve (Linear interpolation up to current project progress)
            $actualValue = 0;
            if ($w['endDate']->lt($currentDate) || $w['startDate']->lte($currentDate)) {
                $actualValue = $weekPlanned * (($project->progress ?? 0) / 100);
            }
            
            $actualCumulative += round($actualValue, 2);
            $actualCumulative = min(round($actualCumulative, 2), (float) ($project->progress ?? 0));

            $weeklyData[] = [
                'week' => $w['week'],
                'startDate' => $w['startDate']->toDateString(),
                'endDate' => $w['endDate']->toDateString(),
                'planned' => $weekPlanned,
                'actual' => round($actualValue, 2),
                'plannedCumulative' => $plannedCumulative,
                'actualCumulative' => $actualCumulative,
            ];
        }

        return $weeklyData;
    }

    /**
     * Get current cumulative planned progress up to current date.
     */
    public function getCurrentPlannedProgress($projectId)
    {
        $weeklyData = $this->getWeeklyData($projectId);
        if (empty($weeklyData)) {
            $project = Project::find($projectId);
            if (!$project || !$project->start || !$project->end) return 0;
            $now = Carbon::now();
            if ($now->lt($project->start)) return 0;
            if ($now->gte($project->end)) return 100;
            $totalDays = $project->start->diffInDays($project->end) ?: 1;
            $elapsedDays = $project->start->diffInDays($now);
            return min(100, max(0, round(($elapsedDays / $totalDays) * 100)));
        }

        $today = Carbon::now()->toDateString();
        // Find week where today falls between startDate and endDate
        foreach ($weeklyData as $w) {
            if ($today >= $w['startDate'] && $today <= $w['endDate']) {
                return (float) $w['plannedCumulative'];
            }
        }

        // If today is before first week
        if ($today < $weeklyData[0]['startDate']) {
            return 0.0;
        }

        // If today is after last week
        return 100.0;
    }
}
