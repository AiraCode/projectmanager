<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\User;
use Carbon\Carbon;
use Inertia\Inertia;
use Illuminate\Http\Request;

class SuperAdminController extends Controller
{
    public function dashboard()
    {
        $stats = [
            'total_users'     => User::count(),
            'total_companies' => Company::count(),
            'total_projects'  => Project::count(),
            'total_admins'    => User::whereHas('role', fn($q) => $q->whereIn('name', ['SuperAdmin', 'admin_utama']))->count(),
            'total_pics'      => User::whereHas('role', fn($q) => $q->where('name', 'pic'))->count(),
            'total_workers'   => User::whereHas('role', fn($q) => $q->where('name', 'worker'))->count(),
        ];

        $recentUsers = User::with(['role', 'company', 'creator'])
            ->latest()
            ->limit(8)
            ->get()
            ->map(fn($u) => [
                'id'         => $u->id,
                'username'   => $u->username,
                'email'      => $u->email,
                'role'       => $u->role?->name,
                'company'    => $u->company?->name,
                'created_by' => $u->creator?->username ?? 'System',
                'created_at' => $u->created_at?->diffForHumans(),
            ]);

        $recentAuditLogs = AuditLog::with('user')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn($log) => [
                'id'          => $log->id,
                'actor'       => $log->metadata['actor'] ?? ($log->user?->username ?? 'System'),
                'action'      => $log->action,
                'description' => $log->description,
                'ip_address'  => $log->ip_address,
                'created_at'  => $log->created_at?->timezone('Asia/Jakarta')->diffForHumans(),
            ]);

        return Inertia::render('SuperAdmin/DashboardPage', [
            'stats'           => $stats,
            'recentUsers'     => $recentUsers,
            'recentAuditLogs' => $recentAuditLogs,
        ]);
    }

    public function auditLog(Request $request)
    {
        $query = AuditLog::with('user')->latest();

        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        if ($request->filled('actor')) {
            $actor = $request->actor;
            $query->where(function ($q) use ($actor) {
                if ($actor === 'System') {
                    $q->where(function ($sq) {
                        $sq->whereNull('user_id')
                           ->where(function ($sub) {
                               $sub->whereNull('metadata')
                                   ->orWhere('metadata', 'not like', '%"actor"%');
                           });
                    })
                    ->orWhere('metadata', 'like', '%"actor":"System"%')
                    ->orWhere('metadata', 'like', '%"actor": "System"%');
                } else {
                    $q->where(function ($sq) use ($actor) {
                        $sq->where('metadata', 'like', '%"actor":"' . $actor . '"%')
                           ->orWhere('metadata', 'like', '%"actor": "' . $actor . '"%');
                    })
                    ->orWhereHas('user', function ($uq) use ($actor) {
                        $uq->where('username', $actor);
                    });
                }
            });
        }

        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }

        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('ip_address', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('metadata', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('username', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        $logs = $query->paginate(25)->withQueryString()->through(fn($log) => [
            'id'          => $log->id,
            'actor'       => $log->metadata['actor'] ?? ($log->user?->username ?? 'System'),
            'actor_email' => $log->user?->email,
            'action'      => $log->action,
            'description' => $log->description,
            'ip_address'  => $log->ip_address,
            'metadata'    => $log->metadata,
            'created_at'  => $log->created_at?->timezone('Asia/Jakarta')->format('d M Y, H:i:s'),
        ]);

        $actionTypes = AuditLog::select('action')->distinct()->pluck('action');

        $actors = AuditLog::with('user')
            ->latest()
            ->take(500)
            ->get()
            ->map(fn($l) => $l->metadata['actor'] ?? ($l->user?->username ?? 'System'))
            ->filter()
            ->unique()
            ->sort()
            ->values();

        return Inertia::render('SuperAdmin/AuditLogPage', [
            'logs'        => $logs,
            'actionTypes' => $actionTypes,
            'actors'      => $actors,
            'filters'     => $request->only(['action', 'search', 'actor', 'start_date', 'end_date']),
        ]);
    }

    public function userManagement(Request $request)
    {
        $users = User::with(['role', 'company', 'companies', 'division', 'divisions', 'creator'])
            ->latest()
            ->get()
            ->map(fn($u) => [
                'id'          => $u->id,
                'username'    => $u->username,
                'email'       => $u->email,
                'role'        => $u->role?->name,
                'company'     => $u->company?->name,
                'companies_id'=> $u->companies_id,
                'company_ids' => $u->getCompanyIds(),
                'companies'   => $u->companies->map(fn($c) => ['id' => $c->id, 'name' => $c->name])->values(),
                'divisions_id'=> $u->divisions_id,
                'division_ids'=> $u->getDivisionIds(),
                'divisions'   => $u->divisions->map(fn($d) => ['id' => $d->id, 'name' => $d->divisi])->values(),
                'division'    => $u->division?->divisi,
                'created_by'  => $u->creator?->username ?? 'System',
                'is_standalone' => $u->is_standalone,
                'is_ai_beta_tester' => (bool) $u->is_ai_beta_tester,
                'permission_matrix' => $u->permission_matrix,
                'created_at'  => $u->created_at?->diffForHumans(),
            ]);

        $companies  = Company::select('id', 'name')->get();
        $divisions  = \App\Models\Division::select('id', 'divisi')->get();
        $roles      = \App\Models\Role::select('id', 'name')->get();
        $projects   = Project::select('id', 'title', 'companies_id')->get();

        return Inertia::render('SuperAdmin/UserManagementPage', [
            'users'     => $users,
            'companies' => $companies,
            'divisions' => $divisions,
            'roles'     => $roles,
            'projects'  => $projects,
        ]);
    }

    public function companiesPage()
    {
        $companies = \App\Models\Company::withCount(['projects', 'users'])
            ->latest()
            ->get()
            ->map(fn($c) => [
                'id'             => $c->id,
                'name'           => $c->name,
                'projects_count' => $c->projects_count,
                'users_count'    => $c->users_count,
                'created_at'     => $c->created_at?->format('d M Y'),
            ]);

        return Inertia::render('SuperAdmin/CompaniesPage', [
            'companies' => $companies,
        ]);
    }

    public function allProjectsPage()
    {
        $projects = Project::with(['company', 'manager'])
            ->latest()
            ->get()
            ->map(fn($p) => [
                'id'         => $p->id,
                'title'      => $p->title,
                'company'    => $p->company?->name,
                'is_private' => (bool) $p->is_private,
                'status'     => $p->status ?? 'Open',
                'progress'   => $p->progress ?? 0,
                'start_date' => $p->start?->format('Y-m-d'),
                'end_date'   => $p->end?->format('Y-m-d'),
                'created_by' => $p->manager?->username ?? 'System',
                'created_at' => $p->created_at?->format('d M Y'),
            ]);

        return Inertia::render('SuperAdmin/AllProjectsPage', [
            'projects' => $projects,
        ]);
    }

    /**
     * SuperAdmin: Update overall project schedule and duration (start date & target finish date).
     * Strictly restricted to role SuperAdmin.
     */
    public function updateProjectDates(Request $request, int|string $id)
    {
        $user = $request->user();
        if (!$user || ($user->role?->name ?? '') !== 'SuperAdmin') {
            abort(403, 'Access Denied: Only SuperAdmin can modify project schedule and duration.');
        }

        $validated = $request->validate([
            'start' => 'required|date',
            'end'   => 'required|date',
        ]);

        $project = Project::findOrFail($id);

        $newStart = Carbon::parse($validated['start'])->startOfDay();
        $newEnd   = Carbon::parse($validated['end'])->startOfDay();

        if ($newEnd->lte($newStart)) {
            return back()->withErrors(['end' => 'Target Finish Date must be after Start Date (at least 1 day later).']);
        }

        // Validate that new dates do not violate existing task boundaries
        $earliestTaskStart = null;
        $latestTaskEnd = null;

        $mainTasks = MainWbs::where('projects_id', $project->id)->get();
        foreach ($mainTasks as $m) {
            if ($m->start) {
                $mStart = Carbon::parse($m->start)->startOfDay();
                if (!$earliestTaskStart || $mStart->lt($earliestTaskStart)) {
                    $earliestTaskStart = $mStart;
                }
            }
            if ($m->end) {
                $mEnd = Carbon::parse($m->end)->startOfDay();
                if (!$latestTaskEnd || $mEnd->gt($latestTaskEnd)) {
                    $latestTaskEnd = $mEnd;
                }
            }
        }

        if ($earliestTaskStart && $newStart->gt($earliestTaskStart)) {
            return back()->withErrors([
                'start' => "Project Start Date ({$newStart->format('d/m/Y')}) cannot be later than existing task start date ({$earliestTaskStart->format('d/m/Y')}).",
            ]);
        }

        if ($latestTaskEnd && $newEnd->lt($latestTaskEnd)) {
            return back()->withErrors([
                'end' => "Project Target Finish Date ({$newEnd->format('d/m/Y')}) cannot be earlier than existing task finish date ({$latestTaskEnd->format('d/m/Y')}).",
            ]);
        }

        $oldStartStr = $project->start ? Carbon::parse($project->start)->format('d/m/Y') : '—';
        $oldEndStr   = $project->end ? Carbon::parse($project->end)->format('d/m/Y') : '—';

        $project->start = $newStart;
        $project->end   = $newEnd;
        $project->save();

        AuditLog::record(
            'UPDATE_PROJECT_DATES',
            "SuperAdmin {$user->username} updated project schedule for '{$project->title}' (ID #{$project->id}): Start {$oldStartStr} -> {$newStart->format('d/m/Y')}, Finish {$oldEndStr} -> {$newEnd->format('d/m/Y')}.",
            $user->id,
            $request->ip(),
            [
                'project_id' => $project->id,
                'old_start'  => $oldStartStr,
                'old_end'    => $oldEndStr,
                'new_start'  => $newStart->format('Y-m-d'),
                'new_end'    => $newEnd->format('Y-m-d'),
            ]
        );

        app(\App\Services\ProgressService::class)->recalculateProjectProgress($project->id);

        return back()->with('success', "Project schedule for '{$project->title}' successfully updated to {$newStart->format('d/m/Y')} - {$newEnd->format('d/m/Y')}.");
    }
    public function divisionsPage()
    {
        $divisions = \App\Models\Division::withCount(['users'])
            ->latest()
            ->get()
            ->map(fn($d) => [
                'id'          => $d->id,
                'divisi'      => $d->divisi,
                'users_count' => $d->users_count,
                'created_at'  => $d->created_at?->format('d M Y'),
            ]);

        return Inertia::render('SuperAdmin/DivisionsPage', [
            'divisions' => $divisions,
        ]);
    }
}
