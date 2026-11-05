<?php

namespace Tests\Unit;

use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\TaskDependency;
use App\Models\TaskDependencyGroup;
use App\Models\Wbs;
use App\Services\DependencyScheduler;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DependencySchedulerTest extends BaseTestCase
{
    public function createApplication(): Application
    {
        $app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'database.connections.sqlite.foreign_key_constraints' => false,
        ]);
        DB::purge('sqlite');
        Schema::dropAllTables();
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('title')->nullable();
            $table->dateTime('start')->nullable();
            $table->dateTime('end')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('main_wbs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('projects_id')->nullable();
            $table->string('name')->nullable();
            $table->dateTime('start')->nullable();
            $table->dateTime('end')->nullable();
            $table->dateTime('actual_start')->nullable();
            $table->dateTime('actual_end')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('sub_wbs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sub_wbs_id')->nullable();
            $table->string('name')->nullable();
            $table->dateTime('start')->nullable();
            $table->dateTime('end')->nullable();
            $table->dateTime('actual_start')->nullable();
            $table->dateTime('actual_end')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('wbs', function (Blueprint $table) {
            $table->string('id', 45)->primary();
            $table->unsignedBigInteger('sub_wbs_id')->nullable();
            $table->string('name');
            $table->dateTime('start')->nullable();
            $table->dateTime('end')->nullable();
            $table->integer('duration_days')->nullable();
            $table->integer('progress')->default(0);
            $table->boolean('is_completed')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('task_dependency_groups', function (Blueprint $table) {
            $table->id();
            $table->string('successor_wbs_id', 45);
            $table->string('dependency_type', 2);
            $table->integer('lag_days')->default(0);
            $table->timestamps();
        });

        Schema::create('task_dependencies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dependency_group_id')->nullable();
            $table->string('predecessor_wbs_id', 45);
            $table->string('successor_wbs_id', 45);
            $table->string('dependency_type', 2);
            $table->integer('lag_days')->default(0);
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('action');
            $table->text('description');
            $table->string('ip_address')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_every_predecessor_in_a_fs_group_must_finish_before_successor_can_start(): void
    {
        $successor = $this->createTask('D', 0);
        $group = $this->createGroup($successor, 'FS');
        $predecessors = [
            $this->createTask('A', 100),
            $this->createTask('B', 100),
            $this->createTask('C', 40),
        ];

        $this->attachPredecessors($group, $successor, $predecessors);
        $scheduler = new DependencyScheduler();

        $this->assertStringContainsString('C', $scheduler->validateCanStart($successor));

        $predecessors[2]->update(['progress' => 100, 'is_completed' => true]);
        $this->assertNull($scheduler->validateCanStart($successor));
    }

    public function test_every_predecessor_in_a_ff_group_must_finish_before_successor_can_complete(): void
    {
        $successor = $this->createTask('D', 100);
        $group = $this->createGroup($successor, 'FF');
        $predecessors = [
            $this->createTask('A', 100),
            $this->createTask('B', 20),
            $this->createTask('C', 100),
        ];

        $this->attachPredecessors($group, $successor, $predecessors);
        $scheduler = new DependencyScheduler();

        $this->assertStringContainsString('B', $scheduler->validateCanComplete($successor));

        $predecessors[1]->update(['progress' => 100, 'is_completed' => true]);
        $this->assertNull($scheduler->validateCanComplete($successor));
    }

    public function test_fs_group_schedule_uses_the_latest_predecessor_finish(): void
    {
        $successor = $this->createTask('D', 0, '2026-01-01', '2026-01-04', 3);
        $group = $this->createGroup($successor, 'FS');
        $predecessors = [
            $this->createTask('A', 0, '2026-01-01', '2026-01-02'),
            $this->createTask('B', 0, '2026-01-03', '2026-01-05'),
            $this->createTask('C', 0, '2026-01-06', '2026-01-07'),
        ];
        $this->attachPredecessors($group, $successor, $predecessors);

        (new DependencyScheduler())->recalculateTaskDates($successor);

        // FS lag 0: successor mulai di hari yang sama dengan finish predecessor terakhir (01-07)
        $this->assertSame('2026-01-07', $successor->fresh()->start->toDateString());
        $this->assertSame('2026-01-09', $successor->fresh()->end->toDateString());
    }

    public function test_ff_group_schedule_preserves_duration_and_uses_latest_predecessor_finish(): void
    {
        $successor = $this->createTask('D', 0, '2026-01-01', '2026-01-04', 3);
        $group = $this->createGroup($successor, 'FF');
        $predecessors = [
            $this->createTask('A', 0, '2026-01-01', '2026-01-02'),
            $this->createTask('B', 0, '2026-01-03', '2026-01-05'),
            $this->createTask('C', 0, '2026-01-06', '2026-01-07'),
        ];
        $this->attachPredecessors($group, $successor, $predecessors);

        (new DependencyScheduler())->recalculateTaskDates($successor);

        $successor = $successor->fresh();
        $this->assertSame('2026-01-05', $successor->start->toDateString());
        $this->assertSame('2026-01-07', $successor->end->toDateString());
        $this->assertSame(3, $successor->duration_days);
    }

    public function test_ss_and_sf_require_the_predecessor_to_have_started(): void
    {
        $scheduler = new DependencyScheduler();
        $predecessor = $this->createTask('A', 0);

        $ssSuccessor = $this->createTask('B', 0);
        $ssGroup = $this->createGroup($ssSuccessor, 'SS');
        $this->attachPredecessors($ssGroup, $ssSuccessor, [$predecessor]);
        $this->assertNotNull($scheduler->validateCanStart($ssSuccessor));

        $sfSuccessor = $this->createTask('C', 100);
        $sfGroup = $this->createGroup($sfSuccessor, 'SF');
        $this->attachPredecessors($sfGroup, $sfSuccessor, [$predecessor]);
        $this->assertNotNull($scheduler->validateCanComplete($sfSuccessor));

        $predecessor->update(['progress' => 1]);
        $this->assertNull($scheduler->validateCanStart($ssSuccessor));
        $this->assertNull($scheduler->validateCanComplete($sfSuccessor));
    }

    public function test_end_date_formula_is_start_plus_duration_minus_one(): void
    {
        $scheduler = new DependencyScheduler();

        // Task with duration 6 days: Start + 6 - 1 = End
        $pred = $this->createTask('PRED_1', 0, '2026-10-01', '2026-10-06', 6);
        $this->assertSame('2026-10-01', $pred->start->toDateString());
        $this->assertSame('2026-10-06', $pred->end->toDateString());

        $task = $this->createTask('TASK_6D', 0, '2026-10-01', '2026-10-10', 6);
        $group = $this->createGroup($task, 'SS');
        $this->attachPredecessors($group, $task, [$pred]);

        $scheduler->recalculateTaskDates($task);

        $fresh = $task->fresh();
        $this->assertSame('2026-10-01', $fresh->start->toDateString());
        // Start (Oct 1) + 6 - 1 = Oct 6
        $this->assertSame('2026-10-06', $fresh->end->toDateString());
        $this->assertSame(6, $fresh->duration_days);
    }

    private function createTask(
        string $id,
        int $progress,
        ?string $start = null,
        ?string $end = null,
        ?int $duration = null,
    ): Wbs
    {
        return Wbs::create([
            'id' => $id,
            'name' => $id,
            'start' => $start,
            'end' => $end,
            'duration_days' => $duration,
            'progress' => $progress,
            'is_completed' => $progress >= 100,
        ]);
    }

    private function createGroup(Wbs $successor, string $type): TaskDependencyGroup
    {
        return TaskDependencyGroup::create([
            'successor_wbs_id' => $successor->id,
            'dependency_type' => $type,
            'lag_days' => 0,
        ]);
    }

    /**
     * @param array<int, Wbs> $predecessors
     */
    private function attachPredecessors(
        TaskDependencyGroup $group,
        Wbs $successor,
        array $predecessors,
    ): void {
        foreach ($predecessors as $predecessor) {
            TaskDependency::create([
                'dependency_group_id' => $group->id,
                'predecessor_wbs_id' => $predecessor->id,
                'successor_wbs_id' => $successor->id,
                'dependency_type' => $group->dependency_type,
                'lag_days' => $group->lag_days,
            ]);
        }
    }

    public function test_sync_parent_wbs_dates_follows_latest_child_end(): void
    {
        $main = MainWbs::create([
            'projects_id' => 1,
            'name' => 'Main 1',
            'start' => '2026-10-01',
            'end' => '2026-10-30',
        ]);

        $sub = SubWbs::create([
            'sub_wbs_id' => $main->id,
            'name' => 'Sub 1',
            'start' => '2026-10-01',
            'end' => '2026-10-30',
        ]);

        $task = Wbs::create([
            'id' => 'T1',
            'sub_wbs_id' => $sub->id,
            'name' => 'Task 1',
            'start' => '2026-10-01',
            'end' => '2026-10-10',
            'duration_days' => 10,
        ]);

        (new DependencyScheduler())->syncParentWbsDates($task);

        $main->refresh();
        $sub->refresh();

        // Main task and sub task end dates must strictly follow the latest child task end date (2026-10-10)
        $this->assertSame('2026-10-10', $main->end->toDateString());
        $this->assertSame('2026-10-10', $sub->end->toDateString());
        $this->assertSame('2026-10-10', $main->actual_end->toDateString());
        $this->assertSame('2026-10-10', $sub->actual_end->toDateString());
    }

    public function test_reconcile_project_dates_auto_repairs_and_records_audit_log_under_provis_support_system(): void
    {
        $project = Project::create([
            'title' => 'Test Project Retroactive Repair',
            'start' => '2026-10-01',
            'end' => '2026-10-30',
        ]);

        $main = MainWbs::create([
            'projects_id' => $project->id,
            'name' => 'Main Pre-Update',
            'start' => '2026-10-01',
            'end' => '2026-10-30', // outdated broad end date
        ]);

        $sub = SubWbs::create([
            'sub_wbs_id' => $main->id,
            'name' => 'Sub Pre-Update',
            'start' => '2026-10-01',
            'end' => '2026-10-30', // outdated broad end date
        ]);

        Wbs::create([
            'id' => 'TASK-RECON-1',
            'sub_wbs_id' => $sub->id,
            'name' => 'Actual Child Task',
            'start' => '2026-10-05',
            'end' => '2026-10-15',
            'duration_days' => 11,
        ]);

        $scheduler = new DependencyScheduler();
        $repairs = $scheduler->reconcileProjectDates($project);

        $this->assertNotEmpty($repairs);

        $main->refresh();
        $sub->refresh();

        // Dates are automatically fixed to follow child task bounds (2026-10-05 to 2026-10-15)
        $this->assertSame('2026-10-05', $sub->start->toDateString());
        $this->assertSame('2026-10-15', $sub->end->toDateString());
        $this->assertSame('2026-10-05', $main->start->toDateString());
        $this->assertSame('2026-10-15', $main->end->toDateString());

        // AuditLog record created with actor Provis Support System
        $log = \App\Models\AuditLog::where('action', 'SYSTEM_SYNC_DATES')->latest()->first();
        $this->assertNotNull($log);
        $this->assertSame('Provis Support System', $log->metadata['actor'] ?? null);
        $this->assertStringContainsString('Provis Support System', $log->description);
    }
}
