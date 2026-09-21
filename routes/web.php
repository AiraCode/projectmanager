<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use App\Http\Middleware\BlockAdminProgres;
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
        if ($role === 'admin_progres') return redirect('/projects');
        return redirect('/projects');
    });

    // ── Project card selector (Admin Utama / Admin Progres / PIC without project) ──
    Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');

    // ── Create project (PIC only, Admin is FORBIDDEN) ──
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');

    // ── Single project dashboard ──
    Route::get('/projects/{id}', [ProjectController::class, 'dashboard'])->name('projects.show');

    // ── Tasks management ──
    Route::get('/tasks', [ProjectController::class, 'tasks'])->name('tasks.index');
    Route::post('/projects/{id}/sub-wbs', [ProjectController::class, 'addSubWbs'])->name('projects.subwbs.store');
    Route::post('/projects/{id}/tasks', [ProjectController::class, 'addTask'])->name('projects.tasks.store');
    Route::post('/projects/{id}/tasks/{taskId}/toggle', [ProjectController::class, 'toggleTask'])->name('projects.tasks.toggle');

    // ── S-Curve (Admin Progres ONLY access point, and others) ──
    Route::get('/scurve', [ProjectController::class, 'scurve'])->name('scurve');

    // ── Other Pages — Guarded: Admin Progres MUST NOT access these ──
    Route::middleware(BlockAdminProgres::class)->group(function () {
        Route::get('/dashboard', [ProjectController::class, 'dashboard'])->name('dashboard');
        Route::get('/project',   [ProjectController::class, 'projectPage'])->name('project');
        Route::get('/timeline',  [ProjectController::class, 'timeline'])->name('timeline');
        Route::get('/weekly',    [ProjectController::class, 'weekly'])->name('weekly');
        Route::get('/budget',    [ProjectController::class, 'budget'])->name('budget');

        // Scoped project routes with id parameter
        Route::get('/projects/{id}/detail',   [ProjectController::class, 'projectPage'])->name('projects.detail');
        Route::get('/projects/{id}/timeline', [ProjectController::class, 'timeline'])->name('projects.timeline');
        Route::get('/projects/{id}/weekly',   [ProjectController::class, 'weekly'])->name('projects.weekly');
        Route::get('/projects/{id}/budget',   [ProjectController::class, 'budget'])->name('projects.budget');
    });
});
