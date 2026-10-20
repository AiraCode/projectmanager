<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>403 - Akses Ditolak (Access Denied)</title>
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
<body class="bg-neutral-50 min-h-screen w-screen flex items-center justify-center p-6 selection:bg-violet-200 selection:text-violet-900">

    <div class="max-w-xl w-full flex flex-col items-center justify-center text-center space-y-6 animate-[fade-in_0.5s_ease-out] relative z-10">
        
        <!-- Illustration Shield -->
        <div class="relative w-44 h-44 mx-auto flex items-center justify-center">
            <div class="absolute inset-0 bg-violet-400/10 rounded-full blur-2xl animate-pulse"></div>
            <div class="bg-white p-6 rounded-full shadow-xl border-4 border-violet-100 relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
        </div>

        <div class="space-y-3">
            <div class="inline-block px-3 py-1 rounded-full text-[12px] font-extrabold tracking-wider uppercase bg-violet-100 text-violet-700 border border-violet-200">
                HTTP Error 403
            </div>
            <h1 class="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                Akses <span class="gradient-text">Ditolak</span>
            </h1>
            
            <p class="text-neutral-600 max-w-md mx-auto text-[14.5px] leading-relaxed">
                {{ !empty($exception->getMessage()) ? $exception->getMessage() : 'Anda tidak memiliki hak akses atau izin untuk membuka halaman ini.' }}
            </p>
        </div>

        @auth
            @php
                $user = auth()->user();
                $fallbackUrl = null;
                
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
                } else {
                    $fallbackUrl = '/';
                }
            @endphp

            <!-- User Info Badge -->
            <div class="bg-white px-4 py-2.5 rounded-xl border border-neutral-200/80 shadow-2xs text-[12.5px] text-neutral-600 flex flex-wrap items-center justify-center gap-2">
                <span class="text-neutral-400">Sedang login sebagai:</span>
                <span class="font-bold text-neutral-900">{{ $user->username }}</span>
                <span class="text-neutral-300">•</span>
                <span class="text-neutral-500 font-mono text-[11.5px]">{{ $user->email }}</span>
                <span class="text-neutral-300">•</span>
                <span class="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-violet-50 text-violet-700 border border-violet-200 uppercase tracking-wide">
                    {{ $user->role?->name ?? 'User' }}
                </span>
            </div>

            <!-- Action Buttons for Authenticated User -->
            <div class="pt-2 flex flex-wrap items-center justify-center gap-3">
                @if($fallbackUrl)
                    <a href="{{ $fallbackUrl }}" 
                       class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-[13px] font-bold shadow-md shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:shadow-violet-500/35 active:scale-95"
                       style="background: linear-gradient(135deg, #7c3aed, #4f46e5);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        Kembali ke Dashboard
                    </a>
                @endif

                <!-- Logout Button so user is NEVER stuck -->
                <form action="/logout" method="POST" class="inline">
                    @csrf
                    <button type="submit" 
                       class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 hover:bg-red-50/80 text-[13px] font-bold shadow-xs transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" x2="9" y1="12" y2="12"/>
                        </svg>
                        Log Out (Keluar Akun)
                    </button>
                </form>
            </div>
        @else
            <!-- Guest / Not Authenticated -->
            <div class="pt-2 flex flex-wrap items-center justify-center gap-3">
                <a href="/login" 
                   class="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-white text-[13.5px] font-bold shadow-md shadow-violet-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
                   style="background: linear-gradient(135deg, #7c3aed, #4f46e5);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Menuju Halaman Login
                </a>
            </div>
        @endauth

    </div>

    <script>
        document.tailwindConfig = {
            theme: {
                extend: {
                    keyframes: {
                        'fade-in': {
                            '0%': { opacity: '0', transform: 'translateY(16px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' },
                        }
                    }
                }
            }
        }
    </script>
</body>
</html>
