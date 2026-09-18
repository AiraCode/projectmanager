<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Division;
use App\Models\Role;
use App\Models\User;
use App\Models\Project;
use App\Models\ListMainWbsName;
use App\Models\MainWbs;
use App\Models\ListSubWbsName;
use App\Models\SubWbs;
use App\Models\Wbs;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed Roles
        $roleAdminUtama = Role::create(['name' => 'admin_utama']);
        $roleAdminProgres = Role::create(['name' => 'admin_progres']);
        $rolePic = Role::create(['name' => 'pic']);
        $roleWorker = Role::create(['name' => 'worker']);

        // 2. Seed Divisions
        $divisiNames = ['Produksi', 'PPIC', 'Procurement', 'Purchasing', 'HRGA', 'Legal', 'BusDev'];
        $divisions = [];
        foreach ($divisiNames as $name) {
            $divisions[$name] = Division::create(['divisi' => $name]);
        }

        // 3. Seed Companies
        $companyKWT = Company::create(['name' => 'PT. KARABHA WIRATAMA']);
        $companyIG = Company::create(['name' => 'PT. INDOPRIMA GEMILANG']);
        $companyIN = Company::create(['name' => 'PT. INDOPRIMA NUSANTARA']);

        // 4. Seed Users

        // Admin Utama & Admin Progres
        User::create([
            'username' => 'Admin Utama',
            'email' => 'admin@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleAdminUtama->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);

        User::create([
            'username' => 'Admin Progres',
            'email' => 'progres@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleAdminProgres->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);

        // 3 PICs
        $pic1 = User::create([
            'username' => 'PIC KWT',
            'email' => 'pic1@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyKWT->id,
            'divisions_id' => null,
        ]);

        $pic2 = User::create([
            'username' => 'PIC IG',
            'email' => 'pic2@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyIG->id,
            'divisions_id' => null,
        ]);

        $pic3 = User::create([
            'username' => 'PIC IN',
            'email' => 'pic3@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyIN->id,
            'divisions_id' => null,
        ]);

        $pic4 = User::create([
            'username' => 'PIC 4 (Test Create Project)',
            'email' => 'pic4@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null, // Sengaja null / atau bisa diberi company bebas untuk test
            'divisions_id' => null,
        ]);

        // Workers for testing auth scopes
        foreach ($divisions as $name => $division) {
            User::create([
                'username' => 'Worker ' . $name,
                'email' => strtolower($name) . '@jeker.id',
                'password' => Hash::make('admin123'),
                'roles_id' => $roleWorker->id,
                'companies_id' => $companyKWT->id,
                'divisions_id' => $division->id,
            ]);
        }

        // 5. Seed Projects
        $proj1 = Project::create([
            'companies_id' => $companyKWT->id,
            'project_manager' => $pic1->id,
            'title' => 'KWT PROJECT - TARGET COMMISIONING',
            'start' => Carbon::parse('2026-09-03'),
            'end' => Carbon::parse('2027-10-01'),
            'actual_start' => Carbon::parse('2026-09-03'),
            'actual_end' => Carbon::parse('2027-10-01'),
            'progress' => 10,
            'status' => 'On Track',
        ]);

        $proj2 = Project::create([
            'companies_id' => $companyIG->id,
            'project_manager' => $pic2->id,
            'title' => 'EXPANSION PHASE 1',
            'start' => Carbon::parse('2026-08-01'),
            'end' => Carbon::parse('2026-12-31'),
            'actual_start' => Carbon::parse('2026-08-01'),
            'actual_end' => Carbon::parse('2026-12-31'),
            'progress' => 45,
            'status' => 'On Track',
        ]);

        $proj3 = Project::create([
            'companies_id' => $companyIN->id,
            'project_manager' => $pic3->id,
            'title' => 'DIGITAL TRANSFORMATION',
            'start' => Carbon::parse('2026-10-01'),
            'end' => Carbon::parse('2027-05-01'),
            'actual_start' => Carbon::parse('2026-10-01'),
            'actual_end' => Carbon::parse('2027-05-01'),
            'progress' => 0,
            'status' => 'Open',
        ]);

        // 6. Seed WBS Hierarchy for Proj1 (from PDF context)
        
        // Define WBS Structure for Seeder
        $wbsStructure = [
            [
                'name' => 'BUSINESS DEVELOPMENT',
                'weight' => 20,
                'subs' => [
                    [
                        'name' => 'BUSINESS DEVELOPMENT PROPOSAL',
                        'tasks' => [
                            ['name' => 'Prepare proposal', 'division' => 'HRGA', 'days' => 15, 'done' => true],
                            ['name' => 'Internal review & approval', 'division' => 'Procurement', 'days' => 0, 'done' => true],
                        ]
                    ],
                    [
                        'name' => 'MOU SIGNING',
                        'tasks' => [
                            ['name' => 'Draft MOU', 'division' => 'Procurement', 'days' => 0, 'done' => true],
                            ['name' => 'Sign MOU', 'division' => 'Legal', 'days' => 0, 'done' => true],
                        ]
                    ]
                ]
            ],
            [
                'name' => 'FACTORY LAYOUT & PROSES DESIGN',
                'weight' => 30,
                'subs' => [
                    [
                        'name' => 'FACTORY & LAND LAYOUT',
                        'tasks' => [
                            ['name' => 'LAND LAYOUT', 'division' => 'HRGA', 'days' => 15, 'done' => false],
                            ['name' => 'FACTORY LAYOUT', 'division' => 'Procurement', 'days' => 0, 'done' => false],
                        ]
                    ],
                    [
                        'name' => 'PROCESS DESIGN',
                        'tasks' => [
                            ['name' => 'PROCESS 1', 'division' => 'Produksi', 'days' => 0, 'done' => false],
                        ]
                    ]
                ]
            ],
            [
                'name' => 'SIPIL WORKS',
                'weight' => 50,
                'subs' => [
                    [
                        'name' => 'SIPIL WORKS DESIGN, SPEC & RAB',
                        'tasks' => [
                            ['name' => 'Business Matching', 'division' => 'HRGA', 'days' => 15, 'done' => false],
                            ['name' => 'Business Concept', 'division' => 'Procurement', 'days' => 0, 'done' => false],
                        ]
                    ]
                ]
            ]
        ];

        $mainCount = 1;
        $subCount = 1;
        $taskCount = 1;

        foreach ($wbsStructure as $main) {
            $listMain = ListMainWbsName::create(['name' => $main['name']]);
            
            $mainWbs = MainWbs::create([
                'projects_id' => $proj1->id,
                'list_main_wbs_names_id' => $listMain->id,
                'percentage' => $main['weight'],
                'actual_start' => Carbon::parse('2026-09-03'),
                'actual_end' => Carbon::parse('2026-09-18'),
                'progress' => $main['name'] == 'BUSINESS DEVELOPMENT' ? 100 : 0,
                'status' => $main['name'] == 'BUSINESS DEVELOPMENT' ? 'Completed' : 'On Track',
            ]);

            foreach ($main['subs'] as $sub) {
                $listSub = ListSubWbsName::create(['name' => $sub['name'], 'list_main_wbs_names_copy1_id' => $listMain->id]);
                
                $subWbs = SubWbs::create([
                    'sub_wbs_id' => $mainWbs->id,
                    'list_sub_wbs_names_id' => $listSub->id,
                    'predecessor' => '-',
                    'predecessor_type' => 'FS',
                    'start' => Carbon::parse('2026-09-03'),
                    'end' => Carbon::parse('2026-09-18'),
                    'actual_start' => Carbon::parse('2026-09-03'),
                    'actual_end' => Carbon::parse('2026-09-18'),
                    'progress' => $main['name'] == 'BUSINESS DEVELOPMENT' ? 100 : 0,
                    'status' => $main['name'] == 'BUSINESS DEVELOPMENT' ? 'Completed' : 'On Track',
                    'weight' => 10,
                ]);

                foreach ($sub['tasks'] as $task) {
                    Wbs::create([
                        'id' => 'st-0' . $taskCount,
                        'sub_wbs_id' => $subWbs->id,
                        'divisions_id' => $divisions[$task['division']]->id,
                        'name' => $task['name'],
                        'vendor' => 'INTERNAL',
                        'start' => Carbon::parse('2026-09-03'),
                        'end' => Carbon::parse('2026-09-03')->addDays($task['days']),
                        'is_completed' => $task['done'],
                        'status' => $task['done'] ? 'Completed' : 'Open',
                    ]);
                    $taskCount++;
                }
                $subCount++;
            }
            $mainCount++;
        }
    }
}
