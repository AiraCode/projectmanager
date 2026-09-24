import { useState, useEffect, useMemo, Fragment } from 'react';
import { usePage, router } from '@inertiajs/react';
import {
  CalendarDays, Search, CheckSquare, Square, CheckCircle2,
  AlertCircle, Clock, Filter, Paperclip, X, Eye, Download,
  Layers, ArrowUpRight, Shield, AlertTriangle
} from 'lucide-react';
import { Project, PROJECT, MainJob, SubMainJob, SubSubtask, Status, EvidenceItem } from '@/data/mockData';
import { recalculateSchedule } from '@/utils/scheduleEngine';
import { recalculateProgress } from '@/utils/progressEngine';
import { StatusBadge, PageHeader, Card, Button, Modal, Toast, formatDateDisplay, formatDivisionName } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function TodayTasksPage() {
  const { user } = useAuth();
  const pageProps = usePage().props as any;
  const project = pageProps?.project;
  const divisions = pageProps?.divisions || [];

  const authUser = pageProps?.auth?.user || user;
  const rawRole = (pageProps?.userRole || authUser?.role || authUser?.rawRole || '').toString().toLowerCase();
  const isPIC    = authUser?.isPIC === true || rawRole === 'pic';
  const isWorker = authUser?.isWorker === true || rawRole === 'worker';
  const isAdmin  = authUser?.isAdminUtama === true || authUser?.isAdminProgres === true || rawRole === 'admin_utama' || rawRole === 'admin_progres' || rawRole === 'admin';

  const [projectData, setProjectData] = useState<Project>(() => {
    if (!project || !project.mainJobs) {
      return recalculateSchedule(recalculateProgress(PROJECT));
    }
    return recalculateSchedule(recalculateProgress(project));
  });

  useEffect(() => {
    if (project && project.mainJobs) {
      setProjectData(recalculateSchedule(recalculateProgress(project)));
    }
  }, [project]);

  const [search, setSearch] = useState('');
  const [filterTiming, setFilterTiming] = useState<'all' | 'due' | 'starting' | 'active' | 'overdue'>('all');
  const [filterDivision, setFilterDivision] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Evidence preview modal state
  const [evidencePreview, setEvidencePreview] = useState<EvidenceItem | null>(null);

  // Uncheck confirmation modal state
  const [uncheckConfirm, setUncheckConfirm] = useState<{
    taskId: string;
    taskName: string;
    prevProgress?: number;
  } | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Compute all tasks scheduled, starting, due, or overdue for today
  const allTodayTasks = useMemo(() => {
    const list: Array<{
      st: SubSubtask;
      parentSmj: SubMainJob;
      parentMj: MainJob;
      timingStatus: 'active' | 'starting' | 'due' | 'overdue';
    }> = [];

    projectData.mainJobs.forEach(mj => {
      mj.subMainJobs.forEach(smj => {
        smj.subtasks.forEach(st => {
          if (!st.startDate && !st.finishDate) return;
          const start = st.startDate || '';
          const end = st.finishDate || st.startDate || '';
          const isDone = st.checked || st.progress >= 100;

          if (end < todayStr && !isDone) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'overdue' });
          } else if (end === todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'due' });
          } else if (start === todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'starting' });
          } else if (start <= todayStr && end >= todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'active' });
          }
        });
      });
    });

    return list;
  }, [projectData, todayStr]);

  // Authorization check for checklist / progress update
  const isAuthorizedToCheck = (taskDivision: string) => {
    if (isAdmin || isPIC) return false;
    if (isWorker) {
      const workerDiv = (user?.division ?? pageProps?.division ?? '').trim().toLowerCase();
      const targetDiv = (taskDivision ?? '').trim().toLowerCase();
      return workerDiv !== '' && (workerDiv === targetDiv || targetDiv === 'general' || targetDiv === 'internal');
    }
    return false;
  };

  const handleProgressChange = (taskId: string, newProgress: number, authorized: boolean, taskName: string) => {
    if (!authorized) {
      if (isAdmin) {
        setToastMsg('Action Restricted: Admin role is Read-Only.');
      } else if (isPIC) {
        setToastMsg('Action Restricted: Progress can only be updated by workers of the assigned division.');
      } else {
        setToastMsg('You do not have permission to update progress for this task.');
      }
      return;
    }

    const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
    const isCompleted = clamped === 100;

    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              const prevProg = st.progress < 100 ? st.progress : (st.prevProgress || 0);
              return {
                ...st,
                progress: clamped,
                checked: isCompleted,
                prevProgress: prevProg,
              };
            }
            return st;
          })
        }))
      }));
      return recalculateSchedule(recalculateProgress(newData));
    });

    if (clamped === 100) {
      setToastMsg(`Task "${taskName}" marked as completed (100%) ✓`);
      if (projectData.id) {
        router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
          preserveScroll: true,
          preserveState: true,
        });
      }
    }
  };

  const handleCheck = (taskId: string, authorized: boolean, taskName: string) => {
    if (!authorized) {
      if (isAdmin) {
        setToastMsg('Action Restricted: Admin role is Read-Only and cannot check off tasks.');
      } else if (isPIC) {
        setToastMsg('Action Restricted: PICs can only add and schedule tasks. Completing the checklist must be performed by workers.');
      } else if (isWorker) {
        setToastMsg(`Action Restricted: You may only check tasks assigned to your division.`);
      } else {
        setToastMsg('You do not have permission to check this task.');
      }
      return;
    }

    let currentTask: SubSubtask | undefined;
    for (const mj of projectData.mainJobs) {
      for (const smj of mj.subMainJobs) {
        const found = smj.subtasks.find(st => st.id === taskId);
        if (found) {
          currentTask = found;
          break;
        }
      }
      if (currentTask) break;
    }

    if (!currentTask) return;

    if (currentTask.checked || currentTask.progress >= 100) {
      setUncheckConfirm({
        taskId,
        taskName,
        prevProgress: currentTask.prevProgress,
      });
      return;
    }

    handleProgressChange(taskId, 100, true, taskName);
  };

  const confirmUncheck = () => {
    if (!uncheckConfirm) return;
    const { taskId, prevProgress, taskName } = uncheckConfirm;
    const targetProg = (prevProgress !== undefined && prevProgress < 100) ? prevProgress : 0;

    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              return {
                ...st,
                progress: targetProg,
                checked: false,
              };
            }
            return st;
          })
        }))
      }));
      return recalculateSchedule(recalculateProgress(newData));
    });

    if (projectData.id) {
      router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
        preserveScroll: true,
        preserveState: true,
      });
    }

    setToastMsg(`Task "${taskName}" reverted to incomplete (${targetProg}%).`);
    setUncheckConfirm(null);
  };

  // Filter tasks based on search and dropdown selections
  const filteredTasks = useMemo(() => {
    return allTodayTasks.filter(({ st, parentSmj, parentMj, timingStatus }) => {
      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = st.name.toLowerCase().includes(q);
        const matchesCode = st.code.toLowerCase().includes(q);
        const matchesDiv = (st.division || parentSmj.pic || '').toLowerCase().includes(q);
        const matchesMj = parentMj.name.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesDiv && !matchesMj) return false;
      }

      // Timing status
      if (filterTiming !== 'all' && timingStatus !== filterTiming) {
        return false;
      }

      // Division
      if (filterDivision !== 'all') {
        const div = (st.division || parentSmj.pic || '').toLowerCase();
        if (div !== filterDivision.toLowerCase()) return false;
      }

      // Status
      if (filterStatus !== 'all') {
        const isDone = st.checked || st.progress >= 100;
        if (filterStatus === 'completed' && !isDone) return false;
        if (filterStatus === 'in_progress' && (isDone || st.progress === 0)) return false;
        if (filterStatus === 'open' && (isDone || st.progress > 0)) return false;
      }

      return true;
    });
  }, [allTodayTasks, search, filterTiming, filterDivision, filterStatus]);

  // Metric counts
  const totalCount = allTodayTasks.length;
  const completedCount = allTodayTasks.filter(item => item.st.checked || item.st.progress >= 100).length;
  const dueCount = allTodayTasks.filter(item => item.timingStatus === 'due').length;
  const overdueCount = allTodayTasks.filter(item => item.timingStatus === 'overdue').length;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Today's Tasks"
        subtitle={`Active, scheduled, due, and overdue tasks for ${formattedDate}`}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 bg-white border border-neutral-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
            Total Today's Tasks
          </div>
          <div className="text-[24px] font-black text-neutral-900">{totalCount}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Tasks scheduled or active</div>
        </Card>

        <Card className="p-4 bg-white border border-neutral-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
            Completed
          </div>
          <div className="text-[24px] font-black text-emerald-600">{completedCount}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}% of today's workload` : '0%'}
          </div>
        </Card>

        <Card className="p-4 bg-white border border-neutral-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
            Due Today
          </div>
          <div className="text-[24px] font-black text-amber-600">{dueCount}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Finish date matches today</div>
        </Card>

        <Card className="p-4 bg-white border border-neutral-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
            Overdue
          </div>
          <div className="text-[24px] font-black text-rose-600">{overdueCount}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Past deadline & incomplete</div>
        </Card>
      </div>

      {/* Filters & Search Toolbar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by task name, code (1.1.1), or division..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 bg-neutral-50/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Timing filters (tabs) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All Tasks', count: totalCount },
              { id: 'due', label: 'Due Today', count: dueCount },
              { id: 'starting', label: 'Starts Today', count: allTodayTasks.filter(t => t.timingStatus === 'starting').length },
              { id: 'active', label: 'In Progress', count: allTodayTasks.filter(t => t.timingStatus === 'active').length },
              { id: 'overdue', label: 'Overdue', count: overdueCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTiming(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  filterTiming === tab.id
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] ${
                  filterTiming === tab.id ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Division & Status dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterDivision}
              onChange={e => setFilterDivision(e.target.value)}
              className="px-3 py-2 rounded-lg border border-neutral-200 text-[12.5px] font-medium text-neutral-700 bg-white outline-none focus:border-brand"
            >
              <option value="all">All Divisions</option>
              {divisions.map((d: any) => (
                <option key={d.id} value={d.divisi}>
                  {formatDivisionName(d.divisi)}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-neutral-200 text-[12.5px] font-medium text-neutral-700 bg-white outline-none focus:border-brand"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed (100%)</option>
              <option value="in_progress">In Progress (&gt;0%)</option>
              <option value="open">Not Started (0%)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Task Cards Grid */}
      {filteredTasks.length === 0 ? (
        <Card className="p-8 text-center bg-white border border-neutral-200/80">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
          <h3 className="text-[15px] font-bold text-neutral-800">No tasks match your current criteria</h3>
          <p className="text-[12.5px] text-neutral-400 mt-1 max-w-md mx-auto">
            {totalCount === 0
              ? 'No project tasks are scheduled or due for today. Check upcoming tasks in the WBS Tasks page or Weekly Progress.'
              : 'Try clearing your search query or selecting a different status/timing filter.'}
          </p>
          {(search || filterTiming !== 'all' || filterDivision !== 'all' || filterStatus !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setFilterTiming('all');
                setFilterDivision('all');
                setFilterStatus('all');
              }}
              className="mt-4"
            >
              Reset Filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filteredTasks.map(({ st, parentSmj, parentMj, timingStatus }) => {
            const authorized = isAuthorizedToCheck(st.division || parentSmj.pic);
            const isChecked = st.checked || st.progress >= 100;

            return (
              <div
                key={st.id}
                className={`p-4 rounded-xl border bg-white shadow-xs transition-all flex flex-col justify-between gap-3 ${
                  isChecked
                    ? 'border-emerald-200/60 bg-emerald-50/20'
                    : 'border-neutral-200 hover:border-neutral-300 hover:shadow-sm'
                }`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-mono text-[11.5px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                        {st.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-brand/10 text-brand text-[10.5px] font-bold">
                        {formatDivisionName(st.division || parentSmj.pic)}
                      </span>
                      {timingStatus === 'overdue' && (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10.5px] font-bold">
                          Overdue
                        </span>
                      )}
                      {timingStatus === 'due' && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10.5px] font-bold">
                          Due Today
                        </span>
                      )}
                      {timingStatus === 'starting' && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10.5px] font-bold">
                          Starts Today
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-neutral-500 bg-neutral-100">
                        Weight {st.weight ?? 100}%
                      </span>
                    </div>
                    <StatusBadge status={isChecked ? 'Completed' : st.status} size="xs" />
                  </div>

                  {/* Task Name - Grey if completed, NO line-through */}
                  <h4
                    className={`text-[14px] font-bold mb-1 leading-snug break-words ${
                      isChecked ? 'text-neutral-400' : 'text-neutral-900'
                    }`}
                  >
                    {st.name}
                  </h4>

                  {/* Parent Hierarchy Context */}
                  <div className="text-[11px] text-neutral-400 flex items-center gap-1 truncate mb-2">
                    <span className="truncate">{parentMj.name}</span>
                    <span>→</span>
                    <span className="truncate">{parentSmj.name}</span>
                  </div>
                </div>

                {/* Progress Slider & Interactive Checkbox */}
                <div className="space-y-2 pt-2.5 border-t border-neutral-100">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1">
                      <button
                        type="button"
                        onClick={() => handleCheck(st.id, authorized, st.name)}
                        className={`flex-shrink-0 transition-transform active:scale-95 ${
                          authorized ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                        }`}
                        title={isChecked ? "Click to uncheck (will prompt confirmation)" : "Click to mark 100% completed"}
                      >
                        {isChecked ? (
                          <CheckSquare size={19} className="text-emerald-600" />
                        ) : (
                          <Square size={19} className="text-neutral-300 hover:text-neutral-500" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={st.progress}
                        disabled={!authorized}
                        onChange={(e) => handleProgressChange(st.id, parseInt(e.target.value), authorized, st.name)}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-200 accent-brand ${
                          !authorized ? 'opacity-40 cursor-not-allowed' : 'hover:accent-blue-700'
                        }`}
                      />
                    </div>
                    <span className="text-[13px] font-black text-neutral-800 w-12 text-right tabular-nums">
                      {st.progress}%
                    </span>
                  </div>

                  {/* Schedule dates & Evidence button */}
                  <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-500">
                    <span>
                      {formatDateDisplay(st.startDate)} – {formatDateDisplay(st.finishDate)}
                    </span>
                    {st.evidence && (
                      <button
                        type="button"
                        onClick={() => setEvidencePreview(st.evidence || null)}
                        className="inline-flex items-center gap-1 text-brand font-bold hover:underline"
                      >
                        <Paperclip size={12} />
                        Evidence ({st.evidence.name})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Uncheck Confirmation Modal */}
      {uncheckConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setUncheckConfirm(null)}
          title="Confirm Uncheck Task"
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-neutral-800">
                  Are you sure you want to mark this task as incomplete?
                </p>
                <p className="text-[12px] text-neutral-500 mt-1">
                  Task: <span className="font-semibold text-neutral-700">"{uncheckConfirm.taskName}"</span>
                </p>
                <p className="text-[11.5px] text-neutral-400 mt-1">
                  Its progress will revert to {uncheckConfirm.prevProgress !== undefined ? `${uncheckConfirm.prevProgress}%` : '0%'}.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button variant="outline" size="sm" onClick={() => setUncheckConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={confirmUncheck}>
                Yes, Uncheck
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Evidence Preview Modal */}
      {evidencePreview && (
        <Modal
          isOpen={true}
          onClose={() => setEvidencePreview(null)}
          title="Task Evidence Preview"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-neutral-800">{evidencePreview.name}</span>
                {evidencePreview.size && (
                  <span className="text-[11px] text-neutral-400 font-mono">{evidencePreview.size}</span>
                )}
              </div>
              {evidencePreview.previewUrl || evidencePreview.url ? (
                <div className="rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                  <img
                    src={evidencePreview.previewUrl || evidencePreview.url}
                    alt={evidencePreview.name}
                    className="w-full max-h-72 object-contain"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-neutral-400 text-[12px] italic">
                  Preview not available for this file type.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEvidencePreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast notifications */}
      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}
