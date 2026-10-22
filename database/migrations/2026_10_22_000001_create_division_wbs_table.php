<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Support multiple divisions assigned to a single WBS task.
     */
    public function up(): void
    {
        if (!Schema::hasTable('division_wbs')) {
            Schema::create('division_wbs', function (Blueprint $table) {
                $table->increments('id');
                $table->string('wbs_id', 255);
                $table->unsignedInteger('division_id');
                $table->timestamps();

                $table->foreign('wbs_id')->references('id')->on('wbs')->cascadeOnDelete();
                $table->foreign('division_id')->references('id')->on('divisions')->cascadeOnDelete();
                $table->unique(['wbs_id', 'division_id']);
            });

            // Backfill existing tasks' primary divisions_id into division_wbs pivot
            $existing = DB::table('wbs')->whereNotNull('divisions_id')->get(['id', 'divisions_id']);
            $now = now();
            foreach ($existing as $item) {
                DB::table('division_wbs')->updateOrInsert(
                    ['wbs_id' => $item->id, 'division_id' => $item->divisions_id],
                    ['created_at' => $now, 'updated_at' => $now]
                );
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('division_wbs');
    }
};
