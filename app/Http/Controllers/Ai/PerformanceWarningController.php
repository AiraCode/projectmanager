<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiPerformanceWarning;
use App\Services\AiPerformanceWatchdogService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PerformanceWarningController extends Controller
{
    protected AiPerformanceWatchdogService $watchdog;

    public function __construct(AiPerformanceWatchdogService $watchdog)
    {
        $this->watchdog = $watchdog;
    }

    /**
     * Render dedicated responsive AI Performance Watchdog page.
     */
    public function page(Request $request): Response
    {
        $user = $request->user();
        $projectId = $request->query('project_id') ? (int) $request->query('project_id') : null;

        // Passive throttled background check before rendering page
        $this->watchdog->scanIfStale(120);

        return Inertia::render('AiWarningsPage', [
            'initialData'      => $this->watchdog->getWarningsForUser($user, null),
            'initialProjectId' => $projectId,
            'userRole'         => $user->role?->name ?? 'worker',
        ]);
    }

    /**
     * Get RBAC-scoped AI timeline warnings for the authenticated user
     * (runs throttled passive background scan if stale so no external cron is required).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $projectId = $request->query('project_id') ? (int) $request->query('project_id') : null;

        // Passive throttled background check (runs once per cooldown window seamlessly)
        $this->watchdog->scanIfStale(120);

        return response()->json($this->watchdog->getWarningsForUser($user, $projectId));
    }

    /**
     * Acknowledge a single warning ("Got it") — remains auto-resolved only once progress catches up.
     */
    public function acknowledge(Request $request, int $id): JsonResponse
    {
        $warning = AiPerformanceWarning::where('user_id', $request->user()->id)->findOrFail($id);

        if ($warning->status === 'active') {
            $warning->update([
                'status'          => 'acknowledged',
                'acknowledged_at' => Carbon::now('Asia/Jakarta'),
            ]);
        }

        $projectId = $request->query('project_id') ? (int) $request->query('project_id') : null;
        return response()->json($this->watchdog->getWarningsForUser($request->user(), $projectId));
    }

    /**
     * Acknowledge all currently active personal warnings.
     */
    public function acknowledgeAll(Request $request): JsonResponse
    {
        AiPerformanceWarning::where('user_id', $request->user()->id)
            ->where('status', 'active')
            ->update([
                'status'          => 'acknowledged',
                'acknowledged_at' => Carbon::now('Asia/Jakarta'),
            ]);

        $projectId = $request->query('project_id') ? (int) $request->query('project_id') : null;
        return response()->json($this->watchdog->getWarningsForUser($request->user(), $projectId));
    }

    /**
     * Trigger an immediate background AI watchdog scan across projects (SuperAdmin / PIC / admin_utama only).
     */
    public function scan(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = strtolower($user->role?->name ?? 'worker');
        if (!in_array($role, ['superadmin', 'admin_utama', 'pic'], true)) {
            return response()->json(['message' => 'Only Management / SuperAdmin / PIC can trigger manual full scans.'], 403);
        }

        $projectId = $request->input('project_id') ? (int) $request->input('project_id') : null;
        $stats = $this->watchdog->scanAll($projectId);

        return response()->json([
            'scan_stats' => $stats,
            ...$this->watchdog->getWarningsForUser($user, $projectId),
        ]);
    }
}
