import { useState, useRef, useEffect, useMemo } from 'react';
import { usePage } from '@inertiajs/react';
import { PROJECT } from '@/data/mockData';
import { PageHeader, Card, Button, formatDateDisplay } from '@/components/ui';
import {
  Calendar, ChevronDown, ChevronRight, Sparkles, Flag,
  LayoutGrid, ListTree, CheckCircle2, Clock, ArrowRight,
  Maximize2, Minimize2
} from 'lucide-react';

// Curated phase colors matching professional enterprise schedule diagrams
const PHASE_COLORS = [
  { bg: '#2563EB', text: '#FFFFFF', light: '#EFF6FF', border: '#93C5FD', name: 'Blue' },        // 1. BusDev
  { bg: '#DC2626', text: '#FFFFFF', light: '#FEF2F2', border: '#FCA5A5', name: 'Red' },         // 2. Factory Layout
  { bg: '#16A34A', text: '#FFFFFF', light: '#F0FDF4', border: '#86EFAC', name: 'Green' },       // 3. Civil Works
  { bg: '#D97706', text: '#FFFFFF', light: '#FFFBEB', border: '#FCD34D', name: 'Amber' },       // 4. Machinery
  { bg: '#7C3AED', text: '#FFFFFF', light: '#F5F3FF', border: '#C4B5FD', name: 'Purple' },      // 5. Utilities
  { bg: '#0D9488', text: '#FFFFFF', light: '#F0FDFA', border: '#99F6E4', name: 'Teal' },        // 6. Purchasing
  { bg: '#EA580C', text: '#FFFFFF', light: '#FFF7ED', border: '#FDBA74', name: 'Orange' },      // 7. Raw Material
  { bg: '#0284C7', text: '#FFFFFF', light: '#F0F9FF', border: '#7DD3FC', name: 'Sky' },         // 8. Piping
  { bg: '#4F46E5', text: '#FFFFFF', light: '#EEF2FF', border: '#A5B4FC', name: 'Indigo' },      // 9. Electrical/PLN
  { bg: '#9333EA', text: '#FFFFFF', light: '#FAF5FF', border: '#E9D5FF', name: 'Fuchsia' },     // 10. Waste/SHE
  { bg: '#059669', text: '#FFFFFF', light: '#ECFDF5', border: '#6EE7B7', name: 'Emerald' },     // 11. Permits/Legal
  { bg: '#E11D48', text: '#FFFFFF', light: '#FFF1F2', border: '#FDA4AF', name: 'Rose' },        // 12. HRGA/People
  { bg: '#CA8A04', text: '#FFFFFF', light: '#FEFCE8', border: '#FDE047', name: 'Yellow' },      // 13. Trial Runs
  { bg: '#475569', text: '#FFFFFF', light: '#F8FAFC', border: '#CBD5E1', name: 'Slate' },       // 14. Mass Production
  { bg: '#0891B2', text: '#FFFFFF', light: '#ECFEFF', border: '#67E8F9', name: 'Cyan' },        // 15. Sales
  { bg: '#65A30D', text: '#FFFFFF', light: '#F7FEE7', border: '#BEF264', name: 'Lime' },        // 16. Commissioning
  { bg: '#4338CA', text: '#FFFFFF', light: '#EEF2FF', border: '#A5B4FC', name: 'DarkIndigo' },  // 17. Certifications
];

const STATUS_COLORS: Record<string, string> = {
  'Open': '#16A34A',
  'On Track': '#1E46D9',
  'At Risk': '#D97706',
  'Delayed': '#DC3545',
  'Completed': '#4F46E5',
  'Cancelled': '#94A3B8',
};

interface Milestone {
  id: string;
  name: string;
  dateStr: string;
  description: string;
}

export default function TimelinePage() {
  const pageProps = usePage().props as any;
  const project = pageProps?.project;

  const [projectData, setProjectData] = useState(() => {
    return project && project.mainJobs ? project : PROJECT;
  });

  useEffect(() => {
    if (project && project.mainJobs) {
      setProjectData(project);
    }
  }, [project]);

  // View Mode: 'phase-view' (grouped by phase) or 'wbs-tree' (hierarchical tree)
  const [viewMode, setViewMode] = useState<'phase-view' | 'wbs-tree'>('phase-view');
  const [showAllPhases, setShowAllPhases] = useState(false);

  const pStart = useMemo(() => {
    return projectData?.startDate && !isNaN(new Date(projectData.startDate).getTime())
      ? new Date(projectData.startDate)
      : new Date('2026-09-01');
  }, [projectData?.startDate]);

  const pEnd = useMemo(() => {
    return projectData?.endDate && !isNaN(new Date(projectData.endDate).getTime())
      ? new Date(projectData.endDate)
      : new Date('2027-10-31');
  }, [projectData?.endDate]);

  const TOTAL_DAYS = useMemo(() => {
    return Math.max(1, Math.ceil((pEnd.getTime() - pStart.getTime()) / 86400000));
  }, [pStart, pEnd]);

  const TODAY = new Date();

  function dayOffset(dateStr: string): number {
    if (!dateStr) return 0;
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return 0;
    return Math.ceil((t - pStart.getTime()) / 86400000);
  }

  function pct(dateStr: string): number {
    if (!dateStr) return 0;
    return Math.max(0, Math.min(100, (dayOffset(dateStr) / TOTAL_DAYS) * 100));
  }

  function barWidth(start: string, end: string): number {
    if (!start || !end) return 1.5;
    const s = dayOffset(start);
    const e = dayOffset(end);
    const diff = e - s;
    if (isNaN(diff) || diff <= 0) return 1.5;
    return Math.max(1.2, Math.min(100, (diff / TOTAL_DAYS) * 100));
  }

  // Month markers for the top timeline axis
  const months = useMemo(() => {
    const markers: { label: string; pct: number }[] = [];
    const d = new Date(pStart);
    d.setDate(1);
    const step = TOTAL_DAYS > 500 ? 2 : 1;
    let count = 0;
    while (d <= pEnd && count < 100) {
      count++;
      const p = ((d.getTime() - pStart.getTime()) / 86400000 / TOTAL_DAYS) * 100;
      if (p >= 0 && p <= 100) {
        markers.push({
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          pct: p,
        });
      }
      d.setMonth(d.getMonth() + step);
    }
    return markers;
  }, [pStart, pEnd, TOTAL_DAYS]);

  // Key Project Milestones (using existing logic & dates)
  const milestones: Milestone[] = useMemo(() => {
    const startMs = pStart.getTime();
    const endMs = pEnd.getTime();
    const span = endMs - startMs;

    const m1Date = new Date(startMs + span * 0.25).toISOString().slice(0, 10);
    const m2Date = new Date(startMs + span * 0.55).toISOString().slice(0, 10);
    const m3Date = new Date(startMs + span * 0.85).toISOString().slice(0, 10);

    return [
      { id: 'm-1', name: 'Milestone 1', dateStr: m1Date, description: 'Engineering & Design Freeze' },
      { id: 'm-2', name: 'Milestone 2', dateStr: m2Date, description: 'Procurement & Machine Installation' },
      { id: 'm-3', name: 'Milestone 3', dateStr: m3Date, description: 'Cold/Hot Trial & Pre-Commissioning' },
    ];
  }, [pStart, pEnd]);

  const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({ 'mj-1': true, 'mj-2': true, 'mj-3': true });
  const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({});
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle?: string;
    details?: string[];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const todayPct = Math.max(0, Math.min(100, ((TODAY.getTime() - pStart.getTime()) / 86400000 / TOTAL_DAYS) * 100));

  const toggleAll = (expand: boolean) => {
    const newMJ: Record<string, boolean> = {};
    const newSMJ: Record<string, boolean> = {};
    if (expand && projectData?.mainJobs) {
      projectData.mainJobs.forEach((m: any) => {
        newMJ[m.id] = true;
        (m.subMainJobs || []).forEach((s: any) => {
          newSMJ[s.id] = true;
        });
      });
    }
    setExpandedMJ(newMJ);
    setExpandedSMJ(newSMJ);
  };

  const mainJobsList = projectData?.mainJobs || [];
  const visiblePhases = showAllPhases ? mainJobsList : mainJobsList.slice(0, 6);
  const remainingPhaseCount = Math.max(0, mainJobsList.length - 6);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-full space-y-4">
      {/* 1. Page Header with dynamic project title */}
      <PageHeader
        title="Timeline / Gantt Schedule"
        subtitle={`Project schedule visualization (${projectData.name || 'Project'}) based on phases and WBS structure.`}
        actions={
          <div className="flex flex-col items-end gap-1.5">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-neutral-100 p-1 rounded-lg border border-neutral-200 shadow-2xs">
              <button
                onClick={() => setViewMode('phase-view')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  viewMode === 'phase-view'
                    ? 'bg-brand text-white shadow-xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Phase View</span>
              </button>
              <button
                onClick={() => setViewMode('wbs-tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  viewMode === 'wbs-tree'
                    ? 'bg-brand text-white shadow-xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <ListTree size={14} />
                <span>WBS Tree</span>
              </button>
            </div>

            {/* Expand / Collapse Controls (WBS Tree Mode) directly underneath */}
            {viewMode === 'wbs-tree' && (
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                  className="text-[11px] h-7 px-2 bg-white hover:bg-neutral-50"
                  title="Expand all levels"
                >
                  <Maximize2 size={12} className="mr-1 text-neutral-500" />
                  Expand All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                  className="text-[11px] h-7 px-2 bg-white hover:bg-neutral-50"
                  title="Collapse all levels"
                >
                  <Minimize2 size={12} className="mr-1 text-neutral-500" />
                  Collapse All
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* 2. Timeline Information / Legend Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-neutral-200/90 shadow-2xs">
        {/* Dynamic Project Phases */}
        <div className="flex items-center gap-3 flex-wrap text-[12px]">
          <span className="font-semibold text-neutral-500 uppercase tracking-wider text-[11px] flex items-center gap-1.5 flex-shrink-0">
            <Sparkles size={13} className="text-brand" />
            Project Phases
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {visiblePhases.map((mj: any, idx: number) => {
              const color = PHASE_COLORS[idx % PHASE_COLORS.length];
              return (
                <div
                  key={mj.id || idx}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-50 border border-neutral-200/70 text-[11px] font-medium text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-100"
                  title={mj.name}
                >
                  <span className="w-2 h-2 rounded-xs flex-shrink-0" style={{ backgroundColor: color.bg }} />
                  <span className="truncate max-w-[130px]">{mj.name}</span>
                </div>
              );
            })}
            {remainingPhaseCount > 0 && (
              <button
                onClick={() => setShowAllPhases((v) => !v)}
                className="text-[11px] text-brand font-semibold px-2 py-0.5 rounded-md bg-brand-light hover:bg-brand/15 border border-brand/25 transition-colors"
              >
                {showAllPhases ? 'Tampilkan lebih sedikit' : `+${remainingPhaseCount} lainnya`}
              </button>
            )}
          </div>
        </div>

        {/* Milestone & Today Indicators */}
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-neutral-700 bg-neutral-50 px-2.5 py-1 rounded-lg border border-neutral-200/80 shadow-2xs">
            <span className="w-2 h-2 rotate-45 bg-amber-500 rounded-[1px]" />
            <span>Target Milestones</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-danger bg-danger-light px-2.5 py-1 rounded-lg border border-danger/20 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
            <span>Today · {TODAY.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* 3. Gantt Schedule Canvas */}
      {viewMode === 'phase-view' ? (
        /* ─── PHASE VIEW (CLEAN ENTERPRISE GROUPED GANTT) ─── */
        <Card className="overflow-hidden border border-neutral-200/90 shadow-sm rounded-xl">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-230px)] scrollbar-thin" ref={containerRef}>
            <div className="min-w-[1100px]">
              {/* Top Axis Header */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 sticky top-0 z-30 shadow-2xs">
                {/* Column 1: Phase Group (Sticky Left) */}
                <div className="w-44 sm:w-48 flex-shrink-0 px-3.5 py-2.5 font-bold text-[11px] text-neutral-600 uppercase tracking-wider border-r border-neutral-200 flex items-center justify-center text-center sticky left-0 z-40 bg-neutral-50 shadow-[1px_0_4px_rgba(0,0,0,0.03)]">
                  Phase / Group
                </div>
                {/* Column 2: Task Activity (Sticky Left offset) */}
                <div className="w-64 sm:w-72 flex-shrink-0 px-4 py-2.5 font-bold text-[11px] text-neutral-600 uppercase tracking-wider border-r border-neutral-200 flex items-center sticky left-44 sm:left-48 z-40 bg-neutral-50 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  Task / Activity
                </div>
                {/* Column 3: Timeline Axis & Milestones */}
                <div className="flex-1 relative h-11 bg-neutral-50/70">
                  {/* Month Markers */}
                  {months.map(({ label, pct: p }) => (
                    <div key={label} className="absolute top-0 bottom-0 flex flex-col justify-end pb-1.5" style={{ left: `${p}%` }}>
                      <div className="h-3 border-l border-neutral-300" />
                      <span className="text-[10px] font-semibold text-neutral-500 whitespace-nowrap pl-1">{label}</span>
                    </div>
                  ))}

                  {/* Milestones in Axis Header */}
                  {milestones.map((m) => {
                    const mPct = pct(m.dateStr);
                    return (
                      <div
                        key={m.id}
                        className="absolute top-0 bottom-0 flex flex-col items-center z-30 cursor-pointer group/m"
                        style={{ left: `${mPct}%` }}
                        onMouseMove={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            title: m.name,
                            subtitle: m.description,
                            details: [`Target: ${formatDateDisplay(m.dateStr)}`],
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full shadow-xs -translate-x-1/2 mt-1 border border-amber-400/80 transition-transform group-hover/m:scale-105">
                          <span className="w-1.5 h-1.5 rotate-45 bg-white rounded-[0.5px]" />
                          <span>{m.name}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Today Marker in Axis Header */}
                  <div
                    className="absolute top-0 bottom-0 flex flex-col items-center z-30 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                  >
                    <div className="bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs -translate-x-1/2 mt-1 flex items-center gap-1 border border-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>Today</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rows Grouped by Phase */}
              <div>
                {mainJobsList.map((mj: any, mjIdx: number) => {
                  const color = PHASE_COLORS[mjIdx % PHASE_COLORS.length];
                  const items = mj.subMainJobs && mj.subMainJobs.length > 0
                    ? mj.subMainJobs
                    : [{
                        id: `mj-standalone-${mj.id}`,
                        code: mj.code,
                        name: mj.name,
                        startDate: mj.startDate,
                        finishDate: mj.finishDate,
                        progress: mj.progress,
                        status: mj.status,
                        pic: 'Team',
                      }];

                  return (
                    <div key={mj.id} className="flex border-b border-neutral-200 group/phase">
                      {/* Left Column: Phase Group Card (Sticky Left) */}
                      <div
                        className="w-44 sm:w-48 flex-shrink-0 flex flex-col items-center justify-center p-3 border-r border-neutral-200 text-center relative select-none sticky left-0 z-20 shadow-[1px_0_4px_rgba(0,0,0,0.03)]"
                        style={{ backgroundColor: color.light }}
                      >
                        <div
                          className="w-full text-center px-2.5 py-2 rounded-lg border shadow-2xs bg-white transition-all group-hover/phase:shadow-sm"
                          style={{ borderColor: color.border }}
                        >
                          <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: color.bg }}>
                            Fase {mj.code}
                          </div>
                          <div className="text-[12px] font-bold text-neutral-800 leading-snug mt-0.5 line-clamp-2" title={mj.name}>
                            {mj.name}
                          </div>
                          <div className="mt-1.5 flex items-center justify-center gap-1.5">
                            <span className="text-[10.5px] font-semibold text-neutral-500">Progres:</span>
                            <span className="text-[11px] font-bold text-neutral-800">{mj.progress}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Columns: Tasks List + Gantt Chart Area */}
                      <div className="flex-1 divide-y divide-neutral-100 flex flex-col justify-between">
                        {items.map((item: any) => {
                          const itemStart = item.startDate || mj.startDate || '2026-09-01';
                          const itemEnd = item.finishDate || mj.finishDate || '2027-09-30';
                          const startPos = pct(itemStart);
                          const widthPos = barWidth(itemStart, itemEnd);

                          return (
                            <div
                              key={item.id}
                              className="flex h-11 hover:bg-neutral-50/90 transition-colors group/row"
                            >
                              {/* Task / Activity Column (Sticky offset) */}
                              <div className="w-64 sm:w-72 flex-shrink-0 px-3.5 flex items-center justify-between border-r border-neutral-200 bg-white group-hover/row:bg-neutral-50/90 transition-colors sticky left-44 sm:left-48 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                                <div className="truncate text-[12px] font-semibold text-neutral-800 flex items-center gap-1.5 pr-2" title={item.name}>
                                  <span className="text-[10px] font-mono text-neutral-400 font-bold bg-neutral-100 px-1 py-0.2 rounded border border-neutral-200/60 flex-shrink-0">
                                    {item.code}
                                  </span>
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="text-[10px] font-medium text-neutral-600 bg-neutral-100/80 px-1.5 py-0.5 rounded border border-neutral-200/80 flex-shrink-0">
                                  {item.pic || 'Internal'}
                                </span>
                              </div>

                              {/* Gantt Canvas Area */}
                              <div className="flex-1 relative h-full bg-white group-hover/row:bg-neutral-50/90 transition-colors">
                                {/* Subtle month grid lines */}
                                {months.map(({ pct: p }) => (
                                  <div
                                    key={p}
                                    className="absolute inset-y-0 border-l border-neutral-100/90 pointer-events-none"
                                    style={{ left: `${p}%` }}
                                  />
                                ))}

                                {/* Milestone vertical guidelines */}
                                {milestones.map((m) => {
                                  const mPct = pct(m.dateStr);
                                  return (
                                    <div
                                      key={`vline-${m.id}`}
                                      className="absolute inset-y-0 border-l border-amber-400/50 pointer-events-none z-10"
                                      style={{ left: `${mPct}%` }}
                                    />
                                  );
                                })}

                                {/* Today line */}
                                <div
                                  className="absolute inset-y-0 border-l-2 border-danger/60 border-dashed pointer-events-none z-10"
                                  style={{ left: `${todayPct}%` }}
                                />

                                {/* Gantt Bar */}
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-6 rounded-lg flex items-center px-2 cursor-pointer shadow-xs transition-all hover:brightness-105 active:scale-98 z-10"
                                  style={{
                                    left: `${startPos}%`,
                                    width: `${widthPos}%`,
                                    minWidth: 10,
                                    backgroundColor: color.bg,
                                  }}
                                  onMouseMove={(e) =>
                                    setTooltip({
                                      x: e.clientX,
                                      y: e.clientY,
                                      title: `${item.code} ${item.name}`,
                                      subtitle: `Phase: ${mj.name}`,
                                      details: [
                                        `Schedule: ${formatDateDisplay(itemStart)} to ${formatDateDisplay(itemEnd)}`,
                                        `Duration: ${item.duration || Math.max(1, dayOffset(itemEnd) - dayOffset(itemStart))} days`,
                                        `PIC / Division: ${item.pic || 'Internal'}`,
                                        `Progress: ${item.progress || 0}% (${item.status || 'Open'})`,
                                      ],
                                    })
                                  }
                                  onMouseLeave={() => setTooltip(null)}
                                >
                                  {/* Progress fill inside the bar */}
                                  {item.progress > 0 && (
                                    <div
                                      className="absolute inset-0 rounded-lg bg-white/25 overflow-hidden"
                                      style={{ width: `${Math.min(100, item.progress)}%` }}
                                    />
                                  )}
                                  {widthPos > 5 && (
                                    <span className="relative text-[10px] text-white font-bold truncate leading-none drop-shadow-2xs">
                                      {item.progress ? `${item.progress}%` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {mainJobsList.length === 0 && (
                  <div className="p-12 text-center text-neutral-500 text-sm">
                    No WBS data available for this project timeline.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* ─── WBS TREE VIEW (3-TIER ENTERPRISE HIERARCHY) ─── */
        <Card className="overflow-hidden border border-neutral-200/90 shadow-sm rounded-xl">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-230px)] scrollbar-thin" ref={containerRef}>
            <div className="min-w-[1100px]">
              {/* Header: Sticky Task column + timeline axis */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 sticky top-0 z-30 shadow-2xs">
                <div className="w-80 sm:w-96 lg:w-[420px] flex-shrink-0 px-4 py-2.5 flex items-center justify-between border-r border-neutral-200 sticky left-0 z-40 bg-neutral-50 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                    WBS Element / Task
                  </span>
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    PIC / Info
                  </span>
                </div>

                <div className="flex-1 relative h-11 bg-neutral-50/70">
                  {/* Month Markers */}
                  {months.map(({ label, pct: p }) => (
                    <div key={label} className="absolute top-0 bottom-0 flex flex-col justify-end pb-1.5" style={{ left: `${p}%` }}>
                      <div className="h-3 border-l border-neutral-300" />
                      <span className="text-[10px] font-semibold text-neutral-500 whitespace-nowrap pl-1">{label}</span>
                    </div>
                  ))}

                  {/* Milestones in Axis Header */}
                  {milestones.map((m) => {
                    const mPct = pct(m.dateStr);
                    return (
                      <div
                        key={m.id}
                        className="absolute top-0 bottom-0 flex flex-col items-center z-30 cursor-pointer group/m"
                        style={{ left: `${mPct}%` }}
                        onMouseMove={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            title: m.name,
                            subtitle: m.description,
                            details: [`Target: ${formatDateDisplay(m.dateStr)}`],
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full shadow-xs -translate-x-1/2 mt-1 border border-amber-400/80 transition-transform group-hover/m:scale-105">
                          <span className="w-1.5 h-1.5 rotate-45 bg-white rounded-[0.5px]" />
                          <span>{m.name}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Today Marker in Axis Header */}
                  <div
                    className="absolute top-0 bottom-0 flex flex-col items-center z-30 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                  >
                    <div className="bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs -translate-x-1/2 mt-1 flex items-center gap-1 border border-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>Today</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rows */}
              {mainJobsList.length > 0 ? (
                mainJobsList.map((mj: any, mjIdx: number) => (
                  <GanttTreeMJ
                    key={mj.id}
                    mj={mj}
                    phaseColor={PHASE_COLORS[mjIdx % PHASE_COLORS.length]}
                    expanded={!!expandedMJ[mj.id]}
                    expandedSMJ={expandedSMJ}
                    onToggleMJ={() => setExpandedMJ((p) => ({ ...p, [mj.id]: !p[mj.id] }))}
                    onToggleSMJ={(smjId) => setExpandedSMJ((p) => ({ ...p, [smjId]: !p[smjId] }))}
                    todayPct={todayPct}
                    months={months}
                    milestones={milestones}
                    onTooltip={(t) =>
                      t
                        ? setTooltip({
                            x: t.x,
                            y: t.y,
                            title: t.text,
                            subtitle: t.sub,
                            details: t.details,
                          })
                        : setTooltip(null)
                    }
                    pct={pct}
                    barWidth={barWidth}
                    dayOffset={dayOffset}
                  />
                ))
              ) : (
                <div className="p-12 text-center text-neutral-500 text-sm">
                  No WBS data available for this project timeline.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 4. Sleek Floating Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-neutral-900/95 backdrop-blur-xs text-white text-[12px] px-3.5 py-2.5 rounded-xl shadow-2xl pointer-events-none border border-neutral-700/80 max-w-xs transition-opacity duration-150"
          style={{ left: Math.min(window.innerWidth - 280, tooltip.x + 14), top: tooltip.y - 55 }}
        >
          <div className="font-bold text-neutral-100 text-[12.5px] leading-snug">{tooltip.title}</div>
          {tooltip.subtitle && <div className="text-[11px] text-neutral-400 mt-0.5">{tooltip.subtitle}</div>}
          {tooltip.details && tooltip.details.length > 0 && (
            <div className="mt-2 pt-2 border-t border-neutral-700/70 space-y-1 text-[11px] text-neutral-300">
              {tooltip.details.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-brand flex-shrink-0" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sub-component for WBS Tree mode rendering 3 distinct hierarchical tiers
 */
function GanttTreeMJ({
  mj,
  phaseColor,
  expanded,
  expandedSMJ,
  onToggleMJ,
  onToggleSMJ,
  todayPct,
  months,
  milestones,
  onTooltip,
  pct,
  barWidth,
  dayOffset,
}: {
  mj: any;
  phaseColor: { bg: string; text: string; light: string; border: string };
  expanded: boolean;
  expandedSMJ: Record<string, boolean>;
  onToggleMJ: () => void;
  onToggleSMJ: (id: string) => void;
  todayPct: number;
  months: { label: string; pct: number }[];
  milestones: Milestone[];
  onTooltip: (t: { x: number; y: number; text: string; sub?: string; details?: string[] } | null) => void;
  pct: (dateStr: string) => number;
  barWidth: (start: string, end: string) => number;
  dayOffset: (dateStr: string) => number;
}) {
  const startPct = pct(mj.startDate);
  const width = barWidth(mj.startDate, mj.finishDate);

  return (
    <>
      {/* ─── Level 1: Main Job Row (Most Prominent) ─── */}
      <div className="flex border-b border-neutral-200/90 bg-neutral-50/60 hover:bg-neutral-100/70 transition-colors group/mj">
        {/* Sticky Task Column */}
        <div className="w-80 sm:w-96 lg:w-[420px] flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-r border-neutral-200 sticky left-0 z-20 bg-neutral-50/95 group-hover/mj:bg-neutral-100/90 transition-colors shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
          <button
            onClick={onToggleMJ}
            className="text-neutral-500 hover:text-neutral-900 flex-shrink-0 p-1 rounded-md hover:bg-neutral-200/70 transition-colors"
            title={expanded ? 'Collapse Phase' : 'Expand Phase'}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>

          {/* Prominent Code Badge */}
          <div
            className="w-5 h-5 rounded-md text-white flex items-center justify-center flex-shrink-0 shadow-2xs text-[10px] font-extrabold"
            style={{ backgroundColor: phaseColor.bg }}
          >
            {mj.code}
          </div>

          <span className="text-[13px] font-bold text-neutral-900 truncate flex-1 tracking-tight" title={mj.name}>
            {mj.name}
          </span>

          {/* Main Job Progress Badge */}
          <span className="text-[11px] font-extrabold text-neutral-700 bg-white px-2 py-0.5 rounded-full border border-neutral-200/90 shadow-2xs ml-auto">
            {mj.progress}%
          </span>
        </div>

        {/* Timeline Canvas Cell */}
        <div className="flex-1 relative border-l border-neutral-200 h-11 bg-white group-hover/mj:bg-neutral-100/70 transition-colors">
          {/* Subtle grid lines */}
          {months.map(({ pct: p }) => (
            <div key={p} className="absolute inset-y-0 border-l border-neutral-100 pointer-events-none" style={{ left: `${p}%` }} />
          ))}

          {/* Milestone guide lines */}
          {milestones.map((m) => {
            const mPct = pct(m.dateStr);
            return (
              <div
                key={`line-${m.id}`}
                className="absolute inset-y-0 border-l border-amber-400/40 pointer-events-none z-10"
                style={{ left: `${mPct}%` }}
              />
            );
          })}

          {/* Today line */}
          <div
            className="absolute inset-y-0 border-l-2 border-dashed border-danger/50 pointer-events-none z-10"
            style={{ left: `${todayPct}%` }}
          />

          {/* Main Job Bar (Prominent, h-6) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-6 rounded-lg flex items-center px-2 cursor-pointer shadow-xs transition-all hover:brightness-105 active:scale-98 z-10 border border-white/20"
            style={{ left: `${startPct}%`, width: `${width}%`, minWidth: 8, background: phaseColor.bg }}
            onMouseMove={(e) =>
              onTooltip({
                x: e.clientX,
                y: e.clientY,
                text: `${mj.code}. ${mj.name}`,
                sub: `Main Project Phase`,
                details: [
                  `Schedule: ${formatDateDisplay(mj.startDate)} to ${formatDateDisplay(mj.finishDate)}`,
                  `Duration: ${mj.duration || Math.max(1, dayOffset(mj.finishDate) - dayOffset(mj.startDate))} days`,
                  `Total Progress: ${mj.progress}% completed`,
                ],
              })
            }
            onMouseLeave={() => onTooltip(null)}
          >
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div className="h-full bg-white/25 rounded-lg" style={{ width: `${Math.min(100, mj.progress)}%` }} />
            </div>
            {width > 6 && (
              <span className="relative text-[10px] text-white font-bold truncate leading-none drop-shadow-2xs">
                {mj.progress}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Level 2: Sub Main Jobs ─── */}
      {expanded &&
        (mj.subMainJobs || []).map((smj: any) => {
          const smjStart = pct(smj.startDate);
          const smjWidth = barWidth(smj.startDate, smj.finishDate);
          const smjExpanded = !!expandedSMJ[smj.id];
          const hasChildren = smj.subtasks && smj.subtasks.length > 0;

          return (
            <div key={smj.id}>
              <div className="flex border-b border-neutral-100 bg-white hover:bg-neutral-50/80 transition-colors group/smj">
                {/* Sticky Task Column */}
                <div className="w-80 sm:w-96 lg:w-[420px] flex-shrink-0 flex items-center gap-2 pl-7 sm:pl-8 pr-3.5 py-2 border-r border-neutral-200 sticky left-0 z-20 bg-white group-hover/smj:bg-neutral-50/80 transition-colors shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                  {/* Expand toggle or spacer */}
                  {hasChildren ? (
                    <button
                      onClick={() => onToggleSMJ(smj.id)}
                      className="text-neutral-400 hover:text-neutral-700 flex-shrink-0 p-0.5 rounded hover:bg-neutral-100 transition-colors"
                      title={smjExpanded ? 'Collapse Sub-tasks' : 'Expand Sub-tasks'}
                    >
                      {smjExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  ) : (
                    <span className="w-4 flex-shrink-0" />
                  )}

                  {/* Level 2 Code Badge */}
                  <div className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10px] font-semibold border border-neutral-200/80 flex-shrink-0">
                    {smj.code}
                  </div>

                  <span className="text-[12px] font-semibold text-neutral-800 truncate flex-1" title={smj.name}>
                    {smj.name}
                  </span>

                  {/* PIC Pill */}
                  <span className="text-[10px] font-medium text-neutral-500 bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200/70 flex-shrink-0 truncate max-w-[85px]">
                    {smj.pic || 'Internal'}
                  </span>

                  {/* Progress */}
                  <span className="text-[10.5px] font-semibold text-neutral-600 ml-1">
                    {smj.progress}%
                  </span>
                </div>

                {/* Timeline Canvas Cell */}
                <div className="flex-1 relative border-l border-neutral-200 h-9 bg-white group-hover/smj:bg-neutral-50/80 transition-colors">
                  {months.map(({ pct: p }) => (
                    <div key={p} className="absolute inset-y-0 border-l border-neutral-100/80 pointer-events-none" style={{ left: `${p}%` }} />
                  ))}

                  {milestones.map((m) => {
                    const mPct = pct(m.dateStr);
                    return (
                      <div
                        key={`line-${m.id}`}
                        className="absolute inset-y-0 border-l border-amber-400/30 pointer-events-none z-10"
                        style={{ left: `${mPct}%` }}
                      />
                    );
                  })}

                  <div
                    className="absolute inset-y-0 border-l-2 border-dashed border-danger/35 pointer-events-none z-10"
                    style={{ left: `${todayPct}%` }}
                  />

                  {/* Sub Main Job Bar (Medium, h-4.5) */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-4.5 rounded-md cursor-pointer shadow-2xs transition-all hover:brightness-105 z-10"
                    style={{ left: `${smjStart}%`, width: `${smjWidth}%`, minWidth: 6, background: phaseColor.bg + 'D8' }}
                    onMouseMove={(e) =>
                      onTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        text: `${smj.code} ${smj.name}`,
                        sub: `Sub Main Job`,
                        details: [
                          `Schedule: ${formatDateDisplay(smj.startDate)} to ${formatDateDisplay(smj.finishDate)}`,
                          `PIC / Division: ${smj.pic || 'Internal'}`,
                          `Progress: ${smj.progress}%`,
                        ],
                      })
                    }
                    onMouseLeave={() => onTooltip(null)}
                  >
                    <div className="absolute inset-0 rounded-md overflow-hidden">
                      <div className="h-full bg-white/30" style={{ width: `${Math.min(100, smj.progress)}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Level 3: Sub-Subtasks (Execution Level) ─── */}
              {smjExpanded &&
                (smj.subtasks || []).map((st: any) => {
                  const stColor = STATUS_COLORS[st.status] || '#94A3B8';
                  const stStart = pct(st.startDate);
                  const stWidth = barWidth(st.startDate, st.finishDate);

                  return (
                    <div
                      key={st.id}
                      className="flex border-b border-neutral-100/60 bg-neutral-50/20 hover:bg-neutral-50/70 transition-colors group/st"
                    >
                      {/* Sticky Task Column */}
                      <div className="w-80 sm:w-96 lg:w-[420px] flex-shrink-0 flex items-center gap-2 pl-12 sm:pl-16 pr-3.5 py-1.5 border-r border-neutral-200 sticky left-0 z-20 bg-neutral-50/30 group-hover/st:bg-neutral-50/70 transition-colors shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        {/* Tree guideline dot */}
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />

                        {/* Mono Code */}
                        <span className="text-[10px] font-mono text-neutral-400 font-bold flex-shrink-0">
                          {st.code}
                        </span>

                        <span className="text-[11.5px] font-normal text-neutral-600 truncate flex-1" title={st.name}>
                          {st.name}
                        </span>

                        {/* Predecessor Badge */}
                        {st.predecessor && (
                          <span className="text-[9px] font-semibold text-brand bg-brand-light border border-brand/20 px-1 py-0.2 rounded flex-shrink-0">
                            {st.depType || 'FS'}{st.lag ? `+${st.lag}` : ''}
                          </span>
                        )}

                        {/* Status indicator */}
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stColor }}
                          title={st.status}
                        />
                      </div>

                      {/* Timeline Canvas Cell */}
                      <div className="flex-1 relative border-l border-neutral-200 h-7 bg-white group-hover/st:bg-neutral-50/70 transition-colors">
                        {months.map(({ pct: p }) => (
                          <div key={p} className="absolute inset-y-0 border-l border-neutral-50 pointer-events-none" style={{ left: `${p}%` }} />
                        ))}

                        <div
                          className="absolute inset-y-0 border-l border-dashed border-danger/25 pointer-events-none z-10"
                          style={{ left: `${todayPct}%` }}
                        />

                        {/* Sub-Subtask Bar (Slim, h-3) */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-3 rounded-xs cursor-pointer shadow-2xs hover:brightness-110 z-10"
                          style={{ left: `${stStart}%`, width: `${stWidth}%`, minWidth: 4, background: stColor }}
                          onMouseMove={(e) =>
                            onTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              text: `${st.code} ${st.name}`,
                              sub: `Task Activity`,
                              details: [
                                `Dates: ${formatDateDisplay(st.startDate)} to ${formatDateDisplay(st.finishDate)} (${st.duration || 0} days)`,
                                `Predecessor: ${st.predecessor || 'None'}`,
                                `Status: ${st.status || 'Open'}`,
                              ],
                            })
                          }
                          onMouseLeave={() => onTooltip(null)}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
    </>
  );
}
