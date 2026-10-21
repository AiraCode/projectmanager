<?php

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;

class SCurvePredictionService
{
    /**
     * Compute comprehensive S-Curve data with EVM-based dynamic prediction.
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
                'weeks' => [],
                'metrics' => [
                    'spi' => 1.0,
                    'is_delayed' => false,
                    'delay_days' => 0,
                    'forecast_end_date' => $project->end?->format('Y-m-d'),
                ],
            ];
        }

        $now = Carbon::now();
        $overallProgress = (float) ($project->progress ?? 0);

        // Find current elapsed week index based on today's date
        $currentWeekIdx = 0;
        foreach ($weeks as $idx => $w) {
            $wStart = Carbon::parse($w['start_date'])->startOfDay();
            $wEnd = Carbon::parse($w['end_date'])->endOfDay();
            if ($now->betweenIncluded($wStart, $wEnd)) {
                $currentWeekIdx = $idx;
                break;
            } elseif ($now->gt($wEnd)) {
                $currentWeekIdx = $idx;
            }
        }

        $currentWeek = $weeks[$currentWeekIdx] ?? $weeks[0];
        $currentPlanned = (float) ($currentWeek['planned_cumulative'] ?? 0);
        $currentActual = $overallProgress;

        // Calculate Schedule Performance Index (SPI = EV / PV)
        $spi = ($currentPlanned > 0) ? round($currentActual / $currentPlanned, 3) : 1.0;
        $isDelayed = $spi < 0.98 && ($currentPlanned - $currentActual) > 1.0;

        // Check for specific overdue tasks
        $overdueTasksCount = 0;
        $maxOverdueDays = 0;
        foreach ($project->mainWbs as $mj) {
            foreach ($mj->subWbs as $smj) {
                foreach ($smj->wbsTasks as $task) {
                    if (!$task->is_completed && $task->end) {
                        $taskEnd = Carbon::parse($task->end)->endOfDay();
                        if ($now->gt($taskEnd)) {
                            $overdueTasksCount++;
                            $overdueDays = $now->diffInDays($taskEnd);
                            if ($overdueDays > $maxOverdueDays) {
                                $maxOverdueDays = $overdueDays;
                            }
                        }
                    }
                }
            }
        }

        // Calculate velocity (% progress completed per week)
        $elapsedWeeksCount = max(1, $currentWeekIdx + 1);
        $weeklyVelocity = ($elapsedWeeksCount > 0 && $currentActual > 0)
            ? ($currentActual / $elapsedWeeksCount)
            : ($currentPlanned / $elapsedWeeksCount);

        $weeklyVelocity = max(0.5, $weeklyVelocity); // floor to prevent division by zero

        $remainingProgress = max(0.0, 100.0 - $currentActual);
        $estimatedRemainingWeeks = (int) ceil($remainingProgress / $weeklyVelocity);

        $forecastTotalWeeks = $currentWeekIdx + 1 + $estimatedRemainingWeeks;
        $planTotalWeeks = count($weeks);

        // Build augmented prediction points
        $chartPoints = [];
        $runningPrediction = $currentActual;

        for ($i = 0; $i < max($planTotalWeeks, $forecastTotalWeeks); $i++) {
            $planWeek = $weeks[$i] ?? null;

            if ($planWeek) {
                $weekNumber = $planWeek['week'];
                $startDate = $planWeek['start_date'];
                $endDate = $planWeek['end_date'];
                $plannedCum = (float) $planWeek['planned_cumulative'];
                $actualCum = ($i <= $currentWeekIdx) ? (float) $planWeek['actual_cumulative'] : null;
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
            }

            // Prediction line calculation
            $prediction = null;
            if ($i < $currentWeekIdx) {
                $prediction = null; // Don't clutter past weeks
            } elseif ($i === $currentWeekIdx) {
                $prediction = $currentActual;
            } else {
                if ($isDelayed || $overdueTasksCount > 0) {
                    // Shifted prediction based on actual velocity
                    $runningPrediction = min(100.0, round($runningPrediction + $weeklyVelocity, 2));
                    $prediction = $runningPrediction;
                } else {
                    // On track or ahead: smooth path to 100% by remaining planned distribution
                    $remainingPlan = max(0.01, 100.0 - $currentPlanned);
                    $planGain = max(0, $plannedCum - $currentPlanned);
                    $ratio = min(1.0, max(0.0, $planGain / $remainingPlan));
                    $prediction = round($currentActual + ($ratio * $remainingProgress), 2);
                }
            }

            $chartPoints[] = [
                'week' => $weekNumber,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'planned_cumulative' => $plannedCum,
                'actual_cumulative' => $actualCum,
                'prediction_cumulative' => $prediction,
                'is_extended_forecast' => $i >= $planTotalWeeks,
            ];
        }

        // Calculate forecasted project completion date
        $lastPoint = end($chartPoints);
        $forecastEndDate = $lastPoint ? $lastPoint['end_date'] : $project->end?->format('Y-m-d');

        return [
            'points' => $chartPoints,
            'metrics' => [
                'spi' => $spi,
                'is_delayed' => $isDelayed || $overdueTasksCount > 0,
                'overdue_tasks_count' => $overdueTasksCount,
                'delay_days' => $maxOverdueDays,
                'weekly_velocity' => round($weeklyVelocity, 2),
                'planned_end_date' => $project->end?->format('Y-m-d'),
                'forecast_end_date' => $forecastEndDate,
                'variance_progress' => round($currentActual - $currentPlanned, 2),
            ],
        ];
    }
}
