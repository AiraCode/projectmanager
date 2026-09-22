<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('main_wbs', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('projects_id');
            $table->unsignedInteger('list_main_wbs_names_id');
            $table->string('name', 255)->nullable();
            $table->decimal('percentage');
            $table->dateTime('actual_start')->nullable();
            $table->dateTime('actual_end')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('projects_id', 'fk_main_wbs_projects1')
                  ->references('id')->on('projects')->onDelete('no action')->onUpdate('no action');
            $table->foreign('list_main_wbs_names_id', 'fk_main_wbs_list_main_wbs_names1')
                  ->references('id')->on('list_main_wbs_names')->onDelete('no action')->onUpdate('no action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('main_wbs');
    }
};
