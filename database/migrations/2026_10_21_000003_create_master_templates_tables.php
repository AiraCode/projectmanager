<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * BE-08: Master Template Task Management (Dynamic Templates).
     */
    public function up(): void
    {
        if (!Schema::hasTable('project_templates')) {
            Schema::create('project_templates', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name', 255);
                $table->text('description')->nullable();
                $table->boolean('is_default')->default(false);
                $table->unsignedInteger('created_by')->nullable();
                $table->timestamps();

                $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('template_main_tasks')) {
            Schema::create('template_main_tasks', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('template_id');
                $table->string('code', 50)->nullable();
                $table->string('name', 255);
                $table->decimal('weight', 5, 2)->default(0.00);
                $table->unsignedInteger('order_index')->default(0);
                $table->timestamps();

                $table->foreign('template_id')->references('id')->on('project_templates')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('template_sub_tasks')) {
            Schema::create('template_sub_tasks', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('template_main_task_id');
                $table->string('code', 50)->nullable();
                $table->string('name', 255);
                $table->string('default_pic_division', 100)->nullable();
                $table->decimal('weight', 5, 2)->default(0.00);
                $table->unsignedInteger('order_index')->default(0);
                $table->unsignedInteger('default_duration')->default(1);
                $table->timestamps();

                $table->foreign('template_main_task_id')->references('id')->on('template_main_tasks')->cascadeOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('template_sub_tasks');
        Schema::dropIfExists('template_main_tasks');
        Schema::dropIfExists('project_templates');
    }
};
