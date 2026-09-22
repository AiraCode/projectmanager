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
            'companies_id' => null,
            'divisions_id' => null,
        ]);

        $pic5 = User::create([
            'username' => 'PIC 5 (Test Create Project)',
            'email' => 'pic5@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);
        $pic6 = User::create([
            'username' => 'PIC 6 (Test Create Project)',
            'email' => 'pic6@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);
        $pic7 = User::create([
            'username' => 'PIC 7 (Test Create Project)',
            'email' => 'pic7@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);
        $pic8 = User::create([
            'username' => 'PIC 8 (Test Create Project)',
            'email' => 'pic8@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);
        $pic9 = User::create([
            'username' => 'PIC 9 (Test Create Project)',
            'email' => 'pic9@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
            'divisions_id' => null,
        ]);
        $pic10 = User::create([
            'username' => 'PIC 10 (Test Create Project)',
            'email' => 'pic10@jeker.id',
            'password' => Hash::make('admin123'),
            'roles_id' => $rolePic->id,
            'companies_id' => null,
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
