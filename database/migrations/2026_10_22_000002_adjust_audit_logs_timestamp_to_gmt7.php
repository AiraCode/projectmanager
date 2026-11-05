<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Convert previously recorded UTC timestamps in audit_logs to GMT+7 (Asia/Jakarta / WIB).
     */
    public function up(): void
    {
        if (!Schema::hasTable('audit_logs')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'sqlite') {
            DB::table('audit_logs')->update([
                'created_at' => DB::raw("datetime(created_at, '+7 hours')"),
                'updated_at' => DB::raw("datetime(updated_at, '+7 hours')"),
            ]);
        } else {
            DB::table('audit_logs')->update([
                'created_at' => DB::raw('DATE_ADD(created_at, INTERVAL 7 HOUR)'),
                'updated_at' => DB::raw('DATE_ADD(updated_at, INTERVAL 7 HOUR)'),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('audit_logs')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'sqlite') {
            DB::table('audit_logs')->update([
                'created_at' => DB::raw("datetime(created_at, '-7 hours')"),
                'updated_at' => DB::raw("datetime(updated_at, '-7 hours')"),
            ]);
        } else {
            DB::table('audit_logs')->update([
                'created_at' => DB::raw('DATE_SUB(created_at, INTERVAL 7 HOUR)'),
                'updated_at' => DB::raw('DATE_SUB(updated_at, INTERVAL 7 HOUR)'),
            ]);
        }
    }
};
