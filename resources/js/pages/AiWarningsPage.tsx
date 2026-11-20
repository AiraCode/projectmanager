import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, usePage } from '@inertiajs/react';
import {
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  Check,
  ExternalLink,
  Search,
  Building2,
  Layers,
  Users,
  Clock,
  TrendingDown,
  X,
  BarChart3,
} from 'lucide-react';
import Layout from '@/components/Layout';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import {
  getCsrfHeaders,
  type PerformanceWarningItem,
  type WarningsPayload,
} from '@/components/PerformanceWarningBell';

interface AiWarningsPageProps {
  initialData: WarningsPayload;
  initialProjectId?: number | null;
  userRole?: string;
}

function formatDetectedAt(iso?: string | null): string {
  if (!iso) return 'Just detected';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AiWarningsPage({ initialData, initialProjectId = null }: AiWarningsPageProps) {
  const { user } = useAuth();
  const [data, setData] = useState<WarningsPayload>(initialData);
  const [isSyncing, setIsSyncing] = useState(false);

  const isManagement = Boolean(user?.isSuperAdmin || user?.isAdminUtama || user?.isPIC);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const hasMonitoring = Boolean(data.monitoring && data.monitoring.items.length > 0);
  const hasPersonal = (data.warnings?.length ?? 0) > 0;

  // Default to Monitoring tab for management when monitoring data exists and personal alerts are empty (or SuperAdmin)
  const [activeTab, setActiveTab] = useState<'personal' | 'monitoring'>(() => {
    if (isSuperAdmin || (isManagement && hasMonitoring && !hasPersonal)) {
      return 'monitoring';
    }
    return 'personal';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged'>('all');
  const [projectFilterId, setProjectFilterId] = useState<number | null>(initialProjectId ?? null);

  const fetchWarnings = useCallback(async () => {
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
      // Silently ignore transient network error
    }
  }, []);

  useEffect(() => {
    const onRefresh = () => {
      fetchWarnings();
    };
    window.addEventListener('provis-warnings-refresh', onRefresh);
    return () => window.removeEventListener('provis-warnings-refresh', onRefresh);
  }, [fetchWarnings]);

  const handleRefreshAndScan = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      if (isManagement) {
        const res = await fetch('/ai/warnings/scan', {
          method: 'POST',
          headers: getCsrfHeaders(),
          credentials: 'same-origin',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data) setData(json.data);
        }
      } else {
        await fetchWarnings();
      }
      window.dispatchEvent(new CustomEvent('provis-warnings-refresh'));
    } catch {
      // Silently ignore
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAcknowledge = async (id: number) => {
    try {
      const res = await fetch(`/ai/warnings/${id}/acknowledge`, {
        method: 'POST',
        headers: getCsrfHeaders(),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setData(json.data);
        window.dispatchEvent(new CustomEvent('provis-warnings-refresh'));
      }
    } catch {
      // Silently ignore
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      const res = await fetch('/ai/warnings/acknowledge-all', {
        method: 'POST',
        headers: getCsrfHeaders(),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setData(json.data);
        window.dispatchEvent(new CustomEvent('provis-warnings-refresh'));
      }
    } catch {
      // Silently ignore
    }
  };

  // Determine source items for active tab
  const monitoringItems = data.monitoring?.items ?? [];
  const personalItems = data.warnings ?? [];
  const currentTab: 'personal' | 'monitoring' =
    isManagement && (activeTab === 'monitoring' || (!hasPersonal && hasMonitoring))
      ? 'monitoring'
      : 'personal';

  const sourceItems: PerformanceWarningItem[] =
    currentTab === 'monitoring' ? monitoringItems : personalItems;

  const activeProjectFilterName = useMemo(() => {
    if (!projectFilterId) return null;
    const match = [...personalItems, ...monitoringItems].find(i => i.project_id === projectFilterId);
    return match ? match.project_title : `Project #${projectFilterId}`;
  }, [projectFilterId, personalItems, monitoringItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sourceItems.filter(item => {
      if (projectFilterId && item.project_id !== projectFilterId) return false;
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        item.project_title,
        item.company_name,
        item.division_name,
        item.worker_name ?? '',
        item.worker_email ?? '',
        item.message,
        ...(item.sample_tasks ?? []).map(t => t.name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sourceItems, projectFilterId, severityFilter, statusFilter, searchQuery]);

  const personalCriticalCount = personalItems.filter(i => i.severity === 'critical').length;
  const monitoringCriticalCount = monitoringItems.filter(i => i.severity === 'critical').length;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldAlert size={22} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">
                  AI Performance Watchdog
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  <span>{isManagement ? 'Team & Timeline Monitor' : 'Personal Alerts'}</span>
                </span>
              </div>
              <p className="text-[12.5px] sm:text-[13.5px] text-slate-500 mt-0.5 leading-snug">
                Automated timeline tracking comparing actual WBS task completion against expected S-Curve schedules.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRefreshAndScan}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span>
                {isSyncing
                  ? isManagement
                    ? 'Scanning & Refreshing…'
                    : 'Refreshing…'
                  : isManagement
                  ? 'Scan & Refresh'
                  : 'Refresh Alerts'}
              </span>
            </button>

            {currentTab === 'personal' && (data.personal_active_count ?? data.active_count) > 0 && (
              <button
                type="button"
                onClick={handleAcknowledgeAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12.5px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
              >
                <Check size={14} />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Responsive KPI Strip (2 columns on mobile/tablet, 4 columns on laptop/desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {currentTab === 'monitoring' && data.monitoring ? (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Active Alerts
                </span>
                <AlertTriangle size={16} className="text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data.monitoring.total_count}
                </span>
                <span className="text-[11.5px] text-rose-600 font-semibold">
                  {monitoringCriticalCount} critical
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Warned Workers
                </span>
                <Users size={16} className="text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data.monitoring.workers_warned}
                </span>
                <span className="text-[11.5px] text-slate-500">need follow-up</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Companies Affected
                </span>
                <Building2 size={16} className="text-slate-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data.monitoring.companies_affected}
                </span>
                <span className="text-[11.5px] text-slate-500">across scope</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Resolved (7d)
                </span>
                <CheckCircle2 size={16} className="text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700">
                  {data.resolved_recent_count}
                </span>
                <span className="text-[11.5px] text-slate-500">caught up</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Unread Alerts
                </span>
                <AlertTriangle size={16} className="text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data.personal_active_count ?? data.active_count}
                </span>
                <span className="text-[11.5px] text-slate-500">of {personalItems.length} total</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Critical Alerts
                </span>
                <AlertOctagon size={16} className="text-rose-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-rose-700">
                  {personalCriticalCount}
                </span>
                <span className="text-[11.5px] text-slate-500">high priority</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Acknowledged
                </span>
                <Check size={16} className="text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data.acknowledged_count}
                </span>
                <span className="text-[11.5px] text-slate-500">in progress</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Resolved (7d)
                </span>
                <CheckCircle2 size={16} className="text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700">
                  {data.resolved_recent_count}
                </span>
                <span className="text-[11.5px] text-slate-500">on track again</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filter & Search Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5">
        {isManagement && (hasMonitoring || hasPersonal) && (
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('monitoring')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold transition-colors cursor-pointer ${
                currentTab === 'monitoring'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <Users size={14} />
              <span>Team Monitoring ({monitoringItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold transition-colors cursor-pointer ${
                currentTab === 'personal'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <AlertTriangle size={14} />
              <span>My Alerts ({personalItems.length})</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="relative lg:col-span-5 min-w-0">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search project, company, worker, division, or task…"
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Segmented Filter Groups */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 flex-wrap">
            {/* Severity Group */}
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
                Severity
              </span>
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                {(['all', 'critical', 'warning'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeverityFilter(level)}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold capitalize transition-all cursor-pointer ${
                      severityFilter === level
                        ? level === 'critical'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : level === 'warning'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Group */}
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
                Status
              </span>
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                {([
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Unread' },
                  { id: 'acknowledged', label: 'Read' },
                ] as const).map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      statusFilter === st.id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {projectFilterId && (
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-[12px]">
            <span className="text-slate-600">
              Filtered by project: <strong className="text-slate-900">{activeProjectFilterName}</strong>
            </span>
            <button
              type="button"
              onClick={() => setProjectFilterId(null)}
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              <X size={13} />
              <span>Show All Projects</span>
            </button>
          </div>
        )}
      </div>

      {/* Warning Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-10 sm:p-14 text-center shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {sourceItems.length === 0
              ? 'All Projects & Workers Are On Track'
              : 'No Warnings Match Your Filters'}
          </h2>
          <p className="text-[13px] text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            {sourceItems.length === 0
              ? 'No active schedule deviations were detected within your access scope. Warnings appear automatically whenever actual progress falls behind expected S-Curve timelines.'
              : 'Try adjusting your search query, severity filter, or status filter to see more items.'}
          </p>
          {(searchQuery || severityFilter !== 'all' || statusFilter !== 'all' || projectFilterId) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSeverityFilter('all');
                setStatusFilter('all');
                setProjectFilterId(null);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          {filteredItems.map(item => {
            const isCritical = item.severity === 'critical';
            const isAck = item.status === 'acknowledged';
            const actualPct = Math.max(0, Math.min(100, Math.round(item.actual_progress)));
            const expectedPct = Math.max(0, Math.min(100, Math.round(item.expected_progress)));

            return (
              <article
                key={item.id}
                className={`bg-white rounded-2xl border shadow-2xs p-4 sm:p-5 flex flex-col justify-between gap-4 transition-shadow hover:shadow-sm ${
                  isCritical
                    ? 'border-rose-200 border-l-4 border-l-rose-500'
                    : 'border-amber-200 border-l-4 border-l-amber-500'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Top: Context + Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                    <div className="min-w-0 space-y-1.5">
                      {currentTab === 'monitoring' && item.worker_name && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-slate-900">
                            <Users size={14} className="text-indigo-600 shrink-0" />
                            <span>{item.worker_name}</span>
                          </span>
                          {item.worker_email && (
                            <span className="text-[11.5px] text-slate-500 truncate">
                              {item.worker_email}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14.5px] sm:text-[15.5px] font-bold text-slate-900 leading-snug">
                          {item.project_title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span>{item.company_name}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[11px]">
                          <Layers size={11} />
                          <span>{item.division_name}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                          isCritical
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {isCritical ? <AlertOctagon size={11} /> : <AlertTriangle size={11} />}
                        <span>{isCritical ? 'Critical' : 'Attention'}</span>
                      </span>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          isAck
                            ? 'bg-slate-50 text-slate-500 border-slate-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {isAck ? 'Read' : 'Unread'}
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress vs Schedule Comparison */}
                  <div className="rounded-xl bg-slate-50/90 border border-slate-200/80 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600">
                          Actual: <strong className="text-slate-900">{actualPct}%</strong>
                        </span>
                        <span className="text-slate-600">
                          Expected Timeline: <strong className="text-indigo-700">{expectedPct}%</strong>
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock size={11} />
                        <span>{formatDetectedAt(item.detected_at)}</span>
                      </span>
                    </div>

                    {/* Progress bar with Expected Marker */}
                    <div className="relative h-2.5 rounded-full bg-slate-200 overflow-visible">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCritical ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${actualPct}%` }}
                      />
                      <div
                        className="absolute -top-1 -bottom-1 w-0.5 bg-indigo-700 rounded-full"
                        style={{ left: `${expectedPct}%` }}
                        title={`Expected progress: ${expectedPct}%`}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11.5px] font-semibold text-slate-700">
                        <TrendingDown size={12} className="text-rose-500" />
                        <span>Gap: {item.timeline_gap}%</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11.5px] font-semibold text-slate-700">
                        SPI: {item.spi}
                      </span>
                      {item.overdue_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[11.5px] font-bold text-rose-700">
                          {item.overdue_count} Overdue Task{item.overdue_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {item.delay_days > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11.5px] font-bold text-amber-800">
                          +{item.delay_days}d Max Delay
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AI Analysis Explanation */}
                  <p className="text-[13px] sm:text-[13.5px] text-slate-700 leading-relaxed">
                    {item.message}
                  </p>

                  {/* Lagging / Overdue Priority Tasks */}
                  {item.sample_tasks && item.sample_tasks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Priority Tasks Requiring Action
                      </div>
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-slate-50/40">
                        {item.sample_tasks.map(task => (
                          <div
                            key={task.id}
                            className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[12px]"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 break-words">
                                {task.name}
                              </div>
                              {task.end && (
                                <div className="text-[11px] text-slate-500">
                                  Due: {task.end}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-semibold text-slate-700">
                                {task.progress}%
                              </span>
                              {task.overdue && task.days_late > 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                  +{task.days_late}d late
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                  Lagging
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/tasks?project_id=${item.project_id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
                    >
                      <span>Update Tasks</span>
                      <ExternalLink size={12} />
                    </Link>
                    <Link
                      href={`/scurve?project_id=${item.project_id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors"
                    >
                      <BarChart3 size={13} />
                      <span>Open S-Curve</span>
                    </Link>
                  </div>

                  {currentTab === 'personal' && item.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(item.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                    >
                      <Check size={13} />
                      <span>Got it</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Footer Note */}
      <div className="text-center text-[11.5px] text-slate-400 pt-1 pb-4 flex items-center justify-center gap-1.5">
        <Clock size={12} />
        <span>Warnings automatically clear once updated task progress catches up with the project timeline.</span>
      </div>
    </div>
  );
}

function AiWarningsLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { props } = usePage<any>();
  const isSuperAdmin =
    Boolean(props?.auth?.user?.isSuperAdmin) ||
    String(props?.userRole ?? props?.auth?.user?.role ?? '').toLowerCase() === 'superadmin';
  return isSuperAdmin ? <SuperAdminLayout>{children}</SuperAdminLayout> : <Layout>{children}</Layout>;
}

AiWarningsPage.layout = (page: React.ReactNode) => (
  <ErrorBoundary>
    <AuthProvider>
      <AiWarningsLayoutWrapper>{page}</AiWarningsLayoutWrapper>
    </AuthProvider>
  </ErrorBoundary>
);

export default AiWarningsPage;
