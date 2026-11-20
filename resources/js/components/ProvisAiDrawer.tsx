import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { usePage } from '@inertiajs/react';
import {
  Bot,
  X,
  Send,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  History,
  RefreshCw,
  Maximize2,
  Brain,
  Sparkles,
  Zap,
  Loader2,
  ArrowLeft,
  Search,
  MessageSquare,
  Check,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    status?: 'thinking' | 'completed' | string;
    thinking_stage?: string | null;
    learning_task_id?: number;
    learned_from_memory?: boolean;
    newly_learned?: boolean;
    learned_knowledge_id?: number | null;
    actions?: Array<{ type: string; label: string; url: string }>;
    tokens_used?: number;
    mode?: string;
    [key: string]: any;
  };
  actions?: Array<{ type: string; label: string; url: string }>;
  created_at?: string;
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  messages_count?: number;
}

interface ActiveTaskInfo {
  id: number;
  session_id: number;
  assistant_message_id: number;
  status: string;
  stage_label?: string | null;
}

function getCsrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const metaToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
  if (metaToken) {
    headers['X-CSRF-TOKEN'] = metaToken;
  }
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  if (match && match[1]) {
    try {
      headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
    } catch {
      headers['X-XSRF-TOKEN'] = match[1];
    }
  }
  return headers;
}

function getSemanticCodeClass(val: string): string {
  const v = val.trim().toLowerCase();
  if (v === 'on track' || v === 'completed' || v === 'selesai' || v === 'public' || /^\+\d/.test(v)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/90 font-semibold';
  }
  if (v === 'outstanding' || v === 'open' || v === 'private' || v === 'superadmin') {
    return 'bg-violet-50 text-violet-700 border-violet-200/90 font-semibold';
  }
  if (
    v.includes('tertinggal') ||
    v.includes('delayed') ||
    v.includes('overdue') ||
    v.includes('telat') ||
    /^-\d/.test(v) ||
    /^\+\d+h$/.test(v)
  ) {
    return 'bg-rose-50 text-rose-700 border-rose-200/90 font-semibold';
  }
  if (v.startsWith('#') || v.includes('spi') || v.startsWith('rp') || v.includes('%')) {
    return 'bg-sky-50 text-sky-800 border-sky-200/90 font-semibold';
  }
  return 'bg-indigo-50/70 text-indigo-900 border-indigo-200/70 font-medium';
}

// Split segments by `|` or `·` only at top level (never inside parentheses)
function splitTopLevelSegments(text: string): string[] {
  const segments: string[] = [];
  let buf = '';
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;

    if (depth === 0 && (ch === '|' || ch === '·')) {
      const s = buf.trim();
      if (s) segments.push(s);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) segments.push(tail);
  return segments;
}

// Keep `emoji + short label` and tight parenthetical text atomic
function renderUnbreakableTextChunk(chunk: string, baseKey: string): React.ReactNode {
  const rx = /((?:⚠️|🟢|🟡|🔴|🏆|📉|✅)\s*[^,;|()]{1,28}|\([^()]{1,36}\))/gu;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = rx.exec(chunk)) !== null) {
    if (m.index > last) {
      nodes.push(chunk.slice(last, m.index));
    }
    nodes.push(
      <span key={`${baseKey}-u-${idx++}`} className="inline-block whitespace-nowrap">
        {m[0]}
      </span>
    );
    last = rx.lastIndex;
  }

  if (last < chunk.length) {
    nodes.push(chunk.slice(last));
  }
  return nodes.length <= 1 ? (nodes[0] ?? chunk) : nodes;
}

// ─────────────────────────────────────────────────────────────
// Format Inline Tokens: `(#id)` atomic, **bold**, *italic*, `code`
// ─────────────────────────────────────────────────────────────
function formatInlineStyles(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const parenCodeMatch = remaining.match(/\(\s*`([^`]+)`\s*\)/);
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

    let earliest: RegExpMatchArray | null = null;
    let type = '';

    if (parenCodeMatch && parenCodeMatch.index !== undefined) {
      earliest = parenCodeMatch;
      type = 'parenCode';
    }

    if (boldMatch && boldMatch.index !== undefined) {
      if (!earliest || (boldMatch.index ?? 0) < (earliest.index ?? 0)) {
        earliest = boldMatch;
        type = 'bold';
      }
    }

    if (codeMatch && codeMatch.index !== undefined) {
      if (!earliest || (codeMatch.index ?? 0) < (earliest.index ?? 0)) {
        earliest = codeMatch;
        type = 'code';
      }
    }

    if (italicMatch && italicMatch.index !== undefined) {
      if (!earliest || (italicMatch.index ?? 0) < (earliest.index ?? 0)) {
        earliest = italicMatch;
        type = 'italic';
      }
    }

    if (!earliest || earliest.index === undefined) {
      parts.push(renderUnbreakableTextChunk(remaining, `t-${key++}`));
      break;
    }

    if (earliest.index > 0) {
      parts.push(renderUnbreakableTextChunk(remaining.substring(0, earliest.index), `p-${key++}`));
    }

    if (type === 'parenCode') {
      parts.push(
        <span key={key++} className="inline-flex items-baseline whitespace-nowrap text-slate-400">
          (
          <code className={`px-1 py-0.2 rounded font-mono text-[10.5px] border ${getSemanticCodeClass(earliest[1])}`}>
            {earliest[1]}
          </code>
          )
        </span>
      );
    } else if (type === 'bold') {
      parts.push(
        <strong key={key++} className="font-semibold text-slate-900">
          {earliest[1]}
        </strong>
      );
    } else if (type === 'code') {
      parts.push(
        <code
          key={key++}
          className={`inline-block px-1.5 py-0.5 rounded-md font-mono text-[11px] border whitespace-nowrap ${getSemanticCodeClass(earliest[1])}`}
        >
          {earliest[1]}
        </code>
      );
    } else if (type === 'italic') {
      parts.push(
        <em key={key++} className="italic text-slate-600">
          {earliest[1]}
        </em>
      );
    }

    remaining = remaining.substring(earliest.index + earliest[0].length);
  }

  return parts;
}

function MetricPillList({
  segments,
  isFullscreen,
}: {
  segments: string[];
  isFullscreen: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center ${isFullscreen ? 'gap-2 mt-1' : 'gap-1.5 mt-1'}`}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/75 border border-slate-200/80 text-slate-700 whitespace-nowrap leading-tight ${
            isFullscreen ? 'text-[11.5px]' : 'text-[11px]'
          }`}
        >
          {formatInlineStyles(seg)}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Format Block Content (Dual Responsive Mode: Sidebar vs Full Screen)
// ─────────────────────────────────────────────────────────────
function renderFormattedContent(text: string, isFullscreen: boolean) {
  const lines = text.split('\n');
  const renderedBlocks: React.ReactNode[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const indentMatch = line.match(/^(\s*)/);
    const leadingSpaces = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    if (!trimmed) {
      renderedBlocks.push(<div key={`sp-${idx}`} className={isFullscreen ? 'h-1.5' : 'h-1'} />);
      continue;
    }

    // Section Title (H3)
    if (trimmed.startsWith('### ')) {
      const headerText = trimmed.replace(/^###\s+/, '');
      renderedBlocks.push(
        <div
          key={idx}
          className={`rounded-xl bg-gradient-to-r from-indigo-50 via-violet-50/70 to-sky-50 border-l-4 border-indigo-600 border-y border-r border-indigo-200/70 text-indigo-950 font-bold mb-2 shadow-2xs leading-snug ${
            isFullscreen ? 'px-3.5 py-2 text-[14px]' : 'px-3 py-1.5 text-[12.5px]'
          }`}
        >
          {formatInlineStyles(headerText)}
        </div>
      );
      continue;
    }

    // Subheading (H4)
    if (trimmed.startsWith('#### ')) {
      const headerText = trimmed.replace(/^####\s+/, '');
      renderedBlocks.push(
        <h4
          key={idx}
          className={`font-bold text-indigo-900 border-b border-indigo-100 pb-1 mt-2.5 mb-1 ${
            isFullscreen ? 'text-[13px]' : 'text-[12px]'
          }`}
        >
          {formatInlineStyles(headerText)}
        </h4>
      );
      continue;
    }

    // Pair consecutive 🏆/✅ + 📉/⚠️ highlight callouts side-by-side in Full Screen Mode
    if (isFullscreen && /^(🏆|✅)/.test(trimmed) && idx + 1 < lines.length && /^(📉|⚠️)/.test(lines[idx + 1].trim())) {
      const nextTrimmed = lines[idx + 1].trim();
      renderedBlocks.push(
        <div key={`callout-grid-${idx}`} className="grid grid-cols-1 md:grid-cols-2 gap-2 my-1.5">
          <div className="px-3 py-2 rounded-lg bg-emerald-50/85 border border-emerald-200/80 text-emerald-950 text-[12.5px] leading-snug">
            {formatInlineStyles(trimmed)}
          </div>
          <div className="px-3 py-2 rounded-lg bg-amber-50/85 border border-amber-200/80 text-amber-950 text-[12.5px] leading-snug">
            {formatInlineStyles(nextTrimmed)}
          </div>
        </div>
      );
      idx++;
      continue;
    }

    // Top-level Ranked / Numbered Items (`1.`, `2.`, ...)
    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s+(.*)/);
      const num = match?.[1] || '1';
      const body = match?.[2] || '';
      const isTopRank = num === '1';

      // Separate trailing "(meta · status)" from entity title so phrases never break awkwardly
      const trailingMetaMatch = body.match(/^(.*?\S)\s+(\((?:[^()]|`[^`]+`)+\))\s*$/);
      const segments = splitTopLevelSegments(body);

      renderedBlocks.push(
        <div
          key={idx}
          className={`flex items-start gap-2.5 pt-2 pb-0.5 ${leadingSpaces >= 2 ? 'ml-5' : ''}`}
        >
          <span
            className={`min-w-[20px] h-5 px-1.5 rounded-md text-[10.5px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
              isTopRank
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-indigo-100 text-indigo-800 border border-indigo-200/80'
            }`}
          >
            {num}
          </span>
          <div className="flex-1 min-w-0 text-slate-800 leading-snug">
            {segments.length >= 3 ? (
              isFullscreen ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="font-medium text-slate-900">{formatInlineStyles(segments[0])}</div>
                  <MetricPillList segments={segments.slice(1)} isFullscreen={true} />
                </div>
              ) : (
                <div>
                  <div className="font-medium text-slate-900">{formatInlineStyles(segments[0])}</div>
                  <MetricPillList segments={segments.slice(1)} isFullscreen={false} />
                </div>
              )
            ) : trailingMetaMatch ? (
              <div className={isFullscreen ? 'flex flex-wrap items-baseline gap-x-2 gap-y-0.5' : 'space-y-0.5'}>
                <span className="font-medium text-slate-900">{formatInlineStyles(trailingMetaMatch[1])}</span>
                <span className="inline-block text-[11px] text-slate-500 whitespace-nowrap">
                  {formatInlineStyles(trailingMetaMatch[2])}
                </span>
              </div>
            ) : (
              <div>{formatInlineStyles(body)}</div>
            )}
          </div>
        </div>
      );
      continue;
    }

    // Nested / Indented Sub-Bullets (`   •` or `   -` or `     -`)
    if (/^[•*-]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[•*-]\s+/, '');
      const isNested = leadingSpaces >= 2;
      const segments = splitTopLevelSegments(itemText);

      // Pure summary metric bar vs Entity name + metrics
      const firstHasMetricNumber = segments.length >= 2 && /^(?:Rata|SPI|Deviasi|Aktual|Progres|Target|Prediksi|Overdue|Total|Realisasi|Status)\b/i.test(segments[0].replace(/[*`]/g, '').trim());

      renderedBlocks.push(
        <div
          key={idx}
          className={`flex items-start gap-2 my-0.5 ${
            isNested
              ? `ml-6 pl-2.5 border-l-2 border-indigo-200/80 text-slate-600 ${isFullscreen ? 'text-[12.5px]' : 'text-[11.5px]'}`
              : 'pl-1 text-slate-700'
          }`}
        >
          <span
            className={`rounded-full shrink-0 mt-1.5 ${
              isNested ? 'w-1.5 h-1.5 bg-indigo-400' : 'w-1.5 h-1.5 bg-indigo-500'
            }`}
          />
          <div className="flex-1 min-w-0 leading-snug">
            {segments.length >= 2 && firstHasMetricNumber ? (
              <MetricPillList segments={segments} isFullscreen={isFullscreen} />
            ) : segments.length >= 2 ? (
              isFullscreen ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="text-slate-800">{formatInlineStyles(segments[0])}</div>
                  <MetricPillList segments={segments.slice(1)} isFullscreen={true} />
                </div>
              ) : (
                <div>
                  <div className="text-slate-800">{formatInlineStyles(segments[0])}</div>
                  <MetricPillList segments={segments.slice(1)} isFullscreen={false} />
                </div>
              )
            ) : (
              <div>{formatInlineStyles(itemText)}</div>
            )}
          </div>
        </div>
      );
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      renderedBlocks.push(
        <div
          key={idx}
          className="border-l-3 border-indigo-400 bg-indigo-50/40 rounded-r-lg px-3 py-1.5 text-[11.5px] italic text-slate-600 my-1.5"
        >
          {formatInlineStyles(quoteText)}
        </div>
      );
      continue;
    }

    // Standalone Semantic Callout Lines
    if (/^(🏆|✅)/.test(trimmed)) {
      renderedBlocks.push(
        <div
          key={idx}
          className={`px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-emerald-950 leading-snug ${
            isFullscreen ? 'text-[12.5px]' : 'text-[11.5px]'
          }`}
        >
          {formatInlineStyles(trimmed)}
        </div>
      );
      continue;
    }
    if (/^(📉|⚠️)/.test(trimmed)) {
      renderedBlocks.push(
        <div
          key={idx}
          className={`px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200/80 text-amber-950 leading-snug ${
            isFullscreen ? 'text-[12.5px]' : 'text-[11.5px]'
          }`}
        >
          {formatInlineStyles(trimmed)}
        </div>
      );
      continue;
    }
    if (trimmed.startsWith('🔒')) {
      renderedBlocks.push(
        <div
          key={idx}
          className={`px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 leading-snug ${
            isFullscreen ? 'text-[12.5px]' : 'text-[12px]'
          }`}
        >
          {formatInlineStyles(trimmed)}
        </div>
      );
      continue;
    }
    if (trimmed.startsWith('💡')) {
      renderedBlocks.push(
        <div
          key={idx}
          className="px-2.5 py-1.5 rounded-lg bg-sky-50/80 border border-sky-200/80 text-sky-950 text-[11.5px] mt-1 leading-snug"
        >
          {formatInlineStyles(trimmed)}
        </div>
      );
      continue;
    }

    // Highlight standalone summary/title line without ###
    if (idx === 0 && /^(?:[\p{Emoji}\u2600-\u27BF]|📊|📈|📉|👥|🏢|🗂️|📁|💰|📌|🧠|🤖)/u.test(trimmed)) {
      renderedBlocks.push(
        <div
          key={idx}
          className={`rounded-xl bg-gradient-to-r from-indigo-50 via-violet-50/70 to-sky-50 border-l-4 border-indigo-600 border-y border-r border-indigo-200/70 text-indigo-950 font-semibold mb-1.5 shadow-2xs leading-snug ${
            isFullscreen ? 'px-3.5 py-2 text-[14px]' : 'px-3 py-1.5 text-[12.5px]'
          }`}
        >
          {formatInlineStyles(trimmed)}
        </div>
      );
      continue;
    }

    renderedBlocks.push(
      <div key={idx} className={leadingSpaces >= 2 ? 'ml-5 text-slate-600' : ''}>
        {formatInlineStyles(trimmed)}
      </div>
    );
  }

  return (
    <div
      className={`space-y-1.5 text-slate-700 break-normal ${
        isFullscreen ? 'text-[13px] leading-[1.65]' : 'text-[12px] leading-[1.55]'
      }`}
    >
      {renderedBlocks}
    </div>
  );
}

export default function ProvisAiDrawer() {
  const { user } = useAuth();
  const page = usePage() as any;

  // Determine active project ID if currently on a project page
  const activeProjectId = (() => {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = searchParams.get('project_id');
    if (fromQuery) return Number(fromQuery);

    const match = window.location.pathname.match(/\/projects\/(\d+)/);
    if (match) return Number(match[1]);

    return page?.props?.project?.id ?? null;
  })();

  const canAccess = Boolean(user?.can_access_ai || user?.isSuperAdmin || user?.is_ai_beta_tester);

  // Side-by-side panel states
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('provis_ai_open') === 'true';
    }
    return false;
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('provis_ai_fullscreen') === 'true';
    }
    return false;
  });

  const [isDocked, setIsDocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('provis_ai_docked');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const sessionStorageKey = user?.id ? `provis_ai_active_session_${user.id}` : 'provis_ai_active_session';
  const getMsgCacheKey = useCallback(
    (sid: number | null) => (user?.id && sid ? `provis_ai_cached_msgs_${user.id}_${sid}` : null),
    [user?.id]
  );

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [processingSessionIds, setProcessingSessionIds] = useState<number[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTaskInfo[]>([]);
  const [hasUnreadReady, setHasUnreadReady] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      const saved = localStorage.getItem(`provis_ai_active_session_${user.id}`);
      return saved ? Number(saved) : null;
    }
    return null;
  });
  // Synchronously hydrate last messages from sessionStorage so page navigation / refresh NEVER flashes
  // the welcome screen or triggers a dizzying top-to-bottom fast scroll!
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      try {
        const savedSid = localStorage.getItem(`provis_ai_active_session_${user.id}`);
        if (savedSid) {
          const cached = sessionStorage.getItem(`provis_ai_cached_msgs_${user.id}_${savedSid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) return parsed;
          }
        }
      } catch {
        // Ignore storage parse error
      }
    }
    return [];
  });
  const [isHydrating, setIsHydrating] = useState<boolean>(() => {
    // Only show subtle hydrating state if a saved session exists but has no cached messages yet
    if (typeof window !== 'undefined' && user?.id) {
      const savedSid = localStorage.getItem(`provis_ai_active_session_${user.id}`);
      if (savedSid) {
        try {
          const cached = sessionStorage.getItem(`provis_ai_cached_msgs_${user.id}_${savedSid}`);
          return !cached;
        } catch {
          return true;
        }
      }
    }
    return false;
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionToast, setSessionToast] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ChatSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollModeRef = useRef<'instant' | 'smooth' | 'preserve'>('instant');
  const prevMsgCountRef = useRef<number>(messages.length);
  const prevFullscreenRef = useRef<boolean>(isFullscreen);
  const pinBottomDuringResizeRef = useRef<boolean>(false);
  const [fullscreenAnim, setFullscreenAnim] = useState<'none' | 'enter' | 'exit'>('none');
  const [isDrawerVisible, setIsDrawerVisible] = useState<boolean>(isOpen);
  const isOpenRef = useRef<boolean>(isOpen);
  const currentSessionIdRef = useRef<number | null>(currentSessionId);
  const prevThinkingCountRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      setIsDrawerVisible(true);
    } else {
      const t = window.setTimeout(() => setIsDrawerVisible(false), 260);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  // Immediately focus chat input whenever sidebar / fullscreen / new session opens in chat mode
  useEffect(() => {
    if (!isOpen || showHistory || pendingDeleteSession) return;
    const focusInput = () => {
      const el = textareaRef.current;
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          // ignore
        }
      }
    };
    const t1 = window.setTimeout(focusInput, 50);
    const t2 = window.setTimeout(focusInput, 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isOpen, showHistory, isFullscreen, currentSessionId, pendingDeleteSession]);

  // Keep chat pinned at the latest bottom message throughout the entire fullscreen resize animation
  useEffect(() => {
    if (!isOpen || showHistory) return;
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (pinBottomDuringResizeRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isOpen, showHistory]);

  // Escape exits full-screen cleanly
  useEffect(() => {
    if (!isOpen || !isFullscreen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, isFullscreen]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setHasUnreadReady(false);
      // When reopening panel, snap directly to bottom without flying scroll animation
      scrollModeRef.current = 'instant';
    }
  }, [isOpen]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
    if (typeof window !== 'undefined' && user?.id) {
      if (currentSessionId) {
        localStorage.setItem(sessionStorageKey, String(currentSessionId));
      } else {
        localStorage.removeItem(sessionStorageKey);
      }
    }
  }, [currentSessionId, sessionStorageKey, user?.id]);

  // Keep sessionStorage snapshot synced so navigating pages / pressing F5 stays pinned at the last chat seamlessly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getMsgCacheKey(currentSessionId);
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(messages.slice(-60)));
    } catch {
      // Ignore quota errors
    }
  }, [messages, currentSessionId, getMsgCacheKey]);

  // Derived thinking state (true if current messages have a thinking bubble OR any background task is active)
  const hasThinkingMessage = messages.some(m => m.metadata?.status === 'thinking');
  const hasThinkingMsgRef = useRef<boolean>(hasThinkingMessage);
  hasThinkingMsgRef.current = hasThinkingMessage;
  const isThinkingInBackground = hasThinkingMessage || activeTasks.length > 0;

  // Broadcast layout state so Layout.tsx & SuperAdminLayout.tsx can adjust side-by-side margins
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const panelWidth = 440;
      localStorage.setItem('provis_ai_open', isOpen ? 'true' : 'false');
      localStorage.setItem('provis_ai_width', String(panelWidth));
      localStorage.setItem('provis_ai_fullscreen', isFullscreen ? 'true' : 'false');
      localStorage.setItem('provis_ai_docked', isDocked ? 'true' : 'false');

      const effectiveMargin = isOpen && isDocked && !isFullscreen ? panelWidth : 0;
      window.dispatchEvent(
        new CustomEvent('provis-ai-state-change', {
          detail: { isOpen, width: isFullscreen ? window.innerWidth : panelWidth, isDocked, isFullscreen, effectiveMargin },
        })
      );
    }
  }, [isOpen, isFullscreen, isDocked]);

  // Broadcast live background thinking / answer-ready status to Header trigger buttons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('provis-ai-bg-status', {
          detail: {
            isThinking: isThinkingInBackground,
            hasUnreadReady: !isOpen && hasUnreadReady,
            activeCount: activeTasks.length || (hasThinkingMessage ? 1 : 0),
          },
        })
      );
    }
  }, [isThinkingInBackground, hasUnreadReady, isOpen, activeTasks.length, hasThinkingMessage]);

  // Listen for toggle requests from Navbar/Header trigger buttons
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('provis-ai-toggle-request', handleToggle);
    return () => window.removeEventListener('provis-ai-toggle-request', handleToggle);
  }, []);

  // Smart zero-motion-sickness scroll positioning:
  // - On page navigation, F5 refresh, drawer open, session switch, or fullscreen enter/exit:
  //   snaps INSTANTLY to the bottom BEFORE paint (plus one post-reflow frame check) so the latest chat always stays visible!
  // - On active new message send/receive: gently scrolls smoothly only if near bottom.
  useLayoutEffect(() => {
    if (!isOpen || showHistory) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const fullscreenToggled = prevFullscreenRef.current !== isFullscreen;
    prevFullscreenRef.current = isFullscreen;
    if (fullscreenToggled) {
      scrollModeRef.current = 'instant';
      pinBottomDuringResizeRef.current = true;
      setFullscreenAnim(isFullscreen ? 'enter' : 'exit');
      window.setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
        pinBottomDuringResizeRef.current = false;
      }, 280);
      window.setTimeout(() => {
        setFullscreenAnim('none');
      }, 260);
    }

    const mode = scrollModeRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    const grew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (mode === 'instant') {
      container.scrollTop = container.scrollHeight;
      scrollModeRef.current = 'preserve';
      const raf = window.requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
      return () => window.cancelAnimationFrame(raf);
    } else if (mode === 'smooth') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      scrollModeRef.current = 'preserve';
    } else if (isNearBottom && (grew || isLoading)) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isOpen, showHistory, isLoading, isFullscreen]);

  const loadSession = useCallback(async (sessionId: number, hideHistory = true) => {
    const switchingSession = currentSessionIdRef.current !== sessionId;
    setCurrentSessionId(sessionId);
    if (hideHistory) {
      setShowHistory(false);
    }
    try {
      const res = await fetch(`/ai/sessions/${sessionId}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (switchingSession || scrollModeRef.current === 'instant') {
          scrollModeRef.current = 'instant';
        }
        setMessages(data.messages || []);
      } else if (res.status === 404) {
        // Session may have been pruned after H+7 or deleted
        const oldKey = getMsgCacheKey(sessionId);
        if (oldKey) {
          try { sessionStorage.removeItem(oldKey); } catch { /* ignore */ }
        }
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('Error loading session', e);
    } finally {
      setIsHydrating(false);
    }
  }, [getMsgCacheKey]);

  const fetchSessions = useCallback(async (autoLoadSaved = false) => {
    try {
      const res = await fetch('/ai/sessions', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const list: ChatSession[] = data.sessions || [];
        const procIds: number[] = data.processing_session_ids || [];
        setSessions(list);
        setProcessingSessionIds(procIds);

        if (autoLoadSaved && list.length > 0) {
          const savedRaw = typeof window !== 'undefined' ? localStorage.getItem(sessionStorageKey) : null;
          const savedId = savedRaw ? Number(savedRaw) : null;
          const targetId =
            (savedId && list.some(s => s.id === savedId) ? savedId : null) ??
            (procIds.length > 0 ? procIds[0] : null) ??
            list[0].id;

          if (targetId) {
            await loadSession(targetId, false);
          } else {
            setIsHydrating(false);
          }
        } else if (autoLoadSaved) {
          setIsHydrating(false);
        }
      }
    } catch (e) {
      console.error('Error fetching AI sessions', e);
      setIsHydrating(false);
    }
  }, [loadSession, sessionStorageKey]);

  const syncActiveBackgroundTasks = useCallback(async () => {
    try {
      const res = await fetch('/ai/tasks/active', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;

      const data = await res.json();
      const proc: ActiveTaskInfo[] = data.processing_tasks || [];
      const recentDone: ActiveTaskInfo[] = data.recently_completed || [];

      setActiveTasks(proc);
      setProcessingSessionIds(Array.from(new Set(proc.map(t => t.session_id))));

      // Detect transition from thinking -> finished while sidebar is closed!
      if (prevThinkingCountRef.current > 0 && proc.length === 0 && !isOpenRef.current) {
        setHasUnreadReady(true);
      }
      prevThinkingCountRef.current = proc.length;

      // Keep current session messages synced if active or recently finished in current session
      const curSid = currentSessionIdRef.current;
      const affectsCurrent =
        curSid &&
        (proc.some(t => t.session_id === curSid) || recentDone.some(t => t.session_id === curSid));

      if (curSid && (affectsCurrent || hasThinkingMsgRef.current)) {
        const sRes = await fetch(`/ai/sessions/${curSid}`, {
          headers: { Accept: 'application/json' },
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          setMessages(sData.messages || []);
        }
      } else if (!curSid && proc.length > 0) {
        await loadSession(proc[0].session_id, false);
      }
    } catch (e) {
      // Silent retry on transient network hiccup
    }
  }, [loadSession]);

  // Initial hydration on mount — runs REGARDLESS of whether sidebar is open or closed,
  // so closing sidebar, changing PROVIS pages, or refreshing (F5) immediately restores
  // the active conversation and resumes any in-flight local AI thinking process!
  useEffect(() => {
    if (!canAccess) return;
    fetchSessions(true);
    syncActiveBackgroundTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, user?.id]);

  // When sidebar opens again, immediately refresh active session so completed answers show up right away
  useEffect(() => {
    if (isOpen && canAccess) {
      fetchSessions(false);
      if (currentSessionIdRef.current) {
        loadSession(currentSessionIdRef.current, false);
      }
    }
  }, [isOpen, canAccess, fetchSessions, loadSession]);

  // Continuous lightweight background polling while any local self-learning task is thinking
  // (stays alive even when the user closes the sidebar!)
  useEffect(() => {
    if (!canAccess || !isThinkingInBackground) return;

    const intervalId = window.setInterval(() => {
      syncActiveBackgroundTasks();
    }, 600);

    return () => window.clearInterval(intervalId);
  }, [canAccess, isThinkingInBackground, syncActiveBackgroundTasks]);

  const startNewSession = async () => {
    if (isCreatingSession) return;
    setShowHistory(false);
    setMessages([]);
    setInputText('');

    // Already on a fresh empty conversation -> focus input immediately with crisp feedback
    if (currentSessionIdRef.current === null) {
      setSessionToast('New session ready');
      window.setTimeout(() => setSessionToast(null), 1800);
      textareaRef.current?.focus();
      return;
    }

    setIsCreatingSession(true);
    try {
      const res = await fetch('/ai/sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          ...getCsrfHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Conversation' }),
      });

      if (res.ok) {
        const data = await res.json();
        const newSession: ChatSession = data.session;
        currentSessionIdRef.current = newSession.id;
        setSessions(prev => [newSession, ...prev.filter(s => s.id !== newSession.id)]);
        setCurrentSessionId(newSession.id);
        setMessages([]);
        setSessionToast('New session created');
        window.setTimeout(() => setSessionToast(null), 1800);
      } else {
        // Fallback to clean local draft session so '+' NEVER leaves the user stuck on old messages
        currentSessionIdRef.current = null;
        setCurrentSessionId(null);
        setMessages([]);
        setSessionToast('Ready for new chat');
        window.setTimeout(() => setSessionToast(null), 1800);
      }
    } catch (e) {
      console.error('Error creating new session', e);
      currentSessionIdRef.current = null;
      setCurrentSessionId(null);
      setMessages([]);
    } finally {
      setIsCreatingSession(false);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const requestRenameSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const cancelRenameSession = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveRenameSession = async (sessionId: number, e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const cleanTitle = editingTitle.trim();
    if (!cleanTitle || isRenamingSession) return;

    setIsRenamingSession(true);
    try {
      const res = await fetch(`/ai/sessions/${sessionId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          ...getCsrfHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: cleanTitle }),
      });

      if (res.ok) {
        const data = await res.json();
        const updatedTitle = data.session?.title || cleanTitle;
        setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: updatedTitle } : s)));
        setEditingSessionId(null);
        setEditingTitle('');
        setSessionToast('Conversation renamed');
        window.setTimeout(() => setSessionToast(null), 1800);
      }
    } catch (err) {
      console.error('Error renaming session', err);
    } finally {
      setIsRenamingSession(false);
    }
  };

  const requestDeleteSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteSession(session);
  };

  const confirmDeleteSession = async () => {
    if (!pendingDeleteSession || isDeletingSession) return;
    const sessionId = pendingDeleteSession.id;
    setIsDeletingSession(true);
    try {
      const res = await fetch(`/ai/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getCsrfHeaders(),
      });
      if (res.ok) {
        const oldKey = getMsgCacheKey(sessionId);
        if (oldKey) {
          try { sessionStorage.removeItem(oldKey); } catch { /* ignore */ }
        }
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          currentSessionIdRef.current = null;
          setCurrentSessionId(null);
          setMessages([]);
        }
        setPendingDeleteSession(null);
      }
    } catch (e) {
      console.error('Error deleting session', e);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: textToSend,
    };

    scrollModeRef.current = 'smooth';
    setMessages(prev => [...prev, userMessage]);
    if (!overrideText) setInputText('');
    setIsLoading(true);

    try {
      const endpoint = currentSessionId ? `/ai/sessions/${currentSessionId}/chat` : '/ai/chat';

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          ...getCsrfHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          session_id: currentSessionId,
          project_id: activeProjectId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.session_id) {
          if (!currentSessionId || currentSessionId !== data.session_id) {
            currentSessionIdRef.current = data.session_id;
            setCurrentSessionId(data.session_id);
          }
          fetchSessions(false);
        }

        const assistantEntry: ChatMessage = {
          id: data.message_id,
          role: 'assistant',
          content: data.content,
          actions: data.actions || data.metadata?.actions || [],
          metadata: data.metadata,
        };

        scrollModeRef.current = 'smooth';
        setMessages(prev => [...prev, assistantEntry]);

        // If backend started an async local self-learning task, immediately register it
        // so polling stays active even if the user closes the sidebar or refreshes!
        if (data.metadata?.status === 'thinking' && data.learning_task_id) {
          prevThinkingCountRef.current = Math.max(1, prevThinkingCountRef.current + 1);
          setActiveTasks(prev => [
            ...prev.filter(t => t.id !== data.learning_task_id),
            {
              id: data.learning_task_id,
              session_id: data.session_id,
              assistant_message_id: data.message_id,
              status: 'processing',
              stage_label: data.metadata?.thinking_stage || null,
            },
          ]);
          setProcessingSessionIds(prev =>
            prev.includes(data.session_id) ? prev : [...prev, data.session_id]
          );
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: errData.message || 'Sorry, an error occurred while processing your request.',
          },
        ]);
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection to server lost. Please check that the server is running and try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!canAccess) {
    return null;
  }

  const quickPrompts = user?.isSuperAdmin
    ? [
        { label: '📊 Off-Plan & Delayed Projects Recap', prompt: 'Show me a recap of all delayed or off-plan projects' },
        { label: '🛠️ Reconcile Schedule Dates', prompt: activeProjectId ? `Please reconcile dates for project ID #${activeProjectId}` : 'Please run date reconciliation for all projects' },
        { label: '📝 Recent Git Commits Summary', prompt: 'What are the latest git commits and code updates?' },
        { label: '📄 Generate Executive PDF Report', prompt: activeProjectId ? `Generate an executive PDF report for project ID #${activeProjectId}` : 'Generate a project summary PDF report' },
        { label: '👥 User Statistics & AI Access', prompt: 'Which users currently have AI beta tester access?' },
      ]
    : [
        { label: '🚀 Create New Project (WBS)', prompt: 'Create a new 6-month project using a WBS template' },
        { label: '📄 Generate Project PDF Report', prompt: activeProjectId ? `Generate an executive PDF report for this project` : 'Generate a project PDF report' },
        { label: '🔗 Set Task Predecessor', prompt: 'How do I set predecessor dependencies between tasks?' },
        { label: '📊 Project Status & Progress', prompt: activeProjectId ? `What is the current progress and remaining time of this project?` : 'What is the current status of active projects?' },
      ];

  const filteredSessions = sessions.filter(s =>
    !historySearch.trim() || s.title.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <>
      <style>{`
        @keyframes provisFsEnter {
          0% { transform: scale(0.965); opacity: 0.72; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes provisFsExit {
          0% { transform: scale(1.03); opacity: 0.72; }
          100% { transform: scale(1); opacity: 1; }
        }
        .provis-anim-enter {
          animation: provisFsEnter 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: right center;
        }
        .provis-anim-exit {
          animation: provisFsExit 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: right center;
        }
      `}</style>

      {/* Solid Opaque Slide Drawer (no opacity black ghost fade, no mid-frame text squishing) */}
      <div
        aria-hidden={!isOpen}
        className={`fixed top-0 right-0 bottom-0 flex flex-col font-sans overflow-hidden ${
          isFullscreen
            ? 'z-50 bg-slate-50 shadow-none'
            : 'z-40 bg-white border-l border-slate-200/90 shadow-xl'
        } ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          width: isFullscreen ? '100vw' : '440px',
          maxWidth: '100vw',
          visibility: isOpen || isDrawerVisible ? 'visible' : 'hidden',
          transform: isOpen ? 'translate3d(0, 0, 0)' : 'translate3d(100%, 0, 0)',
          transition: 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        <div
          className={`flex flex-col flex-1 min-h-0 ${
            fullscreenAnim === 'enter'
              ? 'provis-anim-enter'
              : fullscreenAnim === 'exit'
              ? 'provis-anim-exit'
              : ''
          }`}
        >
        {/* Header */}
          <div className="border-b border-slate-200/80 bg-white flex-shrink-0">
            <div className={`px-4 py-3 flex items-center justify-between ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Bot size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-[13.5px] text-slate-900 truncate">Provis Assistant</h3>
                    <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                      Beta
                    </span>
                    {sessionToast && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
                        <Check size={10} />
                        {sessionToast}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-500 truncate">
                    {user?.isSuperAdmin ? 'SuperAdmin Copilot · Local AI' : 'Project Copilot · Local AI'}
                  </p>
                </div>
              </div>

              {/* Header Toolbar: Sidebar = icons only; Full Screen = clean text buttons without icons */}
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {isFullscreen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsFullscreen(false)}
                      className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title="Exit Full Screen"
                    >
                      Exit full screen
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (showHistory) scrollModeRef.current = 'instant';
                        setShowHistory(prev => !prev);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors cursor-pointer ${
                        showHistory
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-indigo-700 hover:bg-indigo-50'
                      }`}
                      title="Session History"
                    >
                      History
                    </button>

                    <button
                      type="button"
                      onClick={startNewSession}
                      disabled={isCreatingSession}
                      className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-colors cursor-pointer disabled:opacity-50"
                      title="New Session"
                    >
                      {isCreatingSession ? 'Creating…' : 'New Session'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsFullscreen(true)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                      title="Full Screen"
                    >
                      <Maximize2 size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (showHistory) scrollModeRef.current = 'instant';
                        setShowHistory(prev => !prev);
                      }}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        showHistory
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50'
                      }`}
                      title="Session History"
                    >
                      <History size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={startNewSession}
                      disabled={isCreatingSession}
                      className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-50"
                      title="New Session"
                    >
                      {isCreatingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close Panel"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Dedicated Top-Anchored Session History Drawer */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto bg-indigo-50/35">
              <div className={`p-4 space-y-3 ${isFullscreen ? 'max-w-3xl mx-auto w-full' : ''}`}>
                <div className="flex items-center justify-between bg-white border border-indigo-200/80 rounded-xl px-3.5 py-2.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        scrollModeRef.current = 'instant';
                        setShowHistory(false);
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                      title="Back to Chat"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-indigo-950">Conversation History</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                          {sessions.length}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500">Select a session below to continue chatting</p>
                    </div>
                  </div>
                </div>

                {sessions.length > 3 && (
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search conversation history…"
                      className="w-full pl-8 pr-3 py-2 text-[12px] bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {filteredSessions.length === 0 ? (
                    <div className="p-6 text-center bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-[12px]">
                      {historySearch ? 'No matching conversations found.' : 'No conversation history yet.'}
                    </div>
                  ) : (
                    filteredSessions.map(s => {
                      const isActive = currentSessionId === s.id;
                      const isEditing = editingSessionId === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => !isEditing && loadSession(s.id)}
                          className={`group flex items-center justify-between p-3 rounded-xl border text-[12px] transition-all ${
                            isEditing ? 'cursor-default' : 'cursor-pointer'
                          } ${
                            isActive
                              ? 'bg-white border-2 border-indigo-500 ring-2 ring-indigo-500/15 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1 pr-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                isActive
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                              }`}
                            >
                              <MessageSquare size={13} />
                            </div>
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <form
                                  onSubmit={(e) => saveRenameSession(s.id, e)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        cancelRenameSession();
                                      }
                                    }}
                                    maxLength={100}
                                    placeholder="Conversation name…"
                                    className="flex-1 min-w-0 px-2 py-1 text-[12px] font-medium text-slate-900 bg-slate-50 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                  />
                                  <button
                                    type="submit"
                                    disabled={!editingTitle.trim() || isRenamingSession}
                                    className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer shrink-0"
                                    title="Save Name"
                                  >
                                    {isRenamingSession ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelRenameSession}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer shrink-0"
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </form>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`truncate font-semibold ${isActive ? 'text-indigo-950' : 'text-slate-800'}`}>
                                      {s.title}
                                    </span>
                                    {isActive && (
                                      <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-indigo-100 text-indigo-700 shrink-0">
                                        Active
                                      </span>
                                    )}
                                    {processingSessionIds.includes(s.id) && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                        <Loader2 size={9} className="animate-spin" />
                                        Thinking
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10.5px] text-slate-400 mt-0.5">
                                    <span>
                                      {new Date(s.created_at).toLocaleDateString('en-US', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                    {typeof s.messages_count === 'number' && (
                                      <span>· {s.messages_count} messages</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => requestRenameSession(s, e)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Rename Conversation"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => requestDeleteSession(s, e)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Session"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Chat Messages View */
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              <div className={`space-y-4 ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
                {isHydrating && messages.length === 0 ? (
                  <div className="h-60 flex items-center justify-center text-slate-400 text-[12px] gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    <span>Loading last conversation…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="min-h-[360px] flex flex-col justify-center items-center text-center px-4 py-8">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center mb-3 shadow-sm">
                      <Bot size={22} />
                    </div>
                    <h4 className="font-bold text-[15px] text-slate-900">
                      Hello, {user?.name || user?.username}!
                    </h4>
                    <p className="text-[12px] text-slate-500 max-w-sm mt-1 mb-5 leading-relaxed">
                      PROVIS operational assistant is ready to help analyze S-Curves, project progress, budgets, accounts, and WBS schedules concisely.
                    </p>

                    <div className={`w-full space-y-1.5 text-left ${isFullscreen ? 'max-w-lg' : ''}`}>
                      <span className="text-[10.5px] font-bold text-indigo-600 uppercase tracking-wider block mb-1.5">
                        Quick Actions:
                      </span>
                      {quickPrompts.map((qp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(qp.prompt)}
                          className="w-full p-2.5 text-left text-[12px] font-medium text-slate-700 bg-white hover:bg-indigo-50/60 hover:border-indigo-300 hover:text-indigo-950 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isThinkingMsg = msg.role === 'assistant' && msg.metadata?.status === 'thinking';
                    const msgActions = msg.actions && msg.actions.length > 0
                      ? msg.actions
                      : (msg.metadata?.actions || []);

                    return (
                      <div
                        key={msg.id ?? index}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`rounded-2xl shadow-xs ${
                            isFullscreen
                              ? 'max-w-[85%] px-5 py-4 text-[13px] leading-[1.65]'
                              : 'max-w-[97%] px-3.5 py-2.5 text-[12px] leading-[1.55]'
                          } ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-br-xs'
                              : isThinkingMsg
                              ? 'bg-gradient-to-br from-indigo-50 via-white to-violet-50 border border-indigo-200 text-slate-800 rounded-bl-xs'
                              : 'bg-white border border-slate-200/90 border-t-2 border-t-indigo-500/80 text-slate-800 rounded-bl-xs'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          ) : isThinkingMsg ? (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                  <Brain size={13} className="animate-pulse" />
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-[12px] text-indigo-900">
                                    Thinking &amp; Learning
                                  </span>
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </span>
                                </div>
                              </div>

                              <p className="text-[12px] text-slate-700 leading-relaxed">
                                {msg.content}
                              </p>

                              {msg.metadata?.thinking_stage && (
                                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/90 border border-indigo-100 text-[11px] font-medium text-indigo-700">
                                  <Loader2 size={12} className="animate-spin shrink-0 text-indigo-600" />
                                  <span className="truncate">{msg.metadata.thinking_stage}</span>
                                </div>
                              )}

                              <p className="text-[10.5px] text-slate-500 leading-snug pt-0.5">
                                💡 You can close this panel or refresh the page — PROVIS AI continues processing in the background.
                              </p>
                            </div>
                          ) : (
                            <>
                              {renderFormattedContent(msg.content, isFullscreen)}

                              {(msg.metadata?.learned_from_memory || msg.metadata?.newly_learned) && (
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                                  {msg.metadata?.learned_from_memory ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                      <Zap size={10} />
                                      Instant Answer from Local Memory
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                      <Sparkles size={10} />
                                      Newly Learned &amp; Saved Locally
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {!isThinkingMsg && msgActions.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-2">
                              {msgActions.map((act, actIdx) => (
                                <a
                                  key={actIdx}
                                  href={act.url}
                                  target={act.url.startsWith('http') || act.url.includes('/storage/') || act.url.includes('/report-view') ? '_blank' : '_self'}
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-2xs cursor-pointer"
                                >
                                  {act.url.endsWith('.pdf') || act.url.includes('report') ? <FileText size={12} /> : <ExternalLink size={12} />}
                                  <span>{act.label}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {isLoading && (
                  <div className="flex items-start gap-2">
                    <div className="bg-white border border-indigo-200 rounded-2xl rounded-bl-xs px-3.5 py-2 text-[12px] text-indigo-700 flex items-center gap-2 shadow-2xs">
                      <RefreshCw size={13} className="animate-spin text-indigo-600" />
                      <span>Analyzing request…</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3 border-t border-slate-200/80 bg-white flex-shrink-0">
            <div className={isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}>
              <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type an instruction or question… (Enter to send)"
                  rows={2}
                  disabled={isLoading}
                  className="flex-1 bg-transparent border-0 resize-none text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 px-1 py-0.5"
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={!inputText.trim() || isLoading}
                  className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs"
                  title="Send"
                >
                  <Send size={13} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 mt-1.5">
                <span>Shift + Enter for new line</span>
                <div className="flex items-center gap-3">
                  {isFullscreen && <span>Press Esc to exit Full Screen</span>}
                  {activeProjectId && <span className="text-indigo-600 font-medium">Active Project: #{activeProjectId}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation Dialog before deleting a chat session */}
          {pendingDeleteSession && (
            <div
              className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
              onClick={() => !isDeletingSession && setPendingDeleteSession(null)}
            >
              <div
                className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl p-4 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                    <Trash2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[13.5px] text-slate-900">Delete chat history?</h4>
                    <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
                      Conversation <strong className="text-slate-900 break-words">"{pendingDeleteSession.title}"</strong> and all its messages will be permanently deleted.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteSession(null)}
                    disabled={isDeletingSession}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteSession}
                    disabled={isDeletingSession}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingSession && <Loader2 size={12} className="animate-spin" />}
                    <span>Yes, Delete</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
