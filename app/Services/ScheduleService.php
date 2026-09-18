<?php

namespace App\Services;

use App\Models\Project;
use App\Models\SubWbs;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class ScheduleService
{
    /**
     * Recalculates the schedule for a specific project.
     * This replaces the old Typescript relaxation algorithm.
     */
    public function recalculateProjectSchedule($projectId)
    {
        $project = Project::with(['mainWbs.subWbs'])->findOrFail($projectId);

        // 1. Build a map of all SubWbs by their ID for easy lookup
        $taskMap = [];
        foreach ($project->mainWbs as $mainWbs) {
            foreach ($mainWbs->subWbs as $sub) {
                $taskMap[$sub->id] = $sub;
            }
        }

        $changed = true;
        $iterations = 0;
        $maxIter = count($taskMap) + 1;

        // 2. Relaxation Algorithm
        while ($changed && $iterations < $maxIter) {
            $changed = false;
            $iterations++;

            foreach ($project->mainWbs as $mainWbs) {
                foreach ($mainWbs->subWbs as $st) {
                    $newStart = $st->start ? Carbon::parse($st->start) : null;
                    $newEnd = $st->end ? Carbon::parse($st->end) : null;
                    
                    // Duration in days based on current start/end, default 1 if empty
                    $duration = 1;
                    if ($newStart && $newEnd) {
                        $duration = $newStart->diffInDays($newEnd) + 1;
                    }

                    if ($st->predecessor && isset($taskMap[$st->predecessor])) {
                        $pred = $taskMap[$st->predecessor];
                        $lag = (int) $st->lag_lead_time;
                        $depType = $st->predecessor_type ?: 'FS';

                        if ($pred->start && $pred->end) {
                            $predStart = Carbon::parse($pred->start);
                            $predEnd = Carbon::parse($pred->end);

                            if ($depType === 'FS') {
                                $newStart = $predEnd->copy()->addDays($lag);
                                $newEnd = $newStart->copy()->addDays($duration - 1);
                            } elseif ($depType === 'SS') {
                                $newStart = $predStart->copy()->addDays($lag);
                                $newEnd = $newStart->copy()->addDays($duration - 1);
                            } elseif ($depType === 'FF') {
                                $newEnd = $predEnd->copy()->addDays($lag);
                                $newStart = $newEnd->copy()->subDays($duration - 1);
                            } elseif ($depType === 'SF') {
                                $newEnd = $predStart->copy()->addDays($lag);
                                $newStart = $newEnd->copy()->subDays($duration - 1);
                            }
                        }
                    }

                    // Check if changed
                    $isStartChanged = $newStart && (!$st->start || !Carbon::parse($st->start)->isSameDay($newStart));
                    $isEndChanged = $newEnd && (!$st->end || !Carbon::parse($st->end)->isSameDay($newEnd));

                    if ($isStartChanged || $isEndChanged) {
                        $st->start = $newStart ? $newStart->startOfDay() : $st->start;
                        $st->end = $newEnd ? $newEnd->endOfDay() : $st->end;
                        
                        $changed = true;
                        $taskMap[$st->id] = $st;
                    }
                }
            }
        }

        // 3. Save all updated SubWbs and Roll up dates
        $projectStart = null;
        $projectEnd = null;

        foreach ($project->mainWbs as $mainWbs) {
            $mainStart = null;
            $mainEnd = null;

            foreach ($mainWbs->subWbs as $st) {
                // Save if dirty
                if ($st->isDirty(['start', 'end'])) {
                    $st->save();
                }

                if ($st->start) {
                    $stDate = Carbon::parse($st->start);
                    if (!$mainStart || $stDate->lt($mainStart)) $mainStart = $stDate;
                }
                if ($st->end) {
                    $enDate = Carbon::parse($st->end);
                    if (!$mainEnd || $enDate->gt($mainEnd)) $mainEnd = $enDate;
                }
            }

            if ($mainStart || $mainEnd) {
                if ($mainStart) $mainWbs->actual_start = $mainStart;
                if ($mainEnd) $mainWbs->actual_end = $mainEnd;
                $mainWbs->save();
            }

            // Roll up to project
            if ($mainStart && (!$projectStart || $mainStart->lt($projectStart))) {
                $projectStart = $mainStart;
            }
            if ($mainEnd && (!$projectEnd || $mainEnd->gt($projectEnd))) {
                $projectEnd = $mainEnd;
            }
        }

        if ($projectStart) $project->actual_start = $projectStart;
        if ($projectEnd) $project->actual_end = $projectEnd;
        $project->save();
    }
}
