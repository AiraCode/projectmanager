<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaskDependencyGroup extends Model
{
    protected $fillable = [
        'successor_wbs_id',
        'dependency_type',
        'lag_days',
    ];

    protected $casts = [
        'lag_days' => 'integer',
    ];

    public function successor(): BelongsTo
    {
        return $this->belongsTo(Wbs::class, 'successor_wbs_id');
    }

    public function dependencies(): HasMany
    {
        return $this->hasMany(TaskDependency::class, 'dependency_group_id');
    }
}
