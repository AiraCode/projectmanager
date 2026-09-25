 <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>403 - Access Denied</title>
    <!-- Use Tailwind CDN for the error page to guarantee it looks good even without Inertia context -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .gradient-text {
            background: linear-gradient(135deg, #7c3aed, #4f46e5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
    </style>
</head>
<body class="bg-neutral-50 h-screen w-screen flex items-center justify-center p-6 selection:bg-violet-200 selection:text-violet-900">

    <div class="max-w-2xl w-full flex flex-col items-center justify-center text-center space-y-8 animate-[fade-in_0.5s_ease-out]">
        
        <!-- Illustration -->
        <div class="relative w-64 h-64 md:w-80 md:h-80 mx-auto">
            <svg class="w-full h-full text-violet-500/10 drop-shadow-2xl" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm0-14c-1.103 0-2 .897-2 2v5c0 1.103.897 2 2 2s2-.897 2-2V8c0-1.103-.897-2-2-2zm0 12a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
                <div class="bg-white p-6 rounded-full shadow-2xl border-4 border-violet-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                        <path d="m9 12 2 2 4-4"/>
                    </svg>
                </div>
            </div>
        </div>

        <div class="space-y-4">
            <h1 class="text-7xl md:text-9xl font-black text-neutral-200 tracking-tighter absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 select-none">403</h1>
            <h2 class="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">Access <span class="gradient-text">Denied</span></h2>
            
            <p class="text-neutral-500 max-w-sm mx-auto text-[15px] leading-relaxed">
                Anda tidak memiliki akses ke halaman ini.
            </p>
        </div>

        <div class="pt-4 flex flex-col items-center gap-4">
            @php
                $fallbackUrl = null;
                $buttonText = 'Kembali';
                $user = auth()->user();
                
                if ($user && $user->role?->name === 'SuperAdmin') {
                    $fallbackUrl = '/admin';
                } elseif ($user && is_array($user->permission_matrix) && !empty($user->permission_matrix['sidebar'])) {
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
                    $fallbackUrl = $map[$firstAllowed] ?? null;
                }
            @endphp

            @if($fallbackUrl)
                <a href="{{ $fallbackUrl }}" 
                   class="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-1 hover:shadow-violet-500/40 active:scale-95"
                   style="background: linear-gradient(135deg, #7c3aed, #4f46e5);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m15 18-6-6 6-6"/>
                    </svg>
                    {{ $buttonText }}
                </a>
            @else
                <!-- No valid fallback, user has zero permissions, provide a logout button -->
                <form action="/logout" method="POST">
                    @csrf
                    <button type="submit" 
                       class="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold shadow-lg shadow-red-500/30 transition-all hover:-translate-y-1 hover:shadow-red-500/40 active:scale-95 bg-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" x2="9" y1="12" y2="12"/>
                        </svg>
                        Logout (Akses Kosong)
                    </button>
                </form>
            @endif
        </div>
    </div>

    <script>
        // Simple animation config
        document.tailwindConfig = {
            theme: {
                extend: {
                    keyframes: {
                        'fade-in': {
                            '0%': { opacity: '0', transform: 'translateY(20px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' },
                        }
                    }
                }
            }
        }
    </script>
</body>
</html>
