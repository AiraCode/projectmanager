<?php

namespace Tests\Feature;

use App\Models\ListMainWbsName;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\User;
use Tests\TestCase;

class MainTaskFinishDateSyncTest extends TestCase
{
    private ?User $superadmin = null;
    private ?Project $testProject = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superadmin = User::where('email', 'superadmin@provis.id')->first()
            ?? User::whereHas('role', fn ($q) => $q->where('name', 'SuperAdmin'))->first();

        $templateProject = Project::first();

        $this->testProject = Project::create([
            'companies_id'    => $templateProject?->companies_id ?? 1,
            'project_manager' => $templateProject?->project_manager ?? $this->superadmin?->id ?? 1,
            'title'           => 'KWT Test Schedule Sync ' . uniqid(),
            'start'           => '2026-03-12',
            'end'             => '2027-08-31',
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

    private function createCivilWorksMainTask(string $end = '2026-05-31'): MainWbs
    {
        $listMain = ListMainWbsName::firstOrCreate(['name' => 'CIVIL WORKS']);

        return MainWbs::create([
            'projects_id'            => $this->testProject->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name'                   => 'CIVIL WORKS',
            'percentage'             => 15.0,
            'start'                  => '2026-03-12',
            'end'                    => $end,
            'actual_start'           => '2026-03-12',
            'actual_end'             => $end,
            'progress'               => 0,
            'status'                 => 'Open',
        ]);
    }

    /**
     * Test 1 — Sub Task exceeds existing Main Task Finish Date.
     * - Main Task Finish Date: 31/05/2026.
     * - Create Sub Task with Finish Date: 31/07/2026.
     * - Expected: Save succeeds and Main Task Finish Date becomes 31/07/2026.
     */
    public function test_sub_task_exceeding_main_task_finish_date_succeeds_and_updates_main_task(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $response = $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'FINISHING',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ]);

        $response->assertSessionHasNoErrors();

        $mainWbs->refresh();
        $this->assertEquals('2026-07-31', $mainWbs->end?->format('Y-m-d'));
        $this->assertEquals('2026-07-31', $mainWbs->actual_end?->format('Y-m-d'));
    }

    /**
     * Test 2 — Multiple Sub Tasks.
     * - Sub Task A Finish Date: 31/05/2026.
     * - Sub Task B Finish Date: 31/07/2026.
     * - Sub Task C Finish Date: 31/08/2027.
     * - Expected: Main Task Finish Date becomes 31/08/2027.
     */
    public function test_multiple_sub_tasks_set_main_task_finish_date_to_latest(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task A',
            'start'       => '2026-03-12',
            'end'         => '2026-05-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task B',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ])->assertSessionHasNoErrors();

        $this->assertEquals('2026-07-31', $mainWbs->fresh()->end?->format('Y-m-d'));

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task C',
            'start'       => '2026-03-12',
            'end'         => '2027-08-31',
        ])->assertSessionHasNoErrors();

        $mainWbs->refresh();
        $this->assertEquals('2027-08-31', $mainWbs->end?->format('Y-m-d'));
        $this->assertEquals('2027-08-31', $mainWbs->actual_end?->format('Y-m-d'));
    }

    /**
     * Test 3 — Update the Latest Sub Task.
     * - Existing latest Finish Date: 31/08/2027.
     * - Change that Sub Task Finish Date to 31/07/2026 (or earlier than next-latest).
     * - Expected: Main Task Finish Date recalculates to the latest remaining Sub Task Finish Date.
     */
    public function test_updating_latest_sub_task_recalculates_main_task_finish_date(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task A',
            'start'       => '2026-03-12',
            'end'         => '2026-05-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task B',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task C',
            'start'       => '2026-03-12',
            'end'         => '2027-08-31',
        ])->assertSessionHasNoErrors();

        $subC = SubWbs::where('sub_wbs_id', $mainWbs->id)->where('name', 'Sub Task C')->firstOrFail();
        $this->assertEquals('2027-08-31', $mainWbs->fresh()->end?->format('Y-m-d'));

        // Change Sub Task C Finish Date to 2026-06-15 so Sub Task B (2026-07-31) becomes the latest
        $response = $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/sub-wbs/{$subC->id}", [
            'name'  => 'Sub Task C',
            'start' => '2026-03-12',
            'end'   => '2026-06-15',
        ]);

        $response->assertSessionHasNoErrors();

        $mainWbs->refresh();
        $this->assertEquals('2026-07-31', $mainWbs->end?->format('Y-m-d'));
        $this->assertEquals('2026-07-31', $mainWbs->actual_end?->format('Y-m-d'));
    }

    /**
     * Test 4 — Delete the Latest Sub Task (and Move Sub Task to Another Parent).
     * - Delete the Sub Task with the latest Finish Date.
     * - Expected: Main Task Finish Date recalculates using the remaining Sub Tasks.
     */
    public function test_deleting_or_moving_latest_sub_task_recalculates_main_task_finish_date(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task A',
            'start'       => '2026-03-12',
            'end'         => '2026-05-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task B',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task C',
            'start'       => '2026-03-12',
            'end'         => '2027-08-31',
        ])->assertSessionHasNoErrors();

        $subC = SubWbs::where('sub_wbs_id', $mainWbs->id)->where('name', 'Sub Task C')->firstOrFail();
        $this->assertEquals('2027-08-31', $mainWbs->fresh()->end?->format('Y-m-d'));

        // Delete Sub Task C
        $deleteResponse = $this->actingAs($this->superadmin)->delete("/projects/{$this->testProject->id}/sub-wbs/{$subC->id}");
        $deleteResponse->assertSessionHasNoErrors();

        $mainWbs->refresh();
        $this->assertEquals('2026-07-31', $mainWbs->end?->format('Y-m-d'));

        // Also verify moving Sub Task B (2026-07-31) to another Main Task recalculates both parents
        $otherMain = MainWbs::create([
            'projects_id'            => $this->testProject->id,
            'list_main_wbs_names_id' => $mainWbs->list_main_wbs_names_id,
            'name'                   => 'MECHANICAL WORKS',
            'percentage'             => 10.0,
            'start'                  => '2026-03-12',
            'end'                    => '2026-04-30',
            'actual_start'           => '2026-03-12',
            'actual_end'             => '2026-04-30',
            'progress'               => 0,
            'status'                 => 'Open',
        ]);

        $subB = SubWbs::where('sub_wbs_id', $mainWbs->id)->where('name', 'Sub Task B')->firstOrFail();
        $moveResponse = $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/sub-wbs/{$subB->id}", [
            'main_wbs_id' => $otherMain->id,
            'name'        => 'Sub Task B',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ]);
        $moveResponse->assertSessionHasNoErrors();

        $this->assertEquals('2026-05-31', $mainWbs->fresh()->end?->format('Y-m-d'));
        $this->assertEquals('2026-07-31', $otherMain->fresh()->end?->format('Y-m-d'));
    }

    /**
     * Test 5 — Main Task with No Sub Tasks.
     * - Verify that the existing empty-child behavior is preserved.
     * - Ensure no unexpected date reset occurs.
     */
    public function test_main_task_with_no_sub_tasks_preserves_manual_dates(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $response = $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/main-wbs/{$mainWbs->id}", [
            'name'   => 'CIVIL WORKS',
            'weight' => 15,
            'start'  => '2026-03-12',
            'end'    => '2027-08-31',
        ]);

        $response->assertSessionHasNoErrors();

        $mainWbs->refresh();
        $this->assertEquals('2027-08-31', $mainWbs->end?->format('Y-m-d'));
        $this->assertEquals('2027-08-31', $mainWbs->actual_end?->format('Y-m-d'));
    }

    /**
     * Test 6 — Main Task Edit and Reload.
     * - Save the Main Task and its applicable Sub Task dates.
     * - Reload the page.
     * - Expected: The Main Task Finish Date remains consistent with the latest Sub Task Finish Date.
     */
    public function test_main_task_edit_and_reload_keeps_finish_date_consistent_with_latest_sub_task(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Sub Task A',
            'start'       => '2026-03-12',
            'end'         => '2026-05-31',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'FINISHING',
            'start'       => '2026-03-12',
            'end'         => '2027-07-28',
        ])->assertSessionHasNoErrors();

        // Edit Main Task metadata/dates
        $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/main-wbs/{$mainWbs->id}", [
            'name'   => 'CIVIL WORKS',
            'weight' => 16,
            'start'  => '2026-03-12',
            'end'    => '2026-05-31',
        ])->assertSessionHasNoErrors();

        $this->assertEquals('2027-07-28', $mainWbs->fresh()->end?->format('Y-m-d'));

        // Reload Tasks page and verify server-confirmed Inertia props
        $reloadResponse = $this->actingAs($this->superadmin)->get("/tasks?project_id={$this->testProject->id}");
        $reloadResponse->assertStatus(200);
        $reloadResponse->assertInertia(function ($page) use ($mainWbs) {
            $page->component('TasksPage')
                ->where('project.id', (string) $this->testProject->id);

            $props = $page->toArray()['props'];
            $mainJobs = collect($props['project']['mainJobs'] ?? []);
            $civilWorks = $mainJobs->firstWhere('dbId', $mainWbs->id);

            $this->assertNotNull($civilWorks);
            $this->assertEquals('2027-07-28', $civilWorks['finishDate']);
        });
    }

    /**
     * Test 7 — Project Target Limit.
     * - Verify the existing Project Target Limit behavior.
     * - Ensure the fix does not accidentally bypass unrelated project-level date validation.
     */
    public function test_project_target_limit_and_start_date_validations_are_enforced(): void
    {
        $mainWbs = $this->createCivilWorksMainTask('2026-05-31');

        // 1. Sub Task Finish Date exceeding Project Target Limit (2027-08-31) must be rejected
        $resCreateExceedProject = $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Invalid Beyond Project End',
            'start'       => '2026-03-12',
            'end'         => '2027-09-15',
        ]);
        $resCreateExceedProject->assertSessionHasErrors(['end']);

        // 2. Sub Task Finish Date before Start Date must be rejected
        $resCreateBeforeStart = $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Invalid Before Start',
            'start'       => '2026-05-10',
            'end'         => '2026-05-01',
        ]);
        $resCreateBeforeStart->assertSessionHasErrors(['end']);

        // 3. Valid Sub Task creation succeeds
        $this->actingAs($this->superadmin)->post("/projects/{$this->testProject->id}/sub-wbs", [
            'main_wbs_id' => $mainWbs->id,
            'name'        => 'Valid Sub Task',
            'start'       => '2026-03-12',
            'end'         => '2026-07-31',
        ])->assertSessionHasNoErrors();

        $subWbs = SubWbs::where('sub_wbs_id', $mainWbs->id)->firstOrFail();

        // 4. Updating Sub Task beyond Project Target Limit must be rejected
        $resUpdateExceedProject = $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/sub-wbs/{$subWbs->id}", [
            'name'  => 'Valid Sub Task',
            'start' => '2026-03-12',
            'end'   => '2027-09-01',
        ]);
        $resUpdateExceedProject->assertSessionHasErrors(['end']);

        // 5. Updating Main Task beyond Project Target Limit must be rejected
        $resMainExceedProject = $this->actingAs($this->superadmin)->put("/projects/{$this->testProject->id}/main-wbs/{$mainWbs->id}", [
            'name'   => 'CIVIL WORKS',
            'weight' => 15,
            'start'  => '2026-03-12',
            'end'    => '2027-09-01',
        ]);
        $resMainExceedProject->assertSessionHasErrors(['end']);
    }
}
