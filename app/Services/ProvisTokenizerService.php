<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Division;
use App\Models\MainWbs;
use App\Models\Project;
use App\Models\SubWbs;
use App\Models\User;
use App\Models\Wbs;
use Carbon\Carbon;
use Illuminate\Support\Str;

class ProvisTokenizerService
{
    /**
     * Tokenize and extract structured domain entities, language, and intent from user prompt.
     *
     * @param string     $prompt
     * @param int|null   $projectId
     * @param array<int> $accessibleProjectIds Optional list of project IDs the user is allowed to see
     * @param array      $sessionContext       Optional multi-turn context from previous turns
     */
    public function tokenize(
        string $prompt,
        ?int $projectId = null,
        array $accessibleProjectIds = [],
        array $sessionContext = []
    ): array {
        $rawPrompt        = trim($prompt);
        $typoInfo         = $this->correctCommandTypos($rawPrompt);
        $normalizedPrompt = $typoInfo['corrected'];
        $fallbackLang     = $sessionContext['language'] ?? 'id';
        $language         = $this->detectLanguage($normalizedPrompt, $fallbackLang);
        $confirmation     = $this->detectConfirmation($rawPrompt) ?? $this->detectConfirmation($normalizedPrompt);
        $followUp         = $this->extractFollowUpReference($normalizedPrompt);
        $dates            = $this->extractDates($normalizedPrompt);
        $predSyntax       = $this->extractPredecessorSyntax($normalizedPrompt);
        $statuses         = $this->extractStatuses($normalizedPrompt);
        $percentages      = $this->extractPercentages($normalizedPrompt);
        $matchedProjects  = $this->matchProjects($normalizedPrompt, $accessibleProjectIds);
        $matchedDivisions = $this->matchDivisions($normalizedPrompt);
        $matchedCompanies = $this->matchCompanies($normalizedPrompt);
        $requestedCompanyName = null;
        $requestedUserName    = null;
        $heavyTypoCandidates  = [];

        // Generic variable extraction for "jumlah karyawan di (nama pt)", "daftar projek di (nama pt)", etc.
        // Works dynamically for ANY PT in the database (zero hardcoding!) and detects heavy/ambiguous PT typos!
        if (empty($matchedCompanies)) {
            $extractedComp = $this->extractRequestedCompanyName($normalizedPrompt);
            if ($extractedComp !== null) {
                $secondPass = $this->matchCompanies($extractedComp, true);
                if (!empty($secondPass)) {
                    $matchedCompanies = $secondPass;
                } elseif (empty($matchedProjects) && empty($matchedDivisions)) {
                    $heavyCompMatches = $this->findHeavyTypoCompanies($extractedComp);
                    if (!empty($heavyCompMatches)) {
                        $heavyTypoCandidates = [
                            'entity_type' => 'company',
                            'raw_term'    => $extractedComp,
                            'candidates'  => $heavyCompMatches,
                        ];
                    } else {
                        $requestedCompanyName = $extractedComp;
                    }
                }
            }
        }

        // Generic variable extraction for specific account/worker/user profile queries (e.g. "cek akun (nama)", "profil worker (nama)")
        if (empty($matchedCompanies) && empty($matchedProjects) && empty($heavyTypoCandidates)) {
            $extractedUser = $this->extractRequestedUserName($normalizedPrompt);
            if ($extractedUser !== null) {
                $requestedUserName = $extractedUser;
            }
        }

        // Collect mild typo corrections (both command words and fuzzy-matched DB entities)
        $mildTypoFixes = $typoInfo['word_corrections'];
        if (!empty($matchedCompanies[0]['had_typo'])) {
            $mildTypoFixes[] = [
                'from' => $matchedCompanies[0]['matched_from'] ?? '',
                'to'   => $matchedCompanies[0]['name'],
                'kind' => 'company',
            ];
        }
        if (!empty($matchedProjects[0]['had_typo'])) {
            $mildTypoFixes[] = [
                'from' => $matchedProjects[0]['matched_from'] ?? '',
                'to'   => $matchedProjects[0]['title'],
                'kind' => 'project',
            ];
        }
        if (!empty($matchedDivisions[0]['had_typo'])) {
            $mildTypoFixes[] = [
                'from' => $matchedDivisions[0]['matched_from'] ?? '',
                'to'   => $matchedDivisions[0]['name'],
                'kind' => 'division',
            ];
        }

        // Determine effective project ID for task/sub-WBS matching
        $effectiveProjectId = $matchedProjects[0]['id']
            ?? $this->extractProjectIdFromPrompt($normalizedPrompt)
            ?? $projectId
            ?? ($sessionContext['project_id'] ?? null);

        // Ensure effectiveProjectId is accessible if access list was provided
        if ($effectiveProjectId && !empty($accessibleProjectIds) && !in_array((int) $effectiveProjectId, $accessibleProjectIds, true)) {
            $effectiveProjectId = $projectId && in_array((int) $projectId, $accessibleProjectIds, true)
                ? $projectId
                : null;
        }

        $matchedTasks      = $effectiveProjectId ? $this->matchTasksInProject($normalizedPrompt, (int) $effectiveProjectId) : [];
        $matchedSubWbs     = $effectiveProjectId ? $this->matchSubWbsInProject($normalizedPrompt, (int) $effectiveProjectId) : [];
        $concepts          = $this->extractSemanticConcepts($normalizedPrompt);
        $sentenceStructure = $this->analyzeSentenceStructure($normalizedPrompt, array_merge([
            'matched_projects'  => $matchedProjects,
            'matched_tasks'     => $matchedTasks,
            'matched_divisions' => $matchedDivisions,
            'matched_companies' => $matchedCompanies,
            'statuses'          => $statuses,
            'percentages'       => $percentages,
            'dates'             => $dates,
            'concepts'          => $concepts,
        ]));

        $entities = [
            'language'               => $language,
            'confirmation'           => $confirmation,
            'follow_up'              => $followUp,
            'dates'                  => $dates,
            'predecessor_syntax'     => $predSyntax,
            'statuses'               => $statuses,
            'percentages'            => $percentages,
            'matched_projects'       => $matchedProjects,
            'matched_tasks'          => $matchedTasks,
            'matched_sub_wbs'        => $matchedSubWbs,
            'matched_divisions'      => $matchedDivisions,
            'matched_companies'      => $matchedCompanies,
            'requested_company_name' => $requestedCompanyName,
            'requested_user_name'    => $requestedUserName,
            'typo_corrections'       => $mildTypoFixes,
            'ambiguous_word_typos'   => $typoInfo['ambiguous_words'],
            'heavy_typo_candidates'  => $heavyTypoCandidates,
            'effective_project_id'   => $effectiveProjectId,
            'concepts'               => $concepts,
            'sentence_structure'     => $sentenceStructure,
        ];

        $actionIntent = $this->detectActionIntent($normalizedPrompt, $entities, $sessionContext);

        return array_merge([
            'raw_prompt'       => $rawPrompt,
            'original_prompt'  => $normalizedPrompt,
            'estimated_tokens' => $this->estimateTokens($normalizedPrompt),
            'action_intent'    => $actionIntent,
            'is_high_risk'     => $this->isHighRiskAction($normalizedPrompt),
            'is_how_to'        => $this->isHowToOrConceptualQuestion($normalizedPrompt),
        ], $entities);
    }

    /**
     * 100% Local Command & Domain Spell-Corrector:
     * - Mild typos (e.g. "karyawn" -> "karyawan", "workr" -> "worker", "perusahan" -> "perusahaan") are
     *   auto-corrected seamlessly so the user does NOT have to retype, and logged for friendly acknowledgment.
     * - Heavy/ambiguous typos are flagged separately so the AI asks to confirm instead of guessing wrong!
     * - Never touches quoted literals ("...") or words that already match real DB entity names!
     *
     * @return array{corrected: string, word_corrections: array, ambiguous_words: array}
     */
    public function correctCommandTypos(string $text): array
    {
        $trimmed = trim($text);
        if ($trimmed === '' || mb_strlen($trimmed) <= 2) {
            return ['corrected' => $trimmed, 'word_corrections' => [], 'ambiguous_words' => []];
        }

        // Preserve any quoted literals ("...", '...') untouched so user-provided project/company/task names stay verbatim
        $placeholders = [];
        $masked = preg_replace_callback('/(["\'])(.+?)\1/u', function ($m) use (&$placeholders) {
            $key = '__Q' . count($placeholders) . '__';
            $placeholders[$key] = $m[0];
            return $key;
        }, $trimmed) ?? $trimmed;

        // Curated high-confidence shorthand / common Indonesian-English typo map
        $shorthandMap = [
            'karyawn'   => 'karyawan', 'kryawan'  => 'karyawan', 'karywan'  => 'karyawan', 'krywn'    => 'karyawan',
            'workr'     => 'worker',   'wrkr'     => 'worker',   'workerr'  => 'worker',   'woker'    => 'worker',
            'akunn'     => 'akun',     'akn'      => 'akun',     'jmlh'     => 'jumlah',   'jumlh'    => 'jumlah',
            'perusahan' => 'perusahaan', 'prshn'  => 'perusahaan', 'perusahann' => 'perusahaan',
            'projeck'   => 'projek',   'prjk'     => 'projek',   'pryk'     => 'proyek',   'proyk'    => 'proyek',
            'prgrs'     => 'progres',  'progrs'   => 'progres',  'progess'  => 'progress', 'proggres' => 'progres',
            'bujet'     => 'budget',   'bdgt'     => 'budget',   'angaran'  => 'anggaran',
            'divisii'   => 'divisi',   'dvsi'     => 'divisi',   'devisi'   => 'divisi',
            'tampilkn'  => 'tampilkan', 'tampilin' => 'tampilkan', 'ringkasn' => 'ringkasan',
            'outstandng'=> 'outstanding', 'outstnding' => 'outstanding', 'predecesor' => 'predecessor',
            'terlmbt'   => 'terlambat', 'terlambt' => 'terlambat', 'durasii' => 'durasi', 'durasy' => 'durasi',
            'dedline'   => 'deadline', 'deadlin'  => 'deadline', 'scurv'    => 'scurve',
            'evidenc'   => 'evidence', 'templat'  => 'template', 'rekonsilasi' => 'rekonsiliasi',
        ];

        // Core PROVIS domain vocabulary for automatic Levenshtein distance-1 mild typo correction
        $dictionary = [
            'karyawan', 'pegawai', 'pengguna', 'personel', 'worker', 'workers', 'pekerja', 'superadmin',
            'administrator', 'anggota', 'member', 'manager', 'profil', 'profile', 'perusahaan', 'company',
            'companies', 'proyek', 'projek', 'project', 'projects', 'divisi', 'division', 'divisions',
            'departemen', 'pekerjaan', 'kerjaan', 'subtask', 'outstanding', 'overdue', 'delayed', 'completed',
            'progress', 'progres', 'predecessor', 'dependensi', 'dependency', 'durasi', 'duration', 'jadwal',
            'schedule', 'tanggal', 'deadline', 'tenggat', 'evidence', 'template', 'struktur', 'hierarki',
            'bobot', 'weight', 'vendor', 'jumlah', 'berapa', 'daftar', 'tampilkan', 'tunjukkan', 'ringkasan',
            'summary', 'analisis', 'analisa', 'statistik', 'status', 'budget', 'anggaran', 'pengeluaran',
            'realisasi', 'scurve', 'prediksi', 'forecast', 'laporan', 'rekap', 'rekonsiliasi', 'terlambat',
            'terkunci', 'tertinggi', 'terendah', 'terbanyak', 'tersedikit', 'terdekat', 'terbesar', 'terlama',
            'private', 'public', 'visibilitas', 'buatkan', 'tambahkan', 'perbarui', 'update', 'hubungkan',
            'riwayat', 'aktivitas',
        ];
        $dictLookup = array_flip($dictionary);

        // Protect all tokens that already exist in live DB entity names (companies, projects, divisions, users)
        $dbSafeTokens = $this->collectLiveEntityTokens();

        // Protect common Indonesian & English everyday words so we never falsely mutate normal prose
        $commonWords = array_flip([
            'apakah', 'boleh', 'tidak', 'belum', 'sudah', 'sangat', 'paling', 'semua', 'seluruh', 'hanya',
            'untuk', 'dengan', 'dalam', 'adalah', 'sebagai', 'karena', 'bahwa', 'tetapi', 'namun', 'atau',
            'ketika', 'sebelum', 'sesudah', 'setelah', 'sampai', 'hingga', 'antara', 'sekitar', 'menjadi',
            'membuat', 'melihat', 'mengubah', 'mencari', 'menampilkan', 'mengetahui', 'memberikan', 'sebutkan',
            'jelaskan', 'tolong', 'mohon', 'silakan', 'terima', 'kasih', 'makasih', 'selamat', 'malam', 'siang',
            'pagi', 'sore', 'kabar', 'sekarang', 'kemarin', 'besok', 'minggu', 'bulan', 'tahun', 'orang', 'barang',
            'rumah', 'pribadi', 'kantor', 'waktu', 'cepat', 'lambat', 'besar', 'kecil', 'tinggi', 'rendah',
            'baik', 'buruk', 'bagus', 'jelek', 'dekat', 'jauh', 'lama', 'baru', 'kosong', 'wajib', 'butuh', 'perlu',
            'bisa', 'dapat', 'ingin', 'punya', 'milik', 'nama', 'siapa', 'kapan', 'dimana', 'kenapa', 'mengapa',
            'gimana', 'bagaimana', 'seperti', 'disini', 'disana', 'sini', 'situ', 'tadi', 'nanti', 'lagi',
            'masih', 'sedang', 'akan', 'pernah', 'saja', 'terus', 'malah', 'cuma', 'cuman', 'doang', 'banget',
            'menyapa', 'nyapa', 'balik', 'salah', 'benar', 'betul', 'batal', 'lanjut', 'provis', 'sistem', 'system',
            'please', 'thanks', 'hello', 'about', 'there', 'their', 'which', 'where', 'should', 'could', 'would',
            'project', 'projects', 'today', 'tomorrow', 'yesterday', 'create', 'change', 'delete', 'check', 'show',
            'count', 'total', 'active', 'pending', 'finish', 'start', 'working', 'access', 'email', 'password',
            'bawah', 'atas', 'depan', 'belakang', 'pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'nomor',
            'terdaftar', 'terkait', 'termasuk', 'diselesaikan', 'selesai', 'berjalan', 'berlangsung', 'dikerjakan',
            'pegang', 'megang', 'kelola', 'sibuk', 'molor', 'ngaret', 'kepake', 'dipakai', 'dibuat', 'diubah',
            'ditugaskan', 'diakses', 'diberikan', 'dicabut', 'miliar', 'milyar', 'juta', 'ribu', 'persen', 'hitung',
            'bernama', 'namanya', 'membuatkan', 'buatkanku', 'buatin', 'bikinkan', 'bikinin', 'daftarkan', 'registrasi',
            'role', 'peran', 'username', 'katasandi', 'sandi', 'akun', 'super', 'utama', 'progres', 'buat', 'untukku',
            'named', 'account',
        ]);

        $wordCorrections = [];
        $ambiguousWords  = [];

        $correctedMasked = preg_replace_callback('/\b([a-zA-Z]{3,24})\b/u', function ($m) use (
            $shorthandMap, $dictionary, $dictLookup, $dbSafeTokens, $commonWords, &$wordCorrections, &$ambiguousWords
        ) {
            $orig  = $m[1];
            $lower = mb_strtolower($orig);

            // Skip placeholders, exact dictionary words, common prose words, or real DB entity tokens
            if (
                str_starts_with($orig, '__Q')
                || isset($dictLookup[$lower])
                || isset($commonWords[$lower])
                || isset($dbSafeTokens[$lower])
            ) {
                return $orig;
            }

            // 1. High-confidence shorthand / known typo map
            if (isset($shorthandMap[$lower])) {
                $target = $shorthandMap[$lower];
                $wordCorrections[] = ['from' => $orig, 'to' => $target, 'kind' => 'word'];
                return $target;
            }

            $len = strlen($lower);
            if ($len < 5) {
                return $orig;
            }

            // 2. Automatic Levenshtein scan against PROVIS domain dictionary
            $bestWord = null;
            $bestDist = 99;
            $bestSim  = 0.0;
            $closeCandidates = [];

            foreach ($dictionary as $cand) {
                $cLen = strlen($cand);
                if (abs($len - $cLen) > 2) {
                    continue;
                }
                // Same starting letter avoids accidental cross-word mutations
                if ($lower[0] !== $cand[0]) {
                    continue;
                }

                $dist = levenshtein($lower, $cand);
                $maxL = max($len, $cLen);
                $sim  = $maxL > 0 ? (1.0 - ($dist / $maxL)) : 0.0;

                if ($dist < $bestDist || ($dist === $bestDist && $sim > $bestSim)) {
                    $bestDist = $dist;
                    $bestSim  = $sim;
                    $bestWord = $cand;
                }
                if ($dist <= 2 && $sim >= 0.62) {
                    $closeCandidates[] = $cand;
                }
            }

            // Mild, unmistakable typo -> auto-correct seamlessly!
            if ($bestWord !== null && ($bestDist === 1 || ($bestDist === 2 && $len >= 8 && $bestSim >= 0.78))) {
                $wordCorrections[] = ['from' => $orig, 'to' => $bestWord, 'kind' => 'word'];
                return $bestWord;
            }

            // Heavy / ambiguous typo on a domain-like word (dist 2, similarity 0.62–0.77) -> flag for confirmation!
            if ($bestWord !== null && $bestDist === 2 && $len >= 5 && $bestSim >= 0.64) {
                $ambiguousWords[] = [
                    'from'        => $orig,
                    'suggestions' => array_slice(array_values(array_unique($closeCandidates)), 0, 2),
                ];
            }

            return $orig;
        }, $masked) ?? $masked;

        // Restore quoted literals verbatim
        foreach ($placeholders as $key => $literal) {
            $correctedMasked = str_replace($key, $literal, $correctedMasked);
        }

        return [
            'corrected'        => $correctedMasked,
            'word_corrections' => $wordCorrections,
            'ambiguous_words'  => $ambiguousWords,
        ];
    }

    /**
     * Collect exact lowercase tokens from live DB entity names so the command spell-corrector
     * NEVER mutates a real company, project, division, or user name!
     *
     * @return array<string, bool>
     */
    protected function collectLiveEntityTokens(): array
    {
        $set = [];
        try {
            $sources = array_merge(
                Company::pluck('name')->all(),
                Project::pluck('title')->all(),
                Division::pluck('divisi')->all(),
                User::pluck('username')->all()
            );
            foreach ($sources as $s) {
                $parts = preg_split('/[^a-z0-9]+/i', mb_strtolower((string) $s)) ?: [];
                foreach ($parts as $p) {
                    if (strlen($p) >= 3) {
                        $set[$p] = true;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback if tables not migrated yet
        }
        return $set;
    }

    /**
     * Consonant skeleton helper ("karabha" -> "krbh", "sinar" -> "snr") for heavy-typo detection!
     */
    protected function consonantSkeleton(string $word): string
    {
        $clean = preg_replace('/[^a-z]/', '', mb_strtolower($word)) ?? '';
        $skel  = preg_replace('/[aeiou]/', '', $clean) ?? $clean;
        // Collapse repeated consonants ("krrbh" -> "krbh")
        return preg_replace('/(.)\1+/', '$1', $skel) ?? $skel;
    }

    /**
     * Rough token estimator (~3.8 chars per token for English/Indonesian mixed tech text).
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
     * Automatically detect user prompt language ('id' or 'en').
     */
    public function detectLanguage(string $text, ?string $fallbackLang = 'id'): string
    {
        $lower = mb_strtolower(trim($text));

        $idMarkers = [
            'apa', 'bagaimana', 'gimana', 'berapa', 'siapa', 'kenapa', 'mengapa', 'kapan', 'dimana',
            'tolong', 'tampilkan', 'tunjukkan', 'lihat', 'melihat', 'cek', 'buat', 'buatkan', 'buatin',
            'buatkanku', 'membuat', 'membuatkan', 'membuatkanku', 'bikin', 'bikinin', 'tambah',
            'tambahkan', 'ubah', 'mengubah', 'ganti', 'perbarui', 'proyek', 'projek', 'projeck',
            'projekku', 'proyekku', 'pekerjaan', 'terlambat', 'belum', 'sudah', 'sisa', 'yang', 'dari',
            'untuk', 'dengan', 'jadi', 'menjadi', 'ke', 'di', 'halo', 'hai', 'selamat', 'makasih',
            'terima kasih', 'ya', 'iya', 'batal', 'tidak', 'daftar', 'rekap', 'ringkasan', 'laporan',
            'divisi', 'anggaran', 'biaya', 'jadwal', 'tanggal', 'durasi', 'mulai', 'selesai',
            'terkunci', 'cara', 'caranya', 'arti', 'bedanya', 'jelaskan', 'rekonsiliasi', 'sinkron',
            'semua', 'saja', 'aja', 'dong', 'nih', 'sih', 'yah', 'bro', 'tadi', 'pertama', 'kedua',
            'ketiga', 'terpenuhi', 'barang', 'hari ini', 'besok', 'lusa', 'hari', 'minggu', 'bulan',
            'tahun', 'selama', 'hubungkan', 'sambungkan', 'kodingan', 'pengguna', 'riwayat', 'aktivitas',
            'progres', 'pengadaan', 'instalasi', 'sampai', 'hingga', 'ini', 'itu', 'saya', 'aku', 'kamu',
            'anda', 'konfirmasi', 'lanjut', 'bantu', 'mana', 'bisakah', 'bisa', 'mau', 'pengen', 'milik',
            'bernama', 'perusahaan', 'kosong', 'akses', 'kasih', 'berikan', 'cabut', 'manajemen', 'pakai',
            'pake', 'eksekusi', 'silakan', 'silahkan', 'akun', 'jumlah', 'karyawan', 'pegawai', 'orang',
            'pekerja', 'personel', 'duit', 'uang', 'dana', 'kerjaan', 'molor', 'ngaret', 'bagian', 'banyak',
            'terdaftar', 'sistem', 'ada', 'klien', 'sebutkan',
        ];

        // Exclude common tech loanwords frequently used inside Indonesian prompts
        // (e.g. "update", "task", "budget", "project", "status", "report", "list", "set", "start", "finish")
        $enMarkers = [
            'what', 'how', 'why', 'who', 'where', 'when', 'which', 'show', 'display', 'get',
            'please', 'create', 'make', 'add', 'change', 'mark', 'connect', 'link', 'grant', 'revoke',
            'projects', 'tasks', 'remaining', 'left', 'summary', 'overview', 'divisions',
            'expense', 'spending', 'schedule', 'dates', 'duration', 'locked', 'blocked', 'meaning',
            'explain', 'difference', 'guide', 'reconcile', 'all', 'only', 'first', 'second',
            'third', 'today', 'tomorrow', 'yesterday', 'week', 'month', 'hello', 'hi', 'hey',
            'thanks', 'thank you', 'yes', 'confirm', 'proceed', 'cancel', 'no', 'users', 'members',
            'commits', 'compare', 'comparison', 'unfulfilled', 'behind', 'ahead', 'forecast',
            'prediction', 'does', 'are', 'is', 'the', 'for', 'with', 'from', 'into', 'this',
            'that', 'of', 'to', 'as', 'by', 'in', 'my', 'our', 'your', 'about', 'can', 'do', 'want',
        ];

        $idScore = 0;
        $enScore = 0;

        foreach ($idMarkers as $w) {
            if (preg_match('/\b' . preg_quote($w, '/') . '\b/u', $lower)) {
                $idScore += (str_contains($w, ' ') ? 3 : 2);
            }
        }

        foreach ($enMarkers as $w) {
            if (preg_match('/\b' . preg_quote($w, '/') . '\b/u', $lower)) {
                $enScore += (str_contains($w, ' ') ? 3 : 1);
            }
        }

        if ($enScore > $idScore && $enScore >= 1) {
            return 'en';
        }
        if ($idScore > $enScore && $idScore >= 1) {
            return 'id';
        }

        return in_array($fallbackLang, ['id', 'en'], true) ? $fallbackLang : 'id';
    }

    /**
     * Detect short confirmation or cancellation replies for two-step write actions.
     */
    public function detectConfirmation(string $text): ?string
    {
        $clean = mb_strtolower(trim(preg_replace('/[!?.]+$/', '', trim($text)) ?? $text));
        if ($clean === '' || mb_strlen($clean) > 45) {
            return null;
        }

        $confirmExact = [
            'ya', 'iya', 'yap', 'yep', 'yup', 'ok', 'oke', 'okay', 'sip', 'siap', 'gas', 'gaskan',
            'lanjut', 'lanjutkan', 'lanjut aja', 'konfirmasi', 'setuju', 'eksekusi', 'jalankan',
            'benar', 'betul', 'bisa', 'boleh', 'silakan', 'silahkan', 'sesuai', 'cocok',
            'ya lanjut', 'ya konfirmasi', 'ya jalankan', 'ya eksekusi', 'ya bisa', 'ya silakan',
            'ya silahkan', 'iya bisa', 'iya lanjut', 'iya eksekusi', 'oke lanjut', 'oke gas',
            'oke eksekusi', 'oke silakan', 'ok konfirmasi', 'ok gas', 'gas eksekusi',
            'udah bener', 'sudah benar', 'sudah sesuai', 'udah sesuai', 'boleh lanjut', 'bisa banget',
            'yes', 'y', 'confirm', 'confirmed', 'proceed', 'go ahead', 'do it', 'sure', 'approve',
            'yes confirm', 'yes proceed', 'ok proceed', 'yes please', 'looks good', 'execute', 'go',
        ];

        if (in_array($clean, $confirmExact, true)) {
            return 'confirm';
        }

        $cancelExact = [
            'batal', 'batalkan', 'tidak', 'nggak', 'gak', 'ga', 'enggak', 'jangan', 'stop', 'urungkan',
            'tidak jadi', 'gak jadi', 'ga jadi', 'batal aja', 'cancel', 'no', 'n', 'abort',
            'nevermind', 'never mind', 'skip', 'no cancel', 'cancel aja',
        ];

        if (in_array($clean, $cancelExact, true)) {
            return 'cancel';
        }

        return null;
    }

    /**
     * Detect whether the prompt is asking a conceptual/how-to question rather than issuing a DB command.
     */
    public function isHowToOrConceptualQuestion(string $text): bool
    {
        $lower = mb_strtolower(trim($text));

        // Explicit how-to / definitional / conceptual / prompt-template markers
        if (preg_match('/\b(bagaimana\s+(?:cara(?:nya)?|ya\s+cara)|gimana\s+(?:cara(?:nya)?|ya\s+cara)|cara\s+(?:mengatur|atur|membuat|buat|bikin|tambah|menambahkan|ubah|mengubah|ganti|input|catat|upload|unggah|kelola|pakai|menggunakan|kerja|prompt)|caranya\s*(?:ya|gimana|bagaimana)?|contoh\s+prompt|template\s+prompt|format\s+prompt|apa\s+itu|apa\s+arti|apa\s+maksud|apa\s+fungsi|apa\s+beda|bedanya|perbedaan|jelaskan|penjelasan|panduan|tutorial|aturan\s+upload|syarat\s+evidence|how\s+to|how\s+do\s+i|how\s+does|what\s+is\s+(?:the\s+)?(?:meaning|difference|purpose|outstanding|predecessor|wbs|s-curve|scurve|spi)|what\s+does\s+.*\s+mean|explain\s+(?:how|what)|guide\s+(?:to|for))\b/i', $lower)) {
            return true;
        }

        // General "kenapa / why" questions without naming a specific task or project
        if (preg_match('/\b(kenapa|mengapa|why)\b/i', $lower) && preg_match('/\b(terkunci|locked|gembok|tidak\s+bisa\s+dicentang|cannot\s+check|s-curve|scurve|403|access\s+denied)\b/i', $lower)) {
            return true;
        }

        return false;
    }

    /**
     * Detect whether the user is explicitly asking what the AI can do / requesting help & prompt examples.
     * (Distinct from simple casual greetings like "halo bro" or "halo tes bro".)
     */
    public function isCapabilityInquiry(string $text): bool
    {
        $lower = mb_strtolower(trim($text));

        return (bool) preg_match(
            '/\b(ini\s+bisa\s+(?:untuk|buat|dipakai|digunakan)\s+apa|bisa\s+(?:untuk|buat|dipakai|digunakan)\s+apa|kamu\s+bisa\s+(?:bantu\s+)?apa|bisa\s+(?:bantu\s+apa|ngapain\s+aja|ngapain|melakukan\s+apa)|fitur\s+apa\s+(?:saja|aja)|apa\s+(?:saja|aja)\s+(?:fitur|kemampuan|yang\s+bisa)|menu\s+bantuan|help|what\s+can\s+you\s+do|what\s+is\s+this\s+for|capabilities|cara\s+pakai\s+ai|contoh\s+perintah)\b/i',
            $lower
        );
    }

    /**
     * Detect conversational greetings, pings/tests ("halo tes bro"), small talk, time/date, thanks, or identity/no-API queries.
     */
    public function isGreetingOrSmalltalk(string $text): bool
    {
        $lower = mb_strtolower(trim(preg_replace('/[!?.~]+$/', '', trim($text)) ?? $text));
        if ($lower === '') {
            return false;
        }

        // 1. Token-set check: if EVERY token in a short message is a greeting/ping/test/vocative/filler word
        //    (e.g. "oke halo bro", "halo tes bro", "tes 1 2 3 min", "pagi bos", "woi bro apa kabar", "hi there provis")
        $words = array_values(array_filter(preg_split('/[^a-z0-9]+/u', $lower) ?: []));
        $casualSet = [
            'halo', 'haloo', 'halooo', 'hallo', 'hello', 'helo', 'hi', 'hii', 'hiii', 'hey', 'heyy', 'hai', 'haii',
            'pagi', 'siang', 'sore', 'malam', 'selamat', 'good', 'morning', 'afternoon', 'evening', 'night',
            'assalamualaikum', 'waalaikumsalam', 'salam', 'p', 'ping', 'tes', 'test', 'testing', 'coba',
            '1', '2', '3', '123', 'woi', 'woy', 'uy', 'oy', 'permisi', 'punten', 'spada', 'bro', 'broo', 'bray',
            'min', 'minn', 'admin', 'superadmin', 'kak', 'kakak', 'gan', 'bos', 'bosku', 'pak', 'bu', 'bang', 'mas',
            'mba', 'mbak', 'om', 'cuy', 'sob', 'provis', 'ai', 'bot', 'assistant', 'asisten', 'copilot', 'system',
            'sistem', 'ya', 'yah', 'dong', 'nih', 'sih', 'deh', 'lah', 'kan', 'there', 'buddy', 'mate', 'friend',
            'yo', 'sup', 'apa', 'gimana', 'bagaimana', 'kabar', 'kabarnya', 'sehat',
            'oke', 'ok', 'okay', 'okey', 'sip', 'siap', 'nah', 'eh', 'oh', 'lho', 'lo', 'loh', 'btw', 'yuk', 'mari',
            'wkwk', 'wkwkwk', 'haha', 'hahaha', 'hehe', 'hehehe', 'hmm',
        ];
        if (!empty($words) && count($words) <= 8) {
            $allCasual = true;
            foreach ($words as $w) {
                if (!in_array($w, $casualSet, true)) {
                    $allCasual = false;
                    break;
                }
            }
            if ($allCasual) {
                return true;
            }
        }

        // 1b. Short greeting with everyday fillers (e.g. "oke halo bro", "eh hai min, aktif ga?", "nah pagi bos")
        //     ONLY when it contains NO PROVIS command or data-query words!
        if (
            count($words) <= 7
            && preg_match('/\b(halo+|hallo|hello|helo|hai+|hi+|hey+|selamat\s+(?:pagi|siang|sore|malam)|assalamualaikum|permisi|punten|ping)\b/i', $lower)
            && !preg_match('/\b(buat|buatkan|buatin|membuat|bikin|bikinin|tambah|ubah|mengubah|ganti|update|hapus|delete|cek|lihat|tampilkan|daftar|berapa|jumlah|total|proyek|projek|projeck|project|task|wbs|budget|anggaran|divisi|perusahaan|akun|user|worker|pic|scurve|predecessor|outstanding|overdue|pdf|laporan|rekap|deadline|tugas|bisa\s+(?:untuk|buat|bantu)\s+apa)\b/i', $lower)
        ) {
            return true;
        }

        // 1c. Playful meta-greeting / correction when user says "lho aku baru menyapa", "cuma nyapa", "menyapa balik"
        if (
            preg_match('/\b((?:baru|cuma|hanya|cm|cuman)\s+(?:menyapa|nyapa|sapa|tes|test|ngecek|halo)|(?:menyapa|nyapa|sapa|menyala)\s+balik|aku\s+kan\s+(?:baru\s+)?(?:nyapa|menyapa))\b/i', $lower)
            && !preg_match('/\b(buat|bikin|ubah|hapus|budget|scurve|predecessor|outstanding|pdf|rekonsiliasi)\b/i', $lower)
        ) {
            return true;
        }

        // 2. Greetings / How are you / What's up
        if (preg_match('/\b(apa\s+kabar|gimana\s+kabar(?:nya)?|kabar\s+kamu|lagi\s+ngapain|lagi\s+sibuk|how\s+are\s+you|how\'?s\s+it\s+going|what\'?s\s+up|are\s+you\s+there|halo\s+tes|tes\s+halo)\b/i', $lower)) {
            return true;
        }

        // 3. Thanks / Praise / Short Acknowledgment
        if (preg_match('/^(terima\s*kasih|makasih|makasi|thanks|thank\s*you|thx|tq|mantap|keren|bagus|hebat|pintar|canggih|oke\s+makasih|ok\s+thanks|nice|great|awesome|cool|sip|siap\s+makasih|oh\s+gitu|paham|mengerti|got\s+it)(\s+.*)?$/i', $lower) && mb_strlen($lower) <= 55) {
            return true;
        }

        // 4. Identity / Local Engine / No-API / Capabilities inquiries
        if ($this->isCapabilityInquiry($text)) {
            return true;
        }
        if (preg_match('/\b(siapa\s+(?:kamu|anda|nama\s+kamu)|kamu\s+(?:siapa|pakai\s+apa)|bisa\s+bahasa\s+apa|who\s+are\s+you|pakai\s+(?:api|ai|model|gemini|gpt|chatgpt|qwen|openai|claude)|apakah\s+(?:online|lokal|local|pakai\s+api)|do\s+you\s+use\s+(?:api|openai|gemini|gpt)|what\s+model\s+are\s+you)\b/i', $lower)) {
            return true;
        }

        // 5. Current Time / Date inquiries
        if (preg_match('/\b(jam\s+berapa|pukul\s+berapa|tanggal\s+berapa\s+(?:hari\s+ini|sekarang)|hari\s+ini\s+(?:hari\s+apa|tanggal\s+berapa)|what\s+time\s+is\s+it|what\'?s\s+today\'?s\s+date|what\s+day\s+is\s+today)\b/i', $lower)) {
            return true;
        }

        return false;
    }

    /**
     * Evaluate local math or percentage expressions safely (e.g. "berapa 15% dari 45 miliar", "hitung 1250 * 12").
     *
     * @return array{expression: string, result: float}|null
     */
    public function evaluateMathExpression(string $text): ?array
    {
        $lower = mb_strtolower(trim($text));

        // 1. Percentage of X: "berapa 15% dari 45 miliar" / "what is 20% of 45000000000"
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(?:%|persen|percent)\s*(?:dari|of)\s*(\d+(?:[.,]\d+)?)\s*(miliar|milyar|billion|juta|million|ribu|thousand)?/i', $lower, $m)) {
            $pct = (float) str_replace(',', '.', $m[1]);
            $base = (float) str_replace(['.', ','], ['', '.'], $m[2]);
            // If $m[2] had no multiplier and contained dots as thousand separators (e.g. 45.000.000)
            if (empty($m[3]) && preg_match('/^\d{1,3}(\.\d{3})+$/', $m[2])) {
                $base = (float) str_replace('.', '', $m[2]);
            } elseif (!empty($m[3])) {
                $base = (float) str_replace(',', '.', $m[2]);
                $unit = strtolower($m[3]);
                if (in_array($unit, ['miliar', 'milyar', 'billion'], true)) {
                    $base *= 1_000_000_000;
                } elseif (in_array($unit, ['juta', 'million'], true)) {
                    $base *= 1_000_000;
                } elseif (in_array($unit, ['ribu', 'thousand'], true)) {
                    $base *= 1_000;
                }
            }

            $res = ($pct / 100.0) * $base;
            return [
                'expression' => "{$pct}% × " . number_format($base, 0, ',', '.'),
                'result'     => $res,
            ];
        }

        // 2. Basic arithmetic: "hitung 250 + 500 * 2" or standalone "1500 * 24"
        if (preg_match('/(?:^(?:hitung|berapa|calculate|compute)\s+|\b=\s*\?$)([0-9\s\+\-\*\/\(\)\.,]+)/i', $lower, $m)
            || (preg_match('/^[\d\s\+\-\*\/\(\)\.]+$/', $lower) && preg_match('/[\+\-\*\/]/', $lower) && !preg_match('/^\d{1,4}[\-\/]\d{1,2}[\-\/]\d{1,4}$/', $lower))
        ) {
            $expr = trim($m[1] ?? $lower);
            $sanitized = preg_replace('/[^0-9\+\-\*\/\(\)\.]/', '', $expr) ?? '';
            if ($sanitized !== '' && preg_match('/\d+\s*[\+\-\*\/]\s*\d+/', $sanitized)) {
                try {
                    // Safe shunting-yard / two-pass arithmetic evaluator (zero eval())
                    $val = $this->safeComputeArithmetic($sanitized);
                    if ($val !== null) {
                        return [
                            'expression' => $sanitized,
                            'result'     => $val,
                        ];
                    }
                } catch (\Throwable $e) {
                }
            }
        }

        return null;
    }

    /**
     * Safe arithmetic evaluator supporting +, -, *, / without PHP eval().
     */
    protected function safeComputeArithmetic(string $expr): ?float
    {
        if (!preg_match('/^\d+(?:\.\d+)?(?:[\+\-\*\/]\d+(?:\.\d+)?)+$/', $expr)) {
            return null;
        }
        $tokens = preg_split('/([\+\-\*\/])/', $expr, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (!$tokens || count($tokens) < 3) {
            return null;
        }

        // Pass 1: * and /
        $pass1 = [(float) $tokens[0]];
        for ($i = 1; $i < count($tokens); $i += 2) {
            $op = $tokens[$i];
            $num = (float) ($tokens[$i + 1] ?? 0);
            if ($op === '*') {
                $prev = array_pop($pass1);
                $pass1[] = $prev * $num;
            } elseif ($op === '/') {
                if ($num == 0.0) {
                    return null;
                }
                $prev = array_pop($pass1);
                $pass1[] = $prev / $num;
            } else {
                $pass1[] = $op;
                $pass1[] = $num;
            }
        }

        // Pass 2: + and -
        $result = (float) $pass1[0];
        for ($i = 1; $i < count($pass1); $i += 2) {
            $op = $pass1[$i];
            $num = (float) ($pass1[$i + 1] ?? 0);
            if ($op === '+') {
                $result += $num;
            } elseif ($op === '-') {
                $result -= $num;
            }
        }

        return $result;
    }

    /**
     * Extract explicit numeric project IDs like #5, ID 5, proyek 5, projek 5, project #12.
     */
    public function extractProjectIdFromPrompt(string $text): ?int
    {
        if (preg_match('/\b(?:proyek|projek|projeck|project)\s*(?:id\s*)?#?(\d+)\b/i', $text, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/\bID\s*#?(\d+)\b/i', $text, $m)) {
            return (int) $m[1];
        }
        return null;
    }

    /**
     * Extract duration expressions like "70 hari", "3 bulan", "2 minggu", "1 tahun", "14 days", "6 months".
     *
     * @return array{value: int, unit: string, days: int, label_id: string, label_en: string}|null
     */
    public function extractDuration(string $text): ?array
    {
        $lower = mb_strtolower(trim($text));

        if (preg_match('/\b(\d+)\s*(hari|hr|days?|minggu|pekan|weeks?|bulan|bln|months?|tahun|thn|years?)\b/i', $lower, $m)) {
            $val  = max(1, (int) $m[1]);
            $rawU = strtolower($m[2]);

            if (preg_match('/^(hari|hr|days?)$/', $rawU)) {
                return [
                    'value'    => $val,
                    'unit'     => 'days',
                    'days'     => $val,
                    'label_id' => "{$val} hari",
                    'label_en' => "{$val} " . ($val === 1 ? 'day' : 'days'),
                ];
            }
            if (preg_match('/^(minggu|pekan|weeks?)$/', $rawU)) {
                return [
                    'value'    => $val,
                    'unit'     => 'weeks',
                    'days'     => $val * 7,
                    'label_id' => "{$val} minggu (" . ($val * 7) . " hari)",
                    'label_en' => "{$val} " . ($val === 1 ? 'week' : 'weeks'),
                ];
            }
            if (preg_match('/^(bulan|bln|months?)$/', $rawU)) {
                return [
                    'value'    => $val,
                    'unit'     => 'months',
                    'days'     => $val * 30,
                    'label_id' => "{$val} bulan",
                    'label_en' => "{$val} " . ($val === 1 ? 'month' : 'months'),
                ];
            }
            if (preg_match('/^(tahun|thn|years?)$/', $rawU)) {
                return [
                    'value'    => $val,
                    'unit'     => 'years',
                    'days'     => $val * 365,
                    'label_id' => "{$val} tahun",
                    'label_en' => "{$val} " . ($val === 1 ? 'year' : 'years'),
                ];
            }
        }

        return null;
    }

    /**
     * Extract project WBS template mode from user text: 'default' (17 Main Jobs) or 'empty' (blank/manual).
     */
    public function extractWbsMode(string $text): ?string
    {
        $lower = mb_strtolower(trim($text));

        if (preg_match('/\b(kosong|kosongan|kosongin|manual|tanpa\s+(?:task|wbs|template)|blank|empty|bikin\s+sendiri|buat\s+sendiri|custom\s+kosong|dari\s+nol)\b/i', $lower)) {
            return 'empty';
        }
        if (preg_match('/\b(default|17\s*(?:task|main|pekerjaan)|template(?:\s+(?:default|master|standar|bawaan))?|bawaan|standar|standard|otomatis)\b/i', $lower)) {
            return 'default';
        }

        return null;
    }

    /**
     * Extract company info from user prompt (matches existing DB companies OR explicitly stated new company names like "PT. TEST" or "milik perusahaan PT. Anugerah Utama").
     *
     * @return array{id: ?int, name: string, is_new: bool}|null
     */
    public function extractCompanyInfo(string $text, bool $allowBareName = false): ?array
    {
        $trimmed = trim($text);
        $lower   = mb_strtolower($trimmed);

        // 1. Check existing companies in database first (full name or core name without PT./CV.)
        $companies = Company::all(['id', 'name']);
        foreach ($companies as $comp) {
            $cName  = trim($comp->name);
            $cLower = mb_strtolower($cName);
            $cCore  = trim(preg_replace('/^(pt\.?|cv\.?|ud\.?|tbk\.?)\s+/i', '', $cLower) ?? $cLower);

            if (mb_strlen($cLower) >= 3 && str_contains($lower, $cLower)) {
                return ['id' => $comp->id, 'name' => $cName, 'is_new' => false];
            }
            if (mb_strlen($cCore) >= 4 && preg_match('/\b' . preg_quote($cCore, '/') . '\b/u', $lower)) {
                return ['id' => $comp->id, 'name' => $cName, 'is_new' => false];
            }
        }

        // 2. Explicit company phrases: "milik perusahaan PT. TEST", "dengan nama perusahaan PT. ABC", "perusahaan PT. XYZ", "company Acme Corp"
        $patterns = [
            '/(?:milik\s+(?:perusahaan|company)|dengan\s+nama\s+perusahaan|nama\s+perusahaan(?:nya)?|perusahaan(?:nya)?|for\s+company|company\s+(?:name)?)\s*(?::|=|yaitu|adalah)?\s*["\']?([A-Za-z0-9\.\-\&\s]{2,80})["\']?/i',
            '/\b((?:PT|CV|UD|PD|YAYASAN)\.?\s+[A-Za-z0-9][A-Za-z0-9\.\-\&\s]{1,65})/i',
        ];

        foreach ($patterns as $pat) {
            if (preg_match($pat, $trimmed, $m)) {
                $candidate = trim($m[1]);
                // Trim trailing clauses like "yang berdurasi...", "selama 70 hari", "mulai ...", "untuk tasknya...", "durasi ..."
                $candidate = preg_replace('/(?:,\s*|\s+)(?:yang\s+berdurasi|yang\s+durasi|berdurasi|durasi|selama|mulai|start|untuk\s+task|dengan\s+durasi|dengan\s+task|pakai\s+default|pakai\s+template|for\s+\d+|with\s+duration|starting|using\s+default).*$/i', '', $candidate) ?? $candidate;
                $candidate = trim($candidate, " \t\n\r\0\x0B.,;:\"'?!");

                // Reject generic non-company words
                if (mb_strlen($candidate) >= 2 && !preg_match('/^(apa|mana|berapa|yang|ini|itu|baru|terdaftar|perusahaan|company|saya|aku|kamu)$/i', $candidate)) {
                    // Re-check if cleaned candidate matches an existing company
                    foreach ($companies as $comp) {
                        if (mb_strtolower(trim($comp->name)) === mb_strtolower($candidate)) {
                            return ['id' => $comp->id, 'name' => $comp->name, 'is_new' => false];
                        }
                    }
                    return ['id' => null, 'name' => $candidate, 'is_new' => true];
                }
            }
        }

        // 3. When specifically answering "Mau diberi nama perusahaan apa?", treat short clean reply as company name!
        if ($allowBareName) {
            $cleaned = preg_replace('/^(?:nama\s+perusahaan(?:nya)?|perusahaan(?:nya)?|milik|dari|untuk|pakai|kasih\s+nama|beri\s+nama|namanya)\s*/i', '', $trimmed) ?? $trimmed;
            $cleaned = preg_replace('/(?:,\s*|\s+)(?:aja|saja|ya|yah|dong|bro|min|pakai\s+default|kosong\s+aja|durasi\s+\d+.*)$/i', '', $cleaned) ?? $cleaned;
            $cleaned = trim($cleaned, " \t\n\r\0\x0B.,;:\"'?!");

            if (mb_strlen($cleaned) >= 2 && mb_strlen($cleaned) <= 80 && !preg_match('/^(batal|cancel|tidak|ga|gak|ya|oke|ok)$/i', $cleaned)) {
                foreach ($companies as $comp) {
                    if (mb_strtolower(trim($comp->name)) === mb_strtolower($cleaned)) {
                        return ['id' => $comp->id, 'name' => $comp->name, 'is_new' => false];
                    }
                }
                return ['id' => null, 'name' => $cleaned, 'is_new' => true];
            }
        }

        return null;
    }

    /**
     * Extract clean Project Title from conversational prompts like:
     * - "tolong buatkan projek bernama TESTING, milik Perusahaan PT. TEST" -> "TESTING"
     * - "tolong buatkan projek bernama testing selama durasi 70 hari" -> "testing"
     * - "Buat proyek baru Pabrik Tes Batal mulai 2026-12-01 selama 3 bulan" -> "Pabrik Tes Batal"
     * - "bisakah kamu membuatkanku projek" -> null (triggers interactive question!)
     */
    public function extractProjectTitleFromPrompt(string $text, bool $allowBareName = false): ?string
    {
        $trimmed = trim($text);

        // 1. Quoted title: projek "TESTING" or proyek 'Gudang B'
        if (preg_match('/["\']([^"\']{2,90})["\']/', $trimmed, $m)) {
            $cand = trim($m[1]);
            if (!preg_match('/^(pt\.|cv\.|default|kosong)/i', $cand)) {
                return $cand;
            }
        }

        // 2. Explicit "bernama / namanya / judul / titled / named":
        if (preg_match('/\b(?:bernama|dengan\s+nama|namanya|nama\s+(?:projek|proyek|project)(?:nya)?|judul(?:nya)?|named|titled)\s*(?::|=)?\s*([^,\n\.]{2,90})/i', $trimmed, $m)) {
            $cand = $this->cleanExtractedProjectTitle($m[1]);
            if ($cand !== null) {
                return $cand;
            }
        }

        // 3. Inline after create-project verb: "buat proyek baru Pabrik Tes Batal mulai 2026-12-01"
        if (preg_match('/\b(?:buat|buatkan|buatkanku|membuat|membuatkan|membuatkanku|bikin|bikinkan|bikinin|buatin|tambah|tambahkan|create|generate)\s+(?:saya\s+|aku\s+|ku\s+|a\s+|new\s+|sebuah\s+)?(?:proyek|projek|projeck|project)\s+(?:baru\s+|new\s+)?(.+)$/i', $trimmed, $m)) {
            $cand = $this->cleanExtractedProjectTitle($m[1]);
            if ($cand !== null) {
                return $cand;
            }
        }

        // 4. Bare reply when user is answering "Nama projeknya apa?"
        if ($allowBareName) {
            $cleaned = preg_replace('/^(?:nama\s+(?:projek|proyek|project)(?:nya)?|namanya|bernama|judul(?:nya)?)\s*(?::|=)?\s*/i', '', $trimmed) ?? $trimmed;
            return $this->cleanExtractedProjectTitle($cleaned);
        }

        return null;
    }

    protected function cleanExtractedProjectTitle(string $raw): ?string
    {
        $cand = trim($raw);
        // Strip leading connector words
        $cand = preg_replace('/^(?:bernama|nama|namanya|baru|new|yang)\s+/i', '', $cand) ?? $cand;
        // Strip trailing clauses (company, duration, dates, WBS template, politeness)
        $cand = preg_replace('/(?:,\s*|\s+)(?:milik\s+(?:perusahaan|company|pt|cv)|dengan\s+(?:nama\s+)?perusahaan|perusahaan\s+|company\s+|for\s+company|pt\.?\s+|cv\.?\s+|selama\s+|berdurasi\s+|durasi\s+|yang\s+berdurasi|mulai\s+|start(?:ing)?\s+|tanggal\s+|pada\s+|for\s+\d+|with\s+duration|untuk\s+task|pakai\s+(?:default|template)|using\s+default).*$/i', '', $cand) ?? $cand;
        $cand = preg_replace('/\s+(?:dong|ya|yah|bro|min|nih|aja|saja)$/i', '', $cand) ?? $cand;
        $cand = trim($cand, " \t\n\r\0\x0B.,;:\"'?!");

        if (mb_strlen($cand) < 2 || mb_strlen($cand) > 90) {
            return null;
        }
        // Reject filler words that are NOT a real project name
        if (preg_match('/^(baru|new|proyek|projek|project|satu|sebuah|ini|itu|apa|saja|aja|dong|ya|batal|cancel|tidak|ga|gak|default|kosong|\d+\s*(?:hari|minggu|bulan|tahun|days?|weeks?|months?|years?))$/i', $cand)) {
            return null;
        }

        return $cand;
    }

    /**
     * Extract target role for CREATE_USER from natural Indonesian/English prompts.
     *
     * @return array{id: int, name: string, label: string}|null
     */
    public function extractUserCreationRole(string $text): ?array
    {
        $lower = mb_strtolower($text);
        $roleKey = null;

        if (preg_match('/\b(super\s*admin(?:istrator)?)\b/i', $lower)) {
            $roleKey = 'SuperAdmin';
        } elseif (preg_match('/\b(admin\s*utama|admin_utama)\b/i', $lower)) {
            $roleKey = 'admin_utama';
        } elseif (preg_match('/\b(admin\s*progres+|admin_progres)\b/i', $lower)) {
            $roleKey = 'admin_progres';
        } elseif (preg_match('/\b(pic|project\s+manager)\b/i', $lower)) {
            $roleKey = 'pic';
        } elseif (preg_match('/\b(worker|pekerja|karyawan|staff|staf)\b/i', $lower)) {
            $roleKey = 'worker';
        }

        if ($roleKey === null) {
            return null;
        }

        $roleModel = \App\Models\Role::where('name', $roleKey)->first();
        if (!$roleModel) {
            return null;
        }

        return [
            'id'    => (int) $roleModel->id,
            'name'  => $roleModel->name,
            'label' => match ($roleModel->name) {
                'SuperAdmin'    => 'SuperAdmin',
                'admin_utama'   => 'Admin Utama',
                'admin_progres' => 'Admin Progres',
                'pic'           => 'PIC (Project Manager)',
                'worker'        => 'Worker',
                default         => $roleModel->name,
            },
        ];
    }

    /**
     * Extract username / account name for CREATE_USER from natural prompts.
     */
    public function extractUserCreationName(string $text, bool $allowBareName = false): ?string
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return null;
        }

        // Strip conversational confirmation lead-ins like "tidak, maksud saya adalah..."
        $cleaned = preg_replace('/^(?:tidak\s*,?\s*|bukan\s*,?\s*|iya\s*,?\s*)?(?:maksud\s+(?:saya|aku)\s+(?:adalah\s+)?)?/i', '', $trimmed) ?? $trimmed;

        $cleanNameCandidate = function (string $raw): ?string {
            $cand = trim($raw, " \t\n\r\0\x0B.,;:\"'?!");
            // Stop before role, company, division, email, password, or filler clauses
            $cand = preg_replace('/(?:,\s*|\s+)(?:dengan\s+role|dengan\s+peran|dengan\s+email|dengan\s+password|role\s+|peran\s+|sebagai\s+|di\s+pt\b|di\s+perusahaan\b|perusahaan\s+|divisi\s+|division\s+|email\s+|password\s+|pass\s+|sandi\s+|untuk\s+|for\s+role|as\s+|with\s+role|with\s+email).*$/i', '', $cand) ?? $cand;
            $cand = preg_replace('/\s+(?:dong|ya|yah|bro|min|nih|aja|saja)$/i', '', $cand) ?? $cand;
            $cand = trim($cand, " \t\n\r\0\x0B.,;:\"'?!");

            if (mb_strlen($cand) < 2 || mb_strlen($cand) > 45) {
                return null;
            }
            if (preg_match('/^(akun|user|pengguna|account|baru|new|saya|aku|kamu|role|peran|super\s*admin|admin\s*utama|admin\s*progres|pic|worker|bisa|ya|tidak|batal|cancel|apa|siapa|nama)$/i', $cand)) {
                return null;
            }
            return $cand;
        };

        // 1. Explicit quoted name: bernama "Aria" / nama akun "Aria Pratama"
        if (preg_match('/\b(?:bernama|namanya|dengan\s+nama\s+(?:akun|user)?|atas\s+nama|nama\s+(?:akun|user)|nama|named|name)\s*(?::|=)?\s*["\']([^"\']{2,45})["\']/i', $cleaned, $m)) {
            $cand = $cleanNameCandidate($m[1]);
            if ($cand !== null) return $cand;
        }

        // 2. Unquoted name after explicit naming keyword
        if (preg_match('/\b(?:bernama|namanya|dengan\s+nama\s+(?:akun|user)?|atas\s+nama|nama\s+(?:akun|user)|nama|named|name)\s*(?::|=)?\s*([a-zA-Z0-9][a-zA-Z0-9\s._-]{1,50})/i', $cleaned, $m)) {
            $cand = $cleanNameCandidate($m[1]);
            if ($cand !== null) return $cand;
        }

        // 3. Bare reply when user was asked for account name
        if ($allowBareName) {
            return $cleanNameCandidate($cleaned);
        }

        return null;
    }

    /**
     * Extract an email address from prompt if supplied.
     */
    public function extractEmailFromPrompt(string $text): ?string
    {
        if (preg_match('/([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i', $text, $m)) {
            return mb_strtolower(trim($m[1]));
        }
        return null;
    }

    /**
     * Extract password from prompt when explicitly introduced by password/sandi keyword.
     */
    public function extractPasswordFromPrompt(string $text): ?string
    {
        if (preg_match('/\b(?:password(?:nya)?|kata\s*sandi(?:nya)?|sandi(?:nya)?|pwd|pass)\s*(?::|=|adalah|jadi)?\s*(?:["\']([^"\']{6,64})["\']|([^\s,;]{6,64}))/i', $text, $m)) {
            $pwd = !empty($m[1]) ? $m[1] : ($m[2] ?? '');
            $pwd = trim($pwd);
            return mb_strlen($pwd) >= 6 ? $pwd : null;
        }
        return null;
    }

    /**
     * Match existing User accounts dynamically by username or email (exact + mild typo tolerant!).
     * Zero hardcoding — reads live `users` table every turn.
     *
     * @return array<int, array{id: int, username: string, email: string, role: string, division_id: ?int, division_name: string, score: float, had_typo: bool, matched_from: ?string}>
     */
    public function matchUsersInPrompt(string $text, ?array $companyIds = null, bool $isIsolatedCandidate = false): array
    {
        $lower = mb_strtolower(trim($text));
        if ($lower === '') {
            return [];
        }

        $query = User::with(['role', 'division', 'company']);
        if ($companyIds !== null && !empty($companyIds)) {
            $query->where(function ($q) use ($companyIds) {
                $q->whereIn('companies_id', $companyIds)
                  ->orWhereHas('companies', fn($cq) => $cq->whereIn('companies.id', $companyIds));
            });
        }

        $users        = $query->get();
        $normPrompt   = $this->normalizeForSearch($text);
        $promptTokens = array_values(array_filter(explode(' ', $normPrompt)));
        $genericRole  = ['worker', 'pic', 'admin', 'superadmin', 'user', 'akun', 'karyawan', 'pegawai', 'test', 'create', 'project', 'baru'];
        $hits         = [];

        foreach ($users as $u) {
            $uName     = mb_strtolower(trim($u->username));
            $uNorm     = $this->normalizeForSearch($u->username);
            $uCompact  = str_replace(' ', '', $uNorm);
            $uEmail    = mb_strtolower(trim($u->email));
            $score     = 0.0;
            $hadTypo   = false;
            $fromToken = null;

            if ($uEmail !== '' && str_contains($lower, $uEmail)) {
                $score = 100.0;
            } elseif (mb_strlen($uNorm) >= 3 && preg_match('/\b' . preg_quote($uNorm, '/') . '\b/u', $normPrompt)) {
                $score = 85.0 + mb_strlen($uNorm);
            } elseif (mb_strlen($uCompact) >= 5 && str_contains(str_replace(' ', '', $normPrompt), $uCompact)) {
                $score = 80.0 + mb_strlen($uCompact);
            } else {
                // Fuzzy mild-typo matching against username tokens (e.g. "workr mtc" -> "WorkerMtc", "worker prodksi" -> "Worker Produksi")
                $uTokens = array_values(array_filter(explode(' ', $uNorm), fn($t) => strlen($t) >= 2));

                // Split camelCase / joined usernames too (e.g. "WorkerMtc" -> ["worker", "mtc"], "PicHanwa" -> ["pic", "hanwa"])
                $camelSplit = strtolower(preg_replace('/([a-z])([A-Z])/', '$1 $2', $u->username) ?? $u->username);
                $camelNorm  = $this->normalizeForSearch($camelSplit);
                if ($camelNorm !== $uNorm) {
                    if (preg_match('/\b' . preg_quote($camelNorm, '/') . '\b/u', $normPrompt)) {
                        $score = 82.0 + strlen($camelNorm);
                    } else {
                        $uTokens = array_values(array_unique(array_merge(
                            $uTokens,
                            array_filter(explode(' ', $camelNorm), fn($t) => strlen($t) >= 2)
                        )));
                    }
                }

                if ($score == 0.0 && !empty($uTokens)) {
                    $tokHits      = 0.0;
                    $distinctHits = 0.0;
                    $usedFuzzy    = false;
                    $fuzzyFrom    = null;

                    foreach ($uTokens as $ut) {
                        $isDist  = !in_array($ut, $genericRole, true);
                        $uLen    = strlen($ut);
                        $maxDist = $uLen >= 7 ? 2 : ($uLen >= 5 ? 1 : 0);

                        foreach ($promptTokens as $pt) {
                            if ($pt === $ut) {
                                $tokHits += 1.0;
                                if ($isDist) {
                                    $distinctHits += 1.0;
                                }
                                break;
                            }
                            if ($maxDist > 0 && strlen($pt) >= 4 && abs(strlen($pt) - $uLen) <= $maxDist) {
                                $d = levenshtein($pt, $ut);
                                if ($d <= $maxDist) {
                                    $tokHits += ($d === 1 ? 0.9 : 0.75);
                                    if ($isDist) {
                                        $distinctHits += ($d === 1 ? 0.9 : 0.75);
                                    }
                                    $usedFuzzy = true;
                                    $fuzzyFrom = $pt;
                                    break;
                                }
                            }
                        }
                    }

                    $cov = $tokHits / count($uTokens);
                    // For isolated candidate compact-Levenshtein, strip shared role prefixes ("worker"/"pic"/"admin")
                    // so "worker pr" NEVER matches "WorkerIG" (distance 2 on "pr" vs "ig"!)
                    $candTail = trim(preg_replace('/^(?:worker|workr|wrkr|pic|admin|superadmin)\s*/i', '', $normPrompt) ?? $normPrompt);
                    $userTail = trim(preg_replace('/^(?:worker|pic|admin|superadmin)\s*/i', '', $camelNorm) ?? $camelNorm);
                    $tailCompactCand = str_replace(' ', '', $candTail);
                    $tailCompactUser = str_replace(' ', '', $userTail);
                    $compactTailMatch = $isIsolatedCandidate
                        && strlen($tailCompactCand) >= 4
                        && strlen($tailCompactUser) >= 4
                        && abs(strlen($tailCompactCand) - strlen($tailCompactUser)) <= 1
                        && levenshtein($tailCompactCand, $tailCompactUser) <= 1;

                    // Require distinctive token hit so generic "worker" never matches every Worker account!
                    if (
                        ($distinctHits >= 0.85 && ($tokHits >= 1.7 || $cov >= 0.6))
                        || $compactTailMatch
                    ) {
                        $score     = 45.0 + ($tokHits * 12.0) + ($cov * 15.0);
                        $hadTypo   = $usedFuzzy || ($isIsolatedCandidate && str_replace(' ', '', $normPrompt) !== $uCompact);
                        $fromToken = $fuzzyFrom ?: ($isIsolatedCandidate ? $text : null);
                    }
                }
            }

            if ($score > 0) {
                $hits[] = [
                    'id'            => $u->id,
                    'username'      => $u->username,
                    'email'         => $u->email,
                    'role'          => $u->role?->name ?? 'worker',
                    'division_id'   => $u->divisions_id,
                    'division_name' => $u->division?->divisi ?? 'General',
                    'company_name'  => $u->company?->name ?? '—',
                    'score'         => round($score, 2),
                    'had_typo'      => $hadTypo,
                    'matched_from'  => $fromToken,
                ];
            }
        }

        usort($hits, fn($a, $b) => $b['score'] <=> $a['score']);
        return array_slice($hits, 0, 5);
    }

    /**
     * Dynamically extract a requested account/worker/user variable name from prompts like:
     * - "cek akun (nama akun)" / "profil worker (nama)" / "detail akun (nama)" / "siapa itu (nama)"
     */
    public function extractRequestedUserName(string $text): ?string
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return null;
        }

        $patterns = [
            '/\b(?:profil|profile|detail|info|data|cek|lihat)\s+(?:akun|user|pengguna|karyawan|pegawai|worker|pic|anggota)\s+([a-z0-9][a-z0-9\s\.\-_@]{1,60})/i',
            '/\b(?:siapa\s+itu|siapa\s+akun|cari\s+(?:akun|user|worker|karyawan))\s+([a-z0-9][a-z0-9\s\.\-_@]{1,60})/i',
        ];

        $blocklist = '/^(?:di\b|pada\b|milik\b|dari\b|divisi\b|perusahaan\b|pt\b|cv\b|projek\b|proyek\b|project\b|sistem\b|provis\b|terbaru\b|baru\b|semua\b|yang\b|mana\b|apa\b|berapa\b|beta\b|aktif\b|(?:worker|workers|pic|pics|admin|admins|superadmin)$)/i';

        foreach ($patterns as $rx) {
            if (preg_match($rx, $trimmed, $m)) {
                $cand = trim($m[1]);
                $cand = preg_replace('/\s+(?:ya|yah|dong|bro|min|nih|sih|di\s+provis|di\s+sistem|itu|ini).*$/i', '', $cand) ?? $cand;
                $cand = trim($cand, " \t\n\r\0\x0B.,;:\"'?!");

                if (strlen($cand) >= 2 && strlen($cand) <= 60 && !preg_match($blocklist, $cand)) {
                    return $cand;
                }
            }
        }

        return null;
    }

    /**
     * Find heavy-typo or ambiguous user candidates from live `users` table (strictly scoped by $companyIds when provided).
     *
     * @return array<int, array{id: int, label: string, similarity: float}>
     */
    public function findHeavyTypoUsers(string $candidate, ?array $companyIds = null): array
    {
        $normCand = $this->normalizeForSearch($candidate);
        if (strlen($normCand) < 2) {
            return [];
        }

        $query = User::query();
        if ($companyIds !== null) {
            if (empty($companyIds)) {
                return [];
            }
            $query->where(function ($q) use ($companyIds) {
                $q->whereIn('companies_id', $companyIds)
                  ->orWhereHas('companies', fn($cq) => $cq->whereIn('companies.id', $companyIds));
            });
        }

        $candCompact = str_replace(' ', '', $normCand);
        $candSkel    = $this->consonantSkeleton($candCompact);
        $candTokens  = array_values(array_filter(explode(' ', $normCand)));
        $matches     = [];

        foreach ($query->get(['id', 'username', 'email']) as $u) {
            $uNorm    = $this->normalizeForSearch($u->username);
            $uCompact = str_replace(' ', '', $uNorm);
            $uSkel    = $this->consonantSkeleton($uCompact);
            $camel    = $this->normalizeForSearch(strtolower(preg_replace('/([a-z])([A-Z])/', '$1 $2', $u->username) ?? $u->username));
            $uTokens  = array_values(array_unique(array_merge(explode(' ', $uNorm), explode(' ', $camel))));

            $bestSim = 0.0;

            // 1. Direct prefix match (e.g. "worker pr" -> Worker Produksi, Worker Procurement ranked FIRST!)
            if (strlen($normCand) >= 3 && (str_starts_with($uNorm, $normCand) || str_starts_with($camel, $normCand))) {
                $bestSim = max($bestSim, 86.0);
            }

            // 2. Consonant skeleton match (e.g. "wrk prd" -> "wrkprd" inside "wrkprdk" / "Worker Produksi")
            if (strlen($candSkel) >= 3 && ($uSkel === $candSkel || str_contains($uSkel, $candSkel) || str_starts_with($uSkel, $candSkel))) {
                $bestSim = max($bestSim, 72.0);
            }

            // 3. Similar text percentage
            similar_text($candCompact, $uCompact, $pct);
            if ($pct >= 55.0) {
                $bestSim = max($bestSim, $pct);
            }

            // 4. Token-level skeleton / prefix match (e.g. "wrk prd" -> "worker" + "produksi")
            if (count($candTokens) >= 2) {
                $tScore = 0;
                foreach ($candTokens as $ct) {
                    $ctSkel = $this->consonantSkeleton($ct);
                    foreach ($uTokens as $ut) {
                        $utSkel = $this->consonantSkeleton($ut);
                        if (
                            (strlen($ct) >= 2 && str_starts_with($ut, $ct))
                            || (strlen($ctSkel) >= 2 && str_starts_with($utSkel, $ctSkel))
                        ) {
                            $tScore++;
                            break;
                        }
                    }
                }
                if ($tScore >= count($candTokens)) {
                    $bestSim = max($bestSim, 78.0);
                }
            }

            if ($bestSim >= 55.0) {
                $matches[] = [
                    'id'         => $u->id,
                    'label'      => $u->username,
                    'similarity' => round($bestSim, 1),
                ];
            }
        }

        usort($matches, fn($a, $b) => $b['similarity'] <=> $a['similarity']);
        return array_slice($matches, 0, 5);
    }

    /**
     * Extract follow-up / conversational references (e.g., "yang pertama", "nomor 2", "yang tadi", "detailnya").
     */
    public function extractFollowUpReference(string $text): array
    {
        $lower = mb_strtolower(trim($text));
        $index = null;

        if (preg_match('/\b(pertama|kesatu|nomor\s*1|no\.?\s*1|first|#1)\b/i', $lower)) {
            $index = 1;
        } elseif (preg_match('/\b(kedua|nomor\s*2|no\.?\s*2|second|#2)\b/i', $lower)) {
            $index = 2;
        } elseif (preg_match('/\b(ketiga|nomor\s*3|no\.?\s*3|third|#3)\b/i', $lower)) {
            $index = 3;
        } elseif (preg_match('/\b(keempat|nomor\s*4|no\.?\s*4|fourth|#4)\b/i', $lower)) {
            $index = 4;
        } elseif (preg_match('/\b(kelima|nomor\s*5|no\.?\s*5|fifth|#5)\b/i', $lower)) {
            $index = 5;
        } elseif (preg_match('/\b(?:nomor|no\.?)\s*(\d+)\b/i', $lower, $m)) {
            $index = (int) $m[1];
        }

        $refersPrevious = (bool) preg_match(
            '/\b(yang\s+tadi|tadi|tersebut|proyek\s+itu|proyek\s+ini|projek\s+itu|projek\s+ini|projekku|proyekku|task\s+itu|task\s+ini|detailnya|rinciannya|selengkapnya|lebih\s+lanjut|lanjutkan|budgetnya|progresnya|statusnya|pdf-?nya|that\s+project|this\s+project|that\s+task|this\s+task|previous|above|its\s+(?:budget|progress|status|tasks|details)|more\s+details)\b/i',
            $lower
        );

        $isRefinement = (bool) preg_match(
            '/^(?:yang|hanya|cuma|khusus|filter|dari\s+itu|only|just|filter\s+by)\b/i',
            $lower
        );

        return [
            'item_index'         => $index,
            'refers_to_previous' => $refersPrevious || $index !== null,
            'is_refinement'      => $isRefinement,
        ];
    }

    /**
     * Extract exact or natural dates (Indonesian & English, relative & absolute).
     */
    public function extractDates(string $text): array
    {
        $dates = [];
        $today = Carbon::today('Asia/Jakarta');
        $lower = mb_strtolower($text);

        // 1. Relative dates (Indonesian & English)
        if (preg_match('/\b(hari ini|sekarang|today)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'today', 'date' => $today->format('Y-m-d')];
        }
        if (preg_match('/\b(kemarin|yesterday)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'yesterday', 'date' => $today->copy()->subDay()->format('Y-m-d')];
        }
        if (preg_match('/\b(besok|tomorrow)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'tomorrow', 'date' => $today->copy()->addDay()->format('Y-m-d')];
        }
        if (preg_match('/\blusa\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'lusa', 'date' => $today->copy()->addDays(2)->format('Y-m-d')];
        }
        if (preg_match('/\b(minggu depan|next week)\b/', $lower)) {
            $dates[] = ['type' => 'relative', 'raw' => 'next week', 'date' => $today->copy()->addWeek()->format('Y-m-d')];
        }
        if (preg_match('/(\d+)\s*(?:hari\s*lagi|days?\s*from\s*now)/i', $lower, $m)) {
            $dates[] = ['type' => 'relative', 'raw' => $m[0], 'date' => $today->copy()->addDays((int) $m[1])->format('Y-m-d')];
        } elseif (preg_match('/in\s+(\d+)\s*days?\b/i', $lower, $m)) {
            $dates[] = ['type' => 'relative', 'raw' => $m[0], 'date' => $today->copy()->addDays((int) $m[1])->format('Y-m-d')];
        }

        // 2. Absolute ISO format: YYYY-MM-DD
        if (preg_match_all('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $matches)) {
            foreach ($matches[1] as $isoDate) {
                try {
                    $c = Carbon::parse($isoDate);
                    $dates[] = ['type' => 'iso', 'raw' => $isoDate, 'date' => $c->format('Y-m-d')];
                } catch (\Throwable $e) {
                }
            }
        }

        // 3. DD/MM/YYYY or DD-MM-YYYY
        if (preg_match_all('/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $d = (int) $m[1];
                $mo = (int) $m[2];
                $y = (int) $m[3];
                if ($d >= 1 && $d <= 31 && $mo >= 1 && $mo <= 12) {
                    $dates[] = [
                        'type' => 'dmy',
                        'raw'  => $m[0],
                        'date' => sprintf('%04d-%02d-%02d', $y, $mo, $d),
                    ];
                }
            }
        }

        // 4. Natural date format: DD [Month] YYYY (e.g. 15 Desember 2026 / 15 Dec 2026)
        $monthMap = [
            'januari' => '01', 'jan' => '01', 'january' => '01',
            'februari' => '02', 'feb' => '02', 'february' => '02',
            'maret' => '03', 'mar' => '03', 'march' => '03',
            'april' => '04', 'apr' => '04',
            'mei' => '05', 'may' => '05',
            'juni' => '06', 'jun' => '06', 'june' => '06',
            'juli' => '07', 'jul' => '07', 'july' => '07',
            'agustus' => '08', 'agu' => '08', 'aug' => '08', 'august' => '08',
            'september' => '09', 'sep' => '09', 'sept' => '09',
            'oktober' => '10', 'okt' => '10', 'oct' => '10', 'october' => '10',
            'november' => '11', 'nov' => '11',
            'desember' => '12', 'des' => '12', 'dec' => '12', 'december' => '12',
        ];

        $monthPattern = implode('|', array_keys($monthMap));
        if (preg_match_all('/\b(\d{1,2})\s+(' . $monthPattern . ')\s+(\d{4})\b/i', $lower, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $day   = str_pad($match[1], 2, '0', STR_PAD_LEFT);
                $month = $monthMap[strtolower($match[2])] ?? '01';
                $year  = $match[3];
                $dates[] = [
                    'type' => 'natural',
                    'raw'  => $match[0],
                    'date' => "{$year}-{$month}-{$day}",
                ];
            }
        }

        // 5. English Month DD, YYYY (e.g. Dec 15, 2026)
        if (preg_match_all('/\b(' . $monthPattern . ')\s+(\d{1,2}),?\s+(\d{4})\b/i', $lower, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $month = $monthMap[strtolower($match[1])] ?? '01';
                $day   = str_pad($match[2], 2, '0', STR_PAD_LEFT);
                $year  = $match[3];
                $dates[] = [
                    'type' => 'natural_en',
                    'raw'  => $match[0],
                    'date' => "{$year}-{$month}-{$day}",
                ];
            }
        }

        return $dates;
    }

    /**
     * Extract predecessor notations like:
     * FS, SS, FF, SF, FS+2, SS-1d, FS lag 3 hari, lead 2 days.
     */
    public function extractPredecessorSyntax(string $text): array
    {
        $depType = 'FS';
        $lag     = 0;
        $lead    = 0;
        $matched = false;

        if (preg_match('/\b(FS|SS|FF|SF)\b/i', $text, $mType)) {
            $depType = strtoupper($mType[1]);
            $matched = true;
        }

        if (preg_match('/(?:lag\s*|\+)\s*(\d+)\s*(?:d|days?|hari)?\b/i', $text, $mLag)) {
            $lag = (int) $mLag[1];
            $matched = true;
        } elseif (preg_match('/(?:lead\s*|(?<=[a-zA-Z])\s*-\s*)(\d+)\s*(?:d|days?|hari)?\b/i', $text, $mLead)) {
            $lead = (int) $mLead[1];
            $matched = true;
        }

        if ($matched) {
            return [[
                'dep_type' => $depType,
                'lag'      => $lag,
                'lead'     => $lead,
                'raw'      => $text,
            ]];
        }

        return [];
    }

    /**
     * Extract PROVIS task/project status labels mentioned in prompt (ID + EN synonyms).
     */
    public function extractStatuses(string $text): array
    {
        $lower = mb_strtolower($text);
        $found = [];

        $map = [
            'Outstanding' => ['outstanding', 'belum terpenuhi', 'pr belum', 'pr pending', 'unfulfilled', 'barang pr', 'outstanding pr'],
            'Completed'   => ['completed', 'complete', 'selesai', 'tuntas', 'done'],
            'Delayed'     => ['delayed', 'terlambat', 'telat', 'molor', 'overdue', 'off-plan', 'off plan'],
            'At Risk'     => ['at risk', 'at-risk', 'berisiko', 'rawan'],
            'On Track'    => ['on track', 'on-track', 'sedang berjalan', 'in progress'],
            'Open'        => ['status open', 'belum mulai', 'belum dimulai', 'not started', 'open task', 'task open', 'jadi open', 'ke open', 'to open'],
            'Cancelled'   => ['cancelled', 'canceled', 'dibatalkan'],
        ];

        foreach ($map as $canonical => $synonyms) {
            foreach ($synonyms as $syn) {
                if (preg_match('/\b' . preg_quote($syn, '/') . '\b/i', $lower)) {
                    $found[] = $canonical;
                    break;
                }
            }
        }

        // Also match standalone "open" when paired with status verbs
        if (!in_array('Open', $found, true) && preg_match('/\b(?:status|filter|yang|mark|set)\b.*\bopen\b/i', $lower)) {
            $found[] = 'Open';
        }

        return array_values(array_unique($found));
    }

    /**
     * Extract explicit progress percentages (e.g. "50%", "jadi 75", "to 80%").
     */
    public function extractPercentages(string $text): array
    {
        $values = [];
        if (preg_match_all('/\b(\d{1,3})\s*(?:%|persen|percent)\b/i', $text, $matches)) {
            foreach ($matches[1] as $v) {
                $num = (int) $v;
                if ($num >= 0 && $num <= 100) {
                    $values[] = $num;
                }
            }
        }

        if (empty($values) && preg_match('/\b(?:progres|progress)\b.*?\b(?:jadi|ke|menjadi|to|=)\s*(\d{1,3})\b/i', $text, $m)) {
            $num = (int) $m[1];
            if ($num >= 0 && $num <= 100) {
                $values[] = $num;
            }
        }

        return array_values(array_unique($values));
    }

    /**
     * Match accessible projects by explicit ID or fuzzy title matching.
     */
    public function matchProjects(string $text, array $accessibleProjectIds = []): array
    {
        $query = Project::query()->select(['id', 'title', 'companies_id', 'status', 'progress']);
        if (!empty($accessibleProjectIds)) {
            $query->whereIn('id', $accessibleProjectIds);
        }

        $projects = $query->get();
        if ($projects->isEmpty()) {
            return [];
        }

        $explicitId = $this->extractProjectIdFromPrompt($text);
        if ($explicitId) {
            $exact = $projects->firstWhere('id', $explicitId);
            if ($exact) {
                return [[
                    'id'    => $exact->id,
                    'title' => $exact->title,
                    'score' => 100.0,
                ]];
            }
        }

        $normPrompt   = $this->normalizeForSearch($text);
        $promptTokens = $this->searchTokens($normPrompt);
        $scored       = [];

        // Generic everyday/role/test words that MUST NOT trigger a false single-token project match
        // (e.g. "lho aku baru menyapa" must NEVER match "PROJECT PIC 4 BARU" just because of "baru"!)
        $genericProjectTokens = [
            'baru', 'lama', 'new', 'old', 'test', 'tes', 'testing', 'coba', 'empty', 'kosong',
            'pic', 'admin', 'worker', 'user', 'target', 'utama', 'kerja', 'sistem', 'provis',
            'special', 'secret', 'data', 'for', 'the', 'and', 'of', 'aku', 'saya', 'kamu',
            'bisa', 'sudah', 'belum', 'atas', 'bawah', 'balik', 'lho', 'wkwk', 'oke', 'halo', 'hai',
            'satu', 'dua', 'tiga', 'empat', 'lima',
        ];

        foreach ($projects as $p) {
            $normTitle = $this->normalizeForSearch($p->title);
            if ($normTitle === '') {
                continue;
            }

            $score     = 0.0;
            $usedFuzzy = false;
            $fuzzyFrom = null;

            // Exact substring match of full project title (skip overly generic single-word titles unless explicitly paired with project keyword)
            $isGenericSingleWord = !str_contains($normTitle, ' ') && in_array($normTitle, $genericProjectTokens, true);
            if (
                strlen($normTitle) >= 3
                && str_contains($normPrompt, $normTitle)
                && (!$isGenericSingleWord || preg_match('/\b(proyek|projek|projeck|project)\b/i', $normPrompt))
            ) {
                $score += 50.0 + strlen($normTitle);
            } else {
                $titleTokens = $this->searchTokens($normTitle);
                if (empty($titleTokens)) {
                    continue;
                }

                $hits             = 0.0;
                $distinctiveHits  = 0.0;
                $maxDistinctLen   = 0;
                $firstDistinctHit = false;
                $firstDistinctTok = null;
                $usedFuzzy        = false;
                $fuzzyFrom        = null;
                foreach ($titleTokens as $tt) {
                    if (strlen($tt) >= 3 && !in_array($tt, $genericProjectTokens, true)) {
                        $firstDistinctTok = $tt;
                        break;
                    }
                }
                foreach ($titleTokens as $tt) {
                    if (strlen($tt) < 2) {
                        continue;
                    }
                    $isDistinctive = !in_array($tt, $genericProjectTokens, true) && strlen($tt) >= 3;
                    foreach ($promptTokens as $pt) {
                        if ($pt === $tt) {
                            $hits += 1.0;
                            if ($isDistinctive) {
                                $distinctiveHits += 1.0;
                                $maxDistinctLen = max($maxDistinctLen, strlen($tt));
                                if ($tt === $firstDistinctTok) {
                                    $firstDistinctHit = true;
                                }
                            }
                            break;
                        }
                        if (strlen($pt) >= 5 && strlen($tt) >= 5 && abs(strlen($pt) - strlen($tt)) <= 2) {
                            if (levenshtein($pt, $tt) <= 1) {
                                $hits += 0.85;
                                $usedFuzzy = true;
                                $fuzzyFrom = $pt;
                                if ($isDistinctive) {
                                    $distinctiveHits += 0.85;
                                    $maxDistinctLen = max($maxDistinctLen, strlen($tt));
                                }
                                break;
                            }
                        }
                    }
                }

                $coverage = $hits / count($titleTokens);
                $hasProjectWord = (bool) preg_match('/\b(proyek|projek|projeck|project)\b/i', $normPrompt);
                $validFuzzy = false;
                if (count($titleTokens) === 1) {
                    // Single-token title must match a distinctive (non-generic) word
                    $validFuzzy = $distinctiveHits >= 0.85;
                } else {
                    // Multi-token title: require >= 1.7 total hits with >= 1 distinctive hit,
                    // OR >= 2.0 total hits (e.g. "pic 4 baru"),
                    // OR strong single distinctive token >= 5 chars with >= 0.5 coverage,
                    // OR exact match on leading distinctive acronym (e.g. "projek KWT", "projek UBC")
                    $validFuzzy = ($hits >= 1.7 && $distinctiveHits >= 0.85)
                        || ($hits >= 2.0)
                        || ($coverage >= 0.5 && $distinctiveHits >= 0.85 && $maxDistinctLen >= 5)
                        || ($firstDistinctHit && $hasProjectWord);
                }

                if ($validFuzzy) {
                    $score = ($hits * 12.0) + ($coverage * 15.0) + ($distinctiveHits * 6.0);
                }
            }

            if ($score > 0) {
                $scored[] = [
                    'id'           => $p->id,
                    'title'        => $p->title,
                    'score'        => round($score, 2),
                    'had_typo'     => $usedFuzzy ?? false,
                    'matched_from' => $fuzzyFrom ?? null,
                ];
            }
        }

        usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($scored, 0, 5);
    }

    /**
     * Match tasks inside a project via:
     * 1. Technical IDs (`WBS-01`, `st-...`, `TASK-...`)
     * 2. Hierarchical display WBS codes (`1.1.1`, `10.1.5`)
     * 3. Natural fuzzy name search (`Instalasi Scrubber`, `Pengecoran Pondasi`, etc.)
     *
     * Preserves mention order in prompt when multiple IDs/codes are specified (crucial for predecessor target vs pred!).
     */
    protected function matchTasksInProject(string $text, int $projectId): array
    {
        $mainWbsList = MainWbs::where('projects_id', $projectId)
            ->orderBy('order_index')
            ->orderBy('id')
            ->with([
                'subWbs' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
                'subWbs.wbsTasks' => fn($q) => $q->orderBy('order_index')->orderBy('id'),
            ])
            ->get();

        // Build flat catalog with true WBS display codes (1.1.1, 1.2.1, etc.)
        $catalog = [];
        foreach ($mainWbsList as $mIdx => $mj) {
            $mjCode = (string) ($mIdx + 1);
            foreach ($mj->subWbs as $sIdx => $smj) {
                $smjCode = $mjCode . '.' . ($sIdx + 1);
                foreach ($smj->wbsTasks as $tIdx => $task) {
                    $taskCode = $smjCode . '.' . ($tIdx + 1);
                    $catalog[] = [
                        'id'         => $task->id,
                        'code'       => $taskCode,
                        'sub_code'   => $smjCode,
                        'name'       => $task->name,
                        'sub_name'   => $smj->name,
                        'main_name'  => $mj->name,
                        'start'      => $task->start,
                        'end'        => $task->end,
                        'status'     => $task->status,
                        'progress'   => (float) ($task->progress ?? 0),
                    ];
                }
            }
        }

        if (empty($catalog)) {
            return [];
        }

        $matchedById = [];
        $orderedResults = [];

        // 1. Explicit IDs & WBS Codes in order of appearance in the prompt
        preg_match_all('/\b(\d+\.\d+\.\d+|\d+\.\d+|st-[\w-]+|wbs-[\w-]+|task-[\w-]+)\b/i', $text, $codeMatches);
        $candidateCodes = $codeMatches[1] ?? [];

        foreach ($candidateCodes as $cand) {
            $candLower = strtolower($cand);
            foreach ($catalog as $item) {
                $idLower = strtolower((string) $item['id']);
                $codeLower = strtolower($item['code']);
                $subCodeLower = strtolower($item['sub_code']);

                $isHit = ($idLower === $candLower)
                    || Str::startsWith($idLower, $candLower)
                    || ($codeLower === $candLower)
                    || ($subCodeLower === $candLower && !str_contains($cand, '-'));

                if ($isHit && !isset($matchedById[$item['id']])) {
                    $item['match_type'] = 'code_or_id';
                    $item['score'] = 100.0;
                    $matchedById[$item['id']] = true;
                    $orderedResults[] = $item;
                    // For exact ID or 3-tier code match, stop after first hit
                    if ($idLower === $candLower || $codeLower === $candLower) {
                        break;
                    }
                }
            }
        }

        // 2. Fuzzy Natural Task Name Matching (skip if 2+ explicit IDs/codes already matched)
        if (count($orderedResults) < 2) {
            $normPrompt   = $this->normalizeForSearch($text);
            $promptTokens = $this->searchTokens($normPrompt);
            $fuzzyHits    = [];

            foreach ($catalog as $item) {
                if (isset($matchedById[$item['id']])) {
                    continue;
                }

                $normName = $this->normalizeForSearch($item['name']);
                if ($normName === '' || strlen($normName) < 3) {
                    continue;
                }

                $score = 0.0;
                $pos   = mb_strpos($normPrompt, $normName);

                if ($pos !== false) {
                    $score = 60.0 + strlen($normName);
                } else {
                    $nameTokens = $this->searchTokens($normName);
                    if (empty($nameTokens)) {
                        continue;
                    }

                    $hits = 0.0;
                    $firstPos = 99999;
                    foreach ($nameTokens as $nt) {
                        if (strlen($nt) < 3) {
                            continue;
                        }
                        foreach ($promptTokens as $pt) {
                            if ($pt === $nt) {
                                $hits += 1.0;
                                $pPos = mb_strpos($normPrompt, $pt);
                                if ($pPos !== false && $pPos < $firstPos) {
                                    $firstPos = $pPos;
                                }
                                break;
                            }
                            if (strlen($pt) >= 5 && strlen($nt) >= 5 && abs(strlen($pt) - strlen($nt)) <= 2) {
                                if (levenshtein($pt, $nt) <= 1) {
                                    $hits += 0.85;
                                    $pPos = mb_strpos($normPrompt, $pt);
                                    if ($pPos !== false && $pPos < $firstPos) {
                                        $firstPos = $pPos;
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    $coverage = $hits / count($nameTokens);
                    if (($hits >= 1.7) || ($coverage >= 0.5 && $hits >= 0.85 && strlen($normName) >= 4)) {
                        $score = ($hits * 14.0) + ($coverage * 18.0);
                        $pos = $firstPos;
                    }
                }

                if ($score >= 20.0) {
                    $item['match_type'] = 'fuzzy_name';
                    $item['score']      = round($score, 2);
                    $item['pos']        = is_int($pos) ? $pos : 99999;
                    $fuzzyHits[]        = $item;
                }
            }

            usort($fuzzyHits, fn($a, $b) => $b['score'] <=> $a['score']);
            $topFuzzy = array_slice($fuzzyHits, 0, 5);

            // If we got 2 fuzzy hits in a predecessor prompt, keep them ordered by position in prompt
            if (count($topFuzzy) >= 2 && preg_match('/\b(predecessor|dependensi|hubungkan|sambungkan|connect|link|ke|to|dengan)\b/i', $text)) {
                $pair = array_slice($topFuzzy, 0, 2);
                usort($pair, fn($a, $b) => ($a['pos'] ?? 0) <=> ($b['pos'] ?? 0));
                $topFuzzy = array_merge($pair, array_slice($topFuzzy, 2));
            }

            foreach ($topFuzzy as $fh) {
                unset($fh['pos']);
                $orderedResults[] = $fh;
            }
        }

        return array_slice($orderedResults, 0, 8);
    }

    /**
     * Match SubWbs (Level 2) in a project for adding new leaf tasks.
     */
    protected function matchSubWbsInProject(string $text, int $projectId): array
    {
        $subList = SubWbs::whereHas('mainWbs', fn($q) => $q->where('projects_id', $projectId))
            ->with('mainWbs')
            ->get(['id', 'sub_wbs_id', 'name', 'start', 'end']);

        if ($subList->isEmpty()) {
            return [];
        }

        $normPrompt   = $this->normalizeForSearch($text);
        $promptTokens = $this->searchTokens($normPrompt);
        $hits         = [];

        foreach ($subList as $sub) {
            $normName = $this->normalizeForSearch($sub->name);
            if ($normName === '') {
                continue;
            }

            $score = 0.0;
            if (strlen($normName) >= 3 && str_contains($normPrompt, $normName)) {
                $score = 50.0 + strlen($normName);
            } else {
                $subTokens = $this->searchTokens($normName);
                if (empty($subTokens)) {
                    continue;
                }
                $h = 0.0;
                foreach ($subTokens as $st) {
                    if (strlen($st) < 3) {
                        continue;
                    }
                    foreach ($promptTokens as $pt) {
                        if ($pt === $st || (strlen($pt) >= 5 && strlen($st) >= 5 && levenshtein($pt, $st) <= 1)) {
                            $h += 1.0;
                            break;
                        }
                    }
                }
                $cov = $h / count($subTokens);
                if ($h >= 1.0 && $cov >= 0.5) {
                    $score = ($h * 12.0) + ($cov * 15.0);
                }
            }

            if ($score > 0) {
                $hits[] = [
                    'id'        => $sub->id,
                    'name'      => $sub->name,
                    'main_name' => $sub->mainWbs?->name ?? '',
                    'score'     => round($score, 2),
                ];
            }
        }

        usort($hits, fn($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($hits, 0, 3);
    }

    /**
     * Match known division names (including common Indonesian aliases & typo tolerance).
     */
    protected function matchDivisions(string $text): array
    {
        $divisions = Division::all(['id', 'divisi']);
        $matched   = [];
        $lower     = mb_strtolower($text);

        $aliases = [
            'eng'         => 'engineering',
            'teknik'      => 'engineering',
            'mtc'         => 'maintenance',
            'perawatan'   => 'maintenance',
            'ops'         => 'operation',
            'operasional' => 'operation',
            'produksi'    => 'production',
            'production'  => 'produksi',
            'keuangan'    => 'finance',
            'pembelian'   => 'purchasing',
            'pengadaan'   => 'procurement',
            'penjualan'   => 'sales',
            'busdev'      => 'busdev',
            'hr'          => 'hrga',
        ];

        $expanded = $lower;
        foreach ($aliases as $short => $full) {
            if (preg_match('/\b' . preg_quote($short, '/') . '\b/i', $lower)) {
                $expanded .= ' ' . $full;
            }
        }

        $promptTokens = array_values(array_filter(preg_split('/[^a-z0-9]+/u', $expanded) ?: []));

        foreach ($divisions as $div) {
            $divLower = mb_strtolower(trim($div->divisi));
            if ($divLower === '' || strlen($divLower) < 2) {
                continue;
            }

            $hit       = false;
            $usedFuzzy = false;
            $fuzzyFrom = null;
            // Use word boundary for short names like "PM", "IT", "QC", "SHE" to avoid matching inside words
            if (strlen($divLower) <= 3) {
                if (preg_match('/\b' . preg_quote($divLower, '/') . '\b/i', $expanded)) {
                    $hit = true;
                }
            } elseif (str_contains($expanded, $divLower)) {
                $hit = true;
            } elseif (strlen($divLower) >= 5) {
                // Fuzzy typo tolerance (e.g. "maintenace", "enginnering", "procurenment")
                foreach ($promptTokens as $pt) {
                    if (strlen($pt) >= 5 && abs(strlen($pt) - strlen($divLower)) <= 2 && levenshtein($pt, $divLower) <= 1) {
                        $hit       = true;
                        $usedFuzzy = true;
                        $fuzzyFrom = $pt;
                        break;
                    }
                }
            }

            if ($hit) {
                $matched[] = [
                    'id'           => $div->id,
                    'name'         => $div->divisi,
                    'had_typo'     => $usedFuzzy,
                    'matched_from' => $fuzzyFrom,
                ];
            }
        }

        return $matched;
    }

    /**
     * Match ANY company currently registered in the `companies` table dynamically
     * (zero hardcoding — punctuation-insensitive, prefix-optional, short-PT aware, & typo-tolerant!).
     */
    protected function matchCompanies(string $text, bool $isIsolatedCandidate = false): array
    {
        $companies = Company::all(['id', 'name']);
        if ($companies->isEmpty()) {
            return [];
        }

        $normPrompt   = $this->normalizeForSearch($text);
        if ($normPrompt === '') {
            return [];
        }
        $cleanPrompt  = trim(preg_replace('/^(?:pt|cv|ud|pd)\s+/i', '', $normPrompt) ?? $normPrompt);
        $promptTokens = array_values(array_filter(explode(' ', $normPrompt)));
        $genericComp  = ['pt', 'cv', 'tbk', 'persero', 'ud', 'pd', 'inc', 'ltd', 'corp', 'co', 'company', 'perusahaan', 'pic', 'baru', 'test', 'tes', 'dan', 'and', 'of'];
        $scored       = [];

        foreach ($companies as $comp) {
            $normName  = $this->normalizeForSearch($comp->name);
            $cleanName = trim(preg_replace('/^(?:pt|cv|ud|pd)\s+/i', '', $normName) ?? $normName);
            if (strlen($cleanName) < 2) {
                continue;
            }

            $score     = 0.0;
            $usedFuzzy = false;
            $fuzzyFrom = null;

            // 1. Exact full normalized name match (supports short PTs like "PT. IG", "PT. ABC", AND long PTs like "PT. KARABHA WIRATAMA")
            if (preg_match('/\b' . preg_quote($normName, '/') . '\b/i', $normPrompt)) {
                $score = 100.0 + strlen($normName);
            } elseif (preg_match('/\b(?:pt|cv|ud|pd)\s+' . preg_quote($cleanName, '/') . '\b/i', $normPrompt)) {
                // 2. Prefix + short/long clean name ("pt ig", "pt abc", "cv maju")
                $score = 96.0 + strlen($cleanName);
            } elseif ($isIsolatedCandidate && ($cleanPrompt === $cleanName || $normPrompt === $normName)) {
                // 3. Isolated candidate extracted from "di (nama pt)" matches even 2-3 char company names ("di ABC" -> "PT. ABC")
                $score = 94.0 + strlen($cleanName);
            } elseif (strlen($cleanName) >= 4 && preg_match('/\b' . preg_quote($cleanName, '/') . '\b/i', $normPrompt)) {
                // 4. Prefix-stripped full name match ("karabha wiratama", "hanwa royal metals", "sinar jaya")
                $score = 90.0 + strlen($cleanName);
            } else {
                // 5. Distinctive token-level exact + Levenshtein fuzzy match for ANY company name
                $compTokens = array_values(array_filter(
                    explode(' ', $cleanName),
                    fn($t) => strlen($t) >= 3 && !in_array($t, $genericComp, true)
                ));
                if (empty($compTokens)) {
                    continue;
                }

                $hits          = 0.0;
                $maxMatchedLen = 0;
                foreach ($compTokens as $ct) {
                    $cLen    = strlen($ct);
                    $maxDist = $cLen >= 7 ? 2 : ($cLen >= 5 ? 1 : 0);

                    foreach ($promptTokens as $pt) {
                        if ($pt === $ct) {
                            $hits += 1.0;
                            $maxMatchedLen = max($maxMatchedLen, $cLen);
                            break;
                        }
                        if ($maxDist > 0 && strlen($pt) >= 4 && abs(strlen($pt) - $cLen) <= $maxDist) {
                            $dist = levenshtein($pt, $ct);
                            if ($dist <= $maxDist) {
                                $hits += ($dist === 1 ? 0.9 : 0.75);
                                $maxMatchedLen = max($maxMatchedLen, $cLen);
                                $usedFuzzy = true;
                                $fuzzyFrom = $pt;
                                break;
                            }
                        }
                    }
                }

                $coverage = $hits / count($compTokens);
                if (
                    $hits >= 1.5
                    || ($coverage >= 0.5 && $hits >= 0.85 && $maxMatchedLen >= 5)
                    || (count($compTokens) === 1 && $hits >= 0.85 && ($maxMatchedLen >= 4 || ($isIsolatedCandidate && $maxMatchedLen >= 2)))
                ) {
                    $score = ($hits * 22.0) + ($coverage * 20.0);
                }
            }

            if ($score > 0) {
                $scored[] = [
                    'id'           => $comp->id,
                    'name'         => $comp->name,
                    'score'        => round($score, 2),
                    'had_typo'     => $usedFuzzy,
                    'matched_from' => $fuzzyFrom,
                ];
            }
        }

        usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

        return array_map(fn($c) => [
            'id'           => $c['id'],
            'name'         => $c['name'],
            'had_typo'     => $c['had_typo'],
            'matched_from' => $c['matched_from'],
        ], array_slice($scored, 0, 3));
    }

    /**
     * Heavy / ambiguous typo candidate finder for Company variables (e.g. "pt krbh" -> "PT. KARABHA WIRATAMA").
     * Only returns candidates when genuinely similar (consonant skeleton match or >= 54% similarity),
     * so completely non-existent companies ("PT Tidak Ada XYZ") return empty []!
     *
     * @return array<int, array{id: int, label: string, similarity: float}>
     */
    public function findHeavyTypoCompanies(string $candidate): array
    {
        $normCand  = $this->normalizeForSearch($candidate);
        $cleanCand = trim(preg_replace('/^(?:pt|cv|ud|pd)\s+/i', '', $normCand) ?? $normCand);
        if (strlen($cleanCand) < 3) {
            return [];
        }

        $candTokens = array_values(array_filter(explode(' ', $cleanCand), fn($t) => strlen($t) >= 3));
        $candSkel   = $this->consonantSkeleton(str_replace(' ', '', $cleanCand));
        $matches    = [];

        foreach (Company::all(['id', 'name']) as $comp) {
            $normName  = $this->normalizeForSearch($comp->name);
            $cleanName = trim(preg_replace('/^(?:pt|cv|ud|pd)\s+/i', '', $normName) ?? $normName);
            if (strlen($cleanName) < 3) {
                continue;
            }

            $compTokens = array_values(array_filter(explode(' ', $cleanName), fn($t) => strlen($t) >= 3));
            $compSkel   = $this->consonantSkeleton(str_replace(' ', '', $cleanName));
            $bestSim    = 0.0;

            // 1. Consonant skeleton match ("krbh" matches "karabha" -> "krbh", "snrnstr" matches "sinar nusantara")
            if (strlen($candSkel) >= 3) {
                foreach ($compTokens as $ct) {
                    $ctSkel = $this->consonantSkeleton($ct);
                    if (strlen($ctSkel) >= 3 && ($ctSkel === $candSkel || (strlen($candSkel) >= 4 && str_starts_with($ctSkel, $candSkel)))) {
                        $bestSim = max($bestSim, 75.0);
                    }
                }
                if (strlen($candSkel) >= 4 && ($compSkel === $candSkel || str_starts_with($compSkel, $candSkel))) {
                    $bestSim = max($bestSim, 78.0);
                }
            }

            // 2. Per-token consonant-skeleton or relaxed Levenshtein match ("krbh wrtm" -> "karabha wiratama")
            if (!empty($candTokens) && !empty($compTokens)) {
                $tHits = 0;
                foreach ($candTokens as $ctk) {
                    $cSk = $this->consonantSkeleton($ctk);
                    foreach ($compTokens as $ntk) {
                        $nSk = $this->consonantSkeleton($ntk);
                        similar_text($ctk, $ntk, $tokPct);
                        if (
                            (strlen($cSk) >= 3 && $cSk === $nSk)
                            || (strlen($ctk) >= 4 && strlen($ntk) >= 4 && $ctk[0] === $ntk[0] && $tokPct >= 62.0)
                        ) {
                            $tHits++;
                            break;
                        }
                    }
                }
                if ($tHits > 0 && ($tHits / count($candTokens)) >= 0.5) {
                    $bestSim = max($bestSim, 65.0 + (($tHits / count($candTokens)) * 15.0));
                }
            }

            // 3. Overall string similarity (>= 56% with matching initial letter)
            similar_text(str_replace(' ', '', $cleanCand), str_replace(' ', '', $cleanName), $fullPct);
            if ($fullPct >= 56.0 && $cleanCand[0] === $cleanName[0]) {
                $bestSim = max($bestSim, $fullPct);
            }

            if ($bestSim >= 56.0) {
                $matches[] = [
                    'id'         => $comp->id,
                    'label'      => $comp->name,
                    'similarity' => round($bestSim, 1),
                ];
            }
        }

        usort($matches, fn($a, $b) => $b['similarity'] <=> $a['similarity']);
        return array_slice($matches, 0, 3);
    }

    /**
     * Dynamically extract a company name slot from generic queries such as:
     * - "jumlah karyawan di (nama pt)"
     * - "jumlah akun / worker / pic di (nama pt)"
     * - "daftar projek di (nama pt)"
     * - "detail perusahaan (nama pt)"
     * Works for ANY PT name (including brand-new or not-yet-registered PTs!).
     */
    public function extractRequestedCompanyName(string $text): ?string
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return null;
        }

        $patterns = [
            // 1. Explicit legal prefix after preposition: "di PT Maju Jaya", "milik CV. Sinar Abadi", "perusahaan PT. ABC"
            '/\b(?:di|pada|milik|dari|untuk|perusahaan|company)\s+((?:pt|cv|ud|pd)\.?\s+[a-z0-9][a-z0-9\s\.\-&]{1,70})/i',
            // 2. Direct "perusahaan X" / "company X"
            '/\b(?:detail|info|analisis|analisa|cek|profil)\s+(?:perusahaan|company)\s+([a-z0-9][a-z0-9\s\.\-&]{1,70})/i',
            // 3. Generic work-entity-in-location slot: "jumlah karyawan di X", "jumlah worker di X", "daftar projek di X"
            '/\b(?:jumlah|berapa|daftar|siapa\s+(?:saja|aja)|ada\s+berapa|total)\s+(?:karyawan|akun|user|users|pengguna|pegawai|worker|workers|pic|pics|admin|admins|projek|proyek|project|projects)\s+(?:di|pada|milik|dari)\s+([a-z0-9][a-z0-9\s\.\-&]{1,70})/i',
        ];

        $nonCompanyBlocklist = '/^(?:sistem|system|provis|sistem\s+provis|provis\s+ini|sistem\s+ini|dalam\s+sistem|dalam\s+provis|dalam\s+projek|dalam\s+proyek|projek|proyek|project|divisi|division|bagian|sini|situ|atas|bawah|semua|seluruh|masing[\s-]masing|hari\s+ini|minggu\s+ini|bulan\s+ini|tahun\s+ini|mana|apa|siapa|yang|ini|itu)\b/i';

        foreach ($patterns as $rx) {
            if (preg_match($rx, $trimmed, $m)) {
                $cand = trim($m[1]);
                // Trim trailing conversational fillers or clauses
                $cand = preg_replace('/\s+(?:ya|yah|dong|bro|min|nih|sih|sekarang|saat\s+ini|hari\s+ini|di\s+provis|di\s+sistem|pada\s+provis|yang\s+ada|yang\s+terdaftar|ada\s+berapa|berapa).*$/i', '', $cand) ?? $cand;
                $cand = trim($cand, " \t\n\r\0\x0B.,;:\"'?!");

                if (strlen($cand) >= 2 && strlen($cand) <= 80 && !preg_match($nonCompanyBlocklist, $cand)) {
                    return $cand;
                }
            }
        }

        return null;
    }

    /**
     * Extract canonical semantic concepts from free-form Indonesian/English prompts
     * using rich synonym dictionaries + Levenshtein typo tolerance (100% local PHP).
     *
     * @return array<string, bool> Map of concept tag => true
     */
    public function extractSemanticConcepts(string $text): array
    {
        $lower  = mb_strtolower(trim($text));
        $norm   = $this->normalizeForSearch($text);
        $tokens = array_values(array_filter(explode(' ', $norm)));

        $lexicon = [
            'ENTITY_USER' => [
                'phrases' => ['pengguna', 'beta tester', 'anggota tim', 'team member', 'working tree', 'user management', 'manajemen user', 'orang yang'],
                'words'   => ['user', 'users', 'akun', 'account', 'accounts', 'pengguna', 'karyawan', 'pegawai', 'staff', 'staf', 'orang', 'member', 'members', 'anggota', 'personel', 'personil', 'pekerja', 'profil', 'profile'],
            ],
            'ROLE_SUPERADMIN' => [
                'phrases' => ['super admin', 'super administrator'],
                'words'   => ['superadmin'],
            ],
            'ROLE_ADMIN' => [
                'phrases' => ['admin utama', 'admin progres'],
                'words'   => ['admin', 'admins', 'administrator', 'admin_utama', 'admin_progres'],
            ],
            'ROLE_PIC' => [
                'phrases' => ['project manager', 'manajer proyek', 'manajer projek', 'penanggung jawab', 'ketua proyek', 'ketua projek'],
                'words'   => ['pic', 'pics', 'manager', 'pm', 'leader'],
            ],
            'ROLE_WORKER' => [
                'phrases' => ['karyawan lapangan', 'pekerja lapangan'],
                'words'   => ['worker', 'workers', 'pekerja', 'operator', 'teknisi', 'pelaksana'],
            ],
            'ROLE_BETA' => [
                'phrases' => ['beta tester', 'akses ai', 'pengguna ai', 'tester ai'],
                'words'   => ['beta'],
            ],
            'ENTITY_PROJECT' => [
                'phrases' => ['all projects', 'semua proyek', 'semua projek'],
                'words'   => ['proyek', 'projek', 'projeck', 'project', 'projects', 'projekku', 'proyekku', 'projeknya', 'proyeknya', 'portofolio', 'portfolio'],
            ],
            'ENTITY_COMPANY' => [
                'phrases' => ['nama perusahaan', 'daftar pt', 'berapa pt', 'jumlah pt'],
                'words'   => ['perusahaan', 'company', 'companies', 'klien', 'client', 'clients', 'tenant', 'korporasi', 'pt', 'cv'],
            ],
            'ENTITY_DIVISION' => [
                'phrases' => ['per divisi', 'by division'],
                'words'   => ['divisi', 'division', 'divisions', 'departemen', 'department', 'bagian', 'unit', 'bidang'],
            ],
            'ENTITY_TASK' => [
                'phrases' => ['sub task', 'sub-task', 'daftar pekerjaan', 'item pekerjaan'],
                'words'   => ['task', 'tasks', 'pekerjaan', 'kerjaan', 'tugas', 'subtask', 'item', 'barang', 'aktivitas', 'kegiatan', 'job', 'jobs', 'tasknya', 'pekerjaannya'],
            ],
            'ENTITY_WBS_TREE' => [
                'phrases' => ['struktur wbs', 'hierarki wbs', 'main job', 'main jobs', 'main task', 'sub task', 'sub main job', 'wbs tree', '3 tier'],
                'words'   => ['hierarki', 'hierarchy', 'struktur'],
            ],
            'ENTITY_TEMPLATE' => [
                'phrases' => ['master template', 'template wbs', 'wbs template', 'template default', '17 task', '17 main'],
                'words'   => ['template', 'templates'],
            ],
            'ENTITY_BUDGET' => [
                'phrases' => ['sisa dana', 'sisa budget', 'realisasi anggaran', 'uang kepake', 'duit kepake', 'total pengeluaran', 'biaya proyek', 'biaya projek'],
                'words'   => ['budget', 'budgetnya', 'anggaran', 'dana', 'duit', 'uang', 'biaya', 'pengeluaran', 'belanja', 'expenditure', 'spending', 'cost', 'rupiah', 'pagu', 'capex', 'opex', 'keuangan'],
            ],
            'ENTITY_SCURVE' => [
                'phrases' => ['s curve', 's curve nya', 'kurva s', 'kurva-s', 'planned vs actual', 'weekly progress', 'progres mingguan', 'kapan selesai', 'estimasi selesai', 'prediksi selesai', 'ramalan selesai', 'ramalan progres'],
                'words'   => ['scurve', 's-curve', 'kurva', 'spi', 'prediksi', 'forecast', 'weekly', 'mingguan'],
            ],
            'ENTITY_BLOCKER' => [
                'phrases' => ['belum bisa mulai', 'cannot start', 'cannot complete', 'tergantung pada', 'depends on'],
                'words'   => ['terkunci', 'locked', 'gembok', 'blocker', 'penghambat', 'terhambat', 'blocked', 'kendala', 'mentok', 'predecessor', 'dependensi', 'dependency', 'ketergantungan'],
            ],
            'ENTITY_DEADLINE' => [
                'phrases' => ['hari ini', 'jatuh tempo', 'minggu ini', 'this week', 'due today', 'due soon', 'batas waktu'],
                'words'   => ['today', 'besok', 'deadline', 'due', 'tenggat', 'agenda'],
            ],
            'ENTITY_OVERDUE' => [
                'phrases' => ['off plan', 'off-plan', 'behind schedule', 'lewat deadline', 'lewat tenggat'],
                'words'   => ['terlambat', 'telat', 'delay', 'delayed', 'overdue', 'molor', 'ketinggalan', 'ngaret', 'deviasi'],
            ],
            'ENTITY_OUTSTANDING' => [
                'phrases' => ['purchase request', 'barang pr', 'pr belum', 'belum terpenuhi', 'belum datang', 'nunggu barang', 'unfulfilled pr'],
                'words'   => ['outstanding'],
            ],
            'ENTITY_AUDIT' => [
                'phrases' => ['audit log', 'riwayat aktivitas', 'log aktivitas', 'activity log', 'recent activity', 'siapa yang ubah', 'siapa yang edit', 'login terakhir'],
                'words'   => ['audit', 'riwayat', 'history', 'jejak', 'log', 'logs'],
            ],
            'ENTITY_PDF' => [
                'phrases' => ['unduh laporan', 'download report', 'export pdf', 'laporan eksekutif', 'executive report', 'cetak laporan'],
                'words'   => ['pdf', 'cetak', 'print', 'unduh', 'download', 'laporan', 'report'],
            ],
            'ENTITY_GIT' => [
                'phrases' => ['release notes', 'perubahan kode', 'code update', 'update kodingan'],
                'words'   => ['git', 'commit', 'commits', 'koding', 'kodingan', 'coding', 'changelog'],
            ],
            'ENTITY_SYSTEM' => [
                'phrases' => ['control panel', 'dashboard superadmin', 'kondisi sistem', 'statistik sistem', 'ringkasan sistem', 'status sistem', 'info sistem', 'rekap sistem', 'system overview', 'system stats', 'semua data', 'keseluruhan sistem'],
                'words'   => ['sistem', 'system', 'aplikasi', 'provis', 'keseluruhan'],
            ],
            'ENTITY_ACCESS' => [
                'phrases' => ['hak akses', 'yang bisa melihat', 'bisa melihat', 'bisa lihat', 'working tree', 'permission matrix'],
                'words'   => ['akses', 'izin', 'permission', 'visibilitas', 'visibility', 'private', 'privat', 'public', 'publik', 'rahasia'],
            ],
            'QUERY_COUNT' => [
                'phrases' => ['ada berapa', 'how many', 'total semua', 'jumlah semua'],
                'words'   => ['berapa', 'jumlah', 'jumlahnya', 'total', 'totalnya', 'banyak', 'banyaknya', 'count'],
            ],
            'QUERY_LIST' => [
                'phrases' => ['apa saja', 'apa aja', 'siapa saja', 'siapa aja', 'mana saja', 'mana aja', 'kasih lihat', 'ada apa'],
                'words'   => ['daftar', 'list', 'semua', 'tampilkan', 'tunjukkan', 'lihat', 'cek', 'sebutkan', 'info', 'data', 'cari', 'show', 'display', 'get', 'find', 'who', 'what', 'which'],
            ],
            'QUERY_RANK' => [
                'phrases' => ['paling tinggi', 'paling rendah', 'paling cepat', 'paling lambat', 'paling besar', 'paling kecil', 'paling baru', 'paling baik', 'paling bagus', 'paling buruk', 'paling jelek', 'recently created'],
                'words'   => ['tertinggi', 'terendah', 'tercepat', 'terbesar', 'terkecil', 'terbaru', 'terakhir', 'terbaik', 'terburuk', 'terjelek', 'highest', 'lowest', 'most', 'least', 'top', 'best', 'worst', 'latest', 'recent'],
            ],
        ];

        $concepts = [];

        foreach ($lexicon as $tag => $spec) {
            $hit = false;

            // 1. Multi-word phrase check
            foreach ($spec['phrases'] as $phrase) {
                if (str_contains($lower, $phrase) || str_contains($norm, $phrase)) {
                    $hit = true;
                    break;
                }
            }

            // 2. Word-level exact + Levenshtein fuzzy match (handles typos like "akunn", "workerr", "perusahan", "bujet")
            if (!$hit) {
                foreach ($spec['words'] as $kw) {
                    if (in_array($kw, $tokens, true)) {
                        $hit = true;
                        break;
                    }
                    // Fuzzy match for words >= 5 chars (avoid false matches on short words like "pt", "pm", "pr")
                    if (strlen($kw) >= 5) {
                        foreach ($tokens as $tok) {
                            if (strlen($tok) >= 5 && abs(strlen($tok) - strlen($kw)) <= 1 && levenshtein($tok, $kw) <= 1) {
                                $hit = true;
                                break 2;
                            }
                        }
                    }
                }
            }

            if ($hit) {
                $concepts[$tag] = true;
            }
        }

        return $concepts;
    }

    /**
     * Full-sentence holistic analyzer (detects comparative scope, cross-company/project grouping,
     * irrelevant noise mixed with 1-2 PROVIS words, and whole-sentence domain coherence ratio).
     *
     * @return array{
     *   is_comparative_rank: bool,
     *   is_cross_company: bool,
     *   is_cross_project: bool,
     *   has_irrelevant_noise: bool,
     *   is_low_coherence: bool,
     *   coherence_ratio: float,
     *   meaningful_count: int,
     *   domain_explained_count: int
     * }
     */
    public function analyzeSentenceStructure(string $text, array $entities = []): array
    {
        $lower    = mb_strtolower(trim($text));
        $norm     = $this->normalizeForSearch($text);
        $concepts = $entities['concepts'] ?? $this->extractSemanticConcepts($text);

        $isComparativeRank = (bool) preg_match(
            '/\b(paling\s+(?:baik|bagus|buruk|jelek|tinggi|rendah|cepat|lambat|besar|kecil|sedikit|banyak|mahal|murah|boros|hemat|dekat|lama)|terbaik|terburuk|terjelek|tertinggi|terendah|terbesar|terkecil|ranking|peringkat|urutkan|urutan|bandingkan|perbandingan|komparasi|sampai\s+paling|best\s+to\s+worst|worst\s+to\s+best|compare|comparison|which\s+(?:project|company|one)\s+(?:has|is))\b/i',
            $lower
        );

        $isCrossCompany = (bool) preg_match(
            '/\b((?:antar|masing[\s-]masing|tiap|setiap|per|lintas|semua|seluruh)\s+(?:perusahaan|pt|company|companies)|per\s+pt)\b/i',
            $lower
        );

        $isCrossProject = (bool) preg_match(
            '/\b((?:antar|masing[\s-]masing|tiap|setiap|per|lintas|semua|seluruh|manakah)\s+(?:proyek|projek|projeck|projects?)|(?:proyek|projek|projects?)\s+yang\s+.{0,45}?(?:paling|terbaik|terburuk|tertinggi|terendah|bandingkan|perbandingan))\b/i',
            $lower
        );

        $hasIrrelevantNoise = $this->isClearlyOutOfScope($text) || (bool) preg_match(
            '/\b(kucing|anjing|hewan|binatang|makan|makanan|minum|minuman|masak|memasak|gorengan|goreng|liburan|wisata|pantai|gunung|tidur|mimpi|pacar|cinta|jodoh|film|musik|konser|game|bola|sepakbola|cuaca|hujan|langit|planet|bulan|bintang|zodiak|horoskop|politik|presiden|pemilu|dokter|sakit|obat|sepatu|baju|celana|motor|mobil|kuliah|skripsi|ujian|kampus|sekolah|kopi|teh|susu|roti|bakso|soto|rendang|seblak|tanaman|hobi|memancing|resep|masakan)\b/i',
            $lower
        );

        // Compute full-sentence domain coherence across all meaningful content tokens
        $functionalStop = [
            'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'nya',
            'apa', 'apakah', 'siapa', 'mana', 'manakah', 'kapan', 'berapa', 'gimana', 'bagaimana',
            'kenapa', 'mengapa', 'ada', 'bisa', 'dapat', 'mau', 'ingin', 'tolong', 'coba', 'cek',
            'lihat', 'tampilkan', 'tunjukkan', 'kasih', 'sebutkan', 'daftar', 'list', 'show', 'get',
            'find', 'check', 'tell', 'aku', 'saya', 'kami', 'kita', 'kamu', 'anda', 'bro', 'min',
            'dong', 'yah', 'sih', 'nih', 'ya', 'aja', 'saja', 'jadi', 'hasil', 'hasilnya', 'bertanya',
            'tanya', 'nanya', 'mohon', 'boleh', 'tahu', 'tau', 'sama', 'paling', 'sampai', 'antara',
            'antar', 'masing', 'tiap', 'setiap', 'semua', 'seluruh', 'perbandingan', 'bandingkan',
            'adalah', 'yaitu', 'seperti', 'kalau', 'kalo', 'jika', 'tentang', 'soal', 'seputar',
            'mengenai', 'saat', 'sekarang', 'hari', 'the', 'and', 'for', 'with', 'from', 'that',
            'this', 'what', 'which', 'who', 'how', 'many', 'much', 'are', 'was', 'were', 'can',
            'please', 'could', 'would', 'about', 'only', 'just', 'per', 'atas', 'bawah', 'dalam',
            'sudah', 'belum', 'sedang', 'akan', 'lebih', 'kurang', 'sangat', 'sekali', 'banget',
            'dong', 'kah', 'lah', 'pun', 'kok', 'lho', 'deh', 'nih', 'tuh', 'dong',
        ];

        $provisVocab = [
            'user', 'users', 'akun', 'account', 'accounts', 'pengguna', 'karyawan', 'pegawai',
            'staff', 'staf', 'orang', 'member', 'members', 'anggota', 'personel', 'personil',
            'pekerja', 'profil', 'profile', 'superadmin', 'admin', 'admins', 'administrator',
            'utama', 'progres', 'progress', 'pic', 'pics', 'manager', 'leader', 'worker', 'workers',
            'operator', 'teknisi', 'pelaksana', 'beta', 'tester', 'proyek', 'projek', 'projeck',
            'project', 'projects', 'projekku', 'proyekku', 'projeknya', 'proyeknya', 'portofolio',
            'portfolio', 'perusahaan', 'perusahan', 'company', 'companies', 'klien', 'client',
            'clients', 'tenant', 'korporasi', 'divisi', 'division', 'divisions', 'departemen',
            'department', 'bagian', 'unit', 'bidang', 'task', 'tasks', 'pekerjaan', 'kerjaan',
            'tugas', 'subtask', 'item', 'aktivitas', 'kegiatan', 'job', 'jobs', 'tasknya',
            'pekerjaannya', 'wbs', 'sub', 'main', 'hierarki', 'hierarchy', 'struktur', 'template',
            'templates', 'master', 'default', 'budget', 'budgetnya', 'anggaran', 'dana', 'duit',
            'uang', 'biaya', 'pengeluaran', 'belanja', 'expenditure', 'spending', 'cost', 'rupiah',
            'pagu', 'capex', 'opex', 'keuangan', 'scurve', 'curve', 'kurva', 'spi', 'prediksi',
            'forecast', 'weekly', 'mingguan', 'planned', 'actual', 'deviasi', 'estimasi', 'selesai',
            'terkunci', 'locked', 'gembok', 'blocker', 'penghambat', 'terhambat', 'blocked',
            'kendala', 'mentok', 'predecessor', 'dependensi', 'dependency', 'ketergantungan',
            'today', 'besok', 'deadline', 'due', 'tenggat', 'agenda', 'jatuh', 'tempo', 'minggu',
            'bulan', 'tahun', 'terlambat', 'telat', 'delay', 'delayed', 'overdue', 'molor',
            'ketinggalan', 'ngaret', 'off', 'plan', 'behind', 'schedule', 'outstanding', 'purchase',
            'request', 'barang', 'terpenuhi', 'datang', 'nunggu', 'audit', 'riwayat', 'history',
            'jejak', 'log', 'logs', 'aktivitas', 'pdf', 'cetak', 'print', 'unduh', 'download',
            'laporan', 'report', 'eksekutif', 'git', 'commit', 'commits', 'koding', 'kodingan',
            'coding', 'changelog', 'sistem', 'system', 'aplikasi', 'provis', 'keseluruhan',
            'akses', 'izin', 'permission', 'visibilitas', 'visibility', 'private', 'privat',
            'public', 'publik', 'rahasia', 'status', 'open', 'completed', 'done', 'pending',
            'baik', 'bagus', 'buruk', 'jelek', 'tinggi', 'rendah', 'cepat', 'lambat', 'besar',
            'kecil', 'mahal', 'murah', 'boros', 'hemat', 'terbaik', 'terburuk', 'tertinggi',
            'terendah', 'terbesar', 'terkecil', 'tercepat', 'terlambat', 'kosong', 'bobot',
            'weight', 'durasi', 'duration', 'jadwal', 'tanggal', 'mulai', 'akhir', 'target',
            'rekonsiliasi', 'reconcile', 'sinkron', 'evidence', 'bukti', 'lampiran', 'vendor',
            'gantt', 'timeline', 'ringkasan', 'summary', 'overview', 'analisis', 'analisa',
            'detail', 'rincian', 'stat', 'statistik', 'jumlah', 'total', 'rasio', 'persen',
            'persentase', 'ubah', 'ganti', 'edit', 'update', 'buat', 'tambah', 'hubungkan',
            'pabrik', 'smelter', 'commissioning', 'commisioning', 'engineering', 'maintenance',
            'produksi', 'production', 'procurement', 'purchasing', 'finance', 'hrga', 'legal',
            'safety', 'she', 'ppic', 'busdev', 'sales', 'it', 'qc', 'civil', 'utility',
        ];

        $entityTokens = [];
        foreach (array_merge(
            $entities['matched_projects'] ?? [],
            $entities['matched_tasks'] ?? [],
            $entities['matched_companies'] ?? [],
            $entities['matched_divisions'] ?? []
        ) as $item) {
            $label = $item['title'] ?? $item['name'] ?? '';
            foreach (explode(' ', $this->normalizeForSearch((string) $label)) as $et) {
                if (strlen($et) >= 3) {
                    $entityTokens[$et] = true;
                }
            }
        }
        if (!empty($entities['requested_company_name'])) {
            foreach (explode(' ', $this->normalizeForSearch((string) $entities['requested_company_name'])) as $et) {
                if (strlen($et) >= 3) {
                    $entityTokens[$et] = true;
                }
            }
        }
        if (!empty($entities['requested_user_name'])) {
            foreach (explode(' ', $this->normalizeForSearch((string) $entities['requested_user_name'])) as $et) {
                if (strlen($et) >= 3) {
                    $entityTokens[$et] = true;
                }
            }
        }

        $meaningfulTokens = [];
        foreach (explode(' ', $norm) as $tok) {
            if (strlen($tok) < 3 || is_numeric($tok)) {
                continue;
            }
            if (in_array($tok, $functionalStop, true)) {
                continue;
            }
            $meaningfulTokens[] = $tok;
        }
        $meaningfulTokens = array_values(array_unique($meaningfulTokens));
        $meaningfulCount  = count($meaningfulTokens);
        $explainedCount   = 0;

        foreach ($meaningfulTokens as $mt) {
            if (in_array($mt, $provisVocab, true) || isset($entityTokens[$mt])) {
                $explainedCount++;
                continue;
            }
            // Also count stemmed base or Levenshtein-1 match against PROVIS vocab
            $base = preg_replace('/(nya|ku|mu|kah|lah|kan|an)$/u', '', $mt) ?? $mt;
            if (strlen($base) >= 3 && (in_array($base, $provisVocab, true) || isset($entityTokens[$base]))) {
                $explainedCount++;
                continue;
            }
            foreach ($provisVocab as $pv) {
                if (strlen($pv) >= 5 && strlen($mt) >= 5 && abs(strlen($pv) - strlen($mt)) <= 1 && levenshtein($mt, $pv) <= 1) {
                    $explainedCount++;
                    break;
                }
            }
        }

        $coherenceRatio = $meaningfulCount > 0 ? round($explainedCount / $meaningfulCount, 3) : 1.0;
        $unexplained    = $meaningfulCount - $explainedCount;
        $isLowCoherence = ($meaningfulCount >= 4 && $coherenceRatio < 0.5 && $unexplained >= 2)
            || ($hasIrrelevantNoise && !empty($concepts));

        return [
            'is_comparative_rank'    => $isComparativeRank,
            'is_cross_company'       => $isCrossCompany,
            'is_cross_project'       => $isCrossProject,
            'has_irrelevant_noise'   => $hasIrrelevantNoise,
            'is_low_coherence'       => $isLowCoherence,
            'coherence_ratio'        => $coherenceRatio,
            'meaningful_count'       => $meaningfulCount,
            'domain_explained_count' => $explainedCount,
        ];
    }

    /**
     * Classify user's high-level intent using weighted concept-bag scoring + question/command separation.
     */
    public function detectActionIntent(string $text, array $entities = [], array $sessionContext = []): string
    {
        $lower     = mb_strtolower(trim($text));
        $concepts  = $entities['concepts'] ?? $this->extractSemanticConcepts($text);
        $structure = $entities['sentence_structure'] ?? $this->analyzeSentenceStructure($text, $entities);
        $has       = fn(string $c): bool => !empty($concepts[$c]);

        // 0. If user has a pending confirmation and replies with confirm/cancel, handle immediately
        $confirmation = $entities['confirmation'] ?? $this->detectConfirmation($text);
        if ($confirmation && !empty($sessionContext['pending_action'])) {
            return $confirmation === 'confirm' ? 'CONFIRM_PENDING_ACTION' : 'CANCEL_PENDING_ACTION';
        }

        // 1. Blocker / Why-locked analysis on a SPECIFIC task (check before generic KB!)
        $matchedTasks = $entities['matched_tasks'] ?? [];
        if (
            preg_match('/\b(kenapa|mengapa|why|cek|check|analisa|analisis|analyze)\b/i', $lower)
            && ($has('ENTITY_BLOCKER') || preg_match('/\b(terkunci|locked|terhambat|blocked|blocker|belum\s+bisa\s+(?:mulai|selesai)|cannot\s+(?:start|complete)|penghambat|predecessor)\b/i', $lower))
            && (!empty($matchedTasks) || !empty($sessionContext['task_id']) || preg_match('/\b(\d+\.\d+(?:\.\d+)?|st-[\w-]+|wbs-[\w-]+)\b/i', $lower))
        ) {
            return 'ANALYZE_BLOCKER';
        }

        // 2. Conceptual / How-To Questions -> Route cleanly to Local Knowledge Base (NEVER trigger DB write!)
        if ($this->isHowToOrConceptualQuestion($text)) {
            return 'KNOWLEDGE_BASE';
        }

        // 3. Greetings, thanks, and assistant capability inquiries
        if ($this->isGreetingOrSmalltalk($text)) {
            return 'GREETING_OR_SMALLTALK';
        }

        // 3b. Local Math / Percentage Calculation
        if ($this->evaluateMathExpression($text) !== null) {
            return 'CALCULATE_MATH';
        }

        // 4. Write Actions (Imperative & Everyday Conversational verbs — only triggered when NOT a how-to question!)
        // 4a. Create Project (covers "tolong buatkan projek...", "bisakah kamu membuatkanku projek...", "buatin projek...", "mau bikin projek...")
        if (preg_match('/\b(?:buat|buatkan|buatkanku|buatin|membuat|membuatkan|membuatkanku|bikin|bikinkan|bikinin|tambah|tambahkan|cipta|ciptakan|create|generate)\s+(?:saya\s+|aku\s+|ku\s+|a\s+|new\s+|sebuah\s+|baru\s+){0,3}(?:proyek|projek|projeck|project)(?:ku|nya)?\b/i', $lower)) {
            return 'CREATE_PROJECT';
        }

        // 4a-2. Create User Account (covers "kalau buat akun baru bisa?", "membuatkan akun baru bernama Aria dengan role Super Admin")
        if (
            (
                preg_match('/\b(?:buat|buatkan|buatkanku|buatin|membuat|membuatkan|membuatkanku|bikin|bikinkan|bikinin|tambah|tambahkan|daftar|daftarkan|registrasi|create|add|register|make)\s+(?:saya\s+|aku\s+|ku\s+|a\s+|an\s+|new\s+|sebuah\s+|baru\s+){0,4}(?:akun|user|pengguna|account)\b/i', $lower)
                || preg_match('/\b(?:akun|user|account)\s+baru\b.*\b(?:bisa|buat|buatkan|membuatkan|bikin|tambah|create|bernama|namanya|nama|role|dengan)\b/i', $lower)
            )
            && !preg_match('/\b(berapa|jumlah|total|daftar|list|siapa\s+saja|apa\s+saja|cara\s+membuat|bagaimana\s+cara)\b/i', $lower)
        ) {
            return 'CREATE_USER';
        }

        // 4b. Manage Project User Access & Private/Public Visibility
        if (
            preg_match('/\b(?:berikan|kasih|beri|tambah|tambahkan|atur|ubah|mengubah|ganti|kelola|cabut|tarik|keluarkan|grant|give|assign|revoke|remove|manage|change|set)\s+(?:akses|hak\s+akses|izin|manajemen\s+user|user\s+yang\s+bisa\s+melihat|anggota|member|visibilitas|visibility|access)\b/i', $lower)
            && preg_match('/\b(?:proyek|projek|projeck|project|projekku|proyekku|melihat|view|user|akun|anggota|member|private|public)\b/i', $lower)
        ) {
            return 'MANAGE_PROJECT_ACCESS';
        }
        if (preg_match('/\b(?:ubah|mengubah|ganti|jadikan|set|make|switch|toggle)\s+(?:proyek|projek|projeck|project|projekku|proyekku)(?:\s+[\w\s\-#]+?)?\s+(?:jadi|menjadi|ke|to|as)?\s*(?:private|privat|rahasia|public|publik)\b/i', $lower)) {
            return 'MANAGE_PROJECT_ACCESS';
        }

        // 4c. Reconcile Dates
        if (preg_match('/\b(rekonsiliasi|reconcile|singkron|sinkron|sinkronkan|sync\s+dates?)\b/i', $lower)) {
            return 'RECONCILE_DATES';
        }

        // 4d. Update Task Status (complete OR partial for interactive slot-filling!)
        $statuses = $entities['statuses'] ?? $this->extractStatuses($text);
        if (
            (
                !empty($statuses)
                && preg_match('/\b(ubah|mengubah|ganti|set|tandai|jadikan|rubah|mark|change|switch|update)\b/i', $lower)
                && !preg_match('/\b(tampilkan|lihat|cek|daftar|cari|show|list|filter|berapa|jumlah)\b/i', $lower)
            )
            || preg_match('/\b(ubah|mengubah|ganti|rubah|update|change|set)\s+status\s+(?:task|pekerjaan|item)\b/i', $lower)
        ) {
            return 'UPDATE_TASK_STATUS';
        }

        // 4e. Update Task Progress (complete OR partial for interactive slot-filling!)
        $percentages = $entities['percentages'] ?? $this->extractPercentages($text);
        if (
            (
                !empty($percentages)
                && preg_match('/\b(ubah|mengubah|ganti|set|update|perbarui|naikkan|turunkan|isi|mark|change)\b/i', $lower)
            )
            || preg_match('/\b(ubah|mengubah|ganti|update|perbarui|naikkan|turunkan|set)\s+(?:progres|progress)\s+(?:task|pekerjaan|item)?\b/i', $lower)
        ) {
            return 'UPDATE_TASK_PROGRESS';
        }

        // 4f. Add New Task (e.g. "tambahkan task baru ...", "buatin task ...", "add a new task ...")
        if (preg_match('/\b(tambah|tambahkan|buat|buatkan|buatin|bikin|bikinin|add|create)\s+(?:saya\s+|aku\s+|a\s+|new\s+|sebuah\s+|baru\s+){0,2}(?:sub[\s-]?)?(?:task|pekerjaan|item)\b/i', $lower)) {
            return 'ADD_TASK';
        }

        // 4g. Set Predecessor / Update Schedule & Task Duration (complete OR partial for slot-filling!)
        if (preg_match('/\b(hubungkan|sambungkan|connect|link|set\s+(?:task|predecessor)|atur\s+(?:predecessor|dependensi)|ubah\s+predecessor)\b/i', $lower)
            || (preg_match('/\b(predecessor|dependensi)\b/i', $lower) && preg_match('/\b(FS|SS|FF|SF|lag|lead)\b/i', $text))
        ) {
            return 'SET_PREDECESSOR';
        }
        if (preg_match('/\b(geser|undur|majukan|reschedule|perpanjang|perpendek|(?:ubah|mengubah|ganti|rubah|update|set|change)\s+(?:durasi|jadwal|tanggal|lama\s+pengerjaan|duration|schedule|date))\b/i', $lower)
            || (preg_match('/\b(durasi|duration|jadwal|schedule|tanggal|start|finish)\b/i', $lower) && preg_match('/\b(set|ubah|mengubah|ganti|mulai|jadi|ke)\b/i', $lower) && (!empty($entities['dates'] ?? $this->extractDates($text)) || $this->extractDuration($text) !== null))
        ) {
            return 'UPDATE_SCHEDULE';
        }

        // 5. Read / Analytical Intents (Semantic Concept-Bag + Phrase Scoring — Order-Independent!)
        $scores = [
            'GENERATE_PDF'            => 0,
            'GET_CODE_UPDATES'        => 0,
            'QUERY_AUDIT_LOG'         => 0,
            'QUERY_SYSTEM_OVERVIEW'   => 0,
            'QUERY_COMPANIES'         => 0,
            'QUERY_DIVISIONS'         => 0,
            'QUERY_TEMPLATES'         => 0,
            'QUERY_WBS_STRUCTURE'     => 0,
            'QUERY_USERS'             => 0,
            'QUERY_BUDGET'            => 0,
            'QUERY_SCURVE'            => 0,
            'QUERY_DIVISION_PROGRESS' => 0,
            'QUERY_TODAY_TASKS'       => 0,
            'RECAP_OFF_PLAN'          => 0,
            'LIST_PROJECTS'           => 0,
            'QUERY_TASKS'             => 0,
            'QUERY_SUMMARY'           => 0,
            'ANALYZE_BLOCKER'         => 0,
        ];

        $hasSpecificEntity = $has('ENTITY_USER') || $has('ROLE_SUPERADMIN') || $has('ROLE_ADMIN') || $has('ROLE_PIC') || $has('ROLE_WORKER') || $has('ROLE_BETA')
            || $has('ENTITY_COMPANY') || $has('ENTITY_DIVISION') || $has('ENTITY_TASK') || $has('ENTITY_BUDGET')
            || $has('ENTITY_SCURVE') || $has('ENTITY_PROJECT') || $has('ENTITY_TEMPLATE') || $has('ENTITY_AUDIT') || $has('ENTITY_GIT');

        // ── System Overview / Control Panel Summary ──
        if (preg_match('/\b(kondisi\s+sistem|statistik\s+sistem|ringkasan\s+sistem|status\s+sistem|info\s+sistem|rekap\s+sistem|system\s+overview|system\s+stats?|system\s+status|control\s+panel|dashboard\s+superadmin|statistik\s+dashboard|overview\s+aplikasi|isinya\s+apa\s+(?:saja|aja)|semua\s+data\s+(?:di\s+)?(?:sistem|provis))\b/i', $lower)) {
            $scores['QUERY_SYSTEM_OVERVIEW'] += 15;
        } elseif ($has('ENTITY_SYSTEM') && !$hasSpecificEntity && ($has('QUERY_COUNT') || $has('QUERY_LIST') || preg_match('/\b(ringkasan|overview|statistik|status|rekap|kondisi|info)\b/i', $lower))) {
            $scores['QUERY_SYSTEM_OVERVIEW'] += 11;
        }

        // ── Users, Accounts (Akun!), Admins, PICs, Workers, Beta Testers & Team Members ──
        $hasRoleConcept = $has('ROLE_SUPERADMIN') || $has('ROLE_ADMIN') || $has('ROLE_PIC') || $has('ROLE_WORKER') || $has('ROLE_BETA');
        if ($has('ENTITY_USER') || $hasRoleConcept) {
            $scores['QUERY_USERS'] += ($has('ENTITY_USER') ? 10 : 0) + ($hasRoleConcept ? 10 : 0);
            if ($has('QUERY_COUNT') || $has('QUERY_LIST') || $has('QUERY_RANK')) {
                $scores['QUERY_USERS'] += 5;
            }
            if ($has('ENTITY_ACCESS')) {
                $scores['QUERY_USERS'] += 4;
            }
            // If they mentioned a specific task/budget/scurve alongside "pic/admin", don't hijack task/budget queries
            if (($has('ENTITY_TASK') || $has('ENTITY_BUDGET') || $has('ENTITY_SCURVE')) && !$has('ENTITY_USER')) {
                $scores['QUERY_USERS'] -= 6;
            }
            // If an exact project title itself contains "PIC"/"Admin"/"Worker" (e.g. "PROJECT PIC 4 BARU")
            // and the user did NOT explicitly ask for user/account/who-is-PIC, don't let QUERY_USERS hijack QUERY_SUMMARY!
            if (
                !empty($entities['matched_projects'])
                && ($entities['matched_projects'][0]['score'] ?? 0) >= 50.0
                && !$has('ENTITY_USER')
                && !preg_match('/\b(siapa|who|berapa|jumlah|daftar|list|semua)\b/i', $lower)
            ) {
                $scores['QUERY_USERS'] -= 12;
            }
        }

        // ── Companies Directory & Stats ──
        if ($has('ENTITY_COMPANY')) {
            $scores['QUERY_COMPANIES'] += 9;
            if ($has('QUERY_COUNT') || $has('QUERY_LIST')) {
                $scores['QUERY_COMPANIES'] += 5;
            }
            if ($has('ENTITY_USER') || $hasRoleConcept) {
                // "berapa akun di PT Karabha?" -> QUERY_USERS wins!
                $scores['QUERY_COMPANIES'] -= 6;
            }
            if ($has('ENTITY_TASK') || $has('ENTITY_BUDGET') || $has('ENTITY_SCURVE')) {
                $scores['QUERY_COMPANIES'] -= 5;
            }
        }

        // Cross-dimensional / Multi-project / Cross-company holistic guard:
        // Never let a single-project handler (QUERY_SCURVE, QUERY_BUDGET, QUERY_SUMMARY) hijack
        // a full-sentence comparison like "manakah projek yang s curve nya paling baik sampai paling buruk"
        // or "perbandingan s curve antar perusahaan". Let Deep Reasoning synthesize all records!
        if (
            ($structure['is_cross_company'] && ($has('ENTITY_SCURVE') || $has('ENTITY_BUDGET') || $has('ENTITY_OVERDUE') || $has('ENTITY_TASK')))
            || (
                ($structure['is_cross_project'] || ($structure['is_comparative_rank'] && empty($entities['matched_projects'] ?? [])))
                && ($has('ENTITY_SCURVE') || $has('ENTITY_BUDGET'))
            )
        ) {
            return 'GENERAL_QUERY';
        }

        // Anti-1-2-keyword hijack guard:
        // If a multi-word prompt has irrelevant noise OR low full-sentence PROVIS coherence,
        // DO NOT fire a shallow synchronous handler from 1-2 stray words — route to holistic Deep Thinking!
        if ($structure['is_low_coherence'] || $structure['has_irrelevant_noise']) {
            return 'GENERAL_QUERY';
        }

        // ── Divisions Directory & Stats ──
        if (
            $has('ENTITY_DIVISION')
            && empty($entities['matched_divisions'] ?? [])
            && !($entities['follow_up']['is_refinement'] ?? false)
            && !$has('ENTITY_TASK') && !$has('ENTITY_USER') && !$hasRoleConcept
            && !preg_match('/\b(progres|progress|kinerja|performa|beban)\b/i', $lower)
        ) {
            $scores['QUERY_DIVISIONS'] += 10;
            if ($has('QUERY_COUNT') || $has('QUERY_LIST')) {
                $scores['QUERY_DIVISIONS'] += 5;
            }
        }

        // ── Master WBS Templates ──
        if ($has('ENTITY_TEMPLATE')) {
            $scores['QUERY_TEMPLATES'] += 13;
        }

        // ── WBS Structure (Main Jobs & Sub Tasks hierarchy of a project) ──
        if ($has('ENTITY_WBS_TREE') || preg_match('/\b(main\s+jobs?\s+apa\s+(?:saja|aja)|daftar\s+main\s+(?:job|task)|sub\s+tasks?\s+apa\s+(?:saja|aja)|daftar\s+sub\s+task|struktur\s+wbs|hierarki\s+wbs|list\s+main\s+jobs?|list\s+sub\s+tasks?|wbs\s+tree)\b/i', $lower)) {
            $scores['QUERY_WBS_STRUCTURE'] += 14;
        }

        // ── PDF / Report ──
        if (preg_match('/\b(pdf|cetak|unduh\s+laporan|download\s+report|export\s+pdf|laporan\s+(?:eksekutif|proyek|projek|pdf)|executive\s+report)\b/i', $lower)) {
            $scores['GENERATE_PDF'] += 12;
        } elseif ($has('ENTITY_PDF') && !$has('ENTITY_SCURVE') && !$has('ENTITY_BUDGET') && !$has('ENTITY_OVERDUE') && !$has('ENTITY_DIVISION')) {
            $scores['GENERATE_PDF'] += 8;
        }

        // ── Git / Code Updates ──
        if ($has('ENTITY_GIT')) {
            $scores['GET_CODE_UPDATES'] += 14;
        }

        // ── Audit Log ──
        if ($has('ENTITY_AUDIT')) {
            $scores['QUERY_AUDIT_LOG'] += 13;
        }

        // ── Budget & Expenditure ──
        if ($has('ENTITY_BUDGET')) {
            $scores['QUERY_BUDGET'] += 13;
        }

        // ── S-Curve, Weekly Progress, SPI, Forecast ──
        if ($has('ENTITY_SCURVE')) {
            $scores['QUERY_SCURVE'] += 13;
        }

        // ── Division Progress / Bottleneck ──
        if (preg_match('/\b(progres\s+(?:per\s+)?divisi|kinerja\s+divisi|performa\s+divisi|beban\s+(?:kerja\s+)?divisi|division\s+progress|divisi\s+mana|which\s+division|per\s+divisi|by\s+division|masing-masing\s+divisi)\b/i', $lower)) {
            $scores['QUERY_DIVISION_PROGRESS'] += 14;
        } elseif ($has('ENTITY_DIVISION') && preg_match('/\b(progres|progress|kinerja|performa|beban)\b/i', $lower)) {
            $scores['QUERY_DIVISION_PROGRESS'] += 13;
        }

        // ── Today's Tasks / Upcoming Deadlines ──
        if ($has('ENTITY_DEADLINE') && ($has('ENTITY_TASK') || preg_match('/\b(jadwal|deadline|due|agenda|jatuh\s+tempo)\b/i', $lower))) {
            $scores['QUERY_TODAY_TASKS'] += 14;
        } elseif (preg_match('/\b(today\'?s\s+tasks?|tugas\s+hari\s+ini|task\s+hari\s+ini|kerjaan\s+hari\s+ini)\b/i', $lower)) {
            $scores['QUERY_TODAY_TASKS'] += 15;
        }

        // ── Off-Plan / Overdue Recap ──
        if ($has('ENTITY_OVERDUE')) {
            $scores['RECAP_OFF_PLAN'] += 13;
            if ($has('ENTITY_PROJECT') || preg_match('/\b(rekap|semua)\b/i', $lower)) {
                $scores['RECAP_OFF_PLAN'] += 5;
            } elseif (empty($entities['matched_projects'] ?? []) && empty($entities['matched_divisions'] ?? []) && !in_array('Outstanding', $statuses, true)) {
                $scores['RECAP_OFF_PLAN'] += 9;
            }
        }

        // ── List / Count / Compare / Rank Projects ──
        if (preg_match('/\b(daftar\s+(?:semua\s+)?(?:proyek|projek)|semua\s+(?:proyek|projek)|(?:proyek|projek)\s+apa\s+(?:saja|aja)|ada\s+berapa\s+(?:proyek|projek)|berapa\s+(?:jumlah\s+|total\s+|banyak\s+)?(?:proyek|projek)|jumlah\s+(?:proyek|projek)|total\s+(?:proyek|projek)|list\s+(?:all\s+)?projects?|all\s+projects?|how\s+many\s+projects?|bandingkan\s+(?:semua\s+)?(?:proyek|projek)|perbandingan\s+(?:proyek|projek)|compare\s+projects?|(?:proyek|projek|progres|progress)\s+(?:mana\s+yang\s+)?(?:paling|tertinggi|terendah|tercepat|terbaik|terburuk|terjelek|terbaru|private)|which\s+(?:project|progress)\s+(?:has|is))\b/i', $lower)) {
            $scores['LIST_PROJECTS'] += 14;
        } elseif ($has('ENTITY_PROJECT') && ($has('QUERY_COUNT') || $has('QUERY_RANK')) && empty($entities['matched_projects'] ?? []) && !$has('ENTITY_TASK') && !$has('ENTITY_USER') && !$has('ENTITY_BUDGET')) {
            $scores['LIST_PROJECTS'] += 12;
        } elseif (preg_match('/\b(progres|progress)\b/i', $lower) && $has('QUERY_RANK') && empty($entities['matched_projects'] ?? []) && empty($matchedTasks) && !$has('ENTITY_DIVISION') && !$has('ENTITY_TASK')) {
            $scores['LIST_PROJECTS'] += 13;
        }

        // ── Blocker check ──
        if ($has('ENTITY_BLOCKER')) {
            $scores['ANALYZE_BLOCKER'] += 11;
        }

        // ── Tasks Query (by status e.g. Outstanding, by division, by task name, by evidence, or generic task list) ──
        if (!empty($statuses) || $has('ENTITY_OUTSTANDING')) {
            $scores['QUERY_TASKS'] += 10;
            if (in_array('Outstanding', $statuses, true) || $has('ENTITY_OUTSTANDING')) {
                $scores['QUERY_TASKS'] += 4;
            }
        }
        if ($has('ENTITY_TASK')) {
            $scores['QUERY_TASKS'] += 8;
            if ($has('QUERY_COUNT') || $has('QUERY_LIST')) {
                $scores['QUERY_TASKS'] += 3;
            }
        }
        if (!empty($entities['matched_divisions'] ?? []) && !$has('ENTITY_USER') && !$hasRoleConcept && !preg_match('/\b(progres\s+per\s+divisi|semua\s+divisi|division\s+progress|daftar\s+divisi)\b/i', $lower)) {
            $scores['QUERY_TASKS'] += 6;
        }
        if (!empty($matchedTasks)) {
            $scores['QUERY_TASKS'] += 9;
        }

        // ── Project Summary & Deep Inside-Project Analysis Query ──
        if (preg_match('/\b(ringkasan|summary|overview|analisis\s+(?:dalam(?:nya)?\s+)?(?:proyek|projek)|analisa\s+(?:dalam(?:nya)?\s+)?(?:proyek|projek)|bedah\s+(?:proyek|projek)|isi\s+(?:dalam(?:nya)?\s+)?(?:proyek|projek)|dalam(?:nya)?\s+(?:proyek|projek)|di\s+dalam\s+(?:proyek|projek)|kondisi\s+(?:proyek|projek)|status\s+(?:proyek|projek)|kabar\s+(?:proyek|projek)|berapa\s+progres|progress\s+(?:proyek|projek)|progres\s+(?:proyek|projek)|sisa\s+waktu|sisa\s+hari|days?\s+left|detail\s+(?:proyek|projek)|project\s+(?:status|summary|progress|overview|detail|analysis)|analyze\s+project|inside\s+project|progresnya|detailnya)\b/i', $lower)) {
            $scores['QUERY_SUMMARY'] += 11;
        }
        if (!empty($entities['matched_projects'] ?? []) && max($scores) < 10) {
            $scores['QUERY_SUMMARY'] += 8;
        }

        // Follow-up refinement inherits previous intent (e.g. "yang divisi Maintenance aja" after QUERY_TASKS)
        $followUp = $entities['follow_up'] ?? [];
        if (($followUp['is_refinement'] ?? false) && !empty($sessionContext['last_intent'])) {
            $prevIntent = $sessionContext['last_intent'];
            if (isset($scores[$prevIntent]) && max($scores) < 10) {
                $scores[$prevIntent] += 8;
            }
        }

        // Follow-up item selection (e.g. "detail yang pertama", "nomor 2")
        if (!empty($followUp['item_index']) && max($scores) < 10) {
            if (!empty($sessionContext['referenced_tasks'])) {
                $scores['QUERY_TASKS'] += 11;
            } elseif (!empty($sessionContext['referenced_projects'])) {
                $scores['QUERY_SUMMARY'] += 11;
            }
        }

        arsort($scores);
        $topIntent = array_key_first($scores);
        $topScore  = $scores[$topIntent] ?? 0;

        if ($topScore >= 6) {
            return $topIntent;
        }

        return 'GENERAL_QUERY';
    }

    /**
     * Detect whether the user explicitly asks about GLOBAL / SYSTEM-WIDE PROVIS data
     * (e.g. "di sistem ini", "di provis ini", "seluruh sistem", "semua perusahaan").
     */
    public function isSystemWideScopePrompt(string $text): bool
    {
        $lower = mb_strtolower(trim($text));
        return (bool) preg_match(
            '/\b(di\s+sistem\s+ini|di\s+dalam\s+sistem|dalam\s+sistem\s+ini|di\s+provis\s+ini|di\s+sistem\s+provis|seluruh\s+sistem|seluruh\s+provis|semua\s+perusahaan|semua\s+projek\s+di\s+sistem|semua\s+proyek\s+di\s+sistem|control\s+panel|dashboard\s+superadmin|keseluruhan\s+sistem|global\s+provis|in\s+this\s+system|in\s+provis|across\s+provis|across\s+the\s+system|system[\s-]wide|all\s+companies)\b/i',
            $lower
        );
    }

    /**
     * Detect clearly non-work / out-of-scope topics unrelated to PROVIS Project Management.
     */
    public function isClearlyOutOfScope(string $text): bool
    {
        $lower = mb_strtolower(trim($text));
        if ($lower === '') {
            return false;
        }

        // Unmistakable personal / household / homework / entertainment / general trivia topics
        $outOfScopePatterns = [
            // Personal / household / school / college / explicit non-PROVIS
            '/\b(pekerjaan\s+rumah|pr\s+(?:sekolah|rumah|matematika|anak|kuliah)|tugas\s+(?:sekolah|kuliah|kampus|dosen|guru|skripsi)|skripsi|tesis|makalah|to[\s-]?do\s*list\s+pribadi|todolist\s+pribadi|urusan\s+pribadi|kehidupan\s+pribadi|masalah\s+(?:pribadi|hidup|keluarga|asmara)|agenda\s+pribadi|jadwal\s+pribadi|catatan\s+pribadi|di\s*luar\s+(?:provis|sistem)|bukan\s+(?:di\s+)?provis|belanja\s+(?:bulanan|harian|dapur)|nyuci|mencuci\s+baju|bersih[\s-]bersih\s+rumah|homework|personal\s+to[\s-]?do)\b/i',
            // Cooking / food / lifestyle / fitness
            '/\b(resep\s+\w+|cara\s+masak|memasak|nasi\s+goreng|mie\s+goreng|ayam\s+goreng|rendang|soto|bakso|seblak|kue\s+bolu|bikin\s+kopi|makanan\s+enak|restoran\s+terdekat|rekomendasi\s+(?:makan|film|lagu|wisata|hotel|game)|menu\s+diet|turun\s+berat\s+badan|kalori|olahraga\s+gym|recipe|how\s+to\s+cook)\b/i',
            // Entertainment / media / sports / games / social media
            '/\b(nonton\s+film|film\s+(?:bagus|terbaik|bioskop)|drakor|anime|manga|lirik\s+lagu|lagu\s+(?:terbaru|galau|pop)|konser|mobile\s+legends|mlbb|valorant|pubg|minecraft|free\s+fire|genshin|sepak\s*bola|jadwal\s+bola|liga\s+(?:inggris|champions|spanyol|indonesia)|piala\s+dunia|nba|badminton|artis\s+indonesia|gosip|selebriti|netflix|tiktok|instagram|youtuber)\b/i',
            // Romance / creative writing / jokes / horoscopes / weather / politics / medical / crypto / trivia
            '/\b(pacar|gebetan|jodoh|putus\s+cinta|galau|curhat|puisi|pantun|cerpen|dongeng|lelucon|jokes?|tebak[\s-]tebakan|ramalan\s+zodiak|zodiak|horoskop|ramalan\s+cuaca|cuaca\s+hari\s+ini|besok\s+hujan|siapa\s+presiden|politik|pemilu|pilpres|obat\s+(?:sakit|demam|batuk|flu|pusing)|gejala\s+(?:demam|covid|penyakit)|dokter|harga\s+(?:bitcoin|btc|eth|crypto|emas|saham)|trading\s+(?:saham|forex|crypto)|ibu\s*kota\s+(?:negara|indonesia|jepang|amerika|prancis)|sejarah\s+dunia|siapa\s+penemu|einstein|jarak\s+bumi|tata\s+surya|planet\s+mars|acara\s+ulang\s+tahun|rencana\s+liburan|tiket\s+pesawat|tempat\s+wisata|tell\s+me\s+a\s+joke|write\s+a\s+poem|weather\s+today|who\s+is\s+the\s+president)\b/i',
        ];

        foreach ($outOfScopePatterns as $rx) {
            if (preg_match($rx, $lower)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check whether the prompt explicitly references PROVIS work concepts or entities.
     */
    public function hasProvisDomainSignal(string $text, array $entities = []): bool
    {
        $lower    = mb_strtolower(trim($text));
        $concepts = $entities['concepts'] ?? $this->extractSemanticConcepts($text);

        // Matched live DB entities are always strong PROVIS signals
        if (
            !empty($entities['matched_projects'])
            || !empty($entities['matched_tasks'])
            || !empty($entities['matched_divisions'])
            || !empty($entities['matched_companies'])
            || !empty($entities['statuses'])
            || !empty($entities['predecessor_syntax'])
            || !empty($entities['percentages'])
        ) {
            return true;
        }

        // Explicit PROVIS concepts (excluding ambiguous bare 'tugas' handled separately!)
        $strongConcepts = [
            'ENTITY_PROJECT', 'ENTITY_COMPANY', 'ENTITY_DIVISION', 'ENTITY_WBS_TREE',
            'ENTITY_TEMPLATE', 'ENTITY_BUDGET', 'ENTITY_SCURVE', 'ENTITY_BLOCKER',
            'ENTITY_OVERDUE', 'ENTITY_OUTSTANDING', 'ENTITY_AUDIT', 'ENTITY_PDF',
            'ENTITY_GIT', 'ENTITY_SYSTEM', 'ENTITY_ACCESS', 'ENTITY_USER',
            'ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_PIC', 'ROLE_WORKER', 'ROLE_BETA',
        ];
        foreach ($strongConcepts as $tag) {
            if (!empty($concepts[$tag])) {
                return true;
            }
        }

        // Explicit work/PROVIS terminology (note: intentionally excludes bare ambiguous "tugas" / "kerjaan" without PROVIS qualifier)
        return (bool) preg_match(
            '/\b(provis|proyek|projek|projeck|project|task|tasks|wbs|subtask|sub[\s-]?task|main\s+(?:job|task)|divisi|division|perusahaan|company|budget|anggaran|pagu|rupiah|pengeluaran|scurve|s[\s-]?curve|kurva|spi|weekly|predecessor|dependensi|dependency|gantt|timeline|outstanding|overdue|delayed|at\s+risk|on\s+track|evidence|bukti\s+kerja|template|audit|git|commit|rekonsiliasi|reconcile|pdf|laporan|report|worker|pic|superadmin|admin|akun|user|beta\s+tester|working\s+tree|private|public|vendor|bobot|weight|durasi|duration|progres|progress|purchase\s+request|pr-\d+|commissioning|smelter|pabrik|tugas\s+hari\s+ini|today\'?s\s+tasks?|kerjaan\s+(?:hari\s+ini|molor|telat|divisi|proyek|projek)|#\d+|\d+\.\d+(?:\.\d+)?)\b/i',
            $lower
        );
    }

    /**
     * 3-Tier Work Scope Classifier:
     * - 'in_scope'     : Clear PROVIS work request, greeting/math/guardrail, or active follow-up
     * - 'ambiguous'    : Vague term like "kapan tugas ini diselesaikan?" -> clarify BEFORE rejecting!
     * - 'out_of_scope' : Clearly non-PROVIS / personal / general topic -> reject politely!
     *
     * @return array{status: string, reason: string, ambiguous_term: ?string}
     */
    public function classifyWorkScope(string $text, array $entities = [], array $sessionContext = []): array
    {
        $lower = mb_strtolower(trim($text));
        if ($lower === '') {
            return ['status' => 'in_scope', 'reason' => 'empty', 'ambiguous_term' => null];
        }

        // 1. Always allow greetings, polite thanks, local AI identity/clock, capability help, math, or high-risk guardrail
        if (
            $this->isGreetingOrSmalltalk($text)
            || $this->evaluateMathExpression($text) !== null
            || $this->isHighRiskAction($text)
        ) {
            return ['status' => 'in_scope', 'reason' => 'assistant_core', 'ambiguous_term' => null];
        }

        $hasStrongProvis = $this->hasProvisDomainSignal($text, $entities);
        $structure       = $entities['sentence_structure'] ?? $this->analyzeSentenceStructure($text, $entities);

        // 2. Clearly out-of-scope (e.g. cooking, homework, personal to-do list, movies, politics, weather, trivia)
        //    Note: If clearly out-of-scope keywords are mixed with 1-2 PROVIS keywords (noise trap),
        //    let it fall through ONLY if long noisy mixture so Thinking Engine inspects all words first!
        if ($this->isClearlyOutOfScope($text) && !$hasStrongProvis) {
            return ['status' => 'out_of_scope', 'reason' => 'clearly_non_provis', 'ambiguous_term' => null];
        }

        // 3. Ambiguous everyday terms ("kapan tugas ini diselesaikan?", "tugasnya kapan beres?", "kapan ini selesai?", "urusan ini gimana?")
        //    When user uses ambiguous words WITHOUT specifying PROVIS Task / Project / matched entity / pinned task_id!
        $hasPinnedTask    = !empty($sessionContext['task_id']);
        $hasFollowUpIndex = !empty($entities['follow_up']['item_index']) && (!empty($sessionContext['referenced_tasks']) || !empty($sessionContext['referenced_projects']));
        $wordCount        = count(array_filter(explode(' ', trim($lower))));

        if (!$hasStrongProvis && !$hasFollowUpIndex) {
            // Case 3a: Ambiguous "tugas" (could mean PROVIS Task, PROVIS Project, or personal homework/to-do list!)
            if (preg_match('/\b(tugas|tugasnya|tugasku)\b/i', $lower) && !$hasPinnedTask) {
                return ['status' => 'ambiguous', 'reason' => 'ambiguous_tugas', 'ambiguous_term' => 'tugas'];
            }

            // Case 3b: Ambiguous "pekerjaan / kerjaan / kegiatan / urusan / jadwal ini / hal ini / rencana (short)" with no PROVIS entity
            if (
                preg_match('/\b(pekerjaan|kerjaan|kegiatan|urusan|jadwal\s+ini|deadline\s+ini|hal\s+ini)\b/i', $lower)
                || ($wordCount <= 6 && preg_match('/\b(rencana|besok|acara)\b/i', $lower))
            ) {
                if (!$hasPinnedTask) {
                    $term = preg_match('/\b(pekerjaan|kerjaan)\b/i', $lower) ? 'pekerjaan'
                        : (preg_match('/\b(urusan)\b/i', $lower) ? 'urusan'
                        : (preg_match('/\b(kegiatan)\b/i', $lower) ? 'kegiatan'
                        : (preg_match('/\b(rencana)\b/i', $lower) ? 'rencana' : 'jadwal ini')));
                    return ['status' => 'ambiguous', 'reason' => 'ambiguous_work_term', 'ambiguous_term' => $term];
                }
            }

            // Case 3c: Vague deictic question ("kapan ini diselesaikan?", "kapan ini selesai?", "ini gimana?", "sudah sampai mana?")
            if (
                preg_match('/^(?:kapan\s+(?:ini\s+)?(?:selesai|diselesaikan|beres|kelar)|ini\s+(?:kapan|gimana|bagaimana)|sudah\s+sampai\s+mana|gimana\s+kelanjutannya|bagaimana\s+kelanjutannya)\b/i', $lower)
                && !$hasPinnedTask
                && empty($sessionContext['referenced_tasks'])
                && empty($sessionContext['referenced_projects'])
            ) {
                return ['status' => 'ambiguous', 'reason' => 'ambiguous_reference', 'ambiguous_term' => 'ini'];
            }
        }

        // Note: if sentence is longer/noisy with mixed irrelevant words + 1-2 PROVIS keywords, allow pass-through
        // so detectActionIntent returns GENERAL_QUERY -> Async Thinking evaluates every word before answering/rejecting!
        if ($structure['is_low_coherence'] && $hasStrongProvis) {
            return ['status' => 'in_scope', 'reason' => 'needs_deep_holistic_analysis', 'ambiguous_term' => null];
        }

        return ['status' => 'in_scope', 'reason' => 'default_allow', 'ambiguous_term' => null];
    }

    /**
     * High-risk safety guardrail (blocks destructive delete/drop/reset operations via chat).
     */
    public function isHighRiskAction(string $text): bool
    {
        $lower = mb_strtolower($text);
        return (bool) preg_match('/\b(hapus|delete|drop|truncate|reset\s+jadwal|clear[\s-]wbs|destroy\s+(?:project|proyek|projek|task|all))\b/i', $lower);
    }

    /**
     * Helper: Normalize text for fuzzy search.
     */
    protected function normalizeForSearch(string $text): string
    {
        $lower = mb_strtolower(trim($text));
        $clean = preg_replace('/[^a-z0-9\s]/u', ' ', $lower) ?? $lower;
        return trim(preg_replace('/\s+/', ' ', $clean) ?? $clean);
    }

    /**
     * Helper: Extract meaningful tokens for fuzzy search (strips Indonesian/English filler words).
     */
    protected function searchTokens(string $normalized): array
    {
        $stop = [
            'pt', 'cv', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'is', 'are', 'a', 'an',
            'dan', 'atau', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'proyek',
            'projek', 'projeck', 'projekku', 'proyekku', 'project', 'task', 'tugas', 'pekerjaan', 'status',
            'progress', 'progres', 'tolong', 'cek', 'lihat', 'tampilkan', 'berapa', 'apa', 'bagaimana',
            'gimana', 'kenapa', 'ubah', 'mengubah', 'ganti', 'jadi', 'show', 'list', 'check', 'get', 'update',
            'set', 'mark', 'change', 'outstanding', 'completed', 'open', 'delayed', 'budget', 'divisi',
            'division', 'predecessor', 'lag', 'lead', 'hari', 'days', 'durasi', 'duration', 'perusahaan',
            'milik', 'bernama', 'buat', 'buatkan', 'buatkanku', 'buatin', 'membuatkanku', 'bikin', 'bikinin',
            'mau', 'bisakah', 'bisa', 'halo', 'bro', 'min', 'dong', 'ya', 'saya', 'aku', 'kamu',
        ];

        $parts = explode(' ', $normalized);
        $out = [];
        foreach ($parts as $p) {
            if (strlen($p) >= 2 && !in_array($p, $stop, true)) {
                $out[] = $p;
            }
        }

        return array_values(array_unique($out));
    }
}
