<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ensure AI chat tables exist and enforce H+7 (7-day) automatic retention index & cleanup.
     */
    public function up(): void
    {
        // 1. Ensure is_ai_beta_tester column on users
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'is_ai_beta_tester')) {
            $hasStandalone = Schema::hasColumn('users', 'is_standalone');
            Schema::table('users', function (Blueprint $table) use ($hasStandalone) {
                $col = $table->boolean('is_ai_beta_tester')->default(false);
                if ($hasStandalone) {
                    $col->after('is_standalone');
                }
            });
        }

        // 2. Ensure ai_chat_sessions table exists with retention index on updated_at / created_at
        if (!Schema::hasTable('ai_chat_sessions')) {
            Schema::create('ai_chat_sessions', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('user_id');
                $table->string('title')->default('New Conversation');
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                $table->index(['user_id', 'updated_at'], 'idx_ai_sessions_user_updated');
                $table->index('created_at', 'idx_ai_sessions_created_at');
            });
        }

        // 3. Ensure ai_chat_messages table exists with retention index on created_at
        if (!Schema::hasTable('ai_chat_messages')) {
            Schema::create('ai_chat_messages', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('session_id');
                $table->string('role', 20);
                $table->longText('content');
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->foreign('session_id')->references('id')->on('ai_chat_sessions')->onDelete('cascade');
                $table->index(['session_id', 'created_at'], 'idx_ai_messages_session_created');
                $table->index('created_at', 'idx_ai_messages_created_at');
            });
        }

        // 4. Initial H+7 cleanup for any existing messages/sessions older than 7 days
        $cutoff = now()->subDays(7);
        DB::table('ai_chat_messages')->where('created_at', '<', $cutoff)->delete();
        DB::table('ai_chat_sessions')
            ->where('updated_at', '<', $cutoff)
            ->orWhere(function ($q) use ($cutoff) {
                $q->where('created_at', '<', $cutoff)
                  ->whereNotExists(function ($sub) {
                      $sub->select(DB::raw(1))
                          ->from('ai_chat_messages')
                          ->whereColumn('ai_chat_messages.session_id', 'ai_chat_sessions.id');
                  });
            })
            ->delete();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Do not drop tables here since 2026_11_11_082506 owns table creation/drop
    }
};
