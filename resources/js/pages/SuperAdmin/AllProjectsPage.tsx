import React, { useState, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { ConfirmModal, Modal, Button, DatePicker } from '@/components/ui';
import CustomSelect from '@/components/CustomSelect';
import { Search, Lock, Globe, Trash2, ExternalLink, Building2, Calendar, Edit2, AlertTriangle, Clock } from 'lucide-react';

interface Project {
  id: number;
  title: string;
  company: string | null;
  is_private: boolean;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
}

export default function AllProjectsPage({ projects }: { projects: Project[] }) {
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVisibility, setFilterVisibility] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Project Dates (SuperAdmin Only)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [isUpdatingDates, setIsUpdatingDates] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => {
      if (p.company) set.add(p.company);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const hasActiveFilters = Boolean(search || filterCompany || filterStatus || filterVisibility || sortBy);

  const filtered = useMemo(() => {
    return projects
      .filter(p => {
        const query = search.toLowerCase().trim();
        const matchSearch = !query ||
          p.title.toLowerCase().includes(query) ||
          (p.company ?? '').toLowerCase().includes(query) ||
          p.created_by.toLowerCase().includes(query);

        const matchCompany = !filterCompany || p.company === filterCompany;
        const matchStatus = !filterStatus || p.status.toLowerCase() === filterStatus.toLowerCase();
        const matchVisibility =
          !filterVisibility ? true :
          filterVisibility === 'private' ? p.is_private : !p.is_private;

        return matchSearch && matchCompany && matchStatus && matchVisibility;
      })
      .sort((a, b) => {
        if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
        if (sortBy === 'title_desc') return b.title.localeCompare(a.title);
        if (sortBy === 'progress_desc') return b.progress - a.progress;
        if (sortBy === 'progress_asc') return a.progress - b.progress;
        if (sortBy === 'oldest') return a.id - b.id;
        return b.id - a.id; // newest first
      });
  }, [projects, search, filterCompany, filterStatus, filterVisibility, sortBy]);

  const handleConfirmDelete = () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    router.delete(`/admin/projects/${projectToDelete.id}`, {
      onFinish: () => {
        setIsDeleting(false);
        setProjectToDelete(null);
      },
    });
  };

  const openEditDates = (p: Project) => {
    setProjectToEdit(p);
    setEditStart(p.start_date || '');
    setEditEnd(p.end_date || '');
    setDateError(null);
  };

  const handleSaveDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToEdit) return;
    if (!editStart || !editEnd) {
      setDateError('Start Date and Target Finish Date are required.');
      return;
    }
    if (editEnd <= editStart) {
      setDateError('Target Finish Date must be after Start Date (at least 1 day later).');
      return;
    }

    setIsUpdatingDates(true);
    setDateError(null);

    router.put(`/admin/projects/${projectToEdit.id}/dates`, {
      start: editStart,
      end: editEnd,
    }, {
      onSuccess: () => {
        setIsUpdatingDates(false);
        setToast({
          msg: `Project schedule for "${projectToEdit.title}" updated successfully.`,
          type: 'success',
        });
        setProjectToEdit(null);
      },
      onError: (errs) => {
        setIsUpdatingDates(false);
        const firstErr = Object.values(errs)[0];
        setDateError(typeof firstErr === 'string' ? firstErr : 'Failed to update project schedule.');
      },
    });
  };

  const statusColor = (s: string) => {
    if (s === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'On Track') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'At Risk') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'Delayed') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  };

  return (
    <SuperAdminLayout>
      <Head title="All Projects — SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Toast Feedback */}
        {toast && (
          <div className={`fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl text-white text-[13px] font-semibold shadow-xl transition-all flex items-center justify-between gap-4 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
            }`}>
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="opacity-75 hover:opacity-100 font-bold">✕</button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">All Projects</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">View and manage all projects across companies, including private ones and schedule limits.</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-neutral-500">
            <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-bold">
              {filtered.length} {filtered.length === projects.length ? 'projects' : `of ${projects.length} projects`}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-bold flex items-center gap-1">
              <Lock size={10} /> {projects.filter(p => p.is_private).length} private
            </span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search project or company..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white h-[38px]"
            />
          </div>

          <CustomSelect
            value={filterCompany}
            onChange={setFilterCompany}
            placeholder="All Companies"
            variant="filter"
            clearable
            searchable={companyOptions.length > 5}
            className="w-full sm:w-[165px]"
            options={[
              { value: '', label: 'All Companies' },
              ...companyOptions.map(c => ({ value: c, label: c })),
            ]}
          />

          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="All Statuses"
            variant="filter"
            clearable
            className="w-full sm:w-[145px]"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'Open', label: 'Open' },
              { value: 'On Track', label: 'On Track' },
              { value: 'At Risk', label: 'At Risk' },
              { value: 'Delayed', label: 'Delayed' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />

          <CustomSelect
            value={filterVisibility}
            onChange={setFilterVisibility}
            placeholder="All Visibility"
            variant="filter"
            clearable
            className="w-full sm:w-[140px]"
            options={[
              { value: '', label: 'All Visibility' },
              { value: 'public', label: 'Public' },
              { value: 'private', label: 'Private' },
            ]}
          />

          <CustomSelect
            value={sortBy}
            onChange={setSortBy}
            placeholder="Sort by"
            variant="filter"
            clearable
            className="w-full sm:w-[165px]"
            options={[
              { value: '', label: 'Sort: Default (Newest)' },
              { value: 'title_asc', label: 'Title (A – Z)' },
              { value: 'title_desc', label: 'Title (Z – A)' },
              { value: 'progress_desc', label: 'Highest Progress' },
              { value: 'progress_asc', label: 'Lowest Progress' },
              { value: 'oldest', label: 'Oldest' },
            ]}
          />

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch('');
                setFilterCompany('');
                setFilterStatus('');
                setFilterVisibility('');
                setSortBy('');
              }}
              className="px-3 py-1.5 text-[12px] font-semibold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Project</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Company</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Visibility</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Progress</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Date Range</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-neutral-400">No projects found.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-neutral-900 max-w-[200px] truncate">{p.title}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">by {p.created_by}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-neutral-600">
                      <Building2 size={12} className="text-neutral-400 flex-shrink-0" />
                      <span className="text-[12px]">{p.company ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {p.is_private ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-200">
                        <Lock size={9} /> Private
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">
                        <Globe size={9} /> Public
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusColor(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-bold text-neutral-800 text-[12px]">{p.progress}%</span>
                      <div className="w-16 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => openEditDates(p)}
                      className="inline-flex items-center gap-1.5 text-[12px] text-neutral-700 hover:text-violet-700 hover:bg-violet-50 px-2 py-1 -mx-2 rounded-lg transition-all group font-medium"
                      title="Edit project schedule (SuperAdmin)"
                    >
                      <Calendar size={13} className="text-violet-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                      <span>{p.start_date ?? '—'} – {p.end_date ?? '—'}</span>
                      <Edit2 size={11} className="text-violet-400 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <a href={`/projects/${p.id}`} target="_blank" className="p-1.5 rounded-lg text-neutral-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Open project">
                        <ExternalLink size={14} />
                      </a>
                      <button onClick={() => setProjectToDelete(p)} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete project">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal: Edit Project Duration (SuperAdmin Only) */}
        {projectToEdit && (
          <Modal
            isOpen={!!projectToEdit}
            onClose={() => !isUpdatingDates && setProjectToEdit(null)}
            title="Edit Project Duration & Schedule"
            subtitle="SuperAdmin Privilege: Adjust overall project schedule boundaries"
            size="md"
          >
            <form onSubmit={handleSaveDates} className="space-y-4">
              {dateError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                  <AlertTriangle size={15} className="flex-shrink-0" />
                  <span>{dateError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Project Information</div>
                <div className="text-[13.5px] font-bold text-neutral-800">{projectToEdit.title}</div>
                <div className="text-[11.5px] text-neutral-500 flex items-center gap-2 pt-0.5">
                  <span>Company: <strong>{projectToEdit.company ?? '—'}</strong></span>
                  <span>•</span>
                  <span>Status: <span className="font-semibold text-neutral-700">{projectToEdit.status}</span></span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    value={editStart}
                    required
                    accentColor="violet"
                    onChange={(val) => {
                      setEditStart(val);
                      setDateError(null);
                    }}
                    placeholder="Select Start Date"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Target Finish Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    value={editEnd}
                    required
                    min={editStart}
                    accentColor="violet"
                    onChange={(val) => {
                      setEditEnd(val);
                      setDateError(null);
                    }}
                    placeholder="Select Target Finish Date"
                  />
                </div>
              </div>

              {/* Duration calculation */}
              {editStart && editEnd && editEnd > editStart && (
                <div className="text-[11.5px] text-neutral-600 bg-violet-50/60 p-2.5 rounded-lg border border-violet-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-violet-600" />
                    <span>New Total Project Duration:</span>
                  </span>
                  <span className="font-bold text-violet-900">
                    {Math.round((new Date(editEnd).getTime() - new Date(editStart).getTime()) / (1000 * 60 * 60 * 24)) + 1} calendar days
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setProjectToEdit(null)}
                  disabled={isUpdatingDates}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isUpdatingDates}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isUpdatingDates ? 'Saving Changes...' : 'Save Schedule'}
                </Button>
              </div>
            </form>
          </Modal>
        )}

        <ConfirmModal
          isOpen={!!projectToDelete}
          onClose={() => !isDeleting && setProjectToDelete(null)}
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
          title="Delete Project"
          message={
            projectToDelete ? (
              <>
                Delete project <span className="font-semibold text-neutral-900">"{projectToDelete.title}"</span>? This action cannot be undone and will delete all related tasks and data.
              </>
            ) : null
          }
          confirmText="Delete Project"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </SuperAdminLayout>
  );
}

