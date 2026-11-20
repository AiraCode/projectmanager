<?php

namespace App\Services;

use App\Models\AiPerformanceWarning;
use App\Models\Division;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Background AI Performance & Timeline Watchdog (100% Local PHP + MySQL).
 *
 * Continuously monitors all active projects & division tasks against their running timeline:
 * - Compares actual progress vs S-Curve / elapsed timeline expectations.
 * - Inspects overdue & lagging WBS tasks per division.
 * - Generates/escalates actionable warnings in `ai_performance_warnings` for assigned workers
 *   across all companies (e.g., PT. Karabha Wiratama and any other active tenant).
 * - Automatically resolves warnings once progress catches back up to timeline!
 */
class AiPerformanceWatchdogService
{
    protected SCurvePredictionService $scurveService;

    public function __construct(SCurvePredictionService $scurveService)
    {
        $this->scurveService = $scurveService;
    }

    /**
     * Lightweight throttled scan triggered passively during user activity (zero manual cron needed).
     */
    public function scanIfStale(int $cooldownSeconds = 120): void
    {
        if (!$this->hasTable()) {
            return;
        }

        // Do not run global cache throttle inside isolated in-memory unit tests unless explicit scanAll/scanProject is called
        if ($this->isInMemoryTestDb()) {
            return;
        }

        $lastRun = Cache::get('provis_ai_watchdog_last_scan_at');
        if ($lastRun && (time() - (int) $lastRun) < $cooldownSeconds) {
            return;
        }

        $lock = Cache::lock('provis_ai_watchdog_scan_lock', 25);
        if (!$lock->get()) {
            return;
        }

        try {
            $recheck = Cache::get('provis_ai_watchdog_last_scan_at');
            if ($recheck && (time() - (int) $recheck) < $cooldownSeconds) {
                return;
            }
            $this->scanAll();
            Cache::put('provis_ai_watchdog_last_scan_at', time(), 3600);
        } catch (\Throwable $e) {
            Log::warning('AiPerformanceWatchdogService scanIfStale notice: ' . $e->getMessage());
        } finally {
            $lock->release();
        }
    }

    /**
     * Evaluate all active (non-completed) projects or a single project and synchronize warnings.
     *
     * @return array{projects_scanned: int, warnings_active: int, warnings_created_or_updated: int, warnings_resolved: int}
     */
    public function scanAll(?int $onlyProjectId = null): array
    {
        if (!$this->hasTable()) {
            return [
                'projects_scanned'            => 0,
                'warnings_active'             => 0,
                'warnings_created_or_updated' => 0,
                'warnings_resolved'           => 0,
            ];
        }

        $query = Project::query()
            ->with(['company', 'mainWbs.subWbs.wbsTasks.division', 'mainWbs.subWbs.wbsTasks.divisions', 'projectMembers']);

        if ($onlyProjectId !== null) {
            $query->where('id', $onlyProjectId);
        } else {
            // Skip setup drafts unless they already contain tasks
            $query->where(function ($q) {
                $q->whereNull('setup_status')
                  ->orWhere('setup_status', '!=', 'draft');
            });
        }

        $projects = $query->get();

        // Preload all worker accounts once with divisions/companies/roles to evaluate permissions cleanly in memory
        $workerRoleIds = Role::where('name', 'worker')->pluck('id')->all();
        $workers = !empty($workerRoleIds)
            ? User::whereIn('roles_id', $workerRoleIds)->with(['role', 'division', 'divisions', 'companies', 'company'])->get()
            : collect();

        $totalCreatedOrUpdated = 0;
        $totalResolved = 0;

        foreach ($projects as $project) {
            $stats = $this->evaluateProject($project, $workers);
            $totalCreatedOrUpdated += $stats['upserted'];
            $totalResolved += $stats['resolved'];
        }

        if ($onlyProjectId === null) {
            // Auto-resolve any dangling warnings for deleted or fully completed projects
            $completedIds = Project::where('progress', '>=', 100)->pluck('id')->all();
            if (!empty($completedIds)) {
                $totalResolved += AiPerformanceWarning::whereIn('project_id', $completedIds)
                    ->whereIn('status', ['active', 'acknowledged'])
                    ->update([
                        'status'            => 'resolved',
                        'resolved_at'       => Carbon::now('Asia/Jakarta'),
                        'last_evaluated_at' => Carbon::now('Asia/Jakarta'),
                    ]);
            }
        }

        $activeTotal = AiPerformanceWarning::whereIn('status', ['active', 'acknowledged'])->count();

        return [
            'projects_scanned'            => $projects->count(),
            'warnings_active'             => $activeTotal,
            'warnings_created_or_updated' => $totalCreatedOrUpdated,
            'warnings_resolved'           => $totalResolved,
        ];
    }

    /**
     * Re-evaluate a single project immediately (called after progress/status/schedule mutations).
     */
    public function scanProject(int $projectId): array
    {
        return $this->scanAll($projectId);
    }

    /**
     * Evaluate one project's S-Curve & division task alignment and sync DB warnings for all eligible workers.
     *
     * @param Collection<int, User> $workers
     * @return array{upserted: int, resolved: int}
     */
    protected function evaluateProject(Project $project, Collection $workers): array
    {
        $now = Carbon::now('Asia/Jakarta');
        $upserted = 0;
        $resolved = 0;

        $projectProg = round((float) ($project->progress ?? 0), 1);

        // If project is 100% completed, resolve any active warnings for it right away
        if ($projectProg >= 100 || $project->status === 'Completed') {
            $count = AiPerformanceWarning::where('project_id', $project->id)
                ->whereIn('status', ['active', 'acknowledged'])
                ->update([
                    'status'            => 'resolved',
                    'resolved_at'       => $now,
                    'last_evaluated_at' => $now,
                ]);
            return ['upserted' => 0, 'resolved' => $count];
        }

        // Compute S-Curve timeline metrics
        $scurve = $this->scurveService->calculate($project);
        $metrics = $scurve['metrics'] ?? [];
        $spi = (float) ($metrics['spi'] ?? 1.0);
        $variance = (float) ($metrics['variance_progress'] ?? 0.0);
        $isDelayed = (bool) ($metrics['is_delayed'] ?? false);
        $delayDays = (int) ($metrics['delay_days'] ?? 0);

        // Compute linear elapsed timeline expectation as fallback/complement
        $elapsedExpectedPct = 0.0;
        if ($project->start && $project->end) {
            $pStart = Carbon::parse($project->start)->startOfDay();
            $pEnd = Carbon::parse($project->end)->endOfDay();
            if ($now->gte($pStart)) {
                if ($now->gte($pEnd)) {
                    $elapsedExpectedPct = 100.0;
                } else {
                    $totalSec = max(1, $pStart->diffInSeconds($pEnd));
                    $elapsedSec = max(0, $pStart->diffInSeconds($now));
                    $elapsedExpectedPct = round(min(100.0, ($elapsedSec / $totalSec) * 100), 1);
                }
            }
        }

        // Planned progress up to today (prefer S-Curve cumulative planned if > 0, else elapsed timeline)
        $scurvePlannedPct = $variance !== 0.0
            ? round(max(0.0, $projectProg - $variance), 1)
            : 0.0;
        $plannedPct = max($elapsedExpectedPct, $scurvePlannedPct);
        $plannedPct = max(0.0, min(100.0, $plannedPct));
        $timelineGap = round($projectProg - $plannedPct, 1);

        // Gather all tasks across the project and bucket lagging/overdue tasks per division
        $allTasks = collect();
        foreach ($project->mainWbs ?? [] as $mw) {
            foreach ($mw->subWbs ?? [] as $sw) {
                foreach ($sw->wbsTasks ?? [] as $t) {
                    $allTasks->push($t);
                }
            }
        }

        // Analyze every task's timeline performance
        $divisionBuckets = []; // divisionId (0 = General/Unassigned) => stats
        $projectOverdueCount = 0;
        $projectLaggingCount = 0;
        $projectMaxLateDays = 0;
        $projectSampleTasks = [];

        foreach ($allTasks as $task) {
            $tProg = $task->is_completed || $task->status === 'Completed'
                ? 100.0
                : round((float) ($task->progress ?? 0), 1);

            if ($tProg >= 100.0) {
                continue;
            }

            $taskExpected = 0.0;
            $daysLate = 0;
            $isOverdue = false;
            $isLagging = false;

            if ($task->start && $task->end) {
                $tStart = Carbon::parse($task->start)->startOfDay();
                $tEnd = Carbon::parse($task->end)->endOfDay();
                if ($now->gt($tEnd)) {
                    $isOverdue = true;
                    $taskExpected = 100.0;
                    $daysLate = max(1, (int) $tEnd->diffInDays($now));
                } elseif ($now->gte($tStart)) {
                    $dur = max(1, $tStart->diffInDays($tEnd) + 1);
                    $el = max(0, $tStart->diffInDays($now) + 1);
                    $taskExpected = round(min(100.0, ($el / $dur) * 100), 1);
                    if (($taskExpected - $tProg) >= 15.0) {
                        $isLagging = true;
                    }
                }
            }

            $divIds = $task->divisions->pluck('id')->map(fn($id) => (int) $id)->all();
            if ($task->divisions_id) {
                $divIds[] = (int) $task->divisions_id;
            }
            $divIds = array_values(array_unique(array_filter($divIds)));
            if (empty($divIds)) {
                $divIds = [0];
            }

            $taskDivNames = $task->divisions->pluck('divisi')->all();
            if (empty($taskDivNames) && $task->division) {
                $taskDivNames = [$task->division->divisi];
            }
            $divLabel = !empty($taskDivNames) ? implode(', ', array_unique($taskDivNames)) : 'General';

            if ($isOverdue) {
                $projectOverdueCount++;
                $projectMaxLateDays = max($projectMaxLateDays, $daysLate);
            } elseif ($isLagging) {
                $projectLaggingCount++;
            }

            $taskItem = [
                'id'       => $task->id,
                'name'     => $task->name,
                'progress' => $tProg,
                'expected' => $taskExpected,
                'end'      => $task->end ? Carbon::parse($task->end)->format('d M Y') : null,
                'days_late'=> $daysLate,
                'overdue'  => $isOverdue,
                'lagging'  => $isLagging,
                'division' => $divLabel,
            ];

            if ($isOverdue || $isLagging) {
                $projectSampleTasks[] = $taskItem;
            }

            foreach ($divIds as $did) {
                if (!isset($divisionBuckets[$did])) {
                    $divisionBuckets[$did] = [
                        'total_open'    => 0,
                        'overdue_count' => 0,
                        'lagging_count' => 0,
                        'max_late_days' => 0,
                        'avg_progress'  => 0.0,
                        'sum_progress'  => 0.0,
                        'problem_tasks' => [],
                    ];
                }
                $divisionBuckets[$did]['total_open']++;
                $divisionBuckets[$did]['sum_progress'] += $tProg;
                if ($isOverdue) {
                    $divisionBuckets[$did]['overdue_count']++;
                    $divisionBuckets[$did]['max_late_days'] = max($divisionBuckets[$did]['max_late_days'], $daysLate);
                }
                if ($isLagging) {
                    $divisionBuckets[$did]['lagging_count']++;
                }
                if ($isOverdue || $isLagging) {
                    $divisionBuckets[$did]['problem_tasks'][] = $taskItem;
                } elseif (count($divisionBuckets[$did]['problem_tasks']) < 3) {
                    // Fallback open task list if project overall is severely behind schedule
                    $divisionBuckets[$did]['problem_tasks'][] = $taskItem;
                }
            }
        }

        foreach ($divisionBuckets as $did => &$b) {
            $b['avg_progress'] = $b['total_open'] > 0 ? round($b['sum_progress'] / $b['total_open'], 1) : 100.0;
            usort($b['problem_tasks'], function ($a, $c) {
                if ($a['overdue'] !== $c['overdue']) return $c['overdue'] <=> $a['overdue'];
                if ($a['days_late'] !== $c['days_late']) return $c['days_late'] <=> $a['days_late'];
                return ($c['expected'] - $c['progress']) <=> ($a['expected'] - $a['progress']);
            });
        }
        unset($b);

        // Determine if the project itself is behind schedule / low progress relative to running timeline
        $projectBehindTimeline = ($timelineGap <= -10.0)
            || ($plannedPct >= 15.0 && $projectProg <= 5.0)
            || ($isDelayed && ($delayDays > 0 || $spi < 0.85))
            || ($projectOverdueCount > 0)
            || ($projectLaggingCount > 0);

        $companyName = $project->company?->name ?? 'Company';
        $companyId = $project->companies_id;
        $divisionNames = Division::pluck('divisi', 'id')->all();

        // Evaluate each eligible worker who has RBAC access to this project
        $evaluatedKeys = [];

        foreach ($workers as $worker) {
            // Strictly respect company & project permissions
            if (!$worker->hasCompany($companyId)) {
                continue;
            }
            $allowedProjIds = $worker->getAllowedProjectIds();
            if (!in_array((int) $project->id, $allowedProjIds, true)) {
                continue;
            }

            $workerDivIds = $worker->getDivisionIds();
            $primaryDivId = !empty($workerDivIds) ? (int) $workerDivIds[0] : null;
            $key = "u:{$worker->id}|p:{$project->id}|d:" . ($primaryDivId ?? 0);

            // Collect lagging tasks specifically matching this worker's division(s), or whole project if worker has no division
            $relevantOverdue = 0;
            $relevantLagging = 0;
            $relevantOpen = 0;
            $relevantMaxLate = 0;
            $relevantTasks = [];
            $sumOpenProg = 0.0;

            if (!empty($workerDivIds)) {
                foreach ($workerDivIds as $wdid) {
                    if (isset($divisionBuckets[$wdid])) {
                        $bk = $divisionBuckets[$wdid];
                        $relevantOpen += $bk['total_open'];
                        $relevantOverdue += $bk['overdue_count'];
                        $relevantLagging += $bk['lagging_count'];
                        $relevantMaxLate = max($relevantMaxLate, $bk['max_late_days']);
                        $sumOpenProg += $bk['sum_progress'];
                        $relevantTasks = array_merge($relevantTasks, $bk['problem_tasks']);
                    }
                }
            } else {
                $relevantOpen = $allTasks->where('progress', '<', 100)->count();
                $relevantOverdue = $projectOverdueCount;
                $relevantLagging = $projectLaggingCount;
                $relevantMaxLate = $projectMaxLateDays;
                $relevantTasks = $projectSampleTasks;
            }

            // Deduplicate tasks by task ID
            $uniqueTasks = [];
            foreach ($relevantTasks as $rt) {
                $uniqueTasks[$rt['id']] = $rt;
            }
            $uniqueTasks = array_values(array_slice($uniqueTasks, 0, 5));

            // Should this worker receive a performance warning for this project?
            $shouldWarn = ($relevantOverdue > 0)
                || ($relevantLagging > 0)
                || ($projectBehindTimeline && ($relevantOpen > 0 || $allTasks->isEmpty()));

            if (!$shouldWarn) {
                continue;
            }

            $evaluatedKeys[] = $key;

            // Classify warning type & severity
            $warningType = $relevantOverdue > 0
                ? 'overdue_tasks'
                : ($relevantLagging > 0 || $isDelayed ? 'behind_schedule' : 'low_progress');

            $severity = ($relevantOverdue >= 2 || $relevantMaxLate >= 7 || $timelineGap <= -25.0 || ($project->end && $now->gt(Carbon::parse($project->end))))
                ? 'critical'
                : 'warning';

            $divDisplay = $primaryDivId && isset($divisionNames[$primaryDivId])
                ? $divisionNames[$primaryDivId]
                : 'All Divisions';

            $divAvgProg = $relevantOpen > 0 ? round($sumOpenProg / $relevantOpen, 1) : $projectProg;

            $title = $severity === 'critical'
                ? "Critical Progress Alert — {$companyName} ({$project->title})"
                : "Progress Warning — {$companyName} ({$project->title})";

            $message = $this->buildWarningMessage(
                $worker,
                $project,
                $companyName,
                $divDisplay,
                $projectProg,
                $plannedPct,
                $timelineGap,
                $spi,
                $relevantOverdue,
                $relevantLagging,
                $relevantMaxLate,
                $uniqueTasks
            );

            $metricsPayload = [
                'project_title'     => $project->title,
                'company_name'      => $companyName,
                'division_name'     => $divDisplay,
                'actual_progress'   => $projectProg,
                'expected_progress' => $plannedPct,
                'division_progress' => $divAvgProg,
                'timeline_gap'      => $timelineGap,
                'spi'               => round($spi, 3),
                'delay_days'        => max($delayDays, $relevantMaxLate),
                'overdue_count'     => $relevantOverdue,
                'lagging_count'     => $relevantLagging,
                'open_tasks_count'  => $relevantOpen,
                'sample_tasks'      => $uniqueTasks,
            ];

            // Fingerprint ensures acknowledged warning re-activates only if metrics meaningfully worsen
            $fingerprint = md5(json_encode([
                'type'     => $warningType,
                'severity' => $severity,
                'overdue'  => $relevantOverdue,
                'lagging'  => $relevantLagging,
                'gap_band' => (int) floor(abs($timelineGap) / 5),
            ]));

            $existing = AiPerformanceWarning::where('warning_key', $key)->first();
            if ($existing) {
                $worsened = ($existing->severity === 'warning' && $severity === 'critical')
                    || ($existing->fingerprint !== $fingerprint && ($existing->metrics_json['overdue_count'] ?? 0) < $relevantOverdue);

                $nextStatus = match ($existing->status) {
                    'resolved'     => 'active',
                    'acknowledged' => $worsened ? 'active' : 'acknowledged',
                    default        => 'active',
                };

                $existing->update([
                    'company_id'        => $companyId,
                    'division_id'       => $primaryDivId,
                    'warning_type'      => $warningType,
                    'severity'          => $severity,
                    'status'            => $nextStatus,
                    'title'             => $title,
                    'message'           => $message,
                    'metrics_json'      => $metricsPayload,
                    'fingerprint'       => $fingerprint,
                    'last_evaluated_at' => $now,
                    'resolved_at'       => null,
                    'detected_at'       => $existing->status === 'resolved' ? $now : ($existing->detected_at ?? $now),
                ]);
                $upserted++;
            } else {
                AiPerformanceWarning::create([
                    'warning_key'       => $key,
                    'user_id'           => $worker->id,
                    'project_id'        => $project->id,
                    'company_id'        => $companyId,
                    'division_id'       => $primaryDivId,
                    'warning_type'      => $warningType,
                    'severity'          => $severity,
                    'status'            => 'active',
                    'title'             => $title,
                    'message'           => $message,
                    'metrics_json'      => $metricsPayload,
                    'fingerprint'       => $fingerprint,
                    'detected_at'       => $now,
                    'last_evaluated_at' => $now,
                ]);
                $upserted++;
            }
        }

        // Auto-resolve any active/acknowledged warnings for this project whose worker/division is no longer lagging
        $toResolve = AiPerformanceWarning::where('project_id', $project->id)
            ->whereIn('status', ['active', 'acknowledged']);

        if (!empty($evaluatedKeys)) {
            $toResolve->whereNotIn('warning_key', $evaluatedKeys);
        }

        $resolved += $toResolve->update([
            'status'            => 'resolved',
            'resolved_at'       => $now,
            'last_evaluated_at' => $now,
        ]);

        return ['upserted' => $upserted, 'resolved' => $resolved];
    }

    /**
     * Compose a clear, actionable AI performance warning tailored to the worker's division and timeline gap.
     */
    protected function buildWarningMessage(
        User $worker,
        Project $project,
        string $companyName,
        string $divisionName,
        float $actualProg,
        float $expectedProg,
        float $gap,
        float $spi,
        int $overdueCount,
        int $laggingCount,
        int $maxLateDays,
        array $sampleTasks
    ): string {
        $reasons = [];

        if ($overdueCount > 0) {
            $reasons[] = "{$overdueCount} overdue task(s) (up to +{$maxLateDays} day(s) past deadline)";
        }
        if ($laggingCount > 0) {
            $reasons[] = "{$laggingCount} task(s) progressing slower than their scheduled timeline";
        }
        if ($expectedProg > 0 && $gap <= -10.0) {
            $reasons[] = "project actual progress ({$actualProg}%) is behind expected timeline progress ({$expectedProg}%, SPI {$spi})";
        } elseif ($actualProg <= 5.0 && $expectedProg >= 10.0) {
            $reasons[] = "overall progress is still very low ({$actualProg}%) while project timeline is already running ({$expectedProg}% expected)";
        }

        if (empty($reasons)) {
            $reasons[] = "project progress ({$actualProg}%) requires attention to stay aligned with the active timeline";
        }

        $msg = "AI Watchdog detected that {$companyName} ({$project->title}) — {$divisionName} division needs attention: "
            . implode('; ', $reasons) . '.';

        if (!empty($sampleTasks)) {
            $names = array_map(
                fn($t) => "{$t['name']} ({$t['progress']}%)",
                array_slice($sampleTasks, 0, 2)
            );
            $msg .= ' Priority focus: ' . implode(', ', $names) . '.';
        }

        return $msg;
    }

    /**
     * Fetch RBAC-scoped warning payload for the currently authenticated user (Notification Bell + Banners).
     */
    public function getWarningsForUser(User $user, ?int $projectId = null): array
    {
        if (!$this->hasTable()) {
            return [
                'warnings'              => [],
                'active_count'          => 0,
                'acknowledged_count'    => 0,
                'resolved_recent_count' => 0,
                'monitoring'            => null,
            ];
        }

        // Personal warnings for this user (primarily Worker roles)
        $personalQuery = AiPerformanceWarning::where('user_id', $user->id)
            ->whereIn('status', ['active', 'acknowledged'])
            ->with(['project', 'company', 'division']);

        if ($projectId) {
            $personalQuery->where('project_id', $projectId);
        }

        $personal = $personalQuery
            ->orderByRaw("CASE status WHEN 'active' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END")
            ->orderByRaw("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
            ->orderByDesc('detected_at')
            ->get()
            ->map(fn(AiPerformanceWarning $w) => $this->formatWarning($w))
            ->values()
            ->all();

        $activePersonalCount = count(array_filter($personal, fn($w) => $w['status'] === 'active'));
        $ackPersonalCount = count(array_filter($personal, fn($w) => $w['status'] === 'acknowledged'));

        $resolvedRecent = AiPerformanceWarning::where('user_id', $user->id)
            ->where('status', 'resolved')
            ->where('resolved_at', '>=', Carbon::now('Asia/Jakarta')->subDays(7))
            ->count();

        // Management Monitoring Recap (SuperAdmin, Admin Utama, PIC — NEVER leaked to Worker!)
        $monitoring = null;
        $roleName = strtolower($user->role?->name ?? 'worker');
        $isManagement = in_array($roleName, ['superadmin', 'admin_utama', 'pic'], true);

        if ($isManagement) {
            $mQuery = AiPerformanceWarning::whereIn('status', ['active', 'acknowledged'])
                ->with(['user', 'project', 'company', 'division']);

            if ($projectId) {
                $mQuery->where('project_id', $projectId);
            }

            if ($roleName !== 'superadmin' && $user->getDataScope() !== 'all') {
                $companyIds = $user->getCompanyIds();
                $mQuery->whereIn('company_id', !empty($companyIds) ? $companyIds : [-1]);
            }

            $monItems = $mQuery
                ->orderByRaw("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
                ->orderByDesc('detected_at')
                ->take(40)
                ->get()
                ->map(fn(AiPerformanceWarning $w) => $this->formatWarning($w, true))
                ->values()
                ->all();

            $activeMonCount = count(array_filter($monItems, fn($w) => $w['status'] === 'active'));

            $monitoring = [
                'items'               => $monItems,
                'total_count'         => count($monItems),
                'active_count'        => $activeMonCount,
                'companies_affected'  => count(array_unique(array_filter(array_column($monItems, 'company_name')))),
                'workers_warned'      => count(array_unique(array_filter(array_column($monItems, 'user_id')))),
            ];
        }

        // Badge count: personal active count for workers; management sees active monitored warnings count too
        $badgeCount = $activePersonalCount;
        if ($isManagement && $badgeCount === 0 && $monitoring) {
            $badgeCount = $monitoring['active_count'];
        }

        return [
            'warnings'              => $personal,
            'active_count'          => $badgeCount,
            'personal_active_count' => $activePersonalCount,
            'acknowledged_count'    => $ackPersonalCount,
            'resolved_recent_count' => $resolvedRecent,
            'monitoring'            => $monitoring,
        ];
    }

    protected function formatWarning(AiPerformanceWarning $w, bool $includeWorker = false): array
    {
        $m = is_array($w->metrics_json) ? $w->metrics_json : [];

        return [
            'id'                => $w->id,
            'user_id'           => $w->user_id,
            'worker_name'       => $includeWorker ? ($w->user?->username ?? 'Worker') : null,
            'worker_email'      => $includeWorker ? ($w->user?->email ?? null) : null,
            'project_id'        => $w->project_id,
            'project_title'     => $w->project?->title ?? ($m['project_title'] ?? "Project #{$w->project_id}"),
            'company_id'        => $w->company_id,
            'company_name'      => $w->company?->name ?? ($m['company_name'] ?? 'Company'),
            'division_id'       => $w->division_id,
            'division_name'     => $w->division?->divisi ?? ($m['division_name'] ?? 'General'),
            'warning_type'      => $w->warning_type,
            'severity'          => $w->severity,
            'status'            => $w->status,
            'title'             => $w->title,
            'message'           => $w->message,
            'actual_progress'   => $m['actual_progress'] ?? 0,
            'expected_progress' => $m['expected_progress'] ?? 0,
            'division_progress' => $m['division_progress'] ?? 0,
            'timeline_gap'      => $m['timeline_gap'] ?? 0,
            'spi'               => $m['spi'] ?? 1.0,
            'delay_days'        => $m['delay_days'] ?? 0,
            'overdue_count'     => $m['overdue_count'] ?? 0,
            'lagging_count'     => $m['lagging_count'] ?? 0,
            'sample_tasks'      => $m['sample_tasks'] ?? [],
            'detected_at'       => $w->detected_at?->toIso8601String(),
            'acknowledged_at'   => $w->acknowledged_at?->toIso8601String(),
        ];
    }

    protected function hasTable(): bool
    {
        try {
            return Schema::hasTable('ai_performance_warnings');
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function isInMemoryTestDb(): bool
    {
        try {
            $driver = config('database.default');
            return config("database.connections.{$driver}.driver") === 'sqlite'
                && config("database.connections.{$driver}.database") === ':memory:';
        } catch (\Throwable $e) {
            return false;
        }
    }
}
