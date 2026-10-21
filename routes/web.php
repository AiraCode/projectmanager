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

Route::match(['get', 'post'], '/logout', [AuthController::class, 'logout'])->name('logout');

// Protected Routes
Route::middleware('auth')->group(function () {
    Route::put('/profile/password', [AuthController::class, 'changePassword'])->name('profile.password.update');

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
        Route::get('/divisions',     [SuperAdminController::class, 'divisionsPage'])->name('admin.divisions');
        Route::get('/projects',      [SuperAdminController::class, 'allProjectsPage'])->name('admin.projects');

        // User CRUD scoped under SuperAdmin prefix
        Route::post('/users',        [UserManagementController::class, 'store'])->name('admin.users.store');
        Route::put('/users/{id}',    [UserManagementController::class, 'update'])->name('admin.users.update');
        Route::delete('/users/{id}', [UserManagementController::class, 'destroy'])->name('admin.users.destroy');

        // Company CRUD
        Route::post('/companies',        [\App\Http\Controllers\CompanyController::class, 'store'])->name('admin.companies.store');
        Route::put('/companies/{id}',    [\App\Http\Controllers\CompanyController::class, 'update'])->name('admin.companies.update');
        Route::delete('/companies/{id}', [\App\Http\Controllers\CompanyController::class, 'destroy'])->name('admin.companies.destroy');

        // Divisions CRUD (SuperAdmin only)
        Route::post('/divisions',        [\App\Http\Controllers\DivisionController::class, 'store'])->name('admin.divisions.store');
        Route::put('/divisions/{id}',    [\App\Http\Controllers\DivisionController::class, 'update'])->name('admin.divisions.update');
        Route::delete('/divisions/{id}', [\App\Http\Controllers\DivisionController::class, 'destroy'])->name('admin.divisions.destroy');

        // Project delete (SuperAdmin only)
        Route::delete('/projects/{id}',  [\App\Http\Controllers\ProjectController::class, 'superAdminDestroy'])->name('admin.projects.destroy');

        // ── BE-08: Master Templates Management (SuperAdmin only) ──
        Route::get('/templates',                                        [\App\Http\Controllers\Admin\TemplateController::class, 'index'])->name('admin.templates.index');
        Route::post('/templates',                                       [\App\Http\Controllers\Admin\TemplateController::class, 'store'])->name('admin.templates.store');
        Route::put('/templates/{id}',                                   [\App\Http\Controllers\Admin\TemplateController::class, 'update'])->name('admin.templates.update');
        Route::delete('/templates/{id}',                                [\App\Http\Controllers\Admin\TemplateController::class, 'destroy'])->name('admin.templates.destroy');
        Route::post('/templates/{id}/set-default',                      [\App\Http\Controllers\Admin\TemplateController::class, 'setDefault'])->name('admin.templates.set-default');
        Route::post('/templates/{id}/main-tasks',                       [\App\Http\Controllers\Admin\TemplateController::class, 'addMainTask'])->name('admin.templates.main-tasks.store');
        Route::put('/templates/{id}/main-tasks/{mainTaskId}',           [\App\Http\Controllers\Admin\TemplateController::class, 'updateMainTask'])->name('admin.templates.main-tasks.update');
        Route::delete('/templates/{id}/main-tasks/{mainTaskId}',        [\App\Http\Controllers\Admin\TemplateController::class, 'deleteMainTask'])->name('admin.templates.main-tasks.destroy');
        Route::post('/templates/{id}/main-tasks/reorder',               [\App\Http\Controllers\Admin\TemplateController::class, 'reorderMainTasks'])->name('admin.templates.main-tasks.reorder');
        Route::post('/templates/{id}/main-tasks/{mainTaskId}/sub-tasks', [\App\Http\Controllers\Admin\TemplateController::class, 'addSubTask'])->name('admin.templates.sub-tasks.store');
        Route::put('/templates/{id}/sub-tasks/{subTaskId}',             [\App\Http\Controllers\Admin\TemplateController::class, 'updateSubTask'])->name('admin.templates.sub-tasks.update');
        Route::delete('/templates/{id}/sub-tasks/{subTaskId}',          [\App\Http\Controllers\Admin\TemplateController::class, 'deleteSubTask'])->name('admin.templates.sub-tasks.destroy');
        Route::post('/templates/{id}/main-tasks/{mainTaskId}/sub-tasks/reorder', [\App\Http\Controllers\Admin\TemplateController::class, 'reorderSubTasks'])->name('admin.templates.sub-tasks.reorder');

        // ── BE-09: Division Requests Approval (SuperAdmin only) ──
        Route::get('/division-requests',              [\App\Http\Controllers\Admin\DivisionApprovalController::class, 'index'])->name('admin.division-requests.index');
        Route::post('/division-requests/{id}/approve', [\App\Http\Controllers\Admin\DivisionApprovalController::class, 'approve'])->name('admin.division-requests.approve');
        Route::post('/division-requests/{id}/reject',  [\App\Http\Controllers\Admin\DivisionApprovalController::class, 'reject'])->name('admin.division-requests.reject');
    });

    // Division request submission (Worker or PIC or Admins)
    Route::post('/division-requests', [\App\Http\Controllers\Admin\DivisionApprovalController::class, 'requestDivision'])->name('division-requests.store');

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

    // ── Project Setup Wizard (PIC only) ──
    Route::get('/projects/{id}/setup', [ProjectController::class, 'setupWizard'])->name('projects.setup');
    Route::post('/projects/{id}/setup/complete', [ProjectController::class, 'completeSetup'])->name('projects.setup.complete');

    // ── Single project dashboard ──
    Route::get('/projects/{id}', [ProjectController::class, 'dashboard'])->middleware('sidebar:Dashboard')->name('projects.show');

    // ── Tasks & WBS management ──
    Route::get('/tasks', [ProjectController::class, 'tasks'])->middleware('sidebar:Tasks')->name('tasks.index');
    Route::get('/today-tasks', [ProjectController::class, 'todayTasks'])->name('today-tasks.index');
    Route::get('/projects/{id}/today-tasks', [ProjectController::class, 'todayTasks'])->name('projects.today-tasks');

    // ── Task Dependencies API ──
    Route::get('/projects/{id}/predecessors', [ProjectController::class, 'predecessorsView'])->name('projects.predecessors');
    Route::get('/projects/{id}/tasks/{taskId}/dependencies', [ProjectController::class, 'getTaskDependencies'])->name('projects.tasks.dependencies.index');
    Route::post('/projects/{id}/tasks/{taskId}/dependencies', [ProjectController::class, 'addTaskDependency'])->name('projects.tasks.dependencies.store');
    Route::delete('/projects/{id}/tasks/{taskId}/dependencies/{depId}', [ProjectController::class, 'removeTaskDependency'])->name('projects.tasks.dependencies.destroy');

    // ── BE-05: Drag and Drop Task Reordering API ──
    Route::post('/projects/{id}/reorder-tasks', [ProjectController::class, 'reorderTasks'])->name('projects.tasks.reorder');
    Route::post('/projects/{id}/reorder-sub-wbs', [ProjectController::class, 'reorderSubWbs'])->name('projects.subwbs.reorder');
    Route::post('/projects/{id}/reorder-main-wbs', [ProjectController::class, 'reorderMainWbs'])->name('projects.mainwbs.reorder');

    // ── BE-03: Custom Percentage / Weight Management API ──
    Route::post('/projects/{id}/weights', [ProjectController::class, 'updateWeights'])->name('projects.weights.update');

    // ── BE-04: Progress History / Activity Logs for a Task ──
    Route::get('/projects/{id}/tasks/{taskId}/activity-logs', [ProjectController::class, 'getTaskActivityLogs'])->name('projects.tasks.activity-logs');

    // ── BE-06: Working Tree Structure & Project User Assignment ──
    Route::get('/projects/{id}/working-tree', [ProjectController::class, 'workingTree'])->name('projects.working-tree');
    Route::post('/projects/{id}/members', [ProjectController::class, 'assignProjectMember'])->name('projects.members.assign');
    Route::delete('/projects/{id}/members/{memberId}', [ProjectController::class, 'removeProjectMember'])->name('projects.members.remove');

    // Main Tasks (Main WBS)
    Route::delete('/projects/{id}/clear-wbs', [ProjectController::class, 'clearWbs'])->name('projects.wbs.clear');
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

// ── Public Storage File Serving (Evidence PDF & Media Preview) ──
Route::get('/storage/{path}', function (string $path) {
    // Sanitize path against directory traversal
    $path = str_replace(['..', "\0"], '', $path);
    $fullPath = storage_path('app/public/' . $path);

    if (!file_exists($fullPath) || is_dir($fullPath)) {
        abort(404, 'File evidence tidak ditemukan di server.');
    }

    $mimeType = mime_content_type($fullPath) ?: 'application/octet-stream';
    if (str_ends_with(strtolower($path), '.pdf')) {
        $mimeType = 'application/pdf';
    }

    return response()->file($fullPath, [
        'Content-Type' => $mimeType,
        'Content-Disposition' => 'inline; filename="' . basename($fullPath) . '"',
        'X-Frame-Options' => 'SAMEORIGIN',
        'Cache-Control' => 'public, max-age=86400',
    ]);
})->where('path', '.*')->name('storage.serve');

