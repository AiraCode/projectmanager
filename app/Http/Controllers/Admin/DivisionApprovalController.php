<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Division;
use App\Models\DivisionRequest;
use App\Models\User;
use App\Services\DivisionApprovalService;
use Illuminate\Http\Request;

class DivisionApprovalController extends Controller
{
    protected DivisionApprovalService $approvalService;

    public function __construct(DivisionApprovalService $approvalService)
    {
        $this->approvalService = $approvalService;
    }

    /**
     * Get list of division requests.
     */
    public function index(Request $request)
    {
        $query = DivisionRequest::with(['user', 'division', 'requester', 'approver'])->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $requests = $query->paginate(20);

        if ($request->wantsJson()) {
            return response()->json($requests);
        }

        return back()->with('divisionRequests', $requests);
    }

    /**
     * Submit a new division request for a worker.
     */
    public function requestDivision(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'division_id' => 'required|integer|exists:divisions,id',
            'notes' => 'nullable|string|max:500',
        ]);

        try {
            $req = $this->approvalService->requestDivision(
                $validated['user_id'],
                $validated['division_id'],
                auth()->id(),
                $validated['notes'] ?? null
            );

            return back()->with('success', "Pengajuan divisi berhasil dikirimkan ke Super Admin (Status: Pending).");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['message' => $e->getMessage()]);
        }
    }

    /**
     * Approve division request (SuperAdmin only).
     */
    public function approve(Request $request, int $id)
    {
        if (auth()->user()?->role?->name !== 'SuperAdmin') {
            abort(403, 'Hanya Super Admin yang berhak menyetujui penambahan divisi.');
        }

        try {
            $this->approvalService->approveRequest($id, auth()->id());
            return back()->with('success', 'Pengajuan divisi berhasil disetujui.');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['message' => $e->getMessage()]);
        }
    }

    /**
     * Reject division request (SuperAdmin only).
     */
    public function reject(Request $request, int $id)
    {
        if (auth()->user()?->role?->name !== 'SuperAdmin') {
            abort(403, 'Hanya Super Admin yang berhak menolak penambahan divisi.');
        }

        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        try {
            $this->approvalService->rejectRequest($id, auth()->id(), $validated['rejection_reason']);
            return back()->with('success', 'Pengajuan divisi berhasil ditolak.');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['message' => $e->getMessage()]);
        }
    }
}
