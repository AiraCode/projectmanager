<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sub_wbs', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('sub_wbs_id');
            $table->unsignedInteger('list_sub_wbs_names_id');
            $table->string('name', 45)->nullable();
            $table->string('predecessor', 45);
            $table->string('predecessor_type', 45);
            $table->string('lag_lead_time', 45)->nullable();
            $table->dateTime('start');
            $table->dateTime('end');
            $table->dateTime('actual_start');
            $table->dateTime('actual_end');
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('sub_wbs_id', 'fk_sub_wbs_main_wbs1')
                  ->references('id')->on('main_wbs')->onDelete('no action')->onUpdate('no action');
            $table->foreign('list_sub_wbs_names_id', 'fk_sub_wbs_list_sub_wbs_names1')
                  ->references('id')->on('list_sub_wbs_names')->onDelete('no action')->onUpdate('no action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sub_wbs');
    }
};
