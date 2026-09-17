import { useState, useRef } from 'react';
import { PROJECT, MainJob, SubMainJob, SubSubtask } from '@/data/mockData';
import { PageHeader, Card, Button } from '@/components/ui';
import { Calendar, ChevronDown, ChevronRight, Layers, Clock, Info } from 'lucide-react';

const PROJECT_START = new Date('2024-01-15');
const PROJECT_END = new Date('2026-12-31');
const TOTAL_DAYS = Math.ceil((PROJECT_END.getTime() - PROJECT_START.getTime()) / 86400000);
const TODAY = new Date('2026-09-17');

function dayOffset(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - PROJECT_START.getTime()) / 86400000);
}

function pct(dateStr: string): number {
  return Math.max(0, Math.min(100, (dayOffset(dateStr) / TOTAL_DAYS) * 100));
}

function barWidth(start: string, end: string): number {
  return Math.max(0.6, Math.min(100, (dayOffset(end) - dayOffset(start)) / TOTAL_DAYS * 100));
}

const STATUS_COLORS: Record<string, string> = {
  'Completed': '#1E46D9',
  'On Track': '#16A34A',
  'At Risk': '#D97706',
  'Delayed': '#DC3545',
  'Open': '#94A3B8',
  'Cancelled': '#CBD5E1',
};

function getMonthMarkers() {
  const markers: { label: string; pct: number }[] = [];
  const d = new Date(PROJECT_START);
  d.setDate(1);
  while (d <= PROJECT_END) {
    const p = ((d.getTime() - PROJECT_START.getTime()) / 86400000 / TOTAL_DAYS) * 100;
    if (p >= 0 && p <= 100) {
      markers.push({
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        pct: p,
      });
    }
    d.setMonth(d.getMonth() + 3);
  }
  return markers;
}

export default function TimelinePage() {
  const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({ 'mj-01': true, 'mj-04': true });
  const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({ 'smj-4-5': true });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; sub?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const months = getMonthMarkers();
  const todayPct = ((TODAY.getTime() - PROJECT_START.getTime()) / 86400000 / TOTAL_DAYS) * 100;

  const toggleAll = (expand: boolean) => {
    const newMJ: Record<string, boolean> = {};
    const newSMJ: Record<string, boolean> = {};
    if (expand) {
      PROJECT.mainJobs.forEach(m => {
        newMJ[m.id] = true;
        m.subMainJobs.forEach(s => { newSMJ[s.id] = true; });
      });
    }
    setExpandedMJ(newMJ);
    setExpandedSMJ(newSMJ);
  };

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Timeline / Gantt Schedule"
        subtitle="Project schedule visualization supporting FS, SS, FF, SF dependencies"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(true)} className="text-[12px]">
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleAll(false)} className="text-[12px]">
              Collapse All
            </Button>
          </div>
        }
      />

      {/* Legend & Current Date Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-neutral-200 shadow-xs">
        <div className="flex items-center gap-3.5 flex-wrap text-[12px] text-neutral-600">
          <span className="font-semibold text-neutral-500 uppercase tracking-wide text-[11px]">Legend:</span>
          {[
            { color: '#1E46D9', label: 'Completed' },
            { color: '#16A34A', label: 'On Track' },
            { color: '#D97706', label: 'At Risk' },
            { color: '#DC3545', label: 'Delayed' },
            { color: '#94A3B8', label: 'Open' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-xs" style={{ background: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[12px] font-semibold text-neutral-700 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200">
          <span className="w-2 h-2 rounded-full bg-danger ring-2 ring-danger/20" />
          <span>Current Timeline: {TODAY.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Gantt Card */}
      <Card className="overflow-hidden">
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
                {/* Today Marker in Axis Header */}
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
            {PROJECT.mainJobs.map(mj => (
              <GanttMJ
                key={mj.id}
                mj={mj}
                expanded={!!expandedMJ[mj.id]}
                expandedSMJ={expandedSMJ}
                onToggleMJ={() => setExpandedMJ(p => ({ ...p, [mj.id]: !p[mj.id] }))}
                onToggleSMJ={(smjId) => setExpandedSMJ(p => ({ ...p, [smjId]: !p[smjId] }))}
                todayPct={todayPct}
                onTooltip={setTooltip}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Floating Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-neutral-900/95 backdrop-blur-xs text-white text-[12px] px-3.5 py-2.5 rounded-lg shadow-xl pointer-events-none border border-neutral-700 max-w-xs"
          style={{ left: Math.min(window.innerWidth - 220, tooltip.x + 14), top: tooltip.y - 45 }}
        >
          <div className="font-bold text-neutral-100">{tooltip.text}</div>
          {tooltip.sub && <div className="text-[11px] text-neutral-400 mt-1">{tooltip.sub}</div>}
        </div>
      )}
    </div>
  );
}

function GanttMJ({
  mj, expanded, expandedSMJ, onToggleMJ, onToggleSMJ, todayPct, onTooltip
}: {
  mj: MainJob;
  expanded: boolean;
  expandedSMJ: Record<string, boolean>;
  onToggleMJ: () => void;
  onToggleSMJ: (id: string) => void;
  todayPct: number;
  onTooltip: (t: { x: number; y: number; text: string; sub?: string } | null) => void;
}) {
  const color = STATUS_COLORS[mj.status] || '#94A3B8';
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
          <div className="w-5 h-5 rounded bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs">
            <span className="text-[9.5px] font-bold">{mj.code}</span>
          </div>
          <span className="text-[12.5px] font-bold text-neutral-900 truncate flex-1">{mj.name}</span>
          <span className="text-[11px] font-bold text-neutral-600 ml-1">{mj.progress}%</span>
        </div>

        <div className="flex-1 relative border-l border-neutral-200 h-10">
          {/* Quarter lines */}
          {[25, 50, 75].map(q => (
            <div key={q} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: `${q}%` }} />
          ))}
          {/* Today line */}
          <div className="absolute inset-y-0 border-l-2 border-dashed border-danger/40 z-10" style={{ left: `${todayPct}%` }} />
          
          {/* Main Job Bar */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md flex items-center px-2 cursor-pointer shadow-xs transition-opacity hover:opacity-95"
            style={{ left: `${startPct}%`, width: `${width}%`, minWidth: 6, background: color }}
            onMouseMove={e => onTooltip({
              x: e.clientX,
              y: e.clientY,
              text: `${mj.code}. ${mj.name}`,
              sub: `Schedule: ${mj.startDate} → ${mj.finishDate} (${mj.progress}% completed)`,
            })}
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
      {expanded && mj.subMainJobs.map(smj => {
        const smjColor = STATUS_COLORS[smj.status] || '#94A3B8';
        const smjStart = pct(smj.startDate);
        const smjWidth = barWidth(smj.startDate, smj.finishDate);
        const smjExpanded = !!expandedSMJ[smj.id];

        return (
          <div key={smj.id}>
            <div className="flex border-b border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors">
              <div className="w-72 lg:w-84 flex-shrink-0 flex items-center gap-2 pl-8 pr-3.5 py-2 border-r border-neutral-200">
                {smj.subtasks.length > 0 ? (
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
                {[25, 50, 75].map(q => (
                  <div key={q} className="absolute inset-y-0 border-l border-neutral-100" style={{ left: `${q}%` }} />
                ))}
                <div className="absolute inset-y-0 border-l-2 border-dashed border-danger/30" style={{ left: `${todayPct}%` }} />
                
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded cursor-pointer shadow-2xs"
                  style={{ left: `${smjStart}%`, width: `${smjWidth}%`, minWidth: 6, background: smjColor }}
                  onMouseMove={e => onTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    text: `${smj.code} ${smj.name}`,
                    sub: `PIC: ${smj.pic} | ${smj.startDate} → ${smj.finishDate} (${smj.progress}%)`,
                  })}
                  onMouseLeave={() => onTooltip(null)}
                >
                  <div className="absolute inset-0 rounded overflow-hidden">
                    <div className="h-full bg-white/35" style={{ width: `${smj.progress}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Subtasks (Level 3) */}
            {smjExpanded && smj.subtasks.map(st => {
              const stColor = STATUS_COLORS[st.status] || '#94A3B8';
              const stStart = pct(st.startDate);
              const stWidth = barWidth(st.startDate, st.finishDate);

              return (
                <div key={st.id} className="flex border-b border-neutral-50 bg-white hover:bg-neutral-50/50 transition-colors">
                  <div className="w-72 lg:w-84 flex-shrink-0 flex items-center gap-2 pl-14 pr-3.5 py-1.5 border-r border-neutral-200">
                    <span className="text-[9px] font-mono text-neutral-400 font-bold">{st.code}</span>
                    <span className="text-[11px] text-neutral-600 truncate flex-1">{st.name}</span>
                    {st.predecessor && (
                      <span className="text-[9.5px] font-medium text-brand bg-brand-light px-1 py-0.2 rounded flex-shrink-0" title={`Predecessor: ${st.predecessor} (${st.depType || 'FS'}${st.lag ? ` +${st.lag}d` : ''})`}>
                        {st.depType || 'FS'}{st.lag ? `+${st.lag}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 relative border-l border-neutral-200 h-6">
                    {[25, 50, 75].map(q => (
                      <div key={q} className="absolute inset-y-0 border-l border-neutral-50" style={{ left: `${q}%` }} />
                    ))}
                    <div className="absolute inset-y-0 border-l border-dashed border-danger/20" style={{ left: `${todayPct}%` }} />

                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-xs cursor-pointer"
                      style={{ left: `${stStart}%`, width: `${stWidth}%`, minWidth: 4, background: stColor + 'D9' }}
                      onMouseMove={e => onTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        text: `${st.code} ${st.name}`,
                        sub: `Dates: ${st.startDate} → ${st.finishDate} (${st.duration}d) | Pred: ${st.predecessor || 'None'} (${st.depType || 'FS'}${st.lag ? ` +${st.lag}d` : ''})`,
                      })}
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
