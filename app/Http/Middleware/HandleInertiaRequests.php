<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        
        $permissionMatrix = $user?->permission_matrix ?? [];
        $projectId = $request->query('project_id') ?? $request->route('id');
        
        if ($projectId && isset($permissionMatrix['is_unified']) && $permissionMatrix['is_unified'] === false) {
            $perProject = $permissionMatrix['per_project'][$projectId] ?? null;
            if ($perProject) {
                $permissionMatrix['sidebar'] = $perProject['sidebar'] ?? [];
                $permissionMatrix['features'] = $perProject['features'] ?? [];
                $permissionMatrix['data_scope'] = $perProject['data_scope'] ?? 'own_company';
            }
        }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user ? [
                    'id'               => $user->id,
                    'name'             => $user->username ?? $user->name ?? 'User',
                    'email'            => $user->email,
                    'role'             => $user->role?->name ?? 'worker',
                    'isPIC'            => ($user->role?->name ?? '') === 'pic',
                    'isWorker'         => ($user->role?->name ?? '') === 'worker',
                    'isAdminUtama'     => ($user->role?->name ?? '') === 'admin_utama',
                    'isAdminProgres'   => ($user->role?->name ?? '') === 'admin_progres',
                    'division'         => $user->division?->divisi ?? null,
                    'company'          => $user->company?->name ?? null,
                    'companies_id'     => $user->companies_id,
                    'canCreateProject' => $user->canCreateProject(),
                    'permission_matrix'=> $permissionMatrix,
                    'isSuperAdmin'     => ($user->role?->name ?? '') === 'SuperAdmin',
                ] : null,
            ],
        ];
    }
}
