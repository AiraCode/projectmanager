<?php

namespace App\Services;

use App\Models\MainJob;
use App\Models\Project;
use App\Models\SubMainJob;
use Illuminate\Support\Facades\DB;

class ProjectTemplateService
{
    /**
     * The fixed 17 Main Jobs and Sub Main Jobs template based on MASTER Project MGMT.xlsx
     */
    public static function getTemplate(): array
    {
        return [
            [
                'code' => '1',
                'name' => 'BUSINESS DEVELOPMENT (PROJECT DOCUMENT PREPARATION)',
                'weight' => 3.0,
                'sub_main_jobs' => [
                    ['code' => '1.1', 'name' => 'BUSINESS DEVELOPMENT PROPOSAL', 'pic' => 'BUSDEV', 'weight' => 0.3],
                    ['code' => '1.2', 'name' => 'MOU SIGNING', 'pic' => 'BUSDEV', 'weight' => 0.25],
                    ['code' => '1.3', 'name' => 'JOIN VENTURE AGREEMENT', 'pic' => 'Legal', 'weight' => 0.3],
                    ['code' => '1.4', 'name' => 'KYBP', 'pic' => 'BUSDEV', 'weight' => 0.2],
                    ['code' => '1.5', 'name' => 'PROJECT MASTER SCHEDULE', 'pic' => 'PM', 'weight' => 0.2],
                    ['code' => '1.6', 'name' => 'OPEX & BUDGET', 'pic' => 'Finance', 'weight' => 0.3],
                    ['code' => '1.7', 'name' => 'FEASIBILITY STUDY', 'pic' => 'BUSDEV', 'weight' => 0.4],
                    ['code' => '1.8', 'name' => 'MMNR EXECUTIVE APPROVAL', 'pic' => 'PM', 'weight' => 0.2],
                    ['code' => '1.9', 'name' => 'MACOM APPROVAL', 'pic' => 'PM', 'weight' => 0.2],
                    ['code' => '1.10', 'name' => 'SIGNING WITH PARTNER', 'pic' => 'Legal', 'weight' => 0.2],
                    ['code' => '1.11', 'name' => 'LOA OF BUSDEV PROJECT', 'pic' => 'BUSDEV', 'weight' => 0.15],
                    ['code' => '1.12', 'name' => 'CAPITAL INJECTION', 'pic' => 'Finance', 'weight' => 0.2],
                ],
            ],
            [
                'code' => '2',
                'name' => 'FACTORY LAYOUT & PROCESS DESIGN',
                'weight' => 5.0,
                'sub_main_jobs' => [
                    ['code' => '2.1', 'name' => 'FACTORY & LAND LAYOUT', 'pic' => 'Engineering', 'weight' => 1.5],
                    ['code' => '2.2', 'name' => 'PROCESS DESIGN', 'pic' => 'Engineering', 'weight' => 1.5],
                    ['code' => '2.3', 'name' => 'FACTORY BUILDING DESIGN', 'pic' => 'Engineering', 'weight' => 1.5],
                    ['code' => '2.4', 'name' => 'FACTORY PROJECT RAB & SCHEDULE', 'pic' => 'PM', 'weight' => 0.5],
                ],
            ],
            [
                'code' => '3',
                'name' => 'SIPIL WORKS',
                'weight' => 18.0,
                'sub_main_jobs' => [
                    ['code' => '3.1', 'name' => 'SIPIL WORKS DESIGN, SPEC & RAB', 'pic' => 'Engineering', 'weight' => 2.0],
                    ['code' => '3.2', 'name' => 'SIPIL PROJECT SCHEDULE', 'pic' => 'PM', 'weight' => 1.0],
                    ['code' => '3.3', 'name' => 'FOUNDATION CONSTRUCTION', 'pic' => 'Engineering', 'weight' => 6.0],
                    ['code' => '3.4', 'name' => 'STEEL STRUCTURE CONSTRUCTION', 'pic' => 'Engineering', 'weight' => 7.0],
                    ['code' => '3.5', 'name' => 'FINISHING WORKS', 'pic' => 'Engineering', 'weight' => 2.0],
                ],
            ],
            [
                'code' => '4',
                'name' => 'PRODUCTION MACHINE & INSTALLATION',
                'weight' => 20.0,
                'sub_main_jobs' => [
                    ['code' => '4.1', 'name' => 'PRODUCTION MACHINE PROCUREMENT', 'pic' => 'Procurement', 'weight' => 4.0],
                    ['code' => '4.2', 'name' => 'PRODUCTION MACHINE MANUFACTURING', 'pic' => 'Engineering', 'weight' => 5.0],
                    ['code' => '4.3', 'name' => 'PRODUCTION MACHINE SHIPPING', 'pic' => 'Procurement', 'weight' => 4.0],
                    ['code' => '4.4', 'name' => 'ETA & FACTORY ARRIVAL', 'pic' => 'Procurement', 'weight' => 2.0],
                    ['code' => '4.5', 'name' => 'INSTALLATION & COMMISSIONING', 'pic' => 'Engineering', 'weight' => 5.0],
                ],
            ],
            [
                'code' => '5',
                'name' => 'UTILITY & FACILITY',
                'weight' => 12.0,
                'sub_main_jobs' => [
                    ['code' => '5.1', 'name' => 'PROCUREMENT', 'pic' => 'Procurement', 'weight' => 3.0],
                    ['code' => '5.2', 'name' => 'MANUFACTURING', 'pic' => 'Engineering', 'weight' => 4.0],
                    ['code' => '5.3', 'name' => 'SHIPPING', 'pic' => 'Procurement', 'weight' => 2.0],
                    ['code' => '5.4', 'name' => 'ETA', 'pic' => 'Procurement', 'weight' => 1.0],
                    ['code' => '5.5', 'name' => 'INSTALLATION & FACTORY', 'pic' => 'Engineering', 'weight' => 2.0],
                ],
            ],
            [
                'code' => '6',
                'name' => 'PURCHASING JOBS',
                'weight' => 8.0,
                'sub_main_jobs' => [
                    ['code' => '6.1', 'name' => 'PURCHASING RELATED TO SIPIL WORKS', 'pic' => 'Purchasing', 'weight' => 2.5],
                    ['code' => '6.2', 'name' => 'PURCHASING RELATED TO MACHINE INSTALLATION', 'pic' => 'Purchasing', 'weight' => 3.5],
                    ['code' => '6.3', 'name' => 'PURCHASING RELATED TO UTILITY & FACILITY', 'pic' => 'Purchasing', 'weight' => 2.0],
                ],
            ],
            [
                'code' => '7',
                'name' => 'PROCUREMENT (RAW & SUB MATERIAL)',
                'weight' => 6.0,
                'sub_main_jobs' => [
                    ['code' => '7.1', 'name' => 'SUPPLIER SOURCING & VOLUME', 'pic' => 'Procurement', 'weight' => 1.5],
                    ['code' => '7.2', 'name' => 'PROCUREMENT RAW MATERIAL', 'pic' => 'Procurement', 'weight' => 3.0],
                    ['code' => '7.3', 'name' => 'PRODUCTION OF SUB MATERIAL', 'pic' => 'Production', 'weight' => 1.5],
                ],
            ],
            [
                'code' => '8',
                'name' => 'MECHANICAL WORKS',
                'weight' => 6.0,
                'sub_main_jobs' => [
                    ['code' => '8.1', 'name' => 'PIPING', 'pic' => 'Engineering', 'weight' => 6.0],
                ],
            ],
            [
                'code' => '9',
                'name' => 'ELECTRICAL WORKS',
                'weight' => 5.0,
                'sub_main_jobs' => [
                    ['code' => '9.1', 'name' => 'PLN', 'pic' => 'Engineering', 'weight' => 2.0],
                    ['code' => '9.2', 'name' => 'MDP', 'pic' => 'Engineering', 'weight' => 1.5],
                    ['code' => '9.3', 'name' => 'SDP', 'pic' => 'Engineering', 'weight' => 1.5],
                ],
            ],
            [
                'code' => '10',
                'name' => 'ENVIRONMENT FACILITY WORKS',
                'weight' => 4.0,
                'sub_main_jobs' => [
                    ['code' => '10.1', 'name' => 'APC', 'pic' => 'SHE', 'weight' => 1.5],
                    ['code' => '10.2', 'name' => 'WWTP', 'pic' => 'SHE', 'weight' => 1.5],
                    ['code' => '10.3', 'name' => 'TPS', 'pic' => 'SHE', 'weight' => 1.0],
                ],
            ],
            [
                'code' => '11',
                'name' => 'LEGAL',
                'weight' => 2.0,
                'sub_main_jobs' => [
                    ['code' => '11.1', 'name' => 'NIB', 'pic' => 'Legal', 'weight' => 2.0],
                ],
            ],
            [
                'code' => '12',
                'name' => 'PEOPLE & ORGANIZATION',
                'weight' => 3.0,
                'sub_main_jobs' => [
                    ['code' => '12.1', 'name' => 'ORGANIZATION STRUCTURE', 'pic' => 'HRGA', 'weight' => 0.5],
                    ['code' => '12.2', 'name' => 'PEOPLE', 'pic' => 'HRGA', 'weight' => 1.5],
                    ['code' => '12.3', 'name' => 'TRAINING', 'pic' => 'HRGA', 'weight' => 1.0],
                ],
            ],
            [
                'code' => '13',
                'name' => 'TRIAL',
                'weight' => 3.0,
                'sub_main_jobs' => [
                    ['code' => '13.1', 'name' => 'COLD TRIAL', 'pic' => 'Production', 'weight' => 1.0],
                    ['code' => '13.2', 'name' => 'HOT TRIAL', 'pic' => 'Production', 'weight' => 1.0],
                    ['code' => '13.3', 'name' => 'TRAINING ALL MACHINE & FACILITY FACTORY', 'pic' => 'HRGA', 'weight' => 1.0],
                ],
            ],
            [
                'code' => '14',
                'name' => 'COMMISSIONING',
                'weight' => 2.0,
                'sub_main_jobs' => [
                    ['code' => '14.1', 'name' => 'TAHAP 1', 'pic' => 'Engineering', 'weight' => 0.7],
                    ['code' => '14.2', 'name' => 'TAHAP 2', 'pic' => 'Engineering', 'weight' => 0.7],
                    ['code' => '14.3', 'name' => 'MASS PRODUCTION', 'pic' => 'Production', 'weight' => 0.6],
                ],
            ],
            [
                'code' => '15',
                'name' => 'SALES & MARKETING',
                'weight' => 2.0,
                'sub_main_jobs' => [
                    ['code' => '15.1', 'name' => 'SALES PLANNING', 'pic' => 'Sales', 'weight' => 0.7],
                    ['code' => '15.2', 'name' => 'CUSTOMER SURVEYING', 'pic' => 'Sales', 'weight' => 0.7],
                    ['code' => '15.3', 'name' => 'FIRST SALES DELIVERY', 'pic' => 'Sales', 'weight' => 0.6],
                ],
            ],
            [
                'code' => '16',
                'name' => 'SYSTEM DEVELOPMENT',
                'weight' => 4.0,
                'sub_main_jobs' => [
                    ['code' => '16.1', 'name' => 'PRODUCTION PROCESS', 'pic' => 'Production', 'weight' => 0.4],
                    ['code' => '16.2', 'name' => 'PRODUCTION PLANNING & INVENTORY CONTROL', 'pic' => 'PPIC', 'weight' => 0.4],
                    ['code' => '16.3', 'name' => 'QUALITY', 'pic' => 'QC', 'weight' => 0.35],
                    ['code' => '16.4', 'name' => 'MAINTENANCE', 'pic' => 'Engineering', 'weight' => 0.35],
                    ['code' => '16.5', 'name' => 'ENGINEERING', 'pic' => 'Engineering', 'weight' => 0.35],
                    ['code' => '16.6', 'name' => 'SHE', 'pic' => 'SHE', 'weight' => 0.3],
                    ['code' => '16.7', 'name' => 'IT', 'pic' => 'IT', 'weight' => 0.3],
                    ['code' => '16.8', 'name' => 'HRGA', 'pic' => 'HRGA', 'weight' => 0.3],
                    ['code' => '16.9', 'name' => 'PROCUREMENT', 'pic' => 'Procurement', 'weight' => 0.2],
                    ['code' => '16.10', 'name' => 'PURCHASING', 'pic' => 'Purchasing', 'weight' => 0.2],
                    ['code' => '16.11', 'name' => 'SALES & MARKETING', 'pic' => 'Sales', 'weight' => 0.2],
                    ['code' => '16.12', 'name' => 'FINANCE & ACCOUNTING', 'pic' => 'Finance', 'weight' => 0.2],
                ],
            ],
            [
                'code' => '17',
                'name' => 'CERTIFICATION',
                'weight' => 1.0,
                'sub_main_jobs' => [
                    ['code' => '17.1', 'name' => 'ISO 9001', 'pic' => 'QC', 'weight' => 0.4],
                    ['code' => '17.2', 'name' => 'ISO 14001', 'pic' => 'SHE', 'weight' => 0.4],
                    ['code' => '17.3', 'name' => 'OTHER', 'pic' => 'QC', 'weight' => 0.2],
                ],
            ],
        ];
    }

    /**
     * Automatically applies the fixed company template to the given project.
     * Admin does NOT create Main Job or Sub Main Job manually.
     */
    public function applyTemplateToProject(Project $project): void
    {
        DB::transaction(function () use ($project) {
            $template = self::getTemplate();

            foreach ($template as $mjData) {
                $mainJob = MainJob::create([
                    'project_id' => $project->id,
                    'code' => $mjData['code'],
                    'name' => $mjData['name'],
                    'weight' => $mjData['weight'],
                    'start_date' => $project->start_date,
                    'finish_date' => $project->end_date,
                    'progress' => 0,
                    'status' => 'Open',
                ]);

                foreach ($mjData['sub_main_jobs'] as $smjData) {
                    SubMainJob::create([
                        'main_job_id' => $mainJob->id,
                        'project_id' => $project->id,
                        'code' => $smjData['code'],
                        'name' => $smjData['name'],
                        'pic' => $smjData['pic'],
                        'weight' => $smjData['weight'],
                        'start_date' => $project->start_date,
                        'finish_date' => $project->end_date,
                        'progress' => 0,
                        'status' => 'Open',
                    ]);
                }
            }
        });
    }
}
