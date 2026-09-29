<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_dependency_groups', function (Blueprint $table) {
            $table->id();
            $table->string('successor_wbs_id', 45);
            $table->enum('dependency_type', ['FS', 'FF', 'SS', 'SF'])->default('FS');
            $table->integer('lag_days')->default(0);
            $table->timestamps();

            $table->foreign('successor_wbs_id')
                ->references('id')->on('wbs')
                ->cascadeOnDelete();
        });

        Schema::table('task_dependencies', function (Blueprint $table) {
            $table->foreignId('dependency_group_id')
                ->nullable()
                ->after('id')
                ->constrained('task_dependency_groups')
                ->cascadeOnDelete();
        });

        foreach (DB::table('task_dependencies')->orderBy('id')->cursor() as $dependency) {
            $groupId = DB::table('task_dependency_groups')->insertGetId([
                'successor_wbs_id' => $dependency->successor_wbs_id,
                'dependency_type' => $dependency->dependency_type,
                'lag_days' => $dependency->lag_days,
                'created_at' => $dependency->created_at,
                'updated_at' => $dependency->updated_at,
            ]);

            DB::table('task_dependencies')
                ->where('id', $dependency->id)
                ->update(['dependency_group_id' => $groupId]);
        }
    }

    public function down(): void
    {
        Schema::table('task_dependencies', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dependency_group_id');
        });

        Schema::dropIfExists('task_dependency_groups');
    }
};
