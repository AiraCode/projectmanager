import { useState } from 'react';
import { PROJECT, WeekData } from '@/data/mockData';
import { PageHeader, Card, Button, Toast } from '@/components/ui';
import { Info, ChevronLeft, ChevronRight, Check, Calendar, TrendingUp } from 'lucide-react';

const PAGE_SIZE = 10;

export default function WeeklyPage() {
  const weeks = PROJECT.weeklyData;
  const [page, setPage] = useState(2); // Start around week 21-30 for good visibility of active progress
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const totalPages = Math.ceil(weeks.length / PAGE_SIZE);
  const visible = weeks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Active current week based on date / actuals
  const currentWeekIdx = weeks.findIndex(w => w.actual === 0 && w.week > 30) - 1;

  const handleEdit = (weekNo: number, val: string) => {
    setEditing(p => ({ ...p, [weekNo]: val }));
  };

  const handleSave = (weekNo: number) => {
    setSaved(p => ({ ...p, [weekNo]: true }));
    setToastMsg(`Actual progress untuk W${weekNo} berhasil disimpan.`);
    setTimeout(() => setSaved(p => ({ ...p, [weekNo]: false })), 2000);
  };

  const totalPlanned = weeks.reduce((a, w) => a + w.planned, 0);
  const totalActual = weeks.filter(w => w.actual > 0).reduce((a, w) => a + w.actual, 0);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Weekly Implementation"
        subtitle="System-generated weekly schedule with Planned vs. Actual tracking"
      />

      {/* Auto-generation Information Banner */}
      <div className="p-4 rounded-xl bg-brand-light/70 border border-brand-border flex items-start gap-3">
        <Info size={16} className="text-brand flex-shrink-0 mt-0.5" />
        <div className="text-[12.5px] text-neutral-700 flex-1 leading-relaxed">
          <span className="font-semibold text-brand">System-Generated Weekly Periods: </span>
          The number and dates of weeks are derived automatically from the project schedule (Start: {PROJECT.startDate} → End: {PROJECT.endDate}).
          Planned weekly progress is calculated from WBS work weights, while Actual values are reported by authorized PICs.
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Periods', value: `${weeks.length} Minggu`, sub: 'Total project span' },
          { label: 'Reported Periods', value: `${weeks.filter(w => w.actual > 0).length} Minggu`, sub: 'With actual progress' },
          { label: 'Planned Target', value: `${totalPlanned.toFixed(1)}%`, sub: 'Total scheduled weight' },
          { label: 'Realized Progress', value: `${totalActual.toFixed(1)}%`, sub: 'Cumulative actual progress' },
        ].map(({ label, value, sub }) => (
          <Card key={label} className="p-4">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-[20px] sm:text-[22px] font-bold text-neutral-900">{value}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>
          </Card>
        ))}
      </div>

      {/* Weekly Schedule Table Card */}
      <Card className="overflow-hidden">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-neutral-100 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-neutral-800 tracking-tight">Implementation Matrix</span>
            <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline">({weeks.length} total weeks)</span>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <span className="text-[12px] font-medium text-neutral-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 h-8 w-8"
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1.5 h-8 w-8"
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Week</th>
                <th className="px-4 py-3 text-left">Period Range</th>
                <th className="px-4 py-3 text-left">Planned (%)</th>
                <th className="px-4 py-3 text-left">Actual (%)</th>
                <th className="px-4 py-3 text-right">Plan. Cumulative</th>
                <th className="px-4 py-3 text-right">Act. Cumulative</th>
                <th className="px-4 py-3 text-right">Deviation</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-[12.5px]">
              {visible.map((w) => {
                const isCurrent = w.week === currentWeekIdx + 1;
                const hasActual = w.actual > 0;
                const editVal = editing[w.week];
                const deviation = hasActual ? (w.actualCumulative - w.plannedCumulative) : null;

                return (
                  <tr
                    key={w.week}
                    className={`transition-colors ${
                      isCurrent
                        ? 'bg-brand-light/60 font-medium'
                        : 'hover:bg-neutral-50/70'
                    }`}
                  >
                    {/* Week No */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900">W{w.week}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand text-white shadow-xs">
                            Current
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="px-4 py-3 text-neutral-600 whitespace-nowrap text-[12px]">
                      {w.startDate} → {w.endDate}
                    </td>

                    {/* Planned */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full"
                            style={{ width: `${Math.min(100, w.planned * 20)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-neutral-800">{w.planned.toFixed(2)}%</span>
                      </div>
                    </td>

                    {/* Actual */}
                    <td className="px-4 py-3">
                      {hasActual ? (
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success rounded-full"
                              style={{ width: `${Math.min(100, w.actual * 20)}%` }}
                            />
                          </div>
                          <span className="font-semibold text-success">{w.actual.toFixed(2)}%</span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={editVal ?? ''}
                          onChange={e => handleEdit(w.week, e.target.value)}
                          className="w-20 px-2 py-1 rounded border border-neutral-200 text-[12px] outline-none focus:border-brand bg-white text-center shadow-xs"
                        />
                      )}
                    </td>

                    {/* Planned Cumulative */}
                    <td className="px-4 py-3 text-right font-semibold text-brand">
                      {w.plannedCumulative.toFixed(2)}%
                    </td>

                    {/* Actual Cumulative */}
                    <td className="px-4 py-3 text-right font-semibold text-success">
                      {w.actualCumulative > 0 ? `${w.actualCumulative.toFixed(2)}%` : '—'}
                    </td>

                    {/* Deviation */}
                    <td className="px-4 py-3 text-right">
                      {deviation !== null ? (
                        <span className={`font-bold ${deviation >= 0 ? 'text-success' : 'text-danger'}`}>
                          {deviation >= 0 ? '+' : ''}{deviation.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-neutral-300 font-normal">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-center">
                      {!hasActual && editVal !== undefined && editVal !== '' ? (
                        <Button
                          variant={saved[w.week] ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => handleSave(w.week)}
                          className="py-1 px-2.5 text-[11px]"
                        >
                          {saved[w.week] ? 'Saved ✓' : 'Save'}
                        </Button>
                      ) : (
                        <span className="text-neutral-300 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
