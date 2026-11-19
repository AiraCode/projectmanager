<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('recalculate:weights', function () {
    $template = \App\Services\ProjectTemplateService::getTemplate();
    $totalTemplateWeight = array_sum(array_column($template, 'weight'));
    $this->info("Template total weight: {$totalTemplateWeight}%");

    $mainJobWeights = [];
    $subJobWeights = [];
    foreach ($template as $mj) {
        $mjKey = strtoupper(trim($mj['name']));
        $mainJobWeights[$mjKey] = (float) $mj['weight'];
        foreach ($mj['sub_main_jobs'] as $smj) {
            $smjKey = strtoupper(trim($smj['name']));
            $subJobWeights[$mjKey][$smjKey] = (float) $smj['weight'];
        }
    }

    $projects = \App\Models\Project::all();
    $this->info("Found {$projects->count()} projects to update.");

    foreach ($projects as $project) {
        $mainWbsList = \App\Models\MainWbs::where('projects_id', $project->id)->orderBy('id')->get();
        if ($mainWbsList->isEmpty()) {
            continue;
        }

        $projectTotal = 0;
        foreach ($mainWbsList as $mw) {
            $mwName = strtoupper(trim($mw->name ?: ($mw->listName?->name ?? '')));
            if (isset($mainJobWeights[$mwName])) {
                $mw->percentage = $mainJobWeights[$mwName];
                $mw->save();
            }
            $projectTotal += (float) $mw->percentage;

            $subWbsList = \App\Models\SubWbs::where('sub_wbs_id', $mw->id)->orderBy('id')->get();
            foreach ($subWbsList as $sw) {
                $swName = strtoupper(trim($sw->name ?: ($sw->listName?->name ?? '')));
                if (isset($subJobWeights[$mwName][$swName])) {
                    $sw->weight = $subJobWeights[$mwName][$swName];
                    $sw->save();
                }
            }
        }
        $this->info("Project #{$project->id} ({$project->title}) total weight: {$projectTotal}%");
        app(\App\Services\ProgressService::class)->recalculateProjectProgress($project->id);
    }
    $this->info("All projects recalculated successfully.");
})->purpose('Recalculate and balance project weights to 100%');

Artisan::command('provis:reconcile-dates', function () {
    $this->info("Scanning all projects for date reconciliation...");
    $projects = \App\Models\Project::all();
    $scheduler = app(\App\Services\DependencyScheduler::class);
    $totalRepairs = 0;

    foreach ($projects as $project) {
        $repairs = $scheduler->reconcileProjectDates($project);
        if (!empty($repairs)) {
            $this->warn("Project #{$project->id} ({$project->title}): Repaired " . count($repairs) . " date mismatches.");
            $totalRepairs += count($repairs);
        }
    }

    $this->info("Reconciliation complete! Total repairs made: {$totalRepairs}. All logged under 'Provis Support System'.");
})->purpose('Scan and reconcile all project dates to match child task bounds, logging changes to audit log');

Artisan::command('provis:prune-ai-chats {--days=7 : Retention period in days (default H+7)}', function () {
    $days = max(1, (int) $this->option('days'));
    $result = app(\App\Services\ProvisAiService::class)->ensureTablesAndPruneExpiredChats($days);

    $this->info("Provis AI H+{$days} retention cleanup completed: deleted {$result['deleted_messages']} expired message(s) and {$result['deleted_sessions']} expired session(s).");
})->purpose('Auto-delete Provis AI chat messages and sessions older than H+7 (1 week)');

Schedule::command('provis:prune-ai-chats')->daily();

Artisan::command('provis:ai-learn {taskId : The AiLearningTask ID to process locally}', function () {
    $taskId = (int) $this->argument('taskId');
    app(\App\Services\ProvisAiService::class)->processLearningTask($taskId);
    $this->info("Completed local AI learning task #{$taskId}.");
})->purpose('Process an asynchronous local self-learning AI reasoning task in the background');



