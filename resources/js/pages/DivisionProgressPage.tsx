import { useState, useMemo } from 'react';
import { usePage, Link } from '@inertiajs/react';
import {
  Users, CheckCircle2, Clock, ListChecks, ChevronDown, ChevronRight,
  CheckSquare, Square, Shield, Search, Filter, AlertCircle, ArrowUpRight,
  Calendar, Layers, Sparkles, FileText, Camera, X
} from 'lucide-react';
import {
  PageHeader, Card, ProgressBar, StatusBadge, formatDateDisplay,
  formatDivisionName, Button
} from '@/components/ui';
import { PROJECT, Project } from '@/data/mockData';

export interface TaskItem {
  id: string;
  name: string;
  weight: number;
  is_completed: boolean;
  progress: number;
  status: string;
  subMainJob: string;
  mainJob: string;
  start: string | null;
  end: string | null;
  evidence?: any;
}

export interface DivisionGroup {
  division: string;
  division_id?: string | number | null;
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  percentage: number;
  tasks: TaskItem[];
}

export default function DivisionProgressPage() {
  const pageProps = usePage().props as any;
  const { project, divisionGroups = [], userRole, userDivision } = pageProps;

  const isAdmin = userRole === 'admin_progres' || userRole === 'admin_utama' || userRole === 'superadmin' || !userRole;
  const isWorkerDivision = (userRole === 'worker' || !!userDivision) && !isAdmin;
  const activeDivisionName = userDivision || (divisionGroups.length === 1 ? divisionGroups[0]?.division : null);
  const formattedActiveDivision = formatDivisionName(activeDivisionName);

  // Dynamic Date tracking (Today = 2026-09-24)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // 100% Dynamic Division Grouping (zero hardcoded division list)
  const dynamicGroups: DivisionGroup[] = useMemo(() => {
    // 1. If backend passed non-empty divisionGroups, normalize them
    if (Array.isArray(divisionGroups) && divisionGroups.length > 0) {
      return divisionGroups.map((g: any) => {
        const rawTasks: any[] = g.tasks || [];
        const tasks: TaskItem[] = rawTasks.map((t: any) => {
          const isComp = Boolean(t.is_completed || t.status === 'Completed' || t.progress === 100);
          return {
            id: String(t.id),
            name: t.name,
            weight: Number(t.weight || 0),
            is_completed: isComp,
            progress: typeof t.progress === 'number' ? t.progress : (isComp ? 100 : 0),
            status: t.status || (isComp ? 'Completed' : 'Open'),
            subMainJob: t.subMainJob || '—',
            mainJob: t.mainJob || '—',
            start: t.start || null,
            end: t.end || null,
            evidence: t.evidence || null,
          };
        });

        const completed = tasks.filter(t => t.is_completed || t.status === 'Completed' || t.progress === 100).length;
        const inProgress = tasks.filter(t => !t.is_completed && t.status !== 'Completed' && t.progress !== 100 && (t.progress > 0 || t.status === 'In Progress' || t.status === 'On Track' || t.status === 'At Risk' || t.status === 'Delayed')).length;
        const remaining = Math.max(0, tasks.length - completed - inProgress);

        const percentage = typeof g.percentage === 'number' && g.percentage > 0
          ? g.percentage
          : tasks.length > 0
          ? Math.round((completed / tasks.length) * 100)
          : 0;

        return {
          division: g.division || 'General',
          division_id: g.division_id,
          total: tasks.length,
          completed,
          inProgress,
          remaining,
          percentage,
          tasks,
        };
      });
    }

    // 2. Otherwise dynamically derive from active project task tree
    const resolvedProject: Project = project && project.mainJobs ? project : PROJECT;
    const map: Record<string, DivisionGroup> = {};

    (resolvedProject.mainJobs || []).forEach(mj => {
      (mj.subMainJobs || []).forEach(smj => {
        (smj.subtasks || []).forEach(st => {
          const rawDiv = st.division || smj.pic || smj.name || mj.name || 'General';
          const divName = formatDivisionName(rawDiv);

          if (!map[divName]) {
            map[divName] = {
              division: divName,
              total: 0,
              completed: 0,
              inProgress: 0,
              remaining: 0,
              percentage: 0,
              tasks: [],
            };
          }

          const isComp = Boolean(st.checked || st.progress === 100 || st.status === 'Completed');
          const prog = typeof st.progress === 'number' ? st.progress : (isComp ? 100 : 0);

          map[divName].tasks.push({
            id: String(st.id),
            name: st.name,
            weight: Number(st.weight || 0),
            is_completed: isComp,
            progress: prog,
            status: st.status || (isComp ? 'Completed' : 'Open'),
            subMainJob: smj.name || '—',
            mainJob: mj.name || '—',
            start: st.startDate || null,
            end: st.finishDate || null,
            evidence: st.evidence || null,
          });
        });
      });
    });

    const groups = Object.values(map).map(g => {
      const total = g.tasks.length;
      const completed = g.tasks.filter(t => t.is_completed || t.status === 'Completed' || t.progress === 100).length;
      const inProgress = g.tasks.filter(t => !t.is_completed && t.status !== 'Completed' && t.progress !== 100 && (t.progress > 0 || t.status === 'In Progress' || t.status === 'On Track' || t.status === 'At Risk' || t.status === 'Delayed')).length;
      const remaining = Math.max(0, total - completed - inProgress);
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        ...g,
        total,
        completed,
        inProgress,
        remaining,
        percentage,
      };
    });

    return groups.sort((a, b) => a.division.localeCompare(b.division));
  }, [divisionGroups, project]);

  // Today's Tasks Dynamic Aggregation (Requirement 5)
  const todayTasksByDivision = useMemo(() => {
    const result: Record<string, TaskItem[]> = {};

    dynamicGroups.forEach(group => {
      const matching = group.tasks.filter(t => {
        if (t.is_completed || t.status === 'Completed' || t.progress === 100) return false;
        if (!t.start && !t.end) return false;

        // Active today: start <= today <= end
        if (t.start && t.end && t.start <= todayStr && t.end >= todayStr) return true;
        // Due today
        if (t.end && t.end === todayStr) return true;
        // Starting today
        if (t.start && t.start === todayStr) return true;
        // Overdue incomplete
        if (t.end && t.end < todayStr) return true;

        return false;
      });

      if (matching.length > 0) {
        result[group.division] = matching;
      }
    });

    return result;
  }, [dynamicGroups, todayStr]);

  const totalTodayTasks = useMemo(() => {
    return Object.values(todayTasksByDivision).reduce((sum, list) => sum + list.length, 0);
  }, [todayTasksByDivision]);

  // UI Interactive States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDivision, setFilterDivision] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'progress-desc' | 'progress-asc' | 'tasks-desc' | 'name'>('progress-desc');
  const [selectedTodayDivision, setSelectedTodayDivision] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [evidencePreview, setEvidencePreview] = useState<{ name: string; url?: string; size?: string; division?: string } | null>(null);

  const toggle = (division: string) => {
    setExpanded(prev => ({ ...prev, [division]: !prev[division] }));
  };

  // Filtered & Sorted Division Groups
  const filteredGroups = useMemo(() => {
    let list = dynamicGroups;

    // Worker division filter
    if (isWorkerDivision && activeDivisionName) {
      const target = formatDivisionName(activeDivisionName).toLowerCase();
      list = list.filter(g => formatDivisionName(g.division).toLowerCase() === target);
    }

    // Filter by specific selected division
    if (filterDivision !== 'all') {
      if (filterDivision === 'has-today') {
        list = list.filter(g => !!todayTasksByDivision[g.division]?.length);
      } else {
        list = list.filter(g => g.division === filterDivision);
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g =>
        g.division.toLowerCase().includes(q) ||
        g.tasks.some(t => t.name.toLowerCase().includes(q) || t.subMainJob.toLowerCase().includes(q))
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'progress-desc') return b.percentage - a.percentage;
      if (sortBy === 'progress-asc') return a.percentage - b.percentage;
      if (sortBy === 'tasks-desc') return b.total - a.total;
      return a.division.localeCompare(b.division);
    });
  }, [dynamicGroups, isWorkerDivision, activeDivisionName, filterDivision, searchQuery, sortBy, todayTasksByDivision]);

  // Overall Statistics
  const totalTasks = dynamicGroups.reduce((acc, g) => acc + g.total, 0);
  const totalCompleted = dynamicGroups.reduce((acc, g) => acc + g.completed, 0);
  const totalInProgress = dynamicGroups.reduce((acc, g) => acc + g.inProgress, 0);
  const overallPercentage = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6 overflow-x-hidden">
      {/* Page Header */}
      <PageHeader
        title={
          isWorkerDivision && formattedActiveDivision
            ? `Division Progress: ${formattedActiveDivision} ${project?.name ? `· ${project.name}` : ''}`
            : `Division Progress Monitoring ${project?.name ? `· ${project.name}` : ''}`
        }
        subtitle={
          isWorkerDivision && formattedActiveDivision
            ? `Workload and completion tracking for the ${formattedActiveDivision} team`
            : "Admin overview of departmental progress, task status metrics, and today's active assignments"
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-brand-light text-brand border border-brand-border shadow-2xs">
              <Users size={14} />
              {dynamicGroups.length} Involved Divisions
            </span>
          </div>
        }
      />

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: 'Total Divisions',
            value: `${dynamicGroups.length} Teams`,
            sub: 'Active in project WBS',
            icon: Users,
            color: 'text-brand bg-brand-light',
          },
          {
            label: 'Total Tasks',
            value: `${totalTasks} Tasks`,
            sub: `${totalCompleted} completed · ${totalInProgress} in progress`,
            icon: ListChecks,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Average Completion',
            value: `${overallPercentage}%`,
            sub: 'Weighted progress across teams',
            icon: CheckCircle2,
            color: 'text-emerald-600 bg-emerald-50',
          },
          {
            label: "Tasks Active Today",
            value: `${totalTodayTasks} Tasks`,
            sub: `Across ${Object.keys(todayTasksByDivision).length} divisions`,
            icon: Clock,
            color: 'text-amber-600 bg-amber-50',
          },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">{label}</div>
              <div className="text-[18px] sm:text-[20px] font-black text-neutral-900 leading-tight mt-0.5">{value}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* 5. Today's Tasks Integration (Requirement 5) */}
      <Card className="p-4 sm:p-5 border-2 border-brand/20 bg-gradient-to-br from-white via-brand-light/10 to-indigo-50/20 shadow-sm rounded-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3.5 border-b border-neutral-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center shadow-xs flex-shrink-0 mt-0.5">
              <Clock size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] sm:text-[16px] font-black text-neutral-900 tracking-tight">
                  Today's Tasks Monitoring
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                  {totalTodayTasks} Tasks Scheduled
                </span>
              </div>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                Tasks active, scheduled, or due today ({formatDateDisplay(todayStr)}) requiring admin monitoring
              </p>
            </div>
          </div>

          {/* Division Breakdown Pills (Requirement 5 example format) */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(todayTasksByDivision).length === 0 ? (
              <span className="text-[12px] text-neutral-400 italic">No tasks scheduled for today</span>
            ) : (
              Object.entries(todayTasksByDivision).map(([divName, list]) => {
                const isSelected = selectedTodayDivision === divName;
                return (
                  <button
                    key={divName}
                    type="button"
                    onClick={() => setSelectedTodayDivision(prev => prev === divName ? null : divName)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand text-white shadow-xs'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:border-brand/40 hover:bg-neutral-50'
                    }`}
                  >
                    <span>{divName}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-brand-light text-brand'
                    }`}>
                      {list.length} {list.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </button>
                );
              })
            )}
            {selectedTodayDivision && (
              <button
                type="button"
                onClick={() => setSelectedTodayDivision(null)}
                className="text-[11px] font-semibold text-neutral-400 hover:text-neutral-700 underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Detailed Today's Tasks List */}
        {totalTodayTasks > 0 && (
          <div className="mt-3.5 space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
            {Object.entries(todayTasksByDivision)
              .filter(([divName]) => !selectedTodayDivision || selectedTodayDivision === divName)
              .flatMap(([divName, tasks]) =>
                tasks.map(t => (
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-white border border-neutral-200/80 shadow-2xs hover:border-brand/30 transition-all"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand border border-brand/20 flex-shrink-0 mt-0.5">
                        {divName}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-neutral-900 truncate">
                          {t.name}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
                          {t.subMainJob} · {formatDateDisplay(t.start)} → {formatDateDisplay(t.end)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-center">
                      <div className="w-24 text-right">
                        <span className="text-[12px] font-extrabold text-brand">{t.progress}%</span>
                        <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden mt-0.5">
                          <div
                            className="bg-brand h-full rounded-full"
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                      </div>
                      <StatusBadge status={t.status as any} size="xs" />
                      {t.evidence && (
                        <button
                          type="button"
                          onClick={() => setEvidencePreview({
                            name: t.evidence.name,
                            url: t.evidence.previewUrl,
                            size: t.evidence.size,
                            division: divName,
                          })}
                          className="p-1 text-sky-600 hover:text-sky-700 bg-sky-50 rounded border border-sky-200 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                          title="View evidence"
                        >
                          <Camera size={12} />
                          <span className="hidden sm:inline">Evidence</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
          </div>
        )}
      </Card>

      {/* Filter and Search Controls Bar */}
      <Card className="p-4 bg-white border border-neutral-200/90 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Search input */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search division or task description..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] bg-white outline-none focus:border-brand shadow-2xs text-neutral-800 placeholder:text-neutral-400"
            />
          </div>

          {/* Right: Filters & Sorting */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-[12px] text-neutral-600 font-medium">
              <Filter size={13} className="text-neutral-400" />
              <span>Filter:</span>
              <select
                value={filterDivision}
                onChange={e => setFilterDivision(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12px] font-semibold bg-white outline-none focus:border-brand shadow-2xs"
              >
                <option value="all">All Divisions ({dynamicGroups.length})</option>
                <option value="has-today">Has Active Tasks Today ({Object.keys(todayTasksByDivision).length})</option>
                {dynamicGroups.map(g => (
                  <option key={g.division} value={g.division}>{g.division} ({g.total})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-[12px] text-neutral-600 font-medium">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-neutral-200 text-[12px] font-semibold bg-white outline-none focus:border-brand shadow-2xs"
              >
                <option value="progress-desc">Progress: High to Low</option>
                <option value="progress-asc">Progress: Low to High</option>
                <option value="tasks-desc">Most Tasks</option>
                <option value="name">Alphabetical</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* 2 & 6. Division Cards Grid (Desktop: Cards/Grid; Mobile: Single Column) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredGroups.map((group) => {
          const isExp = !!expanded[group.division];
          const todayCount = (todayTasksByDivision[group.division] || []).length;

          return (
            <Card
              key={group.division}
              className="p-5 flex flex-col justify-between hover:border-neutral-300 hover:shadow-md transition-all duration-200 border border-neutral-200/90 rounded-2xl bg-white"
            >
              <div>
                {/* Division Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center flex-shrink-0 font-extrabold text-[13px]">
                      {group.division.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-black text-neutral-900 tracking-tight truncate" title={group.division}>
                        {group.division}
                      </h3>
                      <span className="text-[11.5px] text-neutral-400 font-medium">
                        {group.total} Total Tasks
                      </span>
                    </div>
                  </div>

                  {/* Main Visual: Big Percentage */}
                  <div className="text-right flex-shrink-0">
                    <div className={`text-[24px] font-black tracking-tight leading-none ${
                      group.percentage >= 80 ? 'text-emerald-600' : group.percentage >= 50 ? 'text-brand' : 'text-amber-600'
                    }`}>
                      {group.percentage}%
                    </div>
                    <div className="text-[10px] uppercase font-bold text-neutral-400 mt-0.5 tracking-wider">
                      Progress
                    </div>
                  </div>
                </div>

                {/* Progress Bar (Visual focus) */}
                <div className="my-3.5 space-y-1">
                  <div className="w-full bg-neutral-100 rounded-full h-3 overflow-hidden p-0.5 border border-neutral-200/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        group.percentage >= 80
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                          : group.percentage >= 50
                          ? 'bg-gradient-to-r from-brand to-indigo-600'
                          : 'bg-gradient-to-r from-amber-500 to-amber-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, group.percentage))}%` }}
                    />
                  </div>
                </div>

                {/* Task Status Metrics: Completed / In Progress / Remaining (Requirement 2 & 4) */}
                <div className="grid grid-cols-3 gap-1.5 py-2.5 px-3 bg-neutral-50/90 rounded-xl border border-neutral-150 text-center my-3">
                  <div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Completed</div>
                    <div className="text-[16px] font-black text-emerald-600 mt-0.5">{group.completed}</div>
                  </div>
                  <div className="border-x border-neutral-200/70">
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">In Progress</div>
                    <div className="text-[16px] font-black text-blue-600 mt-0.5">{group.inProgress}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Remaining</div>
                    <div className="text-[16px] font-black text-neutral-600 mt-0.5">{group.remaining}</div>
                  </div>
                </div>

                {/* Today's Tasks Badge for Division */}
                {todayCount > 0 && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200/60 text-amber-800 text-[11.5px] font-semibold my-2">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-600" />
                      <span>Today's active tasks:</span>
                    </span>
                    <span className="font-extrabold bg-amber-200/60 px-1.5 py-0.2 rounded text-[11px]">
                      {todayCount}
                    </span>
                  </div>
                )}
              </div>

              {/* Expand / Collapse Button */}
              <div className="pt-3 border-t border-neutral-100 mt-2">
                <button
                  type="button"
                  onClick={() => toggle(group.division)}
                  className="w-full flex items-center justify-between text-[12px] font-bold text-neutral-600 hover:text-brand transition-colors p-1 rounded-md cursor-pointer"
                >
                  <span>{isExp ? 'Hide Task Breakdown' : `View ${group.tasks.length} Tasks`}</span>
                  {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>

              {/* Expanded Tasks List */}
              {isExp && (
                <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                  {group.tasks.length === 0 ? (
                    <div className="py-4 text-center text-xs text-neutral-400 italic">
                      No tasks registered for this division.
                    </div>
                  ) : (
                    group.tasks.map(task => (
                      <div
                        key={task.id}
                        className={`p-2.5 rounded-xl border transition-all text-left ${
                          task.is_completed
                            ? 'bg-success-light/20 border-success/30'
                            : 'bg-white border-neutral-200/80 shadow-2xs hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`text-[12.5px] font-bold leading-snug line-clamp-2 ${
                              task.is_completed ? 'text-neutral-400' : 'text-neutral-800'
                            }`}>
                              {task.name}
                            </span>
                            <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
                              {task.subMainJob}
                            </div>
                          </div>
                          <StatusBadge status={task.status as any} size="xs" />
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-neutral-100 text-[11px]">
                          <span className="text-neutral-400 font-medium">
                            {task.start && task.end ? `${formatDateDisplay(task.start)} → ${formatDateDisplay(task.end)}` : 'No dates'}
                          </span>
                          <span className="font-extrabold text-neutral-700">
                            {task.progress}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white rounded-2xl border border-neutral-200/80 shadow-2xs">
            <Shield size={36} className="mx-auto text-neutral-300 mb-2" />
            <h3 className="text-[16px] font-bold text-neutral-800">No Divisions Found</h3>
            <p className="text-[13px] text-neutral-500 max-w-sm mx-auto mt-1">
              No divisions matched your search or filter criteria. Try resetting the filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setFilterDivision('all'); }}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Task Evidence Modal */}
      {evidencePreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand">
                  {evidencePreview.division} Evidence
                </span>
                <h3 className="text-base font-bold text-neutral-800 truncate">{evidencePreview.name}</h3>
              </div>
              <button
                onClick={() => setEvidencePreview(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700"
              >
                <X size={18} />
              </button>
            </div>

            {evidencePreview.url ? (
              <div className="rounded-lg overflow-hidden border border-neutral-200 max-h-60 bg-neutral-900/5">
                <img src={evidencePreview.url} alt={evidencePreview.name} className="w-full object-contain max-h-60" />
              </div>
            ) : (
              <div className="py-8 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200 text-neutral-500">
                <FileText size={36} className="mx-auto text-brand mb-2" />
                <div className="text-sm font-bold">{evidencePreview.name}</div>
                <div className="text-xs text-neutral-400 mt-1">{evidencePreview.size || 'Attached document'}</div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setEvidencePreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
