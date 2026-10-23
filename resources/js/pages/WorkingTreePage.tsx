import { useState, useMemo } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import {
  Users, UserPlus, Edit3, Trash2, Shield, Briefcase, Layers, CheckCircle2,
  FolderOpen, Search, Filter, ChevronDown, ChevronRight, CheckSquare,
  Clock, ArrowRight, ExternalLink, AlertCircle, Sparkles, Building2, UserCheck, Check
} from 'lucide-react';
import { PageHeader, Button, Modal, Card, formatDivisionName } from '@/components/ui';

interface MemberItem {
  id: number;
  user_id: number;
  username: string;
  email: string;
  system_role: string;
  division_id: number | null;
  division_name: string;
  position_title: string;
  assigned_by: string;
  created_at: string;
}

interface AvailableUser {
  id: number;
  username: string;
  email: string;
  system_role: string;
  default_division_id: number | null;
  default_division: string;
}

interface DivisionOption {
  id: number;
  divisi: string;
}

interface TaskItem {
  id: string | number;
  name: string;
  status: string;
  progress: number;
  weight: number;
  divisions_id: number | null;
  division_ids?: number[];
  division_names?: string[];
  division_name: string;
  main_name?: string;
  sub_name?: string;
}

interface Props {
  project: any;
  members: MemberItem[];
  availableUsers: AvailableUser[];
  divisions: DivisionOption[];
  tasksByDivision: Record<string, TaskItem[]>;
  allTasks: TaskItem[];
  userRole: string;
}

export default function WorkingTreePage({
  project,
  members = [],
  availableUsers = [],
  divisions = [],
  tasksByDivision = {},
  allTasks = [],
  userRole = '',
}: Props) {
  const isPIC = userRole === 'SuperAdmin' || (userRole === 'pic' && project?.can_edit !== false);

  // Navigation tab: 'team' or 'task_divisions'
  const [activeTab, setActiveTab] = useState<'team' | 'task_divisions'>('team');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');

  // Expanded task view for member
  const [expandedMemberTasks, setExpandedMemberTasks] = useState<Set<number>>(new Set());

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editMemberModal, setEditMemberModal] = useState<{ open: boolean; member?: MemberItem }>({ open: false });
  const [removeMemberModal, setRemoveMemberModal] = useState<{ open: boolean; member?: MemberItem }>({ open: false });
  const [changeTaskDivModal, setChangeTaskDivModal] = useState<{ open: boolean; task?: TaskItem }>({ open: false });

  // Form states
  const [assignForm, setAssignForm] = useState({
    user_id: '',
    division_id: '',
    position_title: '',
  });

  const [editForm, setEditForm] = useState({
    division_id: '',
    position_title: '',
  });

  const [taskDivForm, setTaskDivForm] = useState<{
    division_ids: number[];
  }>({
    division_ids: [],
  });

  const [submitting, setSubmitting] = useState(false);

  // Toggle member's task list accordion
  const toggleMemberTasks = (id: number) => {
    setExpandedMemberTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter(m => {
      const matchesSearch =
        !q ||
        (m.username && m.username.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.position_title && m.position_title.toLowerCase().includes(q));

      const matchesDiv =
        divisionFilter === 'all' ||
        (m.division_id && String(m.division_id) === divisionFilter) ||
        (m.division_name && m.division_name.toLowerCase() === divisionFilter.toLowerCase());

      return matchesSearch && matchesDiv;
    });
  }, [members, searchQuery, divisionFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalMembers = members.length;
    const uniqueDivs = new Set(members.map(m => m.division_name).filter(Boolean));
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'Completed' || t.progress === 100).length;

    return {
      totalMembers,
      totalDivisions: uniqueDivs.size,
      totalTasks,
      completedTasks,
    };
  }, [members, allTasks]);

  // Submit assign new member
  const handleAssignMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.user_id || !project?.id) return;
    setSubmitting(true);

    router.post(`/projects/${project.id}/members`, {
      user_id: Number(assignForm.user_id),
      division_id: assignForm.division_id ? Number(assignForm.division_id) : null,
      position_title: assignForm.position_title || 'Member',
    }, {
      preserveScroll: true,
      onSuccess: () => {
        setShowAssignModal(false);
        setAssignForm({ user_id: '', division_id: '', position_title: '' });
      },
      onFinish: () => setSubmitting(false),
    });
  };

  // Submit edit existing member
  const handleEditMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMemberModal.member || !project?.id) return;
    setSubmitting(true);

    router.post(`/projects/${project.id}/members`, {
      user_id: editMemberModal.member.user_id,
      division_id: editForm.division_id ? Number(editForm.division_id) : null,
      position_title: editForm.position_title || 'Member',
    }, {
      preserveScroll: true,
      onSuccess: () => setEditMemberModal({ open: false }),
      onFinish: () => setSubmitting(false),
    });
  };

  // Confirm remove member
  const handleRemoveMember = () => {
    if (!removeMemberModal.member || !project?.id) return;
    setSubmitting(true);

    router.delete(`/projects/${project.id}/members/${removeMemberModal.member.id}`, {
      preserveScroll: true,
      onSuccess: () => setRemoveMemberModal({ open: false }),
      onFinish: () => setSubmitting(false),
    });
  };

  // Submit task division change (Multiple divisions)
  const handleChangeTaskDivision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeTaskDivModal.task || !project?.id) return;
    setSubmitting(true);

    router.put(`/projects/${project.id}/tasks/${changeTaskDivModal.task.id}`, {
      name: changeTaskDivModal.task.name,
      division_ids: taskDivForm.division_ids,
      divisions_id: taskDivForm.division_ids[0] || null,
    }, {
      preserveScroll: true,
      onSuccess: () => setChangeTaskDivModal({ open: false }),
      onFinish: () => setSubmitting(false),
    });
  };

  const toggleTaskDivision = (id: number) => {
    setTaskDivForm(prev => {
      const exists = prev.division_ids.includes(id);
      const updated = exists ? prev.division_ids.filter(x => x !== id) : [...prev.division_ids, id];
      return { division_ids: updated };
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-blue-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[11px] font-bold tracking-wider uppercase mb-2">
              Working Tree Structure & Project Division Management
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              {project?.name || 'Project Working Tree'}
            </h1>
            <p className="text-[13px] text-blue-200/80 max-w-2xl mt-1">
              Fluid project organization: customize team members by division, position title, and flexibly assign multiple divisions to handle each task.
            </p>
          </div>

          {isPIC && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setAssignForm({ user_id: '', division_id: '', position_title: '' });
                  setShowAssignModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 border-none shadow-md font-semibold"
              >
                Assign Member
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Users size={18} />
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-neutral-500">Team Members</p>
            <h4 className="text-lg font-black text-neutral-900">{stats.totalMembers} Assigned</h4>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Layers size={18} />
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-neutral-500">Project Divisions</p>
            <h4 className="text-lg font-black text-neutral-900">{stats.totalDivisions} Active</h4>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
            <CheckSquare size={18} />
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-neutral-500">WBS Tasks</p>
            <h4 className="text-lg font-black text-neutral-900">{stats.totalTasks} Tasks</h4>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-neutral-500">Completed Tasks</p>
            <h4 className="text-lg font-black text-neutral-900">{stats.completedTasks} Done</h4>
          </div>
        </div>
      </div>

      {/* View Toggle Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('team')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
            activeTab === 'team'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          Team Hierarchy & Members ({members.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('task_divisions')}
          className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
            activeTab === 'task_divisions'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          Division Task Assignments ({allTasks.length} Tasks)
        </button>
      </div>

      {/* TAB 1: Team Members & Structure */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {/* Filter and Search Bar */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search member by name, email, or position..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 text-[13px] outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={divisionFilter}
                  onChange={e => setDivisionFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-neutral-200 text-[12.5px] font-medium bg-white outline-none focus:border-blue-600"
                >
                  <option value="all">All Divisions</option>
                  {divisions.map(d => (
                    <option key={d.id} value={String(d.id)}>
                      {d.divisi}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-[12px] font-semibold text-neutral-500">
              Showing {filteredMembers.length} of {members.length} members
            </div>
          </div>

          {/* Members Grid */}
          {filteredMembers.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-neutral-200">
              <Users size={40} className="mx-auto text-neutral-300 mb-2" />
              <h3 className="text-[15px] font-bold text-neutral-800">No matching team members found</h3>
              <p className="text-[13px] text-neutral-400 mt-1">
                Try adjusting your search criteria or click "Assign Member" to add a new person to this project.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map(m => {
                const memberTasks = tasksByDivision[m.division_name] || [];
                const isExpanded = expandedMemberTasks.has(m.id);

                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Member Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-[14px] flex items-center justify-center flex-shrink-0 shadow-xs">
                            {(m.username || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-[14.5px] font-bold text-neutral-900 truncate">
                              {m.username}
                            </h3>
                            <p className="text-[12px] text-neutral-400 truncate">
                              {m.email}
                            </p>
                          </div>
                        </div>

                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {m.division_name || 'General'}
                        </span>
                      </div>

                      {/* Badges & Position */}
                      <div className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-neutral-100 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500 font-medium">Position:</span>
                          <span className="font-bold text-neutral-800">{m.position_title || 'Member'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500 font-medium">Project Division:</span>
                          <span className="font-bold text-neutral-800">{m.division_name}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-200/60">
                          <span>Assigned by {m.assigned_by}</span>
                          <span>{m.created_at}</span>
                        </div>
                      </div>

                      {/* Division Tasks Summary */}
                      <div className="border border-neutral-100 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleMemberTasks(m.id)}
                          className="w-full px-3 py-2 bg-neutral-50/70 hover:bg-neutral-100 flex items-center justify-between text-[12px] font-bold text-neutral-700 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <CheckSquare size={13} className="text-blue-600" />
                            Division Tasks ({memberTasks.length})
                          </span>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        {isExpanded && (
                          <div className="p-2 space-y-1 max-h-44 overflow-y-auto divide-y divide-neutral-100 bg-white">
                            {memberTasks.length === 0 ? (
                              <p className="text-[11.5px] text-neutral-400 p-2 text-center">
                                No tasks assigned to this division yet.
                              </p>
                            ) : (
                              memberTasks.map(t => (
                                <div key={t.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-[11.5px]">
                                  <span className="truncate max-w-[180px] font-medium text-neutral-800" title={t.name}>
                                    {t.name}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    t.progress === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-700'
                                  }`}>
                                    {t.progress}%
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Member Card Actions */}
                    {isPIC && (
                      <div className="flex items-center justify-end gap-1.5 pt-3 mt-3 border-t border-neutral-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditForm({
                              division_id: m.division_id ? String(m.division_id) : '',
                              position_title: m.position_title || '',
                            });
                            setEditMemberModal({ open: true, member: m });
                          }}
                          className="text-neutral-500 hover:text-neutral-800 text-[12px]"
                        >
                          <Edit3 size={13} className="mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoveMemberModal({ open: true, member: m })}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-[12px]"
                        >
                          <Trash2 size={13} className="mr-1" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Division Task Assignments */}
      {activeTab === 'task_divisions' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[16px] font-black text-neutral-900">
                  Task Division Assignments
                </h3>
                <p className="text-[12.5px] text-neutral-500 mt-0.5">
                  Fluently adjust which divisions are responsible for executing each task in this project (supports multiple divisions per task).
                </p>
              </div>

              <Link
                href={`/tasks?project_id=${project?.id}`}
                className="text-[12.5px] font-bold text-blue-600 hover:underline"
              >
                Open Task Management
              </Link>
            </div>

            <div className="divide-y divide-neutral-200">
              {allTasks.length === 0 ? (
                <div className="p-8 text-center text-neutral-400">
                  No tasks found in this project.
                </div>
              ) : (
                allTasks.map(task => (
                  <div
                    key={task.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/50 px-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13.5px] text-neutral-900 truncate">
                          {task.name}
                        </span>
                        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                          task.progress === 100
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {task.progress}% ({task.status})
                        </span>
                      </div>
                      <div className="text-[11.5px] text-neutral-400 mt-0.5">
                        {task.main_name} → {task.sub_name} · Weight: {task.weight}%
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Multiple Division Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(task.division_names && task.division_names.length > 0
                          ? task.division_names
                          : [task.division_name || 'General']
                        ).map((dName, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold text-[11.5px] border border-blue-200"
                          >
                            {dName}
                          </span>
                        ))}
                      </div>

                      {isPIC && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentIds = task.division_ids && task.division_ids.length > 0
                              ? task.division_ids
                              : (task.divisions_id ? [task.divisions_id] : []);
                            setTaskDivForm({
                              division_ids: currentIds,
                            });
                            setChangeTaskDivModal({ open: true, task });
                          }}
                          className="text-[12px]"
                        >
                          Assign Divisions
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assign Team Member */}
      {showAssignModal && (
        <Modal
          title="Assign Team Member to Project"
          onClose={() => setShowAssignModal(false)}
          size="md"
        >
          <form onSubmit={handleAssignMember} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Select User <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={assignForm.user_id}
                onChange={e => {
                  const uId = e.target.value;
                  const found = availableUsers.find(u => String(u.id) === uId);
                  setAssignForm({
                    ...assignForm,
                    user_id: uId,
                    division_id: found?.default_division_id ? String(found.default_division_id) : assignForm.division_id,
                  });
                }}
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] bg-white outline-none focus:border-blue-600 font-medium"
              >
                <option value="">-- Choose Member by Name --</option>
                {availableUsers
                  .filter(u => !members.some(m => m.user_id === u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.email}) — Division: {u.default_division}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Project Division
              </label>
              <select
                value={assignForm.division_id}
                onChange={e => setAssignForm({ ...assignForm, division_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] bg-white outline-none focus:border-blue-600 font-medium"
              >
                <option value="">General / None</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.divisi}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Position Title
              </label>
              <input
                type="text"
                value={assignForm.position_title}
                onChange={e => setAssignForm({ ...assignForm, position_title: e.target.value })}
                placeholder="e.g. Senior Frontend Specialist, Lead Inspector"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAssignModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                className="bg-blue-600 hover:bg-blue-500"
              >
                Assign to Project
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Member Assignment */}
      {editMemberModal.open && editMemberModal.member && (
        <Modal
          title={`Edit Assignment: ${editMemberModal.member.username}`}
          onClose={() => setEditMemberModal({ open: false })}
          size="md"
        >
          <form onSubmit={handleEditMember} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Project Division
              </label>
              <select
                value={editForm.division_id}
                onChange={e => setEditForm({ ...editForm, division_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] bg-white outline-none focus:border-blue-600 font-medium"
              >
                <option value="">General / None</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.divisi}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Position Title
              </label>
              <input
                type="text"
                value={editForm.position_title}
                onChange={e => setEditForm({ ...editForm, position_title: e.target.value })}
                placeholder="e.g. Site Supervisor"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditMemberModal({ open: false })}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                className="bg-blue-600 hover:bg-blue-500"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Confirm Remove Member */}
      {removeMemberModal.open && removeMemberModal.member && (
        <Modal
          title="Remove Member from Project"
          onClose={() => setRemoveMemberModal({ open: false })}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-xl text-[13px]">
              <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
              <span>
                Are you sure you want to remove <strong>{removeMemberModal.member.username}</strong> from this project?
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRemoveMemberModal({ open: false })}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={submitting}
                onClick={handleRemoveMember}
              >
                Remove Member
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Change Task Division (Multi-Division Support) */}
      {changeTaskDivModal.open && changeTaskDivModal.task && (
        <Modal
          title="Assign Divisions to Task"
          onClose={() => setChangeTaskDivModal({ open: false })}
          size="md"
        >
          <form onSubmit={handleChangeTaskDivision} className="space-y-4">
            <div>
              <p className="text-[12px] text-neutral-500">Task Name:</p>
              <h4 className="text-[14px] font-bold text-neutral-900">{changeTaskDivModal.task.name}</h4>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[12.5px] font-bold text-neutral-700">
                  Responsible Divisions (Select 1 or More) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setTaskDivForm({ division_ids: divisions.map(d => d.id) })}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Select All
                  </button>
                  <span className="text-neutral-300">|</span>
                  <button
                    type="button"
                    onClick={() => setTaskDivForm({ division_ids: [] })}
                    className="text-neutral-500 hover:underline font-semibold"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-neutral-200 rounded-xl bg-neutral-50/50">
                {divisions.map(d => {
                  const isSelected = taskDivForm.division_ids.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleTaskDivision(d.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold shadow-2xs'
                          : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 font-medium'
                      }`}
                    >
                      <span className="text-[12.5px] truncate">{d.divisi}</span>
                      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-300 bg-white'
                      }`}>
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                {taskDivForm.division_ids.length} division(s) selected. Workers from any selected division can update this task.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChangeTaskDivModal({ open: false })}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                className="bg-blue-600 hover:bg-blue-500"
              >
                Save Divisions
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
