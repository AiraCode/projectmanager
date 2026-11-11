import React, { useState, useEffect, useRef } from 'react';
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
  Minimize2,
  Columns2,
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
        <code key={key++} className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-800 font-mono text-[11px] border border-neutral-200">
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
            <h4 key={idx} className="font-bold text-[13px] text-neutral-900 mt-2 mb-1">
              {formatInlineStyles(headerText)}
            </h4>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const itemText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">{formatInlineStyles(itemText)}</div>
            </div>
          );
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="font-semibold text-[10.5px] text-neutral-600 bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.2 flex-shrink-0">
                {match?.[1]}.
              </span>
              <div className="flex-1">{formatInlineStyles(match?.[2] || '')}</div>
            </div>
          );
        }

        if (trimmed.startsWith('>')) {
          const quoteText = trimmed.replace(/^>\s*/, '');
          return (
            <div key={idx} className="border-l-2 border-neutral-400 bg-neutral-50 rounded-r-lg px-2.5 py-1 text-[12px] italic text-neutral-600 my-1">
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

  // Side-by-side panel states
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

  // Listen for toggle requests from Navbar/Header trigger buttons
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('provis-ai-toggle-request', handleToggle);
    return () => window.removeEventListener('provis-ai-toggle-request', handleToggle);
  }, []);

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
        { label: '🛠️ Rekonsiliasi Tanggal Jadwal', prompt: activeProjectId ? `Tolong rekonsiliasi tanggal proyek ID #${activeProjectId}` : 'Tolong jalankan rekonsiliasi tanggal untuk semua proyek' },
        { label: '📝 Ringkasan Update Commit Git', prompt: 'Apa saja update kodingan dan commit terakhir dari git?' },
        { label: '📄 Buat Laporan Ringkasan PDF', prompt: activeProjectId ? `Buatkan laporan eksekutif PDF proyek ID #${activeProjectId}` : 'Buatkan laporan proyek dalam bentuk PDF' },
        { label: '👥 Statistik User & Akses', prompt: 'Siapa saja user yang memiliki akses beta tester?' },
      ]
    : [
        { label: '🚀 Buat Proyek Baru (WBS)', prompt: 'Buatkan proyek baru dengan jadwal 6 bulan memakai template wbs' },
        { label: '📄 Buat Laporan PDF Proyek', prompt: activeProjectId ? `Buatkan laporan eksekutif PDF proyek ini` : 'Buatkan laporan PDF proyek' },
        { label: '🔗 Atur Predecessor Pekerjaan', prompt: 'Bagaimana cara mengatur predecessor dependensi antar pekerjaan?' },
        { label: '📊 Status & Progres Proyek', prompt: activeProjectId ? `Berapa progres dan sisa waktu proyek ini?` : 'Bagaimana status proyek aktif saat ini?' },
      ];

  return (
    <>
      {/* Persistent Side-by-Side Panel (No floating button, clean integration) */}
      {isOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 bg-white border-l border-neutral-200/90 flex flex-col shadow-xl transition-all duration-300 ease-in-out font-sans"
          style={{ width: `${panelWidth}px`, maxWidth: '100vw' }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-200/80 flex items-center justify-between bg-neutral-50/70 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-[13px] text-neutral-900 truncate">Provis Assistant</h3>
                  <span className="text-[9.5px] font-medium px-1.5 py-0.2 rounded bg-neutral-200/70 text-neutral-600">
                    Beta
                  </span>
                </div>
                <p className="text-[10.5px] text-neutral-500 truncate">
                  {user?.isSuperAdmin ? 'SuperAdmin Copilot' : 'Project Copilot'}
                </p>
              </div>
            </div>

            {/* Header Toolbar */}
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                onClick={() => setPanelWidth(w => (w >= 560 ? 440 : 600))}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors cursor-pointer"
                title={panelWidth >= 560 ? 'Ukuran Standar (440px)' : 'Perlebar Panel (600px)'}
              >
                {panelWidth >= 560 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${showHistory ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60'}`}
                title="Riwayat Sesi"
              >
                <History size={14} />
              </button>

              <button
                onClick={startNewSession}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors cursor-pointer"
                title="Sesi Baru"
              >
                <Plus size={14} />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors cursor-pointer"
                title="Tutup Panel"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Session History View */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-4 bg-neutral-50/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11.5px] font-bold text-neutral-500 uppercase tracking-wider">Riwayat Sesi</span>
                <button
                  onClick={startNewSession}
                  className="flex items-center gap-1 text-[11px] font-semibold text-neutral-800 hover:text-neutral-950 cursor-pointer"
                >
                  <Plus size={12} /> Sesi Baru
                </button>
              </div>

              <div className="space-y-1.5">
                {sessions.length === 0 ? (
                  <div className="p-4 text-center text-neutral-400 text-[12px] italic">
                    Belum ada riwayat sesi.
                  </div>
                ) : (
                  sessions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => loadSession(s.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-[12px] cursor-pointer transition-all ${
                        currentSessionId === s.id
                          ? 'bg-neutral-900 text-white font-medium border-neutral-900 shadow-2xs'
                          : 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div className="truncate flex-1 pr-2">
                        <div className="truncate">{s.title}</div>
                        <span className={`text-[10px] font-normal ${currentSessionId === s.id ? 'text-neutral-300' : 'text-neutral-400'}`}>
                          {new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        onClick={(e) => deleteSession(s.id, e)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          currentSessionId === s.id
                            ? 'text-neutral-400 hover:text-white'
                            : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Hapus Sesi"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Chat Messages View */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/20">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8">
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 mb-3 shadow-2xs">
                    <Bot size={20} />
                  </div>
                  <h4 className="font-bold text-[14px] text-neutral-900">
                    Halo, {user?.name || user?.username}!
                  </h4>
                  <p className="text-[12px] text-neutral-500 max-w-xs mt-1 mb-5 leading-relaxed">
                    Asisten operasional PROVIS siap membantu Anda mengelola proyek, menyusun jadwal WBS, rekonsiliasi tanggal, hingga menyiapkan laporan PDF.
                  </p>

                  <div className="w-full space-y-1.5 text-left">
                    <span className="text-[10.5px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                      Pilihan Aksi Cepat:
                    </span>
                    {quickPrompts.map((qp, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(qp.prompt)}
                        className="w-full p-2.5 text-left text-[12px] font-medium text-neutral-700 bg-white hover:bg-neutral-50 hover:border-neutral-300 border border-neutral-200 rounded-xl transition-all cursor-pointer shadow-2xs"
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
                      className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-[12.5px] leading-relaxed shadow-2xs ${
                        msg.role === 'user'
                          ? 'bg-neutral-900 text-white rounded-br-xs'
                          : 'bg-white border border-neutral-200/90 text-neutral-800 rounded-bl-xs'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        renderFormattedContent(msg.content)
                      )}

                      {/* Action Links & Download Buttons */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-neutral-100 flex flex-wrap gap-2">
                          {msg.actions.map((act, actIdx) => (
                            <a
                              key={actIdx}
                              href={act.url}
                              target={act.url.startsWith('http') || act.url.includes('/storage/') || act.url.includes('/report-view') ? '_blank' : '_self'}
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-neutral-900 hover:bg-neutral-800 text-white transition-all shadow-2xs cursor-pointer"
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
                  <div className="bg-white border border-neutral-200 rounded-2xl rounded-bl-xs px-3.5 py-2 text-[12px] text-neutral-500 flex items-center gap-2 shadow-2xs">
                    <RefreshCw size={13} className="animate-spin text-neutral-600" />
                    <span>Memproses instruksi…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3 border-t border-neutral-200/80 bg-white flex-shrink-0">
            <div className="flex items-end gap-2 bg-neutral-50/80 border border-neutral-200 rounded-2xl p-2 focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-neutral-300 transition-all">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik instruksi atau pertanyaan… (Enter untuk kirim)"
                rows={2}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 resize-none text-[12.5px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 px-1 py-0.5"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputText.trim() || isLoading}
                className="w-8 h-8 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs"
                title="Kirim"
              >
                <Send size={13} />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-400 px-2 mt-1.5">
              <span>Shift + Enter untuk baris baru</span>
              {activeProjectId && <span>Proyek Aktif: #{activeProjectId}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
