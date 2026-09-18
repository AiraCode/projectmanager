<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use Inertia\Inertia;

// Authentication Routes
Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

// Protected Routes
Route::middleware('auth')->group(function () {

    // Root redirect based on role
    Route::get('/', function () {
        $role = auth()->user()->role->name ?? '';
        if ($role === 'worker') return redirect('/tasks');
        return redirect('/projects');
    });

    // ── Admin Utama / Admin Progres: project card selector ──
    Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');

    // ── Single project dashboard (all roles) ──
    Route::get('/projects/{id}', [ProjectController::class, 'dashboard'])->name('projects.show');

    // ── Tasks (with optional project scope) ──
    Route::get('/tasks', [ProjectController::class, 'tasks'])->name('tasks.index');

    // ── Static Inertia pages ──
    Route::get('/project',   fn() => Inertia::render('ProjectPage'));
    Route::get('/timeline',  fn() => Inertia::render('TimelinePage'));
    Route::get('/scurve',    fn() => Inertia::render('SCurvePage'));
    Route::get('/weekly',    fn() => Inertia::render('WeeklyPage'));
    Route::get('/budget',    fn() => Inertia::render('BudgetPage'));
    Route::get('/dashboard', fn() => Inertia::render('DashboardPage'));
});
