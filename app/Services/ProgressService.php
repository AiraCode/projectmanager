<?php

namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Log;

class ProgressService
{
    private function getStatusFromProgress($progress, $currentStatus)
    {
        if ($progress == 100) return 'Completed';
        if ($progress > 0 && ($currentStatus === 'Open' || $currentStatus === 'Completed')) return 'On Track';
        if ($progress == 0 && $currentStatus === 'Completed') return 'Open';
        return $currentStatus;
    }

    /**
     * Hierarchically recalculate weights:
     * - Main Task weight is set manually (main_wbs.percentage)
     * - Sub Task weight is divided equally among Sub Tasks under the Main Task:
     *     sub_wbs.weight = main_wbs.percentage / count(sub_wbs)
     * - Sub-Sub Task weight is divided equally among Tasks under the Sub Task:
     *     wbs.weight = sub_wbs.weight / count(wbs)
     *
     * Safe against division by zero.
     */
    public function recalculateProjectWeights($project)
    {
        foreach ($project->mainWbs as $mainWbs) {
            $mjWeight = (float) ($mainWbs->percentage ?? 0);
            $subWbsList = $mainWbs->subWbs;
            $subCount = $subWbsList->count();

            if ($subCount > 0) {
                $subWeight = round($mjWeight / $subCount, 2);
                foreach ($subWbsList as $subWbs) {
                    $subWbs->weight = $subWeight;
                    if ($subWbs->isDirty('weight')) {
                        $subWbs->save();
                    }

                    $tasks = $subWbs->wbsTasks;
                    $taskCount = $tasks->count();
                    if ($taskCount > 0) {
                        $taskWeight = round($subWeight / $taskCount, 2);
                        foreach ($tasks as $task) {
                            $task->weight = $taskWeight;
                            if ($task->isDirty('weight')) {
                                $task->save();
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Recalculate progress and weights for the entire project from bottom to top.
     */
    public function recalculateProjectProgress($projectId)
    {
        $project = Project::with(['mainWbs.subWbs.wbsTasks'])->find($projectId);
        if (!$project) return;

        // 1. Auto-recalculate weights hierarchically first
        $this->recalculateProjectWeights($project);

        $totalProjectWeight = 0;
        $totalProjectWeightedProgress = 0;

        // If no main tasks exist, reset project progress to 0
        if ($project->mainWbs->count() === 0) {
            $project->progress = 0;
            $project->status = 'Open';
            if ($project->isDirty(['progress', 'status'])) {
                $project->save();
            }
            return;
        }

        foreach ($project->mainWbs as $mainWbs) {
            $totalMjWeight = 0;
            $totalMjWeightedProgress = 0;

            if ($mainWbs->subWbs->count() === 0) {
                $mainWbs->progress = 0;
                $mainWbs->status = 'Open';
                if ($mainWbs->isDirty(['progress', 'status'])) {
                    $mainWbs->save();
                }
            } else {
                foreach ($mainWbs->subWbs as $subWbs) {
                    $wbsTasks = $subWbs->wbsTasks;

                    if ($wbsTasks->count() > 0) {
                        $totalTaskWeight = (float) $wbsTasks->sum('weight');
                        if ($totalTaskWeight > 0) {
                            $weightedProgress = (float) $wbsTasks->sum(function ($t) {
                                $p = $t->progress > 0 ? (float)$t->progress : ($t->is_completed ? 100 : 0);
                                return ($p / 100) * (float)$t->weight;
                            });
                            $subWbs->progress = round(($weightedProgress / $totalTaskWeight) * 100);
                        } else {
                            $avgProgress = $wbsTasks->avg(function ($t) {
                                return $t->progress > 0 ? (float)$t->progress : ($t->is_completed ? 100 : 0);
                            });
                            $subWbs->progress = round($avgProgress ?? 0);
                        }

                        // Update individual Wbs status
                        foreach ($wbsTasks as $wbs) {
                            $wbsProgress = $wbs->progress > 0 ? (int)$wbs->progress : ($wbs->is_completed ? 100 : 0);
                            $wbs->status = $this->getStatusFromProgress($wbsProgress, $wbs->status);
                            if ($wbs->isDirty('status')) {
                                $wbs->save();
                            }
                        }
                    } else {
                        $subWbs->progress = 0;
                    }

                    $subWbs->status = $this->getStatusFromProgress($subWbs->progress, $subWbs->status);
                    if ($subWbs->isDirty(['progress', 'status'])) {
                        $subWbs->save();
                    }

                    // Accumulate for MainWbs
                    $smjWeight = (float) ($subWbs->weight ?? 0);
                    $totalMjWeight += $smjWeight;
                    $totalMjWeightedProgress += ($subWbs->progress * $smjWeight);
                }
            }

            // 2. Calculate MainWbs Progress
            if ($totalMjWeight > 0) {
                $mainWbs->progress = round($totalMjWeightedProgress / $totalMjWeight);
            } else {
                $mainWbs->progress = 0;
            }

            $mainWbs->status = $this->getStatusFromProgress($mainWbs->progress, $mainWbs->status);
            if ($mainWbs->isDirty(['progress', 'status'])) {
                $mainWbs->save();
            }

            // Accumulate for Overall Project
            $mjWeight = (float) ($mainWbs->percentage ?? 0);
            $totalProjectWeight += $mjWeight;
            $totalProjectWeightedProgress += ($mainWbs->progress * $mjWeight);
        }

        // 3. Calculate Overall Project Progress
        if ($totalProjectWeight > 0) {
            $project->progress = round($totalProjectWeightedProgress / $totalProjectWeight);
        } else {
            $project->progress = 0;
        }

        $project->status = $this->getStatusFromProgress($project->progress, $project->status);
        if ($project->isDirty(['progress', 'status'])) {
            $project->save();
        }
    }
}
