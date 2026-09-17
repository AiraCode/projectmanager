<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'admin_id',
        'name',
        'project_manager',
        'start_date',
        'end_date',
        'total_budget',
        'status',
        'overall_progress',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'total_budget' => 'integer',
            'overall_progress' => 'float',
        ];
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    public function mainJobs()
    {
        return $this->hasMany(MainJob::class);
    }

    public function subMainJobs()
    {
        return $this->hasMany(SubMainJob::class);
    }
}
