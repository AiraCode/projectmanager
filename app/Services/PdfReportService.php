<?php

namespace App\Services;

use App\Models\MainWbs;
use App\Models\Project;
use App\Models\Wbs;
use Carbon\Carbon;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class PdfReportService
{
    /**
     * Generate PDF report for a project and return relative URL.
     */
    public function generateProjectPdf(int $projectId): array
    {
        $project = Project::with(['company', 'manager'])->findOrFail($projectId);

        $allTasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $projectId))
            ->with('division')
            ->get();

        $completedTasks = $allTasks->where('status', 'Completed')->count();
        $totalTasks     = $allTasks->count();
        $now            = Carbon::now('Asia/Jakarta');

        $overdueTasks = $allTasks->filter(function ($t) use ($now) {
            return $t->end && Carbon::parse($t->end)->lt($now) && $t->status !== 'Completed' && ($t->progress ?? 0) < 100;
        });

        $mainTasks = MainWbs::where('projects_id', $projectId)
            ->with(['listName', 'subWbs'])
            ->orderBy('id')
            ->get();

        $html = view('reports.project_summary_pdf', [
            'project'        => $project,
            'mainTasks'      => $mainTasks,
            'totalTasks'     => $totalTasks,
            'completedTasks' => $completedTasks,
            'overdueTasks'   => $overdueTasks,
        ])->render();

        // Ensure directories exist
        $storageDir = storage_path('app/public/reports');
        if (!File::exists($storageDir)) {
            File::makeDirectory($storageDir, 0755, true);
        }

        $tmpHtmlPath = storage_path("app/reports_tmp_{$projectId}_" . time() . ".html");
        $pdfFilename = "provis_report_project_{$projectId}_" . date('Ymd_His') . ".pdf";
        $pdfPath     = "{$storageDir}/{$pdfFilename}";
        $publicUrl   = "/storage/reports/{$pdfFilename}";

        File::put($tmpHtmlPath, $html);

        // Run Puppeteer script
        $scriptPath = base_path('resources/scripts/render_pdf.cjs');
        $cmd = "node " . escapeshellarg($scriptPath) . " " . escapeshellarg($tmpHtmlPath) . " " . escapeshellarg($pdfPath) . " 2>&1";

        $output = @shell_exec($cmd);
        @unlink($tmpHtmlPath);

        $pdfCreated = File::exists($pdfPath) && File::size($pdfPath) > 1000;

        if ($pdfCreated) {
            return [
                'success'   => true,
                'url'       => $publicUrl,
                'filename'  => $pdfFilename,
                'type'      => 'pdf',
                'summary'   => "Laporan PDF Proyek '{$project->title}' berhasil dibuat.",
            ];
        }

        Log::warning("Puppeteer PDF generation notice: {$output}. Falling back to printable view.");

        return [
            'success'   => true,
            'url'       => "/projects/{$projectId}/report-view",
            'filename'  => "report_{$projectId}.html",
            'type'      => 'html_print',
            'summary'   => "Laporan Eksekutif Proyek '{$project->title}' siap dicetak / diunduh.",
        ];
    }
}
