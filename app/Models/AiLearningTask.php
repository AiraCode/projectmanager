<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiLearningTask extends Model
{
    protected $table = 'ai_learning_tasks';

    protected $fillable = [
        'session_id',
        'user_id',
        'assistant_message_id',
        'active_project_id',
        'prompt',
        'language',
        'status',
        'stage_label',
        'learned_knowledge_id',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'started_at'   => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(AiChatSession::class, 'session_id');
    }

    public function assistantMessage(): BelongsTo
    {
        return $this->belongsTo(AiChatMessage::class, 'assistant_message_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function learnedKnowledge(): BelongsTo
    {
        return $this->belongsTo(AiLearnedKnowledge::class, 'learned_knowledge_id');
    }
}
