<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$projects = \App\Models\Project::all();
foreach($projects as $p) {
    echo "Project ID: {$p->id}, Title: {$p->title}, is_private: {$p->is_private}, companies_id: {$p->companies_id}\n";
}
