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
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            // Strictly enforce Admin Ownership Rule: One Admin can own exactly one Project in total.
            $table->foreignId('admin_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('project_manager');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->unsignedBigInteger('total_budget')->default(0);
            $table->string('status')->default('Open');
            $table->decimal('overall_progress', 5, 2)->default(0);
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
