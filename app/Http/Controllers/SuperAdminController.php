<?php

namespace App\Http\Controllers;

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
                'actor'       => $log->user?->username ?? 'System',
                'action'      => $log->action,
                'description' => $log->description,
                'ip_address'  => $log->ip_address,
                'created_at'  => $log->created_at?->diffForHumans(),
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

        $logs = $query->paginate(25)->through(fn($log) => [
            'id'          => $log->id,
            'actor'       => $log->user?->username ?? 'System',
            'action'      => $log->action,
            'description' => $log->description,
            'ip_address'  => $log->ip_address,
            'created_at'  => $log->created_at?->format('d M Y, H:i'),
        ]);

        $actionTypes = AuditLog::select('action')->distinct()->pluck('action');

        return Inertia::render('SuperAdmin/AuditLogPage', [
            'logs'        => $logs,
            'actionTypes' => $actionTypes,
            'filters'     => $request->only(['action']),
        ]);
    }

    public function userManagement(Request $request)
    {
        $users = User::with(['role', 'company', 'division', 'creator'])
            ->latest()
            ->get()
            ->map(fn($u) => [
                'id'          => $u->id,
                'username'    => $u->username,
                'email'       => $u->email,
                'role'        => $u->role?->name,
                'company'     => $u->company?->name,
                'companies_id'=> $u->companies_id,
                'divisions_id'=> $u->divisions_id,
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
}
