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
        'permission_matrix',
        'is_standalone',
        'is_ai_beta_tester',
        'created_by',
        'last_modified_by',
        'must_change_password',
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
            'permission_matrix' => 'array',
            'is_standalone' => 'boolean',
            'is_ai_beta_tester' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    /**
     * Check if user is eligible to use the AI Agent.
     * SuperAdmin / admin_utama always has access; other roles require beta tester flag.
     */
    public function canAccessAi(): bool
    {
        $roleName = $this->role?->name ?? '';
        if (in_array(strtolower($roleName), ['superadmin', 'admin_utama'], true)) {
            return true;
        }
        return (bool) $this->is_ai_beta_tester;
    }

    public function aiChatSessions()
    {
        return $this->hasMany(AiChatSession::class, 'user_id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class, 'companies_id');
    }

    public function companies()
    {
        return $this->belongsToMany(Company::class, 'company_user', 'user_id', 'company_id')->withTimestamps();
    }

    /**
     * Get all company IDs assigned to this user.
     * Falls back to companies_id if pivot table is empty.
     */
    public function getCompanyIds(): array
    {
        if ($this->relationLoaded('companies')) {
            $ids = $this->companies->pluck('id')->all();
        } else {
            $ids = $this->companies()->pluck('companies.id')->all();
        }

        if (empty($ids) && $this->companies_id) {
            $ids = [(int) $this->companies_id];
        }

        return array_values(array_unique(array_filter(array_map('intval', $ids))));
    }

    /**
     * Check if user is associated with a given company.
     */
    public function hasCompany(int|string|null $companyId): bool
    {
        if (!$companyId) return false;
        return in_array((int) $companyId, $this->getCompanyIds(), true);
    }

    /**
     * Synchronize user's assigned companies and keep companies_id in sync.
     */
    public function syncCompanies(array $companyIds): void
    {
        $uniqueIds = array_values(array_unique(array_filter(array_map('intval', $companyIds))));
        $this->companies()->sync($uniqueIds);
        $this->companies_id = $uniqueIds[0] ?? null;
        $this->save();
    }


    public function division()
    {
        return $this->belongsTo(Division::class, 'divisions_id');
    }

    public function divisions()
    {
        return $this->belongsToMany(Division::class, 'division_user', 'user_id', 'division_id')->withTimestamps();
    }

    /**
     * Get all division IDs assigned to this user.
     * Falls back to divisions_id if pivot table is empty.
     */
    public function getDivisionIds(): array
    {
        if ($this->relationLoaded('divisions')) {
            $ids = $this->divisions->pluck('id')->all();
        } else {
            $ids = $this->divisions()->pluck('divisions.id')->all();
        }

        if (empty($ids) && $this->divisions_id) {
            $ids = [(int) $this->divisions_id];
        }

        return array_values(array_unique(array_filter(array_map('intval', $ids))));
    }

    /**
     * Check if user is associated with a given division.
     */
    public function hasDivision(int|string|null $divisionId): bool
    {
        if (!$divisionId) return false;
        return in_array((int) $divisionId, $this->getDivisionIds(), true);
    }

    /**
     * Synchronize user's assigned divisions and keep divisions_id in sync.
     */
    public function syncDivisions(array $divisionIds): void
    {
        $uniqueIds = array_values(array_unique(array_filter(array_map('intval', $divisionIds))));
        $this->divisions()->sync($uniqueIds);
        $this->divisions_id = $uniqueIds[0] ?? null;
        $this->save();
    }

    public function projectMemberships()
    {
        return $this->hasMany(ProjectMember::class, 'user_id');
    }

    public function divisionRequests()
    {
        return $this->hasMany(DivisionRequest::class, 'user_id');
    }

    public function role()
    {
        return $this->belongsTo(Role::class, 'roles_id');
    }

    public function project()
    {
        return $this->hasOne(Project::class, 'project_manager');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function modifier()
    {
        return $this->belongsTo(User::class, 'last_modified_by');
    }

    public function auditLogs()
    {
        return $this->hasMany(AuditLog::class);
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

        $projectsFeatures = $this->permission_matrix['features']['projects'] ?? [];
        $hasMultiple = collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('multiple projects') || collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('multiple_projects');

        if ($hasMultiple) {
            return true;
        }

        return ! Project::where('project_manager', $this->id)->exists();
    }

    public function hasFeatureAccess(string $feature, string $action = 'view'): bool
    {
        if ($this->role?->name === 'SuperAdmin') return true;
        
        $matrix = $this->permission_matrix;
        if (!$matrix || !isset($matrix['features'][$feature])) return false;

        return in_array($action, $matrix['features'][$feature] ?? []);
    }

    public function hasSidebarAccess(string $menu): bool
    {
        if ($this->role?->name === 'SuperAdmin') return true;

        $matrix = $this->permission_matrix;
        if (!$matrix || !isset($matrix['sidebar'])) return false;

        return in_array($menu, $matrix['sidebar']);
    }

    public function getDataScope(): string
    {
        if ($this->role?->name === 'SuperAdmin') return 'all';
        return $this->permission_matrix['data_scope'] ?? 'own_company';
    }

    /**
     * Get all project IDs this user (worker or member) is permitted to access within their assigned company.
     *
     * @return array<int>
     */
    public function getAllowedProjectIds(): array
    {
        $matrixAccess = $this->permission_matrix['project_access'] ?? [];
        $matrixAllowed = array_keys(array_filter($matrixAccess, fn($access) => !empty($access['view_project'])));
        $memberAllowed = \App\Models\ProjectMember::where('user_id', $this->id)->pluck('project_id')->all();
        $allIds = array_values(array_unique(array_map('intval', array_merge($matrixAllowed, $memberAllowed))));

        $companyIds = $this->getCompanyIds();
        if (empty($companyIds) || empty($allIds)) {
            return [];
        }

        return \App\Models\Project::whereIn('companies_id', $companyIds)
            ->whereIn('id', $allIds)
            ->pluck('id')
            ->map(fn($id) => (int) $id)
            ->all();
    }

    /**
     * Get count of tasks assigned to this user's division(s) within their allowed projects.
     */
    public function getAssignedTasksCount(): int
    {
        $divisionIds = $this->getDivisionIds();
        $projectIds = $this->getAllowedProjectIds();

        if (empty($divisionIds) || empty($projectIds)) {
            return 0;
        }

        return \App\Models\Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($projectIds) {
            $q->whereIn('projects_id', $projectIds);
        })->where(function ($q) use ($divisionIds) {
            $q->whereIn('divisions_id', $divisionIds)
              ->orWhereHas('divisions', function ($dq) use ($divisionIds) {
                  $dq->whereIn('divisions.id', $divisionIds);
              });
        })->count();
    }

    /**
     * Determine if user (worker, pic, etc.) is assigned to more than 1 task or project.
     */
    public function hasMultipleAssignments(): bool
    {
        $projectFeatures = $this->permission_matrix['features']['projects'] ?? [];
        if (in_array('Multiple Projects', $projectFeatures)) {
            return true;
        }

        $projectCount = count($this->getAllowedProjectIds());
        if ($projectCount > 1) {
            return true;
        }

        $taskCount = $this->getAssignedTasksCount();
        return $taskCount > 1;
    }
}
