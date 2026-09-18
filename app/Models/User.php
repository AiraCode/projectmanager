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

    /**
     * The project owned by this Admin.
     * Strictly 1:1 relationship according to Admin Ownership Rule.
     */
    public function ownedProject()
    {
        return $this->hasOne(Project::class, 'admin_id');
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isPic(): bool
    {
        return $this->role === 'pic';
    }

    /**
     * Check if user can create a project.
     * Rule: Must be Admin and must not already own a project.
     */
    public function canCreateProject(): bool
    {
        if (! $this->isAdmin()) {
            return false;
        }

        return ! $this->ownedProject()->exists();
    }

    /**
     * Check if user can modify a Sub Main Job based on role and fixed PIC assignment.
     */
    public function canModifySubMainJob(SubMainJob $subMainJob): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        return $this->pic_role !== null && strcasecmp($this->pic_role, $subMainJob->pic) === 0;
    }
}
