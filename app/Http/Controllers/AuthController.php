<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
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

            AuditLog::record('LOGIN', "User {$user->username} ({$user->email}) logged in successfully as {$role}.", $user->id, $request->ip());
            
            if ($role === 'worker') {
                return redirect()->intended('/projectlistpage');
            }

            if ($role === 'pic') {
                return redirect()->intended('/projectlistpage');
            }

            return redirect()->intended('/projectlistpage');
        }

        AuditLog::record('LOGIN_FAILED', "Failed login attempt with email: {$request->email}.", null, $request->ip());

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
            
            $user = Auth::user();
            $role = $user->role->name ?? '';
            if ($role === 'SuperAdmin') {
                AuditLog::record('ADMIN_LOGIN', "SuperAdmin {$user->username} logged into SuperAdmin portal.", $user->id, $request->ip());
                return redirect()->intended('/admin');
            }

            // If not SuperAdmin, log them out and error
            AuditLog::record('UNAUTHORIZED_ADMIN_LOGIN', "Unauthorized SuperAdmin portal login attempt by user {$user->username} ({$user->email}).", $user->id, $request->ip());
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return back()->withErrors([
                'email' => 'Access Denied: SuperAdmin privileges required.',
            ])->onlyInput('email');
        }

        AuditLog::record('ADMIN_LOGIN_FAILED', "Failed SuperAdmin portal login attempt with email: {$request->email}.", null, $request->ip());

        return back()->withErrors([
            'email' => 'The provided credentials do not match our records.',
        ])->onlyInput('email');
    }

    public function logout(Request $request)
    {
        $user = Auth::user();
        if ($user) {
            AuditLog::record('LOGOUT', "User {$user->username} ({$user->email}) logged out.", $user->id, $request->ip());
        }

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect('/login');
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'min:8', 'confirmed'],
        ]);

        $user = Auth::user();
        $user->password = \Illuminate\Support\Facades\Hash::make($request->password);
        $user->must_change_password = false;
        $user->save();

        AuditLog::record('PASSWORD_CHANGE', "User {$user->username} ({$user->email}) changed their password.", $user->id, $request->ip());

        return back()->with('success', 'Password updated successfully.');
    }
}
