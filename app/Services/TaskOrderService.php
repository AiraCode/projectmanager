<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\MainWbs;
use App\Models\SubWbs;
use App\Models\Wbs;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class TaskOrderService
{
    /**
     * Reorder Main Jobs (MainWbs) within a project.
     */
    public function reorderMainWbs(int|string $projectId, array $orderedIds): array
    {
        $existing = MainWbs::where('projects_id', $projectId)->pluck('id')->all();

        // Validate that all orderedIds belong to the project
        foreach ($orderedIds as $id) {
            if (!in_array((int)$id, $existing, true)) {
                throw new InvalidArgumentException("Main Job ID {$id} tidak valid untuk proyek ini.");
            }
        }

        DB::transaction(function () use ($orderedIds) {
            foreach ($orderedIds as $index => $id) {
                MainWbs::where('id', $id)->update(['order_index' => $index + 1]);
            }
        });

        AuditLog::record(
            'REORDER_MAIN_WBS',
            "User " . (auth()->user()?->username ?? 'System') . " reordered main jobs in project ID {$projectId}.",
            auth()->id(),
            request()?->ip(),
            ['project_id' => $projectId, 'ordered_ids' => $orderedIds]
        );

        return ['success' => true, 'message' => 'Urutan Main Job berhasil diperbarui.'];
    }

    /**
     * Reorder Sub Jobs (SubWbs) within a MainWbs.
     */
    public function reorderSubWbs(int|string $projectId, int|string $mainWbsId, array $orderedIds): array
    {
        $mainWbs = MainWbs::where('projects_id', $projectId)->where('id', $mainWbsId)->firstOrFail();
        $existing = SubWbs::where('sub_wbs_id', $mainWbsId)->pluck('id')->all();

        foreach ($orderedIds as $id) {
            if (!in_array((int)$id, $existing, true)) {
                throw new InvalidArgumentException("Sub-Task ID {$id} tidak valid untuk Main Task ini.");
            }
        }

        DB::transaction(function () use ($orderedIds) {
            foreach ($orderedIds as $index => $id) {
                SubWbs::where('id', $id)->update(['order_index' => $index + 1]);
            }
        });

        AuditLog::record(
            'REORDER_SUB_WBS',
            "User " . (auth()->user()?->username ?? 'System') . " reordered sub tasks under '{$mainWbs->name}'.",
            auth()->id(),
            request()?->ip(),
            ['main_wbs_id' => $mainWbsId, 'ordered_ids' => $orderedIds]
        );

        return ['success' => true, 'message' => 'Urutan Sub-Task berhasil diperbarui.'];
    }

    /**
     * Reorder Wbs Tasks (Sub-subtasks) within a SubWbs.
     */
    public function reorderTasks(int|string $projectId, int|string $subWbsId, array $orderedIds): array
    {
        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $existing = Wbs::where('sub_wbs_id', $subWbsId)->pluck('id')->all();

        foreach ($orderedIds as $id) {
            if (!in_array((string)$id, $existing, true)) {
                throw new InvalidArgumentException("Task ID {$id} tidak valid untuk Sub-Task ini.");
            }
        }

        DB::transaction(function () use ($orderedIds) {
            foreach ($orderedIds as $index => $id) {
                Wbs::where('id', $id)->update(['order_index' => $index + 1]);
            }
        });

        AuditLog::record(
            'REORDER_TASKS',
            "User " . (auth()->user()?->username ?? 'System') . " reordered tasks under '{$subWbs->name}'.",
            auth()->id(),
            request()?->ip(),
            ['sub_wbs_id' => $subWbsId, 'ordered_ids' => $orderedIds]
        );

        return ['success' => true, 'message' => 'Urutan Task berhasil diperbarui.'];
    }
}
