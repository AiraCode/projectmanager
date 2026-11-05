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
     * Can accept a Wbs, SubWbs, MainWbs, or an ID.
     */
    public function syncParentWbsDates(Wbs|SubWbs|MainWbs|int|string $target): void
    {
        $subWbs = null;
        $mainWbs = null;

        if ($target instanceof Wbs) {
            $subWbs = $target->parentSubWbs;
        } elseif ($target instanceof SubWbs) {
            $subWbs = $target;
        } elseif ($target instanceof MainWbs) {
            $mainWbs = $target;
        } elseif (is_numeric($target)) {
            $subWbs = SubWbs::find($target);
            if (!$subWbs) {
                $mainWbs = MainWbs::find($target);
            }
        } elseif (is_string($target)) {
            $wbs = Wbs::find($target);
            if ($wbs) {
                $subWbs = $wbs->parentSubWbs;
            } else {
                $subWbs = SubWbs::find($target);
            }
        }

        if ($subWbs) {
            $childWbs = Wbs::where('sub_wbs_id', $subWbs->id)
                ->whereNotNull('start')
                ->whereNotNull('end')
                ->get();

            if ($childWbs->isNotEmpty()) {
                $minStart = Carbon::parse($childWbs->min('start'))->startOfDay();
                $maxEnd   = Carbon::parse($childWbs->max('end'))->startOfDay();

                $subWbs->update([
                    'start'        => $minStart->format('Y-m-d'),
                    'end'          => $maxEnd->format('Y-m-d'),
                    'actual_start' => $minStart->format('Y-m-d'),
                    'actual_end'   => $maxEnd->format('Y-m-d'),
                ]);
            }

            $mainWbs = $subWbs->mainWbs;
        }

        if ($mainWbs) {
            $siblingSubs = SubWbs::where('sub_wbs_id', $mainWbs->id)
                ->whereNotNull('start')
                ->whereNotNull('end')
                ->get();

            if ($siblingSubs->isNotEmpty()) {
                $mainStart = Carbon::parse($siblingSubs->min('start'))->startOfDay();
                $mainEnd   = Carbon::parse($siblingSubs->max('end'))->startOfDay();

                $mainWbs->update([
                    'start'        => $mainStart->format('Y-m-d'),
                    'end'          => $mainEnd->format('Y-m-d'),
                    'actual_start' => $mainStart->format('Y-m-d'),
                    'actual_end'   => $mainEnd->format('Y-m-d'),
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

    /**
     * Self-healing date reconciler:
     * Scans project WBS tree and automatically repairs parent Sub Task and Main Task dates
     * so they strictly adhere to their children's earliest start and latest finish dates.
     * Records all changes to AuditLog under the actor "Provis Support System".
     *
     * @return array List of repaired entries
     */
    public function reconcileProjectDates(Project|int|string $projectOrId, string $actorName = 'Provis Support System'): array
    {
        $project = $projectOrId instanceof Project ? $projectOrId : Project::find($projectOrId);
        if (!$project) return [];

        $repairs = [];
        $mainTasks = MainWbs::where('projects_id', $project->id)->get();

        foreach ($mainTasks as $mainWbs) {
            $subs = SubWbs::where('sub_wbs_id', $mainWbs->id)->get();

            foreach ($subs as $subWbs) {
                $childTasks = Wbs::where('sub_wbs_id', $subWbs->id)
                    ->whereNotNull('start')
                    ->whereNotNull('end')
                    ->get();

                if ($childTasks->isNotEmpty()) {
                    $expectedStart = Carbon::parse($childTasks->min('start'))->startOfDay()->format('Y-m-d');
                    $expectedEnd   = Carbon::parse($childTasks->max('end'))->startOfDay()->format('Y-m-d');

                    $currentStart = $subWbs->start ? Carbon::parse($subWbs->start)->format('Y-m-d') : null;
                    $currentEnd   = $subWbs->end ? Carbon::parse($subWbs->end)->format('Y-m-d') : null;

                    if ($currentStart !== $expectedStart || $currentEnd !== $expectedEnd) {
                        $oldDatesStr = "{$currentStart} s/d {$currentEnd}";
                        $newDatesStr = "{$expectedStart} s/d {$expectedEnd}";

                        $subWbs->update([
                            'start'        => $expectedStart,
                            'end'          => $expectedEnd,
                            'actual_start' => $expectedStart,
                            'actual_end'   => $expectedEnd,
                        ]);

                        if (\Illuminate\Support\Facades\Schema::hasTable('audit_logs')) {
                            \App\Models\AuditLog::record(
                                'SYSTEM_SYNC_DATES',
                                "{$actorName} otomatis menyesuaikan tanggal Sub Task '{$subWbs->name}' dari {$oldDatesStr} menjadi {$newDatesStr} mengikuti task terlama pada proyek '{$project->title}'.",
                                null,
                                request()?->ip(),
                                [
                                    'actor'      => $actorName,
                                    'project_id' => $project->id,
                                    'sub_wbs_id' => $subWbs->id,
                                    'old_start'  => $currentStart,
                                    'old_end'    => $currentEnd,
                                    'new_start'  => $expectedStart,
                                    'new_end'    => $expectedEnd,
                                ]
                            );
                        }

                        $repairs[] = [
                            'type' => 'sub_wbs',
                            'id'   => $subWbs->id,
                            'name' => $subWbs->name,
                            'old'  => [$currentStart, $currentEnd],
                            'new'  => [$expectedStart, $expectedEnd],
                        ];
                    }
                }
            }

            // Sync Main Task dates based on its Sub Tasks
            $subsAfter = SubWbs::where('sub_wbs_id', $mainWbs->id)
                ->whereNotNull('start')
                ->whereNotNull('end')
                ->get();

            if ($subsAfter->isNotEmpty()) {
                $expectedMainStart = Carbon::parse($subsAfter->min('start'))->startOfDay()->format('Y-m-d');
                $expectedMainEnd   = Carbon::parse($subsAfter->max('end'))->startOfDay()->format('Y-m-d');

                $currentMainStart = $mainWbs->start ? Carbon::parse($mainWbs->start)->format('Y-m-d') : null;
                $currentMainEnd   = $mainWbs->end ? Carbon::parse($mainWbs->end)->format('Y-m-d') : null;

                if ($currentMainStart !== $expectedMainStart || $currentMainEnd !== $expectedMainEnd) {
                    $oldDatesStr = "{$currentMainStart} s/d {$currentMainEnd}";
                    $newDatesStr = "{$expectedMainStart} s/d {$expectedMainEnd}";

                    $mainWbs->update([
                        'start'        => $expectedMainStart,
                        'end'          => $expectedMainEnd,
                        'actual_start' => $expectedMainStart,
                        'actual_end'   => $expectedMainEnd,
                    ]);

                    if (\Illuminate\Support\Facades\Schema::hasTable('audit_logs')) {
                        \App\Models\AuditLog::record(
                            'SYSTEM_SYNC_DATES',
                            "{$actorName} otomatis menyesuaikan tanggal Main Task '{$mainWbs->name}' dari {$oldDatesStr} menjadi {$newDatesStr} mengikuti sub task terlama pada proyek '{$project->title}'.",
                            null,
                            request()?->ip(),
                            [
                                'actor'       => $actorName,
                                'project_id'  => $project->id,
                                'main_wbs_id' => $mainWbs->id,
                                'old_start'   => $currentMainStart,
                                'old_end'     => $currentMainEnd,
                                'new_start'   => $expectedMainStart,
                                'new_end'     => $expectedMainEnd,
                            ]
                        );
                    }

                    $repairs[] = [
                        'type' => 'main_wbs',
                        'id'   => $mainWbs->id,
                        'name' => $mainWbs->name,
                        'old'  => [$currentMainStart, $currentMainEnd],
                        'new'  => [$expectedMainStart, $expectedMainEnd],
                    ];
                }

                if ($project->end && Carbon::parse($expectedMainEnd)->gt(Carbon::parse($project->end)->startOfDay())) {
                    $project->update(['end' => $expectedMainEnd]);
                }
            }
        }

        return $repairs;
    }
}

