<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class BlockAdminProgres
{
    public function handle(Request $request, Closure $next)
    {
        if (auth()->check() && auth()->user()->role?->name === 'admin_progres') {
            $projectId = $request->route('id') ?? $request->query('project_id');
            return redirect()->route('scurve', $projectId ? ['project_id' => $projectId] : []);
        }

        return $next($request);
    }
}
