<?php

namespace Tests\Feature;

use App\Models\BudgetEntry;
use App\Models\Company;
use App\Models\Division;
use App\Models\ListMainWbsName;
use App\Models\ListSubWbsName;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Role;
use App\Models\SubWbs;
use App\Models\User;
use App\Models\Wbs;
use App\Services\GitChangelogService;
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

        $saRole     = Role::firstOrCreate(['id' => 1], ['name' => 'SuperAdmin']);
        $workerRole = Role::firstOrCreate(['id' => 3], ['name' => 'worker']);

        $this->company = Company::firstOrCreate(['id' => 1], ['name' => 'PT Provis Maju']);

        $this->superAdmin = User::create([
            'username'          => 'AdminHansa',
            'email'             => 'admin@provis.id',
            'password'          => bcrypt('password123'),
            'roles_id'          => $saRole->id,
            'companies_id'      => $this->company->id,
            'is_ai_beta_tester' => false,
        ]);

        $this->betaUser = User::create([
            'username'          => 'TesterBeta',
            'email'             => 'beta@provis.id',
            'password'          => bcrypt('password123'),
            'roles_id'          => $workerRole->id,
            'companies_id'      => $this->company->id,
            'is_ai_beta_tester' => true,
        ]);
        $this->betaUser->companies()->sync([$this->company->id]);

        $this->regularUser = User::create([
            'username'          => 'NonBeta',
            'email'             => 'regular@provis.id',
            'password'          => bcrypt('password123'),
            'roles_id'          => $workerRole->id,
            'companies_id'      => $this->company->id,
            'is_ai_beta_tester' => false,
        ]);
    }

    public function test_tokenizer_service_extracts_dates_predecessors_language_and_intent(): void
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
        $this->assertEquals('id', $tokens['language']);

        // Test 2: Intent detection for create project
        $createPrompt = "Buat proyek baru Pembangunan Gedung A mulai 2026-12-01";
        $createTokens = $tokenizer->tokenize($createPrompt);
        $this->assertEquals('CREATE_PROJECT', $createTokens['action_intent']);

        // Test 3: How-to question MUST NOT trigger write intent
        $howToTokens = $tokenizer->tokenize("Bagaimana cara membuat proyek baru?");
        $this->assertEquals('KNOWLEDGE_BASE', $howToTokens['action_intent']);

        // Test 4: English auto-detection
        $enTokens = $tokenizer->tokenize("What does Outstanding status mean?");
        $this->assertEquals('en', $enTokens['language']);
        $this->assertEquals('KNOWLEDGE_BASE', $enTokens['action_intent']);

        // Test 5: Intent detection for code updates
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

        $pruned = $tokenizer->pruneContext($messages, 150);

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

    public function test_beta_user_can_chat_and_run_reconcile_tool_with_confirmation(): void
    {
        $project = Project::create([
            'title'           => 'Project Alpha',
            'companies_id'    => $this->company->id,
            'project_manager' => $this->betaUser->id,
            'start'           => '2026-11-01',
            'end'             => '2027-04-30',
            'status'          => 'Open',
        ]);

        // Step 1: Preview & request confirmation
        $step1 = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message'    => "Tolong rekonsiliasi tanggal proyek ID #{$project->id}",
            'project_id' => $project->id,
        ]);

        $step1->assertStatus(200);
        $this->assertTrue((bool) $step1->json('metadata.requires_confirmation'));
        $this->assertStringContainsString('Konfirmasi Rekonsiliasi', $step1->json('content'));

        // Step 2: Confirm with "Ya"
        $sessionId = $step1->json('session_id');
        $step2 = $this->actingAs($this->betaUser)->postJson("/ai/sessions/{$sessionId}/chat", [
            'message'    => 'Ya',
            'project_id' => $project->id,
        ]);

        $step2->assertStatus(200);
        $this->assertStringContainsString('Rekonsiliasi Tanggal Selesai', $step2->json('content'));
    }

    public function test_superadmin_can_ask_for_code_updates_while_worker_is_restricted(): void
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Apa saja update kodingan terakhir dari git?',
        ]);

        $response->assertStatus(200);
        $this->assertStringContainsString('Pembaruan Codingan', $response->json('content'));

        // Non-SuperAdmin beta tester is restricted from viewing git code history
        $workerRes = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message' => 'Apa saja update kodingan terakhir dari git?',
        ]);
        $workerRes->assertStatus(200);
        $this->assertStringContainsString('Akses Dibatasi', $workerRes->json('content'));
    }

    public function test_ai_creates_project_via_chat_with_two_step_confirmation_and_cancellation(): void
    {
        // Step 1: Complete prompt proposes creation (DB must NOT be mutated yet)
        $step1 = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Buat proyek baru Pabrik Cikarang milik PT Provis Maju mulai 2026-12-01 sampai 2027-05-30',
        ]);

        $step1->assertStatus(200);
        $this->assertTrue((bool) $step1->json('metadata.requires_confirmation'));
        $this->assertDatabaseMissing('projects', ['title' => 'Pabrik Cikarang']);

        // Step 2: Confirm creation
        $sessionId = $step1->json('session_id');
        $step2 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$sessionId}/chat", [
            'message' => 'Konfirmasi',
        ]);

        $step2->assertStatus(200);
        $this->assertStringContainsString('Berhasil Dibuat', $step2->json('content'));
        $this->assertDatabaseHas('projects', ['title' => 'Pabrik Cikarang']);

        // Test Interactive Slot-Filling when company is missing
        $draftStep1 = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'tolong buatkan projek bernama TESTING selama durasi 70 hari',
        ]);
        $draftStep1->assertStatus(200);
        $this->assertTrue((bool) $draftStep1->json('metadata.awaiting_input'));
        $this->assertStringContainsString('nama perusahaan', $draftStep1->json('content'));

        $draftStep2 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$draftStep1->json('session_id')}/chat", [
            'message' => 'PT. Anugerah Utama',
        ]);
        $draftStep2->assertStatus(200);
        $this->assertTrue((bool) $draftStep2->json('metadata.requires_confirmation'));
        $this->assertStringContainsString('PT. Anugerah Utama', $draftStep2->json('content'));

        // Test Cancellation flow
        $cancelStep1 = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Buat proyek baru Pabrik Dibatalkan milik PT Provis Maju selama 6 bulan',
        ]);
        $cancelStep1->assertStatus(200);
        $this->assertTrue((bool) $cancelStep1->json('metadata.requires_confirmation'));

        $cancelStep2 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$cancelStep1->json('session_id')}/chat", [
            'message' => 'Batal',
        ]);
        $cancelStep2->assertStatus(200);
        $this->assertStringContainsString('Dibatalkan', $cancelStep2->json('content'));
        $this->assertDatabaseMissing('projects', ['title' => 'Pabrik Dibatalkan']);
    }

    public function test_session_management_endpoints(): void
    {
        $res1 = $this->actingAs($this->betaUser)->postJson('/ai/sessions', [
            'title' => 'Sesi Perencanaan',
        ]);
        $res1->assertStatus(200);
        $sessionId = $res1->json('session.id');

        $res2 = $this->actingAs($this->betaUser)->postJson("/ai/sessions/{$sessionId}/chat", [
            'message' => 'Halo dalam sesi!',
        ]);
        $res2->assertStatus(200);

        $res3 = $this->actingAs($this->betaUser)->getJson("/ai/sessions/{$sessionId}");
        $res3->assertStatus(200);
        $this->assertCount(2, $res3->json('messages'));

        $res4 = $this->actingAs($this->betaUser)->deleteJson("/ai/sessions/{$sessionId}");
        $res4->assertStatus(200);
        $this->assertDatabaseMissing('ai_chat_sessions', ['id' => $sessionId]);
    }

    public function test_ai_generates_pdf_report_and_returns_link(): void
    {
        $project = Project::create([
            'title'           => 'Project Laporan Eksekutif',
            'companies_id'    => $this->company->id,
            'project_manager' => $this->betaUser->id,
            'start'           => '2026-11-01',
            'end'             => '2027-04-30',
            'status'          => 'Open',
            'progress'        => 45,
        ]);

        $response = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message'    => 'Buatkan laporan PDF proyek ini',
            'project_id' => $project->id,
        ]);

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertStringContainsString('Laporan', $json['content']);
        $this->assertNotEmpty($json['actions']);
        $this->assertStringContainsString((string) $project->id, $json['actions'][0]['url']);
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

    public function test_ai_sets_predecessor_and_updates_schedule_with_confirmation_and_audit_trail(): void
    {
        $project = Project::create([
            'title'           => 'Project Tower',
            'companies_id'    => $this->company->id,
            'project_manager' => $this->superAdmin->id,
            'start'           => '2026-11-01',
            'end'             => '2027-04-30',
            'status'          => 'Open',
        ]);

        $listMain = ListMainWbsName::firstOrCreate(['name' => 'Struktur Utama']);
        $main = MainWbs::create([
            'projects_id'            => $project->id,
            'list_main_wbs_names_id' => $listMain->id,
            'name'                   => 'Struktur Utama',
            'percentage'             => 50.0,
        ]);

        $listSub = ListSubWbsName::firstOrCreate([
            'name'                         => 'Pondasi',
            'list_main_wbs_names_copy1_id' => $listMain->id,
        ]);
        $sub = SubWbs::create([
            'sub_wbs_id'            => $main->id,
            'list_sub_wbs_names_id' => $listSub->id,
            'name'                  => 'Pondasi',
            'predecessor'           => 'None',
            'predecessor_type'      => 'FS',
            'start'                 => '2026-11-01',
            'end'                   => '2026-11-30',
        ]);

        $div = Division::firstOrCreate(['id' => 1], ['divisi' => 'Sipil']);

        $task1 = Wbs::create([
            'id'           => 'WBS-01',
            'sub_wbs_id'   => $sub->id,
            'divisions_id' => $div->id,
            'vendor'       => 'Internal',
            'name'         => 'Galian Tanah',
            'start'        => '2026-11-01',
            'end'          => '2026-11-10',
            'status'       => 'Completed',
            'progress'     => 100,
            'weight'       => 50,
            'order_index'  => 1,
        ]);

        $task2 = Wbs::create([
            'id'           => 'WBS-02',
            'sub_wbs_id'   => $sub->id,
            'divisions_id' => $div->id,
            'vendor'       => 'Internal',
            'name'         => 'Pengecoran Pondasi',
            'start'        => '2026-11-11',
            'end'          => '2026-11-20',
            'status'       => 'Open',
            'progress'     => 0,
            'weight'       => 50,
            'order_index'  => 2,
        ]);

        // Step 1: Preview schedule & predecessor update
        $step1 = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message'    => "Hubungkan task WBS-02 dengan predecessor WBS-01 FS lag 3 hari",
            'project_id' => $project->id,
        ]);

        $step1->assertStatus(200);
        $this->assertTrue((bool) $step1->json('metadata.requires_confirmation'));

        // Step 2: Confirm update
        $step2 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$step1->json('session_id')}/chat", [
            'message'    => 'Ya',
            'project_id' => $project->id,
        ]);

        $step2->assertStatus(200);
        $this->assertStringContainsString('Diperbarui', $step2->json('content'));

        $task2->refresh();
        $this->assertEquals($task1->id, $task2->predecessor);
        $this->assertEquals('FS', $task2->dep_type);
        $this->assertEquals(3, $task2->lag);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'UPDATE_TASK_SCHEDULE',
        ]);
    }

    public function test_ai_recaps_off_plan_and_overdue_tasks_for_superadmin(): void
    {
        $project = Project::create([
            'title'           => 'Project Ketinggalan Jadwal',
            'companies_id'    => $this->company->id,
            'project_manager' => $this->superAdmin->id,
            'start'           => '2026-08-01',
            'end'             => '2026-10-01',
            'status'          => 'On Track',
            'progress'        => 40,
        ]);

        $listMain2 = ListMainWbsName::firstOrCreate(['name' => 'Arsitektur']);
        $main = MainWbs::create([
            'projects_id'            => $project->id,
            'list_main_wbs_names_id' => $listMain2->id,
            'name'                   => 'Arsitektur',
            'percentage'             => 50.0,
        ]);

        $listSub2 = ListSubWbsName::firstOrCreate([
            'name'                         => 'Dinding',
            'list_main_wbs_names_copy1_id' => $listMain2->id,
        ]);
        $sub = SubWbs::create([
            'sub_wbs_id'            => $main->id,
            'list_sub_wbs_names_id' => $listSub2->id,
            'name'                  => 'Dinding',
            'predecessor'           => 'None',
            'predecessor_type'      => 'FS',
            'start'                 => '2026-08-01',
            'end'                   => '2026-09-30',
        ]);

        $div = Division::firstOrCreate(['id' => 1], ['divisi' => 'Sipil']);

        Wbs::create([
            'id'           => 'TASK-OVERDUE',
            'sub_wbs_id'   => $sub->id,
            'divisions_id' => $div->id,
            'vendor'       => 'Internal',
            'name'         => 'Pemasangan Bata Ringan',
            'start'        => '2026-08-05',
            'end'          => '2026-09-01',
            'status'       => 'On Track',
            'progress'     => 30,
            'weight'       => 50,
            'order_index'  => 1,
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
        $resUsers = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Siapa saja daftar user dan beta tester?',
        ]);
        $resUsers->assertStatus(200);
        $this->assertStringContainsString('Statistik Pengguna', $resUsers->json('content'));

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

    public function test_ai_knowledge_base_bilingual_and_multi_turn_analytics_with_rbac(): void
    {
        $otherCompany = Company::create(['name' => 'PT Rahasia Lain']);
        $divMtc = Division::create(['divisi' => 'Maintenance']);

        $projectA = Project::create([
            'title'           => 'UBC SMELTER',
            'companies_id'    => $this->company->id,
            'project_manager' => $this->superAdmin->id,
            'start'           => Carbon::today()->subDays(10)->format('Y-m-d'),
            'end'             => Carbon::today()->addDays(40)->format('Y-m-d'),
            'status'          => 'On Track',
            'progress'        => 40,
            'is_private'      => false,
        ]);

        $privateOther = Project::create([
            'title'           => 'SECRET OTHER CORP',
            'companies_id'    => $otherCompany->id,
            'project_manager' => $this->superAdmin->id,
            'start'           => Carbon::today()->format('Y-m-d'),
            'end'             => Carbon::today()->addDays(30)->format('Y-m-d'),
            'status'          => 'Open',
            'progress'        => 0,
            'is_private'      => true,
        ]);

        ProjectMember::create([
            'project_id'  => $projectA->id,
            'user_id'     => $this->betaUser->id,
            'division_id' => $divMtc->id,
            'project_role'=> 'worker',
        ]);

        BudgetEntry::create([
            'projects_id'  => $projectA->id,
            'tanggal'      => Carbon::today()->format('Y-m-d'),
            'code_sub_wbs' => '1.1',
            'sub_task_wbs' => 'WWTP',
            'kategori'     => 'Mesin',
            'nama_item'    => 'Blower Unit',
            'qty'          => 1,
            'satuan'       => 'unit',
            'harga_satuan' => 150000000,
            'harga_total'  => 150000000,
            'referensi'    => 'PR-001',
        ]);

        // 1. Bilingual KB: English question about Outstanding
        $kbEn = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'What does Outstanding status mean?',
        ]);
        $kbEn->assertStatus(200);
        $this->assertEquals('en', $kbEn->json('metadata.language'));
        $this->assertStringContainsString('Purchase Request (PR)', $kbEn->json('content'));

        // 2. Multi-turn context: list projects -> detail #1 -> budget
        $turn1 = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Tampilkan semua proyek',
        ]);
        $turn1->assertStatus(200);
        $sid = $turn1->json('session_id');

        $turn2 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$sid}/chat", [
            'message' => 'Detail yang pertama',
        ]);
        $turn2->assertStatus(200);
        $this->assertStringContainsString('UBC SMELTER', $turn2->json('content'));

        $turn3 = $this->actingAs($this->superAdmin)->postJson("/ai/sessions/{$sid}/chat", [
            'message' => 'Cek budgetnya',
        ]);
        $turn3->assertStatus(200);
        $this->assertStringContainsString('150.000.000', $turn3->json('content'));

        // 3. RBAC isolation: worker cannot view cross-company private project
        $denied = $this->actingAs($this->betaUser)->postJson('/ai/chat', [
            'message' => "Ringkasan proyek ID #{$privateOther->id}",
        ]);
        $denied->assertStatus(200);
        $this->assertStringContainsString('Akses Ditolak', $denied->json('content'));
    }

    public function test_ai_chat_auto_deletes_messages_and_sessions_older_than_h_plus_7_days(): void
    {
        $oldSession = \App\Models\AiChatSession::create([
            'user_id' => $this->superAdmin->id,
            'title'   => 'Chat 8 Days Ago',
        ]);
        \Illuminate\Support\Facades\DB::table('ai_chat_sessions')
            ->where('id', $oldSession->id)
            ->update([
                'created_at' => Carbon::now('Asia/Jakarta')->subDays(8),
                'updated_at' => Carbon::now('Asia/Jakarta')->subDays(8),
            ]);

        $oldMessage = \App\Models\AiChatMessage::create([
            'session_id' => $oldSession->id,
            'role'       => 'user',
            'content'    => 'Expired question from 8 days ago',
        ]);
        \Illuminate\Support\Facades\DB::table('ai_chat_messages')
            ->where('id', $oldMessage->id)
            ->update([
                'created_at' => Carbon::now('Asia/Jakarta')->subDays(8),
                'updated_at' => Carbon::now('Asia/Jakarta')->subDays(8),
            ]);

        $recentSession = \App\Models\AiChatSession::create([
            'user_id' => $this->superAdmin->id,
            'title'   => 'Chat 3 Days Ago',
        ]);
        \Illuminate\Support\Facades\DB::table('ai_chat_sessions')
            ->where('id', $recentSession->id)
            ->update([
                'created_at' => Carbon::now('Asia/Jakarta')->subDays(3),
                'updated_at' => Carbon::now('Asia/Jakarta')->subDays(3),
            ]);

        // Posting a new message automatically triggers H+7 cleanup
        $res = $this->actingAs($this->superAdmin)->postJson('/ai/chat', [
            'message' => 'Halo tes bro',
        ]);
        $res->assertStatus(200);

        $this->assertDatabaseMissing('ai_chat_messages', ['id' => $oldMessage->id]);
        $this->assertDatabaseMissing('ai_chat_sessions', ['id' => $oldSession->id]);
        $this->assertDatabaseHas('ai_chat_sessions', ['id' => $recentSession->id]);
    }
}
