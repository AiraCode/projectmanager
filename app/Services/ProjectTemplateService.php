<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Division;
use App\Models\ListMainWbsName;
use App\Models\MainWbs;
use App\Models\ListSubWbsName;
use App\Models\SubWbs;
use App\Models\Wbs;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

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
                    ['code' => '1.11', 'name' => 'LOA OF BUSDEV PROJECT', 'pic' => 'BUSDEV', 'weight' => 0.25],
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
                'name' => 'CIVIL WORKS',
                'weight' => 16.0,
                'sub_main_jobs' => [
                    ['code' => '3.1', 'name' => 'CIVIL WORKS DESIGN, SPEC & RAB', 'pic' => 'Engineering', 'weight' => 2.0],
                    ['code' => '3.2', 'name' => 'CIVIL PROJECT SCHEDULE', 'pic' => 'PM', 'weight' => 1.0],
                    ['code' => '3.3', 'name' => 'FOUNDATION CONSTRUCTION', 'pic' => 'Engineering', 'weight' => 5.0],
                    ['code' => '3.4', 'name' => 'STEEL STRUCTURE CONSTRUCTION', 'pic' => 'Engineering', 'weight' => 6.0],
                    ['code' => '3.5', 'name' => 'FINISHING WORKS', 'pic' => 'Engineering', 'weight' => 2.0],
                ],
            ],
            [
                'code' => '4',
                'name' => 'PRODUCTION MACHINE & INSTALLATION',
                'weight' => 18.0,
                'sub_main_jobs' => [
                    ['code' => '4.1', 'name' => 'PRODUCTION MACHINE PROCUREMENT', 'pic' => 'Procurement', 'weight' => 4.0],
                    ['code' => '4.2', 'name' => 'PRODUCTION MACHINE MANUFACTURING', 'pic' => 'Engineering', 'weight' => 4.0],
                    ['code' => '4.3', 'name' => 'PRODUCTION MACHINE SHIPPING', 'pic' => 'Procurement', 'weight' => 4.0],
                    ['code' => '4.4', 'name' => 'ETA & FACTORY ARRIVAL', 'pic' => 'Procurement', 'weight' => 2.0],
                    ['code' => '4.5', 'name' => 'INSTALLATION & COMMISSIONING', 'pic' => 'Engineering', 'weight' => 4.0],
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
                    ['code' => '6.1', 'name' => 'PURCHASING RELATED TO CIVIL WORKS', 'pic' => 'Purchasing', 'weight' => 2.5],
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
                    ['code' => '16.3', 'name' => 'QUALITY', 'pic' => 'QC', 'weight' => 0.4],
                    ['code' => '16.4', 'name' => 'MAINTENANCE', 'pic' => 'Engineering', 'weight' => 0.4],
                    ['code' => '16.5', 'name' => 'ENGINEERING', 'pic' => 'Engineering', 'weight' => 0.3],
                    ['code' => '16.6', 'name' => 'SHE', 'pic' => 'SHE', 'weight' => 0.3],
                    ['code' => '16.7', 'name' => 'IT', 'pic' => 'IT', 'weight' => 0.3],
                    ['code' => '16.8', 'name' => 'HRGA', 'pic' => 'HRGA', 'weight' => 0.3],
                    ['code' => '16.9', 'name' => 'PROCUREMENT', 'pic' => 'Procurement', 'weight' => 0.3],
                    ['code' => '16.10', 'name' => 'PURCHASING', 'pic' => 'Purchasing', 'weight' => 0.3],
                    ['code' => '16.11', 'name' => 'SALES & MARKETING', 'pic' => 'Sales', 'weight' => 0.3],
                    ['code' => '16.12', 'name' => 'FINANCE & ACCOUNTING', 'pic' => 'Finance', 'weight' => 0.3],
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
     * Automatically applies the fixed 17-job company template to the given project.
     * Admin does NOT create Main Job or Sub Main Job manually.
     */
    public function applyTemplateToProject(Project $project): void
    {
        DB::transaction(function () use ($project) {
            $template = self::getTemplate();

            $divisions = Division::all()->keyBy(function ($item) {
                return strtolower(trim($item->divisi));
            });

            $picToDiv = [
                'busdev'      => 'busdev',
                'engineering' => 'engineering',
                'legal'       => 'legal',
                'finance'     => 'finance',
                'pm'          => 'pm',
                'procurement' => 'procurement',
                'purchasing'  => 'purchasing',
                'production'  => 'produksi',
                'she'         => 'she',
                'hrga'        => 'hrga',
                'sales'       => 'sales',
                'ppic'        => 'ppic',
                'qc'          => 'qc',
                'it'          => 'it',
            ];

            $defaultDivId = Division::first()?->id;
            $taskCounter = 1;

            $projStart = Carbon::parse($project->start ?? Carbon::now())->startOfDay();
            $projEnd   = Carbon::parse($project->end ?? (clone $projStart)->addMonths(6))->startOfDay();
            if ($projEnd->lessThanOrEqualTo($projStart)) {
                $projEnd = (clone $projStart)->addDays(180);
            }
            $totalDays = max(1, $projStart->diffInDays($projEnd));

            // Master timeline phase allocation (normalized to [0.0, 1.0] across project duration)
            $mjTimelineWindows = [
                '1'  => [0.00, 0.20], // BUSINESS DEVELOPMENT (PROJECT DOCUMENT PREPARATION)
                '2'  => [0.10, 0.30], // FACTORY LAYOUT & PROCESS DESIGN
                '3'  => [0.20, 0.60], // CIVIL WORKS
                '4'  => [0.35, 0.75], // PRODUCTION MACHINE & INSTALLATION
                '5'  => [0.40, 0.75], // UTILITY & FACILITY
                '6'  => [0.20, 0.60], // PURCHASING JOBS
                '7'  => [0.45, 0.75], // PROCUREMENT (RAW & SUB MATERIAL)
                '8'  => [0.45, 0.75], // MECHANICAL WORKS
                '9'  => [0.45, 0.75], // ELECTRICAL WORKS
                '10' => [0.55, 0.80], // ENVIRONMENT FACILITY WORKS
                '11' => [0.05, 0.45], // LEGAL
                '12' => [0.40, 0.85], // PEOPLE & ORGANIZATION
                '13' => [0.70, 0.88], // TRIAL
                '14' => [0.82, 0.95], // COMMISSIONING
                '15' => [0.65, 0.98], // SALES & MARKETING
                '16' => [0.25, 0.90], // SYSTEM DEVELOPMENT
                '17' => [0.85, 1.00], // CERTIFICATION
            ];

            foreach ($template as $mjData) {
                $window = $mjTimelineWindows[$mjData['code']] ?? [0.0, 1.0];
                $mjStartOffset = (int) round($window[0] * $totalDays);
                $mjEndOffset   = (int) round($window[1] * $totalDays);
                if ($mjEndOffset <= $mjStartOffset) {
                    $mjEndOffset = min($totalDays, $mjStartOffset + 1);
                }

                $mjStart = (clone $projStart)->addDays($mjStartOffset);
                $mjEnd   = (clone $projStart)->addDays($mjEndOffset);
                if ($mjEnd->greaterThan($projEnd)) {
                    $mjEnd = clone $projEnd;
                }
                $mjDurationDays = max(1, $mjStart->diffInDays($mjEnd));

                $listMain = ListMainWbsName::firstOrCreate([
                    'name' => $mjData['name'],
                ]);

                $mainWbs = MainWbs::updateOrCreate(
                    [
                        'projects_id'            => $project->id,
                        'list_main_wbs_names_id' => $listMain->id,
                    ],
                    [
                        'name'                   => $mjData['name'],
                        'percentage'             => $mjData['weight'],
                        'start'                  => $mjStart,
                        'end'                    => $mjEnd,
                        'actual_start'           => $mjStart,
                        'actual_end'             => $mjEnd,
                        'progress'               => 0,
                        'status'                 => 'Open',
                    ]
                );

                $smjList = $mjData['sub_main_jobs'] ?? [];
                $smjCount = count($smjList);
                $prevSmjStart = null;
                $prevSmjEnd = null;
                $prevTaskId = null;

                foreach ($smjList as $smjIdx => $smjData) {
                    $listSub = ListSubWbsName::firstOrCreate([
                        'name'                         => $smjData['name'],
                        'list_main_wbs_names_copy1_id' => $listMain->id,
                    ]);

                    if ($smjCount <= 1) {
                        $smjStart = clone $mjStart;
                        $smjEnd   = clone $mjEnd;
                    } else {
                        // Healthy proportional duration for each sub main job within the Main Job window
                        $smjDurationDays = max(1, (int) round($mjDurationDays * 0.40));
                        $maxStartOffset  = max(0, $mjDurationDays - $smjDurationDays);
                        $smjStartOffset  = (int) round(($smjIdx / ($smjCount - 1)) * $maxStartOffset);

                        $smjStart = (clone $mjStart)->addDays($smjStartOffset);
                        $smjEnd   = (clone $smjStart)->addDays($smjDurationDays);
                        if ($smjEnd->greaterThan($mjEnd)) {
                            $smjEnd = clone $mjEnd;
                        }
                    }
                    $taskDurationDays = max(1, $smjStart->diffInDays($smjEnd) + 1);

                    $subWbs = SubWbs::updateOrCreate(
                        [
                            'sub_wbs_id'            => $mainWbs->id,
                            'list_sub_wbs_names_id' => $listSub->id,
                        ],
                        [
                            'name'                  => $smjData['name'],
                            'predecessor'           => $prevTaskId ? $prevTaskId : '-',
                            'predecessor_type'      => 'FS',
                            'start'                 => $smjStart,
                            'end'                   => $smjEnd,
                            'actual_start'          => $smjStart,
                            'actual_end'            => $smjEnd,
                            'weight'                => $smjData['weight'],
                            'progress'              => 0,
                            'status'                => 'Open',
                        ]
                    );

                    $picKey = strtolower(trim($smjData['pic'] ?? ''));
                    $divName = $picToDiv[$picKey] ?? $picKey;
                    $divId = $divisions->get($divName)?->id ?? $defaultDivId;

                    $wbsId = 'st-' . $project->id . '-seq-' . $taskCounter;

                    // Calculate dependency relationship with previous task in the same Main Job
                    $depType = 'FS';
                    $lagDays = 0;
                    if ($prevTaskId && $prevSmjStart && $prevSmjEnd) {
                        if ($smjStart->greaterThanOrEqualTo($prevSmjEnd)) {
                            $depType = 'FS';
                            $lagDays = (int) $prevSmjEnd->diffInDays($smjStart);
                        } else {
                            $depType = 'SS';
                            $lagDays = (int) max(0, $prevSmjStart->diffInDays($smjStart));
                        }
                    }

                    Wbs::withTrashed()->updateOrCreate(
                        ['id' => $wbsId],
                        [
                            'sub_wbs_id'   => $subWbs->id,
                            'divisions_id' => $divId,
                            'name'         => $smjData['name'] . ' (Execution)',
                            'vendor'       => 'INTERNAL',
                            'start'        => $smjStart,
                            'end'          => $smjEnd,
                            'is_completed' => false,
                            'status'       => 'Open',
                            'predecessor'  => $prevTaskId,
                            'dep_type'     => $prevTaskId ? $depType : 'FS',
                            'lag'          => $lagDays,
                            'lead'         => 0,
                            'duration_days'=> $taskDurationDays,
                            'requires_evidence' => false,
                            'deleted_at'   => null,
                        ]
                    );

                    if ($prevTaskId) {
                        $group = \App\Models\TaskDependencyGroup::firstOrCreate(
                            [
                                'successor_wbs_id' => $wbsId,
                                'dependency_type'  => $depType,
                                'lag_days'         => $lagDays,
                            ],
                        );
                        \App\Models\TaskDependency::updateOrCreate(
                            [
                                'predecessor_wbs_id' => $prevTaskId,
                                'successor_wbs_id'   => $wbsId,
                            ],
                            [
                                'dependency_group_id' => $group->id,
                                'dependency_type'     => $depType,
                                'lag_days'            => $lagDays,
                            ]
                        );
                    }

                    $prevSmjStart = clone $smjStart;
                    $prevSmjEnd   = clone $smjEnd;
                    $prevTaskId   = $wbsId;
                    $taskCounter++;
                }
            }
        });

        app(ProgressService::class)->recalculateProjectProgress($project->id);
    }
}
