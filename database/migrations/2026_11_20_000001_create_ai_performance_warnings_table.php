<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_performance_warnings')) {
            Schema::drop('ai_performance_warnings');
        }

        Schema::create('ai_performance_warnings', function (Blueprint $table) {
            $table->id();
            $table->string('warning_key', 180)->unique();
            $table->unsignedInteger('user_id');
            $table->unsignedBigInteger('project_id');
            $table->unsignedInteger('company_id')->nullable();
            $table->unsignedInteger('division_id')->nullable();
            $table->string('warning_type', 40)->default('behind_schedule'); // overdue_tasks | behind_schedule | low_progress
            $table->string('severity', 20)->default('warning'); // critical | warning
            $table->string('status', 20)->default('active'); // active | acknowledged | resolved
            $table->string('title', 200);
            $table->text('message');
            $table->json('metrics_json')->nullable();
            $table->string('fingerprint', 64)->nullable();
            $table->timestamp('detected_at')->nullable();
            $table->timestamp('last_evaluated_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status'], 'idx_ai_pw_user_status');
            $table->index(['company_id', 'status'], 'idx_ai_pw_company_status');
            $table->index(['project_id', 'status'], 'idx_ai_pw_project_status');
            $table->index(['severity', 'status'], 'idx_ai_pw_severity_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_performance_warnings');
    }
};
