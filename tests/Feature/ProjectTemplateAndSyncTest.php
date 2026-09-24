<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Project;
use App\Models\MainWbs;
use App\Models\SubWbs;

class ProjectTemplateAndSyncTest extends TestCase
{
    public function test_existing_project_has_all_17_main_jobs_in_database(): void
    {
        $project = Project::first();
        $this->assertNotNull($project);

        $mainWbsCount = MainWbs::where('projects_id', $project->id)->count();
        $this->assertEquals(17, $mainWbsCount, 'Project should have exactly 17 Main Jobs from template.');

        $subWbsCount = SubWbs::whereHas('mainWbs', fn($q) => $q->where('projects_id', $project->id))->count();
        $this->assertGreaterThanOrEqual(72, $subWbsCount, 'Project should have at least 72 Sub Main Jobs from template.');
    }

    public function test_admin_utama_can_view_project_dashboard_with_17_main_jobs(): void
    {
        $admin = User::where('email', 'admin@provis.id')->first();
        $project = Project::first();

        $response = $this->actingAs($admin)->get("/projects/{$project->id}");
        $response->assertStatus(200);

        // Inertia page should receive project with 17 main jobs
        $response->assertInertia(fn ($page) => 
            $page->component('DashboardPage')
                ->has('project.mainJobs', 17)
        );
    }

    public function test_pic_can_view_tasks_page_with_17_main_jobs(): void
    {
        $pic = User::where('email', 'pic1@provis.id')->first();
        $project = Project::where('project_manager', $pic->id)->first();

        $response = $this->actingAs($pic)->get("/tasks");
        $response->assertStatus(200);

        $response->assertInertia(fn ($page) => 
            $page->component('TasksPage')
                ->has('project.mainJobs', 17)
        );
    }

    public function test_pic_can_view_project_breakdown_page_with_17_main_jobs(): void
    {
        $pic = User::where('email', 'pic1@provis.id')->first();

        $response = $this->actingAs($pic)->get("/project");
        $response->assertStatus(200);

        $response->assertInertia(fn ($page) => 
            $page->component('ProjectDetailPage')
                ->has('project.mainJobs', 17)
        );
    }

    public function test_pic_can_view_timeline_page(): void
    {
        $pic = User::where('email', 'pic1@provis.id')->first();

        $response = $this->actingAs($pic)->get("/timeline");
        $response->assertStatus(200);

        $response->assertInertia(fn ($page) => 
            $page->component('TimelinePage')
                ->has('project.mainJobs', 17)
        );
    }

    public function test_pic_can_view_weekly_page(): void
    {
        $pic = User::where('email', 'pic1@provis.id')->first();

        $response = $this->actingAs($pic)->get("/weekly");
        $response->assertStatus(200);

        $response->assertInertia(fn ($page) => 
            $page->component('WeeklyPage')
                ->has('project.mainJobs', 17)
        );
    }
}
