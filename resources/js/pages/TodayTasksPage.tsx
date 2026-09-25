import { useState, useEffect, useMemo, Fragment } from 'react';
import { usePage, router } from '@inertiajs/react';
import {
  CalendarDays, Search, CheckCircle2,
  AlertCircle, Clock, Filter, Paperclip, X, Eye, Download,
  Layers, ArrowUpRight, Shield, AlertTriangle, UploadCloud, Edit2, FileText
} from 'lucide-react';
import { Project, PROJECT, MainJob, SubMainJob, SubSubtask, Status, EvidenceItem } from '@/data/mockData';
import { recalculateSchedule } from '@/utils/scheduleEngine';
import { recalculateProgress } from '@/utils/progressEngine';
import { StatusBadge, PageHeader, Card, Button, Modal, Toast, formatDateDisplay, formatDivisionName } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

function EditableProgress({ value, disabled, onSave, isChecked }: { value: number, disabled: boolean, onSave: (val: number) => void, isChecked: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value.toString());

  useEffect(() => {
    setVal(value.toString());
  }, [value]);

  if (isEditing && !disabled) {
    return (
      <input
        autoFocus
        type="number"
        min="0" max="100"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          const parsed = parseInt(val);
          if (!isNaN(parsed) && parsed !== value && parsed >= 0 && parsed <= 100) onSave(parsed);
          else setVal(value.toString());
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            const parsed = parseInt(val);
            if (!isNaN(parsed) && parsed !== value && parsed >= 0 && parsed <= 100) onSave(parsed);
            else setVal(value.toString());
          } else if (e.key === 'Escape') {
            setIsEditing(false);
            setVal(value.toString());
          }
        }}
        className="w-12 h-6 text-right text-[12.5px] font-black border border-brand/50 rounded outline-none p-0 hide-arrows -mr-1"
        style={{ appearance: 'textfield' }}
      />
    );
  }

  return (
    <span 
      className={`text-[13px] font-black w-12 text-right tabular-nums ${!disabled ? 'cursor-text hover:bg-neutral-100 rounded px-1 -mx-1' : ''} ${isChecked ? 'text-emerald-700' : 'text-neutral-800'}`}
      onClick={() => { if (!disabled) setIsEditing(true); }}
      title={!disabled ? "Click to set percentage manually" : ""}
    >
      {value}%
    </span>
  );
}

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

  // Upload evidence modal state
  const [uploadEvidenceTask, setUploadEvidenceTask] = useState<{
    task: SubSubtask;
    requireComplete?: boolean;
  } | null>(null);

  // Uncheck confirmation modal state
  const [uncheckConfirm, setUncheckConfirm] = useState<{
    taskId: string;
    taskName: string;
    prevProgress?: number;
  } | null>(null);

  const handleSaveEvidence = (taskId: string, evidence: EvidenceItem, completeTo100: boolean = false, rawFile?: File) => {
    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              const targetProg = completeTo100 ? 100 : st.progress;
              const isDone = targetProg >= 100;
              return {
                ...st,
                evidence,
                progress: targetProg,
                checked: isDone,
              };
            }
            return st;
          })
        }))
      }));
      return recalculateSchedule(recalculateProgress(newData));
    });

    if (completeTo100 && projectData.id) {
      router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
        preserveScroll: true,
        preserveState: true,
      });
    }

    setToastMsg(completeTo100 ? `Bukti berhasil diunggah & task ditandai 100% selesai ✓` : `Bukti berhasil disimpan.`);
    setUploadEvidenceTask(null);
  };

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
      const tasksFeatures = authUser?.permission_matrix?.features?.tasks || authUser?.permission_matrix?.features?.Tasks || [];
      const hasEditTask = tasksFeatures.some((f: string) => f.toLowerCase() === 'edit task' || f.toLowerCase() === 'edit_task');
      if (!hasEditTask) return false;

      const workerDiv = (authUser?.division ?? '').trim().toLowerCase();
      const targetDiv = (taskDivision ?? '').trim().toLowerCase();
      return workerDiv !== '' && (workerDiv === targetDiv || targetDiv === 'general' || targetDiv === 'internal');
    }
    return false;
  };

  const handleProgressChange = (taskId: string, newProgress: number, authorized: boolean, taskName: string, commit: boolean = false) => {
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

    // Find current task state to verify evidence
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

    // MANDATORY EVIDENCE RULE: Must have evidence before reaching 100%
    if (isCompleted && currentTask && !currentTask.evidence) {
      setToastMsg(`Bukti (evidence) WAJIB dilampirkan sebelum menyelesaikan task "${taskName}" (100%).`);
      if (commit) {
        setUploadEvidenceTask({
          task: currentTask,
          requireComplete: true,
        });
      }
      return;
    }

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

    if (commit && projectData.id) {
      if (clamped === 100) {
        setToastMsg(`Task "${taskName}" marked as completed (100%) ✓`);
      }
      router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, { progress: clamped }, {
        preserveScroll: true,
        preserveState: true,
      });
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
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isChecked
                    ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/20 shadow-xs'
                    : 'border-neutral-200 hover:border-neutral-300 bg-white shadow-xs'
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

                  {/* Task Name - Green if completed, clear text */}
                  <h4
                    className={`text-[14px] font-bold mb-1 leading-snug break-words ${
                      isChecked ? 'text-emerald-950 font-bold' : 'text-neutral-900'
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

                {/* Progress Slider */}
                <div className="space-y-2 pt-2.5 border-t border-neutral-100">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={st.progress}
                        disabled={!authorized}
                        onChange={(e) => handleProgressChange(st.id, parseInt(e.target.value), authorized, st.name, false)}
                        onMouseUp={(e) => handleProgressChange(st.id, parseInt((e.target as HTMLInputElement).value), authorized, st.name, true)}
                        onTouchEnd={(e) => handleProgressChange(st.id, parseInt((e.target as HTMLInputElement).value), authorized, st.name, true)}
                        className={`w-full h-2 rounded-lg cursor-pointer bg-neutral-200 accent-brand ${
                          !authorized ? 'opacity-40 cursor-not-allowed' : 'hover:accent-blue-700'
                        }`}
                      />
                    </div>

                    <EditableProgress 
                      value={st.progress} 
                      disabled={!authorized} 
                      onSave={(val) => handleProgressChange(st.id, val, authorized, st.name, true)} 
                      isChecked={isChecked} 
                    />
                  </div>

                  {/* Schedule dates & Evidence button */}
                  <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-500">
                    <span>
                      {formatDateDisplay(st.startDate)} – {formatDateDisplay(st.finishDate)}
                    </span>
                    {st.evidence ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEvidencePreview(st.evidence || null)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold hover:bg-emerald-200 transition-colors shadow-2xs"
                          title={`Lihat bukti: ${st.evidence.name}`}
                        >
                          <Paperclip size={11} className="text-emerald-700" />
                          Bukti: {st.evidence.name}
                        </button>
                        {authorized && (
                          <button
                            type="button"
                            onClick={() => setUploadEvidenceTask({ task: st })}
                            className="p-1 rounded text-neutral-400 hover:text-brand hover:bg-neutral-100 transition-colors"
                            title="Ganti berkas bukti"
                          >
                            <Edit2 size={11} />
                          </button>
                        )}
                      </div>
                    ) : (
                      authorized && (
                        <button
                          type="button"
                          onClick={() => setUploadEvidenceTask({ task: st })}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold transition-colors shadow-2xs"
                          title="Upload bukti penyelesaian (wajib untuk 100%)"
                        >
                          <UploadCloud size={11} className="text-amber-600" />
                          <span>Upload Bukti (Wajib)</span>
                        </button>
                      )
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

      {/* Upload Evidence Modal */}
      {uploadEvidenceTask && (
        <UploadEvidenceModal
          task={uploadEvidenceTask.task}
          requireComplete={uploadEvidenceTask.requireComplete}
          onClose={() => setUploadEvidenceTask(null)}
          onSave={handleSaveEvidence}
        />
      )}

      {/* Toast notifications */}
      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}

function UploadEvidenceModal({
  task,
  requireComplete = false,
  onClose,
  onSave,
}: {
  task: SubSubtask;
  requireComplete?: boolean;
  onClose: () => void;
  onSave: (taskId: string, evidence: EvidenceItem, completeTo100: boolean, rawFile?: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(task.evidence?.previewUrl);
  const [completeChecked, setCompleteChecked] = useState(requireComplete || task.progress === 100);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (selected.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else {
        setPreviewUrl(undefined);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !task.evidence) return;

    let evidenceObj: EvidenceItem;
    if (file) {
      const isImg = file.type.startsWith('image/');
      const sizeFormatted = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      evidenceObj = {
        name: file.name,
        size: sizeFormatted,
        type: file.type,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
      };
    } else {
      evidenceObj = task.evidence!;
    }

    onSave(task.id, evidenceObj, completeChecked, file || undefined);
  };

  return (
    <Modal
      isOpen={true}
      title="Upload Bukti Penyelesaian (Evidence)"
      subtitle={`${task.code} — ${task.name}`}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Required Notice Alert */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] leading-relaxed">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Syarat Wajib:</strong> Lampiran bukti penyelesaian (foto pelaksanaan, berkas serah terima, atau dokumen PDF/gambar) wajib diunggah untuk dapat menandai task ini selesai (100%).
          </div>
        </div>

        {/* Existing / Selected Evidence Display */}
        {(file || task.evidence) ? (
          <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Evidence preview"
                  className="w-12 h-12 rounded-lg object-cover border border-neutral-200 flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold">
                  <FileText size={22} />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-neutral-800 truncate">
                  {file ? file.name : task.evidence?.name}
                </div>
                <div className="text-[11px] text-neutral-500">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : (task.evidence?.size || 'Attached')} · Siap disimpan
                </div>
              </div>
            </div>
            <label className="text-[12px] font-bold text-brand hover:underline cursor-pointer">
              Ganti File
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-neutral-300 hover:border-brand rounded-xl cursor-pointer bg-neutral-50/50 hover:bg-brand/5 transition-all text-center">
            <UploadCloud size={32} className="text-brand mb-2" />
            <span className="text-[13.5px] font-bold text-neutral-800">
              Pilih atau seret berkas bukti (evidence) ke sini
            </span>
            <span className="text-[11.5px] text-neutral-400 mt-1">
              Mendukung foto (JPG, PNG) atau dokumen (PDF, Word, Excel) maksimal 10MB
            </span>
            <input
              type="file"
              required={!task.evidence}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}

        {/* Completion checkbox option */}
        <div className="pt-2 border-t border-neutral-100 flex items-center gap-2">
          <input
            type="checkbox"
            id="markCompleteCheckToday"
            checked={completeChecked}
            onChange={(e) => setCompleteChecked(e.target.checked)}
            className="w-4 h-4 rounded text-brand focus:ring-brand border-neutral-300 accent-brand cursor-pointer"
          />
          <label htmlFor="markCompleteCheckToday" className="text-[12.5px] font-semibold text-neutral-800 cursor-pointer">
            Langsung tandai task ini selesai 100% (berubah menjadi Hijau)
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={!file && !task.evidence}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {completeChecked ? 'Upload Bukti & Selesaikan (100%)' : 'Simpan Bukti'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
