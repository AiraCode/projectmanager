<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Project;
use App\Models\ProjectTemplate;
use App\Models\TemplateMainTask;
use App\Models\TemplateSubTask;
use App\Models\MainWbs;
use App\Models\SubWbs;
use App\Models\ListMainWbsName;
use App\Models\ListSubWbsName;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class MasterTemplateService
{
    /**
     * Ensure at least one default template exists in database,
     * populating from ProjectTemplateService::getTemplate() if empty.
     */
    public function ensureDefaultTemplate(): ProjectTemplate
    {
        $default = ProjectTemplate::where('is_default', true)->with('mainTasks.subTasks')->first();
        if ($default) {
            return $default;
        }

        $any = ProjectTemplate::with('mainTasks.subTasks')->first();
        if ($any) {
            $any->update(['is_default' => true]);
            return $any;
        }

        // Seed initial template from ProjectTemplateService static array
        return DB::transaction(function () {
            $template = ProjectTemplate::create([
                'name' => 'Template Master Konstruksi & Operasional (Standard)',
                'description' => 'Template default 17 Main Jobs and Sub Main Jobs.',
                'is_default' => true,
                'created_by' => null,
            ]);

            $rawJobs = ProjectTemplateService::getTemplate();

            foreach ($rawJobs as $mIdx => $mj) {
                $mainTask = TemplateMainTask::create([
                    'template_id' => $template->id,
                    'code' => $mj['code'] ?? (string)($mIdx + 1),
                    'name' => $mj['name'],
                    'weight' => (float) ($mj['weight'] ?? 0),
                    'order_index' => $mIdx + 1,
                ]);

                $subJobs = $mj['sub_main_jobs'] ?? [];
                foreach ($subJobs as $sIdx => $smj) {
                    TemplateSubTask::create([
                        'template_main_task_id' => $mainTask->id,
                        'code' => $smj['code'] ?? "{$mainTask->code}." . ($sIdx + 1),
                        'name' => $smj['name'],
                        'default_pic_division' => $smj['pic'] ?? 'General',
                        'weight' => (float) ($smj['weight'] ?? 0),
                        'order_index' => $sIdx + 1,
                        'default_duration' => 14,
                    ]);
                }
            }

            return $template->load('mainTasks.subTasks');
        });
    }

    /**
     * Apply a template to a project.
     * Non-retroactive: completely isolated to this new project.
     */
    public function applyTemplateToProject(Project $project, ?int $templateId = null): void
    {
        $template = $templateId 
            ? ProjectTemplate::with('mainTasks.subTasks')->findOrFail($templateId)
            : $this->ensureDefaultTemplate();

        $projectStart = $project->start ? Carbon::parse($project->start) : Carbon::now();
        $projectEnd = $project->end ? Carbon::parse($project->end) : $projectStart->copy()->addMonths(12);
        $totalDays = max(1, $projectStart->diffInDays($projectEnd));

        DB::transaction(function () use ($project, $template, $projectStart, $totalDays) {
            $mainTasks = $template->mainTasks;
            $mainCount = count($mainTasks);
            $daysPerMain = max(1, (int) floor($totalDays / max(1, $mainCount)));

            foreach ($mainTasks as $mIdx => $tmj) {
                $mStart = $projectStart->copy()->addDays($mIdx * $daysPerMain);
                $mEnd = $mStart->copy()->addDays($daysPerMain);

                $listMain = ListMainWbsName::firstOrCreate(['name' => $tmj->name]);

                $mainWbs = MainWbs::create([
                    'projects_id' => $project->id,
                    'list_main_wbs_names_id' => $listMain->id,
                    'name' => $tmj->name,
                    'percentage' => $tmj->weight,
                    'start' => $mStart,
                    'end' => $mEnd,
                    'actual_start' => $mStart,
                    'actual_end' => $mEnd,
                    'progress' => 0,
                    'status' => 'Open',
                    'order_index' => $tmj->order_index ?: ($mIdx + 1),
                ]);

                $subTasks = $tmj->subTasks;
                $subCount = count($subTasks);
                $daysPerSub = max(1, (int) floor($daysPerMain / max(1, $subCount)));

                foreach ($subTasks as $sIdx => $tsmj) {
                    $sStart = $mStart->copy()->addDays($sIdx * $daysPerSub);
                    $sEnd = $sStart->copy()->addDays($daysPerSub);

                    $listSub = ListSubWbsName::firstOrCreate([
                        'name' => $tsmj->name,
                        'list_main_wbs_names_copy1_id' => $listMain->id,
                    ]);

                    SubWbs::create([
                        'sub_wbs_id' => $mainWbs->id,
                        'list_sub_wbs_names_id' => $listSub->id,
                        'name' => $tsmj->name,
                        'predecessor' => '-',
                        'predecessor_type' => 'FS',
                        'lag_lead_time' => '0',
                        'start' => $sStart,
                        'end' => $sEnd,
                        'actual_start' => $sStart,
                        'actual_end' => $sEnd,
                        'weight' => $tsmj->weight,
                        'progress' => 0,
                        'status' => 'Open',
                        'order_index' => $tsmj->order_index ?: ($sIdx + 1),
                    ]);
                }
            }
        });
    }

    /**
     * Create a new custom template.
     */
    public function createTemplate(array $data, ?int $userId = null): ProjectTemplate
    {
        return DB::transaction(function () use ($data, $userId) {
            $isDefault = !empty($data['is_default']);
            if ($isDefault) {
                ProjectTemplate::where('is_default', true)->update(['is_default' => false]);
            }

            $template = ProjectTemplate::create([
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'is_default' => $isDefault,
                'created_by' => $userId,
            ]);

            AuditLog::record(
                'CREATE_TEMPLATE',
                "Created master project template '{$template->name}'",
                $userId,
                request()?->ip()
            );

            return $template;
        });
    }

    /**
     * Update an existing template.
     */
    public function updateTemplate(int $id, array $data, ?int $userId = null): ProjectTemplate
    {
        $template = ProjectTemplate::findOrFail($id);

        if (!empty($data['is_default']) && !$template->is_default) {
            ProjectTemplate::where('id', '!=', $id)->update(['is_default' => false]);
        }

        $template->update([
            'name' => $data['name'] ?? $template->name,
            'description' => array_key_exists('description', $data) ? $data['description'] : $template->description,
            'is_default' => isset($data['is_default']) ? (bool) $data['is_default'] : $template->is_default,
        ]);

        AuditLog::record(
            'UPDATE_TEMPLATE',
            "Updated master project template '{$template->name}'",
            $userId,
            request()?->ip()
        );

        return $template;
    }

    /**
     * Delete template.
     */
    public function deleteTemplate(int $id, ?int $userId = null): void
    {
        $template = ProjectTemplate::findOrFail($id);
        $name = $template->name;
        $template->delete();

        AuditLog::record(
            'DELETE_TEMPLATE',
            "Deleted master project template '{$name}'",
            $userId,
            request()?->ip()
        );
    }
}
