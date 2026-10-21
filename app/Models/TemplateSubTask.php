<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TemplateSubTask extends Model
{
    use HasFactory;

    protected $table = 'template_sub_tasks';

    protected $fillable = [
        'template_main_task_id',
        'code',
        'name',
        'default_pic_division',
        'weight',
        'order_index',
        'default_duration',
    ];

    protected $casts = [
        'weight' => 'float',
        'order_index' => 'integer',
        'default_duration' => 'integer',
    ];

    public function mainTask(): BelongsTo
    {
        return $this->belongsTo(TemplateMainTask::class, 'template_main_task_id');
    }
}
