<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('company_user');

        Schema::create('company_user', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('company_id');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('company_id')->references('id')->on('companies')->onDelete('cascade');
            $table->unique(['user_id', 'company_id']);
        });

        // Migrate existing users' companies_id to company_user pivot
        $users = DB::table('users')->whereNotNull('companies_id')->get(['id', 'companies_id']);
        $now = now();
        foreach ($users as $user) {
            DB::table('company_user')->updateOrInsert(
                [
                    'user_id' => $user->id,
                    'company_id' => $user->companies_id,
                ],
                [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('company_user');
    }
};
