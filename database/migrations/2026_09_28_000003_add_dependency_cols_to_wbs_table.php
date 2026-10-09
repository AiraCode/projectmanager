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
        Schema::table('wbs', function (Blueprint $table) {
            if (!Schema::hasColumn('wbs', 'duration_days')) {
                $table->integer('duration_days')->nullable()->after('end');
            }
            if (!Schema::hasColumn('wbs', 'constraint_type')) {
                $table->string('constraint_type', 20)->default('ASAP')->after('duration_days');
            }
            if (!Schema::hasColumn('wbs', 'constraint_date')) {
                $table->date('constraint_date')->nullable()->after('constraint_type');
            }
        });

        // Initialize duration_days for existing records
        try {
            DB::statement("UPDATE wbs SET duration_days = GREATEST(1, DATEDIFF(`end`, `start`) + 1) WHERE `start` IS NOT NULL AND `end` IS NOT NULL");
        } catch (\Exception $e) {
            // Ignore if datediff fails on different DB engine
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('wbs', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('wbs', 'duration_days')) $cols[] = 'duration_days';
            if (Schema::hasColumn('wbs', 'constraint_type')) $cols[] = 'constraint_type';
            if (Schema::hasColumn('wbs', 'constraint_date')) $cols[] = 'constraint_date';
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
