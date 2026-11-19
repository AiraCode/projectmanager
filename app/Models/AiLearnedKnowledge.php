<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiLearnedKnowledge extends Model
{
    protected $table = 'ai_learned_knowledge';

    protected $fillable = [
        'normalized_pattern',
        'keywords_json',
        'sample_question',
        'strategy',
        'strategy_params',
        'answer_id',
        'answer_en',
        'actions_json',
        'hit_count',
        'learned_by_user_id',
        'last_used_at',
    ];

    protected $casts = [
        'keywords_json'   => 'array',
        'strategy_params' => 'array',
        'actions_json'    => 'array',
        'last_used_at'    => 'datetime',
    ];
}
