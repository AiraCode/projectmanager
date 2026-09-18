<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ListSubWbsName extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'list_main_wbs_names_copy1_id',
    ];

    public function subWbs()
    {
        return $this->hasMany(SubWbs::class, 'list_sub_wbs_names_id');
    }
}
