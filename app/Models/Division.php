<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Division extends Model
{
    use SoftDeletes;

    protected $fillable = ['divisi'];

    public function users()
    {
        return $this->hasMany(User::class, 'divisions_id');
    }
}
