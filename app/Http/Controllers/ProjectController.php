<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\Project;
use App\Models\Wbs;
use Illuminate\Support\Facades\Auth;

class ProjectController extends Controller
{
    /**
     * Project card selector — shown to Admin Utama & Admin Progres.
     * PIC is redirected directly to their project dashboard.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        if ($role === 'worker') {
            return redirect()->route('tasks.index');
        }

        if ($role === 'pic') {
            // PIC only has one project — redirect straight to it
            $project = Project::where('project_manager', $user->id)->first();
            if ($project) {
                return redirect()->route('projects.show', $project->id);
            }
        }

        // Admin Utama & Admin Progres: show all projects as cards
        $projects = Project::with(['manager', 'company'])->get()->map(function ($p) {
            return [
                'id'          => $p->id,
                'name'        => $p->title,
                'company'     => $p->company?->name ?? '—',
                'manager'     => $p->manager?->username ?? $p->manager?->name ?? '—',
                'status'      => $p->status ?? 'Open',
                'progress'    => $p->progress ?? 0,
                'start_date'  => $p->start ? $p->start->format('Y-m-d') : null,
                'end_date'    => $p->end ? $p->end->format('Y-m-d') : null,
            ];
        });

        return Inertia::render('ProjectsPage', [
            'projects' => $projects,
        ]);
    }

    /**
     * Single project dashboard.
     */
    public function dashboard(Request $request, $id = null)
    {
        $user = Auth::user();
        $role = $user->role->name ?? '';

        $query = Project::with([
            'manager', 
            'company', 
            'mainWbs.listName', 
            'mainWbs.subWbs.listName', 
            'mainWbs.subWbs.wbsTasks.division'
        ]);

        if ($role === 'pic') {
            $project = $query->where('project_manager', $user->id)->first();
        } else {
            $project = $id ? $query->find($id) : $query->first();
        }

        if (!$project) abort(404, 'Project not found');

        return Inertia::render('DashboardPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
        ]);
    }

    /**
     * Tasks page — scoped by role.
     */
    public function tasks(Request $request, $id = null)
    {
        $user       = Auth::user();
        $role       = $user->role->name ?? '';
        $divisionId = $user->divisions_id;

        $query = Project::with([
            'manager', 
            'company', 
            'mainWbs.listName', 
            'mainWbs.subWbs.listName', 
            'mainWbs.subWbs.wbsTasks.division'
        ]);

        if ($role === 'pic') {
            $project = $query->where('project_manager', $user->id)->first();
        } else {
            // For now tasks just load the first project if ID is not provided. 
            // In a real app we'd pass ID via route.
            $project = $id ? $query->find($id) : $query->first(); 
        }

        if (!$project) abort(404, 'Project not found');

        // Note: For workers, you might want to filter tasks in the frontend or here.
        // Frontend already has logic `isAuthorizedToCheck` so we can just pass everything.

        return Inertia::render('TasksPage', [
            'project'  => $this->transformProjectData($project),
            'userRole' => $role,
            'division' => $user->division?->divisi ?? null,
        ]);
    }

    private function transformProjectData($p)
    {
        // Hitung hari
        $start = $p->start;
        $end = $p->end;
        $now = \Carbon\Carbon::now();
        $hariKe = $start ? $start->diffInDays($now, false) : 0;
        if ($hariKe < 0) $hariKe = 0;
        $sisaHari = $end ? $now->diffInDays($end, false) : 0;
        if ($sisaHari < 0) $sisaHari = 0;

        return [
            'id' => (string) $p->id,
            'name' => $p->title,
            'company' => $p->company?->name ?? '—',
            'projectManager' => $p->manager?->username ?? $p->manager?->name ?? '—',
            'startDate' => $p->start ? $p->start->format('Y-m-d') : '',
            'endDate' => $p->end ? $p->end->format('Y-m-d') : '',
            'status' => $p->status ?? 'Open',
            'overallProgress' => (int) $p->progress,
            'hariKe' => (int) $hariKe,
            'sisaHari' => (int) $sisaHari,
            'totalBudget' => 45000000000, // Dummy
            'usedBudget' => 34560000000,  // Dummy
            'weeklyData' => [],           // Computed in frontend / dummy
            'budgetEntries' => [],        // Dummy
            'mainJobs' => $p->mainWbs->map(function ($mj) {
                return [
                    'id' => 'mj-' . $mj->id,
                    'code' => (string) ($mj->listName?->urutan ?? $mj->id),
                    'name' => $mj->listName?->name ?? $mj->name ?? '',
                    'weight' => (float) $mj->percentage,
                    'startDate' => $mj->actual_start ? $mj->actual_start->format('Y-m-d') : '',
                    'finishDate' => $mj->actual_end ? $mj->actual_end->format('Y-m-d') : '',
                    'progress' => (int) $mj->progress,
                    'status' => $mj->status ?? 'Open',
                    'subMainJobs' => $mj->subWbs->map(function ($smj) use ($mj) {
                        return [
                            'id' => 'smj-' . $smj->id,
                            'code' => ($mj->listName?->urutan ?? $mj->id) . '.' . ($smj->listName?->urutan ?? $smj->id),
                            'name' => $smj->listName?->name ?? $smj->name ?? '',
                            'pic' => 'Admin', // Divisi di sub WBS tidak ada, adanya di task level
                            'startDate' => $smj->start ? $smj->start->format('Y-m-d') : '',
                            'finishDate' => $smj->end ? $smj->end->format('Y-m-d') : '',
                            'progress' => (int) $smj->progress,
                            'status' => $smj->status ?? 'Open',
                            'weight' => (float) $smj->weight,
                            'subtasks' => $smj->wbsTasks->map(function ($st) use ($mj, $smj) {
                                return [
                                    'id' => 'st-' . $st->id,
                                    'code' => ($mj->listName?->urutan ?? $mj->id) . '.' . ($smj->listName?->urutan ?? $smj->id) . '.' . substr($st->id, -1),
                                    'name' => $st->name,
                                    'duration' => $st->start && $st->end ? $st->start->diffInDays($st->end) : 0,
                                    'daysLeft' => $st->end && \Carbon\Carbon::now()->lessThan($st->end) ? \Carbon\Carbon::now()->diffInDays($st->end) : 0,
                                    'startDate' => $st->start ? $st->start->format('Y-m-d') : '',
                                    'finishDate' => $st->end ? $st->end->format('Y-m-d') : '',
                                    'progress' => $st->is_completed ? 100 : 0,
                                    'status' => $st->status ?? 'Open',
                                    'predecessor' => $st->predecessor,
                                    'depType' => $st->predecessor_type,
                                    'weight' => 0,
                                    'checked' => (bool) $st->is_completed,
                                    'division' => $st->division?->divisi ?? 'Vendor', // custom extension
                                ];
                            })->values()->toArray(),
                        ];
                    })->values()->toArray(),
                ];
            })->values()->toArray(),
        ];
    }
}
