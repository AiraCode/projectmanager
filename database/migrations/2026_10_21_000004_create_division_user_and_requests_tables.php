<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * BE-09: Multi-Division User Support & Division Request Approval Workflow.
     */
    public function up(): void
    {
        if (!Schema::hasTable('division_user')) {
            Schema::create('division_user', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('user_id');
                $table->unsignedInteger('division_id');
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('division_id')->references('id')->on('divisions')->cascadeOnDelete();
                $table->unique(['user_id', 'division_id']);
            });

            // Backfill existing user's divisions_id into pivot table
            $existing = DB::table('users')->whereNotNull('divisions_id')->get(['id', 'divisions_id']);
            $now = now();
            foreach ($existing as $u) {
                DB::table('division_user')->updateOrInsert(
                    ['user_id' => $u->id, 'division_id' => $u->divisions_id],
                    ['created_at' => $now, 'updated_at' => $now]
                );
            }
        }

        if (!Schema::hasTable('division_requests')) {
            Schema::create('division_requests', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('user_id');
                $table->unsignedInteger('division_id');
                $table->unsignedInteger('requested_by');
                $table->unsignedInteger('approved_by')->nullable();
                $table->string('status', 30)->default('pending'); // 'pending', 'approved', 'rejected'
                $table->text('notes')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamp('responded_at')->nullable();
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('division_id')->references('id')->on('divisions')->cascadeOnDelete();
                $table->foreign('requested_by')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('division_requests');
        Schema::dropIfExists('division_user');
    }
};
