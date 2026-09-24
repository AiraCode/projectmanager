<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Seed database to have roles, companies, etc.
        $this->artisan('db:seed');
    }

    public function test_superadmin_can_create_user()
    {
        $superadmin = User::whereHas('role', function($q) { $q->where('name', 'SuperAdmin'); })->first();
        $roleWorker = Role::where('name', 'worker')->first();
        $company = Company::first();

        $response = $this->actingAs($superadmin)->post('/users', [
            'username' => 'Test Worker',
            'email' => 'testworker@provis.id',
            'password' => 'password123',
            'roles_id' => $roleWorker->id,
            'companies_id' => $company->id,
        ]);

        $response->assertSessionHas('success');
        $this->assertDatabaseHas('users', [
            'email' => 'testworker@provis.id',
            'created_by' => $superadmin->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $superadmin->id,
            'action' => 'CREATE_USER',
        ]);
    }

    public function test_pic_cannot_create_user()
    {
        $pic = User::whereHas('role', function($q) { $q->where('name', 'pic'); })->first();
        $roleWorker = Role::where('name', 'worker')->first();

        $response = $this->actingAs($pic)->post('/users', [
            'username' => 'Test Worker 2',
            'email' => 'testworker2@provis.id',
            'password' => 'password123',
            'roles_id' => $roleWorker->id,
            'companies_id' => $pic->companies_id,
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseMissing('users', [
            'email' => 'testworker2@provis.id',
        ]);
    }

    public function test_pic_can_update_project_access_for_own_worker()
    {
        $pic = User::whereHas('role', function($q) { $q->where('name', 'pic'); })->first();
        
        // Find a worker in the same company
        $worker = User::whereHas('role', function($q) { $q->where('name', 'worker'); })
                      ->where('companies_id', $pic->companies_id)
                      ->first();

        $project = Project::where('companies_id', $pic->companies_id)->first();

        $newMatrix = $worker->permission_matrix ?? [];
        $newMatrix['project_access'] = [
            $project->id => [
                'view_project' => true,
                'view_progress' => false,
                'edit_task' => true,
            ]
        ];

        $response = $this->actingAs($pic)->put('/users/' . $worker->id, [
            'permission_matrix' => $newMatrix
        ]);

        $response->assertSessionHas('success');
        $worker->refresh();
        $this->assertTrue($worker->permission_matrix['project_access'][$project->id]['view_project']);
        
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $pic->id,
            'action' => 'UPDATE_PROJECT_ACCESS',
        ]);
    }

    public function test_worker_cannot_access_unauthorized_project()
    {
        $worker = User::whereHas('role', function($q) { $q->where('name', 'worker'); })->first();
        $project = Project::where('companies_id', $worker->companies_id)->first();

        // Worker does not have project_access configured yet
        $response = $this->actingAs($worker)->get('/tasks?project_id=' . $project->id);
        
        // ProjectController resolveProjectForUser throws 403
        $response->assertStatus(403);
    }
}
