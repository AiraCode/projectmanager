<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SuperAdminOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user || $user->role?->name !== 'SuperAdmin') {
            abort(403, 'Access Denied: This area is restricted to SuperAdmin only.');
        }

        return $next($request);
    }
}
