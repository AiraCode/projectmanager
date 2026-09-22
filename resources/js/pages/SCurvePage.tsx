import { useState } from 'react';
import { usePage } from '@inertiajs/react';
import { Project, PROJECT } from '@/data/mockData';
import { recalculateWeeklyData } from '@/utils/weeklyEngine';
import { exportToCSV } from '@/utils/exportEngine';
import { PageHeader, Card, Button, formatDateDisplay } from '@/components/ui';
import { TrendingUp, BarChart2, Calendar, Eye, EyeOff, Download } from 'lucide-react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, ReferenceLine
} from 'recharts';

type ViewMode = 'cumulative' | 'weekly';

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

  const weeks = projectData.weeklyData;

  // Identify dynamic current week based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeekIdx = useMemo(() => {
    const idx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
    if (idx !== -1) return idx;
    if (weeks.length > 0 && todayStr < weeks[0].startDate) return 0;
    return Math.max(0, weeks.length - 1);
  }, [weeks, todayStr]);

  const currentWeek = weeks[currentWeekIdx];
  const currentLabel = currentWeek ? `W${currentWeek.week}` : (weeks[0] ? `W${weeks[0].week}` : 'W1');

  const chartData = weeks.map((w, idx) => ({
    name: `W${w.week}`,
    'Plan. Cumulative': w.plannedCumulative,
    'Act. Cumulative': idx <= currentWeekIdx && w.actualCumulative > 0 ? w.actualCumulative : null,
    'Planned (Weekly)': w.planned,
    'Actual (Weekly)': idx <= currentWeekIdx && w.actual > 0 ? w.actual : null,
  }));

  const elapsedWeeks = weeks.slice(0, currentWeekIdx + 1);
  const latestActual = elapsedWeeks.filter(w => w.actualCumulative > 0).at(-1);
  const realisasiValue = latestActual
    ? latestActual.actualCumulative
    : (projectData.overallProgress ? Number(projectData.overallProgress) : 0);

  const deviation = currentWeek
    ? Number((realisasiValue - (currentWeek.plannedCumulative || 0)).toFixed(1))
    : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xl text-[12px] space-y-1.5">
        <div className="font-bold text-neutral-800 border-b border-neutral-100 pb-1 flex items-center justify-between gap-4">
          <span>{label}</span>
          {label === currentLabel && (
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
    const headers = ['Week', 'Start Date', 'End Date', 'Planned Weekly (%)', 'Actual Weekly (%)', 'Planned Cumulative (%)', 'Actual Cumulative (%)', 'Deviation (%)'];
    const rows = weeks.map(w => {
      const variance = w.actualCumulative > 0 ? w.actualCumulative - w.plannedCumulative : null;
      return [
        `W${w.week}`,
        w.startDate,
        w.endDate,
        w.planned,
        w.actual > 0 ? w.actual : '-',
        w.plannedCumulative,
        w.actualCumulative > 0 ? w.actualCumulative : '-',
        variance !== null ? variance : '-'
      ];
    });
    
    exportToCSV(`SCurve_Data_Export_${new Date().toISOString().slice(0,10)}`, headers, rows);
  };

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title={`S-Curve Analysis ${project?.name ? `· ${project.name}` : ''}`}
        subtitle={userRole === 'admin_progres' ? 'Mode Khusus Admin Progres — Pemantauan grafik S-Curve kemajuan kumulatif' : 'Planned vs. Actual cumulative progress tracking over project lifecycle'}
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
            value: `${(weeks.at(-1)?.plannedCumulative ?? 100).toFixed(1)}%`,
            sub: `Target at completion (W${weeks.length})`,
          },
          {
            label: 'Realisasi Kumulatif',
            value: `${realisasiValue.toFixed(1)}%`,
            sub: `Reported as of ${currentLabel}`,
          },
          {
            label: 'Deviasi Progres',
            value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`,
            sub: deviation >= 0 ? 'Ahead of scheduled pace' : 'Behind scheduled pace',
            accent: deviation < 0 ? 'danger' : 'success',
          },
          {
            label: 'Reported Periods',
            value: `${Math.min(weeks.length, currentWeekIdx + 1)} Minggu`,
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

      {/* Main Chart Card */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-brand" />
            <span className="text-[14px] font-bold text-neutral-800 tracking-tight">
              {viewMode === 'cumulative' ? 'Cumulative Progress S-Curve (Planning vs. Actual)' : 'Weekly Progress Distribution (Planning vs. Actual)'}
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

        <div className="w-full h-80 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'cumulative' ? (
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: -10 }}>
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
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                {currentLabel && (
                  <ReferenceLine
                    x={currentLabel}
                    stroke="#DC2626"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{ value: 'Current Timeline', position: 'top', fontSize: 10, fill: '#DC2626', fontWeight: 600 }}
                  />
                )}
                <Area type="monotone" dataKey="Plan. Cumulative" stroke="#1E46D9" strokeWidth={2.5} fill="url(#planGrad)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="Act. Cumulative" stroke="#16A34A" strokeWidth={2.5} fill="url(#actGrad)" dot={false} connectNulls={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            ) : (
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F6" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Bar dataKey="Planned (Weekly)" fill="#1E46D9" opacity={0.75} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Actual (Weekly)" fill="#16A34A" opacity={0.85} radius={[2, 2, 0, 0]} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
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
          <span className="text-[11.5px] text-neutral-400">Showing cumulative and weekly progress values</span>
        </div>

        {showTable && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin max-h-96">
              <table className="w-full min-w-[760px]">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Week</th>
                    <th className="px-4 py-3 text-left">Period Range</th>
                    <th className="px-4 py-3 text-right">Planned (%)</th>
                    <th className="px-4 py-3 text-right">Actual (%)</th>
                    <th className="px-4 py-3 text-right">Plan. Cumulative</th>
                    <th className="px-4 py-3 text-right">Act. Cumulative</th>
                    <th className="px-4 py-3 text-right">Deviation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-[12.5px]">
                  {weeks.map((w, i) => {
                    const variance = w.actualCumulative > 0 ? w.actualCumulative - w.plannedCumulative : null;
                    const isCurrent = `W${w.week}` === currentLabel;
                    return (
                      <tr
                        key={w.week}
                        className={`transition-colors ${
                          isCurrent
                            ? 'bg-brand-light/60 font-semibold'
                            : 'hover:bg-neutral-50/70'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900">W{w.week}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-danger text-white shadow-2xs">
                                Current
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600 text-[12px] whitespace-nowrap">
                          {formatDateDisplay(w.startDate)} → {formatDateDisplay(w.endDate)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-brand">
                          {w.planned.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-success">
                          {w.actual > 0 ? `${w.actual.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-brand">
                          {w.plannedCumulative.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-success">
                          {w.actualCumulative > 0 ? `${w.actualCumulative.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {variance !== null ? (
                            <span className={`font-bold ${variance >= 0 ? 'text-success' : 'text-danger'}`}>
                              {variance >= 0 ? '+' : ''}{variance.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-neutral-300 font-normal">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
