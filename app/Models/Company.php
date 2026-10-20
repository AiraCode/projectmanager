<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Company extends Model
{
    use SoftDeletes;

    protected $fillable = ['name'];

    public function users()
    {
        return $this->belongsToMany(User::class, 'company_user', 'company_id', 'user_id')->withTimestamps();
    }

    public function primaryUsers()
    {
        return $this->hasMany(User::class, 'companies_id');
    }

    public function projects()
    {
        return $this->hasMany(Project::class, 'companies_id');
    }
}
