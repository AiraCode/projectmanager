import { useState, useEffect, useMemo } from 'react';
import { usePage } from '@inertiajs/react';
import { Project, PROJECT } from '@/data/mockData';
import { recalculateWeeklyData } from '@/utils/weeklyEngine';
import { exportToCSV } from '@/utils/exportEngine';
import { PageHeader, Card, Button, formatDateDisplay } from '@/components/ui';
import { TrendingUp, BarChart2, Calendar, Eye, EyeOff, Download, AlertTriangle, RotateCcw, Filter } from 'lucide-react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, ReferenceLine
} from 'recharts';

type ViewMode = 'cumulative' | 'weekly';
type Granularity = 'day' | 'week' | 'year';

interface ChartPoint {
  name: string;
  subLabel?: string;
  'Plan. Cumulative': number | null;
  'Act. Cumulative': number | null;
  'Planned (Weekly)': number | null;
  'Actual (Weekly)': number | null;
  deviation?: number | null;
  rawWeek?: any;
}

export default function SCurvePage() {
  const { project, userRole } = usePage().props as any;
  const [viewMode, setViewMode] = useState<ViewMode>('cumulative');
  const [showTable, setShowTable] = useState(true);
  
  // Use engine to calculate exact cumulative values
  const [projectData, setProjectData] = useState<Project>(() => {
    return recalculateWeeklyData(project || PROJECT);
  });

  useEffect(() => {
    if (project) {
      setProjectData(recalculateWeeklyData(project));
    }
  }, [project]);

  const weeks = projectData.weeklyData || [];

  // Granularity & Range State (100% Data-Driven)
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [fromWeek, setFromWeek] = useState<string>('1');
  const [toWeek, setToWeek] = useState<string>(weeks.length ? String(weeks.length) : '1');

  const [fromDay, setFromDay] = useState<string>('');
  const [toDay, setToDay] = useState<string>('');

  const [fromYear, setFromYear] = useState<string>('');
  const [toYear, setToYear] = useState<string>('');

  // Synchronize defaults whenever project weeks change
  useEffect(() => {
    if (weeks.length > 0) {
      setFromWeek('1');
      setToWeek(String(weeks.length));
      setFromDay(projectData.startDate || weeks[0].startDate);
      setToDay(projectData.endDate || weeks[weeks.length - 1].endDate);

      const yStart = new Date(weeks[0].startDate).getFullYear().toString();
      const yEnd = new Date(weeks[weeks.length - 1].endDate).getFullYear().toString();
      setFromYear(yStart);
      setToYear(yEnd);
    }
  }, [weeks, projectData.startDate, projectData.endDate]);

  // Dynamic Options derived strictly from active project data
  const weekOptions = useMemo(() => {
    return weeks.map(w => ({
      value: String(w.week),
      label: `W${w.week} (${formatDateDisplay(w.startDate)})`
    }));
  }, [weeks]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(weeks.map(w => new Date(w.startDate).getFullYear().toString()))).sort();
    return years.map(y => ({
      value: y,
      label: `Year ${y}`
    }));
  }, [weeks]);

  // Identify dynamic current week based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeekIdx = useMemo(() => {
    if (!weeks || weeks.length === 0) return -1;
    const idx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
    if (idx !== -1) return idx;
    if (weeks.length > 0 && todayStr < weeks[0].startDate) return 0;
    return Math.max(0, weeks.length - 1);
  }, [weeks, todayStr]);

  const currentWeek = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : undefined;
  const currentLabel = currentWeek ? `W${currentWeek.week}` : '';

  // Validation: check if From > To
  const isInvalidRange = useMemo(() => {
    if (weeks.length === 0) return false;
    if (granularity === 'week') {
      return Number(fromWeek) > Number(toWeek);
    }
    if (granularity === 'day') {
      return fromDay > toDay;
    }
    if (granularity === 'year') {
      return Number(fromYear) > Number(toYear);
    }
    return false;
  }, [granularity, fromWeek, toWeek, fromDay, toDay, fromYear, toYear, weeks.length]);

  // Reset filter to project's entire span
  const handleResetFilter = () => {
    if (weeks.length > 0) {
      setFromWeek('1');
      setToWeek(String(weeks.length));
      setFromDay(projectData.startDate || weeks[0].startDate);
      setToDay(projectData.endDate || weeks[weeks.length - 1].endDate);
      const yStart = new Date(weeks[0].startDate).getFullYear().toString();
      const yEnd = new Date(weeks[weeks.length - 1].endDate).getFullYear().toString();
      setFromYear(yStart);
      setToYear(yEnd);
    }
  };

  const isFiltered = useMemo(() => {
    if (weeks.length === 0) return false;
    if (granularity === 'week') {
      return fromWeek !== '1' || toWeek !== String(weeks.length);
    }
    if (granularity === 'day') {
      const defStart = projectData.startDate || weeks[0]?.startDate;
      const defEnd = projectData.endDate || weeks[weeks.length - 1]?.endDate;
      return (fromDay !== '' && fromDay !== defStart) || (toDay !== '' && toDay !== defEnd);
    }
    if (granularity === 'year') {
      const yStart = new Date(weeks[0]?.startDate).getFullYear().toString();
      const yEnd = new Date(weeks[weeks.length - 1]?.endDate).getFullYear().toString();
      return fromYear !== yStart || toYear !== yEnd;
    }
    return false;
  }, [granularity, fromWeek, toWeek, fromDay, toDay, fromYear, toYear, weeks, projectData.startDate, projectData.endDate]);

  // Overall KPI statistics
  const elapsedWeeks = currentWeekIdx >= 0 ? weeks.slice(0, currentWeekIdx + 1) : [];
  const latestActual = elapsedWeeks.filter(w => w.actualCumulative > 0).at(-1);
  const realisasiValue = latestActual
    ? latestActual.actualCumulative
    : (projectData.overallProgress ? Number(projectData.overallProgress) : 0);

  const deviation = currentWeek
    ? Number((realisasiValue - (currentWeek.plannedCumulative || 0)).toFixed(1))
    : 0;

  // Build filtered chart points based on active granularity & period
  const chartData: ChartPoint[] = useMemo(() => {
    if (weeks.length === 0) return [];

    if (granularity === 'week') {
      const fW = !isInvalidRange ? (Number(fromWeek) || 1) : 1;
      const tW = !isInvalidRange ? (Number(toWeek) || weeks.length) : weeks.length;
      const targetWeeks = weeks.filter(w => w.week >= fW && w.week <= tW);

      return targetWeeks.map((w) => {
        const globalIdx = weeks.findIndex(item => item.week === w.week);
        const hasActual = globalIdx <= currentWeekIdx && w.actualCumulative > 0;
        return {
          name: `W${w.week}`,
          subLabel: `${formatDateDisplay(w.startDate)} - ${formatDateDisplay(w.endDate)}`,
          'Plan. Cumulative': w.plannedCumulative,
          'Act. Cumulative': hasActual ? w.actualCumulative : null,
          'Planned (Weekly)': w.planned,
          'Actual (Weekly)': globalIdx <= currentWeekIdx && w.actual > 0 ? w.actual : null,
          deviation: hasActual ? Number((w.actualCumulative - w.plannedCumulative).toFixed(2)) : null,
          rawWeek: w,
        };
      });
    }

    if (granularity === 'day') {
      // Free calendar day-by-day range
      const fD = (!isInvalidRange && fromDay) ? fromDay : (projectData.startDate || weeks[0]?.startDate || '');
      const tD = (!isInvalidRange && toDay) ? toDay : (projectData.endDate || weeks[weeks.length - 1]?.endDate || '');
      if (!fD || !tD) return [];

      const parseDate = (str: string) => {
        const parts = str.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
      };

      const startDateObj = parseDate(fD);
      const endDateObj = parseDate(tD);

      const points: ChartPoint[] = [];
      const curr = new Date(startDateObj);

      while (curr <= endDateObj && points.length < 1000) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dStr = `${y}-${m}-${d}`;

        const wIdx = weeks.findIndex(w => dStr >= w.startDate && dStr <= w.endDate);

        let planCum = 0;
        let actCum: number | null = null;
        let dailyPlan = 0;
        let dailyAct: number | null = null;

        if (wIdx !== -1) {
          const w = weeks[wIdx];
          const wStart = parseDate(w.startDate);
          const dayDiff = Math.max(0, Math.min(6, Math.round((curr.getTime() - wStart.getTime()) / (1000 * 60 * 60 * 24))));
          const prevWeekPlan = wIdx > 0 ? weeks[wIdx - 1].plannedCumulative : 0;

          planCum = Number((prevWeekPlan + (w.planned * (dayDiff + 1) / 7)).toFixed(2));
          dailyPlan = Number((w.planned / 7).toFixed(2));

          if (dStr <= todayStr) {
            if (wIdx < currentWeekIdx) {
              const prevWeekAct = wIdx > 0 ? weeks[wIdx - 1].actualCumulative : 0;
              actCum = Number((prevWeekAct + (w.actual * (dayDiff + 1) / 7)).toFixed(2));
              dailyAct = Number((w.actual / 7).toFixed(2));
            } else if (wIdx === currentWeekIdx) {
              const prevWeekAct = wIdx > 0 ? weeks[wIdx - 1].actualCumulative : 0;
              const todayObj = parseDate(todayStr);
              const daysElapsedInCurrWeek = Math.max(1, Math.min(7, Math.round((todayObj.getTime() - wStart.getTime()) / (1000 * 60 * 60 * 24)) + 1));
              const actualGainedThisWeek = Math.max(0, realisasiValue - prevWeekAct);
              actCum = Number((prevWeekAct + (actualGainedThisWeek * (dayDiff + 1) / daysElapsedInCurrWeek)).toFixed(2));
              dailyAct = Number((actualGainedThisWeek / daysElapsedInCurrWeek).toFixed(2));
            }
          }
        } else if (dStr < (weeks[0]?.startDate || '')) {
          planCum = 0;
          dailyPlan = 0;
          if (dStr <= todayStr) {
            actCum = 0;
            dailyAct = 0;
          }
        } else {
          // After final project week
          planCum = 100;
          dailyPlan = 0;
          if (dStr <= todayStr) {
            actCum = realisasiValue;
            dailyAct = 0;
          }
        }

        const dev = actCum !== null ? Number((actCum - planCum).toFixed(2)) : null;

        points.push({
          name: formatDateDisplay(dStr),
          subLabel: wIdx !== -1 ? `Week ${weeks[wIdx].week}` : '',
          'Plan. Cumulative': Math.min(100, Math.max(0, planCum)),
          'Act. Cumulative': actCum !== null ? Math.min(100, Math.max(0, actCum)) : null,
          'Planned (Weekly)': dailyPlan,
          'Actual (Weekly)': dailyAct,
          deviation: dev,
          rawWeek: wIdx !== -1 ? weeks[wIdx] : undefined,
        });

        curr.setDate(curr.getDate() + 1);
      }

      return points;
    }

    if (granularity === 'year') {
      const fY = !isInvalidRange ? (Number(fromYear) || 2000) : 2000;
      const tY = !isInvalidRange ? (Number(toYear) || 2099) : 2099;

      // Group weeks by Year
      const yearMap = new Map<number, typeof weeks>();
      weeks.forEach(w => {
        const yr = new Date(w.startDate).getFullYear();
        if (yr >= fY && yr <= tY) {
          if (!yearMap.has(yr)) yearMap.set(yr, []);
          yearMap.get(yr)!.push(w);
        }
      });

      const points: ChartPoint[] = [];
      const sortedYears = Array.from(yearMap.keys()).sort();

      sortedYears.forEach(yr => {
        const yrWeeks = yearMap.get(yr)!;
        const lastWeekInYr = yrWeeks[yrWeeks.length - 1];
        const lastIdx = weeks.findIndex(item => item.week === lastWeekInYr.week);
        const hasActual = lastIdx <= currentWeekIdx && lastWeekInYr.actualCumulative > 0;

        const sumPlanned = yrWeeks.reduce((acc, w) => acc + w.planned, 0);
        const sumActual = yrWeeks.filter((w) => {
          const idx = weeks.findIndex(item => item.week === w.week);
          return idx <= currentWeekIdx && w.actual > 0;
        }).reduce((acc, w) => acc + w.actual, 0);

        points.push({
          name: String(yr),
          subLabel: `${yrWeeks.length} Weeks`,
          'Plan. Cumulative': lastWeekInYr.plannedCumulative,
          'Act. Cumulative': hasActual ? lastWeekInYr.actualCumulative : null,
          'Planned (Weekly)': Number(sumPlanned.toFixed(2)),
          'Actual (Weekly)': hasActual ? Number(sumActual.toFixed(2)) : null,
          deviation: hasActual ? Number((lastWeekInYr.actualCumulative - lastWeekInYr.plannedCumulative).toFixed(2)) : null,
          rawWeek: lastWeekInYr,
        });
      });

      return points;
    }

    return [];
  }, [weeks, granularity, fromWeek, toWeek, fromDay, toDay, fromYear, toYear, isInvalidRange, currentWeekIdx, realisasiValue, projectData.startDate, projectData.endDate, todayStr]);

  const currentTimelineX = useMemo(() => {
    if (granularity === 'week') {
      return currentLabel && chartData.some(d => d.name === currentLabel) ? currentLabel : undefined;
    }
    if (granularity === 'day') {
      const todayFormatted = formatDateDisplay(todayStr);
      return chartData.some(d => d.name === todayFormatted) ? todayFormatted : undefined;
    }
    if (granularity === 'year') {
      const thisYr = String(new Date().getFullYear());
      return chartData.some(d => d.name === thisYr) ? thisYr : undefined;
    }
    return undefined;
  }, [granularity, currentLabel, todayStr, chartData]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const isCurrentDate = label === currentLabel || (granularity === 'day' && label === formatDateDisplay(todayStr));
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xl text-[12px] space-y-1.5">
        <div className="font-bold text-neutral-800 border-b border-neutral-100 pb-1 flex items-center justify-between gap-4">
          <span>{label}</span>
          {isCurrentDate && (
            <span className="text-[10px] font-bold bg-danger text-white px-1.5 py-0.2 rounded">Current</span>
          )}
        </div>
        {payload.map((p: any) => p.value != null && (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
              <span className="text-neutral-600 font-medium">{p.name}:</span>
            </div>
            <span className="font-bold text-neutral-900">{Number(p.value).toFixed(2)}%</span>
          </div>
        ))}
      </div>
    );
  };

  const handleExportCSV = () => {
    const headers = ['Period', 'Planned (%)', 'Actual (%)', 'Plan. Cumulative (%)', 'Act. Cumulative (%)', 'Deviation (%)'];
    const rows = chartData.map(d => [
      d.name,
      d['Planned (Weekly)'] ?? '-',
      d['Actual (Weekly)'] ?? '-',
      d['Plan. Cumulative'] ?? '-',
      d['Act. Cumulative'] ?? '-',
      d.deviation !== null && d.deviation !== undefined ? `${d.deviation}%` : '-'
    ]);
    exportToCSV(`SCurve_${granularity}_${new Date().toISOString().slice(0,10)}`, headers, rows);
  };

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title={`S-Curve Analysis ${project?.name || projectData?.name ? `· ${project?.name || projectData?.name}` : ''}`}
        subtitle={userRole === 'admin_progres' ? 'Admin Progres View — Cumulative S-Curve progress monitoring' : 'Planned vs. Actual cumulative progress tracking over project lifecycle'}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200">
              <button
                onClick={() => setViewMode('cumulative')}
                className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'cumulative'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Cumulative S-Curve
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'weekly'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Weekly Progress
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV} icon={Download} className="text-[12px] h-[34px]">
              <span className="hidden sm:inline">Export Data</span>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: 'Target S-Curve',
            value: `${(weeks.length > 0 ? (weeks.at(-1)?.plannedCumulative ?? 100) : 0).toFixed(1)}%`,
            sub: weeks.length > 0 ? `Target at completion (W${weeks.length})` : 'No schedule available',
          },
          {
            label: 'Cumulative Actual',
            value: `${realisasiValue.toFixed(1)}%`,
            sub: currentLabel ? `Reported as of ${currentLabel}` : 'No active period',
          },
          {
            label: 'Progress Deviation',
            value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`,
            sub: deviation >= 0 ? 'Ahead of scheduled pace' : 'Behind scheduled pace',
            accent: deviation < 0 ? 'danger' : 'success',
          },
          {
            label: 'Reported Periods',
            value: `${weeks.length > 0 && currentWeekIdx >= 0 ? Math.min(weeks.length, currentWeekIdx + 1) : 0} Weeks`,
            sub: `of ${weeks.length} project weeks`,
          },
        ].map(({ label, value, sub, accent }) => (
          <Card key={label} className="p-4">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">{label}</div>
            <div className={`text-[20px] sm:text-[22px] font-bold ${
              accent === 'danger' ? 'text-danger' : accent === 'success' ? 'text-success' : 'text-neutral-900'
            }`}>
              {value}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>
          </Card>
        ))}
      </div>

      {/* S-Curve Range & Granularity Filter Bar (100% Data-Driven) */}
      <Card className="p-4 bg-white border border-neutral-200/90 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Granularity Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-brand" />
              Granularity:
            </span>
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
              {(['day', 'week', 'year'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1 rounded-md text-[12px] font-bold capitalize transition-all ${
                    granularity === g
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {g === 'day' ? 'Day' : g === 'week' ? 'Week' : 'Year'}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Dynamic From / To Range Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-neutral-600">From:</span>
              {granularity === 'week' && (
                <select
                  value={fromWeek}
                  onChange={e => setFromWeek(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs"
                >
                  {weekOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {granularity === 'day' && (
                <input
                  type="date"
                  value={fromDay}
                  min={projectData.startDate || (weeks.length > 0 ? weeks[0].startDate : undefined)}
                  max={toDay || projectData.endDate || (weeks.length > 0 ? weeks[weeks.length - 1].endDate : undefined)}
                  onChange={e => setFromDay(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs text-neutral-700 cursor-pointer"
                />
              )}
              {granularity === 'year' && (
                <select
                  value={fromYear}
                  onChange={e => setFromYear(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs"
                >
                  {yearOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-neutral-600">To:</span>
              {granularity === 'week' && (
                <select
                  value={toWeek}
                  onChange={e => setToWeek(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs"
                >
                  {weekOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {granularity === 'day' && (
                <input
                  type="date"
                  value={toDay}
                  min={fromDay || projectData.startDate || (weeks.length > 0 ? weeks[0].startDate : undefined)}
                  max={projectData.endDate || (weeks.length > 0 ? weeks[weeks.length - 1].endDate : undefined)}
                  onChange={e => setToDay(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs text-neutral-700 cursor-pointer"
                />
              )}
              {granularity === 'year' && (
                <select
                  value={toYear}
                  onChange={e => setToYear(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-brand shadow-2xs"
                >
                  {yearOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilter}
                className="text-[12px] h-8 text-neutral-600 hover:text-brand"
                icon={RotateCcw}
              >
                Reset Filter
              </Button>
            )}
          </div>
        </div>

        {/* Validation Warning when From > To */}
        {isInvalidRange && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px] flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
            <span>Invalid range selection: 'From' value cannot exceed 'To' value. Chart displaying the full project timeline.</span>
          </div>
        )}
      </Card>

      {/* Main Chart Card: Takes 100% Width & Height */}
      <Card className="p-5 !border-0 !shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-brand" />
            <span className="text-[14px] font-bold text-neutral-800 tracking-tight">
              {viewMode === 'cumulative' ? 'Cumulative Progress S-Curve (Planning vs. Actual)' : 'Periodic Progress Distribution (Planning vs. Actual)'}
              {isFiltered && <span className="ml-2 text-[12px] font-normal text-brand bg-brand/10 px-2 py-0.5 rounded-full">Filtered View</span>}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[12px] text-neutral-500 font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <span>Planned Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-success" />
              <span>Actual Realization</span>
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="w-full h-72 flex flex-col items-center justify-center text-center p-6 bg-neutral-50/50 rounded-xl border border-dashed border-neutral-200">
            <TrendingUp size={36} className="text-neutral-300 mb-2" />
            <div className="text-[14px] font-bold text-neutral-700">No S-Curve Data Available</div>
            <div className="text-[12px] text-neutral-500 max-w-sm mt-1">
              This project does not have a scheduled timeline yet. Create or update the task schedule to generate the S-Curve.
            </div>
          </div>
        ) : (
          <div className="w-full h-80 sm:h-96 lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'cumulative' ? (
                <ComposedChart data={chartData} margin={{ top: 32, right: 24, bottom: 10, left: -10 }}>
                  <defs>
                    <linearGradient id="planGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E46D9" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1E46D9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F6" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    interval={granularity === 'day' && chartData.length > 20 ? Math.ceil(chartData.length / 10) : 0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  {currentTimelineX && (
                    <ReferenceLine
                      x={currentTimelineX}
                      stroke="#DC2626"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Current Timeline',
                        position: 'top',
                        dy: -6,
                        fontSize: 11,
                        fill: '#DC2626',
                        fontWeight: 700
                      }}
                    />
                  )}
                  <Area type="monotone" dataKey="Plan. Cumulative" stroke="#1E46D9" strokeWidth={2.5} fill="url(#planGrad)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="Act. Cumulative" stroke="#16A34A" strokeWidth={2.5} fill="url(#actGrad)" dot={false} connectNulls={false} activeDot={{ r: 4 }} />
                </ComposedChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 32, right: 24, bottom: 10, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F6" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    interval={granularity === 'day' && chartData.length > 20 ? Math.ceil(chartData.length / 10) : 0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  {currentTimelineX && (
                    <ReferenceLine
                      x={currentTimelineX}
                      stroke="#DC2626"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Current Timeline',
                        position: 'top',
                        dy: -6,
                        fontSize: 11,
                        fill: '#DC2626',
                        fontWeight: 700
                      }}
                    />
                  )}
                  <Bar dataKey="Planned (Weekly)" fill="#1E46D9" opacity={0.75} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Actual (Weekly)" fill="#16A34A" opacity={0.85} radius={[2, 2, 0, 0]} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Supporting Data Table Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable(v => !v)}
            className="text-[12px] font-semibold text-neutral-600 hover:text-brand"
            icon={showTable ? EyeOff : Eye}
          >
            {showTable ? 'Hide Supporting Data Matrix' : 'Show Supporting Data Matrix'}
          </Button>
          <span className="text-[11.5px] text-neutral-400">Showing filtered period records ({chartData.length} records)</span>
        </div>

        {showTable && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin max-h-96">
              <table className="w-full min-w-[760px]">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-left">Description / Range</th>
                    <th className="px-4 py-3 text-right">Planned (%)</th>
                    <th className="px-4 py-3 text-right">Actual (%)</th>
                    <th className="px-4 py-3 text-right">Plan. Cumulative</th>
                    <th className="px-4 py-3 text-right">Act. Cumulative</th>
                    <th className="px-4 py-3 text-right">Deviation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-[12.5px]">
                  {chartData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                        No data available for this filter range.
                      </td>
                    </tr>
                  ) : (
                    chartData.map((d, i) => {
                      const isCurrent = d.name === currentLabel || (granularity === 'day' && d.name === formatDateDisplay(todayStr));
                      return (
                        <tr
                          key={d.name + i}
                          className={`transition-colors ${
                            isCurrent
                              ? 'bg-brand-light/60 font-semibold'
                              : 'hover:bg-neutral-50/70'
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-900">{d.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-danger text-white shadow-2xs">
                                  Current
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600 text-[12px] whitespace-nowrap">
                            {d.subLabel || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-brand">
                            {d['Planned (Weekly)'] != null ? `${d['Planned (Weekly)']}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-success">
                            {d['Actual (Weekly)'] != null ? `${d['Actual (Weekly)']}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-brand">
                            {d['Plan. Cumulative'] != null ? `${d['Plan. Cumulative']}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-success">
                            {d['Act. Cumulative'] != null ? `${d['Act. Cumulative']}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {d.deviation !== null && d.deviation !== undefined ? (
                              <span className={`font-bold ${d.deviation >= 0 ? 'text-success' : 'text-danger'}`}>
                                {d.deviation >= 0 ? '+' : ''}{d.deviation}%
                              </span>
                            ) : (
                              <span className="text-neutral-300 font-normal">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
