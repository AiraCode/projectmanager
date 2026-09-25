<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\SuperAdminController;
use App\Http\Controllers\UserManagementController;
use App\Http\Middleware\BlockAdminProgres;
use App\Http\Middleware\SuperAdminOnly;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Authentication Routes
Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
Route::post('/login', [AuthController::class, 'login']);

Route::get('/admin/login', [AuthController::class, 'showAdminLogin'])->name('admin.login');
Route::post('/admin/login', [AuthController::class, 'adminLogin']);

Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

// Protected Routes
Route::middleware('auth')->group(function () {

    // Root redirect based on role and permissions
    Route::get('/', function () {
        $user = Auth::user();
        $role = $user?->role?->name ?? '';
        if ($role === 'SuperAdmin') return redirect('/admin');
        
        if ($user && is_array($user->permission_matrix) && !empty($user->permission_matrix['sidebar'])) {
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
            if (isset($map[$firstAllowed])) {
                return redirect($map[$firstAllowed]);
            }
        }
        
        // If role fallbacks are still needed as a last resort:
        if ($role === 'worker') {
            if ($user && is_array($user->permission_matrix) && isset($user->permission_matrix['sidebar']) && empty($user->permission_matrix['sidebar'])) {
                abort(403);
            }
            return redirect('/tasks');
        }
        if ($role === 'pic') {
            $features = $user->permission_matrix['features']['projects'] ?? [];
            $hasMultipleProjects = in_array('Multiple Projects', $features);
            return redirect($hasMultipleProjects ? '/projectlistpage' : '/dashboard');
        }
        if ($role === 'admin_progres') return redirect('/projectlistpage');
        return redirect('/projectlistpage');
    });

    // ── SuperAdmin Exclusive Zone ──
    Route::middleware(SuperAdminOnly::class)->prefix('admin')->group(function () {
        Route::get('/',              [SuperAdminController::class, 'dashboard'])->name('admin.dashboard');
        Route::get('/audit-log',     [SuperAdminController::class, 'auditLog'])->name('admin.audit-log');
        Route::get('/users',         [SuperAdminController::class, 'userManagement'])->name('admin.users');
        Route::get('/companies',     [SuperAdminController::class, 'companiesPage'])->name('admin.companies');
        Route::get('/projects',      [SuperAdminController::class, 'allProjectsPage'])->name('admin.projects');

        // User CRUD scoped under SuperAdmin prefix
        Route::post('/users',        [UserManagementController::class, 'store'])->name('admin.users.store');
        Route::put('/users/{id}',    [UserManagementController::class, 'update'])->name('admin.users.update');
        Route::delete('/users/{id}', [UserManagementController::class, 'destroy'])->name('admin.users.destroy');

        // Company CRUD
        Route::post('/companies',        [\App\Http\Controllers\CompanyController::class, 'store'])->name('admin.companies.store');
        Route::put('/companies/{id}',    [\App\Http\Controllers\CompanyController::class, 'update'])->name('admin.companies.update');
        Route::delete('/companies/{id}', [\App\Http\Controllers\CompanyController::class, 'destroy'])->name('admin.companies.destroy');

        // Project delete (SuperAdmin only)
        Route::delete('/projects/{id}',  [\App\Http\Controllers\ProjectController::class, 'superAdminDestroy'])->name('admin.projects.destroy');
    });

    // ── Project card selector (ProjectListPage) ──
    // Block SuperAdmin from landing here
    Route::get('/projectlistpage', function () {
        if (Auth::user()?->role?->name === 'SuperAdmin') return redirect('/admin');
        return app(ProjectController::class)->projectListPage(request());
    })->middleware('sidebar:Project List')->name('projectlistpage');
    Route::get('/projects', [ProjectController::class, 'projectListPage'])->middleware('sidebar:Project List')->name('projects.index');

    // ── Create project (PIC only) ──
    Route::post('/projectlistpage', [ProjectController::class, 'store'])->name('projectlistpage.store');
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
    Route::put('/projects/{id}/toggle-private', [ProjectController::class, 'togglePrivate'])->name('projects.toggle-private');

    // ── Single project dashboard ──
    Route::get('/projects/{id}', [ProjectController::class, 'dashboard'])->middleware('sidebar:Dashboard')->name('projects.show');

    // ── Tasks & WBS management ──
    Route::get('/tasks', [ProjectController::class, 'tasks'])->middleware('sidebar:Tasks')->name('tasks.index');
    Route::get('/today-tasks', [ProjectController::class, 'todayTasks'])->name('today-tasks.index');
    Route::get('/projects/{id}/today-tasks', [ProjectController::class, 'todayTasks'])->name('projects.today-tasks');

    // Main Tasks (Main WBS)
    Route::post('/projects/{id}/main-wbs', [ProjectController::class, 'addMainWbs'])->name('projects.mainwbs.store');
    Route::put('/projects/{id}/main-wbs/{mainWbsId}', [ProjectController::class, 'updateMainWbs'])->name('projects.mainwbs.update');
    Route::delete('/projects/{id}/main-wbs/{mainWbsId}', [ProjectController::class, 'deleteMainWbs'])->name('projects.mainwbs.destroy');

    // Sub Tasks
    Route::post('/projects/{id}/sub-wbs', [ProjectController::class, 'addSubWbs'])->name('projects.subwbs.store');
    Route::put('/projects/{id}/sub-wbs/{subWbsId}', [ProjectController::class, 'updateSubWbs'])->name('projects.subwbs.update');
    Route::delete('/projects/{id}/sub-wbs/{subWbsId}', [ProjectController::class, 'deleteSubWbs'])->name('projects.subwbs.destroy');

    // Tasks (Sub-Subtasks)
    Route::post('/projects/{id}/tasks', [ProjectController::class, 'addTask'])->name('projects.tasks.store');
    Route::put('/projects/{id}/tasks/{taskId}', [ProjectController::class, 'updateTask'])->name('projects.tasks.update');
    Route::delete('/projects/{id}/tasks/{taskId}', [ProjectController::class, 'deleteTask'])->name('projects.tasks.destroy');
    Route::post('/projects/{id}/tasks/{taskId}/toggle', [ProjectController::class, 'toggleTask'])->name('projects.tasks.toggle');

    // ── S-Curve ──
    Route::get('/scurve', [ProjectController::class, 'scurve'])->middleware('sidebar:S-Curve Report')->name('scurve');

    // ── User Management (PIC-level access) ──
    Route::get('/users', [UserManagementController::class, 'index'])->middleware('sidebar:User Management')->name('users.index');
    Route::post('/users', [UserManagementController::class, 'store'])->name('users.store');
    Route::put('/users/{id}', [UserManagementController::class, 'update'])->name('users.update');
    Route::delete('/users/{id}', [UserManagementController::class, 'destroy'])->name('users.destroy');

    // ── Other Pages — Guarded: Admin Progres MUST NOT access these ──
    Route::middleware(BlockAdminProgres::class)->group(function () {
        Route::get('/dashboard', [ProjectController::class, 'dashboard'])->middleware('sidebar:Dashboard')->name('dashboard');
        Route::get('/projectdetailpage', [ProjectController::class, 'projectDetailPage'])->middleware('sidebar:Project Detail')->name('projectdetailpage');
        Route::get('/project',           [ProjectController::class, 'projectDetailPage'])->middleware('sidebar:Project Detail')->name('project');
        Route::get('/timeline',  [ProjectController::class, 'timeline'])->middleware('sidebar:Timeline')->name('timeline');
        Route::get('/weekly',    [ProjectController::class, 'weekly'])->middleware('sidebar:Weekly Progress')->name('weekly');
        Route::get('/budget',            [ProjectController::class, 'budget'])->middleware('sidebar:Budget Management')->name('budget');
        Route::get('/division-progress', [ProjectController::class, 'divisionProgress'])->middleware('sidebar:Division Progress')->name('division-progress');

        Route::get('/projectdetailpage/{id}',          [ProjectController::class, 'projectDetailPage'])->middleware('sidebar:Project Detail')->name('projectdetailpage.id');
        Route::get('/projects/{id}/detail',            [ProjectController::class, 'projectDetailPage'])->middleware('sidebar:Project Detail')->name('projects.detail');
        Route::get('/projects/{id}/timeline',          [ProjectController::class, 'timeline'])->middleware('sidebar:Timeline')->name('projects.timeline');
        Route::get('/projects/{id}/weekly',            [ProjectController::class, 'weekly'])->middleware('sidebar:Weekly Progress')->name('projects.weekly');
        Route::get('/projects/{id}/budget',            [ProjectController::class, 'budget'])->middleware('sidebar:Budget Management')->name('projects.budget');
        Route::get('/projects/{id}/division-progress', [ProjectController::class, 'divisionProgress'])->middleware('sidebar:Division Progress')->name('projects.division-progress');

        Route::post('/projects/{id}/weekly', [ProjectController::class, 'saveWeeklyProgress'])->name('projects.weekly.store');

        Route::post('/projects/{id}/budget', [ProjectController::class, 'storeBudgetEntry'])->name('projects.budget.store');
        Route::delete('/projects/{id}/budget/{entryId}', [ProjectController::class, 'deleteBudgetEntry'])->name('projects.budget.destroy');
    });
});
