<?php

namespace App\Services;

use App\Models\AiChatMessage;
use App\Models\AiChatSession;
use App\Models\AiLearnedKnowledge;
use App\Models\AiLearningTask;
use App\Models\AuditLog;
use App\Models\BudgetEntry;
use App\Models\Company;
use App\Models\Division;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectMember;
use App\Models\Role;
use App\Models\SubWbs;
use App\Models\TaskDependency;
use App\Models\TaskDependencyGroup;
use App\Models\User;
use App\Models\Wbs;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ProvisAiService
{
    protected static bool $tablesVerified = false;

    protected ProvisTokenizerService $tokenizer;
    protected ProvisKnowledgeBaseService $knowledgeBase;
    protected ProvisDeepLearningService $deepLearning;
    protected GitChangelogService $gitService;
    protected DependencyScheduler $scheduler;
    protected MasterTemplateService $templateService;
    protected PdfReportService $pdfService;
    protected ProgressService $progressService;
    protected SCurvePredictionService $scurveService;

    public function __construct(
        ProvisTokenizerService $tokenizer,
        ProvisKnowledgeBaseService $knowledgeBase,
        ProvisDeepLearningService $deepLearning,
        GitChangelogService $gitService,
        DependencyScheduler $scheduler,
        MasterTemplateService $templateService,
        PdfReportService $pdfService,
        ProgressService $progressService,
        SCurvePredictionService $scurveService
    ) {
        $this->tokenizer       = $tokenizer;
        $this->knowledgeBase   = $knowledgeBase;
        $this->deepLearning    = $deepLearning;
        $this->gitService      = $gitService;
        $this->scheduler       = $scheduler;
        $this->templateService = $templateService;
        $this->pdfService      = $pdfService;
        $this->progressService = $progressService;
        $this->scurveService   = $scurveService;
    }

    /**
     * Self-healing table check & H+7 (7-day) automatic chat retention policy.
     * Automatically deletes chat messages, sessions, and learning tasks older than 7 days,
     * while preserving `ai_learned_knowledge` permanently so the local AI keeps getting smarter!
     *
     * @return array{deleted_messages: int, deleted_sessions: int}
     */
    public function ensureTablesAndPruneExpiredChats(int $retentionDays = 7): array
    {
        if (!self::$tablesVerified) {
            try {
                if (Schema::hasTable('users') && !Schema::hasColumn('users', 'is_ai_beta_tester')) {
                    Schema::table('users', function (Blueprint $table) {
                        $table->boolean('is_ai_beta_tester')->default(false);
                    });
                }

                if (!Schema::hasTable('ai_chat_sessions')) {
                    Schema::create('ai_chat_sessions', function (Blueprint $table) {
                        $table->id();
                        $table->unsignedInteger('user_id');
                        $table->string('title')->default('New Conversation');
                        $table->timestamps();

                        $table->index(['user_id', 'updated_at'], 'idx_ai_sessions_user_updated');
                        $table->index('created_at', 'idx_ai_sessions_created_at');
                    });
                }

                if (!Schema::hasTable('ai_chat_messages')) {
                    Schema::create('ai_chat_messages', function (Blueprint $table) {
                        $table->id();
                        $table->unsignedBigInteger('session_id');
                        $table->string('role', 20);
                        $table->longText('content');
                        $table->json('metadata')->nullable();
                        $table->timestamps();

                        $table->foreign('session_id')->references('id')->on('ai_chat_sessions')->onDelete('cascade');
                        $table->index(['session_id', 'created_at'], 'idx_ai_messages_session_created');
                        $table->index('created_at', 'idx_ai_messages_created_at');
                    });
                }

                if (!Schema::hasTable('ai_learned_knowledge')) {
                    Schema::create('ai_learned_knowledge', function (Blueprint $table) {
                        $table->id();
                        $table->string('normalized_pattern', 255)->unique();
                        $table->json('keywords_json')->nullable();
                        $table->text('sample_question');
                        $table->string('strategy', 80)->index();
                        $table->json('strategy_params')->nullable();
                        $table->longText('answer_id')->nullable();
                        $table->longText('answer_en')->nullable();
                        $table->json('actions_json')->nullable();
                        $table->unsignedInteger('hit_count')->default(1);
                        $table->unsignedInteger('learned_by_user_id')->nullable();
                        $table->timestamp('last_used_at')->nullable();
                        $table->timestamps();
                    });
                }

                if (!Schema::hasTable('ai_learning_tasks')) {
                    Schema::create('ai_learning_tasks', function (Blueprint $table) {
                        $table->id();
                        $table->unsignedBigInteger('session_id');
                        $table->unsignedInteger('user_id');
                        $table->unsignedBigInteger('assistant_message_id');
                        $table->unsignedBigInteger('active_project_id')->nullable();
                        $table->longText('prompt');
                        $table->string('language', 10)->default('id');
                        $table->string('status', 20)->default('processing');
                        $table->string('stage_label', 160)->nullable();
                        $table->unsignedBigInteger('learned_knowledge_id')->nullable();
                        $table->timestamp('started_at')->nullable();
                        $table->timestamp('completed_at')->nullable();
                        $table->timestamps();

                        $table->foreign('session_id')->references('id')->on('ai_chat_sessions')->onDelete('cascade');
                        $table->foreign('assistant_message_id')->references('id')->on('ai_chat_messages')->onDelete('cascade');
                        $table->index(['user_id', 'status'], 'idx_ai_learning_tasks_user_status');
                        $table->index(['session_id', 'status'], 'idx_ai_learning_tasks_session_status');
                        $table->index('created_at', 'idx_ai_learning_tasks_created_at');
                    });
                }

                self::$tablesVerified = true;
            } catch (\Throwable $e) {
                Log::warning('ProvisAiService table verification notice: ' . $e->getMessage());
            }
        }

        $deletedMessages = 0;
        $deletedSessions = 0;

        try {
            $cutoff = Carbon::now('Asia/Jakarta')->subDays(max(1, $retentionDays));

            // 1. Auto-delete expired learning tasks (>H+7)
            if (Schema::hasTable('ai_learning_tasks')) {
                AiLearningTask::where('created_at', '<', $cutoff)->delete();
            }

            // 2. Auto-delete individual chat messages older than H+7 (1 week after being asked)
            $deletedMessages = AiChatMessage::where('created_at', '<', $cutoff)->delete();

            // 3. Auto-delete sessions inactive for >7 days or sessions left with 0 messages after message expiry
            $deletedSessions = AiChatSession::where('updated_at', '<', $cutoff)
                ->orWhere(function ($q) use ($cutoff) {
                    $q->where('created_at', '<', $cutoff)
                      ->doesntHave('messages');
                })
                ->delete();
        } catch (\Throwable $e) {
            Log::warning('ProvisAiService H+7 pruning notice: ' . $e->getMessage());
        }

        return [
            'deleted_messages' => (int) $deletedMessages,
            'deleted_sessions' => (int) $deletedSessions,
        ];
    }

    /**
     * Process chat turn entirely on-premise via Native Smart NLP & Self-Learning Engine.
     * 100% Local & Private - Zero external API dependencies, zero network calls.
     */
    public function chat(User $user, string $prompt, ?int $sessionId = null, ?int $activeProjectId = null): array
    {
        // 0. Ensure AI tables exist & enforce H+7 (7-day) automatic retention cleanup
        $this->ensureTablesAndPruneExpiredChats(7);

        // 1. Ensure or retrieve active chat session
        $session = $sessionId ? AiChatSession::where('user_id', $user->id)->find($sessionId) : null;
        if (!$session) {
            $title = Str::limit(trim($prompt), 45, '…') ?: 'New Conversation';
            $session = AiChatSession::create([
                'user_id' => $user->id,
                'title'   => $title,
            ]);
        }

        // 2. Load pruned multi-turn session context
        $sessionContext = $this->loadSessionContext($session, $activeProjectId);

        // 3. Determine strict RBAC accessible project IDs for this user
        $accessibleProjectIds = $this->getAccessibleProjectIds($user);

        // 4. Tokenize prompt, auto-detect language, extract entities, and classify intent
        $tokenized = $this->tokenizer->tokenize($prompt, $activeProjectId, $accessibleProjectIds, $sessionContext);
        $lang      = $tokenized['language'] ?? ($sessionContext['language'] ?? 'id');

        // 5. Save user message
        AiChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'user',
            'content'    => $prompt,
            'metadata'   => [
                'intent'     => $tokenized['action_intent'] ?? 'GENERAL_QUERY',
                'language'   => $lang,
                'project_id' => $activeProjectId,
            ],
        ]);

        // 6. Execute Native Local Smart Engine
        $aiResponse = $this->processNativeAgent($prompt, $tokenized, $user, $activeProjectId, $sessionContext);

        // 7. Compute next multi-turn session context
        $nextContext = $this->mergeSessionContext($sessionContext, $aiResponse['context_update'] ?? [], $lang);
        if (array_key_exists('pending_action', $aiResponse)) {
            $nextContext['pending_action'] = $aiResponse['pending_action'];
        } else {
            $nextContext['pending_action'] = null;
        }
        if (array_key_exists('pending_draft', $aiResponse)) {
            $nextContext['pending_draft'] = $aiResponse['pending_draft'];
        } else {
            $nextContext['pending_draft'] = null;
        }
        if (array_key_exists('pending_scope_clarification', $aiResponse)) {
            $nextContext['pending_scope_clarification'] = $aiResponse['pending_scope_clarification'];
        } else {
            $nextContext['pending_scope_clarification'] = null;
        }
        if (array_key_exists('pending_typo_confirmation', $aiResponse)) {
            $nextContext['pending_typo_confirmation'] = $aiResponse['pending_typo_confirmation'];
        } else {
            $nextContext['pending_typo_confirmation'] = null;
        }
        $nextContext['last_intent'] = $aiResponse['resolved_intent'] ?? ($tokenized['action_intent'] ?? 'GENERAL_QUERY');

        // 7b. ASYNC LOCAL SELF-LEARNING PATH:
        // When the question is unseen by fast rules & not yet in `ai_learned_knowledge`,
        // persist a "thinking" message + background task so it survives sidebar close / page refresh!
        if (!empty($aiResponse['trigger_async_learning'])) {
            $waitingStage = $lang === 'en'
                ? 'Learning question structure & scanning local PROVIS data…'
                : 'Mempelajari pertanyaanmu & menelusuri data lokal PROVIS…';

            $waitingText = $lang === 'en'
                ? 'Hold on a moment — I am studying your question and preparing the best answer from your local PROVIS database…'
                : 'Tunggu sebentar ya, pertanyaanmu sedang saya pelajari dan jawabannya sedang dipersiapkan dari data lokal PROVIS…';

            $assistantMsg = AiChatMessage::create([
                'session_id' => $session->id,
                'role'       => 'assistant',
                'content'    => $waitingText,
                'metadata'   => [
                    'status'                => 'thinking',
                    'thinking_stage'        => $waitingStage,
                    'actions'               => [],
                    'intent'                => 'DEEP_LEARNING',
                    'language'              => $lang,
                    'mode'                  => 'local_self_learning',
                    'requires_confirmation' => false,
                    'awaiting_input'        => false,
                    'context'               => $nextContext,
                ],
            ]);

            $learningTask = AiLearningTask::create([
                'session_id'           => $session->id,
                'user_id'              => $user->id,
                'assistant_message_id' => $assistantMsg->id,
                'active_project_id'    => $aiResponse['scoped_project_id'] ?? $activeProjectId,
                'prompt'               => $prompt,
                'language'             => $lang,
                'status'               => 'processing',
                'stage_label'          => $waitingStage,
            ]);

            $meta = $assistantMsg->metadata ?? [];
            $meta['learning_task_id'] = $learningTask->id;
            $assistantMsg->update(['metadata' => $meta]);
            $session->touch();

            // Launch detached local PHP CLI worker (runs independently of browser / sidebar / refresh!)
            $this->dispatchLocalLearningWorker($learningTask->id);

            return [
                'session_id'       => $session->id,
                'message_id'       => $assistantMsg->id,
                'learning_task_id' => $learningTask->id,
                'role'             => 'assistant',
                'content'          => $waitingText,
                'actions'          => [],
                'metadata'         => $assistantMsg->metadata,
            ];
        }

        // 8. Prepend friendly mild-typo acknowledgment ("Oh, maksudmu ... ya!") when auto-corrected
        $finalContent = $this->applyTypoAcknowledgment($aiResponse, $tokenized, $lang);

        // Save instant assistant message to database
        $assistantMsg = AiChatMessage::create([
            'session_id' => $session->id,
            'role'       => 'assistant',
            'content'    => $finalContent,
            'metadata'   => [
                'status'                => 'completed',
                'actions'               => $aiResponse['actions'] ?? [],
                'intent'                => $nextContext['last_intent'],
                'language'              => $lang,
                'mode'                  => 'native_backend_smart_v3',
                'learned_from_memory'   => (bool) ($aiResponse['learned_from_memory'] ?? false),
                'learned_knowledge_id'  => $aiResponse['learned_knowledge_id'] ?? null,
                'requires_confirmation' => !empty($nextContext['pending_action']),
                'awaiting_input'        => !empty($nextContext['pending_draft'])
                    || !empty($nextContext['pending_scope_clarification'])
                    || !empty($nextContext['pending_typo_confirmation']),
                'context'               => $nextContext,
            ],
        ]);

        $session->touch();

        return [
            'session_id' => $session->id,
            'message_id' => $assistantMsg->id,
            'role'       => 'assistant',
            'content'    => $finalContent,
            'actions'    => $aiResponse['actions'] ?? [],
            'metadata'   => $assistantMsg->metadata,
        ];
    }

    /**
     * Spawn an independent detached local PHP CLI worker (`php artisan provis:ai-learn {taskId}`).
     * Runs 100% locally even if the user closes the sidebar, changes pages, or refreshes the browser!
     */
    protected function dispatchLocalLearningWorker(int $taskId): void
    {
        // In unit tests / in-memory sqlite, do not spawn external CLI against a separate DB
        $driver = DB::connection()->getDriverName();
        $dbName = (string) config('database.connections.' . config('database.default') . '.database', '');
        if ($driver === 'sqlite' && $dbName === ':memory:') {
            return;
        }

        try {
            $phpBin = 'php';
            if (defined('PHP_BINARY') && PHP_BINARY && preg_match('/(?:^|[\\\\\/])php(?:\.exe)?$/i', PHP_BINARY)) {
                $phpBin = PHP_BINARY;
            } elseif (defined('PHP_BINDIR') && PHP_BINDIR) {
                $candidate = rtrim(PHP_BINDIR, '\\/') . DIRECTORY_SEPARATOR . (DIRECTORY_SEPARATOR === '\\' ? 'php.exe' : 'php');
                if (is_file($candidate)) {
                    $phpBin = $candidate;
                }
            }
            $artisan = base_path('artisan');

            if (DIRECTORY_SEPARATOR === '\\') {
                // Windows / Laragon detached background process
                $cmd = 'start /B "" "' . $phpBin . '" "' . $artisan . '" provis:ai-learn ' . (int) $taskId . ' > NUL 2>&1';
                $handle = @popen($cmd, 'r');
                if (is_resource($handle)) {
                    @pclose($handle);
                }
            } else {
                // Linux / macOS detached background process
                $cmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($artisan) . ' provis:ai-learn ' . (int) $taskId . ' > /dev/null 2>&1 &';
                @exec($cmd);
            }
        } catch (\Throwable $e) {
            Log::warning("Local AI learning CLI dispatch fallback for task #{$taskId}: " . $e->getMessage());
        }
    }

    /**
     * Execute a background local self-learning task atomically, updating live thinking stages
     * and writing the synthesized answer to `ai_chat_messages` + `ai_learned_knowledge`.
     */
    public function processLearningTask(int $taskId, bool $withPacedStages = true): ?AiLearningTask
    {
        $task = AiLearningTask::find($taskId);
        if (!$task || $task->status !== 'processing') {
            return $task;
        }

        // Atomic claim so CLI worker and poll fallback never double-execute
        $claimed = AiLearningTask::where('id', $taskId)
            ->where('status', 'processing')
            ->whereNull('started_at')
            ->update(['started_at' => Carbon::now('Asia/Jakarta')]);

        if ($claimed === 0) {
            return AiLearningTask::find($taskId);
        }

        $task->refresh();
        $user = User::with(['role', 'division', 'company', 'companies'])->find($task->user_id);
        $msg  = AiChatMessage::find($task->assistant_message_id);

        if (!$user || !$msg) {
            $task->update(['status' => 'failed', 'completed_at' => Carbon::now('Asia/Jakarta')]);
            return $task;
        }

        try {
            $onStage = function (string $stage) use ($task, $msg, $withPacedStages): void {
                $task->update(['stage_label' => $stage]);
                $meta = is_array($msg->metadata) ? $msg->metadata : [];
                $meta['thinking_stage'] = $stage;
                $msg->update(['metadata' => $meta]);

                if ($withPacedStages) {
                    usleep(750_000); // Smooth ~0.75s per local reasoning stage (~2.25s total) so user clearly sees live thinking progress
                }
            };

            $result = $this->deepLearning->analyzeAndLearn(
                $task->prompt,
                $user,
                $task->active_project_id ? (int) $task->active_project_id : null,
                $task->language ?: 'id',
                $onStage
            );

            $meta = is_array($msg->metadata) ? $msg->metadata : [];
            $meta['status']               = 'completed';
            $meta['thinking_stage']       = null;
            $meta['actions']              = $result['actions'] ?? [];
            $meta['learned_knowledge_id'] = $result['learned_knowledge_id'] ?? null;
            $meta['newly_learned']        = (bool) ($result['newly_learned'] ?? false);
            $meta['learned_strategy']     = $result['strategy'] ?? null;
            $meta['intent']               = 'LEARNED_ANALYSIS';

            $msg->update([
                'content'  => $result['content'],
                'metadata' => $meta,
            ]);

            $task->update([
                'status'               => 'completed',
                'stage_label'          => null,
                'learned_knowledge_id' => $result['learned_knowledge_id'] ?? null,
                'completed_at'         => Carbon::now('Asia/Jakarta'),
            ]);

            if ($task->session) {
                $task->session->touch();
            }
        } catch (\Throwable $e) {
            Log::error("ProvisAiService::processLearningTask(#{$taskId}) error: " . $e->getMessage());

            $fallbackText = ($task->language === 'en')
                ? 'Sorry, an unexpected local error occurred while analyzing your question. Please try rephrasing it!'
                : 'Maaf, terjadi kendala lokal saat memproses analisis pertanyaanmu. Coba tanyakan kembali dengan kalimat yang sedikit lebih spesifik ya!';

            $meta = is_array($msg->metadata) ? $msg->metadata : [];
            $meta['status']         = 'completed';
            $meta['thinking_stage'] = null;
            $msg->update(['content' => $fallbackText, 'metadata' => $meta]);

            $task->update([
                'status'       => 'failed',
                'completed_at' => Carbon::now('Asia/Jakarta'),
            ]);
        }

        return $task->fresh();
    }

    /**
     * Bulletproof fallback driver called during polling/session load:
     * If a background CLI worker could not spawn (e.g. restricted host or test),
     * automatically picks up any unclaimed task older than 1.5s so the UI never hangs!
     */
    public function ensureStaleLearningTasksProcessed(int $userId, ?int $sessionId = null): void
    {
        try {
            if (!Schema::hasTable('ai_learning_tasks')) {
                return;
            }

            $cutoff = Carbon::now('Asia/Jakarta')->subSeconds(3);
            $query  = AiLearningTask::where('user_id', $userId)
                ->where('status', 'processing')
                ->whereNull('started_at')
                ->where('created_at', '<=', $cutoff);

            if ($sessionId) {
                $query->where('session_id', $sessionId);
            }

            foreach ($query->take(3)->get() as $stale) {
                $this->processLearningTask($stale->id, false);
            }
        } catch (\Throwable $e) {
            Log::warning('ensureStaleLearningTasksProcessed notice: ' . $e->getMessage());
        }
    }

    // =========================================================================
    // SESSION MEMORY & RBAC SCOPING
    // =========================================================================

    /**
     * Reconstruct active session memory using the sliding-window tokenizer context pruner.
     */
    protected function loadSessionContext(AiChatSession $session, ?int $activeProjectId): array
    {
        $recentMessages = $session->messages()
            ->latest('id')
            ->take(14)
            ->get()
            ->reverse()
            ->values();

        if ($recentMessages->isEmpty()) {
            return [
                'project_id' => $activeProjectId,
                'language'   => 'id',
            ];
        }

        // Prune conversation history within token budget
        $formatted = $recentMessages->map(fn($m) => [
            'role'     => $m->role,
            'content'  => $m->content,
            'metadata' => $m->metadata ?? [],
        ])->all();

        $pruned = $this->tokenizer->pruneContext($formatted, 4000);

        $context = [
            'project_id'                  => $activeProjectId,
            'language'                    => 'id',
            'pending_action'              => null,
            'pending_draft'               => null,
            'pending_scope_clarification' => null,
            'pending_typo_confirmation'   => null,
        ];

        // Replay assistant contexts chronologically so latest state strictly wins
        foreach ($pruned as $msg) {
            if (($msg['role'] ?? '') === 'assistant' && !empty($msg['metadata']['context'])) {
                $ctx = $msg['metadata']['context'];
                if (is_array($ctx)) {
                    $context = array_merge($context, $ctx);
                    $context['pending_action']              = $ctx['pending_action'] ?? null;
                    $context['pending_draft']               = $ctx['pending_draft'] ?? null;
                    $context['pending_scope_clarification'] = $ctx['pending_scope_clarification'] ?? null;
                    $context['pending_typo_confirmation']   = $ctx['pending_typo_confirmation'] ?? null;
                }
            }
        }

        // Expire pending_action if older than 10 minutes
        if (!empty($context['pending_action']['expires_at'])) {
            try {
                if (Carbon::now()->gt(Carbon::parse($context['pending_action']['expires_at']))) {
                    $context['pending_action'] = null;
                }
            } catch (\Throwable $e) {
                $context['pending_action'] = null;
            }
        }

        // Expire pending_draft if older than 15 minutes
        if (!empty($context['pending_draft']['expires_at'])) {
            try {
                if (Carbon::now()->gt(Carbon::parse($context['pending_draft']['expires_at']))) {
                    $context['pending_draft'] = null;
                }
            } catch (\Throwable $e) {
                $context['pending_draft'] = null;
            }
        }

        // Expire pending_scope_clarification if older than 10 minutes
        if (!empty($context['pending_scope_clarification']['expires_at'])) {
            try {
                if (Carbon::now()->gt(Carbon::parse($context['pending_scope_clarification']['expires_at']))) {
                    $context['pending_scope_clarification'] = null;
                }
            } catch (\Throwable $e) {
                $context['pending_scope_clarification'] = null;
            }
        }

        // Expire pending_typo_confirmation if older than 10 minutes
        if (!empty($context['pending_typo_confirmation']['expires_at'])) {
            try {
                if (Carbon::now()->gt(Carbon::parse($context['pending_typo_confirmation']['expires_at']))) {
                    $context['pending_typo_confirmation'] = null;
                }
            } catch (\Throwable $e) {
                $context['pending_typo_confirmation'] = null;
            }
        }

        // If user switched active page project and hasn't explicitly pinned another, keep track
        if ($activeProjectId && empty($context['project_id'])) {
            $context['project_id'] = $activeProjectId;
        }

        return $context;
    }

    protected function mergeSessionContext(array $current, array $update, string $lang): array
    {
        $merged = array_merge($current, $update);
        $merged['language'] = $lang;
        return $merged;
    }

    protected function isSuperAdmin(User $user): bool
    {
        return strtolower($user->role?->name ?? '') === 'superadmin';
    }

    /**
     * Strict multi-tenant & role-scoped project query matching ProjectController rules.
     */
    protected function getAccessibleProjectsQuery(User $user): Builder
    {
        $role = $user->role?->name ?? '';
        $query = Project::query();

        if ($this->isSuperAdmin($user)) {
            return $query;
        }

        $companyIds = $user->getCompanyIds();

        if ($role === 'worker') {
            $allowedIds = $user->getAllowedProjectIds();
            return $query->where(function ($q) use ($user, $companyIds, $allowedIds) {
                $q->where('project_manager', $user->id);
                if (!empty($companyIds) && !empty($allowedIds)) {
                    $q->orWhere(function ($sub) use ($companyIds, $allowedIds) {
                        $sub->whereIn('companies_id', $companyIds)
                            ->whereIn('id', $allowedIds);
                    });
                }
            });
        }

        if ($role === 'pic') {
            return $query->where(function ($q) use ($user, $companyIds) {
                $q->where('project_manager', $user->id)
                  ->orWhereHas('projectMembers', fn($pm) => $pm->where('user_id', $user->id));
                if (!empty($companyIds)) {
                    $q->orWhere(function ($sub) use ($companyIds) {
                        $sub->whereIn('companies_id', $companyIds)
                            ->where('is_private', false);
                    });
                }
            });
        }

        // admin_utama & admin_progres
        return $query->where(function ($q) use ($user, $companyIds) {
            $q->where('project_manager', $user->id)
              ->orWhereHas('projectMembers', fn($pm) => $pm->where('user_id', $user->id));

            if ($user->getDataScope() === 'all' || empty($companyIds)) {
                $q->orWhere('is_private', false);
            } else {
                $q->orWhere(function ($sub) use ($companyIds) {
                    $sub->whereIn('companies_id', $companyIds)
                        ->where('is_private', false);
                });
            }
        });
    }

    /**
     * @return array<int>
     */
    protected function getAccessibleProjectIds(User $user): array
    {
        return $this->getAccessibleProjectsQuery($user)
            ->pluck('id')
            ->map(fn($id) => (int) $id)
            ->all();
    }

    protected function canUserViewProject(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }
        return in_array((int) $project->id, $this->getAccessibleProjectIds($user), true);
    }

    protected function canUserEditWbs(User $user, Project $project): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }
        $role = $user->role?->name ?? '';
        if (in_array($role, ['admin_utama', 'admin_progres'], true)) {
            return false;
        }
        if ((int) $project->project_manager === (int) $user->id) {
            return true;
        }
        if ($role === 'pic' && $project->projectMembers()->where('user_id', $user->id)->exists()) {
            return true;
        }
        return false;
    }

    protected function canUserUpdateTask(User $user, Project $project, Wbs $task): bool
    {
        if ($this->canUserEditWbs($user, $project)) {
            return true;
        }
        if ($user->isWorker() && $this->canUserViewProject($user, $project)) {
            $userDivIds = $user->getDivisionIds();
            if (empty($userDivIds)) {
                return true;
            }
            $taskDivIds = $task->divisions()->pluck('divisions.id')->map(fn($id) => (int) $id)->all();
            if ($task->divisions_id) {
                $taskDivIds[] = (int) $task->divisions_id;
            }
            if (!empty(array_intersect($userDivIds, $taskDivIds))) {
                return true;
            }
            $taskDivName = strtolower(trim($task->division?->divisi ?? ''));
            if (in_array($taskDivName, ['', 'general', 'internal'], true)) {
                return true;
            }
        }
        return false;
    }

    protected function canUserCreateProject(User $user): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }
        return $user->canCreateProject();
    }

    protected function canUserViewBudget(User $user): bool
    {
        if ($user->isAdminProgres()) {
            return false;
        }
        if ($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic()) {
            return true;
        }
        return $user->hasSidebarAccess('Budget Management');
    }

    /**
     * Resolve target project respecting: follow-up index -> explicit ID -> fuzzy title -> active project -> session context -> first accessible.
     *
     * @return array{project: ?Project, denied: bool, requested_id: ?int}
     */
    protected function resolveTargetProject(
        User $user,
        array $tokenized,
        ?int $activeProjectId,
        array $sessionContext,
        bool $allowFallbackFirst = true
    ): array {
        $accessibleIds = $this->getAccessibleProjectIds($user);

        // 1. Follow-up item index referencing a previously shown project list (e.g. "detail yang pertama")
        $itemIndex = $tokenized['follow_up']['item_index'] ?? null;
        if ($itemIndex && !empty($sessionContext['referenced_projects']) && empty($sessionContext['referenced_tasks'])) {
            $ref = $sessionContext['referenced_projects'][$itemIndex - 1] ?? null;
            if ($ref && in_array((int) $ref['id'], $accessibleIds, true)) {
                return ['project' => Project::with(['company', 'manager'])->find($ref['id']), 'denied' => false, 'requested_id' => null];
            }
        }

        // 2. Explicit numeric project ID in prompt (#5, proyek 5)
        $explicitId = $this->tokenizer->extractProjectIdFromPrompt($tokenized['original_prompt'] ?? '');
        if ($explicitId) {
            $found = Project::with(['company', 'manager'])->find($explicitId);
            if ($found) {
                if (!$this->canUserViewProject($user, $found)) {
                    return ['project' => null, 'denied' => true, 'requested_id' => $explicitId];
                }
                return ['project' => $found, 'denied' => false, 'requested_id' => $explicitId];
            }
        }

        // 3. Fuzzy project name matched from accessible projects
        if (!empty($tokenized['matched_projects'])) {
            $matchedId = (int) $tokenized['matched_projects'][0]['id'];
            if (in_array($matchedId, $accessibleIds, true)) {
                return ['project' => Project::with(['company', 'manager'])->find($matchedId), 'denied' => false, 'requested_id' => null];
            }
        }

        // 4. Context project if user says "proyek tadi" / "that project" / follow-up refinement
        if (($tokenized['follow_up']['refers_to_previous'] ?? false) && !empty($sessionContext['project_id'])) {
            $ctxId = (int) $sessionContext['project_id'];
            if (in_array($ctxId, $accessibleIds, true)) {
                return ['project' => Project::with(['company', 'manager'])->find($ctxId), 'denied' => false, 'requested_id' => null];
            }
        }

        // 5. Active project currently open in browser URL
        if ($activeProjectId && in_array((int) $activeProjectId, $accessibleIds, true)) {
            return ['project' => Project::with(['company', 'manager'])->find($activeProjectId), 'denied' => false, 'requested_id' => null];
        }

        // 6. Session context project
        if (!empty($sessionContext['project_id']) && in_array((int) $sessionContext['project_id'], $accessibleIds, true)) {
            return ['project' => Project::with(['company', 'manager'])->find($sessionContext['project_id']), 'denied' => false, 'requested_id' => null];
        }

        // 7. Fallback to first accessible project
        if ($allowFallbackFirst && !empty($accessibleIds)) {
            return ['project' => Project::with(['company', 'manager'])->find($accessibleIds[0]), 'denied' => false, 'requested_id' => null];
        }

        return ['project' => null, 'denied' => false, 'requested_id' => $explicitId];
    }

    /**
     * Build a WBS display-code map (`taskId => '1.2.1'`) for a project.
     */
    protected function buildTaskCodeMap(int $projectId): array
    {
        $map = [];
        $mainWbsList = MainWbs::where('projects_id', $projectId)
            ->orderBy('order_index')
            ->orderBy('id')
            ->with([
                'subWbs' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
                'subWbs.wbsTasks' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
            ])
            ->get();

        foreach ($mainWbsList as $mIdx => $mj) {
            $mjCode = (string) ($mIdx + 1);
            foreach ($mj->subWbs as $sIdx => $smj) {
                $smjCode = $mjCode . '.' . ($sIdx + 1);
                foreach ($smj->wbsTasks as $tIdx => $task) {
                    $map[(string) $task->id] = $smjCode . '.' . ($tIdx + 1);
                }
            }
        }

        return $map;
    }

    // =========================================================================
    // MAIN ROUTER
    // =========================================================================

    protected function processNativeAgent(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext
    ): array {
        $lang = $tokenized['language'] ?? 'id';

        // 1. Human-in-the-Loop High-Risk Guardrail (Blocks destructive delete/drop/reset operations)
        if ($this->tokenizer->isHighRiskAction($prompt)) {
            return $this->handleHighRiskGuardrail($activeProjectId, $lang);
        }

        // 2. Active Pending Action Confirmation / Cancellation / In-Place Revision
        if (!empty($sessionContext['pending_action'])) {
            $conf = $tokenized['confirmation'] ?? $this->tokenizer->detectConfirmation($prompt);
            if ($conf === 'confirm') {
                return $this->executePendingAction($sessionContext['pending_action'], $user, $lang);
            }
            if ($conf === 'cancel') {
                return $this->cancelPendingAction($sessionContext['pending_action'], $lang);
            }
            $revised = $this->tryRevisePendingAction($prompt, $tokenized, $sessionContext['pending_action'], $user, $lang);
            if ($revised !== null) {
                return $revised;
            }
        }

        // 3. Active Interactive Slot-Filling Draft (Multi-turn Q&A without retyping the full prompt!)
        if (!empty($sessionContext['pending_draft'])) {
            $conf = $tokenized['confirmation'] ?? $this->tokenizer->detectConfirmation($prompt);
            if ($conf === 'cancel') {
                return $this->cancelPendingDraft($sessionContext['pending_draft'], $lang);
            }
            if (!$this->isDraftTopicSwitch($prompt, $tokenized, $sessionContext['pending_draft'])) {
                return $this->continuePendingDraft($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);
            }
        }

        // 3b. Active Scope Clarification Follow-Up (User just answered "Task kah? Projek kah? Atau di luar PROVIS?")
        if (!empty($sessionContext['pending_scope_clarification'])) {
            return $this->continueScopeClarification($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }

        // 3b2. Active Heavy/Ambiguous Typo Confirmation Follow-Up (User just replied "Ya" or picked option "1"/"2")
        if (!empty($sessionContext['pending_typo_confirmation'])) {
            return $this->continueTypoConfirmation($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }

        // 3c. Strict PROVIS Work-Only Scope Guardrail (Clarifies ambiguous prompts first; rejects clearly out-of-scope!)
        $scopeCheck = $this->tokenizer->classifyWorkScope($tokenized['original_prompt'] ?? $prompt, $tokenized, $sessionContext);
        if ($scopeCheck['status'] === 'out_of_scope') {
            return $this->outOfScopeResponse($lang);
        }
        if ($scopeCheck['status'] === 'ambiguous') {
            return $this->askScopeClarification($prompt, $scopeCheck, $lang);
        }

        // 3d. Heavy / Ambiguous Typo Confirmation Guard (Asks to confirm before risking wrong data!)
        if (!empty($tokenized['heavy_typo_candidates']['candidates']) && !$user->isWorker() && !$user->isAdminProgres()) {
            $ht = $tokenized['heavy_typo_candidates'];
            $cands = $ht['candidates'];

            // Respect multi-tenant company RBAC when suggesting company candidates!
            if (($ht['entity_type'] ?? '') === 'company' && !$this->isSuperAdmin($user)) {
                $allowedCompIds = $user->getCompanyIds();
                $cands = array_values(array_filter($cands, fn($c) => in_array((int) $c['id'], $allowedCompIds, true)));
            }

            if (!empty($cands)) {
                return $this->askTypoConfirmation(
                    $tokenized['original_prompt'] ?? $prompt,
                    (string) ($ht['raw_term'] ?? ''),
                    $cands,
                    $lang
                );
            }
        }

        if (!empty($tokenized['ambiguous_word_typos']) && ($tokenized['action_intent'] ?? 'GENERAL_QUERY') === 'GENERAL_QUERY') {
            $amb   = $tokenized['ambiguous_word_typos'][0];
            $cands = array_map(fn($w) => ['id' => 0, 'label' => $w], $amb['suggestions'] ?? []);
            if (!empty($cands)) {
                return $this->askTypoConfirmation(
                    $tokenized['original_prompt'] ?? $prompt,
                    (string) ($amb['from'] ?? ''),
                    $cands,
                    $lang
                );
            }
        }

        $intent = $tokenized['action_intent'] ?? 'GENERAL_QUERY';

        // 4. Self-Learning Specialized Analytical Router (runs before generic read handlers!):
        // If the user asks a complex/specialized cross-table question (e.g., busiest PIC, longest task,
        // division with most tasks, nearest deadline, evidence-required tasks, top budget category, etc.):
        //   - Already learned in `ai_learned_knowledge`? -> Answer INSTANTLY with live RBAC-scoped DB data!
        //   - Never seen before? -> Check RBAC first; if permitted, trigger background local self-learning!
        $bypassSelfLearningIntents = [
            'CONFIRM_PENDING_ACTION',
            'CANCEL_PENDING_ACTION',
            'GREETING_OR_SMALLTALK',
            'CALCULATE_MATH',
            'KNOWLEDGE_BASE',
            'ANALYZE_BLOCKER',
            'CREATE_PROJECT',
            'CREATE_USER',
            'MANAGE_PROJECT_ACCESS',
            'ADD_TASK',
            'UPDATE_TASK_STATUS',
            'UPDATE_TASK_PROGRESS',
            'SET_PREDECESSOR',
            'UPDATE_SCHEDULE',
            'RECONCILE_DATES',
        ];

        $specializedStrategy = !in_array($intent, $bypassSelfLearningIntents, true)
            ? $this->deepLearning->detectSpecializedStrategy($prompt)
            : null;

        if ($specializedStrategy !== null) {
            $scopedProjectId = !empty($tokenized['matched_projects'][0]['id'])
                ? (int) $tokenized['matched_projects'][0]['id']
                : $activeProjectId;

            $learned = $this->deepLearning->findLearnedMatch($prompt);
            if ($learned) {
                $res = $this->deepLearning->executeLearnedEntry($learned, $user, $scopedProjectId, $lang, $prompt);
                return [
                    'content'              => $res['content'],
                    'actions'              => $res['actions'] ?? [],
                    'resolved_intent'      => !empty($res['access_denied']) ? 'ACCESS_DENIED' : 'LEARNED_ANALYSIS',
                    'learned_from_memory'  => true,
                    'learned_knowledge_id' => $learned->id,
                ];
            }

            // Enforce strict RBAC BEFORE dispatching background learning (never pretend to learn a forbidden query!)
            $rbacDenied = $this->deepLearning->checkStrategyRbac($specializedStrategy['strategy'], $prompt, $user, $lang);
            if ($rbacDenied !== null) {
                return [
                    'content'         => $rbacDenied,
                    'actions'         => [],
                    'resolved_intent' => 'ACCESS_DENIED',
                ];
            }

            return [
                'trigger_async_learning' => true,
                'scoped_project_id'      => $scopedProjectId,
                'content'                => '',
                'actions'                => [],
                'resolved_intent'        => 'DEEP_LEARNING',
            ];
        }

        switch ($intent) {
            // Two-Step Safe Confirmation Handlers
            case 'CONFIRM_PENDING_ACTION':
                return $this->executePendingAction($sessionContext['pending_action'] ?? null, $user, $lang);

            case 'CANCEL_PENDING_ACTION':
                return $this->cancelPendingAction($sessionContext['pending_action'] ?? null, $lang);

            // Conversational, Math & Knowledge Base
            case 'GREETING_OR_SMALLTALK':
                return $this->handleGreetingOrSmalltalk($prompt, $user, $activeProjectId, $lang);

            case 'CALCULATE_MATH':
                return $this->handleCalculateMath($prompt, $lang);

            case 'KNOWLEDGE_BASE':
                return $this->handleKnowledgeBase($prompt, $tokenized, $user, $activeProjectId, $lang);

            // System-Wide & Portfolio Handlers
            case 'QUERY_SYSTEM_OVERVIEW':
                return $this->handleSystemOverviewQuery($user, $lang, $prompt);

            case 'QUERY_COMPANIES':
                return $this->handleCompaniesQuery($tokenized, $user, $lang, $prompt);

            case 'QUERY_DIVISIONS':
                return $this->handleDivisionsQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang, $prompt);

            case 'QUERY_TEMPLATES':
                return $this->handleTemplatesQuery($user, $lang);

            case 'QUERY_WBS_STRUCTURE':
                return $this->handleWbsStructureQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            // Read & Analytical Handlers
            case 'LIST_PROJECTS':
                return $this->handleListProjects($user, $lang, $prompt, $tokenized);

            case 'QUERY_SUMMARY':
                return $this->handleProjectSummaryQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'QUERY_TASKS':
                return $this->handleQueryTasks($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'QUERY_TODAY_TASKS':
                return $this->handleTodayTasksQuery($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'ANALYZE_BLOCKER':
                return $this->handleAnalyzeBlocker($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'QUERY_BUDGET':
                return $this->handleBudgetQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'QUERY_DIVISION_PROGRESS':
                return $this->handleDivisionProgressQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'QUERY_SCURVE':
                return $this->handleSCurveQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'RECAP_OFF_PLAN':
                return $this->handleRecapOffPlan($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'GENERATE_PDF':
                return $this->handleGeneratePdf($tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'GET_CODE_UPDATES':
                return $this->handleCodeUpdates($user, $lang);

            case 'QUERY_AUDIT_LOG':
                return $this->handleAuditLogQuery($user, $lang);

            case 'QUERY_USERS':
                return $this->handleUsersQuery($user, $activeProjectId, $sessionContext, $lang, $prompt, $tokenized);

            // Interactive Slot-Filling + Safe Two-Step Write Handlers
            case 'CREATE_PROJECT':
                return $this->proposeCreateProject($prompt, $tokenized, $user, $lang);

            case 'CREATE_USER':
                return $this->proposeCreateUser($prompt, $tokenized, $user, $lang);

            case 'MANAGE_PROJECT_ACCESS':
                return $this->proposeManageProjectAccess($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'ADD_TASK':
                return $this->proposeAddTask($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'UPDATE_TASK_STATUS':
                return $this->proposeUpdateTaskStatus($tokenized, $user, $activeProjectId, $sessionContext, $lang, $prompt);

            case 'UPDATE_TASK_PROGRESS':
                return $this->proposeUpdateTaskProgress($tokenized, $user, $activeProjectId, $sessionContext, $lang, $prompt);

            case 'SET_PREDECESSOR':
            case 'UPDATE_SCHEDULE':
                return $this->proposeScheduleAndPredecessor($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);

            case 'RECONCILE_DATES':
                return $this->proposeReconcileDates($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);

            default:
                return $this->handleSmartFallback($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }
    }

    // =========================================================================
    // GUARDRAILS, GREETINGS & KNOWLEDGE BASE
    // =========================================================================

    protected function handleHighRiskGuardrail(?int $activeProjectId, string $lang): array
    {
        if ($lang === 'en') {
            return [
                'content' => "🛑 **High-Risk Action Restricted (Human-in-the-Loop Safety Guardrail)**\n\n"
                    . "Your request contains a critical or permanent deletion instruction (`delete`, `drop`, `truncate`, `reset`, `clear`).\n\n"
                    . "To protect PROVIS database integrity (*data loss prevention*), destructive operations **cannot be executed automatically via AI Chat**.\n\n"
                    . "Please perform this adjustment manually from the official project interface or contact a SuperAdministrator.",
                'actions' => [
                    ['type' => 'link', 'label' => 'Open Project Detail', 'url' => $activeProjectId ? "/projects/{$activeProjectId}" : '/projectlistpage'],
                    ['type' => 'link', 'label' => 'Inspect Audit Log', 'url' => '/admin/audit-log'],
                ],
                'resolved_intent' => 'HIGH_RISK_BLOCKED',
            ];
        }

        return [
            'content' => "🛑 **Tindakan Berisiko Tinggi Dibatasi (Human-in-the-Loop Safety Guardrail)**\n\n"
                . "Permintaan Anda mengandung instruksi perubahan kritis atau penghapusan permanen (`hapus`, `delete`, `reset`, `drop`, `clear`).\n\n"
                . "Demi keamanan dan integritas basis data PROVIS (*data loss prevention*), operasi destruktif **tidak dapat dijalankan secara otomatis melalui AI Chat**.\n\n"
                . "Silakan lakukan penyesuaian secara manual melalui antarmuka resmi proyek atau hubungi SuperAdministrator.",
            'actions' => [
                ['type' => 'link', 'label' => 'Buka Detail Proyek', 'url' => $activeProjectId ? "/projects/{$activeProjectId}" : '/projectlistpage'],
                ['type' => 'link', 'label' => 'Periksa Audit Log', 'url' => '/admin/audit-log'],
            ],
            'resolved_intent' => 'HIGH_RISK_BLOCKED',
        ];
    }

    /**
     * Exact out-of-scope rejection response (PROVIS work-only guardrail).
     */
    protected function outOfScopeResponse(string $lang): array
    {
        $content = $lang === 'en'
            ? 'Sorry, I cannot answer your question because the context you asked about is outside the scope of the PROVIS system.'
            : 'Maaf, saya tidak bisa menjawab pertanyaan Anda karena konteks yang Anda tanyakan itu diluar scope sistem.';

        return [
            'content'                     => $content,
            'actions'                     => [],
            'pending_scope_clarification' => null,
            'resolved_intent'             => 'OUT_OF_SCOPE',
        ];
    }

    /**
     * Unified role-based access restriction response.
     */
    protected function roleRestrictedResponse(User $user, string $idDetail, string $enDetail, string $lang): array
    {
        $roleName = $user->role?->name ?? 'worker';
        $content  = $lang === 'en'
            ? "🔒 **Access Restricted**: {$enDetail} (Your role: `{$roleName}`)."
            : "🔒 **Akses Dibatasi**: {$idDetail} (Role akun Anda: `{$roleName}`).";

        return [
            'content'         => $content,
            'actions'         => [],
            'resolved_intent' => 'ACCESS_DENIED',
        ];
    }

    /**
     * Helpful dynamic response when the user explicitly queried a company name (e.g. "jumlah karyawan di PT X")
     * that is not yet registered in the local PROVIS `companies` table.
     */
    protected function companyNotFoundResponse(string $requestedName, User $user, string $lang): array
    {
        $query = Company::orderBy('name');
        if (!$this->isSuperAdmin($user)) {
            $cIds = $user->getCompanyIds();
            $query->whereIn('id', !empty($cIds) ? $cIds : [-1]);
        }
        $available = $query->pluck('name')->all();
        $listText  = !empty($available)
            ? implode(', ', array_map(fn($n) => "**{$n}**", $available))
            : ($lang === 'en' ? '*none registered*' : '*belum ada perusahaan terdaftar*');

        if ($lang === 'en') {
            $content = "🔍 Company **{$requestedName}** was not found in the local PROVIS database.\n\n"
                . "Currently registered companies within your access scope: {$listText}.\n\n"
                . "> 💡 Please check the company spelling, or ask using one of the registered company names above.";
        } else {
            $content = "🔍 Perusahaan **{$requestedName}** belum ditemukan di database PROVIS.\n\n"
                . "Perusahaan yang saat ini terdaftar dalam cakupan akses Anda: {$listText}.\n\n"
                . "> 💡 Pastikan penulisan nama PT sesuai, atau coba tanyakan ulang menggunakan salah satu nama perusahaan terdaftar di atas ya.";
        }

        return [
            'content'         => $content,
            'actions'         => $this->isSuperAdmin($user) ? [['type' => 'link', 'label' => $lang === 'en' ? 'Manage Companies' : 'Kelola Perusahaan', 'url' => '/admin/companies']] : [],
            'resolved_intent' => 'QUERY_COMPANIES',
        ];
    }

    /**
     * Prepend a friendly, human acknowledgment when mild typos were automatically corrected
     * (e.g. "jumlah karyawn di pt karabha wiratama" -> "Oh, maksudmu jumlah karyawan di PT. KARABHA WIRATAMA ya!").
     * Never prepends on ACCESS_DENIED / OUT_OF_SCOPE / confirmation prompts.
     */
    protected function applyTypoAcknowledgment(array $aiResponse, array $tokenized, string $lang): string
    {
        $content = (string) ($aiResponse['content'] ?? '');
        $fixes   = $tokenized['typo_corrections'] ?? [];
        $intent  = $aiResponse['resolved_intent'] ?? '';

        $skipIntents = [
            'ACCESS_DENIED',
            'OUT_OF_SCOPE',
            'SCOPE_CLARIFICATION',
            'TYPO_CONFIRMATION',
            'HIGH_RISK_BLOCKED',
            'CANCEL_PENDING_ACTION',
        ];

        if (empty($fixes) || in_array($intent, $skipIntents, true) || !empty($aiResponse['skip_typo_banner'])) {
            return $content;
        }

        // Build clean human-readable corrected sentence (with canonical DB entity name if fuzzy-matched)
        $readable = (string) ($tokenized['original_prompt'] ?? '');
        foreach ($fixes as $fx) {
            $kind = $fx['kind'] ?? 'word';
            $from = (string) ($fx['from'] ?? '');
            $to   = (string) ($fx['to'] ?? '');
            if ($kind === 'company' && !empty($tokenized['matched_companies'][0]['name'])) {
                $canonical = $tokenized['matched_companies'][0]['name'];
                $extracted = $this->tokenizer->extractRequestedCompanyName($readable);
                if ($extracted && mb_strtolower($extracted) !== mb_strtolower($canonical)) {
                    $readable = str_ireplace($extracted, $canonical, $readable);
                } elseif ($from !== '') {
                    $readable = preg_replace('/\b' . preg_quote($from, '/') . '\b/iu', $canonical, $readable, 1) ?? $readable;
                }
            } elseif ($kind === 'project' && $from !== '' && $to !== '') {
                $readable = preg_replace('/\b' . preg_quote($from, '/') . '\b/iu', $to, $readable, 1) ?? $readable;
            } elseif ($kind === 'division' && $from !== '' && $to !== '') {
                $readable = preg_replace('/\b' . preg_quote($from, '/') . '\b/iu', $to, $readable, 1) ?? $readable;
            }
        }

        $readable = trim($readable);
        if ($readable === '') {
            return $content;
        }

        $banner = $lang === 'en'
            ? "💡 *Oh, you meant **\"{$readable}\"**! Here you go:*\n\n"
            : "💡 *Oh, maksudmu **\"{$readable}\"** ya! Oke, ini datanya:*\n\n";

        return $banner . $content;
    }

    /**
     * Ask user to confirm a heavily typoed or ambiguous entity/word BEFORE risking a wrong answer!
     *
     * @param array<int, array{id: int, label: string, similarity?: float}> $candidates
     */
    protected function askTypoConfirmation(
        string $basePrompt,
        string $rawTerm,
        array $candidates,
        string $lang
    ): array {
        $candidates = array_values($candidates);
        $first      = $candidates[0];

        $replaceInPrompt = function (string $replacement) use ($basePrompt, $rawTerm): string {
            if ($rawTerm !== '' && stripos($basePrompt, $rawTerm) !== false) {
                return trim(str_ireplace($rawTerm, $replacement, $basePrompt));
            }
            return trim($basePrompt . ' ' . $replacement);
        };

        $suggestedFirst = $replaceInPrompt($first['label']);

        if (count($candidates) === 1) {
            $content = $lang === 'en'
                ? "🤔 That looks a bit ambiguous or heavily typoed (`\"{$rawTerm}\"`). To make sure I fetch the right data, did you mean **\"{$suggestedFirst}\"**?\n\nReply **Yes** to proceed right away, or retype the exact name!"
                : "🤔 Sepertinya penulisan **`\"{$rawTerm}\"`** agak rancu / cukup banyak typo. Biar saya tidak salah ambil data, apakah maksudmu **\"{$suggestedFirst}\"**?\n\nKetik **Ya** untuk langsung saya tampilkan datanya, atau ketik ulang yang benar ya!";
        } else {
            $opts = [];
            foreach ($candidates as $idx => $c) {
                $opts[] = ($idx + 1) . ". **{$c['label']}**";
            }
            $optList = implode("\n", $opts);

            $content = $lang === 'en'
                ? "🤔 **`\"{$rawTerm}\"`** is a bit ambiguous and matches multiple records in PROVIS. Which one did you mean?\n\n{$optList}\n\nReply with the number (`1`, `2`, …) or full name!"
                : "🤔 Penulisan **`\"{$rawTerm}\"`** agak rancu dan mirip dengan beberapa data di database PROVIS. Maksudmu yang mana ya?\n\n{$optList}\n\nKetik nomornya (`1`, `2`, …) atau tulis nama lengkapnya ya!";
        }

        return [
            'content'                   => $content,
            'actions'                   => [],
            'pending_typo_confirmation' => [
                'base_prompt'      => $basePrompt,
                'raw_term'         => $rawTerm,
                'suggested_prompt' => $suggestedFirst,
                'candidates'       => $candidates,
                'language'         => $lang,
                'expires_at'       => Carbon::now()->addMinutes(10)->toIso8601String(),
            ],
            'resolved_intent'           => 'TYPO_CONFIRMATION',
            'skip_typo_banner'          => true,
        ];
    }

    /**
     * Execute the user's confirmation or candidate selection after a heavy/ambiguous typo prompt!
     */
    protected function continueTypoConfirmation(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $pending    = $sessionContext['pending_typo_confirmation'] ?? [];
        $candidates = $pending['candidates'] ?? [];
        $basePrompt = (string) ($pending['base_prompt'] ?? '');
        $rawTerm    = (string) ($pending['raw_term'] ?? '');
        $origLang   = (string) ($pending['language'] ?? $lang);
        $lower      = mb_strtolower(trim($prompt));

        $cleanContext = $sessionContext;
        $cleanContext['pending_typo_confirmation'] = null;

        // 1. User cancelled / said no -> clear and let them retype
        if (($tokenized['confirmation'] ?? null) === 'cancel' || preg_match('/^(bukan|tidak|gak|ga|no|salah|batal|cancel)$/i', $lower)) {
            return [
                'content'                   => $origLang === 'en'
                    ? 'Got it! Please type the exact name or question you are looking for so I can check it accurately.'
                    : 'Oke siap! Silakan tulis ulang nama atau pertanyaan yang tepat ya biar langsung saya cek datanya.',
                'actions'                   => [],
                'pending_typo_confirmation' => null,
                'resolved_intent'           => 'CANCEL_PENDING_ACTION',
                'skip_typo_banner'          => true,
            ];
        }

        $chosenPrompt = null;

        // 2. User picked a numbered candidate ("1", "2", "nomor 2", "yang pertama")
        $pickedIdx = null;
        if (preg_match('/^\s*(\d+)\s*$/', $lower, $m)) {
            $pickedIdx = (int) $m[1];
        } elseif (!empty($tokenized['follow_up']['item_index'])) {
            $pickedIdx = (int) $tokenized['follow_up']['item_index'];
        }

        if ($pickedIdx !== null && isset($candidates[$pickedIdx - 1]['label'])) {
            $label = (string) $candidates[$pickedIdx - 1]['label'];
            $chosenPrompt = ($rawTerm !== '' && stripos($basePrompt, $rawTerm) !== false)
                ? trim(str_ireplace($rawTerm, $label, $basePrompt))
                : trim($basePrompt . ' ' . $label);
        }

        // 3. User confirmed single suggestion ("ya", "iya", "betul", "benar", "oke", "gas")
        if (
            $chosenPrompt === null
            && (
                ($tokenized['confirmation'] ?? null) === 'confirm'
                || preg_match('/^(ya|iya|betul|benar|yup|yap|oke|ok|gas|yes|correct|right|tepat)(\s+.*)?$/i', $lower)
            )
            && !empty($pending['suggested_prompt'])
        ) {
            $chosenPrompt = (string) $pending['suggested_prompt'];
        }

        if ($chosenPrompt !== null) {
            $accessibleIds = $this->getAccessibleProjectIds($user);
            $reTokenized   = $this->tokenizer->tokenize($chosenPrompt, $activeProjectId, $accessibleIds, $cleanContext);
            $res           = $this->processNativeAgent($chosenPrompt, $reTokenized, $user, $activeProjectId, $cleanContext);
            $res['pending_typo_confirmation'] = null;
            $res['skip_typo_banner']          = true;
            return $res;
        }

        // 4. Otherwise user typed a brand-new / manually corrected question -> process it fresh!
        $res = $this->processNativeAgent($prompt, $tokenized, $user, $activeProjectId, $cleanContext);
        $res['pending_typo_confirmation'] = null;
        return $res;
    }

    /**
     * Render a rich, RBAC-safe profile card for a single matched User account.
     */
    protected function renderUserProfileCard(User $targetUser, User $viewer, string $lang, bool $hadTypo = false): array
    {
        $targetUser->loadMissing(['role', 'division', 'company', 'companies']);
        $accessibleIds = $this->getAccessibleProjectIds($viewer);

        $managedQuery = Project::where('project_manager', $targetUser->id);
        if (!$this->isSuperAdmin($viewer)) {
            $managedQuery->whereIn('id', !empty($accessibleIds) ? $accessibleIds : [-1]);
        }
        $managed = $managedQuery->pluck('title')->implode(', ') ?: '—';

        $compNames = $targetUser->companies->pluck('name')->all();
        if (empty($compNames) && $targetUser->company) {
            $compNames = [$targetUser->company->name];
        }
        $cName = !empty($compNames) ? implode(', ', $compNames) : '—';
        $rName = $targetUser->role?->name ?? 'worker';
        $dName = $targetUser->division?->divisi ?? 'General';

        $typoHeader = '';
        if ($hadTypo) {
            $typoHeader = $lang === 'en'
                ? "💡 *Oh, you meant account **{$targetUser->username}**!*\n\n"
                : "💡 *Oh, maksudmu akun **{$targetUser->username}** ya!*\n\n";
        }

        $content = $lang === 'en'
            ? "{$typoHeader}👤 **User Profile: {$targetUser->username}**\n\n"
              . "- **Email**: `{$targetUser->email}`\n"
              . "- **Role**: `{$rName}`\n"
              . "- **Division**: **{$dName}**\n"
              . "- **Company**: {$cName}\n"
              . "- **Managed Projects (PIC)**: {$managed}"
            : "{$typoHeader}👤 **Profil Akun: {$targetUser->username}**\n\n"
              . "- **Email**: `{$targetUser->email}`\n"
              . "- **Role**: `{$rName}`\n"
              . "- **Divisi**: **{$dName}**\n"
              . "- **Perusahaan**: {$cName}\n"
              . "- **Proyek yang Dikelola (PIC)**: {$managed}";

        $actions = [];
        if ($this->isSuperAdmin($viewer)) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users'];
        }

        return [
            'content'          => $content,
            'actions'          => $actions,
            'resolved_intent'  => 'QUERY_USERS',
            'skip_typo_banner' => $hadTypo,
        ];
    }

    /**
     * Ask a polite clarifying question before rejecting an ambiguous prompt
     * (e.g. "kapan tugas ini diselesaikan?" -> "Apa yang dimaksud tugas di sini? Task kah? Projek kah?").
     */
    protected function askScopeClarification(string $prompt, array $scopeCheck, string $lang): array
    {
        $term = $scopeCheck['ambiguous_term'] ?? null;

        if ($term === 'tugas') {
            $content = $lang === 'en'
                ? 'I\'m not quite sure what you mean. What do you mean by "tugas" here — is it a **Task (WBS)** in PROVIS, a **Project** in PROVIS, or something outside the system?'
                : 'Saya kurang mengerti maksud Anda. Apa yang dimaksud "tugas" di sini? **Task (WBS)** kah? **Projek** kah? Atau hal lain di luar sistem PROVIS?';
        } elseif ($term && $term !== 'ini') {
            $content = $lang === 'en'
                ? "I'm not quite sure what you mean by \"{$term}\". Is this about a **Task (WBS)** in PROVIS, a **Project** in PROVIS, or something outside the system?"
                : "Saya kurang mengerti maksud Anda. Apa yang dimaksud \"{$term}\" di sini? **Task (WBS)** di PROVIS kah? **Projek** di PROVIS kah? Atau hal lain di luar sistem?";
        } else {
            $content = $lang === 'en'
                ? 'I\'m not quite sure what you mean. Does your question refer to a **Task (WBS)**, a **Project**, or other work data inside the PROVIS system? Please clarify the context.'
                : 'Saya kurang mengerti maksud Anda. Apakah yang Anda maksud berkaitan dengan **Task (WBS)** di PROVIS, **Projek** di PROVIS, atau hal lain di luar sistem? Boleh diperjelas konteksnya ya.';
        }

        return [
            'content'                     => $content,
            'actions'                     => [],
            'pending_scope_clarification' => [
                'original_prompt' => $prompt,
                'ambiguous_term'  => $term,
                'language'        => $lang,
                'attempts'        => 1,
                'expires_at'      => Carbon::now()->addMinutes(10)->toIso8601String(),
            ],
            'resolved_intent'             => 'SCOPE_CLARIFICATION',
        ];
    }

    /**
     * Resolve the user's reply after being asked to clarify an ambiguous question.
     * - If clarified as PROVIS Task/Project/Feature -> answer immediately using live RBAC-scoped data!
     * - If clarified as personal/outside PROVIS (e.g. "pekerjaan rumah", "to do list pribadi") -> reject cleanly!
     */
    protected function continueScopeClarification(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $pending  = $sessionContext['pending_scope_clarification'] ?? [];
        $orig     = (string) ($pending['original_prompt'] ?? '');
        $lang     = (string) ($pending['language'] ?? $sessionContext['language'] ?? $lang);
        $lower    = mb_strtolower(trim($prompt));
        $origLow  = mb_strtolower($orig);

        // Clear clarification state in subsequent routing so we never loop
        $cleanContext = $sessionContext;
        $cleanContext['pending_scope_clarification'] = null;

        // 0. Cancel politely
        if (($tokenized['confirmation'] ?? null) === 'cancel' || preg_match('/^(batal|cancel|tidak\s+jadi|gak\s+jadi|ga\s+jadi)$/i', $lower)) {
            return [
                'content'                     => $lang === 'en' ? 'Okay, no problem! Let me know whenever you need help with PROVIS projects or tasks.' : 'Oke siap! Kalau ada yang mau dicek soal projek atau task di PROVIS, langsung tanya aja ya.',
                'actions'                     => [],
                'pending_scope_clarification' => null,
                'resolved_intent'             => 'CANCEL_PENDING_ACTION',
            ];
        }

        // 1. Explicitly clarified as OUT OF SCOPE (e.g., "pekerjaan rumah", "to do list pribadi", "tugas kuliah", "bukan di provis")
        $mentionsProvisChoice = (bool) preg_match('/\b(task|tasks|wbs|subtask|projek|proyek|project|provis|divisi|budget|anggaran|scurve|predecessor|outstanding|overdue)\b/i', $lower)
            || !empty($tokenized['matched_tasks'])
            || !empty($tokenized['matched_projects']);

        $explicitNonProvis = $this->tokenizer->isClearlyOutOfScope($prompt)
            || (bool) preg_match('/\b(pekerjaan\s+rumah|pr\b|to[\s-]?do\s*list|todolist|pribadi|kuliah|sekolah|kampus|rumah|keluarga|bukan\s+(?:task|projek|proyek|provis|keduanya)|di\s*luar\s+(?:provis|sistem)|lainnya|hal\s+lain|outside\s+(?:provis|system)|personal|homework)\b/i', $lower);

        if ($explicitNonProvis && !$mentionsProvisChoice) {
            return $this->outOfScopeResponse($lang);
        }

        // 2. User clarified "Task" (WBS task in PROVIS)
        if (!empty($tokenized['matched_tasks']) || preg_match('/\b(task|tasks|wbs|subtask|sub[\s-]?task)\b/i', $lower)) {
            // If user named a specific task, show its full detail & schedule
            if (!empty($tokenized['matched_tasks'])) {
                $res = $this->handleQueryTasks($tokenized, $user, $activeProjectId, $cleanContext, $lang);
                $res['pending_scope_clarification'] = null;
                return $res;
            }

            // If original question asked "kapan ... diselesaikan / selesai / deadline / jadwal", show task completion schedule!
            if (preg_match('/\b(kapan|selesai|diselesaikan|beres|kelar|deadline|jadwal|tenggat|when|due|finish)\b/i', $origLow)) {
                $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $cleanContext);
                if ($resolved['denied']) {
                    return $this->deniedProjectResponse($resolved['requested_id'], $lang);
                }
                $project = $resolved['project'];
                if ($project) {
                    $codeMap = $this->buildTaskCodeMap($project->id);
                    $tasksQuery = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
                        ->where('status', '!=', 'Completed')
                        ->where('progress', '<', 100)
                        ->orderBy('end', 'asc');

                    // Scope to worker's own division if worker has assigned division(s)
                    if ($user->isWorker()) {
                        $divIds = $user->getDivisionIds();
                        if (!empty($divIds)) {
                            $tasksQuery->where(function ($q) use ($divIds) {
                                $q->whereIn('divisions_id', $divIds)
                                  ->orWhereHas('divisions', fn($dq) => $dq->whereIn('divisions.id', $divIds));
                            });
                        }
                    }

                    $openTasks = $tasksQuery->take(8)->get();
                    $today     = Carbon::today('Asia/Jakarta');

                    if ($openTasks->isEmpty()) {
                        $content = $lang === 'en'
                            ? "🎉 All tasks within your scope in **{$project->title}** are already completed!"
                            : "🎉 Seluruh task pada cakupan Anda di proyek **{$project->title}** sudah selesai!";
                    } else {
                        $refs  = [];
                        $lines = [];
                        foreach ($openTasks as $idx => $t) {
                            $num    = $idx + 1;
                            $code   = $codeMap[(string) $t->id] ?? $t->id;
                            $endStr = $t->end ? Carbon::parse($t->end)->format('d M Y') : '—';
                            $tag    = '';
                            if ($t->end) {
                                $diff = (int) ceil($today->diffInDays(Carbon::parse($t->end)->startOfDay(), false));
                                $tag  = $diff < 0
                                    ? ($lang === 'en' ? ' (Overdue ' . abs($diff) . 'd)' : ' (Terlambat ' . abs($diff) . ' hari)')
                                    : ($lang === 'en' ? " ({$diff}d left)" : " (Sisa {$diff} hari)");
                            }
                            $prog    = round((float) ($t->progress ?? 0), 1);
                            $lines[] = "{$num}. `{$code}` **{$t->name}** — Target selesai: **{$endStr}**{$tag} · Progres: **{$prog}%** (`{$t->status}`)";
                            $refs[]  = ['index' => $num, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
                        }

                        $header = $lang === 'en'
                            ? "### 📅 Target Completion Dates for Tasks in {$project->title} (`#{$project->id}`)\n\n"
                            : "### 📅 Jadwal Target Penyelesaian Task — {$project->title} (`#{$project->id}`)\n\n";
                        $tip = $lang === 'en'
                            ? "\n\n> 💡 Say the task name or *\"Detail #1\"* to inspect a specific task."
                            : "\n\n> 💡 Sebutkan nama task atau ketik *\"Detail nomor 1\"* untuk melihat rincian task tertentu.";

                        return [
                            'content'                     => $header . implode("\n", $lines) . $tip,
                            'actions'                     => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                            'pending_scope_clarification' => null,
                            'resolved_intent'             => 'QUERY_TASKS',
                            'context_update'              => [
                                'project_id'       => $project->id,
                                'referenced_tasks' => $refs,
                            ],
                        ];
                    }

                    return [
                        'content'                     => $content,
                        'actions'                     => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                        'pending_scope_clarification' => null,
                        'resolved_intent'             => 'QUERY_TASKS',
                        'context_update'              => ['project_id' => $project->id],
                    ];
                }
            }

            $res = $this->handleQueryTasks($tokenized, $user, $activeProjectId, $cleanContext, $lang);
            $res['pending_scope_clarification'] = null;
            return $res;
        }

        // 3. User clarified "Projek / Project" in PROVIS
        if (!empty($tokenized['matched_projects']) || preg_match('/\b(projek|proyek|project)\b/i', $lower)) {
            $res = $this->handleProjectSummaryQuery($tokenized, $user, $activeProjectId, $cleanContext, $lang);
            $res['pending_scope_clarification'] = null;
            return $res;
        }

        // 4. User replied with another valid PROVIS question/signal or greeting/math -> route normally!
        if (
            $this->tokenizer->isGreetingOrSmalltalk($prompt)
            || $this->tokenizer->evaluateMathExpression($prompt) !== null
            || $this->tokenizer->hasProvisDomainSignal($prompt, $tokenized)
            || $this->hasAccessibleDbMatch($prompt, $user)
        ) {
            $res = $this->processNativeAgent($prompt, $tokenized, $user, $activeProjectId, $cleanContext);
            $res['pending_scope_clarification'] = null;
            return $res;
        }

        // 5. After being asked to clarify, reply STILL has no PROVIS context / drifts outside PROVIS -> reject cleanly!
        return $this->outOfScopeResponse($lang);
    }

    /**
     * Lightweight RBAC-scoped DB existence check to distinguish genuine PROVIS data lookups
     * (e.g. "blower industrial", "PR-2026-088") from out-of-scope chatter!
     */
    protected function hasAccessibleDbMatch(string $prompt, User $user): bool
    {
        $stop = [
            'apa', 'yang', 'ada', 'bisa', 'mana', 'saja', 'aja', 'dari', 'untuk', 'dengan', 'ini', 'itu',
            'berapa', 'tolong', 'cek', 'lihat', 'cari', 'carikan', 'info', 'data', 'buat', 'bikin', 'kasih',
            'tahu', 'tau', 'dong', 'nih', 'sih', 'ya', 'yah', 'bro', 'min', 'kapan', 'dimana', 'kenapa',
            'gimana', 'bagaimana', 'siapa', 'mau', 'saya', 'aku', 'kamu', 'anda', 'the', 'and', 'for', 'with',
            'what', 'how', 'when', 'where', 'who', 'can', 'help', 'please', 'find', 'search', 'about', 'task',
        ];
        $terms = array_values(array_filter(
            preg_split('/[^a-z0-9]+/i', mb_strtolower($prompt)) ?: [],
            fn($w) => strlen($w) >= 4 && !in_array($w, $stop, true)
        ));
        $terms = array_slice(array_values(array_unique($terms)), 0, 4);
        if (empty($terms)) {
            return false;
        }

        $accessibleIds = $this->getAccessibleProjectIds($user);
        if (!empty($accessibleIds)) {
            if (Project::whereIn('id', $accessibleIds)->where(function ($q) use ($terms) {
                foreach ($terms as $t) {
                    $q->orWhereRaw('LOWER(title) LIKE ?', ["%{$t}%"]);
                }
            })->exists()) {
                return true;
            }

            if (Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $accessibleIds))
                ->where(function ($q) use ($terms) {
                    foreach ($terms as $t) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$t}%"])
                          ->orWhereRaw('LOWER(vendor) LIKE ?', ["%{$t}%"]);
                    }
                })->exists()) {
                return true;
            }

            if ($this->canUserViewBudget($user) && BudgetEntry::whereIn('projects_id', $accessibleIds)
                ->where(function ($q) use ($terms) {
                    foreach ($terms as $t) {
                        $q->orWhereRaw('LOWER(nama_item) LIKE ?', ["%{$t}%"])
                          ->orWhereRaw('LOWER(referensi) LIKE ?', ["%{$t}%"]);
                    }
                })->exists()) {
                return true;
            }
        }

        if ($this->isSuperAdmin($user) && Company::where(function ($q) use ($terms) {
            foreach ($terms as $t) {
                $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$t}%"]);
            }
        })->exists()) {
            return true;
        }

        return false;
    }

    protected function handleGreetingOrSmalltalk(string $prompt, User $user, ?int $activeProjectId, string $lang): array
    {
        $lower = mb_strtolower(trim($prompt));
        $now   = Carbon::now('Asia/Jakarta');

        // 1. Identity / No-API / Local Execution Confirmation ("kamu pakai api apa?", "pakai gemini/gpt/qwen?", "jalan lokal?")
        if (preg_match('/(pakai\s+api|pake\s+api|use\s+api|tanpa\s+api|online|offline|jalan\s+lokal|local\s+engine|on-premise|gemini|chatgpt|gpt|qwen|claude|openai|ollama|model\s+ai|llm|connected\s+to|konek\s+ke)/i', $lower)) {
            $content = $lang === 'en'
                ? "🛡️ **100% Local & Zero External APIs — Guaranteed!**\n\n"
                  . "Hi **{$user->username}**! I'm **Provis Support Assistant**, running **100% locally (On-Premise)** inside your Laravel PHP backend and local MySQL database (`provis`).\n\n"
                  . "- **No External AI Models**: Zero connection to Gemini, ChatGPT, GPT, Qwen, Claude, Ollama, or any cloud API.\n"
                  . "- **H+7 Auto-Clean**: Chat history stays strictly in your local MySQL database and is automatically pruned 7 days (H+7) after each question."
                : "🛡️ **100% Lokal & Tanpa API Eksternal — Dijamin!**\n\n"
                  . "Halo **{$user->username}**! Aku **Provis Support Assistant**, jalan **100% lokal (On-Premise)** murni pakai Native PHP Laravel dan database MySQL lokal (`provis`) kamu.\n\n"
                  . "- **Tidak Konek ke AI Eksternal Manapun**: Sama sekali tidak pakai Gemini, ChatGPT, GPT, Qwen, Claude, Ollama, ataupun API online.\n"
                  . "- **Auto-Hapus H+7**: Riwayat chat hanya tersimpan di database lokal dan otomatis terhapus 7 hari (H+7) setelah ditanyakan.";

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GREETING_OR_SMALLTALK',
            ];
        }

        // 2. Current Time / Date Inquiry ("jam berapa sekarang?", "hari ini tanggal berapa?")
        if (preg_match('/(jam\s+berapa|tanggal\s+berapa|hari\s+apa\s+sekarang|hari\s+ini\s+tanggal|what\s+time\s+is\s+it|what\s+date\s+is\s+today|what\s+day\s+is\s+today)/i', $lower)) {
            $timeStr = $now->format('H:i:s') . ' WIB';
            $dateStr = $now->translatedFormat('l, d F Y');

            $content = $lang === 'en'
                ? "🕒 Right now on the local server it's **{$timeStr}** — **{$now->format('l, d F Y')}** (Asia/Jakarta). Want me to check which tasks are due today?"
                : "🕒 Sekarang pukul **{$timeStr}** — **{$dateStr}** (WIB). Mau sekalian aku cek daftar task yang jatuh tempo hari ini?";

            return [
                'content'         => $content,
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? "Open Today's Tasks" : 'Buka Task Hari Ini', 'url' => '/today-tasks']],
                'resolved_intent' => 'GREETING_OR_SMALLTALK',
            ];
        }

        // 3. Polite response for "Thank you / Makasih / Appreciation"
        if (preg_match('/^(terima\s*kasih|makasih|makasi|thanks|thank\s*you|thx|tq|mantap|keren|bagus|hebat|pintar|canggih|oke\s+makasih|ok\s+thanks|nice|great|awesome|cool|sip|siap|oke\s+bro|ok\s+bro|oke\s+min|oh\s+gitu|paham|mengerti|got\s+it)/i', $lower)) {
            $content = $lang === 'en'
                ? "You're welcome, **{$user->username}**! Just let me know anytime if you need help with projects, tasks, schedules, or access permissions."
                : "Sama-sama, **{$user->username}**! Kalau ada lagi yang mau dicek atau diubah—entah bikin projek, ubah durasi task, atau atur akses user—panggil aja kapan saja ya.";

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GREETING_OR_SMALLTALK',
            ];
        }

        // 3b. Playful greeting correction ("lho aku baru menyapa wkwk", "cuma nyapa", "menyapa balik")
        if (preg_match('/\b((?:baru|cuma|hanya|cm|cuman)\s+(?:menyapa|nyapa|sapa|tes|test|ngecek|halo)|(?:menyapa|nyapa|sapa|menyala)\s+balik|aku\s+kan\s+(?:baru\s+)?(?:nyapa|menyapa))\b/i', $lower)) {
            $content = $lang === 'en'
                ? "Haha sorry about that, **{$user->username}**! Hey there too! **Provis Support Assistant** is right here — what PROVIS project or task can I help you with today?"
                : "Haha maaf ya **{$user->username}**, tadi agak salah tangkap! Halo juga bro — **Provis Support Assistant** siap bantu nih! Ada urusan projek, task, jadwal, atau data PROVIS yang mau dicek sekarang?";

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GREETING_OR_SMALLTALK',
            ];
        }

        // 4. Explicit Capability Inquiry ("hai, ini bisa untuk apa saja ya?", "kamu bisa bantu apa aja?", "help")
        //    -> Show structured capabilities tailored to the user's role WITH complete ready-to-use prompt templates!
        if ($this->tokenizer->isCapabilityInquiry($prompt)) {
            if ($user->isWorker()) {
                $content = $lang === 'en'
                    ? "Hi **{$user->username}**! I'm **Provis Support Assistant** (100% On-Premise Local Engine).\n\n"
                      . "For your **Worker** role, I can help you with tasks in your assigned project(s):\n"
                      . "- **a. Check Your Project & WBS Tasks** (today's schedule, `Outstanding` PR items, task details, & predecessor blockers)\n"
                      . "- **b. Update Task Progress & Status** for tasks in your division (with safe confirmation before saving)\n"
                      . "- **c. PROVIS Guides & Help** (how `Outstanding`, evidence upload, and predecessors work)\n\n"
                      . "Example prompts you can try:\n"
                      . "- `\"Show tasks due today\"`\n"
                      . "- `\"Why is task [Task Name] locked?\"`\n"
                      . "- `\"Update progress of task [Task Name] to 50%\"`\n"
                      . "- `\"Mark task [Task Name] as Outstanding\"`"
                    : "Halo **{$user->username}**! Aku **Provis Support Assistant** (100% On-Premise lokal tanpa API eksternal).\n\n"
                      . "Sesuai role akun **Worker** kamu, aku bisa bantu seputar pekerjaan proyek yang ditugaskan kepadamu:\n"
                      . "- **a. Cek Task & Jadwal Proyekmu** (task hari ini, barang PR `Outstanding`, detail task, & diagnosa task terkunci predecessor)\n"
                      . "- **b. Update Progres & Status Task** khusus divisi kamu (dengan konfirmasi aman sebelum disimpan)\n"
                      . "- **c. Panduan Sistem PROVIS** (arti status `Outstanding`, aturan upload evidence, cara kerja predecessor `FS/SS`)\n\n"
                      . "Contoh prompt yang bisa langsung kamu ketik:\n"
                      . "- `\"Task apa saja yang jatuh tempo hari ini?\"`\n"
                      . "- `\"Kenapa task [Nama Task] terkunci?\"`\n"
                      . "- `\"Update progres task [Nama Task] jadi 50%\"`\n"
                      . "- `\"Ubah status task [Nama Task] jadi Outstanding\"`";

                return [
                    'content'         => $content,
                    'actions'         => [],
                    'resolved_intent' => 'GREETING_OR_SMALLTALK',
                ];
            }

            if ($lang === 'en') {
                $content = "Hi **{$user->username}**! I'm **Provis Support Assistant** (100% On-Premise Local Engine, zero external APIs).\n\n"
                    . "I can help you with many things in PROVIS:\n"
                    . "- **a. Create New Projects** (auto-fills 17 Default Master WBS Main Jobs or starts blank)\n"
                    . "- **b. Manage Task Schedules, Duration, Status (`Outstanding`), Progress & Predecessors**\n"
                    . "- **c. Manage Project User Access & Visibility** (grant/revoke view access, Private/Public)\n"
                    . "- **d. Live Analytics & Reports** (Projects, `Outstanding` PR items, Budget, Division Progress, S-Curve, Users/Companies, PDF reports, & local calculator)\n\n"
                    . "If you want to run a command right away, here are **ready-to-use prompt examples**:\n"
                    . "- **Create Project**: `\"Create a new project [Project Name] for company [Company Name] with duration [70 days / 3 months] using default template (17 tasks)\"`\n"
                    . "- **Change Task Duration**: `\"Change duration of task [Task Name / 1.1.2] to [14 days]\"`\n"
                    . "- **Manage Project Access**: `\"Grant access to project [Project Name] for user [Username]\"` or `\"Set project [Project Name] to Private\"`\n"
                    . "- **Update Task Status / Progress**: `\"Mark task [Task Name] as Outstanding\"` or `\"Update progress of task [Task Name] to 50%\"`\n\n"
                    . "💡 *Don't worry about memorizing exact wording!* If you miss a detail (like company name or duration), I'll just ask you for the missing part before confirming and executing. What would you like to try first?";
            } else {
                $content = "Halo **{$user->username}**! Aku **Provis Support Assistant** (100% On-Premise lokal tanpa API eksternal). Aku bisa bantu banyak hal di PROVIS, misalnya:\n\n"
                    . "- **a. Membuat Projek Baru** (bisa otomatis isi 17 Main Task default atau mulai dari kosong)\n"
                    . "- **b. Mengatur Task & Jadwal** (tambah task, ubah durasi/tanggal, ubah status termasuk `Outstanding`, update progres, & hubungkan predecessor `FS/SS`)\n"
                    . "- **c. Mengatur Manajemen Akses User Projek** (beri/cabut akses user agar bisa melihat projek, atau ubah status `Private`/`Public`)\n"
                    . "- **d. Cek Data & Analisa Live** (statistik sistem, daftar perusahaan/divisi/user, progres projek, barang PR `Outstanding`, budget, S-Curve, cetak PDF, sampai hitung-hitungan)\n\n"
                    . "Kalau kamu tertarik, kamu bisa menuliskan prompt lengkap dengan struktur seperti ini:\n"
                    . "- **Buat Projek**: `\"Tolong buatkan saya projek [Nama Projek] dengan nama perusahaan [Nama Perusahaan] yang berdurasi [70 hari / 3 bulan]. Untuk tasknya pakai default (17 task) ya\"`\n"
                    . "- **Ubah Durasi Task**: `\"Tolong ubah durasi task [Nama Task / 1.1.2] jadi [14 hari]\"`\n"
                    . "- **Atur Akses User Projek**: `\"Berikan akses projek [Nama Projek] ke user [Nama User]\"` atau `\"Ubah projek [Nama Projek] jadi Private\"`\n"
                    . "- **Ubah Status / Progres**: `\"Ubah status task [Nama Task] jadi Outstanding\"` atau `\"Update progres task [Nama Task] jadi 50%\"`\n\n"
                    . "💡 *Tapi santai aja, nggak wajib hafal formatnya!* Kalau ada info yang kurang (misal lupa sebut perusahaan atau durasinya), nanti aku tanyain kekurangannya dulu baru dieksekusi. Mau coba yang mana nih?";
            }

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GREETING_OR_SMALLTALK',
            ];
        }

        // 5. Casual Everyday Greeting / Test Ping ("halo tes bro", "halo bro", "pagi", "apa kabar")
        //    -> Short, friendly, natural human reply — NO giant robotic template wall!
        $accessibleIds = $this->getAccessibleProjectIds($user);
        $pId           = $activeProjectId ?: ($accessibleIds[0] ?? null);

        if ($this->isSuperAdmin($user)) {
            $totalUsers     = User::count();
            $totalCompanies = Company::count();
            $totalProjects  = Project::count();
            $liveStatusId   = "📡 *Status Sistem Lokal Aktif*: **{$totalProjects} projek**, **{$totalCompanies} perusahaan**, **{$totalUsers} user** (100% lokal tanpa API eksternal).";
            $liveStatusEn   = "📡 *Local System Status Online*: **{$totalProjects} projects**, **{$totalCompanies} companies**, **{$totalUsers} users** (100% local, zero external APIs).";
        } else {
            $projCount    = count($accessibleIds);
            $activeProj   = $pId ? Project::find($pId) : null;
            $activeNoteId = $activeProj ? " — projek aktif: **{$activeProj->title}** (**" . round((float) $activeProj->progress, 1) . "%**)" : '';
            $activeNoteEn = $activeProj ? " — active project: **{$activeProj->title}** (**" . round((float) $activeProj->progress, 1) . "%**)" : '';
            $liveStatusId = "📡 *Status Sistem Lokal Aktif*: **{$projCount} projek** dalam akses kamu{$activeNoteId}.";
            $liveStatusEn = "📡 *Local System Status Online*: **{$projCount} accessible projects**{$activeNoteEn}.";
        }

        if ($lang === 'en') {
            $content = "Hey **{$user->username}**! **Provis Support Assistant** here — loud and clear!\n\n"
                . "{$liveStatusEn}\n\n"
                . "What can I help you with today? You can ask me to check project progress, create a new project, adjust task durations, manage user access, or ask *\"what can you do?\"* to see prompt examples.";
        } else {
            $content = "Halo **{$user->username}**! **Provis Support Assistant** siap sedia nih!\n\n"
                . "{$liveStatusId}\n\n"
                . "Ada yang bisa aku bantu hari ini? Mau cek progres projek, bikin projek baru, ubah durasi/status task, atau atur akses user projek — langsung bilang aja pakai bahasa sehari-hari. *(Kalau mau lihat daftar fitur & contoh prompt lengkapnya, tinggal tanya \"ini bisa untuk apa saja ya?\")*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'resolved_intent' => 'GREETING_OR_SMALLTALK',
        ];
    }

    /**
     * Local Math & Percentage Calculator (100% Native PHP, no eval).
     */
    protected function handleCalculateMath(string $prompt, string $lang): array
    {
        $calc = $this->tokenizer->evaluateMathExpression($prompt);
        if (!$calc) {
            return [
                'content'         => $lang === 'en'
                    ? 'I could not parse that mathematical expression. Try formats like `"15% of 45000000"` or `"125000 + 350000 * 2"`.'
                    : 'Format perhitungan belum dapat dikenali. Coba gunakan format seperti `"15% dari 45 miliar"` atau `"125000 + 350000 * 2"`.',
                'actions'         => [],
                'resolved_intent' => 'CALCULATE_MATH',
            ];
        }

        $res = $calc['result'];
        $formatted = (floor($res) == $res)
            ? number_format($res, 0, ',', '.')
            : rtrim(rtrim(number_format($res, 4, ',', '.'), '0'), ',');

        $isCurrency = (bool) preg_match('/\b(rp|rupiah|idr|budget|anggaran|biaya|harga|miliar|milyar|juta|ribu)\b/i', $prompt);
        $rpNote = $isCurrency ? " (**{$this->formatRupiah($res)}**)" : ($res >= 1000 ? " (*atau jika dalam Rupiah: {$this->formatRupiah($res)}*)" : '');

        if ($lang === 'en') {
            $content = "🧮 **Local Calculation Result**\n\n"
                . "- **Expression**: `{$calc['expression']}`\n"
                . "- **Result**: **{$formatted}**{$rpNote}";
        } else {
            $content = "🧮 **Hasil Perhitungan Kalkulator Lokal**\n\n"
                . "- **Perhitungan**: `{$calc['expression']}`\n"
                . "- **Hasil**: **{$formatted}**{$rpNote}";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'resolved_intent' => 'CALCULATE_MATH',
        ];
    }

    protected function handleKnowledgeBase(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, [], false);
        $projectId = $resolved['project']?->id ?? $activeProjectId;

        $kbResults = $this->knowledgeBase->searchMultiple($prompt, $lang, $projectId, 2);
        if (!empty($kbResults)) {
            if (count($kbResults) === 1) {
                return [
                    'content'         => $kbResults[0]['content'],
                    'actions'         => $kbResults[0]['actions'],
                    'resolved_intent' => 'KNOWLEDGE_BASE',
                    'context_update'  => [
                        'kb_topic' => $kbResults[0]['id'],
                    ],
                ];
            }

            // Multiple topics asked in one sentence (e.g. "ubah durasi task DAN manajemen user projek")
            $intro = $lang === 'en'
                ? "Sure! Here are the guides and ready-to-use prompt examples for both topics you asked about:\n\n"
                : "Siap! Berikut panduan sekaligus contoh prompt yang bisa langsung kamu pakai untuk kedua hal tersebut:\n\n";

            $blocks  = [];
            $actions = [];
            $seenUrl = [];
            foreach ($kbResults as $res) {
                $blocks[] = $res['content'];
                foreach ($res['actions'] as $act) {
                    if (!isset($seenUrl[$act['url']])) {
                        $seenUrl[$act['url']] = true;
                        $actions[] = $act;
                    }
                }
            }

            return [
                'content'         => $intro . implode("\n\n---\n\n", $blocks),
                'actions'         => array_slice($actions, 0, 4),
                'resolved_intent' => 'KNOWLEDGE_BASE',
                'context_update'  => [
                    'kb_topic' => $kbResults[0]['id'],
                ],
            ];
        }

        // If user asked a question not in KB, ask warmly what specific feature they want to do
        $content = $lang === 'en'
            ? "Could you tell me a bit more specifically what feature you'd like to do? For example, are you looking to **create a project**, **change task duration/predecessors**, **manage user access to a project**, or understand **`Outstanding` status / S-Curve**? I'll give you the exact steps and prompt template!"
            : "Boleh cerita lebih spesifik fitur apa yang lagi mau kamu pakai? Misalnya mau **buat projek baru**, **ubah durasi/jadwal task**, **atur manajemen user yang bisa melihat projek**, **atur predecessor**, atau tanya soal **status `Outstanding` & S-Curve**? Nanti aku kasih langkah plus contoh prompt-nya langsung!";

        return [
            'content'         => $content,
            'actions'         => [],
            'resolved_intent' => 'KNOWLEDGE_BASE',
        ];
    }

    /**
     * System-Wide Overview Handler (SuperAdmin for global system stats; strictly RBAC-scoped for other roles!).
     */
    protected function handleSystemOverviewQuery(User $user, string $lang, string $prompt = ''): array
    {
        $now = Carbon::now('Asia/Jakarta');

        // Workers CANNOT query global PROVIS system overview/statistics
        if ($user->isWorker()) {
            return $this->roleRestrictedResponse(
                $user,
                'Statistik dan ringkasan sistem PROVIS secara keseluruhan hanya dapat diakses oleh **SuperAdministrator**. Sebagai **Worker**, Anda hanya dapat menanyakan detail task, jadwal, atau progres pada proyek yang ditugaskan kepada Anda.',
                'Global PROVIS system overview and statistics are restricted to **SuperAdministrator** only. As a **Worker**, you can only inspect tasks, schedules, and progress within projects assigned to you.',
                $lang
            );
        }

        // Non-SuperAdmin asking explicitly about global system-wide PROVIS stats
        if (!$this->isSuperAdmin($user) && $this->tokenizer->isSystemWideScopePrompt($prompt) && !($user->isAdminUtama() && $user->getDataScope() === 'all')) {
            return $this->roleRestrictedResponse(
                $user,
                'Statistik dan ringkasan global seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**. Anda dapat menanyakan ringkasan proyek pada cakupan akses akun Anda sendiri.',
                'Global system-wide PROVIS overview is restricted to **SuperAdministrator** only. You may query summaries for projects within your own access scope.',
                $lang
            );
        }

        if ($this->isSuperAdmin($user)) {
            $totalUsers     = User::count();
            $superAdmins    = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->count();
            $admins         = User::whereHas('role', fn($q) => $q->whereIn('name', ['admin_utama', 'admin_progres']))->count();
            $pics           = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->count();
            $workers        = User::whereHas('role', fn($q) => $q->where('name', 'worker'))->count();
            $betaTesters    = User::where('is_ai_beta_tester', true)->count();

            $totalCompanies = Company::count();
            $companyNames   = Company::orderBy('name')->pluck('name')->implode(', ');
            $totalDivisions = Division::count();
            $divisionNames  = Division::orderBy('divisi')->pluck('divisi')->implode(', ');

            $projects       = Project::all();
            $totalProjects  = $projects->count();
            $avgProgress    = $totalProjects > 0 ? round((float) $projects->avg('progress'), 2) : 0;
            $completedProj  = $projects->filter(fn($p) => (float) $p->progress >= 100 || strtolower($p->status ?? '') === 'completed')->count();

            $allTasks       = Wbs::all(['id', 'status', 'progress', 'is_completed', 'end']);
            $totalTasks     = $allTasks->count();
            $doneTasks      = $allTasks->filter(fn($t) => $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100)->count();
            $outTasks       = $allTasks->where('status', 'Outstanding')->count();
            $overdueTasks   = $allTasks->filter(fn($t) => !$t->is_completed && $t->status !== 'Completed' && (float) $t->progress < 100 && $t->end && Carbon::parse($t->end)->lt($now))->count();

            $totalBudget    = (float) BudgetEntry::sum('harga_total');

            if ($lang === 'en') {
                $content = "### 🛡️ PROVIS Global System Overview (Live Database)\n\n"
                    . "#### 👥 Users & Role Breakdown (**{$totalUsers} Total Users**)\n"
                    . "- **SuperAdmins**: **{$superAdmins}** | **Admins**: **{$admins}** | **PICs**: **{$pics}** | **Workers**: **{$workers}**\n"
                    . "- **AI Beta Testers**: **{$betaTesters}** user(s)\n\n"
                    . "#### 🏢 Organizations (**{$totalCompanies} Companies** · **{$totalDivisions} Divisions**)\n"
                    . "- **Companies**: {$companyNames}\n"
                    . "- **Divisions**: {$divisionNames}\n\n"
                    . "#### 📁 Projects & 3-Tier WBS (**{$totalProjects} Projects** · **{$totalTasks} WBS Tasks**)\n"
                    . "- **Average Portfolio Progress**: **{$avgProgress}%** ({$completedProj}/{$totalProjects} projects completed)\n"
                    . "- **Tasks Status**: **{$doneTasks}** Completed · **{$outTasks}** `Outstanding` (PR) · **{$overdueTasks}** Overdue\n"
                    . "- **Total Realized Budget Entries**: **{$this->formatRupiah($totalBudget)}**\n\n"
                    . "> 💡 Ask me *\"Who are the PICs?\"*, *\"List all companies\"*, *\"Which project has the highest progress?\"*, or *\"Recap overdue projects\"* for details.";
            } else {
                $content = "### 🛡️ Ringkasan Statistik Sistem PROVIS (Live Database Lokal)\n\n"
                    . "#### 👥 Pengguna & Distribusi Role (**{$totalUsers} Total Users**)\n"
                    . "- **SuperAdmin**: **{$superAdmins}** | **Admins**: **{$admins}** | **PICs**: **{$pics}** | **Workers**: **{$workers}**\n"
                    . "- **AI Beta Tester Aktif**: **{$betaTesters}** pengguna\n\n"
                    . "#### 🏢 Organisasi (**{$totalCompanies} Perusahaan** · **{$totalDivisions} Divisi**)\n"
                    . "- **Perusahaan**: {$companyNames}\n"
                    . "- **Divisi**: {$divisionNames}\n\n"
                    . "#### 📁 Portofolio Proyek & WBS (**{$totalProjects} Proyek** · **{$totalTasks} Task WBS**)\n"
                    . "- **Rata-rata Progres Proyek**: **{$avgProgress}%** ({$completedProj} dari {$totalProjects} proyek selesai)\n"
                    . "- **Rincian Task WBS**: **{$doneTasks}** Selesai · **{$outTasks}** `Outstanding` (Barang PR) · **{$overdueTasks}** Overdue\n"
                    . "- **Total Realisasi Pengeluaran Budget**: **{$this->formatRupiah($totalBudget)}**\n\n"
                    . "> 💡 Anda bisa lanjut bertanya: *\"Siapa saja PIC?\"*, *\"Daftar perusahaan\"*, *\"Proyek mana yang paling tinggi progresnya?\"*, atau *\"Rekap proyek terlambat\"*.";
            }

            return [
                'content' => $content,
                'actions' => [
                    ['type' => 'link', 'label' => $lang === 'en' ? 'SuperAdmin Dashboard' : 'Dashboard SuperAdmin', 'url' => '/admin'],
                    ['type' => 'link', 'label' => $lang === 'en' ? 'All Projects' : 'Semua Proyek', 'url' => '/admin/projects'],
                ],
                'resolved_intent' => 'QUERY_SYSTEM_OVERVIEW',
            ];
        }

        // Scoped overview for PIC / Admin / Worker
        $projects      = $this->getAccessibleProjectsQuery($user)->with('company')->get();
        $projIds       = $projects->pluck('id')->all();
        $totalProjects = $projects->count();
        $avgProgress   = $totalProjects > 0 ? round((float) $projects->avg('progress'), 2) : 0;

        $tasks        = !empty($projIds) ? Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $projIds))->get(['id', 'status', 'progress', 'is_completed', 'end']) : collect();
        $totalTasks   = $tasks->count();
        $doneTasks    = $tasks->filter(fn($t) => $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100)->count();
        $outTasks     = $tasks->where('status', 'Outstanding')->count();
        $overdueTasks = $tasks->filter(fn($t) => !$t->is_completed && $t->status !== 'Completed' && (float) $t->progress < 100 && $t->end && Carbon::parse($t->end)->lt($now))->count();

        $roleName = $user->role?->name ?? 'worker';
        $divName  = $user->division?->divisi ?? 'General';

        $content = $lang === 'en'
            ? "### 📊 Your PROVIS Workspace Overview (**{$user->username}** — `{$roleName}`)\n\n"
              . "- **Division**: {$divName}\n"
              . "- **Accessible Projects**: **{$totalProjects} projects** (Average Progress: **{$avgProgress}%**)\n"
              . "- **Total WBS Tasks in Scope**: **{$totalTasks} tasks** (**{$doneTasks}** Completed · **{$outTasks}** `Outstanding` PR · **{$overdueTasks}** Overdue)"
            : "### 📊 Ringkasan Ruang Kerja PROVIS Anda (**{$user->username}** — `{$roleName}`)\n\n"
              . "- **Divisi**: {$divName}\n"
              . "- **Proyek yang Dapat Diakses**: **{$totalProjects} proyek** (Rata-rata Progres: **{$avgProgress}%**)\n"
              . "- **Total Task WBS**: **{$totalTasks} task** (**{$doneTasks}** Selesai · **{$outTasks}** `Outstanding` PR · **{$overdueTasks}** Overdue)";

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Project List' : 'Buka Daftar Proyek', 'url' => '/projectlistpage']],
            'resolved_intent' => 'QUERY_SYSTEM_OVERVIEW',
        ];
    }

    /**
     * Companies & Multi-Tenant Portfolio Query Handler (Strictly RBAC Scoped!).
     */
    protected function handleCompaniesQuery(array $tokenized, User $user, string $lang, string $prompt = ''): array
    {
        if ($user->isWorker() || $user->isAdminProgres()) {
            return $this->roleRestrictedResponse(
                $user,
                'Daftar perusahaan dan statistik lintas perusahaan di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator** / Manajemen.',
                'Company directories and cross-company statistics in PROVIS are restricted to **SuperAdministrator** / Management.',
                $lang
            );
        }

        if (!$this->isSuperAdmin($user) && ($this->tokenizer->isSystemWideScopePrompt($prompt) || preg_match('/\b(semua\s+perusahaan|berapa\s+(?:jumlah\s+|total\s+)?(?:perusahaan|pt)|daftar\s+perusahaan|perusahaan\s+apa\s+(?:saja|aja))\b/i', mb_strtolower($prompt)))) {
            return $this->roleRestrictedResponse(
                $user,
                'Daftar seluruh perusahaan yang terdaftar di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                'Listing all registered companies across PROVIS is restricted to **SuperAdministrator** only.',
                $lang
            );
        }

        $query = Company::with(['projects.manager', 'users.role', 'users.division']);
        if (!$this->isSuperAdmin($user)) {
            $companyIds = $user->getCompanyIds();
            if (empty($companyIds)) {
                return [
                    'content'         => $lang === 'en' ? 'No companies found for your account scope.' : 'Tidak ditemukan data perusahaan pada cakupan akun Anda.',
                    'actions'         => [],
                    'resolved_intent' => 'QUERY_COMPANIES',
                ];
            }
            $query->whereIn('id', $companyIds);
        }

        // If user asked about a specific company name that isn't in DB yet, tell them clearly instead of dumping all companies!
        $matchedComp = $tokenized['matched_companies'][0] ?? null;
        if (!$matchedComp && !empty($tokenized['requested_company_name'])) {
            return $this->companyNotFoundResponse($tokenized['requested_company_name'], $user, $lang);
        }

        // If user asked about ONE specific matched company (e.g. "detail PT Karabha Wiratama"), drill down deeply!
        $matchedComp = $tokenized['matched_companies'][0] ?? null;
        if ($matchedComp && !preg_match('/\b(semua\s+perusahaan|daftar\s+perusahaan|perusahaan\s+apa\s+(?:saja|aja)|all\s+companies)\b/i', mb_strtolower($prompt))) {
            $query->where('id', (int) $matchedComp['id']);
        }

        $companies = $query->orderBy('id')->get();
        if ($companies->isEmpty()) {
            return [
                'content'         => $lang === 'en' ? 'No companies found for your account scope.' : 'Tidak ditemukan data perusahaan pada cakupan akun Anda.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_COMPANIES',
            ];
        }

        $accessibleProjIds = $this->getAccessibleProjectIds($user);

        // Deep single-company executive breakdown when zoomed into 1 specific company
        if ($matchedComp && $companies->count() === 1) {
            $comp = $companies->first();
            $visibleProjects = $this->isSuperAdmin($user)
                ? $comp->projects
                : $comp->projects->filter(fn($p) => in_array((int) $p->id, $accessibleProjIds, true));

            // Include users assigned via either direct `companies_id` OR pivot `company_user`
            $compUsers = User::with(['role', 'division'])
                ->where(function ($q) use ($comp) {
                    $q->where('companies_id', $comp->id)
                      ->orWhereHas('companies', fn($cq) => $cq->where('companies.id', $comp->id));
                })
                ->get();

            $picCount    = $compUsers->filter(fn($u) => ($u->role?->name ?? '') === 'pic')->count();
            $workerCount = $compUsers->filter(fn($u) => ($u->role?->name ?? '') === 'worker')->count();
            $adminCount  = $compUsers->filter(fn($u) => in_array($u->role?->name ?? '', ['SuperAdmin', 'admin_utama', 'admin_progres'], true))->count();

            $pIds  = $visibleProjects->pluck('id')->all();
            $now   = Carbon::now('Asia/Jakarta');
            $tasks = !empty($pIds)
                ? Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))->get(['id', 'status', 'progress', 'is_completed', 'end'])
                : collect();
            $doneTasks = $tasks->filter(fn($t) => $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100)->count();
            $outTasks  = $tasks->where('status', 'Outstanding')->count();
            $ovTasks   = $tasks->filter(fn($t) => !$t->is_completed && $t->status !== 'Completed' && (float) $t->progress < 100 && $t->end && Carbon::parse($t->end)->lt($now))->count();

            $avgProg = $visibleProjects->isNotEmpty() ? round((float) $visibleProjects->avg('progress'), 1) : 0;
            $pLines  = $visibleProjects->values()->map(function ($p, $i) {
                $endStr = $p->end ? Carbon::parse($p->end)->format('d M Y') : '—';
                $pic    = $p->manager?->username ?? '—';
                return ($i + 1) . ". **{$p->title}** (`#{$p->id}`) — **" . round((float) ($p->progress ?? 0), 1) . "%** (`{$p->status}` · PIC: *{$pic}* · Target: {$endStr})";
            })->all();

            $budgetLine = '';
            if ($this->canUserViewBudget($user) && !empty($pIds)) {
                $spent = (float) BudgetEntry::whereIn('projects_id', $pIds)->sum('harga_total');
                $budgetLine = $lang === 'en'
                    ? "\n- **Total Realized Budget**: **{$this->formatRupiah($spent)}**"
                    : "\n- **Total Realisasi Budget**: **{$this->formatRupiah($spent)}**";
            }

            if ($lang === 'en') {
                $content = "### 🏢 Company Deep Analysis: {$comp->name} (`ID #{$comp->id}`)\n\n"
                    . "- **Registered Accounts**: **{$compUsers->count()} users** (**{$picCount}** PIC · **{$workerCount}** Workers · **{$adminCount}** Admins)\n"
                    . "- **Projects**: **{$visibleProjects->count()} project(s)** (Average Progress: **{$avgProg}%**)\n"
                    . "- **Total WBS Tasks**: **{$tasks->count()} tasks** (**{$doneTasks}** Completed · **{$outTasks}** `Outstanding` · **{$ovTasks}** Overdue)"
                    . $budgetLine . "\n\n"
                    . "**Projects under {$comp->name}:**\n"
                    . (!empty($pLines) ? implode("\n", $pLines) : '*No projects recorded yet.*');
            } else {
                $content = "### 🏢 Analisis Mendalam Perusahaan: {$comp->name} (`ID #{$comp->id}`)\n\n"
                    . "- **Total Akun / Karyawan**: **{$compUsers->count()} akun** (**{$picCount}** PIC · **{$workerCount}** Worker · **{$adminCount}** Admin)\n"
                    . "- **Jumlah Proyek**: **{$visibleProjects->count()} proyek** (Rata-rata Progres: **{$avgProg}%**)\n"
                    . "- **Total Task WBS**: **{$tasks->count()} task** (**{$doneTasks}** Selesai · **{$outTasks}** `Outstanding` PR · **{$ovTasks}** Overdue)"
                    . $budgetLine . "\n\n"
                    . "**Daftar Proyek di {$comp->name}:**\n"
                    . (!empty($pLines) ? implode("\n", $pLines) : '*Belum ada proyek yang tercatat.*');
            }

            $actions = $this->isSuperAdmin($user)
                ? [['type' => 'link', 'label' => $lang === 'en' ? 'Manage Companies' : 'Kelola Perusahaan', 'url' => '/admin/companies']]
                : [];

            return [
                'content'         => $content,
                'actions'         => $actions,
                'resolved_intent' => 'QUERY_COMPANIES',
            ];
        }
        $lines = [];
        foreach ($companies as $idx => $comp) {
            $num = $idx + 1;
            $visibleProjects = $this->isSuperAdmin($user)
                ? $comp->projects
                : $comp->projects->filter(fn($p) => in_array((int) $p->id, $accessibleProjIds, true));

            $projCount = $visibleProjects->count();
            $userCount = $comp->users->count();
            $avgProg   = $projCount > 0 ? round((float) $visibleProjects->avg('progress'), 1) : 0;

            $projTitles = $visibleProjects->map(fn($p) => "*{$p->title}* (**" . round((float) $p->progress, 1) . "%**)")->take(5)->implode(', ');
            $projNote   = $projTitles ? "\n   - " . ($lang === 'en' ? 'Projects' : 'Daftar Proyek') . ": {$projTitles}" : '';

            $lines[] = "{$num}. 🏢 **{$comp->name}** (`ID #{$comp->id}`)\n"
                . "   - " . ($lang === 'en' ? "Projects: **{$projCount}** (Avg Progress: **{$avgProg}%**) | Registered Users: **{$userCount}**" : "Jumlah Proyek: **{$projCount} proyek** (Rata-rata Progres: **{$avgProg}%**) | Pengguna: **{$userCount} user**")
                . $projNote;
        }

        $header = $lang === 'en'
            ? "### 🏢 Registered Companies in PROVIS ({$companies->count()} Companies)\n\n"
            : "### 🏢 Daftar Perusahaan Terdaftar di PROVIS ({$companies->count()} Perusahaan)\n\n";

        $actions = [];
        if ($this->isSuperAdmin($user)) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Manage Companies' : 'Kelola Perusahaan', 'url' => '/admin/companies'];
        }

        return [
            'content'         => $header . implode("\n\n", $lines),
            'actions'         => $actions,
            'resolved_intent' => 'QUERY_COMPANIES',
        ];
    }

    /**
     * Divisions Directory & Workload Query Handler (Strictly RBAC Scoped!).
     */
    protected function handleDivisionsQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang,
        string $prompt = ''
    ): array {
        if ($user->isWorker()) {
            return $this->roleRestrictedResponse(
                $user,
                'Direktori seluruh divisi dan statistik personel di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator** / Manajemen. Sebagai **Worker**, Anda hanya dapat memeriksa pekerjaan pada proyek dan divisi yang ditugaskan kepada Anda.',
                'System-wide divisions directory and personnel statistics are restricted to **SuperAdministrator** / Management. As a **Worker**, you can only inspect tasks in your assigned project and division.',
                $lang
            );
        }

        if (!$this->isSuperAdmin($user) && $this->tokenizer->isSystemWideScopePrompt($prompt)) {
            return $this->roleRestrictedResponse(
                $user,
                'Daftar dan statistik seluruh divisi secara global di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                'Global system-wide divisions directory across PROVIS is restricted to **SuperAdministrator** only.',
                $lang
            );
        }

        $companyIds = $user->getCompanyIds();
        $divisions  = $this->isSuperAdmin($user)
            ? Division::withCount('users')->orderBy('id')->get()
            : Division::withCount(['users' => fn($q) => $q->whereIn('companies_id', !empty($companyIds) ? $companyIds : [-1])])->orderBy('id')->get();
        if ($divisions->isEmpty()) {
            return [
                'content'         => $lang === 'en' ? 'No divisions are registered in the system.' : 'Belum ada data divisi yang terdaftar di sistem.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_DIVISIONS',
            ];
        }

        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        $project  = $resolved['project'];

        $taskCountsByDiv = [];
        if ($project) {
            $projectTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
                ->with(['division', 'divisions'])
                ->get();

            foreach ($projectTasks as $t) {
                $dIds = $t->divisions->pluck('id')->map(fn($id) => (int) $id)->all();
                if ($t->divisions_id) {
                    $dIds[] = (int) $t->divisions_id;
                }
                foreach (array_unique($dIds) as $dId) {
                    $taskCountsByDiv[$dId] = ($taskCountsByDiv[$dId] ?? 0) + 1;
                }
            }
        }

        $lines = [];
        foreach ($divisions as $idx => $div) {
            $num       = $idx + 1;
            $uCount    = (int) $div->users_count;
            $tCount    = $taskCountsByDiv[(int) $div->id] ?? 0;
            $projBadge = $project
                ? ($lang === 'en' ? " | Tasks in *{$project->title}*: **{$tCount}**" : " | Task di *{$project->title}*: **{$tCount} task**")
                : '';

            $lines[] = "{$num}. **{$div->divisi}** — **{$uCount}** " . ($lang === 'en' ? 'members' : 'personel') . $projBadge;
        }

        $header = $lang === 'en'
            ? "### 🗂️ PROVIS Divisions Directory ({$divisions->count()} Divisions)\n\n"
            : "### 🗂️ Daftar Divisi di Sistem PROVIS ({$divisions->count()} Divisi)\n\n";

        $tip = $lang === 'en'
            ? "\n\n> 💡 Ask *\"Division progress\"* or *\"Show tasks of division {$divisions->first()->divisi}\"* to inspect specific division workloads."
            : "\n\n> 💡 Ketik *\"Progres per divisi\"* atau *\"Tampilkan task divisi {$divisions->first()->divisi}\"* untuk melihat rincian pekerjaan divisi tersebut.";

        $actions = [];
        if ($this->isSuperAdmin($user)) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Manage Divisions' : 'Kelola Divisi', 'url' => '/admin/divisions'];
        }
        if ($project) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Division Progress' : 'Progres Divisi', 'url' => "/projects/{$project->id}/division-progress"];
        }

        return [
            'content'         => $header . implode("\n", $lines) . $tip,
            'actions'         => $actions,
            'resolved_intent' => 'QUERY_DIVISIONS',
        ];
    }

    /**
     * Master WBS Project Templates Query Handler (SuperAdmin & PIC Only!).
     */
    protected function handleTemplatesQuery(User $user, string $lang): array
    {
        if (!$this->isSuperAdmin($user) && !$user->isPic()) {
            return $this->roleRestrictedResponse(
                $user,
                'Data Master WBS Templates hanya dapat diakses oleh **SuperAdministrator** atau **PIC** untuk keperluan setup proyek.',
                'Master WBS Templates are restricted to **SuperAdministrator** or **PIC** for project setup.',
                $lang
            );
        }

        $templates = \App\Models\ProjectTemplate::with(['mainTasks.subTasks'])->orderByDesc('is_default')->orderBy('id')->get();
        if ($templates->isEmpty()) {
            return [
                'content'         => $lang === 'en' ? 'No WBS templates are currently stored in the system.' : 'Belum ada Master WBS Template yang tersimpan di sistem.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_TEMPLATES',
            ];
        }

        $lines = [];
        foreach ($templates as $idx => $tpl) {
            $num       = $idx + 1;
            $mainCount = $tpl->mainTasks->count();
            $subCount  = $tpl->mainTasks->sum(fn($m) => $m->subTasks->count());
            $defBadge  = $tpl->is_default ? ($lang === 'en' ? ' ⭐ *(Default Template)*' : ' ⭐ *(Template Default)*') : '';
            $sampleJobs = $tpl->mainTasks->take(4)->pluck('name')->implode(', ');

            $lines[] = "{$num}. 📋 **{$tpl->name}**{$defBadge}\n"
                . "   - " . ($lang === 'en' ? "Structure: **{$mainCount} Main Jobs** & **{$subCount} Sub Tasks**" : "Struktur: **{$mainCount} Main Job** & **{$subCount} Sub Task**")
                . ($sampleJobs ? "\n   - " . ($lang === 'en' ? 'Main Jobs Preview' : 'Contoh Main Job') . ": _{$sampleJobs}_" : '');
        }

        $header = $lang === 'en'
            ? "### 📐 Master 3-Tier WBS Templates ({$templates->count()} Templates)\n\n"
            : "### 📐 Daftar Master WBS Template ({$templates->count()} Template)\n\n";

        $actions = [];
        if ($this->isSuperAdmin($user)) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Open WBS Templates' : 'Buka WBS Templates', 'url' => '/admin/templates'];
        }

        return [
            'content'         => $header . implode("\n\n", $lines),
            'actions'         => $actions,
            'resolved_intent' => 'QUERY_TEMPLATES',
        ];
    }

    /**
     * 3-Tier WBS Hierarchy (Main Job -> Sub Task -> Task) Query Handler.
     */
    protected function handleWbsStructureQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found to inspect WBS structure.' : 'Tidak ditemukan proyek yang dapat diakses untuk melihat struktur WBS.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_WBS_STRUCTURE',
            ];
        }

        $mainJobs = MainWbs::where('projects_id', $project->id)
            ->orderBy('order_index')
            ->orderBy('id')
            ->with([
                'subWbs' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
                'subWbs.wbsTasks' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
            ])
            ->get();

        if ($mainJobs->isEmpty()) {
            return [
                'content'         => $lang === 'en'
                    ? "Project **{$project->title}** does not have any Main Jobs or WBS structure yet."
                    : "Proyek **{$project->title}** belum memiliki struktur Main Job / WBS.",
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                'resolved_intent' => 'QUERY_WBS_STRUCTURE',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $totalSub  = 0;
        $totalLeaf = 0;
        $lines     = [];

        foreach ($mainJobs as $mIdx => $mj) {
            $mCode    = $mIdx + 1;
            $subCount = $mj->subWbs->count();
            $tCount   = $mj->subWbs->sum(fn($s) => $s->wbsTasks->count());
            $totalSub  += $subCount;
            $totalLeaf += $tCount;

            $weight = round((float) ($mj->percentage ?? 0), 1);
            $prog   = round((float) ($mj->progress ?? 0), 1);
            $status = $mj->status ?? 'Open';

            $subPreview = $mj->subWbs->take(3)->map(function ($sub, $sIdx) use ($mCode) {
                $sCode = "{$mCode}." . ($sIdx + 1);
                $sProg = round((float) ($sub->progress ?? 0), 1);
                return "`{$sCode}` {$sub->name} (**{$sProg}%**)";
            })->implode(' · ');

            $extraSub = $subCount > 3 ? ($lang === 'en' ? ' +more' : ' +lainnya') : '';

            $lines[] = "**{$mCode}. {$mj->name}**\n"
                . "   - " . ($lang === 'en' ? 'Weight' : 'Bobot') . ": **{$weight}%** | "
                . ($lang === 'en' ? 'Progress' : 'Progres') . ": **{$prog}%** (`{$status}`) | "
                . "{$subCount} Sub Tasks ({$tCount} Tasks)"
                . ($subPreview ? "\n   - Sub Tasks: {$subPreview}{$extraSub}" : '');
        }

        if ($lang === 'en') {
            $header = "### 🌳 3-Tier WBS Structure: {$project->title} (`#{$project->id}`)\n\n"
                . "Summary: **{$mainJobs->count()} Main Jobs** → **{$totalSub} Sub Tasks** → **{$totalLeaf} Operational Tasks**\n\n";
        } else {
            $header = "### 🌳 Struktur WBS 3-Tier: {$project->title} (`#{$project->id}`)\n\n"
                . "Total Hierarki: **{$mainJobs->count()} Main Job** → **{$totalSub} Sub Task** → **{$totalLeaf} Task Operasional**\n\n";
        }

        return [
            'content' => $header . implode("\n\n", $lines),
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Task Management' : 'Buka Task Management', 'url' => "/tasks?project_id={$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_WBS_STRUCTURE',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    // =========================================================================
    // READ & ANALYTICAL HANDLERS
    // =========================================================================

    protected function handleListProjects(User $user, string $lang, string $prompt = '', array $tokenized = []): array
    {
        $lower          = mb_strtolower($prompt);
        $asksLowest     = (bool) preg_match('/\b(paling\s+(?:rendah|lambat|kecil|buruk|jelek)|terendah|terlambat\s+progres|terburuk|terjelek|buruk|lowest|least\s+progress|slowest|worst)\b/i', $lower);
        $asksHighest    = (bool) preg_match('/\b(paling\s+(?:tinggi|cepat|bagus|baik|besar)|tertinggi|tercepat|terbaik|highest|most\s+progress|top\s+project|best)\b/i', $lower);
        $asksSystemWide = $this->tokenizer->isSystemWideScopePrompt($prompt);
        $asksMyOwn      = (bool) preg_match('/\b(proyek\s+saya|projek\s+saya|proyekku|projekku|yang\s+ditugaskan|yang\s+bisa\s+saya\s+akses|yang\s+dapat\s+saya\s+akses|my\s+projects?|assigned\s+to\s+me)\b/i', $lower);
        $matchedComp    = $tokenized['matched_companies'][0] ?? null;

        // STRICT RBAC: Worker CANNOT query global project counts, all system projects, or best/worst progress rankings!
        if ($user->isWorker() && ($asksSystemWide || $asksHighest || $asksLowest || $matchedComp || !$asksMyOwn)) {
            if ($asksHighest || $asksLowest) {
                return $this->roleRestrictedResponse(
                    $user,
                    'Perbandingan dan peringkat progres proyek terbaik maupun terburuk di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**. Sebagai **Worker**, Anda hanya dapat memantau task dan jadwal pada proyek yang ditugaskan kepada Anda.',
                    'Comparing and ranking best/worst project progress across PROVIS is restricted to **SuperAdministrator** only. As a **Worker**, you can only inspect tasks and schedules in projects assigned to you.',
                    $lang
                );
            }

            return $this->roleRestrictedResponse(
                $user,
                'Informasi jumlah total dan daftar seluruh proyek di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**. Sebagai **Worker**, Anda hanya dapat menanyakan detail pekerjaan (task), jadwal, atau progres pada proyek yang ditugaskan kepada Anda (misal: *"Ringkasan proyek saya"* atau *"Task hari ini"*).',
                'System-wide project counts and global project listings in PROVIS are restricted to **SuperAdministrator** only. As a **Worker**, you can only ask about tasks, schedules, or progress in your assigned project (e.g. *"My project summary"* or *"Today\'s tasks"*).',
                $lang
            );
        }

        // STRICT RBAC: Non-SuperAdmin (PIC, admin_progres, own_company admin_utama) CANNOT query global PROVIS system-wide counts/rankings!
        if (!$this->isSuperAdmin($user) && $asksSystemWide && !($user->isAdminUtama() && $user->getDataScope() === 'all')) {
            return $this->roleRestrictedResponse(
                $user,
                'Data jumlah keseluruhan maupun peringkat progres seluruh proyek di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**. Anda hanya dapat menanyakan proyek pada cakupan akses akun Anda (misal: *"Daftar proyek yang dapat saya akses"*).',
                'Global system-wide project totals and best/worst rankings across all of PROVIS are restricted to **SuperAdministrator** only. You may query projects within your own access scope (e.g. *"List my accessible projects"*).',
                $lang
            );
        }

        if (!$matchedComp && !empty($tokenized['requested_company_name'])) {
            return $this->companyNotFoundResponse($tokenized['requested_company_name'], $user, $lang);
        }

        $projectsQuery = $this->getAccessibleProjectsQuery($user)->with(['company', 'manager']);
        if ($matchedComp) {
            $projectsQuery->where('companies_id', (int) $matchedComp['id']);
        }
        if ($asksLowest && !$asksHighest) {
            $projectsQuery->orderBy('progress')->orderBy('end')->orderBy('id');
        } else {
            $projectsQuery->orderByDesc('progress')->orderBy('end')->orderBy('id');
        }

        $projects = $projectsQuery->get();

        if ($projects->isEmpty()) {
            return [
                'content'         => $lang === 'en'
                    ? 'There are currently no projects accessible under your account.'
                    : 'Saat ini belum ada proyek yang terdaftar atau dapat diakses oleh akun Anda.',
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Project List' : 'Buka Daftar Proyek', 'url' => '/projectlistpage']],
                'resolved_intent' => 'LIST_PROJECTS',
            ];
        }

        $now = Carbon::now('Asia/Jakarta');
        $refs = [];
        $lines = [];
        $totalProgress = 0.0;

        foreach ($projects as $idx => $p) {
            $num = $idx + 1;
            $prog = round((float) ($p->progress ?? 0), 2);
            $totalProgress += $prog;
            $endStr = $p->end ? Carbon::parse($p->end)->format('d M Y') : '—';
            $daysLeft = $p->end ? (int) ceil($now->diffInDays(Carbon::parse($p->end), false)) : null;

            $timeTag = '';
            if ($daysLeft !== null) {
                if ($prog >= 100) {
                    $timeTag = $lang === 'en' ? 'Completed' : 'Selesai';
                } elseif ($daysLeft < 0) {
                    $abs = abs($daysLeft);
                    $timeTag = $lang === 'en' ? "Overdue {$abs}d" : "Terlambat {$abs} hari";
                } else {
                    $timeTag = $lang === 'en' ? "{$daysLeft}d left" : "Sisa {$daysLeft} hari";
                }
            }

            $comp = $p->company?->name ?? '—';
            $pic  = $p->manager?->username ?? '—';
            $lines[] = "{$num}. **{$p->title}** (`#{$p->id}` — {$comp} · PIC: *{$pic}*)\n"
                . "   - " . ($lang === 'en' ? 'Progress' : 'Progres') . ": **{$prog}%** | Status: `{$p->status}` | "
                . ($lang === 'en' ? 'Deadline' : 'Target') . ": {$endStr}" . ($timeTag ? " (*{$timeTag}*)" : '');

            $refs[] = ['index' => $num, 'id' => $p->id, 'title' => $p->title];
        }

        $avgProg = round($totalProgress / $projects->count(), 2);
        $topProj = $projects->first();
        $topProg = round((float) ($topProj->progress ?? 0), 2);
        $tiedExtreme = $projects->filter(fn($p) => round((float) ($p->progress ?? 0), 2) === $topProg)->values();

        $rankingBanner = '';
        if ($asksHighest && $asksLowest && $projects->count() > 0) {
            // User asked for BOTH best AND worst progress (e.g. "progres mana yang paling baik dan buruk di provis ini")
            $sortedDesc = $projects->sortBy([['progress', 'desc'], ['end', 'asc']])->values();
            $sortedAsc  = $projects->sortBy([['progress', 'asc'], ['end', 'asc']])->values();

            $bestVal   = round((float) ($sortedDesc->first()->progress ?? 0), 2);
            $bestTied  = $sortedDesc->filter(fn($p) => round((float) ($p->progress ?? 0), 2) === $bestVal)->values();
            $bestList  = $bestTied->map(fn($p) => "**{$p->title}** (`#{$p->id}`)")->implode(', ');

            $worstVal  = round((float) ($sortedAsc->first()->progress ?? 0), 2);
            $worstTied = $sortedAsc->filter(fn($p) => round((float) ($p->progress ?? 0), 2) === $worstVal)->values();
            $worstList = $worstTied->map(fn($p) => "**{$p->title}** (`#{$p->id}`)")->implode(', ');
            $urgentEnd = $sortedAsc->first()->end ? Carbon::parse($sortedAsc->first()->end)->format('d M Y') : '—';

            if ($lang === 'en') {
                $bestLine  = $bestTied->count() > 1
                    ? "🏆 **Best / Highest Progress ({$bestTied->count()} tied at {$bestVal}%)**: {$bestList}."
                    : "🏆 **Best / Highest Progress**: **{$sortedDesc->first()->title}** (`#{$sortedDesc->first()->id}`) at **{$bestVal}%**.";
                $worstLine = $worstTied->count() > 1
                    ? "📉 **Worst / Lowest Progress ({$worstTied->count()} tied at {$worstVal}%)**: {$worstList} — with **{$sortedAsc->first()->title}** having the closest deadline ({$urgentEnd})."
                    : "📉 **Worst / Lowest Progress**: **{$sortedAsc->first()->title}** (`#{$sortedAsc->first()->id}`) at **{$worstVal}%**.";
            } else {
                $bestLine  = $bestTied->count() > 1
                    ? "🏆 **Progres Terbaik / Tertinggi ({$bestTied->count()} proyek sama-sama di {$bestVal}%)**: {$bestList}."
                    : "🏆 **Progres Terbaik / Tertinggi**: **{$sortedDesc->first()->title}** (`#{$sortedDesc->first()->id}`) dengan capaian **{$bestVal}%**.";
                $worstLine = $worstTied->count() > 1
                    ? "📉 **Progres Terburuk / Terendah ({$worstTied->count()} proyek sama-sama di {$worstVal}%)**: {$worstList} — dengan **{$sortedAsc->first()->title}** memiliki target deadline paling dekat ({$urgentEnd})."
                    : "📉 **Progres Terburuk / Terendah**: **{$sortedAsc->first()->title}** (`#{$sortedAsc->first()->id}`) dengan capaian **{$worstVal}%**.";
            }
            $rankingBanner = "{$bestLine}\n{$worstLine}\n\n";
        } elseif ($asksHighest && $topProj) {
            if ($tiedExtreme->count() > 1) {
                $tiedList = $tiedExtreme->map(fn($p) => "**{$p->title}** (`#{$p->id}`)")->implode(', ');
                $rankingBanner = $lang === 'en'
                    ? "🏆 **Highest Progress Projects ({$tiedExtreme->count()} tied at {$topProg}%)**: {$tiedList}.\n\n"
                    : "🏆 **Proyek dengan Progres Tertinggi ({$tiedExtreme->count()} proyek sama-sama di {$topProg}%)**: {$tiedList}.\n\n";
            } else {
                $rankingBanner = $lang === 'en'
                    ? "🏆 **Highest Progress Project**: **{$topProj->title}** (`#{$topProj->id}`) with **{$topProg}%** completion.\n\n"
                    : "🏆 **Proyek dengan Progres Tertinggi**: **{$topProj->title}** (`#{$topProj->id}`) dengan capaian **{$topProg}%**.\n\n";
            }
        } elseif ($asksLowest && $topProj) {
            if ($tiedExtreme->count() > 1) {
                $tiedList = $tiedExtreme->map(fn($p) => "**{$p->title}** (`#{$p->id}`)")->implode(', ');
                $urgentEnd = $topProj->end ? Carbon::parse($topProj->end)->format('d M Y') : '—';
                $rankingBanner = $lang === 'en'
                    ? "📉 **Lowest Progress Projects ({$tiedExtreme->count()} tied at {$topProg}%)**: {$tiedList} — with **{$topProj->title}** (`#{$topProj->id}`) having the closest deadline ({$urgentEnd}).\n\n"
                    : "📉 **Proyek dengan Progres Paling Lambat / Terendah ({$tiedExtreme->count()} proyek sama-sama di {$topProg}%)**: {$tiedList} — dengan **{$topProj->title}** (`#{$topProj->id}`) memiliki target deadline paling dekat ({$urgentEnd}).\n\n";
            } else {
                $rankingBanner = $lang === 'en'
                    ? "📉 **Lowest Progress Project**: **{$topProj->title}** (`#{$topProj->id}`) at **{$topProg}%** completion.\n\n"
                    : "📉 **Proyek dengan Progres Terendah**: **{$topProj->title}** (`#{$topProj->id}`) dengan capaian **{$topProg}%**.\n\n";
            }
        }

        $scopeSuffixEn = $matchedComp ? " — {$matchedComp['name']}" : '';
        $scopeSuffixId = $matchedComp ? " — {$matchedComp['name']}" : '';

        if ($lang === 'en') {
            $content = "### 📁 Accessible Projects Overview{$scopeSuffixEn} ({$projects->count()} Projects)\n\n"
                . $rankingBanner
                . "Average portfolio progress: **{$avgProg}%**\n\n"
                . implode("\n", $lines) . "\n\n"
                . "> 💡 Follow-up tip: Say *\"Details of #1\"*, *\"Budget of #2\"*, or *\"Show Outstanding tasks in {$projects->first()->title}\"* to drill down.";
        } else {
            $content = "### 📁 Daftar Proyek{$scopeSuffixId} ({$projects->count()} Proyek)\n\n"
                . $rankingBanner
                . "Rata-rata progres seluruh proyek: **{$avgProg}%**\n\n"
                . implode("\n", $lines) . "\n\n"
                . "> 💡 Tips lanjutan: Ketik *\"Detail proyek pertama\"*, *\"Cek budget nomor 2\"*, atau *\"Tampilkan task Outstanding di {$projects->first()->title}\"* untuk melihat rincian.";
        }

        return [
            'content'         => $content,
            'actions'         => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Project List' : 'Buka Project List', 'url' => '/projectlistpage'],
            ],
            'resolved_intent' => 'LIST_PROJECTS',
            'context_update'  => [
                'referenced_projects' => $refs,
                'referenced_tasks'    => [],
            ],
        ];
    }

    protected function handleProjectSummaryQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en'
                    ? 'No accessible projects were found under your account.'
                    : 'Belum ada proyek yang terdaftar atau dapat diakses oleh akun Anda.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_SUMMARY',
            ];
        }

        $now      = Carbon::now('Asia/Jakarta');
        $allTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
            ->with(['division', 'divisions'])
            ->get();
        $totalCount       = $allTasks->count();
        $completedCount   = $allTasks->filter(fn($t) => $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100)->count();
        $outstandingTasks = $allTasks->filter(fn($t) => !$t->is_completed && $t->status === 'Outstanding' && (float) $t->progress < 100)->values();
        $overdueTasks     = $allTasks->filter(fn($t) => $t->end && Carbon::parse($t->end)->lt($now) && !$t->is_completed && $t->status !== 'Completed' && (float) $t->progress < 100)->values();
        $inProgressCount  = $allTasks->filter(fn($t) => !$t->is_completed && $t->status !== 'Completed' && (float) $t->progress > 0 && (float) $t->progress < 100)->count();
        $outstandingCount = $outstandingTasks->count();
        $overdueCount     = $overdueTasks->count();

        $daysLeft = $project->end ? (int) ceil($now->diffInDays(Carbon::parse($project->end), false)) : null;
        $daysLeftLabel = '—';
        if ($daysLeft !== null) {
            if ($daysLeft < 0) {
                $abs = abs($daysLeft);
                $daysLeftLabel = $lang === 'en' ? "Overdue by {$abs} days" : "Lewat tenggat {$abs} hari";
            } else {
                $daysLeftLabel = $lang === 'en' ? "{$daysLeft} days left" : "Sisa {$daysLeft} hari";
            }
        }

        // Deep 3-Tier WBS structure stats
        $allMainJobs = MainWbs::where('projects_id', $project->id)
            ->orderBy('order_index')
            ->orderBy('id')
            ->with(['subWbs.wbsTasks'])
            ->get();
        $mainCount = $allMainJobs->count();
        $subCount  = $allMainJobs->sum(fn($m) => $m->subWbs->count());

        $mjText = '';
        if ($allMainJobs->isNotEmpty()) {
            $mjText = "\n\n**" . ($lang === 'en' ? "Main Jobs Breakdown ({$mainCount} Main Jobs · {$subCount} Sub Tasks):" : "Ringkasan Main Job ({$mainCount} Main Job · {$subCount} Sub Task):") . "**\n";
            foreach ($allMainJobs->take(6) as $idx => $mj) {
                $mjProg  = round((float) ($mj->progress ?? 0), 1);
                $mjSubs  = $mj->subWbs->count();
                $mjTasks = $mj->subWbs->sum(fn($s) => $s->wbsTasks->count());
                $mjText .= ($idx + 1) . ". {$mj->name} — **{$mjProg}%** (`{$mj->status}` · {$mjSubs} sub, {$mjTasks} task)\n";
            }
            if ($mainCount > 6) {
                $mjText .= ($lang === 'en' ? "*...and " . ($mainCount - 6) . " more Main Jobs.*\n" : "*...dan " . ($mainCount - 6) . " Main Job lainnya.*\n");
            }
        }

        // Deep Inside-Project Division Breakdown
        $divText = '';
        if ($allTasks->isNotEmpty()) {
            $divStats = [];
            foreach ($allTasks as $t) {
                $dNames = $t->divisions->pluck('divisi')->all();
                if (empty($dNames)) {
                    $dNames = [$t->division?->divisi ?? 'General'];
                }
                $isDone = $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100;
                foreach (array_unique($dNames) as $dn) {
                    if (!isset($divStats[$dn])) {
                        $divStats[$dn] = ['total' => 0, 'done' => 0];
                    }
                    $divStats[$dn]['total']++;
                    if ($isDone) {
                        $divStats[$dn]['done']++;
                    }
                }
            }
            uasort($divStats, fn($a, $b) => $b['total'] <=> $a['total']);
            $topDivParts = [];
            foreach (array_slice($divStats, 0, 5, true) as $dn => $st) {
                $pct = $st['total'] > 0 ? round(($st['done'] / $st['total']) * 100) : 0;
                $topDivParts[] = "**{$dn}** ({$st['done']}/{$st['total']} · {$pct}%)";
            }
            if (!empty($topDivParts)) {
                $divText = "\n- **" . ($lang === 'en' ? 'Active Divisions' : 'Divisi Terlibat') . '**: ' . implode(', ', $topDivParts);
            }
        }

        // Team count inside this project (PIC + ProjectMembers)
        $memberCount = ProjectMember::where('project_id', $project->id)->count();
        $teamLine = $lang === 'en'
            ? "\n- **Project Team**: 1 PIC + **{$memberCount}** assigned member(s)"
            : "\n- **Tim Proyek**: 1 PIC + **{$memberCount}** anggota tim terdaftar";

        // Budget realization snapshot inside this project (RBAC gated!)
        $budgetLine = '';
        if ($this->canUserViewBudget($user)) {
            $spent = (float) BudgetEntry::where('projects_id', $project->id)->sum('harga_total');
            $bCount = BudgetEntry::where('projects_id', $project->id)->count();
            $budgetLine = $lang === 'en'
                ? "\n- **Budget Realization**: **{$this->formatRupiah($spent)}** ({$bCount} entries)"
                : "\n- **Realisasi Budget**: **{$this->formatRupiah($spent)}** ({$bCount} transaksi)";
        }

        // Critical tasks needing immediate attention inside this project
        $alertText = '';
        if ($overdueTasks->isNotEmpty() || $outstandingTasks->isNotEmpty()) {
            $alertLines = [];
            foreach ($overdueTasks->take(3) as $ot) {
                $alertLines[] = "- 🔴 *Overdue*: **{$ot->name}** (" . round((float) $ot->progress, 1) . '%, Target: ' . ($ot->end ? Carbon::parse($ot->end)->format('d M Y') : '—') . ')';
            }
            foreach ($outstandingTasks->take(3) as $out) {
                $alertLines[] = "- 🟣 *Outstanding PR*: **{$out->name}** (" . round((float) $out->progress, 1) . '%)';
            }
            $alertText = "\n\n**" . ($lang === 'en' ? 'Priority Attention Inside Project:' : 'Perhatian Prioritas di Dalam Proyek:') . "**\n" . implode("\n", $alertLines);
        }

        $startStr = $project->start ? Carbon::parse($project->start)->format('d M Y') : '—';
        $endStr   = $project->end ? Carbon::parse($project->end)->format('d M Y') : '—';
        $prog     = round((float) ($project->progress ?? 0), 2);
        $visLabel = $project->is_private ? 'Private' : 'Public';

        if ($lang === 'en') {
            $content = "📊 **Deep Project Analysis: {$project->title}** (`#{$project->id}` · `{$visLabel}`)\n\n"
                . "- **Company**: " . ($project->company?->name ?? '—') . "\n"
                . "- **Project Manager (PIC)**: " . ($project->manager?->username ?? '—') . "\n"
                . "- **Overall Progress**: **{$prog}%** (Status: `{$project->status}`)\n"
                . "- **Schedule**: {$startStr} to {$endStr} (*{$daysLeftLabel}*)\n"
                . "- **WBS Structure**: **{$mainCount}** Main Jobs → **{$subCount}** Sub Tasks → **{$totalCount}** Tasks (**{$completedCount}** Completed · **{$inProgressCount}** In Progress · **{$outstandingCount}** Outstanding PR · **{$overdueCount}** Overdue)"
                . $divText
                . $teamLine
                . $budgetLine
                . $mjText
                . $alertText . "\n\n"
                . "> 💡 You can follow up with: *\"Show Outstanding tasks\"*, *\"Check budget\"*, *\"Division progress\"*, or *\"S-Curve forecast\"*.";
        } else {
            $content = "📊 **Analisis & Ringkasan Proyek: {$project->title}** (`#{$project->id}` · `{$visLabel}`)\n\n"
                . "- **Perusahaan**: " . ($project->company?->name ?? '—') . "\n"
                . "- **Project Manager (PIC)**: " . ($project->manager?->username ?? '—') . "\n"
                . "- **Progres Keseluruhan**: **{$prog}%** (Status: `{$project->status}`)\n"
                . "- **Periode**: {$startStr} s/d {$endStr} (*{$daysLeftLabel}*)\n"
                . "- **Struktur WBS**: **{$mainCount}** Main Job → **{$subCount}** Sub Task → **{$totalCount}** Task (**{$completedCount}** selesai · **{$inProgressCount}** berjalan · **{$outstandingCount}** Outstanding PR · **{$overdueCount}** overdue)"
                . $divText
                . $teamLine
                . $budgetLine
                . $mjText
                . $alertText . "\n\n"
                . "> 💡 Anda bisa lanjut bertanya: *\"Tampilkan task Outstanding\"*, *\"Cek budgetnya\"*, *\"Progres per divisi\"*, atau *\"Analisis S-Curve\"*.";
        }

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Project Detail' : 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'View S-Curve Report' : 'Lihat S-Curve Report', 'url' => "/scurve?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_SUMMARY',
            'context_update'  => [
                'project_id'       => $project->id,
                'referenced_tasks' => [],
            ],
        ];
    }

    /**
     * Flexible Task Search & Filter Handler:
     * Supports single-task inspection (by code, ID, fuzzy name, or follow-up index)
     * AND filtered lists by status (e.g. Outstanding, Delayed, Completed, Open) & division!
     */
    protected function handleQueryTasks(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en'
                    ? 'No accessible project found to search tasks.'
                    : 'Tidak ditemukan proyek yang dapat diakses untuk mencari data task.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_TASKS',
            ];
        }

        $codeMap = $this->buildTaskCodeMap($project->id);
        $matchedTasks = $tokenized['matched_tasks'] ?? [];
        $followUp     = $tokenized['follow_up'] ?? [];
        $statuses     = $tokenized['statuses'] ?? [];
        $divisions    = $tokenized['matched_divisions'] ?? [];

        // Multi-turn follow-up: selecting a specific task by index (e.g. "detail yang pertama", "nomor 2")
        if (!empty($followUp['item_index']) && !empty($sessionContext['referenced_tasks'])) {
            $refTask = $sessionContext['referenced_tasks'][$followUp['item_index'] - 1] ?? null;
            if ($refTask) {
                $task = Wbs::with(['division', 'divisions', 'parentSubWbs.mainWbs', 'predecessorDependencies.predecessor', 'completedBy'])->find($refTask['id']);
                if ($task) {
                    return $this->renderSingleTaskDetail($project, $task, $codeMap, $lang);
                }
            }
        }

        // Direct single task match (when user asked about a specific task name/code without status-list filters)
        if (!empty($matchedTasks) && empty($statuses) && empty($divisions)) {
            $task = Wbs::with(['division', 'divisions', 'parentSubWbs.mainWbs', 'predecessorDependencies.predecessor', 'completedBy'])
                ->find($matchedTasks[0]['id']);
            if ($task) {
                return $this->renderSingleTaskDetail($project, $task, $codeMap, $lang);
            }
        }

        // Multi-turn filter refinement: combine previous filter (e.g. status=Outstanding) with new filter (e.g. division=Maintenance)
        $filterStatus = $statuses[0] ?? null;
        $filterDivId  = $divisions[0]['id'] ?? null;
        $filterDivName = $divisions[0]['name'] ?? null;

        if (($followUp['is_refinement'] ?? false) && ($sessionContext['last_intent'] ?? '') === 'QUERY_TASKS') {
            if (!$filterStatus && !empty($sessionContext['status'])) {
                $filterStatus = $sessionContext['status'];
            }
            if (!$filterDivId && !empty($sessionContext['division_id'])) {
                $filterDivId = (int) $sessionContext['division_id'];
                $filterDivName = Division::find($filterDivId)?->divisi;
            }
        }

        $tasksQuery = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
            ->with(['division', 'divisions', 'parentSubWbs.mainWbs']);

        if ($filterDivId) {
            $tasksQuery->where(function ($q) use ($filterDivId) {
                $q->where('divisions_id', $filterDivId)
                  ->orWhereHas('divisions', fn($dq) => $dq->where('divisions.id', $filterDivId));
            });
        }

        $allMatching = $tasksQuery->get();
        $now = Carbon::now('Asia/Jakarta');

        if ($filterStatus) {
            $allMatching = $allMatching->filter(function (Wbs $t) use ($filterStatus, $now) {
                $isDone = $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100;
                if ($filterStatus === 'Completed') {
                    return $isDone;
                }
                if ($filterStatus === 'Delayed') {
                    return !$isDone && ($t->status === 'Delayed' || ($t->end && Carbon::parse($t->end)->lt($now)));
                }
                if ($filterStatus === 'Outstanding') {
                    return !$isDone && $t->status === 'Outstanding';
                }
                if ($filterStatus === 'Open') {
                    return !$isDone && ($t->status === 'Open' || empty($t->status)) && (float) $t->progress == 0;
                }
                return !$isDone && $t->status === $filterStatus;
            })->values();
        }

        // Build clean filter label
        $filterTags = [];
        if ($filterStatus) {
            $filterTags[] = "Status: `{$filterStatus}`";
        }
        if ($filterDivName) {
            $filterTags[] = ($lang === 'en' ? 'Division' : 'Divisi') . ": **{$filterDivName}**";
        }
        $filterSummary = !empty($filterTags) ? ' (' . implode(' · ', $filterTags) . ')' : '';

        if ($allMatching->isEmpty()) {
            $msg = $lang === 'en'
                ? "No tasks matched in **{$project->title}**{$filterSummary}."
                : "Tidak ditemukan task di proyek **{$project->title}**{$filterSummary}.";

            return [
                'content'         => $msg,
                'actions'         => [
                    ['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"],
                ],
                'resolved_intent' => 'QUERY_TASKS',
                'context_update'  => [
                    'project_id'       => $project->id,
                    'status'           => $filterStatus,
                    'division_id'      => $filterDivId,
                    'referenced_tasks' => [],
                ],
            ];
        }

        $totalFound = $allMatching->count();
        $displayList = $allMatching->take(12);
        $refs = [];
        $lines = [];

        foreach ($displayList as $idx => $t) {
            $num = $idx + 1;
            $code = $codeMap[(string) $t->id] ?? $t->id;
            $divNames = $t->divisions->pluck('divisi')->all();
            $divStr = !empty($divNames) ? implode(', ', $divNames) : ($t->division?->divisi ?? 'General');
            $endStr = $t->end ? Carbon::parse($t->end)->format('d/m/Y') : '—';
            $prog   = round((float) ($t->progress ?? 0), 1);
            $effStatus = ($t->is_completed || $prog >= 100) ? 'Completed' : ($t->status ?? 'Open');

            $icon = match ($effStatus) {
                'Outstanding' => '🟣',
                'Completed'   => '✅',
                'Delayed'     => '🔴',
                'At Risk'     => '🟡',
                'On Track'    => '🔵',
                default       => '🟢',
            };

            $lines[] = "{$num}. {$icon} `{$code}` **{$t->name}**\n"
                . "   - Status: `{$effStatus}` | " . ($lang === 'en' ? 'Progress' : 'Progres') . ": **{$prog}%** | "
                . ($lang === 'en' ? 'Division' : 'Divisi') . ": {$divStr} | Deadline: {$endStr}";

            $refs[] = ['index' => $num, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
        }

        $extraNote = '';
        if ($totalFound > 12) {
            $rem = $totalFound - 12;
            $extraNote = $lang === 'en'
                ? "\n*…and {$rem} more task(s). Open the Tasks page to view all.*"
                : "\n*…dan {$rem} task lainnya. Buka halaman Tasks untuk melihat keseluruhan.*";
        }

        $header = $filterStatus === 'Outstanding'
            ? ($lang === 'en'
                ? "### 🟣 Outstanding PR Items — {$project->title} ({$totalFound} found)"
                : "### 🟣 Daftar Barang PR Belum Terpenuhi (Outstanding) — {$project->title} ({$totalFound} item)")
            : ($lang === 'en'
                ? "### 📋 Task List — {$project->title}{$filterSummary} ({$totalFound} found)"
                : "### 📋 Daftar Task — {$project->title}{$filterSummary} ({$totalFound} ditemukan)");

        $tip = $lang === 'en'
            ? "> 💡 Follow-up: Say *\"Details of #1\"*, *\"Only Maintenance division\"*, or *\"Mark #1 as Outstanding\"*."
            : "> 💡 Lanjutan: Ketik *\"Detail nomor 1\"*, *\"Yang divisi Maintenance aja\"*, atau *\"Ubah status nomor 1 jadi Outstanding\"*.";

        return [
            'content' => "{$header}\n\n" . implode("\n", $lines) . $extraNote . "\n\n{$tip}",
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks Table' : 'Buka Tabel Tasks', 'url' => "/tasks?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_TASKS',
            'context_update'  => [
                'project_id'       => $project->id,
                'status'           => $filterStatus,
                'division_id'      => $filterDivId,
                'referenced_tasks' => $refs,
            ],
        ];
    }

    /**
     * Render rich detail card for a single task (including blocker check & evidence status).
     */
    protected function renderSingleTaskDetail(Project $project, Wbs $task, array $codeMap, string $lang): array
    {
        $code     = $codeMap[(string) $task->id] ?? $task->id;
        $divNames = $task->divisions->pluck('divisi')->all();
        $divStr   = !empty($divNames) ? implode(', ', $divNames) : ($task->division?->divisi ?? 'General');
        $prog     = round((float) ($task->progress ?? 0), 1);
        $status   = ($task->is_completed || $prog >= 100) ? 'Completed' : ($task->status ?? 'Open');
        $startStr = $task->start ? Carbon::parse($task->start)->format('d M Y') : '—';
        $endStr   = $task->end ? Carbon::parse($task->end)->format('d M Y') : '—';
        $hasEv    = !empty($task->evidence_path) && $task->evidence_path !== '[]';

        $startBlocker    = $this->scheduler->validateCanStart($task);
        $completeBlocker = $this->scheduler->validateCanComplete($task);

        $blockerLine = '';
        if ($startBlocker) {
            $blockerLine = "\n- 🔒 **Blocker**: {$startBlocker}";
        } elseif ($completeBlocker) {
            $blockerLine = "\n- 🔒 **Completion Blocker**: {$completeBlocker}";
        } else {
            $blockerLine = $lang === 'en'
                ? "\n- 🔓 **Predecessor Status**: Clear (no active blockers)"
                : "\n- 🔓 **Status Predecessor**: Aman (tidak terkunci)";
        }

        $outstandingNote = $status === 'Outstanding'
            ? ($lang === 'en'
                ? "\n- 🟣 **PR Note**: Marked as **Outstanding** (PR goods/material not yet fulfilled)."
                : "\n- 🟣 **Catatan PR**: Berstatus **Outstanding** (barang dari PR belum terpenuhi).")
            : '';

        $parentPath = trim(($task->parentSubWbs?->mainWbs?->name ?? '') . ' → ' . ($task->parentSubWbs?->name ?? ''), ' →');

        if ($lang === 'en') {
            $content = "### 🔍 Task Detail: `{$code}` — {$task->name}\n\n"
                . "- **Project**: {$project->title} (`#{$project->id}`)\n"
                . "- **WBS Hierarchy**: {$parentPath}\n"
                . "- **Status**: `{$status}` | **Progress**: **{$prog}%** | **Weight**: {$task->weight}%\n"
                . "- **Division(s)**: {$divStr}\n"
                . "- **Schedule**: {$startStr} to {$endStr} ({$task->duration_days} days)\n"
                . "- **Evidence**: " . ($hasEv ? 'Uploaded ✓' : ($task->requires_evidence ? 'Required (Not yet uploaded)' : 'Optional / None'))
                . $outstandingNote
                . $blockerLine . "\n\n"
                . "> 💡 Quick follow-ups: *\"Mark this task as Outstanding\"* or *\"Update progress of this task to 50%\"*.";
        } else {
            $content = "### 🔍 Detail Task: `{$code}` — {$task->name}\n\n"
                . "- **Proyek**: {$project->title} (`#{$project->id}`)\n"
                . "- **Hierarki WBS**: {$parentPath}\n"
                . "- **Status**: `{$status}` | **Progres**: **{$prog}%** | **Bobot**: {$task->weight}%\n"
                . "- **Divisi**: {$divStr}\n"
                . "- **Jadwal**: {$startStr} s/d {$endStr} ({$task->duration_days} hari)\n"
                . "- **Evidence**: " . ($hasEv ? 'Sudah diunggah ✓' : ($task->requires_evidence ? 'Wajib (Belum diunggah)' : 'Opsional / Belum ada'))
                . $outstandingNote
                . $blockerLine . "\n\n"
                . "> 💡 Lanjutan cepat: *\"Ubah status task ini jadi Outstanding\"* atau *\"Update progres task ini jadi 50%\"*.";
        }

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'View in Project Detail' : 'Lihat di Project Detail', 'url' => "/projects/{$project->id}/detail"],
            ],
            'resolved_intent' => 'QUERY_TASKS',
            'context_update'  => [
                'project_id'       => $project->id,
                'task_id'          => $task->id,
                'referenced_tasks' => [['index' => 1, 'id' => $task->id, 'code' => $code, 'name' => $task->name]],
            ],
        ];
    }

    /**
     * Today's Tasks & Upcoming Deadlines Handler.
     */
    protected function handleTodayTasksQuery(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan proyek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_TODAY_TASKS',
            ];
        }

        $today = Carbon::today('Asia/Jakarta');
        $isWeekScope = (bool) preg_match('/\b(minggu\s+ini|this\s+week|7\s*hari|pekan\s+ini|terdekat|upcoming)\b/i', $prompt);
        $horizonEnd = $isWeekScope ? $today->copy()->addDays(7) : $today->copy();

        $codeMap = $this->buildTaskCodeMap($project->id);
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
            ->with(['division', 'divisions'])
            ->get();

        $dueOrActive = [];
        $overdue = [];

        foreach ($tasks as $t) {
            $isDone = $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100;
            if ($isDone) {
                continue;
            }
            $s = $t->start ? Carbon::parse($t->start)->startOfDay() : null;
            $e = $t->end ? Carbon::parse($t->end)->startOfDay() : null;

            if ($e && $e->lt($today)) {
                $overdue[] = $t;
            } elseif (($e && $e->betweenIncluded($today, $horizonEnd)) || ($s && $e && $today->betweenIncluded($s, $e))) {
                $dueOrActive[] = $t;
            }
        }

        $refs = [];
        $refIdx = 1;
        $horizonLabel = $isWeekScope
            ? ($lang === 'en' ? 'This Week (Next 7 Days)' : 'Minggu Ini (7 Hari Ke Depan)')
            : ($lang === 'en' ? "Today ({$today->format('d M Y')})" : "Hari Ini ({$today->format('d M Y')})");

        $text = "### 📅 " . ($lang === 'en' ? "Schedule & Tasks — {$horizonLabel}" : "Jadwal & Task — {$horizonLabel}") . "\n"
            . ($lang === 'en' ? 'Project' : 'Proyek') . ": **{$project->title}** (`#{$project->id}`)\n\n";

        if (empty($dueOrActive) && empty($overdue)) {
            $text .= $lang === 'en'
                ? "🎉 No open tasks are due or overdue for this period!"
                : "🎉 Tidak ada task aktif yang jatuh tempo atau terlambat pada periode ini!";
        } else {
            if (!empty($dueOrActive)) {
                $text .= "**" . ($lang === 'en' ? 'Active / Due Soon' : 'Aktif / Jatuh Tempo') . " (" . count($dueOrActive) . "):**\n";
                foreach (array_slice($dueOrActive, 0, 8) as $t) {
                    $code = $codeMap[(string) $t->id] ?? $t->id;
                    $endStr = $t->end ? Carbon::parse($t->end)->format('d/m/Y') : '—';
                    $prog = round((float) ($t->progress ?? 0), 1);
                    $text .= "{$refIdx}. `{$code}` **{$t->name}** — `{$t->status}` ({$prog}%, Deadline: {$endStr})\n";
                    $refs[] = ['index' => $refIdx++, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
                }
                $text .= "\n";
            }

            if (!empty($overdue)) {
                $text .= "**⚠️ " . ($lang === 'en' ? 'Overdue' : 'Sudah Melewati Tenggat (Overdue)') . " (" . count($overdue) . "):**\n";
                foreach (array_slice($overdue, 0, 6) as $t) {
                    $code = $codeMap[(string) $t->id] ?? $t->id;
                    $endStr = $t->end ? Carbon::parse($t->end)->format('d/m/Y') : '—';
                    $lateDays = (int) abs($today->diffInDays(Carbon::parse($t->end)->startOfDay()));
                    $prog = round((float) ($t->progress ?? 0), 1);
                    $lateTag = $lang === 'en' ? "{$lateDays}d late" : "telat {$lateDays} hari";
                    $text .= "{$refIdx}. `{$code}` **{$t->name}** — `{$t->status}` ({$prog}%, {$lateTag}, Deadline: {$endStr})\n";
                    $refs[] = ['index' => $refIdx++, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
                }
            }
        }

        return [
            'content' => trim($text),
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? "Open Today's Tasks" : "Buka Today's Tasks", 'url' => "/today-tasks?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_TODAY_TASKS',
            'context_update'  => [
                'project_id'       => $project->id,
                'referenced_tasks' => $refs,
            ],
        ];
    }

    /**
     * Predecessor & Blocker Diagnostics Handler.
     */
    protected function handleAnalyzeBlocker(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan proyek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'ANALYZE_BLOCKER',
            ];
        }

        $codeMap = $this->buildTaskCodeMap($project->id);
        $targetTask = $this->resolveSingleTask($tokenized, $sessionContext, $project->id);

        if ($targetTask) {
            $code = $codeMap[(string) $targetTask->id] ?? $targetTask->id;
            $startBlocker = $this->scheduler->validateCanStart($targetTask);
            $completeBlocker = $this->scheduler->validateCanComplete($targetTask);

            $predLines = [];
            $deps = $targetTask->predecessorDependencies()->with('predecessor')->get();
            foreach ($deps as $d) {
                if ($d->predecessor) {
                    $pCode = $codeMap[(string) $d->predecessor->id] ?? $d->predecessor->id;
                    $pProg = round((float) ($d->predecessor->progress ?? 0), 1);
                    $predLines[] = "- `{$pCode}` **{$d->predecessor->name}** — Type: `{$d->dependency_type}` (Lag: {$d->lag_days}d) | Status: `{$d->predecessor->status}` (**{$pProg}%**)";
                }
            }
            if (empty($predLines) && !empty($targetTask->predecessor) && $targetTask->predecessor !== '-') {
                $predWbs = Wbs::find($targetTask->predecessor);
                if ($predWbs) {
                    $pCode = $codeMap[(string) $predWbs->id] ?? $predWbs->id;
                    $pProg = round((float) ($predWbs->progress ?? 0), 1);
                    $predLines[] = "- `{$pCode}` **{$predWbs->name}** — Type: `{$targetTask->dep_type}` | Status: `{$predWbs->status}` (**{$pProg}%**)";
                }
            }

            if ($lang === 'en') {
                $content = "### 🔒 Blocker Analysis: `{$code}` — {$targetTask->name}\n\n";
                if ($startBlocker) {
                    $content .= "**Diagnosis**: Task is **LOCKED from starting**.\n- Reason: {$startBlocker}\n\n";
                } elseif ($completeBlocker) {
                    $content .= "**Diagnosis**: Task can start, but is **BLOCKED from completing (100%)**.\n- Reason: {$completeBlocker}\n\n";
                } else {
                    $content .= "**Diagnosis**: ✅ **No predecessor blocker!** This task is unlocked and ready to execute.\n";
                    if ($targetTask->requires_evidence && empty($targetTask->evidence_path)) {
                        $content .= "- Note: **Mandatory Evidence** is enabled — attach a PDF/JPG/PNG file to reach 100%.\n";
                    }
                    $content .= "\n";
                }
                if (!empty($predLines)) {
                    $content .= "**Linked Predecessors:**\n" . implode("\n", $predLines);
                }
            } else {
                $content = "### 🔒 Analisa Penghambat (Blocker): `{$code}` — {$targetTask->name}\n\n";
                if ($startBlocker) {
                    $content .= "**Hasil Diagnosa**: Task ini **TERKUNCI (belum bisa dimulai)**.\n- Penyebab: {$startBlocker}\n\n";
                } elseif ($completeBlocker) {
                    $content .= "**Hasil Diagnosa**: Task bisa dimulai, tetapi **TERHAMBAT untuk selesai 100%**.\n- Penyebab: {$completeBlocker}\n\n";
                } else {
                    $content .= "**Hasil Diagnosa**: ✅ **Tidak ada blocker predecessor!** Task ini terbuka dan dapat dikerjakan.\n";
                    if ($targetTask->requires_evidence && empty($targetTask->evidence_path)) {
                        $content .= "- Catatan: Task ini **wajib unggah Evidence** (PDF/JPG/PNG) untuk ditandai 100% selesai.\n";
                    }
                    $content .= "\n";
                }
                if (!empty($predLines)) {
                    $content .= "**Predecessor yang Terhubung:**\n" . implode("\n", $predLines);
                }
            }

            return [
                'content' => trim($content),
                'actions' => [
                    ['type' => 'link', 'label' => $lang === 'en' ? 'Open Predecessor Manager' : 'Buka Predecessor Manager', 'url' => "/projects/{$project->id}/predecessors"],
                    ['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"],
                ],
                'resolved_intent' => 'ANALYZE_BLOCKER',
                'context_update'  => [
                    'project_id' => $project->id,
                    'task_id'    => $targetTask->id,
                ],
            ];
        }

        // No specific task specified: scan entire project for currently locked tasks!
        $allTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
            ->where('status', '!=', 'Completed')
            ->where('progress', '<', 100)
            ->get();

        $blocked = [];
        foreach ($allTasks as $t) {
            $reason = $this->scheduler->validateCanStart($t) ?? $this->scheduler->validateCanComplete($t);
            if ($reason) {
                $blocked[] = ['task' => $t, 'reason' => $reason];
            }
        }

        if (empty($blocked)) {
            $msg = $lang === 'en'
                ? "✅ Great news! There are currently **no tasks blocked by incomplete predecessors** in **{$project->title}**."
                : "✅ Kabar baik! Saat ini **tidak ada task yang terkunci oleh predecessor** di proyek **{$project->title}**.";
            return [
                'content'         => $msg,
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                'resolved_intent' => 'ANALYZE_BLOCKER',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $refs = [];
        $lines = [];
        foreach (array_slice($blocked, 0, 10) as $idx => $b) {
            $num = $idx + 1;
            $t = $b['task'];
            $code = $codeMap[(string) $t->id] ?? $t->id;
            $lines[] = "{$num}. 🔒 `{$code}` **{$t->name}**\n   - {$b['reason']}";
            $refs[] = ['index' => $num, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
        }

        $header = $lang === 'en'
            ? "### 🔒 Locked / Blocked Tasks in {$project->title} (" . count($blocked) . " tasks)"
            : "### 🔒 Daftar Task Terkunci Predecessor di {$project->title} (" . count($blocked) . " task)";

        return [
            'content' => "{$header}\n\n" . implode("\n", $lines),
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Predecessor Manager' : 'Buka Predecessor Manager', 'url' => "/projects/{$project->id}/predecessors"],
            ],
            'resolved_intent' => 'ANALYZE_BLOCKER',
            'context_update'  => [
                'project_id'       => $project->id,
                'referenced_tasks' => $refs,
            ],
        ];
    }

    /**
     * Budget Realization & Expenditure Analysis Handler (RBAC Protected).
     */
    protected function handleBudgetQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        if (!$this->canUserViewBudget($user)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Access Restricted**: Your account role (`" . ($user->role?->name ?? 'worker') . "`) does not have permission to view **Budget Management** data."
                    : "🔒 **Akses Dibatasi**: Role akun Anda (`" . ($user->role?->name ?? 'worker') . "`) tidak memiliki hak akses untuk melihat data **Budget Management**.",
                'actions'         => [],
                'resolved_intent' => 'QUERY_BUDGET',
            ];
        }

        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found for budget analysis.' : 'Tidak ditemukan proyek yang dapat diakses untuk analisa budget.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_BUDGET',
            ];
        }

        $entries = BudgetEntry::where('projects_id', $project->id)
            ->orderByDesc('harga_total')
            ->get();

        $totalBudget = 45000000000; // Default budget ceiling matching ProjectController
        $totalUsed   = (float) $entries->sum('harga_total');
        $remaining   = $totalBudget - $totalUsed;
        $usedPct     = $totalBudget > 0 ? round(($totalUsed / $totalBudget) * 100, 2) : 0;
        $health      = $usedPct <= 80 ? 'Optimal' : ($usedPct <= 95 ? 'Warning' : 'Critical');

        $categoryMap = [
            'Material'  => $lang === 'en' ? 'Material' : 'Material',
            'Jasa'      => $lang === 'en' ? 'Services' : 'Jasa',
            'Mesin'     => $lang === 'en' ? 'Machinery' : 'Mesin',
            'Peralatan' => $lang === 'en' ? 'Equipment' : 'Peralatan',
            'Logistik'  => $lang === 'en' ? 'Logistics' : 'Logistik',
            'Lainnya'   => $lang === 'en' ? 'Other' : 'Lainnya',
        ];

        $byCategory = $entries->groupBy('kategori')
            ->map(fn($group) => (float) $group->sum('harga_total'))
            ->sortDesc();

        $catLines = [];
        foreach ($byCategory as $cat => $amt) {
            $pct = $totalUsed > 0 ? round(($amt / $totalUsed) * 100, 1) : 0;
            $label = $categoryMap[$cat] ?? $cat;
            $catLines[] = "- **{$label}**: " . $this->formatRupiah($amt) . " ({$pct}%)";
        }

        $topLines = [];
        foreach ($entries->take(5) as $idx => $e) {
            $ref = $e->referensi ? " · Ref: `{$e->referensi}`" : '';
            $topLines[] = ($idx + 1) . ". **{$e->nama_item}** — " . $this->formatRupiah((float) $e->harga_total) . " (`{$e->code_sub_wbs}`{$ref})";
        }

        if ($lang === 'en') {
            $content = "### 💰 Budget Realization: {$project->title} (`#{$project->id}`)\n\n"
                . "- **Allocated Budget Ceiling**: " . $this->formatRupiah($totalBudget) . "\n"
                . "- **Realized Expenditure**: **" . $this->formatRupiah($totalUsed) . "** ({$usedPct}%)\n"
                . "- **Remaining Balance**: **" . $this->formatRupiah($remaining) . "**\n"
                . "- **Budget Health**: `{$health}` | **Total Transactions**: {$entries->count()} records\n";

            if (!empty($catLines)) {
                $content .= "\n**Spending by Category:**\n" . implode("\n", $catLines) . "\n";
            }
            if (!empty($topLines)) {
                $content .= "\n**Top Expenditure Items:**\n" . implode("\n", $topLines);
            } else {
                $content .= "\n*No budget expenditure transactions have been recorded for this project yet.*";
            }
        } else {
            $content = "### 💰 Ringkasan Realisasi Budget: {$project->title} (`#{$project->id}`)\n\n"
                . "- **Pagu Total Anggaran**: " . $this->formatRupiah($totalBudget) . "\n"
                . "- **Total Realisasi Terpakai**: **" . $this->formatRupiah($totalUsed) . "** ({$usedPct}%)\n"
                . "- **Sisa Anggaran**: **" . $this->formatRupiah($remaining) . "**\n"
                . "- **Kesehatan Anggaran**: `{$health}` | **Jumlah Transaksi**: {$entries->count()} catatan\n";

            if (!empty($catLines)) {
                $content .= "\n**Pengeluaran per Kategori:**\n" . implode("\n", $catLines) . "\n";
            }
            if (!empty($topLines)) {
                $content .= "\n**Item Pengeluaran Terbesar:**\n" . implode("\n", $topLines);
            } else {
                $content .= "\n*Belum ada transaksi pengeluaran budget yang tercatat pada proyek ini.*";
            }
        }

        return [
            'content' => trim($content),
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Budget Management' : 'Buka Budget Management', 'url' => "/budget?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_BUDGET',
            'context_update'  => [
                'project_id' => $project->id,
            ],
        ];
    }

    /**
     * Division Progress & Bottleneck Analysis Handler.
     */
    protected function handleDivisionProgressQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        if ($user->isWorker() && !$user->hasSidebarAccess('Division Progress')) {
            return $this->roleRestrictedResponse(
                $user,
                'Akun Anda tidak memiliki izin akses untuk melihat laporan **Division Progress** lintas divisi.',
                'Your account does not have permission to view cross-division **Division Progress** reports.',
                $lang
            );
        }

        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan proyek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_DIVISION_PROGRESS',
            ];
        }

        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $project->id))
            ->with(['division', 'divisions'])
            ->get();

        if ($tasks->isEmpty()) {
            return [
                'content'         => $lang === 'en'
                    ? "No WBS tasks have been created yet in **{$project->title}**."
                    : "Belum ada task WBS yang tercatat di proyek **{$project->title}**.",
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Division Progress' : 'Buka Division Progress', 'url' => "/projects/{$project->id}/division-progress"]],
                'resolved_intent' => 'QUERY_DIVISION_PROGRESS',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $now = Carbon::now('Asia/Jakarta');
        $groups = [];

        foreach ($tasks as $t) {
            $divNames = $t->divisions->pluck('divisi')->all();
            if (empty($divNames)) {
                $divNames = [$t->division?->divisi ?? 'General'];
            }

            $isDone        = $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100;
            $isOutstanding = !$isDone && $t->status === 'Outstanding';
            $isOverdue     = !$isDone && $t->end && Carbon::parse($t->end)->lt($now);

            foreach (array_unique($divNames) as $dName) {
                if (!isset($groups[$dName])) {
                    $groups[$dName] = ['name' => $dName, 'total' => 0, 'completed' => 0, 'outstanding' => 0, 'overdue' => 0, 'sum_progress' => 0.0];
                }
                $groups[$dName]['total']++;
                $groups[$dName]['sum_progress'] += $isDone ? 100.0 : (float) ($t->progress ?? 0);
                if ($isDone) {
                    $groups[$dName]['completed']++;
                }
                if ($isOutstanding) {
                    $groups[$dName]['outstanding']++;
                }
                if ($isOverdue) {
                    $groups[$dName]['overdue']++;
                }
            }
        }

        foreach ($groups as &$g) {
            $g['pct'] = $g['total'] > 0 ? round(($g['completed'] / $g['total']) * 100, 1) : 0;
        }
        unset($g);

        uasort($groups, fn($a, $b) => $b['pct'] <=> $a['pct']);

        $lines = [];
        $idx = 1;
        foreach ($groups as $g) {
            $badges = [];
            if ($g['outstanding'] > 0) {
                $badges[] = "🟣 {$g['outstanding']} Outstanding";
            }
            if ($g['overdue'] > 0) {
                $badges[] = "🔴 {$g['overdue']} Overdue";
            }
            $extra = !empty($badges) ? ' (' . implode(', ', $badges) . ')' : '';
            $lines[] = "{$idx}. **{$g['name']}** — **{$g['pct']}%** ({$g['completed']}/{$g['total']} " . ($lang === 'en' ? 'completed' : 'selesai') . "){$extra}";
            $idx++;
        }

        // Identify bottleneck division (lowest % with open tasks)
        $sortedByLag = array_values($groups);
        usort($sortedByLag, fn($a, $b) => ($a['pct'] <=> $b['pct']) ?: ($b['overdue'] <=> $a['overdue']));
        $bottleneck = $sortedByLag[0] ?? null;

        $bottleneckNote = '';
        if ($bottleneck && $bottleneck['pct'] < 100) {
            $bottleneckNote = $lang === 'en'
                ? "\n\n> ⚠️ **Attention Needed**: **{$bottleneck['name']}** currently has the lowest completion rate (**{$bottleneck['pct']}%**, {$bottleneck['overdue']} overdue, {$bottleneck['outstanding']} outstanding)."
                : "\n\n> ⚠️ **Perlu Perhatian**: Divisi **{$bottleneck['name']}** saat ini memiliki capaian terendah (**{$bottleneck['pct']}%**, {$bottleneck['overdue']} overdue, {$bottleneck['outstanding']} outstanding).";
        }

        $header = $lang === 'en'
            ? "### 👷 Division Progress Breakdown — {$project->title} (`#{$project->id}`)"
            : "### 👷 Progres Pekerjaan per Divisi — {$project->title} (`#{$project->id}`)";

        return [
            'content' => "{$header}\n\n" . implode("\n", $lines) . $bottleneckNote,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Division Progress' : 'Buka Division Progress', 'url' => "/projects/{$project->id}/division-progress"],
            ],
            'resolved_intent' => 'QUERY_DIVISION_PROGRESS',
            'context_update'  => [
                'project_id' => $project->id,
            ],
        ];
    }

    /**
     * S-Curve, SPI & Completion Forecast Analysis Handler.
     */
    protected function handleSCurveQuery(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        if ($user->isWorker() && !$user->hasSidebarAccess('S-Curve Report')) {
            return $this->roleRestrictedResponse(
                $user,
                'Akun Anda tidak memiliki izin akses untuk melihat **S-Curve Report** dan prediksi jadwal eksekutif.',
                'Your account does not have permission to view **S-Curve Report** and executive schedule forecasts.',
                $lang
            );
        }

        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found for S-Curve analysis.' : 'Tidak ditemukan proyek untuk analisis S-Curve.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_SCURVE',
            ];
        }

        $project->load(['mainWbs.subWbs.wbsTasks']);
        $scurve = $this->scurveService->calculate($project);
        $m = $scurve['metrics'] ?? [];

        $spi          = $m['spi'] ?? 1.0;
        $variance     = round((float) ($m['variance_progress'] ?? 0), 2);
        $varianceSign = $variance >= 0 ? "+{$variance}%" : "{$variance}%";
        $isDelayed    = (bool) ($m['is_delayed'] ?? false);
        $delayDays    = (int) ($m['delay_days'] ?? 0);
        $plannedEnd   = !empty($m['planned_end_date']) ? Carbon::parse($m['planned_end_date'])->format('d M Y') : '—';
        $forecastEnd  = !empty($m['forecast_end_date']) ? Carbon::parse($m['forecast_end_date'])->format('d M Y') : $plannedEnd;
        $overdueCount = (int) ($m['overdue_tasks_count'] ?? 0);
        $actualProg   = round((float) ($project->progress ?? 0), 2);

        $statusVerdict = $isDelayed
            ? ($lang === 'en' ? "⚠️ Behind Schedule (est. +{$delayDays} days delay)" : "⚠️ Tertinggal dari Rencana (estimasi mundur +{$delayDays} hari)")
            : ($lang === 'en' ? '✅ On Track / Ahead of Plan' : '✅ Sesuai / Lebih Cepat dari Rencana');

        if ($lang === 'en') {
            $content = "### 📈 S-Curve & Forecast Analysis: {$project->title} (`#{$project->id}`)\n\n"
                . "- **Current Actual Progress**: **{$actualProg}%**\n"
                . "- **Variance (Actual vs Planned)**: **{$varianceSign}**\n"
                . "- **SPI (Schedule Performance Index)**: **{$spi}**\n"
                . "- **Schedule Health**: {$statusVerdict}\n"
                . "- **Planned Finish**: {$plannedEnd} → **Predicted Finish**: **{$forecastEnd}**\n"
                . "- **Active Overdue Tasks**: **{$overdueCount}** tasks\n\n"
                . "> Prediction uses PROVIS *Curve Shifting* from the latest actual progress point.";
        } else {
            $content = "### 📈 Analisis S-Curve & Prediksi Penyelesaian: {$project->title} (`#{$project->id}`)\n\n"
                . "- **Progres Aktual Saat Ini**: **{$actualProg}%**\n"
                . "- **Deviasi (Actual vs Planned)**: **{$varianceSign}**\n"
                . "- **Indeks Kinerja Jadwal (SPI)**: **{$spi}**\n"
                . "- **Status Jadwal**: {$statusVerdict}\n"
                . "- **Target Selesai Rencana**: {$plannedEnd} → **Prediksi Selesai**: **{$forecastEnd}**\n"
                . "- **Task Overdue Aktif**: **{$overdueCount}** task\n\n"
                . "> Proyeksi dihitung dengan metode *Curve Shifting* yang menyambung langsung dari titik *Current Timeline* aktual.";
        }

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open S-Curve Report' : 'Buka S-Curve Report', 'url' => "/scurve?project_id={$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Weekly Progress' : 'Buka Weekly Progress', 'url' => "/weekly?project_id={$project->id}"],
            ],
            'resolved_intent' => 'QUERY_SCURVE',
            'context_update'  => [
                'project_id' => $project->id,
            ],
        ];
    }

    /**
     * Off-Plan / Overdue Recap Handler (Strictly RBAC Scoped!).
     */
    protected function handleRecapOffPlan(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $now             = Carbon::now('Asia/Jakarta');
        $origPrompt      = $tokenized['original_prompt'] ?? '';
        $asksAllProjects = (bool) preg_match('/\b(semua\s+(?:proyek|projek)|mana\s+saja|all\s+projects|which\s+projects|rekap\s+(?:proyek|projek))\b/i', $origPrompt);
        $asksSystemWide  = $this->tokenizer->isSystemWideScopePrompt($origPrompt);

        if ($user->isWorker() && ($asksAllProjects || $asksSystemWide)) {
            return $this->roleRestrictedResponse(
                $user,
                'Rekap deviasi dan keterlambatan seluruh proyek di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator** / Manajemen. Sebagai **Worker**, Anda hanya dapat mengecek task terlambat pada proyek yang ditugaskan kepada Anda.',
                'Multi-project / system-wide off-plan deviation recaps are restricted to **SuperAdministrator** / Management. As a **Worker**, you can only check overdue tasks in your assigned project.',
                $lang
            );
        }

        if (!$this->isSuperAdmin($user) && $asksSystemWide && !($user->isAdminUtama() && $user->getDataScope() === 'all')) {
            return $this->roleRestrictedResponse(
                $user,
                'Rekap keterlambatan seluruh proyek secara global di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                'System-wide off-plan recaps across all PROVIS projects are restricted to **SuperAdministrator** only.',
                $lang
            );
        }

        $query = $this->getAccessibleProjectsQuery($user)->with(['company', 'manager']);

        $explicitId = $this->tokenizer->extractProjectIdFromPrompt($origPrompt);

        if ($explicitId) {
            if (!in_array($explicitId, $this->getAccessibleProjectIds($user), true)) {
                return $this->deniedProjectResponse($explicitId, $lang);
            }
            $query->where('id', $explicitId);
        } elseif (!empty($tokenized['matched_projects'])) {
            $query->where('id', $tokenized['matched_projects'][0]['id']);
        } elseif ($activeProjectId && !$asksAllProjects) {
            $query->where('id', $activeProjectId);
        }

        $projects = $query->get();
        $offPlanList = [];
        $refs = [];

        foreach ($projects as $proj) {
            $overdueTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $proj->id))
                ->where('end', '<', $now->format('Y-m-d'))
                ->where('status', '!=', 'Completed')
                ->where('progress', '<', 100)
                ->get(['id', 'name', 'end', 'progress', 'status']);

            $outstandingCount = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $proj->id))
                ->where('status', 'Outstanding')
                ->where('progress', '<', 100)
                ->count();

            $isDelayed = ($proj->end && Carbon::parse($proj->end)->lt($now) && (float) $proj->progress < 100)
                || $overdueTasks->count() > 0;

            if ($isDelayed) {
                $offPlanList[] = [
                    'id'                => $proj->id,
                    'title'             => $proj->title,
                    'company'           => $proj->company?->name ?? '—',
                    'progress'          => round((float) ($proj->progress ?? 0), 2),
                    'end_date'          => $proj->end,
                    'overdue_count'     => $overdueTasks->count(),
                    'outstanding_count' => $outstandingCount,
                    'overdue_tasks'     => $overdueTasks->take(4),
                ];
            }
        }

        if (empty($offPlanList)) {
            $content = $lang === 'en'
                ? "🎉 **Excellent! All Accessible Projects Are On-Track**\n\nNo projects or WBS tasks are currently overdue."
                : "🎉 **Status Luar Biasa! Semua Proyek On-Track**\n\nTidak ada proyek maupun pekerjaan WBS yang mengalami keterlambatan (*overdue*) saat ini.\nSeluruh milestone berjalan sesuai rencana kerja.";

            return [
                'content' => $content,
                'actions' => [
                    ['type' => 'link', 'label' => $lang === 'en' ? 'Open Dashboard' : 'Buka Dashboard', 'url' => $this->isSuperAdmin($user) ? '/admin' : '/projectlistpage'],
                ],
                'resolved_intent' => 'RECAP_OFF_PLAN',
            ];
        }

        $count = count($offPlanList);
        $text = $lang === 'en'
            ? "⚠️ **Off-Plan Project Deviation & Overdue Tasks Recap**\n\nFound **{$count} project(s)** requiring attention:\n\n"
            : "⚠️ **Laporan Rekap Deviasi Proyek & Pekerjaan Terlambat (Off-Plan)**\n\nDitemukan **{$count} proyek** yang memerlukan perhatian khusus:\n\n";

        foreach ($offPlanList as $idx => $op) {
            $num = $idx + 1;
            $endFormatted = $op['end_date'] ? Carbon::parse($op['end_date'])->format('d M Y') : '—';
            $outTag = $op['outstanding_count'] > 0 ? " · 🟣 {$op['outstanding_count']} Outstanding PR" : '';

            if ($lang === 'en') {
                $text .= "{$num}. 📌 **{$op['title']}** (ID #{$op['id']}, {$op['company']})\n"
                    . "- Actual Progress: **{$op['progress']}%** (Target Finish: {$endFormatted})\n"
                    . "- Overdue Tasks: **{$op['overdue_count']} tasks**{$outTag}\n";
            } else {
                $text .= "{$num}. 📌 **{$op['title']}** (ID #{$op['id']}, {$op['company']})\n"
                    . "- Progres Aktual: **{$op['progress']}%** (Target Selesai: {$endFormatted})\n"
                    . "- Pekerjaan Overdue: **{$op['overdue_count']} tasks**{$outTag}\n";
            }

            foreach ($op['overdue_tasks'] as $ot) {
                $otEnd = $ot->end ? Carbon::parse($ot->end)->format('d/m/Y') : '—';
                $progLabel = $lang === 'en' ? 'Progress' : 'Progres';
                $text .= "  * _{$ot->name}_ (Deadline: {$otEnd}, {$progLabel}: {$ot->progress}%)\n";
            }
            $text .= "\n";
            $refs[] = ['index' => $num, 'id' => $op['id'], 'title' => $op['title']];
        }

        $text .= $lang === 'en'
            ? "> 💡 Follow-up: Say *\"Details of #1\"* or *\"S-Curve of #1\"* to inspect deeper."
            : "> 💡 Lanjutan: Ketik *\"Detail nomor 1\"* atau *\"Analisis S-Curve proyek pertama\"* untuk melihat lebih rinci.";

        $actions = [
            ['type' => 'link', 'label' => $lang === 'en' ? 'Review S-Curve' : 'Tinjau S-Curve', 'url' => '/scurve' . ($activeProjectId ? "?project_id={$activeProjectId}" : '')],
        ];
        if ($this->isSuperAdmin($user)) {
            array_unshift($actions, ['type' => 'link', 'label' => $lang === 'en' ? 'Open SuperAdmin Portal' : 'Buka Portal SuperAdmin', 'url' => '/admin']);
        }

        return [
            'content'         => trim($text),
            'actions'         => $actions,
            'resolved_intent' => 'RECAP_OFF_PLAN',
            'context_update'  => [
                'referenced_projects' => $refs,
                'referenced_tasks'    => [],
            ],
        ];
    }

    /**
     * PDF Executive Report Generator (RBAC Scoped).
     */
    protected function handleGeneratePdf(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en'
                    ? 'No accessible active project found to generate a report.'
                    : 'Tidak ditemukan proyek aktif yang dapat diakses untuk dibuatkan laporan.',
                'actions'         => [],
                'resolved_intent' => 'GENERATE_PDF',
            ];
        }

        $res = $this->pdfService->generateProjectPdf($project->id);

        if ($lang === 'en') {
            $content = "📄 **Executive Project Report Ready: {$project->title}**\n\n"
                . "Your official summary report (KPI cards, main WBS breakdown, and delay analysis) has been compiled.\n\n"
                . "Click the button below to open or print the report:";
        } else {
            $content = "📄 **Laporan Eksekutif Proyek Berhasil Disusun: {$project->title}**\n\n"
                . "Dokumen laporan resmi mencakup kartu KPI progres, rincian pekerjaan WBS utama, serta analisis keterlambatan telah siap.\n\n"
                . "Klik tombol di bawah untuk membuka dan mencetak laporan langsung:";
        }

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open / Print PDF Report' : 'Buka Laporan PDF / Cetak', 'url' => $res['url']],
            ],
            'resolved_intent' => 'GENERATE_PDF',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    /**
     * Code Updates & Git Changelog (SuperAdmin Only!).
     */
    protected function handleCodeUpdates(User $user, string $lang): array
    {
        if (!$this->isSuperAdmin($user)) {
            return [
                'content' => $lang === 'en'
                    ? '🔒 **Access Restricted**: Repository git changelog & code update history is restricted to **SuperAdministrator** only.'
                    : '🔒 **Akses Dibatasi**: Riwayat commit git dan pembaruan kode sistem hanya dapat diakses oleh **SuperAdministrator**.',
                'actions'         => [],
                'resolved_intent' => 'GET_CODE_UPDATES',
            ];
        }

        $markdown = $this->gitService->formatForAiPrompt(8);

        $content = $lang === 'en'
            ? "📝 **Recent Code Updates & Git Release Notes**\n\n{$markdown}\n\n💡 *SuperAdmin Note: Local repository is synced and ready.*"
            : "📝 **Dokumentasi Pembaruan Codingan & Release Notes Terakhir**\n\n{$markdown}\n\n💡 *Catatan SuperAdmin: Repositori lokal dalam kondisi sinkron dan siap dioperasikan.*";

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'System Audit Log' : 'Audit Log Sistem', 'url' => '/admin/audit-log'],
            ],
            'resolved_intent' => 'GET_CODE_UPDATES',
        ];
    }

    /**
     * Audit Log Query (Strictly RBAC Scoped!).
     */
    protected function handleAuditLogQuery(User $user, string $lang): array
    {
        if ($this->isSuperAdmin($user)) {
            $logs = AuditLog::with('user')->latest()->take(7)->get();
            $header = $lang === 'en'
                ? "📋 **Latest 7 System Audit Log Entries (Global):**\n\n"
                : "📋 **7 Aktivitas Audit Log Terakhir di Sistem:**\n\n";
            $actions = [['type' => 'link', 'label' => $lang === 'en' ? 'Open Full Audit Log' : 'Buka Audit Log Lengkap', 'url' => '/admin/audit-log']];
        } else {
            // Non-SuperAdmin: only show own audit logs + activity logs in their accessible projects
            $logs = AuditLog::with('user')
                ->where('user_id', $user->id)
                ->latest()
                ->take(7)
                ->get();
            $header = $lang === 'en'
                ? "📋 **Your Latest Activity Logs (Scoped to Your Account):**\n\n"
                : "📋 **Aktivitas Terakhir Akun Anda (Sesuai Hak Akses):**\n\n";
            $actions = [];
        }

        if ($logs->isEmpty()) {
            $msg = $lang === 'en'
                ? 'No recent audit log entries found within your access scope.'
                : 'Belum ada catatan aktivitas audit log pada cakupan akses akun Anda.';
            return [
                'content'         => $msg,
                'actions'         => $actions,
                'resolved_intent' => 'QUERY_AUDIT_LOG',
            ];
        }

        $text = $header;
        foreach ($logs as $l) {
            $actor = $l->metadata['actor'] ?? ($l->user?->username ?? 'System');
            $time  = $l->created_at ? Carbon::parse($l->created_at)->format('d/m/Y H:i') : '—';
            $by    = $lang === 'en' ? 'by' : 'oleh';
            $text .= "- `{$time}` [**{$l->action}**] {$by} *{$actor}*:\n  {$l->description}\n";
        }

        return [
            'content'         => trim($text),
            'actions'         => $actions,
            'resolved_intent' => 'QUERY_AUDIT_LOG',
        ];
    }

    /**
     * Users, Accounts (Akun), Roles (SuperAdmin, Admins, PICs, Workers) & Project Team Query (Strictly RBAC Scoped!).
     */
    protected function handleUsersQuery(
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang,
        string $prompt = '',
        array $tokenized = []
    ): array {
        $lower    = mb_strtolower($prompt);
        $concepts = $tokenized['concepts'] ?? $this->tokenizer->extractSemanticConcepts($prompt);
        $has      = fn(string $c): bool => !empty($concepts[$c]);

        // 1. Project PIC / Team / Workers Inside a Specific Project ("berapa orang/worker di projek KWT?", "siapa PIC proyek ini?")
        $explicitProjectTarget = !empty($tokenized['matched_projects'])
            || (bool) preg_match('/\b(di\s+(?:dalam\s+)?(?:proyek|projek|project)|dalam\s+(?:proyek|projek|project)|tim\s+(?:proyek|projek|project)|anggota\s+(?:tim|proyek|projek)|project\s+team|team\s+member|siapa\s+(?:pic|project\s+manager|manager|pm)|who\s+is\s+the\s+(?:pic|project\s+manager|manager)|yang\s+bisa\s+melihat\s+(?:proyek|projek))\b/i', $lower);

        if (
            $explicitProjectTarget
            && (!empty($tokenized['matched_projects']) || preg_match('/\b(proyek|projek|projekku|proyekku|project|tim|team)\b/i', $lower))
            && empty($tokenized['matched_companies'])
        ) {
            $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
            if ($resolved['denied']) {
                return $this->deniedProjectResponse($resolved['requested_id'], $lang);
            }
            $project = $resolved['project'];
            if ($project) {
                $project->load(['manager', 'company', 'projectMembers.user.role', 'projectMembers.division']);
                $picName  = $project->manager?->username ?? '—';
                $picEmail = $project->manager?->email ?? '—';
                $visLabel = $project->is_private ? 'Private' : 'Public';

                // Collect unique members from project_members AND permission_matrix.project_access
                $seenIds  = [];
                $members  = [];
                if ($project->manager) {
                    $seenIds[(int) $project->manager->id] = true;
                }
                foreach ($project->projectMembers as $pm) {
                    if ($pm->user && !isset($seenIds[(int) $pm->user->id])) {
                        $seenIds[(int) $pm->user->id] = true;
                        $members[] = [
                            'username' => $pm->user->username,
                            'email'    => $pm->user->email,
                            'role'     => $pm->user->role?->name ?? 'worker',
                            'division' => $pm->division?->divisi ?? ($pm->user->division?->divisi ?? 'General'),
                            'position' => $pm->position_title,
                        ];
                    }
                }

                // Also include company users granted view_project via permission_matrix
                $extraUsers = User::with(['role', 'division'])->whereNotNull('permission_matrix')->get();
                foreach ($extraUsers as $eu) {
                    if (!isset($seenIds[(int) $eu->id]) && !empty($eu->permission_matrix['project_access'][$project->id]['view_project'])) {
                        $seenIds[(int) $eu->id] = true;
                        $members[] = [
                            'username' => $eu->username,
                            'email'    => $eu->email,
                            'role'     => $eu->role?->name ?? 'worker',
                            'division' => $eu->division?->divisi ?? 'General',
                            'position' => 'View Access',
                        ];
                    }
                }

                // Optional filter if user asked specifically for workers inside this project
                $filterWorkerOnly = $has('ROLE_WORKER') && !$has('ROLE_PIC');
                if ($filterWorkerOnly) {
                    $members = array_values(array_filter($members, fn($m) => $m['role'] === 'worker'));
                }

                $memberLines = [];
                if (!$filterWorkerOnly) {
                    $memberLines[] = "- 👑 **{$picName}** (`{$picEmail}`) — **Project Manager (PIC)**";
                }
                foreach ($members as $m) {
                    $pos = $m['position'] ? " · *{$m['position']}*" : '';
                    $memberLines[] = "- 👤 **{$m['username']}** (`{$m['email']}`) — Role: `{$m['role']}` · Divisi: **{$m['division']}**{$pos}";
                }

                $totalInProject = count($members) + ($filterWorkerOnly ? 0 : ($project->manager ? 1 : 0));
                $countBadge     = $filterWorkerOnly
                    ? ($lang === 'en' ? "**{$totalInProject} Worker(s)**" : "**{$totalInProject} Worker**")
                    : ($lang === 'en' ? "**{$totalInProject} Member(s)** (1 PIC + " . count($members) . " team)" : "**{$totalInProject} Orang** (1 PIC + " . count($members) . " anggota)");

                $header = $lang === 'en'
                    ? "### 👥 Project Access, PIC & Team — {$project->title} (`#{$project->id}` · Visibility: `{$visLabel}`)\nTotal: {$countBadge}\n\n"
                    : "### 👥 Akses User, PIC & Anggota Tim — {$project->title} (`#{$project->id}` · Visibilitas: `{$visLabel}`)\nTotal: {$countBadge}\n\n";

                $body = !empty($memberLines)
                    ? implode("\n", $memberLines)
                    : ($lang === 'en' ? '*No matching members assigned to this project yet.*' : '*Belum ada anggota dengan kriteria tersebut yang ditugaskan ke proyek ini.*');

                return [
                    'content'         => $header . $body,
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"]],
                    'resolved_intent' => 'QUERY_USERS',
                    'context_update'  => ['project_id' => $project->id],
                ];
            }
        }

        if ($this->isSuperAdmin($user)) {
            $allUsers    = User::with(['role', 'division', 'company', 'companies'])->orderBy('id')->get();
            $totalUsers  = $allUsers->count();
            $superAdmins = $allUsers->filter(fn($u) => ($u->role?->name ?? '') === 'SuperAdmin')->values();
            $admins      = $allUsers->filter(fn($u) => in_array($u->role?->name ?? '', ['admin_utama', 'admin_progres'], true))->values();
            $pics        = $allUsers->filter(fn($u) => ($u->role?->name ?? '') === 'pic')->values();
            $workers     = $allUsers->filter(fn($u) => ($u->role?->name ?? '') === 'worker')->values();
            $betaTesters = $allUsers->filter(fn($u) => (bool) $u->is_ai_beta_tester)->values();

            // Check if user filtered by a specific Division or Company alongside account/role query
            $matchedDivs  = $tokenized['matched_divisions'] ?? [];
            $matchedComps = $tokenized['matched_companies'] ?? [];

            // 1b. Dynamic specific user/worker/account lookup by variable name ("cek akun WorkerMtc", "profil workr mtc", "cek akun wrk prd")
            $reqUserName = $tokenized['requested_user_name'] ?? null;
            if ($reqUserName !== null && empty($matchedComps)) {
                $uMatches = $this->tokenizer->matchUsersInPrompt($reqUserName, null, true);
                if (count($uMatches) === 1 || (count($uMatches) > 1 && ($uMatches[0]['score'] - $uMatches[1]['score']) >= 15)) {
                    $uModel = User::find($uMatches[0]['id']);
                    if ($uModel) {
                        return $this->renderUserProfileCard($uModel, $user, $lang, (bool) ($uMatches[0]['had_typo'] ?? false));
                    }
                }
                if (count($uMatches) > 1) {
                    $cands = array_map(fn($m) => ['id' => $m['id'], 'label' => $m['username']], array_slice($uMatches, 0, 5));
                    return $this->askTypoConfirmation($tokenized['original_prompt'] ?? $prompt, $reqUserName, $cands, $lang);
                }

                $heavyUserCands = $this->tokenizer->findHeavyTypoUsers($reqUserName, null);
                if (!empty($heavyUserCands)) {
                    return $this->askTypoConfirmation($tokenized['original_prompt'] ?? $prompt, $reqUserName, $heavyUserCands, $lang);
                }

                return [
                    'content'         => $lang === 'en'
                        ? "🔍 Account **{$reqUserName}** was not found in the local PROVIS database."
                        : "🔍 Akun **{$reqUserName}** belum ditemukan di database PROVIS.",
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                    'resolved_intent' => 'QUERY_USERS',
                ];
            }

            // Also support direct user/worker name lookup inside a prompt (e.g. "siapa WorkerMtc?", "info PicHanwa")
            if (empty($matchedComps) && empty($matchedDivs) && !$has('QUERY_COUNT') && !preg_match('/\b(semua|daftar|list|siapa\s+saja|berapa|jumlah|total)\b/i', $lower)) {
                $directUsers = $this->tokenizer->matchUsersInPrompt($tokenized['original_prompt'] ?? $prompt, null, false);
                if (count($directUsers) === 1 || (count($directUsers) > 1 && ($directUsers[0]['score'] - $directUsers[1]['score']) >= 15)) {
                    $uModel = User::find($directUsers[0]['id']);
                    if ($uModel) {
                        return $this->renderUserProfileCard($uModel, $user, $lang, (bool) ($directUsers[0]['had_typo'] ?? false));
                    }
                }
            }

            // If user explicitly asked "jumlah karyawan di (nama pt)" and that PT does not exist in DB yet,
            // tell them clearly instead of dumping the global total across all companies!
            if (empty($matchedComps) && !empty($tokenized['requested_company_name'])) {
                return $this->companyNotFoundResponse($tokenized['requested_company_name'], $user, $lang);
            }

            $wantsSuperAdmin = $has('ROLE_SUPERADMIN');
            $wantsAdmin      = $has('ROLE_ADMIN') && !$wantsSuperAdmin;
            $wantsPic        = $has('ROLE_PIC');
            $wantsWorker     = $has('ROLE_WORKER');
            $wantsBeta       = $has('ROLE_BETA');
            $wantsRecent     = (bool) preg_match('/\b((?:user|akun|pengguna)\s+terbaru|baru\s+dibuat|recently\s+created|recent\s+users)\b/i', $lower);

            $roleFlags = array_filter([
                'superadmin' => $wantsSuperAdmin,
                'admin'      => $wantsAdmin,
                'pic'        => $wantsPic,
                'worker'     => $wantsWorker,
                'beta'       => $wantsBeta,
            ]);

            // A. Combined Division / Company filter (e.g. "akun divisi IT", "worker divisi Maintenance", "akun di PT Karabha")
            if (!empty($matchedDivs) || !empty($matchedComps)) {
                $filtered = $allUsers;
                $tags     = [];

                if (!empty($matchedDivs)) {
                    $divId   = (int) $matchedDivs[0]['id'];
                    $divName = $matchedDivs[0]['name'];
                    $filtered = $filtered->filter(fn($u) => (int) $u->divisions_id === $divId);
                    $tags[]   = ($lang === 'en' ? 'Division' : 'Divisi') . ": **{$divName}**";
                }
                if (!empty($matchedComps)) {
                    $compId   = (int) $matchedComps[0]['id'];
                    $compName = $matchedComps[0]['name'];
                    $filtered = $filtered->filter(fn($u) => (int) $u->companies_id === $compId || $u->companies->contains('id', $compId));
                    $tags[]   = ($lang === 'en' ? 'Company' : 'Perusahaan') . ": **{$compName}**";
                }
                if ($wantsWorker) {
                    $filtered = $filtered->filter(fn($u) => ($u->role?->name ?? '') === 'worker');
                    $tags[]   = 'Role: `worker`';
                } elseif ($wantsPic) {
                    $filtered = $filtered->filter(fn($u) => ($u->role?->name ?? '') === 'pic');
                    $tags[]   = 'Role: `pic`';
                } elseif ($wantsAdmin) {
                    $filtered = $filtered->filter(fn($u) => in_array($u->role?->name ?? '', ['admin_utama', 'admin_progres'], true));
                    $tags[]   = 'Role: `admin`';
                }

                $filtered = $filtered->values();
                $tagStr   = implode(' · ', $tags);
                $lines    = $filtered->map(fn($u, $i) => ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Role: `" . ($u->role?->name ?? 'worker') . "` · Divisi: **" . ($u->division?->divisi ?? 'General') . "**")->all();

                // Add role breakdown summary when querying all accounts in a specific company/division!
                $breakdownLine = '';
                if (!$wantsWorker && !$wantsPic && !$wantsAdmin && $filtered->isNotEmpty()) {
                    $fSa   = $filtered->filter(fn($u) => ($u->role?->name ?? '') === 'SuperAdmin')->count();
                    $fAdm  = $filtered->filter(fn($u) => in_array($u->role?->name ?? '', ['admin_utama', 'admin_progres'], true))->count();
                    $fPic  = $filtered->filter(fn($u) => ($u->role?->name ?? '') === 'pic')->count();
                    $fWork = $filtered->filter(fn($u) => ($u->role?->name ?? '') === 'worker')->count();
                    $parts = [];
                    if ($fSa > 0) $parts[] = "**{$fSa}** SuperAdmin";
                    if ($fAdm > 0) $parts[] = "**{$fAdm}** Admin";
                    if ($fPic > 0) $parts[] = "**{$fPic}** PIC";
                    if ($fWork > 0) $parts[] = "**{$fWork}** Worker";
                    if (!empty($parts)) {
                        $breakdownLine = ($lang === 'en' ? 'Role Breakdown: ' : 'Rincian Role: ') . implode(' · ', $parts) . "\n\n";
                    }
                }

                $content = ($lang === 'en'
                    ? "### 👥 Matching Accounts — **{$filtered->count()} account(s)** ({$tagStr})\n\n"
                    : "### 👥 Daftar Akun — **{$filtered->count()} akun** ({$tagStr})\n\n")
                    . $breakdownLine
                    . (!empty($lines) ? implode("\n", $lines) : ($lang === 'en' ? 'No accounts match that filter.' : 'Tidak ada akun yang cocok dengan filter tersebut.'));

                return [
                    'content'         => $content,
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                    'resolved_intent' => 'QUERY_USERS',
                ];
            }

            // B. Single specific role query (e.g. "jumlah akun worker", "berapa akun pic", "siapa saja admin?", "beta tester")
            if (count($roleFlags) === 1) {
                $onlyRole = array_key_first($roleFlags);

                if ($onlyRole === 'worker') {
                    $lines = $workers->map(function ($u, $i) {
                        $div  = $u->division?->divisi ?? 'General';
                        $comp = $u->company?->name ?? '—';
                        return ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Divisi: **{$div}** · Perusahaan: *{$comp}*";
                    })->all();

                    $content = ($lang === 'en'
                        ? "### 👷 Worker Accounts in PROVIS — **{$workers->count()} Workers** (out of {$totalUsers} total accounts)\n\n"
                        : "### 👷 Jumlah Akun Worker di PROVIS: **{$workers->count()} akun** *(dari total {$totalUsers} akun)*\n\n")
                        . (!empty($lines) ? implode("\n", $lines) : '—');

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }

                if ($onlyRole === 'pic') {
                    $lines = $pics->map(function ($u, $i) {
                        $comp = $u->company?->name ?? '—';
                        $div  = $u->division?->divisi ?? 'General';
                        return ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Divisi: **{$div}** · Perusahaan: *{$comp}*";
                    })->all();

                    $content = ($lang === 'en'
                        ? "### 🪪 PIC Accounts in PROVIS — **{$pics->count()} PICs** (out of {$totalUsers} total accounts)\n\n"
                        : "### 🪪 Jumlah Akun PIC di PROVIS: **{$pics->count()} akun** *(dari total {$totalUsers} akun)*\n\n")
                        . (!empty($lines) ? implode("\n", $lines) : '—');

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }

                if ($onlyRole === 'admin') {
                    $lines = $admins->map(function ($u, $i) {
                        $rName = $u->role?->name ?? 'admin';
                        $comp  = $u->company?->name ?? 'All Companies';
                        return ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Role: `{$rName}` · Scope: *{$comp}*";
                    })->all();

                    $content = ($lang === 'en'
                        ? "### 🛡️ Admin Accounts in PROVIS — **{$admins->count()} Admins** (+ **{$superAdmins->count()} SuperAdmin**)\n\n"
                        : "### 🛡️ Jumlah Akun Admin di PROVIS: **{$admins->count()} Admin** *(+ {$superAdmins->count()} SuperAdmin)*\n\n")
                        . "**SuperAdmin**: " . $superAdmins->pluck('username')->implode(', ') . "\n\n"
                        . (!empty($lines) ? implode("\n", $lines) : '—');

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }

                if ($onlyRole === 'superadmin') {
                    $lines = $superAdmins->map(fn($u, $i) => ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Role: `SuperAdmin`")->all();
                    $content = ($lang === 'en'
                        ? "### 👑 SuperAdmin Accounts in PROVIS — **{$superAdmins->count()} account(s)**\n\n"
                        : "### 👑 Jumlah Akun SuperAdmin di PROVIS: **{$superAdmins->count()} akun**\n\n")
                        . (!empty($lines) ? implode("\n", $lines) : '—');

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }

                if ($onlyRole === 'beta') {
                    $lines = $betaTesters->map(fn($u, $i) => ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Role: `" . ($u->role?->name ?? 'worker') . "`")->all();
                    $content = ($lang === 'en'
                        ? "### 🤖 Provis AI Access Accounts — **{$betaTesters->count()} Beta Tester(s)** + **{$superAdmins->count()} SuperAdmin(s)**\n\n"
                        : "### 🤖 Akun dengan Akses Provis AI — **{$betaTesters->count()} Beta Tester** + **{$superAdmins->count()} SuperAdmin**\n\n")
                        . "**SuperAdmin** *(otomatis punya akses AI)*: " . $superAdmins->pluck('username')->implode(', ') . "\n\n"
                        . "**AI Beta Testers**:\n"
                        . (!empty($lines) ? implode("\n", $lines) : ($lang === 'en' ? 'None enabled yet.' : 'Belum ada akun non-admin yang diaktifkan.'));

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }
            }

            if ($wantsRecent) {
                $recent = User::with(['role', 'division'])->latest('id')->take(8)->get();
                $lines  = $recent->values()->map(fn($u, $i) => ($i + 1) . ". **{$u->username}** (`{$u->email}`) — Role: `" . ($u->role?->name ?? 'worker') . "` · Divisi: " . ($u->division?->divisi ?? 'General'))->all();

                $content = ($lang === 'en'
                    ? "### 🆕 Recently Created Accounts (Latest 8 of {$totalUsers})\n\n"
                    : "### 🆕 Daftar Akun Terbaru (8 Terakhir dari {$totalUsers} Akun)\n\n")
                    . implode("\n", $lines);

                return [
                    'content'         => $content,
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                    'resolved_intent' => 'QUERY_USERS',
                ];
            }

            // C. Default SuperAdmin comprehensive account & role summary ("ada berapa akun di sistem provis ini?", "jumlah akun di provis")
            $picPreview    = $pics->take(6)->pluck('username')->implode(', ') . ($pics->count() > 6 ? ', ...' : '');
            $adminPreview  = $admins->pluck('username')->implode(', ') ?: '—';
            $workerPreview = $workers->take(6)->pluck('username')->implode(', ') . ($workers->count() > 6 ? ', ...' : '');

            if ($lang === 'en') {
                $content = "👥 **Total Registered Accounts in PROVIS: {$totalUsers} Users**\n\n"
                    . "- **Super Administrators ({$superAdmins->count()})**: " . $superAdmins->pluck('username')->implode(', ') . " (Automatic Full AI Access)\n"
                    . "- **Admins ({$admins->count()})**: {$adminPreview}\n"
                    . "- **PICs / Project Managers ({$pics->count()})**: {$picPreview}\n"
                    . "- **Workers ({$workers->count()})**: {$workerPreview}\n"
                    . "- **AI Beta Testers ({$betaTesters->count()})**: " . ($betaTesters->isNotEmpty() ? $betaTesters->pluck('username')->implode(', ') : 'No non-admin users enabled yet.') . "\n\n"
                    . "> 💡 Ask *\"List all Workers\"*, *\"List all PICs\"*, *\"List all Admins\"*, or *\"Accounts in IT division\"* to drill down.";
            } else {
                $content = "👥 **Total Akun Terdaftar di Sistem PROVIS: {$totalUsers} Akun**\n\n"
                    . "- **Super Administrator ({$superAdmins->count()})**: " . $superAdmins->pluck('username')->implode(', ') . " (Akses AI Penuh Otomatis)\n"
                    . "- **Admins ({$admins->count()})**: {$adminPreview}\n"
                    . "- **PIC / Project Manager ({$pics->count()})**: {$picPreview}\n"
                    . "- **Workers ({$workers->count()})**: {$workerPreview}\n"
                    . "- **Akun dengan Hak AI Beta Tester ({$betaTesters->count()})**: " . ($betaTesters->isNotEmpty() ? $betaTesters->pluck('username')->implode(', ') : 'Belum ada akun non-admin yang dicentang.') . "\n\n"
                    . "> 💡 Kamu bisa lanjut tanya spesifik seperti *\"Jumlah akun worker\"*, *\"Siapa saja PIC?\"*, *\"Siapa saja Admin?\"*, atau *\"Akun di divisi IT\"*.";
            }

            return [
                'content' => $content,
                'actions' => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/admin/users']],
                'resolved_intent' => 'QUERY_USERS',
            ];
        }

        // Non-SuperAdmin: enforce strict RBAC before showing any user directory or account counts!
        $asksSystemWide = $this->tokenizer->isSystemWideScopePrompt($prompt);
        $asksAccountStats = $has('QUERY_COUNT')
            || $has('ROLE_SUPERADMIN')
            || $has('ROLE_ADMIN')
            || $has('ROLE_BETA')
            || (bool) preg_match('/\b(akun|account|accounts|jumlah\s+(?:user|pengguna|worker|pic|admin)|ada\s+berapa\s+(?:user|akun|worker|pic|admin)|daftar\s+(?:user|akun|pengguna)|siapa\s+saja\s+(?:user|akun|worker|pic|admin))\b/i', $lower);

        // Worker CANNOT query account counts, role lists, or user directories (only active project team/PIC!)
        if ($user->isWorker() && ($asksSystemWide || $asksAccountStats)) {
            return $this->roleRestrictedResponse(
                $user,
                'Data jumlah akun, daftar pengguna, dan rincian role di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator** / Manajemen. Sebagai **Worker**, Anda hanya dapat menanyakan anggota tim atau PIC pada proyek yang ditugaskan kepada Anda.',
                'Account counts, user directories, and role breakdowns across PROVIS are restricted to **SuperAdministrator** / Management. As a **Worker**, you can only view the team/PIC of your assigned project.',
                $lang
            );
        }

        // Admin Progres does not have User Management access
        if ($user->isAdminProgres() && ($asksSystemWide || $asksAccountStats)) {
            return $this->roleRestrictedResponse(
                $user,
                'Data manajemen akun dan direktori pengguna tidak tersedia untuk role `admin_progres`.',
                'User directory and account statistics are not available for the `admin_progres` role.',
                $lang
            );
        }

        // PIC / Admin Utama CANNOT query global system-wide accounts, SuperAdmin list, or AI Beta Testers
        if (($asksSystemWide || $has('ROLE_SUPERADMIN') || $has('ROLE_BETA')) && !($user->isAdminUtama() && $user->getDataScope() === 'all')) {
            return $this->roleRestrictedResponse(
                $user,
                'Statistik akun global seluruh sistem PROVIS (termasuk SuperAdmin & AI Beta Tester) hanya dapat diakses oleh **SuperAdministrator**.',
                'Global system-wide account statistics (including SuperAdmins & AI Beta Testers) are restricted to **SuperAdministrator** only.',
                $lang
            );
        }

        // Scoped to own company users (PIC / Admin Utama)
        $companyIds = $user->getCompanyIds();
        if ($user->isAdminUtama() || $user->isPic()) {
            // If user explicitly asked about a company outside their assigned company scope -> deny!
            $reqMatchedComp = $tokenized['matched_companies'][0] ?? null;
            if ($reqMatchedComp && !in_array((int) $reqMatchedComp['id'], $companyIds, true) && !($user->isAdminUtama() && $user->getDataScope() === 'all')) {
                return $this->roleRestrictedResponse(
                    $user,
                    "Data karyawan/akun milik **{$reqMatchedComp['name']}** berada di luar cakupan perusahaan akun Anda.",
                    "Employee/account data for **{$reqMatchedComp['name']}** is outside your assigned company scope.",
                    $lang
                );
            }
            if (!$reqMatchedComp && !empty($tokenized['requested_company_name'])) {
                return $this->companyNotFoundResponse($tokenized['requested_company_name'], $user, $lang);
            }

            if (empty($companyIds)) {
                return [
                    'content'         => $lang === 'en' ? 'No users found within your company scope.' : 'Tidak ditemukan data akun pada cakupan perusahaan Anda.',
                    'actions'         => [],
                    'resolved_intent' => 'QUERY_USERS',
                ];
            }

            // Dynamic specific account lookup scoped strictly to user's own company!
            $reqUserName = $tokenized['requested_user_name'] ?? null;
            if ($reqUserName !== null) {
                $uMatches = $this->tokenizer->matchUsersInPrompt($reqUserName, $companyIds, true);
                if (count($uMatches) === 1 || (count($uMatches) > 1 && ($uMatches[0]['score'] - $uMatches[1]['score']) >= 15)) {
                    $uModel = User::find($uMatches[0]['id']);
                    if ($uModel) {
                        return $this->renderUserProfileCard($uModel, $user, $lang, (bool) ($uMatches[0]['had_typo'] ?? false));
                    }
                }
                if (count($uMatches) > 1) {
                    $cands = array_map(fn($m) => ['id' => $m['id'], 'label' => $m['username']], array_slice($uMatches, 0, 5));
                    return $this->askTypoConfirmation($tokenized['original_prompt'] ?? $prompt, $reqUserName, $cands, $lang);
                }
                $heavyUserCands = $this->tokenizer->findHeavyTypoUsers($reqUserName, $companyIds);
                if (!empty($heavyUserCands)) {
                    return $this->askTypoConfirmation($tokenized['original_prompt'] ?? $prompt, $reqUserName, $heavyUserCands, $lang);
                }
                return [
                    'content'         => $lang === 'en'
                        ? "🔍 Account **{$reqUserName}** was not found within your company scope."
                        : "🔍 Akun **{$reqUserName}** tidak ditemukan pada cakupan perusahaan Anda.",
                    'actions'         => [],
                    'resolved_intent' => 'QUERY_USERS',
                ];
            }

            $companyUsers = User::with(['role', 'division'])
                ->where(function ($q) use ($companyIds) {
                    $q->whereIn('companies_id', $companyIds)
                      ->orWhereHas('companies', fn($cq) => $cq->whereIn('companies.id', $companyIds));
                })
                ->get();

            if ($has('ROLE_WORKER')) {
                $companyUsers = $companyUsers->filter(fn($u) => ($u->role?->name ?? '') === 'worker')->values();
            } elseif ($has('ROLE_PIC')) {
                $companyUsers = $companyUsers->filter(fn($u) => ($u->role?->name ?? '') === 'pic')->values();
            }

            $lines = $companyUsers->take(20)->map(fn($u) => "- **{$u->username}** (`" . ($u->role?->name ?? 'worker') . "`) — " . ($u->division?->divisi ?? 'General'))->all();
            $header = $lang === 'en'
                ? "👥 **Accounts in Your Company ({$companyUsers->count()} total):**\n\n"
                : "👥 **Daftar Akun di Perusahaan Anda (Total {$companyUsers->count()} akun):**\n\n";

            return [
                'content'         => $header . (!empty($lines) ? implode("\n", $lines) : '—'),
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => '/users']],
                'resolved_intent' => 'QUERY_USERS',
            ];
        }

        // Worker: show team members of their accessible/active project
        $projectId = $activeProjectId ?: ($sessionContext['project_id'] ?? ($this->getAccessibleProjectIds($user)[0] ?? null));
        $project   = $projectId ? Project::with(['manager', 'projectMembers.user', 'projectMembers.division'])->find($projectId) : null;

        if (!$project || !$this->canUserViewProject($user, $project)) {
            return [
                'content'         => $lang === 'en' ? 'No team directory available for your current scope.' : 'Tidak ada daftar tim proyek yang tersedia untuk akun Anda.',
                'actions'         => [],
                'resolved_intent' => 'QUERY_USERS',
            ];
        }

        $memberLines = ["- **{$project->manager?->username}** (*Project Manager / PIC*)"];
        foreach ($project->projectMembers as $pm) {
            if ($pm->user) {
                $memberLines[] = "- **{$pm->user->username}** — " . ($pm->division?->divisi ?? 'General') . ($pm->position_title ? " ({$pm->position_title})" : '');
            }
        }

        $header = $lang === 'en'
            ? "👥 **Project Team — {$project->title}:**\n\n"
            : "👥 **Anggota Tim Proyek — {$project->title}:**\n\n";

        return [
            'content'         => $header . implode("\n", $memberLines),
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"]],
            'resolved_intent' => 'QUERY_USERS',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    // =========================================================================
    // INTERACTIVE MULTI-TURN SLOT-FILLING ENGINE (pending_draft) & REVISION
    // =========================================================================

    /**
     * Detect if the user clearly abandoned the current draft to ask a completely unrelated question.
     */
    protected function isDraftTopicSwitch(string $prompt, array $tokenized, array $draft): bool
    {
        if ($this->tokenizer->isClearlyOutOfScope($prompt)) {
            return true;
        }

        $intent    = $tokenized['action_intent'] ?? 'GENERAL_QUERY';
        $awaiting  = $draft['awaiting_slot'] ?? '';
        $concepts  = $tokenized['concepts'] ?? [];
        $hasQWord  = !empty($concepts['QUERY_COUNT']) || !empty($concepts['QUERY_LIST']) || str_contains($prompt, '?');

        // Explicit how-to / conceptual questions or unrelated analytical read queries ALWAYS switch topic
        if (in_array($intent, [
            'KNOWLEDGE_BASE', 'QUERY_SYSTEM_OVERVIEW', 'QUERY_BUDGET', 'QUERY_SCURVE',
            'QUERY_DIVISION_PROGRESS', 'QUERY_TODAY_TASKS', 'RECAP_OFF_PLAN', 'GENERATE_PDF',
            'GET_CODE_UPDATES', 'QUERY_AUDIT_LOG', 'QUERY_TEMPLATES', 'QUERY_WBS_STRUCTURE',
            'LIST_PROJECTS', 'CALCULATE_MATH',
        ], true)) {
            return true;
        }

        // Questions about users/accounts/companies/divisions/tasks/summary (with "berapa", "jumlah", "daftar", "siapa", or "?")
        // MUST break out of an old draft so the user is NEVER trapped!
        if (in_array($intent, ['QUERY_USERS', 'QUERY_COMPANIES', 'QUERY_DIVISIONS', 'QUERY_TASKS', 'QUERY_SUMMARY'], true)) {
            if ($hasQWord) {
                return true;
            }
            // If they aren't answering the matching entity slot (e.g. they said "jumlah akun worker" while draft awaits project title), switch topic!
            if ($intent === 'QUERY_USERS' && $awaiting !== 'user') {
                return true;
            }
            if ($intent === 'QUERY_COMPANIES' && $awaiting !== 'company') {
                return true;
            }
            if ($intent === 'QUERY_TASKS' && !in_array($awaiting, ['task', 'predecessor', 'status'], true)) {
                return true;
            }
        }

        // If user explicitly greets, thanks, asks capabilities, or asks time/no-api, switch topic
        // (Do NOT treat short project/task names like "TESTING" or "Test 1" as a greeting when awaiting a name!)
        if ($intent === 'GREETING_OR_SMALLTALK') {
            $lowerPrompt = mb_strtolower(trim($prompt));
            if (preg_match('/\b(halo|hallo|hello|hai|hi|hey|pagi|siang|sore|malam|apa\s+kabar|terima\s*kasih|makasih|thanks|jam\s+berapa|tanggal\s+berapa|pakai\s+api|gemini|gpt|qwen|bisa\s+(?:untuk|buat|bantu)\s+apa|help)\b/i', $lowerPrompt)) {
                return true;
            }
            if (!in_array($awaiting, ['title', 'task_name', 'company', 'username', 'role', 'division', 'email'], true)) {
                return true;
            }
        }

        // Starting a different write action switches topic (unless it's the same draft type!)
        $draftType = $draft['type'] ?? '';
        $writeIntents = ['CREATE_PROJECT', 'CREATE_USER', 'MANAGE_PROJECT_ACCESS', 'ADD_TASK', 'UPDATE_TASK_STATUS', 'UPDATE_TASK_PROGRESS', 'SET_PREDECESSOR', 'UPDATE_SCHEDULE', 'RECONCILE_DATES'];
        if (in_array($intent, $writeIntents, true) && $intent !== $draftType) {
            // Allow duration/schedule words when answering CREATE_PROJECT duration slot
            if (!($draftType === 'CREATE_PROJECT' && $awaiting === 'duration' && $intent === 'UPDATE_SCHEDULE')) {
                return true;
            }
        }

        return false;
    }

    protected function cancelPendingDraft(array $draft, string $lang): array
    {
        return [
            'content' => $lang === 'en'
                ? 'Okay, cancelled! No changes were made. Let me know if there is anything else you want to check or do.'
                : 'Oke, dibatalkan ya! Tidak ada perubahan yang disimpan. Ada hal lain yang mau dibantu?',
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => null,
            'resolved_intent' => 'CANCEL_PENDING_ACTION',
        ];
    }

    /**
     * Allow the user to tweak a field directly at the confirmation step without starting over!
     * e.g. "eh ganti durasinya jadi 90 hari", "tasknya kosong aja", "ganti perusahaannya jadi PT. Maju".
     */
    protected function tryRevisePendingAction(
        string $prompt,
        array $tokenized,
        array $pendingAction,
        User $user,
        string $lang
    ): ?array {
        $type  = $pendingAction['type'] ?? '';
        $lower = mb_strtolower(trim($prompt));

        if ($type === 'CREATE_PROJECT') {
            $payload = $pendingAction['payload'] ?? [];
            $revised = false;

            $newWbs = $this->tokenizer->extractWbsMode($prompt);
            if ($newWbs !== null && preg_match('/\b(kosong|manual|tanpa|default|17|template|ganti|ubah|pakai|pake)\b/i', $lower)) {
                $payload['wbs_mode'] = $newWbs;
                $revised = true;
            }

            $newDur = $this->tokenizer->extractDuration($prompt);
            if ($newDur !== null) {
                $start = $payload['start_date'] ?? Carbon::today('Asia/Jakarta')->format('Y-m-d');
                $payload['end_date']       = $this->computeEndDateFromDuration($start, $newDur);
                $payload['duration_label'] = $lang === 'en' ? $newDur['label_en'] : $newDur['label_id'];
                $revised = true;
            }

            if (preg_match('/\b(ganti|ubah|revisi|ralat|perusahaan|pt\.|cv\.)\b/i', $lower)) {
                $newComp = $this->tokenizer->extractCompanyInfo($prompt, false);
                if ($newComp !== null) {
                    $payload['company_id']     = $newComp['id'];
                    $payload['company_name']   = $newComp['name'];
                    $payload['company_is_new'] = $newComp['is_new'];
                    $revised = true;
                }
            }

            if (preg_match('/\b(ganti|ubah|revisi|ralat)\s+nama\s+(?:projek|proyek|project)?\s*(?:jadi|ke)?\s*(.+)$/i', $prompt, $mTitle)) {
                $newTitle = $this->tokenizer->extractProjectTitleFromPrompt($mTitle[2], true);
                if ($newTitle) {
                    $payload['title'] = Str::limit($newTitle, 80, '');
                    $revised = true;
                }
            }

            if ($revised) {
                return $this->buildCreateProjectDraftOrConfirm($payload, $user, $lang);
            }
        }

        if ($type === 'CREATE_USER') {
            $payload = $pendingAction['payload'] ?? [];
            $revised = false;

            $newEmail = $this->tokenizer->extractEmailFromPrompt($prompt);
            if ($newEmail !== null) {
                $payload['email'] = $newEmail;
                $payload['email_auto'] = false;
                $revised = true;
            }

            $newPwd = $this->tokenizer->extractPasswordFromPrompt($prompt);
            if ($newPwd !== null) {
                $payload['password'] = $newPwd;
                $payload['password_auto'] = false;
                $revised = true;
            }

            $newRole = $this->tokenizer->extractUserCreationRole($prompt);
            if ($newRole !== null) {
                $payload['role_id']    = $newRole['id'];
                $payload['role_name']  = $newRole['name'];
                $payload['role_label'] = $newRole['label'];
                $revised = true;
            }

            if (preg_match('/\b(ganti|ubah|revisi|ralat)\s+nama\s*(?:akun|user)?\s*(?:jadi|ke)?\s*(.+)$/i', $prompt, $mUName)) {
                $newName = $this->tokenizer->extractUserCreationName($mUName[2], true);
                if ($newName !== null) {
                    $payload['username'] = $newName;
                    $revised = true;
                }
            }

            if (preg_match('/\b(ganti|ubah|revisi|ralat|perusahaan|pt\.|cv\.)\b/i', $lower)) {
                $newComp = $this->tokenizer->extractCompanyInfo($prompt, false);
                if ($newComp !== null && empty($newComp['is_new'])) {
                    $payload['company_id']   = $newComp['id'];
                    $payload['company_name'] = $newComp['name'];
                    $revised = true;
                }
            }

            if (!empty($tokenized['matched_divisions'])) {
                $payload['division_id']   = $tokenized['matched_divisions'][0]['id'];
                $payload['division_name'] = $tokenized['matched_divisions'][0]['name'];
                $revised = true;
            }

            if ($revised) {
                return $this->buildCreateUserDraftOrConfirm($payload, $user, $lang);
            }
        }

        if ($type === 'UPDATE_SCHEDULE') {
            $newDur = $this->tokenizer->extractDuration($prompt);
            if ($newDur !== null) {
                $payload = $pendingAction['payload'] ?? [];
                $task    = Wbs::find($payload['task_id'] ?? null);
                $project = Project::find($payload['project_id'] ?? null);
                if ($task && $project) {
                    $start = $payload['start'] ?? ($task->start ? Carbon::parse($task->start)->format('Y-m-d') : Carbon::today('Asia/Jakarta')->format('Y-m-d'));
                    $payload['duration_days'] = $newDur['days'];
                    $payload['end']           = Carbon::parse($start)->addDays(max(0, $newDur['days'] - 1))->format('Y-m-d');
                    return $this->buildScheduleConfirmResponse($project, $task, $payload, $lang);
                }
            }
        }

        return null;
    }

    /**
     * Continue filling slots of an active interactive draft without asking the user to repeat previous answers!
     */
    protected function continuePendingDraft(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $draft    = $sessionContext['pending_draft'] ?? [];
        $type     = $draft['type'] ?? '';
        $data     = $draft['data'] ?? [];
        $awaiting = $draft['awaiting_slot'] ?? '';

        switch ($type) {
            case 'CREATE_PROJECT':
                // Merge any newly provided fields from the user's reply (1 field or multiple at once!)
                $dur = $this->tokenizer->extractDuration($prompt);
                if ($dur === null && $awaiting === 'duration' && preg_match('/^\s*(\d{1,4})\s*$/', trim($prompt), $mBareDays)) {
                    $days = max(1, (int) $mBareDays[1]);
                    $dur  = [
                        'value'    => $days,
                        'unit'     => 'days',
                        'days'     => $days,
                        'label_id' => "{$days} hari",
                        'label_en' => "{$days} " . ($days === 1 ? 'day' : 'days'),
                    ];
                }
                if ($dur !== null) {
                    $start = $data['start_date'] ?? ($tokenized['dates'][0]['date'] ?? Carbon::today('Asia/Jakarta')->format('Y-m-d'));
                    $data['start_date']     = $start;
                    $data['end_date']       = $this->computeEndDateFromDuration($start, $dur);
                    $data['duration_days']  = $dur['days'];
                    $data['duration_label'] = $lang === 'en' ? $dur['label_en'] : $dur['label_id'];
                } elseif (!empty($tokenized['dates'])) {
                    $dates = $tokenized['dates'];
                    if (count($dates) >= 2) {
                        $data['start_date']     = $dates[0]['date'];
                        $data['end_date']       = $dates[1]['date'];
                        $diff                   = max(1, Carbon::parse($dates[0]['date'])->diffInDays(Carbon::parse($dates[1]['date'])) + 1);
                        $data['duration_days']  = $diff;
                        $data['duration_label'] = $lang === 'en' ? "{$diff} days" : "{$diff} hari";
                    } elseif (count($dates) === 1 && $awaiting === 'duration') {
                        $start                  = $data['start_date'] ?? Carbon::today('Asia/Jakarta')->format('Y-m-d');
                        $data['start_date']     = $start;
                        $data['end_date']       = $dates[0]['date'];
                        $diff                   = max(1, Carbon::parse($start)->diffInDays(Carbon::parse($dates[0]['date'])) + 1);
                        $data['duration_days']  = $diff;
                        $data['duration_label'] = $lang === 'en' ? "{$diff} days" : "{$diff} hari";
                    }
                }

                $wbsMode = $this->tokenizer->extractWbsMode($prompt);
                if ($wbsMode !== null) {
                    $data['wbs_mode'] = $wbsMode;
                }

                // Extract company (allow bare reply if currently awaiting company!)
                $compInfo = $this->tokenizer->extractCompanyInfo($prompt, $awaiting === 'company');
                if ($compInfo !== null) {
                    $data['company_id']     = $compInfo['id'];
                    $data['company_name']   = $compInfo['name'];
                    $data['company_is_new'] = $compInfo['is_new'];
                }

                // Extract project title (allow bare reply if currently awaiting title!)
                if (empty($data['title'])) {
                    $extractedTitle = $this->tokenizer->extractProjectTitleFromPrompt($prompt, $awaiting === 'title');
                    if ($extractedTitle) {
                        $data['title'] = Str::limit($extractedTitle, 80, '');
                    }
                }

                return $this->buildCreateProjectDraftOrConfirm($data, $user, $lang);

            case 'CREATE_USER':
                $roleInfo = $this->tokenizer->extractUserCreationRole($prompt);
                if ($roleInfo !== null) {
                    $data['role_id']    = $roleInfo['id'];
                    $data['role_name']  = $roleInfo['name'];
                    $data['role_label'] = $roleInfo['label'];
                }

                $uName = $this->tokenizer->extractUserCreationName($prompt, $awaiting === 'username');
                if ($uName !== null) {
                    $data['username'] = $uName;
                }

                $email = $this->tokenizer->extractEmailFromPrompt($prompt);
                if ($email !== null) {
                    $data['email']      = $email;
                    $data['email_auto'] = false;
                }

                $pwd = $this->tokenizer->extractPasswordFromPrompt($prompt);
                if ($pwd !== null) {
                    $data['password']      = $pwd;
                    $data['password_auto'] = false;
                }

                $compInfo = $this->tokenizer->extractCompanyInfo($prompt, $awaiting === 'company');
                if ($compInfo !== null && empty($compInfo['is_new'])) {
                    $data['company_id']   = $compInfo['id'];
                    $data['company_name'] = $compInfo['name'];
                }

                if (!empty($tokenized['matched_divisions'])) {
                    $data['division_id']   = $tokenized['matched_divisions'][0]['id'];
                    $data['division_name'] = $tokenized['matched_divisions'][0]['name'];
                } elseif ($awaiting === 'division') {
                    $divMatch = Division::whereRaw('LOWER(divisi) LIKE ?', ['%' . mb_strtolower(trim($prompt)) . '%'])->first();
                    if ($divMatch) {
                        $data['division_id']   = (int) $divMatch->id;
                        $data['division_name'] = $divMatch->divisi;
                    }
                }

                return $this->buildCreateUserDraftOrConfirm($data, $user, $lang);

            case 'UPDATE_SCHEDULE':
                $project = Project::find($data['project_id'] ?? $activeProjectId);
                if (!$project) {
                    return ['content' => $lang === 'en' ? 'Project not found.' : 'Projek tidak ditemukan.', 'actions' => [], 'pending_draft' => null, 'resolved_intent' => 'UPDATE_SCHEDULE'];
                }

                // Resolve task if awaiting task
                if (empty($data['task_id'])) {
                    $picked = $this->resolveTaskFromDraftReply($prompt, $tokenized, $sessionContext, $project->id);
                    if ($picked) {
                        $data['task_id'] = $picked->id;
                    }
                }

                // Merge duration, dates, or predecessor
                $dur = $this->tokenizer->extractDuration($prompt);
                if ($dur === null && $awaiting === 'duration' && preg_match('/^\s*(\d{1,4})\s*$/', trim($prompt), $mBareDays)) {
                    $days = max(1, (int) $mBareDays[1]);
                    $dur  = [
                        'value'    => $days,
                        'unit'     => 'days',
                        'days'     => $days,
                        'label_id' => "{$days} hari",
                        'label_en' => "{$days} " . ($days === 1 ? 'day' : 'days'),
                    ];
                }
                if ($dur !== null) {
                    $data['duration_days']  = $dur['days'];
                    $data['duration_label'] = $lang === 'en' ? $dur['label_en'] : $dur['label_id'];
                } elseif ($awaiting === 'duration_or_date' && preg_match('/^\s*(\d{1,4})\s*$/', trim($prompt), $mNum)) {
                    $days = max(1, (int) $mNum[1]);
                    $data['duration_days']  = $days;
                    $data['duration_label'] = $lang === 'en' ? "{$days} days" : "{$days} hari";
                }

                if (!empty($tokenized['dates'])) {
                    $data['start'] = $tokenized['dates'][0]['date'];
                    if (isset($tokenized['dates'][1])) {
                        $data['end'] = $tokenized['dates'][1]['date'];
                    }
                }

                if ($awaiting === 'predecessor') {
                    $pred = $this->resolveTaskFromDraftReply($prompt, $tokenized, $sessionContext, $project->id);
                    if ($pred && (string) $pred->id !== (string) ($data['task_id'] ?? '')) {
                        $predSyn = $tokenized['predecessor_syntax'][0] ?? [];
                        $data['predecessor_id'] = $pred->id;
                        $data['dep_type']       = $predSyn['dep_type'] ?? 'FS';
                        $data['lag']            = $predSyn['lag'] ?? 0;
                        $data['lead']           = $predSyn['lead'] ?? 0;
                    }
                }

                return $this->buildScheduleDraftOrConfirm($project, $data, $user, $lang);

            case 'UPDATE_TASK_STATUS':
                $project = Project::find($data['project_id'] ?? $activeProjectId);
                if (!$project) {
                    return ['content' => $lang === 'en' ? 'Project not found.' : 'Projek tidak ditemukan.', 'actions' => [], 'pending_draft' => null, 'resolved_intent' => 'UPDATE_TASK_STATUS'];
                }
                if (empty($data['task_id'])) {
                    $picked = $this->resolveTaskFromDraftReply($prompt, $tokenized, $sessionContext, $project->id);
                    if ($picked) {
                        $data['task_id'] = $picked->id;
                    }
                }
                if (empty($data['new_status']) && !empty($tokenized['statuses'])) {
                    $data['new_status'] = $tokenized['statuses'][0];
                }
                return $this->buildUpdateStatusDraftOrConfirm($project, $data, $user, $lang);

            case 'UPDATE_TASK_PROGRESS':
                $project = Project::find($data['project_id'] ?? $activeProjectId);
                if (!$project) {
                    return ['content' => $lang === 'en' ? 'Project not found.' : 'Projek tidak ditemukan.', 'actions' => [], 'pending_draft' => null, 'resolved_intent' => 'UPDATE_TASK_PROGRESS'];
                }
                if (empty($data['task_id'])) {
                    $picked = $this->resolveTaskFromDraftReply($prompt, $tokenized, $sessionContext, $project->id);
                    if ($picked) {
                        $data['task_id'] = $picked->id;
                    }
                }
                if (!isset($data['new_progress']) || $data['new_progress'] === null) {
                    if (!empty($tokenized['percentages'])) {
                        $data['new_progress'] = $tokenized['percentages'][0];
                    } elseif ($awaiting === 'progress' && preg_match('/\b(\d{1,3})\b/', $prompt, $mPct)) {
                        $data['new_progress'] = max(0, min(100, (int) $mPct[1]));
                    }
                }
                return $this->buildUpdateProgressDraftOrConfirm($project, $data, $user, $lang);

            case 'ADD_TASK':
                $project = Project::find($data['project_id'] ?? $activeProjectId);
                if (!$project) {
                    return ['content' => $lang === 'en' ? 'Project not found.' : 'Projek tidak ditemukan.', 'actions' => [], 'pending_draft' => null, 'resolved_intent' => 'ADD_TASK'];
                }
                if (empty($data['name']) && $awaiting === 'task_name') {
                    $cleanName = preg_replace('/(?:,\s*|\s+)(?:durasi\s+\d+.*|selama\s+\d+.*|divisi\s+.*|status\s+.*)$/i', '', trim($prompt)) ?? trim($prompt);
                    $cleanName = trim($cleanName, " \"'.,?!");
                    if (mb_strlen($cleanName) >= 2) {
                        $data['name'] = Str::limit($cleanName, 200, '');
                    }
                }
                $dur = $this->tokenizer->extractDuration($prompt);
                if ($dur === null && $awaiting === 'duration' && preg_match('/^\s*(\d{1,4})\s*$/', trim($prompt), $mBareDays)) {
                    $days = max(1, (int) $mBareDays[1]);
                    $dur  = [
                        'value'    => $days,
                        'unit'     => 'days',
                        'days'     => $days,
                        'label_id' => "{$days} hari",
                        'label_en' => "{$days} " . ($days === 1 ? 'day' : 'days'),
                    ];
                }
                if ($dur !== null) {
                    $data['duration'] = $dur['days'];
                }
                if (!empty($tokenized['matched_divisions'])) {
                    $data['divisions_id'] = $tokenized['matched_divisions'][0]['id'];
                }
                if (!empty($tokenized['statuses'])) {
                    $data['status'] = $tokenized['statuses'][0];
                }
                if (!empty($tokenized['matched_sub_wbs'])) {
                    $data['sub_wbs_id'] = $tokenized['matched_sub_wbs'][0]['id'];
                }
                return $this->buildAddTaskDraftOrConfirm($project, $data, $user, $lang);

            case 'MANAGE_PROJECT_ACCESS':
                $project = Project::find($data['project_id'] ?? $activeProjectId);
                if (!$project) {
                    return ['content' => $lang === 'en' ? 'Project not found.' : 'Projek tidak ditemukan.', 'actions' => [], 'pending_draft' => null, 'resolved_intent' => 'MANAGE_PROJECT_ACCESS'];
                }
                $lower = mb_strtolower($prompt);
                if (preg_match('/\b(private|privat|rahasia)\b/i', $lower)) {
                    $data['operation'] = 'set_private';
                } elseif (preg_match('/\b(public|publik|terbuka)\b/i', $lower)) {
                    $data['operation'] = 'set_public';
                } elseif (preg_match('/\b(cabut|keluarkan|tarik|revoke|remove)\b/i', $lower)) {
                    $data['operation'] = 'revoke';
                } elseif (preg_match('/\b(beri|berikan|kasih|tambah|tambahkan|izin|akses|grant|assign|add)\b/i', $lower)) {
                    $data['operation'] = $data['operation'] ?? 'grant';
                }

                $scopeCompanies = $this->isSuperAdmin($user) ? null : $user->getCompanyIds();
                $matchedUsers   = $this->tokenizer->matchUsersInPrompt($prompt, $scopeCompanies);
                if (!empty($matchedUsers)) {
                    $data['target_user_id'] = $matchedUsers[0]['id'];
                    if (empty($data['operation'])) {
                        $data['operation'] = 'grant';
                    }
                }
                if (!empty($tokenized['matched_divisions'])) {
                    $data['division_id'] = $tokenized['matched_divisions'][0]['id'];
                }
                return $this->buildManageAccessDraftOrConfirm($project, $data, $user, $lang);
        }

        return $this->handleSmartFallback($prompt, $tokenized, $user, $activeProjectId, $sessionContext, $lang);
    }

    protected function resolveTaskFromDraftReply(string $prompt, array $tokenized, array $sessionContext, int $projectId): ?Wbs
    {
        $t = $this->resolveSingleTask($tokenized, $sessionContext, $projectId);
        if ($t) {
            return $t;
        }
        // Also accept bare number reply like "1" or "2" referencing referenced_tasks!
        if (preg_match('/^\s*#?(\d+)\s*$/', trim($prompt), $m) && !empty($sessionContext['referenced_tasks'])) {
            $ref = $sessionContext['referenced_tasks'][((int) $m[1]) - 1] ?? null;
            if ($ref) {
                return Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))->find($ref['id']);
            }
        }
        return null;
    }

    /**
     * Build a concise numbered task pick-list for interactive slot-filling questions.
     *
     * @return array{lines: string, refs: array}
     */
    protected function buildTaskPickList(int $projectId, int $limit = 6): array
    {
        $codeMap = $this->buildTaskCodeMap($projectId);
        $tasks   = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
            ->orderBy('order_index')
            ->orderBy('id')
            ->take($limit)
            ->get();

        $lines = [];
        $refs  = [];
        foreach ($tasks as $idx => $t) {
            $num  = $idx + 1;
            $code = $codeMap[(string) $t->id] ?? $t->id;
            $prog = round((float) ($t->progress ?? 0), 0);
            $dur  = (int) ($t->duration_days ?? 1);
            $lines[] = "{$num}. `{$code}` **{$t->name}** (`{$t->status}`, {$prog}%, {$dur}d)";
            $refs[]  = ['index' => $num, 'id' => $t->id, 'code' => $code, 'name' => $t->name];
        }

        return [
            'lines' => implode("\n", $lines),
            'refs'  => $refs,
        ];
    }

    protected function computeEndDateFromDuration(string $startDate, array $duration): string
    {
        $start = Carbon::parse($startDate);
        return match ($duration['unit'] ?? 'days') {
            'months' => $start->copy()->addMonths($duration['value'])->format('Y-m-d'),
            'years'  => $start->copy()->addYears($duration['value'])->format('Y-m-d'),
            'weeks'  => $start->copy()->addWeeks($duration['value'])->format('Y-m-d'),
            default  => $start->copy()->addDays($duration['days'])->format('Y-m-d'),
        };
    }

    // =========================================================================
    // TWO-STEP SAFE WRITE ACTIONS (INTERACTIVE SLOT-FILLING -> CONFIRM -> EXEC)
    // =========================================================================

    /**
     * Propose: Create Project (Interactive Slot-Filling -> Summary & Confirmation).
     */
    protected function proposeCreateProject(string $prompt, array $tokenized, User $user, string $lang): array
    {
        if (!$this->canUserCreateProject($user)) {
            $roleName = $user->role?->name ?? 'worker';
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: Role `{$roleName}` is not authorized to create a new project (only **SuperAdmin** or an eligible **PIC** can create projects)."
                    : "🔒 **Akses Ditolak**: Role `{$roleName}` tidak memiliki izin membuat projek baru (hanya **SuperAdmin** atau **PIC** yang memenuhi syarat).",
                'actions'         => [],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        $data = [];

        // 1. Extract Project Title
        $title = $this->tokenizer->extractProjectTitleFromPrompt($prompt, false);
        if ($title) {
            $data['title'] = Str::limit($title, 80, '');
        }

        // 2. Extract Company (matches existing DB company OR explicit new company like "PT. TEST")
        $compInfo = $this->tokenizer->extractCompanyInfo($prompt, false);
        if ($compInfo) {
            $data['company_id']     = $compInfo['id'];
            $data['company_name']   = $compInfo['name'];
            $data['company_is_new'] = $compInfo['is_new'];
        }

        // 3. Extract Dates / Duration
        $dates = $tokenized['dates'] ?? [];
        $dur   = $this->tokenizer->extractDuration($prompt);

        if (!empty($dates) && count($dates) >= 2) {
            $data['start_date']     = $dates[0]['date'];
            $data['end_date']       = $dates[1]['date'];
            $diff                   = max(1, Carbon::parse($dates[0]['date'])->diffInDays(Carbon::parse($dates[1]['date'])) + 1);
            $data['duration_days']  = $diff;
            $data['duration_label'] = $lang === 'en' ? "{$diff} days" : "{$diff} hari";
        } elseif ($dur !== null) {
            $start                  = $dates[0]['date'] ?? Carbon::today('Asia/Jakarta')->format('Y-m-d');
            $data['start_date']     = $start;
            $data['end_date']       = $this->computeEndDateFromDuration($start, $dur);
            $data['duration_days']  = $dur['days'];
            $data['duration_label'] = $lang === 'en' ? $dur['label_en'] : $dur['label_id'];
        } elseif (!empty($dates)) {
            $data['start_date'] = $dates[0]['date'];
        }

        // 4. Extract WBS Mode preference ('default' 17 tasks vs 'empty')
        $wbsMode = $this->tokenizer->extractWbsMode($prompt);
        if ($wbsMode !== null) {
            $data['wbs_mode'] = $wbsMode;
        }

        return $this->buildCreateProjectDraftOrConfirm($data, $user, $lang);
    }

    /**
     * Evaluate CREATE_PROJECT slots:
     * - If any required field (title / company / duration) is missing, ask conversationally for THAT exact missing piece!
     * - Once complete, present a crisp summary & ask "Apakah bisa saya eksekusi?"
     */
    protected function buildCreateProjectDraftOrConfirm(array $data, User $user, string $lang): array
    {
        $hasTitle    = !empty($data['title']);
        $hasCompany  = !empty($data['company_name']);
        $hasDuration = !empty($data['end_date']);

        // Missing everything -> friendly kick-off question
        if (!$hasTitle && !$hasCompany && !$hasDuration) {
            $content = $lang === 'en'
                ? "Sure, I can help create a new project! What would you like to name the project? *(You can also mention the company name and duration right away, e.g. `TESTING, PT. Maju, 70 days`)*"
                : "Bisa banget! Mau bikin projek apa nih? Sebutkan aja **nama projeknya** dulu *(atau sekalian nama perusahaan & durasinya juga boleh, misal: `TESTING, PT. Maju Jaya, 70 hari`)* 😊";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_PROJECT',
                    'awaiting_slot' => 'title',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // Missing Title only
        if (!$hasTitle) {
            $known = [];
            if ($hasCompany) {
                $known[] = ($lang === 'en' ? 'Company' : 'Perusahaan') . ": **{$data['company_name']}**";
            }
            if ($hasDuration) {
                $known[] = ($lang === 'en' ? 'Duration' : 'Durasi') . ": **{$data['duration_label']}**";
            }
            $ctxStr = implode(', ', $known);
            $content = $lang === 'en'
                ? "Got it ({$ctxStr})! Sorry, you haven't mentioned the **project name** yet — what should I name this project?"
                : "Oke, maaf kamu belum menyebutkan **nama projeknya** ({$ctxStr}). Projek ini mau diberi nama apa?";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_PROJECT',
                    'awaiting_slot' => 'title',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // Missing Company (e.g. "tolong buatkan projek bernama testing selama durasi 70 hari")
        if (!$hasCompany) {
            $compList = $this->isSuperAdmin($user)
                ? Company::orderBy('id')->take(5)->pluck('name')->implode(', ')
                : Company::whereIn('id', $user->getCompanyIds())->pluck('name')->implode(', ');

            $durNoteId = $hasDuration ? " (durasi **{$data['duration_label']}**)" : '';
            $durNoteEn = $hasDuration ? " (duration **{$data['duration_label']}**)" : '';
            $hintId    = $compList ? "\n\n*(Perusahaan terdaftar: {$compList} — atau sebutkan nama perusahaan baru jika ingin dibuatkan otomatis)*" : '';
            $hintEn    = $compList ? "\n\n*(Registered companies: {$compList} — or enter a new company name)*" : '';

            $content = $lang === 'en'
                ? "Okay, sorry — you haven't mentioned the **company name** yet for project **{$data['title']}**{$durNoteEn}. Which company should this project belong to?{$hintEn}"
                : "Oke, maaf, kamu belum menyebutkan **nama perusahaan** untuk projek **{$data['title']}**{$durNoteId}. Mau diberi nama perusahaan apa?{$hintId}";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_PROJECT',
                    'awaiting_slot' => 'company',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // Missing Duration (e.g. "tolong buatkan projek bernama TESTING, milik Perusahaan PT. TEST")
        if (!$hasDuration) {
            $wbsAskId = empty($data['wbs_mode'])
                ? "\nSekalian, untuk isi task-nya mau langsung pakai **template default (17 Main Task)** atau mulai **kosong**?"
                : '';
            $wbsAskEn = empty($data['wbs_mode'])
                ? "\nAlso, should I apply the **default WBS template (17 Main Tasks)** or start **blank**?"
                : '';

            $content = $lang === 'en'
                ? "Got it! For project **{$data['title']}** (Company: **{$data['company_name']}**), how long should the project duration be? *(e.g. `70 days`, `3 months`, or start/end dates)*{$wbsAskEn}"
                : "Oke siap! Untuk projek **{$data['title']}** (Perusahaan: **{$data['company_name']}**), kamu mau projeknya berdurasi berapa lama? *(Misal: `70 hari` atau `3 bulan`)*{$wbsAskId}";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_PROJECT',
                    'awaiting_slot' => 'duration',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // Non-SuperAdmin company boundary check
        if (!$this->isSuperAdmin($user) && (!empty($data['company_is_new']) || !in_array((int) ($data['company_id'] ?? 0), $user->getCompanyIds(), true))) {
            $allowedComps = Company::whereIn('id', $user->getCompanyIds())->pluck('name')->implode(', ');
            $content = $lang === 'en'
                ? "🔒 As a PIC, you can only create projects under your assigned company (**{$allowedComps}**). Which of those should I use?"
                : "🔒 Sebagai PIC, akun kamu hanya dapat membuat projek di perusahaan yang terdaftar pada akunmu (**{$allowedComps}**). Mau pakai perusahaan tersebut?";

            unset($data['company_id'], $data['company_name'], $data['company_is_new']);
            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_PROJECT',
                    'awaiting_slot' => 'company',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // ALL REQUIRED SLOTS COMPLETE! Build final summary & confirmation (`pending_action`)!
        $startDate = $data['start_date'] ?? Carbon::today('Asia/Jakarta')->format('Y-m-d');
        $endDate   = $data['end_date'];
        $durLabel  = $data['duration_label'] ?? (max(1, Carbon::parse($startDate)->diffInDays(Carbon::parse($endDate))) . ($lang === 'en' ? ' days' : ' hari'));
        $wbsMode   = $data['wbs_mode'] ?? 'default';

        $payload = [
            'title'          => $data['title'],
            'company_id'     => $data['company_id'] ?? null,
            'company_name'   => $data['company_name'],
            'company_is_new' => (bool) ($data['company_is_new'] ?? false),
            'start_date'     => $startDate,
            'end_date'       => $endDate,
            'duration_label' => $durLabel,
            'wbs_mode'       => $wbsMode,
        ];

        $pending = [
            'type'       => 'CREATE_PROJECT',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => $payload,
        ];

        $sFmt     = Carbon::parse($startDate)->format('d M Y');
        $eFmt     = Carbon::parse($endDate)->format('d M Y');
        $newTagId = $payload['company_is_new'] ? ' *(perusahaan baru — otomatis dibuat)*' : '';
        $newTagEn = $payload['company_is_new'] ? ' *(new company — will be created automatically)*' : '';
        $wbsTxtId = $wbsMode === 'empty' ? 'Kosong (task manual nanti)' : 'Template Default (17 Main Task)';
        $wbsTxtEn = $wbsMode === 'empty' ? 'Blank (add tasks manually later)' : 'Default Master WBS Template (17 Main Tasks)';

        if ($lang === 'en') {
            $content = "Okay, here is the summary of the project you requested:\n\n"
                . "- **Project Name**: **{$payload['title']}**\n"
                . "- **Company**: **{$payload['company_name']}**{$newTagEn}\n"
                . "- **Duration**: **{$durLabel}** ({$sFmt} to {$eFmt})\n"
                . "- **Project Manager**: {$user->username}\n"
                . "- **Task Structure**: {$wbsTxtEn}\n\n"
                . "Can I go ahead and execute this now? *(Reply **\"Yes\"** / **\"Confirm\"** to execute, **\"Cancel\"** to abort, or tell me if you want to tweak anything like `make tasks blank` or `90 days`)*";
        } else {
            $content = "Oke, jadi kamu meminta pembuatan projek dengan rincian berikut:\n\n"
                . "- **Nama Projek**: **{$payload['title']}**\n"
                . "- **Perusahaan**: **{$payload['company_name']}**{$newTagId}\n"
                . "- **Durasi**: **{$durLabel}** ({$sFmt} s/d {$eFmt})\n"
                . "- **Project Manager**: {$user->username}\n"
                . "- **Struktur Task**: {$wbsTxtId}\n\n"
                . "Apakah sudah sesuai dan bisa saya eksekusi sekarang? *(Balas **\"Ya\"** / **\"Gas\"** untuk eksekusi, **\"Batal\"** untuk membatalkan, atau bilang langsung kalau ada yang mau direvisi misal `tasknya kosong aja` / `ganti 90 hari`)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'CREATE_PROJECT',
        ];
    }

    /**
     * Check whether the acting user is permitted to create accounts (and optionally a specific target role).
     */
    protected function canUserCreateAccount(User $actor, ?string $targetRoleName = null): bool
    {
        if ($this->isSuperAdmin($actor)) {
            return true;
        }

        if ($actor->isAdminUtama()) {
            $usersFeatures = $actor->permission_matrix['features']['users'] ?? [];
            if (!in_array('create', $usersFeatures, true)) {
                return false;
            }
            if ($targetRoleName !== null && $targetRoleName === 'SuperAdmin') {
                return false;
            }
            return true;
        }

        if ($actor->isPic()) {
            $usersFeatures = $actor->permission_matrix['features']['users'] ?? [];
            if (!in_array('create', $usersFeatures, true)) {
                return false;
            }
            if ($targetRoleName !== null && in_array($targetRoleName, ['SuperAdmin', 'admin_utama', 'admin_progres', 'pic'], true)) {
                return false;
            }
            return true;
        }

        return false;
    }

    /**
     * Propose CREATE_USER using interactive slot-filling & confirmation preview.
     */
    protected function proposeCreateUser(string $prompt, array $tokenized, User $user, string $lang): array
    {
        if (!$this->canUserCreateAccount($user)) {
            return $this->roleRestrictedResponse(
                $user,
                'Pembuatan akun baru hanya dapat dilakukan oleh **SuperAdmin** (atau **Admin/PIC** dengan izin manajemen user).',
                'Creating new accounts is restricted to **SuperAdmin** (or authorized **Admin/PIC** with user creation permission).',
                $lang
            );
        }

        $data = [];

        $roleInfo = $this->tokenizer->extractUserCreationRole($prompt);
        if ($roleInfo !== null) {
            $data['role_id']    = $roleInfo['id'];
            $data['role_name']  = $roleInfo['name'];
            $data['role_label'] = $roleInfo['label'];
        }

        $username = $this->tokenizer->extractUserCreationName($prompt, false);
        if ($username !== null) {
            $data['username'] = $username;
        }

        $email = $this->tokenizer->extractEmailFromPrompt($prompt);
        if ($email !== null) {
            $data['email']      = $email;
            $data['email_auto'] = false;
        }

        $password = $this->tokenizer->extractPasswordFromPrompt($prompt);
        if ($password !== null) {
            $data['password']      = $password;
            $data['password_auto'] = false;
        }

        $compInfo = $this->tokenizer->extractCompanyInfo($prompt, false);
        if ($compInfo !== null && empty($compInfo['is_new'])) {
            $data['company_id']   = $compInfo['id'];
            $data['company_name'] = $compInfo['name'];
        } elseif ($user->isPic() && $user->companies_id) {
            $picComp = Company::find($user->companies_id);
            if ($picComp) {
                $data['company_id']   = $picComp->id;
                $data['company_name'] = $picComp->name;
            }
        }

        if (!empty($tokenized['matched_divisions'])) {
            $data['division_id']   = $tokenized['matched_divisions'][0]['id'];
            $data['division_name'] = $tokenized['matched_divisions'][0]['name'];
        }

        return $this->buildCreateUserDraftOrConfirm($data, $user, $lang);
    }

    /**
     * Evaluate CREATE_USER slots & return next missing slot question or full confirmation summary.
     */
    protected function buildCreateUserDraftOrConfirm(array $data, User $user, string $lang): array
    {
        $hasName = !empty($data['username']);
        $hasRole = !empty($data['role_name']) && !empty($data['role_id']);

        // Enforce role creation permissions before proceeding
        if ($hasRole && !$this->canUserCreateAccount($user, $data['role_name'])) {
            $attempted = $data['role_label'] ?? $data['role_name'];
            unset($data['role_id'], $data['role_name'], $data['role_label']);

            return $this->roleRestrictedResponse(
                $user,
                "Akun Anda tidak memiliki izin untuk membuat akun dengan role **{$attempted}**.",
                "Your account is not authorized to create users with the **{$attempted}** role.",
                $lang
            );
        }

        // Neither Name nor Role known yet (e.g. "kalau buat akun baru bisa?" or "buatin akun baru untukku")
        if (!$hasName && !$hasRole) {
            $allowedRoles = $this->isSuperAdmin($user)
                ? '`SuperAdmin`, `Admin Utama`, `Admin Progres`, `PIC`, atau `Worker`'
                : ($user->isAdminUtama() ? '`Admin Utama`, `Admin Progres`, `PIC`, atau `Worker`' : '`Worker`');

            $content = $lang === 'en'
                ? "Yes, I can create a new user account right here! Please share the **account name** and **role** ({$allowedRoles}).\n\n*Example: `Create an account named Aria with role Super Admin`*"
                : "Bisa banget! Saya bisa langsung buatkan akun baru di sistem PROVIS. Sebutkan saja **nama akun** dan **role**-nya ({$allowedRoles}).\n\n*Contoh: `Buatkan akun bernama Aria dengan role Super Admin`* 😊";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_USER',
                    'awaiting_slot' => 'username',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        // Missing Username
        if (!$hasName) {
            $roleTag = $data['role_label'] ?? $data['role_name'];
            $content = $lang === 'en'
                ? "Got it — target role is **{$roleTag}**. What **name / username** should I use for this account?"
                : "Siap — role-nya **{$roleTag}**. Akun baru ini mau diberi **nama** siapa?";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_USER',
                    'awaiting_slot' => 'username',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        // Missing Role
        if (!$hasRole) {
            $allowedRoles = $this->isSuperAdmin($user)
                ? '**SuperAdmin**, **Admin Utama**, **Admin Progres**, **PIC**, atau **Worker**'
                : ($user->isAdminUtama() ? '**Admin Utama**, **Admin Progres**, **PIC**, atau **Worker**' : '**Worker**');

            $content = $lang === 'en'
                ? "Okay, account name **{$data['username']}**. What **role** should be assigned ({$allowedRoles})?"
                : "Oke, nama akun **{$data['username']}**. Mau diberi **role** apa? ({$allowedRoles})";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_USER',
                    'awaiting_slot' => 'role',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        // Company requirement for PIC / Worker roles
        $needsCompany = in_array($data['role_name'], ['pic', 'worker'], true);
        if ($needsCompany && empty($data['company_id'])) {
            $compList = $this->isSuperAdmin($user)
                ? Company::orderBy('id')->take(6)->pluck('name')->implode(', ')
                : Company::whereIn('id', $user->getCompanyIds())->pluck('name')->implode(', ');

            $content = $lang === 'en'
                ? "Account **{$data['username']}** (`{$data['role_label']}`) needs a **company** assignment. Which company should they belong to?\n\n*(Registered: {$compList})*"
                : "Untuk role **{$data['role_label']}** atas nama **{$data['username']}**, akun ini ditempatkan di **perusahaan** mana?\n\n*(Terdaftar: {$compList})*";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_USER',
                    'awaiting_slot' => 'company',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        // Check email uniqueness if user explicitly typed one
        if (!empty($data['email']) && User::where('email', $data['email'])->exists()) {
            $takenEmail = $data['email'];
            unset($data['email'], $data['email_auto']);
            $content = $lang === 'en'
                ? "⚠️ Email **{$takenEmail}** is already registered in PROVIS. Please provide a different email address."
                : "⚠️ Email **{$takenEmail}** sudah terdaftar di PROVIS. Silakan sebutkan email lain ya.";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'CREATE_USER',
                    'awaiting_slot' => 'email',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        // Fill safe smart defaults for Email & Password if omitted so user can confirm in 1 step OR override
        $email        = $data['email'] ?? $this->generateUniqueAccountEmail($data['username']);
        $emailAuto    = empty($data['email']);
        $password     = $data['password'] ?? 'Provis2026!';
        $passwordAuto = empty($data['password']);

        $payload = [
            'username'      => Str::limit(trim($data['username']), 45, ''),
            'email'         => $email,
            'email_auto'    => $emailAuto,
            'password'      => $password,
            'password_auto' => $passwordAuto,
            'role_id'       => $data['role_id'],
            'role_name'     => $data['role_name'],
            'role_label'    => $data['role_label'] ?? $data['role_name'],
            'company_id'    => $data['company_id'] ?? null,
            'company_name'  => $data['company_name'] ?? null,
            'division_id'   => $data['division_id'] ?? null,
            'division_name' => $data['division_name'] ?? null,
        ];

        $pending = [
            'type'       => 'CREATE_USER',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => $payload,
        ];

        $compLineId = !empty($payload['company_name']) ? "\n- **Perusahaan**: {$payload['company_name']}" : '';
        $compLineEn = !empty($payload['company_name']) ? "\n- **Company**: {$payload['company_name']}" : '';
        $divLineId  = !empty($payload['division_name']) ? "\n- **Divisi**: {$payload['division_name']}" : '';
        $divLineEn  = !empty($payload['division_name']) ? "\n- **Division**: {$payload['division_name']}" : '';

        $emailTagId = $emailAuto ? ' *(otomatis)*' : '';
        $emailTagEn = $emailAuto ? ' *(auto-generated)*' : '';
        $pwdTagId   = $passwordAuto ? ' *(default sementara)*' : '';
        $pwdTagEn   = $passwordAuto ? ' *(default temporary)*' : '';

        if ($lang === 'en') {
            $content = "👤 **Confirm New Account Creation**\n\n"
                . "- **Username**: **{$payload['username']}**\n"
                . "- **Role**: **{$payload['role_label']}**\n"
                . "- **Email**: `{$payload['email']}`{$emailTagEn}\n"
                . "- **Password**: `{$payload['password']}`{$pwdTagEn}"
                . $compLineEn
                . $divLineEn
                . "\n\nReply **\"Yes\"** / **\"Confirm\"** to create this account now, **\"Cancel\"** to abort, or specify changes (e.g. `email aria.admin@provis.id password Secret123`).";
        } else {
            $content = "👤 **Konfirmasi Pembuatan Akun Baru**\n\n"
                . "- **Nama Akun**: **{$payload['username']}**\n"
                . "- **Role**: **{$payload['role_label']}**\n"
                . "- **Email Login**: `{$payload['email']}`{$emailTagId}\n"
                . "- **Password**: `{$payload['password']}`{$pwdTagId}"
                . $compLineId
                . $divLineId
                . "\n\nApakah bisa langsung saya buat sekarang? *(Balas **\"Ya\"** / **\"Gas\"** untuk eksekusi, **\"Batal\"** untuk membatalkan, atau ketik revisi jika ingin mengubah email/password seperti `email aria.super@provis.id password Rahasia123`)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'CREATE_USER',
        ];
    }

    /**
     * Generate a clean, unique @provis.id email slug from a requested username.
     */
    protected function generateUniqueAccountEmail(string $username): string
    {
        $slug = Str::slug(trim($username), '.');
        if ($slug === '') {
            $slug = 'user';
        }
        $slug = Str::limit($slug, 30, '');
        $candidate = "{$slug}@provis.id";
        $suffix = 2;
        while (User::where('email', $candidate)->exists()) {
            $candidate = "{$slug}{$suffix}@provis.id";
            $suffix++;
        }
        return $candidate;
    }

    /**
     * Propose: Manage Project User Access & Private/Public Visibility (Interactive Slot-Filling -> Confirmation).
     */
    protected function proposeManageProjectAccess(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found to manage access.' : 'Tidak ditemukan projek yang dapat diakses untuk diatur hak aksesnya.',
                'actions'         => [],
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            ];
        }

        if (!$this->canUserEditWbs($user, $project)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: Only the **PIC** of **{$project->title}** or a **SuperAdmin** can manage project user access and visibility."
                    : "🔒 **Akses Ditolak**: Hanya **PIC** projek **{$project->title}** atau **SuperAdmin** yang berwenang mengatur manajemen user & visibilitas projek ini.",
                'actions'         => [],
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            ];
        }

        $lower = mb_strtolower($prompt);
        $data  = ['project_id' => $project->id];

        if (preg_match('/\b(private|privat|rahasia)\b/i', $lower)) {
            $data['operation'] = 'set_private';
        } elseif (preg_match('/\b(public|publik|terbuka)\b/i', $lower)) {
            $data['operation'] = 'set_public';
        } elseif (preg_match('/\b(cabut|keluarkan|tarik|revoke|remove)\b/i', $lower)) {
            $data['operation'] = 'revoke';
        } elseif (preg_match('/\b(berikan|kasih|beri|tambah|tambahkan|grant|assign|give|add)\b/i', $lower)) {
            $data['operation'] = 'grant';
        }

        $scopeCompanies = $this->isSuperAdmin($user) ? null : $user->getCompanyIds();
        $matchedUsers   = $this->tokenizer->matchUsersInPrompt($prompt, $scopeCompanies);
        if (!empty($matchedUsers)) {
            $data['target_user_id'] = $matchedUsers[0]['id'];
            if (empty($data['operation'])) {
                $data['operation'] = 'grant';
            }
        }
        if (!empty($tokenized['matched_divisions'])) {
            $data['division_id'] = $tokenized['matched_divisions'][0]['id'];
        }

        return $this->buildManageAccessDraftOrConfirm($project, $data, $user, $lang);
    }

    protected function buildManageAccessDraftOrConfirm(Project $project, array $data, User $user, string $lang): array
    {
        $op = $data['operation'] ?? null;

        // Private / Public visibility toggle needs no target user!
        if (in_array($op, ['set_private', 'set_public'], true)) {
            $toPrivate = ($op === 'set_private');
            $oldVis    = $project->is_private ? 'Private' : 'Public';
            $newVis    = $toPrivate ? 'Private' : 'Public';

            $pending = [
                'type'       => 'MANAGE_PROJECT_ACCESS',
                'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
                'payload'    => [
                    'project_id' => $project->id,
                    'operation'  => $op,
                ],
            ];

            $content = $lang === 'en'
                ? "Okay, here is the visibility update summary:\n\n"
                  . "- **Project**: **{$project->title}** (`#{$project->id}`)\n"
                  . "- **Visibility Change**: `{$oldVis}` → **`{$newVis}`**\n\n"
                  . "Can I execute this now? *(Reply **\"Yes\"** or **\"Cancel\"**)*"
                : "Oke, ini ringkasan perubahan visibilitas projek:\n\n"
                  . "- **Projek**: **{$project->title}** (`#{$project->id}`)\n"
                  . "- **Perubahan Visibilitas**: `{$oldVis}` → **`{$newVis}`**\n\n"
                  . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk eksekusi atau **\"Batal\"**)*";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => null,
                'pending_action'  => $pending,
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        // Grant / Revoke requires a target user
        $targetUser = !empty($data['target_user_id']) ? User::with(['role', 'division'])->find($data['target_user_id']) : null;

        if (!$op || !$targetUser) {
            $project->load(['projectMembers.user']);
            $visLabel     = $project->is_private ? 'Private' : 'Public';
            $currentMems  = $project->projectMembers->map(fn($m) => $m->user?->username)->filter()->implode(', ') ?: ($lang === 'en' ? 'None yet' : 'Belum ada anggota khusus');

            $availQuery = User::with('role')->where('id', '!=', $user->id);
            if (!$this->isSuperAdmin($user) && !empty($user->getCompanyIds())) {
                $cIds = $user->getCompanyIds();
                $availQuery->where(fn($q) => $q->whereIn('companies_id', $cIds)->orWhereHas('companies', fn($cq) => $cq->whereIn('companies.id', $cIds)));
            }
            $sampleUsers = $availQuery->take(6)->get()->map(fn($u) => "`{$u->username}`")->implode(', ');

            if (!$op) {
                $content = $lang === 'en'
                    ? "Okay! Project **{$project->title}** is currently **{$visLabel}** (Assigned members: {$currentMems}).\n\n"
                      . "What would you like to do?\n"
                      . "- **Grant view access** to a user (e.g. `grant access to Worker IT`)\n"
                      . "- **Revoke access** from a user (e.g. `revoke access of Worker IT`)\n"
                      . "- **Change visibility** (`set Private` or `set Public`)\n\n"
                      . ($sampleUsers ? "*(Available users: {$sampleUsers})*" : '')
                    : "Oke siap! Saat ini projek **{$project->title}** berstatus **{$visLabel}** (Anggota terdaftar: {$currentMems}).\n\n"
                      . "Kamu mau atur yang mana?\n"
                      . "- **Beri akses lihat** ke user tertentu (contoh balas: `berikan akses ke Worker IT`)\n"
                      . "- **Cabut akses** user dari projek (contoh balas: `cabut akses Worker IT`)\n"
                      . "- **Ubah visibilitas projek** (balas: `jadikan Private` atau `jadikan Public`)\n\n"
                      . ($sampleUsers ? "*(Beberapa user tersedia: {$sampleUsers})*" : '');
            } else {
                $actWordId = $op === 'revoke' ? 'dicabut aksesnya dari' : 'diberi akses melihat';
                $actWordEn = $op === 'revoke' ? 'revoke access from' : 'grant view access to';
                $content = $lang === 'en'
                    ? "Okay! Which user would you like to {$actWordEn} **{$project->title}**? *(Available: {$sampleUsers})*"
                    : "Oke, maaf kamu belum menyebutkan nama user-nya. User mana yang mau {$actWordId} projek **{$project->title}**? *(Contoh user: {$sampleUsers})*";
            }

            return [
                'content'         => $content,
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"]],
                'pending_draft'   => [
                    'type'          => 'MANAGE_PROJECT_ACCESS',
                    'awaiting_slot' => 'user',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $divId   = $data['division_id'] ?? $targetUser->divisions_id;
        $divName = $divId ? (Division::find($divId)?->divisi ?? 'General') : 'General';

        $pending = [
            'type'       => 'MANAGE_PROJECT_ACCESS',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => [
                'project_id'     => $project->id,
                'operation'      => $op,
                'target_user_id' => $targetUser->id,
                'division_id'    => $divId,
            ],
        ];

        $actionTitleId = $op === 'revoke' ? 'Cabut Akses User dari Projek' : 'Berikan Akses Lihat Projek ke User';
        $actionTitleEn = $op === 'revoke' ? 'Revoke User Access from Project' : 'Grant Project View Access to User';

        $content = $lang === 'en'
            ? "Okay, here is the access update summary:\n\n"
              . "- **Action**: **{$actionTitleEn}**\n"
              . "- **Project**: **{$project->title}** (`#{$project->id}`)\n"
              . "- **Target User**: **{$targetUser->username}** (`{$targetUser->email}` — Role: `{$targetUser->role?->name}`)\n"
              . "- **Division**: {$divName}\n\n"
              . "Can I execute this now? *(Reply **\"Yes\"** to execute or **\"Cancel\"**)*"
            : "Oke, jadi ini ringkasan pengaturan akses projek yang kamu minta:\n\n"
              . "- **Tindakan**: **{$actionTitleId}**\n"
              . "- **Projek**: **{$project->title}** (`#{$project->id}`)\n"
              . "- **Target User**: **{$targetUser->username}** (`{$targetUser->email}` — Role: `{$targetUser->role?->name}`)\n"
              . "- **Divisi**: {$divName}\n\n"
              . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk eksekusi atau **\"Batal\"**)*";

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    /**
     * Propose: Update Task Status (Interactive Slot-Filling -> Confirmation).
     */
    protected function proposeUpdateTaskStatus(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang,
        string $prompt = ''
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan projek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'UPDATE_TASK_STATUS',
            ];
        }

        $targetTask = $this->resolveSingleTask($tokenized, $sessionContext, $project->id);
        $data = [
            'project_id' => $project->id,
            'task_id'    => $targetTask?->id,
            'new_status' => $tokenized['statuses'][0] ?? null,
        ];

        return $this->buildUpdateStatusDraftOrConfirm($project, $data, $user, $lang);
    }

    protected function buildUpdateStatusDraftOrConfirm(Project $project, array $data, User $user, string $lang): array
    {
        $targetTask = !empty($data['task_id']) ? Wbs::find($data['task_id']) : null;
        $newStatus  = $data['new_status'] ?? null;

        if (!$targetTask) {
            $pick = $this->buildTaskPickList($project->id, 6);
            $statusNoteId = $newStatus ? " ke status **`{$newStatus}`**" : '';
            $statusNoteEn = $newStatus ? " to **`{$newStatus}`**" : '';

            $content = $lang === 'en'
                ? "Okay! Which task in **{$project->title}** would you like to update{$statusNoteEn}? Just reply with the task name, WBS code, or number:\n\n{$pick['lines']}"
                : "Oke siap! Task mana di projek **{$project->title}** yang mau diubah{$statusNoteId}? Tinggal balas nama task, kode WBS, atau nomornya ya:\n\n{$pick['lines']}";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_TASK_STATUS',
                    'awaiting_slot' => 'task',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'UPDATE_TASK_STATUS',
                'context_update'  => ['project_id' => $project->id, 'referenced_tasks' => $pick['refs']],
            ];
        }

        if (!$this->canUserUpdateTask($user, $project, $targetTask)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: You are not authorized to modify task **{$targetTask->name}** in **{$project->title}**."
                    : "🔒 **Akses Ditolak**: Anda tidak memiliki izin untuk mengubah status task **{$targetTask->name}** pada proyek **{$project->title}**.",
                'actions'         => [],
                'pending_draft'   => null,
                'resolved_intent' => 'UPDATE_TASK_STATUS',
            ];
        }

        if (!$newStatus) {
            $oldStat = $targetTask->status ?? 'Open';
            $content = $lang === 'en'
                ? "Got it! Task **{$targetTask->name}** is currently `{$oldStat}`. What status should I change it to? (`Open`, `On Track`, `Outstanding`, `At Risk`, `Delayed`, `Completed`, or `Cancelled`)"
                : "Oke! Saat ini status task **{$targetTask->name}** adalah `{$oldStat}`. Mau diubah ke status apa? (`Open`, `On Track`, `Outstanding`, `At Risk`, `Delayed`, `Completed`, atau `Cancelled`)";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_TASK_STATUS',
                    'awaiting_slot' => 'status',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'UPDATE_TASK_STATUS',
                'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
            ];
        }

        // Enforce evidence & predecessor rules if setting directly to Completed
        if ($newStatus === 'Completed') {
            $block = $this->scheduler->validateCanComplete($targetTask);
            if ($block) {
                return [
                    'content'         => "🔒 **Blocked**: {$block}",
                    'actions'         => [],
                    'pending_draft'   => null,
                    'resolved_intent' => 'UPDATE_TASK_STATUS',
                ];
            }
            $hasEv = !empty($targetTask->evidence_path) && $targetTask->evidence_path !== '[]';
            if ($targetTask->requires_evidence && !$hasEv) {
                return [
                    'content' => $lang === 'en'
                        ? "📎 **Evidence Required**: Task **{$targetTask->name}** requires an evidence file (PDF/JPG/PNG) before being marked as `Completed`. Please upload evidence on the Tasks page."
                        : "📎 **Wajib Evidence**: Task **{$targetTask->name}** memerlukan unggahan file bukti (PDF/JPG/PNG) sebelum dapat ditandai `Completed`. Silakan unggah bukti di halaman Tasks.",
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Upload Evidence in Tasks' : 'Upload Evidence di Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                    'pending_draft'   => null,
                    'resolved_intent' => 'UPDATE_TASK_STATUS',
                ];
            }
        }

        $codeMap  = $this->buildTaskCodeMap($project->id);
        $code     = $codeMap[(string) $targetTask->id] ?? $targetTask->id;
        $oldStat  = $targetTask->status ?? 'Open';

        $pending = [
            'type'       => 'UPDATE_TASK_STATUS',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => [
                'project_id' => $project->id,
                'task_id'    => $targetTask->id,
                'old_status' => $oldStat,
                'new_status' => $newStatus,
            ],
        ];

        $prHint = $newStatus === 'Outstanding'
            ? ($lang === 'en' ? "\n- **Note**: `Outstanding` marks this item as an unfulfilled PR item (purple badge)." : "\n- **Catatan**: Label `Outstanding` menandai item barang PR yang belum terpenuhi (badge ungu).")
            : '';

        if ($lang === 'en') {
            $content = "Okay, here is the status update summary:\n\n"
                . "- **Project**: {$project->title} (`#{$project->id}`)\n"
                . "- **Task**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Status Change**: `{$oldStat}` → **`{$newStatus}`**" . $prHint . "\n\n"
                . "Can I execute this now? *(Reply **\"Yes\"** to save or **\"Cancel\"**)*";
        } else {
            $content = "Oke, jadi ini ringkasan perubahan status task:\n\n"
                . "- **Projek**: {$project->title} (`#{$project->id}`)\n"
                . "- **Task**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Perubahan Status**: `{$oldStat}` → **`{$newStatus}`**" . $prHint . "\n\n"
                . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk menyimpan atau **\"Batal\"**)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'UPDATE_TASK_STATUS',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
        ];
    }

    /**
     * Propose: Update Task Progress (0–100%, Interactive Slot-Filling -> Confirmation).
     */
    protected function proposeUpdateTaskProgress(
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang,
        string $prompt = ''
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan projek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'UPDATE_TASK_PROGRESS',
            ];
        }

        $targetTask = $this->resolveSingleTask($tokenized, $sessionContext, $project->id);
        $data = [
            'project_id'   => $project->id,
            'task_id'      => $targetTask?->id,
            'new_progress' => $tokenized['percentages'][0] ?? null,
        ];

        return $this->buildUpdateProgressDraftOrConfirm($project, $data, $user, $lang);
    }

    protected function buildUpdateProgressDraftOrConfirm(Project $project, array $data, User $user, string $lang): array
    {
        $targetTask  = !empty($data['task_id']) ? Wbs::find($data['task_id']) : null;
        $newProgress = $data['new_progress'] ?? null;

        if (!$targetTask) {
            $pick = $this->buildTaskPickList($project->id, 6);
            $pctNoteId = $newProgress !== null ? " ke **{$newProgress}%**" : '';
            $pctNoteEn = $newProgress !== null ? " to **{$newProgress}%**" : '';

            $content = $lang === 'en'
                ? "Sure! Which task in **{$project->title}** would you like to update progress{$pctNoteEn}? Reply with its name, WBS code, or number:\n\n{$pick['lines']}"
                : "Oke siap! Task mana di projek **{$project->title}** yang mau diupdate progresnya{$pctNoteId}? Balas nama task, kode WBS, atau nomornya ya:\n\n{$pick['lines']}";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_TASK_PROGRESS',
                    'awaiting_slot' => 'task',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'UPDATE_TASK_PROGRESS',
                'context_update'  => ['project_id' => $project->id, 'referenced_tasks' => $pick['refs']],
            ];
        }

        if (!$this->canUserUpdateTask($user, $project, $targetTask)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: You are not authorized to update progress for **{$targetTask->name}**."
                    : "🔒 **Akses Ditolak**: Anda tidak memiliki izin untuk mengubah progres task **{$targetTask->name}**.",
                'actions'         => [],
                'pending_draft'   => null,
                'resolved_intent' => 'UPDATE_TASK_PROGRESS',
            ];
        }

        if ($newProgress === null) {
            $oldProg = round((float) ($targetTask->progress ?? 0), 1);
            $content = $lang === 'en'
                ? "Got it! Task **{$targetTask->name}** is currently at **{$oldProg}%**. What percentage (`0–100%`) should I update it to?"
                : "Oke! Progres task **{$targetTask->name}** saat ini **{$oldProg}%**. Mau diperbarui jadi berapa persen (`0–100%`)?";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_TASK_PROGRESS',
                    'awaiting_slot' => 'progress',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'UPDATE_TASK_PROGRESS',
                'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
            ];
        }

        // Validate predecessor & evidence constraints upfront
        if ($newProgress > 0) {
            $startBlock = $this->scheduler->validateCanStart($targetTask);
            if ($startBlock) {
                return [
                    'content'         => "🔒 **Blocked**: {$startBlock}",
                    'actions'         => [],
                    'pending_draft'   => null,
                    'resolved_intent' => 'UPDATE_TASK_PROGRESS',
                ];
            }
        }
        if ($newProgress >= 100) {
            $compBlock = $this->scheduler->validateCanComplete($targetTask);
            if ($compBlock) {
                return [
                    'content'         => "🔒 **Blocked**: {$compBlock}",
                    'actions'         => [],
                    'pending_draft'   => null,
                    'resolved_intent' => 'UPDATE_TASK_PROGRESS',
                ];
            }
            $hasEv = !empty($targetTask->evidence_path) && $targetTask->evidence_path !== '[]';
            if ($targetTask->requires_evidence && !$hasEv) {
                return [
                    'content' => $lang === 'en'
                        ? "📎 **Evidence Required**: Task **{$targetTask->name}** requires uploading an evidence file before reaching `100%`."
                        : "📎 **Wajib Evidence**: Task **{$targetTask->name}** mewajibkan upload bukti sebelum progres dapat diubah menjadi `100%`.",
                    'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                    'pending_draft'   => null,
                    'resolved_intent' => 'UPDATE_TASK_PROGRESS',
                ];
            }
        }

        $codeMap = $this->buildTaskCodeMap($project->id);
        $code    = $codeMap[(string) $targetTask->id] ?? $targetTask->id;
        $oldProg = round((float) ($targetTask->progress ?? 0), 1);

        $pending = [
            'type'       => 'UPDATE_TASK_PROGRESS',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => [
                'project_id'   => $project->id,
                'task_id'      => $targetTask->id,
                'old_progress' => $oldProg,
                'new_progress' => (int) $newProgress,
            ],
        ];

        if ($lang === 'en') {
            $content = "Okay, here is the progress update summary:\n\n"
                . "- **Project**: {$project->title} (`#{$project->id}`)\n"
                . "- **Task**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Progress Change**: `{$oldProg}%` → **`{$newProgress}%`**\n\n"
                . "Can I execute this now? *(Reply **\"Yes\"** to save or **\"Cancel\"**)*";
        } else {
            $content = "Oke, jadi ini ringkasan update progres task:\n\n"
                . "- **Projek**: {$project->title} (`#{$project->id}`)\n"
                . "- **Task**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Perubahan Progres**: `{$oldProg}%` → **`{$newProgress}%`**\n\n"
                . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk menyimpan atau **\"Batal\"**)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'UPDATE_TASK_PROGRESS',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
        ];
    }

    /**
     * Propose: Add New Leaf Task to a Sub Task (Interactive Slot-Filling -> Confirmation).
     */
    protected function proposeAddTask(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found.' : 'Tidak ditemukan projek yang dapat diakses.',
                'actions'         => [],
                'resolved_intent' => 'ADD_TASK',
            ];
        }

        if (!$this->canUserEditWbs($user, $project)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: Only the **PIC** of this project or a **SuperAdmin** can add new WBS tasks."
                    : "🔒 **Akses Ditolak**: Hanya **PIC** proyek ini atau **SuperAdmin** yang dapat menambahkan task WBS baru.",
                'actions'         => [],
                'resolved_intent' => 'ADD_TASK',
            ];
        }

        // Extract task name
        preg_match('/(?:tambah|tambahkan|buat|buatkan|buatin|bikin|bikinin|add|create)\s+(?:saya\s+|aku\s+|a\s+|new\s+|sebuah\s+|baru\s+){0,2}(?:sub[\s-]?)?(?:task|pekerjaan|item)\s+(?:baru\s+|new\s+|bernama\s+)?([^,\n]+)/i', $prompt, $m);
        $rawName  = isset($m[1]) ? trim(preg_replace('/\b(ke|di|pada|untuk|dengan|divisi|status|mulai|selama|durasi|in|to|under|into|for|with|division|status|starting)\b.*$/i', '', $m[1])) : '';
        $taskName = trim($rawName, " \"'`.,?!");
        if (preg_match('/^(baru|new|dong|ya|yah|bro|min)$/i', $taskName)) {
            $taskName = '';
        }

        $dur = $this->tokenizer->extractDuration($prompt);
        $data = [
            'project_id'   => $project->id,
            'name'         => $taskName !== '' ? Str::limit($taskName, 200, '') : null,
            'sub_wbs_id'   => $tokenized['matched_sub_wbs'][0]['id'] ?? null,
            'divisions_id' => $tokenized['matched_divisions'][0]['id'] ?? null,
            'status'       => $tokenized['statuses'][0] ?? 'Open',
            'start'        => $tokenized['dates'][0]['date'] ?? null,
            'end'          => $tokenized['dates'][1]['date'] ?? null,
            'duration'     => $dur['days'] ?? 7,
        ];

        return $this->buildAddTaskDraftOrConfirm($project, $data, $user, $lang);
    }

    protected function buildAddTaskDraftOrConfirm(Project $project, array $data, User $user, string $lang): array
    {
        if (empty($data['name'])) {
            $content = $lang === 'en'
                ? "Sure! Let's add a new task to **{$project->title}**. What should I name the task? *(Optional: you can also include duration, division, or `status Outstanding`, e.g. `Main Valve Procurement, 10 days, Purchasing`)*"
                : "Oke siap! Mau menambahkan task baru di projek **{$project->title}** ya. Nama task-nya apa? *(Opsional: boleh sekalian sebut durasi, divisi, atau `status Outstanding`, misal: `Pengadaan Valve Utama, 10 hari, Purchasing`)*";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'ADD_TASK',
                    'awaiting_slot' => 'task_name',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'ADD_TASK',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $subWbs = !empty($data['sub_wbs_id']) ? SubWbs::with('mainWbs')->find($data['sub_wbs_id']) : null;
        if (!$subWbs) {
            $subWbs = SubWbs::whereHas('mainWbs', fn($q) => $q->where('projects_id', $project->id))
                ->with('mainWbs')
                ->orderBy('order_index')
                ->orderBy('id')
                ->first();
        }

        if (!$subWbs) {
            return [
                'content' => $lang === 'en'
                    ? "⚠️ Project **{$project->title}** does not have any Sub Tasks yet. Please create a Main Job & Sub Task on the Tasks page first."
                    : "⚠️ Proyek **{$project->title}** belum memiliki Sub Task. Silakan buat Main Job & Sub Task terlebih dahulu di halaman Tasks.",
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                'pending_draft'   => null,
                'resolved_intent' => 'ADD_TASK',
            ];
        }

        $divId     = $data['divisions_id'] ?? $user->divisions_id ?? Division::first()?->id;
        $divName   = $divId ? (Division::find($divId)?->divisi ?? 'General') : 'General';
        $status    = $data['status'] ?? 'Open';
        $startDate = $data['start'] ?? ($subWbs->start ? Carbon::parse($subWbs->start)->format('Y-m-d') : Carbon::today('Asia/Jakarta')->format('Y-m-d'));
        $duration  = max(1, (int) ($data['duration'] ?? 7));
        $endDate   = $data['end'] ?? Carbon::parse($startDate)->addDays($duration - 1)->format('Y-m-d');
        $taskName  = $data['name'];

        $pending = [
            'type'       => 'ADD_TASK',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => [
                'project_id'   => $project->id,
                'sub_wbs_id'   => $subWbs->id,
                'name'         => $taskName,
                'divisions_id' => $divId,
                'status'       => $status,
                'start'        => $startDate,
                'end'          => $endDate,
                'duration'     => $duration,
            ],
        ];

        $sFmt = Carbon::parse($startDate)->format('d M Y');
        $eFmt = Carbon::parse($endDate)->format('d M Y');

        if ($lang === 'en') {
            $content = "Okay, here is the new task summary:\n\n"
                . "- **Project**: {$project->title} (`#{$project->id}`)\n"
                . "- **Parent Sub Task**: {$subWbs->mainWbs?->name} → **{$subWbs->name}**\n"
                . "- **New Task Name**: **{$taskName}**\n"
                . "- **Division**: {$divName} | **Initial Status**: `{$status}`\n"
                . "- **Schedule**: {$sFmt} to {$eFmt} ({$duration} days)\n\n"
                . "Can I execute this now? *(Reply **\"Yes\"** to add or **\"Cancel\"**)*";
        } else {
            $content = "Oke, jadi ini ringkasan penambahan task baru:\n\n"
                . "- **Projek**: {$project->title} (`#{$project->id}`)\n"
                . "- **Induk Sub Task**: {$subWbs->mainWbs?->name} → **{$subWbs->name}**\n"
                . "- **Nama Task Baru**: **{$taskName}**\n"
                . "- **Divisi**: {$divName} | **Status Awal**: `{$status}`\n"
                . "- **Jadwal**: {$sFmt} s/d {$eFmt} ({$duration} hari)\n\n"
                . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk menambahkan atau **\"Batal\"**)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => 'ADD_TASK',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    /**
     * Propose: Update Task Duration, Schedule & Predecessor (Interactive Slot-Filling + Cycle Check!).
     */
    protected function proposeScheduleAndPredecessor(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible active project found.' : 'Tidak ditemukan projek aktif untuk mengatur jadwal atau dependensi pekerjaan.',
                'actions'         => [],
                'resolved_intent' => 'SET_PREDECESSOR',
            ];
        }

        if (!$this->canUserEditWbs($user, $project)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: Only the **PIC** of this project or a **SuperAdmin** can modify task schedules, durations, and predecessors."
                    : "🔒 **Akses Ditolak**: Hanya **PIC** proyek ini atau **SuperAdmin** yang dapat mengubah durasi, jadwal, dan predecessor task.",
                'actions'         => [],
                'resolved_intent' => 'SET_PREDECESSOR',
            ];
        }

        $matchedTasks = $tokenized['matched_tasks'] ?? [];
        $predSyntax   = $tokenized['predecessor_syntax'] ?? [];
        $dates        = $tokenized['dates'] ?? [];
        $dur          = $this->tokenizer->extractDuration($prompt);
        $wantsPred    = ($tokenized['action_intent'] ?? '') === 'SET_PREDECESSOR';

        $targetTask = !empty($matchedTasks[0]['id'])
            ? Wbs::find($matchedTasks[0]['id'])
            : (($tokenized['follow_up']['refers_to_previous'] ?? false) && !empty($sessionContext['task_id']) ? Wbs::find($sessionContext['task_id']) : null);

        $data = [
            'project_id' => $project->id,
            'task_id'    => $targetTask?->id,
            'mode'       => $wantsPred ? 'predecessor' : 'duration_or_date',
        ];

        if (!empty($dates)) {
            $data['start'] = $dates[0]['date'];
            if (isset($dates[1])) {
                $data['end'] = $dates[1]['date'];
            }
        }
        if ($dur !== null) {
            $data['duration_days']  = $dur['days'];
            $data['duration_label'] = $lang === 'en' ? $dur['label_en'] : $dur['label_id'];
        }
        if (count($matchedTasks) > 1) {
            $data['predecessor_id'] = $matchedTasks[1]['id'];
            $data['dep_type']       = $predSyntax[0]['dep_type'] ?? 'FS';
            $data['lag']            = $predSyntax[0]['lag'] ?? 0;
            $data['lead']           = $predSyntax[0]['lead'] ?? 0;
        }

        return $this->buildScheduleDraftOrConfirm($project, $data, $user, $lang);
    }

    protected function buildScheduleDraftOrConfirm(Project $project, array $data, User $user, string $lang): array
    {
        $targetTask = !empty($data['task_id']) ? Wbs::find($data['task_id']) : null;
        $mode       = $data['mode'] ?? 'duration_or_date';

        if (!$targetTask) {
            $pick = $this->buildTaskPickList($project->id, 6);
            $durNoteId = !empty($data['duration_label']) ? " jadi **{$data['duration_label']}**" : '';
            $durNoteEn = !empty($data['duration_label']) ? " to **{$data['duration_label']}**" : '';

            $content = $lang === 'en'
                ? "Okay! Which task in **{$project->title}** would you like to adjust{$durNoteEn}? Reply with its name, WBS code, or number:\n\n{$pick['lines']}"
                : "Oke siap! Task mana di projek **{$project->title}** yang mau kamu ubah durasi/jadwalnya{$durNoteId}? Balas nama task, kode WBS, atau nomornya ya:\n\n{$pick['lines']}";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_SCHEDULE',
                    'awaiting_slot' => 'task',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => $mode === 'predecessor' ? 'SET_PREDECESSOR' : 'UPDATE_SCHEDULE',
                'context_update'  => ['project_id' => $project->id, 'referenced_tasks' => $pick['refs']],
            ];
        }

        // Validate predecessor cycle upfront if predecessor_id is set
        if (!empty($data['predecessor_id'])) {
            $predTask = Wbs::find($data['predecessor_id']);
            if ($predTask) {
                if ($predTask->id === $targetTask->id) {
                    return [
                        'content'         => $lang === 'en' ? '⚠️ A task cannot depend on itself.' : '⚠️ Sebuah task tidak dapat menjadi predecessor bagi dirinya sendiri.',
                        'actions'         => [],
                        'pending_draft'   => null,
                        'resolved_intent' => 'SET_PREDECESSOR',
                    ];
                }
                if ($this->scheduler->wouldCauseCycle((string) $predTask->id, (string) $targetTask->id)) {
                    return [
                        'content' => $lang === 'en'
                            ? "🛑 **Circular Dependency Blocked**: Linking **{$targetTask->name}** to **{$predTask->name}** would create an infinite cycle."
                            : "🛑 **Circular Dependency Ditolak**: Menghubungkan **{$targetTask->name}** ke **{$predTask->name}** akan menimbulkan siklus dependensi tak berujung.",
                        'actions'         => [],
                        'pending_draft'   => null,
                        'resolved_intent' => 'SET_PREDECESSOR',
                    ];
                }
            }
        }

        $hasChange = !empty($data['start']) || !empty($data['end']) || !empty($data['duration_days']) || !empty($data['predecessor_id']);
        if (!$hasChange) {
            $curDur   = (int) ($targetTask->duration_days ?? 1);
            $curStart = $targetTask->start ? Carbon::parse($targetTask->start)->format('d M Y') : '—';
            $curEnd   = $targetTask->end ? Carbon::parse($targetTask->end)->format('d M Y') : '—';

            if ($mode === 'predecessor') {
                $pick = $this->buildTaskPickList($project->id, 6);
                $content = $lang === 'en'
                    ? "Okay! Which predecessor task should **{$targetTask->name}** depend on? *(You can also mention `FS`, `SS`, `FF`, or lag like `FS+2d`)*\n\n{$pick['lines']}"
                    : "Oke! Task **{$targetTask->name}** mau dihubungkan ke task pendahulu (predecessor) yang mana? *(Boleh sekalian sebut tipe `FS`/`SS`/`FF` dan lag, misal `1.1.1 FS+2d`)*\n\n{$pick['lines']}";

                return [
                    'content'         => $content,
                    'actions'         => [],
                    'pending_draft'   => [
                        'type'          => 'UPDATE_SCHEDULE',
                        'awaiting_slot' => 'predecessor',
                        'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                        'data'          => $data,
                    ],
                    'resolved_intent' => 'SET_PREDECESSOR',
                    'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id, 'referenced_tasks' => $pick['refs']],
                ];
            }

            $content = $lang === 'en'
                ? "Got it! Task **{$targetTask->name}** currently has a duration of **{$curDur} days** ({$curStart} to {$curEnd}). How many days should I change it to (e.g. `14 days`), or what new start date?"
                : "Oke! Task **{$targetTask->name}** saat ini durasinya **{$curDur} hari** ({$curStart} s/d {$curEnd}). Mau diubah jadi berapa hari (misal `14 hari`), atau mulai tanggal berapa?";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_draft'   => [
                    'type'          => 'UPDATE_SCHEDULE',
                    'awaiting_slot' => 'duration_or_date',
                    'expires_at'    => Carbon::now()->addMinutes(15)->toIso8601String(),
                    'data'          => $data,
                ],
                'resolved_intent' => 'UPDATE_SCHEDULE',
                'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
            ];
        }

        // Compute derived end date if duration_days is given without explicit end date
        $payload = [
            'project_id' => $project->id,
            'task_id'    => $targetTask->id,
        ];
        if (!empty($data['start'])) {
            $payload['start'] = $data['start'];
        }
        if (!empty($data['duration_days'])) {
            $payload['duration_days'] = (int) $data['duration_days'];
            $baseStart = $payload['start'] ?? ($targetTask->start ? Carbon::parse($targetTask->start)->format('Y-m-d') : Carbon::today('Asia/Jakarta')->format('Y-m-d'));
            $payload['start'] = $baseStart;
            $payload['end']   = $data['end'] ?? Carbon::parse($baseStart)->addDays(max(0, $payload['duration_days'] - 1))->format('Y-m-d');
        } elseif (!empty($data['end'])) {
            $payload['end'] = $data['end'];
        }
        if (!empty($data['predecessor_id'])) {
            $payload['predecessor_id'] = $data['predecessor_id'];
            $payload['dep_type']       = $data['dep_type'] ?? 'FS';
            $payload['lag']            = (int) ($data['lag'] ?? 0);
            $payload['lead']           = (int) ($data['lead'] ?? 0);
        }

        return $this->buildScheduleConfirmResponse($project, $targetTask, $payload, $lang);
    }

    protected function buildScheduleConfirmResponse(Project $project, Wbs $targetTask, array $payload, string $lang): array
    {
        $changes = [];
        if (!empty($payload['duration_days'])) {
            $changes[] = ($lang === 'en' ? 'Duration' : 'Durasi') . ": **{$payload['duration_days']} " . ($lang === 'en' ? 'days' : 'hari') . '**';
        }
        if (!empty($payload['start'])) {
            $changes[] = 'Start: ' . Carbon::parse($payload['start'])->format('d M Y');
        }
        if (!empty($payload['end'])) {
            $changes[] = 'End: ' . Carbon::parse($payload['end'])->format('d M Y');
        }
        if (!empty($payload['predecessor_id'])) {
            $predTask = Wbs::find($payload['predecessor_id']);
            if ($predTask) {
                $depType = $payload['dep_type'] ?? 'FS';
                $lag     = (int) ($payload['lag'] ?? 0);
                $lead    = (int) ($payload['lead'] ?? 0);
                $changes[] = "Predecessor: **{$predTask->name}** (`{$depType}`, lag: {$lag}d, lead: {$lead}d)";
            }
        }

        $pending = [
            'type'       => 'UPDATE_SCHEDULE',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => $payload,
        ];

        $codeMap = $this->buildTaskCodeMap($project->id);
        $code    = $codeMap[(string) $targetTask->id] ?? $targetTask->id;

        if ($lang === 'en') {
            $content = "Okay, here is the schedule & dependency update summary:\n\n"
                . "- **Project**: {$project->title} (`#{$project->id}`)\n"
                . "- **Target Task**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Changes**: " . implode(' | ', $changes) . "\n"
                . "- **Auto-Cascade**: Parent WBS & downstream tasks will auto-sync.\n\n"
                . "Can I execute this now? *(Reply **\"Yes\"** to apply or **\"Cancel\"**)*";
        } else {
            $content = "Oke, jadi ini ringkasan perubahan jadwal & durasi task:\n\n"
                . "- **Projek**: {$project->title} (`#{$project->id}`)\n"
                . "- **Task Tujuan**: `{$code}` — **{$targetTask->name}**\n"
                . "- **Perubahan**: " . implode(' | ', $changes) . "\n"
                . "- **Sinkronisasi**: Jadwal induk WBS & task penerusnya akan otomatis tersinkron.\n\n"
                . "Apakah bisa saya eksekusi sekarang? *(Balas **\"Ya\"** untuk menjalankan atau **\"Batal\"**)*";
        }

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_draft'   => null,
            'pending_action'  => $pending,
            'resolved_intent' => !empty($payload['predecessor_id']) ? 'SET_PREDECESSOR' : 'UPDATE_SCHEDULE',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
        ];
    }

    /**
     * Propose: Self-Healing Date Reconciliation.
     */
    protected function proposeReconcileDates(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        $wantsAll = (bool) preg_match('/\b(semua\s+proyek|all\s+projects|global)\b/i', $prompt);

        if ($wantsAll) {
            if (!$this->isSuperAdmin($user)) {
                return [
                    'content' => $lang === 'en'
                        ? '🔒 **Permission Denied**: Global date reconciliation across all projects is restricted to **SuperAdmin** only.'
                        : '🔒 **Akses Ditolak**: Rekonsiliasi tanggal global seluruh proyek hanya dapat dijalankan oleh **SuperAdmin**.',
                    'actions'         => [],
                    'resolved_intent' => 'RECONCILE_DATES',
                ];
            }

            $count = Project::count();
            $pending = [
                'type'       => 'RECONCILE_DATES',
                'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
                'payload'    => ['scope' => 'all'],
            ];

            $content = $lang === 'en'
                ? "📝 **Confirm Global Date Reconciliation**\n\n- **Scope**: All **{$count}** projects in PROVIS\n- **Action**: Align all child/parent Sub WBS & Main WBS date boundaries and log adjustments to `audit_logs`.\n\n> Reply **\"Yes\"** / **\"Confirm\"** to execute, or **\"Cancel\"** to abort."
                : "📝 **Konfirmasi Rekonsiliasi Tanggal Global**\n\n- **Cakupan**: Seluruh **{$count}** proyek di PROVIS\n- **Tindakan**: Menyelaraskan batas tanggal seluruh Sub/Main WBS dan mencatat hasilnya ke `audit_logs`.\n\n> Balas **\"Ya\"** / **\"Konfirmasi\"** untuk menjalankan, atau **\"Batal\"** untuk membatalkan.";

            return [
                'content'         => $content,
                'actions'         => [],
                'pending_action'  => $pending,
                'resolved_intent' => 'RECONCILE_DATES',
            ];
        }

        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        if ($resolved['denied']) {
            return $this->deniedProjectResponse($resolved['requested_id'], $lang);
        }

        $project = $resolved['project'];
        if (!$project) {
            return [
                'content'         => $lang === 'en' ? 'No accessible project found to reconcile.' : 'Tidak ditemukan proyek yang dapat diakses untuk direkonsiliasi.',
                'actions'         => [],
                'resolved_intent' => 'RECONCILE_DATES',
            ];
        }

        if (!$this->canUserEditWbs($user, $project)) {
            return [
                'content' => $lang === 'en'
                    ? "🔒 **Permission Denied**: Only the **PIC** of **{$project->title}** or a **SuperAdmin** can run date reconciliation."
                    : "🔒 **Akses Ditolak**: Hanya **PIC** proyek **{$project->title}** atau **SuperAdmin** yang dapat menjalankan rekonsiliasi tanggal.",
                'actions'         => [],
                'resolved_intent' => 'RECONCILE_DATES',
            ];
        }

        $pending = [
            'type'       => 'RECONCILE_DATES',
            'expires_at' => Carbon::now()->addMinutes(10)->toIso8601String(),
            'payload'    => [
                'scope'      => 'single',
                'project_id' => $project->id,
            ],
        ];

        $content = $lang === 'en'
            ? "📝 **Confirm Date Reconciliation**\n\n- **Project**: {$project->title} (`#{$project->id}`)\n- **Action**: Scan and align all child/parent Sub WBS & Main WBS dates.\n\n> Reply **\"Yes\"** / **\"Confirm\"** to execute, or **\"Cancel\"** to abort."
            : "📝 **Konfirmasi Rekonsiliasi Tanggal Proyek**\n\n- **Proyek**: {$project->title} (`#{$project->id}`)\n- **Tindakan**: Memindai dan menyelaraskan batas tanggal seluruh Sub/Main WBS di proyek ini.\n\n> Balas **\"Ya\"** / **\"Konfirmasi\"** untuk menjalankan, atau **\"Batal\"** untuk membatalkan.";

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_action'  => $pending,
            'resolved_intent' => 'RECONCILE_DATES',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    // =========================================================================
    // PENDING ACTION EXECUTION & CANCELLATION (STEP 2)
    // =========================================================================

    protected function cancelPendingAction(?array $pendingAction, string $lang): array
    {
        $type = $pendingAction['type'] ?? 'action';
        $content = $lang === 'en'
            ? "❌ **Action Cancelled**: No changes were made to the database (`{$type}` aborted)."
            : "❌ **Tindakan Dibatalkan**: Tidak ada perubahan yang disimpan ke database (`{$type}` dibatalkan).";

        return [
            'content'         => $content,
            'actions'         => [],
            'pending_action'  => null,
            'resolved_intent' => 'CANCEL_PENDING_ACTION',
        ];
    }

    protected function executePendingAction(?array $pendingAction, User $user, string $lang): array
    {
        if (empty($pendingAction) || empty($pendingAction['type'])) {
            return [
                'content' => $lang === 'en'
                    ? 'There is no pending action awaiting confirmation right now.'
                    : 'Saat ini tidak ada tindakan yang sedang menunggu konfirmasi.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'CONFIRM_PENDING_ACTION',
            ];
        }

        $type    = $pendingAction['type'];
        $payload = $pendingAction['payload'] ?? [];

        switch ($type) {
            case 'CREATE_PROJECT':
                return $this->commitCreateProject($payload, $user, $lang);

            case 'CREATE_USER':
                return $this->commitCreateUser($payload, $user, $lang);

            case 'MANAGE_PROJECT_ACCESS':
                return $this->commitManageProjectAccess($payload, $user, $lang);

            case 'ADD_TASK':
                return $this->commitAddTask($payload, $user, $lang);

            case 'UPDATE_TASK_STATUS':
                return $this->commitUpdateTaskStatus($payload, $user, $lang);

            case 'UPDATE_TASK_PROGRESS':
                return $this->commitUpdateTaskProgress($payload, $user, $lang);

            case 'UPDATE_SCHEDULE':
                return $this->commitUpdateSchedule($payload, $user, $lang);

            case 'RECONCILE_DATES':
                return $this->commitReconcileDates($payload, $user, $lang);

            default:
                return [
                    'content'         => $lang === 'en' ? 'Unknown pending action type.' : 'Jenis tindakan tertunda tidak dikenali.',
                    'actions'         => [],
                    'pending_action'  => null,
                    'resolved_intent' => 'CONFIRM_PENDING_ACTION',
                ];
        }
    }

    protected function commitCreateProject(array $payload, User $user, string $lang): array
    {
        if (!$this->canUserCreateProject($user)) {
            return [
                'content'         => $lang === 'en' ? '🔒 Permission denied.' : '🔒 Akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'CREATE_PROJECT',
            ];
        }

        // Resolve or create Company if user provided a new company name (SuperAdmin)
        $companyId = $payload['company_id'] ?? null;
        if (!$companyId && !empty($payload['company_name']) && $this->isSuperAdmin($user)) {
            $company = Company::firstOrCreate(['name' => trim($payload['company_name'])]);
            $companyId = $company->id;
        }
        if (!$companyId) {
            $companyId = $user->companies_id ?: (Company::first()?->id ?? 1);
        }

        $wbsMode = $payload['wbs_mode'] ?? 'default';

        $project = Project::create([
            'title'           => $payload['title'],
            'companies_id'    => $companyId,
            'project_manager' => $user->id,
            'start'           => $payload['start_date'],
            'end'             => $payload['end_date'],
            'status'          => 'Open',
            'progress'        => 0,
            'setup_status'    => 'active',
        ]);

        if ($wbsMode !== 'empty') {
            try {
                $this->templateService->applyTemplateToProject($project);
            } catch (\Throwable $e) {
                Log::warning('Template application error: ' . $e->getMessage());
            }
        }

        AuditLog::record(
            'CREATE_PROJECT',
            "Provis Support System (AI Agent) atas permintaan {$user->username} membuat proyek baru '{$project->title}' (ID #{$project->id}, WBS: {$wbsMode}).",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id]
        );

        $sFmt     = Carbon::parse($payload['start_date'])->format('d M Y');
        $eFmt     = Carbon::parse($payload['end_date'])->format('d M Y');
        $comp     = $project->company?->name ?? ($payload['company_name'] ?? 'Default Company');
        $durLabel = $payload['duration_label'] ?? (max(1, Carbon::parse($payload['start_date'])->diffInDays(Carbon::parse($payload['end_date']))) . ($lang === 'en' ? ' days' : ' hari'));
        $wbsTxtId = $wbsMode === 'empty' ? 'Kosong (siap diisi task manual)' : 'Master Template WBS Default (17 Main Task) telah diterapkan otomatis';
        $wbsTxtEn = $wbsMode === 'empty' ? 'Blank (ready for custom tasks)' : 'Default Master WBS Template (17 Main Tasks) applied automatically';

        if ($lang === 'en') {
            $content = "✅ **New Project Created Successfully!**\n\n"
                . "- **Project Title**: {$project->title}\n"
                . "- **Project ID**: #{$project->id}\n"
                . "- **Company**: {$comp}\n"
                . "- **Project Manager**: {$user->username}\n"
                . "- **Duration**: {$durLabel} ({$sFmt} to {$eFmt})\n"
                . "- **WBS & Tasks**: {$wbsTxtEn}.";
        } else {
            $content = "✅ **Projek Baru Berhasil Dibuat!**\n\n"
                . "- **Nama Projek**: {$project->title}\n"
                . "- **ID Projek**: #{$project->id}\n"
                . "- **Perusahaan**: {$comp}\n"
                . "- **Project Manager**: {$user->username}\n"
                . "- **Durasi**: {$durLabel} ({$sFmt} s/d {$eFmt})\n"
                . "- **Struktur WBS & Task**: {$wbsTxtId}.";
        }

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open Project Detail' : 'Buka Detail Projek', 'url' => "/projects/{$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'Manage WBS Tasks' : 'Kelola Tasks WBS', 'url' => "/tasks?project_id={$project->id}"],
                ['type' => 'link', 'label' => $lang === 'en' ? 'View Gantt / Timeline' : 'Lihat Gantt / Timeline', 'url' => "/timeline?project_id={$project->id}"],
            ],
            'pending_action'  => null,
            'pending_draft'   => null,
            'resolved_intent' => 'CREATE_PROJECT',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    protected function commitCreateUser(array $payload, User $user, string $lang): array
    {
        $targetRoleName = $payload['role_name'] ?? '';
        if (!$this->canUserCreateAccount($user, $targetRoleName)) {
            return [
                'content'         => $lang === 'en' ? '🔒 Permission denied.' : '🔒 Akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'pending_draft'   => null,
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        $role = Role::find($payload['role_id'] ?? null) ?? Role::where('name', $targetRoleName)->first();
        if (!$role) {
            return [
                'content'         => $lang === 'en' ? 'Target role not found.' : 'Role tujuan tidak ditemukan.',
                'actions'         => [],
                'pending_action'  => null,
                'pending_draft'   => null,
                'resolved_intent' => 'CREATE_USER',
            ];
        }

        $email = mb_strtolower(trim((string) ($payload['email'] ?? '')));
        if ($email === '' || User::where('email', $email)->exists()) {
            $email = $this->generateUniqueAccountEmail((string) ($payload['username'] ?? 'user'));
        }

        $plainPassword = (string) ($payload['password'] ?? 'Provis2026!');
        $username      = Str::limit(trim((string) ($payload['username'] ?? 'New User')), 45, '');

        $permissionMatrix = match ($role->name) {
            'SuperAdmin' => [
                'data_scope' => 'all',
            ],
            'admin_utama' => [
                'sidebar' => ['Dashboard', 'Project Detail', 'Tasks', "Today's Tasks", 'Timeline', 'Weekly Progress', 'Budget Management', 'Division Progress', 'S-Curve Report', 'User Management'],
                'features' => [
                    'projects' => ['view'],
                    'tasks'    => ['view'],
                    'weekly'   => ['view'],
                    'budget'   => ['view', 'create', 'edit', 'delete'],
                    'reports'  => ['view'],
                ],
                'data_scope' => 'all',
            ],
            'admin_progres' => [
                'sidebar' => ['S-Curve Report', 'Division Progress'],
                'features' => [
                    'projects' => ['view'],
                    'reports'  => ['view'],
                ],
                'data_scope' => 'all',
            ],
            'pic' => [
                'sidebar' => ['Dashboard', 'Projects', 'Project Detail', 'Tasks', "Today's Tasks", 'Timeline', 'Weekly Progress', 'Budget Management', 'Division Progress', 'S-Curve Report', 'Working Tree', 'User Management'],
                'features' => [
                    'projects' => ['view', 'create', 'edit'],
                    'tasks'    => ['view', 'create', 'edit'],
                    'users'    => ['view', 'create', 'edit'],
                    'reports'  => ['view'],
                ],
                'data_scope' => 'own_company',
            ],
            default => [
                'sidebar' => ['Dashboard', 'Projects', 'Tasks', "Today's Tasks", 'Timeline', 'Activity Log'],
                'features' => [
                    'projects' => ['view'],
                    'tasks'    => ['view', 'update_progress'],
                ],
                'data_scope' => 'own_company',
            ],
        };

        $companyId  = !empty($payload['company_id']) ? (int) $payload['company_id'] : null;
        $divisionId = !empty($payload['division_id']) ? (int) $payload['division_id'] : null;

        $newUser = User::create([
            'username'             => $username,
            'email'                => Str::limit($email, 45, ''),
            'password'             => Hash::make($plainPassword),
            'roles_id'             => $role->id,
            'companies_id'         => $companyId,
            'divisions_id'         => $divisionId,
            'permission_matrix'    => $permissionMatrix,
            'is_ai_beta_tester'    => $role->name === 'SuperAdmin',
            'created_by'           => $user->id,
            'must_change_password' => false,
        ]);

        if ($companyId !== null) {
            $newUser->companies()->sync([$companyId]);
        }
        if ($divisionId !== null) {
            $newUser->syncDivisions([$divisionId]);
        }

        AuditLog::record(
            'CREATE_USER',
            "Provis Support System (AI Agent) atas permintaan {$user->username} membuat akun baru '{$newUser->username}' ({$newUser->email}) dengan role {$role->name}.",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'created_user_id' => $newUser->id, 'role' => $role->name]
        );

        $roleLabel  = $payload['role_label'] ?? $role->name;
        $compLineId = !empty($payload['company_name']) ? "\n- **Perusahaan**: {$payload['company_name']}" : '';
        $compLineEn = !empty($payload['company_name']) ? "\n- **Company**: {$payload['company_name']}" : '';
        $divLineId  = !empty($payload['division_name']) ? "\n- **Divisi**: {$payload['division_name']}" : '';
        $divLineEn  = !empty($payload['division_name']) ? "\n- **Division**: {$payload['division_name']}" : '';
        $loginPortal = $role->name === 'SuperAdmin' ? '/admin/login' : '/login';

        if ($lang === 'en') {
            $content = "✅ **New User Account Created Successfully!**\n\n"
                . "- **Username**: **{$newUser->username}** (`#{$newUser->id}`)\n"
                . "- **Role**: **{$roleLabel}**\n"
                . "- **Email**: `{$newUser->email}`\n"
                . "- **Password**: `{$plainPassword}`"
                . $compLineEn
                . $divLineEn
                . "\n- **Login Portal**: `{$loginPortal}`";
        } else {
            $content = "✅ **Akun Baru Berhasil Dibuat!**\n\n"
                . "- **Nama Akun**: **{$newUser->username}** (`#{$newUser->id}`)\n"
                . "- **Role**: **{$roleLabel}**\n"
                . "- **Email Login**: `{$newUser->email}`\n"
                . "- **Password**: `{$plainPassword}`"
                . $compLineId
                . $divLineId
                . "\n- **Portal Login**: `{$loginPortal}`";
        }

        $mgmtUrl = $this->isSuperAdmin($user) ? '/admin/users' : '/users';

        return [
            'content' => $content,
            'actions' => [
                ['type' => 'link', 'label' => $lang === 'en' ? 'Open User Management' : 'Buka User Management', 'url' => $mgmtUrl],
            ],
            'pending_action'  => null,
            'pending_draft'   => null,
            'resolved_intent' => 'CREATE_USER',
        ];
    }

    protected function commitManageProjectAccess(array $payload, User $user, string $lang): array
    {
        $project = Project::find($payload['project_id'] ?? null);
        $op      = $payload['operation'] ?? '';

        if (!$project || !$this->canUserEditWbs($user, $project)) {
            return [
                'content'         => $lang === 'en' ? '🔒 Project not found or permission denied.' : '🔒 Projek tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            ];
        }

        if (in_array($op, ['set_private', 'set_public'], true)) {
            $isPrivate = ($op === 'set_private');
            $project->update(['is_private' => $isPrivate]);
            $visLabel = $isPrivate ? 'Private' : 'Public';

            AuditLog::record(
                'TOGGLE_PRIVATE_PROJECT',
                "Provis Support System (AI Agent) atas permintaan {$user->username} mengubah visibilitas projek '{$project->title}' menjadi {$visLabel}.",
                $user->id,
                request()?->ip(),
                ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id]
            );

            $content = $lang === 'en'
                ? "✅ **Project Visibility Updated!**\n\nProject **{$project->title}** (`#{$project->id}`) is now **`{$visLabel}`**."
                : "✅ **Visibilitas Projek Berhasil Diubah!**\n\nProjek **{$project->title}** (`#{$project->id}`) sekarang berstatus **`{$visLabel}`**.";

            return [
                'content'         => $content,
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"]],
                'pending_action'  => null,
                'pending_draft'   => null,
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
                'context_update'  => ['project_id' => $project->id],
            ];
        }

        $targetUser = User::find($payload['target_user_id'] ?? null);
        if (!$targetUser) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Target user not found.' : '⚠️ Target user tidak ditemukan.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            ];
        }

        if ($op === 'revoke') {
            ProjectMember::where('project_id', $project->id)->where('user_id', $targetUser->id)->delete();
            $matrix = $targetUser->permission_matrix ?? [];
            if (isset($matrix['project_access'][$project->id])) {
                $matrix['project_access'][$project->id]['view_project']  = false;
                $matrix['project_access'][$project->id]['view_progress'] = false;
                $targetUser->update(['permission_matrix' => $matrix]);
            }

            AuditLog::record(
                'REMOVE_PROJECT_MEMBER',
                "Provis Support System (AI Agent) atas permintaan {$user->username} mencabut akses user '{$targetUser->username}' dari projek '{$project->title}'.",
                $user->id,
                request()?->ip(),
                ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'member_user_id' => $targetUser->id]
            );

            $content = $lang === 'en'
                ? "✅ **Access Revoked!** User **{$targetUser->username}** no longer has member access to **{$project->title}**."
                : "✅ **Akses Berhasil Dicabut!** User **{$targetUser->username}** telah dihapus dari daftar akses projek **{$project->title}**.";
        } else {
            ProjectMember::updateOrCreate(
                ['project_id' => $project->id, 'user_id' => $targetUser->id],
                [
                    'division_id'  => $payload['division_id'] ?? $targetUser->divisions_id,
                    'project_role' => 'member',
                    'assigned_by'  => $user->id,
                ]
            );

            $matrix = $targetUser->permission_matrix ?? [];
            $projectAccess = $matrix['project_access'] ?? [];
            $projectAccess[$project->id] = [
                'view_project'  => true,
                'view_progress' => true,
            ];
            $matrix['project_access'] = $projectAccess;
            $targetUser->update(['permission_matrix' => $matrix]);

            AuditLog::record(
                'ASSIGN_PROJECT_MEMBER',
                "Provis Support System (AI Agent) atas permintaan {$user->username} memberikan akses projek '{$project->title}' kepada user '{$targetUser->username}'.",
                $user->id,
                request()?->ip(),
                ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'member_user_id' => $targetUser->id]
            );

            $content = $lang === 'en'
                ? "✅ **Access Granted!** User **{$targetUser->username}** can now view and access project **{$project->title}**."
                : "✅ **Akses Berhasil Diberikan!** User **{$targetUser->username}** sekarang sudah terdaftar dan dapat melihat projek **{$project->title}**.";
        }

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Working Tree' : 'Buka Working Tree', 'url' => "/working-tree?project_id={$project->id}"]],
            'pending_action'  => null,
            'pending_draft'   => null,
            'resolved_intent' => 'MANAGE_PROJECT_ACCESS',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    protected function commitAddTask(array $payload, User $user, string $lang): array
    {
        $project = Project::find($payload['project_id'] ?? null);
        $subWbs  = SubWbs::find($payload['sub_wbs_id'] ?? null);

        if (!$project || !$subWbs || !$this->canUserEditWbs($user, $project)) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Project/Sub Task not found or permission denied.' : '⚠️ Proyek/Sub Task tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'ADD_TASK',
            ];
        }

        $maxOrder = Wbs::where('sub_wbs_id', $subWbs->id)->max('order_index') ?? 0;

        $task = Wbs::create([
            'id'                => 'st-' . uniqid(),
            'sub_wbs_id'        => $subWbs->id,
            'divisions_id'      => $payload['divisions_id'],
            'name'              => $payload['name'],
            'weight'            => 0,
            'vendor'            => 'INTERNAL',
            'start'             => $payload['start'],
            'end'               => $payload['end'],
            'duration_days'     => max(1, (int) ($payload['duration'] ?? 7)),
            'progress'          => ($payload['status'] ?? 'Open') === 'Completed' ? 100 : 0,
            'is_completed'      => ($payload['status'] ?? 'Open') === 'Completed',
            'status'            => $payload['status'] ?? 'Open',
            'requires_evidence' => false,
            'order_index'       => $maxOrder + 1,
        ]);

        if (!empty($payload['divisions_id'])) {
            $task->divisions()->sync([(int) $payload['divisions_id']]);
        }

        try {
            $this->scheduler->syncParentWbsDates($task);
            $this->progressService->recalculateProjectProgress($project->id);
        } catch (\Throwable $e) {
            Log::warning('AI commitAddTask post-sync notice: ' . $e->getMessage());
        }

        AuditLog::record(
            'CREATE_TASK',
            "Provis Support System (AI Agent) atas permintaan {$user->username} menambahkan task '{$task->name}' (Status: {$task->status}) pada proyek '{$project->title}'.",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'task_id' => $task->id]
        );

        $content = $lang === 'en'
            ? "✅ **New Task Added Successfully!**\n\n- **Task**: **{$task->name}**\n- **Sub Task**: {$subWbs->name}\n- **Status**: `{$task->status}`\n- **Weights & Parent Dates**: Recalculated automatically."
            : "✅ **Task Baru Berhasil Ditambahkan!**\n\n- **Task**: **{$task->name}**\n- **Sub Task**: {$subWbs->name}\n- **Status**: `{$task->status}`\n- **Bobot & Tanggal Induk**: Otomatis diselaraskan.";

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
            'pending_action'  => null,
            'resolved_intent' => 'ADD_TASK',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $task->id],
        ];
    }

    protected function commitUpdateTaskStatus(array $payload, User $user, string $lang): array
    {
        $project = Project::find($payload['project_id'] ?? null);
        $task    = Wbs::find($payload['task_id'] ?? null);

        if (!$project || !$task || !$this->canUserUpdateTask($user, $project, $task)) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Task not found or permission denied.' : '⚠️ Task tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'UPDATE_TASK_STATUS',
            ];
        }

        $oldStatus   = $task->status ?? 'Open';
        $oldProgress = (int) ($task->progress ?? 0);
        $newStatus   = $payload['new_status'];

        $task->status = $newStatus;
        if ($newStatus === 'Completed') {
            $task->progress     = 100;
            $task->is_completed = true;
            $task->completed_by = $user->id;
            $task->completed_at = Carbon::now('Asia/Jakarta');
        } elseif ($newStatus === 'Outstanding') {
            if ((float) $task->progress >= 100) {
                $task->progress = 0;
            }
            $task->is_completed = false;
            $task->completed_by = null;
            $task->completed_at = null;
        } elseif ((float) $task->progress >= 100 && $newStatus !== 'Completed') {
            $task->is_completed = false;
            $task->completed_by = null;
            $task->completed_at = null;
        }
        $task->save();

        try {
            $this->progressService->recalculateProjectProgress($project->id);
        } catch (\Throwable $e) {
            Log::warning('AI commitUpdateTaskStatus recalculation notice: ' . $e->getMessage());
        }

        ProjectActivityLog::create([
            'project_id'   => $project->id,
            'wbs_id'       => $task->id,
            'user_id'      => $user->id,
            'action'       => 'UPDATE_TASK_STATUS',
            'old_progress' => $oldProgress,
            'new_progress' => (int) $task->progress,
            'description'  => "Status updated from '{$oldStatus}' to '{$newStatus}' via Provis Support Assistant.",
        ]);

        AuditLog::record(
            'UPDATE_TASK_STATUS',
            "Provis Support System (AI Agent) mengubah status task '{$task->name}' dari '{$oldStatus}' menjadi '{$newStatus}'.",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'task_id' => $task->id]
        );

        $content = $lang === 'en'
            ? "✅ **Task Status Updated!**\n\n- **Task**: **{$task->name}**\n- **Status**: `{$oldStatus}` → **`{$newStatus}`**\n- **Audit Trail**: Recorded under `Provis Support System (AI Agent)`."
            : "✅ **Status Task Berhasil Diperbarui!**\n\n- **Task**: **{$task->name}**\n- **Status**: `{$oldStatus}` → **`{$newStatus}`**\n- **Audit Trail**: Tercatat di `audit_logs` atas nama `Provis Support System (AI Agent)`.";

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
            'pending_action'  => null,
            'resolved_intent' => 'UPDATE_TASK_STATUS',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $task->id],
        ];
    }

    protected function commitUpdateTaskProgress(array $payload, User $user, string $lang): array
    {
        $project = Project::find($payload['project_id'] ?? null);
        $task    = Wbs::find($payload['task_id'] ?? null);

        if (!$project || !$task || !$this->canUserUpdateTask($user, $project, $task)) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Task not found or permission denied.' : '⚠️ Task tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'UPDATE_TASK_PROGRESS',
            ];
        }

        $oldProgress = (int) ($task->progress ?? 0);
        $newProgress = max(0, min(100, (int) ($payload['new_progress'] ?? 0)));

        $task->progress     = $newProgress;
        $task->is_completed = ($newProgress === 100);

        if ($task->is_completed) {
            $task->status       = 'Completed';
            $task->completed_by = $user->id;
            $task->completed_at = Carbon::now('Asia/Jakarta');
        } elseif ($task->status !== 'Outstanding') {
            $task->status       = $newProgress > 0 ? 'On Track' : 'Open';
            $task->completed_by = null;
            $task->completed_at = null;
        } else {
            $task->completed_by = null;
            $task->completed_at = null;
        }
        $task->save();

        try {
            $this->progressService->recalculateProjectProgress($project->id);
        } catch (\Throwable $e) {
            Log::warning('AI commitUpdateTaskProgress recalculation notice: ' . $e->getMessage());
        }

        ProjectActivityLog::create([
            'project_id'   => $project->id,
            'wbs_id'       => $task->id,
            'user_id'      => $user->id,
            'action'       => 'UPDATE_TASK_PROGRESS',
            'old_progress' => $oldProgress,
            'new_progress' => $newProgress,
            'description'  => "Progress updated from {$oldProgress}% to {$newProgress}% via Provis Support Assistant.",
        ]);

        AuditLog::record(
            'UPDATE_TASK_PROGRESS',
            "Provis Support System (AI Agent) memperbarui progres task '{$task->name}' dari {$oldProgress}% menjadi {$newProgress}%.",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'task_id' => $task->id]
        );

        $project->refresh();
        $projProg = round((float) ($project->progress ?? 0), 2);

        $content = $lang === 'en'
            ? "✅ **Task Progress Updated!**\n\n- **Task**: **{$task->name}**\n- **Progress**: `{$oldProgress}%` → **`{$newProgress}%`** (Status: `{$task->status}`)\n- **New Overall Project Progress**: **{$projProg}%**"
            : "✅ **Progres Task Berhasil Diperbarui!**\n\n- **Task**: **{$task->name}**\n- **Progres**: `{$oldProgress}%` → **`{$newProgress}%`** (Status: `{$task->status}`)\n- **Progres Proyek Terbaru**: **{$projProg}%**";

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
            'pending_action'  => null,
            'resolved_intent' => 'UPDATE_TASK_PROGRESS',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $task->id],
        ];
    }

    protected function commitUpdateSchedule(array $payload, User $user, string $lang): array
    {
        $project    = Project::find($payload['project_id'] ?? null);
        $targetTask = Wbs::find($payload['task_id'] ?? null);

        if (!$project || !$targetTask || !$this->canUserEditWbs($user, $project)) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Task not found or permission denied.' : '⚠️ Task tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'UPDATE_SCHEDULE',
            ];
        }

        $changes = [];

        DB::transaction(function () use ($payload, $targetTask, &$changes) {
            if (!empty($payload['duration_days'])) {
                $targetTask->duration_days = max(1, (int) $payload['duration_days']);
                $changes[] = "Duration: {$targetTask->duration_days}d";
            }
            if (!empty($payload['start'])) {
                $targetTask->start = $payload['start'];
                $changes[] = 'Start: ' . Carbon::parse($payload['start'])->format('d M Y');
            }
            if (!empty($payload['end'])) {
                $targetTask->end = $payload['end'];
                $changes[] = 'End: ' . Carbon::parse($payload['end'])->format('d M Y');
            }
            if (!empty($payload['predecessor_id'])) {
                $predTask = Wbs::find($payload['predecessor_id']);
                if ($predTask && $predTask->id !== $targetTask->id) {
                    $depType = $payload['dep_type'] ?? 'FS';
                    $lag     = (int) ($payload['lag'] ?? 0);
                    $lead    = (int) ($payload['lead'] ?? 0);

                    $targetTask->predecessor = $predTask->id;
                    $targetTask->dep_type    = $depType;
                    $targetTask->lag         = $lag;
                    $targetTask->lead        = $lead;

                    // Keep relational dependency tables in sync
                    $netLag = $lag - $lead;
                    $existing = TaskDependency::where('successor_wbs_id', $targetTask->id)
                        ->where('predecessor_wbs_id', $predTask->id)
                        ->first();
                    $group = TaskDependencyGroup::create([
                        'successor_wbs_id' => $targetTask->id,
                        'dependency_type'  => $depType,
                        'lag_days'         => $netLag,
                    ]);
                    if ($existing) {
                        $existing->update([
                            'dependency_group_id' => $group->id,
                            'dependency_type'     => $depType,
                            'lag_days'            => $netLag,
                        ]);
                    } else {
                        TaskDependency::create([
                            'predecessor_wbs_id'  => $predTask->id,
                            'successor_wbs_id'    => $targetTask->id,
                            'dependency_group_id' => $group->id,
                            'dependency_type'     => $depType,
                            'lag_days'            => $netLag,
                        ]);
                    }

                    $changes[] = "Predecessor: {$predTask->name} ({$depType}, lag: {$lag}d)";
                }
            }
            $targetTask->save();
        });

        try {
            $this->scheduler->recalculateTaskDates($targetTask);
            $this->scheduler->propagate((string) $targetTask->id);
            $this->scheduler->syncParentWbsDates($targetTask);
        } catch (\Throwable $e) {
            Log::warning('AI commitUpdateSchedule propagation notice: ' . $e->getMessage());
        }

        AuditLog::record(
            'UPDATE_TASK_SCHEDULE',
            "Provis Support System (AI Agent) memperbarui task '{$targetTask->name}' (" . implode(', ', $changes) . ").",
            $user->id,
            request()?->ip(),
            ['actor' => 'Provis Support System (AI Agent)', 'project_id' => $project->id, 'task_id' => $targetTask->id]
        );

        $content = $lang === 'en'
            ? "🔗 **Schedule & Dependencies Updated!**\n\n- **Task**: {$targetTask->name}\n- **Changes**: " . implode(' | ', $changes) . "\n- **Sync**: Parent WBS & downstream dates have been automatically aligned."
            : "🔗 **Jadwal & Dependensi Pekerjaan Diperbarui!**\n\n- **Task**: {$targetTask->name}\n- **Perubahan**: " . implode(' | ', $changes) . "\n- **Sinkronisasi**: Jadwal induk WBS telah otomatis diselaraskan secara cascading.";

        return [
            'content'         => $content,
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'View Gantt / Timeline' : 'Lihat di Gantt / Timeline', 'url' => "/timeline?project_id={$project->id}"]],
            'pending_action'  => null,
            'resolved_intent' => 'UPDATE_SCHEDULE',
            'context_update'  => ['project_id' => $project->id, 'task_id' => $targetTask->id],
        ];
    }

    protected function commitReconcileDates(array $payload, User $user, string $lang): array
    {
        if (($payload['scope'] ?? 'single') === 'all' && $this->isSuperAdmin($user)) {
            $projects = Project::all();
            $totalRepairs = 0;
            foreach ($projects as $p) {
                $rep = $this->scheduler->reconcileProjectDates($p, 'Provis Support System (AI Agent)');
                $totalRepairs += count($rep);
            }

            $content = $lang === 'en'
                ? "🛠️ **Global Self-Healing Date Reconciliation Completed!**\n\n- **Projects Scanned**: {$projects->count()} projects\n- **Adjustments Made**: {$totalRepairs} date boundary alignments\n- **Audit Trail**: Logged under `Provis Support System (AI Agent)`."
                : "🛠️ **Self-Healing Rekonsiliasi Tanggal Global Selesai!**\n\n- **Total Proyek Dipindai**: {$projects->count()} proyek\n- **Total Perbaikan Jadwal**: {$totalRepairs} ketidaksesuaian tanggal berhasil diselaraskan.\n- **Status Sistem**: Batas tanggal seluruh task anak dan induk kini 100% konsisten.";

            return [
                'content'         => $content,
                'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Inspect Audit Log' : 'Periksa Audit Log', 'url' => '/admin/audit-log?actor=Provis+Support+System']],
                'pending_action'  => null,
                'resolved_intent' => 'RECONCILE_DATES',
            ];
        }

        $project = Project::find($payload['project_id'] ?? null);
        if (!$project || !$this->canUserEditWbs($user, $project)) {
            return [
                'content'         => $lang === 'en' ? '⚠️ Project not found or permission denied.' : '⚠️ Proyek tidak ditemukan atau akses ditolak.',
                'actions'         => [],
                'pending_action'  => null,
                'resolved_intent' => 'RECONCILE_DATES',
            ];
        }

        $repairs = $this->scheduler->reconcileProjectDates($project, 'Provis Support System (AI Agent)');
        $count   = count($repairs);

        $content = $lang === 'en'
            ? "🛠️ **Self-Healing Date Reconciliation Completed!**\n\n- **Project**: {$project->title} (`#{$project->id}`)\n- **Adjustments Made**: {$count} Sub/Main WBS boundary repairs.\n- **Audit Trail**: Logged in `audit_logs` under **'Provis Support System (AI Agent)'**."
            : "🛠️ **Self-Healing Rekonsiliasi Tanggal Selesai!**\n\n- **Proyek**: {$project->title} (`#{$project->id}`)\n- **Perbaikan Dilakukan**: {$count} penyesuaian batas tanggal Sub/Main Task.\n- **Audit Trail**: Seluruh tindakan tercatat di `audit_logs` atas nama **'Provis Support System (AI Agent)'**.";

        $actions = [['type' => 'link', 'label' => $lang === 'en' ? 'Open Project Detail' : 'Buka Detail Proyek', 'url' => "/projects/{$project->id}"]];
        if ($this->isSuperAdmin($user)) {
            $actions[] = ['type' => 'link', 'label' => $lang === 'en' ? 'Inspect Audit Log' : 'Periksa Audit Log', 'url' => '/admin/audit-log?actor=Provis+Support+System'];
        }

        return [
            'content'         => $content,
            'actions'         => $actions,
            'pending_action'  => null,
            'resolved_intent' => 'RECONCILE_DATES',
            'context_update'  => ['project_id' => $project->id],
        ];
    }

    // =========================================================================
    // SMART FALLBACK (KNOWLEDGE BASE -> ENTITY LOOKUP -> CONTEXTUAL GUIDE)
    // =========================================================================

    protected function handleSmartFallback(
        string $prompt,
        array $tokenized,
        User $user,
        ?int $activeProjectId,
        array $sessionContext,
        string $lang
    ): array {
        // 0. Check if it's an implicit math/percentage calculation
        if ($this->tokenizer->evaluateMathExpression($prompt) !== null) {
            return $this->handleCalculateMath($prompt, $lang);
        }

        // 0b. Check Local Learned Memory (`ai_learned_knowledge`) for instant zero-wait answer!
        $learned = $this->deepLearning->findLearnedMatch($prompt);
        if ($learned) {
            $res = $this->deepLearning->executeLearnedEntry($learned, $user, $activeProjectId, $lang, $prompt);
            return [
                'content'              => $res['content'],
                'actions'              => $res['actions'] ?? [],
                'resolved_intent'      => 'LEARNED_ANALYSIS',
                'learned_from_memory'  => true,
                'learned_knowledge_id' => $learned->id,
            ];
        }

        // 1. Try local Knowledge Base (handles implicit questions like "fungsi outstanding", "aturan evidence")
        $kbHit = $this->knowledgeBase->search($prompt, $lang, $activeProjectId);
        if ($kbHit && $kbHit['score'] >= 3.5) {
            return [
                'content'         => $kbHit['content'],
                'actions'         => $kbHit['actions'],
                'resolved_intent' => 'KNOWLEDGE_BASE',
                'context_update'  => ['kb_topic' => $kbHit['id']],
            ];
        }

        // 2. If user mentioned a task directly, show its detail!
        if (!empty($tokenized['matched_tasks'])) {
            return $this->handleQueryTasks($tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }

        // 3. If user mentioned a project directly, show its summary!
        if (!empty($tokenized['matched_projects'])) {
            return $this->handleProjectSummaryQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }

        // 4. If user mentioned a division or status, list matching tasks!
        if (!empty($tokenized['matched_divisions']) || !empty($tokenized['statuses'])) {
            return $this->handleQueryTasks($tokenized, $user, $activeProjectId, $sessionContext, $lang);
        }

        $lower = mb_strtolower(trim($prompt));

        // 5. Check if user mentioned a specific Company name (e.g. "PT Karabha", "Imli")
        $companies = $this->isSuperAdmin($user)
            ? Company::with(['projects', 'users'])->get()
            : Company::with(['projects', 'users'])->whereIn('id', $user->getCompanyIds())->get();

        foreach ($companies as $comp) {
            $cLower = mb_strtolower(trim($comp->name));
            $cClean = trim(preg_replace('/^(pt\.?|cv\.?)\s+/i', '', $cLower));
            if (($cLower !== '' && str_contains($lower, $cLower)) || (mb_strlen($cClean) >= 4 && str_contains($lower, $cClean))) {
                return $this->handleCompaniesQuery($tokenized, $user, $lang, $prompt);
            }
        }

        // 6. Check if user mentioned a specific User's username or email (e.g. "Worker IT", "superadmin@provis.id")
        if ($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic()) {
            $userCandidates = $this->isSuperAdmin($user)
                ? User::with(['role', 'division', 'company'])->get()
                : User::with(['role', 'division', 'company'])->whereIn('companies_id', !empty($user->getCompanyIds()) ? $user->getCompanyIds() : [-1])->get();

            $accessibleIds = $this->getAccessibleProjectIds($user);
            foreach ($userCandidates as $uCand) {
                $uName  = mb_strtolower(trim($uCand->username));
                $uEmail = mb_strtolower(trim($uCand->email));
                if ((mb_strlen($uName) >= 4 && str_contains($lower, $uName)) || ($uEmail !== '' && str_contains($lower, $uEmail))) {
                    $managedQuery = Project::where('project_manager', $uCand->id);
                    if (!$this->isSuperAdmin($user)) {
                        $managedQuery->whereIn('id', !empty($accessibleIds) ? $accessibleIds : [-1]);
                    }
                    $managed = $managedQuery->pluck('title')->implode(', ') ?: '—';
                    $rName   = $uCand->role?->name ?? 'worker';
                    $dName   = $uCand->division?->divisi ?? 'General';
                    $cName   = $uCand->company?->name ?? '—';

                    $content = $lang === 'en'
                        ? "👤 **User Profile: {$uCand->username}**\n\n"
                          . "- **Email**: `{$uCand->email}`\n"
                          . "- **Role**: `{$rName}`\n"
                          . "- **Division**: **{$dName}**\n"
                          . "- **Company**: {$cName}\n"
                          . "- **Managed Projects (PIC)**: {$managed}"
                        : "👤 **Profil Pengguna: {$uCand->username}**\n\n"
                          . "- **Email**: `{$uCand->email}`\n"
                          . "- **Role**: `{$rName}`\n"
                          . "- **Divisi**: **{$dName}**\n"
                          . "- **Perusahaan**: {$cName}\n"
                          . "- **Proyek yang Dikelola (PIC)**: {$managed}";

                    return [
                        'content'         => $content,
                        'actions'         => [],
                        'resolved_intent' => 'QUERY_USERS',
                    ];
                }
            }
        }

        // 7. Check if user mentioned a Main Job (MainWbs), Sub Task (SubWbs), or Budget Entry across accessible projects
        $resolved = $this->resolveTargetProject($user, $tokenized, $activeProjectId, $sessionContext);
        $project  = $resolved['project'];
        if ($project) {
            $mainJobs = MainWbs::where('projects_id', $project->id)->with('subWbs.wbsTasks')->get();
            foreach ($mainJobs as $mj) {
                $mjLower = mb_strtolower(trim($mj->name));
                if (mb_strlen($mjLower) >= 4 && (str_contains($lower, $mjLower) || (mb_strlen($lower) >= 4 && str_contains($mjLower, $lower)))) {
                    $prog   = round((float) ($mj->progress ?? 0), 1);
                    $weight = round((float) ($mj->percentage ?? 0), 1);
                    $sLines = $mj->subWbs->values()->map(fn($s, $i) => ($i + 1) . ". **{$s->name}** — **" . round((float) ($s->progress ?? 0), 1) . "%** (`{$s->status}`, " . $s->wbsTasks->count() . " tasks)")->implode("\n");

                    $content = ($lang === 'en'
                        ? "📌 **Main Job Detail: {$mj->name}** (*{$project->title}*)\n\n- **Weight**: **{$weight}%** | **Progress**: **{$prog}%** (`{$mj->status}`)\n\n**Sub Tasks:**\n"
                        : "📌 **Rincian Main Job: {$mj->name}** (*{$project->title}*)\n\n- **Bobot**: **{$weight}%** | **Progres**: **{$prog}%** (`{$mj->status}`)\n\n**Daftar Sub Task:**\n")
                        . ($sLines ?: '—');

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                        'resolved_intent' => 'QUERY_WBS_STRUCTURE',
                        'context_update'  => ['project_id' => $project->id],
                    ];
                }

                // Also check SubWbs names
                foreach ($mj->subWbs as $sub) {
                    $sLower = mb_strtolower(trim($sub->name));
                    if (mb_strlen($sLower) >= 3 && (str_contains($lower, $sLower) || (mb_strlen($lower) >= 4 && str_contains($sLower, $lower)))) {
                        $tLines = $sub->wbsTasks->values()->map(fn($t, $i) => ($i + 1) . ". **{$t->name}** — **" . round((float) ($t->progress ?? 0), 1) . "%** (`{$t->status}`)")->implode("\n");
                        $content = ($lang === 'en'
                            ? "📂 **Sub Task Detail: {$sub->name}** (*{$mj->name} · {$project->title}*)\n\n- **Progress**: **" . round((float) ($sub->progress ?? 0), 1) . "%** (`{$sub->status}`)\n\n**Tasks:**\n"
                            : "📂 **Rincian Sub Task: {$sub->name}** (*{$mj->name} · {$project->title}*)\n\n- **Progres**: **" . round((float) ($sub->progress ?? 0), 1) . "%** (`{$sub->status}`)\n\n**Daftar Task:**\n")
                            . ($tLines ?: '—');

                        return [
                            'content'         => $content,
                            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Tasks' : 'Buka Tasks', 'url' => "/tasks?project_id={$project->id}"]],
                            'resolved_intent' => 'QUERY_WBS_STRUCTURE',
                            'context_update'  => ['project_id' => $project->id],
                        ];
                    }
                }
            }

            // Check Budget Entries (nama_item / referensi like PR-2026-088) if user has budget permission
            if ($this->canUserViewBudget($user) && mb_strlen($lower) >= 4) {
                $bHits = BudgetEntry::where('projects_id', $project->id)
                    ->where(function ($q) use ($lower) {
                        $q->whereRaw('LOWER(nama_item) LIKE ?', ["%{$lower}%"])
                          ->orWhereRaw('LOWER(referensi) LIKE ?', ["%{$lower}%"]);
                    })
                    ->take(5)
                    ->get();

                if ($bHits->isNotEmpty()) {
                    $bLines = $bHits->values()->map(fn($b, $i) => ($i + 1) . ". **{$b->nama_item}** ({$b->kategori}) — **{$this->formatRupiah((float) $b->harga_total)}** · Ref: `{$b->referensi}`")->implode("\n");
                    $content = ($lang === 'en'
                        ? "💰 **Matching Budget Entries in {$project->title}:**\n\n"
                        : "💰 **Item Budget yang Cocok di {$project->title}:**\n\n")
                        . $bLines;

                    return [
                        'content'         => $content,
                        'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Budget' : 'Buka Budget', 'url' => "/budget?project_id={$project->id}"]],
                        'resolved_intent' => 'QUERY_BUDGET',
                        'context_update'  => ['project_id' => $project->id],
                    ];
                }
            }
        }

        // 8. Concept-Bag Safety Recovery: ONLY for clear, high-coherence single-topic prompts!
        // Never allow 1-2 stray words inside comparative/cross-entity/noisy prompts to hijack Deep Thinking!
        $concepts  = $tokenized['concepts'] ?? $this->tokenizer->extractSemanticConcepts($prompt);
        $structure = $tokenized['sentence_structure'] ?? $this->tokenizer->analyzeSentenceStructure($prompt, $tokenized);
        $allowConceptRecovery = !($structure['is_low_coherence'] ?? false)
            && !($structure['has_irrelevant_noise'] ?? false)
            && !($structure['is_cross_company'] ?? false)
            && !(($structure['is_cross_project'] ?? false) && (!empty($concepts['ENTITY_SCURVE']) || !empty($concepts['ENTITY_BUDGET'])))
            && !(($structure['is_comparative_rank'] ?? false) && empty($tokenized['matched_projects'] ?? []) && (!empty($concepts['ENTITY_SCURVE']) || !empty($concepts['ENTITY_BUDGET'])));

        if ($allowConceptRecovery) {
            if (!empty($concepts['ENTITY_USER']) || !empty($concepts['ROLE_SUPERADMIN']) || !empty($concepts['ROLE_ADMIN']) || !empty($concepts['ROLE_PIC']) || !empty($concepts['ROLE_WORKER']) || !empty($concepts['ROLE_BETA'])) {
                return $this->handleUsersQuery($user, $activeProjectId, $sessionContext, $lang, $prompt, $tokenized);
            }
            if (!empty($concepts['ENTITY_COMPANY'])) {
                return $this->handleCompaniesQuery($tokenized, $user, $lang, $prompt);
            }
            if (!empty($concepts['ENTITY_DIVISION'])) {
                return $this->handleDivisionsQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang, $prompt);
            }
            if (!empty($concepts['ENTITY_BUDGET'])) {
                return $this->handleBudgetQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);
            }
            if (!empty($concepts['ENTITY_SCURVE'])) {
                return $this->handleSCurveQuery($tokenized, $user, $activeProjectId, $sessionContext, $lang);
            }
            if (!empty($concepts['ENTITY_TEMPLATE'])) {
                return $this->handleTemplatesQuery($user, $lang);
            }
            if (!empty($concepts['ENTITY_AUDIT'])) {
                return $this->handleAuditLogQuery($user, $lang);
            }
            if (!empty($concepts['ENTITY_SYSTEM'])) {
                return $this->handleSystemOverviewQuery($user, $lang, $prompt);
            }
        }

        // 9. Short incomplete write verb fragments (<= 4 words, e.g. "mau bikin", "mau ubah", "ubah projek")
        $wordCount = count(array_filter(explode(' ', trim($lower))));
        if ($wordCount <= 4 && preg_match('/\b(buat|buatkan|buatin|bikin|bikinin|create|tambah|tambahkan|add)\b/i', $lower)) {
            $content = $lang === 'en'
                ? "Sure! What would you like me to create — a **new project** or a **new task**? Just tell me which one and we'll go through it step by step!"
                : "Siap! Kamu lagi mau bikin **projek baru** atau menambahkan **task baru** nih? Bilang aja yang mana, nanti aku bantu lengkapi bareng langkah demi langkah!";

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GENERAL_QUERY',
            ];
        }
        if ($wordCount <= 4 && preg_match('/\b(ubah|mengubah|ganti|edit|atur|update|perbarui|change|modify|set)\b/i', $lower)) {
            $content = $lang === 'en'
                ? "Got it! What would you like to update — a **task duration/schedule**, **task status (`Outstanding`, etc.)**, **task progress (%)**, or **user access/visibility for a project**? Let me know and I'll walk you right through it!"
                : "Oke siap! Bagian mana nih yang mau kamu ubah — **durasi/jadwal task**, **status task (`Outstanding`, dll.)**, **persentase progres task**, atau **akses user yang bisa melihat projek**? Kasih tahu aja, nanti langsung kita bereskan!";

            return [
                'content'         => $content,
                'actions'         => [],
                'resolved_intent' => 'GENERAL_QUERY',
            ];
        }

        // 10. PROVIS WORK SCOPE CHECK BEFORE ASYNC LEARNING:
        // Unmistakable standalone out-of-scope prompts reject immediately; short vague work phrases clarify first.
        // Longer unfamiliar, noisy, or mixed-keyword questions fall through to Step 11 (AI Thinking Mode)
        // so the user sees the AI genuinely analyze all words locally before answering or rejecting!
        if ($this->tokenizer->isClearlyOutOfScope($prompt) && !$this->tokenizer->hasProvisDomainSignal($prompt, $tokenized)) {
            return $this->outOfScopeResponse($lang);
        }

        if (
            !$this->tokenizer->hasProvisDomainSignal($prompt, $tokenized)
            && !$this->hasAccessibleDbMatch($prompt, $user)
            && $wordCount <= 5
        ) {
            return $this->askScopeClarification($prompt, ['status' => 'ambiguous', 'reason' => 'unrecognized_scope', 'ambiguous_term' => null], $lang);
        }

        // 11. ASYNC LOCAL SELF-LEARNING ENGINE:
        // Genuine unseen PROVIS work question! Dispatch our local background learning engine to deeply
        // analyze the question across permitted PROVIS tables, build the answer, and persist it into `ai_learned_knowledge`!
        return [
            'trigger_async_learning' => true,
            'content'                => '',
            'actions'                => [],
            'resolved_intent'        => 'DEEP_LEARNING',
        ];
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    protected function resolveSingleTask(array $tokenized, array $sessionContext, int $projectId): ?Wbs
    {
        $followUp = $tokenized['follow_up'] ?? [];

        // 1. Follow-up index referencing previously shown tasks ("nomor 1", "yang pertama")
        if (!empty($followUp['item_index']) && !empty($sessionContext['referenced_tasks'])) {
            $ref = $sessionContext['referenced_tasks'][$followUp['item_index'] - 1] ?? null;
            if ($ref) {
                $t = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))->find($ref['id']);
                if ($t) {
                    return $t;
                }
            }
        }

        // 2. Directly matched task in current prompt
        if (!empty($tokenized['matched_tasks'][0]['id'])) {
            $t = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
                ->find($tokenized['matched_tasks'][0]['id']);
            if ($t) {
                return $t;
            }
        }

        // 3. Pronominal reference to last discussed task ("task ini", "task tadi", "this task")
        if (($followUp['refers_to_previous'] ?? false) && !empty($sessionContext['task_id'])) {
            return Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
                ->find($sessionContext['task_id']);
        }

        return null;
    }

    protected function deniedProjectResponse(?int $requestedId, string $lang): array
    {
        $idLabel = $requestedId ? " (#{$requestedId})" : '';
        return [
            'content' => $lang === 'en'
                ? "🔒 **Access Denied**: You do not have permission to view or modify project{$idLabel}. Provis Support System strictly enforces your role and company boundaries."
                : "🔒 **Akses Ditolak**: Anda tidak memiliki izin untuk melihat atau mengubah proyek{$idLabel}. Provis Support System menerapkan pembatasan data ketat sesuai role dan perusahaan akun Anda.",
            'actions'         => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Accessible Projects' : 'Buka Proyek Anda', 'url' => '/projectlistpage']],
            'resolved_intent' => 'ACCESS_DENIED',
        ];
    }

    protected function formatRupiah(float $amount): string
    {
        $prefix = $amount < 0 ? '-Rp ' : 'Rp ';
        return $prefix . number_format(abs($amount), 0, ',', '.');
    }
}
