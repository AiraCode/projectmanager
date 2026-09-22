<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WeeklyProgress extends Model
{
    protected $table = 'weekly_progress';

    protected $fillable = [
        'projects_id',
        'week_number',
        'actual_progress',
        'notes',
    ];

    protected $casts = [
        'week_number'     => 'integer',
        'actual_progress' => 'float',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'projects_id');
    }
}
