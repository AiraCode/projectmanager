<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'action',
        'description',
        'ip_address',
        'metadata',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    /**
     * Ensure fresh timestamps for audit logs always use GMT+7 (Asia/Jakarta).
     */
    public function freshTimestamp()
    {
        return Carbon::now('Asia/Jakarta');
    }

    /**
     * Accessor for created_at ensuring Carbon instance in Asia/Jakarta (GMT+7).
     */
    protected function createdAt(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value ? Carbon::parse($value, 'Asia/Jakarta') : null,
        );
    }

    /**
     * Accessor for updated_at ensuring Carbon instance in Asia/Jakarta (GMT+7).
     */
    protected function updatedAt(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value ? Carbon::parse($value, 'Asia/Jakarta') : null,
        );
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public static function record(string $action, string $description, ?int $userId = null, ?string $ip = null, ?array $metadata = null): self
    {
        $now = Carbon::now('Asia/Jakarta');

        return self::create([
            'user_id' => $userId ?? auth()->id(),
            'action' => $action,
            'description' => $description,
            'ip_address' => $ip ?? request()?->ip(),
            'metadata' => $metadata,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
