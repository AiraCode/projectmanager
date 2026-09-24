<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Project;
use App\Models\MainWbs;
use App\Models\SubWbs;
use App\Models\Wbs;

class AuthorizationTest extends TestCase
{
    /** 1. Admin Utama cannot create projects (403) */
    public function test_admin_utama_cannot_create_project(): void
    {
        $admin = User::where('email', 'admin@provis.id')->first();
        $response = $this->actingAs($admin)
            ->withSession(['_token' => 'tok123'])
            ->post('/projects', [
                '_token' => 'tok123',
                'title' => 'Illegal Admin Project',
                'start' => '2026-01-01',
                'end'   => '2026-12-31',
            ]);
        $response->assertStatus(403);
    }

    /** 2. Admin Progres is restricted to S-Curve (redirected from dashboard/tasks/etc) */
    public function test_admin_progres_redirected_from_other_pages(): void
    {
        $progres = User::where('email', 'progres@provis.id')->first();

        // Accessing tasks -> redirected to scurve
        $resTasks = $this->actingAs($progres)->get('/tasks');
        $resTasks->assertRedirect('/scurve');

        // Accessing timeline -> redirected to scurve
        $resTimeline = $this->actingAs($progres)->get('/timeline');
        $resTimeline->assertRedirect('/scurve');

        // Accessing single project dashboard -> redirected to scurve with project_id
        $resDash = $this->actingAs($progres)->get('/projects/1');
        $resDash->assertRedirect('/scurve?project_id=1');
    }

    /** 3. PIC cannot open other companies' projects (403) */
    public function test_pic_cannot_access_other_companies_projects(): void
    {
        $pic1 = User::where('email', 'pic1@provis.id')->first(); // belongs to company 1
        $project2 = Project::find(2); // belongs to company 2

        $response = $this->actingAs($pic1)->get("/projects/{$project2->id}");
        $response->assertStatus(403);
    }

    /** 4. Worker cannot access other companies' projects (403) */
    public function test_worker_cannot_access_other_companies_projects(): void
    {
        $worker = User::where('email', 'hrga@provis.id')->first(); // company 1
        $project2 = Project::find(2); // company 2

        $response = $this->actingAs($worker)->get("/projects/{$project2->id}");
        $response->assertStatus(403);
    }

    /** 5. PIC without project (pic4) can create a project */
    public function test_pic4_can_create_project(): void
    {
        $pic4 = User::where('email', 'pic4@provis.id')->first();
        $this->assertNotNull($pic4);

        // Delete any previous project created by pic4 if any from prior test
        Project::where('project_manager', $pic4->id)->delete();

        $response = $this->actingAs($pic4)
            ->withSession(['_token' => 'tok123'])
            ->post('/projects', [
                '_token' => 'tok123',
                'title' => 'PROJECT PIC 4 BARU',
                'company_name' => 'PT KARYA MAJU PIC 4',
                'start' => '2026-09-20',
                'end' => '2027-03-20',
            ]);

        $project = Project::where('project_manager', $pic4->id)->first();
        $this->assertNotNull($project, 'Project was not created for pic4');
        $this->assertEquals('PROJECT PIC 4 BARU', $project->title);
        $response->assertRedirect("/projects/{$project->id}");
    }

    /** 6. PIC can add Sub Task (Sub Main Job) */
    public function test_pic_can_add_sub_task(): void
    {
        $pic1 = User::where('email', 'pic1@provis.id')->first();
        $mainWbs = MainWbs::where('projects_id', 1)->first();

        $response = $this->actingAs($pic1)
            ->withSession(['_token' => 'tok123'])
            ->post('/projects/1/sub-wbs', [
                '_token' => 'tok123',
                'main_wbs_id' => $mainWbs->id,
                'name' => 'NEW TEST SUB TASK',
                'weight' => 15,
            ]);

        $response->assertSessionHasNoErrors();
        $this->assertDatabaseHas('sub_wbs', [
            'sub_wbs_id' => $mainWbs->id,
            'name' => 'NEW TEST SUB TASK',
        ]);
    }

    /** 7. PIC can add Task (Sub-Subtask) */
    public function test_pic_can_add_task(): void
    {
        $pic1 = User::where('email', 'pic1@provis.id')->first();
        $subWbs = SubWbs::whereHas('mainWbs', fn($q) => $q->where('projects_id', 1))->first();

        $response = $this->actingAs($pic1)
            ->withSession(['_token' => 'tok123'])
            ->post('/projects/1/tasks', [
                '_token' => 'tok123',
                'sub_wbs_id' => $subWbs->id,
                'name' => 'NEW TEST TASK BY PIC',
                'duration' => 5,
            ]);

        $response->assertSessionHasNoErrors();
        $this->assertDatabaseHas('wbs', [
            'sub_wbs_id' => $subWbs->id,
            'name' => 'NEW TEST TASK BY PIC',
        ]);
    }

    /** 8. Admin cannot toggle tasks (403) */
    public function test_admin_cannot_toggle_task(): void
    {
        $admin = User::where('email', 'admin@provis.id')->first();
        $task = Wbs::whereHas('parentSubWbs.mainWbs', fn($q) => $q->where('projects_id', 1))->first();

        $response = $this->actingAs($admin)
            ->withSession(['_token' => 'tok123'])
            ->post("/projects/1/tasks/{$task->id}/toggle", [
                '_token' => 'tok123',
            ]);

        $response->assertStatus(403);
    }

    /** 9. Worker cannot toggle task of another division (403) */
    public function test_worker_cannot_toggle_task_of_other_division(): void
    {
        $workerProduksi = User::where('email', 'produksi@provis.id')->first();
        // Find task belonging to HRGA (not Produksi)
        $taskHrga = Wbs::whereHas('parentSubWbs.mainWbs', fn($q) => $q->where('projects_id', 1))
            ->whereHas('division', fn($q) => $q->where('divisi', 'HRGA'))
            ->first();

        $response = $this->actingAs($workerProduksi)
            ->withSession(['_token' => 'tok123'])
            ->post("/projects/1/tasks/{$taskHrga->id}/toggle", [
                '_token' => 'tok123',
            ]);

        $response->assertStatus(403);
    }
}
