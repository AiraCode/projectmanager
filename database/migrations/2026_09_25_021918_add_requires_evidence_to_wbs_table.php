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
            $table->string('dep_type', 10)->default('FS')->after('predecessor');
            $table->integer('lag')->default(0)->after('dep_type');
            $table->integer('lead')->default(0)->after('lag');
            $table->boolean('requires_evidence')->default(false)->after('evidence_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('wbs', function (Blueprint $table) {
            $table->dropColumn(['dep_type', 'lag', 'lead', 'requires_evidence']);
        });
    }
};
