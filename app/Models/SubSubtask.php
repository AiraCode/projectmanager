<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SubSubtask extends Model
{
    use HasFactory;

    protected $fillable = [
        'sub_main_job_id',
        'code',
        'name',
        'start_date',
        'finish_date',
        'duration',
        'days_left',
        'progress',
        'status',
        'predecessor',
        'dep_type',
        'lag',
        'weight',
        'checked',
    ];

    protected function casts(): array
    {
        return [
            'weight' => 'float',
            'progress' => 'float',
            'duration' => 'integer',
            'days_left' => 'integer',
            'lag' => 'integer',
            'checked' => 'boolean',
            'start_date' => 'date:Y-m-d',
            'finish_date' => 'date:Y-m-d',
        ];
    }

    public function subMainJob()
    {
        return $this->belongsTo(SubMainJob::class);
    }
}
