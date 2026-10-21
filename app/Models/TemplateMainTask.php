<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TemplateMainTask extends Model
{
    use HasFactory;

    protected $table = 'template_main_tasks';

    protected $fillable = [
        'template_id',
        'code',
        'name',
        'weight',
        'order_index',
    ];

    protected $casts = [
        'weight' => 'float',
        'order_index' => 'integer',
    ];

    public function template(): BelongsTo
    {
        return $this->belongsTo(ProjectTemplate::class, 'template_id');
    }

    public function subTasks(): HasMany
    {
        return $this->hasMany(TemplateSubTask::class, 'template_main_task_id')->orderBy('order_index')->orderBy('id');
    }
}
