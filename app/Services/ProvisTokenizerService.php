<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Division;
use App\Models\Project;
use App\Models\Wbs;
use Carbon\Carbon;
use Illuminate\Support\Str;

class ProvisTokenizerService
{
    /**
     * Tokenize and extract structured domain entities from user prompt.
     */
    public function tokenize(string $prompt, ?int $projectId = null): array
    {
        $normalizedPrompt = trim($prompt);

        return [
            'original_prompt'     => $normalizedPrompt,
            'estimated_tokens'    => $this->estimateTokens($normalizedPrompt),
            'dates'               => $this->extractDates($normalizedPrompt),
            'predecessor_syntax'  => $this->extractPredecessorSyntax($normalizedPrompt),
            'matched_tasks'       => $projectId ? $this->matchTasksInProject($normalizedPrompt, $projectId) : [],
            'matched_divisions'   => $this->matchDivisions($normalizedPrompt),
            'matched_companies'   => $this->matchCompanies($normalizedPrompt),
            'action_intent'       => $this->detectActionIntent($normalizedPrompt),
            'is_high_risk'        => $this->isHighRiskAction($normalizedPrompt),
        ];
    }

    /**
     * Rough token estimator (~4 chars per token for English/Indonesian mixed tech text).
     */
    public function estimateTokens(string $text): int
    {
        $len = mb_strlen($text);
        return max(1, (int) ceil($len / 3.8));
    }

    /**
     * Sliding window context manager:
     * Prunes older messages to ensure total context stays within the token budget.
     * Always preserves the initial system instruction and latest N exchanges.
     */
    public function pruneContext(array $messages, int $maxTokens = 4000): array
    {
        if (empty($messages)) {
            return [];
        }

        $systemMessages = array_filter($messages, fn($m) => ($m['role'] ?? '') === 'system');
        $chatMessages   = array_values(array_filter($messages, fn($m) => ($m['role'] ?? '') !== 'system'));

        $totalTokens = 0;
        foreach ($systemMessages as $sm) {
            $totalTokens += $this->estimateTokens($sm['content'] ?? '');
        }

        $retainedChat = [];
        // Walk backwards from latest to oldest
        for ($i = count($chatMessages) - 1; $i >= 0; $i--) {
            $msg = $chatMessages[$i];
            $msgTokens = $this->estimateTokens($msg['content'] ?? '') + 10;

            if ($totalTokens + $msgTokens > $maxTokens && count($retainedChat) >= 2) {
                break;
            }

            $totalTokens += $msgTokens;
            array_unshift($retainedChat, $msg);
        }

        return array_merge(array_values($systemMessages), $retainedChat);
    }

    /**
     * Extract exact or natural dates (Indonesian & English, relative & absolute).
     */
    public function extractDates(string $text): array
    {
        $dates = [];
        $today = Carbon::today('Asia/Jakarta');

        // 1. Relative dates (Indonesian)
        $lower = strtolower($text);
        if (preg_match('/\b(hari ini|sekarang)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'hari ini', 'date' => $today->format('Y-m-d')];
        }
        if (preg_match('/\bbesok\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'besok', 'date' => $today->copy()->addDay()->format('Y-m-d')];
        }
        if (preg_match('/\blusa\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'lusa', 'date' => $today->copy()->addDays(2)->format('Y-m-d')];
        }
        if (preg_match('/\b(minggu depan|next week)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'minggu depan', 'date' => $today->copy()->addWeek()->format('Y-m-d')];
        }
        if (preg_match('/(\d+)\s*hari\s*lagi/i', $lower, $m)) {
            $dates[] = ['type' => 'relative', 'raw' => $m[0], 'date' => $today->copy()->addDays((int) $m[1])->format('Y-m-d')];
        }

        // 2. Absolute ISO format: YYYY-MM-DD
        if (preg_match_all('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $matches)) {
            foreach ($matches[1] as $isoDate) {
                try {
                    $c = Carbon::parse($isoDate);
                    $dates[] = ['type' => 'iso', 'raw' => $isoDate, 'date' => $c->format('Y-m-d')];
                } catch (\Throwable $e) {}
            }
        }

        // 3. Natural date format: DD [Nama Bulan] YYYY (e.g. 15 Desember 2026 / 15 Dec 2026)
        $monthMap = [
            'januari' => '01', 'jan' => '01', 'january' => '01',
            'februari' => '02', 'feb' => '02', 'february' => '02',
            'maret' => '03', 'mar' => '03', 'march' => '03',
            'april' => '04', 'apr' => '04',
            'mei' => '05', 'may' => '05',
            'juni' => '06', 'jun' => '06', 'june' => '06',
            'juli' => '07', 'jul' => '07', 'july' => '07',
            'agustus' => '08', 'agu' => '08', 'aug' => '08', 'august' => '08',
            'september' => '09', 'sep' => '09',
            'oktober' => '10', 'okt' => '10', 'oct' => '10', 'october' => '10',
            'november' => '11', 'nov' => '11',
            'desember' => '12', 'des' => '12', 'dec' => '12', 'december' => '12',
        ];

        $monthPattern = implode('|', array_keys($monthMap));
        if (preg_match_all('/\b(\d{1,2})\s+(' . $monthPattern . ')\s+(\d{4})\b/i', $lower, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $day = str_pad($match[1], 2, '0', STR_PAD_LEFT);
                $month = $monthMap[strtolower($match[2])] ?? '01';
                $year = $match[3];
                $dates[] = [
                    'type' => 'natural',
                    'raw'  => $match[0],
                    'date' => "{$year}-{$month}-{$day}",
                ];
            }
        }

        return $dates;
    }

    /**
     * Extract predecessor notations like:
     * FS, SS, FF, SF, FS+2, SS-1d, lag 3 hari, lead 2 hari
     */
    public function extractPredecessorSyntax(string $text): array
    {
        $results = [];

        // Pattern: (FS|SS|FF|SF)([+-]\d+)?
        if (preg_match_all('/\b(FS|SS|FF|SF)(?:\s*([+-])\s*(\d+)(?:d|hari)?)?\b/i', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $depType = strtoupper($m[1]);
                $sign    = $m[2] ?? '+';
                $val     = isset($m[3]) ? (int) $m[3] : 0;
                $lag     = ($sign === '+' && $val > 0) ? $val : 0;
                $lead    = ($sign === '-' && $val > 0) ? $val : 0;

                $results[] = [
                    'dep_type' => $depType,
                    'lag'      => $lag,
                    'lead'     => $lead,
                    'raw'      => $m[0],
                ];
            }
        }

        // Pattern: lag X hari / lead X hari
        if (preg_match_all('/\b(lag|lead)\s*(\d+)(?:\s*hari|\s*days)?\b/i', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $type = strtolower($m[1]);
                $val  = (int) $m[2];
                $results[] = [
                    'dep_type' => 'FS', // default fallback
                    'lag'      => $type === 'lag' ? $val : 0,
                    'lead'     => $type === 'lead' ? $val : 0,
                    'raw'      => $m[0],
                ];
            }
        }

        return $results;
    }

    /**
     * Match task codes (e.g. 1.1, 2.3) or names within an active project.
     */
    protected function matchTasksInProject(string $text, int $projectId): array
    {
        $matched = [];

        // Extract potential WBS codes like 1.1, 2.3.1, or technical IDs
        preg_match_all('/\b(\d+\.\d+(?:\.\d+)?|st-[\w-]+|wbs-[\w-]+)\b/i', $text, $codeMatches);
        $candidateCodes = $codeMatches[1] ?? [];

        $projectTasks = Wbs::whereHas('subWbs.mainWbs', function($q) use ($projectId) {
            $q->where('projects_id', $projectId);
        })->get(['id', 'name', 'start', 'end', 'weight', 'status']);

        foreach ($candidateCodes as $code) {
            foreach ($projectTasks as $task) {
                if (Str::startsWith($task->id, $code) || Str::contains(strtolower($task->name), strtolower($code))) {
                    $matched[] = [
                        'id'     => $task->id,
                        'name'   => $task->name,
                        'start'  => $task->start,
                        'end'    => $task->end,
                        'status' => $task->status,
                    ];
                }
            }
        }

        return array_values(array_unique($matched, SORT_REGULAR));
    }

    /**
     * Match known division names.
     */
    protected function matchDivisions(string $text): array
    {
        $divisions = Division::all(['id', 'divisi']);
        $matched = [];
        $lower = strtolower($text);

        foreach ($divisions as $div) {
            if (str_contains($lower, strtolower($div->divisi))) {
                $matched[] = ['id' => $div->id, 'name' => $div->divisi];
            }
        }

        return $matched;
    }

    /**
     * Match known company names.
     */
    protected function matchCompanies(string $text): array
    {
        $companies = Company::all(['id', 'name']);
        $matched = [];
        $lower = strtolower($text);

        foreach ($companies as $comp) {
            if (str_contains($lower, strtolower($comp->name))) {
                $matched[] = ['id' => $comp->id, 'name' => $comp->name];
            }
        }

        return $matched;
    }

    /**
     * Classify user's high-level intent.
     */
    public function detectActionIntent(string $text): string
    {
        $lower = strtolower($text);

        if (preg_match('/\b(buat|bikin|tambah|cipta|create|generate)(?:kan)?\s+(?:proyek|project)\b/i', $lower)) {
            return 'CREATE_PROJECT';
        }
        if (preg_match('/\b(rekonsiliasi|reconcile|singkron|sinkron)\b/i', $lower)) {
            return 'RECONCILE_DATES';
        }
        if (preg_match('/\b(rekap|deviasi|off[\s-]plan|terlambat|delay|overdue)\b/i', $lower)) {
            return 'RECAP_OFF_PLAN';
        }
        if (preg_match('/\b(pdf|laporan|report|unduh|cetak)\b/i', $lower)) {
            return 'GENERATE_PDF';
        }
        if (preg_match('/\b(update|koding|coding|commit|git|changelog|perubahan kode)\b/i', $lower)) {
            return 'GET_CODE_UPDATES';
        }
        if (preg_match('/\b(audit|riwayat\s+aktivitas|log\s+aktivitas|siapa\s+yang\s+(?:ubah|login|ganti))\b/i', $lower)) {
            return 'QUERY_AUDIT_LOG';
        }
        if (preg_match('/\b(daftar\s+user|siapa\s+saja\s+user|daftar\s+pengguna|beta\s+tester)\b/i', $lower)) {
            return 'QUERY_USERS';
        }
        if (preg_match('/\b(status|ringkasan|summary|berapa\s+progres|progress|kabar\s+proyek)\b/i', $lower)) {
            return 'QUERY_SUMMARY';
        }
        if (preg_match('/\b(predecessor|dependensi|urutan|sambungkan|hubungkan)\b/i', $lower)) {
            return 'SET_PREDECESSOR';
        }
        if (preg_match('/\b(jadwal|schedule|tanggal|start|finish|undur|majukan)\b/i', $lower)) {
            return 'UPDATE_SCHEDULE';
        }

        return 'GENERAL_QUERY';
    }

    /**
     * High-risk safety guardrail.
     */
    public function isHighRiskAction(string $text): bool
    {
        $lower = strtolower($text);
        return (bool) preg_match('/\b(hapus|delete|drop|truncate|reset\s+jadwal|clear[\s-]wbs)\b/i', $lower);
    }
}

