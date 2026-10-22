import { useState, useId, useMemo } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import {
  Calendar, FolderOpen, Plus, ShieldAlert, Settings, Lock,
  Users, Search, Trash2, UserPlus, X, Network, ExternalLink
} from 'lucide-react';
import { PageHeader, Button, Modal, formatDateDisplay } from '@/components/ui';

interface ProjectMemberItem {
  id: number;
  user_id: number;
  name: string;
  email: string;
  system_role: string;
  project_role: string;
  position_title: string;
  division_name: string;
}

interface Project {
  id: number;
  name: string;
  company: string;
  manager: string;
  status: string;
  setup_status?: 'pending_setup' | 'active';
  progress: number;
  planned_progress?: number;
  start_date: string | null;
  end_date: string | null;
  is_private: boolean;
  members?: ProjectMemberItem[];
}

interface CompanyItem {
  id: number;
  name: string;
}

interface AvailableUserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  division: string;
  company_id: number | null;
}

interface TemplateItem {
  id: number;
  name: string;
  is_default: boolean;
}

export default function ProjectListPage() {
  const {
    projects = [],
    canCreate = false,
    companies = [],
    auth,
    hasPrivateFeature = false,
    availableUsers = [],
    templates = [],
  } = usePage().props as any;
  const role = auth?.user?.role ?? '';
  const isAdminProgres = role === 'admin_progres';
  const isAdminUtama   = role === 'admin_utama';
  const isPIC          = role === 'pic';
  const isWorker       = role === 'worker';

  // Modal create project state (PIC only)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const def = templates.find((t: any) => t.is_default);
    return def ? String(def.id) : (templates[0]?.id ? String(templates[0].id) : '');
  });
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [settingsUserToAdd, setSettingsUserToAdd] = useState<string>('');

  const filteredAvailableUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return availableUsers.filter((u: AvailableUserItem) => {
      if (!q) return true;
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.division && u.division.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q))
      );
    });
  }, [availableUsers, memberSearch]);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Project name is required.');
      return;
    }

    if (endDate <= startDate) {
      setErrorMsg('Target Finish Date must be after Start Date (at least 1 day later).');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    router.post('/projectlistpage', {
      title: title.trim(),
      company_id: companyId || null,
      company_name: newCompanyName.trim() || null,
      start: startDate,
      end: endDate,
      is_private: isPrivate,
      template_id: selectedTemplateId ? Number(selectedTemplateId) : null,
      member_ids: isPrivate ? selectedMemberIds : [],
    }, {
      onError: (errors) => {
        setErrorMsg(Object.values(errors)[0] as string || 'Failed to create project.');
        setSubmitting(false);
      },
      onFinish: () => {
        setSubmitting(false);
      },
    });
  };

  const togglePrivate = (projectId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    router.put(`/projects/${projectId}/toggle-private`, {}, {
      preserveScroll: true
    });
  };

function getProjectTitleClasses(title: string) {
  const len = (title || '').trim().length;
  if (len <= 20) {
    return 'text-[20px] sm:text-[22px] font-black leading-tight tracking-tight';
  } else if (len <= 40) {
    return 'text-[17px] sm:text-[18.5px] font-extrabold leading-snug tracking-tight';
  } else {
    return 'text-[14.5px] sm:text-[15.5px] font-bold leading-snug line-clamp-2';
  }
}

  return (
    <div className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto space-y-4 sm:space-y-5">
      <PageHeader
        title="Project List"
        subtitle="Select a project to view its details and progress."
        actions={
          <div className="flex items-center gap-2">
            {canCreate && isPIC && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setShowCreateModal(true)}
              >
                New Project
              </Button>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border shadow-2xs">
              <FolderOpen size={14} />
              {projects?.length ?? 0} Projects
            </span>
          </div>
        }
      />

      {/* Role info alert (Admin Progres only) */}
      {isAdminProgres && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-[12.5px] text-amber-800">
          <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Progress Admin Role:</strong> Dedicated monitoring for <strong>S-Curve</strong> charts. Clicking a project below will directly open its S-Curve.
          </span>
        </div>
      )}

      {(!projects || projects.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-neutral-200/80 p-8 shadow-xs">
          <div className="w-14 h-14 rounded-xl bg-brand/10 flex items-center justify-center mb-3 text-brand">
            <FolderOpen size={26} />
          </div>
          <h3 className="text-[15px] font-bold text-neutral-800 mb-1">
            {canCreate && isPIC ? "You Don't Have Any Projects Yet" : "No Projects Found"}
          </h3>
          <p className="text-[13px] text-neutral-500 max-w-md mb-4">
            {canCreate && isPIC
              ? "As a newly registered PIC, you can create the first project for your company. A standard 3-tier WBS template will be automatically initialized!"
              : "There are currently no projects registered in the system."}
          </p>
          {canCreate && isPIC && (
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setShowCreateModal(true)}
            >
              Create New Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {projects.map((project: Project) => {
            const isPending = project.setup_status === 'pending_setup';
            const targetHref = isPending
              ? (isWorker || isAdminProgres ? '#' : `/projects/${project.id}/setup`)
              : (isAdminProgres ? `/scurve?project_id=${project.id}` : (isWorker ? `/tasks?project_id=${project.id}` : `/projects/${project.id}`));

            return (
              <Link
                key={project.id}
                href={targetHref}
                onClick={(e) => {
                  if (isPending && (isWorker || isAdminProgres)) {
                    e.preventDefault();
                    alert('This project is currently in WBS setup mode by the PIC and cannot be accessed yet.');
                  }
                }}
                className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl"
              >
                <div className="p-4 sm:p-5 h-full flex flex-col justify-between bg-white rounded-2xl border-[2.5px] border-[#0F172A] hover:border-[#1E3A8A] shadow-sm hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
                  {/* Card Header: Project Name & Dates only */}
                  <div>
                    {/* Project Name (Enlarged, Dynamic Sizing, Contained) */}
                    <div className="min-h-[50px] sm:min-h-[56px] flex items-start justify-between gap-2 mb-1">
                      <h3
                        className={`${getProjectTitleClasses(project.name)} text-neutral-900 group-hover:text-brand transition-colors break-words`}
                        title={project.name}
                      >
                        {project.name}
                      </h3>
                      {isPIC && hasPrivateFeature && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSettingsProject(project);
                          }}
                          title="Project Settings"
                          className="p-1.5 rounded-lg flex-shrink-0 transition-colors text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                        >
                          <Settings size={18} />
                        </button>
                      )}
                    </div>

                    {/* Setup status badge if pending */}
                    {isPending && (
                      <div className="mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <Lock size={12} className="text-amber-600" />
                          Setup Mode (Locked)
                        </span>
                      </div>
                    )}

                    {/* Start Date & End Date */}
                    <div className="flex items-center gap-1.5 text-[12px] text-neutral-500 font-medium mb-3">
                      <Calendar size={13.5} className="text-brand flex-shrink-0" />
                      <span>
                        {project.start_date ? formatDateDisplay(project.start_date) : 'N/A'} – {project.end_date ? formatDateDisplay(project.end_date) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Dual-Indicator Speedometer Gauge */}
                  <div className="pt-1">
                    <SpeedometerGauge
                      plan={project.planned_progress ?? 0}
                      actual={project.progress ?? 0}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Project Settings Modal */}
      {settingsProject && (
        <Modal
          title="Project Settings & Access"
          onClose={() => setSettingsProject(null)}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-[14px] font-bold text-neutral-800 mb-1">{settingsProject.name}</h4>
              <p className="text-[12px] text-neutral-500">Configure access, privacy, and team members for this project.</p>
            </div>
            
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-[13px] font-bold text-neutral-800 flex items-center gap-1.5">
                    <ShieldAlert size={15} className="text-amber-500" />
                    Private Project
                  </h5>
                  <p className="text-[11.5px] text-neutral-500 mt-0.5">
                    {settingsProject.is_private
                      ? 'Only explicitly assigned members and you can see this project.'
                      : 'Public to all users in this company.'}
                  </p>
                </div>
                
                {/* Switch Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    togglePrivate(settingsProject.id);
                    setSettingsProject({ ...settingsProject, is_private: !settingsProject.is_private });
                  }}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition-colors duration-200 ease-in-out ${settingsProject.is_private ? 'bg-brand' : 'bg-neutral-300'}`}
                >
                  <span className="sr-only">Toggle Private</span>
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settingsProject.is_private ? 'translate-x-2' : '-translate-x-2'}`}
                  />
                </button>
              </div>
            </div>

            {/* Direct Member Management for Private Project */}
            {settingsProject.is_private && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-[13px] font-bold text-neutral-800 flex items-center gap-1.5">
                      <Users size={15} className="text-brand" />
                      Private Project Members ({(settingsProject.members || []).length})
                    </h5>
                    <p className="text-[11.5px] text-neutral-500">
                      Add or remove individuals granted access by name.
                    </p>
                  </div>
                  <Link
                    href={`/working-tree?project_id=${settingsProject.id}`}
                    className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand hover:underline"
                  >
                    Working Tree Structure <ExternalLink size={12} />
                  </Link>
                </div>

                {/* Add new member row */}
                <div className="flex items-center gap-2">
                  <select
                    value={settingsUserToAdd}
                    onChange={e => setSettingsUserToAdd(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-[12.5px] bg-white outline-none focus:border-brand"
                  >
                    <option value="">-- Add Team Member by Name --</option>
                    {availableUsers
                      .filter((u: any) => !(settingsProject.members || []).some((m: any) => m.user_id === u.id))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role} - {u.division})
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!settingsUserToAdd}
                    onClick={() => {
                      if (!settingsUserToAdd) return;
                      router.post(`/projects/${settingsProject.id}/members`, {
                        user_id: Number(settingsUserToAdd),
                        project_role: 'worker',
                        position_title: 'Member',
                      }, {
                        preserveScroll: true,
                        onSuccess: () => {
                          const addedUser = availableUsers.find((u: any) => u.id === Number(settingsUserToAdd));
                          if (addedUser) {
                            const newMembers = [
                              ...(settingsProject.members || []),
                              {
                                id: Date.now(),
                                user_id: addedUser.id,
                                name: addedUser.name,
                                email: addedUser.email,
                                system_role: addedUser.role,
                                project_role: 'worker',
                                position_title: 'Member',
                                division_name: addedUser.division,
                              }
                            ];
                            setSettingsProject({ ...settingsProject, members: newMembers });
                          }
                          setSettingsUserToAdd('');
                        }
                      });
                    }}
                  >
                    Add
                  </Button>
                </div>

                {/* Current Members List */}
                <div className="max-h-44 overflow-y-auto divide-y divide-neutral-200/60 border border-neutral-200 rounded-lg bg-white">
                  {(!settingsProject.members || settingsProject.members.length === 0) ? (
                    <div className="p-3 text-center text-[12px] text-neutral-400">
                      No members assigned yet. Use the dropdown above to add members.
                    </div>
                  ) : (
                    settingsProject.members.map((m: any) => (
                      <div key={m.id || m.user_id} className="flex items-center justify-between p-2.5 hover:bg-neutral-50 text-[12px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-[10px]">
                            {(m.name || 'M').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-neutral-800 truncate block">{m.name}</span>
                            <span className="text-[11px] text-neutral-400 truncate block">{m.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                            {m.division_name || 'General'}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase">
                            {m.project_role || 'worker'}
                          </span>
                          <button
                            type="button"
                            title="Remove Member"
                            onClick={() => {
                              router.delete(`/projects/${settingsProject.id}/members/${m.id}`, {
                                preserveScroll: true,
                                onSuccess: () => {
                                  const updated = (settingsProject.members || []).filter((mem: any) => mem.id !== m.id);
                                  setSettingsProject({ ...settingsProject, members: updated });
                                }
                              });
                            }}
                            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Create Project (PIC Only) */}
      {showCreateModal && canCreate && isPIC && (
        <Modal
          title="Create New Project (PIC)"
          onClose={() => setShowCreateModal(false)}
          size="md"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger-light text-danger text-[12px] font-semibold">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Project Name / Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. EXPANSION PLANT PHASE 2"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                required
              />
            </div>

            {/* Company selection */}
            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Company <span className="text-danger">*</span>
              </label>
              {companies.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={companyId}
                    onChange={e => {
                      setCompanyId(e.target.value);
                      if (e.target.value) setNewCompanyName('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  >
                    <option value="">-- Select Registered Company --</option>
                    {companies.map((c: CompanyItem) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <div className="text-[11px] text-neutral-400 text-center font-medium">or register a new company:</div>
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={e => {
                      setNewCompanyName(e.target.value);
                      if (e.target.value) setCompanyId('');
                    }}
                    placeholder="New company name if not listed"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              )}
            </div>

            {/* Template Selection */}
            {templates && templates.length > 0 && (
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Initial WBS Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
                >
                  {templates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.is_default ? '★ (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Start Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    const newStart = e.target.value;
                    setStartDate(newStart);
                    if (newStart && endDate && endDate <= newStart) {
                      const next = new Date(newStart);
                      next.setDate(next.getDate() + 1);
                      setEndDate(next.toISOString().slice(0, 10));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Target Finish Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={(() => {
                    if (!startDate) return undefined;
                    const next = new Date(startDate);
                    next.setDate(next.getDate() + 1);
                    return next.toISOString().slice(0, 10);
                  })()}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
            </div>
            {startDate && endDate && endDate <= startDate && (
              <p className="text-[11.5px] text-red-600 font-semibold mt-1">
                Target Finish Date must be after Start Date (at least 1 day later).
              </p>
            )}

            {hasPrivateFeature && (
              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-2 p-3 border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={isPrivate} 
                    onChange={e => {
                      setIsPrivate(e.target.checked);
                      if (!e.target.checked) setSelectedMemberIds([]);
                    }} 
                    className="rounded text-brand focus:ring-brand"
                  />
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-neutral-800">
                    <ShieldAlert size={15} className="text-amber-500" />
                    Make this project Private
                  </div>
                </label>

                {isPrivate && (
                  <div className="p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[12.5px] font-bold text-neutral-800 flex items-center gap-1.5">
                          <Users size={14} className="text-brand" />
                          Select Private Project Members
                        </div>
                        <p className="text-[11.5px] text-neutral-500">
                          Choose team members who are granted access to this private project by name.
                        </p>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                        {selectedMemberIds.length} selected
                      </span>
                    </div>

                    {/* Member search bar */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search member by name or email..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 text-[12px] bg-white outline-none focus:border-brand"
                      />
                    </div>

                    {/* Quick selection buttons */}
                    <div className="flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedMemberIds(filteredAvailableUsers.map((u: any) => u.id))}
                        className="text-brand font-semibold hover:underline"
                      >
                        Select All Filtered
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberIds([])}
                        className="text-neutral-500 hover:text-neutral-700 hover:underline"
                      >
                        Clear Selection
                      </button>
                    </div>

                    {/* Member Selection list */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-neutral-200/60 border border-neutral-200 rounded-lg bg-white">
                      {filteredAvailableUsers.length === 0 ? (
                        <div className="p-4 text-center text-[12px] text-neutral-400">
                          No matching team members found.
                        </div>
                      ) : (
                        filteredAvailableUsers.map((u: any) => {
                          const isSelected = selectedMemberIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className={`flex items-center justify-between p-2.5 cursor-pointer hover:bg-neutral-50 transition-colors ${
                                isSelected ? 'bg-blue-50/50' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedMemberIds(prev =>
                                      isSelected ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                    );
                                  }}
                                  className="rounded text-brand focus:ring-brand"
                                />
                                <div className="w-6 h-6 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                  {(u.name || u.username || 'U').slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12.5px] font-bold text-neutral-800 truncate">
                                    {u.name || u.username}
                                  </div>
                                  <div className="text-[11px] text-neutral-400 truncate">
                                    {u.email}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">
                                  {u.division || 'General'}
                                </span>
                                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-brand/10 text-brand">
                                  {u.role || 'worker'}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}


            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
              >
                Save & Open Project
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function getActualTheme(actualVal: number, planVal: number) {
  const isAhead = actualVal > planVal;
  const isComplete = actualVal >= 100;

  // Rule 6: If Actual > Plan, the Actual line turns GREEN!
  if (isAhead) {
    return {
      color: '#16A34A', // Green when ahead of plan
      isAhead: true,
      isComplete,
    };
  }

  // Normal visual threshold rules (Actual <= Plan):
  // 90–100% → Green
  // 70–90%  → Yellow
  // 0–70%   → Red
  if (actualVal >= 90) {
    return {
      color: '#16A34A',
      isAhead: false,
      isComplete,
    };
  }

  if (actualVal >= 70) {
    return {
      color: '#EAB308',
      isAhead: false,
      isComplete: false,
    };
  }

  return {
    color: '#DC2626',
    isAhead: false,
    isComplete: false,
  };
}

function SpeedometerGauge({ plan = 0, actual = 0 }: { plan?: number; actual?: number }) {
  const uniqueId = useId().replace(/:/g, '');
  const redGradId = `gauge-red-${uniqueId}`;
  const shineGradId = `gauge-shine-${uniqueId}`;

  const planVal = Math.max(0, Math.min(100, Math.round(plan)));
  const actualVal = Math.max(0, Math.min(100, Math.round(actual)));
  const actualTheme = getActualTheme(actualVal, planVal);

  const cx = 130;
  const cy = 118;
  const r = 88;
  const strokeWidth = 14;

  // Calculate coordinates on the arc for any percentage (0 to 100)
  const getPoint = (percent: number, radius: number = r) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const rad = (180 + (clamped / 100) * 180) * (Math.PI / 180);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  // Helper for arc path between two percentages
  const describeArc = (startPct: number, endPct: number, radius: number = r) => {
    const p1 = getPoint(startPct, radius);
    const p2 = getPoint(endPct, radius);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  const planTip = getPoint(planVal, 64);
  const actualTip = getPoint(actualVal, 72);

  // Key coordinates for gradient and points
  const p0 = getPoint(0);
  const p70 = getPoint(70);
  const p100 = getPoint(100);

  // Label coordinates (outside track)
  const labelRadius = r + 18;
  const p30Label = getPoint(30, labelRadius);
  const p50Label = getPoint(50, r + 16);
  const p70Label = getPoint(70, labelRadius);
  const p90Label = getPoint(90, r + 17);

  return (
    <div className="flex flex-col items-center justify-center w-full pt-1">
      <div className="relative w-full max-w-[285px] aspect-[260/142]">
        <svg viewBox="0 0 260 142" className="w-full h-full overflow-visible">
          <defs>
            {/* Linear Gradient for Zone 0% - 70%: Solid Red */}
            <linearGradient
              id={redGradId}
              x1={p0.x}
              y1={p0.y}
              x2={p70.x}
              y2={p70.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#DC2626" />
              <stop offset="60%" stopColor="#EA4325" />
              <stop offset="100%" stopColor="#F97316" />
            </linearGradient>

            {/* Radial Gradient for 100% Completion Shining Aura (Pure soft green light) */}
            <radialGradient id={shineGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#16A34A" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 100% Completion Ambient Glow Underlay behind Track (Soft green halo) */}
          {actualTheme.isComplete && (
            <>
              <path
                d={describeArc(88, 100)}
                fill="none"
                stroke="#22C55E"
                strokeWidth={strokeWidth + 8}
                strokeLinecap="round"
                opacity="0.35"
                className="animate-pulse pointer-events-none"
              />
              <circle
                cx={p100.x}
                cy={p100.y}
                r="18"
                fill={`url(#${shineGradId})`}
                className="pointer-events-none animate-pulse"
              />
            </>
          )}

          {/* Base Gauge Track */}
          <path
            d={describeArc(0, 100)}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth + 2}
            strokeLinecap="round"
          />

          {/* Dedicated rounded caps at outer ends only (0% and 100%) so internal segments have clean straight cuts */}
          <circle cx={p0.x} cy={p0.y} r={strokeWidth / 2} fill="#DC2626" />
          <circle cx={p100.x} cy={p100.y} r={strokeWidth / 2} fill="#16A34A" />

          {/* Zone 1: Red (0% - 70%) */}
          <path
            d={describeArc(0, 70)}
            fill="none"
            stroke={`url(#${redGradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Zone 2: Yellow (70% - 90%) */}
          <path
            d={describeArc(70, 90)}
            fill="none"
            stroke="#EAB308"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Zone 3: Green (90% - 100%) - Always crisp, perfectly continuous with Zone 2 */}
          <path
            d={describeArc(90, 100)}
            fill="none"
            stroke="#16A34A"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            className="transition-all duration-300"
          />

          {/* Boundary Divider Ticks at 30%, 50%, 70%, 90% */}
          {[30, 50, 70, 90].map((pct) => {
            const pInner = getPoint(pct, r - strokeWidth / 2 - 0.5);
            const pOuter = getPoint(pct, r + strokeWidth / 2 + 0.5);
            return (
              <line
                key={pct}
                x1={pInner.x}
                y1={pInner.y}
                x2={pOuter.x}
                y2={pOuter.y}
                stroke="#FFFFFF"
                strokeWidth={2.2}
                strokeLinecap="butt"
              />
            );
          })}

          {/* Threshold Markings (Enlarged and Clear, Color-Matched to Range) */}
          <text
            x={p0.x - 2}
            y={cy + 17}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-red-600 font-bold"
          >
            0%
          </text>
          <text
            x={p30Label.x}
            y={p30Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-red-500 font-bold"
          >
            30%
          </text>
          <text
            x={p50Label.x}
            y={p50Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-orange-600 font-bold"
          >
            50%
          </text>
          <text
            x={p70Label.x}
            y={p70Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-amber-600 font-bold"
          >
            70%
          </text>
          <text
            x={p90Label.x + 2}
            y={p90Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-emerald-600 font-bold"
          >
            90%
          </text>
          <text
            x={p100.x + 2}
            y={cy + 17}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className={`transition-all duration-300 ${
              actualTheme.isComplete
                ? 'fill-emerald-600 font-black'
                : 'fill-emerald-600 font-bold'
            }`}
          >
            100%
          </text>

          {/* Plan Pointer (Navy Dashed with Circle) */}
          <line
            x1={cx}
            y1={cy}
            x2={planTip.x}
            y2={planTip.y}
            stroke="#1E3A8A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="4 2"
          />
          <circle cx={planTip.x} cy={planTip.y} r="3" fill="#1E3A8A" />

          {/* Actual Pointer Glow Underlay when 100% (Soft green halo behind needle) */}
          {actualTheme.isComplete && (
            <>
              <line
                x1={cx}
                y1={cy}
                x2={actualTip.x}
                y2={actualTip.y}
                stroke="#22C55E"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.45"
                className="animate-pulse pointer-events-none"
              />
              <circle
                cx={actualTip.x}
                cy={actualTip.y}
                r="7"
                fill="#22C55E"
                opacity="0.4"
                className="animate-pulse pointer-events-none"
              />
            </>
          )}

          {/* Actual Pointer (Main Needle - Sharp, Solid, Always Visible) */}
          <line
            x1={cx}
            y1={cy}
            x2={actualTip.x}
            y2={actualTip.y}
            stroke={actualTheme.color}
            strokeWidth="3.2"
            strokeLinecap="round"
            className="transition-colors duration-300"
          />
          <circle
            cx={actualTip.x}
            cy={actualTip.y}
            r="4"
            fill={actualTheme.color}
            className="transition-colors duration-300"
          />

          {/* Pivot Center */}
          <circle cx={cx} cy={cy} r="6.5" fill="#0F172A" />
          <circle cx={cx} cy={cy} r="2.5" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Plan vs Actual Data Legend */}
      <div className="flex items-center justify-between w-full px-2 mt-2 pt-2 border-t border-neutral-100 text-[12.5px]">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A] inline-block shadow-2xs flex-shrink-0" />
          <span>
            Plan: <span className="font-black text-[#1E3A8A]">{planVal}%</span>
          </span>
        </div>
        <div className="h-3.5 w-px bg-neutral-200" />
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs transition-colors duration-300 flex-shrink-0"
            style={{
              backgroundColor: actualTheme.color,
              boxShadow: actualTheme.isComplete ? '0 0 8px rgba(22, 163, 74, 0.7)' : undefined,
            }}
          />
          <span className="flex items-center gap-1">
            Actual:{' '}
            <span
              className="font-black transition-colors duration-300 inline-flex items-center"
              style={{
                color: actualTheme.color,
                textShadow: actualTheme.isComplete ? '0 0 10px rgba(22, 163, 74, 0.5)' : undefined,
              }}
            >
              {actualVal}%
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

