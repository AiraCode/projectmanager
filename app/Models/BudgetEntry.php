<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BudgetEntry extends Model
{
    protected $table = 'budget_entries';

    protected $fillable = [
        'projects_id',
        'tanggal',
        'code_sub_wbs',
        'sub_task_wbs',
        'kategori',
        'lokasi',
        'nama_item',
        'spesifikasi',
        'qty',
        'satuan',
        'harga_satuan',
        'harga_total',
        'referensi',
        'keterangan',
    ];

    protected $casts = [
        'tanggal'      => 'date',
        'qty'          => 'float',
        'harga_satuan' => 'float',
        'harga_total'  => 'float',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'projects_id');
    }
}
