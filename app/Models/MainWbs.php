<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MainWbs extends Model
{
    use SoftDeletes;

    protected $table = 'main_wbs';

    protected $fillable = [
        'projects_id',
        'list_main_wbs_names_id',
        'name',
        'percentage',
        'actual_start',
        'actual_end',
    ];

    protected $casts = [
        'percentage' => 'decimal:2',
        'actual_start' => 'datetime',
        'actual_end' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'projects_id');
    }

    public function listName()
    {
        return $this->belongsTo(ListMainWbsName::class, 'list_main_wbs_names_id');
    }

    public function subWbs()
    {
        return $this->hasMany(SubWbs::class, 'sub_wbs_id');
    }
}
