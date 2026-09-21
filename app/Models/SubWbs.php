<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubWbs extends Model
{
    use SoftDeletes;

    protected $table = 'sub_wbs';

    protected $fillable = [
        'sub_wbs_id',
        'list_sub_wbs_names_id',
        'name',
        'predecessor',
        'predecessor_type',
        'lag_lead_time',
        'start',
        'end',
        'actual_start',
        'actual_end',
        'weight',
        'progress',
        'status',
    ];

    protected $casts = [
        'start' => 'datetime',
        'end' => 'datetime',
        'actual_start' => 'datetime',
        'actual_end' => 'datetime',
    ];

    public function mainWbs()
    {
        return $this->belongsTo(MainWbs::class, 'sub_wbs_id'); // the DB schema named the foreign key column 'sub_wbs_id' pointing to main_wbs(id)
    }

    public function listName()
    {
        return $this->belongsTo(ListSubWbsName::class, 'list_sub_wbs_names_id');
    }

    public function wbsTasks()
    {
        return $this->hasMany(Wbs::class, 'sub_wbs_id');
    }
}
