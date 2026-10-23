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

        // Fallback jika belum ada baris di task_dependencies tapi kolom predecessor terisi
        if ($predecessorDeps->isEmpty() && !empty($task->predecessor) && $task->predecessor !== '-') {
            $predTask = Wbs::find($task->predecessor);
            if ($predTask) {
                $lag = (int)($task->lag ?? 0) - (int)($task->lead ?? 0);
                $depType = $task->dep_type ?: 'FS';
                $group = TaskDependencyGroup::create([
                    'successor_wbs_id' => $task->id,
                    'dependency_type'  => $depType,
                    'lag_days'         => $lag,
                ]);
                TaskDependency::create([
                    'predecessor_wbs_id'  => $predTask->id,
                    'successor_wbs_id'    => $task->id,
                    'dependency_group_id' => $group->id,
                    'dependency_type'     => $depType,
                    'lag_days'            => $lag,
                ]);

                $predecessorDeps = TaskDependency::where('successor_wbs_id', $task->id)
                    ->with(['predecessor', 'group'])
                    ->get();
            }
        }

        if ($predecessorDeps->isEmpty()) {
            return false;
        }

        $currentStart = Carbon::parse($task->start)->startOfDay();
        $currentEnd   = Carbon::parse($task->end)->startOfDay();

        // Pertahankan durasi tugas (minimal 1 hari)
        $durationDays = (int) $task->duration_days;
        if ($durationDays <= 0) {
            $durationDays = max(1, $currentStart->diffInDays($currentEnd) + 1);
        }

        $newStart = null;

        foreach ($predecessorDeps as $dep) {
            $pred = $dep->predecessor;
            if (!$pred || !$pred->start || !$pred->end) {
                continue;
            }

            $predStart = Carbon::parse($pred->start)->startOfDay();
            $predEnd   = Carbon::parse($pred->end)->startOfDay();

            // Positif = Lag (jeda maju), Negatif = Lead (percepatan mundur)
            $lag = (int) $dep->effectiveLagDays();

            $reqStart = null;
            switch ($dep->effectiveDependencyType()) {
                case 'FS':
                    // Finish-to-Start (konvensi proyek ini):
                    // Jika Predecessor selesai hari H dan Lag = 0, Successor mulai di hari yang sama (H).
                    // Lag +N => H + N, Lead N => H - N. Harus konsisten dengan scheduleEngine.ts di frontend.
                    $reqStart = $predEnd->copy()->addDays($lag);
                    break;

                case 'SS':
                    // Start-to-Start: Mulai dari Start Predecessor + Lag/Lead
                    $reqStart = $predStart->copy()->addDays($lag);
                    break;

                case 'FF':
                    // Finish-to-Finish: End = predEnd + Lag/Lead
                    // Maka Start = End - (durationDays - 1)
                    $reqEnd   = $predEnd->copy()->addDays($lag);
                    $reqStart = $reqEnd->copy()->subDays(max(0, $durationDays - 1));
                    break;

                case 'SF':
                    // Start-to-Finish: End = predStart + Lag/Lead
                    // Maka Start = End - (durationDays - 1)
                    $reqEnd   = $predStart->copy()->addDays($lag);
                    $reqStart = $reqEnd->copy()->subDays(max(0, $durationDays - 1));
                    break;
            }

            if ($reqStart) {
                if ($newStart === null || $reqStart->gt($newStart)) {
                    $newStart = $reqStart->copy()->startOfDay();
                }
            }
        }

        if ($newStart === null) {
            $newStart = $currentStart->copy();
        }

        // Batas bawah hanya mengikuti Project Start (jika ada) agar Lead tidak mundur sebelum proyek dimulai.
        // JANGAN di-clamp ke MainWbs->end agar saat diberi Lag, tanggal tidak tertahan/kacau!
        $project = $task->parentSubWbs?->mainWbs?->project;
        if ($project && $project->start) {
            $projStart = Carbon::parse($project->start)->startOfDay();
            if ($newStart->lt($projStart)) {
                $newStart = $projStart->copy();
            }
        }

        // Hitung End Date berdasarkan Start Date baru + Durasi
        $newEnd = $newStart->copy()->addDays(max(0, $durationDays - 1))->startOfDay();

        if ($newEnd->lt($newStart)) {
            $newEnd = $newStart->copy();
        }

        $diffDays = max(1, $newStart->diffInDays($newEnd) + 1);

        // Cek apakah tanggal berubah (gunakan isSameDay agar tidak terpengaruh jam)
        $hasChanged = !$currentStart->isSameDay($newStart) || !$currentEnd->isSameDay($newEnd) || (int)$task->duration_days !== $diffDays;

        if ($hasChanged) {
            $task->update([
                'start'         => $newStart->format('Y-m-d'),
                'end'           => $newEnd->format('Y-m-d'),
                'duration_days' => $diffDays,
            ]);
        }

        // Sinkronkan tanggal parent (SubWbs & MainWbs)
        $this->syncParentWbsDates($task);

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
            $minStart = Carbon::parse($childWbs->min('start'))->startOfDay();
            $maxEnd   = Carbon::parse($childWbs->max('end'))->startOfDay();

            $subEnd = $subWbs->end ? Carbon::parse($subWbs->end)->startOfDay() : null;
            $newSubEnd = $subEnd && $subEnd->gt($maxEnd) ? $subEnd : $maxEnd;

            $subStart = $subWbs->start ? Carbon::parse($subWbs->start)->startOfDay() : null;
            $newSubStart = $subStart && $subStart->lt($minStart) ? $subStart : $minStart;

            $subWbs->update([
                'start'        => $newSubStart->format('Y-m-d'),
                'end'          => $newSubEnd->format('Y-m-d'),
                'actual_start' => $minStart->format('Y-m-d'),
                'actual_end'   => $maxEnd->format('Y-m-d'),
            ]);

            $mainWbs = $subWbs->mainWbs;
            if ($mainWbs) {
                $siblingSubs = SubWbs::where('sub_wbs_id', $mainWbs->id)
                    ->whereNotNull('start')
                    ->whereNotNull('end')
                    ->get();

                if ($siblingSubs->isNotEmpty()) {
                    $mainStart = Carbon::parse($siblingSubs->min('start'))->startOfDay();
                    $mainEnd   = Carbon::parse($siblingSubs->max('end'))->startOfDay();

                    $existingMainEnd = $mainWbs->end ? Carbon::parse($mainWbs->end)->startOfDay() : null;
                    $newMainEnd = $existingMainEnd && $existingMainEnd->gt($mainEnd) ? $existingMainEnd : $mainEnd;

                    $existingMainStart = $mainWbs->start ? Carbon::parse($mainWbs->start)->startOfDay() : null;
                    $newMainStart = $existingMainStart && $existingMainStart->lt($mainStart) ? $existingMainStart : $mainStart;

                    $siblingActualStarts = $siblingSubs->whereNotNull('actual_start');
                    $siblingActualEnds   = $siblingSubs->whereNotNull('actual_end');

                    $mainActualStart = $siblingActualStarts->isNotEmpty()
                        ? Carbon::parse($siblingActualStarts->min('actual_start'))->startOfDay()
                        : $minStart;
                    $mainActualEnd   = $siblingActualEnds->isNotEmpty()
                        ? Carbon::parse($siblingActualEnds->max('actual_end'))->startOfDay()
                        : $maxEnd;

                    $mainWbs->update([
                        'start'        => $newMainStart->format('Y-m-d'),
                        'end'          => $newMainEnd->format('Y-m-d'),
                        'actual_start' => $mainActualStart->format('Y-m-d'),
                        'actual_end'   => $mainActualEnd->format('Y-m-d'),
                    ]);

                    if ($mainWbs->projects_id && \Illuminate\Support\Facades\Schema::hasTable('projects')) {
                        $project = $mainWbs->project;
                        if ($project && $project->end && $mainEnd->gt(Carbon::parse($project->end)->startOfDay())) {
                            $project->update(['end' => $mainEnd->format('Y-m-d')]);
                        }
                    }
                }
            }
        }
    }
}
