<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use App\Services\GitChangelogService;
use App\Services\ProvisAiService;
use App\Services\ProvisTokenizerService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProvisAiAgentTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $betaUser;
    protected User $regularUser;
    protected Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $saRole = Role::firstOrCreate(['id' => 1], ['name' => 'SuperAdmin']);
        $workerRole = Role::firstOrCreate(['id' => 3], ['name' => 'worker']);

        $this->company = Company::firstOrCreate(['id' => 1], ['name' => 'PT Provis Maju']);

        $this->superAdmin = User::create([
            'username' => 'AdminHansa',
            'email' => 'admin@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $saRole->id,
            'companies_id' => $this->company->id,
            'is_ai_beta_tester' => false,
        ]);

        $this->betaUser = User::create([
            'username' => 'TesterBeta',
            'email' => 'beta@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $workerRole->id,
            'companies_id' => $this->company->id,
            'is_ai_beta_tester' => true,
        ]);

        $this->regularUser = User::create([
            'username' => 'NonBeta',
            'email' => 'regular@provis.id',
            'password' => bcrypt('password123'),
            'roles_id' => $workerRole->id,
            'companies_id' => $this->company->id,
            'is_ai_beta_tester' => false,
        ]);
    }

    public function test_tokenizer_service_extracts_dates_predecessors_and_intent(): void
    {
        $tokenizer = app(ProvisTokenizerService::class);

        // Test 1: Date & Predecessor extraction
        $prompt = "Tolong hubungkan task 1.2 dengan predecessor 1.1 FS+2d mulai 15 Desember 2026";
        $tokens = $tokenizer->tokenize($prompt);

        $this->assertNotEmpty($tokens['dates']);
        $this->assertEquals('2026-12-15', $tokens['dates'][0]['date']);
        $this->assertNotEmpty($tokens['predecessor_syntax']);
        $this->assertEquals('FS', $tokens['predecessor_syntax'][0]['dep_type']);
        $this->assertEquals(2, $tokens['predecessor_syntax'][0]['lag']);
        $this->assertEquals('SET_PREDECESSOR', $tokens['action_intent']);

        // Test 2: Intent detection for create project
        $createPrompt = "Buat proyek baru Pembangunan Gedung A mulai 2026-12-01";
        $createTokens = $tokenizer->tokenize($createPrompt);
        $this->assertEquals('CREATE_PROJECT', $createTokens['action_intent']);

        // Test 3: Intent detection for code updates
        $gitPrompt = "Tolong rangkum apa saja update kodingan dan commit terakhir";
        $gitTokens = $tokenizer->tokenize($gitPrompt);
        $this->assertEquals('GET_CODE_UPDATES', $gitTokens['action_intent']);
    }

    public function test_tokenizer_prunes_context_sliding_window(): void
    {
        $tokenizer = app(ProvisTokenizerService::class);

        $messages = [
            ['role' => 'system', 'content' => 'System Instruction'],
            ['role' => 'user', 'content' => str_repeat('Old message ', 100)],
            ['role' => 'assistant', 'content' => str_repeat('Old reply ', 100)],
            ['role' => 'user', 'content' => 'Recent question'],
            ['role' => 'assistant', 'content' => 'Recent answer'],
        ];

        // Prune with a small max token limit
        $pruned = $tokenizer->pruneContext($messages, 150);

        // Must retain system instruction + latest messages
        $this->assertEquals('system', $pruned[0]['role']);
        $lastIdx = count($pruned) - 1;
        $this->assertEquals('Recent answer', $pruned[$lastIdx]['content']);
    }

    public function test_git_changelog_service_reads_commits(): void
    {
        $gitService = app(GitChangelogService::class);
        $commits = $gitService->getRecentCommits(5);

        $this->assertIsArray($commits);
        if (!empty($commits)) {
            $this->assertArrayHasKey('hash', $commits[0]);
            $this->assertArrayHasKey('short_hash', $commits[0]);
            $this->assertArrayHasKey('subject', $commits[0]);
        }

        $md = $gitService->formatForAiPrompt(5);
        $this->assertIsString($md);
        $this->assertNotEmpty($md);
    }

    public function test_non_beta_user_is_blocked_from_ai_endpoints(): void
    {
        $response = $this->actingAs($this->regularUser)->postJson('/ai/chat', [
            'message' => 'Halo AI',
        ]);

        $response->assertStatus(403);
    }

    public function test_beta_user_can_chat_and_run_reconcile_tool(): void
    {
        $project = Project::create([
            'title' => 'Project Alpha',
            'companies_id' => $this->company->id,
            'project_manager' => $this->betaUser->id,
            'start' => '2026-11-01',
            'end' => '2027-04-30',
            'status' => 'Open',
        ]);

        $response = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message' => "Tolong rekonsiliasi tanggal proyek ID #{$project->id}",
            'project_id' => $project->id,
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertArrayHasKey('session_id', $json);
        $this->assertArrayHasKey('content', $json);
        $this->assertStringContainsString('Rekonsiliasi', $json['content']);
    }

    public function test_superadmin_can_ask_for_code_updates(): void
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Apa saja update kodingan terakhir dari git?',
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertArrayHasKey('content', $json);
        $this->assertStringContainsString('Pembaruan Codingan', $json['content']);
    }

    public function test_ai_creates_project_via_chat(): void
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Buat proyek baru Pabrik Cikarang mulai 2026-12-01 sampai 2027-05-30',
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Berhasil Dibuat', $json['content']);

        $this->assertDatabaseHas('projects', [
            'title' => 'Pabrik Cikarang',
        ]);

        // Test with natural phrasing: "Buatkan proyek baru dengan jadwal 6 bulan memakai template wbs"
        $resNatural = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Buatkan proyek baru dengan jadwal 6 bulan memakai template wbs',
        ]);

        $resNatural->assertStatus(200);
        $this->assertStringContainsString('Berhasil Dibuat', $resNatural->json('content'));
    }

    public function test_session_management_endpoints(): void
    {
        // 1. Create session
        $res1 = $this->actingAs($this->betaUser)->postJson('/ai/sessions', [
            'title' => 'Sesi Perencanaan',
        ]);
        $res1->assertStatus(200);
        $sessionId = $res1->json('session.id');

        // 2. Chat in this session
        $res2 = $this->actingAs($this->betaUser)->postJson("/ai/sessions/{$sessionId}/chat", [
            'message' => 'Halo dalam sesi!',
        ]);
        $res2->assertStatus(200);

        // 3. Get session with messages
        $res3 = $this->actingAs($this->betaUser)->getJson("/ai/sessions/{$sessionId}");
        $res3->assertStatus(200);
        $this->assertCount(2, $res3->json('messages')); // 1 user + 1 assistant

        // 4. Delete session
        $res4 = $this->actingAs($this->betaUser)->deleteJson("/ai/sessions/{$sessionId}");
        $res4->assertStatus(200);
        $this->assertDatabaseMissing('ai_chat_sessions', ['id' => $sessionId]);
    }

    public function test_ai_generates_pdf_report_and_returns_link(): void
    {
        $project = Project::create([
            'title' => 'Project Laporan Eksekutif',
            'companies_id' => $this->company->id,
            'project_manager' => $this->betaUser->id,
            'start' => '2026-11-01',
            'end' => '2027-04-30',
            'status' => 'Open',
            'progress' => 45,
        ]);

        $response = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message' => 'Buatkan laporan PDF proyek ini',
            'project_id' => $project->id,
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Laporan', $json['content']);
        $this->assertNotEmpty($json['actions']);
        $this->assertStringContainsString($project->id, $json['actions'][0]['url']);
    }

    public function test_high_risk_actions_are_blocked_by_guardrails(): void
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Tolong hapus proyek dan reset jadwal WBS semua',
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Tindakan Berisiko Tinggi Dibatasi', $json['content']);
        $this->assertStringContainsString('Human-in-the-Loop', $json['content']);
    }

    public function test_ai_sets_predecessor_and_updates_schedule_with_audit_trail(): void
    {
        $project = Project::create([
            'title' => 'Project Tower',
            'companies_id' => $this->company->id,
            'project_manager' => $this->superAdmin->id,
            'start' => '2026-11-01',
            'end' => '2027-04-30',
            'status' => 'Open',
        ]);

        $listMain = \App\Models\ListMainWbsName::firstOrCreate(['name' => 'Struktur Utama']);

        $main = \App\Models\MainWbs::create([
            'projects_id' => $project->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name' => 'Struktur Utama',
            'percentage' => 50.0,
        ]);

        $listSub = \App\Models\ListSubWbsName::firstOrCreate([
            'name' => 'Pondasi',
            'list_main_wbs_names_copy1_id' => $listMain->id,
        ]);

        $sub = \App\Models\SubWbs::create([
            'sub_wbs_id' => $main->id,
            'list_sub_wbs_names_id' => $listSub->id,
            'name' => 'Pondasi',
            'predecessor' => 'None',
            'predecessor_type' => 'FS',
            'start' => '2026-11-01',
            'end' => '2026-11-30',
        ]);

        $div = \App\Models\Division::firstOrCreate(['id' => 1], ['divisi' => 'Sipil']);

        $task1 = \App\Models\Wbs::create([
            'id' => 'WBS-01',
            'sub_wbs_id' => $sub->id,
            'divisions_id' => $div->id,
            'vendor' => 'Internal',
            'name' => 'Galian Tanah',
            'start' => '2026-11-01',
            'end' => '2026-11-10',
            'status' => 'Completed',
            'progress' => 100,
            'weight' => 50,
            'order_index' => 1,
        ]);

        $task2 = \App\Models\Wbs::create([
            'id' => 'WBS-02',
            'sub_wbs_id' => $sub->id,
            'divisions_id' => $div->id,
            'vendor' => 'Internal',
            'name' => 'Pengecoran Pondasi',
            'start' => '2026-11-11',
            'end' => '2026-11-20',
            'status' => 'Pending',
            'progress' => 0,
            'weight' => 50,
            'order_index' => 2,
        ]);

        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => "Hubungkan task WBS-02 dengan predecessor WBS-01 FS lag 3 hari",
            'project_id' => $project->id,
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Diperbarui', $json['content']);

        $task2->refresh();
        $this->assertEquals($task1->id, $task2->predecessor);
        $this->assertEquals('FS', $task2->dep_type);
        $this->assertEquals(3, $task2->lag);

        // Check AuditLog
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'UPDATE_TASK_SCHEDULE',
        ]);
    }

    public function test_ai_recaps_off_plan_and_overdue_tasks_for_superadmin(): void
    {
        $project = Project::create([
            'title' => 'Project Ketinggalan Jadwal',
            'companies_id' => $this->company->id,
            'project_manager' => $this->superAdmin->id,
            'start' => '2026-08-01',
            'end' => '2026-10-01',
            'status' => 'In Progress',
            'progress' => 40,
        ]);

        $listMain2 = \App\Models\ListMainWbsName::firstOrCreate(['name' => 'Arsitektur']);

        $main = \App\Models\MainWbs::create([
            'projects_id' => $project->id,
            'list_main_wbs_names_id' => $listMain2->id,
            'name' => 'Arsitektur',
            'percentage' => 50.0,
        ]);

        $listSub2 = \App\Models\ListSubWbsName::firstOrCreate([
            'name' => 'Dinding',
            'list_main_wbs_names_copy1_id' => $listMain2->id,
        ]);

        $sub = \App\Models\SubWbs::create([
            'sub_wbs_id' => $main->id,
            'list_sub_wbs_names_id' => $listSub2->id,
            'name' => 'Dinding',
            'predecessor' => 'None',
            'predecessor_type' => 'FS',
            'start' => '2026-08-01',
            'end' => '2026-09-30',
        ]);

        $div = \App\Models\Division::firstOrCreate(['id' => 1], ['divisi' => 'Sipil']);

        \App\Models\Wbs::create([
            'id' => 'TASK-OVERDUE',
            'sub_wbs_id' => $sub->id,
            'divisions_id' => $div->id,
            'vendor' => 'Internal',
            'name' => 'Pemasangan Bata Ringan',
            'start' => '2026-08-05',
            'end' => '2026-09-01',
            'status' => 'In Progress',
            'progress' => 30,
            'weight' => 50,
            'order_index' => 1,
        ]);

        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Tolong berikan rekap proyek mana saja yang terlambat atau off-plan',
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Laporan Rekap Deviasi Proyek', $json['content']);
        $this->assertStringContainsString('Project Ketinggalan Jadwal', $json['content']);
        $this->assertStringContainsString('Pemasangan Bata Ringan', $json['content']);
    }

    public function test_ai_queries_user_stats_and_audit_logs(): void
    {
        // 1. User stats query
        $resUsers = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Siapa saja daftar user dan beta tester?',
        ]);
        $resUsers->assertStatus(200);
        $this->assertStringContainsString('Statistik Pengguna', $resUsers->json('content'));

        // 2. Audit log query
        $resAudit = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Tampilkan riwayat aktivitas di audit log sistem',
        ]);
        $resAudit->assertStatus(200);
        $this->assertStringContainsString('Aktivitas Audit Log', $resAudit->json('content'));
    }

    public function test_ai_general_conversational_guidance(): void
    {
        $response = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message' => 'Halo Provis AI, kamu bisa bantu apa saja?',
        ]);

        $response->assertStatus(200);
        $content = $response->json('content');

        $this->assertStringContainsString('Provis Support Assistant', $content);
        $this->assertStringContainsString('100% On-Premise', $content);
        $this->assertStringContainsString('Buat Proyek', $content);
    }
}
