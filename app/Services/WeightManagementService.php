<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\Wbs;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class WeightManagementService
{
    /**
     * Update custom weights for SubWbs under a MainWbs.
     *
     * @param int|string $projectId
     * @param int|string $mainWbsId
     * @param array $weightsMap Array of ['id' => sub_wbs_id, 'weight' => float]
     * @return array
     * @throws InvalidArgumentException
     */
    public function updateSubWbsWeights(int|string $projectId, int|string $mainWbsId, array $weightsMap): array
    {
        $mainWbs = MainWbs::where('projects_id', $projectId)->where('id', $mainWbsId)->firstOrFail();
        $subWbsList = SubWbs::where('sub_wbs_id', $mainWbsId)->get();

        if ($subWbsList->isEmpty()) {
            throw new InvalidArgumentException('Tidak ada Sub-Task di bawah Main Task ini.');
        }

        // Validate that all sub_wbs in weightsMap belong to this main_wbs
        $validIds = $subWbsList->pluck('id')->all();
        $totalWeight = 0.0;
        $cleanMap = [];

        foreach ($weightsMap as $item) {
            $id = (int) ($item['id'] ?? 0);
            $weight = (float) ($item['weight'] ?? 0);

            if (!in_array($id, $validIds, true)) {
                throw new InvalidArgumentException("ID Sub-Task {$id} tidak valid untuk Main Task ini.");
            }
            if ($weight < 0) {
                throw new InvalidArgumentException('Bobot tidak boleh bernilai negatif.');
            }

            $cleanMap[$id] = $weight;
            $totalWeight += $weight;
        }

        // Check if all existing items are present in the map
        foreach ($validIds as $subId) {
            if (!isset($cleanMap[$subId])) {
                throw new InvalidArgumentException("Bobot untuk Sub-Task ID {$subId} belum ditentukan.");
            }
        }

        // Enforce strict 100% check
        $roundedTotal = round($totalWeight, 2);
        if (abs($roundedTotal - 100.00) > 0.01) {
            throw new InvalidArgumentException(
                "Total bobot harus tepat 100.00%. Total saat ini adalah {$roundedTotal}% (" .
                ($roundedTotal < 100 ? 'kurang ' . round(100 - $roundedTotal, 2) . '%' : 'lebih ' . round($roundedTotal - 100, 2) . '%') . ').'
            );
        }

        DB::transaction(function () use ($cleanMap, $mainWbs) {
            foreach ($cleanMap as $id => $weight) {
                SubWbs::where('id', $id)->update(['weight' => $weight]);
            }
        });

        // Recalculate project progress
        app(ProgressService::class)->recalculateProjectProgress($projectId);

        $user = auth()->user();
        AuditLog::record(
            'UPDATE_WEIGHTS',
            "User {$user?->username} customized sub-task weights for '{$mainWbs->name}' to 100%.",
            $user?->id,
            request()?->ip(),
            ['main_wbs_id' => $mainWbsId, 'weights' => $cleanMap]
        );

        return [
            'success' => true,
            'message' => 'Bobot Sub-Task berhasil disimpan (Total: 100.00%).',
            'weights' => $cleanMap,
        ];
    }

    /**
     * Update custom weights for Wbs (tasks) under a SubWbs.
     *
     * @param int|string $projectId
     * @param int|string $subWbsId
     * @param array $weightsMap Array of ['id' => wbs_id, 'weight' => float]
     * @return array
     * @throws InvalidArgumentException
     */
    public function updateTaskWeights(int|string $projectId, int|string $subWbsId, array $weightsMap): array
    {
        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $tasks = Wbs::where('sub_wbs_id', $subWbsId)->get();
        if ($tasks->isEmpty()) {
            throw new InvalidArgumentException('Tidak ada Task di bawah Sub-Task ini.');
        }

        $validIds = $tasks->pluck('id')->all();
        $totalWeight = 0.0;
        $cleanMap = [];

        foreach ($weightsMap as $item) {
            $id = (string) ($item['id'] ?? '');
            $weight = (float) ($item['weight'] ?? 0);

            if (!in_array($id, $validIds, true)) {
                throw new InvalidArgumentException("ID Task {$id} tidak valid untuk Sub-Task ini.");
            }
            if ($weight < 0) {
                throw new InvalidArgumentException('Bobot tidak boleh bernilai negatif.');
            }

            $cleanMap[$id] = $weight;
            $totalWeight += $weight;
        }

        foreach ($validIds as $taskId) {
            if (!isset($cleanMap[$taskId])) {
                throw new InvalidArgumentException("Bobot untuk Task {$taskId} belum ditentukan.");
            }
        }

        // Strict 100.00% validation
        $roundedTotal = round($totalWeight, 2);
        if (abs($roundedTotal - 100.00) > 0.01) {
            throw new InvalidArgumentException(
                "Total bobot task harus tepat 100.00%. Total saat ini adalah {$roundedTotal}% (" .
                ($roundedTotal < 100 ? 'kurang ' . round(100 - $roundedTotal, 2) . '%' : 'lebih ' . round($roundedTotal - 100, 2) . '%') . ').'
            );
        }

        DB::transaction(function () use ($cleanMap) {
            foreach ($cleanMap as $id => $weight) {
                Wbs::where('id', $id)->update(['weight' => $weight]);
            }
        });

        app(ProgressService::class)->recalculateProjectProgress($projectId);

        $user = auth()->user();
        AuditLog::record(
            'UPDATE_WEIGHTS',
            "User {$user?->username} customized task weights for '{$subWbs->name}' to 100%.",
            $user?->id,
            request()?->ip(),
            ['sub_wbs_id' => $subWbsId, 'weights' => $cleanMap]
        );

        return [
            'success' => true,
            'message' => 'Bobot Task berhasil disimpan (Total: 100.00%).',
            'weights' => $cleanMap,
        ];
    }
}
