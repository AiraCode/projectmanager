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

        // 2. Distribute Planned Progress
        $weeklyData = [];
        $plannedCumulative = 0;
        
        // For actuals, we simulate progress based on project current progress
        // Ideally we would query a historical progress table.
        $actualCumulative = 0;
        $currentDate = Carbon::now();

        foreach ($weeks as $w) {
            $weekPlanned = 0;

            foreach ($project->mainWbs as $mj) {
                if (!$mj->actual_start || !$mj->actual_end || !$mj->percentage) {
                    continue;
                }

                $mjStart = Carbon::parse($mj->actual_start);
                $mjEnd = Carbon::parse($mj->actual_end);

                // Check if this Main Job is active during this week
                if ($mjStart->lte($w['endDate']) && $mjEnd->gte($w['startDate'])) {
                    $mjDurationDays = $mjStart->diffInDays($mjEnd) + 1;
                    $mjTotalWeeks = max(ceil($mjDurationDays / 7), 1);
                    
                    $weekPlanned += ($mj->percentage / $mjTotalWeeks);
                }
            }

            $weekPlanned = round($weekPlanned, 2);
            $plannedCumulative += $weekPlanned;
            $plannedCumulative = min(round($plannedCumulative, 2), 100); // cap at 100%

            // Mocking actual progress curve (Linear interpolation up to current project progress)
            // If week is in the past, give it some actual value based on overall project progress
            $actualValue = 0;
            if ($w['endDate']->lt($currentDate) || $w['startDate']->lte($currentDate)) {
                // Approximate actual increment
                $actualValue = $weekPlanned * ($project->progress / 100); 
            }
            
            $actualCumulative += round($actualValue, 2);
            $actualCumulative = min(round($actualCumulative, 2), $project->progress);

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
}
