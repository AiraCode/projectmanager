<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('companies_id', 'fk_users_companies1')
                  ->references('id')->on('companies')->onDelete('no action')->onUpdate('no action');
            $table->foreign('divisions_id', 'fk_users_divisions1')
                  ->references('id')->on('divisions')->onDelete('no action')->onUpdate('no action');
            $table->foreign('roles_id', 'fk_users_roles1')
                  ->references('id')->on('roles')->onDelete('no action')->onUpdate('no action');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign('fk_users_companies1');
            $table->dropForeign('fk_users_divisions1');
            $table->dropForeign('fk_users_roles1');
        });
    }
};
