import { useState, useRef, useEffect, useMemo } from 'react';
import { usePage } from '@inertiajs/react';
import { PROJECT, MainJob, SubMainJob, SubSubtask } from '@/data/mockData';
import { PageHeader, Card, Button, StatusBadge } from '@/components/ui';
import { Calendar, ChevronDown, ChevronRight, Layers, Clock, Info, Flag, LayoutGrid, ListTree, Sparkles } from 'lucide-react';

// Curated phase colors matching professional project schedule diagrams
const PHASE_COLORS = [
  { bg: '#2563EB', text: '#FFFFFF', light: '#EFF6FF', border: '#1D4ED8', name: 'Blue' },      // 1. BusDev
  { bg: '#DC2626', text: '#FFFFFF', light: '#FEF2F2', border: '#B91C1C', name: 'Red' },       // 2. Factory Layout
  { bg: '#16A34A', text: '#FFFFFF', light: '#F0FDF4', border: '#15803D', name: 'Green' },     // 3. Civil Works
  { bg: '#D97706', text: '#FFFFFF', light: '#FFFBEB', border: '#B45309', name: 'Amber' },     // 4. Machinery
  { bg: '#7C3AED', text: '#FFFFFF', light: '#F5F3FF', border: '#6D28D9', name: 'Purple' },    // 5. Utilities
  { bg: '#0D9488', text: '#FFFFFF', light: '#F0FDFA', border: '#0F766E', name: 'Teal' },      // 6. Purchasing
  { bg: '#EA580C', text: '#FFFFFF', light: '#FFF7ED', border: '#C2410C', name: 'Orange' },    // 7. Raw Material
  { bg: '#0284C7', text: '#FFFFFF', light: '#F0F9FF', border: '#0369A1', name: 'Sky' },       // 8. Piping
  { bg: '#4F46E5', text: '#FFFFFF', light: '#EEF2FF', border: '#4338CA', name: 'Indigo' },    // 9. Electrical/PLN
  { bg: '#9333EA', text: '#FFFFFF', light: '#FAF5FF', border: '#7E22CE', name: 'Fuchsia' },   // 10. Waste/SHE
  { bg: '#059669', text: '#FFFFFF', light: '#ECFDF5', border: '#047857', name: 'Emerald' },   // 11. Permits/Legal
  { bg: '#E11D48', text: '#FFFFFF', light: '#FFF1F2', border: '#BE123C', name: 'Rose' },      // 12. HRGA/People
  { bg: '#CA8A04', text: '#FFFFFF', light: '#FEFCE8', border: '#A16207', name: 'Yellow' },    // 13. Trial Runs
  { bg: '#475569', text: '#FFFFFF', light: '#F8FAFC', border: '#334155', name: 'Slate' },     // 14. Mass Production
  { bg: '#0891B2', text: '#FFFFFF', light: '#ECFEFF', border: '#0E7490', name: 'Cyan' },      // 15. Sales
  { bg: '#65A30D', text: '#FFFFFF', light: '#F7FEE7', border: '#4D7C0F', name: 'Lime' },      // 16. Commissioning
  { bg: '#4338CA', text: '#FFFFFF', light: '#EEF2FF', border: '#3730A3', name: 'DarkIndigo' },// 17. Certifications
];

const STATUS_COLORS: Record<string, string> = {
  'Completed': '#1E46D9',
  'On Track': '#16A34A',
  'At Risk': '#D97706',
  'Delayed': '#DC3545',
  'Open': '#94A3B8',
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

  // View Mode: 'phase-grouped' (model gambar referensi user) or 'wbs-tree' (hierarki pohon)
  const [viewMode, setViewMode] = useState<'phase-grouped' | 'wbs-tree'>('phase-grouped');

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
    let count = 0;
    while (d <= pEnd && count < 100) {
      count++;
      const p = ((d.getTime() - pStart.getTime()) / 86400000 / TOTAL_DAYS) * 100;
      if (p >= 0 && p <= 100) {
        markers.push({
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
          pct: p,
        });
      }
      d.setMonth(d.getMonth() + 2);
    }
    return markers;
  }, [pStart, pEnd, TOTAL_DAYS]);

  // Key Project Milestones
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; subtitle?: string; details?: string[] } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayPct = Math.max(0, Math.min(100, ((TODAY.getTime() - pStart.getTime()) / 86400000 / TOTAL_DAYS) * 100));

  const toggleAll = (expand: boolean) => {
    const newMJ: Record<string, boolean> = {};
    const newSMJ: Record<string, boolean> = {};
    if (expand && projectData?.mainJobs) {
      projectData.mainJobs.forEach((m: any) => {
        newMJ[m.id] = true;
        (m.subMainJobs || []).forEach((s: any) => { newSMJ[s.id] = true; });
      });
    }
    setExpandedMJ(newMJ);
    setExpandedSMJ(newSMJ);
  };

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Timeline / Gantt Schedule"
        subtitle={`Visualisasi jadwal proyek (${projectData.name || 'Project'}) dengan pengelompokan fase & milestone`}
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-neutral-100 p-1 rounded-lg border border-neutral-200">
              <button
                onClick={() => setViewMode('phase-grouped')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'phase-grouped'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Phase Grouped (Model Gambar)</span>
              </button>
              <button
                onClick={() => setViewMode('wbs-tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'wbs-tree'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <ListTree size={14} />
                <span>WBS Tree</span>
              </button>
            </div>

            {viewMode === 'wbs-tree' && (
              <>
                <Button variant="outline" size="sm" onClick={() => toggleAll(true)} className="text-[12px]">
                  Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleAll(false)} className="text-[12px]">
                  Collapse All
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Legend & Milestone Indicator */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-neutral-200 shadow-xs">
        <div className="flex items-center gap-4 flex-wrap text-[12px] text-neutral-600">
          <span className="font-semibold text-neutral-500 uppercase tracking-wide text-[11px] flex items-center gap-1">
            <Sparkles size={13} className="text-brand" />
            Phase Color Coding:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {(projectData?.mainJobs || []).slice(0, 6).map((mj: any, idx: number) => {
              const color = PHASE_COLORS[idx % PHASE_COLORS.length];
              return (
                <div key={mj.id} className="flex items-center gap-1.5 text-[11.5px] font-medium">
                  <span className="w-2.5 h-2.5 rounded-xs shadow-2xs" style={{ background: color.bg }} />
                  <span className="text-neutral-700 truncate max-w-[120px]">{mj.name}</span>
                </div>
              );
            })}
            {(projectData?.mainJobs?.length || 0) > 6 && (
              <span className="text-[11px] text-neutral-400 font-medium">
                +{projectData.mainJobs.length - 6} fase lainnya
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-neutral-700 bg-neutral-50 px-2.5 py-1 rounded-md border border-neutral-200">
            <Flag size={12} className="text-neutral-500" />
            <span>Vertical Lines = Milestones Target</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-danger bg-danger-light/50 px-2.5 py-1 rounded-md border border-danger/20">
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
            <span>Today: {TODAY.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Gantt Schedule Canvas */}
      {viewMode === 'phase-grouped' ? (
        /* ─── MODEL GAMBAR: PHASE GROUPED GANTT CHART ─── */
        <Card className="overflow-hidden border border-neutral-200 shadow-sm">
          <div className="overflow-x-auto scrollbar-thin" ref={containerRef}>
            <div style={{ minWidth: 1100 }}>
              {/* Top Axis Header */}
              <div className="flex border-b border-neutral-300 bg-neutral-100/90 sticky top-0 z-30">
                {/* Column 1: Phase Group */}
                <div className="w-40 sm:w-48 flex-shrink-0 px-3 py-2.5 font-bold text-[11px] text-neutral-700 uppercase tracking-wider border-r border-neutral-300 flex items-center justify-center text-center bg-neutral-100">
                  Phase / Group
                </div>
                {/* Column 2: Task Activity */}
                <div className="w-56 sm:w-64 flex-shrink-0 px-4 py-2.5 font-bold text-[11px] text-neutral-700 uppercase tracking-wider border-r border-neutral-300 flex items-center bg-neutral-100">
                  Task / Activity
                </div>
                {/* Column 3: Timeline Axis & Milestones */}
                <div className="flex-1 relative h-12 bg-neutral-50">
                  {/* Month Markers */}
                  {months.map(({ label, pct: p }) => (
                    <div key={label} className="absolute top-0 bottom-0 flex flex-col justify-end pb-1.5" style={{ left: `${p}%` }}>
                      <div className="h-3 border-l border-neutral-300" />
                      <span className="text-[10px] font-bold text-neutral-600 whitespace-nowrap pl-1">{label}</span>
                    </div>
                  ))}

                  {/* Milestones in Axis Header */}
                  {milestones.map((m) => {
                    const mPct = pct(m.dateStr);
                    return (
                      <div
                        key={m.id}
                        className="absolute top-0 bottom-0 flex flex-col items-center z-20 pointer-events-none"
                        style={{ left: `${mPct}%` }}
                      >
                        <div className="bg-neutral-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs text-center leading-tight whitespace-nowrap -translate-x-1/2 mt-1 border border-neutral-700">
                          <div>{m.name}</div>
                          <div className="text-[8px] font-mono text-neutral-300">{new Date(m.dateStr).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Today Marker in Axis Header */}
                  <div
                    className="absolute top-0 bottom-0 flex flex-col items-center z-20 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                  >
                    <span className="bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs -translate-x-1/2 mt-1">
                      Today
                    </span>
                  </div>
                </div>
              </div>

              {/* Rows Grouped by Phase (Main Job) */}
              <div className="relative">
                {/* Global Vertical Milestone Lines running across entire chart */}
                {milestones.map((m) => {
                  const mPct = pct(m.dateStr);
                  return (
                    <div
                      key={`line-${m.id}`}
                      className="absolute inset-y-0 border-l-2 border-neutral-400/80 z-10 pointer-events-none"
                      style={{ left: `calc(${mPct}% + 424px)` }}
                    />
                  );
                })}

                {/* Global Vertical Today Line */}
                <div
                  className="absolute inset-y-0 border-l-2 border-danger/60 border-dashed z-10 pointer-events-none"
                  style={{ left: `calc(${todayPct}% + 424px)` }}
                />

                {/* Phase Sections */}
                {(projectData?.mainJobs || []).map((mj: any, mjIdx: number) => {
                  const color = PHASE_COLORS[mjIdx % PHASE_COLORS.length];
                  // Tasks to display under this phase:
                  // Either subMainJobs, or flatten all tasks under subMainJobs if present
                  const items = (mj.subMainJobs && mj.subMainJobs.length > 0)
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
                    <div key={mj.id} className="flex border-b-2 border-neutral-200 group/phase">
                      {/* Left Column: Phase Group Box spanning all items in this phase */}
                      <div
                        className="w-40 sm:w-48 flex-shrink-0 flex flex-col items-center justify-center p-3 border-r border-neutral-200 text-center relative select-none"
                        style={{ backgroundColor: color.light }}
                      >
                        <div
                          className="w-full text-center px-2 py-1.5 rounded-lg border shadow-xs"
                          style={{ borderColor: color.border, backgroundColor: 'white' }}
                        >
                          <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: color.bg }}>
                            Fase {mj.code}
                          </div>
                          <div className="text-[12px] font-bold text-neutral-800 leading-tight mt-0.5 line-clamp-2">
                            {mj.name}
                          </div>
                          <div className="text-[10.5px] font-semibold text-neutral-500 mt-1">
                            Progres: {mj.progress}%
                          </div>
                        </div>
                      </div>

                      {/* Right Columns: Tasks List + Gantt Chart Area */}
                      <div className="flex-1 divide-y divide-neutral-100">
                        {items.map((item: any) => {
                          const itemStart = item.startDate || mj.startDate || '2026-09-01';
                          const itemEnd = item.finishDate || mj.finishDate || '2027-09-30';
                          const startPos = pct(itemStart);
                          const widthPos = barWidth(itemStart, itemEnd);

                          return (
                            <div key={item.id} className="flex h-10 hover:bg-neutral-50/80 transition-colors">
                              {/* Task / Activity Column */}
                              <div className="w-56 sm:w-64 flex-shrink-0 px-3.5 flex items-center justify-between border-r border-neutral-200 bg-white">
                                <div className="truncate text-[12px] font-semibold text-neutral-800 flex items-center gap-1.5 pr-1" title={item.name}>
                                  <span className="text-[10.5px] font-mono text-neutral-400 font-bold">{item.code}</span>
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="text-[9.5px] font-medium text-neutral-500 bg-neutral-100 px-1 py-0.2 rounded border border-neutral-200 flex-shrink-0">
                                  {item.pic || 'Internal'}
                                </span>
                              </div>

                              {/* Gantt Canvas Area */}
                              <div className="flex-1 relative h-full bg-white">
                                {/* Grid column guide lines */}
                                {months.map(({ pct: p }) => (
                                  <div
                                    key={p}
                                    className="absolute inset-y-0 border-l border-neutral-100"
                                    style={{ left: `${p}%` }}
                                  />
                                ))}

                                {/* Gantt Bar */}
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 cursor-pointer shadow-xs transition-transform hover:scale-y-110 active:scale-95"
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
                                      subtitle: `Fase: ${mj.name}`,
                                      details: [
                                        `Jadwal: ${itemStart} s/d ${itemEnd}`,
                                        `Durasi: ${item.duration || Math.max(1, dayOffset(itemEnd) - dayOffset(itemStart))} hari`,
                                        `PIC / Divisi: ${item.pic || 'Internal'}`,
                                        `Progres: ${item.progress || 0}% (${item.status || 'Open'})`,
                                      ],
                                    })
                                  }
                                  onMouseLeave={() => setTooltip(null)}
                                >
                                  {/* Progress fill inside the bar */}
                                  {item.progress > 0 && (
                                    <div
                                      className="absolute inset-0 rounded-md bg-white/25 overflow-hidden"
                                      style={{ width: `${item.progress}%` }}
                                    />
                                  )}
                                  {widthPos > 5 && (
                                    <span className="relative text-[10px] text-white font-bold truncate leading-none drop-shadow-xs">
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

                {(!projectData?.mainJobs || projectData.mainJobs.length === 0) && (
                  <div className="p-12 text-center text-neutral-500 text-sm">
                    Belum ada data WBS untuk timeline project ini.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* ─── MODEL HIERARKI: WBS TREE VIEW (ORIGINAL MODE) ─── */
        <Card className="overflow-hidden border border-neutral-200 shadow-sm">
          <div className="overflow-x-auto scrollbar-thin" ref={containerRef}>
            <div style={{ minWidth: 1050 }}>
              {/* Header: Task column + timeline axis */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 sticky top-0 z-20">
                <div className="w-72 lg:w-84 flex-shrink-0 px-4 py-2.5 flex items-center justify-between border-r border-neutral-200">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">WBS Element / Task</span>
                  <span className="text-[10px] text-neutral-400 font-medium">PIC / Dep</span>
                </div>
                <div className="flex-1 relative h-9">
                  {months.map(({ label, pct: p }) => (
                    <div key={label} className="absolute top-0 bottom-0 flex flex-col justify-center" style={{ left: `${p}%` }}>
                      <div className="h-3 border-l border-neutral-300" />
                      <span className="text-[10px] font-semibold text-neutral-400 whitespace-nowrap pl-1">{label}</span>
                    </div>
                  ))}
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-danger border-dashed z-20 flex flex-col items-center"
                    style={{ left: `${todayPct}%` }}
                  >
                    <span className="bg-danger text-white text-[9px] font-bold px-1 rounded-xs -translate-y-0.5">
                      Today
                    </span>
                  </div>
                </div>
              </div>

              {/* Rows */}
              {projectData?.mainJobs && projectData.mainJobs.length > 0 ? (
                projectData.mainJobs.map((mj: any, mjIdx: number) => (
                  <GanttTreeMJ
                    key={mj.id}
                    mj={mj}
                    phaseColor={PHASE_COLORS[mjIdx % PHASE_COLORS.length]}
                    expanded={!!expandedMJ[mj.id]}
                    expandedSMJ={expandedSMJ}
                    onToggleMJ={() => setExpandedMJ((p) => ({ ...p, [mj.id]: !p[mj.id] }))}
                    onToggleSMJ={(smjId) => setExpandedSMJ((p) => ({ ...p, [smjId]: !p[smjId] }))}
                    todayPct={todayPct}
                    onTooltip={(t) =>
                      t
                        ? setTooltip({
                            x: t.x,
                            y: t.y,
                            title: t.text,
                            subtitle: t.sub,
                          })
                        : setTooltip(null)
                    }
                    pct={pct}
                    barWidth={barWidth}
                  />
                ))
              ) : (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  Belum ada data WBS untuk timeline project ini.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Floating Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-neutral-900/95 backdrop-blur-xs text-white text-[12px] px-3.5 py-2.5 rounded-lg shadow-xl pointer-events-none border border-neutral-700 max-w-sm"
          style={{ left: Math.min(window.innerWidth - 260, tooltip.x + 14), top: tooltip.y - 55 }}
        >
          <div className="font-bold text-neutral-100">{tooltip.title}</div>
          {tooltip.subtitle && <div className="text-[11px] text-neutral-400 mt-0.5">{tooltip.subtitle}</div>}
          {tooltip.details && (
            <div className="mt-2 pt-2 border-t border-neutral-700/80 space-y-0.5 text-[11px] text-neutral-300">
              {tooltip.details.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sub-component for WBS Tree mode
 */
function GanttTreeMJ({
  mj,
  phaseColor,
  expanded,
  expandedSMJ,
  onToggleMJ,
  onToggleSMJ,
  todayPct,
  onTooltip,
  pct,
  barWidth,
}: {
  mj: any;
  phaseColor: { bg: string; text: string; light: string; border: string };
  expanded: boolean;
  expandedSMJ: Record<string, boolean>;
  onToggleMJ: () => void;
  onToggleSMJ: (id: string) => void;
  todayPct: number;
  onTooltip: (t: { x: number; y: number; text: string; sub?: string } | null) => void;
  pct: (dateStr: string) => number;
  barWidth: (start: string, end: string) => number;
}) {
  const startPct = pct(mj.startDate);
  const width = barWidth(mj.startDate, mj.finishDate);

  return (
    <>
      {/* Main Job Row (Level 1) */}
      <div className="flex border-b border-neutral-200/80 bg-white hover:bg-neutral-50/70 transition-colors group">
        <div className="w-72 lg:w-84 flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-r border-neutral-200">
          <button onClick={onToggleMJ} className="text-neutral-400 hover:text-neutral-700 flex-shrink-0 p-0.5">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div
            className="w-5 h-5 rounded text-white flex items-center justify-center flex-shrink-0 shadow-xs text-[9.5px] font-bold"
            style={{ backgroundColor: phaseColor.bg }}
          >
            {mj.code}
          </div>
          <span className="text-[12.5px] font-bold text-neutral-900 truncate flex-1">{mj.name}</span>
          <span className="text-[11px] font-bold text-neutral-600 ml-1">{mj.progress}%</span>
        </div>

        <div className="flex-1 relative border-l border-neutral-200 h-10">
          {[25, 50, 75].map((q) => (
            <div key={q} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: `${q}%` }} />
          ))}
          <div className="absolute inset-y-0 border-l-2 border-dashed border-danger/40 z-10" style={{ left: `${todayPct}%` }} />

          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md flex items-center px-2 cursor-pointer shadow-xs transition-opacity hover:opacity-95"
            style={{ left: `${startPct}%`, width: `${width}%`, minWidth: 6, background: phaseColor.bg }}
            onMouseMove={(e) =>
              onTooltip({
                x: e.clientX,
                y: e.clientY,
                text: `${mj.code}. ${mj.name}`,
                sub: `Jadwal: ${mj.startDate} → ${mj.finishDate} (${mj.progress}% selesai)`,
              })
            }
            onMouseLeave={() => onTooltip(null)}
          >
            <div className="absolute inset-0 rounded-md overflow-hidden">
              <div className="h-full bg-white/30 rounded-md" style={{ width: `${mj.progress}%` }} />
            </div>
            <span className="relative text-[10px] text-white font-bold truncate leading-none">{mj.progress}%</span>
          </div>
        </div>
      </div>

      {/* Sub Main Jobs (Level 2) */}
      {expanded &&
        (mj.subMainJobs || []).map((smj: any) => {
          const smjStart = pct(smj.startDate);
          const smjWidth = barWidth(smj.startDate, smj.finishDate);
          const smjExpanded = !!expandedSMJ[smj.id];

          return (
            <div key={smj.id}>
              <div className="flex border-b border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors">
                <div className="w-72 lg:w-84 flex-shrink-0 flex items-center gap-2 pl-8 pr-3.5 py-2 border-r border-neutral-200">
                  {smj.subtasks && smj.subtasks.length > 0 ? (
                    <button onClick={() => onToggleSMJ(smj.id)} className="text-neutral-400 hover:text-neutral-700 flex-shrink-0 p-0.5">
                      {smjExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  ) : (
                    <span className="w-3.5 flex-shrink-0" />
                  )}
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-neutral-200/80">
                    <span className="text-[8.5px] font-bold text-neutral-600">{smj.code}</span>
                  </div>
                  <span className="text-[11.5px] font-semibold text-neutral-700 truncate flex-1">{smj.name}</span>
                  <span className="text-[10px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200 flex-shrink-0">
                    {smj.pic}
                  </span>
                </div>

                <div className="flex-1 relative border-l border-neutral-200 h-8">
                  {[25, 50, 75].map((q) => (
                    <div key={q} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: `${q}%` }} />
                  ))}
                  <div className="absolute inset-y-0 border-l-2 border-dashed border-danger/30" style={{ left: `${todayPct}%` }} />

                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded cursor-pointer shadow-2xs"
                    style={{ left: `${smjStart}%`, width: `${smjWidth}%`, minWidth: 6, background: phaseColor.bg + 'D9' }}
                    onMouseMove={(e) =>
                      onTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        text: `${smj.code} ${smj.name}`,
                        sub: `PIC: ${smj.pic} | ${smj.startDate} → ${smj.finishDate} (${smj.progress}%)`,
                      })
                    }
                    onMouseLeave={() => onTooltip(null)}
                  >
                    <div className="absolute inset-0 rounded overflow-hidden">
                      <div className="h-full bg-white/35" style={{ width: `${smj.progress}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Subtasks (Level 3) */}
              {smjExpanded &&
                (smj.subtasks || []).map((st: any) => {
                  const stColor = STATUS_COLORS[st.status] || '#94A3B8';
                  const stStart = pct(st.startDate);
                  const stWidth = barWidth(st.startDate, st.finishDate);

                  return (
                    <div key={st.id} className="flex border-b border-neutral-50 bg-white hover:bg-neutral-50/50 transition-colors">
                      <div className="w-72 lg:w-84 flex-shrink-0 flex items-center gap-2 pl-14 pr-3.5 py-1.5 border-r border-neutral-200">
                        <span className="text-[9px] font-mono text-neutral-400 font-bold">{st.code}</span>
                        <span className="text-[11px] text-neutral-600 truncate flex-1">{st.name}</span>
                        {st.predecessor && (
                          <span className="text-[9.5px] font-medium text-brand bg-brand-light px-1 py-0.2 rounded flex-shrink-0">
                            {st.depType || 'FS'}{st.lag ? `+${st.lag}` : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 relative border-l border-neutral-200 h-6">
                        {[25, 50, 75].map((q) => (
                          <div key={q} className="absolute inset-y-0 border-l border-neutral-50" style={{ left: `${q}%` }} />
                        ))}
                        <div className="absolute inset-y-0 border-l border-dashed border-danger/20" style={{ left: `${todayPct}%` }} />

                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-xs cursor-pointer"
                          style={{ left: `${stStart}%`, width: `${stWidth}%`, minWidth: 4, background: stColor }}
                          onMouseMove={(e) =>
                            onTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              text: `${st.code} ${st.name}`,
                              sub: `Dates: ${st.startDate} → ${st.finishDate} (${st.duration}d) | Pred: ${st.predecessor || 'None'}`,
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
