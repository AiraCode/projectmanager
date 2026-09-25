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
        Schema::table('wbs', function (Blueprint $table) {
            $table->text('evidence_path')->nullable()->change();
            $table->text('evidence_name')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('wbs', function (Blueprint $table) {
            $table->string('evidence_path', 255)->nullable()->change();
            $table->string('evidence_name', 255)->nullable()->change();
        });
    }
};
