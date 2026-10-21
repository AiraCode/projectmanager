<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * BE-05: Drag and drop persistence for main_wbs, sub_wbs, and wbs tasks.
     */
    public function up(): void
    {
        if (Schema::hasTable('main_wbs') && !Schema::hasColumn('main_wbs', 'order_index')) {
            Schema::table('main_wbs', function (Blueprint $table) {
                $table->unsignedInteger('order_index')->default(0)->after('status');
            });
        }

        if (Schema::hasTable('sub_wbs') && !Schema::hasColumn('sub_wbs', 'order_index')) {
            Schema::table('sub_wbs', function (Blueprint $table) {
                $table->unsignedInteger('order_index')->default(0)->after('weight');
            });
        }

        if (Schema::hasTable('wbs') && !Schema::hasColumn('wbs', 'order_index')) {
            Schema::table('wbs', function (Blueprint $table) {
                $table->unsignedInteger('order_index')->default(0)->after('weight');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('main_wbs') && Schema::hasColumn('main_wbs', 'order_index')) {
            Schema::table('main_wbs', function (Blueprint $table) {
                $table->dropColumn('order_index');
            });
        }

        if (Schema::hasTable('sub_wbs') && Schema::hasColumn('sub_wbs', 'order_index')) {
            Schema::table('sub_wbs', function (Blueprint $table) {
                $table->dropColumn('order_index');
            });
        }

        if (Schema::hasTable('wbs') && Schema::hasColumn('wbs', 'order_index')) {
            Schema::table('wbs', function (Blueprint $table) {
                $table->dropColumn('order_index');
            });
        }
    }
};
