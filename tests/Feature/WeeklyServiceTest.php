<?php

namespace Tests\Feature;

use App\Models\Division;
use App\Models\ListMainWbsName;
use App\Models\ListSubWbsName;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\Wbs;
use App\Services\WeeklyService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WeeklyServiceTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_partial_actual_progress_is_preserved_when_task_is_completed(): void
    {
        Carbon::setTestNow('2026-11-20 14:32:00');

        $existingProject = Project::firstOrFail();
        $mainName = ListMainWbsName::firstOrFail();
        $subName = ListSubWbsName::firstOrFail();
        $division = Division::firstOrFail();

        $project = Project::create([
            'companies_id' => $existingProject->companies_id,
            'project_manager' => $existingProject->project_manager,
            'title' => 'S-Curve completion date test',
            'start' => '2026-10-21',
            'end' => '2026-12-29',
            'progress' => 100,
            'status' => 'Completed',
        ]);
        $mainWbs = MainWbs::create([
            'projects_id' => $project->id,
            'list_main_wbs_names_id' => $mainName->id,
            'name' => 'Main task',
            'percentage' => 100,
            'start' => '2026-10-21',
            'end' => '2026-12-29',
            'progress' => 100,
            'status' => 'Completed',
        ]);
        $subWbs = SubWbs::create([
            'sub_wbs_id' => $mainWbs->id,
            'list_sub_wbs_names_id' => $subName->id,
            'name' => 'Sub task',
            'predecessor' => '-',
            'predecessor_type' => 'FS',
            'start' => '2026-10-21',
            'end' => '2026-12-29',
            'weight' => 100,
            'progress' => 100,
            'status' => 'Completed',
        ]);
        $taskId = 'scurve-completed-date-' . uniqid();
        Wbs::create([
            'id' => $taskId,
            'sub_wbs_id' => $subWbs->id,
            'divisions_id' => $division->id,
            'name' => 'Task completed after its deadline',
            'vendor' => 'Internal',
            'start' => '2026-10-29',
            'end' => '2026-11-02',
            'weight' => 100,
            'progress' => 100,
            'is_completed' => true,
            'status' => 'Completed',
            'completed_at' => '2026-11-20 14:32:00',
        ]);
        DB::table('project_activity_logs')->insert([
            [
                'project_id' => $project->id,
                'wbs_id' => $taskId,
                'action' => 'task_updated',
                'old_progress' => 0,
                'new_progress' => 50,
                'description' => 'Task progress updated to 50%.',
                'created_at' => '2026-10-29 10:00:00',
                'updated_at' => '2026-10-29 10:00:00',
            ],
            [
                'project_id' => $project->id,
                'wbs_id' => $taskId,
                'action' => 'task_completed',
                'old_progress' => 50,
                'new_progress' => 100,
                'description' => 'Task completed.',
                'created_at' => '2026-11-20 14:32:00',
                'updated_at' => '2026-11-20 14:32:00',
            ],
        ]);

        $weeklyData = app(WeeklyService::class)->getWeeklyData($project->id);
        $deadlineWeek = collect($weeklyData)->firstWhere('startDate', '2026-10-28');
        $followingWeek = collect($weeklyData)->firstWhere('startDate', '2026-11-04');
        $completionWeek = collect($weeklyData)->firstWhere('startDate', '2026-11-18');

        $this->assertNotNull($deadlineWeek);
        $this->assertNotNull($followingWeek);
        $this->assertNotNull($completionWeek);
        $this->assertSame(50.0, $deadlineWeek['actualCumulative']);
        $this->assertSame(50.0, $followingWeek['actualCumulative']);
        $this->assertSame(100.0, $completionWeek['actualCumulative']);

    }
}
