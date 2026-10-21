import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePage, Link } from '@inertiajs/react';
import { PageHeader, Card, Button, formatDateDisplay, formatDivisionName, StatusBadge } from '@/components/ui';
import {
  Calendar, ChevronDown, ChevronRight, ChevronLeft, Flag,
  LayoutGrid, ListTree, CheckCircle2, Clock,
  Maximize2, Minimize2, Search, X, Filter, RotateCcw, Info,
  FolderOpen, Layers
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

const STATUS_COLOR_BARS: Record<string, string> = {
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
  progress?: number;
}

type PeriodScale = 'all' | 'quarter' | 'month';

/**
 * Robust date parser that prevents UTC-to-local timezone drift.
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const clean = String(dateStr).trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Calculates exact calendar day difference without daylight saving or hour drift.
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86400000;
  const utc1 = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utc2 = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((utc2 - utc1) / msPerDay);
}

export default function TimelinePage() {
  const pageProps = usePage().props as any;
  const project = pageProps?.project;

  const [projectData, setProjectData] = useState<any>(() => project || null);

  useEffect(() => {
    if (project) {
      setProjectData(project);
    }
  }, [project]);

  // View Mode: 'phase-view' (grouped by phase) or 'wbs-tree' (hierarchical tree)
  const [viewMode, setViewMode] = useState<'phase-view' | 'wbs-tree'>('phase-view');
  const [showAllPhases, setShowAllPhases] = useState(false);

  // Period / Date Range State (100% Data-Driven)
  const [periodScale, setPeriodScale] = useState<PeriodScale>('all');
  const [periodAnchor, setPeriodAnchor] = useState<Date>(() => new Date());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('All');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Expand / collapse for WBS Tree mode
  const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({ 'mj-1': true, 'mj-2': true, 'mj-3': true });
  const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({});

  // Tooltip
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle?: string;
    details?: string[];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Extract Real Schedule Bounds from Project and Task Data ──────────
  const { pStart, pEnd, totalProjectDays } = useMemo(() => {
    if (!projectData) {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { pStart: s, pEnd: e, totalProjectDays: 30 };
    }

    const allDates: number[] = [];

    const dStart = parseDate(projectData.startDate);
    if (dStart) allDates.push(dStart.getTime());

    const dEnd = parseDate(projectData.endDate);
    if (dEnd) allDates.push(dEnd.getTime());

    (projectData.mainJobs || []).forEach((mj: any) => {
      const ms = parseDate(mj.startDate);
      const mf = parseDate(mj.finishDate);
      if (ms) allDates.push(ms.getTime());
      if (mf) allDates.push(mf.getTime());

      (mj.subMainJobs || []).forEach((smj: any) => {
        const sms = parseDate(smj.startDate);
        const smf = parseDate(smj.finishDate);
        if (sms) allDates.push(sms.getTime());
        if (smf) allDates.push(smf.getTime());

        (smj.subtasks || []).forEach((st: any) => {
          const sts = parseDate(st.startDate);
          const stf = parseDate(st.finishDate);
          if (sts) allDates.push(sts.getTime());
          if (stf) allDates.push(stf.getTime());
        });
      });
    });

    if (allDates.length === 0) {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { pStart: s, pEnd: e, totalProjectDays: Math.max(1, daysBetween(s, e) + 1) };
    }

    const minTime = Math.min(...allDates);
    const maxTime = Math.max(...allDates);

    const minD = new Date(minTime);
    const maxD = new Date(maxTime);

    // Align start to 1st of that month and end to last day of finish month
    const start = new Date(minD.getFullYear(), minD.getMonth(), 1);
    const end = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0);

    const span = Math.max(1, daysBetween(start, end) + 1);
    return { pStart: start, pEnd: end, totalProjectDays: span };
  }, [projectData]);

  // Keep periodAnchor initialized to project start or today
  useEffect(() => {
    if (pStart) {
      setPeriodAnchor(pStart);
    }
  }, [pStart]);

  // ─── Active Period Window Bounds ─────────────────────────────────────
  const { windowStart, windowEnd, totalWindowDays, periodLabel, isPrevDisabled, isNextDisabled } = useMemo(() => {
    let wStart: Date;
    let wEnd: Date;

    if (periodScale === 'all') {
      wStart = new Date(pStart);
      wEnd = new Date(pEnd);
    } else if (periodScale === 'quarter') {
      // 3-month window starting from periodAnchor's quarter
      const qStartMonth = Math.floor(periodAnchor.getMonth() / 3) * 3;
      wStart = new Date(periodAnchor.getFullYear(), qStartMonth, 1);
      wEnd = new Date(periodAnchor.getFullYear(), qStartMonth + 3, 0);
    } else {
      // 1-month window
      wStart = new Date(periodAnchor.getFullYear(), periodAnchor.getMonth(), 1);
      wEnd = new Date(periodAnchor.getFullYear(), periodAnchor.getMonth() + 1, 0);
    }

    const span = Math.max(1, daysBetween(wStart, wEnd) + 1);

    // Compute descriptive period label
    let label = '';
    if (periodScale === 'all') {
      const sStr = wStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const eStr = wEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const monthsCount = Math.max(1, Math.round(span / 30));
      label = `Full Schedule · ${sStr} – ${eStr} (${monthsCount} mos / ${span} days)`;
    } else if (periodScale === 'quarter') {
      const qNum = Math.floor(wStart.getMonth() / 3) + 1;
      const sMonth = wStart.toLocaleDateString('en-US', { month: 'short' });
      const eMonth = wEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      label = `Q${qNum} ${wStart.getFullYear()} · ${sMonth} – ${eMonth} (${span} days)`;
    } else {
      label = `${wStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (${span} days)`;
    }

    const canPrev = periodScale !== 'all' && wStart.getTime() > pStart.getTime();
    const canNext = periodScale !== 'all' && wEnd.getTime() < pEnd.getTime();

    return {
      windowStart: wStart,
      windowEnd: wEnd,
      totalWindowDays: span,
      periodLabel: label,
      isPrevDisabled: !canPrev,
      isNextDisabled: !canNext,
    };
  }, [periodScale, periodAnchor, pStart, pEnd]);

  // ─── Period Navigation Handlers ──────────────────────────────────────
  const handlePrevPeriod = () => {
    if (periodScale === 'month') {
      setPeriodAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else if (periodScale === 'quarter') {
      setPeriodAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 3, 1));
    }
  };

  const handleNextPeriod = () => {
    if (periodScale === 'month') {
      setPeriodAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else if (periodScale === 'quarter') {
      setPeriodAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 3, 1));
    }
  };

  const handleJumpToToday = () => {
    const now = new Date();
    if (periodScale === 'all') {
      // In full schedule, scroll smoothly to today's line
      if (containerRef.current) {
        const todayOffset = daysBetween(windowStart, now);
        const todayPctVal = Math.max(0, Math.min(100, (todayOffset / totalWindowDays) * 100));
        const scrollTarget = (containerRef.current.scrollWidth - containerRef.current.clientWidth) * (todayPctVal / 100);
        containerRef.current.scrollTo({ left: Math.max(0, scrollTarget - 200), behavior: 'smooth' });
      }
    } else {
      setPeriodAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
    }
  };

  // ─── Today Indicator ─────────────────────────────────────────────────
  const TODAY = useMemo(() => new Date(), []);
  const todayParsed = useMemo(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()), [TODAY]);
  const isTodayInWindow = todayParsed >= windowStart && todayParsed <= windowEnd;
  const todayPct = useMemo(() => {
    if (!isTodayInWindow) return null;
    const offset = daysBetween(windowStart, todayParsed);
    return Math.max(0, Math.min(100, (offset / totalWindowDays) * 100));
  }, [isTodayInWindow, windowStart, todayParsed, totalWindowDays]);

  // ─── Dynamic Milestones from Real Project Finish Dates ────────────────
  const milestones: Milestone[] = useMemo(() => {
    if (!projectData) return [];
    if (Array.isArray(projectData.milestones) && projectData.milestones.length > 0) {
      return projectData.milestones;
    }

    const list: Milestone[] = [];
    (projectData.mainJobs || []).forEach((mj: any) => {
      if (mj.finishDate && parseDate(mj.finishDate)) {
        list.push({
          id: `ms-${mj.id}`,
          name: `${mj.name} Target`,
          dateStr: mj.finishDate,
          description: `Phase ${mj.code} completion target`,
          progress: mj.progress,
        });
      }
    });

    if (projectData.endDate && parseDate(projectData.endDate)) {
      list.push({
        id: 'ms-project-completion',
        name: 'Project Finish',
        dateStr: projectData.endDate,
        description: 'Overall project target completion date',
        progress: projectData.overallProgress || 0,
      });
    }

    return list;
  }, [projectData]);

  // ─── Compute Bar Layout Relative to Active Window ────────────────────
  const getBarPosition = (startDateStr?: string | null, finishDateStr?: string | null) => {
    const sDate = parseDate(startDateStr);
    const fDate = parseDate(finishDateStr);

    if (!sDate || !fDate) return null;

    const isBefore = fDate < windowStart;
    const isAfter = sDate > windowEnd;
    const isVisible = !isBefore && !isAfter;

    if (!isVisible) {
      return { isVisible: false, isBefore, isAfter, leftPct: 0, widthPct: 0, continuesLeft: false, continuesRight: false };
    }

    const clippedStart = sDate < windowStart ? windowStart : sDate;
    const clippedFinish = fDate > windowEnd ? windowEnd : fDate;

    const offsetDays = daysBetween(windowStart, clippedStart);
    const durationDays = daysBetween(clippedStart, clippedFinish) + 1;

    const left = (offsetDays / totalWindowDays) * 100;
    const width = Math.max(0.6, (durationDays / totalWindowDays) * 100);

    return {
      isVisible: true,
      isBefore: false,
      isAfter: false,
      leftPct: Math.max(0, Math.min(100, left)),
      widthPct: Math.min(100 - Math.max(0, left), width),
      continuesLeft: sDate < windowStart,
      continuesRight: fDate > windowEnd,
      sDate,
      fDate,
    };
  };

  // ─── Month Segments & Subdivisions for Clean Dual-Tier Header ────────
  const monthSegments = useMemo(() => {
    const segments: {
      label: string;
      yearStr: string;
      leftPct: number;
      widthPct: number;
      isEven: boolean;
      daysCount: number;
    }[] = [];

    let cur = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
    let idx = 0;

    while (cur <= windowEnd) {
      const segStart = cur < windowStart ? windowStart : cur;
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const lastDay = new Date(nextMonth.getTime() - 86400000);
      const segEnd = lastDay > windowEnd ? windowEnd : lastDay;

      const offset = daysBetween(windowStart, segStart);
      const segDays = daysBetween(segStart, segEnd) + 1;

      const left = (offset / totalWindowDays) * 100;
      const width = (segDays / totalWindowDays) * 100;

      segments.push({
        label: cur.toLocaleDateString('en-US', { month: 'short' }),
        yearStr: cur.toLocaleDateString('en-US', { year: '2-digit' }),
        leftPct: Math.max(0, left),
        widthPct: width,
        isEven: idx % 2 === 0,
        daysCount: segDays,
      });

      cur = nextMonth;
      idx++;
    }

    return segments;
  }, [windowStart, windowEnd, totalWindowDays]);

  // ─── Canvas Minimum Width to Guarantee High Readability ──────────────
  const canvasMinWidth = useMemo(() => {
    if (periodScale === 'month') return 760;
    if (periodScale === 'quarter') return 900;
    const monthsCount = Math.max(1, Math.ceil(totalProjectDays / 30));
    return Math.max(850, monthsCount * 96);
  }, [periodScale, totalProjectDays]);

  // ─── Extract All Unique Divisions for Filtering ──────────────────────
  const availableDivisions = useMemo(() => {
    const divs = new Set<string>();
    (projectData?.mainJobs || []).forEach((mj: any) => {
      (mj.subMainJobs || []).forEach((smj: any) => {
        if (smj.pic) divs.add(smj.pic);
        (smj.subtasks || []).forEach((st: any) => {
          if (st.division) divs.add(st.division);
        });
      });
    });
    return Array.from(divs).sort();
  }, [projectData]);

  // ─── Filtered Tasks & Main Jobs ──────────────────────────────────────
  const mainJobsList = useMemo(() => {
    const raw = projectData?.mainJobs || [];
    if (!searchQuery.trim() && selectedDivision === 'All') return raw;

    const q = searchQuery.toLowerCase().trim();

    return raw
      .map((mj: any) => {
        const mjMatches = !q || mj.name.toLowerCase().includes(q) || mj.code.toLowerCase().includes(q);

        const filteredSubMain = (mj.subMainJobs || [])
          .map((smj: any) => {
            const smjMatches = !q || smj.name.toLowerCase().includes(q) || smj.code.toLowerCase().includes(q);
            const divMatches = selectedDivision === 'All' || smj.pic === selectedDivision;

            const filteredTasks = (smj.subtasks || []).filter((st: any) => {
              const taskMatches = !q || st.name.toLowerCase().includes(q) || st.code.toLowerCase().includes(q);
              const taskDiv = selectedDivision === 'All' || st.division === selectedDivision;
              return taskMatches && taskDiv;
            });

            if ((smjMatches && divMatches) || filteredTasks.length > 0) {
              return { ...smj, subtasks: filteredTasks.length > 0 ? filteredTasks : smj.subtasks };
            }
            return null;
          })
          .filter(Boolean);

        if (mjMatches || filteredSubMain.length > 0) {
          return { ...mj, subMainJobs: filteredSubMain };
        }
        return null;
      })
      .filter(Boolean);
  }, [projectData, searchQuery, selectedDivision]);

  // Auto-expand parents when searching
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const newMJ: Record<string, boolean> = {};
      const newSMJ: Record<string, boolean> = {};
      mainJobsList.forEach((mj: any) => {
        newMJ[mj.id] = true;
        (mj.subMainJobs || []).forEach((smj: any) => {
          newSMJ[smj.id] = true;
        });
      });
      setExpandedMJ(newMJ);
      setExpandedSMJ(newSMJ);
    }
  }, [searchQuery, mainJobsList]);

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

  const visiblePhases = showAllPhases ? mainJobsList : mainJobsList.slice(0, 7);
  const remainingPhaseCount = Math.max(0, mainJobsList.length - 7);

  // ─── Empty State if No Project Data Available ────────────────────────
  if (!projectData || !projectData.mainJobs || projectData.mainJobs.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-full space-y-4">
        <PageHeader
          title="Timeline / Gantt Schedule"
          subtitle="Project schedule visualization based on phases and WBS structure."
        />
        <Card className="p-12 text-center border-dashed border-2 border-neutral-300">
          <div className="w-14 h-14 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3 shadow-inner">
            <Calendar size={28} />
          </div>
          <h3 className="text-base font-bold text-neutral-800">No WBS Schedule Data Available</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mt-1 mb-5">
            This project does not have any WBS schedule activities configured yet. Add tasks with start and finish dates to visualize the timeline schedule.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href={projectData?.id ? `/projectdetailpage?project_id=${projectData.id}` : '/projectlistpage'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-brand-dark transition-colors"
            >
              <FolderOpen size={16} />
              <span>Go to Project Detail</span>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-full space-y-4 overflow-hidden">
      {/* ─── 1. Page Header with dynamic project title ──────────────────── */}
      <PageHeader
        title="Timeline / Gantt Schedule"
        subtitle={`Project schedule visualization (${projectData.name || 'Project'}) based on phases and WBS structure.`}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-neutral-100 p-1 rounded-lg border border-neutral-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('phase-view')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                  viewMode === 'phase-view'
                    ? 'bg-brand text-white shadow-xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Phase View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('wbs-tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                  viewMode === 'wbs-tree'
                    ? 'bg-brand text-white shadow-xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <ListTree size={14} />
                <span>WBS Tree</span>
              </button>
            </div>

            {/* Expand / Collapse Controls (WBS Tree Mode) */}
            {viewMode === 'wbs-tree' && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                  className="text-[11px] h-8 px-2.5 bg-white hover:bg-neutral-50"
                  title="Expand all levels"
                >
                  <Maximize2 size={12} className="mr-1 text-neutral-500" />
                  Expand All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                  className="text-[11px] h-8 px-2.5 bg-white hover:bg-neutral-50"
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

      {/* ─── 2. Date Navigation & Filter Toolbar ─────────────────────────── */}
      <Card className="p-3 sm:p-4 border border-neutral-200/90 shadow-2xs bg-white space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Period Scale Presets & Navigator Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Scale Pill Toggle */}
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setPeriodScale('all')}
                className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-all cursor-pointer ${
                  periodScale === 'all'
                    ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Full Schedule
              </button>
              <button
                type="button"
                onClick={() => setPeriodScale('quarter')}
                className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-all cursor-pointer ${
                  periodScale === 'quarter'
                    ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Quarterly
              </button>
              <button
                type="button"
                onClick={() => setPeriodScale('month')}
                className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-all cursor-pointer ${
                  periodScale === 'month'
                    ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Monthly
              </button>
            </div>

            {/* Previous / Next Period Navigation */}
            <div className="flex items-center gap-1 bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-200/90">
              <button
                type="button"
                onClick={handlePrevPeriod}
                disabled={isPrevDisabled}
                className="p-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                title={periodScale === 'all' ? 'Select Quarterly or Monthly to step through periods' : 'Previous period'}
              >
                <ChevronLeft size={16} />
              </button>

              {/* Current Active Period Badge */}
              <div className="px-2.5 py-0.5 text-center min-w-[150px] sm:min-w-[220px]">
                <div className="text-[12px] font-bold text-neutral-800 tracking-tight leading-snug">
                  {periodLabel}
                </div>
              </div>

              <button
                type="button"
                onClick={handleNextPeriod}
                disabled={isNextDisabled}
                className="p-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                title={periodScale === 'all' ? 'Select Quarterly or Monthly to step through periods' : 'Next period'}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Jump to Today Button */}
            <button
              type="button"
              onClick={handleJumpToToday}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border transition-all cursor-pointer ${
                isTodayInWindow
                  ? 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/15'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
              title="Jump viewport to today"
            >
              <span className={`w-2 h-2 rounded-full ${isTodayInWindow ? 'bg-danger animate-pulse' : 'bg-neutral-400'}`} />
              <span>Today</span>
            </button>
          </div>

          {/* Search & Division Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-8 pr-7 py-1 text-[12px] rounded-lg border border-neutral-200 bg-neutral-50/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Division Filter */}
            {availableDivisions.length > 1 && (
              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="py-1 px-2.5 text-[12px] font-medium rounded-lg border border-neutral-200 bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
              >
                <option value="All">All Divisions</option>
                {availableDivisions.map((div) => (
                  <option key={div} value={div}>
                    {formatDivisionName(div)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Dynamic Project Phases Legend & Milestones Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-neutral-100 text-[11.5px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-neutral-400 uppercase tracking-wider text-[10.5px] flex-shrink-0">
              Phases
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {visiblePhases.map((mj: any, idx: number) => {
                const color = PHASE_COLORS[idx % PHASE_COLORS.length];
                return (
                  <div
                    key={mj.id || idx}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-50 border border-neutral-200/70 text-[11px] font-medium text-neutral-700 shadow-2xs hover:bg-neutral-100 transition-colors"
                    title={mj.name}
                  >
                    <span className="w-2 h-2 rounded-xs flex-shrink-0" style={{ backgroundColor: color.bg }} />
                    <span className="truncate max-w-[120px]">{mj.name}</span>
                  </div>
                );
              })}
              {remainingPhaseCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPhases((v) => !v)}
                  className="text-[11px] text-brand font-semibold px-2 py-0.5 rounded-md bg-brand-light hover:bg-brand/15 border border-brand/25 transition-colors cursor-pointer"
                >
                  {showAllPhases ? 'Show less' : `+${remainingPhaseCount} more`}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-700 bg-neutral-50 px-2 py-0.5 rounded-md border border-neutral-200/80">
              <span className="w-2 h-2 rotate-45 bg-amber-500 rounded-[1px]" />
              <span>Milestones ({milestones.length})</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-danger bg-danger-light px-2 py-0.5 rounded-md border border-danger/20">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span>Today · {TODAY.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 3. Gantt Schedule Canvas Card ──────────────────────────────── */}
      <Card className="overflow-hidden border border-neutral-200/90 shadow-sm rounded-xl bg-white">
        <div
          className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-250px)] scrollbar-thin select-none"
          ref={containerRef}
        >
          <div style={{ minWidth: canvasMinWidth }} className="w-full">
            {/* Top Dual-Tier Axis Header (Sticky Top) */}
            <div className="flex border-b border-neutral-200 bg-neutral-50 sticky top-0 z-30 shadow-2xs">
              {/* Sticky Task Label Column */}
              <div className="w-72 sm:w-80 lg:w-[380px] flex-shrink-0 px-4 py-2.5 border-r border-neutral-200 flex items-center justify-between sticky left-0 z-40 bg-neutral-50 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                  {viewMode === 'phase-view' ? 'Phase & Task Activity' : 'WBS Element / Task'}
                </span>
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Schedule / PIC
                </span>
              </div>

              {/* Dynamic Timeline Axis Header */}
              <div className="flex-1 relative flex flex-col justify-between h-12 bg-neutral-50/80">
                {/* Tier 1: Months / Periods */}
                <div className="relative h-6 border-b border-neutral-200/80 overflow-hidden">
                  {monthSegments.map((seg, i) => (
                    <div
                      key={`m-top-${i}`}
                      className={`absolute top-0 bottom-0 flex items-center justify-center border-r border-neutral-200/70 px-1 text-[11px] font-bold ${
                        seg.isEven ? 'bg-neutral-100/40 text-neutral-800' : 'bg-transparent text-neutral-700'
                      }`}
                      style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                    >
                      <span className="truncate">
                        {seg.label} {seg.yearStr ? `'${seg.yearStr}` : ''}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Tier 2: Subdivisions & Markers */}
                <div className="relative h-6 flex items-center">
                  {/* Subtle month separator lines */}
                  {monthSegments.map((seg, i) => (
                    <div
                      key={`m-div-${i}`}
                      className="absolute inset-y-0 border-r border-neutral-200/90 pointer-events-none"
                      style={{ left: `${seg.leftPct + seg.widthPct}%` }}
                    />
                  ))}

                  {/* Milestones in Header */}
                  {milestones.map((m) => {
                    const mDate = parseDate(m.dateStr);
                    if (!mDate || mDate < windowStart || mDate > windowEnd) return null;
                    const offset = daysBetween(windowStart, mDate);
                    const mPct = Math.max(0, Math.min(100, (offset / totalWindowDays) * 100));

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
                            details: [`Target Date: ${formatDateDisplay(m.dateStr)}`],
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs mt-0.5 -translate-x-1/2 border border-amber-400/90 transition-transform group-hover/m:scale-105">
                          <span className="w-1.5 h-1.5 rotate-45 bg-white rounded-[0.5px]" />
                          <span className="truncate max-w-[80px]">{m.name}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Today Marker in Header */}
                  {todayPct !== null && (
                    <div
                      className="absolute top-0 bottom-0 flex flex-col items-center z-30 pointer-events-none"
                      style={{ left: `${todayPct}%` }}
                    >
                      <div className="bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs mt-0.5 -translate-x-1/2 flex items-center gap-1 border border-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span>Today</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Gantt Rows: Phase View Mode ──────────────────────────── */}
            {viewMode === 'phase-view' ? (
              <div className="divide-y divide-neutral-200/90">
                {mainJobsList.map((mj: any, mjIdx: number) => {
                  const phaseColor = PHASE_COLORS[mjIdx % PHASE_COLORS.length];
                  const items =
                    mj.subMainJobs && mj.subMainJobs.length > 0
                      ? mj.subMainJobs
                      : [
                          {
                            id: `mj-standalone-${mj.id}`,
                            code: mj.code,
                            name: mj.name,
                            startDate: mj.startDate,
                            finishDate: mj.finishDate,
                            progress: mj.progress,
                            status: mj.status,
                            pic: 'Team',
                          },
                        ];

                  return (
                    <div key={mj.id} className="bg-white">
                      {/* Phase Summary Group Header */}
                      <div className="flex border-b border-neutral-100 bg-neutral-50/60 items-center">
                        <div className="w-72 sm:w-80 lg:w-[380px] flex-shrink-0 px-3.5 py-1.5 flex items-center gap-2 border-r border-neutral-200 sticky left-0 z-20 bg-neutral-100/90 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                          <div
                            className="w-4 h-4 rounded text-white flex items-center justify-center flex-shrink-0 text-[9.5px] font-extrabold shadow-2xs"
                            style={{ backgroundColor: phaseColor.bg }}
                          >
                            {mj.code}
                          </div>
                          <span className="text-[12px] font-bold text-neutral-800 truncate flex-1" title={mj.name}>
                            Phase {mj.code} · {mj.name}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-600 bg-white px-1.5 py-0.2 rounded border border-neutral-200">
                            {mj.progress}%
                          </span>
                        </div>

                        {/* Summary Phase Track in Canvas */}
                        <div className="flex-1 relative h-7 bg-neutral-50/30">
                          {monthSegments.map((seg, i) => (
                            <div
                              key={`bg-ph-${i}`}
                              className="absolute inset-y-0 border-r border-neutral-100 pointer-events-none"
                              style={{ left: `${seg.leftPct + seg.widthPct}%` }}
                            />
                          ))}
                          {todayPct !== null && (
                            <div
                              className="absolute inset-y-0 border-l-2 border-danger/40 border-dashed pointer-events-none z-10"
                              style={{ left: `${todayPct}%` }}
                            />
                          )}

                          {(() => {
                            const pos = getBarPosition(mj.startDate, mj.finishDate);
                            if (!pos || !pos.isVisible) return null;
                            return (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded opacity-75 shadow-2xs transition-all hover:opacity-100 cursor-pointer"
                                style={{
                                  left: `${pos.leftPct}%`,
                                  width: `${pos.widthPct}%`,
                                  backgroundColor: phaseColor.bg,
                                }}
                                onMouseMove={(e) =>
                                  setTooltip({
                                    x: e.clientX,
                                    y: e.clientY,
                                    title: `Phase ${mj.code}: ${mj.name}`,
                                    subtitle: 'Project Phase Summary',
                                    details: [
                                      `Schedule: ${formatDateDisplay(mj.startDate)} to ${formatDateDisplay(mj.finishDate)}`,
                                      `Phase Progress: ${mj.progress}%`,
                                    ],
                                  })
                                }
                                onMouseLeave={() => setTooltip(null)}
                              >
                                <div
                                  className="h-full bg-white/30 rounded"
                                  style={{ width: `${Math.min(100, mj.progress)}%` }}
                                />
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Phase Tasks Rows */}
                      <div className="divide-y divide-neutral-100">
                        {items.map((item: any) => {
                          const itemStart = item.startDate || mj.startDate;
                          const itemEnd = item.finishDate || mj.finishDate;
                          const pos = getBarPosition(itemStart, itemEnd);
                          const isHovered = hoveredItemId === item.id;

                          return (
                            <div
                              key={item.id}
                              className={`flex min-h-[44px] items-stretch transition-colors ${
                                isHovered ? 'bg-brand-50/40' : 'hover:bg-neutral-50/90'
                              }`}
                              onMouseEnter={() => setHoveredItemId(item.id)}
                              onMouseLeave={() => setHoveredItemId(null)}
                            >
                              {/* Sticky Task Activity Column */}
                              <div
                                className={`w-72 sm:w-80 lg:w-[380px] flex-shrink-0 px-3.5 py-1.5 flex items-center justify-between gap-2 border-r border-neutral-200 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors ${
                                  isHovered ? 'bg-brand-50/60' : 'bg-white'
                                }`}
                              >
                                <div className="truncate flex-1 min-w-0 pr-1">
                                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-800">
                                    <span className="text-[10px] font-mono font-bold text-neutral-500 bg-neutral-100 px-1 py-0.2 rounded border border-neutral-200/70 flex-shrink-0">
                                      {item.code}
                                    </span>
                                    <span className="truncate" title={item.name}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                                    <span className="font-mono">
                                      {formatDateDisplay(itemStart)} – {formatDateDisplay(itemEnd)}
                                    </span>
                                    {item.duration && <span>· {item.duration}d</span>}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="text-[9.5px] font-medium text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200/80 truncate max-w-[90px]">
                                    {formatDivisionName(item.pic) || 'Internal'}
                                  </span>
                                  <span className="text-[10.5px] font-bold text-neutral-700 min-w-[28px] text-right">
                                    {item.progress || 0}%
                                  </span>
                                </div>
                              </div>

                              {/* Gantt Canvas Cell */}
                              <div className="flex-1 relative min-h-[44px] flex items-center overflow-hidden">
                                {/* Month boundary grid lines */}
                                {monthSegments.map((seg, i) => (
                                  <div
                                    key={`grid-line-${i}`}
                                    className="absolute inset-y-0 border-r border-neutral-100/90 pointer-events-none"
                                    style={{ left: `${seg.leftPct + seg.widthPct}%` }}
                                  />
                                ))}

                                {/* Milestone vertical lines */}
                                {milestones.map((m) => {
                                  const mDate = parseDate(m.dateStr);
                                  if (!mDate || mDate < windowStart || mDate > windowEnd) return null;
                                  const offset = daysBetween(windowStart, mDate);
                                  const mPct = (offset / totalWindowDays) * 100;
                                  return (
                                    <div
                                      key={`m-line-${m.id}`}
                                      className="absolute inset-y-0 border-l border-amber-400/40 pointer-events-none z-10"
                                      style={{ left: `${mPct}%` }}
                                    />
                                  );
                                })}

                                {/* Today line */}
                                {todayPct !== null && (
                                  <div
                                    className="absolute inset-y-0 border-l-2 border-danger/55 border-dashed pointer-events-none z-10"
                                    style={{ left: `${todayPct}%` }}
                                  />
                                )}

                                {/* Gantt Bar */}
                                {pos && pos.isVisible ? (
                                  <div
                                    className={`absolute top-1/2 -translate-y-1/2 h-6.5 flex items-center px-2 cursor-pointer shadow-xs transition-all hover:brightness-105 active:scale-98 z-10 border border-white/25 ${
                                      pos.continuesLeft ? 'rounded-r-md' : pos.continuesRight ? 'rounded-l-md' : 'rounded-md'
                                    }`}
                                    style={{
                                      left: `${pos.leftPct}%`,
                                      width: `${pos.widthPct}%`,
                                      minWidth: 14,
                                      backgroundColor: phaseColor.bg,
                                    }}
                                    onMouseMove={(e) =>
                                      setTooltip({
                                        x: e.clientX,
                                        y: e.clientY,
                                        title: `${item.code} ${item.name}`,
                                        subtitle: `Phase: ${mj.name}`,
                                        details: [
                                          `Schedule: ${formatDateDisplay(itemStart)} to ${formatDateDisplay(itemEnd)}`,
                                          `Duration: ${item.duration || Math.max(1, daysBetween(pos.sDate!, pos.fDate!) + 1)} days`,
                                          `PIC / Division: ${formatDivisionName(item.pic) || 'Internal'}`,
                                          `Progress: ${item.progress || 0}% (${item.status || 'Open'})`,
                                        ],
                                      })
                                    }
                                    onMouseLeave={() => setTooltip(null)}
                                  >
                                    {/* Progress fill */}
                                    {item.progress > 0 && (
                                      <div
                                        className="absolute inset-0 bg-white/25 rounded"
                                        style={{ width: `${Math.min(100, item.progress)}%` }}
                                      />
                                    )}

                                    {/* Continuation arrow left */}
                                    {pos.continuesLeft && (
                                      <span className="relative text-[9px] text-white/80 font-bold mr-0.5">◄</span>
                                    )}

                                    {/* Content inside bar if space permits */}
                                    <span className="relative text-[10px] text-white font-bold truncate leading-none flex items-center gap-1 drop-shadow-2xs">
                                      {pos.widthPct > 12 && <span className="truncate">{item.name}</span>}
                                      {pos.widthPct > 6 && <span>{item.progress || 0}%</span>}
                                    </span>

                                    {/* Continuation arrow right */}
                                    {pos.continuesRight && (
                                      <span className="relative text-[9px] text-white/80 font-bold ml-auto pl-0.5">►</span>
                                    )}
                                  </div>
                                ) : (
                                  /* Indicator when bar is outside current period view */
                                  <div className="px-3 text-[10px] text-neutral-400 italic">
                                    {pos?.isBefore ? '◄ Scheduled in prior period' : pos?.isAfter ? 'Scheduled in later period ►' : '—'}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ─── Gantt Rows: WBS Tree View Mode (3-Tier Hierarchy) ────────── */
              <div className="divide-y divide-neutral-200/90">
                {mainJobsList.map((mj: any, mjIdx: number) => (
                  <GanttTreeMJ
                    key={mj.id}
                    mj={mj}
                    phaseColor={PHASE_COLORS[mjIdx % PHASE_COLORS.length]}
                    expanded={!!expandedMJ[mj.id]}
                    expandedSMJ={expandedSMJ}
                    onToggleMJ={() => setExpandedMJ((p) => ({ ...p, [mj.id]: !p[mj.id] }))}
                    onToggleSMJ={(smjId) => setExpandedSMJ((p) => ({ ...p, [smjId]: !p[smjId] }))}
                    todayPct={todayPct}
                    monthSegments={monthSegments}
                    milestones={milestones}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    getBarPosition={getBarPosition}
                    hoveredItemId={hoveredItemId}
                    setHoveredItemId={setHoveredItemId}
                    onTooltip={setTooltip}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ─── 4. Sleek Floating Tooltip ──────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-50 bg-neutral-900/95 backdrop-blur-xs text-white text-[12px] px-3.5 py-2.5 rounded-xl shadow-2xl pointer-events-none border border-neutral-700/80 max-w-xs transition-opacity duration-150"
          style={{
            left: Math.min(window.innerWidth - 290, Math.max(10, tooltip.x + 14)),
            top: Math.max(10, tooltip.y - 70),
          }}
        >
          <div className="font-bold text-neutral-100 text-[12.5px] leading-snug">{tooltip.title}</div>
          {tooltip.subtitle && <div className="text-[11px] text-neutral-400 mt-0.5">{tooltip.subtitle}</div>}
          {tooltip.details && tooltip.details.length > 0 && (
            <div className="mt-2 pt-2 border-t border-neutral-700/70 space-y-1 text-[11px] text-neutral-300">
              {tooltip.details.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
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
  monthSegments,
  milestones,
  windowStart,
  windowEnd,
  getBarPosition,
  hoveredItemId,
  setHoveredItemId,
  onTooltip,
}: {
  mj: any;
  phaseColor: { bg: string; text: string; light: string; border: string };
  expanded: boolean;
  expandedSMJ: Record<string, boolean>;
  onToggleMJ: () => void;
  onToggleSMJ: (id: string) => void;
  todayPct: number | null;
  monthSegments: any[];
  milestones: Milestone[];
  windowStart: Date;
  windowEnd: Date;
  getBarPosition: (s?: string | null, f?: string | null) => any;
  hoveredItemId: string | null;
  setHoveredItemId: (id: string | null) => void;
  onTooltip: (t: any) => void;
}) {
  const mjPos = getBarPosition(mj.startDate, mj.finishDate);
  const isHovered = hoveredItemId === mj.id;

  return (
    <>
      {/* ─── Level 1: Main Job Row (Most Prominent) ────────────────────── */}
      <div
        className={`flex border-b border-neutral-200/90 transition-colors ${
          isHovered ? 'bg-brand-50/40' : 'bg-neutral-50/60 hover:bg-neutral-100/70'
        }`}
        onMouseEnter={() => setHoveredItemId(mj.id)}
        onMouseLeave={() => setHoveredItemId(null)}
      >
        {/* Sticky Task Column */}
        <div
          className={`w-72 sm:w-80 lg:w-[380px] flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-r border-neutral-200 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors ${
            isHovered ? 'bg-brand-50/60' : 'bg-neutral-50/95'
          }`}
        >
          <button
            type="button"
            onClick={onToggleMJ}
            className="text-neutral-500 hover:text-neutral-900 flex-shrink-0 p-1 rounded-md hover:bg-neutral-200/70 transition-colors cursor-pointer"
            title={expanded ? 'Collapse Phase' : 'Expand Phase'}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>

          {/* Code Badge */}
          <div
            className="w-5 h-5 rounded-md text-white flex items-center justify-center flex-shrink-0 shadow-2xs text-[10px] font-extrabold"
            style={{ backgroundColor: phaseColor.bg }}
          >
            {mj.code}
          </div>

          <div className="truncate flex-1 min-w-0">
            <span className="text-[13px] font-bold text-neutral-900 truncate block tracking-tight" title={mj.name}>
              {mj.name}
            </span>
            <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
              {formatDateDisplay(mj.startDate)} – {formatDateDisplay(mj.finishDate)}
            </div>
          </div>

          {/* Main Job Progress Badge */}
          <span className="text-[11px] font-extrabold text-neutral-700 bg-white px-2 py-0.5 rounded-full border border-neutral-200/90 shadow-2xs ml-auto flex-shrink-0">
            {mj.progress}%
          </span>
        </div>

        {/* Timeline Canvas Cell */}
        <div className="flex-1 relative border-l border-neutral-200 h-11 bg-white group-hover/mj:bg-neutral-100/70 transition-colors flex items-center overflow-hidden">
          {monthSegments.map((seg, i) => (
            <div
              key={`mj-grid-${i}`}
              className="absolute inset-y-0 border-r border-neutral-100 pointer-events-none"
              style={{ left: `${seg.leftPct + seg.widthPct}%` }}
            />
          ))}

          {milestones.map((m) => {
            const mDate = parseDate(m.dateStr);
            if (!mDate || mDate < windowStart || mDate > windowEnd) return null;
            const mPos = getBarPosition(m.dateStr, m.dateStr);
            if (!mPos) return null;
            return (
              <div
                key={`line-${m.id}`}
                className="absolute inset-y-0 border-l border-amber-400/40 pointer-events-none z-10"
                style={{ left: `${mPos.leftPct}%` }}
              />
            );
          })}

          {todayPct !== null && (
            <div
              className="absolute inset-y-0 border-l-2 border-dashed border-danger/50 pointer-events-none z-10"
              style={{ left: `${todayPct}%` }}
            />
          )}

          {/* Main Job Bar */}
          {mjPos && mjPos.isVisible && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 h-6 flex items-center px-2 cursor-pointer shadow-xs transition-all hover:brightness-105 active:scale-98 z-10 border border-white/20 ${
                mjPos.continuesLeft ? 'rounded-r-md' : mjPos.continuesRight ? 'rounded-l-md' : 'rounded-md'
              }`}
              style={{
                left: `${mjPos.leftPct}%`,
                width: `${mjPos.widthPct}%`,
                minWidth: 10,
                background: phaseColor.bg,
              }}
              onMouseMove={(e) =>
                onTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  title: `${mj.code}. ${mj.name}`,
                  subtitle: 'Main Project Phase',
                  details: [
                    `Schedule: ${formatDateDisplay(mj.startDate)} to ${formatDateDisplay(mj.finishDate)}`,
                    `Phase Progress: ${mj.progress}% completed`,
                  ],
                })
              }
              onMouseLeave={() => onTooltip(null)}
            >
              <div className="absolute inset-0 rounded-md overflow-hidden">
                <div className="h-full bg-white/25 rounded-md" style={{ width: `${Math.min(100, mj.progress)}%` }} />
              </div>
              {mjPos.continuesLeft && <span className="relative text-[9px] text-white/80 font-bold mr-1">◄</span>}
              {mjPos.widthPct > 6 && (
                <span className="relative text-[10px] text-white font-bold truncate leading-none drop-shadow-2xs">
                  {mj.progress}%
                </span>
              )}
              {mjPos.continuesRight && <span className="relative text-[9px] text-white/80 font-bold ml-auto pl-1">►</span>}
            </div>
          )}
        </div>
      </div>

      {/* ─── Level 2: Sub Main Jobs ────────────────────────────────────── */}
      {expanded &&
        (mj.subMainJobs || []).map((smj: any) => {
          const smjPos = getBarPosition(smj.startDate, smj.finishDate);
          const smjExpanded = !!expandedSMJ[smj.id];
          const hasChildren = smj.subtasks && smj.subtasks.length > 0;
          const isSmjHovered = hoveredItemId === smj.id;

          return (
            <div key={smj.id}>
              <div
                className={`flex border-b border-neutral-100 transition-colors ${
                  isSmjHovered ? 'bg-brand-50/40' : 'bg-white hover:bg-neutral-50/80'
                }`}
                onMouseEnter={() => setHoveredItemId(smj.id)}
                onMouseLeave={() => setHoveredItemId(null)}
              >
                {/* Sticky Task Column */}
                <div
                  className={`w-72 sm:w-80 lg:w-[380px] flex-shrink-0 flex items-center gap-2 pl-6 sm:pl-7 pr-3.5 py-2 border-r border-neutral-200 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors ${
                    isSmjHovered ? 'bg-brand-50/60' : 'bg-white'
                  }`}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => onToggleSMJ(smj.id)}
                      className="text-neutral-400 hover:text-neutral-700 flex-shrink-0 p-0.5 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                      title={smjExpanded ? 'Collapse Sub Tasks' : 'Expand Sub Tasks'}
                    >
                      {smjExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  ) : (
                    <span className="w-3.5 flex-shrink-0" />
                  )}

                  {/* Level 2 Code Badge */}
                  <div className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10px] font-semibold border border-neutral-200/80 flex-shrink-0">
                    {smj.code}
                  </div>

                  <div className="truncate flex-1 min-w-0">
                    <span className="text-[12px] font-semibold text-neutral-800 truncate block" title={smj.name}>
                      {smj.name}
                    </span>
                    <div className="text-[9.5px] font-mono text-neutral-400">
                      {formatDateDisplay(smj.startDate)} – {formatDateDisplay(smj.finishDate)}
                    </div>
                  </div>

                  {/* PIC Pill */}
                  <span className="text-[9.5px] font-medium text-neutral-500 bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200/70 flex-shrink-0 truncate max-w-[80px]">
                    {formatDivisionName(smj.pic) || 'Internal'}
                  </span>

                  {/* Progress */}
                  <span className="text-[10.5px] font-semibold text-neutral-600 min-w-[28px] text-right flex-shrink-0">
                    {smj.progress}%
                  </span>
                </div>

                {/* Timeline Canvas Cell */}
                <div className="flex-1 relative border-l border-neutral-200 h-9 bg-white flex items-center overflow-hidden">
                  {monthSegments.map((seg, i) => (
                    <div
                      key={`smj-grid-${i}`}
                      className="absolute inset-y-0 border-r border-neutral-100/80 pointer-events-none"
                      style={{ left: `${seg.leftPct + seg.widthPct}%` }}
                    />
                  ))}

                  {todayPct !== null && (
                    <div
                      className="absolute inset-y-0 border-l-2 border-dashed border-danger/35 pointer-events-none z-10"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}

                  {/* Sub Main Job Bar */}
                  {smjPos && smjPos.isVisible && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-5 cursor-pointer shadow-2xs transition-all hover:brightness-105 z-10 flex items-center px-1.5 ${
                        smjPos.continuesLeft ? 'rounded-r-md' : smjPos.continuesRight ? 'rounded-l-md' : 'rounded-md'
                      }`}
                      style={{
                        left: `${smjPos.leftPct}%`,
                        width: `${smjPos.widthPct}%`,
                        minWidth: 8,
                        background: phaseColor.bg + 'D8',
                      }}
                      onMouseMove={(e) =>
                        onTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          title: `${smj.code} ${smj.name}`,
                          subtitle: 'Sub Main Job',
                          details: [
                            `Schedule: ${formatDateDisplay(smj.startDate)} to ${formatDateDisplay(smj.finishDate)}`,
                            `PIC / Division: ${formatDivisionName(smj.pic) || 'Internal'}`,
                            `Progress: ${smj.progress}%`,
                          ],
                        })
                      }
                      onMouseLeave={() => onTooltip(null)}
                    >
                      <div className="absolute inset-0 rounded-md overflow-hidden">
                        <div className="h-full bg-white/30" style={{ width: `${Math.min(100, smj.progress)}%` }} />
                      </div>
                      {smjPos.continuesLeft && <span className="relative text-[8.5px] text-white/80 font-bold mr-0.5">◄</span>}
                      {smjPos.widthPct > 8 && (
                        <span className="relative text-[9.5px] text-white font-bold truncate">
                          {smj.progress}%
                        </span>
                      )}
                      {smjPos.continuesRight && <span className="relative text-[8.5px] text-white/80 font-bold ml-auto pl-0.5">►</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Level 3: Subtasks (Execution Level) ──────────────────── */}
              {smjExpanded &&
                (smj.subtasks || []).map((st: any) => {
                  const stColor = STATUS_COLOR_BARS[st.status] || '#94A3B8';
                  const stPos = getBarPosition(st.startDate, st.finishDate);
                  const isStHovered = hoveredItemId === st.id;

                  return (
                    <div
                      key={st.id}
                      className={`flex border-b border-neutral-100/60 transition-colors ${
                        isStHovered ? 'bg-brand-50/40' : 'bg-neutral-50/20 hover:bg-neutral-50/70'
                      }`}
                      onMouseEnter={() => setHoveredItemId(st.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                    >
                      {/* Sticky Task Column */}
                      <div
                        className={`w-72 sm:w-80 lg:w-[380px] flex-shrink-0 flex items-center gap-2 pl-10 sm:pl-12 pr-3.5 py-1.5 border-r border-neutral-200 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors ${
                          isStHovered ? 'bg-brand-50/60' : 'bg-neutral-50/30'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 flex-shrink-0" />

                        <span className="text-[10px] font-mono text-neutral-400 font-bold flex-shrink-0">
                          {st.code}
                        </span>

                        <div className="truncate flex-1 min-w-0">
                          <span className="text-[11.5px] font-normal text-neutral-700 truncate block" title={st.name}>
                            {st.name}
                          </span>
                          <span className="text-[9px] font-mono text-neutral-400">
                            {formatDateDisplay(st.startDate)} – {formatDateDisplay(st.finishDate)} ({st.duration || 0}d)
                          </span>
                        </div>

                        {st.predecessor && (
                          <span className="text-[8.5px] font-semibold text-brand bg-brand-light border border-brand/20 px-1 py-0.2 rounded flex-shrink-0">
                            {st.depType || 'FS'}{st.lag ? `+${st.lag}` : ''}
                          </span>
                        )}

                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stColor }}
                          title={st.status}
                        />
                      </div>

                      {/* Timeline Canvas Cell */}
                      <div className="flex-1 relative border-l border-neutral-200 h-8 bg-white flex items-center overflow-hidden">
                        {monthSegments.map((seg, i) => (
                          <div
                            key={`st-grid-${i}`}
                            className="absolute inset-y-0 border-r border-neutral-50 pointer-events-none"
                            style={{ left: `${seg.leftPct + seg.widthPct}%` }}
                          />
                        ))}

                        {todayPct !== null && (
                          <div
                            className="absolute inset-y-0 border-l border-dashed border-danger/25 pointer-events-none z-10"
                            style={{ left: `${todayPct}%` }}
                          />
                        )}

                        {stPos && stPos.isVisible ? (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3.5 cursor-pointer shadow-2xs hover:brightness-110 z-10 flex items-center px-1 ${
                              stPos.continuesLeft ? 'rounded-r-xs' : stPos.continuesRight ? 'rounded-l-xs' : 'rounded-xs'
                            }`}
                            style={{
                              left: `${stPos.leftPct}%`,
                              width: `${stPos.widthPct}%`,
                              minWidth: 6,
                              background: stColor,
                            }}
                            onMouseMove={(e) =>
                              onTooltip({
                                x: e.clientX,
                                y: e.clientY,
                                title: `${st.code} ${st.name}`,
                                subtitle: 'Task Activity',
                                details: [
                                  `Dates: ${formatDateDisplay(st.startDate)} to ${formatDateDisplay(st.finishDate)} (${st.duration || 0} days)`,
                                  `Predecessor: ${st.predecessor || 'None'}`,
                                  `Status: ${st.status || 'Open'}`,
                                ],
                              })
                            }
                            onMouseLeave={() => onTooltip(null)}
                          >
                            {stPos.continuesLeft && <span className="text-[7px] text-white/90">◄</span>}
                            {stPos.continuesRight && <span className="text-[7px] text-white/90 ml-auto">►</span>}
                          </div>
                        ) : (
                          <div className="px-3 text-[9px] text-neutral-300 italic">
                            {stPos?.isBefore ? '◄ Earlier' : stPos?.isAfter ? 'Later ►' : ''}
                          </div>
                        )}
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
