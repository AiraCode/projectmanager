<?php

namespace App\Services;

class GitChangelogService
{
    /**
     * Get recent git commits with parsed metadata.
     */
    public function getRecentCommits(int $limit = 10): array
    {
        $command = "git log -n {$limit} --pretty=format:\"%H|%an|%ad|%s\" --date=short";
        $output = @shell_exec($command);

        if (!$output) {
            return [];
        }

        $lines = array_filter(explode("\n", trim($output)));
        $commits = [];

        foreach ($lines as $line) {
            $parts = explode('|', trim($line), 4);
            if (count($parts) === 4) {
                [$hash, $author, $date, $subject] = $parts;
                $shortHash = substr($hash, 0, 7);

                // Get files changed in this commit
                $filesCmd = "git diff-tree --no-commit-id --name-only -r {$hash}";
                $filesOutput = @shell_exec($filesCmd);
                $files = $filesOutput ? array_filter(explode("\n", trim($filesOutput))) : [];

                $commits[] = [
                    'hash'       => $hash,
                    'short_hash' => $shortHash,
                    'author'     => $author,
                    'date'       => $date,
                    'subject'    => $subject,
                    'files'      => array_values($files),
                    'type'       => $this->categorizeCommit($subject, $files),
                ];
            }
        }

        return $commits;
    }

    /**
     * Categorize a commit based on conventional commits or modified files.
     */
    protected function categorizeCommit(string $subject, array $files): string
    {
        $lower = strtolower($subject);
        if (str_starts_with($lower, 'feat') || str_contains($lower, 'add ') || str_contains($lower, 'implement')) {
            return 'Feature';
        }
        if (str_starts_with($lower, 'fix') || str_contains($lower, 'resolve') || str_contains($lower, 'repair')) {
            return 'Bugfix';
        }
        if (str_starts_with($lower, 'test') || str_contains($lower, 'test')) {
            return 'Testing';
        }

        foreach ($files as $file) {
            if (str_contains($file, 'migrations/')) {
                return 'Database';
            }
        }

        return 'Chore / Refactor';
    }

    /**
     * Format the recent commits into a clean Markdown block ready for LLM consumption.
     */
    public function formatForAiPrompt(int $limit = 8): string
    {
        $commits = $this->getRecentCommits($limit);
        if (empty($commits)) {
            return "Tidak ada riwayat commit git yang ditemukan pada repositori lokal.";
        }

        $md = "### Riwayat Commit Git Terbaru (" . count($commits) . " Update Terakhir):\n\n";

        foreach ($commits as $c) {
            $fileList = !empty($c['files']) ? "\n   - Berkas: " . implode(', ', array_slice($c['files'], 0, 4)) . (count($c['files']) > 4 ? " (+ " . (count($c['files']) - 4) . " lainnya)" : "") : "";
            $md .= "- `{$c['short_hash']}` [{$c['date']}] **[{$c['type']}]** {$c['subject']} (Oleh: {$c['author']}){$fileList}\n";
        }

        return $md;
    }
}
