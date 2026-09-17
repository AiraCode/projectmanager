<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'role', 'pic_role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

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
