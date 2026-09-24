import { useState, useEffect, useMemo, Fragment } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Project, PROJECT, WeekData, SubSubtask } from '@/data/mockData';
import { recalculateWeeklyData } from '@/utils/weeklyEngine';
import { PageHeader, Card, Button, Toast, formatDateDisplay, StatusBadge } from '@/components/ui';
import { Info, ChevronLeft, ChevronRight, ChevronDown, Check, Calendar, TrendingUp, Edit3, X, Loader2, Layers } from 'lucide-react';

const PAGE_SIZE = 10;

export default function WeeklyPage() {
  const pageProps = usePage().props as any;
  const project = pageProps?.project;

  const [projectData, setProjectData] = useState<Project>(() => {
    const raw = project && project.mainJobs ? project : PROJECT;
    return recalculateWeeklyData(raw);
  });

  useEffect(() => {
    if (project && project.mainJobs) {
      setProjectData(recalculateWeeklyData(project));
    }
  }, [project]);

  const weeks = projectData.weeklyData;
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [editMode, setEditMode] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const totalPages = Math.ceil(weeks.length / PAGE_SIZE);
  const visible = weeks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({});

  const toggleWeek = (weekNo: number) => {
    setExpandedWeeks(prev => ({ ...prev, [weekNo]: !prev[weekNo] }));
  };

  // Collect all subtasks from project
  const allTasks = useMemo(() => {
    const list: (SubSubtask & { mainJobName?: string; subMainJobName?: string })[] = [];
    projectData.mainJobs?.forEach(mj => {
      mj.subMainJobs?.forEach(smj => {
        smj.subtasks?.forEach(st => {
          list.push({
            ...st,
            mainJobName: mj.name,
            subMainJobName: smj.name
          });
        });
      });
    });
    return list;
  }, [projectData]);

  // Map tasks active/scheduled in each week
  const tasksByWeek = useMemo(() => {
    const map: Record<number, typeof allTasks> = {};
    weeks.forEach(w => {
      map[w.week] = allTasks.filter(t => {
        if (!t.startDate || !t.finishDate) return false;
        return t.startDate <= w.endDate && t.finishDate >= w.startDate;
      });
    });
    return map;
  }, [weeks, allTasks]);

  // Active current week based on today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  let currentWeekIdx = weeks.findIndex(w => todayStr >= w.startDate && todayStr <= w.endDate);
  if (currentWeekIdx === -1) {
    currentWeekIdx = (weeks.length > 0 && todayStr < weeks[0].startDate) ? 0 : Math.max(0, weeks.length - 1);
  }

  const handleEdit = (weekNo: number, val: string) => {
    setEditing(p => ({ ...p, [weekNo]: val }));
  };

  const startEdit = (weekNo: number, currentActual: number) => {
    setEditing(p => ({ ...p, [weekNo]: String(currentActual || '') }));
    setEditMode(p => ({ ...p, [weekNo]: true }));
  };

  const cancelEdit = (weekNo: number) => {
    setEditMode(p => ({ ...p, [weekNo]: false }));
  };

  const handleSave = (weekNo: number) => {
    const val = parseFloat(editing[weekNo]);
    if (isNaN(val) || val < 0) {
      setToastMsg('Please enter a valid value (0 or greater).');
      return;
    }

    if (projectData.id) {
      setSaving(p => ({ ...p, [weekNo]: true }));
      router.post(`/projects/${projectData.id}/weekly`, {
        week: weekNo,
        actual: val,
      }, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            const weekIndex = newData.weeklyData.findIndex(w => w.week === weekNo);
            if (weekIndex !== -1) {
              newData.weeklyData[weekIndex].actual = val;
            }
            return recalculateWeeklyData(newData);
          });
          setSaved(p => ({ ...p, [weekNo]: true }));
          setEditMode(p => ({ ...p, [weekNo]: false }));
          setSaving(p => ({ ...p, [weekNo]: false }));
          setToastMsg(`Actual progress for W${weekNo} (${val}%) saved successfully.`);
          setTimeout(() => setSaved(p => ({ ...p, [weekNo]: false })), 2000);
        },
        onError: (errors) => {
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Failed to save: ${errText || 'An error occurred'}`);
          setSaving(p => ({ ...p, [weekNo]: false }));
        },
        onFinish: () => setSaving(p => ({ ...p, [weekNo]: false })),
      });
    } else {
      setProjectData(prev => {
        const newData = { ...prev };
        const weekIndex = newData.weeklyData.findIndex(w => w.week === weekNo);
        if (weekIndex !== -1) {
          newData.weeklyData[weekIndex].actual = val;
        }
        return recalculateWeeklyData(newData);
      });
      setSaved(p => ({ ...p, [weekNo]: true }));
      setEditMode(p => ({ ...p, [weekNo]: false }));
      setToastMsg(`Actual progress for W${weekNo} (${val}%) saved successfully.`);
      setTimeout(() => setSaved(p => ({ ...p, [weekNo]: false })), 2000);
    }
  };

  const totalPlanned = weeks.reduce((a, w) => a + w.planned, 0);
  const totalActual = weeks.filter(w => w.actual > 0).reduce((a, w) => a + w.actual, 0);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Weekly Progress"
        subtitle="System-generated weekly schedule with Planned vs. Actual tracking"
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Periods', value: `${weeks.length} Weeks`, sub: 'Total project span' },
          { label: 'Reported Periods', value: `${weeks.filter(w => w.actual > 0).length} Weeks`, sub: 'With actual progress' },
          { label: 'Planned Target', value: `${totalPlanned.toFixed(1)}%`, sub: 'Total scheduled weight' },
          { label: 'Actual Progress', value: `${totalActual.toFixed(1)}%`, sub: 'Cumulative actual progress' },
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
                <th className="px-4 py-3 text-right">Planned Cumulative (%)</th>
                <th className="px-4 py-3 text-right">Actual Cumulative (%)</th>
                <th className="px-4 py-3 text-right">Deviation (%)</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-[12.5px]">
              {visible.map((w) => {
                const isCurrent = w.week === currentWeekIdx + 1;
                const hasActual = w.actual > 0;
                const editVal = editing[w.week];
                const deviation = hasActual ? (w.actualCumulative - w.plannedCumulative) : null;
                const isExpanded = !!expandedWeeks[w.week];
                const weekTasks = tasksByWeek[w.week] || [];

                return (
                  <Fragment key={w.week}>
                    <tr
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-brand-light/60 font-medium'
                          : 'hover:bg-neutral-50/70'
                      }`}
                    >
                      {/* Week No */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWeek(w.week)}
                            className="p-1 -ml-1 rounded hover:bg-neutral-200/60 text-neutral-500 hover:text-brand transition-colors inline-flex items-center justify-center"
                            title={isExpanded ? "Collapse tasks" : "Expand task details"}
                          >
                            {isExpanded ? (
                              <ChevronDown size={15} className="text-brand stroke-[2.5]" />
                            ) : (
                              <ChevronRight size={15} className="stroke-[2]" />
                            )}
                          </button>
                          <span className="font-bold text-neutral-900">W{w.week}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand text-white shadow-xs">
                              Current
                            </span>
                          )}
                          {weekTasks.length > 0 && (
                            <span className="text-[10.5px] text-neutral-400 font-medium">
                              ({weekTasks.length})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-4 py-3 text-neutral-600 whitespace-nowrap text-[12px]">
                        {formatDateDisplay(w.startDate)} → {formatDateDisplay(w.endDate)}
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
                        {hasActual && !editMode[w.week] ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-success rounded-full"
                                style={{ width: `${Math.min(100, w.actual * 20)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-success">{w.actual.toFixed(2)}%</span>
                            <button
                              onClick={() => startEdit(w.week, w.actual)}
                              className="p-1 rounded text-neutral-400 hover:text-brand hover:bg-neutral-100 transition-colors ml-1"
                              title="Edit actual progress"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="0.00"
                              value={editVal ?? ''}
                              onChange={e => handleEdit(w.week, e.target.value)}
                              className="w-20 px-2 py-1 rounded border border-neutral-200 text-[12px] outline-none focus:border-brand bg-white text-center shadow-xs"
                            />
                            {editMode[w.week] && (
                              <button
                                onClick={() => cancelEdit(w.week)}
                                className="p-1 rounded text-neutral-400 hover:text-danger hover:bg-red-50 transition-colors"
                                title="Cancel edit"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
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
                        {(!hasActual || editMode[w.week]) && editVal !== undefined && editVal !== '' ? (
                          <Button
                            variant={saved[w.week] ? 'secondary' : 'primary'}
                            size="sm"
                            loading={saving[w.week]}
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

                    {/* Accordion Detail Row */}
                    {isExpanded && (
                      <tr className="bg-neutral-50/70 border-b border-neutral-200/80">
                        <td colSpan={8} className="p-0">
                          <div className="px-5 py-3.5 bg-neutral-50/90 border-y border-neutral-200/70">
                            <div className="flex items-center justify-between mb-2.5">
                              <div className="flex items-center gap-2">
                                <Layers size={14} className="text-brand" />
                                <span className="text-[12px] font-bold text-neutral-800 uppercase tracking-wide">
                                  Tasks in Week {w.week}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-brand/10 text-brand">
                                  {weekTasks.length} {weekTasks.length === 1 ? 'task' : 'tasks'}
                                </span>
                              </div>
                              <span className="text-[11.5px] text-neutral-400">
                                {formatDateDisplay(w.startDate)} — {formatDateDisplay(w.endDate)}
                              </span>
                            </div>

                            {weekTasks.length === 0 ? (
                              <div className="text-[12px] text-neutral-400 italic py-2 pl-6">
                                Tidak ada task yang terjadwal di minggu ini.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                                {weekTasks.map(t => (
                                  <div
                                    key={t.id || t.code}
                                    className="bg-white border border-neutral-200 rounded-lg p-3 shadow-xs flex flex-col justify-between gap-2 hover:border-brand/40 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-1.5 min-w-0">
                                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-brand/10 text-brand shrink-0">
                                          {t.code}
                                        </span>
                                        <span className="text-[12px] font-medium text-neutral-800 line-clamp-2" title={t.name}>
                                          {t.name}
                                        </span>
                                      </div>
                                      <StatusBadge status={t.status} />
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1.5 border-t border-neutral-100">
                                      <span>Bobot: {t.weight}%</span>
                                      <span className="font-semibold text-neutral-700">Progress: {t.progress}%</span>
                                      <span className="text-[10px] text-neutral-400">{formatDateDisplay(t.startDate)} - {formatDateDisplay(t.finishDate)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
