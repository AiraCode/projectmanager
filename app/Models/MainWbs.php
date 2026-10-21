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
        'start',
        'end',
        'actual_start',
        'actual_end',
        'progress',
        'status',
        'order_index',
    ];

    protected $casts = [
        'percentage' => 'decimal:2',
        'start' => 'datetime',
        'end' => 'datetime',
        'actual_start' => 'datetime',
        'actual_end' => 'datetime',
        'order_index' => 'integer',
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
        return $this->hasMany(SubWbs::class, 'sub_wbs_id')->orderBy('order_index')->orderBy('id');
    }
}
