<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$users = \App\Models\User::with('role')->where('companies_id', 1)->get();
foreach($users as $u) {
    if ($u->role->name === 'worker') {
        echo "User ID: {$u->id}, Username: {$u->username}\n";
        echo "Matrix: " . json_encode($u->permission_matrix) . "\n\n";
    }
}
