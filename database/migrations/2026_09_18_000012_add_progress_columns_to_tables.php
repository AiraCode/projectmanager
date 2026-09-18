<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->integer('progress')->default(0);
            $table->string('status', 45)->default('Open');
        });

        Schema::table('main_wbs', function (Blueprint $table) {
            $table->integer('progress')->default(0);
            $table->string('status', 45)->default('Open');
        });

        Schema::table('sub_wbs', function (Blueprint $table) {
            $table->integer('progress')->default(0);
            $table->string('status', 45)->default('Open');
            $table->decimal('weight', 5, 2)->default(0);
        });

        Schema::table('wbs', function (Blueprint $table) {
            $table->boolean('is_completed')->default(false);
            $table->string('status', 45)->default('Open');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['progress', 'status']);
        });

        Schema::table('main_wbs', function (Blueprint $table) {
            $table->dropColumn(['progress', 'status']);
        });

        Schema::table('sub_wbs', function (Blueprint $table) {
            $table->dropColumn(['progress', 'status', 'weight']);
        });

        Schema::table('wbs', function (Blueprint $table) {
            $table->dropColumn(['is_completed', 'status']);
        });
    }
};
