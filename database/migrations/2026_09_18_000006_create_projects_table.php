<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('companies_id');
            $table->unsignedInteger('project_manager');
            $table->string('title', 45);
            $table->dateTime('start');
            $table->dateTime('end');
            $table->dateTime('actual_start');
            $table->dateTime('actual_end');
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('companies_id', 'fk_main_projects_companies')
                  ->references('id')->on('companies')->onDelete('no action')->onUpdate('no action');
            $table->foreign('project_manager', 'fk_main_projects_users1')
                  ->references('id')->on('users')->onDelete('no action')->onUpdate('no action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
