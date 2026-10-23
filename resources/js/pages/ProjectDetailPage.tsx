import { useState, useEffect, useMemo, FormEvent } from 'react';
import { usePage, router, Link } from '@inertiajs/react';
import {
  Building2, User, Calendar, Target, CheckCircle2, Layers, ShieldCheck,
  Plus, Lock, AlertCircle, Check, Search, Filter, ChevronDown, ChevronRight,
  Clock, Shield, Paperclip, Eye, Scale, ArrowRight, ExternalLink, X, FileText,
  Link2
} from 'lucide-react';
import type { MainJob, SubMainJob, SubSubtask, EvidenceItem } from '@/data/mockData';
import {
  StatusBadge, ProgressBar, PageHeader, Card, Button, Modal, Toast,
  formatDateDisplay, formatDivisionName, STATUS_CONFIG
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

interface CompanyOption {
  id: number;
  name: string;
  code: string | null;
}

export default function ProjectDetailPage() {
  const { user, refreshUser } = useAuth();
  const pageProps = usePage().props as any;
  const project = pageProps?.project;
  const userRole = pageProps?.userRole;

  const [projectData, setProjectData] = useState<any>(() => {
    return project ?? null;
  });

  useEffect(() => {
    if (project) {
      setProjectData(project);
    }
  }, [project]);

  // Search and Filter States for Working Tree
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDivision, setFilterDivision] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Accordion Expand/Collapse States (Main Job IDs and Sub Main Job IDs)
  const [expandedMainIds, setExpandedMainIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    (project?.mainJobs || []).slice(0, 3).forEach((mj: any) => initial.add(String(mj.id)));
    return initial;
  });
  const [expandedSubIds, setExpandedSubIds] = useState<Set<string>>(new Set());

  // Modal States
  const [evidencePreview, setEvidencePreview] = useState<EvidenceItem | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<{
    task: SubSubtask;
    parentSmj?: SubMainJob;
    parentMj?: MainJob;
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);

  // Form states for creating project
  const [companyId, setCompanyId] = useState<number | string>('');
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [pmName, setPmName] = useState(user?.name || 'Budi Santoso');
  const [startDate, setStartDate] = useState('2025-01-15');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [budget, setBudget] = useState('30000000000');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const toggleMain = (id: string) => {
    setExpandedMainIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSub = (id: string) => {
    setExpandedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const allMain = new Set<string>();
    const allSub = new Set<string>();
    (projectData?.mainJobs || []).forEach((mj: any) => {
      allMain.add(String(mj.id));
      (mj.subMainJobs || []).forEach((smj: any) => allSub.add(String(smj.id)));
    });
    setExpandedMainIds(allMain);
    setExpandedSubIds(allSub);
  };

  const handleCollapseAll = () => {
    setExpandedMainIds(new Set());
    setExpandedSubIds(new Set());
  };

  // Helper to normalize division names for consistent comparison
  const normalizeDiv = (div?: string | null): string => {
    if (!div) return '';
    return div.trim().toLowerCase().replace(/[\s_-]+/g, '');
  };

  // Dynamic list of unique divisions present in active WBS
  const availableDivisions = useMemo(() => {
    const set = new Set<string>();
    (projectData?.mainJobs || []).forEach((mj: any) => {
      (mj.subMainJobs || []).forEach((smj: any) => {
        if (smj.pic) set.add(smj.pic);
        (smj.subtasks || []).forEach((st: any) => {
          if (st.division) set.add(st.division);
        });
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projectData?.mainJobs]);

  const userDivision = (user as any)?.division?.divisi || (user as any)?.division || (user as any)?.pic || '';

  const isFilteringActive = Boolean(
    searchQuery.trim() || filterDivision !== 'all' || filterStatus !== 'all'
  );

  // Filtered Working Tree (Main Job -> Sub Main Job -> Subtask)
  const filteredMainJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const divFilter = filterDivision;
    const statFilter = filterStatus;

    if (!projectData?.mainJobs) return [];

    if (!q && divFilter === 'all' && statFilter === 'all') {
      return projectData.mainJobs;
    }

    return projectData.mainJobs.map((mj: any) => {
      const mjMatchesDirectly = q && (mj.name.toLowerCase().includes(q) || mj.code.toLowerCase().includes(q));

      const matchingSubMainJobs = (mj.subMainJobs || []).map((smj: any) => {
        const smjMatchesDirectly = q && (
          smj.name.toLowerCase().includes(q) ||
          smj.code.toLowerCase().includes(q) ||
          (smj.pic && smj.pic.toLowerCase().includes(q))
        );
        const smjDivMatches = divFilter === 'all' || (smj.pic && normalizeDiv(smj.pic) === normalizeDiv(divFilter));
        const smjStatMatches = statFilter === 'all' || smj.status === statFilter;

        // Filter leaf tasks
        const matchingSubtasks = (smj.subtasks || []).filter((st: any) => {
          const stTextMatches = !q || (
            st.name.toLowerCase().includes(q) ||
            st.code.toLowerCase().includes(q) ||
            (st.division && st.division.toLowerCase().includes(q))
          );
          const taskDiv = st.division || smj.pic;
          const stDivMatches = divFilter === 'all' || (taskDiv && normalizeDiv(taskDiv) === normalizeDiv(divFilter));
          const stEffectiveStatus = st.checked || st.progress === 100 ? 'Completed' : (st.status || 'Open');
          const stStatMatches = statFilter === 'all' || stEffectiveStatus === statFilter;

          return stTextMatches && stDivMatches && stStatMatches;
        });

        const hasSubtasksDefined = Boolean(smj.subtasks && smj.subtasks.length > 0);
        const shouldIncludeSmj = hasSubtasksDefined
          ? matchingSubtasks.length > 0
          : (smjMatchesDirectly || !q) && smjDivMatches && smjStatMatches;

        if (!shouldIncludeSmj) return null;

        return {
          ...smj,
          subtasks: matchingSubtasks,
        };
      }).filter(Boolean);

      const shouldIncludeMj = matchingSubMainJobs.length > 0;

      if (!shouldIncludeMj) return null;

      return {
        ...mj,
        subMainJobs: matchingSubMainJobs,
      };
    }).filter(Boolean);
  }, [projectData?.mainJobs, searchQuery, filterDivision, filterStatus]);

  // Total counts for feedback banner
  const totalFilteredTasks = useMemo(() => {
    return filteredMainJobs.reduce((acc: number, mj: any) => {
      return acc + (mj.subMainJobs || []).reduce((subAcc: number, smj: any) => {
        return subAcc + (smj.subtasks?.length || 0);
      }, 0);
    }, 0);
  }, [filteredMainJobs]);

  // When filtering is active, auto-expand matching nodes
  useEffect(() => {
    if (isFilteringActive) {
      const mainSet = new Set<string>();
      const subSet = new Set<string>();
      filteredMainJobs.forEach((mj: any) => {
        mainSet.add(String(mj.id));
        (mj.subMainJobs || []).forEach((smj: any) => {
          subSet.add(String(smj.id));
        });
      });
      setExpandedMainIds(mainSet);
      setExpandedSubIds(subSet);
    }
  }, [isFilteringActive, filteredMainJobs]);

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        if (data.companies?.length > 0 && !companyId) {
          setCompanyId(data.companies[0].id);
        }
      }
    } catch {
      // fallback
      setCompanies([
        { id: 1, name: 'PT Indoprima Gemilang', code: 'IPG' },
        { id: 2, name: 'PT Indoprima Nusantara', code: 'IPN' },
      ]);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return;
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(prev => [...prev, data.company]);
        setCompanyId(data.company.id);
        setNewCompanyName('');
        setIsAddingCompany(false);
        setToast({ message: `Company "${data.company.name}" registered successfully.`, type: 'success' });
      }
    } catch {
      // fallback
      const fakeId = Date.now();
      const newComp = { id: fakeId, name: newCompanyName.trim(), code: null };
      setCompanies(prev => [...prev, newComp]);
      setCompanyId(fakeId);
      setIsAddingCompany(false);
      setNewCompanyName('');
    }
  };

  const handleCreateProject = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!projectName.trim() || !companyId || !startDate) {
      setFormError('Please fill in all required project information.');
      return;
    }

    setIsSubmitting(true);
    router.post('/projectlistpage', {
      title: projectName.trim(),
      company_id: companyId || null,
      company_name: newCompanyName.trim() || null,
      start: startDate,
      end: endDate || startDate,
    }, {
      onSuccess: () => {
        setToast({
          message: `Project "${projectName}" created! Standard WBS template loaded automatically.`,
          type: 'success',
        });
        setShowCreateModal(false);
        setIsSubmitting(false);
      },
      onError: (errors) => {
        const errText = Object.values(errors).flat().join(', ');
        setFormError(errText || 'Failed to create project.');
        setIsSubmitting(false);
      },
      onFinish: () => setIsSubmitting(false),
    });
  };

  const p = projectData;
  const isPIC = user?.isPIC || user?.role === 'pic';
  const canCreate = isPIC && Boolean(user?.canCreateProject);

  if (!p) {
    return (
      <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
        <PageHeader
          title="Project Overview"
          subtitle="Master template structure and Main Job breakdown"
        />
        <Card className="p-8 text-center space-y-3 bg-white border border-neutral-200">
          <Layers size={36} className="mx-auto text-neutral-300" />
          <div className="text-[15px] font-bold text-neutral-700">No Project Data Available</div>
          <p className="text-[12.5px] text-neutral-500 max-w-md mx-auto">
            The requested project data could not be loaded or no project is currently selected.
          </p>
          <div className="pt-2">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-white rounded-lg text-[12px] font-semibold hover:bg-brand-hover shadow-xs"
            >
              View Project List
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader
        title="Project Overview"
        subtitle="Master template structure and Main Job breakdown"
        actions={
          <div className="flex items-center gap-2.5">
            <StatusBadge status={p.status} size="md" />
            {canCreate}
          </div>
        }
      />

      {/* Top summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: Building2, label: 'Company', value: p.company },
          { icon: User, label: 'Project Manager', value: p.projectManager },
          { icon: Calendar, label: 'Start Date', value: formatDateDisplay(p.startDate) },
          { icon: Target, label: 'Target Completion', value: formatDateDisplay(p.endDate) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
              <Icon size={16} className="text-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">{label}</div>
              <div className="text-[13px] font-bold text-neutral-800 truncate mt-0.5">{value}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Progress summary */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-brand" />
            <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Total Project Progress</span>
          </div>
          <span className="text-[14px] font-bold text-brand">{p.overallProgress}%</span>
        </div>
        <ProgressBar value={p.overallProgress} size="md" />
        <div className="flex justify-between text-[11.5px] text-neutral-400 mt-2 font-medium">
          <span>Day {p.hariKe}</span>
          <span>{p.sisaHari} days remaining</span>
        </div>
      </Card>

      {/* Project Team & Assigned Members (Backend BE-06) */}
      {pageProps?.members && pageProps.members.length > 0 && (
        <Card className="p-4 bg-white border border-neutral-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <User size={16} className="text-brand" />
              <span className="text-[13px] font-bold text-neutral-800 tracking-tight">
                Project Team & Assigned Members
              </span>
              <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                {pageProps.members.length} Member{pageProps.members.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {pageProps.members.map((m: any) => (
              <div key={m.id} className="p-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-[12px] flex-shrink-0">
                  {m.username?.substring(0, 2).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-neutral-900 truncate">{m.username}</div>
                  <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-brand capitalize">{m.project_role || 'Member'}</span>
                    <span>•</span>
                    <span className="truncate">{m.division_name || 'General'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 3-Tier WBS Working Tree Section */}
      <div className="space-y-3 pt-2">
        {/* Header & Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <Layers size={17} className="text-brand" />
              <h2 className="text-[15px] sm:text-[16px] font-bold text-neutral-900 tracking-tight">
                Working Tree Structure (3-Tier WBS)
              </h2>
              <span className="text-[11px] font-mono text-neutral-500 font-semibold bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                Main Job → Sub Main Job → Task
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              Hierarchical view of master tasks, departmental PIC assignments, and operational subtasks
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isPIC && (
              <a
                href={`/tasks?project_id=${p.id}`}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand text-white hover:bg-brand-dark transition-colors shadow-xs"
                title="Go to Task Management to edit tasks and update progress"
              >
                Manage Tasks
              </a>
            )}
            <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-[11.5px]">
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-2.5 py-1 rounded text-neutral-700 hover:bg-white transition-colors font-medium cursor-pointer"
                title="Expand all Main Jobs and Sub Tasks"
              >
                Expand All
              </button>
              <span className="text-neutral-300">|</span>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-2.5 py-1 rounded text-neutral-700 hover:bg-white transition-colors font-medium cursor-pointer"
                title="Collapse all Main Jobs and Sub Tasks"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Search, Filter & Quick Division Bar */}
        <Card className="p-3.5 bg-neutral-50/70 border border-neutral-200/90 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by code, task name, or division..."
                className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] bg-white outline-none focus:border-brand shadow-2xs text-neutral-800 placeholder:text-neutral-400 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Division Dropdown Filter */}
              <div className="flex items-center gap-1 text-[12px] text-neutral-600 font-medium">
                <Filter size={12} className="text-neutral-400" />
                <span className="hidden sm:inline">Division:</span>
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-neutral-200 text-[11.5px] font-semibold bg-white outline-none focus:border-brand shadow-2xs text-neutral-800"
                >
                  <option value="all">All Divisions ({availableDivisions.length})</option>
                  {availableDivisions.map((div) => (
                    <option key={div} value={div}>
                      {formatDivisionName(div)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Dropdown Filter */}
              <div className="flex items-center gap-1 text-[12px] text-neutral-600 font-medium">
                <span className="hidden sm:inline">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-neutral-200 text-[11.5px] font-semibold bg-white outline-none focus:border-brand shadow-2xs text-neutral-800"
                >
                  <option value="all">All Statuses</option>
                  {Object.keys(STATUS_CONFIG).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Filter: My Division (if logged in user has division) */}
              {userDivision && availableDivisions.some((d) => normalizeDiv(d) === normalizeDiv(userDivision)) && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterDivision((prev) =>
                      normalizeDiv(prev) === normalizeDiv(userDivision) ? 'all' : userDivision
                    )
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-all border ${
                    normalizeDiv(filterDivision) === normalizeDiv(userDivision)
                      ? 'bg-brand text-white border-brand shadow-2xs'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand/40'
                  }`}
                  title="Quickly filter to your assigned department"
                >
                  <Shield size={11} />
                  <span>My Dept ({formatDivisionName(userDivision)})</span>
                </button>
              )}

              {/* Clear filters button */}
              {isFilteringActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterDivision('all');
                    setFilterStatus('all');
                  }}
                  className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 underline ml-1 cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Feedback banner for active filter results */}
          {isFilteringActive && (
            <div className="flex items-center justify-between text-[11px] text-neutral-500 mt-2.5 pt-2 border-t border-neutral-200/60">
              <span>
                Found <strong>{filteredMainJobs.length}</strong> Main Jobs and <strong>{totalFilteredTasks}</strong> tasks matching criteria
              </span>
              <span className="text-[10.5px] text-neutral-400">
                Matching branches automatically expanded
              </span>
            </div>
          )}
        </Card>

        {/* Tree Accordion Rows */}
        <div className="space-y-2.5">
          {filteredMainJobs.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-dashed border-neutral-200">
              <Layers size={28} className="mx-auto text-neutral-300 mb-2" />
              <h3 className="text-[13.5px] font-bold text-neutral-800">
                {isFilteringActive ? 'No matching WBS tasks found' : 'No Main Jobs or tasks defined yet'}
              </h3>
              <p className="text-[12px] text-neutral-500 mt-1 max-w-sm mx-auto">
                {isFilteringActive
                  ? 'No tasks match your current search or division filter. Try resetting your filters to view the complete working tree.'
                  : 'This project does not have any Main Jobs or WBS tasks loaded yet.'}
              </p>
              {isFilteringActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterDivision('all');
                    setFilterStatus('all');
                  }}
                  className="mt-3 text-[12px]"
                >
                  Reset Filters
                </Button>
              )}
            </Card>
          ) : (
            filteredMainJobs.map((mj: any) => (
              <MainJobTreeCard
                key={mj.id}
                mj={mj}
                projectId={p.id}
                isPIC={isPIC}
                isMainExpanded={expandedMainIds.has(String(mj.id))}
                expandedSubIds={expandedSubIds}
                onToggleMain={() => toggleMain(String(mj.id))}
                onToggleSub={(smjId) => toggleSub(smjId)}
                onOpenEvidence={(ev) => setEvidencePreview(ev)}
                onSelectTaskDetail={(task, parentSmj) =>
                  setSelectedTaskDetail({ task, parentSmj, parentMj: mj })
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Evidence Preview Modal */}
      {evidencePreview && (
        <EvidencePreviewModal
          evidence={evidencePreview}
          onClose={() => setEvidencePreview(null)}
        />
      )}

      {/* Task Detail Inspection Modal */}
      {selectedTaskDetail && (
        <TaskDetailModal
          task={selectedTaskDetail.task}
          parentSmj={selectedTaskDetail.parentSmj}
          parentMj={selectedTaskDetail.parentMj}
          projectId={p.id}
          onClose={() => setSelectedTaskDetail(null)}
          onOpenEvidence={(ev) => setEvidencePreview(ev)}
        />
      )}

      {/* Project Creation & Ownership Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setFormError(''); }}
        title="Create New Project"
        subtitle="Session 1 & Session 2 Workflow"
      >
        <div className="space-y-4 text-[13px]">
          {/* Admin Ownership Rule Enforcement View */}
          {user?.role === 'Admin' && !canCreate && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <Lock size={16} />
                </div>
                <div className="space-y-1 text-[12.5px]">
                  <div className="font-bold text-amber-900">
                    Admin Ownership Limit Reached (1 Admin = 1 Project)
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    Under PROVIS business rules, <strong>one Admin can own exactly one Project in total</strong> across all companies.
                    You are currently the registered owner of:
                  </p>
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200 font-semibold text-neutral-800 mt-2">
                    📁 {user?.ownedProject?.name || p.name}
                  </div>
                  <p className="text-amber-700 text-[11.5px] mt-2">
                    To instantiate another project with the master template, sign in with an unassigned Admin account (such as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900">admin2@provis.id</code>).
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[12px] text-neutral-600 space-y-1">
                <div className="font-semibold text-neutral-800">Master Template Information:</div>
                <div>When a new project is created by an unassigned Admin:</div>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-500 pl-1">
                  <li>System automatically loads all 17 fixed Main Jobs</li>
                  <li>System assigns all 72 Sub Main Jobs to their predefined PICs</li>
                  <li>Admin is assigned as the single owner of that project</li>
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* PIC User Block View */}
          {user?.role === 'PIC' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-200 flex items-start gap-3">
                <AlertCircle size={18} className="text-neutral-500 flex-shrink-0 mt-0.5" />
                <div className="text-[12.5px] text-neutral-600 space-y-1">
                  <div className="font-bold text-neutral-800">PIC Authorization Notice</div>
                  <p>
                    Only Admin accounts can instantiate and own projects. Your current role is <strong>PIC ({user.pic})</strong>.
                    To test project creation, sign in as an Admin.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Unassigned Admin: Project Creation Form */}
          {user?.role === 'Admin' && canCreate && (
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-50/80 border border-blue-100 text-[12px] text-blue-900 leading-relaxed">
                You are currently an unassigned Admin. Creating a project will assign ownership to your account and <strong>automatically load the 17 fixed Main Jobs and Sub Main Jobs</strong>.
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-[12.5px] flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Dynamic Company Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12.5px] font-semibold text-neutral-700">Company *</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCompany(!isAddingCompany)}
                    className="text-[11.5px] text-brand hover:underline font-medium"
                  >
                    {isAddingCompany ? 'Cancel' : '+ New Company'}
                  </button>
                </div>

                {isAddingCompany ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. PT Indoprima Perdana"
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      className="flex-1 px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={handleCreateCompany}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <select
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand bg-white"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Project Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ekspansi Fasilitas Perakitan Unit IV"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Project Manager *
                </label>
                <input
                  type="text"
                  value={pmName}
                  onChange={e => setPmName(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                    Target End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Total Budget (IDR)
                </label>
                <input
                  type="number"
                  placeholder="30000000000"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional project notes or scope description..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="shadow-xs"
                >
                  {isSubmitting ? 'Provisioning...' : 'Create & Load Template'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}

interface MainJobTreeCardProps {
  mj: MainJob;
  projectId: number | string;
  isPIC: boolean;
  isMainExpanded: boolean;
  expandedSubIds: Set<string>;
  onToggleMain: () => void;
  onToggleSub: (smjId: string) => void;
  onOpenEvidence: (ev: EvidenceItem) => void;
  onSelectTaskDetail: (task: SubSubtask, parentSmj: SubMainJob) => void;
}

function MainJobTreeCard({
  mj,
  projectId,
  isPIC,
  isMainExpanded,
  expandedSubIds,
  onToggleMain,
  onToggleSub,
  onOpenEvidence,
  onSelectTaskDetail,
}: MainJobTreeCardProps) {
  const subMainJobs = mj.subMainJobs || [];

  return (
    <Card className="overflow-hidden border border-neutral-200/90 shadow-2xs">
      {/* Level 1: Main Job Header */}
      <button
        type="button"
        onClick={onToggleMain}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50/80 transition-colors text-left bg-white"
        aria-expanded={isMainExpanded}
      >
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center flex-shrink-0 shadow-xs">
          <span className="text-white text-[12px] font-bold">{mj.code}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] sm:text-[15.5px] font-bold text-neutral-900 truncate">
            {mj.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[12px] font-medium text-neutral-500">
              {subMainJobs.length} Sub Main Jobs
            </span>
            <span className="text-[12px] text-neutral-300">·</span>
            <span className="text-[12px] font-bold text-neutral-700 inline-flex items-center gap-1">
              <Scale size={11} className="text-neutral-400" />
              Weight: {mj.weight}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          <StatusBadge status={mj.status} size="sm" />
          <div className="w-16 sm:w-24 hidden xs:block">
            <ProgressBar value={mj.progress} size="sm" showLabel={false} />
          </div>
          <span className="text-[13.5px] sm:text-[14.5px] font-black text-neutral-900 w-12 text-right">
            {mj.progress}%
          </span>
          <ChevronDown
            size={16}
            className={`text-neutral-400 transition-transform duration-200 ${
              isMainExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Level 2 & 3 Hierarchy (Visible when Level 1 is expanded) */}
      {isMainExpanded && (
        <div className="border-t border-neutral-100 bg-neutral-50/30">
          {subMainJobs.length > 0 ? (
            subMainJobs.map((smj: SubMainJob) => {
              const smjId = String(smj.id);
              const isSubExpanded = expandedSubIds.has(smjId);
              const tasks = (smj as any).subtasks || [];
              const divisionName = formatDivisionName(smj.pic || 'Unassigned');

              return (
                <div key={smj.id} className="border-b last:border-b-0 border-neutral-100">
                  {/* Level 2: Sub Main Job Bar */}
                  <button
                    type="button"
                    onClick={() => onToggleSub(smjId)}
                    className="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-2.5 hover:bg-neutral-100/70 transition-colors text-left bg-neutral-50/50"
                    aria-expanded={isSubExpanded}
                  >
                    <ChevronRight
                      size={15}
                      className={`text-neutral-400 flex-shrink-0 transition-transform duration-200 ${
                        isSubExpanded ? 'rotate-90' : ''
                      }`}
                    />

                    <div className="w-6 h-6 rounded bg-neutral-200/90 flex items-center justify-center flex-shrink-0">
                      <span className="text-neutral-700 text-[10.5px] font-bold">{smj.code}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] sm:text-[13.5px] font-semibold text-neutral-800 truncate">
                        {smj.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200"
                          title={`PIC Division: ${divisionName}`}
                        >
                          <Shield size={10} className="text-neutral-500" />
                          PIC: {divisionName}
                        </span>
                        <span className="text-[11px] text-neutral-500 font-semibold inline-flex items-center gap-1">
                          <Scale size={10} className="text-neutral-400" />
                          Weight: {smj.weight}%
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
                      <StatusBadge status={smj.status} size="xs" />
                      <div className="w-14 sm:w-20 hidden sm:block">
                        <ProgressBar value={smj.progress} size="xs" showLabel={false} />
                      </div>
                      <span className="text-[12px] sm:text-[12.5px] font-bold text-neutral-800 w-10 text-right">
                        {smj.progress}%
                      </span>
                    </div>
                  </button>

                  {/* Level 3: Subtask / Operational Tasks Rows */}
                  {isSubExpanded && (
                    <div className="bg-white border-t border-neutral-100/80 divide-y divide-neutral-100">
                      {tasks.length > 0 ? (
                        tasks.map((task: SubSubtask) => {
                          const taskDivision = formatDivisionName(task.division || smj.pic || 'Unassigned');
                          const evidences = task.evidences || (task.evidence ? [task.evidence] : []);

                          return (
                            <div
                              key={task.id}
                              className="pl-8 sm:pl-12 pr-3 sm:pr-4 py-2 hover:bg-blue-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-2 border-l-2 border-l-transparent hover:border-l-brand"
                            >
                              {/* Task Identity and Metadata */}
                              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 flex-shrink-0">
                                    {task.code}
                                  </span>
                                  <span className="text-[12.5px] font-medium text-neutral-900 truncate">
                                    {task.name}
                                  </span>
                                </div>

                                {/* PIC-Relevant Metadata Badges */}
                                <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                                  {/* Responsible Division / PIC */}
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-50 text-neutral-700 border border-neutral-200"
                                    title={`Responsible Division: ${taskDivision}`}
                                  >
                                    <Shield size={10} className="text-neutral-500" />
                                    {taskDivision}
                                  </span>

                                  {/* Weight */}
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-50 text-neutral-600 border border-neutral-200"
                                    title={`Task Weight: ${task.weight ?? 0}%`}
                                  >
                                    <Scale size={10} className="text-neutral-400" />
                                    {task.weight ?? 0}%
                                  </span>

                                  {/* Schedule Timeline & Duration */}
                                  {(task.startDate || task.finishDate) && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10.5px] text-neutral-500 font-medium"
                                      title={`Timeline: ${formatDateDisplay(task.startDate)} → ${formatDateDisplay(task.finishDate)} (${task.duration ?? 0} days)`}
                                    >
                                      <Calendar size={10} className="text-neutral-400" />
                                      <span className="hidden xl:inline">
                                        {formatDateDisplay(task.startDate)} → {formatDateDisplay(task.finishDate)}
                                      </span>
                                      <span className="xl:hidden">{task.duration ?? 0}d</span>
                                    </span>
                                  )}

                                  {/* Days Left */}
                                  {task.daysLeft !== undefined && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium ${
                                        task.daysLeft <= 0
                                          ? 'text-red-600 font-bold'
                                          : task.daysLeft <= 3
                                          ? 'text-amber-600 font-semibold'
                                          : 'text-neutral-500'
                                      }`}
                                      title={`Days Remaining: ${task.daysLeft} days`}
                                    >
                                      <Clock size={10} />
                                      {task.daysLeft}d left
                                    </span>
                                  )}

                                  {/* Predecessor */}
                                  {task.predecessor && (
                                    <span
                                      className="text-[10px] font-mono px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 border border-neutral-200"
                                      title={`Predecessor: ${task.predecessor}`}
                                    >
                                      Pred: {task.predecessor}
                                    </span>
                                  )}

                                  {/* Evidence Indicator */}
                                  {evidences.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenEvidence(evidences[0]);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                      title="Click to view attached completion evidence"
                                    >
                                      <Paperclip size={10} />
                                      {evidences.length} file{evidences.length > 1 ? 's' : ''}
                                    </button>
                                  ) : task.requiresEvidence ? (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                                      title="Evidence required for completion"
                                    >
                                      <Paperclip size={10} />
                                      Req
                                    </span>
                                  ) : null}

                                  {/* Completion Audit Checkmark */}
                                  {(task.checked || task.completedByName) && (
                                    <span
                                      className="inline-flex items-center text-emerald-600"
                                      title={`Completed by ${task.completedByName || 'PIC'} on ${formatDateDisplay(task.completedAt)}`}
                                    >
                                      <CheckCircle2 size={12} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Progress, Status & Inspection Action */}
                              <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 self-end md:self-auto">
                                <StatusBadge status={task.status} size="xs" />
                                <div className="w-14 sm:w-16 hidden sm:block">
                                  <ProgressBar value={task.progress ?? 0} size="xs" showLabel={false} />
                                </div>
                                <span className="text-[11.5px] font-bold text-neutral-800 w-9 text-right">
                                  {task.progress ?? 0}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onSelectTaskDetail(task, smj)}
                                  className="p-1 rounded text-neutral-400 hover:text-brand hover:bg-neutral-100 transition-colors"
                                  title="Inspect Task Details"
                                >
                                  <Eye size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="pl-8 sm:pl-12 pr-4 py-3 text-[12px] text-neutral-400 italic bg-white">
                          No operational tasks defined under this Sub Main Job.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="px-10 py-4 text-[12px] text-neutral-400 italic">
              No Sub Main Jobs defined in template.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EvidencePreviewModal({
  evidence,
  onClose,
}: {
  evidence: EvidenceItem | any;
  onClose: () => void;
}) {
  const fileName = evidence.name || evidence.file_name || 'Evidence File';
  const fileUrl = evidence.previewUrl || evidence.url || evidence.file_url || '';
  const isPdf =
    evidence.type?.includes('pdf') ||
    evidence.mime_type?.includes('pdf') ||
    fileName.toLowerCase().endsWith('.pdf') ||
    fileUrl.toLowerCase().endsWith('.pdf');
  const isImage =
    evidence.type?.includes('image') ||
    evidence.mime_type?.includes('image') ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileName) ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileUrl);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Evidence Preview"
      subtitle={fileName}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-neutral-800 truncate">{fileName}</div>
              <div className="text-[11px] text-neutral-500">
                {evidence.size ? `Size: ${evidence.size}` : ''}
                {evidence.uploaded_at ? ` · Uploaded: ${formatDateDisplay(evidence.uploaded_at)}` : ''}
              </div>
            </div>
          </div>
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-brand bg-white border border-brand/20 rounded-md hover:bg-neutral-50 transition-colors shadow-2xs"
            >
              <ExternalLink size={13} />
              Open in New Tab
            </a>
          )}
        </div>

        {fileUrl ? (
          <div className="rounded-lg border border-neutral-200 overflow-hidden bg-neutral-900/5 min-h-[300px] flex items-center justify-center">
            {isPdf ? (
              <iframe
                src={fileUrl}
                className="w-full h-[550px] border-0"
                title={fileName}
              />
            ) : isImage ? (
              <img
                src={fileUrl}
                alt={fileName}
                className="max-h-[500px] w-auto max-w-full object-contain mx-auto"
              />
            ) : (
              <div className="p-8 text-center space-y-3">
                <FileText size={48} className="mx-auto text-neutral-400" />
                <div className="text-[13px] text-neutral-600">
                  Preview not directly supported in-line for this file type.
                </div>
                <a
                  href={fileUrl}
                  download={fileName}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-[12px] font-semibold rounded-lg hover:bg-brand-hover shadow-xs"
                >
                  Download File
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-neutral-400 text-[13px] border border-dashed border-neutral-200 rounded-lg">
            No URL available for preview.
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TaskDetailModal({
  task,
  parentSmj,
  parentMj,
  projectId,
  onClose,
  onOpenEvidence,
}: {
  task: SubSubtask;
  parentSmj?: SubMainJob;
  parentMj?: MainJob;
  projectId: number | string;
  onClose: () => void;
  onOpenEvidence: (ev: EvidenceItem) => void;
}) {
  const divisionName = formatDivisionName(task.division || parentSmj?.pic || 'Unassigned');
  const evidences = task.evidences || (task.evidence ? [task.evidence] : []);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Task Details · ${task.code}`}
      subtitle={task.name}
      size="lg"
    >
      <div className="space-y-4 text-[13px]">
        {/* Breadcrumb Hierarchy Navigation */}
        <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[11.5px] text-neutral-600 space-y-1">
          <div className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">
            WBS Hierarchy Location
          </div>
          <div className="flex items-center gap-1.5 flex-wrap font-medium">
            <span className="text-neutral-800 font-semibold">{parentMj?.code} {parentMj?.name}</span>
            <span className="text-neutral-400">/</span>
            <span className="text-neutral-800 font-semibold">{parentSmj?.code} {parentSmj?.name}</span>
            <span className="text-neutral-400">/</span>
            <span className="text-brand font-bold">{task.code} {task.name}</span>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-neutral-200 bg-white">
            <div className="text-[10.5px] uppercase font-semibold text-neutral-400 flex items-center gap-1 mb-1">
              <Shield size={12} className="text-neutral-500" /> Division / PIC
            </div>
            <div className="text-[13px] font-bold text-neutral-800 truncate" title={divisionName}>
              {divisionName}
            </div>
          </div>

          <div className="p-3 rounded-lg border border-neutral-200 bg-white">
            <div className="text-[10.5px] uppercase font-semibold text-neutral-400 flex items-center gap-1 mb-1">
              <Scale size={12} className="text-neutral-500" /> Weight
            </div>
            <div className="text-[14px] font-bold text-neutral-900">
              {task.weight ?? 0}%
            </div>
          </div>

          <div className="p-3 rounded-lg border border-neutral-200 bg-white">
            <div className="text-[10.5px] uppercase font-semibold text-neutral-400 flex items-center gap-1 mb-1">
              <Target size={12} className="text-neutral-500" /> Progress
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-black text-neutral-900">{task.progress ?? 0}%</span>
              <div className="flex-1">
                <ProgressBar value={task.progress ?? 0} size="xs" showLabel={false} />
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-neutral-200 bg-white">
            <div className="text-[10.5px] uppercase font-semibold text-neutral-400 flex items-center gap-1 mb-1">
              <Clock size={12} className="text-neutral-500" /> Status
            </div>
            <div>
              <StatusBadge status={task.status} size="sm" />
            </div>
          </div>
        </div>

        {/* Schedule & Duration Information */}
        <div className="p-3.5 rounded-lg border border-neutral-200 bg-white space-y-2">
          <div className="text-[11px] uppercase font-bold text-neutral-500 flex items-center gap-1.5">
            <Calendar size={13} className="text-neutral-600" /> Schedule & Dependencies
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[12.5px]">
            <div>
              <span className="text-neutral-500 text-[11px] block">Timeline</span>
              <span className="font-semibold text-neutral-800">
                {task.startDate ? formatDateDisplay(task.startDate) : '—'} → {task.finishDate ? formatDateDisplay(task.finishDate) : '—'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 text-[11px] block">Duration / Days Left</span>
              <span className="font-semibold text-neutral-800">
                {task.duration ?? 0} days ({task.daysLeft !== undefined ? `${task.daysLeft}d left` : '—'})
              </span>
            </div>
            <div>
              <span className="text-neutral-500 text-[11px] block">Predecessors</span>
              <span className="font-semibold text-neutral-800">
                {task.predecessor ? (
                  <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200 text-[11px]">
                    {task.predecessor}
                  </span>
                ) : (
                  <span className="text-neutral-400">None</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Completion Audit Info */}
        {(task.completedByName || task.completedAt || task.checked) && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12px] flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <div>
              <span className="font-bold">Completion Verified</span>
              {task.completedByName && (
                <span> by <strong>{task.completedByName}</strong></span>
              )}
              {task.completedAt && (
                <span> on {formatDateDisplay(task.completedAt)}</span>
              )}
            </div>
          </div>
        )}

        {/* Evidence Section */}
        <div className="p-3.5 rounded-lg border border-neutral-200 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase font-bold text-neutral-500 flex items-center gap-1.5">
              <Paperclip size={13} className="text-neutral-600" /> Completion Evidence
            </div>
            {task.requiresEvidence && (
              <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Evidence Required
              </span>
            )}
          </div>

          {evidences.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {evidences.map((ev: any, idx: number) => {
                const name = ev.name || ev.file_name || `Evidence File ${idx + 1}`;
                return (
                  <div
                    key={ev.id || idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-neutral-100 hover:bg-neutral-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-neutral-500 flex-shrink-0" />
                      <span className="text-[12px] font-medium text-neutral-800 truncate">{name}</span>
                      {ev.size && <span className="text-[11px] text-neutral-400">({ev.size})</span>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenEvidence(ev)}
                      className="text-[11px] gap-1"
                    >
                      <Eye size={11} /> View
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-neutral-400 italic py-1">
              No evidence files attached to this task.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Link
            href={`/tasks?project_id=${projectId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand rounded-lg hover:bg-brand-hover shadow-xs transition-colors"
          >
            Open in Tasks Workspace
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
