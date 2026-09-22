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
            return Inertia::render('ProjectsListPage', [
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

        return Inertia::render('ProjectsListPage', [
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
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
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
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
        }

        return Inertia::render('ProjectDetailPage', [
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
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            // No project found — redirect appropriately instead of 404
            return redirect()->route('projects.index');
        }

        $divisions = Division::select('id', 'divisi')->get();
        $workerDivisionId = ($role === 'worker') ? $user->divisions_id : null;
        
        $availableProjects = [];
        if ($role === 'worker') {
            $availableProjects = Project::where('companies_id', $user->companies_id)->select('id', 'title')->get();
        }

        return Inertia::render('TasksPage', [
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
    public function timeline(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
        }

        $project = $this->resolveProjectForUser($targetId);
        if (!$project) {
            return redirect()->route('projects.index');
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
    public function weekly(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';
        $targetId = $id ?? $request->query('project_id');

        if ($role === 'admin_progres') {
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
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
            if ($targetId) return redirect()->route('scurve', ['project_id' => $targetId]);
            return redirect()->route('projects.index');
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
            // Admin Progres has no specific project selected — send back to project list
            return redirect()->route('projects.index');
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
     * Add Main Task (Main Job / Main WBS) to a Project.
     * PIC only!
     */
    public function addMainWbs(Request $request, $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menambah Main Task.');
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
            'actual_start'           => $start,
            'actual_end'             => $end,
            'progress'               => 0,
            'status'                 => 'Open',
        ]);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task berhasil ditambahkan.');
    }

    /**
     * Update Main Task (Main WBS).
     * PIC only!
     */
    public function updateMainWbs(Request $request, $projectId, $mainWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat mengubah Main Task.');
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
            $mainWbs->actual_start = Carbon::parse($validated['start']);
        }
        if (!empty($validated['end'])) {
            $mainWbs->actual_end = Carbon::parse($validated['end']);
        }
        $mainWbs->save();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task berhasil diperbarui.');
    }

    /**
     * Delete Main Task (Main WBS) and its descendants.
     * PIC only!
     */
    public function deleteMainWbs(Request $request, $projectId, $mainWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menghapus Main Task.');
        }

        $mainWbs = MainWbs::where('projects_id', $project->id)->where('id', $mainWbsId)->firstOrFail();

        // Delete all SubWbs and Wbs tasks under this MainWbs
        foreach ($mainWbs->subWbs as $subWbs) {
            $subWbs->wbsTasks()->delete();
            $subWbs->delete();
        }
        $mainWbs->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Main Task berhasil dihapus.');
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

        if ($request->has('main_wbs_id')) {
            $rawMain = $request->input('main_wbs_id');
            $cleanMainId = is_string($rawMain) ? (int) str_replace('mj-', '', $rawMain) : (int) $rawMain;
            $request->merge(['main_wbs_id' => $cleanMainId]);
        }

        $validated = $request->validate([
            'main_wbs_id' => 'required|exists:main_wbs,id',
            'name'        => 'required|string|max:255',
            'weight'      => 'nullable|numeric|min:0|max:100',
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
     * Update Sub Task (Sub Main WBS).
     * PIC only!
     */
    public function updateSubWbs(Request $request, $projectId, $subWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat mengubah Sub Task.');
        }

        $subWbs = SubWbs::whereHas('mainWbs', function($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $validated = $request->validate([
            'name'   => 'required|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:100',
            'start'  => 'nullable|date',
            'end'    => 'nullable|date',
        ]);

        $subWbs->name = $validated['name'];
        if (isset($validated['weight'])) {
            $subWbs->weight = $validated['weight'];
        }
        if (!empty($validated['start'])) {
            $subWbs->start = Carbon::parse($validated['start']);
            $subWbs->actual_start = $subWbs->start;
        }
        if (!empty($validated['end'])) {
            $subWbs->end = Carbon::parse($validated['end']);
            $subWbs->actual_end = $subWbs->end;
        }
        $subWbs->save();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Sub Task berhasil diperbarui.');
    }

    /**
     * Delete Sub Task (Sub Main WBS) and its tasks.
     * PIC only!
     */
    public function deleteSubWbs(Request $request, $projectId, $subWbsId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menghapus Sub Task.');
        }

        $subWbs = SubWbs::whereHas('mainWbs', function($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $subWbsId)->firstOrFail();

        $subWbs->wbsTasks()->delete();
        $subWbs->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Sub Task berhasil dihapus.');
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

        if ($request->has('sub_wbs_id')) {
            $rawSub = $request->input('sub_wbs_id');
            $cleanSubId = is_string($rawSub) ? (int) str_replace('smj-', '', $rawSub) : (int) $rawSub;
            $request->merge(['sub_wbs_id' => $cleanSubId]);
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
            'predecessor'  => $validated['predecessor'] ?? null,
        ]);

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task berhasil ditambahkan.');
    }

    /**
     * Update Task (Sub-Subtask).
     * PIC only!
     */
    public function updateTask(Request $request, $projectId, $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat mengubah Task.');
        }

        $task = Wbs::whereHas('parentSubWbs.mainWbs', function($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $taskId)->firstOrFail();

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'divisions_id' => 'nullable|exists:divisions,id',
            'duration'     => 'nullable|integer|min:0',
            'start'        => 'nullable|date',
            'end'          => 'nullable|date',
            'predecessor'  => 'nullable|string|max:50',
            'dep_type'     => 'nullable|string|in:FS,SS,FF,SF',
            'lag'          => 'nullable|integer',
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
        if (isset($validated['predecessor'])) {
            $task->predecessor = $validated['predecessor'];
        }
        $task->save();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task berhasil diperbarui.');
    }

    /**
     * Delete Task (Sub-Subtask).
     * PIC only!
     */
    public function deleteTask(Request $request, $projectId, $taskId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);
        if ($role !== 'pic' || $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Hanya PIC project ini yang dapat menghapus Task.');
        }

        $task = Wbs::whereHas('parentSubWbs.mainWbs', function($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->where('id', $taskId)->firstOrFail();

        $task->delete();

        app(ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', 'Task berhasil dihapus.');
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
            'mainWbs.subWbs.wbsTasks.division',
            'budgetEntries',
            'weeklyProgress',
        ]);

        if ($role === 'pic') {
            if ($id) {
                $project = $query->find($id);
                if (!$project) abort(404, 'Project not found');
                if ($project->project_manager != $user->id || ($user->companies_id && $project->companies_id != $user->companies_id)) {
                    abort(403, 'Akses Ditolak: PIC tidak dapat membuka project milik perusahaan lain.');
                }
                if ($project->mainWbs->count() === 0) {
                    app(ProjectTemplateService::class)->applyTemplateToProject($project);
                    $project = $query->find($id);
                }
                return $project;
            } else {
                $project = $query->where('project_manager', $user->id)->first();
                if ($project && $project->mainWbs->count() === 0) {
                    app(ProjectTemplateService::class)->applyTemplateToProject($project);
                    $project = $query->where('project_manager', $user->id)->first();
                }
                return $project;
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
    private function transformProjectData($p, $workerDivisionId = null)
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
                        'progress'    => $st->is_completed ? 100 : 0,
                        'status'      => $st->status ?? 'Open',
                        'predecessor' => $st->predecessor ?? '',
                        'depType'     => 'FS',
                        'weight'      => 0,
                        'checked'     => (bool) $st->is_completed,
                        'division'    => $st->division?->divisi ?? 'General',
                    ];
                })->values()->toArray();

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
                'name'        => $mj->listName?->name ?? $mj->name ?? '',
                'weight'      => (float) $mj->percentage,
                'startDate'   => $mj->actual_start ? $mj->actual_start->format('Y-m-d') : '',
                'finishDate'  => $mj->actual_end ? $mj->actual_end->format('Y-m-d') : '',
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
    public function storeBudgetEntry(Request $request, $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Akses Ditolak: Anda tidak berwenang menambahkan realisasi anggaran.');
        }

        if ($role === 'pic' && $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Anda bukan PIC dari project ini.');
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

        return back()->with('success', "Transaksi budget untuk \"{$validated['nama_item']}\" berhasil disimpan.");
    }

    /**
     * Delete a budget realization entry.
     */
    public function deleteBudgetEntry(Request $request, $projectId, $entryId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Akses Ditolak: Anda tidak berwenang menghapus realisasi anggaran.');
        }

        if ($role === 'pic' && $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Anda bukan PIC dari project ini.');
        }

        $entry = BudgetEntry::where('projects_id', $project->id)->where('id', $entryId)->firstOrFail();
        $itemName = $entry->nama_item;
        $entry->delete();

        return back()->with('success', "Transaksi \"{$itemName}\" berhasil dihapus.");
    }

    /**
     * Save/update weekly actual progress.
     */
    public function saveWeeklyProgress(Request $request, $projectId)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $project = Project::findOrFail($projectId);

        if ($role === 'worker' || $role === 'admin_progres') {
            abort(403, 'Akses Ditolak: Anda tidak berwenang memperbarui progres mingguan.');
        }

        if ($role === 'pic' && $project->project_manager != $user->id) {
            abort(403, 'Akses Ditolak: Anda bukan PIC dari project ini.');
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

        return back()->with('success', "Actual progress untuk W{$validated['week']} berhasil disimpan.");
    }
}
