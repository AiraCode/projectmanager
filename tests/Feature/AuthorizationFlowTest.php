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

    public function test_pic_with_create_permission_cannot_create_admin_or_pic_roles()
    {
        $pic = User::whereHas('role', function($q) { $q->where('name', 'pic'); })->first();
        // Give PIC user creation permission
        $matrix = $pic->permission_matrix ?? [];
        $matrix['features']['users'] = ['create'];
        $pic->permission_matrix = $matrix;
        $pic->save();

        $roleAdminUtama = Role::where('name', 'admin_utama')->first();
        $roleAdminProgres = Role::where('name', 'admin_progres')->first();
        $rolePic = Role::where('name', 'pic')->first();

        // 1. Try create admin_utama
        $response1 = $this->actingAs($pic)->post('/users', [
            'username' => 'Illegal Admin Utama',
            'email' => 'illegal_admin_utama@provis.id',
            'password' => 'password123',
            'roles_id' => $roleAdminUtama->id,
            'companies_id' => $pic->companies_id,
        ]);
        $response1->assertStatus(403);
        $this->assertDatabaseMissing('users', ['email' => 'illegal_admin_utama@provis.id']);

        // 2. Try create admin_progres
        $response2 = $this->actingAs($pic)->post('/users', [
            'username' => 'Illegal Admin Progres',
            'email' => 'illegal_admin_progres@provis.id',
            'password' => 'password123',
            'roles_id' => $roleAdminProgres->id,
            'companies_id' => $pic->companies_id,
        ]);
        $response2->assertStatus(403);
        $this->assertDatabaseMissing('users', ['email' => 'illegal_admin_progres@provis.id']);

        // 3. Try create pic
        $response3 = $this->actingAs($pic)->post('/users', [
            'username' => 'Illegal PIC',
            'email' => 'illegal_pic@provis.id',
            'password' => 'password123',
            'roles_id' => $rolePic->id,
            'companies_id' => $pic->companies_id,
        ]);
        $response3->assertStatus(403);
        $this->assertDatabaseMissing('users', ['email' => 'illegal_pic@provis.id']);
    }

    public function test_pic_with_create_permission_can_create_worker()
    {
        $pic = User::whereHas('role', function($q) { $q->where('name', 'pic'); })->first();
        $matrix = $pic->permission_matrix ?? [];
        $matrix['features']['users'] = ['create'];
        $pic->permission_matrix = $matrix;
        $pic->save();

        $roleWorker = Role::where('name', 'worker')->first();

        $response = $this->actingAs($pic)->post('/users', [
            'username' => 'Valid Worker',
            'email' => 'valid_worker@provis.id',
            'password' => 'password123',
            'roles_id' => $roleWorker->id,
            'companies_id' => $pic->companies_id,
        ]);

        $response->assertSessionHas('success');
        $this->assertDatabaseHas('users', [
            'email' => 'valid_worker@provis.id',
            'roles_id' => $roleWorker->id,
            'companies_id' => $pic->companies_id,
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
