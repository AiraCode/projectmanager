import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, usePage } from '@inertiajs/react';
import {
  AlertOctagon,
  Building2,
  ExternalLink,
  Layers,
  ShieldAlert,
  TrendingDown,
  Users,
  X,
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

export function getCsrfHeaders(): Record<string, string> {
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

/**
 * Custom Watchdog Alert Bell SVG featuring a bold exclamation mark inside the bell body,
 * clearly distinguishing AI Performance Watchdog alerts from standard notifications.
 */
function WatchdogAlertBellIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="12" y1="6.8" x2="12" y2="11.4" strokeWidth={2.3} />
      <circle cx="12" cy="14.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function PerformanceWarningBell() {
  const { user } = useAuth();
  const { url, props } = usePage<any>();
  const [data, setData] = useState<WarningsPayload | null>(null);
  const [showCriticalPopup, setShowCriticalPopup] = useState(false);

  const isManagement = Boolean(user?.isSuperAdmin || user?.isAdminUtama || user?.isPIC);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isActivePage = url.startsWith('/ai-warnings');
  const loginSessionKey: string | null = props?.auth?.login_session_key ?? null;

  const fetchWarnings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/ai/warnings', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json: WarningsPayload = await res.json();
        setData(json);
      }
    } catch {
      // Silently ignore network errors while polling
    }
  }, [user]);

  useEffect(() => {
    fetchWarnings();
    const timer = window.setInterval(fetchWarnings, 60000);
    const onRefresh = () => {
      fetchWarnings();
    };
    window.addEventListener('provis-warnings-refresh', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('provis-warnings-refresh', onRefresh);
    };
  }, [fetchWarnings, url]);

  // All unresolved critical alerts visible in user's scope (personal priority, then management monitoring)
  const criticalItems = useMemo<PerformanceWarningItem[]>(() => {
    if (!data) return [];
    const personalCritical = (data.warnings ?? []).filter(w => w.severity === 'critical');
    const monitoringCritical = isManagement
      ? (data.monitoring?.items ?? []).filter(w => w.severity === 'critical')
      : [];

    const merged = new Map<number, PerformanceWarningItem>();
    for (const item of [...personalCritical, ...monitoringCritical]) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values());
  }, [data, isManagement]);

  // Trigger dramatic Critical Pop-up ONCE per login session (re-triggers after Logout -> Login)
  useEffect(() => {
    if (!user || !loginSessionKey || criticalItems.length === 0) return;

    const storageKey = `provis_critical_popup_seen_${user.id}`;
    try {
      const seenSession = window.localStorage.getItem(storageKey);
      if (seenSession !== loginSessionKey) {
        window.localStorage.setItem(storageKey, loginSessionKey);
        setShowCriticalPopup(true);
      }
    } catch {
      // Fallback if localStorage is restricted
      setShowCriticalPopup(true);
    }
  }, [user, loginSessionKey, criticalItems.length]);

  const dismissPopup = () => {
    if (user && loginSessionKey) {
      try {
        window.localStorage.setItem(`provis_critical_popup_seen_${user.id}`, loginSessionKey);
      } catch {
        // Ignore
      }
    }
    setShowCriticalPopup(false);
  };

  if (!user) return null;

  const personalVisibleCount = data?.warnings?.length ?? 0;
  const monitoringVisibleCount = isManagement ? (data?.monitoring?.total_count ?? 0) : 0;
  const badgeCount = isSuperAdmin
    ? data?.monitoring?.active_count ?? 0
    : data?.active_count ?? 0;

  const hasAnyWarning =
    badgeCount > 0 || personalVisibleCount > 0 || monitoringVisibleCount > 0;

  const hasCritical = Boolean(
    data?.warnings.some(w => w.severity === 'critical') ||
      (isManagement && data?.monitoring?.items.some(w => w.severity === 'critical'))
  );

  // 3 distinct color states + optional active ring:
  // 1) Critical = deep red (merah pekat)
  // 2) Slight lag / active warning = deep yellow-amber (kuning pekat)
  // 3) Clear / normal = soft pale amber with exclamation bell (kuning agak pudar, NEVER white/transparent)
  const colorClasses = hasCritical
    ? 'bg-rose-600 border-rose-700 text-white hover:bg-rose-700 shadow-sm'
    : hasAnyWarning || badgeCount > 0
    ? 'bg-amber-400 border-amber-500 text-amber-950 hover:bg-amber-500 shadow-xs'
    : 'bg-amber-100/80 border-amber-300/90 text-amber-600 hover:bg-amber-200/80 hover:text-amber-700';

  return (
    <>
      <Link
        href="/ai-warnings"
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-150 ${colorClasses} ${
          isActivePage ? 'ring-2 ring-indigo-600 ring-offset-2' : ''
        }`}
        title={
          hasCritical
            ? `CRITICAL: ${criticalItems.length} severe timeline alert${criticalItems.length > 1 ? 's' : ''} — Open AI Watchdog`
            : badgeCount > 0
            ? `${badgeCount} AI performance alert${badgeCount > 1 ? 's' : ''} — Open AI Watchdog`
            : 'AI Performance Watchdog (All timelines monitored)'
        }
        aria-label="Open AI Performance Watchdog page"
      >
        <WatchdogAlertBellIcon
          className={`w-[18px] h-[18px] ${hasCritical ? 'animate-pulse' : ''}`}
        />
        {badgeCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center shadow-xs border ${
              hasCritical
                ? 'bg-slate-950 text-white border-rose-300'
                : 'bg-amber-800 text-white border-amber-200'
            }`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>

      {/* Urgent Critical Timeline Breach Modal (Triggered once per fresh login session) */}
      {showCriticalPopup && criticalItems.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="critical-watchdog-modal-title"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border-2 border-rose-600 overflow-hidden flex flex-col max-h-[90vh]">
            {/* High-Urgency Crimson Header */}
            <div className="bg-gradient-to-r from-rose-950 via-rose-800 to-red-700 px-5 py-4 text-white flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-rose-500/30 border border-rose-300/40 flex items-center justify-center shrink-0 animate-pulse">
                  <AlertOctagon size={24} className="text-rose-100" />
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/30 border border-rose-300/30 text-[10.5px] font-extrabold uppercase tracking-wider text-rose-100 mb-1">
                    <ShieldAlert size={11} />
                    <span>Urgent AI Watchdog Alert</span>
                  </div>
                  <h2
                    id="critical-watchdog-modal-title"
                    className="text-base sm:text-lg font-extrabold tracking-tight leading-snug"
                  >
                    Critical Timeline Breach Detected ({criticalItems.length})
                  </h2>
                  <p className="text-[12px] sm:text-[12.5px] text-rose-100/90 mt-0.5">
                    Immediate action is required on the severely behind-schedule project(s) below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={dismissPopup}
                className="p-1.5 rounded-lg text-rose-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                aria-label="Close critical alert modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Critical Items Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 bg-rose-50/40">
              {criticalItems.slice(0, 3).map(item => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-rose-200 border-l-4 border-l-rose-600 p-4 shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      {isManagement && item.worker_name && (
                        <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-rose-700 mb-1">
                          <Users size={13} />
                          <span>{item.worker_name}</span>
                        </div>
                      )}
                      <h3 className="text-[14px] font-bold text-slate-900 leading-snug">
                        {item.project_title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-600 mt-1">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Building2 size={12} className="text-slate-400" />
                          <span>{item.company_name}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">
                          <Layers size={11} />
                          <span>{item.division_name}</span>
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10.5px] font-extrabold uppercase tracking-wide shrink-0 self-start">
                      Critical
                    </span>
                  </div>

                  {/* Critical Metrics Strip */}
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold">
                      Actual: {Math.round(item.actual_progress)}%
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-bold">
                      Expected: {Math.round(item.expected_progress)}%
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-extrabold">
                      <TrendingDown size={12} />
                      <span>Gap {item.timeline_gap}%</span>
                    </span>
                    {item.overdue_count > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold">
                        {item.overdue_count} Overdue
                      </span>
                    )}
                    {item.delay_days > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold">
                        +{item.delay_days}d Delay
                      </span>
                    )}
                  </div>

                  <p className="text-[12.5px] text-slate-700 leading-relaxed">{item.message}</p>

                  <div className="pt-1 flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={`/tasks?project_id=${item.project_id}`}
                      onClick={dismissPopup}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                    >
                      <span>Resolve Tasks Now</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              ))}

              {criticalItems.length > 3 && (
                <div className="text-center text-[12px] font-semibold text-rose-700 pt-1">
                  +{criticalItems.length - 3} more critical alert(s) awaiting review on the Watchdog page.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-white border-t border-rose-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <button
                type="button"
                onClick={dismissPopup}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition-colors cursor-pointer"
              >
                Dismiss for This Session
              </button>

              <Link
                href="/ai-warnings"
                onClick={dismissPopup}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors"
              >
                <ShieldAlert size={15} />
                <span>Open AI Watchdog Center</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
