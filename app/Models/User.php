<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'username',
        'email',
        'password',
        'companies_id',
        'divisions_id',
        'roles_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function company()
    {
        return $this->belongsTo(Company::class, 'companies_id');
    }

    public function division()
    {
        return $this->belongsTo(Division::class, 'divisions_id');
    }

    public function role()
    {
        return $this->belongsTo(Role::class, 'roles_id');
    }

    public function project()
    {
        return $this->hasOne(Project::class, 'project_manager');
    }

    public function isAdminUtama(): bool
    {
        return $this->role?->name === 'admin_utama';
    }

    public function isAdminProgres(): bool
    {
        return $this->role?->name === 'admin_progres';
    }

    public function isPic(): bool
    {
        return $this->role?->name === 'pic';
    }

    public function isWorker(): bool
    {
        return $this->role?->name === 'worker';
    }

    /**
     * Check if user can create a project.
     * Rule: Only PIC who does not already manage a project can create a project.
     * Admin Utama, Admin Progres, and Workers CANNOT create projects.
     */
    public function canCreateProject(): bool
    {
        if (! $this->isPic()) {
            return false;
        }

        return ! Project::where('project_manager', $this->id)->exists();
    }
}
