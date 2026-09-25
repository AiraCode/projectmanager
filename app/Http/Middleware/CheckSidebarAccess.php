<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckSidebarAccess
{
    public function handle(Request $request, Closure $next, $menuName): Response
    {
        $user = Auth::user();
        if (!$user) {
            return redirect('/login');
        }

        if ($user->role?->name === 'SuperAdmin') {
            return $next($request);
        }

        $matrix = $user->permission_matrix ?? [];
        $projectId = $request->query('project_id') ?? $request->route('id');
        
        if ($projectId && isset($matrix['is_unified']) && $matrix['is_unified'] === false) {
            $perProject = $matrix['per_project'][$projectId] ?? null;
            if ($perProject) {
                $matrix['sidebar'] = $perProject['sidebar'] ?? [];
                $matrix['features'] = $perProject['features'] ?? [];
            }
        }

        $sidebar = $matrix['sidebar'] ?? null;
        if ($sidebar === null) {
            // Fallback rules if not set
            if ($menuName === 'Budget Management' || $menuName === 'User Management') {
                if (!in_array($user->role?->name, ['admin_utama'])) {
                    abort(403, 'Access denied.');
                }
            }
            return $next($request);
        }

        if (in_array('*', $sidebar)) {
            return $next($request);
        }
        
        // Admin Progres must always be redirected to S-Curve when accessing other pages
        if ($user->role?->name === 'admin_progres') {
            if (!in_array($menuName, ['S-Curve Report', 'Project List', 'Division Progress'])) {
                $targetId = $request->query('project_id') ?? $request->route('id');
                return redirect($targetId ? "/scurve?project_id={$targetId}" : '/scurve');
            }
        }

        // Special exceptions based on roles (matches Layout.tsx)
        if ($menuName === 'Division Progress' && in_array($user->role?->name, ['admin_progres', 'admin_utama', 'pic'])) {
            return $next($request);
        }

        if ($menuName === 'Project Detail' && in_array($user->role?->name, ['pic', 'admin_utama', 'worker'])) {
            return $next($request);
        }

        if ($menuName === 'Project List') {
            $hasMultiple = in_array('Multiple Projects', $user->permission_matrix['features']['projects'] ?? []);
            
            $projectAccess = $user->permission_matrix['project_access'] ?? [];
            $visibleProjects = 0;
            foreach ($projectAccess as $pid => $access) {
                if (!empty($access['view_project'])) $visibleProjects++;
            }
            $hasMultipleProjectAccess = $visibleProjects > 1;

            if ($hasMultiple || $hasMultipleProjectAccess || in_array($user->role?->name, ['admin_utama', 'admin_progres'])) {
                return $next($request);
            }
        }

        if (!in_array($menuName, $sidebar)) {
            // Check if it's an AJAX/Inertia request
            if ($request->wantsJson() || $request->header('X-Inertia')) {
                return redirect('/')->with('error', 'Anda tidak memiliki akses ke halaman ini.');
            }
            abort(403, 'Access denied to ' . $menuName);
        }

        return $next($request);
    }
}
