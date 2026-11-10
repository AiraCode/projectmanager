<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('admin*') ? route('admin.login') : route('login'));
        
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
        ]);
        $middleware->alias([
            'sidebar' => \App\Http\Middleware\CheckSidebarAccess::class,
        ]);
        $middleware->api(prepend: [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
        ]);
        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->respond(function (\Symfony\Component\HttpFoundation\Response $response, \Throwable $exception, Request $request) {
            if ($response->getStatusCode() === 403) {
                if ($request->header('X-Inertia')) {
                    $user = auth()->user();
                    $fallbackUrl = '/';
                    if ($user) {
                        if ($user->role?->name === 'SuperAdmin') {
                            $fallbackUrl = '/admin';
                        } elseif (is_array($user->permission_matrix) && !empty($user->permission_matrix['sidebar'])) {
                            $firstAllowed = $user->permission_matrix['sidebar'][0];
                            $map = [
                                'Dashboard' => '/dashboard',
                                'Project List' => '/projectlistpage',
                                'Project Detail' => '/projectdetailpage',
                                'Tasks' => '/tasks',
                                'Timeline' => '/timeline',
                                'Weekly Progress' => '/weekly',
                                'S-Curve Report' => '/scurve',
                                'Budget Management' => '/budget',
                                'Division Progress' => '/division-progress',
                                'User Management' => '/users',
                            ];
                            $fallbackUrl = $map[$firstAllowed] ?? '/';
                        }
                    }

                    $message = $exception->getMessage() ?: 'Access Denied: You do not have permission to access this page.';

                    return \Inertia\Inertia::render('Error403Page', [
                        'message' => $message,
                        'user' => $user ? [
                            'username' => $user->username,
                            'email' => $user->email,
                            'role' => $user->role?->name ?? 'User',
                        ] : null,
                        'dashboardUrl' => $fallbackUrl,
                    ])->toResponse($request)->setStatusCode(403);
                }
            }

            return $response;
        });
    })->create();
