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
        Schema::create('budget_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('projects_id');
            $table->date('tanggal');
            $table->string('code_sub_wbs')->nullable();
            $table->string('sub_task_wbs')->nullable();
            $table->string('kategori');
            $table->string('lokasi')->nullable();
            $table->string('nama_item');
            $table->string('spesifikasi')->nullable();
            $table->decimal('qty', 12, 2)->default(1);
            $table->string('satuan', 50)->default('unit');
            $table->decimal('harga_satuan', 15, 2)->default(0);
            $table->decimal('harga_total', 15, 2)->default(0);
            $table->string('referensi')->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();

            $table->foreign('projects_id')
                  ->references('id')->on('projects')
                  ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('budget_entries');
    }
};
