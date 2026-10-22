<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProjectTemplate;
use App\Models\TemplateMainTask;
use App\Models\TemplateSubTask;
use App\Services\MasterTemplateService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class TemplateController extends Controller
{
    protected MasterTemplateService $templateService;

    public function __construct(MasterTemplateService $templateService)
    {
        $this->templateService = $templateService;
    }

    /**
     * List templates or render management page.
     */
    public function index(Request $request)
    {
        // Ensure at least default template is available
        $this->templateService->ensureDefaultTemplate();

        $templates = ProjectTemplate::withCount(['mainTasks'])->with(['creator'])->latest()->get();

        $selectedId = $request->query('id', $templates->firstWhere('is_default', true)?->id ?? $templates->first()?->id);
        $divisions = \App\Models\Division::orderBy('divisi')->get(['id', 'divisi']);

        if ($selectedId) {
            $this->resyncTemplateCodes((int) $selectedId);
            $selectedTemplate = ProjectTemplate::with([
                'mainTasks' => function ($q) {
                    $q->orderBy('order_index')->orderBy('id');
                },
                'mainTasks.subTasks' => function ($q) {
                    $q->orderBy('order_index')->orderBy('id');
                }
            ])->find($selectedId);
        }

        if ($request->wantsJson()) {
            return response()->json([
                'templates' => $templates,
                'selectedTemplate' => $selectedTemplate,
                'divisions' => $divisions,
            ]);
        }

        return Inertia::render('SuperAdmin/TemplateManagementPage', [
            'templates' => $templates,
            'selectedTemplate' => $selectedTemplate,
            'divisions' => $divisions,
        ]);
    }

    /**
     * Resync and renumber all codes sequentially according to order_index.
     */
    public function resyncTemplateCodes(int $templateId): void
    {
        DB::transaction(function () use ($templateId) {
            $mainTasks = TemplateMainTask::where('template_id', $templateId)
                ->orderBy('order_index')
                ->orderBy('id')
                ->get();

            foreach ($mainTasks as $mIdx => $mt) {
                $mainCode = (string) ($mIdx + 1);
                $mt->update([
                    'order_index' => $mIdx + 1,
                    'code' => $mainCode,
                ]);

                $subTasks = TemplateSubTask::where('template_main_task_id', $mt->id)
                    ->orderBy('order_index')
                    ->orderBy('id')
                    ->get();

                foreach ($subTasks as $sIdx => $st) {
                    $st->update([
                        'order_index' => $sIdx + 1,
                        'code' => "{$mainCode}." . ($sIdx + 1),
                    ]);
                }
            }
        });
    }

    /**
     * Store new template.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'is_default' => 'nullable|boolean',
        ]);

        $template = $this->templateService->createTemplate($validated, auth()->id());

        return back()->with('success', "Template '{$template->name}' berhasil dibuat.");
    }

    /**
     * Update template metadata.
     */
    public function update(Request $request, int $id)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'is_default' => 'nullable|boolean',
        ]);

        $template = $this->templateService->updateTemplate($id, $validated, auth()->id());

        return back()->with('success', "Template '{$template->name}' berhasil diperbarui.");
    }

    /**
     * Delete template.
     */
    public function destroy(Request $request, int $id)
    {
        $template = ProjectTemplate::findOrFail($id);
        if ($template->is_default) {
            return back()->withErrors(['message' => 'Template default tidak dapat dihapus. Silakan tetapkan template lain sebagai default terlebih dahulu.']);
        }

        $this->templateService->deleteTemplate($id, auth()->id());

        return back()->with('success', 'Template berhasil dihapus.');
    }

    /**
     * Set template as default.
     */
    public function setDefault(Request $request, int $id)
    {
        DB::transaction(function () use ($id) {
            ProjectTemplate::where('is_default', true)->update(['is_default' => false]);
            ProjectTemplate::where('id', $id)->update(['is_default' => true]);
        });

        AuditLog::record('SET_DEFAULT_TEMPLATE', "Set template ID {$id} as default master template.", auth()->id(), $request->ip());

        return back()->with('success', 'Template default berhasil diubah.');
    }

    // ── Main Tasks (Level 1) ──

    public function addMainTask(Request $request, int $templateId)
    {
        $template = ProjectTemplate::findOrFail($templateId);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'weight' => 'nullable|numeric|min:0|max:100',
        ]);

        $maxOrder = TemplateMainTask::where('template_id', $templateId)->max('order_index') ?? 0;

        $task = TemplateMainTask::create([
            'template_id' => $templateId,
            'code' => (string) ($maxOrder + 1),
            'name' => $validated['name'],
            'weight' => (float) ($validated['weight'] ?? 0.0),
            'order_index' => $maxOrder + 1,
        ]);

        AuditLog::record('CREATE_TEMPLATE_MAIN_TASK', "Added main task '{$task->name}' to template '{$template->name}'.", auth()->id(), $request->ip());

        return back()->with('success', 'Main Task template berhasil ditambahkan.');
    }

    public function updateMainTask(Request $request, int $templateId, int $mainTaskId)
    {
        $task = TemplateMainTask::where('template_id', $templateId)->where('id', $mainTaskId)->firstOrFail();

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => 'nullable|string|max:50',
            'weight' => 'nullable|numeric|min:0|max:100',
        ]);

        $task->update($validated);

        return back()->with('success', 'Main Task template berhasil diperbarui.');
    }

    public function deleteMainTask(Request $request, int $templateId, int $mainTaskId)
    {
        $task = TemplateMainTask::where('template_id', $templateId)->where('id', $mainTaskId)->firstOrFail();
        $task->delete();
        $this->resyncTemplateCodes($templateId);

        return back()->with('success', 'Main Task template berhasil dihapus.');
    }

    public function reorderMainTasks(Request $request, int $templateId)
    {
        $validated = $request->validate([
            'ordered_ids' => 'required|array',
            'ordered_ids.*' => 'integer|exists:template_main_tasks,id',
        ]);

        DB::transaction(function () use ($templateId, $validated) {
            foreach ($validated['ordered_ids'] as $idx => $id) {
                $newCode = (string) ($idx + 1);
                $mainTask = TemplateMainTask::where('template_id', $templateId)->where('id', $id)->first();
                if ($mainTask) {
                    $mainTask->update([
                        'order_index' => $idx + 1,
                        'code' => $newCode,
                    ]);

                    $subTasks = TemplateSubTask::where('template_main_task_id', $id)
                        ->orderBy('order_index')
                        ->orderBy('id')
                        ->get();

                    foreach ($subTasks as $sIdx => $st) {
                        $st->update([
                            'order_index' => $sIdx + 1,
                            'code' => "{$newCode}." . ($sIdx + 1),
                        ]);
                    }
                }
            }
        });

        return back()->with('success', 'Urutan Main Task template berhasil diperbarui.');
    }

    // ── Sub Tasks (Level 2) ──

    public function addSubTask(Request $request, int $templateId, int $mainTaskId)
    {
        $mainTask = TemplateMainTask::where('template_id', $templateId)->where('id', $mainTaskId)->firstOrFail();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'default_pic_division' => 'nullable|string|max:100',
            'weight' => 'nullable|numeric|min:0|max:100',
            'default_duration' => 'nullable|integer|min:1',
        ]);

        $maxOrder = TemplateSubTask::where('template_main_task_id', $mainTaskId)->max('order_index') ?? 0;

        $subTask = TemplateSubTask::create([
            'template_main_task_id' => $mainTaskId,
            'code' => "{$mainTask->code}." . ($maxOrder + 1),
            'name' => $validated['name'],
            'default_pic_division' => $validated['default_pic_division'] ?? 'General',
            'weight' => (float) ($validated['weight'] ?? 0.0),
            'order_index' => $maxOrder + 1,
            'default_duration' => (int) ($validated['default_duration'] ?? 14),
        ]);

        return back()->with('success', 'Sub Task template berhasil ditambahkan.');
    }

    public function updateSubTask(Request $request, int $templateId, int $subTaskId)
    {
        $subTask = TemplateSubTask::whereHas('mainTask', function ($q) use ($templateId) {
            $q->where('template_id', $templateId);
        })->where('id', $subTaskId)->firstOrFail();

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => 'nullable|string|max:50',
            'default_pic_division' => 'nullable|string|max:100',
            'weight' => 'nullable|numeric|min:0|max:100',
            'default_duration' => 'nullable|integer|min:1',
        ]);

        $subTask->update($validated);

        return back()->with('success', 'Sub Task template berhasil diperbarui.');
    }

    public function deleteSubTask(Request $request, int $templateId, int $subTaskId)
    {
        $subTask = TemplateSubTask::whereHas('mainTask', function ($q) use ($templateId) {
            $q->where('template_id', $templateId);
        })->where('id', $subTaskId)->firstOrFail();

        $subTask->delete();
        $this->resyncTemplateCodes($templateId);

        return back()->with('success', 'Sub Task template berhasil dihapus.');
    }

    public function reorderSubTasks(Request $request, int $templateId, int $mainTaskId)
    {
        $validated = $request->validate([
            'ordered_ids' => 'required|array',
            'ordered_ids.*' => 'integer|exists:template_sub_tasks,id',
        ]);

        $mainTask = TemplateMainTask::where('template_id', $templateId)->where('id', $mainTaskId)->firstOrFail();
        $mainCode = $mainTask->code ?: (string) $mainTask->order_index;

        DB::transaction(function () use ($mainTaskId, $mainCode, $validated) {
            foreach ($validated['ordered_ids'] as $idx => $id) {
                TemplateSubTask::where('template_main_task_id', $mainTaskId)->where('id', $id)->update([
                    'order_index' => $idx + 1,
                    'code' => "{$mainCode}." . ($idx + 1),
                ]);
            }
        });

        return back()->with('success', 'Urutan Sub Task template berhasil diperbarui.');
    }
}
