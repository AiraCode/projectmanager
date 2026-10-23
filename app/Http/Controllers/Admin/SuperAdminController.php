<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Project;
use App\Models\User;
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

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('ip_address', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('metadata->actor', 'like', "%{$search}%")
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

        return Inertia::render('SuperAdmin/AuditLogPage', [
            'logs'        => $logs,
            'actionTypes' => $actionTypes,
            'filters'     => $request->only(['action', 'search']),
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
