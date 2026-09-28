<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskDependency extends Model
{
    protected $table = 'task_dependencies';

    protected $fillable = [
        'predecessor_wbs_id',
        'successor_wbs_id',
        'dependency_type',
        'lag_days',
    ];

    protected $casts = [
        'lag_days' => 'integer',
    ];

    /**
     * The task that must happen first / drives the relationship.
     */
    public function predecessor(): BelongsTo
    {
        return $this->belongsTo(Wbs::class, 'predecessor_wbs_id');
    }

    /**
     * The task that depends on the predecessor.
     */
    public function successor(): BelongsTo
    {
        return $this->belongsTo(Wbs::class, 'successor_wbs_id');
    }
}
