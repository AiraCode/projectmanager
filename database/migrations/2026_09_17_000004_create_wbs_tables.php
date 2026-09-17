<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('main_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->string('code'); // 1 to 17
            $table->string('name');
            $table->decimal('weight', 6, 2)->default(0);
            $table->date('start_date')->nullable();
            $table->date('finish_date')->nullable();
            $table->decimal('progress', 5, 2)->default(0);
            $table->string('status')->default('Open');
            $table->timestamps();
        });

        Schema::create('sub_main_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('main_job_id')->constrained('main_jobs')->cascadeOnDelete();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->string('code'); // e.g. 1.1, 1.2
            $table->string('name');
            $table->string('pic'); // fixed PIC assignment e.g. 'BUSDEV', 'Legal', 'Engineering', etc.
            $table->decimal('weight', 6, 2)->default(0);
            $table->date('start_date')->nullable();
            $table->date('finish_date')->nullable();
            $table->decimal('progress', 5, 2)->default(0);
            $table->string('status')->default('Open');
            $table->timestamps();
        });

        Schema::create('sub_subtasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sub_main_job_id')->constrained('sub_main_jobs')->cascadeOnDelete();
            $table->string('code'); // e.g. 1.1.1
            $table->string('name');
            $table->date('start_date')->nullable();
            $table->date('finish_date')->nullable();
            $table->integer('duration')->default(0);
            $table->integer('days_left')->default(0);
            $table->decimal('progress', 5, 2)->default(0);
            $table->string('status')->default('Open');
            $table->string('predecessor')->nullable();
            $table->string('dep_type')->nullable(); // FS, SS, FF, SF
            $table->integer('lag')->default(0);
            $table->decimal('weight', 6, 2)->default(0);
            $table->boolean('checked')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sub_subtasks');
        Schema::dropIfExists('sub_main_jobs');
        Schema::dropIfExists('main_jobs');
    }
};
