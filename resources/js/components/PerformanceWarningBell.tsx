import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, usePage } from '@inertiajs/react';
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  Check,
  ExternalLink,
  Users,
  Building2,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export interface WatchdogTaskSample {
  id: string;
  name: string;
  progress: number;
  expected: number;
  end?: string | null;
  days_late: number;
  overdue: boolean;
  lagging: boolean;
  division?: string;
}

export interface PerformanceWarningItem {
  id: number;
  user_id: number;
  worker_name?: string | null;
  worker_email?: string | null;
  project_id: number;
  project_title: string;
  company_id?: number | null;
  company_name: string;
  division_id?: number | null;
  division_name: string;
  warning_type: string;
  severity: 'critical' | 'warning' | string;
  status: 'active' | 'acknowledged' | 'resolved' | string;
  title: string;
  message: string;
  actual_progress: number;
  expected_progress: number;
  division_progress: number;
  timeline_gap: number;
  spi: number;
  delay_days: number;
  overdue_count: number;
  lagging_count: number;
  sample_tasks: WatchdogTaskSample[];
  detected_at?: string | null;
  acknowledged_at?: string | null;
}

export interface MonitoringSummary {
  items: PerformanceWarningItem[];
  total_count: number;
  active_count: number;
  companies_affected: number;
  workers_warned: number;
}

export interface WarningsPayload {
  warnings: PerformanceWarningItem[];
  active_count: number;
  personal_active_count?: number;
  acknowledged_count: number;
  resolved_recent_count: number;
  monitoring: MonitoringSummary | null;
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

export default function PerformanceWarningBell() {
  const { user } = useAuth();
  const { url } = usePage();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<WarningsPayload | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'monitoring'>('personal');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isManagement = Boolean(user?.isSuperAdmin || user?.isAdminUtama || user?.isPIC);

  const fetchWarnings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/ai/warnings', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json: WarningsPayload = await res.json();
        setData(json);
        if (json.warnings.length === 0 && json.monitoring && json.monitoring.items.length > 0) {
          setActiveTab('monitoring');
        }
      }
    } catch {
      // Ignore transient network hiccups
    }
  }, [user]);

  useEffect(() => {
    fetchWarnings();
  }, [fetchWarnings, url]);

  useEffect(() => {
    const refreshHandler = () => fetchWarnings();
    window.addEventListener('provis-warnings-refresh', refreshHandler);
    const interval = window.setInterval(fetchWarnings, 60000);
    return () => {
      window.removeEventListener('provis-warnings-refresh', refreshHandler);
      window.clearInterval(interval);
    };
  }, [fetchWarnings]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const acknowledgeOne = async (id: number) => {
    try {
      const res = await fetch(`/ai/warnings/${id}/acknowledge`, {
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

  const acknowledgeAll = async () => {
    try {
      const res = await fetch('/ai/warnings/acknowledge-all', {
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

  const runManualScan = async () => {
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
        body: JSON.stringify({}),
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

  if (!user) return null;

  const badgeCount = data?.active_count ?? 0;
  const personalWarnings = data?.warnings ?? [];
  const monitoringItems = data?.monitoring?.items ?? [];
  const hasCritical =
    personalWarnings.some(w => w.severity === 'critical' && w.status === 'active') ||
    monitoringItems.some(w => w.severity === 'critical' && w.status === 'active');

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(prev => !prev);
          if (!open) fetchWarnings();
        }}
        className={`relative p-2 rounded-xl border transition-all cursor-pointer shadow-2xs ${
          badgeCount > 0
            ? hasCritical
              ? 'border-rose-200 bg-rose-50/80 hover:bg-rose-100/70 text-rose-700'
              : 'border-amber-200 bg-amber-50/80 hover:bg-amber-100/70 text-amber-700'
            : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600'
        }`}
        title={
          badgeCount > 0
            ? `${badgeCount} active AI timeline performance warning(s)`
            : 'AI Timeline Performance Warnings'
        }
        aria-label="AI Timeline Performance Warnings"
      >
        <Bell size={16} className={badgeCount > 0 ? 'animate-[wiggle_2s_ease-in-out_infinite]' : ''} />
        {badgeCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold text-white flex items-center justify-center shadow-xs ${
              hasCritical ? 'bg-rose-600' : 'bg-amber-600'
            }`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] sm:w-[440px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <ShieldAlert size={15} className="text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-[13px] truncate">AI Performance Watchdog</h4>
                  {badgeCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-rose-500 text-white">
                      {badgeCount} Active
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-slate-300 truncate">
                  Automated timeline &amp; worker progress monitor
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isManagement && (
                <button
                  type="button"
                  onClick={runManualScan}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer disabled:opacity-50"
                  title="Run background AI scan across all active projects now"
                >
                  <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
                  <span>{isScanning ? 'Scanning…' : 'Scan Now'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Role Switch Tabs (Management sees Team Monitoring + Personal if applicable) */}
          {isManagement && (
            <div className="px-3 pt-2.5 pb-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('monitoring')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    activeTab === 'monitoring'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <Users size={12} />
                  <span>Team Alerts ({monitoringItems.length})</span>
                </button>
                {personalWarnings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('personal')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      activeTab === 'personal'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    My Alerts ({personalWarnings.length})
                  </button>
                )}
              </div>

              {data?.monitoring && (
                <span className="text-[10px] font-medium text-slate-500">
                  {data.monitoring.workers_warned} worker(s) · {data.monitoring.companies_affected} comp.
                </span>
              )}
            </div>
          )}

          {/* Body */}
          <div className="max-h-[410px] overflow-y-auto p-3 space-y-2.5 bg-slate-50/40">
            {activeTab === 'monitoring' && isManagement ? (
              monitoringItems.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-[12.5px] font-semibold text-slate-800">All Teams On Track</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    No lagging division tasks or overdue worker alerts detected right now.
                  </p>
                </div>
              ) : (
                monitoringItems.map(item => {
                  const isCritical = item.severity === 'critical';
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl bg-white border shadow-2xs space-y-2 ${
                        isCritical ? 'border-l-4 border-l-rose-500 border-slate-200' : 'border-l-4 border-l-amber-500 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[12px] text-slate-900">
                              {item.worker_name || 'Worker'}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {item.division_name}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                isCritical ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isCritical ? 'Critical' : 'Warning'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 mt-0.5">
                            <Building2 size={10} />
                            <span className="truncate font-medium">{item.company_name}</span>
                            <span>·</span>
                            <span className="truncate">{item.project_title}</span>
                          </div>
                        </div>
                        <Link
                          href={`/tasks?project_id=${item.project_id}`}
                          onClick={() => setOpen(false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0"
                          title="Open Project Tasks"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                          Actual: {item.actual_progress}%
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
                          Expected: {item.expected_progress}%
                        </span>
                        {item.overdue_count > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                            {item.overdue_count} Overdue
                          </span>
                        )}
                        {item.delay_days > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                            +{item.delay_days}d Late
                          </span>
                        )}
                      </div>

                      <p className="text-[11.5px] text-slate-600 leading-snug">{item.message}</p>
                    </div>
                  );
                })
              )
            ) : personalWarnings.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-[12.5px] font-semibold text-slate-800">Great Job! Progress Is On Track</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  No timeline delays detected on your assigned project tasks.
                </p>
              </div>
            ) : (
              <>
                {(data?.personal_active_count ?? 0) > 1 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={acknowledgeAll}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <Check size={12} /> Mark All Read
                    </button>
                  </div>
                )}

                {personalWarnings.map(w => {
                  const isCritical = w.severity === 'critical';
                  const isAck = w.status === 'acknowledged';
                  return (
                    <div
                      key={w.id}
                      className={`p-3 rounded-xl bg-white border shadow-2xs space-y-2 ${
                        isCritical
                          ? 'border-l-4 border-l-rose-500 border-slate-200'
                          : 'border-l-4 border-l-amber-500 border-slate-200'
                      } ${isAck ? 'opacity-80' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {isCritical ? (
                            <AlertOctagon size={15} className="text-rose-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[12px] text-slate-900 truncate">
                                {w.project_title}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                  isCritical
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {isCritical ? 'Critical' : 'Warning'}
                              </span>
                              {isAck && (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-500">
                                  Read
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] text-slate-500 mt-0.5">
                              {w.company_name} · Division: <strong>{w.division_name}</strong>
                            </p>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11.5px] text-slate-700 leading-relaxed">{w.message}</p>

                      {/* Progress Comparison Bar */}
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/80 space-y-1">
                        <div className="flex items-center justify-between text-[10.5px] font-semibold">
                          <span className="text-slate-600">
                            Actual Progress: <strong className="text-slate-900">{w.actual_progress}%</strong>
                          </span>
                          <span className="text-indigo-700">
                            Timeline Target: <strong>{w.expected_progress}%</strong>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                          <div
                            className="h-full bg-indigo-200 absolute left-0 top-0"
                            style={{ width: `${Math.min(100, w.expected_progress)}%` }}
                          />
                          <div
                            className={`h-full relative z-10 rounded-full ${
                              isCritical ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, w.actual_progress)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <Link
                          href={`/tasks?project_id=${w.project_id}`}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                        >
                          <span>Update Tasks</span>
                          <ExternalLink size={11} />
                        </Link>

                        {!isAck && (
                          <button
                            type="button"
                            onClick={() => acknowledgeOne(w.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            <Check size={11} />
                            <span>Got it</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              Auto-resolves once progress catches up
            </span>
            {(data?.resolved_recent_count ?? 0) > 0 && (
              <span className="text-emerald-600 font-semibold">
                {data?.resolved_recent_count} resolved this week
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
