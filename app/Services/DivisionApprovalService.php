<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Division;
use App\Models\DivisionRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class DivisionApprovalService
{
    /**
     * Submit request to add an extra division for a worker.
     */
    public function requestDivision(int $targetUserId, int $divisionId, int $requesterId, ?string $notes = null): DivisionRequest
    {
        $targetUser = User::findOrFail($targetUserId);
        $division = Division::findOrFail($divisionId);

        if ($targetUser->hasDivision($divisionId)) {
            throw new InvalidArgumentException("User {$targetUser->username} sudah memiliki divisi {$division->divisi}.");
        }

        // Check if there is already a pending request
        $existing = DivisionRequest::where('user_id', $targetUserId)
            ->where('division_id', $divisionId)
            ->where('status', 'pending')
            ->first();

        if ($existing) {
            throw new InvalidArgumentException("Pengajuan divisi {$division->divisi} untuk user ini masih berstatus pending.");
        }

        $request = DivisionRequest::create([
            'user_id' => $targetUserId,
            'division_id' => $divisionId,
            'requested_by' => $requesterId,
            'status' => 'pending',
            'notes' => $notes,
        ]);

        $requester = User::find($requesterId);
        AuditLog::record(
            'REQUEST_DIVISION',
            "User {$requester?->username} submitted division request '{$division->divisi}' for user '{$targetUser->username}'.",
            $requesterId,
            request()?->ip(),
            ['target_user_id' => $targetUserId, 'division_id' => $divisionId]
        );

        return $request;
    }

    /**
     * Approve division request (SuperAdmin only).
     */
    public function approveRequest(int $requestId, int $approverId): DivisionRequest
    {
        $req = DivisionRequest::with(['user', 'division'])->findOrFail($requestId);

        if ($req->status !== 'pending') {
            throw new InvalidArgumentException("Pengajuan ini sudah berstatus {$req->status}.");
        }

        DB::transaction(function () use ($req, $approverId) {
            $req->update([
                'status' => 'approved',
                'approved_by' => $approverId,
                'responded_at' => now(),
            ]);

            // Add to division_user pivot
            DB::table('division_user')->updateOrInsert(
                ['user_id' => $req->user_id, 'division_id' => $req->division_id],
                ['created_at' => now(), 'updated_at' => now()]
            );
        });

        $approver = User::find($approverId);
        AuditLog::record(
            'APPROVE_DIVISION_REQUEST',
            "SuperAdmin {$approver?->username} approved division '{$req->division?->divisi}' for user '{$req->user?->username}'.",
            $approverId,
            request()?->ip(),
            ['request_id' => $requestId, 'user_id' => $req->user_id, 'division_id' => $req->division_id]
        );

        return $req->fresh();
    }

    /**
     * Reject division request (SuperAdmin only).
     */
    public function rejectRequest(int $requestId, int $approverId, ?string $reason = null): DivisionRequest
    {
        $req = DivisionRequest::with(['user', 'division'])->findOrFail($requestId);

        if ($req->status !== 'pending') {
            throw new InvalidArgumentException("Pengajuan ini sudah berstatus {$req->status}.");
        }

        $req->update([
            'status' => 'rejected',
            'approved_by' => $approverId,
            'rejection_reason' => $reason,
            'responded_at' => now(),
        ]);

        $approver = User::find($approverId);
        AuditLog::record(
            'REJECT_DIVISION_REQUEST',
            "SuperAdmin {$approver?->username} rejected division '{$req->division?->divisi}' for user '{$req->user?->username}'. Reason: {$reason}",
            $approverId,
            request()?->ip(),
            ['request_id' => $requestId, 'user_id' => $req->user_id, 'division_id' => $req->division_id, 'reason' => $reason]
        );

        return $req->fresh();
    }
}
