<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\ListMainWbsName;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class SuperAdminProjectDurationTest extends TestCase
{
    private ?User $superadmin = null;
    private ?User $picUser = null;
    private ?Project $testProject = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superadmin = User::where('email', 'superadmin@provis.id')->first()
            ?? User::whereHas('role', fn ($q) => $q->where('name', 'SuperAdmin'))->first();

        $this->picUser = User::whereHas('role', fn ($q) => $q->where('name', 'pic'))->first()
            ?? User::where('email', '!=', 'superadmin@provis.id')->first();

        $templateProject = Project::first();

        $this->testProject = Project::create([
            'companies_id'    => $templateProject?->companies_id ?? 1,
            'project_manager' => $templateProject?->project_manager ?? $this->superadmin?->id ?? 1,
            'title'           => 'KWT Delay Duration Test ' . uniqid(),
            'start'           => '2026-03-12',
            'end'             => '2026-12-30',
            'progress'        => 0,
            'status'          => 'Open',
            'setup_status'    => 'active',
        ]);
    }

    protected function tearDown(): void
    {
        if ($this->testProject) {
            foreach ($this->testProject->mainWbs()->withTrashed()->get() as $mw) {
                foreach ($mw->subWbs()->withTrashed()->get() as $sw) {
                    $sw->wbsTasks()->withTrashed()->forceDelete();
                }
                $mw->subWbs()->withTrashed()->forceDelete();
            }
            $this->testProject->mainWbs()->withTrashed()->forceDelete();
            $this->testProject->forceDelete();
        }

        parent::tearDown();
    }

    /**
     * Test 1 — SuperAdmin can update project overall start and finish dates (e.g. extending delayed project).
     */
    public function test_superadmin_can_update_project_start_and_finish_dates(): void
    {
        $response = $this->actingAs($this->superadmin)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-03-12',
            'end'   => '2027-01-30',
        ]);

        $response->assertSessionHasNoErrors();
        $response->assertSessionHas('success');

        $this->testProject->refresh();
        $this->assertSame('2026-03-12', $this->testProject->start->toDateString());
        $this->assertSame('2027-01-30', $this->testProject->end->toDateString());

        // Verify AuditLog entry was recorded
        $log = AuditLog::where('action', 'UPDATE_PROJECT_DATES')
            ->where('metadata', 'like', '%"project_id":' . $this->testProject->id . '%')
            ->latest()
            ->first();

        $this->assertNotNull($log);
        $this->assertStringContainsString('30/01/2027', $log->description);
        $this->assertSame('2027-01-30', $log->metadata['new_end'] ?? null);
    }

    /**
     * Test 2 — Non-SuperAdmin is forbidden from modifying project schedule.
     */
    public function test_non_superadmin_cannot_update_project_dates(): void
    {
        $response = $this->actingAs($this->picUser)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-03-12',
            'end'   => '2027-01-30',
        ]);

        $response->assertStatus(403);

        $this->testProject->refresh();
        $this->assertSame('2026-12-30', $this->testProject->end->toDateString());
    }

    /**
     * Test 3 — Finish Date must be strictly after Start Date.
     */
    public function test_update_project_dates_rejects_finish_before_or_same_as_start(): void
    {
        $response = $this->actingAs($this->superadmin)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-05-10',
            'end'   => '2026-05-10',
        ]);

        $response->assertSessionHasErrors(['end']);

        $this->testProject->refresh();
        $this->assertSame('2026-12-30', $this->testProject->end->toDateString());
    }

    /**
     * Test 4 — Project Target Finish cannot be shortened to earlier than existing tasks.
     */
    public function test_update_project_dates_rejects_finish_earlier_than_existing_tasks(): void
    {
        $listMain = ListMainWbsName::firstOrCreate(['name' => 'CIVIL WORKS TEST']);
        $mainWbs = MainWbs::create([
            'projects_id'            => $this->testProject->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name'                   => 'CIVIL WORKS TEST',
            'percentage'             => 10,
            'start'                  => '2026-03-12',
            'end'                    => '2026-11-15',
            'progress'               => 0,
            'status'                 => 'Open',
        ]);

        // Attempting to set project end earlier than 2026-11-15 is rejected
        $response = $this->actingAs($this->superadmin)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-03-12',
            'end'   => '2026-10-01',
        ]);

        $response->assertSessionHasErrors(['end']);

        // Extending to 2027-02-15 succeeds
        $validResponse = $this->actingAs($this->superadmin)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-03-12',
            'end'   => '2027-02-15',
        ]);

        $validResponse->assertSessionHasNoErrors();
        $this->assertSame('2027-02-15', $this->testProject->fresh()->end->toDateString());
    }

    /**
     * Test 5 — Sub Task can now be scheduled up to the newly extended project finish date.
     */
    public function test_subtask_can_be_scheduled_up_to_new_project_target_finish_date(): void
    {
        // 1. Extend project target finish date to 2027-06-30
        $this->actingAs($this->superadmin)->put("/admin/projects/{$this->testProject->id}/dates", [
            'start' => '2026-03-12',
            'end'   => '2027-06-30',
        ])->assertSessionHasNoErrors();

        // 2. Create Main Task
        $listMain = ListMainWbsName::firstOrCreate(['name' => 'CIVIL WORKS TEST']);
        $mainWbs = MainWbs::create([
            'projects_id'            => $this->testProject->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name'                   => 'CIVIL WORKS TEST',
            'percentage'             => 10,
            'start'                  => '2026-03-12',
            'end'                    => '2026-05-31',
            'progress'               => 0,
            'status'                 => 'Open',
        ]);

        // 3. Create Sub Task with finish date 2027-05-31 (exceeds old project end 2026-12-30, but within new 2027-06-30)
        $subResponse = $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'SUB TASK EXTENDED',
            'start'       => '2026-03-12',
            'end'         => '2027-05-31',
        ]);

        $subResponse->assertSessionHasNoErrors();

        $subWbs = SubWbs::where('sub_wbs_id', $mainWbs->id)->first();
        $this->assertNotNull($subWbs);
        $this->assertSame('2027-05-31', $subWbs->end->toDateString());
        $this->assertSame('2027-05-31', $mainWbs->fresh()->end->toDateString());
    }

    /**
     * Test 6 — SuperAdmin can search and filter audit logs without database query errors.
     */
    public function test_superadmin_can_search_and_filter_audit_logs(): void
    {
        AuditLog::record(
            'TEST_AUDIT_ACTION',
            'Sample audit log description for searching',
            $this->superadmin->id,
            '127.0.0.1',
            ['actor' => 'Provis Support System', 'extra' => 'info']
        );

        // 1. Search with keyword matching description/actor/metadata
        $searchResponse = $this->actingAs($this->superadmin)->get('/admin/audit-log?search=Support');
        $searchResponse->assertOk();

        // 2. Filter by actor string
        $actorResponse = $this->actingAs($this->superadmin)->get('/admin/audit-log?actor=Provis+Support+System');
        $actorResponse->assertOk();

        // 3. Filter by System actor
        $systemResponse = $this->actingAs($this->superadmin)->get('/admin/audit-log?actor=System');
        $systemResponse->assertOk();
    }
}
