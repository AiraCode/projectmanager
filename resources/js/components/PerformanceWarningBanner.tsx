import { useState, useEffect, useCallback } from 'react';
import { Link, usePage } from '@inertiajs/react';
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { WarningsPayload } from './PerformanceWarningBell';

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

export default function PerformanceWarningBanner({
  projectId,
}: {
  projectId?: number | string | null;
}) {
  const { user } = useAuth();
  const { url } = usePage();
  const [data, setData] = useState<WarningsPayload | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const numericProjectId = projectId ? Number(projectId) : null;
  const isManagement = Boolean(user?.isSuperAdmin || user?.isAdminUtama || user?.isPIC);

  const loadWarnings = useCallback(async () => {
    if (!user) return;
    try {
      const qs = numericProjectId ? `?project_id=${numericProjectId}` : '';
      const res = await fetch(`/ai/warnings${qs}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json: WarningsPayload = await res.json();
        setData(json);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, [user, numericProjectId]);

  useEffect(() => {
    loadWarnings();
  }, [loadWarnings, url]);

  useEffect(() => {
    const refreshHandler = () => loadWarnings();
    window.addEventListener('provis-warnings-refresh', refreshHandler);
    return () => window.removeEventListener('provis-warnings-refresh', refreshHandler);
  }, [loadWarnings]);

  const acknowledgeWarning = async (id: number) => {
    try {
      const qs = numericProjectId ? `?project_id=${numericProjectId}` : '';
      const res = await fetch(`/ai/warnings/${id}/acknowledge${qs}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getCsrfHeaders(),
      });
      if (res.ok) {
        const json: WarningsPayload = await res.json();
        setData(json);
        window.dispatchEvent(new CustomEvent('provis-warnings-refresh'));
      }
    } catch {
      // ignore
    }
  };

  const runScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const res = await fetch('/ai/warnings/scan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          ...getCsrfHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project_id: numericProjectId }),
      });
      if (res.ok) {
        const json: WarningsPayload = await res.json();
        setData(json);
        window.dispatchEvent(new CustomEvent('provis-warnings-refresh'));
      }
    } finally {
      setIsScanning(false);
    }
  };

  if (!data) return null;

  // 1. Worker View: Personal Active / Acknowledged Timeline Warnings
  const personal = data.warnings || [];
  const activePersonal = personal.filter(w => w.status === 'active');
  const displayPersonal = activePersonal.length > 0 ? activePersonal : personal;

  if (displayPersonal.length > 0) {
    const primary = displayPersonal[0];
    const isCritical = displayPersonal.some(w => w.severity === 'critical');
    const isAllAck = activePersonal.length === 0;

    return (
      <div
        className={`rounded-2xl border shadow-xs overflow-hidden transition-all ${
          isCritical
            ? 'bg-rose-50/80 border-rose-200 border-l-4 border-l-rose-600'
            : 'bg-amber-50/80 border-amber-200 border-l-4 border-l-amber-500'
        }`}
      >
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isCritical ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
              }`}
            >
              {isCritical ? <AlertOctagon size={18} /> : <AlertTriangle size={18} />}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isCritical ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                  }`}
                >
                  AI Timeline Warning · {isCritical ? 'Critical' : 'Attention'}
                </span>
                <span className="text-[12.5px] font-bold text-slate-900">
                  {primary.company_name} — {primary.project_title}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-700">
                  Division: {primary.division_name}
                </span>
                {isAllAck && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200">
                    Acknowledged
                  </span>
                )}
              </div>

              <p className="text-[12.5px] text-slate-800 leading-relaxed">{primary.message}</p>

              {/* Priority lagging task chips */}
              {primary.sample_tasks && primary.sample_tasks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {primary.sample_tasks.slice(0, 3).map(t => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white border border-slate-200/90 text-slate-700"
                    >
                      <span className="font-semibold text-slate-900">{t.name}</span>
                      <span className={t.overdue ? 'text-rose-600 font-bold' : 'text-amber-700 font-semibold'}>
                        ({t.progress}%{t.overdue && t.days_late > 0 ? ` · +${t.days_late}d late` : ''})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <Link
              href={`/tasks?project_id=${primary.project_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs"
            >
              <span>Update Tasks</span>
              <ExternalLink size={12} />
            </Link>

            <Link
              href={`/scurve?project_id=${primary.project_id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
            >
              S-Curve
            </Link>

            {primary.status === 'active' && (
              <button
                type="button"
                onClick={() => acknowledgeWarning(primary.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                title="Mark warning as read"
              >
                <Check size={12} />
                <span>Got it</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. PIC / SuperAdmin Project-Level Monitoring Strip
  const mon = data.monitoring;
  if (isManagement && mon && mon.items.length > 0 && numericProjectId) {
    const monCritical = mon.items.some(i => i.severity === 'critical');
    return (
      <div
        className={`rounded-2xl border shadow-2xs overflow-hidden ${
          monCritical
            ? 'bg-amber-50/70 border-amber-200 border-l-4 border-l-amber-500'
            : 'bg-indigo-50/60 border-indigo-200 border-l-4 border-l-indigo-500'
        }`}
      >
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users size={16} className="text-indigo-700 shrink-0" />
            <div className="text-[12px] text-slate-800">
              <strong className="text-slate-900">AI Performance Watchdog:</strong>{' '}
              <span>
                <strong>{mon.workers_warned}</strong> worker(s) on this project currently have active timeline warnings (
                <strong>{mon.active_count}</strong> unread).
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={runScan}
              disabled={isScanning}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
              <span>{isScanning ? 'Scanning…' : 'Re-scan'}</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 cursor-pointer"
            >
              <span>{expanded ? 'Hide Details' : 'View Workers'}</span>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
            {mon.items.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] flex items-center gap-2 shadow-2xs"
              >
                <span className="font-bold text-slate-900">{item.worker_name}</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold">
                  {item.division_name}
                </span>
                <span className={item.severity === 'critical' ? 'text-rose-600 font-bold' : 'text-amber-700 font-semibold'}>
                  {item.overdue_count > 0 ? `${item.overdue_count} overdue` : `Gap ${item.timeline_gap}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
