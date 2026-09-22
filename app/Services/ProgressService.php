<?php

namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Log;

class ProgressService
{
    private function getStatusFromProgress($progress, $currentStatus)
    {
        if ($progress == 100) return 'Completed';
        if ($progress > 0 && $currentStatus === 'Open') return 'On Track';
        if ($progress == 0 && $currentStatus === 'Completed') return 'Open';
        return $currentStatus;
    }

    /**
     * Recalculate progress for the entire project from bottom to top.
     */
    public function recalculateProjectProgress($projectId)
    {
        $project = Project::with(['mainWbs.subWbs.wbsTasks'])->findOrFail($projectId);

        $totalProjectWeight = 0;
        $totalProjectWeightedProgress = 0;

        foreach ($project->mainWbs as $mainWbs) {
            $totalMjWeight = 0;
            $totalMjWeightedProgress = 0;

            foreach ($mainWbs->subWbs as $subWbs) {
                // 1. Calculate SubWbs Progress based on Wbs (Sub-Subtasks)
                $wbsTasks = $subWbs->wbsTasks;
                
                if ($wbsTasks->count() > 0) {
                    $totalTaskWeight = (float) $wbsTasks->sum('weight');
                    if ($totalTaskWeight > 0) {
                        $weightedCompleted = (float) $wbsTasks->where('is_completed', true)->sum('weight');
                        $subWbs->progress = round(($weightedCompleted / $totalTaskWeight) * 100);
                    } else {
                        $completedCount = $wbsTasks->where('is_completed', true)->count();
                        $subWbs->progress = round(($completedCount / $wbsTasks->count()) * 100);
                    }
                    
                    // Update individual Wbs status
                    foreach ($wbsTasks as $wbs) {
                        $wbsProgress = $wbs->is_completed ? 100 : 0;
                        $wbs->status = $this->getStatusFromProgress($wbsProgress, $wbs->status);
                        if ($wbs->isDirty('status')) {
                            $wbs->save();
                        }
                    }
                }

                $subWbs->status = $this->getStatusFromProgress($subWbs->progress, $subWbs->status);
                if ($subWbs->isDirty(['progress', 'status'])) {
                    $subWbs->save();
                }

                // Accumulate for MainWbs
                $smjWeight = $subWbs->weight ?? 0;
                $totalMjWeight += $smjWeight;
                $totalMjWeightedProgress += ($subWbs->progress * $smjWeight);
            }

            // 2. Calculate MainWbs Progress
            if ($totalMjWeight > 0) {
                $mainWbs->progress = round($totalMjWeightedProgress / $totalMjWeight);
            }

            $mainWbs->status = $this->getStatusFromProgress($mainWbs->progress, $mainWbs->status);
            if ($mainWbs->isDirty(['progress', 'status'])) {
                $mainWbs->save();
            }

            // Accumulate for Overall Project
            $mjWeight = $mainWbs->percentage ?? 0; // Using percentage column as weight for main WBS
            $totalProjectWeight += $mjWeight;
            $totalProjectWeightedProgress += ($mainWbs->progress * $mjWeight);
        }

        // 3. Calculate Overall Project Progress
        if ($totalProjectWeight > 0) {
            $project->progress = round($totalProjectWeightedProgress / $totalProjectWeight);
        }
        
        $project->status = $this->getStatusFromProgress($project->progress, $project->status);
        if ($project->isDirty(['progress', 'status'])) {
            $project->save();
        }
    }
}
