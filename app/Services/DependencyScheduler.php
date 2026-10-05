<?php

namespace App\Services;

use App\Models\Wbs;
use App\Models\SubWbs;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\TaskDependency;
use App\Models\TaskDependencyGroup;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class DependencyScheduler
{
    /**
     * Check if adding an edge from $predecessorId to $successorId introduces a cycle.
     * Uses Breadth-First Search (BFS) / DFS from $successorId to see if $predecessorId is reachable.
     */
    public function wouldCauseCycle(string $predecessorId, string $successorId): bool
    {
        if ($predecessorId === $successorId) {
            return true;
        }

        $visited = [];
        $queue = [$successorId];

        while (!empty($queue)) {
            $curr = array_shift($queue);
            if ($curr === $predecessorId) {
                return true;
            }

            if (isset($visited[$curr])) {
                continue;
            }
            $visited[$curr] = true;

            // Find all direct successors of $curr
            $nextSuccessorIds = TaskDependency::where('predecessor_wbs_id', $curr)
                ->pluck('successor_wbs_id')
                ->toArray();

            foreach ($nextSuccessorIds as $nextId) {
                if (!isset($visited[$nextId])) {
                    $queue[] = $nextId;
                }
            }
        }

        return false;
    }

    /**
     * Propagate date adjustments forward starting from a changed task.
     *
     * @param string $taskId
     * @param array $visited Set of task IDs already visited in this cascade to prevent loops
     */
    public function propagate(string $taskId, array &$visited = []): void
    {
        if (in_array($taskId, $visited, true)) {
            return;
        }
        $visited[] = $taskId;

        $task = Wbs::find($taskId);
        if (!$task || !$task->start || !$task->end) {
            return;
        }

        // Find all dependencies where $taskId is the predecessor
        $dependencies = TaskDependency::where('predecessor_wbs_id', $taskId)
            ->with(['successor', 'predecessor'])
            ->get();

        foreach ($dependencies as $dep) {
            $successor = $dep->successor;
            if (!$successor || !$successor->start || !$successor->end) {
                continue;
            }

            $changed = $this->recalculateTaskDates($successor);
            if ($changed) {
                $this->propagate($successor->id, $visited);
            }
        }

        // Cascade up to parent SubWbs and MainWbs
        $this->syncParentWbsDates($task);
    }

    /**
     * Recalculate a task's start and end dates based on all its predecessor dependencies.
     * Returns true if dates actually changed.
     */
    public function recalculateTaskDates(Wbs $task): bool
    {
        $predecessorDeps = TaskDependency::where('successor_wbs_id', $task->id)
            ->with(['predecessor', 'group'])
            ->get();

        // Also check legacy predecessor field if no TaskDependency rows exist
        if ($predecessorDeps->isEmpty() && !empty($task->predecessor) && $task->predecessor !== '-') {
            $predTask = Wbs::find($task->predecessor);
            if ($predTask) {
                $lag = (int)($task->lag ?? 0) - (int)($task->lead ?? 0);
                $depType = $task->dep_type ?: 'FS';
                $group = TaskDependencyGroup::create([
                    'successor_wbs_id' => $task->id,
                    'dependency_type'    => $depType,
                    'lag_days'           => $lag,
                ]);
                TaskDependency::create([
                    'predecessor_wbs_id' => $predTask->id,
                    'successor_wbs_id' => $task->id,
                    'dependency_group_id' => $group->id,
                    'dependency_type' => $depType,
                    'lag_days' => $lag,
                ]);

                $predecessorDeps = TaskDependency::where('successor_wbs_id', $task->id)
                    ->with(['predecessor', 'group'])
                    ->get();
            }
        }

        if ($predecessorDeps->isEmpty()) {
            return false;
        }

        $currentStart = Carbon::parse($task->start);
        $currentEnd   = Carbon::parse($task->end);

        // Compute current duration (minimum 1 day)
        $durationDays = $task->duration_days;
        if (!$durationDays || $durationDays <= 0) {
            $durationDays = max(1, $currentStart->diffInDays($currentEnd));
        }

        $newStart = $currentStart->copy();
        $newEnd   = $currentEnd->copy();

        foreach ($predecessorDeps as $dep) {
            $pred = $dep->predecessor;
            if (!$pred || !$pred->start || !$pred->end) {
                continue;
            }

            $predStart = Carbon::parse($pred->start);
            $predEnd   = Carbon::parse($pred->end);
            $lag       = $dep->effectiveLagDays();

            switch ($dep->effectiveDependencyType()) {
                case 'FS':
                    // Finish-to-Start: Successor start must be after Predecessor end - lag
                    $reqStart = $predEnd->copy()->subDays($lag);
                    if ($reqStart->gt($newStart)) {
                        $newStart = $reqStart->copy();
                    }
                    break;

                case 'SS':
                    // Start-to-Start: Successor start must be on or after Predecessor start - lag
                    $reqStart = $predStart->copy()->subDays($lag);
                    if ($reqStart->gt($newStart)) {
                        $newStart = $reqStart->copy();
                    }
                    break;

                case 'FF':
                    // Preserve task duration while enforcing the finish-date constraint.
                    $reqStart = $predEnd->copy()->subDays($lag + $durationDays);
                    if ($reqStart->gt($newStart)) {
                        $newStart = $reqStart->copy();
                    }
                    break;

                case 'SF':
                    // Preserve task duration while enforcing the finish-date constraint.
                    $reqStart = $predStart->copy()->subDays($lag + $durationDays);
                    if ($reqStart->gt($newStart)) {
                        $newStart = $reqStart->copy();
                    }
                    break;
            }
        }

        $newEnd = $newStart->copy()->addDays($durationDays);

        // Guarantee end is strictly after start (at least 1 day)
        if ($newEnd->lte($newStart)) {
            $newEnd = $newStart->copy()->addDays(1);
        }

        $diffDays = max(1, $newStart->diffInDays($newEnd));

        // Check if changed
        $hasChanged = !$currentStart->equalTo($newStart) || !$currentEnd->equalTo($newEnd);

        if ($hasChanged) {
            $task->update([
                'start'         => $newStart,
                'end'           => $newEnd,
                'duration_days' => $diffDays,
            ]);
        }

        return $hasChanged;
    }

    /**
     * Check if a task is legally allowed to start (progress > 0) based on predecessor dependencies.
     * Returns null if allowed, or an error message string if blocked.
     */
    public function validateCanStart(Wbs $task): ?string
    {
        $deps = TaskDependency::where('successor_wbs_id', $task->id)
            ->with(['predecessor', 'group'])
            ->get();

        foreach ($deps as $dep) {
            $pred = $dep->predecessor;
            if (!$pred) continue;

            $dependencyType = $dep->effectiveDependencyType();

            if ($dependencyType === 'FS') {
                if (!$pred->is_completed && ($pred->progress ?? 0) < 100) {
                    return "Cannot start task '{$task->name}'. Predecessor task '{$pred->name}' must be 100% completed first (FS Dependency).";
                }
            } elseif ($dependencyType === 'SS') {
                if (($pred->progress ?? 0) <= 0) {
                    return "Cannot start task '{$task->name}'. Predecessor task '{$pred->name}' must be started first (SS Dependency).";
                }
            }
        }

        // Fallback for single predecessor column
        if ($deps->isEmpty() && !empty($task->predecessor) && $task->predecessor !== '-') {
            $pred = Wbs::find($task->predecessor);
            $dependencyType = $task->dep_type ?: 'FS';
            if ($pred && $dependencyType === 'FS') {
                if (!$pred->is_completed && ($pred->progress ?? 0) < 100) {
                    return "Cannot start task '{$task->name}'. Predecessor task '{$pred->name}' must be 100% completed first.";
                }
            } elseif ($pred && $dependencyType === 'SS' && ($pred->progress ?? 0) <= 0) {
                return "Cannot start task '{$task->name}'. Predecessor task '{$pred->name}' must be started first.";
            }
        }

        return null;
    }

    /**
     * Check if a task is legally allowed to complete (progress == 100) based on predecessor dependencies.
     * Returns null if allowed, or an error message string if blocked.
     */
    public function validateCanComplete(Wbs $task): ?string
    {
        $deps = TaskDependency::where('successor_wbs_id', $task->id)
            ->with(['predecessor', 'group'])
            ->get();

        foreach ($deps as $dep) {
            $pred = $dep->predecessor;
            if (!$pred) continue;

            $dependencyType = $dep->effectiveDependencyType();

            if ($dependencyType === 'FF') {
                if (!$pred->is_completed && ($pred->progress ?? 0) < 100) {
                    return "Cannot complete task '{$task->name}'. Predecessor task '{$pred->name}' must be 100% completed first (FF Dependency).";
                }
            } elseif ($dependencyType === 'SF') {
                if (($pred->progress ?? 0) <= 0) {
                    return "Cannot complete task '{$task->name}'. Predecessor task '{$pred->name}' must have started first (SF Dependency).";
                }
            }
        }

        if ($deps->isEmpty() && !empty($task->predecessor) && $task->predecessor !== '-') {
            $pred = Wbs::find($task->predecessor);
            $dependencyType = $task->dep_type ?: 'FS';

            if ($pred && $dependencyType === 'FF' && !$pred->is_completed && ($pred->progress ?? 0) < 100) {
                return "Cannot complete task '{$task->name}'. Predecessor task '{$pred->name}' must be 100% completed first.";
            }
            if ($pred && $dependencyType === 'SF' && ($pred->progress ?? 0) <= 0) {
                return "Cannot complete task '{$task->name}'. Predecessor task '{$pred->name}' must have started first.";
            }
        }

        return null;
    }

    /**
     * Synchronize parent SubWbs and MainWbs start/end dates based on children.
     */
    public function syncParentWbsDates(Wbs $task): void
    {
        $subWbs = $task->parentSubWbs;
        if (!$subWbs) return;

        $childWbs = Wbs::where('sub_wbs_id', $subWbs->id)
            ->whereNotNull('start')
            ->whereNotNull('end')
            ->get();

        if ($childWbs->isNotEmpty()) {
            $minStart = $childWbs->min('start');
            $maxEnd   = $childWbs->max('end');

            $subWbs->update([
                'start' => $minStart,
                'end'   => $maxEnd,
            ]);

            $mainWbs = $subWbs->mainWbs;
            if ($mainWbs) {
                $siblingSubs = SubWbs::where('sub_wbs_id', $mainWbs->id)
                    ->whereNotNull('start')
                    ->whereNotNull('end')
                    ->get();

                if ($siblingSubs->isNotEmpty()) {
                    $mainStart = $siblingSubs->min('start');
                    $mainEnd   = $siblingSubs->max('end');

                    $mainWbs->update([
                        'start' => $mainStart,
                        'end'   => $mainEnd,
                    ]);
                }
            }
        }
    }
}
