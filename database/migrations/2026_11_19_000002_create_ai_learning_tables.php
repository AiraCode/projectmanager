<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('ai_learned_knowledge')) {
            Schema::create('ai_learned_knowledge', function (Blueprint $table) {
                $table->id();
                $table->string('normalized_pattern', 255)->unique();
                $table->json('keywords_json')->nullable();
                $table->text('sample_question');
                $table->string('strategy', 80)->index();
                $table->json('strategy_params')->nullable();
                $table->longText('answer_id')->nullable();
                $table->longText('answer_en')->nullable();
                $table->json('actions_json')->nullable();
                $table->unsignedInteger('hit_count')->default(1);
                $table->unsignedInteger('learned_by_user_id')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('ai_learning_tasks')) {
            Schema::create('ai_learning_tasks', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('session_id');
                $table->unsignedInteger('user_id');
                $table->unsignedBigInteger('assistant_message_id');
                $table->unsignedBigInteger('active_project_id')->nullable();
                $table->longText('prompt');
                $table->string('language', 10)->default('id');
                $table->string('status', 20)->default('processing'); // processing | completed | failed
                $table->string('stage_label', 160)->nullable();
                $table->unsignedBigInteger('learned_knowledge_id')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();

                $table->foreign('session_id')->references('id')->on('ai_chat_sessions')->onDelete('cascade');
                $table->foreign('assistant_message_id')->references('id')->on('ai_chat_messages')->onDelete('cascade');
                $table->index(['user_id', 'status'], 'idx_ai_learning_tasks_user_status');
                $table->index(['session_id', 'status'], 'idx_ai_learning_tasks_session_status');
                $table->index('created_at', 'idx_ai_learning_tasks_created_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_learning_tasks');
        Schema::dropIfExists('ai_learned_knowledge');
    }
};
