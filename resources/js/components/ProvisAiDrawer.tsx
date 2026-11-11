import React, { useState, useEffect, useRef } from 'react';
import { usePage } from '@inertiajs/react';
import {
  Sparkles,
  Bot,
  X,
  Send,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  AlertCircle,
  Clock,
  History,
  CheckCircle2,
  RefreshCw,
  Maximize2,
  Minimize2,
  Columns2,
  ShieldCheck,
  ChevronRight,
  SplitSquareVertical,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
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

// ─────────────────────────────────────────────────────────────
// Format Inline Tokens: **bold**, *italic*, `code`
// ─────────────────────────────────────────────────────────────
function formatInlineStyles(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

    let earliest: RegExpMatchArray | null = null;
    let type = '';

    if (boldMatch && boldMatch.index !== undefined) {
      earliest = boldMatch;
      type = 'bold';
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
      parts.push(remaining);
      break;
    }

    if (earliest.index > 0) {
      parts.push(remaining.substring(0, earliest.index));
    }

    if (type === 'bold') {
      parts.push(
        <strong key={key++} className="font-bold text-neutral-900">
          {earliest[1]}
        </strong>
      );
    } else if (type === 'code') {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-violet-100/70 text-violet-800 font-mono text-[11px] border border-violet-200">
          {earliest[1]}
        </code>
      );
    } else if (type === 'italic') {
      parts.push(
        <em key={key++} className="italic text-neutral-700">
          {earliest[1]}
        </em>
      );
    }

    remaining = remaining.substring(earliest.index + earliest[0].length);
  }

  return parts;
}

// ─────────────────────────────────────────────────────────────
// Format Block Content (Headers, Lists, Quotes, Paragraphs)
// ─────────────────────────────────────────────────────────────
function renderFormattedContent(text: string) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-[12.5px] leading-relaxed text-neutral-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        if (trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
          const headerText = trimmed.replace(/^#{3,4}\s+/, '');
          return (
            <h4 key={idx} className="font-bold text-[13.5px] text-neutral-900 mt-2 mb-1">
              {formatInlineStyles(headerText)}
            </h4>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const itemText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5 flex-shrink-0" />
              <div className="flex-1">{formatInlineStyles(itemText)}</div>
            </div>
          );
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="font-bold text-[10.5px] text-violet-700 bg-violet-100/70 border border-violet-200 rounded px-1.5 py-0.2 flex-shrink-0">
                {match?.[1]}.
              </span>
              <div className="flex-1">{formatInlineStyles(match?.[2] || '')}</div>
            </div>
          );
        }

        if (trimmed.startsWith('>')) {
          const quoteText = trimmed.replace(/^>\s*/, '');
          return (
            <div key={idx} className="border-l-2 border-violet-500 bg-violet-50/60 rounded-r-lg px-2.5 py-1 text-[12px] italic text-neutral-600 my-1">
              {formatInlineStyles(quoteText)}
            </div>
          );
        }

        return <div key={idx}>{formatInlineStyles(line)}</div>;
      })}
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

  // Side-by-side Antigravity panel states
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('provis_ai_open') === 'true';
    }
    return false;
  });

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('provis_ai_width')) || 440;
    }
    return 440;
  });

  const [isDocked, setIsDocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('provis_ai_docked');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Broadcast layout state so Layout.tsx & SuperAdminLayout.tsx can adjust side-by-side margins
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('provis_ai_open', isOpen ? 'true' : 'false');
      localStorage.setItem('provis_ai_width', String(panelWidth));
      localStorage.setItem('provis_ai_docked', isDocked ? 'true' : 'false');

      const effectiveMargin = isOpen && isDocked ? panelWidth : 0;
      window.dispatchEvent(
        new CustomEvent('provis-ai-state-change', {
          detail: { isOpen, width: panelWidth, isDocked, effectiveMargin },
        })
      );
    }
  }, [isOpen, panelWidth, isDocked]);

  // Auto-scroll messages to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  // Fetch sessions on open
  useEffect(() => {
    if (isOpen && canAccess) {
      fetchSessions();
    }
  }, [isOpen, canAccess]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/ai/sessions', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (!currentSessionId && data.sessions?.length > 0) {
          loadSession(data.sessions[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching AI sessions', e);
    }
  };

  const loadSession = async (sessionId: number) => {
    setCurrentSessionId(sessionId);
    setShowHistory(false);
    try {
      const res = await fetch(`/ai/sessions/${sessionId}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Error loading session', e);
    }
  };

  const startNewSession = async () => {
    try {
      const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
      const res = await fetch('/ai/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf || '',
          Accept: 'application/json',
        },
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        const newSession = data.session;
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setMessages([]);
        setShowHistory(false);
      }
    } catch (e) {
      console.error('Error creating new session', e);
    }
  };

  const deleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
      const res = await fetch(`/ai/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': csrf || '',
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error('Error deleting session', e);
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: textToSend,
    };

    setMessages(prev => [...prev, userMessage]);
    if (!overrideText) setInputText('');
    setIsLoading(true);

    try {
      const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
      const endpoint = currentSessionId ? `/ai/sessions/${currentSessionId}/chat` : '/ai/chat';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf || '',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          session_id: currentSessionId,
          project_id: activeProjectId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.session_id && !currentSessionId) {
          setCurrentSessionId(data.session_id);
          fetchSessions();
        }
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.content,
            actions: data.actions || [],
            metadata: data.metadata,
          },
        ]);
      } else {
        const errData = await res.json().catch(() => ({}));
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: errData.message || 'Maaf, terjadi kendala saat memproses permintaan Anda.',
          },
        ]);
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Koneksi ke server terputus. Pastikan server aktif dan coba lagi.',
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
        { label: '📊 Rekap Proyek Off-Plan & Deviasi', prompt: 'Tampilkan rekap proyek mana saja yang terlambat atau berjalan tidak sesuai plan' },
        { label: '🛠️ Rekonsiliasi Tanggal Otomatis', prompt: activeProjectId ? `Tolong rekonsiliasi tanggal proyek ID #${activeProjectId}` : 'Tolong jalankan rekonsiliasi tanggal untuk semua proyek' },
        { label: '📝 Update Codingan & Git Commit', prompt: 'Apa saja update kodingan dan commit terakhir dari git?' },
        { label: '📄 Buat Laporan Eksekutif PDF', prompt: activeProjectId ? `Buatkan laporan eksekutif PDF proyek ID #${activeProjectId}` : 'Buatkan laporan proyek dalam bentuk PDF' },
        { label: '👥 Statistik User & Beta Tester', prompt: 'Siapa saja user yang memiliki akses beta tester?' },
      ]
    : [
        { label: '🚀 Buat Proyek Baru (WBS Template)', prompt: 'Buatkan proyek baru dengan jadwal 6 bulan memakai template wbs' },
        { label: '📄 Buat Laporan Eksekutif PDF', prompt: activeProjectId ? `Buatkan laporan eksekutif PDF proyek ini` : 'Buatkan laporan PDF proyek' },
        { label: '🔗 Atur Predecessor Task', prompt: 'Bagaimana cara mengatur predecessor dependensi antar pekerjaan?' },
        { label: '📊 Ringkasan Status & Progres', prompt: activeProjectId ? `Berapa progres dan sisa waktu proyek ini?` : 'Bagaimana status proyek aktif saat ini?' },
      ];

  return (
    <>
      {/* Floating Trigger Button (when panel is collapsed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white font-bold text-[13px] shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
          }}
          title="Buka Provis AI Assistant (Side by Side)"
        >
          <div className="relative">
            <Sparkles size={18} className="animate-pulse text-amber-300" />
          </div>
          <span>Provis AI</span>
          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-white/20 border border-white/30 tracking-wider">
            Beta
          </span>
          <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30">
            Side by Side
          </span>
        </button>
      )}

      {/* Persistent Antigravity-Style Side-by-Side Panel (No dark blocking backdrop!) */}
      {isOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 bg-white border-l border-neutral-200 flex flex-col shadow-2xl transition-all duration-300 ease-in-out"
          style={{ width: `${panelWidth}px`, maxWidth: '100vw' }}
        >
          {/* Header */}
          <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/80 backdrop-blur-xs flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
              >
                <Bot size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-extrabold text-[13.5px] text-neutral-900 truncate">Provis AI Assistant</h3>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                    Beta
                  </span>
                  <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                    <ShieldCheck size={10} /> 100% Private
                  </span>
                </div>
                <p className="text-[10.5px] text-neutral-500 truncate">
                  {user?.isSuperAdmin ? 'SuperAdmin Copilot • 100% On-Premise' : 'Asisten Operasional Proyek • On-Premise'}
                </p>
              </div>
            </div>

            {/* Header Action Toolbar (Antigravity-style) */}
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {/* Width Toggle (Standard 440px vs Wide 620px) */}
              <button
                onClick={() => setPanelWidth(w => (w >= 580 ? 440 : 620))}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors"
                title={panelWidth >= 580 ? 'Kecilkan Lebar Panel (440px)' : 'Perlebar Split View (620px)'}
              >
                {panelWidth >= 580 ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>

              {/* History button */}
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-violet-100 text-violet-700 font-bold' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60'}`}
                title="Riwayat Percakapan"
              >
                <History size={15} />
              </button>

              {/* New session */}
              <button
                onClick={startNewSession}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors"
                title="Percakapan Baru"
              >
                <Plus size={15} />
              </button>

              {/* Close / Collapse button */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors"
                title="Tutup Panel AI"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          {/* Session History Sidebar Overlay */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-4 bg-neutral-50/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-bold text-neutral-600 uppercase tracking-wider">Riwayat Obrolan</span>
                <button
                  onClick={startNewSession}
                  className="flex items-center gap-1 text-[11.5px] font-bold text-violet-600 hover:text-violet-700 cursor-pointer"
                >
                  <Plus size={13} /> Sesi Baru
                </button>
              </div>

              <div className="space-y-1.5">
                {sessions.length === 0 ? (
                  <div className="p-4 text-center text-neutral-400 text-[12px] italic">
                    Belum ada riwayat percakapan.
                  </div>
                ) : (
                  sessions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => loadSession(s.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-[12.5px] cursor-pointer transition-all ${
                        currentSessionId === s.id
                          ? 'bg-violet-50 border-violet-200 text-violet-900 font-bold shadow-2xs'
                          : 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <div className="truncate flex-1 pr-2">
                        <div className="truncate">{s.title}</div>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          {new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        onClick={(e) => deleteSession(s.id, e)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Hapus Sesi"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Chat Messages View */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-3 shadow-md"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                  >
                    <Sparkles size={24} />
                  </div>
                  <h4 className="font-extrabold text-[15px] text-neutral-900">
                    Halo, {user?.name || user?.username}!
                  </h4>
                  <p className="text-[12px] text-neutral-500 max-w-sm mt-1 mb-5 leading-relaxed">
                    Asisten privat lokal 100% On-Premise beroperasi berdampingan (side by side). Siap membuat proyek otomatis, menjadwalkan WBS, sinkronisasi tanggal, rekap keterlambatan, hingga menyusun laporan eksekutif PDF.
                  </p>

                  <div className="w-full space-y-1.5 text-left">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                      Saran Perintah Cepat:
                    </span>
                    {quickPrompts.map((qp, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(qp.prompt)}
                        className="w-full p-2.5 text-left text-[12px] font-semibold text-neutral-700 bg-neutral-50 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 border border-neutral-200 rounded-xl transition-all cursor-pointer"
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed shadow-2xs ${
                        msg.role === 'user'
                          ? 'text-white font-medium rounded-br-xs'
                          : 'bg-neutral-50/90 border border-neutral-200/90 text-neutral-900 rounded-bl-xs'
                      }`}
                      style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' } : {}}
                    >
                      {/* Rich formatted rendering */}
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        renderFormattedContent(msg.content)
                      )}

                      {/* Interactive Action Cards & PDF Links */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-neutral-200/80 flex flex-wrap gap-2">
                          {msg.actions.map((act, actIdx) => (
                            <a
                              key={actIdx}
                              href={act.url}
                              target={act.url.startsWith('http') || act.url.includes('/storage/') || act.url.includes('/report-view') ? '_blank' : '_self'}
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-white transition-all hover:opacity-90 active:scale-95 shadow-2xs cursor-pointer"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                            >
                              {act.url.endsWith('.pdf') || act.url.includes('report') ? <FileText size={12} /> : <ExternalLink size={12} />}
                              <span>{act.label}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl rounded-bl-xs px-3.5 py-2.5 text-[12px] text-neutral-600 flex items-center gap-2 shadow-2xs">
                    <RefreshCw size={14} className="animate-spin text-violet-600" />
                    <span>Sedang memproses instruksi Anda secara lokal…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Sticky Input Bar at Bottom */}
          <div className="p-3 border-t border-neutral-100 bg-white flex-shrink-0">
            <div className="flex items-end gap-2 bg-neutral-50 border border-neutral-200 rounded-2xl p-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik instruksi atau pertanyaan Anda… (Enter untuk kirim)"
                rows={2}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 resize-none text-[12.5px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 px-1 py-0.5"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputText.trim() || isLoading}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 transition-all disabled:opacity-40 hover:opacity-90 active:scale-95 cursor-pointer shadow-2xs"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                title="Kirim Pesan"
              >
                <Send size={14} />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-400 px-2 mt-1.5">
              <span>Shift + Enter untuk baris baru • Split Screen</span>
              {activeProjectId && <span>Proyek Aktif: #{activeProjectId}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
