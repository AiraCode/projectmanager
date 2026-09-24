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

        $sidebar = $user->permission_matrix['sidebar'] ?? null;
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
        
        // Special exceptions based on roles (matches Layout.tsx)
        if ($menuName === 'Division Progress' && in_array($user->role?->name, ['admin_progres', 'admin_utama', 'pic'])) {
            return $next($request);
        }

        if (!in_array($menuName, $sidebar)) {
            // Check if it's an AJAX/Inertia request
            if ($request->wantsJson() || $request->header('X-Inertia')) {
                abort(403, 'Access denied to ' . $menuName);
            }
            abort(403, 'Access denied to ' . $menuName);
        }

        return $next($request);
    }
}
