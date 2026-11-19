<?php

namespace App\Services;

class ProvisKnowledgeBaseService
{
    /**
     * Search local PROVIS Knowledge Base (100% on-premise, zero external API).
     * Supports Indonesian & English queries with phrase, keyword, and fuzzy Levenshtein matching.
     *
     * @return array{id: string, score: float, title: string, content: string, actions: array}|null
     */
    public function search(string $prompt, string $lang = 'id', ?int $activeProjectId = null): ?array
    {
        $results = $this->searchMultiple($prompt, $lang, $activeProjectId, 1);
        return $results[0] ?? null;
    }

    /**
     * Search local Knowledge Base and return up to $maxResults high-confidence topics.
     * Great for compound user questions like "aku mau mengubah durasi task, atau manajemen user yang bisa melihat projekku, gimana caranya?"
     *
     * @return array<int, array{id: string, score: float, title: string, content: string, actions: array}>
     */
    public function searchMultiple(string $prompt, string $lang = 'id', ?int $activeProjectId = null, int $maxResults = 2): array
    {
        $normalized = $this->normalize($prompt);
        if ($normalized === '') {
            return [];
        }

        $tokens = $this->extractMeaningfulTokens($normalized);
        $entries = $this->getEntries($activeProjectId);

        $scored = [];

        foreach ($entries as $entry) {
            $score = 0.0;

            // 1. Exact phrase matches (highest weight)
            foreach ($entry['phrases'] as $phrase) {
                $normPhrase = $this->normalize($phrase);
                if ($normPhrase !== '' && str_contains($normalized, $normPhrase)) {
                    $wordCount = substr_count($normPhrase, ' ') + 1;
                    $score += 4.5 + ($wordCount * 1.2);
                }
            }

            // 2. Keyword & fuzzy matches
            $matchedKeywords = [];
            foreach ($entry['keywords'] as $kw) {
                $normKw = $this->normalize($kw);
                if ($normKw === '') {
                    continue;
                }

                // Direct substring / whole word match
                if (preg_match('/\b' . preg_quote($normKw, '/') . '\b/u', $normalized)) {
                    $score += 2.6;
                    $matchedKeywords[] = $normKw;
                    continue;
                }

                // Token-level prefix or Levenshtein fuzzy match (handles typos like "predecesor", "outstnding")
                foreach ($tokens as $tok) {
                    if ($tok === $normKw) {
                        $score += 2.6;
                        $matchedKeywords[] = $normKw;
                        break;
                    }
                    if (strlen($tok) >= 4 && strlen($normKw) >= 4) {
                        if (str_starts_with($tok, $normKw) || str_starts_with($normKw, $tok)) {
                            $score += 1.6;
                            $matchedKeywords[] = $normKw;
                            break;
                        }
                        if (strlen($tok) >= 5 && strlen($normKw) >= 5 && abs(strlen($tok) - strlen($normKw)) <= 2) {
                            $dist = levenshtein($tok, $normKw);
                            if ($dist <= 1) {
                                $score += 1.8;
                                $matchedKeywords[] = $normKw;
                                break;
                            }
                        }
                    }
                }
            }

            // Bonus for matching multiple distinct keywords in the same topic
            $uniqueMatches = count(array_unique($matchedKeywords));
            if ($uniqueMatches >= 2) {
                $score += ($uniqueMatches - 1) * 1.4;
            }

            // Slight bonus for how-to / conceptual framing
            if (preg_match('/\b(bagaimana|gimana|cara|caranya|apa itu|apa arti|arti|maksud|bedanya|perbedaan|jelaskan|panduan|kenapa|mengapa|contoh prompt|how to|how do|what is|what does|meaning|difference|explain|guide|why)\b/i', $normalized)) {
                $score += 0.8;
            }

            if ($score >= 3.4) {
                $scored[] = [
                    'entry' => $entry,
                    'score' => round($score, 2),
                ];
            }
        }

        if (empty($scored)) {
            return [];
        }

        usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);

        $useEn = ($lang === 'en');
        $out = [];
        $topScore = $scored[0]['score'];

        foreach ($scored as $idx => $item) {
            // Only include a 2nd topic if it has genuinely strong confidence (>= 6.5 and >= 45% of top score)
            if ($idx > 0 && ($item['score'] < 6.5 || $item['score'] < ($topScore * 0.45))) {
                break;
            }
            $e = $item['entry'];
            $out[] = [
                'id'      => $e['id'],
                'score'   => $item['score'],
                'title'   => $useEn ? $e['title_en'] : $e['title_id'],
                'content' => $useEn ? $e['content_en'] : $e['content_id'],
                'actions' => $useEn ? $e['actions_en'] : $e['actions_id'],
            ];
            if (count($out) >= $maxResults) {
                break;
            }
        }

        return $out;
    }

    /**
     * Normalize text for matching.
     */
    protected function normalize(string $text): string
    {
        $lower = mb_strtolower(trim($text));
        $clean = preg_replace('/[^a-z0-9\s\-\/\.]/u', ' ', $lower) ?? $lower;
        return trim(preg_replace('/\s+/', ' ', $clean) ?? $clean);
    }

    /**
     * Extract meaningful tokens (removing common ID/EN stop words).
     */
    protected function extractMeaningfulTokens(string $normalized): array
    {
        $stopWords = [
            'apa', 'yang', 'di', 'ke', 'dari', 'dan', 'atau', 'ini', 'itu', 'untuk', 'dengan',
            'pada', 'adalah', 'bisa', 'dapat', 'akan', 'sudah', 'belum', 'tidak', 'ya', 'dong',
            'sih', 'nih', 'kak', 'bro', 'min', 'tolong', 'coba', 'saya', 'aku', 'kamu', 'anda',
            'the', 'is', 'are', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with', 'and', 'or',
            'can', 'do', 'does', 'i', 'you', 'my', 'me', 'please', 'about', 'it', 'this', 'that',
        ];

        $raw = explode(' ', $normalized);
        $tokens = [];
        foreach ($raw as $w) {
            $w = trim($w, ".-/");
            if (strlen($w) >= 2 && !in_array($w, $stopWords, true)) {
                $tokens[] = $w;
            }
        }

        return array_values(array_unique($tokens));
    }

    /**
     * Comprehensive PROVIS domain Knowledge Base entries (Bilingual ID & EN).
     */
    protected function getEntries(?int $activeProjectId): array
    {
        $pidQuery = $activeProjectId ? "?project_id={$activeProjectId}" : '';
        $projDetailUrl = $activeProjectId ? "/projects/{$activeProjectId}" : '/projectlistpage';
        $tasksUrl = "/tasks{$pidQuery}";
        $timelineUrl = "/timeline{$pidQuery}";
        $scurveUrl = "/scurve{$pidQuery}";
        $weeklyUrl = "/weekly{$pidQuery}";
        $budgetUrl = "/budget{$pidQuery}";
        $divProgUrl = $activeProjectId ? "/projects/{$activeProjectId}/division-progress" : '/division-progress';
        $predUrl = $activeProjectId ? "/projects/{$activeProjectId}/predecessors" : $tasksUrl;

        return [
            [
                'id'       => 'outstanding_status',
                'phrases'  => [
                    'arti outstanding', 'apa itu outstanding', 'label outstanding', 'status outstanding',
                    'barang dari pr', 'pr belum terpenuhi', 'meaning of outstanding', 'what is outstanding',
                    'outstanding label', 'outstanding status', 'unfulfilled pr', 'fungsi outstanding',
                ],
                'keywords' => ['outstanding', 'pr', 'purchase', 'purchasing', 'procurement', 'unfulfilled', 'terpenuhi', 'ungu', 'purple'],
                'title_id' => 'Penjelasan Label Status Outstanding (PR)',
                'content_id' => "### 📦 Apa Itu Label Status **Outstanding**?\n\n"
                    . "Status **Outstanding** (ditandai warna **Ungu / Violet**) khusus digunakan untuk melabeli **barang atau item pekerjaan dari Purchase Request (PR) yang belum terpenuhi / masih menunggu pemenuhan**.\n\n"
                    . "**Cara Kerja & Aturannya di PROVIS:**\n"
                    . "1. **Tetap Terjaga Saat Rekalkulasi**: Berbeda dengan status `Open` yang otomatis berubah menjadi `On Track` saat progres > 0%, status `Outstanding` **tidak akan tertimpa** selama progres masih di bawah 100%.\n"
                    . "2. **Otomatis Selesai di 100%**: Begitu barang PR sudah terpenuhi dan progres task mencapai `100%`, status akan otomatis berubah menjadi `Completed`.\n"
                    . "3. **Cara Mengatur Status Outstanding**:\n"
                    . "   - Buka halaman **Tasks** → klik langsung pada badge status di kolom **Status** (Table View), atau klik ikon **Edit (pensil)** pada task lalu pilih `Outstanding`.\n"
                    . "   - Atau langsung ketik di chat ini: *\"Ubah status task [nama/kode task] jadi Outstanding\"*.\n"
                    . "4. **Filter Cepat**: Anda bisa memfilter semua item `Outstanding` di halaman **Tasks**, **Project Detail**, **Today's Tasks**, dan melihat jumlahnya di kartu *Status Breakdown* **Dashboard**.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Task Management', 'url' => $tasksUrl],
                ],
                'title_en' => 'Understanding the Outstanding Status Label (PR)',
                'content_en' => "### 📦 What Does the **Outstanding** Status Label Mean?\n\n"
                    . "The **Outstanding** status (styled with a distinct **Purple / Violet** badge) is specifically assigned to **Purchase Request (PR) goods or procurement items that are not yet fulfilled**.\n\n"
                    . "**How It Works in PROVIS:**\n"
                    . "1. **Preserved During Recalculation**: Unlike `Open` (which automatically switches to `On Track` once progress > 0%), an `Outstanding` task **keeps its Outstanding status** as long as progress is below 100%.\n"
                    . "2. **Auto-Completes at 100%**: Once the PR item is fulfilled and task progress reaches `100%`, the status automatically transitions to `Completed`.\n"
                    . "3. **How to Mark an Item as Outstanding**:\n"
                    . "   - Open **Tasks** → click the status badge directly in the **Status** column (Table View), or click **Edit** on the task and pick `Outstanding`.\n"
                    . "   - Or simply ask me here: *\"Mark task [task name/code] as Outstanding\"*.\n"
                    . "4. **Quick Filtering**: Filter all `Outstanding` items from **Tasks**, **Project Detail**, **Today's Tasks**, and monitor their count in the **Dashboard** *Status Breakdown*.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Task Management', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'predecessor_dependencies',
                'phrases'  => [
                    'cara mengatur predecessor', 'cara atur predecessor', 'atur predecessor', 'apa itu predecessor',
                    'beda fs ss ff sf', 'perbedaan fs ss', 'lag dan lead', 'circular dependency',
                    'how to set predecessor', 'what is predecessor', 'dependency types', 'finish to start',
                    'start to start', 'finish to finish', 'start to finish', 'dependensi antar pekerjaan',
                ],
                'keywords' => ['predecessor', 'dependensi', 'dependency', 'fs', 'ss', 'ff', 'sf', 'lag', 'lead', 'circular', 'siklus'],
                'title_id' => 'Panduan Predecessor & Dependensi (FS / SS / FF / SF)',
                'content_id' => "### 🔗 Panduan Mengatur Predecessor & Dependensi Task\n\n"
                    . "**Predecessor** menentukan urutan ketergantungan antar task agar jadwal proyek otomatis tersinkronisasi (*cascading*).\n\n"
                    . "**4 Tipe Dependensi di PROVIS:**\n"
                    . "- **FS (Finish-to-Start)** *(paling umum)*: Task baru boleh dimulai setelah predecessor **selesai 100%**.\n"
                    . "- **SS (Start-to-Start)**: Task mulai bersamaan / setelah predecessor **mulai dikerjakan (>0%)**.\n"
                    . "- **FF (Finish-to-Finish)**: Task tidak dapat diselesaikan 100% sebelum predecessor selesai 100%.\n"
                    . "- **SF (Start-to-Finish)**: Task tidak dapat selesai sebelum predecessor dimulai.\n\n"
                    . "**Lag & Lead Time:**\n"
                    . "- **Lag (+N hari)**: Jeda waktu tambahan setelah predecessor (misal `FS +2d` = mulai 2 hari setelah predecessor selesai).\n"
                    . "- **Lead (-N hari)**: Mempercepat/overlap mulai lebih awal sebelum predecessor selesai.\n\n"
                    . "**Cara Mengatur:**\n"
                    . "1. Melalui halaman **Tasks** → klik ikon **rantai (Manage Dependencies)** pada baris task, atau klik tombol **Manage Predecessors** di bagian atas untuk tampilan diagram visual.\n"
                    . "2. Atau lewat chat ini: *\"Hubungkan task 1.2.1 dengan predecessor 1.1.1 FS lag 2 hari\"*.\n"
                    . "> Catatan: Sistem otomatis menolak *circular dependency* (A bergantung pada B, B bergantung pada A).",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Predecessor Manager', 'url' => $predUrl],
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                ],
                'title_en' => 'Predecessor & Dependency Guide (FS / SS / FF / SF)',
                'content_en' => "### 🔗 Guide to Managing Predecessors & Task Dependencies\n\n"
                    . "**Predecessors** define execution order between tasks so dates automatically cascade when schedules change.\n\n"
                    . "**4 Dependency Types in PROVIS:**\n"
                    . "- **FS (Finish-to-Start)** *(default)*: Successor cannot start until the predecessor is **100% completed**.\n"
                    . "- **SS (Start-to-Start)**: Successor starts once the predecessor has **started (>0%)**.\n"
                    . "- **FF (Finish-to-Finish)**: Successor cannot reach 100% until the predecessor reaches 100%.\n"
                    . "- **SF (Start-to-Finish)**: Successor cannot finish before the predecessor starts.\n\n"
                    . "**Lag & Lead Time:**\n"
                    . "- **Lag (+N days)**: Adds buffer days after the predecessor (e.g., `FS +2d`).\n"
                    . "- **Lead (-N days)**: Overlaps/starts earlier before the predecessor completes.\n\n"
                    . "**How to Configure:**\n"
                    . "1. Open **Tasks** → click the **link icon** on a task row, or open **Manage Predecessors** for the interactive diagram.\n"
                    . "2. Or instruct me directly: *\"Connect task 1.2.1 to predecessor 1.1.1 FS lag 2 days\"*.\n"
                    . "> Note: Circular dependencies (A → B → A) are automatically blocked.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Predecessor Manager', 'url' => $predUrl],
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'task_locked_reason',
                'phrases'  => [
                    'kenapa task terkunci', 'tidak bisa dicentang', 'tidak bisa update progres', 'slider terkunci',
                    'ikon gembok', 'kenapa terkunci', 'task locked', 'cannot check task', 'why is task locked',
                    'cannot update progress', 'cannot edit task', 'tombol disable',
                ],
                'keywords' => ['terkunci', 'locked', 'gembok', 'dicentang', 'centang', 'slider', 'permission', 'izin', 'read-only'],
                'title_id' => 'Penyebab Task Terkunci / Tidak Bisa Diubah Progresnya',
                'content_id' => "### 🔒 Kenapa Sebuah Task Terkunci / Tidak Bisa Diperbarui?\n\n"
                    . "Ada 4 penyebab utama mengapa slider/checkbox progres sebuah task terkunci di PROVIS:\n\n"
                    . "1. **Predecessor Belum Selesai** *(ikon gembok kuning)*: Task memiliki dependensi (misal `FS`) ke task lain yang progresnya belum 100%. Selesaikan predecessor-nya terlebih dahulu.\n"
                    . "2. **Bukan Divisi Anda** *(ikon gembok abu-abu)*: Akun **Worker** hanya bisa memperbarui task yang ditugaskan ke divisinya sendiri (atau divisi `General`/`Internal`).\n"
                    . "3. **Role Read-Only**: Role `admin_utama` dan `admin_progres` bersifat *monitoring / read-only* terhadap progres task.\n"
                    . "4. **Proyek Masih Mode Setup (`pending_setup`)**: PIC harus menyelesaikan **WBS Setup Wizard** terlebih dahulu sebelum task bisa dijalankan.\n"
                    . "5. **Wajib Upload Evidence**: Jika task mengaktifkan *Requires Evidence*, Anda wajib mengunggah bukti PDF/JPG/PNG sebelum menandai 100% selesai.\n\n"
                    . "> 💡 Ingin saya cek task spesifik? Tanyakan: *\"Kenapa task [nama atau kode task] terkunci?\"*",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                ],
                'title_en' => 'Why a Task Is Locked or Cannot Be Updated',
                'content_en' => "### 🔒 Why Is a Task Locked / Unable to Update Progress?\n\n"
                    . "There are 5 main reasons a task slider or checkbox is locked in PROVIS:\n\n"
                    . "1. **Incomplete Predecessor** *(amber lock icon)*: The task depends on a predecessor (e.g. `FS`) that has not reached 100% yet.\n"
                    . "2. **Division Mismatch** *(gray lock icon)*: **Worker** accounts can only update tasks assigned to their own division (or `General`/`Internal`).\n"
                    . "3. **Read-Only Role**: `admin_utama` and `admin_progres` roles have read-only access to task execution.\n"
                    . "4. **Project in WBS Setup Mode (`pending_setup`)**: The PIC must finish the **WBS Setup Wizard** before progress updates are enabled.\n"
                    . "5. **Mandatory Evidence**: If *Requires Evidence* is enabled on the task, you must upload a PDF/JPG/PNG file to reach 100%.\n\n"
                    . "> 💡 Want me to diagnose a specific task? Ask: *\"Why is task [task name or code] blocked?\"*",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'scurve_prediction',
                'phrases'  => [
                    'cara kerja s-curve', 'cara kerja scurve', 'apa itu s-curve', 'apa itu spi',
                    'rumus s-curve', 'garis prediction', 'garis actual', 'planned vs actual',
                    'how does s-curve work', 'what is s-curve', 'what is spi', 'prediction line',
                    'curve shifting', 'deviasi s-curve',
                ],
                'keywords' => ['scurve', 's-curve', 'kurva', 'spi', 'prediction', 'prediksi', 'planned', 'actual', 'deviasi', 'deviation', 'shifting'],
                'title_id' => 'Cara Kerja S-Curve, Actual Progress & Garis Prediksi',
                'content_id' => "### 📈 Cara Kerja S-Curve & Prediksi di PROVIS\n\n"
                    . "Grafik **S-Curve** membandingkan rencana kerja kumulatif terhadap realisasi aktual di lapangan:\n\n"
                    . "- **Planned Progress (Garis Biru)**: Dihitung dari bobot (`weight`) seluruh task yang dijadwalkan aktif dari tanggal mulai hingga selesai proyek.\n"
                    . "- **Actual Progress (Garis Hijau)**: Mengikuti akumulasi bobot aktual dari sub-task yang telah diselesaikan/berprogres pada tanggal realisasinya (bukan pembagian rata linear).\n"
                    . "- **Prediction (Garis Ungu Putus-Putus)**: Menggunakan metode *Curve Shifting* yang menyambung langsung dari titik **Current Timeline** (Actual terakhir) dan memproyeksikan sisa bobot pekerjaan hingga mencapai 100%.\n"
                    . "- **Deviation (%)**: Selisih `Actual - Planned`. Positif (`+`) berarti lebih cepat dari rencana; Negatif (`-`) berarti tertinggal.\n"
                    . "- **SPI (Schedule Performance Index)**: Rasio `Actual / Planned`. Nilai `>= 1.0` berarti *On Track / Ahead*, sedangkan `< 1.0` menandakan keterlambatan jadwal.\n\n"
                    . "> Anda bisa mengganti tampilan per **Day**, **Week**, atau **Year**, serta membuka langsung file **Evidence** pada tabel matriks di bawah grafik.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka S-Curve Report', 'url' => $scurveUrl],
                    ['type' => 'link', 'label' => 'Buka Weekly Progress', 'url' => $weeklyUrl],
                ],
                'title_en' => 'How S-Curve, Actual Progress & Prediction Work',
                'content_en' => "### 📈 How S-Curve & Forecasting Work in PROVIS\n\n"
                    . "The **S-Curve** compares cumulative planned work against real field execution:\n\n"
                    . "- **Planned Progress (Blue Line)**: Aggregated from weighted task schedules distributed across each task's planned duration.\n"
                    . "- **Actual Progress (Green Line)**: Accumulates weighted progress of completed/updated subtasks along their actual completion dates.\n"
                    . "- **Prediction (Dashed Purple Line)**: Uses *Curve Shifting* starting directly from the **Current Timeline** point to project remaining work until 100%.\n"
                    . "- **Deviation (%)**: `Actual - Planned`. Positive (`+`) is ahead of schedule; negative (`-`) is behind schedule.\n"
                    . "- **SPI (Schedule Performance Index)**: `Actual / Planned`. `>= 1.0` means on track/ahead; `< 1.0` indicates schedule slippage.\n\n"
                    . "> You can switch granularity between **Day**, **Week**, and **Year**, and click **Evidence** badges directly in the supporting data matrix.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open S-Curve Report', 'url' => $scurveUrl],
                    ['type' => 'link', 'label' => 'Open Weekly Progress', 'url' => $weeklyUrl],
                ],
            ],
            [
                'id'       => 'create_project_guide',
                'phrases'  => [
                    'cara buat proyek', 'cara membuat proyek', 'cara bikin proyek', 'cara tambah proyek',
                    'cara buat projek', 'cara membuat projek', 'cara bikin projek', 'cara tambah projek',
                    'contoh prompt buat projek', 'contoh prompt buat proyek', 'siapa yang bisa buat proyek',
                    'how to create project', 'how do i create a project', 'create new project guide',
                    'wbs setup wizard',
                ],
                'keywords' => ['template', 'wizard', 'setup', 'multiple', 'buat projek', 'buat proyek'],
                'title_id' => 'Panduan & Contoh Prompt Membuat Projek Baru',
                'content_id' => "### 🚀 Cara Membuat Projek Baru di PROVIS\n\n"
                    . "**1. Langsung Lewat Chat Ini (Otomatis & Interaktif):**\n"
                    . "Kamu bisa pakai contoh prompt lengkap seperti ini:\n"
                    . "> `\"Tolong buatkan saya projek [Nama Projek] dengan nama perusahaan [Nama Perusahaan] yang berdurasi [70 hari / 3 bulan]. Untuk tasknya pakai default (17 task) ya\"`\n\n"
                    . "Santai aja — kalau ada info yang belum lengkap (misalnya lupa sebut nama perusahaan atau durasinya), aku bakal tanyain kekurangannya dulu sebelum dieksekusi!\n\n"
                    . "**2. Lewat Halaman UI Manual:**\n"
                    . "- Buka **Project List** (`/projectlistpage`) → klik **+ New Project** → isi Nama Projek, Perusahaan, Tanggal Mulai/Selesai, lalu selesaikan **WBS Setup Wizard**.\n\n"
                    . "**Siapa yang boleh membuat projek?** **SuperAdmin** dan **PIC** (role `admin_utama`, `admin_progres`, dan `worker` tidak memiliki izin membuat projek baru).",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Project List', 'url' => '/projectlistpage'],
                ],
                'title_en' => 'Guide & Prompt Template: Create a New Project',
                'content_en' => "### 🚀 How to Create a New Project in PROVIS\n\n"
                    . "**1. Directly via This Chat (Interactive):**\n"
                    . "You can type a full prompt like:\n"
                    . "> `\"Create a new project [Project Name] for company [Company Name] with a duration of [70 days / 3 months] using the default template (17 tasks)\"`\n\n"
                    . "Don't worry if you leave something out — I'll simply ask you for the missing piece before confirming and executing!\n\n"
                    . "**2. Manually via UI:**\n"
                    . "- Go to **Project List** (`/projectlistpage`) → click **+ New Project** → enter Title, Company, Start/End Dates, and complete the **WBS Setup Wizard**.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Project List', 'url' => '/projectlistpage'],
                ],
            ],
            [
                'id'       => 'update_duration_schedule_guide',
                'phrases'  => [
                    'mengubah durasi task', 'ubah durasi task', 'ganti durasi task', 'cara ubah durasi',
                    'cara mengubah durasi', 'ubah jadwal task', 'mengubah jadwal task', 'geser jadwal task',
                    'perpanjang durasi', 'ubah tanggal task', 'change task duration', 'how to change duration',
                    'reschedule task', 'update task schedule',
                ],
                'keywords' => ['durasi', 'duration', 'jadwal', 'schedule', 'reschedule', 'geser', 'perpanjang', 'undur', 'tanggal'],
                'title_id' => 'Panduan & Contoh Prompt Mengubah Durasi / Jadwal Task',
                'content_id' => "### ⏱️ Cara Mengubah Durasi & Jadwal Task\n\n"
                    . "**1. Langsung Lewat Chat Ini (Otomatis Cascade Predecessor):**\n"
                    . "Kamu bisa pakai contoh prompt seperti ini:\n"
                    . "- Ubah durasi saja:\n"
                    . "  > `\"Tolong ubah durasi task [Nama Task atau Kode 1.1.2] jadi [14 hari]\"`\n"
                    . "- Ubah tanggal mulai sekaligus durasi:\n"
                    . "  > `\"Geser jadwal task [Nama Task] mulai [15 Desember 2026] selama [10 hari]\"`\n"
                    . "- *(Kalau lupa sebut task atau harinya, ketik saja `\"mau ubah durasi task\"` nanti aku tanyain satu per satu!)*\n\n"
                    . "**2. Lewat Halaman UI:**\n"
                    . "- Buka halaman **Tasks** → klik ikon **Edit (pensil)** pada task terkait → ubah *Start Date*, *End Date*, atau *Duration (days)* lalu simpan. Sistem otomatis menyelaraskan task penerusnya (*cascading*).",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => 'Buka Timeline / Gantt', 'url' => $timelineUrl],
                ],
                'title_en' => 'Guide & Prompt Template: Change Task Duration / Schedule',
                'content_en' => "### ⏱️ How to Change Task Duration & Schedule\n\n"
                    . "**1. Directly via This Chat (Auto-Cascades Dependencies):**\n"
                    . "Use prompt templates like:\n"
                    . "- Change duration:\n"
                    . "  > `\"Change duration of task [Task Name or Code 1.1.2] to [14 days]\"`\n"
                    . "- Shift start date and duration:\n"
                    . "  > `\"Reschedule task [Task Name] starting [2026-12-15] for [10 days]\"`\n\n"
                    . "**2. Manually via UI:**\n"
                    . "- Open **Tasks** → click **Edit** on the task row → adjust Start Date, End Date, or Duration and save.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => 'Open Timeline / Gantt', 'url' => $timelineUrl],
                ],
            ],
            [
                'id'       => 'project_access_management_guide',
                'phrases'  => [
                    'manajemen user yang bisa melihat projek', 'user yang bisa melihat projek', 'user yang bisa melihat proyek',
                    'siapa yang bisa melihat projek', 'siapa yang bisa melihat proyek', 'atur akses projek', 'ubah akses projek',
                    'hak akses projek', 'tambah anggota projek', 'hapus anggota projek', 'jadikan projek private',
                    'ubah projek private', 'manajemen user projek', 'who can view my project', 'manage project access',
                    'project visibility', 'assign user to project', 'private project',
                ],
                'keywords' => ['manajemen user', 'melihat projek', 'melihat proyek', 'akses projek', 'akses proyek', 'visibilitas', 'visibility', 'private', 'public', 'anggota', 'member', 'working tree'],
                'title_id' => 'Panduan & Contoh Prompt Mengatur Akses User yang Bisa Melihat Projek',
                'content_id' => "### 🔐 Cara Mengatur Manajemen User yang Bisa Melihat Projek\n\n"
                    . "Di PROVIS, siapa saja yang bisa melihat sebuah projek diatur lewat **2 cara**: **Penugasan Anggota Projek (Working Tree / Project Access)** dan **Status Private/Public**.\n\n"
                    . "**1. Langsung Lewat Chat Ini (khusus PIC Projek & SuperAdmin):**\n"
                    . "- **Beri izin user untuk melihat projek:**\n"
                    . "  > `\"Berikan akses projek [Nama Projek] ke user [Nama User] divisi [Nama Divisi]\"`\n"
                    . "- **Cabut izin lihat user dari projek:**\n"
                    . "  > `\"Cabut akses user [Nama User] dari projek [Nama Projek]\"`\n"
                    . "- **Ubah projek jadi Private (hanya anggota terpilih) atau Public:**\n"
                    . "  > `\"Ubah projek [Nama Projek] jadi Private\"` atau `\"Jadikan projek [Nama Projek] Public\"`\n\n"
                    . "**2. Lewat Halaman UI:**\n"
                    . "- Buka **Working Tree Structure** (`/working-tree`) untuk menambah/menghapus anggota yang diberi izin melihat projek, atau klik tombol **Private/Public** di kartu projek pada halaman **Project List**.\n"
                    . "- Pengaturan detail *Permission Matrix* per akun juga tersedia di menu **User Management**.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Working Tree', 'url' => "/working-tree{$pidQuery}"],
                    ['type' => 'link', 'label' => 'Buka User Management', 'url' => '/users'],
                ],
                'title_en' => 'Guide & Prompt Template: Manage Project User Access & Visibility',
                'content_en' => "### 🔐 How to Manage Which Users Can View Your Project\n\n"
                    . "In PROVIS, project visibility is controlled via **Project Member Assignments (Working Tree)** and the **Private / Public toggle**.\n\n"
                    . "**1. Directly via This Chat (Project PIC & SuperAdmin):**\n"
                    . "- **Grant a user view access:**\n"
                    . "  > `\"Grant access to project [Project Name] for user [Username] in division [Division]\"`\n"
                    . "- **Revoke a user's access:**\n"
                    . "  > `\"Revoke access of user [Username] from project [Project Name]\"`\n"
                    . "- **Switch Private / Public visibility:**\n"
                    . "  > `\"Set project [Project Name] to Private\"` or `\"Set project [Project Name] to Public\"`\n\n"
                    . "**2. Manually via UI:**\n"
                    . "- Open **Working Tree Structure** (`/working-tree`) to assign or remove project members, or toggle **Private/Public** on the **Project List** page.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Working Tree', 'url' => "/working-tree{$pidQuery}"],
                    ['type' => 'link', 'label' => 'Open User Management', 'url' => '/users'],
                ],
            ],
            [
                'id'       => 'add_task_guide',
                'phrases'  => [
                    'cara tambah task', 'cara menambahkan task', 'cara bikin task', 'cara buat task',
                    'contoh prompt tambah task', 'how to add task', 'how to create task',
                ],
                'keywords' => ['tambah task', 'add task', 'bikin task', 'buat task', 'pekerjaan baru'],
                'title_id' => 'Panduan & Contoh Prompt Menambahkan Task Baru',
                'content_id' => "### ➕ Cara Menambahkan Task Baru\n\n"
                    . "**Lewat Chat Ini:**\n"
                    . "> `\"Tambahkan task baru [Nama Task] di sub task [Nama Sub Task] divisi [Nama Divisi] durasi [7 hari]\"`\n\n"
                    . "Kalau mau langsung menandai sebagai barang PR yang belum terpenuhi, cukup tambahkan kata `status Outstanding` di akhirnya. Kamu juga bisa ketik `\"tambah task baru\"` saja, nanti aku bantu tanyain rinciannya!\n\n"
                    . "**Lewat UI:** Buka menu **Tasks** → expand Main Job & Sub Task → klik **+ Add Task**.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                ],
                'title_en' => 'Guide & Prompt Template: Add a New Task',
                'content_en' => "### ➕ How to Add a New Task\n\n"
                    . "**Via This Chat:**\n"
                    . "> `\"Add new task [Task Name] under sub task [Sub Task Name] division [Division] duration [7 days]\"`\n\n"
                    . "**Via UI:** Open **Tasks** → expand a Main Job & Sub Task → click **+ Add Task**.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'update_status_progress_guide',
                'phrases'  => [
                    'cara ubah status task', 'cara ganti status task', 'cara update progres', 'cara ubah progres',
                    'contoh prompt update progres', 'contoh prompt ubah status', 'how to update progress', 'how to change status',
                ],
                'keywords' => ['ubah status', 'update progres', 'ganti status', 'ubah progres', 'persen'],
                'title_id' => 'Panduan & Contoh Prompt Ubah Status & Update Progres Task',
                'content_id' => "### ✏️ Cara Mengubah Status & Progres Task\n\n"
                    . "**Lewat Chat Ini (dengan konfirmasi aman sebelum disimpan):**\n"
                    . "- **Ubah Status (termasuk `Outstanding`):**\n"
                    . "  > `\"Ubah status task [Nama Task / 1.1.2] jadi Outstanding\"`\n"
                    . "- **Update Persentase Progres:**\n"
                    . "  > `\"Update progres task [Nama Task / 1.1.2] jadi 60%\"`\n\n"
                    . "**Lewat UI:** Buka menu **Tasks** → klik badge status atau geser slider progres pada baris task.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                ],
                'title_en' => 'Guide & Prompt Template: Update Task Status & Progress',
                'content_en' => "### ✏️ How to Update Task Status & Progress\n\n"
                    . "**Via This Chat (with safe confirmation):**\n"
                    . "- **Change Status:** `\"Mark task [Task Name / 1.1.2] as Outstanding\"`\n"
                    . "- **Update Progress:** `\"Update progress of task [Task Name / 1.1.2] to 60%\"`",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'wbs_hierarchy',
                'phrases'  => [
                    'struktur wbs', 'apa itu wbs', '3 tier wbs', 'hierarki wbs', 'bobot wbs', 'hitung bobot',
                    'what is wbs', 'wbs structure', 'wbs weight', 'main job sub task', 'urutan task', 'reorder',
                ],
                'keywords' => ['wbs', 'bobot', 'weight', 'tier', 'hierarki', 'hierarchy', 'main job', 'sub task', 'reorder', 'drag'],
                'title_id' => 'Struktur WBS 3-Tier & Perhitungan Bobot',
                'content_id' => "### 🗂️ Struktur WBS 3-Tier & Sistem Bobot di PROVIS\n\n"
                    . "PROVIS memakai hierarki **3-Tier Work Breakdown Structure (WBS)**:\n"
                    . "1. **Main Job (Level 1)** — Kode `1`, `2`, `3`, dst. Total bobot seluruh Main Job merepresentasikan **100%** proyek.\n"
                    . "2. **Sub Task / Sub Main Job (Level 2)** — Kode `1.1`, `1.2`, dst. Bobot otomatis dibagi merata dari Main Job induknya (atau bisa dikustomisasi total 100%).\n"
                    . "3. **Task / Item Pekerjaan (Level 3)** — Kode `1.1.1`, `1.1.2`, dst. Di level inilah pekerja/divisi memperbarui progres `0%–100%`, status (`Open`, `On Track`, `Outstanding`, `Completed`, dll.), serta bukti (*evidence*).\n\n"
                    . "**Sinkronisasi Otomatis:**\n"
                    . "- Setiap perubahan progres di Level 3 otomatis menghitung ulang progres Level 2, Level 1, hingga **Overall Progress Proyek** secara berbobot (*weighted*).\n"
                    . "- PIC/SuperAdmin dapat mengubah urutan WBS menggunakan fitur *drag-and-drop* di halaman **Tasks**.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks (WBS)', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => 'Buka Project Detail', 'url' => $projDetailUrl],
                ],
                'title_en' => '3-Tier WBS Structure & Weight Calculation',
                'content_en' => "### 🗂️ 3-Tier WBS Structure & Weighting in PROVIS\n\n"
                    . "PROVIS organizes project scope in a **3-Tier Work Breakdown Structure (WBS)**:\n"
                    . "1. **Main Job (Level 1)** — Codes `1`, `2`, `3`, etc. Main Job weights represent the project's **100%** total scope.\n"
                    . "2. **Sub Task (Level 2)** — Codes `1.1`, `1.2`, etc. Automatically inherits evenly split weight from its parent Main Job (or custom 100% weights).\n"
                    . "3. **Task Item (Level 3)** — Codes `1.1.1`, `1.1.2`, etc. Leaf tasks where divisions update `0%–100%` progress, statuses (`Open`, `On Track`, `Outstanding`, `Completed`, etc.), and evidence files.\n\n"
                    . "**Automatic Roll-Up:**\n"
                    . "- Updating any Level 3 task automatically recalculates Level 2, Level 1, and overall project weighted progress.\n"
                    . "- PICs and SuperAdmins can drag-and-drop items to reorder WBS codes on the **Tasks** page.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks (WBS)', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => 'Open Project Detail', 'url' => $projDetailUrl],
                ],
            ],
            [
                'id'       => 'evidence_upload',
                'phrases'  => [
                    'upload evidence', 'unggah bukti', 'aturan evidence', 'format evidence', 'ukuran file evidence',
                    'syarat bukti', 'bukti penyelesaian', 'evidence requirement', 'file size limit', 'max mb',
                ],
                'keywords' => ['evidence', 'bukti', 'lampiran', 'attachment', 'upload', 'unggah', 'pdf', 'jpg', 'png', 'foto', 'photo'],
                'title_id' => 'Aturan Upload Evidence (Bukti Penyelesaian)',
                'content_id' => "### 📎 Aturan Upload Evidence (Bukti Penyelesaian Task)\n\n"
                    . "- **Format File yang Diizinkan**: `PDF`, `JPG`, `JPEG`, dan `PNG`.\n"
                    . "- **Batas Ukuran File**:\n"
                    . "  * **PDF**: Maksimal **20 MB**\n"
                    . "  * **Foto (JPG / PNG)**: Maksimal **10 MB**\n"
                    . "- **Task Wajib Evidence**: Jika opsi *Requires Evidence for Completion* aktif pada suatu task, sistem mewajibkan minimal 1 file bukti sebelum task dapat ditandai **100% Completed**.\n"
                    . "- **Melihat Bukti**: Semua file bukti dapat dibuka langsung dari halaman **Tasks** (tombol `Ev`), **Today's Tasks**, maupun matriks tabel **S-Curve Report**.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => "Buka Today's Tasks", 'url' => "/today-tasks{$pidQuery}"],
                ],
                'title_en' => 'Evidence Upload Rules & Limits',
                'content_en' => "### 📎 Evidence Upload Requirements\n\n"
                    . "- **Allowed Formats**: `PDF`, `JPG`, `JPEG`, and `PNG`.\n"
                    . "- **Maximum File Size**:\n"
                    . "  * **PDF**: Max **20 MB**\n"
                    . "  * **Images (JPG / PNG)**: Max **10 MB**\n"
                    . "- **Mandatory Evidence**: When *Requires Evidence for Completion* is enabled on a task, at least one valid file must be attached before marking progress as **100% Completed**.\n"
                    . "- **Viewing Evidence**: Uploaded files can be previewed directly from **Tasks** (`Ev` button), **Today's Tasks**, and the **S-Curve Report** supporting matrix.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                    ['type' => 'link', 'label' => "Open Today's Tasks", 'url' => "/today-tasks{$pidQuery}"],
                ],
            ],
            [
                'id'       => 'task_statuses',
                'phrases'  => [
                    'daftar status', 'arti status', 'macam status', 'jenis status', 'perbedaan status',
                    'status warna', 'all statuses', 'status meanings', 'list of statuses', 'status badge',
                ],
                'keywords' => ['status', 'badge', 'warna', 'color', 'label', 'at risk', 'delayed', 'on track', 'cancelled'],
                'title_id' => 'Arti Semua Label Status di PROVIS',
                'content_id' => "### 🏷️ Daftar & Arti Label Status di PROVIS\n\n"
                    . "PROVIS memiliki **7 label status** dengan warna pembeda masing-masing:\n"
                    . "- 🟢 **Open** *(Hijau)*: Pekerjaan sudah terdaftar namun belum dimulai (`0%`).\n"
                    . "- 🔵 **On Track** *(Biru)*: Pekerjaan sedang berjalan sesuai jadwal (`1%–99%`).\n"
                    . "- 🟣 **Outstanding** *(Ungu)*: Khusus barang/item dari **PR (Purchase Request) yang belum terpenuhi**.\n"
                    . "- 🟡 **At Risk** *(Amber)*: Pekerjaan berpotensi mengalami hambatan jadwal.\n"
                    . "- 🔴 **Delayed** *(Merah)*: Pekerjaan telah melewati batas waktu / terlambat.\n"
                    . "- 🟪 **Completed** *(Indigo)*: Pekerjaan telah selesai `100%`.\n"
                    . "- ⚪ **Cancelled** *(Abu-abu)*: Pekerjaan dibatalkan.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Tasks', 'url' => $tasksUrl],
                ],
                'title_en' => 'Meaning of All Status Labels in PROVIS',
                'content_en' => "### 🏷️ Status Labels & Color Meanings in PROVIS\n\n"
                    . "PROVIS uses **7 distinct status badges**:\n"
                    . "- 🟢 **Open** *(Green)*: Registered task that has not started yet (`0%`).\n"
                    . "- 🔵 **On Track** *(Blue)*: Active task progressing as planned (`1%–99%`).\n"
                    . "- 🟣 **Outstanding** *(Purple)*: Dedicated to **PR (Purchase Request) goods/items not yet fulfilled**.\n"
                    . "- 🟡 **At Risk** *(Amber)*: Task facing potential schedule risk.\n"
                    . "- 🔴 **Delayed** *(Red)*: Task behind schedule / overdue.\n"
                    . "- 🟪 **Completed** *(Indigo)*: Task finished at `100%`.\n"
                    . "- ⚪ **Cancelled** *(Gray)*: Cancelled work item.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Tasks', 'url' => $tasksUrl],
                ],
            ],
            [
                'id'       => 'roles_permissions',
                'phrases'  => [
                    'hak akses role', 'perbedaan role', 'daftar role', 'apa itu pic', 'apa itu admin utama',
                    'apa itu admin progres', 'permission matrix', 'working tree', 'multi company', 'beta tester',
                    'user roles', 'role permissions', 'who can edit', 'access denied 403',
                ],
                'keywords' => ['role', 'peran', 'superadmin', 'admin_utama', 'admin_progres', 'pic', 'worker', 'matrix', 'working tree', '403'],
                'title_id' => 'Hak Akses Role & Permission Matrix',
                'content_id' => "### 🛡️ Struktur Role & Hak Akses di PROVIS\n\n"
                    . "- **SuperAdmin**: Akses penuh lintas semua perusahaan, proyek, master template WBS, divisi, audit log global, dan aktivasi *AI Beta Tester*.\n"
                    . "- **Admin Utama (`admin_utama`)**: Monitoring seluruh proyek (non-private), budget, laporan S-Curve, serta manajemen pengguna perusahaan (*read-only* pada eksekusi task).\n"
                    . "- **Admin Progres (`admin_progres`)**: Fokus pemantauan progres mingguan, S-Curve, dan progres per divisi (*read-only*).\n"
                    . "- **PIC (`pic`)**: Project Manager yang berwenang mengatur WBS (tambah/edit/hapus Main Job, Sub Task, Task), predecessor, bobot, dan menugaskan anggota tim di **Working Tree**.\n"
                    . "- **Worker (`worker`)**: Anggota pelaksana lapangan yang memperbarui progres (`0–100%`), status, dan mengunggah *evidence* khusus untuk task pada divisinya di proyek yang ditugaskan.\n\n"
                    . "> Jika muncul halaman **403 Access Denied**, artinya menu atau proyek tersebut berada di luar *Permission Matrix* atau perusahaan akun Anda.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Working Tree', 'url' => "/working-tree{$pidQuery}"],
                ],
                'title_en' => 'User Roles & Permission Matrix',
                'content_en' => "### 🛡️ Role Hierarchy & Access Control in PROVIS\n\n"
                    . "- **SuperAdmin**: Full global control across all companies, projects, master WBS templates, divisions, audit logs, and *AI Beta Tester* flags.\n"
                    . "- **Admin Utama (`admin_utama`)**: Executive monitoring across public projects, budget realization, S-Curve, and company user management (read-only on task execution).\n"
                    . "- **Admin Progres (`admin_progres`)**: Dedicated to monitoring weekly progress, S-Curve, and division metrics (read-only).\n"
                    . "- **PIC (`pic`)**: Project Manager authorized to manage WBS hierarchy, predecessors, weights, and assign project members in the **Working Tree**.\n"
                    . "- **Worker (`worker`)**: Field team member who updates progress (`0–100%`), statuses, and uploads completion evidence for tasks assigned to their division.\n\n"
                    . "> Seeing **HTTP 403 Access Denied** means the requested page or project is outside your account's *Permission Matrix* or company scope.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Working Tree', 'url' => "/working-tree{$pidQuery}"],
                ],
            ],
            [
                'id'       => 'budget_guide',
                'phrases'  => [
                    'cara catat budget', 'cara input budget', 'cara kerja budget', 'budget health',
                    'kategori budget', 'export budget', 'how does budget work', 'how to add budget',
                ],
                'keywords' => ['budget', 'anggaran', 'pengeluaran', 'expenditure', 'realization', 'realisasi', 'csv', 'health'],
                'title_id' => 'Panduan Budget Management & Kesehatan Anggaran',
                'content_id' => "### 💰 Panduan Budget Realization di PROVIS\n\n"
                    . "Halaman **Budget Management** mencatat realisasi pengeluaran proyek yang terhubung ke kode Sub WBS:\n"
                    . "- **Kategori Pengeluaran**: `Material`, `Services (Jasa)`, `Machinery (Mesin)`, `Equipment (Peralatan)`, `Logistics (Logistik)`, dan `Other (Lainnya)`.\n"
                    . "- **Indikator Budget Health**:\n"
                    . "  * **Optimal**: Realisasi `<= 80%` dari total anggaran.\n"
                    . "  * **Warning**: Realisasi `81% – 95%`.\n"
                    . "  * **Critical**: Realisasi `> 95%` (mendekati atau melebihi pagu).\n"
                    . "- **Export CSV**: Klik tombol **Export CSV** di kanan atas halaman Budget untuk mengunduh seluruh rincian transaksi.\n\n"
                    . "> 💡 Ingin melihat rincian angka budget proyek aktif? Tanyakan: *\"Berapa total dan sisa budget proyek ini?\"*",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Budget Management', 'url' => $budgetUrl],
                ],
                'title_en' => 'Budget Management & Health Indicators Guide',
                'content_en' => "### 💰 Budget Realization Guide\n\n"
                    . "The **Budget Management** page tracks project expenditures tied directly to WBS codes:\n"
                    . "- **Categories**: `Material`, `Services`, `Machinery`, `Equipment`, `Logistics`, and `Other`.\n"
                    . "- **Budget Health Thresholds**:\n"
                    . "  * **Optimal**: `<= 80%` of allocated budget used.\n"
                    . "  * **Warning**: `81% – 95%` used.\n"
                    . "  * **Critical**: `> 95%` used (approaching or exceeding ceiling).\n"
                    . "- **Export CSV**: Click **Export CSV** on the Budget page to download all transaction records.\n\n"
                    . "> 💡 Want live numbers? Ask: *\"Show budget summary for this project\"*.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Budget Management', 'url' => $budgetUrl],
                ],
            ],
            [
                'id'       => 'date_reconciliation_guide',
                'phrases'  => [
                    'apa itu rekonsiliasi', 'fungsi rekonsiliasi', 'cara kerja rekonsiliasi', 'self healing tanggal',
                    'what is date reconciliation', 'how does reconciliation work', 'sync dates',
                ],
                'keywords' => ['rekonsiliasi', 'reconcile', 'self-healing', 'sinkronisasi', 'sync'],
                'title_id' => 'Apa Itu Rekonsiliasi Tanggal Otomatis?',
                'content_id' => "### 🛠️ Fungsi Rekonsiliasi Tanggal (Self-Healing)\n\n"
                    . "**Rekonsiliasi Tanggal** memindai seluruh hierarki WBS proyek untuk memastikan konsistensi tanggal:\n"
                    . "- Menyelaraskan rentang tanggal **Sub Task** agar selalu menaungi seluruh task di bawahnya.\n"
                    . "- Menyelaraskan rentang tanggal **Main Job** agar tidak lebih sempit dari Sub Task di dalamnya.\n"
                    . "- Mencatat seluruh penyesuaian secara transparan di **Audit Log** atas nama `Provis Support System`.\n\n"
                    . "> Untuk menjalankannya, cukup ketik: *\"Jalankan rekonsiliasi tanggal proyek ini\"* (saya akan meminta konfirmasi Anda dulu sebelum mengeksekusi).",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Lihat Timeline / Gantt', 'url' => $timelineUrl],
                ],
                'title_en' => 'What Is Automatic Date Reconciliation?',
                'content_en' => "### 🛠️ Automatic Date Reconciliation (Self-Healing)\n\n"
                    . "**Date Reconciliation** scans a project's WBS hierarchy to keep schedules consistent:\n"
                    . "- Aligns **Sub Task** start/end dates so they cover all child leaf tasks.\n"
                    . "- Aligns **Main Job** boundaries so they match their child Sub Tasks.\n"
                    . "- Logs every adjustment in the **Audit Log** under `Provis Support System`.\n\n"
                    . "> To run it, simply say: *\"Reconcile dates for this project\"* (I will ask for your confirmation before executing).",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Timeline / Gantt', 'url' => $timelineUrl],
                ],
            ],
            [
                'id'       => 'division_progress_guide',
                'phrases'  => [
                    'cara kerja division progress', 'apa itu division progress', 'progres divisi',
                    'multi division', 'how does division progress work',
                ],
                'keywords' => ['division progress', 'multi-division', 'pengajuan divisi'],
                'title_id' => 'Panduan Division Progress',
                'content_id' => "### 👷 Panduan Division Progress\n\n"
                    . "Halaman **Division Progress** mengelompokkan seluruh task proyek berdasarkan divisi penanggung jawab (termasuk task yang melibatkan **lebih dari 1 divisi**).\n"
                    . "- Menampilkan rasio **Completed**, **In Progress**, dan **Remaining** untuk setiap divisi.\n"
                    . "- Memudahkan PIC/Admin mengidentifikasi divisi mana yang sedang mengalami bottleneck.\n\n"
                    . "> 💡 Anda bisa langsung bertanya: *\"Bagaimana progres per divisi di proyek ini?\"* atau *\"Tampilkan task divisi Maintenance\"*.",
                'actions_id' => [
                    ['type' => 'link', 'label' => 'Buka Division Progress', 'url' => $divProgUrl],
                ],
                'title_en' => 'Division Progress Guide',
                'content_en' => "### 👷 Division Progress Guide\n\n"
                    . "The **Division Progress** page aggregates project tasks by responsible division (including multi-division assignments).\n"
                    . "- Displays **Completed**, **In Progress**, and **Remaining** counts per division.\n"
                    . "- Helps PICs and Admins spot division bottlenecks quickly.\n\n"
                    . "> 💡 Ask me directly: *\"Show division progress for this project\"* or *\"List Maintenance division tasks\"*.",
                'actions_en' => [
                    ['type' => 'link', 'label' => 'Open Division Progress', 'url' => $divProgUrl],
                ],
            ],
        ];
    }
}
