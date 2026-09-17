<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MainJob extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'code',
        'name',
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

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function subMainJobs()
    {
        return $this->hasMany(SubMainJob::class);
    }
}
