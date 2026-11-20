<?php

namespace App\Services;

use App\Models\AiLearnedKnowledge;
use App\Models\AuditLog;
use App\Models\BudgetEntry;
use App\Models\Company;
use App\Models\Division;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\ProjectTemplate;
use App\Models\SubWbs;
use App\Models\User;
use App\Models\Wbs;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * 100% Local Native PHP Deep Reasoning & Self-Learning Engine.
 * Zero external APIs, zero online models.
 *
 * When a user asks an unfamiliar or complex cross-table question:
 * 1. Stems & decomposes the prompt morphologically (Indonesian + English).
 * 2. Runs dynamic local relational analysis across all RBAC-permitted PROVIS tables.
 * 3. Persists the learned strategy & pattern into `ai_learned_knowledge` so ANY future
 *    user asking the same or similar question receives an INSTANT live answer!
 */
class ProvisDeepLearningService
{
    protected ProvisKnowledgeBaseService $knowledgeBase;
    protected SCurvePredictionService $scurveService;

    public function __construct(
        ProvisKnowledgeBaseService $knowledgeBase,
        SCurvePredictionService $scurveService
    ) {
        $this->knowledgeBase = $knowledgeBase;
        $this->scurveService = $scurveService;
    }

    // =========================================================================
    // 1. MORPHOLOGICAL STEMMER & PATTERN FINGERPRINTING
    // =========================================================================

    public function stemWord(string $word): string
    {
        $w = mb_strtolower(trim($word));
        if (mb_strlen($w) <= 3) {
            return $w;
        }

        // Canonical everyday Indonesian -> English/PROVIS root normalization
        $canonicalMap = [
            'projek' => 'proyek', 'projeck' => 'proyek', 'project' => 'proyek', 'projects' => 'proyek',
            'projekku' => 'proyek', 'proyekku' => 'proyek', 'projeknya' => 'proyek', 'proyeknya' => 'proyek',
            'akun' => 'user', 'account' => 'user', 'accounts' => 'user', 'pengguna' => 'user', 'users' => 'user',
            'karyawan' => 'user', 'pegawai' => 'user', 'personel' => 'user', 'orang' => 'user',
            'pekerjaan' => 'task', 'kerjaan' => 'task', 'tugas' => 'task', 'tasks' => 'task', 'tasknya' => 'task',
            'perusahaan' => 'company', 'perusahan' => 'company', 'companies' => 'company', 'klien' => 'company', 'pt' => 'company',
            'divisi' => 'division', 'divisions' => 'division', 'departemen' => 'division', 'bagian' => 'division',
            'anggaran' => 'budget', 'biaya' => 'budget', 'pengeluaran' => 'budget', 'duit' => 'budget', 'uang' => 'budget', 'dana' => 'budget',
            'telat' => 'overdue', 'terlambat' => 'overdue', 'molor' => 'overdue', 'ngaret' => 'overdue', 'delayed' => 'overdue',
            'bobot' => 'weight', 'bobotnya' => 'weight', 'persentase' => 'weight',
            'durasi' => 'duration', 'durasinya' => 'duration', 'lama' => 'duration', 'terlama' => 'duration',
            'bukti' => 'evidence', 'lampiran' => 'evidence', 'foto' => 'evidence',
            'tenggat' => 'deadline', 'jatuh' => 'deadline', 'terdekat' => 'nearest', 'dekat' => 'nearest',
            'terbanyak' => 'most', 'banyak' => 'most', 'tertinggi' => 'highest', 'tinggi' => 'highest', 'terbesar' => 'highest', 'besar' => 'highest',
            'terendah' => 'lowest', 'rendah' => 'lowest', 'tersedikit' => 'lowest', 'sedikit' => 'lowest', 'terkecil' => 'lowest', 'lambat' => 'lowest',
            'termahal' => 'expensive', 'mahal' => 'expensive', 'boros' => 'expensive',
            'rahasia' => 'private', 'privat' => 'private',
            'kosong' => 'empty', 'belum' => 'empty',
            'selesai' => 'completed', 'tuntas' => 'completed', 'rasio' => 'ratio',
            'kategori' => 'category', 'vendor' => 'vendor', 'eksternal' => 'vendor', 'luar' => 'vendor',
            'sibuk' => 'busiest', 'pegang' => 'manage', 'kelola' => 'manage', 'megang' => 'manage',
            'wajib' => 'required', 'butuh' => 'required', 'perlu' => 'required',
            'progres' => 'progress', 'progresnya' => 'progress', 'kemajuan' => 'progress',
            'workers' => 'worker', 'pics' => 'pic', 'admins' => 'admin',
            'scurve' => 'scurve', 's-curve' => 'scurve', 'curve' => 'scurve', 'kurva' => 'scurve', 'spi' => 'scurve',
            'perbandingan' => 'compare', 'bandingkan' => 'compare', 'banding' => 'compare', 'komparasi' => 'compare', 'compare' => 'compare',
            'baik' => 'best', 'terbaik' => 'best', 'bagus' => 'best',
            'buruk' => 'worst', 'terburuk' => 'worst', 'jelek' => 'worst', 'terjelek' => 'worst',
        ];

        if (isset($canonicalMap[$w])) {
            return $canonicalMap[$w];
        }

        // Strip common Indonesian possessive/particle suffixes (-nya, -ku, -mu, -kah, -lah)
        $stemmed = preg_replace('/(nya|kah|lah|pun)$/u', '', $w) ?? $w;
        if (mb_strlen($stemmed) >= 3 && isset($canonicalMap[$stemmed])) {
            return $canonicalMap[$stemmed];
        }

        // Strip Indonesian verb/noun suffixes (-kan, -an) if base >= 4 chars
        if (mb_strlen($stemmed) >= 6) {
            $noSuf = preg_replace('/(kan|an)$/u', '', $stemmed) ?? $stemmed;
            if (mb_strlen($noSuf) >= 4) {
                $stemmed = $noSuf;
            }
        }

        // Strip common Indonesian prefixes (di-, ke-, ber-, ter-, me-, pe-) if base >= 4 chars
        if (mb_strlen($stemmed) >= 6) {
            $noPref = preg_replace('/^(meng|meny|men|mem|me|peng|peny|pen|pem|ber|ter|di|ke)/u', '', $stemmed) ?? $stemmed;
            if (mb_strlen($noPref) >= 4) {
                $stemmed = $noPref;
            }
        }

        if (isset($canonicalMap[$stemmed])) {
            return $canonicalMap[$stemmed];
        }

        return $stemmed;
    }

    /**
     * Extract deduplicated stemmed keywords for fingerprinting & Jaccard matching.
     *
     * @return array<int, string>
     */
    public function extractStemmedKeywords(string $prompt): array
    {
        $lower = mb_strtolower(trim($prompt));
        $clean = preg_replace('/[^a-z0-9\s]/u', ' ', $lower) ?? $lower;
        $raw   = array_values(array_filter(explode(' ', $clean)));

        $stop = [
            'apa', 'apakah', 'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'ini', 'itu', 'untuk', 'dengan',
            'pada', 'adalah', 'bisa', 'dapat', 'akan', 'sudah', 'tidak', 'ya', 'yah', 'dong', 'sih', 'nih', 'nya',
            'bro', 'min', 'kak', 'bos', 'tolong', 'coba', 'saya', 'aku', 'kamu', 'anda', 'ada', 'mana', 'manakah',
            'saja', 'aja', 'paling', 'siapa', 'berapa', 'gimana', 'bagaimana', 'kenapa', 'mengapa', 'kapan', 'dimana',
            'sistem', 'provis', 'saat', 'sekarang', 'seluruh', 'semua', 'daftar', 'tampilkan', 'lihat', 'cek',
            'kasih', 'tahu', 'tau', 'bertanya', 'tanya', 'nanya', 'jadi', 'hasil', 'hasilnya', 'antar', 'antara',
            'masing', 'tiap', 'setiap', 'tentang', 'soal', 'seputar', 'mengenai', 'adalah', 'yaitu', 'seperti',
            'sampai', 'hingga', 'adalah', 'punya', 'memiliki', 'buat', 'bikin', 'nih', 'tuh', 'lho', 'kok',
            'the', 'is', 'are', 'was', 'were', 'a', 'an', 'of', 'to', 'in', 'into', 'by', 'from', 'that', 'this',
            'on', 'for', 'with', 'and', 'or', 'can', 'do', 'does', 'what', 'which', 'who', 'how', 'many',
            'much', 'show', 'list', 'me', 'my', 'our', 'your', 'at', 'each', 'every', 'all', 'about',
        ];

        $out = [];
        foreach ($raw as $tok) {
            if (mb_strlen($tok) < 2 || in_array($tok, $stop, true)) {
                continue;
            }
            $st = $this->stemWord($tok);
            if (mb_strlen($st) >= 2 && !in_array($st, $stop, true)) {
                $out[] = $st;
            }
        }

        $unique = array_values(array_unique($out));
        sort($unique);
        return $unique;
    }

    public function buildPatternKey(string $prompt): string
    {
        $keywords = $this->extractStemmedKeywords($prompt);
        if (empty($keywords)) {
            return 'raw:' . substr(md5(mb_strtolower(trim($prompt))), 0, 24);
        }
        return Str::limit(implode('|', $keywords), 240, '');
    }

    // =========================================================================
    // 2. INSTANT LEARNED MEMORY LOOKUP (ZERO DELAY FOR FUTURE USERS!)
    // =========================================================================

    public function findLearnedMatch(string $prompt): ?AiLearnedKnowledge
    {
        try {
            $pattern  = $this->buildPatternKey($prompt);
            $keywords = $this->extractStemmedKeywords($prompt);

            if (empty($keywords)) {
                return null;
            }

            // 1. Fast exact canonical pattern match
            $exact = AiLearnedKnowledge::where('normalized_pattern', $pattern)->first();
            if ($exact) {
                $exact->increment('hit_count');
                $exact->update(['last_used_at' => Carbon::now('Asia/Jakarta')]);
                return $exact;
            }

            // 2. Jaccard token similarity match across learned patterns (>= 0.58 similarity, polarity & strategy-dimension safe)
            $asksLow          = in_array('lowest', $keywords, true);
            $asksCompanyScope = in_array('company', $keywords, true);
            $expectedStrategy = $this->inferDeepStrategy($prompt, $keywords)['strategy'] ?? 'DYNAMIC_CROSS_SEARCH';
            $candidates       = AiLearnedKnowledge::orderByDesc('hit_count')->take(250)->get();
            $best             = null;
            $bestSim          = 0.0;

            foreach ($candidates as $cand) {
                $candKw = is_array($cand->keywords_json) ? $cand->keywords_json : [];
                if (empty($candKw)) {
                    continue;
                }

                // Never confuse "lowest / fewest / shortest" with "highest / most / longest"
                $candLow = in_array('lowest', $candKw, true);
                if ($asksLow !== $candLow) {
                    continue;
                }

                // Never confuse company-level comparisons with single-table or project-level rankings
                if ($asksCompanyScope !== in_array('company', $candKw, true)) {
                    continue;
                }

                // Never reuse an incompatible strategy from Jaccard alone
                if ($expectedStrategy !== 'DYNAMIC_CROSS_SEARCH' && $cand->strategy !== $expectedStrategy) {
                    continue;
                }

                $inter = count(array_intersect($keywords, $candKw));
                $union = count(array_unique(array_merge($keywords, $candKw)));
                $sim   = $union > 0 ? ($inter / $union) : 0.0;

                if ($sim >= 0.58 && $inter >= 2 && $sim > $bestSim) {
                    $bestSim = $sim;
                    $best    = $cand;
                }
            }

            if ($best) {
                $best->increment('hit_count');
                $best->update(['last_used_at' => Carbon::now('Asia/Jakarta')]);
                return $best;
            }
        } catch (\Throwable $e) {
            Log::warning('ProvisDeepLearningService lookup notice: ' . $e->getMessage());
        }

        return null;
    }

    // =========================================================================
    // 3. DEEP LOCAL ANALYSIS & AUTO-LEARNING PIPELINE
    // =========================================================================

    /**
     * Deeply analyze an unseen/complex question using local database & codebase intelligence,
     * persist the learned strategy into `ai_learned_knowledge`, and return the live answer!
     *
     * @return array{content: string, actions: array, strategy: string, learned_knowledge_id: ?int, newly_learned: bool}
     */
    public function analyzeAndLearn(
        string $prompt,
        User $user,
        ?int $activeProjectId,
        string $lang,
        ?callable $onStage = null
    ): array {
        $notify = function (string $stage) use ($onStage): void {
            if ($onStage) {
                $onStage($stage);
            }
        };

        // Stage 1: Morphological analysis & strategy discovery
        $notify($lang === 'en'
            ? 'Analyzing question intent & stemming keywords locally…'
            : 'Mempelajari struktur pertanyaan & memetakan kata kunci lokal…');

        $keywords   = $this->extractStemmedKeywords($prompt);
        $patternKey = $this->buildPatternKey($prompt);
        $detected   = $this->inferDeepStrategy($prompt, $keywords);

        // Stage 2: Execute local relational query across RBAC-scoped database
        $notify($lang === 'en'
            ? 'Scanning local PROVIS database relations & computing answer…'
            : 'Menelusuri relasi basis data lokal PROVIS & menghitung jawaban…');

        $result = $this->executeStrategy(
            $detected['strategy'],
            $detected['params'],
            $prompt,
            $user,
            $activeProjectId,
            $lang
        );

        // Stage 3: Persist learned knowledge to MySQL for instant future reuse!
        $notify($lang === 'en'
            ? 'Saving learned pattern to local PROVIS memory…'
            : 'Menyimpan pola jawaban ke memori pembelajaran lokal…');

        $learnedId = null;
        if (!empty($keywords) && $result['should_learn']) {
            try {
                $record = AiLearnedKnowledge::updateOrCreate(
                    ['normalized_pattern' => $patternKey],
                    [
                        'keywords_json'      => $keywords,
                        'sample_question'    => Str::limit(trim($prompt), 500, ''),
                        'strategy'           => $detected['strategy'],
                        'strategy_params'    => $detected['params'],
                        'answer_id'          => $lang === 'id' ? $result['content'] : null,
                        'answer_en'          => $lang === 'en' ? $result['content'] : null,
                        'actions_json'       => $result['actions'] ?? [],
                        'learned_by_user_id' => $user->id,
                        'last_used_at'       => Carbon::now('Asia/Jakarta'),
                    ]
                );
                $learnedId = $record->id;
            } catch (\Throwable $e) {
                Log::warning('ProvisDeepLearningService save notice: ' . $e->getMessage());
            }
        }

        return [
            'content'              => $result['content'],
            'actions'              => $result['actions'] ?? [],
            'strategy'             => $detected['strategy'],
            'learned_knowledge_id' => $learnedId,
            'newly_learned'        => $learnedId !== null,
        ];
    }

    /**
     * Instantly execute a previously learned `AiLearnedKnowledge` entry for ANY user
     * (always re-computing live DB data under the asking user's own RBAC permissions!).
     *
     * @return array{content: string, actions: array, strategy: string, learned_knowledge_id: int}
     */
    public function executeLearnedEntry(
        AiLearnedKnowledge $entry,
        User $user,
        ?int $activeProjectId,
        string $lang,
        ?string $currentPrompt = null
    ): array {
        $effectivePrompt = $currentPrompt ?: $entry->sample_question;

        if ($entry->strategy === 'STATIC_SYNTHESIZED') {
            $stored = $lang === 'en' ? ($entry->answer_en ?: $entry->answer_id) : ($entry->answer_id ?: $entry->answer_en);
            if ($stored) {
                return [
                    'content'              => $stored,
                    'actions'              => is_array($entry->actions_json) ? $entry->actions_json : [],
                    'strategy'             => $entry->strategy,
                    'learned_knowledge_id' => $entry->id,
                ];
            }
        }

        $res = $this->executeStrategy(
            $entry->strategy,
            is_array($entry->strategy_params) ? $entry->strategy_params : [],
            $effectivePrompt,
            $user,
            $activeProjectId,
            $lang
        );

        return [
            'content'              => $res['content'],
            'actions'              => $res['actions'] ?? [],
            'strategy'             => $entry->strategy,
            'learned_knowledge_id' => $entry->id,
            'access_denied'        => !empty($res['access_denied']),
        ];
    }

    // =========================================================================
    // 4. STRATEGY CLASSIFIER (15 DYNAMIC ANALYTICAL RESOLVERS + CROSS-SEARCH)
    // =========================================================================

    /**
     * Detect whether a prompt asks a specialized cross-table analytical question
     * that should go through Self-Learning Deep Reasoning (or instant Learned Memory if already taught).
     *
     * @return ?array{strategy: string, params: array}
     */
    public function detectSpecializedStrategy(string $prompt): ?array
    {
        if ($this->hasIrrelevantOrNoisyMix($prompt)) {
            return null;
        }

        $keywords = $this->extractStemmedKeywords($prompt);
        if (empty($keywords)) {
            return null;
        }

        $detected = $this->inferDeepStrategy($prompt, $keywords);
        if (in_array($detected['strategy'], ['DYNAMIC_CROSS_SEARCH', 'DYNAMIC_RANKED_PROJECTS'], true)) {
            return null;
        }

        return $detected;
    }

    /**
     * Detect when a prompt mixes irrelevant everyday/non-work terms alongside PROVIS words
     * so shallow heuristics never hijack it and full-sentence deep reasoning evaluates all words instead.
     */
    protected function hasIrrelevantOrNoisyMix(string $prompt): bool
    {
        $lower = mb_strtolower($prompt);
        return (bool) preg_match(
            '/\b(kucing|anjing|hewan|binatang|makan|makanan|minum|minuman|masak|memasak|gorengan|goreng|nasi\s+goreng|mie\s+goreng|liburan|wisata|pantai|gunung|tidur|mimpi|pacar|cinta|jodoh|film|musik|konser|game|bola|sepakbola|cuaca|hujan|langit|planet|bulan|bintang|zodiak|horoskop|politik|presiden|pemilu|dokter|sakit|obat|sepatu|baju|celana|motor|mobil|kuliah|skripsi|ujian|kampus|sekolah|kopi|teh|susu|roti|bakso|soto|rendang|seblak|tanaman|hobi|memancing|resep|masakan|pekerjaan\s+rumah|homework|puisi|lagu|artis)\b/i',
            $lower
        );
    }

    /**
     * @param array<int, string> $keywords
     * @return array{strategy: string, params: array}
     */
    protected function inferDeepStrategy(string $prompt, array $keywords): array
    {
        $lower = mb_strtolower($prompt);

        if ($this->hasIrrelevantOrNoisyMix($prompt)) {
            return [
                'strategy' => 'DYNAMIC_CROSS_SEARCH',
                'params'   => ['keywords' => $keywords],
            ];
        }

        $has   = fn(string ...$ks): bool => count(array_intersect($ks, $keywords)) > 0;
        $isAsc = $has('lowest') || (bool) preg_match('/\b(paling\s+(?:sedikit|rendah|kecil|lambat|singkat|cepat|dekat)|tersedikit|terendah|terkecil|tercepat|terdekat|terpendek|least|lowest|fewest|shortest|smallest|slowest|nearest|earliest)\b/i', $lower);
        $dir   = $isAsc ? 'asc' : 'desc';

        // 0a. Per-Company / Cross-Company S-Curve Comparison ("perbandingan s curve antar perusahaan", "s curve masing-masing perusahaan")
        if (
            ($has('scurve') || preg_match('/\b(s[\s-]?curve|kurva\s*s|spi)\b/i', $lower))
            && ($has('company') || preg_match('/\b((?:antar|masing[\s-]masing|tiap|setiap|per|lintas|semua|seluruh)\s+(?:perusahaan|pt|company|companies)|per\s+pt)\b/i', $lower))
        ) {
            return ['strategy' => 'DYNAMIC_SCURVE_PER_COMPANY', 'params' => []];
        }

        // 0b. Ranked / Comparative S-Curve Across Accessible Projects ("manakah projek yang s curve nya paling baik sampai paling buruk")
        if (
            ($has('scurve') || preg_match('/\b(s[\s-]?curve|kurva\s*s|spi)\b/i', $lower))
            && (
                $has('best', 'worst', 'compare')
                || preg_match('/\b(manakah|paling\s+(?:baik|bagus|buruk|jelek)|terbaik|terburuk|terjelek|bandingkan|perbandingan|komparasi|ranking|peringkat|urutkan|urutan|sampai\s+paling|semua\s+(?:proyek|projek)|antar\s+(?:proyek|projek)|masing[\s-]masing\s+(?:proyek|projek)|best\s+to\s+worst|worst\s+to\s+best|compare)\b/i', $lower)
            )
        ) {
            $order = preg_match('/\b(paling\s+(?:buruk|jelek)\s+(?:ke|sampai|hingga)\s+(?:paling\s+)?(?:baik|bagus)|dari\s+(?:yang\s+)?(?:ter)?buruk|worst\s+to\s+best)\b/i', $lower)
                ? 'worst_to_best'
                : 'best_to_worst';
            return ['strategy' => 'DYNAMIC_SCURVE_RANKED_PROJECTS', 'params' => ['order' => $order]];
        }

        // 0c. Per-Company Budget Comparison ("perbandingan budget antar perusahaan")
        if (
            $has('budget')
            && ($has('company') || preg_match('/\b((?:antar|masing[\s-]masing|tiap|setiap|per|lintas|semua|seluruh)\s+(?:perusahaan|pt|company|companies)|per\s+pt)\b/i', $lower))
        ) {
            return ['strategy' => 'DYNAMIC_BUDGET_PER_COMPANY', 'params' => []];
        }

        // 0d. Ranked / Comparative Budget Across Projects ("manakah projek yang budgetnya paling besar")
        if (
            $has('budget')
            && $has('proyek')
            && (
                $has('highest', 'lowest', 'compare')
                || preg_match('/\b(manakah|antar\s+(?:proyek|projek)|masing[\s-]masing\s+(?:proyek|projek)|paling\s+(?:besar|kecil|hemat|boros|tinggi|rendah)|terbesar|terkecil|bandingkan|perbandingan)\b/i', $lower)
            )
        ) {
            return ['strategy' => 'DYNAMIC_BUDGET_RANKED_PROJECTS', 'params' => ['direction' => $dir]];
        }

        // 1. Division with most / fewest tasks
        if ($has('division') && ($has('task', 'most', 'lowest', 'highest', 'busiest') && preg_match('/\b(paling\s+banyak|paling\s+sedikit|terbanyak|tersedikit|beban\s+task|most\s+tasks?|fewest\s+tasks?|busiest\s+division)\b/i', $lower))) {
            return ['strategy' => 'DYNAMIC_TOP_DIVISION_TASKS', 'params' => ['direction' => $dir]];
        }

        // 2. Company with most / fewest projects or users
        if ($has('company') && preg_match('/\b(paling\s+banyak|terbanyak|paling\s+sedikit|tersedikit|most\s+(?:projects?|users?)|fewest\s+(?:projects?|users?))\b/i', $lower)) {
            $metric = $has('user') ? 'users' : 'projects';
            return ['strategy' => 'DYNAMIC_TOP_COMPANY_PROJECTS', 'params' => ['direction' => $dir, 'metric' => $metric]];
        }

        // 3. Busiest PIC / PIC managing most projects
        if ($has('pic') && preg_match('/\b(pegang|megang|kelola|sibuk|paling\s+banyak|terbanyak|paling\s+sedikit|most\s+projects?|busiest\s+pic)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_BUSIEST_PIC', 'params' => ['direction' => $dir]];
        }

        // 4. Heaviest / Lightest Task by Weight
        if ($has('weight') && ($has('task', 'highest', 'lowest', 'most') || preg_match('/\b(paling|terbesar|tertinggi|terkecil|heaviest|highest|largest|smallest)\b/i', $lower))) {
            return ['strategy' => 'DYNAMIC_HEAVIEST_TASK', 'params' => ['direction' => $dir]];
        }

        // 5. Longest / Shortest Task by Duration
        if ($has('duration') && ($has('task') || preg_match('/\b(paling\s+lama|terlama|paling\s+singkat|terpendek|longest|shortest)\b/i', $lower)) && preg_match('/\b(paling\s+lama|terlama|paling\s+singkat|terpendek|terpanjang|longest|shortest)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_LONGEST_TASK', 'params' => ['direction' => $dir]];
        }

        // 6. Nearest / Furthest Deadline (Project or Task)
        if ($has('deadline', 'nearest') && preg_match('/\b(terdekat|paling\s+dekat|tercepat|terjauh|paling\s+lama|nearest|closest|soonest|earliest|furthest)\b/i', $lower)) {
            $scope = $has('task') ? 'task' : 'project';
            return ['strategy' => 'DYNAMIC_NEAREST_DEADLINE', 'params' => ['scope' => $scope, 'direction' => $dir]];
        }

        // 7. Top Budget Category / Most Expensive Budget Item
        if ($has('budget', 'expensive', 'category') && preg_match('/\b(termahal|paling\s+mahal|paling\s+besar|paling\s+boros|kategori|most\s+expensive|top\s+category|highest\s+cost)\b/i', $lower)) {
            $mode = $has('category') ? 'category' : 'item';
            return ['strategy' => 'DYNAMIC_TOP_BUDGET', 'params' => ['mode' => $mode]];
        }

        // 8. Tasks Requiring Evidence Upload
        if ($has('evidence') && preg_match('/\b(wajib|butuh|perlu|belum\s+upload|belum\s+ada|mana\s+saja|require|requires|missing)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_EVIDENCE_REQUIRED_TASKS', 'params' => []];
        }

        // 9. Private Projects List
        if ($has('private') && $has('proyek')) {
            return ['strategy' => 'DYNAMIC_PRIVATE_PROJECTS', 'params' => []];
        }

        // 10. Empty Projects (projects with 0 tasks)
        if ($has('proyek') && preg_match('/\b(kosong|belum\s+ada\s+task|tanpa\s+task|empty|no\s+tasks?)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_EMPTY_PROJECTS', 'params' => []];
        }

        // 11. External Vendor Tasks
        if ($has('vendor')) {
            return ['strategy' => 'DYNAMIC_VENDOR_SEARCH', 'params' => ['keywords' => $keywords]];
        }

        // 12. Worst Overdue Tasks (explicitly asks worst/longest overdue)
        if ($has('overdue') && preg_match('/\b(paling\s+lama|terparah|paling\s+parah|terlama|most\s+overdue|worst|longest\s+overdue)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_WORST_OVERDUE_TASKS', 'params' => []];
        }

        // 13. Overall Completion Ratio / Progress Stats
        if ($has('completed', 'ratio') && preg_match('/\b(berapa\s+persen|rasio|persentase|completion\s+rate|already\s+done|sudah\s+selesai)\b/i', $lower)) {
            return ['strategy' => 'DYNAMIC_COMPLETED_RATIO', 'params' => []];
        }

        // 14. Slowest / Fastest Projects
        if ($has('proyek') && ($has('lowest', 'highest') || preg_match('/\b(lambat|terendah|tertinggi|tercepat|slowest|fastest|lowest|highest)\b/i', $lower))) {
            return ['strategy' => 'DYNAMIC_RANKED_PROJECTS', 'params' => ['direction' => $dir]];
        }

        // 15. Universal Cross-Table Deep Search & Knowledge Synthesis
        return [
            'strategy' => 'DYNAMIC_CROSS_SEARCH',
            'params'   => ['keywords' => $keywords],
        ];
    }

    // =========================================================================
    // 5. LIVE RBAC-SCOPED STRATEGY EXECUTORS
    // =========================================================================

    /**
     * Strict Role-Based Access Control check for every deep-learning strategy.
     * Returns null if permitted, or a clear restriction message if denied.
     */
    public function checkStrategyRbac(string $strategy, string $prompt, User $user, string $lang): ?string
    {
        if ($this->isSuperAdmin($user)) {
            return null;
        }

        $roleName = $user->role?->name ?? 'worker';
        $isGlobal = (bool) preg_match(
            '/\b(di\s+sistem\s+ini|di\s+provis\s+ini|di\s+sistem\s+provis|seluruh\s+sistem|seluruh\s+provis|semua\s+perusahaan|in\s+this\s+system|in\s+provis|across\s+provis|system[\s-]wide)\b/i',
            mb_strtolower($prompt)
        );
        $hasGlobalScope = $user->isAdminUtama() && $user->getDataScope() === 'all';

        $deny = function (string $idReason, string $enReason) use ($lang, $roleName): string {
            return $lang === 'en'
                ? "🔒 **Access Restricted**: {$enReason} (Your role: `{$roleName}`)."
                : "🔒 **Akses Dibatasi**: {$idReason} (Role akun Anda: `{$roleName}`).";
        };

        switch ($strategy) {
            case 'DYNAMIC_TOP_COMPANY_PROJECTS':
            case 'DYNAMIC_SCURVE_PER_COMPANY':
            case 'DYNAMIC_BUDGET_PER_COMPANY':
                if ($hasGlobalScope) {
                    return null;
                }
                return $deny(
                    'Perbandingan dan peringkat data lintas perusahaan di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                    'Cross-company rankings and comparisons across PROVIS are restricted to **SuperAdministrator** only.'
                );

            case 'DYNAMIC_SCURVE_RANKED_PROJECTS':
                if ($user->isWorker() || $user->isAdminProgres()) {
                    return $deny(
                        'Perbandingan dan peringkat **S-Curve** antar proyek hanya dapat diakses oleh **SuperAdministrator** / Manajemen Proyek. Role Anda hanya dapat memantau tugas pada cakupan proyek yang ditetapkan.',
                        'Cross-project **S-Curve** rankings and comparisons are restricted to **SuperAdministrator** / Project Management.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Perbandingan **S-Curve** seluruh proyek secara global di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide **S-Curve** comparisons across PROVIS are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_BUDGET_RANKED_PROJECTS':
                if ($user->isAdminProgres() || !($user->isAdminUtama() || $user->isPic() || $user->hasSidebarAccess('Budget Management'))) {
                    return $deny(
                        'Akun Anda tidak memiliki izin akses untuk membandingkan data **Budget** antar proyek.',
                        'Your account does not have permission to compare **Budget** across projects.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Perbandingan **Budget** seluruh proyek secara global di PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide cross-project **Budget** comparisons are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_BUSIEST_PIC':
                if ($user->isWorker() || $user->isAdminProgres()) {
                    return $deny(
                        'Peringkat beban proyek antar PIC / Project Manager tidak tersedia untuk role Anda. Anda hanya dapat melihat informasi proyek yang ditugaskan kepada Anda.',
                        'PIC / Project Manager workload rankings are not available for your role. You can only inspect projects assigned to you.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Peringkat beban PIC secara global di seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide PIC workload rankings across all companies are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_TOP_DIVISION_TASKS':
                if ($user->isWorker() && !$user->hasSidebarAccess('Division Progress')) {
                    return $deny(
                        'Peringkat beban task lintas divisi hanya dapat diakses oleh **SuperAdministrator** / Manajemen atau pengguna dengan izin **Division Progress**.',
                        'Cross-division task workload rankings are restricted to **SuperAdministrator** / Management or users with **Division Progress** access.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Statistik beban divisi secara global di seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide division workload statistics across PROVIS are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_PRIVATE_PROJECTS':
                if ($user->isWorker() || $user->isAdminProgres()) {
                    return $deny(
                        'Daftar proyek berstatus **Private** tidak dapat diakses oleh role Anda.',
                        'Listing **Private** projects is restricted for your role.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Daftar seluruh proyek Private di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'Global Private project listings across PROVIS are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_EMPTY_PROJECTS':
                if ($user->isWorker()) {
                    return $deny(
                        'Pemindaian proyek kosong di sistem PROVIS hanya dapat diakses oleh **SuperAdministrator** atau Manajemen Proyek.',
                        'Scanning empty projects in PROVIS is restricted to **SuperAdministrator** or Project Management.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Pemindaian proyek kosong di seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide empty project scans are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_RANKED_PROJECTS':
                if ($user->isWorker()) {
                    return $deny(
                        'Perbandingan dan peringkat progres proyek terbaik maupun terburuk di PROVIS hanya dapat diakses oleh **SuperAdministrator** / Manajemen. Sebagai **Worker**, Anda hanya dapat memantau task dan jadwal pada proyek yang ditugaskan kepada Anda.',
                        'Comparing and ranking best/worst project progress across PROVIS is restricted to **SuperAdministrator** / Management. As a **Worker**, you can only inspect tasks and schedules in projects assigned to you.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Peringkat progres proyek secara global di seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide project progress rankings across PROVIS are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            case 'DYNAMIC_TOP_BUDGET':
                if ($user->isAdminProgres() || !($user->isAdminUtama() || $user->isPic() || $user->hasSidebarAccess('Budget Management'))) {
                    return $deny(
                        'Akun Anda tidak memiliki izin akses untuk melihat data **Budget Management**.',
                        'Your account does not have permission to view **Budget Management** data.'
                    );
                }
                if ($isGlobal && !$hasGlobalScope) {
                    return $deny(
                        'Analisis pengeluaran budget secara global seluruh sistem PROVIS hanya dapat diakses oleh **SuperAdministrator**.',
                        'System-wide budget analytics across all companies are restricted to **SuperAdministrator**.'
                    );
                }
                return null;

            default:
                return null;
        }
    }

    protected function executeStrategy(
        string $strategy,
        array $params,
        string $prompt,
        User $user,
        ?int $activeProjectId,
        string $lang
    ): array {
        // Enforce strict RBAC before running ANY strategy (live OR cached from ai_learned_knowledge!)
        $rbacDenied = $this->checkStrategyRbac($strategy, $prompt, $user, $lang);
        if ($rbacDenied !== null) {
            return [
                'content'       => $rbacDenied,
                'actions'       => [],
                'should_learn'  => false,
                'access_denied' => true,
            ];
        }

        $accessibleIds = $this->getAccessibleProjectIds($user);

        switch ($strategy) {
            case 'DYNAMIC_SCURVE_PER_COMPANY':
                return $this->execSCurvePerCompany($user, $accessibleIds, $lang);

            case 'DYNAMIC_SCURVE_RANKED_PROJECTS':
                return $this->execSCurveRankedProjects($accessibleIds, $params['order'] ?? 'best_to_worst', $lang);

            case 'DYNAMIC_BUDGET_PER_COMPANY':
                return $this->execBudgetPerCompany($user, $accessibleIds, $lang);

            case 'DYNAMIC_BUDGET_RANKED_PROJECTS':
                return $this->execBudgetRankedProjects($accessibleIds, $params['direction'] ?? 'desc', $lang);

            case 'DYNAMIC_TOP_DIVISION_TASKS':
                return $this->execTopDivisionTasks($user, $accessibleIds, $activeProjectId, $params['direction'] ?? 'desc', $lang);

            case 'DYNAMIC_TOP_COMPANY_PROJECTS':
                return $this->execTopCompanyStats($user, $accessibleIds, $params['direction'] ?? 'desc', $params['metric'] ?? 'projects', $lang);

            case 'DYNAMIC_BUSIEST_PIC':
                return $this->execBusiestPic($user, $accessibleIds, $params['direction'] ?? 'desc', $lang);

            case 'DYNAMIC_HEAVIEST_TASK':
                return $this->execHeaviestTask($accessibleIds, $activeProjectId, $params['direction'] ?? 'desc', $lang);

            case 'DYNAMIC_LONGEST_TASK':
                return $this->execLongestTask($accessibleIds, $activeProjectId, $params['direction'] ?? 'desc', $lang);

            case 'DYNAMIC_NEAREST_DEADLINE':
                return $this->execNearestDeadline($accessibleIds, $activeProjectId, $params['scope'] ?? 'project', $params['direction'] ?? 'asc', $lang);

            case 'DYNAMIC_TOP_BUDGET':
                return $this->execTopBudget($user, $accessibleIds, $activeProjectId, $params['mode'] ?? 'item', $lang);

            case 'DYNAMIC_EVIDENCE_REQUIRED_TASKS':
                return $this->execEvidenceRequiredTasks($accessibleIds, $activeProjectId, $lang);

            case 'DYNAMIC_PRIVATE_PROJECTS':
                return $this->execPrivateProjects($accessibleIds, $lang);

            case 'DYNAMIC_EMPTY_PROJECTS':
                return $this->execEmptyProjects($accessibleIds, $lang);

            case 'DYNAMIC_VENDOR_SEARCH':
                return $this->execVendorSearch($accessibleIds, $activeProjectId, $params['keywords'] ?? [], $lang);

            case 'DYNAMIC_WORST_OVERDUE_TASKS':
                return $this->execWorstOverdueTasks($accessibleIds, $activeProjectId, $lang);

            case 'DYNAMIC_COMPLETED_RATIO':
                return $this->execCompletedRatio($accessibleIds, $activeProjectId, $lang);

            case 'DYNAMIC_RANKED_PROJECTS':
                return $this->execRankedProjects($accessibleIds, $params['direction'] ?? 'asc', $lang);

            default:
                return $this->execCrossTableDeepSearch($prompt, $params['keywords'] ?? [], $user, $accessibleIds, $activeProjectId, $lang);
        }
    }

    protected function execTopDivisionTasks(User $user, array $accessibleIds, ?int $activeProjectId, string $direction, string $lang): array
    {
        $pIds = ($activeProjectId && in_array($activeProjectId, $accessibleIds, true)) ? [$activeProjectId] : $accessibleIds;
        $scopedProj = ($activeProjectId && in_array($activeProjectId, $accessibleIds, true)) ? Project::find($activeProjectId) : null;
        $tasks = !empty($pIds)
            ? Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))->with(['division', 'divisions'])->get()
            : collect();

        $counts = [];
        if ($this->isSuperAdmin($user) && !$scopedProj) {
            foreach (Division::all() as $d) {
                $counts[$d->divisi] = ['total' => 0, 'done' => 0, 'outstanding' => 0];
            }
        }

        foreach ($tasks as $t) {
            $names = $t->divisions->pluck('divisi')->all();
            if (empty($names)) {
                $names = [$t->division?->divisi ?? 'General'];
            }
            $isDone = $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100;
            foreach (array_unique($names) as $n) {
                if (!isset($counts[$n])) {
                    $counts[$n] = ['total' => 0, 'done' => 0, 'outstanding' => 0];
                }
                $counts[$n]['total']++;
                if ($isDone) {
                    $counts[$n]['done']++;
                }
                if (!$isDone && $t->status === 'Outstanding') {
                    $counts[$n]['outstanding']++;
                }
            }
        }

        uasort($counts, fn($a, $b) => $direction === 'asc' ? ($a['total'] <=> $b['total']) : ($b['total'] <=> $a['total']));
        $topName = array_key_first($counts);
        $topStat = $counts[$topName] ?? ['total' => 0, 'done' => 0, 'outstanding' => 0];

        $lines = [];
        $i = 1;
        foreach (array_slice($counts, 0, 8, true) as $name => $st) {
            $pct = $st['total'] > 0 ? round(($st['done'] / $st['total']) * 100, 1) : 0;
            $lines[] = "{$i}. **{$name}** — **{$st['total']} task** ({$st['done']} selesai / {$pct}%" . ($st['outstanding'] > 0 ? ", 🟣 {$st['outstanding']} Outstanding" : '') . ')';
            $i++;
        }

        $labelId = $direction === 'asc' ? 'Paling Sedikit' : 'Paling Banyak';
        $labelEn = $direction === 'asc' ? 'Fewest' : 'Most';
        $scopeNote = $scopedProj ? " — {$scopedProj->title}" : '';

        $content = $lang === 'en'
            ? "### 🗂️ Division Workload Ranking ({$labelEn} Tasks){$scopeNote}\n\n"
              . ($topName ? "🏆 **{$topName}** has the " . strtolower($labelEn) . " tasks with **{$topStat['total']} tasks** ({$topStat['done']} completed).\n\n" : '')
              . (!empty($lines) ? implode("\n", $lines) : 'No WBS tasks found in this scope yet.')
            : "### 🗂️ Peringkat Beban Task per Divisi ({$labelId}){$scopeNote}\n\n"
              . ($topName ? "🏆 Divisi dengan task " . strtolower($labelId) . " saat ini adalah **{$topName}** dengan **{$topStat['total']} task** ({$topStat['done']} selesai).\n\n" : '')
              . (!empty($lines) ? implode("\n", $lines) : 'Belum ada task WBS pada cakupan proyek ini.');

        return ['content' => $content, 'actions' => [['type' => 'link', 'label' => 'Division Progress', 'url' => '/division-progress']], 'should_learn' => true];
    }

    protected function execTopCompanyStats(User $user, array $accessibleIds, string $direction, string $metric, string $lang): array
    {
        $query = Company::with(['projects', 'users']);
        if (!$this->isSuperAdmin($user)) {
            $query->whereIn('id', $user->getCompanyIds());
        }
        $companies = $query->get();

        $rows = [];
        foreach ($companies as $c) {
            $pCount = $this->isSuperAdmin($user)
                ? $c->projects->count()
                : $c->projects->filter(fn($p) => in_array((int) $p->id, $accessibleIds, true))->count();
            $uCount = $c->users->count();
            $rows[] = ['name' => $c->name, 'projects' => $pCount, 'users' => $uCount];
        }

        usort($rows, fn($a, $b) => $direction === 'asc' ? ($a[$metric] <=> $b[$metric]) : ($b[$metric] <=> $a[$metric]));
        $top = $rows[0] ?? null;

        $lines = [];
        foreach ($rows as $idx => $r) {
            $lines[] = ($idx + 1) . ". 🏢 **{$r['name']}** — **{$r['projects']} projek** · **{$r['users']} user**";
        }

        $mLabelId = $metric === 'users' ? 'user' : 'projek';
        $mLabelEn = $metric === 'users' ? 'users' : 'projects';
        $dirId    = $direction === 'asc' ? 'paling sedikit' : 'paling banyak';
        $dirEn    = $direction === 'asc' ? 'fewest' : 'most';

        $content = $lang === 'en'
            ? "### 🏢 Company Ranking ({$dirEn} {$mLabelEn})\n\n"
              . ($top ? "🏆 **{$top['name']}** leads with **{$top[$metric]} {$mLabelEn}**.\n\n" : '')
              . implode("\n", $lines)
            : "### 🏢 Peringkat Perusahaan ({$mLabelId} {$dirId})\n\n"
              . ($top ? "🏆 Perusahaan dengan {$mLabelId} {$dirId} adalah **{$top['name']}** (**{$top[$metric]} {$mLabelId}**).\n\n" : '')
              . implode("\n", $lines);

        return ['content' => $content, 'actions' => $this->isSuperAdmin($user) ? [['type' => 'link', 'label' => 'Kelola Perusahaan', 'url' => '/admin/companies']] : [], 'should_learn' => true];
    }

    protected function execBusiestPic(User $user, array $accessibleIds, string $direction, string $lang): array
    {
        $projects = Project::whereIn('id', $accessibleIds)->with('manager')->get();
        $byPic = [];
        foreach ($projects as $p) {
            $name = $p->manager?->username ?? 'Unassigned';
            if (!isset($byPic[$name])) {
                $byPic[$name] = ['name' => $name, 'count' => 0, 'titles' => [], 'avg_prog' => 0.0];
            }
            $byPic[$name]['count']++;
            $byPic[$name]['titles'][] = $p->title;
            $byPic[$name]['avg_prog'] += (float) ($p->progress ?? 0);
        }

        foreach ($byPic as &$row) {
            $row['avg_prog'] = $row['count'] > 0 ? round($row['avg_prog'] / $row['count'], 1) : 0;
        }
        unset($row);

        uasort($byPic, fn($a, $b) => $direction === 'asc' ? ($a['count'] <=> $b['count']) : ($b['count'] <=> $a['count']));
        $top = reset($byPic) ?: null;

        $lines = [];
        $i = 1;
        foreach ($byPic as $r) {
            $tList = implode(', ', array_slice($r['titles'], 0, 3));
            $lines[] = "{$i}. 🪪 **{$r['name']}** — **{$r['count']} projek** (rata-rata progres: **{$r['avg_prog']}%**) · *{$tList}*";
            $i++;
        }

        $content = $lang === 'en'
            ? "### 🪪 Project Manager (PIC) Workload Ranking\n\n"
              . ($top ? "🏆 **{$top['name']}** manages **{$top['count']} project(s)** (avg progress **{$top['avg_prog']}%**).\n\n" : '')
              . implode("\n", $lines)
            : "### 🪪 Peringkat Beban Projek per PIC / Project Manager\n\n"
              . ($top ? "🏆 PIC dengan tanggungan projek " . ($direction === 'asc' ? 'paling sedikit' : 'paling banyak') . " adalah **{$top['name']}** (**{$top['count']} projek**, rata-rata progres **{$top['avg_prog']}%**).\n\n" : '')
              . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execHeaviestTask(array $accessibleIds, ?int $activeProjectId, string $direction, string $lang): array
    {
        $pIds = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
            ->with(['subWbs.mainWbs.project', 'division'])
            ->orderBy('weight', $direction === 'asc' ? 'asc' : 'desc')
            ->take(8)
            ->get();

        if ($tasks->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No WBS tasks found in your accessible projects.' : 'Belum ada task WBS di projek yang dapat kamu akses.', 'actions' => [], 'should_learn' => true];
        }

        $lines = [];
        foreach ($tasks as $idx => $t) {
            $pTitle = $t->subWbs?->mainWbs?->project?->title ?? '—';
            $w = round((float) ($t->weight ?? 0), 2);
            $lines[] = ($idx + 1) . ". **{$t->name}** (*{$pTitle}*) — Bobot: **{$w}%** | Progres: **" . round((float) $t->progress, 1) . "%** (`{$t->status}`)";
        }

        $top = $tasks->first();
        $content = $lang === 'en'
            ? "### ⚖️ Tasks by Weight (" . ($direction === 'asc' ? 'Lowest' : 'Highest') . ")\n\n"
              . "🏆 **{$top->name}** has weight **" . round((float) $top->weight, 2) . "%**.\n\n" . implode("\n", $lines)
            : "### ⚖️ Peringkat Task Berdasarkan Bobot (" . ($direction === 'asc' ? 'Terkecil' : 'Terbesar') . ")\n\n"
              . "🏆 Task dengan bobot " . ($direction === 'asc' ? 'terkecil' : 'terbesar') . " adalah **{$top->name}** (**" . round((float) $top->weight, 2) . "%**).\n\n" . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execLongestTask(array $accessibleIds, ?int $activeProjectId, string $direction, string $lang): array
    {
        $pIds = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
            ->with(['subWbs.mainWbs.project'])
            ->orderBy('duration_days', $direction === 'asc' ? 'asc' : 'desc')
            ->take(8)
            ->get();

        if ($tasks->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No WBS tasks found.' : 'Belum ada data task WBS.', 'actions' => [], 'should_learn' => true];
        }

        $lines = [];
        foreach ($tasks as $idx => $t) {
            $pTitle = $t->subWbs?->mainWbs?->project?->title ?? '—';
            $dur = (int) ($t->duration_days ?? 1);
            $lines[] = ($idx + 1) . ". **{$t->name}** (*{$pTitle}*) — Durasi: **{$dur} hari** | Status: `{$t->status}` (" . round((float) $t->progress, 1) . '%)';
        }

        $top = $tasks->first();
        $content = $lang === 'en'
            ? "### ⏱️ Tasks by Duration (" . ($direction === 'asc' ? 'Shortest' : 'Longest') . ")\n\n"
              . "🏆 **{$top->name}** (**{$top->duration_days} days**).\n\n" . implode("\n", $lines)
            : "### ⏱️ Peringkat Task Berdasarkan Durasi (" . ($direction === 'asc' ? 'Tersingkat' : 'Terlama') . ")\n\n"
              . "🏆 Task dengan durasi " . ($direction === 'asc' ? 'tersingkat' : 'terlama') . " adalah **{$top->name}** (**{$top->duration_days} hari**).\n\n" . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execNearestDeadline(array $accessibleIds, ?int $activeProjectId, string $scope, string $direction, string $lang): array
    {
        $now = Carbon::now('Asia/Jakarta');

        if ($scope === 'task') {
            $pIds = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
            $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
                ->where('status', '!=', 'Completed')
                ->where('progress', '<', 100)
                ->whereNotNull('end')
                ->with(['subWbs.mainWbs.project'])
                ->orderBy('end', $direction === 'desc' ? 'desc' : 'asc')
                ->take(8)
                ->get();

            $lines = $tasks->values()->map(function ($t, $i) use ($now) {
                $end  = Carbon::parse($t->end);
                $diff = (int) ceil($now->diffInDays($end, false));
                $tag  = $diff < 0 ? ('Terlambat ' . abs($diff) . ' hari') : ("Sisa {$diff} hari");
                $p    = $t->subWbs?->mainWbs?->project?->title ?? '—';
                return ($i + 1) . ". **{$t->name}** (*{$p}*) — Target: **{$end->format('d M Y')}** (*{$tag}*) · Progres: " . round((float) $t->progress, 1) . '%';
            })->all();

            $content = ($lang === 'en' ? "### ⏰ Upcoming Task Deadlines\n\n" : "### ⏰ Task dengan Deadline " . ($direction === 'desc' ? 'Terjauh' : 'Terdekat') . "\n\n")
                . (!empty($lines) ? implode("\n", $lines) : ($lang === 'en' ? 'No open tasks with deadlines.' : 'Tidak ada task aktif dengan tenggat waktu.'));

            return ['content' => $content, 'actions' => [], 'should_learn' => true];
        }

        $projects = Project::whereIn('id', $accessibleIds)
            ->where('progress', '<', 100)
            ->whereNotNull('end')
            ->with('company')
            ->orderBy('end', $direction === 'desc' ? 'desc' : 'asc')
            ->get();

        $lines = $projects->values()->map(function ($p, $i) use ($now) {
            $end  = Carbon::parse($p->end);
            $diff = (int) ceil($now->diffInDays($end, false));
            $tag  = $diff < 0 ? ('Terlambat ' . abs($diff) . ' hari') : ("Sisa {$diff} hari");
            return ($i + 1) . ". **{$p->title}** (`#{$p->id}` — " . ($p->company?->name ?? '—') . ") — Target: **{$end->format('d M Y')}** (*{$tag}*) · Progres: **" . round((float) $p->progress, 1) . '%**';
        })->all();

        $top = $projects->first();
        $content = ($lang === 'en'
            ? "### 📅 Projects by Target Deadline\n\n" . ($top ? "⏰ Nearest deadline: **{$top->title}** (" . Carbon::parse($top->end)->format('d M Y') . ").\n\n" : '')
            : "### 📅 Peringkat Projek Berdasarkan Deadline " . ($direction === 'desc' ? 'Terjauh' : 'Terdekat') . "\n\n"
              . ($top ? "⏰ Projek dengan target selesai " . ($direction === 'desc' ? 'terjauh' : 'paling dekat') . " adalah **{$top->title}** (**" . Carbon::parse($top->end)->format('d M Y') . "**, progres **" . round((float) $top->progress, 1) . "%**).\n\n" : ''))
            . (!empty($lines) ? implode("\n", $lines) : '—');

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execTopBudget(User $user, array $accessibleIds, ?int $activeProjectId, string $mode, string $lang): array
    {
        if (!($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic() || $user->hasSidebarAccess('Budget Management'))) {
            return [
                'content'      => $lang === 'en' ? '🔒 Access Denied: You do not have permission to view budget data.' : '🔒 Akses Dibatasi: Akun kamu tidak memiliki izin melihat data Budget.',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $pIds    = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $entries = BudgetEntry::whereIn('projects_id', $pIds)->with('project')->get();

        if ($entries->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No budget expenditure entries recorded yet.' : 'Belum ada transaksi pengeluaran budget yang tercatat.', 'actions' => [], 'should_learn' => true];
        }

        if ($mode === 'category') {
            $byCat = [];
            foreach ($entries as $e) {
                $cat = $e->kategori ?: 'Other';
                $byCat[$cat] = ($byCat[$cat] ?? 0.0) + (float) ($e->harga_total ?? 0);
            }
            arsort($byCat);
            $topCat = array_key_first($byCat);
            $lines  = [];
            $i = 1;
            foreach ($byCat as $cat => $sum) {
                $lines[] = "{$i}. **{$cat}** — **Rp " . number_format($sum, 0, ',', '.') . '**';
                $i++;
            }

            $content = $lang === 'en'
                ? "### 💰 Top Budget Spending Categories\n\n🏆 Highest spending category: **{$topCat}** (**Rp " . number_format($byCat[$topCat], 0, ',', '.') . "**).\n\n" . implode("\n", $lines)
                : "### 💰 Kategori Pengeluaran Budget Terbesar\n\n🏆 Kategori budget paling besar adalah **{$topCat}** (**Rp " . number_format($byCat[$topCat], 0, ',', '.') . "**).\n\n" . implode("\n", $lines);

            return ['content' => $content, 'actions' => [['type' => 'link', 'label' => 'Buka Budget', 'url' => '/budget']], 'should_learn' => true];
        }

        $sorted = $entries->sortByDesc('harga_total')->take(6)->values();
        $top    = $sorted->first();
        $lines  = $sorted->map(fn($e, $i) => ($i + 1) . ". **{$e->nama_item}** (*" . ($e->project?->title ?? '—') . "*, {$e->kategori}) — **Rp " . number_format((float) $e->harga_total, 0, ',', '.') . "** · Ref: `{$e->referensi}`")->all();

        $content = $lang === 'en'
            ? "### 💰 Most Expensive Budget Items\n\n🏆 Highest item: **{$top->nama_item}** (**Rp " . number_format((float) $top->harga_total, 0, ',', '.') . "**).\n\n" . implode("\n", $lines)
            : "### 💰 Daftar Item Pengeluaran Budget Terbesar\n\n🏆 Item budget termahal adalah **{$top->nama_item}** (**Rp " . number_format((float) $top->harga_total, 0, ',', '.') . "**).\n\n" . implode("\n", $lines);

        return ['content' => $content, 'actions' => [['type' => 'link', 'label' => 'Buka Budget', 'url' => '/budget']], 'should_learn' => true];
    }

    protected function execEvidenceRequiredTasks(array $accessibleIds, ?int $activeProjectId, string $lang): array
    {
        $pIds  = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
            ->where('requires_evidence', true)
            ->with(['subWbs.mainWbs.project'])
            ->take(12)
            ->get();

        if ($tasks->isEmpty()) {
            return [
                'content'      => $lang === 'en' ? 'Currently no tasks in your accessible projects are flagged as mandatory evidence (`requires_evidence`).' : 'Saat ini tidak ada task yang ditandai wajib upload evidence (`requires_evidence`) di projek yang kamu akses.',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $lines = $tasks->values()->map(function ($t, $i) {
            $hasEv = !empty($t->evidence_path) && $t->evidence_path !== '[]';
            $badge = $hasEv ? '✅ Sudah upload' : '⚠️ Belum ada file';
            $p     = $t->subWbs?->mainWbs?->project?->title ?? '—';
            return ($i + 1) . ". **{$t->name}** (*{$p}*) — {$badge} · Progres: " . round((float) $t->progress, 1) . '%';
        })->all();

        $content = ($lang === 'en' ? "### 📎 Tasks Requiring Evidence ({$tasks->count()} found)\n\n" : "### 📎 Daftar Task yang Wajib Upload Evidence ({$tasks->count()} task)\n\n")
            . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execPrivateProjects(array $accessibleIds, string $lang): array
    {
        $projects = Project::whereIn('id', $accessibleIds)->where('is_private', true)->with(['company', 'manager'])->get();
        if ($projects->isEmpty()) {
            return [
                'content'      => $lang === 'en' ? 'There are currently no Private projects in your accessible scope.' : 'Saat ini tidak ada projek berstatus **Private** dalam cakupan akses kamu.',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $lines = $projects->values()->map(fn($p, $i) => ($i + 1) . ". 🔒 **{$p->title}** (`#{$p->id}` — " . ($p->company?->name ?? '—') . ") · PIC: *" . ($p->manager?->username ?? '—') . "* · Progres: **" . round((float) $p->progress, 1) . '%**')->all();
        $content = ($lang === 'en' ? "### 🔒 Private Projects ({$projects->count()} found)\n\n" : "### 🔒 Daftar Projek Private ({$projects->count()} projek)\n\n") . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execEmptyProjects(array $accessibleIds, string $lang): array
    {
        $projects = Project::whereIn('id', $accessibleIds)->with('company')->get();
        $empty = [];
        foreach ($projects as $p) {
            $tCount = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->where('projects_id', $p->id))->count();
            if ($tCount === 0) {
                $empty[] = $p;
            }
        }

        if (empty($empty)) {
            return [
                'content'      => $lang === 'en' ? 'All accessible projects already have WBS tasks populated!' : 'Semua projek yang dapat kamu akses sudah memiliki daftar task WBS (tidak ada yang kosong).',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $lines = [];
        foreach ($empty as $idx => $p) {
            $lines[] = ($idx + 1) . ". 📁 **{$p->title}** (`#{$p->id}` — " . ($p->company?->name ?? '—') . ") — **0 task WBS**";
        }
        $content = ($lang === 'en' ? "### 📂 Projects Without WBS Tasks (" . count($empty) . " found)\n\n" : "### 📂 Projek yang Belum Memiliki Task WBS (" . count($empty) . " projek)\n\n") . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execVendorSearch(array $accessibleIds, ?int $activeProjectId, array $keywords, string $lang): array
    {
        $pIds  = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
            ->whereNotNull('vendor')
            ->whereRaw("UPPER(TRIM(vendor)) NOT IN ('', 'INTERNAL', '-')")
            ->with(['subWbs.mainWbs.project'])
            ->take(12)
            ->get();

        if ($tasks->isEmpty()) {
            return ['content' => $lang === 'en' ? 'All current tasks are marked as `INTERNAL` (no external vendor tasks found).' : 'Saat ini seluruh task tercatat sebagai `INTERNAL` (belum ada task vendor eksternal).', 'actions' => [], 'should_learn' => true];
        }

        $lines = $tasks->values()->map(fn($t, $i) => ($i + 1) . ". 🏭 **{$t->vendor}** — **{$t->name}** (*" . ($t->subWbs?->mainWbs?->project?->title ?? '—') . "*) · Status: `{$t->status}` (" . round((float) $t->progress, 1) . '%)')->all();
        $content = ($lang === 'en' ? "### 🏭 External Vendor Tasks ({$tasks->count()} found)\n\n" : "### 🏭 Daftar Task Vendor Eksternal ({$tasks->count()} task)\n\n") . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execWorstOverdueTasks(array $accessibleIds, ?int $activeProjectId, string $lang): array
    {
        $now  = Carbon::now('Asia/Jakarta');
        $pIds = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;

        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))
            ->where('status', '!=', 'Completed')
            ->where('progress', '<', 100)
            ->where('end', '<', $now->format('Y-m-d'))
            ->with(['subWbs.mainWbs.project', 'division'])
            ->orderBy('end', 'asc')
            ->take(10)
            ->get();

        if ($tasks->isEmpty()) {
            return ['content' => $lang === 'en' ? '🎉 No overdue tasks found right now!' : '🎉 Tidak ada task yang overdue / melewati tenggat saat ini!', 'actions' => [], 'should_learn' => true];
        }

        $lines = $tasks->values()->map(function ($t, $i) use ($now) {
            $daysLate = (int) abs($now->diffInDays(Carbon::parse($t->end), false));
            $p        = $t->subWbs?->mainWbs?->project?->title ?? '—';
            return ($i + 1) . ". 🔴 **{$t->name}** (*{$p}*) — Terlambat **{$daysLate} hari** (Deadline: " . Carbon::parse($t->end)->format('d M Y') . ", Progres: " . round((float) $t->progress, 1) . '%)';
        })->all();

        $content = ($lang === 'en' ? "### 🔴 Most Severely Overdue Tasks ({$tasks->count()} shown)\n\n" : "### 🔴 Daftar Task Overdue Terparah ({$tasks->count()} teratas)\n\n") . implode("\n", $lines);

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execCompletedRatio(array $accessibleIds, ?int $activeProjectId, string $lang): array
    {
        $pIds  = $activeProjectId && in_array($activeProjectId, $accessibleIds, true) ? [$activeProjectId] : $accessibleIds;
        $tasks = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $pIds))->get(['id', 'status', 'progress', 'is_completed', 'end']);
        $total = $tasks->count();
        $done  = $tasks->filter(fn($t) => $t->is_completed || $t->status === 'Completed' || (float) $t->progress >= 100)->count();
        $out   = $tasks->where('status', 'Outstanding')->count();
        $pct   = $total > 0 ? round(($done / $total) * 100, 1) : 0;

        $content = $lang === 'en'
            ? "### 📊 Task Completion Ratio\n\n- **Completed**: **{$done} / {$total} tasks** (**{$pct}%**)\n- **Remaining**: **" . ($total - $done) . " tasks** (including **{$out}** `Outstanding` PR items)"
            : "### 📊 Rasio Penyelesaian Task di PROVIS\n\n- **Sudah Selesai**: **{$done} dari {$total} task** (**{$pct}%**)\n- **Belum Selesai**: **" . ($total - $done) . " task** (termasuk **{$out}** item PR `Outstanding`)";

        return ['content' => $content, 'actions' => [], 'should_learn' => true];
    }

    protected function execRankedProjects(array $accessibleIds, string $direction, string $lang): array
    {
        $now      = Carbon::now('Asia/Jakarta');
        $projects = Project::whereIn('id', $accessibleIds)
            ->with(['company', 'manager'])
            ->orderBy('progress', $direction === 'asc' ? 'asc' : 'desc')
            ->orderBy('end', 'asc')
            ->get();

        if ($projects->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No accessible projects found.' : 'Belum ada projek yang dapat diakses.', 'actions' => [], 'should_learn' => true];
        }

        $extremeVal = round((float) ($projects->first()->progress ?? 0), 2);
        $tied       = $projects->filter(fn($p) => round((float) ($p->progress ?? 0), 2) === $extremeVal)->values();

        $tiedBanner = '';
        if ($tied->count() > 1) {
            $tNames = $tied->map(fn($p) => "**{$p->title}** (`#{$p->id}`)")->implode(', ');
            $tiedBanner = $lang === 'en'
                ? "📌 There are **{$tied->count()} projects tied at {$extremeVal}%**: {$tNames} — with **{$tied->first()->title}** having the closest target deadline.\n\n"
                : "📌 Ada **{$tied->count()} projek yang sama-sama di {$extremeVal}%**: {$tNames} — dengan **{$tied->first()->title}** memiliki target deadline paling dekat.\n\n";
        }

        $lines = $projects->values()->map(function ($p, $i) use ($now) {
            $endStr = $p->end ? Carbon::parse($p->end)->format('d M Y') : '—';
            $prog   = round((float) ($p->progress ?? 0), 1);
            return ($i + 1) . ". **{$p->title}** (`#{$p->id}` — " . ($p->company?->name ?? '—') . ") — **{$prog}%** (`{$p->status}` · Target: {$endStr})";
        })->all();

        $title = $direction === 'asc'
            ? ($lang === 'en' ? '### 📉 Slowest / Lowest Progress Projects' : '### 📉 Peringkat Projek dengan Progres Paling Lambat / Terendah')
            : ($lang === 'en' ? '### 🏆 Fastest / Highest Progress Projects' : '### 🏆 Peringkat Projek dengan Progres Tertinggi');

        return [
            'content'      => "{$title}\n\n{$tiedBanner}" . implode("\n", $lines),
            'actions'      => [['type' => 'link', 'label' => 'Buka Project List', 'url' => '/projectlistpage']],
            'should_learn' => true,
        ];
    }

    /**
     * Rank ALL accessible projects by live S-Curve health (SPI, Variance, Progress, Delay Days)
     * from Best to Worst (or Worst to Best).
     */
    protected function execSCurveRankedProjects(array $accessibleIds, string $order, string $lang): array
    {
        $projects = Project::whereIn('id', $accessibleIds)
            ->with(['company', 'manager', 'mainWbs.subWbs.wbsTasks'])
            ->get();

        if ($projects->isEmpty()) {
            return [
                'content'      => $lang === 'en' ? 'No accessible projects found to rank S-Curve.' : 'Belum ada projek yang dapat diakses untuk peringkat S-Curve.',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $rows = [];
        foreach ($projects as $p) {
            $calc      = $this->scurveService->calculate($p);
            $m         = $calc['metrics'] ?? [];
            $spi       = (float) ($m['spi'] ?? 1.0);
            $var       = (float) ($m['variance_progress'] ?? 0.0);
            $actual    = (float) ($m['actual_progress'] ?? $p->progress ?? 0.0);
            $planned   = (float) ($m['planned_progress'] ?? 0.0);
            $isDelayed = (bool) ($m['is_delayed'] ?? false);
            $delayDays = (int) ($m['delay_days'] ?? 0);
            $overdue   = (int) ($m['overdue_tasks_count'] ?? 0);
            $forecast  = $m['forecast_end_date'] ?? ($p->end ? Carbon::parse($p->end)->format('d M Y') : '—');
            $plannedEnd = $m['planned_end_date'] ?? ($p->end ? Carbon::parse($p->end)->format('d M Y') : '—');

            // Composite S-Curve score: higher SPI, non-negative variance, higher actual progress, fewer delay days = better
            $healthScore = ($spi * 100.0) + ($var * 1.5) + ($actual * 0.25) - ($delayDays * 0.4);

            $rows[] = [
                'id'          => $p->id,
                'title'       => $p->title,
                'company'     => $p->company?->name ?? '—',
                'spi'         => round($spi, 3),
                'variance'    => round($var, 2),
                'actual'      => round($actual, 1),
                'planned'     => round($planned, 1),
                'is_delayed'  => $isDelayed,
                'delay_days'  => $delayDays,
                'overdue'     => $overdue,
                'planned_end' => $plannedEnd,
                'forecast'    => $forecast,
                'score'       => $healthScore,
            ];
        }

        usort($rows, function (array $a, array $b) use ($order): int {
            $cmp = $b['score'] <=> $a['score'];
            if ($cmp === 0) {
                $cmp = $b['variance'] <=> $a['variance'];
            }
            if ($cmp === 0) {
                $cmp = $b['actual'] <=> $a['actual'];
            }
            return $order === 'worst_to_best' ? -$cmp : $cmp;
        });

        $best  = $order === 'worst_to_best' ? end($rows) : $rows[0];
        $worst = $order === 'worst_to_best' ? $rows[0] : end($rows);

        $lines = [];
        foreach ($rows as $idx => $r) {
            $badge = $r['is_delayed']
                ? ($lang === 'en' ? "⚠️ Delayed +{$r['delay_days']}d" : "⚠️ Tertinggal +{$r['delay_days']}h")
                : ($r['variance'] >= 0 ? ($lang === 'en' ? '🟢 On Track' : '🟢 Sesuai Plan') : '🟡 Monitor');
            $varSign = $r['variance'] > 0 ? '+' : '';
            $overdueNote = $r['overdue'] > 0 ? " · Overdue `{$r['overdue']} task`" : '';
            $lines[] = ($idx + 1) . ". **{$r['title']}** (`#{$r['id']}` · {$r['company']})\n"
                . "   • SPI `{$r['spi']}` · Deviasi `{$varSign}{$r['variance']}%` · Aktual **{$r['actual']}%** · {$badge}{$overdueNote}\n"
                . "   • Prediksi selesai: **{$r['forecast']}** *(Target: {$r['planned_end']})*";
        }

        if ($lang === 'en') {
            $title = $order === 'worst_to_best'
                ? '### 📈 Project S-Curve Ranking (Worst to Best)'
                : '### 📈 Project S-Curve Ranking (Best to Worst)';
            $summary = "🏆 **Best**: **{$best['title']}** (`SPI {$best['spi']}`, `{$best['variance']}%`)\n"
                . "📉 **Needs Attention**: **{$worst['title']}** (`SPI {$worst['spi']}`, `{$worst['variance']}%`)\n\n";
        } else {
            $title = $order === 'worst_to_best'
                ? '### 📈 Peringkat S-Curve Seluruh Projek (Paling Buruk → Paling Baik)'
                : '### 📈 Peringkat S-Curve Seluruh Projek (Paling Baik → Paling Buruk)';
            $bestSign  = $best['variance'] > 0 ? '+' : '';
            $worstSign = $worst['variance'] > 0 ? '+' : '';
            $summary = "🏆 **S-Curve Paling Baik**: **{$best['title']}** (`#{$best['id']}` · SPI `{$best['spi']}` · `{$bestSign}{$best['variance']}%`)\n"
                . "📉 **S-Curve Paling Buruk**: **{$worst['title']}** (`#{$worst['id']}` · SPI `{$worst['spi']}` · `{$worstSign}{$worst['variance']}%` · {$worst['overdue']} overdue)\n\n";
        }

        return [
            'content'      => "{$title}\n\n{$summary}" . implode("\n", $lines),
            'actions'      => [['type' => 'link', 'label' => $lang === 'en' ? 'Open S-Curve Report' : 'Buka S-Curve Report', 'url' => '/scurve']],
            'should_learn' => true,
        ];
    }

    /**
     * Group ALL accessible projects by Company and compare per-company S-Curve health metrics
     * (Average SPI, Average Variance, Average Actual Progress, and each project's S-Curve breakdown).
     */
    protected function execSCurvePerCompany(User $user, array $accessibleIds, string $lang): array
    {
        $cQuery = Company::query();
        if (!$this->isSuperAdmin($user) && $user->getDataScope() !== 'all') {
            $cQuery->whereIn('id', $user->getCompanyIds());
        }
        $companies = $cQuery->with([
            'projects' => fn($q) => $q->whereIn('id', $accessibleIds)->with(['mainWbs.subWbs.wbsTasks']),
        ])->get();

        if ($companies->isEmpty()) {
            return [
                'content'      => $lang === 'en' ? 'No companies found to compare S-Curve.' : 'Belum ada data perusahaan untuk dibandingkan S-Curve-nya.',
                'actions'      => [],
                'should_learn' => true,
            ];
        }

        $companyRows = [];
        foreach ($companies as $comp) {
            $projItems = [];
            $sumSpi = 0.0;
            $sumVar = 0.0;
            $sumAct = 0.0;
            $delayedCount = 0;

            foreach ($comp->projects as $p) {
                $calc      = $this->scurveService->calculate($p);
                $m         = $calc['metrics'] ?? [];
                $spi       = (float) ($m['spi'] ?? 1.0);
                $var       = (float) ($m['variance_progress'] ?? 0.0);
                $actual    = (float) ($m['actual_progress'] ?? $p->progress ?? 0.0);
                $isDelayed = (bool) ($m['is_delayed'] ?? false);
                $delayDays = (int) ($m['delay_days'] ?? 0);

                $sumSpi += $spi;
                $sumVar += $var;
                $sumAct += $actual;
                if ($isDelayed) {
                    $delayedCount++;
                }

                $projItems[] = [
                    'id'         => $p->id,
                    'title'      => $p->title,
                    'spi'        => round($spi, 3),
                    'variance'   => round($var, 2),
                    'actual'     => round($actual, 1),
                    'is_delayed' => $isDelayed,
                    'delay_days' => $delayDays,
                ];
            }

            $cnt     = count($projItems);
            $avgSpi  = $cnt > 0 ? round($sumSpi / $cnt, 3) : null;
            $avgVar  = $cnt > 0 ? round($sumVar / $cnt, 2) : null;
            $avgAct  = $cnt > 0 ? round($sumAct / $cnt, 1) : null;
            $rankVal = $cnt > 0 ? (($avgSpi * 100.0) + ($avgVar * 1.5)) : -999999.0;

            $companyRows[] = [
                'company'       => $comp->name,
                'project_count' => $cnt,
                'avg_spi'       => $avgSpi,
                'avg_var'       => $avgVar,
                'avg_actual'    => $avgAct,
                'delayed_count' => $delayedCount,
                'projects'      => $projItems,
                'score'         => $rankVal,
            ];
        }

        usort($companyRows, fn($a, $b) => $b['score'] <=> $a['score']);

        $activeRows = array_values(array_filter($companyRows, fn($r) => $r['project_count'] > 0));
        $bestComp   = $activeRows[0] ?? null;
        $worstComp  = !empty($activeRows) ? end($activeRows) : null;

        $sections = [];
        foreach ($companyRows as $idx => $cr) {
            $num = $idx + 1;
            if ($cr['project_count'] === 0) {
                $sections[] = "{$num}. **{$cr['company']}** — *(Belum ada proyek)*";
                continue;
            }

            $varSign = $cr['avg_var'] > 0 ? '+' : '';
            $healthTag = $cr['delayed_count'] === 0
                ? ($lang === 'en' ? '`On Track`' : '`On Track`')
                : ($lang === 'en' ? "`{$cr['delayed_count']} delayed`" : "`{$cr['delayed_count']} tertinggal`");

            $pBullets = [];
            foreach ($cr['projects'] as $pr) {
                $pSign = $pr['variance'] > 0 ? '+' : '';
                $pStat = $pr['is_delayed'] ? "`+{$pr['delay_days']}h`" : '`On Track`';
                $pBullets[] = "   - **{$pr['title']}** (`#{$pr['id']}`) · SPI `{$pr['spi']}` · `{$pSign}{$pr['variance']}%` · {$pStat}";
            }

            $sections[] = "{$num}. **{$cr['company']}** ({$cr['project_count']} proyek · {$healthTag})\n"
                . "   • Rata SPI `{$cr['avg_spi']}` · Rata Deviasi `{$varSign}{$cr['avg_var']}%` · Aktual **{$cr['avg_actual']}%**\n"
                . implode("\n", $pBullets);
        }

        if ($lang === 'en') {
            $header = "### 🏢 Cross-Company S-Curve Comparison\n\n";
            if ($bestComp && $worstComp && count($activeRows) > 1) {
                $header .= "🏆 **Strongest**: **{$bestComp['company']}** (`SPI {$bestComp['avg_spi']}`, `{$bestComp['avg_var']}%`)\n"
                    . "📉 **Needs Attention**: **{$worstComp['company']}** (`SPI {$worstComp['avg_spi']}`, `{$worstComp['avg_var']}%`)\n\n";
            }
        } else {
            $header = "### 🏢 Perbandingan S-Curve Masing-Masing Perusahaan\n\n";
            if ($bestComp && $worstComp && count($activeRows) > 1) {
                $bSign = $bestComp['avg_var'] > 0 ? '+' : '';
                $wSign = $worstComp['avg_var'] > 0 ? '+' : '';
                $header .= "🏆 **Perusahaan dengan S-Curve Terbaik**: **{$bestComp['company']}** (`SPI {$bestComp['avg_spi']}`, `{$bSign}{$bestComp['avg_var']}%`)\n"
                    . "📉 **Perusahaan yang Paling Perlu Perhatian**: **{$worstComp['company']}** (`SPI {$worstComp['avg_spi']}`, `{$wSign}{$worstComp['avg_var']}%`)\n\n";
            }
        }

        return [
            'content'      => $header . implode("\n\n", $sections),
            'actions'      => [['type' => 'link', 'label' => $lang === 'en' ? 'Open S-Curve Report' : 'Buka S-Curve Report', 'url' => '/scurve']],
            'should_learn' => true,
        ];
    }

    /**
     * Rank accessible projects by live Budget realization from BudgetEntry.
     */
    protected function execBudgetRankedProjects(array $accessibleIds, string $direction, string $lang): array
    {
        $projects = Project::whereIn('id', $accessibleIds)->with('company')->get();
        if ($projects->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No accessible projects found.' : 'Belum ada projek yang dapat diakses.', 'actions' => [], 'should_learn' => true];
        }

        $spentByProj = BudgetEntry::whereIn('projects_id', $accessibleIds)
            ->selectRaw('projects_id, SUM(harga_total) as total_spent, COUNT(*) as entry_count')
            ->groupBy('projects_id')
            ->get()
            ->keyBy('projects_id');

        $rows = [];
        foreach ($projects as $p) {
            $spent = (float) ($spentByProj[$p->id]->total_spent ?? 0);
            $cnt   = (int) ($spentByProj[$p->id]->entry_count ?? 0);
            $rows[] = [
                'id'      => $p->id,
                'title'   => $p->title,
                'company' => $p->company?->name ?? '—',
                'spent'   => $spent,
                'entries' => $cnt,
            ];
        }

        usort($rows, fn($a, $b) => $direction === 'asc' ? ($a['spent'] <=> $b['spent']) : ($b['spent'] <=> $a['spent']));

        $lines = array_map(function ($r, $i) {
            $rp = 'Rp ' . number_format((float) $r['spent'], 0, ',', '.');
            return ($i + 1) . ". **{$r['title']}** (`#{$r['id']}` — {$r['company']}) — Total Pengeluaran: **{$rp}** ({$r['entries']} item)";
        }, $rows, array_keys($rows));

        $title = $direction === 'asc'
            ? ($lang === 'en' ? '### 💰 Project Budget Comparison (Lowest to Highest)' : '### 💰 Perbandingan Realisasi Budget Projek (Terkecil → Terbesar)')
            : ($lang === 'en' ? '### 💰 Project Budget Comparison (Highest to Lowest)' : '### 💰 Perbandingan Realisasi Budget Projek (Terbesar → Terkecil)');

        return [
            'content'      => "{$title}\n\n" . implode("\n", $lines),
            'actions'      => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Budget' : 'Buka Budget Management', 'url' => '/budget']],
            'should_learn' => true,
        ];
    }

    /**
     * Group accessible project budget realization by Company.
     */
    protected function execBudgetPerCompany(User $user, array $accessibleIds, string $lang): array
    {
        $cQuery = Company::query();
        if (!$this->isSuperAdmin($user) && $user->getDataScope() !== 'all') {
            $cQuery->whereIn('id', $user->getCompanyIds());
        }
        $companies = $cQuery->with(['projects' => fn($q) => $q->whereIn('id', $accessibleIds)])->get();

        if ($companies->isEmpty()) {
            return ['content' => $lang === 'en' ? 'No companies found.' : 'Belum ada data perusahaan.', 'actions' => [], 'should_learn' => true];
        }

        $spentByProj = BudgetEntry::whereIn('projects_id', $accessibleIds)
            ->selectRaw('projects_id, SUM(harga_total) as total_spent, COUNT(*) as entry_count')
            ->groupBy('projects_id')
            ->get()
            ->keyBy('projects_id');

        $rows = [];
        foreach ($companies as $comp) {
            $total   = 0.0;
            $entries = 0;
            $pLines  = [];
            foreach ($comp->projects as $p) {
                $s       = (float) ($spentByProj[$p->id]->total_spent ?? 0);
                $c       = (int) ($spentByProj[$p->id]->entry_count ?? 0);
                $total  += $s;
                $entries += $c;
                $pLines[] = "     - **{$p->title}** (`#{$p->id}`): Rp " . number_format($s, 0, ',', '.') . " ({$c} item)";
            }
            $rows[] = [
                'company'  => $comp->name,
                'total'    => $total,
                'entries'  => $entries,
                'projects' => $comp->projects->count(),
                'p_lines'  => $pLines,
            ];
        }

        usort($rows, fn($a, $b) => $b['total'] <=> $a['total']);

        $sections = [];
        foreach ($rows as $idx => $r) {
            $rp = 'Rp ' . number_format($r['total'], 0, ',', '.');
            $sections[] = ($idx + 1) . ". **{$r['company']}** — Total Realisasi Budget: **{$rp}** ({$r['projects']} proyek · {$r['entries']} item)\n"
                . (!empty($r['p_lines']) ? implode("\n", $r['p_lines']) : '     - *(Belum ada proyek / entri budget)*');
        }

        $title = $lang === 'en' ? '### 🏢 Cross-Company Budget Comparison' : '### 🏢 Perbandingan Budget Masing-Masing Perusahaan';

        return [
            'content'      => "{$title}\n\n" . implode("\n\n", $sections),
            'actions'      => [['type' => 'link', 'label' => $lang === 'en' ? 'Open Budget' : 'Buka Budget Management', 'url' => '/budget']],
            'should_learn' => true,
        ];
    }

    /**
     * Universal Cross-Table Deep Search & Synthesis (9 Local MySQL Tables + Knowledge Base!).
     */
    protected function execCrossTableDeepSearch(
        string $prompt,
        array $keywords,
        User $user,
        array $accessibleIds,
        ?int $activeProjectId,
        string $lang
    ): array {
        $findings = [];
        $actions  = [];

        // 0. Full-sentence relevance guard (never get fooled by 1-2 scattered keywords in an off-topic sentence!)
        if ($this->hasIrrelevantOrNoisyMix($prompt)) {
            return [
                'content' => $lang === 'en'
                    ? 'Sorry, I cannot answer that question because the topic you are asking about is outside the scope of the PROVIS system.'
                    : 'Maaf, saya tidak bisa menjawab pertanyaan Anda karena konteks yang Anda tanyakan itu diluar scope sistem.',
                'actions'      => [],
                'should_learn' => false,
            ];
        }

        // 1. Relaxed Knowledge Base match (threshold lowered to 2.0 during deep learning!)
        $kbHits = $this->knowledgeBase->searchMultiple($prompt, $lang, $activeProjectId, 2);
        if (!empty($kbHits)) {
            $combined = implode("\n\n---\n\n", array_map(fn($h) => $h['content'], $kbHits));
            return [
                'content'      => $combined,
                'actions'      => $kbHits[0]['actions'] ?? [],
                'should_learn' => true,
            ];
        }

        // 2. Deep Multi-Table Keyword Mining (strictly RBAC scoped!)
        $rawTerms = array_values(array_filter(
            preg_split('/[^a-z0-9]+/i', mb_strtolower($prompt)) ?: [],
            fn($w) => strlen($w) >= 3 && !in_array($w, ['apa', 'yang', 'ada', 'bisa', 'mana', 'saja', 'aja', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'provis', 'sistem', 'berapa', 'tolong', 'cek', 'lihat', 'the', 'and', 'for', 'with', 'what', 'how', 'show'], true)
        ));
        $searchTerms = array_slice(array_values(array_unique(array_merge($rawTerms, $keywords))), 0, 5);

        if (!empty($searchTerms)) {
            // Search Projects
            $projHits = Project::whereIn('id', $accessibleIds)
                ->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(title) LIKE ?', ["%{$term}%"])
                          ->orWhereRaw('LOWER(status) LIKE ?', ["%{$term}%"]);
                    }
                })
                ->with('company')
                ->take(5)
                ->get();

            if ($projHits->isNotEmpty()) {
                $findings[] = '**📁 Projek Terkait:**' . "\n" . $projHits->map(fn($p) => "- **{$p->title}** (`#{$p->id}`, " . ($p->company?->name ?? '—') . ") — **" . round((float) $p->progress, 1) . "%** (`{$p->status}`)")->implode("\n");
            }

            // Search Tasks (Wbs)
            $taskHits = Wbs::whereHas('subWbs.mainWbs', fn($q) => $q->whereIn('projects_id', $accessibleIds))
                ->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$term}%"])
                          ->orWhereRaw('LOWER(vendor) LIKE ?', ["%{$term}%"])
                          ->orWhereRaw('LOWER(status) LIKE ?', ["%{$term}%"]);
                    }
                })
                ->with(['subWbs.mainWbs.project', 'division'])
                ->take(6)
                ->get();

            if ($taskHits->isNotEmpty()) {
                $findings[] = '**✅ Task WBS Terkait:**' . "\n" . $taskHits->map(fn($t) => "- **{$t->name}** (*" . ($t->subWbs?->mainWbs?->project?->title ?? '—') . "*) — **" . round((float) $t->progress, 1) . "%** (`{$t->status}` · Divisi: " . ($t->division?->divisi ?? 'General') . ')')->implode("\n");
            }

            // Search Users (RBAC scoped)
            if ($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic()) {
                $uQuery = User::with(['role', 'division', 'company']);
                if (!$this->isSuperAdmin($user)) {
                    $cIds = $user->getCompanyIds();
                    $uQuery->whereIn('companies_id', $cIds);
                }
                $uHits = $uQuery->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(username) LIKE ?', ["%{$term}%"])
                          ->orWhereRaw('LOWER(email) LIKE ?', ["%{$term}%"]);
                    }
                })->take(5)->get();

                if ($uHits->isNotEmpty()) {
                    $findings[] = '**👥 Akun / User Terkait:**' . "\n" . $uHits->map(fn($u) => "- **{$u->username}** (`{$u->email}`) — Role: `" . ($u->role?->name ?? 'worker') . "` · Divisi: " . ($u->division?->divisi ?? 'General'))->implode("\n");
                }
            }

            // Search Budget Entries (strictly RBAC scoped: block admin_progres & worker without Budget sidebar!)
            if (!$user->isAdminProgres() && ($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic() || $user->hasSidebarAccess('Budget Management'))) {
                $bHits = BudgetEntry::whereIn('projects_id', $accessibleIds)
                    ->where(function ($q) use ($searchTerms) {
                        foreach ($searchTerms as $term) {
                            $q->orWhereRaw('LOWER(nama_item) LIKE ?', ["%{$term}%"])
                              ->orWhereRaw('LOWER(kategori) LIKE ?', ["%{$term}%"])
                              ->orWhereRaw('LOWER(referensi) LIKE ?', ["%{$term}%"]);
                        }
                    })
                    ->with('project')
                    ->take(5)
                    ->get();

                if ($bHits->isNotEmpty()) {
                    $findings[] = '**💰 Item Budget Terkait:**' . "\n" . $bHits->map(fn($b) => "- **{$b->nama_item}** (*" . ($b->project?->title ?? '—') . "*) — **Rp " . number_format((float) $b->harga_total, 0, ',', '.') . "** (`{$b->kategori}`)")->implode("\n");
                }
            }

            // Search MainWbs & SubWbs (strictly within accessible projects)
            $mainHits = MainWbs::whereIn('projects_id', $accessibleIds)
                ->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$term}%"]);
                    }
                })
                ->with('project')
                ->take(4)
                ->get();

            if ($mainHits->isNotEmpty()) {
                $findings[] = '**📌 Main Job (WBS) Terkait:**' . "\n" . $mainHits->map(fn($m) => "- **{$m->name}** (*" . ($m->project?->title ?? '—') . "*) — **" . round((float) $m->progress, 1) . "%** (`{$m->status}`)")->implode("\n");
            }

            $subHits = SubWbs::whereHas('mainWbs', fn($q) => $q->whereIn('projects_id', $accessibleIds))
                ->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$term}%"]);
                    }
                })
                ->with('mainWbs.project')
                ->take(4)
                ->get();

            if ($subHits->isNotEmpty()) {
                $findings[] = '**📂 Sub Task (WBS) Terkait:**' . "\n" . $subHits->map(fn($s) => "- **{$s->name}** (*" . ($s->mainWbs?->project?->title ?? '—') . "*) — **" . round((float) $s->progress, 1) . "%** (`{$s->status}`)")->implode("\n");
            }

            // Search Companies (SuperAdmin / admin_utama / PIC only — NEVER for Worker / admin_progres!)
            if ($this->isSuperAdmin($user) || $user->isAdminUtama() || $user->isPic()) {
                $cQuery = Company::query();
                if (!$this->isSuperAdmin($user)) {
                    $cIds = $user->getCompanyIds();
                    $cQuery->whereIn('id', !empty($cIds) ? $cIds : [-1]);
                }
                $compHits = $cQuery->where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$term}%"]);
                    }
                })->withCount('projects')->take(4)->get();

                if ($compHits->isNotEmpty()) {
                    $findings[] = '**🏢 Perusahaan Terkait:**' . "\n" . $compHits->map(fn($c) => "- **{$c->name}**" . ($this->isSuperAdmin($user) ? " ({$c->projects_count} projek)" : ''))->implode("\n");
                }
            }

            // Search Divisions (SuperAdmin / Management only — NEVER expose global division directory to Worker!)
            if (!$user->isWorker()) {
                $divHits = Division::where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(divisi) LIKE ?', ["%{$term}%"]);
                    }
                })->take(4)->get();

                if ($divHits->isNotEmpty()) {
                    $findings[] = '**🗂️ Divisi Terkait:**' . "\n" . $divHits->map(fn($d) => "- **{$d->divisi}**")->implode("\n");
                }
            }

            // Search Templates (SuperAdmin / PIC only!)
            if ($this->isSuperAdmin($user) || $user->isPic()) {
                $tplHits = ProjectTemplate::where(function ($q) use ($searchTerms) {
                    foreach ($searchTerms as $term) {
                        $q->orWhereRaw('LOWER(name) LIKE ?', ["%{$term}%"])
                          ->orWhereRaw('LOWER(description) LIKE ?', ["%{$term}%"]);
                    }
                })->take(3)->get();

                if ($tplHits->isNotEmpty()) {
                    $findings[] = '**📐 Template WBS Terkait:**' . "\n" . $tplHits->map(fn($tpl) => "- **{$tpl->name}**" . ($tpl->is_default ? ' *(Default)*' : ''))->implode("\n");
                }
            }
        }

        if (!empty($findings)) {
            $header = $lang === 'en'
                ? "🧠 **Deep Local Analysis Result**\n\nI scanned the PROVIS local database for your question and found these matching live records:\n\n"
                : "🧠 **Hasil Analisis Mendalam Lokal PROVIS**\n\nSaya sudah mempelajari pertanyaanmu dan menelusuri seluruh tabel database lokal PROVIS — berikut data terkait yang ditemukan:\n\n";

            return [
                'content'      => $header . implode("\n\n", $findings),
                'actions'      => $actions,
                'should_learn' => true,
            ];
        }

        // 3. Final Intelligent Snapshot: analyze whole-sentence relevance after deep local scan!
        $projCount = count($accessibleIds);
        $userCount = $this->isSuperAdmin($user) ? User::count() : null;
        $compCount = $this->isSuperAdmin($user) ? Company::count() : null;

        // Check whether ANY word in the prompt actually relates to PROVIS core domain
        $hasAnyProvisConcept = !empty(array_intersect($keywords, [
            'proyek', 'task', 'user', 'company', 'division', 'budget', 'scurve', 'overdue',
            'weight', 'duration', 'evidence', 'deadline', 'completed', 'vendor', 'pic',
            'worker', 'admin', 'progress', 'audit', 'template', 'private', 'compare',
        ]));

        if (!$hasAnyProvisConcept) {
            return [
                'content' => $lang === 'en'
                    ? 'Sorry, I cannot answer that question because the topic you are asking about is outside the scope of the PROVIS system.'
                    : 'Maaf, saya tidak bisa menjawab pertanyaan Anda karena konteks yang Anda tanyakan itu diluar scope sistem.',
                'actions'      => [],
                'should_learn' => false,
            ];
        }

        if ($lang === 'en') {
            $content = "🧠 I analyzed every word in *\"{$prompt}\"* across all local PROVIS tables, and there are no exact matching records yet"
                . ($this->isSuperAdmin($user) ? " across your **{$projCount} projects**, **{$compCount} companies**, and **{$userCount} accounts**" : " across your **{$projCount} accessible projects**")
                . ".\n\nCould you clarify a bit more specifically which PROVIS data or action you want? For example: **S-Curve per project/company**, **project progress/deadlines**, **division workload**, **budget realization**, or **accounts & access**?";
        } else {
            $content = "🧠 Saya sudah menganalisis seluruh kata pada pertanyaan *\"{$prompt}\"* di database lokal PROVIS, namun belum menemukan kombinasi data yang cocok secara langsung"
                . ($this->isSuperAdmin($user) ? " di antara **{$projCount} projek**, **{$compCount} perusahaan**, dan **{$userCount} akun**" : " di **{$projCount} projek** yang bisa kamu akses")
                . ".\n\nBoleh perjelas sedikit bagian mana di PROVIS yang ingin dianalisis? Misalnya: **S-Curve antar projek/perusahaan**, **progres/deadline projek**, **beban divisi**, **realisasi budget**, atau **akun & akses user**?";
        }

        return [
            'content'      => $content,
            'actions'      => [],
            'should_learn' => false, // Don't pollute learned memory with unmatched/clarification prompts
        ];
    }

    // =========================================================================
    // RBAC HELPER (Mirrors ProvisAiService Multi-Tenant Security Strictly)
    // =========================================================================

    protected function isSuperAdmin(User $user): bool
    {
        return strtolower($user->role?->name ?? '') === 'superadmin';
    }

    /**
     * @return array<int>
     */
    protected function getAccessibleProjectIds(User $user): array
    {
        $role  = $user->role?->name ?? '';
        $query = Project::query();

        if ($this->isSuperAdmin($user)) {
            return $query->pluck('id')->map(fn($id) => (int) $id)->all();
        }

        $companyIds = $user->getCompanyIds();

        if ($role === 'worker') {
            $allowedIds = $user->getAllowedProjectIds();
            $query->where(function (Builder $q) use ($user, $companyIds, $allowedIds) {
                $q->where('project_manager', $user->id);
                if (!empty($companyIds) && !empty($allowedIds)) {
                    $q->orWhere(fn($sub) => $sub->whereIn('companies_id', $companyIds)->whereIn('id', $allowedIds));
                }
            });
        } elseif ($role === 'pic') {
            $query->where(function (Builder $q) use ($user, $companyIds) {
                $q->where('project_manager', $user->id)
                  ->orWhereHas('projectMembers', fn($pm) => $pm->where('user_id', $user->id));
                if (!empty($companyIds)) {
                    $q->orWhere(fn($sub) => $sub->whereIn('companies_id', $companyIds)->where('is_private', false));
                }
            });
        } else {
            $query->where(function (Builder $q) use ($user, $companyIds) {
                $q->where('project_manager', $user->id)
                  ->orWhereHas('projectMembers', fn($pm) => $pm->where('user_id', $user->id));
                if ($user->getDataScope() === 'all' || empty($companyIds)) {
                    $q->orWhere('is_private', false);
                } else {
                    $q->orWhere(fn($sub) => $sub->whereIn('companies_id', $companyIds)->where('is_private', false));
                }
            });
        }

        return $query->pluck('id')->map(fn($id) => (int) $id)->all();
    }
}
