<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SubMainJob extends Model
{
    use HasFactory;

    protected $fillable = [
        'main_job_id',
        'project_id',
        'code',
        'name',
        'pic',
        'weight',
        'start_date',
        'finish_date',
        'progress',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'weight' => 'float',
            'progress' => 'float',
            'start_date' => 'date:Y-m-d',
            'finish_date' => 'date:Y-m-d',
        ];
    }

    public function mainJob()
    {
        return $this->belongsTo(MainJob::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function subtasks()
    {
        return $this->hasMany(SubSubtask::class);
    }
}
