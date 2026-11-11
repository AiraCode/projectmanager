<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiChatSession;
use App\Services\ProvisAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProvisAiChatController extends Controller
{
    protected ProvisAiService $aiService;

    public function __construct(ProvisAiService $aiService)
    {
        $this->aiService = $aiService;
    }

    /**
     * List current user's chat sessions.
     */
    public function sessions(Request $request): JsonResponse
    {
        $sessions = AiChatSession::where('user_id', $request->user()->id)
            ->withCount('messages')
            ->orderBy('updated_at', 'desc')
            ->take(20)
            ->get();

        return response()->json([
            'sessions' => $sessions,
        ]);
    }

    /**
     * Create a new chat session.
     */
    public function createSession(Request $request): JsonResponse
    {
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
     * Get messages for a given session.
     */
    public function getSession(Request $request, int $id): JsonResponse
    {
        $session = AiChatSession::where('user_id', $request->user()->id)
            ->with('messages')
            ->findOrFail($id);

        return response()->json([
            'session'  => $session,
            'messages' => $session->messages,
        ]);
    }

    /**
     * Post a user message and receive AI response.
     */
    public function chat(Request $request, ?int $id = null): JsonResponse
    {
        $request->validate([
            'message'    => 'required|string|max:5000',
            'session_id' => 'nullable|integer|exists:ai_chat_sessions,id',
            'project_id' => 'nullable|integer|exists:projects,id',
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
        $session = AiChatSession::where('user_id', $request->user()->id)->findOrFail($id);
        $session->delete();

        return response()->json([
            'message' => 'Sesi obrolan berhasil dihapus.',
        ]);
    }
}
