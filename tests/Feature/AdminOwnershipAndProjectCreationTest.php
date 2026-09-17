<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminOwnershipAndProjectCreationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_user_can_authenticate_and_receive_role_and_ownership_status(): void
    {
        // Admin 1 login
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@jeker.id',
            'password' => 'admin123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.can_create_project', false)
            ->assertJsonPath('user.owned_project.name', 'Pembangunan Pabrik Baru Tahap II');

        // Admin 2 (unassigned) login
        $response2 = $this->postJson('/api/auth/login', [
            'email' => 'admin2@jeker.id',
            'password' => 'admin123',
        ]);

        $response2->assertStatus(200)
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.can_create_project', true)
            ->assertJsonPath('user.owned_project', null);

        // PIC login
        $response3 = $this->postJson('/api/auth/login', [
            'email' => 'engineering@jeker.id',
            'password' => 'pic123',
        ]);

        $response3->assertStatus(200)
            ->assertJsonPath('user.role', 'pic')
            ->assertJsonPath('user.pic_role', 'Engineering')
            ->assertJsonPath('user.can_create_project', false);
    }

    public function test_admin_ownership_rule_enforced_when_admin_already_owns_a_project(): void
    {
        $admin1 = User::where('email', 'admin@jeker.id')->first();
        $company2 = Company::where('code', 'IPN')->first();

        // Attempt to create a second project with Admin 1
        $response = $this->actingAs($admin1)->postJson('/api/projects', [
            'company_id' => $company2->id,
            'name' => 'Second Project Attempt',
            'project_manager' => 'Budi Santoso',
            'start_date' => '2025-01-01',
            'end_date' => '2026-01-01',
            'total_budget' => 1000000000,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['admin_id']);
    }

    public function test_unassigned_admin_can_create_project_and_template_is_automatically_loaded(): void
    {
        $admin2 = User::where('email', 'admin2@jeker.id')->first();
        $company2 = Company::where('code', 'IPN')->first();

        $response = $this->actingAs($admin2)->postJson('/api/projects', [
            'company_id' => $company2->id,
            'name' => 'Projek Ekspansi Jawa Timur',
            'project_manager' => 'Siti Rahma',
            'start_date' => '2025-02-01',
            'end_date' => '2026-12-31',
            'total_budget' => 20000000000,
            'description' => 'Ekspansi fasilitas baru PT Indoprima Nusantara.',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('project.name', 'Projek Ekspansi Jawa Timur')
            ->assertJsonPath('project.company.name', 'PT Indoprima Nusantara');

        $createdProject = Project::where('name', 'Projek Ekspansi Jawa Timur')->first();
        $this->assertNotNull($createdProject);

        // Verify the 17 fixed Main Jobs were loaded
        $this->assertEquals(17, $createdProject->mainJobs()->count());

        // Verify the Sub Main Jobs were loaded with fixed PIC assignments
        $this->assertEquals(72, $createdProject->subMainJobs()->count());

        // Verify that Admin 2 now owns a project and cannot create another one
        $this->assertFalse($admin2->fresh()->canCreateProject());

        $secondAttempt = $this->actingAs($admin2)->postJson('/api/projects', [
            'company_id' => $company2->id,
            'name' => 'Third Project Attempt',
            'project_manager' => 'Siti Rahma',
            'start_date' => '2025-05-01',
        ]);
        $secondAttempt->assertStatus(422)->assertJsonValidationErrors(['admin_id']);
    }

    public function test_pic_user_cannot_create_project(): void
    {
        $picUser = User::where('email', 'engineering@jeker.id')->first();
        $company = Company::first();

        $response = $this->actingAs($picUser)->postJson('/api/projects', [
            'company_id' => $company->id,
            'name' => 'Unauthorized Project by PIC',
            'project_manager' => 'Andi Prasetyo',
            'start_date' => '2025-01-01',
        ]);

        $response->assertStatus(403);
    }
}
