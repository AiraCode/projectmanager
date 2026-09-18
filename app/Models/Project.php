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
}
