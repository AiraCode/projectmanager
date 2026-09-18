<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wbs', function (Blueprint $table) {
            $table->string('id', 45)->primary();
            $table->unsignedInteger('sub_wbs_id');
            $table->unsignedInteger('divisions_id');
            $table->string('name', 45)->nullable();
            $table->string('vendor', 45);
            $table->dateTime('start');
            $table->dateTime('end');
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('sub_wbs_id', 'fk_wbs_sub_wbs1')
                  ->references('id')->on('sub_wbs')->onDelete('no action')->onUpdate('no action');
            $table->foreign('divisions_id', 'fk_wbs_divisions1')
                  ->references('id')->on('divisions')->onDelete('no action')->onUpdate('no action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wbs');
    }
};
