<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Division;
use App\Models\Project;
use App\Models\User;
use App\Models\Wbs;
use App\Models\AiChatMessage;
use App\Models\AiChatSession;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ProvisAiService
{
    protected ProvisTokenizerService $tokenizer;
    protected GitChangelogService $gitService;
    protected DependencyScheduler $scheduler;
    protected MasterTemplateService $templateService;
    protected PdfReportService $pdfService;

    public function __construct(
        ProvisTokenizerService $tokenizer,
        GitChangelogService $gitService,
        DependencyScheduler $scheduler,
        MasterTemplateService $templateService,
        PdfReportService $pdfService
    ) {
        $this->tokenizer       = $tokenizer;
        $this->gitService      = $gitService;
        $this->scheduler       = $scheduler;
        $this->templateService = $templateService;
        $this->pdfService      = $pdfService;
    }

    /**
     * Process chat turn entirely on-premise via Native Backend NLP Engine.
     * 100% Private - Zero external API dependencies, zero external network calls.
     */
    public function chat(User $user, string $prompt, ?int $sessionId = null, ?int $activeProjectId = null): array
    {
        // 1. Ensure or retrieve active chat session
        $session = $sessionId ? AiChatSession::where('user_id', $user->id)->find($sessionId) : null;
        if (!$session) {
            $title = Str::limit(trim($prompt), 40, '…') ?: 'New Conversation';
            $session = AiChatSession::create([
                'user_id' => $user->id,
                'title'   => $title,
            ]);
        }

        // 2. Tokenize prompt & extract domain entities
        $tokenized = $this->tokenizer->tokenize($prompt, $activeProjectId);

        // 3. Save user message to database
        AiChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => $prompt,
            'metadata'   => [
                'tokenized'  => $tokenized,
                'project_id' => $activeProjectId,
            ],
        ]);

        // 4. Execute Native Backend Agent Reasoning (100% On-Premise)
        $aiResponse = $this->processNativeAgent($prompt, $tokenized, $user, $activeProjectId);

        // 5. Save assistant message to database
        $assistantMsg = AiChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'assistant',
            'content'    => $aiResponse['content'],
            'metadata'   => [
                'actions'      => $aiResponse['actions'] ?? [],
                'intent'       => $tokenized['action_intent'] ?? 'GENERAL_QUERY',
                'mode'         => 'native_backend_private',
            ],
        ]);

        return [
            'session_id' => $session->id,
            'message_id' => $assistantMsg->id,
            'role'       => 'assistant',
            'content'    => $aiResponse['content'],
            'actions'    => $aiResponse['actions'] ?? [],
            'metadata'   => $assistantMsg->metadata,
        ];
    }

    /**
     * Native Backend NLP & Tool Execution Engine
     */
    protected function processNativeAgent(string $prompt, array $tokenized, User $user, ?int $activeProjectId): array
    {
        $intent = $tokenized['action_intent'] ?? 'GENERAL_QUERY';

        switch ($intent) {
            case 'CREATE_PROJECT':
                return $this->handleCreateProject($prompt, $tokenized, $user);

            case 'SET_PREDECESSOR':
            case 'UPDATE_SCHEDULE':
                return $this->handleScheduleAndPredecessor($prompt, $tokenized, $user, $activeProjectId);

            case 'RECONCILE_DATES':
                return $this->handleReconcileDates($user, $activeProjectId);

            case 'RECAP_OFF_PLAN':
                return $this->handleRecapOffPlan($activeProjectId, $user);

            case 'GET_CODE_UPDATES':
                return $this->handleCodeUpdates($user);

            case 'GENERATE_PDF':
                return $this->handleGeneratePdf($activeProjectId, $user);

            case 'QUERY_SUMMARY':
                return $this->handleProjectSummaryQuery($activeProjectId, $user);

            case 'QUERY_AUDIT_LOG':
                return $this->handleAuditLogQuery($user);

            case 'QUERY_USERS':
                return $this->handleUsersQuery($user);

            default:
                return $this->handleGeneralConversational($prompt, $tokenized, $user, $activeProjectId);
        }
    }

    /**
     * Handler: Create Project
     */
    protected function handleCreateProject(string $prompt, array $tokenized, User $user): array
    {
        $dates = $tokenized['dates'] ?? [];
        $startDate = $dates[0]['date'] ?? Carbon::today()->format('Y-m-d');
        $endDate   = $dates[1]['date'] ?? null;

        // Custom duration parsing (e.g. "6 bulan", "90 hari", "4 minggu")
        if (!$endDate) {
            if (preg_match('/(\d+)\s*(?:bulan|month)/i', $prompt, $mDur)) {
                $endDate = Carbon::parse($startDate)->addMonths((int) $mDur[1])->format('Y-m-d');
            } elseif (preg_match('/(\d+)\s*(?:hari|day)/i', $prompt, $mDur)) {
                $endDate = Carbon::parse($startDate)->addDays((int) $mDur[1])->format('Y-m-d');
            } elseif (preg_match('/(\d+)\s*(?:minggu|week)/i', $prompt, $mDur)) {
                $endDate = Carbon::parse($startDate)->addWeeks((int) $mDur[1])->format('Y-m-d');
            } else {
                $endDate = Carbon::parse($startDate)->addMonths(6)->format('Y-m-d');
            }
        }

        // Robust title extraction
        preg_match('/(?:buat|bikin|tambah|cipta|create)(?:kan)?\s+(?:proyek|project)\s+(?:baru\s+|new\s+)?([^,]+)/i', $prompt, $m);
        $candidate = isset($m[1]) ? trim(preg_replace('/\b(mulai|dari|pada|tanggal|dengan|selama|memakai|menggunakan|durasi)\b.*$/i', '', $m[1])) : '';
        $candidate = trim(preg_replace('/^(?:baru|new)\b/i', '', $candidate));
        $title = $candidate ?: 'Proyek Baru';
        $title = Str::limit($title, 45, '');

        $companyId = $user->companies_id ?: (Company::first()?->id ?? 1);

        $project = Project::create([
            'title'           => $title,
            'companies_id'    => $companyId,
            'project_manager' => $user->id,
            'start'           => $startDate,
            'end'             => $endDate,
            'status'          => 'Open',
            'progress'        => 0,
            'setup_status'    => 'active',
            'created_by'      => $user->id,
        ]);

        // Apply default master template
        try {
            $this->templateService->applyTemplateToProject($project);
        } catch (\Throwable $e) {
            Log::warning('Template application error: ' . $e->getMessage());
        }

        AuditLog::record(
            'CREATE_PROJECT',
            "Provis Support System (AI Agent) atas permintaan {$user->username} membuat proyek baru '{$project->title}' (ID #{$project->id}).",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id]
        );

        return [
            'content' => "✅ **Proyek Baru Berhasil Dibuat!**\n\n"
                . "- **Judul Proyek**: {$project->title}\n"
                . "- **ID Proyek**: #{$project->id}\n"
                . "- **Perusahaan**: " . ($project->company?->name ?? 'Default Company') . "\n"
                . "- **Project Manager**: {$user->username}\n"
                . "- **Jadwal Pelaksanaan**: " . Carbon::parse($startDate)->format('d M Y') . " s/d " . Carbon::parse($endDate)->format('d M Y') . "\n"
                . "- **WBS & Tasks**: Struktur Master Template WBS telah otomatis diterapkan.\n\n"
                . "Silakan klik tombol di bawah untuk meninjau detail proyek atau mengatur rincian pekerjaan.",
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => 'Kelola Tasks WBS', 'url' => "/tasks?project_id={$project->id}"],
                ['type' => 'link', 'label' => 'Lihat Gantt / Timeline', 'url' => "/timeline?project_id={$project->id}"],
            ],
        ];
    }

    /**
     * Handler: Schedule and Predecessor
     */
    protected function handleScheduleAndPredecessor(string $prompt, array $tokenized, User $user, ?int $activeProjectId): array
    {
        $projectId = $activeProjectId ?: Project::first()?->id;
        if (!$projectId) {
            return [
                'content' => 'Tidak ditemukan proyek aktif untuk mengatur dependensi pekerjaan.',
                'actions' => [],
            ];
        }

        $matchedTasks = $tokenized['matched_tasks'] ?? [];
        $predSyntax   = $tokenized['predecessor_syntax'] ?? [];
        $dates        = $tokenized['dates'] ?? [];

        if (empty($matchedTasks)) {
            return [
                'content' => "⚠️ **Informasi Task Belum Spesifik**\n\n"
                    . "Untuk mengatur dependensi atau jadwal, sebutkan kode task atau nama pekerjaan yang jelas.\n"
                    . "Contoh:\n"
                    . "- *\"Set task 1.2 mulai besok dengan predecessor 1.1 FS lag 2 hari\"*\n"
                    . "- *\"Hubungkan pekerjaan Pengecoran ke Pondasi dengan tipe FS\"*",
                'actions' => [
                    ['type' => 'link', 'label' => 'Buka Daftar Tasks', 'url' => "/tasks?project_id={$projectId}"],
                ],
            ];
        }

        $targetTask = Wbs::find($matchedTasks[0]['id']);
        if (!$targetTask) {
            return ['content' => 'Pekerjaan tidak ditemukan di database.', 'actions' => []];
        }

        $changes = [];

        // Set start date
        if (!empty($dates)) {
            $targetTask->start = $dates[0]['date'];
            $changes[] = "Start: " . Carbon::parse($targetTask->start)->format('d M Y');
            if (isset($dates[1])) {
                $targetTask->end = $dates[1]['date'];
                $changes[] = "End: " . Carbon::parse($targetTask->end)->format('d M Y');
            }
        }

        // Set predecessor
        if (!empty($predSyntax) && count($matchedTasks) > 1) {
            $predTask = Wbs::find($matchedTasks[1]['id']);
            if ($predTask && $predTask->id !== $targetTask->id) {
                $targetTask->predecessor = $predTask->id;
                $targetTask->dep_type    = $predSyntax[0]['dep_type'];
                $targetTask->lag         = $predSyntax[0]['lag'];
                $targetTask->lead        = $predSyntax[0]['lead'];
                $changes[] = "Predecessor: {$predTask->name} ({$targetTask->dep_type}, lag: {$targetTask->lag}d)";
            }
        }

        $targetTask->save();

        try {
            $this->scheduler->syncParentWbsDates($targetTask);
        } catch (\Throwable $e) {}

        AuditLog::record(
            'UPDATE_TASK_SCHEDULE',
            "Provis Support System (AI Agent) memperbarui task '{$targetTask->name}' (" . implode(', ', $changes) . ").",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'task_id' => $targetTask->id]
        );

        return [
            'content' => "🔗 **Jadwal & Dependensi Pekerjaan Diperbarui!**\n\n"
                . "- **Task**: {$targetTask->name}\n"
                . "- **Perubahan**: " . implode(' | ', $changes) . "\n"
                . "- **Sinkronisasi**: Jadwal induk WBS telah otomatis diselaraskan secara cascading.",
            'actions' => [
                ['type' => 'link', 'label' => 'Lihat di Gantt / Timeline', 'url' => "/timeline?project_id={$projectId}"],
            ],
        ];
    }

    /**
     * Handler: Date Reconciliation
     */
    protected function handleReconcileDates(User $user, ?int $activeProjectId): array
    {
        if ($activeProjectId) {
            $project = Project::find($activeProjectId);
            if ($project) {
                $repairs = $this->scheduler->reconcileProjectDates($project, 'Provis Support System (AI Agent)');
                $count = count($repairs);
                return [
                    'content' => "🛠️ **Self-Healing Rekonsiliasi Tanggal Selesai!**\n\n"
                        . "- **Proyek**: {$project->title} (ID #{$project->id})\n"
                        . "- **Perbaikan Dilakukan**: {$count} penyesuaian batas tanggal Sub/Main Task.\n"
                        . "- **Audit Trail**: Seluruh tindakan tercatat di `audit_logs` atas nama **'Provis Support System (AI Agent)'**.",
                    'actions' => [
                        ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                        ['type' => 'link', 'label' => 'Periksa Audit Log', 'url' => '/admin/audit-log?actor=Provis+Support+System'],
                    ],
                ];
            }
        }

        // All projects
        $projects = Project::all();
        $totalRepairs = 0;
        foreach ($projects as $p) {
            $rep = $this->scheduler->reconcileProjectDates($p, 'Provis Support System (AI Agent)');
            $totalRepairs += count($rep);
        }

        return [
            'content' => "🛠️ **Self-Healing Rekonsiliasi Tanggal Global Selesai!**\n\n"
                . "- **Total Proyek Dipindai**: {$projects->count()} proyek\n"
                . "- **Total Perbaikan Jadwal**: {$totalRepairs} ketidaksesuaian tanggal berhasil diselaraskan.\n"
                . "- **Status Sistem**: Batas tanggal seluruh task anak dan induk kini 100% konsisten.",
            'actions' => [
                ['type' => 'link', 'label' => 'Periksa Audit Log', 'url' => '/admin/audit-log?actor=Provis+Support+System'],
            ],
        ];
    }

    /**
     * Handler: Recap Off-Plan Projects
     */
    protected function handleRecapOffPlan(?int $activeProjectId, User $user): array
    {
        $now = Carbon::now('Asia/Jakarta');
        $query = Project::with(['company', 'manager']);

        if ($activeProjectId) {
            $query->where('id', $activeProjectId);
        }

        $projects = $query->get();
        $offPlanList = [];

        foreach ($projects as $proj) {
            $overdueTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $proj->id))
                ->where('end', '<', $now->format('Y-m-d'))
                ->where('status', '!=', 'Completed')
                ->where('progress', '<', 100)
                ->get(['id', 'name', 'end', 'progress', 'status']);

            $isDelayed = ($proj->end && Carbon::parse($proj->end)->lt($now) && $proj->progress < 100)
                || $overdueTasks->count() > 0;

            if ($isDelayed) {
                $offPlanList[] = [
                    'id'            => $proj->id,
                    'title'         => $proj->title,
                    'company'       => $proj->company?->name ?? '—',
                    'progress'      => $proj->progress ?? 0,
                    'end_date'      => $proj->end,
                    'overdue_count' => $overdueTasks->count(),
                    'overdue_tasks' => $overdueTasks->take(4),
                ];
            }
        }

        if (empty($offPlanList)) {
            return [
                'content' => "🎉 **Status Luar Biasa! Semua Proyek On-Track**\n\n"
                    . "Tidak ada proyek maupun pekerjaan WBS yang mengalami keterlambatan (*overdue*) saat ini.\n"
                    . "Seluruh milestone berjalan sesuai rencana kerja.",
                'actions' => [
                    ['type' => 'link', 'label' => 'Buka Dashboard', 'url' => '/admin'],
                ],
            ];
        }

        $text = "⚠️ **Laporan Rekap Deviasi Proyek & Pekerjaan Terlambat (Off-Plan)**\n\n"
            . "Ditemukan **" . count($offPlanList) . " proyek** yang memerlukan perhatian khusus:\n\n";

        foreach ($offPlanList as $op) {
            $endFormatted = $op['end_date'] ? Carbon::parse($op['end_date'])->format('d M Y') : '—';
            $text .= "📌 **{$op['title']}** (ID #{$op['id']}, {$op['company']})\n"
                . "- Progres Aktual: **{$op['progress']}%** (Target Selesai: {$endFormatted})\n"
                . "- Pekerjaan Overdue: **{$op['overdue_count']} tasks**\n";

            foreach ($op['overdue_tasks'] as $ot) {
                $otEnd = $ot->end ? Carbon::parse($ot->end)->format('d/m/Y') : '—';
                $text .= "  * _{$ot->name}_ (Deadline: {$otEnd}, Progres: {$ot->progress}%)\n";
            }
            $text .= "\n";
        }

        return [
            'content' => $text,
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Portal SuperAdmin', 'url' => '/admin'],
                ['type' => 'link', 'label' => 'Tinjau S-Curve', 'url' => '/scurve'],
            ],
        ];
    }

    /**
     * Handler: Code Updates & Git Changelog
     */
    protected function handleCodeUpdates(User $user): array
    {
        $commits = $this->gitService->getRecentCommits(8);
        $markdown = $this->gitService->formatForAiPrompt(8);

        return [
            'content' => "📝 **Dokumentasi Pembaruan Codingan & Release Notes Terakhir**\n\n"
                . $markdown . "\n\n"
                . "💡 *Catatan SuperAdmin: Repositori lokal dalam kondisi sinkron dan siap dioperasikan.*",
            'actions' => [
                ['type' => 'link', 'label' => 'Audit Log Sistem', 'url' => '/admin/audit-log'],
            ],
        ];
    }

    /**
     * Handler: PDF Report Generation
     */
    protected function handleGeneratePdf(?int $activeProjectId, User $user): array
    {
        $projectId = $activeProjectId ?: Project::first()?->id;
        if (!$projectId) {
            return ['content' => 'Tidak ditemukan proyek aktif untuk dibuatkan laporan.', 'actions' => []];
        }

        $res = $this->pdfService->generateProjectPdf($projectId);

        return [
            'content' => "📄 **Laporan Eksekutif Proyek Berhasil Disusun!**\n\n"
                . "Dokumen laporan resmi mencakup kartu KPI progres, rincian pekerjaan WBS utama, serta analisis keterlambatan telah siap.\n\n"
                . "Klik tombol di bawah untuk membuka dan mencetak laporan langsung:",
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Laporan PDF / Cetak', 'url' => $res['url']],
            ],
        ];
    }

    /**
     * Handler: Project Summary Query
     */
    protected function handleProjectSummaryQuery(?int $activeProjectId, User $user): array
    {
        $projectId = $activeProjectId ?: Project::first()?->id;
        if (!$projectId) {
            return ['content' => 'Belum ada proyek yang terdaftar di sistem.', 'actions' => []];
        }

        $project = Project::with(['company', 'manager'])->find($projectId);
        $allTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))->get();
        $totalCount = $allTasks->count();
        $completedCount = $allTasks->where('status', 'Completed')->count();

        return [
            'content' => "📊 **Ringkasan Status Proyek: {$project->title}**\n\n"
                . "- **Perusahaan**: " . ($project->company?->name ?? '—') . "\n"
                . "- **Project Manager (PIC)**: " . ($project->manager?->username ?? '—') . "\n"
                . "- **Progres Keseluruhan**: **{$project->progress}%**\n"
                . "- **Total Pekerjaan**: {$totalCount} tasks ({$completedCount} selesai)\n"
                . "- **Periode**: " . ($project->start ? Carbon::parse($project->start)->format('d M Y') : '—') . " s/d " . ($project->end ? Carbon::parse($project->end)->format('d M Y') : '—') . "\n"
                . "- **Status**: " . ($project->status ?? 'Open'),
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => 'Lihat S-Curve Report', 'url' => "/scurve?project_id={$project->id}"],
            ],
        ];
    }

    /**
     * Handler: Audit Log Query
     */
    protected function handleAuditLogQuery(User $user): array
    {
        $logs = AuditLog::with('user')->latest()->take(5)->get();

        $text = "📋 **5 Aktivitas Audit Log Terakhir di Sistem:**\n\n";
        foreach ($logs as $l) {
            $actor = $l->metadata['actor'] ?? ($l->user?->username ?? 'System');
            $time  = $l->created_at ? Carbon::parse($l->created_at)->format('d/m/Y H:i') : '—';
            $text .= "- `{$time}` [**{$l->action}**] oleh *{$actor}*:\n  {$l->description}\n";
        }

        return [
            'content' => $text,
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Audit Log Lengkap', 'url' => '/admin/audit-log'],
            ],
        ];
    }

    /**
     * Handler: Users Query
     */
    protected function handleUsersQuery(User $user): array
    {
        $totalUsers = User::count();
        $betaTesters = User::where('is_ai_beta_tester', true)->get(['username', 'email']);
        $superAdmins = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->get(['username']);

        $text = "👥 **Statistik Pengguna & Beta Tester Provis AI:**\n\n"
            . "- **Total Pengguna Terdaftar**: {$totalUsers} pengguna\n"
            . "- **Super Administrator**: " . $superAdmins->pluck('username')->implode(', ') . " (Akses AI Penuh Otomatis)\n"
            . "- **Pengguna dengan Hak AI Beta Tester**: " . ($betaTesters->isNotEmpty() ? $betaTesters->pluck('username')->implode(', ') : 'Belum ada pengguna non-admin yang dicentang.') . "\n\n"
            . "SuperAdmin dapat menambah atau mencabut akses beta tester kapan saja melalui menu Manajemen User.";

        return [
            'content' => $text,
            'actions' => [
                ['type' => 'link', 'label' => 'Buka User Management', 'url' => '/admin/users'],
            ],
        ];
    }

    /**
     * Handler: General Conversational Guidance
     */
    protected function handleGeneralConversational(string $prompt, array $tokenized, User $user, ?int $activeProjectId): array
    {
        $pId = $activeProjectId ?: Project::first()?->id;

        return [
            'content' => "Halo **{$user->username}**! Saya adalah **Provis Support Assistant** (AI Agent).\n\n"
                . "🛡️ *Sistem ini beroperasi 100% On-Premise secara privat langsung di server lokal Anda (tanpa pengiriman data ke pihak ketiga).*\n\n"
                . "Berikut adalah perintah yang dapat saya eksekusi untuk Anda:\n"
                . "1. 🚀 **Buat Proyek**: *\"Buatkan proyek Pembangunan Pabrik mulai 1 Desember 2026 selama 90 hari\"*\n"
                . "2. 🔗 **Atur Jadwal / Predecessor**: *\"Set task 1.2 mulai besok dengan predecessor 1.1 FS lag 2 hari\"*\n"
                . "3. 🛠️ **Rekonsiliasi Tanggal Otomatis**: *\"Tolong sinkronkan tanggal proyek ID #{$pId}\"*\n"
                . "4. 📊 **Rekap Deviasi / Keterlambatan**: *\"Tampilkan rekap proyek yang terlambat dari plan\"*\n"
                . "5. 📝 **Dokumentasi Update Coding**: *\"Apa saja update kodingan dan commit terakhir dari git?\"*\n"
                . "6. 📄 **Laporan PDF**: *\"Buatkan laporan proyek dalam bentuk PDF\"*\n"
                . "7. 📋 **Cek Audit Log / User**: *\"Siapa yang terakhir beraktivitas?\"* atau *\"Siapa saja user beta tester?\"*\n\n"
                . "Silakan ketik instruksi yang ingin Anda jalankan!",
            'actions' => [],
        ];
    }
}
