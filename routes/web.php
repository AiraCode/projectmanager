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
        if ($role === 'admin_progres') return redirect('/projectlistpage');
        return redirect('/projectlistpage');
    });

    // ── Project card selector (ProjectListPage) ──
    Route::get('/projectlistpage', [ProjectController::class, 'projectListPage'])->name('projectlistpage');
    Route::get('/projects', [ProjectController::class, 'projectListPage'])->name('projects.index');

    // ── Create project (PIC only, Admin is FORBIDDEN) ──
    Route::post('/projectlistpage', [ProjectController::class, 'store'])->name('projectlistpage.store');
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');

    // ── Single project dashboard ──
    Route::get('/projects/{id}', [ProjectController::class, 'dashboard'])->name('projects.show');

    // ── Tasks & WBS management (PIC only for mutations) ──
    Route::get('/tasks', [ProjectController::class, 'tasks'])->name('tasks.index');

    // Main Tasks (Main WBS)
    Route::post('/projects/{id}/main-wbs', [ProjectController::class, 'addMainWbs'])->name('projects.mainwbs.store');
    Route::put('/projects/{id}/main-wbs/{mainWbsId}', [ProjectController::class, 'updateMainWbs'])->name('projects.mainwbs.update');
    Route::delete('/projects/{id}/main-wbs/{mainWbsId}', [ProjectController::class, 'deleteMainWbs'])->name('projects.mainwbs.destroy');

    // Sub Tasks (Sub Main WBS)
    Route::post('/projects/{id}/sub-wbs', [ProjectController::class, 'addSubWbs'])->name('projects.subwbs.store');
    Route::put('/projects/{id}/sub-wbs/{subWbsId}', [ProjectController::class, 'updateSubWbs'])->name('projects.subwbs.update');
    Route::delete('/projects/{id}/sub-wbs/{subWbsId}', [ProjectController::class, 'deleteSubWbs'])->name('projects.subwbs.destroy');

    // Tasks (Sub-Subtasks)
    Route::post('/projects/{id}/tasks', [ProjectController::class, 'addTask'])->name('projects.tasks.store');
    Route::put('/projects/{id}/tasks/{taskId}', [ProjectController::class, 'updateTask'])->name('projects.tasks.update');
    Route::delete('/projects/{id}/tasks/{taskId}', [ProjectController::class, 'deleteTask'])->name('projects.tasks.destroy');
    Route::post('/projects/{id}/tasks/{taskId}/toggle', [ProjectController::class, 'toggleTask'])->name('projects.tasks.toggle');

    // ── S-Curve (Admin Progres ONLY access point, and others) ──
    Route::get('/scurve', [ProjectController::class, 'scurve'])->name('scurve');

    // ── Other Pages — Guarded: Admin Progres MUST NOT access these ──
    Route::middleware(BlockAdminProgres::class)->group(function () {
        Route::get('/dashboard', [ProjectController::class, 'dashboard'])->name('dashboard');
        Route::get('/projectdetailpage', [ProjectController::class, 'projectDetailPage'])->name('projectdetailpage');
        Route::get('/project',           [ProjectController::class, 'projectDetailPage'])->name('project');
        Route::get('/timeline',  [ProjectController::class, 'timeline'])->name('timeline');
        Route::get('/weekly',    [ProjectController::class, 'weekly'])->name('weekly');
        Route::get('/budget',            [ProjectController::class, 'budget'])->name('budget');
        Route::get('/division-progress', [ProjectController::class, 'divisionProgress'])->name('division-progress');

        // Scoped project routes with id parameter
        Route::get('/projectdetailpage/{id}',          [ProjectController::class, 'projectDetailPage'])->name('projectdetailpage.id');
        Route::get('/projects/{id}/detail',            [ProjectController::class, 'projectDetailPage'])->name('projects.detail');
        Route::get('/projects/{id}/timeline',          [ProjectController::class, 'timeline'])->name('projects.timeline');
        Route::get('/projects/{id}/weekly',            [ProjectController::class, 'weekly'])->name('projects.weekly');
        Route::get('/projects/{id}/budget',            [ProjectController::class, 'budget'])->name('projects.budget');
        Route::get('/projects/{id}/division-progress', [ProjectController::class, 'divisionProgress'])->name('projects.division-progress');

        // Weekly Progress mutations
        Route::post('/projects/{id}/weekly', [ProjectController::class, 'saveWeeklyProgress'])->name('projects.weekly.store');

        // Budget Realization mutations
        Route::post('/projects/{id}/budget', [ProjectController::class, 'storeBudgetEntry'])->name('projects.budget.store');
        Route::delete('/projects/{id}/budget/{entryId}', [ProjectController::class, 'deleteBudgetEntry'])->name('projects.budget.destroy');
    });
});
