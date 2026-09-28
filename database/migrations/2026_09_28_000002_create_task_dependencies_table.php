<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('task_dependencies')) {
            Schema::create('task_dependencies', function (Blueprint $table) {
                $table->id();
                $table->string('predecessor_wbs_id', 45);
                $table->string('successor_wbs_id', 45);
                $table->enum('dependency_type', ['FS', 'FF', 'SF', 'SS'])->default('FS');
                $table->integer('lag_days')->default(0);
                $table->timestamps();

                $table->foreign('predecessor_wbs_id')
                      ->references('id')->on('wbs')
                      ->onDelete('cascade');
                $table->foreign('successor_wbs_id')
                      ->references('id')->on('wbs')
                      ->onDelete('cascade');

                $table->unique(['predecessor_wbs_id', 'successor_wbs_id'], 'uq_task_dependency');
            });
        }

        // Migrate existing predecessor data from wbs table if present
        $existingWbs = DB::table('wbs')
            ->whereNotNull('predecessor')
            ->whereNotIn('predecessor', ['', '-'])
            ->get();

        $wbsIds = DB::table('wbs')->pluck('id')->flip();

        $now = now();
        $inserts = [];
        $seen = [];

        foreach ($existingWbs as $row) {
            $predId = trim($row->predecessor);
            $succId = trim($row->id);

            // Ensure both exist in wbs and not a self-reference
            if ($predId !== $succId && isset($wbsIds[$predId]) && isset($wbsIds[$succId])) {
                $key = "{$predId}->{$succId}";
                if (!isset($seen[$key])) {
                    $seen[$key] = true;
                    $lag = (int)($row->lag ?? 0) - (int)($row->lead ?? 0);
                    $depType = in_array($row->dep_type, ['FS', 'FF', 'SF', 'SS']) ? $row->dep_type : 'FS';
                    $inserts[] = [
                        'predecessor_wbs_id' => $predId,
                        'successor_wbs_id'   => $succId,
                        'dependency_type'    => $depType,
                        'lag_days'           => $lag,
                        'created_at'         => $now,
                        'updated_at'         => $now,
                    ];
                }
            }
        }

        if (!empty($inserts)) {
            foreach (array_chunk($inserts, 100) as $chunk) {
                DB::table('task_dependencies')->insertOrIgnore($chunk);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('task_dependencies');
    }
};
