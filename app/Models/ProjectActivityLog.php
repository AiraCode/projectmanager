<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'wbs_id',
        'user_id',
        'action',
        'old_progress',
        'new_progress',
        'description',
        'metadata',
    ];

    protected $casts = [
        'old_progress' => 'integer',
        'new_progress' => 'integer',
        'metadata' => 'array',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function wbs()
    {
        return $this->belongsTo(Wbs::class, 'wbs_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
