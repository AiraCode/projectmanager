<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ListMainWbsName extends Model
{
    use SoftDeletes;

    protected $fillable = ['name'];

    public function mainWbs()
    {
        return $this->hasMany(MainWbs::class, 'list_main_wbs_names_id');
    }
}
