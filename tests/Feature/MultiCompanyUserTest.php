<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use App\Models\MainWbs;
use App\Models\SubWbs;
use App\Models\Wbs;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MultiCompanyUserTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;


    public function test_superadmin_cannot_assign_multiple_companies_without_agreement(): void
    {
        $superadmin = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->first();
        $roleWorker = Role::where('name', 'worker')->first();
        $companies = Company::take(2)->get();

        $response = $this->actingAs($superadmin)->post('/admin/users', [
            'username' => 'multi_worker_no_agreement',
            'email' => 'worker_no_agree@provis.id',
            'password' => 'Password123',
            'roles_id' => $roleWorker->id,
            'company_ids' => $companies->pluck('id')->toArray(),
            'multi_company_agreement' => false,
        ]);

        $response->assertSessionHasErrors('multi_company_agreement');
        $this->assertDatabaseMissing('users', ['email' => 'worker_no_agree@provis.id']);
    }

    public function test_superadmin_can_assign_multiple_companies_with_agreement(): void
    {
        $superadmin = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->first();
        $roleWorker = Role::where('name', 'worker')->first();
        $companies = Company::take(2)->get();

        $response = $this->actingAs($superadmin)->post('/admin/users', [
            'username' => 'multi_worker_agreed',
            'email' => 'worker_agreed@provis.id',
            'password' => 'Password123',
            'roles_id' => $roleWorker->id,
            'company_ids' => $companies->pluck('id')->toArray(),
            'multi_company_agreement' => true,
        ]);

        $response->assertSessionHas('success');
        $createdUser = User::where('email', 'worker_agreed@provis.id')->first();
        $this->assertNotNull($createdUser);
        $this->assertCount(2, $createdUser->companies);
        $this->assertTrue($createdUser->hasCompany($companies[0]->id));
        $this->assertTrue($createdUser->hasCompany($companies[1]->id));
    }

    public function test_superadmin_can_update_user_to_multiple_companies_with_agreement(): void
    {
        $superadmin = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->first();
        $pic = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->first();
        $companies = Company::take(3)->get();

        // Update PIC to belong to 2 companies
        $response = $this->actingAs($superadmin)->put("/admin/users/{$pic->id}", [
            'username' => $pic->username,
            'email' => $pic->email,
            'roles_id' => $pic->roles_id,
            'company_ids' => [$companies[0]->id, $companies[1]->id],
            'multi_company_agreement' => true,
        ]);

        $response->assertSessionHas('success');
        $pic->refresh();
        $this->assertCount(2, $pic->companies);
        $this->assertTrue($pic->hasCompany($companies[0]->id));
        $this->assertTrue($pic->hasCompany($companies[1]->id));
    }

    public function test_worker_with_multiple_companies_can_access_projects_in_both_companies(): void
    {
        $superadmin = User::whereHas('role', fn($q) => $q->where('name', 'SuperAdmin'))->first();
        $roleWorker = Role::where('name', 'worker')->first();
        $company1 = Company::find(1);
        $company2 = Company::find(2);
        $company3 = Company::find(3);

        $project1 = Project::where('companies_id', 1)->first();
        $project2 = Project::where('companies_id', 2)->first();
        $project3 = Project::where('companies_id', 3)->first();

        // Create a worker assigned to company 1 and 2 with project_access to project 1 and 2
        $worker = User::create([
            'username' => 'Cross Company Worker',
            'email' => 'cross_worker@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $roleWorker->id,
            'companies_id' => $company1->id,
            'permission_matrix' => [
                'sidebar' => ['Dashboard', 'Tasks'],
                'features' => ['tasks' => ['view', 'toggle_status']],
                'project_access' => [
                    $project1->id => ['view_project' => true, 'view_progress' => true],
                    $project2->id => ['view_project' => true, 'view_progress' => true],
                    $project3->id => ['view_project' => true, 'view_progress' => true],
                ],
            ],
        ]);
        $worker->companies()->sync([$company1->id, $company2->id]);

        // Worker can access project 1 tasks
        $res1 = $this->actingAs($worker)->get("/tasks?project_id={$project1->id}");
        $this->assertEquals(200, $res1->getStatusCode());

        // Worker can access project 2 tasks
        $res2 = $this->actingAs($worker)->get("/tasks?project_id={$project2->id}");
        $this->assertEquals(200, $res2->getStatusCode());

        // Worker CANNOT access project 3 tasks (company 3 is not assigned to worker)
        $res3 = $this->actingAs($worker)->get("/tasks?project_id={$project3->id}");
        $res3->assertStatus(403);
    }

    public function test_pic_cannot_assign_multiple_companies_when_creating_worker(): void
    {
        $pic = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->first();
        // Give PIC user creation permission
        $matrix = $pic->permission_matrix ?? [];
        $matrix['features']['users'] = ['create'];
        $pic->permission_matrix = $matrix;
        $pic->save();

        $roleWorker = Role::where('name', 'worker')->first();
        $companies = Company::take(2)->get();

        // PIC attempts to create a worker with 2 companies -> must get 403 Forbidden
        $response = $this->actingAs($pic)->post('/users', [
            'username' => 'Worker Multi Attempt',
            'email' => 'worker_multi@provis.id',
            'password' => 'Password123',
            'roles_id' => $roleWorker->id,
            'company_ids' => $companies->pluck('id')->toArray(),
            'multi_company_agreement' => true,
        ]);

        $response->assertStatus(403);
        $this->assertNull(User::where('email', 'worker_multi@provis.id')->first());

        // PIC creates a worker normally -> assigned to PIC's company only
        $validResponse = $this->actingAs($pic)->post('/users', [
            'username' => 'Worker by PIC',
            'email' => 'worker_by_pic@provis.id',
            'password' => 'Password123',
            'roles_id' => $roleWorker->id,
            'companies_id' => $pic->companies_id,
        ]);

        $validResponse->assertRedirect();
        $created = User::where('email', 'worker_by_pic@provis.id')->first();
        $this->assertNotNull($created);
        $this->assertCount(1, $created->companies);
        $this->assertEquals($pic->companies_id, $created->companies_id);
    }

    public function test_pic_with_multiple_companies_can_access_projects_in_both_companies(): void
    {
        $pic = User::whereHas('role', fn($q) => $q->where('name', 'pic'))->first();
        $company1 = Company::find(1);
        $company2 = Company::find(2);
        $company3 = Company::find(3);

        $project1 = Project::where('companies_id', 1)->first();
        $project2 = Project::where('companies_id', 2)->first();
        $project3 = Project::where('companies_id', 3)->first();

        // Assign PIC to company 1 and company 2
        $pic->companies()->sync([$company1->id, $company2->id]);

        // PIC can access project 1
        $res1 = $this->actingAs($pic)->get("/projects/{$project1->id}");
        $this->assertNotEquals(403, $res1->getStatusCode());

        // PIC can access project 2
        $res2 = $this->actingAs($pic)->get("/projects/{$project2->id}");
        $this->assertNotEquals(403, $res2->getStatusCode());

        // PIC CANNOT access project 3 (company 3 is not assigned to PIC)
        $res3 = $this->actingAs($pic)->get("/projects/{$project3->id}");
        $res3->assertStatus(403);
    }
}
