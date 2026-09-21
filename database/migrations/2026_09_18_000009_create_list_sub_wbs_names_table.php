<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('list_sub_wbs_names', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 255);
            $table->timestamps();
            $table->softDeletes();
            $table->unsignedInteger('list_main_wbs_names_copy1_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('list_sub_wbs_names');
    }
};
