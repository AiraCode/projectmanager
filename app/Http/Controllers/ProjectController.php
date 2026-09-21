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
use App\Services\ProgressService;
use App\Services\ProjectTemplateService;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class ProjectController extends Controller
{
    /**
     * Project card selector — shown to Admin Utama & Admin Progres.
     * PIC is redirected directly to their project dashboard (or creation page if none).
     * Worker is redirected directly to their company's tasks.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role === 'worker') {
            return redirect()->route('tasks.index');
        }

        if ($role === 'pic') {
            $project = Project::where('project_manager', $user->id)->first();
            if ($project) {
                return redirect()->route('projects.show', $project->id);
            }
            // PIC has no project yet (e.g. pic4): let them create one!
            $companies = Company::select('id', 'name')->get();
            return Inertia::render('ProjectsPage', [
                'projects'  => [],
                'canCreate' => true,
                'companies' => $companies,
                'userRole'  => $role,
            ]);
        }

        // Admin Utama & Admin Progres: show all projects as cards
        $projects = Project::with(['manager', 'company'])->get()->map(function ($p) {
            return [
                'id'          => $p->id,
                'name'        => $p->title,
                'company'     => $p->company?->name ?? '—',
                'manager'     => $p->manager?->username ?? $p->manager?->name ?? '—',
                'status'      => $p->status ?? 'Open',
                'progress'    => (int) ($p->progress ?? 0),
                'start_date'  => $p->start ? $p->start->format('Y-m-d') : null,
                'end_date'    => $p->end ? $p->end->format('Y-m-d') : null,
            ];
        });

        return Inertia::render('ProjectsPage', [
            'projects'  => $projects,
            'canCreate' => false, // Admin Utama and Admin Progres CANNOT create project!
            'userRole'  => $role,
        ]);
    }

    /**
     * Single project dashboard.
     */
    public function dashboard(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
        }

        return Inertia::render('DashboardPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Project detail breakdown (17 Main Jobs breakdown).
     */
    public function projectPage(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
        }

        return Inertia::render('ProjectPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Tasks page — scoped by role and company.
     */
    public function tasks(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            if ($role === 'pic') return redirect()->route('projects.index');
            abort(404, 'Project tidak ditemukan.');
        }

        $divisions = Division::select('id', 'divisi')->get();

        return Inertia::render('TasksPage', [
            'project'   => $this->transformProjectData($project),
            'userRole'  => $role,
            'division'  => $user->division?->divisi ?? null,
            'divisions' => $divisions,
        ]);
    }

    /**
     * Timeline / Gantt chart view.
     */
    public function timeline(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
        }

        return Inertia::render('TimelinePage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Weekly implementation view.
     */
    public function weekly(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
        }

        return Inertia::render('WeeklyPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Budget tracking view.
     */
    public function budget(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            return redirect()->route('scurve', ['project_id' => $targetId]);
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
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
    public function scurve(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            abort(404, 'Project tidak ditemukan.');
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
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role !== 'pic') {
            abort(403, 'Akses Ditolak: Hanya PIC yang dapat membuat project baru. Admin tidak berhak membuat project.');
        }

        // 1 PIC can only manage 1 Project
        if (Project::where('project_manager', $user->id)->exists()) {
            return back()->withErrors(['title' => 'Anda sudah memiliki project yang terdaftar.']);
        }

        $validated = $request->validate([
            'title'        => 'required|string|max:100',
            'company_id'   => 'nullable|exists:companies,id',
            'company_name' => 'nullable|string|max:100',
            'start'        => 'required|date',
            'end'          => 'required|date|after_or_equal:start',
        ]);

        // Assign company to PIC if not yet set
        if (!$user->companies_id) {
            if (!empty($validated['company_id'])) {
                $user->companies_id = $validated['company_id'];
            } elseif (!empty($validated['company_name'])) {
                $company = Company::firstOrCreate(['name' => trim($validated['company_name'])]);
                $user->companies_id = $company->id;
            } else {
                return back()->withErrors(['company_id' => 'Perusahaan wajib dipilih atau diisi.']);
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
        ]);

        // Automatically initialize standard 17 Main Jobs WBS template for new project
        app(ProjectTemplateService::class)->applyTemplateToProject($project);

        return redirect()->route('projects.show', $project->id);
    }

    /**
     * Add Sub Task (Sub Main Job) under a Main WBS.
     * PIC only!
     */
    public function addSubWbs(Request $request, $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menambah Sub Task.');
        }

        $validated = $request->validate([
            'main_wbs_id' => 'required|exists:main_wbs,id',
            'name'        => 'required|string|max:255',
            'weight'      => 'nullable|numeric|min:0|max:100',
        ]);

        $mainWbs = MainWbs::findOrFail($validated['main_wbs_id']);
        $listSub = ListSubWbsName::create([
            'name'                         => $validated['name'],
            'list_main_wbs_names_copy1_id' => $mainWbs->list_main_wbs_names_id,
        ]);

        SubWbs::create([
            'sub_wbs_id'             => $mainWbs->id,
            'list_sub_wbs_names_id'  => $listSub->id,
            'name'                   => $validated['name'],
            'predecessor'            => '-',
            'predecessor_type'       => 'FS',
            'start'                  => $mainWbs->actual_start ?? Carbon::now(),
            'end'                    => $mainWbs->actual_end ?? Carbon::now()->addMonths(1),
            'actual_start'           => $mainWbs->actual_start ?? Carbon::now(),
            'actual_end'             => $mainWbs->actual_end ?? Carbon::now()->addMonths(1),
            'progress'               => 0,
            'status'                 => 'Open',
            'weight'                 => $validated['weight'] ?? 5,
        ]);

        return back()->with('success', 'Sub Task berhasil ditambahkan.');
    }

    /**
     * Add Task (Sub-Subtask) under a Sub WBS.
     * PIC only!
     */
    public function addTask(Request $request, $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menambah Task.');
        }

        $validated = $request->validate([
            'sub_wbs_id'   => 'required|exists:sub_wbs,id',
            'name'         => 'required|string|max:255',
            'divisions_id' => 'nullable|exists:divisions,id',
            'duration'     => 'nullable|integer|min:0',
            'start'        => 'nullable|date',
            'end'          => 'nullable|date',
            'predecessor'  => 'nullable|string|max:50',
            'dep_type'     => 'nullable|string|in:FS,SS,FF,SF',
            'lag'          => 'nullable|integer',
        ]);

        $subWbs = SubWbs::findOrFail($validated['sub_wbs_id']);

        $startDate = !empty($validated['start']) ? Carbon::parse($validated['start']) : ($subWbs->start ?? Carbon::now());
        $duration  = (int) ($validated['duration'] ?? 1);
        $endDate   = !empty($validated['end']) ? Carbon::parse($validated['end']) : $startDate->copy()->addDays($duration);

        $divisionId = $validated['divisions_id'] ?? $user->divisions_id ?? Division::first()?->id;

        Wbs::create([
            'id'           => 'st-' . uniqid(),
            'sub_wbs_id'   => $subWbs->id,
            'divisions_id' => $divisionId,
            'name'         => $validated['name'],
            'vendor'       => 'INTERNAL',
            'start'        => $startDate,
            'end'          => $endDate,
            'is_completed' => false,
            'status'       => 'Open',
        ]);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task berhasil ditambahkan.');
    }

    /**
     * Toggle Task completion status.
     * Rules:
     * - Admin Utama & Admin Progres: 403 Forbidden (Read-only)
     * - Worker: can ONLY toggle tasks for their own company and their own division
     * - PIC: can toggle tasks in their own project
     */
    public function toggleTask(Request $request, $projectId, $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role === 'admin_utama' || $role === 'admin_progres') {
            abort(403, 'Akses Ditolak: Admin hanya dapat melihat (read-only) dan tidak boleh mengubah status tugas.');
        }

        $task = Wbs::with('parentSubWbs.mainWbs.project')->where('id', $taskId)->firstOrFail();
        $project = $task->parentSubWbs?->mainWbs?->project;

        if (!$project || $project->id != $projectId) {
            abort(404, 'Task tidak sesuai dengan project.');
        }

        if ($role === 'worker') {
            if ($project->companies_id != $user->companies_id) {
                abort(403, 'Akses Ditolak: Pekerja hanya dapat mengubah tugas di perusahaan tempat Anda bekerja.');
            }
            if ($user->divisions_id && $task->divisions_id != $user->divisions_id) {
                abort(403, 'Akses Ditolak: Anda hanya berwenang mencentang tugas divisi Anda sendiri.');
            }
        } elseif ($role === 'pic') {
            if ($project->project_manager != $user->id) {
                abort(403, 'Akses Ditolak: Anda bukan PIC dari project ini.');
            }
        }

        $task->is_completed = !$task->is_completed;
        $task->status = $task->is_completed ? 'Completed' : 'Open';
        $task->save();

        app(ProgressService::class)->recalculateProjectProgress($projectId);

        return back()->with('success', 'Status tugas berhasil diperbarui.');
    }

    /**
     * Helper to resolve project for user based on strict multi-tenant and role rules.
     */
    private function resolveProjectForUser($id = null)
    {
        $user = Auth::user();
        if (!$user) return null;
        $role = $user->role->name ?? '';

        $query = Project::with([
            'manager', 
            'company', 
            'mainWbs.listName', 
            'mainWbs.subWbs.listName', 
            'mainWbs.subWbs.wbsTasks.division'
        ]);

        if ($role === 'pic') {
            if ($id) {
                $project = $query->find($id);
                if (!$project) abort(404, 'Project not found');
                if ($project->project_manager != $user->id || ($user->companies_id && $project->companies_id != $user->companies_id)) {
                    abort(403, 'Akses Ditolak: PIC tidak dapat membuka project milik perusahaan lain.');
                }
                return $project;
            } else {
                return $query->where('project_manager', $user->id)->first();
            }
        } elseif ($role === 'worker') {
            if ($id) {
                $project = $query->find($id);
                if (!$project) abort(404, 'Project not found');
                if ($project->companies_id != $user->companies_id) {
                    abort(403, 'Akses Ditolak: Pekerja hanya dapat mengakses project milik perusahaan tempat Anda bekerja.');
                }
                return $project;
            } else {
                return $query->where('companies_id', $user->companies_id)->first();
            }
        } else {
            // Admin Utama & Admin Progres can view any project
            return $id ? $query->find($id) : $query->first();
        }
    }

    /**
     * Transform DB project model into clean JSON structure expected by React frontend.
     */
    private function transformProjectData($p)
    {
        $start   = $p->start;
        $end     = $p->end;
        $now     = Carbon::now();
        $hariKe  = $start ? $start->diffInDays($now, false) : 0;
        if ($hariKe < 0) $hariKe = 0;
        $sisaHari = $end ? $now->diffInDays($end, false) : 0;
        if ($sisaHari < 0) $sisaHari = 0;

        return [
            'id'              => (string) $p->id,
            'name'            => $p->title,
            'company'         => $p->company?->name ?? '—',
            'projectManager'  => $p->manager?->username ?? $p->manager?->name ?? '—',
            'startDate'       => $p->start ? $p->start->format('Y-m-d') : '',
            'endDate'         => $p->end ? $p->end->format('Y-m-d') : '',
            'status'          => $p->status ?? 'Open',
            'overallProgress' => (int) $p->progress,
            'hariKe'          => (int) $hariKe,
            'sisaHari'        => (int) $sisaHari,
            'totalBudget'     => 45000000000,
            'usedBudget'      => 34560000000,
            'weeklyData'      => [],
            'budgetEntries'   => [],
            'mainJobs'        => $p->mainWbs->values()->map(function ($mj, $mjIdx) {
                $mjCode = (string) ($mjIdx + 1);
                return [
                    'id'          => 'mj-' . $mj->id,
                    'dbId'        => $mj->id,
                    'code'        => $mjCode,
                    'name'        => $mj->listName?->name ?? $mj->name ?? '',
                    'weight'      => (float) $mj->percentage,
                    'startDate'   => $mj->actual_start ? $mj->actual_start->format('Y-m-d') : '',
                    'finishDate'  => $mj->actual_end ? $mj->actual_end->format('Y-m-d') : '',
                    'progress'    => (int) $mj->progress,
                    'status'      => $mj->status ?? 'Open',
                    'subMainJobs' => $mj->subWbs->values()->map(function ($smj, $smjIdx) use ($mjCode) {
                        $smjCode = $mjCode . '.' . ($smjIdx + 1);
                        return [
                            'id'         => 'smj-' . $smj->id,
                            'dbId'       => $smj->id,
                            'code'       => $smjCode,
                            'name'       => $smj->listName?->name ?? $smj->name ?? '',
                            'pic'        => $smj->wbsTasks->first()?->division?->divisi ?? 'General',
                            'startDate'  => $smj->start ? $smj->start->format('Y-m-d') : '',
                            'finishDate' => $smj->end ? $smj->end->format('Y-m-d') : '',
                            'progress'   => (int) $smj->progress,
                            'status'     => $smj->status ?? 'Open',
                            'weight'     => (float) $smj->weight,
                            'subtasks'   => $smj->wbsTasks->values()->map(function ($st, $stIdx) use ($smjCode) {
                                return [
                                    'id'          => $st->id,
                                    'code'        => $smjCode . '.' . ($stIdx + 1),
                                    'name'        => $st->name,
                                    'duration'    => $st->start && $st->end ? $st->start->diffInDays($st->end) : 0,
                                    'daysLeft'    => $st->end && Carbon::now()->lessThan($st->end) ? Carbon::now()->diffInDays($st->end) : 0,
                                    'startDate'   => $st->start ? $st->start->format('Y-m-d') : '',
                                    'finishDate'  => $st->end ? $st->end->format('Y-m-d') : '',
                                    'progress'    => $st->is_completed ? 100 : 0,
                                    'status'      => $st->status ?? 'Open',
                                    'predecessor' => $st->predecessor ?? '-',
                                    'depType'     => $st->predecessor_type ?? 'FS',
                                    'weight'      => 0,
                                    'checked'     => (bool) $st->is_completed,
                                    'division'    => $st->division?->divisi ?? 'General',
                                ];
                            })->values()->toArray(),
                        ];
                    })->values()->toArray(),
                ];
            })->values()->toArray(),
        ];
    }
}
