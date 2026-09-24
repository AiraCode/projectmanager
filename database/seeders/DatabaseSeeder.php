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
        $roleSuperAdmin = Role::create(['name' => 'SuperAdmin']);
        $roleAdminUtama = Role::create(['name' => 'admin_utama']);
        $roleAdminProgres = Role::create(['name' => 'admin_progres']);
        $rolePic = Role::create(['name' => 'pic']);
        $roleWorker = Role::create(['name' => 'worker']);

        // 2. Seed Divisions
        $divisiNames = [
            'Produksi', 'PPIC', 'Procurement', 'Purchasing', 'HRGA', 'Legal', 
            'BusDev', 'Engineering', 'Finance', 'PM', 'SHE', 'QC', 'Sales', 'IT'
        ];
        $divisions = [];
        foreach ($divisiNames as $name) {
            $divisions[$name] = Division::create(['divisi' => $name]);
        }

        // 3. Seed Companies
        $companyKWT = Company::create(['name' => 'PT. KARABHA WIRATAMA']);
        $companyIG = Company::create(['name' => 'PT. INDOPRIMA GEMILANG']);
        $companyIN = Company::create(['name' => 'PT. INDOPRIMA NUSANTARA']);

        // Default permission matrices
        $matrixSuperAdmin = [
            'sidebar' => ['Dashboard', 'Project List', 'Tasks', 'Weekly Progress', 'Budget Management', 'Timeline', 'Division Progress', 'S-Curve Report', 'User Management'],
            'features' => [
                'projects' => ['view', 'create', 'edit', 'delete'],
                'tasks' => ['view', 'create', 'edit', 'delete', 'toggle_status'],
                'weekly' => ['view', 'submit', 'edit', 'delete'],
                'budget' => ['view', 'create', 'edit', 'delete'],
                'reports' => ['view']
            ],
            'data_scope' => 'all'
        ];

        $matrixAdminProgres = [
            'sidebar' => ['Project List', 'S-Curve Report'],
            'features' => [
                'projects' => ['view'],
                'reports' => ['view']
            ],
            'data_scope' => 'all'
        ];

        $matrixPic = [
            'sidebar' => ['Dashboard', 'Project List', 'Tasks', 'Weekly Progress', 'Budget Management', 'Timeline', 'Division Progress', 'S-Curve Report', 'User Management'],
            'features' => [
                'projects' => ['view', 'create', 'edit', 'delete'],
                'tasks' => ['view', 'create', 'edit', 'delete', 'toggle_status'],
                'weekly' => ['view', 'submit', 'edit', 'delete'],
                'budget' => ['view', 'create', 'edit', 'delete'],
                'reports' => ['view']
            ],
            'data_scope' => 'own_company'
        ];

        $matrixWorker = [
            'sidebar' => ['Tasks', 'Division Progress', 'Weekly Progress'],
            'features' => [
                'tasks' => ['view', 'toggle_status'],
                'weekly' => ['view'],
                'reports' => ['view']
            ],
            'data_scope' => 'own_company'
        ];

        // 4. Seed Users

        // SuperAdmins
        User::create([
            'username' => 'Super Administrator',
            'email' => 'superadmin@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleSuperAdmin->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixSuperAdmin,
        ]);

        User::create([
            'username' => 'Super Admin Backup',
            'email' => 'backup_superadmin@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleSuperAdmin->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixSuperAdmin,
        ]);

        // Admin Utama & Admin Progres
        User::create([
            'username' => 'Admin Utama',
            'email' => 'admin@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleAdminUtama->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixSuperAdmin,
        ]);

        User::create([
            'username' => 'Admin Progres',
            'email' => 'progres@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $roleAdminProgres->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixAdminProgres,
        ]);

        // 3 PICs
        $pic1 = User::create([
            'username' => 'PIC KWT',
            'email' => 'pic1@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyKWT->id,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);

        $pic2 = User::create([
            'username' => 'PIC IG',
            'email' => 'pic2@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyIG->id,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);

        $pic3 = User::create([
            'username' => 'PIC IN',
            'email' => 'pic3@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => $companyIN->id,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);

        $pic4 = User::create([
            'username' => 'PIC 4 (Test Create Project)',
            'email' => 'pic4@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);

        $pic5 = User::create([
            'username' => 'PIC 5 (Test Create Project)',
            'email' => 'pic5@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);
        $pic6 = User::create([
            'username' => 'PIC 6 (Test Create Project)',
            'email' => 'pic6@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);
        $pic7 = User::create([
            'username' => 'PIC 7 (Test Create Project)',
            'email' => 'pic7@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);
        $pic8 = User::create([
            'username' => 'PIC 8 (Test Create Project)',
            'email' => 'pic8@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);
        $pic9 = User::create([
            'username' => 'PIC 9 (Test Create Project)',
            'email' => 'pic9@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);
        $pic10 = User::create([
            'username' => 'PIC 10 (Test Create Project)',
            'email' => 'pic10@provis.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        'permission_matrix' => $matrixPic,
        ]);

        // Workers for testing auth scopes
        foreach ($divisions as $name => $division) {
            User::create([
                'username' => 'Worker ' . $name,
                'email' => strtolower($name) . '@provis.id',
                'password' => Hash::make('admin123'),
                'roles_id' => $roleWorker->id,
                'companies_id' => $companyKWT->id,
                'divisions_id' => $division->id,
            'permission_matrix' => $matrixWorker,
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
            'progress' => 0,
            'status' => 'Open',
        ]);

        $proj2 = Project::create([
            'companies_id' => $companyIG->id,
            'project_manager' => $pic2->id,
            'title' => 'EXPANSION PHASE 1',
            'start' => Carbon::parse('2026-08-01'),
            'end' => Carbon::parse('2026-12-31'),
            'actual_start' => Carbon::parse('2026-08-01'),
            'actual_end' => Carbon::parse('2026-12-31'),
            'progress' => 0,
            'status' => 'Open',
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

        // 6. Apply standard 17 Main Jobs template to all 3 projects
        $templateService = app(\App\Services\ProjectTemplateService::class);
        $progressService = app(\App\Services\ProgressService::class);

        $templateService->applyTemplateToProject($proj1);
        $templateService->applyTemplateToProject($proj2);
        $templateService->applyTemplateToProject($proj3);

        // Mark some initial tasks completed for Proj 1 to show active progress
        $proj1Tasks = Wbs::whereHas('parentSubWbs.mainWbs', fn($q) => $q->where('projects_id', $proj1->id))->take(6)->get();
        foreach ($proj1Tasks as $t) {
            $t->is_completed = true;
            $t->status = 'Completed';
            $t->save();
        }
        $progressService->recalculateProjectProgress($proj1->id);

        // Mark some tasks completed for Proj 2
        $proj2Tasks = Wbs::whereHas('parentSubWbs.mainWbs', fn($q) => $q->where('projects_id', $proj2->id))->take(18)->get();
        foreach ($proj2Tasks as $t) {
            $t->is_completed = true;
            $t->status = 'Completed';
            $t->save();
        }
        $progressService->recalculateProjectProgress($proj2->id);
    }
}
