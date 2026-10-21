<?php
$file = 'database/seeders/DatabaseSeeder.php';
$content = file_get_contents($file);

// Add matrices definitions
$matrices = <<<'PHP'
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
            'sidebar' => ['Tasks', 'Division Progress'],
            'features' => [
                'tasks' => ['view', 'toggle_status'],
                'reports' => ['view']
            ],
            'data_scope' => 'own_company'
        ];

        // 4. Seed Users
PHP;

$content = str_replace('        // 4. Seed Users', $matrices, $content);

// Now we need to append the permission_matrix field to each User::create array based on their role
// Since the structure is quite uniform, we can use regex
$content = preg_replace("/('roles_id'\s*=>\s*\\\$roleSuperAdmin->id,.*?)(]\\);)/s", "$1'permission_matrix' => \$matrixSuperAdmin,\n        $2", $content);
$content = preg_replace("/('roles_id'\s*=>\s*\\\$roleAdminUtama->id,.*?)(]\\);)/s", "$1'permission_matrix' => \$matrixSuperAdmin,\n        $2", $content);
$content = preg_replace("/('roles_id'\s*=>\s*\\\$roleAdminProgres->id,.*?)(]\\);)/s", "$1'permission_matrix' => \$matrixAdminProgres,\n        $2", $content);
$content = preg_replace("/('roles_id'\s*=>\s*\\\$rolePic->id,.*?)(]\\);)/s", "$1'permission_matrix' => \$matrixPic,\n        $2", $content);
$content = preg_replace("/('roles_id'\s*=>\s*\\\$roleWorker->id,.*?)(]\\);)/s", "$1'permission_matrix' => \$matrixWorker,\n            $2", $content);

file_put_contents($file, $content);
echo "Seeder updated successfully.\n";
