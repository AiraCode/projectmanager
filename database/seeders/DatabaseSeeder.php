<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectTemplateService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Seed Dynamic Companies
        $ipg = Company::create([
            'name' => 'PT Indoprima Gemilang',
            'code' => 'IPG',
            'address' => 'Jl. Mayjend Sungkono No. 88, Gresik, Jawa Timur',
        ]);

        $ipn = Company::create([
            'name' => 'PT Indoprima Nusantara',
            'code' => 'IPN',
            'address' => 'Jl. Raya Darmo No. 45, Surabaya, Jawa Timur',
        ]);

        // 2. Seed Admin Users
        // Admin 1 owns Project 1
        $admin1 = User::create([
            'name' => 'Budi Santoso',
            'email' => 'admin@jeker.id',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
            'pic_role' => 'PM',
        ]);

        // Admin 2 is unassigned (owns 0 projects) to test the Project Creation flow
        $admin2 = User::create([
            'name' => 'Siti Rahma',
            'email' => 'admin2@jeker.id',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
            'pic_role' => 'PM',
        ]);

        // 3. Seed PIC Users representing departments from MASTER Project MGMT
        $picUsers = [
            ['name' => 'Andi Prasetyo', 'email' => 'engineering@jeker.id', 'pic_role' => 'Engineering'],
            ['name' => 'Dewi Lestari', 'email' => 'procurement@jeker.id', 'pic_role' => 'Procurement'],
            ['name' => 'Ahmad Fauzi', 'email' => 'purchasing@jeker.id', 'pic_role' => 'Purchasing'],
            ['name' => 'Hendra Wijaya', 'email' => 'legal@jeker.id', 'pic_role' => 'Legal'],
            ['name' => 'Bambang Suryo', 'email' => 'production@jeker.id', 'pic_role' => 'Production'],
            ['name' => 'Rina Kurnia', 'email' => 'ppic@jeker.id', 'pic_role' => 'PPIC'],
            ['name' => 'Maya Putri', 'email' => 'hrga@jeker.id', 'pic_role' => 'HRGA'],
            ['name' => 'David Tan', 'email' => 'finance@jeker.id', 'pic_role' => 'Finance'],
            ['name' => 'Arif Budiman', 'email' => 'she@jeker.id', 'pic_role' => 'SHE'],
            ['name' => 'Joko Susilo', 'email' => 'qc@jeker.id', 'pic_role' => 'QC'],
            ['name' => 'Farida Sari', 'email' => 'sales@jeker.id', 'pic_role' => 'Sales'],
            ['name' => 'Reza Firmansyah', 'email' => 'it@jeker.id', 'pic_role' => 'IT'],
            ['name' => 'Kevin Pratama', 'email' => 'busdev@jeker.id', 'pic_role' => 'BUSDEV'],
            // Standard demo pic alias
            ['name' => 'PIC Staff Demo', 'email' => 'pic@jeker.id', 'pic_role' => 'Engineering'],
        ];

        foreach ($picUsers as $pic) {
            User::create([
                'name' => $pic['name'],
                'email' => $pic['email'],
                'password' => Hash::make('pic123'),
                'role' => 'pic',
                'pic_role' => $pic['pic_role'],
            ]);
        }

        // 4. Seed Project 1 owned by Admin 1 (Budi Santoso)
        $project1 = Project::create([
            'company_id' => $ipg->id,
            'admin_id' => $admin1->id,
            'name' => 'Pembangunan Pabrik Baru Tahap II',
            'project_manager' => 'Budi Santoso',
            'start_date' => '2024-01-15',
            'end_date' => '2026-12-31',
            'total_budget' => 45_000_000_000,
            'status' => 'On Track',
            'overall_progress' => 78.0,
            'description' => 'Project pembangunan fasilitas manufaktur baru tahap II di kawasan industri Gresik.',
        ]);

        // Auto-populate 17 Main Jobs and Sub Main Jobs template
        $templateService = new ProjectTemplateService();
        $templateService->applyTemplateToProject($project1);
    }
}
