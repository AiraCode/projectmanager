<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiChatSession;
use App\Models\AiLearningTask;
use App\Services\ProvisAiService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class ProvisAiChatController extends Controller
{
    protected ProvisAiService $aiService;

    public function __construct(ProvisAiService $aiService)
    {
        $this->aiService = $aiService;
    }

    /**
     * List current user's chat sessions (auto-prunes H+7 expired chats first).
     */
    public function sessions(Request $request): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);
        $this->aiService->ensureStaleLearningTasksProcessed($request->user()->id);

        $sessions = AiChatSession::where('user_id', $request->user()->id)
            ->withCount('messages')
            ->orderBy('updated_at', 'desc')
            ->take(20)
            ->get();

        $processingSessionIds = Schema::hasTable('ai_learning_tasks')
            ? AiLearningTask::where('user_id', $request->user()->id)
                ->where('status', 'processing')
                ->pluck('session_id')
                ->unique()
                ->values()
                ->all()
            : [];

        return response()->json([
            'sessions'               => $sessions,
            'processing_session_ids' => $processingSessionIds,
        ]);
    }

    /**
     * Create a new chat session.
     */
    public function createSession(Request $request): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);

        $request->validate([
            'title' => 'nullable|string|max:100',
        ]);

        $session = AiChatSession::create([
            'user_id' => $request->user()->id,
            'title'   => $request->input('title') ?: 'New Conversation',
        ]);

        return response()->json([
            'session' => $session,
        ]);
    }

    /**
     * Get messages for a given session (and drive any stale background learning tasks).
     */
    public function getSession(Request $request, int $id): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);
        $this->aiService->ensureStaleLearningTasksProcessed($request->user()->id, $id);

        $session = AiChatSession::where('user_id', $request->user()->id)
            ->with(['messages' => fn($q) => $q->orderBy('id', 'asc')])
            ->findOrFail($id);

        $hasProcessing = Schema::hasTable('ai_learning_tasks')
            ? AiLearningTask::where('user_id', $request->user()->id)
                ->where('session_id', $session->id)
                ->where('status', 'processing')
                ->exists()
            : false;

        return response()->json([
            'session'        => $session,
            'messages'       => $session->messages,
            'has_processing' => $hasProcessing,
        ]);
    }

    /**
     * Return active & recently completed local self-learning background tasks for the logged-in user.
     * Works seamlessly across sidebar close, page navigation, and browser refresh!
     */
    public function activeTasks(Request $request): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);
        $userId = $request->user()->id;
        $this->aiService->ensureStaleLearningTasksProcessed($userId);

        if (!Schema::hasTable('ai_learning_tasks')) {
            return response()->json([
                'processing_tasks'   => [],
                'recently_completed' => [],
            ]);
        }

        $processing = AiLearningTask::where('user_id', $userId)
            ->where('status', 'processing')
            ->orderByDesc('id')
            ->get(['id', 'session_id', 'assistant_message_id', 'status', 'stage_label', 'created_at']);

        $recentlyCompleted = AiLearningTask::where('user_id', $userId)
            ->where('status', 'completed')
            ->where('completed_at', '>=', Carbon::now('Asia/Jakarta')->subSeconds(90))
            ->orderByDesc('completed_at')
            ->take(5)
            ->get(['id', 'session_id', 'assistant_message_id', 'status', 'learned_knowledge_id', 'completed_at']);

        return response()->json([
            'processing_tasks'   => $processing,
            'recently_completed' => $recentlyCompleted,
        ]);
    }

    /**
     * Poll status & live message output of a specific background local learning task.
     */
    public function taskStatus(Request $request, int $taskId): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);
        $userId = $request->user()->id;
        $this->aiService->ensureStaleLearningTasksProcessed($userId);

        $task = AiLearningTask::where('user_id', $userId)
            ->with('assistantMessage')
            ->findOrFail($taskId);

        $msg = $task->assistantMessage;

        return response()->json([
            'task' => [
                'id'                   => $task->id,
                'session_id'           => $task->session_id,
                'assistant_message_id' => $task->assistant_message_id,
                'status'               => $task->status,
                'stage_label'          => $task->stage_label,
                'learned_knowledge_id' => $task->learned_knowledge_id,
            ],
            'message' => $msg ? [
                'id'         => $msg->id,
                'role'       => $msg->role,
                'content'    => $msg->content,
                'actions'    => $msg->metadata['actions'] ?? [],
                'metadata'   => $msg->metadata,
                'created_at' => $msg->created_at,
            ] : null,
        ]);
    }

    /**
     * Post a user message and receive AI response.
     */
    public function chat(Request $request, ?int $id = null): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);

        $request->validate([
            'message'    => 'required|string|max:5000',
            'session_id' => 'nullable|integer',
            'project_id' => 'nullable|integer',
        ]);

        $user = $request->user();
        $sessionId = $id ?: $request->input('session_id');
        $projectId = $request->input('project_id');
        $prompt = trim($request->input('message'));

        $response = $this->aiService->chat($user, $prompt, $sessionId, $projectId);

        return response()->json($response);
    }

    /**
     * Delete a chat session.
     */
    public function deleteSession(Request $request, int $id): JsonResponse
    {
        $this->aiService->ensureTablesAndPruneExpiredChats(7);

        $session = AiChatSession::where('user_id', $request->user()->id)->findOrFail($id);
        $session->delete();

        return response()->json([
            'message' => 'Sesi obrolan berhasil dihapus.',
        ]);
    }
}

