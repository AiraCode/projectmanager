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
        Schema::create('weekly_progress', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('projects_id');
            $table->unsignedInteger('week_number');
            $table->decimal('actual_progress', 6, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('projects_id')
                  ->references('id')->on('projects')
                  ->onDelete('cascade');

            $table->unique(['projects_id', 'week_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('weekly_progress');
    }
};
