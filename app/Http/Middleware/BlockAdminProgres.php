<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class BlockAdminProgres
{
    public function handle(Request $request, Closure $next)
    {
        if (auth()->check() && auth()->user()->role?->name === 'admin_progres') {
            return redirect()->route('scurve');
        }

        return $next($request);
    }
}
