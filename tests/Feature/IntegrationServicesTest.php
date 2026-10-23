<?php

namespace Tests\Feature;

use App\Models\Division;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\SubWbs;
use App\Models\User;
use App\Models\Wbs;
use App\Services\DivisionApprovalService;
use App\Services\SCurvePredictionService;
use App\Services\TaskOrderService;
use App\Services\WeightManagementService;
use Tests\TestCase;

class IntegrationServicesTest extends TestCase
{
    /**
     * 1. Test Task Ordering Persistence (BE-05).
     * Verify that reordered task IDs persist in DB and are returned ordered by order_index.
     */
    public function test_task_ordering_persists_across_queries(): void
    {
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $project = Project::first();
        $this->assertNotNull($project, 'Project must exist');

        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->first();
        $this->assertNotNull($subWbs, 'SubWbs must exist');

        $tasks = Wbs::where('sub_wbs_id', $subWbs->id)->get();
        if ($tasks->count() < 2) {
            // Create a couple of tasks to ensure at least 2 exist
            Wbs::create([
                'id' => 'test-task-1',
                'sub_wbs_id' => $subWbs->id,
                'name' => 'Task Test 1',
                'weight' => 50,
                'order_index' => 1,
            ]);
            Wbs::create([
                'id' => 'test-task-2',
                'sub_wbs_id' => $subWbs->id,
                'name' => 'Task Test 2',
                'weight' => 50,
                'order_index' => 2,
            ]);
            $tasks = Wbs::where('sub_wbs_id', $subWbs->id)->get();
        }

        $reversedIds = $tasks->pluck('id')->reverse()->map(fn($id) => (string) $id)->values()->all();

        $response = $this->actingAs($superadmin)->post("/projects/{$project->id}/reorder-tasks", [
            'sub_wbs_id' => $subWbs->id,
            'ordered_ids' => $reversedIds,
        ]);

        $response->assertSessionHasNoErrors();

        // Verify direct DB query ordered by order_index matches reversed order
        $persistedTasks = Wbs::where('sub_wbs_id', $subWbs->id)
            ->orderBy('order_index', 'asc')
            ->pluck('id')
            ->map(fn($id) => (string) $id)
            ->values()
            ->all();

        $this->assertEquals($reversedIds, $persistedTasks, 'Task order in database must strictly match requested ordered_ids');
    }

    /**
     * 2. Test S-Curve EVM Prediction Service (SCurvePredictionService).
     * Verify genuine prediction points and metrics calculation.
     */
    public function test_scurve_prediction_service_generates_genuine_data(): void
    {
        $project = Project::first();
        $this->assertNotNull($project, 'Project must exist');

        $service = app(SCurvePredictionService::class);
        $result = $service->calculate($project);

        $this->assertArrayHasKey('points', $result);
        $this->assertArrayHasKey('metrics', $result);

        $metrics = $result['metrics'];
        $this->assertArrayHasKey('spi', $metrics);
        $this->assertArrayHasKey('is_delayed', $metrics);
        $this->assertArrayHasKey('forecast_end_date', $metrics);
        $this->assertArrayHasKey('weekly_velocity', $metrics);
        $this->assertIsNumeric($metrics['spi']);

        if (!empty($result['points'])) {
            $firstPoint = $result['points'][0];
            $this->assertArrayHasKey('week', $firstPoint);
            $this->assertArrayHasKey('planned_cumulative', $firstPoint);
            $this->assertArrayHasKey('prediction_cumulative', $firstPoint);
        }
    }

    /**
     * 3. Test Custom Weight Management Service (BE-03).
     * Verify strict 100.00% validation check.
     */
    public function test_weight_management_strict_100_percent_check(): void
    {
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $project = Project::first();
        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->first();

        $tasks = Wbs::where('sub_wbs_id', $subWbs->id)->get();
        if ($tasks->count() < 2) {
            Wbs::create(['id' => 'task-wt-1', 'sub_wbs_id' => $subWbs->id, 'name' => 'W1', 'weight' => 50]);
            Wbs::create(['id' => 'task-wt-2', 'sub_wbs_id' => $subWbs->id, 'name' => 'W2', 'weight' => 50]);
            $tasks = Wbs::where('sub_wbs_id', $subWbs->id)->get();
        }

        $t1 = $tasks[0];
        $t2 = $tasks[1];

        // Case A: Total is 80% (Not 100%) -> Must fail validation
        $responseBad = $this->actingAs($superadmin)->post("/projects/{$project->id}/weights", [
            'scope' => 'tasks',
            'parent_id' => $subWbs->id,
            'weights' => [
                ['id' => $t1->id, 'weight' => 40],
                ['id' => $t2->id, 'weight' => 40],
            ],
        ]);
        $responseBad->assertSessionHasErrors(['message']);

        // Case B: Total is exactly 100% (e.g. 60 + 40) -> Must succeed
        $responseGood = $this->actingAs($superadmin)->post("/projects/{$project->id}/weights", [
            'scope' => 'tasks',
            'parent_id' => $subWbs->id,
            'weights' => [
                ['id' => $t1->id, 'weight' => 60],
                ['id' => $t2->id, 'weight' => 40],
            ],
        ]);
        $responseGood->assertSessionHasNoErrors();

        // Verify persisted weights
        $this->assertEquals(60.00, (float) Wbs::find($t1->id)->weight);
        $this->assertEquals(40.00, (float) Wbs::find($t2->id)->weight);
    }

    /**
     * 4. Test Multi-Division User Assignment and Division Requests (BE-09).
     */
    public function test_division_approval_and_multi_division_assignment(): void
    {
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $worker = User::whereHas('role', fn($q) => $q->where('name', 'worker'))->first();
        $this->assertNotNull($worker, 'Worker must exist');

        $divisions = Division::take(2)->get();
        if ($divisions->count() < 2) {
            Division::create(['divisi' => 'Divisi Alpha']);
            Division::create(['divisi' => 'Divisi Beta']);
            $divisions = Division::take(2)->get();
        }

        $div1 = $divisions[0];
        $div2 = $divisions[1];

        // Direct multi-division sync
        $worker->syncDivisions([$div1->id, $div2->id]);

        $this->assertTrue($worker->hasDivision($div1->id));
        $this->assertTrue($worker->hasDivision($div2->id));
        $this->assertContains($div1->id, $worker->getDivisionIds());
        $this->assertContains($div2->id, $worker->getDivisionIds());

        // Test DivisionApprovalService workflow
        $div3 = Division::firstOrCreate(['divisi' => 'Divisi Gamma']);
        $approvalService = app(DivisionApprovalService::class);

        // Submit request
        $request = $approvalService->requestDivision($worker->id, $div3->id, $superadmin->id, 'Testing division request');
        $this->assertEquals('pending', $request->status);

        // Approve request
        $approved = $approvalService->approveRequest($request->id, $superadmin->id);
        $this->assertEquals('approved', $approved->status);

        // Verify worker now has div3
        $this->assertTrue($worker->fresh()->hasDivision($div3->id));
    }

    /**
     * 5. Test Project Member Assignment (BE-06).
     */
    public function test_project_member_assignment_and_removal(): void
    {
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $project = Project::first();
        $userToAssign = User::where('id', '!=', $superadmin->id)->first();

        // Assign member
        $resAssign = $this->actingAs($superadmin)->post("/projects/{$project->id}/members", [
            'user_id' => $userToAssign->id,
            'project_role' => 'lead',
            'position_title' => 'Technical Lead',
        ]);
        $resAssign->assertSessionHasNoErrors();

        $member = ProjectMember::where('project_id', $project->id)->where('user_id', $userToAssign->id)->first();
        $this->assertNotNull($member);
        $this->assertEquals('lead', $member->project_role);

        // Remove member
        $resRemove = $this->actingAs($superadmin)->delete("/projects/{$project->id}/members/{$member->id}");
        $resRemove->assertSessionHasNoErrors();

        $this->assertNull(ProjectMember::find($member->id));
    }

    /**
     * 6. Test Task Ordering Security: Unauthorized User & Foreign ID Boundary Checks.
     */
    public function test_task_ordering_security_and_boundary_checks(): void
    {
        $project = Project::first();
        $subWbs = SubWbs::whereHas('mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->first();

        // A. Worker role must be denied access
        $worker = User::whereHas('role', fn($q) => $q->where('name', 'worker'))->first();
        $resForbidden = $this->actingAs($worker)->post("/projects/{$project->id}/reorder-tasks", [
            'sub_wbs_id' => $subWbs->id,
            'ordered_ids' => ['any-id'],
        ]);
        $resForbidden->assertSessionHasErrors(['message']);

        // B. SuperAdmin with foreign/invalid task ID must be rejected by boundary check
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $resInvalidId = $this->actingAs($superadmin)->post("/projects/{$project->id}/reorder-tasks", [
            'sub_wbs_id' => $subWbs->id,
            'ordered_ids' => ['completely-foreign-task-id-99999'],
        ]);
        $resInvalidId->assertSessionHasErrors(['message']);
    }

    /**
     * 7. Test S-Curve Prediction Edge Cases: Empty Project & Delayed Project.
     */
    public function test_scurve_prediction_edge_cases(): void
    {
        $service = app(SCurvePredictionService::class);
        $existingProject = Project::first();

        // Case A: Fresh project with dates but 0 tasks -> has calendar weeks, is_delayed is false, spi is 1.0
        $emptyProject = Project::create([
            'companies_id' => $existingProject->companies_id ?? 1,
            'project_manager' => $existingProject->project_manager ?? 1,
            'title' => 'Empty Project for Test',
            'start' => now(),
            'end' => now()->addMonths(2),
            'progress' => 0,
            'status' => 'Open',
        ]);

        $emptyResult = $service->calculate($emptyProject);
        $this->assertNotEmpty($emptyResult['points'], 'Project with dates generates calendar week boundary points');
        $this->assertFalse($emptyResult['metrics']['is_delayed'], 'Project with 0 tasks cannot be falsely labeled delayed');
        $this->assertEquals(1.0, $emptyResult['metrics']['spi']);
        $this->assertEquals(0, $emptyResult['metrics']['overdue_tasks_count']);

        // Case B: Project with an overdue incomplete task -> is_delayed must be true
        $listMain = \App\Models\ListMainWbsName::firstOrCreate(['name' => 'Overdue Main Job']);
        $mainWbs = MainWbs::create([
            'projects_id' => $emptyProject->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name' => 'Overdue Main Job',
            'percentage' => 100,
            'start' => now()->subMonths(2),
            'end' => now()->subMonth(),
            'status' => 'Open',
        ]);

        $listSub = \App\Models\ListSubWbsName::firstOrCreate(['name' => 'Overdue Sub Job'], ['list_main_wbs_names_copy1_id' => $listMain->id]);
        $subWbs = SubWbs::create([
            'sub_wbs_id' => $mainWbs->id,
            'list_sub_wbs_names_id' => $listSub->id,
            'name' => 'Overdue Sub Job',
            'weight' => 100,
            'predecessor' => '',
            'predecessor_type' => 'FS',
            'start' => now()->subMonths(2),
            'end' => now()->subMonth(),
            'status' => 'Open',
        ]);

        $taskId = 'overdue-task-' . \Illuminate\Support\Str::uuid();
        Wbs::create([
            'id' => $taskId,
            'sub_wbs_id' => $subWbs->id,
            'divisions_id' => Division::first()?->id ?? 1,
            'vendor' => 'Internal',
            'name' => 'Delayed Task 1',
            'weight' => 100,
            'start' => now()->subMonths(2),
            'end' => now()->subMonth(),
            'progress' => 10,
            'status' => 'Open',
            'is_completed' => false,
        ]);

        $delayedResult = $service->calculate($emptyProject->fresh(['mainWbs.subWbs.wbsTasks']));
        $this->assertTrue($delayedResult['metrics']['is_delayed'], 'Project with overdue task must be flagged as is_delayed');
        $this->assertGreaterThan(0, $delayedResult['metrics']['overdue_tasks_count']);
        $this->assertGreaterThan(0, $delayedResult['metrics']['delay_days']);
    }

    /**
     * 7b. Test S-Curve Curve Shifting / Remaining Work Projection.
     * Verify Prediction connects to last actual point, shifts remaining plan increments, and reaches 100%.
     */
    public function test_scurve_curve_shifting_prediction_logic(): void
    {
        $service = app(SCurvePredictionService::class);
        $project = Project::whereHas('mainWbs.subWbs.wbsTasks')->first();
        if (!$project) {
            $this->markTestSkipped('No project with tasks found for curve shifting test.');
        }

        $result = $service->calculate($project);
        $points = $result['points'];
        $this->assertNotEmpty($points);

        // Find last actual point in result
        $lastActualIdx = null;
        $lastActualVal = null;
        foreach ($points as $idx => $p) {
            if ($p['actual_cumulative'] !== null && $p['actual_cumulative'] > 0) {
                $lastActualIdx = $idx;
                $lastActualVal = $p['actual_cumulative'];
            }
        }

        if ($lastActualIdx !== null) {
            // Check periods < lastActualIdx have prediction = null
            for ($i = 0; $i < $lastActualIdx; $i++) {
                $this->assertNull($points[$i]['prediction_cumulative'], "Prediction at week index {$i} before lastActualIdx must be null");
            }

            // At lastActualIdx, prediction must connect seamlessly to lastActualVal
            $this->assertEquals($lastActualVal, $points[$lastActualIdx]['prediction_cumulative'], 'Prediction must connect seamlessly at lastActualIdx');

            // Prediction should eventually reach 100%
            $lastPoint = end($points);
            $this->assertNotNull($lastPoint['prediction_cumulative']);
            $this->assertEquals(100.0, (float) $lastPoint['prediction_cumulative'], 'Prediction must reach 100% on the final period');
        }
    }

    /**

     * 8. Test Task Evidence Upload is Recorded in Activity Log.
     */
    public function test_task_evidence_upload_recorded_in_activity_log(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');

        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $project = Project::first();
        $this->assertNotNull($project, 'Project must exist');

        $task = Wbs::whereHas('parentSubWbs.mainWbs', function ($q) use ($project) {
            $q->where('projects_id', $project->id);
        })->first();
        $this->assertNotNull($task, 'Task must exist');

        $evidenceFile = \Illuminate\Http\UploadedFile::fake()->create('laporan_progress_12.pdf', 100, 'application/pdf');

        $response = $this->actingAs($superadmin)->post("/projects/{$project->id}/tasks/{$task->id}/toggle", [
            'progress' => 50,
            'evidence_file' => $evidenceFile,
        ]);

        $response->assertSessionHasNoErrors();

        $latestLog = \App\Models\ProjectActivityLog::where('project_id', $project->id)
            ->where('wbs_id', $task->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($latestLog, 'Activity log must be recorded');
        $this->assertStringContainsString('laporan_progress_12.pdf', $latestLog->description);
        $this->assertStringContainsStringIgnoringCase('input evidence:', $latestLog->description);
        $this->assertIsArray($latestLog->metadata);
        $this->assertContains('laporan_progress_12.pdf', $latestLog->metadata['evidence_files'] ?? []);
    }

    /**
     * 10. Test PIC creates private project with selected members and MasterTemplate.
     */
    public function test_pic_create_private_project_with_members_and_master_template(): void
    {
        $pic = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->first();
        $this->assertNotNull($pic, 'PIC user must exist');

        // Grant multiple projects and private projects permission
        $pic->permission_matrix = [
            'features' => [
                'projects' => ['Multiple Projects', 'Private Projects'],
            ],
            'sidebar' => ['*'],
        ];
        $pic->save();

        $worker = User::whereHas('role', fn($q) => $q->where('name', 'worker'))->first();
        $this->assertNotNull($worker, 'Worker user must exist');

        $response = $this->actingAs($pic)->post('/projectlistpage', [
            'title' => 'Special Secret Project ' . uniqid(),
            'company_id' => $pic->companies_id,
            'start' => '2026-11-01',
            'end' => '2027-11-01',
            'is_private' => true,
            'member_ids' => [$worker->id],
        ]);

        $response->assertSessionHasNoErrors();

        $createdProject = Project::where('project_manager', $pic->id)->latest('id')->first();
        $this->assertNotNull($createdProject);
        $this->assertTrue((bool) $createdProject->is_private);

        // Verify PIC is registered as PM member
        $pmMember = ProjectMember::where('project_id', $createdProject->id)->where('user_id', $pic->id)->first();
        $this->assertNotNull($pmMember);
        $this->assertEquals('pm', $pmMember->project_role);

        // Verify Worker is registered as worker member
        $workerMember = ProjectMember::where('project_id', $createdProject->id)->where('user_id', $worker->id)->first();
        $this->assertNotNull($workerMember);
        $this->assertEquals('worker', $workerMember->project_role);

        // Verify Master Template initialized MainWbs
        $mainWbsCount = \App\Models\MainWbs::where('projects_id', $createdProject->id)->count();
        $this->assertGreaterThan(0, $mainWbsCount);

        // Verify Working Tree endpoint returns member data
        $treeRes = $this->actingAs($pic)->get("/projects/{$createdProject->id}/working-tree", ['Accept' => 'application/json']);
        $treeRes->assertStatus(200);
        $treeData = $treeRes->json();
        $this->assertNotEmpty($treeData['members']);
        $this->assertEquals(2, count($treeData['members']));
    }

    /**
     * 11. Test SuperAdmin WBS Template CRUD and Reordering.
     */
    public function test_superadmin_template_management_crud_and_reorder(): void
    {
        $superadmin = User::where('email', 'superadmin@provis.id')->first();
        $this->assertNotNull($superadmin);

        // 1. Create Template
        $resCreate = $this->actingAs($superadmin)->post('/admin/templates', [
            'name' => 'Template Uji Coba ' . uniqid(),
            'description' => 'Test template for automated verification',
            'is_default' => false,
        ]);
        $resCreate->assertSessionHasNoErrors();

        $template = \App\Models\ProjectTemplate::latest('id')->first();
        $this->assertNotNull($template);

        // 2. Add Main Tasks
        $this->actingAs($superadmin)->post("/admin/templates/{$template->id}/main-tasks", [
            'code' => '1',
            'name' => 'Fase Perencanaan',
            'weight' => 50,
        ])->assertSessionHasNoErrors();

        $this->actingAs($superadmin)->post("/admin/templates/{$template->id}/main-tasks", [
            'code' => '2',
            'name' => 'Fase Eksekusi',
            'weight' => 50,
        ])->assertSessionHasNoErrors();

        $mainTasks = \App\Models\TemplateMainTask::where('template_id', $template->id)->orderBy('order_index')->get();
        $this->assertCount(2, $mainTasks);

        // 3. Reorder Main Tasks
        $reorderRes = $this->actingAs($superadmin)->post("/admin/templates/{$template->id}/main-tasks/reorder", [
            'ordered_ids' => [$mainTasks[1]->id, $mainTasks[0]->id],
        ]);
        $reorderRes->assertSessionHasNoErrors();

        $this->assertEquals(1, \App\Models\TemplateMainTask::find($mainTasks[1]->id)->order_index);
        $this->assertEquals(2, \App\Models\TemplateMainTask::find($mainTasks[0]->id)->order_index);

        // 4. Set as default
        $this->actingAs($superadmin)->post("/admin/templates/{$template->id}/set-default")->assertSessionHasNoErrors();
        $this->assertTrue((bool) \App\Models\ProjectTemplate::find($template->id)->is_default);
    }

    /**
     * 12. Test Project List Page loads cleanly for PIC and provides availableUsers without column errors.
     */
    public function test_project_list_page_loads_cleanly_for_pic_with_available_users(): void
    {
        $pic = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->first();
        $this->assertNotNull($pic);

        $response = $this->actingAs($pic)->get('/projectlistpage');
        $response->assertStatus(200);
        $response->assertInertia(fn($page) => $page
            ->component('ProjectListPage')
            ->has('projects')
            ->has('availableUsers')
            ->has('templates')
        );
    }
}

