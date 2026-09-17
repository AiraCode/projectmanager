<?php

namespace App\Policies;

use App\Models\SubSubtask;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class SubSubtaskPolicy
{
    /**
     * Perform pre-authorization checks.
     */
    public function before(User $user, string $ability): ?bool
    {
        if ($user->role === 'Admin') {
            return true;
        }

        return null; // fall through to specific methods
    }

    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, SubSubtask $subSubtask): bool
    {
        return true;
    }

    /**
     * Determine whether the user can create models under a specific SubMainJob.
     */
    public function create(User $user, \App\Models\SubMainJob $subMainJob): bool
    {
        return $user->pic && strcasecmp($user->pic, $subMainJob->pic) === 0;
    }

    /**
     * Determine whether the user can update the model (includes checklist).
     */
    public function update(User $user, SubSubtask $subSubtask): bool
    {
        $pic = $subSubtask->subMainJob->pic ?? '';
        return $user->pic && strcasecmp($user->pic, $pic) === 0;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, SubSubtask $subSubtask): bool
    {
        $pic = $subSubtask->subMainJob->pic ?? '';
        return $user->pic && strcasecmp($user->pic, $pic) === 0;
    }
}
