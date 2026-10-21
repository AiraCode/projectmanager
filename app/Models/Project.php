<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Project extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'companies_id',
        'project_manager',
        'title',
        'start',
        'end',
        'actual_start',
        'actual_end',
        'progress',
        'status',
        'setup_status',
        'is_private',
    ];

    protected $casts = [
        'start' => 'datetime',
        'end' => 'datetime',
        'actual_start' => 'datetime',
        'actual_end' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class, 'companies_id');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'project_manager');
    }

    public function mainWbs()
    {
        return $this->hasMany(MainWbs::class, 'projects_id');
    }

    public function budgetEntries()
    {
        return $this->hasMany(BudgetEntry::class, 'projects_id')->orderBy('tanggal', 'desc')->orderBy('id', 'desc');
    }

    public function weeklyProgress()
    {
        return $this->hasMany(WeeklyProgress::class, 'projects_id')->orderBy('week_number', 'asc');
    }

    public function projectMembers()
    {
        return $this->hasMany(ProjectMember::class, 'project_id')->with(['user', 'division']);
    }

    public function members()
    {
        return $this->belongsToMany(User::class, 'project_members', 'project_id', 'user_id')->withPivot(['division_id', 'project_role', 'position_title'])->withTimestamps();
    }
}
