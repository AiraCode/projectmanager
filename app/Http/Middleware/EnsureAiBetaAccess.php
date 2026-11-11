<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAiBetaAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
            return redirect()->route('login');
        }

        if (!$user->canAccessAi()) {
            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'Akses AI Agent saat ini terbatas untuk SuperAdmin dan Beta Tester yang ditunjuk.'
                ], 403);
            }
            abort(403, 'Akses AI Agent saat ini terbatas untuk SuperAdmin dan Beta Tester yang ditunjuk.');
        }

        return $next($request);
    }
}

