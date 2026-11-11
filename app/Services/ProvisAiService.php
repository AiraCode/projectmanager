<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Project;
use App\Models\User;
use App\Models\Wbs;
use App\Models\AiChatMessage;
use App\Models\AiChatSession;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
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
     * Process a chat turn with the Provis AI Assistant.
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
                'tokenized' => $tokenized,
                'project_id' => $activeProjectId,
            ],
        ]);

        // 4. Retrieve conversation history & prune context
        $history = $session->messages()
            ->orderBy('created_at', 'asc')
            ->get(['role', 'content'])
            ->toArray();

        $prunedHistory = $this->tokenizer->pruneContext($history, 4500);

        // 5. Invoke Gemini API or fallback
        $apiKey = env('GEMINI_API_KEY');
        $modelName = env('GEMINI_MODEL', 'gemini-2.5-flash');

        if (!empty($apiKey)) {
            $aiResponse = $this->callGeminiWithTools($apiKey, $modelName, $prunedHistory, $tokenized, $user, $activeProjectId);
        } else {
            $aiResponse = $this->executeDeterministicFallback($prompt, $tokenized, $user, $activeProjectId);
        }

        // 6. Save assistant message to database
        $assistantMsg = AiChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'assistant',
            'content'    => $aiResponse['content'],
            'metadata'   => [
                'actions'      => $aiResponse['actions'] ?? [],
                'tool_calls'   => $aiResponse['tool_calls'] ?? [],
                'tokens_used'  => $aiResponse['tokens_used'] ?? null,
                'mode'         => !empty($apiKey) ? 'llm_gemini' : 'deterministic_engine',
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
     * Define the tools (function declarations) exposed to Gemini.
     */
    protected function getToolDeclarations(User $user): array
    {
        $tools = [
            [
                'name' => 'create_project',
                'description' => 'Membuat proyek baru dengan nama, perusahaan, tanggal mulai, tanggal selesai, dan template WBS standar.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'title' => ['type' => 'STRING', 'description' => 'Judul atau nama proyek baru'],
                        'company_name_or_id' => ['type' => 'STRING', 'description' => 'Nama atau ID perusahaan yang memiliki proyek'],
                        'start_date' => ['type' => 'STRING', 'description' => 'Tanggal mulai dalam format YYYY-MM-DD'],
                        'end_date' => ['type' => 'STRING', 'description' => 'Tanggal selesai dalam format YYYY-MM-DD'],
                        'template_id' => ['type' => 'INTEGER', 'description' => 'ID template master (opsional, default null untuk template default)'],
                    ],
                    'required' => ['title'],
                ],
            ],
            [
                'name' => 'set_task_schedule_and_predecessor',
                'description' => 'Mengatur tanggal mulai/selesai atau menghubungkan predecessor dependensi (FS/SS/FF/SF) pada pekerjaan (task/WBS) dalam proyek.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'project_id' => ['type' => 'INTEGER', 'description' => 'ID proyek'],
                        'task_id_or_code' => ['type' => 'STRING', 'description' => 'ID unik task atau kode urutan task (contoh: 1.1, st-xxx)'],
                        'start_date' => ['type' => 'STRING', 'description' => 'Tanggal mulai task format YYYY-MM-DD (opsional)'],
                        'end_date' => ['type' => 'STRING', 'description' => 'Tanggal selesai task format YYYY-MM-DD (opsional)'],
                        'predecessor_id_or_code' => ['type' => 'STRING', 'description' => 'ID atau kode task pendahulu (predecessor) yang harus diselesaikan dulu'],
                        'dep_type' => ['type' => 'STRING', 'enum' => ['FS', 'SS', 'FF', 'SF'], 'description' => 'Tipe dependensi hubungan kerja (default: FS)'],
                        'lag' => ['type' => 'INTEGER', 'description' => 'Jeda hari setelah predecessor (lag days, default: 0)'],
                        'lead' => ['type' => 'INTEGER', 'description' => 'Hari mendahului sebelum predecessor selesai (lead days, default: 0)'],
                    ],
                    'required' => ['project_id', 'task_id_or_code'],
                ],
            ],
            [
                'name' => 'reconcile_dates',
                'description' => 'Menjalankan self-healing date reconciler untuk menyinkronkan batas tanggal Sub Task dan Main Task dengan task terlama anak-anaknya.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'project_id' => ['type' => 'INTEGER', 'description' => 'ID proyek tertentu (kosongkan jika ingin merekonsiliasi semua proyek)'],
                    ],
                ],
            ],
            [
                'name' => 'get_off_plan_projects',
                'description' => 'Menganalisis proyek dan tugas yang berjalan tidak sesuai rencana (terlambat, overdue, deviasi jadwal, deviasi S-Curve).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'project_id' => ['type' => 'INTEGER', 'description' => 'ID proyek spesifik jika hanya ingin menganalisis 1 proyek'],
                    ],
                ],
            ],
            [
                'name' => 'get_latest_code_updates',
                'description' => 'Mengambil dan membaca riwayat commit dan pembaruan kodingan terbaru dari git repositori untuk dokumentasi pembaruan sistem.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'limit' => ['type' => 'INTEGER', 'description' => 'Jumlah commit terakhir yang ingin diperiksa (default 8)'],
                    ],
                ],
            ],
            [
                'name' => 'get_project_summary',
                'description' => 'Mendapatkan ringkasan statistik proyek: jumlah task, progres aktual vs target, status divisi, dan tanggal durasi.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'project_id' => ['type' => 'INTEGER', 'description' => 'ID proyek'],
                    ],
                    'required' => ['project_id'],
                ],
            ],
            [
                'name' => 'generate_pdf_report',
                'description' => 'Membuat dan mengunduh laporan eksekutif progres dan jadwal proyek dalam format dokumen PDF atau printable report siap cetak.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'project_id' => ['type' => 'INTEGER', 'description' => 'ID proyek yang ingin dibuatkan laporannya'],
                    ],
                    'required' => ['project_id'],
                ],
            ],
        ];

        return $tools;
    }

    /**
     * Call Google Gemini API with native Function Calling support.
     */
    protected function callGeminiWithTools(
        string $apiKey,
        string $modelName,
        array $history,
        array $tokenized,
        User $user,
        ?int $activeProjectId
    ): array {
        $endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateContent?key={$apiKey}";

        $systemInstruction = "Anda adalah 'Provis Support Assistant', sebuah AI Agent cerdas yang terintegrasi di dalam aplikasi PROVIS Project Manager.\n"
            . "Identitas Aktor Anda di sistem adalah 'Provis Support System (AI Agent)'.\n"
            . "Pengguna saat ini: {$user->username} (Role: {$user->role?->name}).\n"
            . ($activeProjectId ? "Proyek Aktif Saat Ini: ID #{$activeProjectId}.\n" : "")
            . "Anda memiliki alat bantu (tools) untuk: membuat proyek, mengatur predecessor dan tanggal task, merekonsiliasi tanggal, memeriksa proyek yang terlambat (off-plan), dan membaca riwayat commit codingan terbaru.\n"
            . "Berikan jawaban dalam Bahasa Indonesia yang profesional, ramah, ringkas, dan jelas.\n"
            . "Gunakan format markdown dengan bullet point tebal untuk kejelasan.";

        // Build contents payload
        $contents = [];
        foreach ($history as $h) {
            $role = ($h['role'] === 'assistant') ? 'model' : 'user';
            $contents[] = [
                'role' => $role,
                'parts' => [['text' => $h['content']]],
            ];
        }

        $payload = [
            'system_instruction' => [
                'parts' => [['text' => $systemInstruction]],
            ],
            'contents' => $contents,
            'tools' => [
                ['function_declarations' => $this->getToolDeclarations($user)],
            ],
            'generationConfig' => [
                'temperature' => 0.2,
                'maxOutputTokens' => 2048,
            ],
        ];

        try {
            $response = Http::timeout(45)->post($endpoint, $payload);

            if (!$response->successful()) {
                Log::warning('Gemini API Error: ' . $response->body());
                return $this->executeDeterministicFallback(end($history)['content'] ?? '', $tokenized, $user, $activeProjectId);
            }

            $respData = $response->json();
            $candidate = $respData['candidates'][0] ?? null;

            if (!$candidate) {
                return ['content' => 'Maaf, saya tidak menerima respons yang valid dari model AI.', 'actions' => []];
            }

            $part = $candidate['content']['parts'][0] ?? [];

            // If Gemini decided to call a Tool (Function Call)
            if (isset($part['functionCall'])) {
                $functionCall = $part['functionCall'];
                $toolName = $functionCall['name'];
                $toolArgs = $functionCall['args'] ?? [];

                // Execute internal tool
                $toolResult = $this->executeTool($toolName, $toolArgs, $user);

                // Feed back tool result to Gemini for final natural language synthesis
                $toolFollowUpContents = $contents;
                $toolFollowUpContents[] = [
                    'role' => 'model',
                    'parts' => [['functionCall' => $functionCall]],
                ];
                $toolFollowUpContents[] = [
                    'role' => 'function',
                    'parts' => [[
                        'functionResponse' => [
                            'name' => $toolName,
                            'response' => ['result' => $toolResult['data']],
                        ],
                    ]],
                ];

                $followUpPayload = [
                    'system_instruction' => ['parts' => [['text' => $systemInstruction]]],
                    'contents' => $toolFollowUpContents,
                    'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 2048],
                ];

                $secondResp = Http::timeout(30)->post($endpoint, $followUpPayload);
                $finalText = $secondResp->json('candidates.0.content.parts.0.text') ?? $toolResult['summary'];

                return [
                    'content'     => $finalText,
                    'actions'     => $toolResult['actions'] ?? [],
                    'tool_calls'  => [['name' => $toolName, 'args' => $toolArgs, 'result' => $toolResult['data']]],
                    'tokens_used' => $secondResp->json('usageMetadata.totalTokenCount'),
                ];
            }

            return [
                'content'     => $part['text'] ?? 'Jawaban berhasil diperoleh.',
                'actions'     => [],
                'tokens_used' => $respData['usageMetadata']['totalTokenCount'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::error('Gemini API Exception: ' . $e->getMessage());
            return $this->executeDeterministicFallback(end($history)['content'] ?? '', $tokenized, $user, $activeProjectId);
        }
    }

    /**
     * Internal Tool Execution Handler.
     */
    public function executeTool(string $toolName, array $args, User $user): array
    {
        switch ($toolName) {
            case 'create_project':
                return $this->toolCreateProject($args, $user);

            case 'set_task_schedule_and_predecessor':
                return $this->toolSetTaskScheduleAndPredecessor($args, $user);

            case 'reconcile_dates':
                return $this->toolReconcileDates($args, $user);

            case 'get_off_plan_projects':
                return $this->toolGetOffPlanProjects($args, $user);

            case 'get_latest_code_updates':
                return $this->toolGetLatestCodeUpdates($args, $user);

            case 'get_project_summary':
                return $this->toolGetProjectSummary($args, $user);

            case 'generate_pdf_report':
                return $this->toolGeneratePdfReport($args, $user);

            case 'GENERATE_PDF':
                $pId = $activeProjectId ?: Project::first()?->id;
                if (!$pId) {
                    return ['content' => 'Tidak ditemukan proyek aktif untuk dibuatkan laporan.', 'actions' => []];
                }
                $toolResult = $this->toolGeneratePdfReport(['project_id' => $pId], $user);
                return [
                    'content' => "📄 **Laporan Eksekutif Proyek Berhasil Disiapkan!**\n\n"
                        . "Laporan progres, durasi WBS, dan analisis keterlambatan proyek telah berhasil disusun dalam format dokumen siap unduh/cetak.\n\n"
                        . "Silakan klik tombol aksi di bawah untuk membuka dan mengunduh laporan PDF.",
                    'actions' => $toolResult['actions'],
                ];

            default:
                return [
                    'summary' => "Tool {$toolName} tidak dikenal.",
                    'data'    => ['error' => 'Unknown tool'],
                    'actions' => [],
                ];
        }
    }

    /**
     * Tool: Create Project
     */
    protected function toolCreateProject(array $args, User $user): array
    {
        $title     = trim($args['title'] ?? 'Proyek Baru');
        $startStr  = $args['start_date'] ?? Carbon::today()->format('Y-m-d');
        $endStr    = $args['end_date'] ?? Carbon::parse($startStr)->addMonths(6)->format('Y-m-d');
        $companyId = null;

        if (!empty($args['company_name_or_id'])) {
            $input = $args['company_name_or_id'];
            if (is_numeric($input)) {
                $companyId = (int) $input;
            } else {
                $c = Company::where('name', 'like', "%{$input}%")->first();
                $companyId = $c?->id;
            }
        }

        if (!$companyId) {
            $companyId = $user->companies_id ?: (Company::first()?->id ?? 1);
        }

        $project = Project::create([
            'title'           => $title,
            'companies_id'    => $companyId,
            'project_manager' => $user->id,
            'start'           => $startStr,
            'end'             => $endStr,
            'status'          => 'Open',
            'progress'        => 0,
            'setup_status'    => 'pending',
            'created_by'      => $user->id,
        ]);

        // Apply master template if available
        $templateId = !empty($args['template_id']) ? (int) $args['template_id'] : null;
        try {
            $this->templateService->applyTemplateToProject($project, $templateId);
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
            'summary' => "Proyek '{$project->title}' berhasil dibuat dengan ID #{$project->id} (Start: {$startStr}, End: {$endStr}).",
            'data' => [
                'project_id' => $project->id,
                'title'      => $project->title,
                'start'      => $startStr,
                'end'        => $endStr,
            ],
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => 'Kelola Tasks WBS', 'url' => "/tasks?project_id={$project->id}"],
            ],
        ];
    }

    /**
     * Tool: Set Task Schedule and Predecessor
     */
    protected function toolSetTaskScheduleAndPredecessor(array $args, User $user): array
    {
        $projectId = (int) ($args['project_id'] ?? 0);
        $taskRef   = trim($args['task_id_or_code'] ?? '');

        $task = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
            ->where(function($q) use ($taskRef) {
                $q->where('id', $taskRef)
                  ->orWhere('name', 'like', "%{$taskRef}%");
            })->first();

        if (!$task) {
            return [
                'summary' => "Pekerjaan '{$taskRef}' tidak ditemukan dalam proyek ID #{$projectId}.",
                'data' => ['error' => 'Task not found'],
                'actions' => [],
            ];
        }

        $changes = [];

        if (!empty($args['start_date'])) {
            $task->start = Carbon::parse($args['start_date'])->format('Y-m-d');
            $changes[] = "Start: {$task->start}";
        }
        if (!empty($args['end_date'])) {
            $task->end = Carbon::parse($args['end_date'])->format('Y-m-d');
            $changes[] = "End: {$task->end}";
        }
        if (!empty($args['predecessor_id_or_code'])) {
            $predRef = trim($args['predecessor_id_or_code']);
            $predTask = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
                ->where(function($q) use ($predRef) {
                    $q->where('id', $predRef)
                      ->orWhere('name', 'like', "%{$predRef}%");
                })->first();

            if ($predTask && $predTask->id !== $task->id) {
                $task->predecessor = $predTask->id;
                $task->dep_type    = strtoupper($args['dep_type'] ?? 'FS');
                $task->lag         = (int) ($args['lag'] ?? 0);
                $task->lead        = (int) ($args['lead'] ?? 0);
                $changes[] = "Predecessor: {$predTask->name} ({$task->dep_type})";
            }
        }

        $task->save();

        // Sync parent WBS bounds
        try {
            $this->scheduler->syncParentWbsDates($task);
        } catch (\Throwable $e) {}

        AuditLog::record(
            'UPDATE_TASK_SCHEDULE',
            "Provis Support System (AI Agent) memperbarui task '{$task->name}' (" . implode(', ', $changes) . ").",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'task_id' => $task->id]
        );

        return [
            'summary' => "Jadwal pekerjaan '{$task->name}' berhasil diperbarui (" . implode(', ', $changes) . ").",
            'data' => [
                'task_id'     => $task->id,
                'task_name'   => $task->name,
                'start'       => $task->start,
                'end'         => $task->end,
                'predecessor' => $task->predecessor,
                'dep_type'    => $task->dep_type,
            ],
            'actions' => [
                ['type' => 'link', 'label' => 'Lihat di Gantt / Timeline', 'url' => "/timeline?project_id={$projectId}"],
            ],
        ];
    }

    /**
     * Tool: Reconcile Dates
     */
    protected function toolReconcileDates(array $args, User $user): array
    {
        $projectId = !empty($args['project_id']) ? (int) $args['project_id'] : null;

        if ($projectId) {
            $project = Project::find($projectId);
            if (!$project) {
                return ['summary' => "Proyek ID #{$projectId} tidak ditemukan.", 'data' => ['error' => 'Project not found']];
            }
            $repairs = $this->scheduler->reconcileProjectDates($project, 'Provis Support System (AI Agent)');
            $count = count($repairs);
            return [
                'summary' => "Rekonsiliasi tanggal proyek '{$project->title}' selesai. Total {$count} perbaikan tanggal Sub/Main Task disesuaikan.",
                'data'    => ['project_id' => $project->id, 'repairs_count' => $count, 'repairs' => $repairs],
                'actions' => [['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"]],
            ];
        }

        // All projects
        $projects = Project::all();
        $totalRepairs = 0;
        foreach ($projects as $p) {
            $rep = $this->scheduler->reconcileProjectDates($p, 'Provis Support System (AI Agent)');
            $totalRepairs += count($rep);
        }

        return [
            'summary' => "Rekonsiliasi tanggal selesai untuk seluruh proyek ({$projects->count()} proyek dipindai). Total perbaikan tanggal: {$totalRepairs}.",
            'data'    => ['total_projects' => $projects->count(), 'total_repairs' => $totalRepairs],
            'actions' => [['type' => 'link', 'label' => 'Periksa Audit Log', 'url' => '/admin/audit-log?actor=Provis+Support+System']],
        ];
    }

    /**
     * Tool: Get Off-Plan Projects
     */
    protected function toolGetOffPlanProjects(array $args, User $user): array
    {
        $now = Carbon::now('Asia/Jakarta');
        $query = Project::with(['company', 'manager']);

        if (!empty($args['project_id'])) {
            $query->where('id', (int) $args['project_id']);
        }

        $projects = $query->get();
        $offPlanList = [];

        foreach ($projects as $proj) {
            // Overdue tasks
            $overdueTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $proj->id))
                ->where('end', '<', $now->format('Y-m-d'))
                ->where('status', '!=', 'Completed')
                ->where('progress', '<', 100)
                ->get(['id', 'name', 'end', 'progress', 'status']);

            $isDelayed = ($proj->end && Carbon::parse($proj->end)->lt($now) && $proj->progress < 100)
                || $overdueTasks->count() > 0;

            if ($isDelayed || !empty($args['project_id'])) {
                $offPlanList[] = [
                    'project_id'    => $proj->id,
                    'title'         => $proj->title,
                    'company'       => $proj->company?->name ?? '—',
                    'progress'      => $proj->progress ?? 0,
                    'end_date'      => $proj->end,
                    'is_overdue'    => $proj->end ? Carbon::parse($proj->end)->lt($now) : false,
                    'overdue_count' => $overdueTasks->count(),
                    'overdue_tasks' => $overdueTasks->take(5)->map(fn($t) => [
                        'name'     => $t->name,
                        'end'      => $t->end,
                        'progress' => $t->progress,
                    ])->toArray(),
                ];
            }
        }

        $summary = count($offPlanList) > 0
            ? "Ditemukan " . count($offPlanList) . " proyek dengan indikasi keterlambatan / deviasi rencana kerja."
            : "Luar biasa! Tidak ada proyek yang mengalami keterlambatan atau deviasi rencana saat ini.";

        return [
            'summary' => $summary,
            'data'    => ['off_plan_projects' => $offPlanList],
            'actions' => [['type' => 'link', 'label' => 'Buka Dashboard SuperAdmin', 'url' => '/admin']],
        ];
    }

    /**
     * Tool: Get Latest Code Updates
     */
    protected function toolGetLatestCodeUpdates(array $args, User $user): array
    {
        $limit = max(3, min(20, (int) ($args['limit'] ?? 8)));
        $commits = $this->gitService->getRecentCommits($limit);
        $markdown = $this->gitService->formatForAiPrompt($limit);

        return [
            'summary' => "Berhasil membaca {$limit} commit kodingan terakhir dari repositori sistem.",
            'data'    => [
                'total_commits' => count($commits),
                'commits'       => $commits,
                'markdown'      => $markdown,
            ],
            'actions' => [],
        ];
    }

    /**
     * Tool: Get Project Summary
     */
    protected function toolGetProjectSummary(array $args, User $user): array
    {
        $projectId = (int) ($args['project_id'] ?? 0);
        $project = Project::with(['company', 'manager'])->find($projectId);

        if (!$project) {
            return ['summary' => "Proyek ID #{$projectId} tidak ditemukan.", 'data' => ['error' => 'Not found']];
        }

        $allTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))->get();
        $completedCount = $allTasks->where('status', 'Completed')->count();
        $totalCount     = $allTasks->count();
        $completionRate = $totalCount > 0 ? round(($completedCount / $totalCount) * 100, 1) : 0;

        return [
            'summary' => "Ringkasan Proyek #{$project->id} ({$project->title}): Total {$totalCount} pekerjaan, {$completedCount} selesai ({$completionRate}%).",
            'data' => [
                'id'              => $project->id,
                'title'           => $project->title,
                'company'         => $project->company?->name,
                'progress'        => $project->progress,
                'start'           => $project->start,
                'end'             => $project->end,
                'total_tasks'     => $totalCount,
                'completed_tasks' => $completedCount,
            ],
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => 'Lihat Laporan S-Curve', 'url' => "/scurve?project_id={$project->id}"],
            ],
        ];
    }

    /**
     * Tool: Generate PDF Report
     */
    protected function toolGeneratePdfReport(array $args, User $user): array
    {
        $projectId = (int) ($args['project_id'] ?? 0);
        $project = Project::find($projectId);

        if (!$project) {
            return ['summary' => "Proyek ID #{$projectId} tidak ditemukan.", 'data' => ['error' => 'Not found'], 'actions' => []];
        }

        $res = $this->pdfService->generateProjectPdf($projectId);

        return [
            'summary' => "Laporan Eksekutif Proyek '{$project->title}' berhasil disiapkan.",
            'data'    => $res,
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Laporan PDF / Cetak', 'url' => $res['url']],
            ],
        ];
    }

    /**
     * Deterministic Fallback Engine when GEMINI_API_KEY is not yet populated in .env.
     * Still allows natural execution of all major tools!
     */
    protected function executeDeterministicFallback(string $prompt, array $tokenized, User $user, ?int $activeProjectId): array
    {
        $intent = $tokenized['action_intent'] ?? 'GENERAL_QUERY';

        switch ($intent) {
            case 'CREATE_PROJECT':
                $dates = $tokenized['dates'] ?? [];
                $startDate = $dates[0]['date'] ?? Carbon::today()->format('Y-m-d');
                $endDate   = $dates[1]['date'] ?? Carbon::parse($startDate)->addMonths(6)->format('Y-m-d');

                // Extract project title
                preg_match('/(?:buat|bikin|tambah)\s+(?:proyek|project)\s+([^,]+)/i', $prompt, $m);
                $title = isset($m[1]) ? trim(preg_replace('/\b(mulai|dari|pada|tanggal|dengan)\b.*$/i', '', $m[1])) : 'Proyek Baru';
                $title = trim(preg_replace('/^(?:baru|new)\s+/i', '', $title));

                $toolResult = $this->toolCreateProject([
                    'title'      => $title,
                    'start_date' => $startDate,
                    'end_date'   => $endDate,
                ], $user);

                return [
                    'content' => "✅ **Proyek Baru Berhasil Dibuat!**\n\n"
                        . "- **Judul**: {$toolResult['data']['title']}\n"
                        . "- **ID Proyek**: #{$toolResult['data']['project_id']}\n"
                        . "- **Rentang Tanggal**: {$startDate} s/d {$endDate}\n"
                        . "- **Struktur WBS**: Master template telah otomatis diterapkan.\n\n"
                        . "*Tip: Anda dapat menambahkan `GEMINI_API_KEY` pada file `.env` untuk mengaktifkan pemrosesan percakapan yang lebih fleksibel.*",
                    'actions' => $toolResult['actions'],
                ];

            case 'RECONCILE_DATES':
                $toolResult = $this->toolReconcileDates(['project_id' => $activeProjectId], $user);
                return [
                    'content' => "🛠️ **Self-Healing Rekonsiliasi Tanggal Dijalankan**\n\n"
                        . "{$toolResult['summary']}\n\n"
                        . "Semua penyesuaian telah otomatis dicatat di `AuditLog` di bawah aktor **'Provis Support System (AI Agent)'**.",
                    'actions' => $toolResult['actions'],
                ];

            case 'RECAP_OFF_PLAN':
                $toolResult = $this->toolGetOffPlanProjects(['project_id' => $activeProjectId], $user);
                $offPlan = $toolResult['data']['off_plan_projects'] ?? [];

                $text = "📊 **Laporan Deviasi & Keterlambatan Proyek (Off-Plan)**\n\n";
                if (empty($offPlan)) {
                    $text .= "Semua proyek dan pekerjaan saat ini berjalan sesuai jadwal rencana. Tidak ditemukan deviasi kritis.";
                } else {
                    foreach ($offPlan as $op) {
                        $text .= "- **{$op['title']}** (ID #{$op['project_id']}, Perusahaan: {$op['company']})\n"
                            . "  - Progres: {$op['progress']}%\n"
                            . "  - Task Overdue: {$op['overdue_count']} pekerjaan\n";
                        foreach ($op['overdue_tasks'] as $ot) {
                            $text .= "    * _{$ot['name']}_ (Tenggat: {$ot['end']}, Progres: {$ot['progress']}%)\n";
                        }
                    }
                }

                return [
                    'content' => $text,
                    'actions' => $toolResult['actions'],
                ];

            case 'GET_CODE_UPDATES':
                $toolResult = $this->toolGetLatestCodeUpdates(['limit' => 8], $user);
                $text = "📝 **Dokumentasi & Ringkasan Pembaruan Codingan Terakhir (Git)**\n\n"
                    . $toolResult['data']['markdown'] . "\n\n"
                    . "Pembaruan di atas mencakup seluruh commit terakhir yang ada pada repositori sistem.";

                return [
                    'content' => $text,
                    'actions' => [],
                ];

            case 'GENERATE_PDF':
                $pId = $activeProjectId ?: Project::first()?->id;
                if (!$pId) {
                    return ['content' => 'Tidak ditemukan proyek aktif untuk dibuatkan laporan.', 'actions' => []];
                }
                $toolResult = $this->toolGeneratePdfReport(['project_id' => $pId], $user);
                return [
                    'content' => "📄 **Laporan Eksekutif Proyek Berhasil Disiapkan!**\n\n"
                        . "Laporan progres, durasi WBS, dan analisis keterlambatan proyek telah berhasil disusun dalam format dokumen siap unduh/cetak.\n\n"
                        . "Silakan klik tombol aksi di bawah untuk membuka dan mengunduh laporan PDF.",
                    'actions' => $toolResult['actions'],
                ];

            default:
                $pId = $activeProjectId ?: Project::first()?->id;
                return [
                    'content' => "Halo **{$user->username}**! Saya adalah **Provis Support Assistant** (AI Agent).\n\n"
                        . "Saya siap membantu Anda menangani berbagai operasional proyek, antara lain:\n"
                        . "1. 🚀 **Membuat Proyek**: Contoh: *\"Buatkan proyek Pembangunan Pabrik mulai 1 Desember 2026 selama 90 hari\"*\n"
                        . "2. 🔗 **Mengatur Predecessor & Tanggal**: Contoh: *\"Set task 1.2 mulai besok dengan predecessor 1.1 FS lag 2 hari\"*\n"
                        . "3. 🛠️ **Rekonsiliasi Tanggal Otomatis**: Contoh: *\"Tolong sinkronkan tanggal proyek ID #{$pId}\"*\n"
                        . "4. 📊 **Rekap Proyek Off-Plan**: Contoh: *\"Tampilkan rekap proyek mana saja yang terlambat dari plan\"*\n"
                        . "5. 📝 **Dokumentasi Update Coding**: Contoh: *\"Apa saja yang berubah di update kodingan terakhir?\"*\n\n"
                        . "Silakan ketik perintah atau pertanyaan Anda!",
                    'actions' => [],
                ];
        }
    }
}
