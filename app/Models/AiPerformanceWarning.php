<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiPerformanceWarning extends Model
{
    protected $table = 'ai_performance_warnings';

    protected $fillable = [
        'warning_key',
        'user_id',
        'project_id',
        'company_id',
        'division_id',
        'warning_type',
        'severity',
        'status',
        'title',
        'message',
        'metrics_json',
        'fingerprint',
        'detected_at',
        'last_evaluated_at',
        'acknowledged_at',
        'resolved_at',
    ];

    protected $casts = [
        'metrics_json'      => 'array',
        'detected_at'       => 'datetime',
        'last_evaluated_at' => 'datetime',
        'acknowledged_at'   => 'datetime',
        'resolved_at'       => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class, 'project_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function division(): BelongsTo
    {
        return $this->belongsTo(Division::class, 'division_id');
    }
}
