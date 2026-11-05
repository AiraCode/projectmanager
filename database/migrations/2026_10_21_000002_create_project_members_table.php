<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * BE-06: Working Tree Structure, User Assignment, and Project-level Roles/Divisions.
     */
    public function up(): void
    {
        if (!Schema::hasTable('project_members')) {
            Schema::create('project_members', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('project_id');
                $table->unsignedInteger('user_id');
                $table->unsignedInteger('division_id')->nullable();
                $table->string('project_role', 50)->default('worker'); // 'pm', 'co_pm', 'lead', 'worker'
                $table->string('position_title', 100)->nullable(); // e.g. "Site Supervisor", "Lead Civil"
                $table->longText('custom_permissions')->nullable();
                $table->unsignedInteger('assigned_by')->nullable();
                $table->timestamps();

                $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('division_id')->references('id')->on('divisions')->nullOnDelete();
                $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();

                $table->unique(['project_id', 'user_id']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_members');
    }
};
