<?php

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;

class SCurvePredictionService
{
    /**
     * Compute comprehensive S-Curve data with Curve Shifting / Remaining Work Projection.
     *
     * Instead of compressing remaining work into the original deadline, the Prediction line
     * copies the shape/increments of the remaining Planned Progress curve and shifts it to start
     * from the latest Actual Progress point (Current Timeline), dynamically extending periods
     * until 100% is reached.
     *
     * @param Project $project
     * @return array
     */
    public function calculate(Project $project): array
    {
        $weeklyService = app(WeeklyService::class);
        $projectWeekly = $weeklyService->recalculate($project->id);

        $weeks = $projectWeekly['weekly_data'] ?? [];
        if (empty($weeks)) {
            return [
                'points' => [],
                'metrics' => [
                    'spi' => 1.0,
                    'is_delayed' => false,
                    'delay_days' => 0,
                    'forecast_end_date' => $project->end?->format('Y-m-d'),
                    'weekly_velocity' => 0.0,
                    'planned_end_date' => $project->end?->format('Y-m-d'),
                    'overdue_tasks_count' => 0,
                    'variance_progress' => 0.0,
                ],
            ];
        }

        $now = Carbon::now();
        $overallProgress = (float) ($project->progress ?? 0);

        // 1. Find Latest Actual Point (Current Timeline)
        // Find current elapsed week index based on today's date
        $lastActualIndex = 0;
        foreach ($weeks as $idx => $w) {
            $wStart = Carbon::parse($w['start_date'])->startOfDay();
            $wEnd = Carbon::parse($w['end_date'])->endOfDay();
            if ($now->betweenIncluded($wStart, $wEnd)) {
                $lastActualIndex = $idx;
                break;
            } elseif ($now->gt($wEnd)) {
                $lastActualIndex = $idx;
            }
        }
        $lastActualIndex = max(0, min($lastActualIndex, count($weeks) - 1));

        $currentWeek = $weeks[$lastActualIndex];
        $currentPlanned = (float) ($currentWeek['planned_cumulative'] ?? 0);

        // If actual_cumulative is reported on the week, use it; otherwise fallback to project overall progress
        $lastActualValue = (float) ($currentWeek['actual_cumulative'] > 0
            ? $currentWeek['actual_cumulative']
            : $overallProgress);

        // If today is before the first week, actual progress is 0 unless recorded
        if ($now->lt(Carbon::parse($weeks[0]['start_date'])->startOfDay()) && $lastActualValue <= 0) {
            $lastActualIndex = 0;
            $lastActualValue = 0.0;
        }

        // Clamp lastActualValue between 0.0 and 100.0
        $lastActualValue = max(0.0, min(100.0, round($lastActualValue, 2)));

        // Schedule Performance Index (SPI = EV / PV)
        $spi = ($currentPlanned > 0) ? round($lastActualValue / $currentPlanned, 3) : 1.0;

        // Check for specific overdue tasks and count total tasks
        $totalTasksCount = 0;
        $overdueTasksCount = 0;
        $maxOverdueDays = 0;
        if ($project->relationLoaded('mainWbs') || $project->mainWbs) {
            foreach ($project->mainWbs as $mj) {
                foreach ($mj->subWbs ?? [] as $smj) {
                    $tasks = $smj->wbsTasks ?? [];
                    $totalTasksCount += count($tasks);
                    foreach ($tasks as $task) {
                        if (!$task->is_completed && $task->end) {
                            $taskEnd = Carbon::parse($task->end)->endOfDay();
                            if ($now->gt($taskEnd)) {
                                $overdueTasksCount++;
                                $overdueDays = (int) abs($now->diffInDays($taskEnd));
                                if ($overdueDays > $maxOverdueDays) {
                                    $maxOverdueDays = $overdueDays;
                                }
                            }
                        }
                    }
                }
            }
        }

        // If project has no tasks yet, return calendar week points without false delays
        if ($totalTasksCount === 0) {
            $chartPoints = [];
            foreach ($weeks as $w) {
                $chartPoints[] = [
                    'week' => $w['week'],
                    'start_date' => $w['start_date'],
                    'end_date' => $w['end_date'],
                    'planned_cumulative' => (float) ($w['planned_cumulative'] ?? 0),
                    'actual_cumulative' => null,
                    'prediction_cumulative' => null,
                    'is_extended_forecast' => false,
                ];
            }

            return [
                'points' => $chartPoints,
                'metrics' => [
                    'spi' => 1.0,
                    'is_delayed' => false,
                    'overdue_tasks_count' => 0,
                    'delay_days' => 0,
                    'weekly_velocity' => 0.0,
                    'planned_end_date' => $project->end?->format('Y-m-d'),
                    'forecast_end_date' => $project->end?->format('Y-m-d'),
                    'variance_progress' => 0.0,
                ],
            ];
        }

        // Calculate velocity (% progress completed per week)
        $elapsedWeeksCount = max(1, $lastActualIndex + 1);
        $weeklyVelocity = ($elapsedWeeksCount > 0 && $lastActualValue > 0)
            ? ($lastActualValue / $elapsedWeeksCount)
            : ($currentPlanned / $elapsedWeeksCount);
        $weeklyVelocity = max(0.1, round($weeklyVelocity, 2));

        // 2. Find the first planned point that reaches or exceeds actual progress.
        $planTotalWeeks = count($weeks);
        $first100Index = $planTotalWeeks - 1;
        foreach ($weeks as $idx => $w) {
            if ((float) $w['planned_cumulative'] >= 99.99) {
                $first100Index = $idx;
                break;
            }
        }

        $eqPlanIndex = $first100Index;
        for ($idx = 0; $idx <= $first100Index; $idx++) {
            if ((float) $weeks[$idx]['planned_cumulative'] > $lastActualValue) {
                $eqPlanIndex = $idx;
                break;
            }
        }

        // 3. Keep the forecast joined to actual at the current period, then shift the plan.
        $predictionByWeekIndex = [];
        for ($i = 0; $i < $lastActualIndex; $i++) {
            $predictionByWeekIndex[$i] = null;
        }
        $predictionByWeekIndex[$lastActualIndex] = $lastActualValue;

        if ($lastActualValue < 99.99) {
            for ($planIdx = $eqPlanIndex; $planIdx <= $first100Index; $planIdx++) {
                $weekIdx = $lastActualIndex + 1 + ($planIdx - $eqPlanIndex);
                $previousPrediction = $predictionByWeekIndex[$weekIdx - 1];
                $plannedValue = (float) $weeks[$planIdx]['planned_cumulative'];
                $predictionByWeekIndex[$weekIdx] = $planIdx === $first100Index
                    ? 100.0
                    : round(max($previousPrediction, min(100.0, $plannedValue)), 2);
            }
        }

        // 4. Keep the chart through whichever scheduled or forecast completion is latest.
        $maxPredictedWeekIndex = max(array_keys($predictionByWeekIndex));
        $actualCompleted = $lastActualValue >= 99.99;
        $totalTimelineWeeks = $actualCompleted
            ? $lastActualIndex + 1
            : max($first100Index, $maxPredictedWeekIndex) + 1;

        $chartPoints = [];
        for ($i = 0; $i < $totalTimelineWeeks; $i++) {
            if ($i < $planTotalWeeks) {
                $planWeek = $weeks[$i];
                $weekNumber = $planWeek['week'];
                $startDate = $planWeek['start_date'];
                $endDate = $planWeek['end_date'];
                $plannedCum = (float) $planWeek['planned_cumulative'];
                $actualCum = ($i <= $lastActualIndex && (float) $planWeek['actual_cumulative'] > 0)
                    ? (float) $planWeek['actual_cumulative']
                    : ($i === $lastActualIndex && $lastActualValue > 0 ? $lastActualValue : null);
                $isExtended = false;
            } else {
                // Extended forecast weeks beyond the planned deadline
                $prevEnd = Carbon::parse($chartPoints[$i - 1]['end_date']);
                $newStart = $prevEnd->copy()->addDay();
                $newEnd = $newStart->copy()->addDays(6);

                $weekNumber = $i + 1;
                $startDate = $newStart->format('Y-m-d');
                $endDate = $newEnd->format('Y-m-d');
                $plannedCum = 100.0;
                $actualCum = null;
                $isExtended = true;
            }

            // Assign prediction value
            $predVal = $predictionByWeekIndex[$i] ?? null;
            if ($predVal === null && $i > $lastActualIndex && !empty($chartPoints) && $chartPoints[$i - 1]['prediction_cumulative'] >= 99.99) {
                $predVal = 100.0;
            }

            $chartPoints[] = [
                'week' => $weekNumber,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'planned_cumulative' => $plannedCum,
                'actual_cumulative' => $actualCum,
                'prediction_cumulative' => $predVal,
                'is_extended_forecast' => $isExtended,
            ];
        }

        // Calculate forecasted project completion date
        $forecastEndDate = $project->end?->format('Y-m-d');
        foreach ($chartPoints as $pt) {
            if ($pt['prediction_cumulative'] !== null && $pt['prediction_cumulative'] >= 99.99) {
                $forecastEndDate = $pt['end_date'];
                break;
            }
        }
        if (!$forecastEndDate && !empty($chartPoints)) {
            $forecastEndDate = end($chartPoints)['end_date'];
        }

        $plannedEndCarbon = $project->end ? Carbon::parse($project->end)->endOfDay() : null;
        $forecastEndCarbon = $forecastEndDate ? Carbon::parse($forecastEndDate)->endOfDay() : null;
        $projectedDelayDays = ($plannedEndCarbon && $forecastEndCarbon && $forecastEndCarbon->gt($plannedEndCarbon))
            ? (int) ceil($plannedEndCarbon->diffInDays($forecastEndCarbon))
            : 0;

        $isDelayed = ($projectedDelayDays > 0) || ($spi < 0.98 && ($currentPlanned - $lastActualValue) > 1.0) || ($overdueTasksCount > 0);
        $effectiveDelayDays = max($maxOverdueDays, $projectedDelayDays);

        return [
            'points' => $chartPoints,
            'metrics' => [
                'spi' => $spi,
                'is_delayed' => $isDelayed,
                'overdue_tasks_count' => $overdueTasksCount,
                'delay_days' => $effectiveDelayDays,
                'weekly_velocity' => $weeklyVelocity,
                'planned_end_date' => $project->end?->format('Y-m-d'),
                'forecast_end_date' => $forecastEndDate,
                'variance_progress' => round($lastActualValue - $currentPlanned, 2),
            ],
        ];
    }
}
