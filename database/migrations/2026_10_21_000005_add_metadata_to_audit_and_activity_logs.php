<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * BE-04 & BE-10: Detailed Audit Logs and Task Progress History with metadata and diffs.
     */
    public function up(): void
    {
        if (Schema::hasTable('project_activity_logs')) {
            Schema::table('project_activity_logs', function (Blueprint $table) {
                if (!Schema::hasColumn('project_activity_logs', 'old_progress')) {
                    $table->integer('old_progress')->nullable()->after('action');
                }
                if (!Schema::hasColumn('project_activity_logs', 'new_progress')) {
                    $table->integer('new_progress')->nullable()->after('old_progress');
                }
                if (!Schema::hasColumn('project_activity_logs', 'metadata')) {
                    $table->json('metadata')->nullable()->after('description');
                }
            });
        }

        if (Schema::hasTable('audit_logs')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                if (!Schema::hasColumn('audit_logs', 'metadata')) {
                    $table->json('metadata')->nullable()->after('description');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('project_activity_logs')) {
            Schema::table('project_activity_logs', function (Blueprint $table) {
                $columns = [];
                if (Schema::hasColumn('project_activity_logs', 'old_progress')) $columns[] = 'old_progress';
                if (Schema::hasColumn('project_activity_logs', 'new_progress')) $columns[] = 'new_progress';
                if (Schema::hasColumn('project_activity_logs', 'metadata')) $columns[] = 'metadata';
                if (!empty($columns)) {
                    $table->dropColumn($columns);
                }
            });
        }

        if (Schema::hasTable('audit_logs') && Schema::hasColumn('audit_logs', 'metadata')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->dropColumn('metadata');
            });
        }
    }
};
