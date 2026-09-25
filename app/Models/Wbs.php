<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Wbs extends Model
{
    use SoftDeletes;

    protected $table = 'wbs';

    // Disable auto-incrementing ID since we use VARCHAR
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'sub_wbs_id',
        'divisions_id',
        'name',
        'vendor',
        'start',
        'end',
        'is_completed',
        'status',
        'predecessor',
        'dep_type',
        'lag',
        'lead',
        'weight',
        'progress',
        'evidence_path',
        'evidence_name',
        'requires_evidence',
    ];

    protected $casts = [
        'start' => 'datetime',
        'end' => 'datetime',
        'weight' => 'decimal:2',
        'requires_evidence' => 'boolean',
    ];

    public function parentSubWbs()
    {
        return $this->belongsTo(SubWbs::class, 'sub_wbs_id');
    }

    public function division()
    {
        return $this->belongsTo(Division::class, 'divisions_id');
    }
}
