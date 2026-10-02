<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Wbs extends Model
{
    use SoftDeletes;

    protected $table = 'wbs';

    // Disable auto-incrementing ID since we use VARCHAR
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'sub_wbs_id',
        'divisions_id',
        'name',
        'vendor',
        'start',
        'end',
        'is_completed',
        'status',
        'predecessor',
        'dep_type',
        'lag',
        'lead',
        'duration_days',
        'constraint_type',
        'constraint_date',
        'weight',
        'progress',
        'evidence_path',
        'evidence_name',
        'requires_evidence',
        'completed_by',
        'completed_at',
    ];

    protected $casts = [
        'start' => 'datetime',
        'end' => 'datetime',
        'weight' => 'decimal:2',
        'requires_evidence' => 'boolean',
        'duration_days' => 'integer',
        'constraint_date' => 'date',
        'completed_at' => 'datetime',
    ];

    public function parentSubWbs()
    {
        return $this->belongsTo(SubWbs::class, 'sub_wbs_id');
    }

    public function completedBy()
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function division()
    {
        return $this->belongsTo(Division::class, 'divisions_id');
    }

    public function predecessorDependencies()
    {
        return $this->hasMany(TaskDependency::class, 'successor_wbs_id');
    }

    public function dependencyGroups()
    {
        return $this->hasMany(TaskDependencyGroup::class, 'successor_wbs_id');
    }

    public function successorDependencies()
    {
        return $this->hasMany(TaskDependency::class, 'predecessor_wbs_id');
    }

    public function predecessorTasks()
    {
        return $this->belongsToMany(Wbs::class, 'task_dependencies', 'successor_wbs_id', 'predecessor_wbs_id')
                    ->withPivot('dependency_type', 'lag_days')
                    ->withTimestamps();
    }

    public function successorTasks()
    {
        return $this->belongsToMany(Wbs::class, 'task_dependencies', 'predecessor_wbs_id', 'successor_wbs_id')
                    ->withPivot('dependency_type', 'lag_days')
                    ->withTimestamps();
    }
}
