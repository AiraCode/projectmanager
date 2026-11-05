import { useState, useRef, useEffect, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Modal } from '@/components/ui';
import CustomSelect from '@/components/CustomSelect';
import DatePicker from '@/components/DatePicker';
import {
  ScrollText,
  Filter,
  Search,
  Globe,
  User as UserIcon,
  ChevronDown,
  Check,
  X,
  Eye,
  Copy,
  CheckCircle2,
  RotateCcw,
  Shield,
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight,
  Info,
  Code2,
  LayoutGrid,
  Paperclip,
  TrendingUp,
  Layers,
} from 'lucide-react';

interface AuditEntry {
  id: number;
  actor: string;
  actor_email?: string | null;
  action: string;
  description: string;
  ip_address: string | null;
  metadata?: Record<string, any> | any[] | string | null;
  created_at: string;
}

interface PaginatedLogs {
  data: AuditEntry[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from?: number | null;
  to?: number | null;
  links: { url: string | null; label: string; active: boolean }[];
}

/**
 * Format audit timestamp to PROVIS convention (DD-MM-YYYY).
 * Backend provides "d M Y, H:i:s" (e.g. "21 Oct 2026, 11:50:44").
 */
export function parseAuditTimestamp(dateStr?: string | null): { date: string; time: string; full: string } {
  if (!dateStr || dateStr === '—') return { date: '—', time: '', full: '—' };

  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };

  const m = String(dateStr).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),?\s+(\d{2}:\d{2}(?::\d{2})?)/);
  if (m) {
    const [, d, mon, y, time] = m;
    const mm = months[mon] || '01';
    const dateFormatted = `${d.padStart(2, '0')}-${mm}-${y}`;
    return {
      date: dateFormatted,
      time: time,
      full: `${dateFormatted} ${time}`,
    };
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    const h = String(parsed.getHours()).padStart(2, '0');
    const min = String(parsed.getMinutes()).padStart(2, '0');
    const s = String(parsed.getSeconds()).padStart(2, '0');
    const dateFormatted = `${d}-${mm}-${y}`;
    const timeFormatted = `${h}:${min}:${s}`;
    return {
      date: dateFormatted,
      time: timeFormatted,
      full: `${dateFormatted} ${timeFormatted}`,
    };
  }

  return { date: dateStr, time: '', full: dateStr };
}

/**
 * Categorical badge styling for known and dynamic action types
 */
const getActionBadgeStyle = (action: string): string => {
  const act = action.toUpperCase();

  // Authentication & Security
  if (act === 'LOGIN') return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  if (act === 'LOGOUT') return 'bg-neutral-100 text-neutral-600 border-neutral-200/80';
  if (act === 'ADMIN_LOGIN') return 'bg-violet-50 text-violet-700 border-violet-200 font-bold';
  if (act.includes('LOGIN_FAILED') || act.includes('UNAUTHORIZED')) {
    return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
  }
  if (act === 'PASSWORD_CHANGE') return 'bg-amber-50 text-amber-700 border-amber-200/80';

  // Deletions / Removals / Destructive
  if (act.startsWith('DELETE_') || act.startsWith('REMOVE_') || act.includes('DESTROY')) {
    return 'bg-red-50 text-red-700 border-red-200/80';
  }

  // Creations & Additions
  if (act.startsWith('CREATE_') || act.startsWith('ADD_')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  }

  // Updates & Modifications
  if (act.startsWith('UPDATE_') || act.startsWith('REORDER_') || act.startsWith('SET_') || act.startsWith('TOGGLE_')) {
    return 'bg-blue-50 text-blue-700 border-blue-200/80';
  }

  // Approvals & Workflows
  if (act.includes('APPROVE')) return 'bg-teal-50 text-teal-700 border-teal-200/80';
  if (act.includes('REJECT')) return 'bg-rose-50 text-rose-700 border-rose-200/80';
  if (act.includes('REQUEST')) return 'bg-amber-50 text-amber-700 border-amber-200/80';

  // Completions
  if (act.includes('COMPLETE')) return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';

  return 'bg-neutral-100 text-neutral-700 border-neutral-200/80';
};

export default function AuditLogPage({
  logs,
  actionTypes = [],
  actors = [],
  filters = {},
}: {
  logs: PaginatedLogs;
  actionTypes: string[];
  actors?: string[];
  filters?: { action?: string; search?: string; actor?: string; start_date?: string; end_date?: string };
}) {
  const [selectedAction, setSelectedAction] = useState(filters?.action ?? '');
  const [selectedActor, setSelectedActor] = useState(filters?.actor ?? '');
  const [startDate, setStartDate] = useState(filters?.start_date ?? '');
  const [endDate, setEndDate] = useState(filters?.end_date ?? '');
  const [search, setSearch] = useState(filters?.search ?? '');
  const [selectedLog, setSelectedLog] = useState<AuditEntry | null>(null);
  const [copiedDescription, setCopiedDescription] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [metadataTab, setMetadataTab] = useState<'structured' | 'json'>('structured');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync state if backend filters prop changes (e.g. browser back/forward)
  useEffect(() => {
    setSelectedAction(filters?.action ?? '');
    setSelectedActor(filters?.actor ?? '');
    setStartDate(filters?.start_date ?? '');
    setEndDate(filters?.end_date ?? '');
    setSearch(filters?.search ?? '');
  }, [filters?.action, filters?.actor, filters?.start_date, filters?.end_date, filters?.search]);

  const handleFilterChange = (updates: {
    action?: string;
    actor?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const nextFilters = {
      action: updates.action !== undefined ? updates.action : selectedAction,
      actor: updates.actor !== undefined ? updates.actor : selectedActor,
      search: updates.search !== undefined ? updates.search : search,
      start_date: updates.start_date !== undefined ? updates.start_date : startDate,
      end_date: updates.end_date !== undefined ? updates.end_date : endDate,
    };

    router.get(
      '/admin/audit-log',
      {
        action: nextFilters.action || undefined,
        actor: nextFilters.actor || undefined,
        search: nextFilters.search?.trim() || undefined,
        start_date: nextFilters.start_date || undefined,
        end_date: nextFilters.end_date || undefined,
      },
      { preserveState: true, replace: true }
    );
  };

  const handleResetFilters = () => {
    setSelectedAction('');
    setSelectedActor('');
    setStartDate('');
    setEndDate('');
    setSearch('');
    router.get('/admin/audit-log', {}, { preserveState: true, replace: true });
  };

  const hasActiveFilters = Boolean(
    filters?.action || filters?.actor || filters?.start_date || filters?.end_date || filters?.search
  );

  const actionOptions = useMemo(() => [
    { value: '', label: 'All Activities' },
    ...actionTypes.map(a => ({
      value: a,
      label: a.replace(/_/g, ' '),
    }))
  ], [actionTypes]);

  const actorOptions = useMemo(() => [
    { value: '', label: 'All Actors' },
    ...actors.map(a => ({
      value: a,
      label: a,
    }))
  ], [actors]);

  const copyToClipboard = async (text: string, type: 'desc' | 'json') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'desc') {
        setCopiedDescription(true);
        setTimeout(() => setCopiedDescription(false), 2000);
      } else {
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const copySpecificValue = async (text: string, keyName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback
    }
  };

  const activeMetadata = useMemo(() => {
    if (!selectedLog?.metadata) return null;
    let obj: any = selectedLog.metadata;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        return { raw: obj };
      }
    }
    return typeof obj === 'object' && obj !== null && Object.keys(obj).length > 0 ? obj : null;
  }, [selectedLog]);

  const highlightJson = (json: string) => {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\\-]?\d+)?)/g,
      (match) => {
        let cls = 'text-amber-400 font-semibold';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-sky-300 font-bold';
          } else {
            cls = 'text-emerald-300';
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-rose-400 font-bold';
        } else if (/null/.test(match)) {
          cls = 'text-neutral-400 italic';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  };

  return (
    <SuperAdminLayout>
      <Head title="Audit Log — PROVIS SuperAdmin" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <ScrollText size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-neutral-900 tracking-tight">System Audit Log</h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                  {logs.total} {hasActiveFilters ? 'matching records' : 'records'}
                </span>
              </div>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                Inspect administrative actions, user activity, and system governance records.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search user, action, IP, desc..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFilterChange({ search });
                  }
                }}
                className="w-full pl-8 pr-8 py-2 text-[13px] border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white h-[38px]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    handleFilterChange({ search: '' });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <CustomSelect
              value={selectedAction}
              onChange={(val) => {
                setSelectedAction(val);
                handleFilterChange({ action: val });
              }}
              placeholder="All Activities"
              variant="filter"
              clearable
              searchable={actionTypes.length > 5}
              className="w-full sm:w-[170px]"
              options={actionOptions}
            />

            <CustomSelect
              value={selectedActor}
              onChange={(val) => {
                setSelectedActor(val);
                handleFilterChange({ actor: val });
              }}
              placeholder="All Actors"
              variant="filter"
              clearable
              searchable={actors.length > 5}
              className="w-full sm:w-[155px]"
              options={actorOptions}
            />

            <div className="w-full sm:w-[145px]">
              <DatePicker
                value={startDate}
                onChange={(val) => {
                  setStartDate(val);
                  handleFilterChange({ start_date: val });
                }}
                placeholder="From Date"
                accentColor="violet"
                size="sm"
                clearable
                inputClassName="h-[38px] text-[12.5px] rounded-xl"
              />
            </div>

            <div className="w-full sm:w-[145px]">
              <DatePicker
                value={endDate}
                onChange={(val) => {
                  setEndDate(val);
                  handleFilterChange({ end_date: val });
                }}
                placeholder="To Date"
                accentColor="violet"
                size="sm"
                clearable
                inputClassName="h-[38px] text-[12.5px] rounded-xl"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 text-[12px] font-semibold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-neutral-400 text-[11px] font-medium uppercase tracking-wider">
                Active Filters:
              </span>

              {filters?.search && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-neutral-100 text-neutral-700 border border-neutral-200">
                  <span>Search: <strong className="text-neutral-900 font-semibold">"{filters.search}"</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      handleFilterChange({ search: '' });
                    }}
                    className="p-0.5 hover:bg-neutral-200 rounded-full transition-colors text-neutral-500 hover:text-neutral-800 cursor-pointer"
                    title="Remove search filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              {filters?.action && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200">
                  <span>Action: <strong className="font-semibold">{filters.action.replace(/_/g, ' ')}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAction('');
                      handleFilterChange({ action: '' });
                    }}
                    className="p-0.5 hover:bg-violet-200/80 rounded-full transition-colors text-violet-600 hover:text-violet-900 cursor-pointer"
                    title="Remove action filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              {filters?.actor && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200">
                  <span>Actor: <strong className="font-semibold">{filters.actor}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedActor('');
                      handleFilterChange({ actor: '' });
                    }}
                    className="p-0.5 hover:bg-violet-200/80 rounded-full transition-colors text-violet-600 hover:text-violet-900 cursor-pointer"
                    title="Remove actor filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              {filters?.start_date && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200">
                  <span>From: <strong className="font-semibold">{filters.start_date}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      handleFilterChange({ start_date: '' });
                    }}
                    className="p-0.5 hover:bg-violet-200/80 rounded-full transition-colors text-violet-600 hover:text-violet-900 cursor-pointer"
                    title="Remove start date filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              {filters?.end_date && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200">
                  <span>To: <strong className="font-semibold">{filters.end_date}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setEndDate('');
                      handleFilterChange({ end_date: '' });
                    }}
                    className="p-0.5 hover:bg-violet-200/80 rounded-full transition-colors text-violet-600 hover:text-violet-900 cursor-pointer"
                    title="Remove end date filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 hover:underline ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Table Card */}
        <div
          className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs overflow-hidden"
          style={{ borderColor: 'rgba(139,92,246,0.12)' }}
        >
          {/* Table Header Bar */}
          <div
            className="px-5 py-3 flex items-center justify-between border-b"
            style={{
              borderColor: 'rgba(139,92,246,0.08)',
              background: 'rgba(139,92,246,0.02)',
            }}
          >
            <span className="text-[12px] font-semibold text-neutral-600">
              Showing {logs.from ?? (logs.data.length > 0 ? 1 : 0)} to{' '}
              {logs.to ?? logs.data.length} of {logs.total} records
            </span>
            <span className="text-[11px] text-neutral-400">
              Tip: Click any row or the eye icon to inspect details
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/70">
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-14">
                    #ID
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-36">
                    Timestamp (GMT+7)
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-48">
                    Actor
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-44">
                    Action
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider min-w-[280px]">
                    Description
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-32">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-neutral-500 uppercase tracking-wider w-20 text-center">
                    Inspect
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.data.map((log) => {
                  const ts = parseAuditTimestamp(log.created_at);
                  const isSystem = log.actor.toLowerCase() === 'system';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-violet-50/25 transition-colors cursor-pointer group"
                    >
                      {/* ID */}
                      <td className="px-4 py-3 text-neutral-400 font-mono text-[11px] whitespace-nowrap">
                        #{log.id}
                      </td>

                      {/* Timestamp (DD-MM-YYYY, GMT+7) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-neutral-800 text-[12px] tracking-tight">
                            {ts.date}
                          </span>
                          <span className="text-[10.5px] text-neutral-400 font-mono">
                            {ts.time} <span className="text-[9.5px] text-neutral-400 font-sans font-medium">WIB</span>
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                              isSystem
                                ? 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                : 'bg-violet-100 text-violet-700 border border-violet-200'
                            }`}
                          >
                            {isSystem ? (
                              <Shield size={12} className="text-neutral-600" />
                            ) : (
                              log.actor.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-800 text-[12.5px] truncate max-w-[150px]">
                              {log.actor}
                            </div>
                            {log.actor_email && (
                              <div className="text-[10.5px] text-neutral-400 truncate max-w-[150px]">
                                {log.actor_email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide border ${getActionBadgeStyle(
                            log.action
                          )}`}
                        >
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 text-neutral-700 text-[12.5px] leading-relaxed">
                        <div className="line-clamp-2 max-w-xl group-hover:text-neutral-900 transition-colors">
                          {log.description}
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.ip_address ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-neutral-100/90 text-neutral-600 font-mono text-[11px] border border-neutral-200/70">
                            <Globe size={11} className="text-neutral-400 shrink-0" />
                            <span>{log.ip_address}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-300 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-neutral-400 hover:text-violet-700 hover:bg-violet-100/70 transition-colors"
                          title="Inspect record details"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty State */}
                {logs.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
                            hasActiveFilters
                              ? 'bg-violet-50 text-violet-600 border border-violet-100'
                              : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
                          }`}
                        >
                          {hasActiveFilters ? <Search size={22} /> : <ScrollText size={22} />}
                        </div>
                        <h3 className="text-[14px] font-bold text-neutral-800 mb-1">
                          {hasActiveFilters ? 'No matching audit records' : 'No audit logs recorded'}
                        </h3>
                        <p className="text-[12px] text-neutral-500 mb-4 leading-relaxed">
                          {hasActiveFilters
                            ? 'No records match your active search or action filter criteria. Try adjusting your search term or reset all filters.'
                            : 'All system activities, project mutations, and user security events will be automatically recorded here.'}
                        </p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="inline-flex items-center px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold transition-colors shadow-xs"
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logs.last_page > 1 && (
            <div
              className="px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t"
              style={{ borderColor: 'rgba(139,92,246,0.08)' }}
            >
              <span className="text-[12px] text-neutral-500">
                Page <strong className="text-neutral-800 font-semibold">{logs.current_page}</strong> of{' '}
                <strong className="text-neutral-800 font-semibold">{logs.last_page}</strong> ({logs.total}{' '}
                records)
              </span>

              <div className="flex items-center gap-1">
                {logs.links.map((link, i) => {
                  const isPrev = link.label.toLowerCase().includes('prev');
                  const isNext = link.label.toLowerCase().includes('next');

                  if (!link.url) {
                    return (
                      <span
                        key={i}
                        className="px-2.5 py-1 text-[11.5px] rounded-lg text-neutral-300 font-medium select-none pointer-events-none"
                      >
                        {isPrev ? <ChevronLeft size={14} /> : isNext ? <ChevronRight size={14} /> : link.label}
                      </span>
                    );
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => router.visit(link.url!)}
                      className={`px-3 py-1 text-[12px] rounded-lg font-semibold transition-all ${
                        link.active
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      }`}
                    >
                      {isPrev ? (
                        <ChevronLeft size={14} className="inline" />
                      ) : isNext ? (
                        <ChevronRight size={14} className="inline" />
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: link.label }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scope C: Detail Inspection Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Audit Trail Record Details"
          subtitle={`Audit ID #${selectedLog.id} • ${parseAuditTimestamp(selectedLog.created_at).full} (GMT+7)`}
          size="lg"
        >
          <div className="space-y-4">
            {/* Action & Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px] font-bold tracking-wide border ${getActionBadgeStyle(
                    selectedLog.action
                  )}`}
                >
                  {selectedLog.action.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  CODE: {selectedLog.action}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11.5px] text-neutral-500 font-medium">
                <Activity size={13} className="text-violet-600" />
                <span>Audited Event</span>
              </div>
            </div>

            {/* Full Activity Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-bold text-neutral-700 uppercase tracking-wider">
                  Full Activity Description
                </label>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedLog.description, 'desc')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                >
                  {copiedDescription ? (
                    <>
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy Description</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-neutral-200 text-[13px] text-neutral-800 leading-relaxed font-normal shadow-2xs select-text">
                {selectedLog.description}
              </div>
            </div>

            {/* Audit Attributes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
              {/* Actor Details */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-400">
                  Actor (Performed By)
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    <UserIcon size={11} />
                  </div>
                  <span className="font-bold text-neutral-900">{selectedLog.actor}</span>
                </div>
                {selectedLog.actor_email && (
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {selectedLog.actor_email}
                  </div>
                )}
              </div>

              {/* IP Address */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-400">
                  Client IP Address
                </div>
                <div className="flex items-center gap-1.5 font-mono text-neutral-800 text-[12px]">
                  <Globe size={13} className="text-neutral-400" />
                  <span>{selectedLog.ip_address ?? 'Not recorded (System Internal)'}</span>
                </div>
              </div>

              {/* Exact Timestamp */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-400">
                  Recorded Timestamp (GMT+7 / WIB)
                </div>
                <div className="font-semibold text-neutral-800 text-[12px] flex items-center gap-1.5">
                  <span>{parseAuditTimestamp(selectedLog.created_at).full}</span>
                  <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono">
                    WIB
                  </span>
                </div>
              </div>

              {/* Record Reference ID */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-400">
                  Audit Record Identifier
                </div>
                <div className="font-mono text-neutral-800 text-[12px]">
                  ID #{selectedLog.id}
                </div>
              </div>
            </div>

            {/* Context / Metadata */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[11.5px] font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={13} className="text-violet-600" />
                    <span>Associated Metadata Payload</span>
                  </label>
                  {activeMetadata && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold border border-violet-200">
                      {Object.keys(activeMetadata).length} attributes
                    </span>
                  )}
                </div>

                {activeMetadata && (
                  <div className="flex items-center gap-2">
                    {/* Switch between Structured and Raw JSON */}
                    <div className="inline-flex p-0.5 bg-neutral-100 rounded-lg border border-neutral-200 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setMetadataTab('structured')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          metadataTab === 'structured'
                            ? 'bg-white text-violet-700 shadow-2xs font-bold'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        <LayoutGrid size={11} />
                        <span>Structured</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetadataTab('json')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          metadataTab === 'json'
                            ? 'bg-white text-violet-700 shadow-2xs font-bold'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        <Code2 size={11} />
                        <span>Raw JSON</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(JSON.stringify(activeMetadata, null, 2), 'json')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-600 hover:text-violet-700 hover:bg-neutral-100 border border-neutral-200 transition-colors cursor-pointer"
                    >
                      {copiedJson ? (
                        <>
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {activeMetadata ? (
                metadataTab === 'structured' ? (
                  <div className="space-y-2.5">
                    {/* Progress Transition Card */}
                    {(activeMetadata.old_progress !== undefined || activeMetadata.new_progress !== undefined) && (
                      <div className="p-3 rounded-xl bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-white border border-violet-200/70 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                            Task Progress Transition
                          </span>
                          <div className="flex items-center gap-2 text-[14px] font-extrabold text-neutral-800 font-mono">
                            <span className="text-neutral-500">{activeMetadata.old_progress ?? 0}%</span>
                            <span className="text-violet-400">→</span>
                            <span className="text-violet-700">{activeMetadata.new_progress ?? 0}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono border ${
                              (activeMetadata.delta ?? 0) > 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : (activeMetadata.delta ?? 0) < 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                            }`}
                          >
                            <TrendingUp size={12} />
                            <span>
                              {(activeMetadata.delta ?? 0) > 0
                                ? `+${activeMetadata.delta}%`
                                : `${activeMetadata.delta ?? 0}%`}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Evidence Verification Files Card */}
                    {activeMetadata.evidence_files &&
                      Array.isArray(activeMetadata.evidence_files) &&
                      activeMetadata.evidence_files.length > 0 && (
                        <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-1.5 shadow-2xs">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-blue-700">
                            <Paperclip size={12} className="text-blue-600" />
                            <span>Attached Verification Evidences ({activeMetadata.evidence_files.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {activeMetadata.evidence_files.map((fileName: string, idx: number) => {
                              const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 shadow-2xs text-[11px]"
                                >
                                  <FileText size={13} className="text-blue-600 shrink-0" />
                                  <span className="font-semibold text-neutral-800 max-w-[220px] truncate" title={fileName}>
                                    {fileName}
                                  </span>
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                                    {ext}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(activeMetadata).map(([key, val]) => {
                        const isId = key.endsWith('_id') || key === 'id' || key === 'task_id' || key === 'project_id';
                        const isCopied = copiedKey === key;
                        const displayLabel = key.replace(/_/g, ' ');

                        return (
                          <div
                            key={key}
                            className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/60 hover:bg-white hover:border-neutral-300 transition-all shadow-2xs"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono block">
                                {displayLabel}
                              </span>
                              <div className="text-[12px] font-medium text-neutral-800">
                                {typeof val === 'boolean' ? (
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded text-[10.5px] font-bold uppercase ${
                                      val ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                                    }`}
                                  >
                                    {val ? 'True' : 'False'}
                                  </span>
                                ) : Array.isArray(val) ? (
                                  <div className="flex flex-wrap gap-1">
                                    {val.map((item, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex px-1.5 py-0.5 rounded bg-white border border-neutral-200 text-[10.5px] font-mono text-neutral-700"
                                      >
                                        {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                                      </span>
                                    ))}
                                  </div>
                                ) : typeof val === 'object' && val !== null ? (
                                  <pre className="text-[10.5px] font-mono text-neutral-700 bg-white p-1.5 rounded border border-neutral-200 overflow-x-auto max-h-24">
                                    {JSON.stringify(val, null, 2)}
                                  </pre>
                                ) : (
                                  <span
                                    className={
                                      isId
                                        ? 'font-mono font-semibold text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200 text-[11px] inline-block shadow-2xs'
                                        : typeof val === 'number'
                                        ? 'font-mono font-bold text-violet-700'
                                        : 'font-semibold text-neutral-800'
                                    }
                                  >
                                    {String(val)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Copy button for primitive values */}
                            {val !== null && typeof val !== 'object' && (
                              <button
                                type="button"
                                onClick={() => copySpecificValue(String(val), key)}
                                title={`Copy ${displayLabel}`}
                                className="p-1 rounded text-neutral-400 hover:text-violet-600 hover:bg-violet-50 transition-colors shrink-0 cursor-pointer"
                              >
                                {isCopied ? (
                                  <Check size={12} className="text-emerald-600" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Raw JSON Code Viewer with syntax highlighting */
                  <div className="rounded-xl overflow-hidden border border-slate-800 shadow-md">
                    <div className="bg-slate-950 px-3.5 py-2 flex items-center justify-between border-b border-slate-800 text-[11px] text-slate-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Code2 size={12} className="text-violet-400" />
                        <span>payload.json</span>
                      </div>
                      <span>{Object.keys(activeMetadata).length} properties</span>
                    </div>
                    <pre
                      className="p-3.5 bg-slate-900 text-slate-100 text-[11.5px] font-mono overflow-x-auto select-text max-h-56 scrollbar-thin leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: highlightJson(JSON.stringify(activeMetadata, null, 2)),
                      }}
                    />
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-[12px] text-neutral-500">
                  <Info size={14} className="text-neutral-400 shrink-0" />
                  <span>No additional metadata payload was recorded for this activity.</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </SuperAdminLayout>
  );
}
