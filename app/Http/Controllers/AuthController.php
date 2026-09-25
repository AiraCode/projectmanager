<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class AuthController extends Controller
{
    public function showLogin()
    {
        return Inertia::render('LoginPage');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials)) {
            $request->session()->regenerate();
            
            // Redirect based on role logic
            $user = Auth::user();
            $role = $user->role->name ?? '';
            
            if ($role === 'worker') {
                return redirect()->intended('/tasks');
            }

            if ($role === 'pic') {
                $features = $user->permission_matrix['features']['projects'] ?? [];
                $hasMultipleProjects = in_array('Multiple Projects', $features);
                if ($hasMultipleProjects) {
                    return redirect()->intended('/projectlistpage');
                }
                // PIC without multiple projects goes to dashboard (single project)
                return redirect()->intended('/dashboard');
            }

            return redirect()->intended('/projectlistpage');
        }

        return back()->withErrors([
            'email' => 'The provided credentials do not match our records.',
        ])->onlyInput('email');
    }

    public function showAdminLogin()
    {
        return Inertia::render('SuperAdmin/AdminLoginPage');
    }

    public function adminLogin(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials)) {
            $request->session()->regenerate();
            
            $role = Auth::user()->role->name ?? '';
            if ($role === 'SuperAdmin') {
                return redirect()->intended('/admin');
            }

            // If not SuperAdmin, log them out and error
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return back()->withErrors([
                'email' => 'Access Denied: SuperAdmin privileges required.',
            ])->onlyInput('email');
        }

        return back()->withErrors([
            'email' => 'The provided credentials do not match our records.',
        ])->onlyInput('email');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect('/login');
    }
}
