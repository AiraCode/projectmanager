<?php

namespace Tests\Feature;

use App\Models\AiChatMessage;
use App\Models\AiChatSession;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiBetaAccessTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $regularUser;
    protected User $betaUser;

    protected function setUp(): void
    {
        parent::setUp();

        $superAdminRole = Role::firstOrCreate(['id' => 1], ['name' => 'SuperAdmin']);
        $picRole = Role::firstOrCreate(['id' => 2], ['name' => 'pic']);
        $workerRole = Role::firstOrCreate(['id' => 3], ['name' => 'worker']);

        $this->superAdmin = User::create([
            'username' => 'SuperAdminUser',
            'email' => 'admin@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $superAdminRole->id,
            'is_ai_beta_tester' => false, // even if false, SuperAdmin should have access!
        ]);

        $this->regularUser = User::create([
            'username' => 'RegularWorker',
            'email' => 'worker@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $workerRole->id,
            'is_ai_beta_tester' => false,
        ]);

        $this->betaUser = User::create([
            'username' => 'BetaTesterUser',
            'email' => 'beta@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $workerRole->id,
            'is_ai_beta_tester' => true,
        ]);
    }

    public function test_superadmin_always_has_ai_access_even_without_beta_flag(): void
    {
        $this->assertTrue($this->superAdmin->canAccessAi());
    }

    public function test_regular_user_without_beta_flag_does_not_have_ai_access(): void
    {
        $this->assertFalse($this->regularUser->canAccessAi());
    }

    public function test_user_with_beta_flag_has_ai_access(): void
    {
        $this->assertTrue($this->betaUser->canAccessAi());
    }

    public function test_middleware_blocks_non_beta_user(): void
    {
        \Illuminate\Support\Facades\Route::middleware(['web', 'auth', 'ai.beta'])
            ->get('/test-ai-endpoint', function () {
                return response()->json(['status' => 'granted']);
            });

        // 1. Regular user gets 403
        $response = $this->actingAs($this->regularUser)->getJson('/test-ai-endpoint');
        $response->assertStatus(403);

        // 2. Beta user gets 200
        $response = $this->actingAs($this->betaUser)->getJson('/test-ai-endpoint');
        $response->assertStatus(200)->assertJson(['status' => 'granted']);

        // 3. SuperAdmin gets 200
        $response = $this->actingAs($this->superAdmin)->getJson('/test-ai-endpoint');
        $response->assertStatus(200)->assertJson(['status' => 'granted']);
    }

    public function test_superadmin_can_toggle_ai_beta_tester_on_user(): void
    {
        $this->assertFalse((bool) $this->regularUser->is_ai_beta_tester);

        $response = $this->actingAs($this->superAdmin)->put("/admin/users/{$this->regularUser->id}", [
            'username' => 'RegularWorker',
            'email' => 'worker@provis.id',
            'roles_id' => $this->regularUser->roles_id,
            'is_ai_beta_tester' => true,
        ]);

        $response->assertSessionHasNoErrors();
        $this->assertTrue((bool) $this->regularUser->fresh()->is_ai_beta_tester);
        $this->assertTrue($this->regularUser->fresh()->canAccessAi());
    }

    public function test_ai_chat_session_and_message_relationship(): void
    {
        $session = AiChatSession::create([
            'user_id' => $this->betaUser->id,
            'title' => 'Diskusi Jadwal Proyek',
        ]);

        $msg1 = AiChatMessage::create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Tolong cek jadwal proyek X',
        ]);

        $msg2 = AiChatMessage::create([
            'session_id' => $session->id,
            'role' => 'assistant',
            'content' => 'Jadwal proyek X saat ini on track.',
            'metadata' => ['tokens' => 45],
        ]);

        $this->assertCount(2, $session->messages);
        $this->assertEquals('user', $session->messages[0]->role);
        $this->assertEquals(45, $session->messages[1]->metadata['tokens']);
        $this->assertEquals($this->betaUser->id, $session->user->id);
    }
}

