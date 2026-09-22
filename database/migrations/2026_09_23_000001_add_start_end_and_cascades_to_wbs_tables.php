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
        // 1. Add start and end to main_wbs table, and update foreign key to CASCADE
        Schema::table('main_wbs', function (Blueprint $table) {
            if (!Schema::hasColumn('main_wbs', 'start')) {
                $table->dateTime('start')->nullable()->after('percentage');
            }
            if (!Schema::hasColumn('main_wbs', 'end')) {
                $table->dateTime('end')->nullable()->after('start');
            }

            $table->dropForeign('fk_main_wbs_projects1');
            $table->foreign('projects_id', 'fk_main_wbs_projects1')
                  ->references('id')->on('projects')
                  ->onDelete('cascade');
        });

        // Copy actual_start and actual_end to start and end for existing rows
        DB::statement("UPDATE main_wbs SET start = actual_start WHERE start IS NULL AND actual_start IS NOT NULL");
        DB::statement("UPDATE main_wbs SET end = actual_end WHERE end IS NULL AND actual_end IS NOT NULL");

        // 2. Update sub_wbs foreign key to CASCADE
        Schema::table('sub_wbs', function (Blueprint $table) {
            $table->dropForeign('fk_sub_wbs_main_wbs1');
            $table->foreign('sub_wbs_id', 'fk_sub_wbs_main_wbs1')
                  ->references('id')->on('main_wbs')
                  ->onDelete('cascade');
        });

        // 3. Update wbs foreign key to CASCADE
        Schema::table('wbs', function (Blueprint $table) {
            $table->dropForeign('fk_wbs_sub_wbs1');
            $table->foreign('sub_wbs_id', 'fk_wbs_sub_wbs1')
                  ->references('id')->on('sub_wbs')
                  ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('wbs', function (Blueprint $table) {
            $table->dropForeign('fk_wbs_sub_wbs1');
            $table->foreign('sub_wbs_id', 'fk_wbs_sub_wbs1')
                  ->references('id')->on('sub_wbs')
                  ->onDelete('no action');
        });

        Schema::table('sub_wbs', function (Blueprint $table) {
            $table->dropForeign('fk_sub_wbs_main_wbs1');
            $table->foreign('sub_wbs_id', 'fk_sub_wbs_main_wbs1')
                  ->references('id')->on('main_wbs')
                  ->onDelete('no action');
        });

        Schema::table('main_wbs', function (Blueprint $table) {
            $table->dropForeign('fk_main_wbs_projects1');
            $table->foreign('projects_id', 'fk_main_wbs_projects1')
                  ->references('id')->on('projects')
                  ->onDelete('no action');

            $table->dropColumn(['start', 'end']);
        });
    }
};
