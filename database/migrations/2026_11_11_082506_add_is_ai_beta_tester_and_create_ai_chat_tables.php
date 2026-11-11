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
        // 1. Add is_ai_beta_tester to users
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'is_ai_beta_tester')) {
                $table->boolean('is_ai_beta_tester')->default(false)->after('is_standalone');
            }
        });

        // 2. Create ai_chat_sessions table
        if (!Schema::hasTable('ai_chat_sessions')) {
            Schema::create('ai_chat_sessions', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('user_id');
                $table->string('title')->default('New Conversation');
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            });
        }

        // 3. Create ai_chat_messages table
        if (!Schema::hasTable('ai_chat_messages')) {
            Schema::create('ai_chat_messages', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('session_id');
                $table->string('role', 20); // 'user', 'assistant', 'system', 'tool'
                $table->longText('content');
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->foreign('session_id')->references('id')->on('ai_chat_sessions')->onDelete('cascade');
                $table->index(['session_id', 'created_at']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_chat_messages');
        Schema::dropIfExists('ai_chat_sessions');

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'is_ai_beta_tester')) {
                $table->dropColumn('is_ai_beta_tester');
            }
        });
    }
};
