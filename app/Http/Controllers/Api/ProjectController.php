<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Services\ProjectTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProjectController extends Controller
{
    public function __construct(
        protected ProjectTemplateService $templateService
    ) {}

    /**
     * Display a listing of projects.
     */
    public function index(Request $request): JsonResponse
    {
        $projects = Project::with(['company:id,name,code', 'admin:id,name,email'])
            ->withCount('mainJobs')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'projects' => $projects,
        ]);
    }

    /**
     * Display the specified project with its WBS hierarchy.
     */
    public function show(int $id): JsonResponse
    {
        $project = Project::with([
            'company',
            'admin:id,name,email',
            'mainJobs.subMainJobs.subtasks',
        ])->findOrFail($id);

        return response()->json([
            'project' => $project,
        ]);
    }

    /**
     * Store a newly created project and auto-load the 17 Main Jobs & Sub Main Jobs template.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || ! $user->isPic()) {
            return response()->json([
                'message' => 'Unauthorized. Only PIC can create projects. Admins cannot create projects.',
            ], 403);
        }

        // Strictly enforce PIC Ownership Rule:
        // One PIC can manage exactly one Project in total.
        $existingProject = Project::where('project_manager', $user->id)->first();
        if ($existingProject) {
            throw ValidationException::withMessages([
                'project_manager' => [
                    "PIC ownership constraint violated: You already manage project '{$existingProject->title}'.",
                ],
            ]);
        }

        $validated = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:255'],
            'project_manager' => ['required', 'string', 'max:255'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'total_budget' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $project = Project::create([
            'company_id' => $validated['company_id'],
            'admin_id' => $user->id,
            'name' => $validated['name'],
            'project_manager' => $validated['project_manager'],
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'] ?? null,
            'total_budget' => $validated['total_budget'] ?? 0,
            'status' => 'Open',
            'overall_progress' => 0,
            'description' => $validated['description'] ?? null,
        ]);

        // Auto-load the fixed 17 Main Jobs and Sub Main Jobs template immediately upon creation!
        $this->templateService->applyTemplateToProject($project);

        // Reload project with company, admin, and generated main jobs count
        $project->load(['company:id,name,code', 'admin:id,name,email', 'mainJobs.subMainJobs']);

        return response()->json([
            'message' => 'Project created successfully with predefined WBS template loaded.',
            'project' => $project,
        ], 201);
    }
}
