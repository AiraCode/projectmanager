<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\Project;
use App\Models\Company;
use App\Models\Division;
use App\Models\ListMainWbsName;
use App\Models\MainWbs;
use App\Models\ListSubWbsName;
use App\Models\SubWbs;
use App\Models\Wbs;
use App\Models\BudgetEntry;
use App\Models\WeeklyProgress;
use App\Models\TaskDependency;
use App\Services\ProgressService;
use App\Services\ProjectTemplateService;
use App\Services\DependencyScheduler;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class ProjectController extends Controller
{
    /**
     * Project card selector (ProjectListPage) — shown to Admin Utama & Admin Progres.
     * PIC is redirected directly to their project dashboard (or creation page if none).
     * Worker is redirected directly to their company's tasks.
     */
    public function projectListPage(Request $request)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role === 'worker') {
            $projectAccess = $user->permission_matrix['project_access'] ?? [];
            $allowedIds = array_keys(array_filter($projectAccess, fn($access) => !empty($access['view_project'])));
            
            $projectsQuery = Project::where('companies_id', $user->companies_id)->whereIn('id', $allowedIds)->with(['manager', 'company']);
            $projects = $projectsQuery->get();
            if ($projects->count() === 0) {
                abort(403, 'Anda belum diberikan akses ke proyek manapun. Silakan hubungi Administrator.');
            }

            if ($projects->count() === 1) {
                return redirect()->route('tasks.index', ['project_id' => $projects->first()->id]);
            }

            $mappedProjects = $projects->map(function ($p) {
                return [
                    'id'               => $p->id,
                    'name'             => $p->title,
                    'company'          => $p->company?->name ?? '—',
                    'manager'          => $p->manager?->username ?? $p->manager?->name ?? '—',
                    'status'           => $p->status ?? 'Open',
                    'progress'         => (int) ($p->progress ?? 0),
                    'planned_progress' => app(\App\Services\WeeklyService::class)->getCurrentPlannedProgress($p->id),
                    'start_date'       => $p->start ? $p->start->format('Y-m-d') : null,
                    'end_date'         => $p->end ? $p->end->format('Y-m-d') : null,
                    'setup_status'     => $p->setup_status ?? 'active',
                    'is_private'       => (bool) $p->is_private,
                ];
            });

            return Inertia::render('ProjectListPage', [
                'projects'  => $mappedProjects,
                'canCreate' => false,
                'userRole'  => $role,
            ]);
        }

        if ($role === 'pic') {
            $projectsFeatures = $user->permission_matrix['features']['projects'] ?? [];
            $hasMultiple = collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('multiple projects') || collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('multiple_projects');
            $hasPrivate = collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('private projects') || collect($projectsFeatures)->map(fn($f) => strtolower($f))->contains('private_projects');

            $picProjectsQuery = Project::query();
            if ($user->companies_id) {
                $picProjectsQuery->where(function ($q) use ($user) {
                    $q->where('companies_id', $user->companies_id)
                      ->orWhere('project_manager', $user->id);
                });
            } else {
                $picProjectsQuery->where('project_manager', $user->id);
            }
            $picProjects = $picProjectsQuery->with(['manager', 'company'])->get();

            if (!$hasMultiple && $picProjects->count() > 0) {
                $pFirst = $picProjects->first();
                if (($pFirst->setup_status ?? 'active') === 'pending_setup') {
                    return redirect()->route('projects.setup', $pFirst->id);
                }
                return redirect()->route('projects.show', $pFirst->id);
            }

            $companies = Company::select('id', 'name')->get();
            $mappedProjects = $picProjects->map(function ($p) {
                return [
                    'id'               => $p->id,
                    'name'             => $p->title,
                    'company'          => $p->company?->name ?? '—',
                    'manager'          => $p->manager?->username ?? $p->manager?->name ?? '—',
                    'status'           => $p->status ?? 'Open',
                    'progress'         => (int) ($p->progress ?? 0),
                    'planned_progress' => app(\App\Services\WeeklyService::class)->getCurrentPlannedProgress($p->id),
                    'start_date'       => $p->start ? $p->start->format('Y-m-d') : null,
                    'end_date'         => $p->end ? $p->end->format('Y-m-d') : null,
                    'setup_status'     => $p->setup_status ?? 'active',
                    'is_private'       => (bool) $p->is_private,
                ];
            });

            return Inertia::render('ProjectListPage', [
                'projects'  => $mappedProjects,
                'canCreate' => $hasMultiple || $picProjects->count() === 0,
                'companies' => $companies,
                'userRole'  => $role,
                'hasPrivateFeature' => $hasPrivate,
            ]);
        }

        // Admin Utama & Admin Progres: show all projects as cards
        $query = Project::with(['manager', 'company']);
        if ($role !== 'SuperAdmin') {
            $query->where('is_private', false);
        }
        $projects = $query->get()->map(function ($p) {
            return [
                'id'          => $p->id,
                'name'        => $p->title,
                'company'     => $p->company?->name ?? '—',
                'manager'     => $p->manager?->username ?? $p->manager?->name ?? '—',
                'status'           => $p->status ?? 'Open',
                'progress'         => (int) ($p->progress ?? 0),
                'planned_progress' => app(\App\Services\WeeklyService::class)->getCurrentPlannedProgress($p->id),
                'start_date'       => $p->start ? $p->start->format('Y-m-d') : null,
                'end_date'         => $p->end ? $p->end->format('Y-m-d') : null,
                'setup_status'     => $p->setup_status ?? 'active',
                'is_private'       => (bool) $p->is_private,
            ];
        });

        return Inertia::render('ProjectListPage', [
            'projects'  => $projects,
            'canCreate' => false, // Admin Utama and Admin Progres CANNOT create project!
            'userRole'  => $role,
        ]);
    }

    /**
     * Backward-compatible alias for index.
     */
    public function index(Request $request)
    {
        return $this->projectListPage($request);
    }

    /**
     * Single project dashboard.
     */
    public function dashboard(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        if (($project->setup_status ?? 'active') === 'pending_setup' && in_array($role, ['pic', 'SuperAdmin', 'admin_utama'])) {
            return redirect()->route('projects.setup', $project->id);
        }

        return Inertia::render('DashboardPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Project detail breakdown (ProjectDetailPage).
     */
    public function projectDetailPage(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        if (($project->setup_status ?? 'active') === 'pending_setup' && in_array($role, ['pic', 'SuperAdmin', 'admin_utama'])) {
            return redirect()->route('projects.setup', $project->id);
        }

        return Inertia::render('ProjectDetailPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Backward-compatible alias for projectPage.
     */
    public function projectPage(Request $request, int|string|null $id = null)
    {
        return $this->projectDetailPage($request, $id);
    }

    /**
     * Tasks page — scoped by role and company.
     */
    public function tasks(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('scurve');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            if ($role === 'worker') {
                $project = null; // Let the frontend handle the empty state
            } else {
                return redirect()->route('projectlistpage');
            }
        }

        if ($project && ($project->setup_status ?? 'active') === 'pending_setup' && in_array($role, ['pic', 'SuperAdmin', 'admin_utama'])) {
            return redirect()->route('projects.setup', $project->id);
        }

        $divisions = Division::select('id', 'divisi')->get();
        $workerDivisionId = ($role === 'worker') ? $user->divisions_id : null;

        $availableProjects = [];
        if ($role === 'worker') {
            $projectAccess = $user->permission_matrix['project_access'] ?? [];
            $allowedIds = array_keys(array_filter($projectAccess, fn($access) => !empty($access['view_project'])));
            $availableProjects = Project::where('companies_id', $user->companies_id)
                ->whereIn('id', $allowedIds)
                ->select('id', 'title')
                ->get();
        }

        return Inertia::render('TasksPage', [
            'project'           => $project ? $this->transformProjectData($project, null) : null,
            'availableProjects' => $availableProjects,
            'userRole'          => $role,
            'division'          => $user->division?->divisi ?? null,
            'divisions'         => $divisions,
        ]);
    }

    /**
     * Dedicated Today's Tasks page.
     */
    public function todayTasks(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('scurve');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        $divisions = Division::select('id', 'divisi')->get();
        $workerDivisionId = ($role === 'worker') ? $user->divisions_id : null;

        $availableProjects = [];
        if ($role === 'worker') {
            $projectAccess = $user->permission_matrix['project_access'] ?? [];
            $allowedIds = array_keys(array_filter($projectAccess, fn($access) => !empty($access['view_project'])));
            $availableProjects = Project::where('companies_id', $user->companies_id)
                ->whereIn('id', $allowedIds)
                ->select('id', 'title')
                ->get();
        }

        return Inertia::render('TodayTasksPage', [
            'project'           => $this->transformProjectData($project, $workerDivisionId),
            'availableProjects' => $availableProjects,
            'userRole'          => $role,
            'division'          => $user->division?->divisi ?? null,
            'divisions'         => $divisions,
        ]);
    }

    /**
     * Timeline / Gantt chart view.
     */
    public function timeline(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        $workerDivisionId = ($role === 'worker') ? $user->divisions_id : null;

        return Inertia::render('TimelinePage', [
            'project'  => $this->transformProjectData($project, $workerDivisionId),
            'userRole' => $role,
        ]);
    }

    /**
     * Weekly implementation view.
     */
    public function weekly(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        return Inertia::render('WeeklyPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Budget tracking view.
     */
    public function budget(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        return Inertia::render('BudgetPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * S-Curve page — accessible by all roles, but scoped.
     * Admin Progres ONLY views this page!
     */
    public function scurve(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            // Admin Progres has no specific project selected — send back to project list
            return redirect()->route('projectlistpage');
        }

        return Inertia::render('SCurvePage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Create Project — Strictly for PIC who does not own a project yet!
     * Admin Utama & Admin Progres are FORBIDDEN from creating projects.
     */
    public function store(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role !== 'pic') {
            abort(403, 'Access Denied: Only PICs can create new projects. Admins are not permitted to create projects.');
        }

        // Check if PIC is allowed to create multiple projects
        $matrix = $user->permission_matrix ?? [];
        $hasMultiple = in_array('Multiple Projects', $matrix['features']['projects'] ?? []);

        if (!$hasMultiple && Project::where('project_manager', $user->id)->exists()) {
            return back()->withErrors(['title' => 'You already manage an existing project. Request permission to create multiple projects.']);
        }

        $validated = $request->validate([
            'title'        => 'required|string|max:100',
            'company_id'   => 'nullable|exists:companies,id',
            'company_name' => 'nullable|string|max:100',
            'start'        => 'required|date',
            'end'          => 'required|date|after:start',
            'is_private'   => 'nullable|boolean',
        ]);

        // Assign company to PIC if not yet set
        if (!$user->companies_id) {
            if (!empty($validated['company_id'])) {
                $user->companies_id = $validated['company_id'];
            } elseif (!empty($validated['company_name'])) {
                $company = Company::firstOrCreate(['name' => trim($validated['company_name'])]);
                $user->companies_id = $company->id;
            } else {
                return back()->withErrors(['company_id' => 'Company must be selected or entered.']);
            }
            $user->save();
        }

        $start = Carbon::parse($validated['start']);
        $end   = Carbon::parse($validated['end']);

        $project = Project::create([
            'companies_id'    => $user->companies_id,
            'project_manager' => $user->id,
            'title'           => $validated['title'],
            'start'           => $start,
            'end'             => $end,
            'actual_start'    => $start,
            'actual_end'      => $end,
            'progress'        => 0,
            'status'          => 'Open',
            'setup_status'    => 'pending_setup',
            'is_private'      => $validated['is_private'] ?? false,
        ]);

        // Automatically initialize standard 17 Main Jobs WBS template for new project
        app(ProjectTemplateService::class)->applyTemplateToProject($project);

        // Redirect to setup wizard page so PIC can customize Main, Sub, and Sub-Sub tasks
        return redirect()->route('projects.setup', $project->id);
    }

    /**
     * WBS Template Setup Wizard for newly created project (or editing setup).
     */
    public function setupWizard(Request $request, int|string $id)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::with([
            'company',
            'manager',
            'mainWbs' => function ($q) {
                $q->orderBy('id', 'asc');
            },
            'mainWbs.listName',
            'mainWbs.subWbs' => function ($q) {
                $q->orderBy('id', 'asc');
            },
            'mainWbs.subWbs.listName',
            'mainWbs.subWbs.wbsTasks' => function ($q) {
                $q->with([
                    'division',
                    'predecessorDependencies.predecessor',
                    'successorDependencies.successor',
                ])->orderBy('id', 'asc');
            },
        ])->findOrFail($id);

        if ($role === 'pic' && !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can configure it.');
        }

        $divisions = Division::select('id', 'divisi')->get();

        $allTasks = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->select('id', 'name', 'start', 'end')->orderBy('start', 'asc')->get();

        return Inertia::render('ProjectSetupPage', [
            'project' => [
                'id'           => $project->id,
                'title'        => $project->title,
                'status'       => $project->status,
                'setup_status' => $project->setup_status ?? 'pending_setup',
                'start'        => $project->start ? $project->start->format('Y-m-d') : null,
                'end'          => $project->end ? $project->end->format('Y-m-d') : null,
                'company'      => $project->company?->name ?? '—',
                'manager'      => $project->manager?->username ?? $project->manager?->name ?? '—',
                'mainWbs'      => $project->mainWbs->values()->map(function ($mw, $mwIdx) {
                    return [
                        'id'                     => $mw->id,
                        'code'                   => (string) ($mwIdx + 1),
                        'list_main_wbs_names_id' => $mw->list_main_wbs_names_id,
                        'name'                   => $mw->name ?: ($mw->listName?->name ?? 'Main Task'),
                        'weight'                 => (float) $mw->percentage,
                        'start'                  => $mw->start ? $mw->start->format('Y-m-d') : '',
                        'end'                    => $mw->end ? $mw->end->format('Y-m-d') : '',
                        'subWbs'                 => $mw->subWbs->values()->map(function ($sw, $swIdx) use ($mwIdx) {
                            $subCode = ($mwIdx + 1) . '.' . ($swIdx + 1);
                            return [
                                'id'                    => $sw->id,
                                'code'                  => $subCode,
                                'main_wbs_id'           => $sw->sub_wbs_id,
                                'name'                  => $sw->name ?: ($sw->listName?->name ?? 'Sub Task'),
                                'weight'                => (float) $sw->weight,
                                'start'                 => $sw->start ? $sw->start->format('Y-m-d') : '',
                                'end'                   => $sw->end ? $sw->end->format('Y-m-d') : '',
                                'wbsTasks'              => $sw->wbsTasks->values()->map(function ($t, $tIdx) use ($subCode) {
                                    return [
                                        'id'            => $t->id,
                                        'code'          => $subCode . '.' . ($tIdx + 1),
                                        'sub_wbs_id'    => $t->sub_wbs_id,
                                        'name'          => $t->name,
                                        'division_id'   => $t->divisions_id,
                                        'division_name' => $t->division?->divisi ?? 'General',
                                        'vendor'        => $t->vendor ?? 'INTERNAL',
                                        'start'         => $t->start ? $t->start->format('Y-m-d') : '',
                                        'end'           => $t->end ? $t->end->format('Y-m-d') : '',
                                        'duration_days' => $t->duration_days ?? 1,
                                        'predecessor'   => $t->predecessor ?? '',
                                        'dep_type'      => $t->dep_type ?: 'FS',
                                        'lag'           => (int) ($t->lag ?? 0),
                                        'lead'          => (int) ($t->lead ?? 0),
                                        'requires_evidence' => (bool) $t->requires_evidence,
                                        'dependencies'  => $t->predecessorDependencies->map(function ($d) {
                                            return [
                                                'id'                 => $d->id,
                                                'predecessor_wbs_id' => $d->predecessor_wbs_id,
                                                'predecessor_name'   => $d->predecessor?->name ?? $d->predecessor_wbs_id,
                                                'dependency_type'    => $d->dependency_type,
                                                'lag_days'           => (int) $d->lag_days,
                                            ];
                                        })->values()->toArray(),
                                    ];
                                }),
                            ];
                        }),
                    ];
                }),
            ],
            'divisions' => $divisions,
            'allTasks'  => $allTasks,
            'userRole'  => $role,
        ]);
    }

    /**
     * Mark project setup as complete, activate project and cascade schedules.
     */
    public function completeSetup(Request $request, int|string $id)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $project = Project::findOrFail($id);

        if ($role === 'pic' && !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403);
        }

        $mainTasks = MainWbs::where('projects_id', $project->id)->with('subWbs')->get();
        if ($mainTasks->isEmpty()) {
            return back()->with('error', 'Proyek harus memiliki minimal 1 Main Task.');
        }

        foreach ($mainTasks as $mt) {
            if ($mt->subWbs->isEmpty()) {
                return back()->with('error', "Main Task '{$mt->name}' harus memiliki minimal 1 Sub Task.");
            }
        }

        // Recalculate schedule via DependencyScheduler
        $scheduler = app(DependencyScheduler::class);
        $firstTask = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->orderBy('start', 'asc')->first();

        if ($firstTask) {
            $scheduler->propagate($firstTask->id);
        }

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        $project->update([
            'setup_status' => 'active',
        ]);

        return redirect()->route('projects.show', $project->id)
            ->with('success', 'Konfigurasi proyek selesai! Proyek telah aktif dan siap dikerjakan.');
    }

    /**
     * Get dependencies for a task.
     */
    public function getTaskDependencies(int|string $projectId, string $taskId)
    {
        $task = Wbs::findOrFail($taskId);
        $predecessors = TaskDependency::where('successor_wbs_id', $taskId)
            ->with('predecessor')
            ->get()
            ->map(function ($d) {
                return [
                    'id'                 => $d->id,
                    'predecessor_wbs_id' => $d->predecessor_wbs_id,
                    'predecessor_name'   => $d->predecessor?->name ?? $d->predecessor_wbs_id,
                    'dependency_type'    => $d->dependency_type,
                    'lag_days'           => (int)$d->lag_days,
                ];
            });

        $successors = TaskDependency::where('predecessor_wbs_id', $taskId)
            ->with('successor')
            ->get()
            ->map(function ($d) {
                return [
                    'id'               => $d->id,
                    'successor_wbs_id' => $d->successor_wbs_id,
                    'successor_name'   => $d->successor?->name ?? $d->successor_wbs_id,
                    'dependency_type'  => $d->dependency_type,
                    'lag_days'         => (int)$d->lag_days,
                ];
            });

        return response()->json([
            'task'         => [
                'id'       => $task->id,
                'name'     => $task->name,
                'start'    => $task->start ? $task->start->format('Y-m-d') : null,
                'end'      => $task->end ? $task->end->format('Y-m-d') : null,
                'duration' => $task->duration_days ?? 1,
            ],
            'predecessors' => $predecessors,
            'successors'   => $successors,
        ]);
    }

    /**
     * Add a task dependency.
     */
    public function addTaskDependency(Request $request, int|string $projectId, string $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $project = Project::findOrFail($projectId);

        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only PIC can manage dependencies.');
        }

        $validated = $request->validate([
            'predecessor_wbs_id' => 'required|string|exists:wbs,id',
            'dependency_type'    => 'required|string|in:FS,SS,FF,SF',
            'lag_days'           => 'nullable|integer',
        ]);

        $predId = $validated['predecessor_wbs_id'];
        if ($predId === $taskId) {
            return back()->with('error', 'Tugas tidak dapat bergantung pada dirinya sendiri.');
        }

        $scheduler = app(DependencyScheduler::class);
        if ($scheduler->wouldCauseCycle($predId, $taskId)) {
            return back()->with('error', 'Ketergantungan tidak dapat ditambahkan: Terdeteksi circular dependency (siklus tak berujung)!');
        }

        TaskDependency::updateOrCreate(
            [
                'predecessor_wbs_id' => $predId,
                'successor_wbs_id'   => $taskId,
            ],
            [
                'dependency_type'    => $validated['dependency_type'],
                'lag_days'           => (int) ($validated['lag_days'] ?? 0),
            ]
        );

        $task = Wbs::findOrFail($taskId);
        $task->update([
            'predecessor' => $predId,
            'dep_type'    => $validated['dependency_type'],
            'lag'         => (int) ($validated['lag_days'] ?? 0),
        ]);

        // Recalculate and cascade forward
        $scheduler->propagate($predId);

        app(ProgressService::class)->recalculateProjectProgress($projectId);

        return back()->with('success', 'Ketergantungan tugas berhasil ditambahkan dan jadwal diperbarui.');
    }

    /**
     * Remove a task dependency.
     */
    public function removeTaskDependency(Request $request, int|string $projectId, int $depId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $project = Project::findOrFail($projectId);

        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only PIC can manage dependencies.');
        }

        $dep = TaskDependency::findOrFail($depId);
        $succId = $dep->successor_wbs_id;
        $dep->delete();

        $task = Wbs::find($succId);
        if ($task) {
            $remaining = TaskDependency::where('successor_wbs_id', $succId)->first();
            if ($remaining) {
                $task->update([
                    'predecessor' => $remaining->predecessor_wbs_id,
                    'dep_type'    => $remaining->dependency_type,
                    'lag'         => $remaining->lag_days,
                ]);
            } else {
                $task->update([
                    'predecessor' => null,
                    'dep_type'    => 'FS',
                    'lag'         => 0,
                ]);
            }
        }

        return back()->with('success', 'Ketergantungan berhasil dihapus.');
    }

    /**
     * Add Main Task (Main Job / Main WBS) to a Project.
     * PIC only!
     */
    public function addMainWbs(Request $request, int|string $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can add a Main Task.');
        }

        $validated = $request->validate([
            'name'   => 'required|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:100',
            'start'  => 'nullable|date',
            'end'    => 'nullable|date',
        ]);

        $listMain = ListMainWbsName::firstOrCreate([
            'name' => $validated['name'],
        ]);

        $start = !empty($validated['start']) ? Carbon::parse($validated['start']) : ($project->start ?? Carbon::now());
        $end   = !empty($validated['end']) ? Carbon::parse($validated['end']) : ($project->end ?? Carbon::now()->addMonths(6));

        MainWbs::create([
            'projects_id'            => $project->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name'                   => $validated['name'],
            'percentage'             => $validated['weight'] ?? 5.0,
            'start'                  => $start,
            'end'                    => $end,
            'actual_start'           => $start,
            'actual_end'             => $end,
            'progress'               => 0,
            'status'                 => 'Open',
        ]);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task added successfully.');
    }

    /**
     * Update Main Task (Main WBS).
     * PIC only!
     */
    public function updateMainWbs(Request $request, int|string $projectId, int|string $mainWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can modify Main Tasks.');
        }

        $mainWbs = MainWbs::where('projects_id', $project->id)->where('id', $mainWbsId)->firstOrFail();

        $validated = $request->validate([
            'name'   => 'required|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:100',
            'start'  => 'nullable|date',
            'end'    => 'nullable|date',
        ]);

        $mainWbs->name = $validated['name'];
        if (isset($validated['weight'])) {
            $mainWbs->percentage = $validated['weight'];
        }
        if (!empty($validated['start'])) {
            $mainWbs->start = Carbon::parse($validated['start']);
            $mainWbs->actual_start = $mainWbs->start;
        }
        if (!empty($validated['end'])) {
            $mainWbs->end = Carbon::parse($validated['end']);
            $mainWbs->actual_end = $mainWbs->end;
        }

        // Strict Date Validation: End must be strictly after start (at least 1 day)
        if ($mainWbs->start && $mainWbs->end && $mainWbs->end->lte($mainWbs->start)) {
            $mainWbs->end = $mainWbs->start->copy()->addDays(1);
            $mainWbs->actual_end = $mainWbs->end;
        }
        $mainWbs->save();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task updated successfully.');
    }

    /**
     * Delete Main Task (Main WBS) and its descendants.
     * PIC only!
     */
    public function deleteMainWbs(Request $request, int|string $projectId, int|string $mainWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can delete Main Tasks.');
        }

        $mainWbs = MainWbs::where('projects_id', $project->id)->where('id', $mainWbsId)->firstOrFail();

        // Delete all SubWbs and Wbs tasks under this MainWbs safely
        foreach ($mainWbs->subWbs()->withTrashed()->get() as $subWbs) {
            $subWbs->wbsTasks()->withTrashed()->delete();
            $subWbs->delete();
        }
        $mainWbs->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task deleted successfully.');
    }

    /**
     * Add Sub Task (Sub Main Job) under a Main WBS.
     * PIC only!
     */
    public function addSubWbs(Request $request, int|string $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can add a Sub Task.');
        }

        if ($request->has('main_wbs_id')) {
            $rawMain = $request->input('main_wbs_id');
            $cleanMainId = is_string($rawMain) ? (int) str_replace('mj-', '', $rawMain) : (int) $rawMain;
            $request->merge(['main_wbs_id' => $cleanMainId]);
        }

        $validated = $request->validate([
            'main_wbs_id' => 'required|exists:main_wbs,id',
            'name'        => 'required|string|max:255',
        ]);

        $mainWbs = MainWbs::findOrFail($validated['main_wbs_id']);
        $listMainId = $mainWbs->list_main_wbs_names_id;
        if (!$listMainId) {
            $firstListMain = ListMainWbsName::firstOrCreate(['name' => $mainWbs->name]);
            $listMainId = $firstListMain->id;
        }

        $listSub = ListSubWbsName::create([
            'name'                         => $validated['name'],
            'list_main_wbs_names_copy1_id' => $listMainId,
        ]);

        SubWbs::create([
            'sub_wbs_id'             => $mainWbs->id,
            'list_sub_wbs_names_id'  => $listSub->id,
            'name'                   => $validated['name'],
            'predecessor'            => '-',
            'predecessor_type'       => 'FS',
            'start'                  => $mainWbs->start ?? $mainWbs->actual_start ?? Carbon::now(),
            'end'                    => $mainWbs->end ?? $mainWbs->actual_end ?? Carbon::now()->addMonths(1),
            'actual_start'           => $mainWbs->start ?? $mainWbs->actual_start ?? Carbon::now(),
            'actual_end'             => $mainWbs->end ?? $mainWbs->actual_end ?? Carbon::now()->addMonths(1),
            'progress'               => 0,
            'status'                 => 'Open',
            'weight'                 => 0, // Auto-calculated below by ProgressService
        ]);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Sub Task added successfully.');
    }

    /**
     * Update Sub Task (Sub Main WBS).
     * PIC only!
     */
    public function updateSubWbs(Request $request, int|string $projectId, int|string $subWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can modify Sub Tasks.');
        }

        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $validated = $request->validate([
            'name'  => 'required|string|max:255',
            'start' => 'nullable|date',
            'end'   => 'nullable|date',
        ]);

        $subWbs->name = $validated['name'];
        if (!empty($validated['start'])) {
            $subWbs->start = Carbon::parse($validated['start']);
            $subWbs->actual_start = $subWbs->start;
        }
        if (!empty($validated['end'])) {
            $subWbs->end = Carbon::parse($validated['end']);
            $subWbs->actual_end = $subWbs->end;
        }

        // Strict Date Validation: End must be strictly after start (at least 1 day)
        if ($subWbs->start && $subWbs->end && $subWbs->end->lte($subWbs->start)) {
            $subWbs->end = $subWbs->start->copy()->addDays(1);
            $subWbs->actual_end = $subWbs->end;
        }
        $subWbs->save();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Sub Task updated successfully.');
    }

    /**
     * Delete Sub Task (Sub Main WBS) and its tasks.
     * PIC only!
     */
    public function deleteSubWbs(Request $request, int|string $projectId, int|string $subWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can delete Sub Tasks.');
        }

        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $subWbs->wbsTasks()->withTrashed()->delete();
        $subWbs->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Sub Task deleted successfully.');
    }

    /**
     * Add Task (Sub-Subtask) under a Sub WBS.
     * PIC only!
     */

    private function cascadeTaskDates($taskId)
    {
        app(DependencyScheduler::class)->propagate($taskId);
    }

    public function addTask(Request $request, int|string $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can add Tasks.');
        }

        if ($request->has('sub_wbs_id')) {
            $rawSub = $request->input('sub_wbs_id');
            $cleanSubId = is_string($rawSub) ? (int) str_replace('smj-', '', $rawSub) : (int) $rawSub;
            $request->merge(['sub_wbs_id' => $cleanSubId]);
        }

        $validated = $request->validate([
            'sub_wbs_id'   => 'required|exists:sub_wbs,id',
            'name'         => 'required|string|max:255',
            'divisions_id' => 'nullable|exists:divisions,id',
            'duration'     => 'nullable|integer|min:1',
            'start'        => 'nullable|date',
            'end'          => 'nullable|date',
            'predecessor'  => 'nullable|string|max:50',
            'dep_type'     => 'nullable|string|in:FS,SS,FF,SF',
            'lag'          => 'nullable|integer',
            'lead'         => 'nullable|integer',
            'requires_evidence' => 'nullable|boolean',
        ]);

        $subWbs = SubWbs::findOrFail($validated['sub_wbs_id']);

        $startDate = !empty($validated['start']) ? Carbon::parse($validated['start']) : ($subWbs->start ?? Carbon::now());
        $duration  = max(1, (int) ($validated['duration'] ?? 1));
        $endDate   = !empty($validated['end']) ? Carbon::parse($validated['end']) : $startDate->copy()->addDays($duration);

        // Strict Date Validation: End must be strictly after start (at least 1 day)
        if ($endDate->lte($startDate)) {
            $endDate = $startDate->copy()->addDays(max(1, $duration));
        }

        $divisionId = $validated['divisions_id'] ?? $user->divisions_id ?? Division::first()?->id;

        $taskObj = Wbs::create([
            'id'           => 'st-' . uniqid(),
            'sub_wbs_id'   => $subWbs->id,
            'divisions_id' => $divisionId,
            'name'         => $validated['name'],
            'weight'       => 0, // Auto-calculated below by ProgressService
            'vendor'       => 'INTERNAL',
            'start'        => $startDate,
            'end'          => $endDate,
            'duration_days'=> max(1, $startDate->diffInDays($endDate)),
            'is_completed' => false,
            'status'       => 'Open',
            'predecessor'  => $validated['predecessor'] ?? null,
            'dep_type'     => $validated['dep_type'] ?? 'FS',
            'lag'          => $validated['lag'] ?? 0,
            'lead'         => $validated['lead'] ?? 0,
            'requires_evidence' => $validated['requires_evidence'] ?? false,
        ]);
        
        if (!empty($validated['predecessor']) && $validated['predecessor'] !== '-') {
            $predId = $validated['predecessor'];
            $scheduler = app(DependencyScheduler::class);
            if (!$scheduler->wouldCauseCycle($predId, $taskObj->id)) {
                TaskDependency::updateOrCreate(
                    [
                        'predecessor_wbs_id' => $predId,
                        'successor_wbs_id'   => $taskObj->id,
                    ],
                    [
                        'dependency_type'    => $validated['dep_type'] ?? 'FS',
                        'lag_days'           => ((int)($validated['lag'] ?? 0)) - ((int)($validated['lead'] ?? 0)),
                    ]
                );
                $scheduler->recalculateTaskDates($taskObj);
            }
        }

        $this->cascadeTaskDates($taskObj->id);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task added successfully.');
    }

    /**
     * Update Task (Sub-Subtask).
     * PIC only!
     */
    public function updateTask(Request $request, int|string $projectId, int|string $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can modify Tasks.');
        }

        $task = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $taskId)->firstOrFail();

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'divisions_id' => 'nullable|exists:divisions,id',
            'duration'     => 'nullable|integer|min:1',
            'start'        => 'nullable|date',
            'end'          => 'nullable|date',
            'predecessor'  => 'nullable|string|max:50',
            'dep_type'     => 'nullable|string|in:FS,SS,FF,SF',
            'lag'          => 'nullable|integer',
            'lead'         => 'nullable|integer',
            'requires_evidence' => 'nullable|boolean',
        ]);

        $task->name = $validated['name'];
        if (isset($validated['divisions_id'])) {
            $task->divisions_id = $validated['divisions_id'];
        }
        if (!empty($validated['start'])) {
            $task->start = Carbon::parse($validated['start']);
        }
        if (!empty($validated['end'])) {
            $task->end = Carbon::parse($validated['end']);
        }

        // Strict Date Validation: End must be strictly after start (at least 1 day)
        if ($task->start && $task->end && $task->end->lte($task->start)) {
            $task->end = $task->start->copy()->addDays(1);
        }
        if ($task->start && $task->end) {
            $task->duration_days = max(1, $task->start->diffInDays($task->end));
        }

        if (isset($validated['predecessor'])) {
            $task->predecessor = $validated['predecessor'];
        }
        if (isset($validated['dep_type'])) {
            $task->dep_type = $validated['dep_type'];
        }
        if (isset($validated['lag'])) {
            $task->lag = $validated['lag'];
        }
        if (isset($validated['lead'])) {
            $task->lead = $validated['lead'];
        }
        if (isset($validated['requires_evidence'])) {
            $task->requires_evidence = $validated['requires_evidence'];
        }
        $task->save();

        if (!empty($task->predecessor) && $task->predecessor !== '-') {
            $predId = $task->predecessor;
            $scheduler = app(DependencyScheduler::class);
            if (!$scheduler->wouldCauseCycle($predId, $task->id)) {
                TaskDependency::updateOrCreate(
                    [
                        'predecessor_wbs_id' => $predId,
                        'successor_wbs_id'   => $task->id,
                    ],
                    [
                        'dependency_type'    => $task->dep_type ?: 'FS',
                        'lag_days'           => ((int)($task->lag ?? 0)) - ((int)($task->lead ?? 0)),
                    ]
                );
            }
        } elseif (isset($validated['predecessor']) && empty($validated['predecessor'])) {
            TaskDependency::where('successor_wbs_id', $task->id)->delete();
        }

        $this->cascadeTaskDates($task->id);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task updated successfully.');
    }

    /**
     * Delete Task (Sub-Subtask).
     * PIC only!
     */
    public function deleteTask(Request $request, int|string $projectId, int|string $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: Only the PIC of this project can delete Tasks.');
        }

        $task = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $taskId)->firstOrFail();

        $task->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task deleted successfully.');
    }

    /**
     * Toggle Task completion status.
     * Rules:
     * - Admin Utama & Admin Progres: 403 Forbidden (Read-only)
     * - Worker: can ONLY toggle tasks for their own company and their own division
     * - PIC: CANNOT toggle tasks, only adds/manages tasks & schedule
     * - Worker: can toggle ONLY tasks assigned to their division
     */
    public function toggleTask(Request $request, int|string $projectId, int|string $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role === 'admin_utama' || $role === 'admin_progres') {
            return back()->with('error', 'Access Denied: Administrators have read-only access and cannot modify task status.');
        }

        $task = Wbs::with('parentSubWbs.mainWbs.project')->where('id', $taskId)->firstOrFail();
        $project = $task->parentSubWbs?->mainWbs?->project;

        if (!$project || $project->id != $projectId) {
            abort(404, 'Task does not belong to this project.');
        }

        if ($role === 'worker') {
            if ($project->companies_id != $user->companies_id) {
                return back()->with('error', 'Access Denied: Workers can only update tasks within their assigned company.');
            }

            if ($user->divisions_id && $task->divisions_id != $user->divisions_id) {
                $taskDivName = strtolower(trim($task->division->divisi ?? ''));
                $userDivName = strtolower(trim($user->division->divisi ?? ''));
                if ($taskDivName !== $userDivName && $taskDivName !== 'general' && $taskDivName !== 'internal') {
                    return back()->with('error', 'Access Denied: You can only update tasks assigned to your division.');
                }
            }
        }

        $progress = $request->input('progress');

        // --- ENFORCE PREDECESSOR RULES (FS, SS, FF, SF) ---
        $scheduler = app(DependencyScheduler::class);
        if ($progress > 0) {
            $startBlocked = $scheduler->validateCanStart($task);
            if ($startBlocked) {
                return back()->with('error', $startBlocked);
            }
        }
        if ($progress >= 100) {
            $completeBlocked = $scheduler->validateCanComplete($task);
            if ($completeBlocked) {
                return back()->with('error', $completeBlocked);
            }
        }

        // Collect all uploaded files — Inertia forceFormData sends multiple files
        // as evidence_file (single) or evidence_file_0, evidence_file_1... (multiple)
        $uploadedFiles = [];
        if ($request->hasFile('evidence_file')) {
            $f = $request->file('evidence_file');
            $uploadedFiles = is_array($f) ? $f : [$f];
        } else {
            $count = (int) $request->input('evidence_file_count', 0);
            for ($i = 0; $i < $count; $i++) {
                if ($request->hasFile("evidence_file_{$i}")) {
                    $uploadedFiles[] = $request->file("evidence_file_{$i}");
                }
            }
        }
        $hasFiles = count($uploadedFiles) > 0;
        $hasExistingEvidence = $task->evidence_path && $task->evidence_path !== '[]';

        // --- VALIDATE EVIDENCE FILE TYPES & SIZE LIMITS ---
        // Allowed: PDF, JPG, JPEG, PNG
        // Max size: JPG/PNG = 10 MB, PDF = 20 MB
        $allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
        $maxImageBytes = 10 * 1024 * 1024; // 10 MB
        $maxPdfBytes   = 20 * 1024 * 1024; // 20 MB

        foreach ($uploadedFiles as $file) {
            if (!$file->isValid()) {
                return back()->with('error', 'Berkas yang diunggah tidak valid atau rusak.');
            }

            $ext = strtolower($file->getClientOriginalExtension());
            if (!in_array($ext, $allowedExtensions, true)) {
                return back()->with('error', "Format berkas '{$file->getClientOriginalName()}' tidak diizinkan. Hanya berkas PDF, JPG, dan PNG yang dapat diunggah.");
            }

            $size = $file->getSize();
            if ($ext === 'pdf') {
                if ($size > $maxPdfBytes) {
                    return back()->with('error', "Ukuran berkas PDF '{$file->getClientOriginalName()}' melebihi batas maksimal 20 MB.");
                }
            } else {
                if ($size > $maxImageBytes) {
                    return back()->with('error', "Ukuran berkas gambar '{$file->getClientOriginalName()}' melebihi batas maksimal 10 MB.");
                }
            }
        }

        if ($progress !== null) {
            $task->progress = max(0, min(100, (int)$progress));

            if ($task->progress == 100 && !$hasFiles && !$hasExistingEvidence) {
                if ($task->requires_evidence) {
                    return back()->with('error', 'Evidence file is required to mark task as 100% complete.');
                }
            }

            $task->is_completed = ($task->progress == 100);
            $task->status = $task->is_completed ? 'Completed' : ($task->progress > 0 ? 'On Track' : 'Open');
        } else {
            if (!$task->is_completed && !$hasFiles && !$hasExistingEvidence) {
                if ($task->requires_evidence) {
                    return back()->with('error', 'Evidence file is required to mark task as complete.');
                }
            }

            $task->is_completed = !$task->is_completed;
            $task->progress = $task->is_completed ? 100 : 0;
            $task->status = $task->is_completed ? 'Completed' : 'Open';
        }

        if ($hasFiles) {
            $existingPaths = [];
            $existingNames = [];
            if ($task->evidence_path) {
                $decoded = json_decode($task->evidence_path, true);
                if (is_array($decoded)) {
                    $existingPaths = $decoded;
                    $existingNames = json_decode($task->evidence_name, true) ?? [];
                } else {
                    $existingPaths = [$task->evidence_path];
                    $existingNames = [$task->evidence_name ?? 'Bukti'];
                }
            }

            foreach ($uploadedFiles as $f) {
                $path = $f->store('evidence', 'public');
                $existingPaths[] = $path;
                $existingNames[] = $f->getClientOriginalName();
            }

            $task->evidence_path = json_encode(array_values($existingPaths));
            $task->evidence_name = json_encode(array_values($existingNames));
        }

        $task->save();

        app(ProgressService::class)->recalculateProjectProgress($projectId);

        return back()->with('success', 'Task status updated successfully.');
    }

    /**
     * Check if a PIC is authorized to manage a project.
     * Authorized if they are the direct project_manager OR if the project belongs to their company.
     */
    private function isPicAuthorizedForProject($user, $project): bool
    {
        if (!$user || !$project) return false;
        if ($project->project_manager == $user->id) return true;
        if ($user->companies_id && $project->companies_id == $user->companies_id) return true;
        return false;
    }

    /**
     * Helper to resolve project for user based on strict multi-tenant and role rules.
     */
    private function resolveProjectForUser(int|string|null $id = null)
    {
        $user = Auth::user();
        if (!$user) return null;
        $role = $user->role->name ?? '';

        $query = Project::with([
            'manager',
            'company',
            'mainWbs.listName',
            'mainWbs.subWbs.listName',
            'mainWbs.subWbs.wbsTasks.division',
            'mainWbs.subWbs.wbsTasks.predecessorDependencies.predecessor',
            'budgetEntries',
            'weeklyProgress',
        ]);

        if ($role === 'pic') {
            if ($id) {
                $project = $query->find($id);
                if (!$project) abort(404, 'Project not found');
                if (!$this->isPicAuthorizedForProject($user, $project)) {
                    abort(403, 'Access Denied: PICs cannot access projects belonging to another company.');
                }

                return $project;
            } else {
                $queryPic = clone $query;
                if ($user->companies_id) {
                    $project = $queryPic->where(function ($q) use ($user) {
                        $q->where('companies_id', $user->companies_id)
                          ->orWhere('project_manager', $user->id);
                    })->first();
                } else {
                    $project = $queryPic->where('project_manager', $user->id)->first();
                }

                return $project;
            }
        } elseif ($role === 'worker') {
            if ($id) {
                $project = $query->find($id);
                if (!$project) abort(404, 'Project not found');
                if ($project->companies_id != $user->companies_id) {
                    abort(403, 'Access Denied: Workers can only access projects belonging to their assigned company.');
                }
                
                $projectAccess = $user->permission_matrix['project_access'] ?? [];
                if (empty($projectAccess[$id]['view_project'])) {
                    abort(403, 'Access Denied: You do not have permission to view this project.');
                }
                
                return $project;
            } else {
                $projectAccess = $user->permission_matrix['project_access'] ?? [];
                $allowedIds = array_keys(array_filter($projectAccess, fn($access) => !empty($access['view_project'])));
                return $query->where('companies_id', $user->companies_id)->whereIn('id', $allowedIds)->first();
            }
        } else {
            // Admin Utama & Admin Progres can view any public project (SuperAdmin views all)
            if ($role !== 'SuperAdmin') {
                $query->where('is_private', false);
            }
            if ($id) {
                return $query->find($id);
            }
            // If no specific project id is requested, Admin Utama defaults to first available project
            if ($role === 'admin_utama') {
                return $query->first();
            }
            return null;
        }
    }

    /**
     * Transform DB project model into clean JSON structure expected by React frontend.
     */
    private function transformProjectData(Project $p, int|string|null $workerDivisionId = null)
    {
        $start   = $p->start;
        $end     = $p->end;
        $now     = Carbon::now();
        $hariKe  = $start ? $start->diffInDays($now, false) : 0;
        if ($hariKe < 0) $hariKe = 0;
        $sisaHari = $end ? $now->diffInDays($end, false) : 0;
        if ($sisaHari < 0) $sisaHari = 0;

        $mainJobs = $p->mainWbs->values()->map(function ($mj, $mjIdx) use ($workerDivisionId) {
            $mjCode = (string) ($mjIdx + 1);

            $subMainJobs = $mj->subWbs->values()->map(function ($smj, $smjIdx) use ($mjCode, $workerDivisionId) {
                $smjCode = $mjCode . '.' . ($smjIdx + 1);

                $tasksQuery = $smj->wbsTasks;
                if ($workerDivisionId) {
                    $tasksQuery = $tasksQuery->filter(function ($t) use ($workerDivisionId) {
                        return $t->divisions_id == $workerDivisionId;
                    });
                }

                $subtasks = $tasksQuery->values()->map(function ($st, $stIdx) use ($smjCode) {
                    return [
                        'id'          => $st->id,
                        'code'        => $smjCode . '.' . ($stIdx + 1),
                        'name'        => $st->name,
                        'duration'    => $st->start && $st->end ? $st->start->diffInDays($st->end) : 0,
                        'daysLeft'    => $st->end && Carbon::now()->lessThan($st->end) ? Carbon::now()->diffInDays($st->end) : 0,
                        'startDate'   => $st->start ? $st->start->format('Y-m-d') : '',
                        'finishDate'  => $st->end ? $st->end->format('Y-m-d') : '',
                        'progress'    => $st->progress > 0 ? (int)$st->progress : ($st->is_completed ? 100 : 0),
                        'status'      => $st->status ?? 'Open',
                        'predecessor' => $st->predecessor ?? '',
                        'depType'     => $st->dep_type ?? 'FS',
                        'lag'         => (int) ($st->lag ?? 0),
                        'lead'        => (int) ($st->lead ?? 0),
                        'dependencies'=> $st->predecessorDependencies ? $st->predecessorDependencies->map(function ($d) {
                            return [
                                'id'                 => $d->id,
                                'predecessor_wbs_id' => $d->predecessor_wbs_id,
                                'predecessor_name'   => $d->predecessor?->name ?? $d->predecessor_wbs_id,
                                'dependency_type'    => $d->dependency_type,
                                'lag_days'           => (int)$d->lag_days,
                            ];
                        })->values()->toArray() : [],
                        'weight'      => (float) ($st->weight ?? 0),
                        'checked'     => (bool) $st->is_completed,
                        'requiresEvidence' => (bool) $st->requires_evidence,
                        'division'    => $st->division?->divisi ?? 'General',
                        'evidences'   => $st->evidence_path ? (function() use ($st) {
                            $decoded = json_decode($st->evidence_path, true);
                            if (is_array($decoded)) {
                                $names = json_decode($st->evidence_name, true) ?? [];
                                return collect($decoded)->map(function($path, $idx) use ($names) {
                                    return [
                                        'name' => $names[$idx] ?? 'evidence-'.$idx,
                                        'previewUrl' => asset('storage/' . $path),
                                    ];
                                })->toArray();
                            } else {
                                return [[
                                    'name' => $st->evidence_name ?? 'Bukti',
                                    'previewUrl' => asset('storage/' . $st->evidence_path)
                                ]];
                            }
                        })() : [],
                    ];
                })->values()->toArray();

                return [
                    'id'         => 'smj-' . $smj->id,
                    'dbId'       => $smj->id,
                    'code'       => $smjCode,
                    'name'       => $smj->name ?? $smj->listName?->name ?? '',
                    'pic'        => $smj->wbsTasks->first()?->division?->divisi ?? 'General',
                    'startDate'  => $smj->start ? $smj->start->format('Y-m-d') : '',
                    'finishDate' => $smj->end ? $smj->end->format('Y-m-d') : '',
                    'progress'   => (int) $smj->progress,
                    'status'     => $smj->status ?? 'Open',
                    'weight'     => (float) $smj->weight,
                    'subtasks'   => $subtasks,
                ];
            });

            if ($workerDivisionId) {
                $subMainJobs = $subMainJobs->filter(function ($smj) {
                    return count($smj['subtasks']) > 0;
                });
            }

            return [
                'id'          => 'mj-' . $mj->id,
                'dbId'        => $mj->id,
                'code'        => $mjCode,
                'name'        => $mj->name ?? $mj->listName?->name ?? '',
                'weight'      => (float) $mj->percentage,
                'startDate'   => $mj->start ? $mj->start->format('Y-m-d') : ($mj->actual_start ? $mj->actual_start->format('Y-m-d') : ''),
                'finishDate'  => $mj->end ? $mj->end->format('Y-m-d') : ($mj->actual_end ? $mj->actual_end->format('Y-m-d') : ''),
                'progress'    => (int) $mj->progress,
                'status'      => $mj->status ?? 'Open',
                'subMainJobs' => $subMainJobs->values()->toArray(),
            ];
        });

        if ($workerDivisionId) {
            $mainJobs = $mainJobs->filter(function ($mj) {
                return count($mj['subMainJobs']) > 0;
            });
        }

        $budgetEntries = ($p->budgetEntries ?? collect())->map(function ($b) {
            return [
                'id'          => (string) $b->id,
                'tanggal'     => $b->tanggal ? $b->tanggal->format('Y-m-d') : '',
                'codeSubWbs'  => $b->code_sub_wbs ?? '—',
                'subTaskWbs'  => $b->sub_task_wbs ?? $b->nama_item,
                'kategori'    => $b->kategori,
                'lokasi'      => $b->lokasi ?? '',
                'namaItem'    => $b->nama_item,
                'spesifikasi' => $b->spesifikasi ?? '',
                'qty'         => (float) $b->qty,
                'satuan'      => $b->satuan,
                'hargaSatuan' => (float) $b->harga_satuan,
                'hargaTotal'  => (float) $b->harga_total,
                'referensi'   => $b->referensi ?? '',
                'keterangan'  => $b->keterangan ?? '',
            ];
        })->values()->toArray();

        $realizedBudget = array_sum(array_column($budgetEntries, 'hargaTotal'));
        $totalBudget = 45000000000;
        $usedBudget = $realizedBudget > 0 ? $realizedBudget : 0;

        $savedWeeklyActuals = ($p->weeklyProgress ?? collect())->mapWithKeys(function ($wp) {
            return [(int) $wp->week_number => (float) $wp->actual_progress];
        })->toArray();

        return [
            'id'                  => (string) $p->id,
            'name'                => $p->title,
            'company'             => $p->company?->name ?? '—',
            'projectManager'      => $p->manager?->username ?? $p->manager?->name ?? '—',
            'startDate'           => $p->start ? $p->start->format('Y-m-d') : '',
            'endDate'             => $p->end ? $p->end->format('Y-m-d') : '',
            'status'              => $p->status ?? 'Open',
            'overallProgress'     => (int) $p->progress,
            'hariKe'              => (int) $hariKe,
            'sisaHari'            => (int) $sisaHari,
            'totalBudget'         => $totalBudget,
            'usedBudget'          => $usedBudget,
            'weeklyData'          => [],
            'savedWeeklyActuals'  => $savedWeeklyActuals,
            'budgetEntries'       => $budgetEntries,
            'mainJobs'            => $mainJobs->values()->toArray(),
        ];
    }

    /**
     * Store a budget realization entry for a project.
     */
    public function storeBudgetEntry(Request $request, int|string $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Access Denied: You are not authorized to add budget realization entries.');
        }

        if ($role === 'pic' && !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: You are not the PIC of this project.');
        }

        $validated = $request->validate([
            'tanggal'       => 'required|date',
            'code_sub_wbs'  => 'nullable|string|max:50',
            'sub_task_wbs'  => 'nullable|string|max:255',
            'kategori'      => 'required|string|max:100',
            'lokasi'        => 'nullable|string|max:100',
            'nama_item'     => 'required|string|max:255',
            'spesifikasi'   => 'nullable|string|max:255',
            'qty'           => 'required|numeric|min:0.01',
            'satuan'        => 'required|string|max:50',
            'harga_satuan'  => 'required|numeric|min:0',
            'referensi'     => 'nullable|string|max:255',
            'keterangan'    => 'nullable|string',
        ]);

        $qty = (float) $validated['qty'];
        $hargaSatuan = (float) $validated['harga_satuan'];
        $hargaTotal = $qty * $hargaSatuan;

        BudgetEntry::create([
            'projects_id'  => $project->id,
            'tanggal'      => Carbon::parse($validated['tanggal']),
            'code_sub_wbs' => $validated['code_sub_wbs'] ?? null,
            'sub_task_wbs' => $validated['sub_task_wbs'] ?? $validated['nama_item'],
            'kategori'     => $validated['kategori'],
            'lokasi'       => $validated['lokasi'] ?? null,
            'nama_item'    => $validated['nama_item'],
            'spesifikasi'  => $validated['spesifikasi'] ?? null,
            'qty'          => $qty,
            'satuan'       => $validated['satuan'],
            'harga_satuan' => $hargaSatuan,
            'harga_total'  => $hargaTotal,
            'referensi'    => $validated['referensi'] ?? null,
            'keterangan'   => $validated['keterangan'] ?? null,
        ]);

        return back()->with('success', "Budget transaction for \"{$validated['nama_item']}\" was successfully saved.");
    }

    /**
     * Delete a budget realization entry.
     */
    public function deleteBudgetEntry(Request $request, int|string $projectId, int|string $entryId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Access Denied: You are not authorized to delete budget realization entries.');
        }

        if ($role === 'pic' && !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: You are not the PIC of this project.');
        }

        $entry = BudgetEntry::where('projects_id', $project->id)->where('id', $entryId)->firstOrFail();
        $itemName = $entry->nama_item;
        $entry->delete();

        return back()->with('success', "Transaction \"{$itemName}\" was successfully deleted.");
    }

    /**
     * Save/update weekly actual progress.
     */
    public function saveWeeklyProgress(Request $request, int|string $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Access Denied: You are not authorized to update weekly progress.');
        }

        if ($role === 'pic' && !$this->isPicAuthorizedForProject($user, $project)) {
            abort(403, 'Access Denied: You are not the PIC of this project.');
        }

        $validated = $request->validate([
            'week'   => 'required|integer|min:1',
            'actual' => 'required|numeric|min:0|max:100',
            'notes'  => 'nullable|string',
        ]);

        WeeklyProgress::updateOrCreate(
            [
                'projects_id' => $project->id,
                'week_number' => $validated['week'],
            ],
            [
                'actual_progress' => $validated['actual'],
                'notes'           => $validated['notes'] ?? null,
            ]
        );

        return back()->with('success', "Actual progress for W{$validated['week']} was successfully saved.");
    }

    /**
     * Division Progress page — shows progress per division based on tasks.
     */
    public function divisionProgress(Request $request, int|string|null $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projectlistpage');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projectlistpage');
        }

        // Retrieve all tasks for this project
        $tasks = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->with(['division', 'parentSubWbs.mainWbs'])->get();

        // Group by division
        $divisionGroups = [];
        foreach ($tasks as $task) {
            $divName = $task->division?->divisi ?? 'General';
            if (!isset($divisionGroups[$divName])) {
                $divisionGroups[$divName] = [
                    'division'    => $divName,
                    'division_id' => $task->divisions_id,
                    'total'       => 0,
                    'completed'   => 0,
                    'remaining'   => 0,
                    'percentage'  => 0,
                    'tasks'       => [],
                ];
            }

            $divisionGroups[$divName]['total']++;
            if ($task->is_completed) {
                $divisionGroups[$divName]['completed']++;
            } else {
                $divisionGroups[$divName]['remaining']++;
            }

            $divisionGroups[$divName]['tasks'][] = [
                'id'           => $task->id,
                'name'         => $task->name,
                'weight'       => (float) ($task->weight ?? 100),
                'is_completed' => (bool) $task->is_completed,
                'status'       => $task->status ?? ($task->is_completed ? 'Completed' : 'Open'),
                'subMainJob'   => $task->parentSubWbs?->name ?? '—',
                'mainJob'      => $task->parentSubWbs?->mainWbs?->name ?? '—',
                'start'        => $task->start ? $task->start->format('Y-m-d') : null,
                'end'          => $task->end ? $task->end->format('Y-m-d') : null,
            ];
        }

        foreach ($divisionGroups as &$group) {
            $group['percentage'] = $group['total'] > 0
                ? round(($group['completed'] / $group['total']) * 100)
                : 0;
        }
        unset($group);

        // Sort divisions alphabetically
        ksort($divisionGroups);

        // If user is a worker (division account), filter to ONLY their division
        if ($role === 'worker') {
            $userDivName = strtolower(trim($user->division?->divisi ?? ''));
            $userDivId   = $user->divisions_id;
            if ($userDivName !== '' || $userDivId) {
                $divisionGroups = array_filter($divisionGroups, function ($g) use ($userDivName, $userDivId) {
                    return ($userDivName !== '' && strtolower(trim($g['division'])) === $userDivName)
                        || ($userDivId && isset($g['division_id']) && $g['division_id'] == $userDivId);
                });
            }
        }

        return Inertia::render('DivisionProgressPage', [
            'project'        => $this->transformProjectData($project),
            'divisionGroups' => array_values($divisionGroups),
            'userRole'       => $role,
            'userDivision'   => $user->division?->divisi ?? null,
        ]);
    }

    public function togglePrivate(Request $request, $id)
    {
        $project = Project::findOrFail($id);
        
        $user = auth()->user();
        if ($user->role->name !== 'pic' && $user->role->name !== 'SuperAdmin') {
            abort(403);
        }

        if ($user->role->name === 'pic') {
            $features = collect($user->permission_matrix['features']['projects'] ?? [])->map(fn($f) => strtolower($f));
            if (!$features->contains('private projects') && !$features->contains('private_projects')) {
                abort(403);
            }
            if (!$this->isPicAuthorizedForProject($user, $project)) {
                abort(403);
            }
        }

        $project->update([
            'is_private' => !$project->is_private,
        ]);

        return redirect()->back();
    }

    /**
     * SuperAdmin: delete any project (including private).
     */
    public function superAdminDestroy($id)
    {
        $user = Auth::user();
        if ($user->role->name !== 'SuperAdmin') {
            abort(403);
        }
        $project = Project::findOrFail($id);
        $project->delete();
        return redirect('/admin/projects')->with('success', 'Project deleted successfully.');
    }
}
