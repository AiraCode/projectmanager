import React, { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Plus, Edit2, Trash2, Shield, FolderOpen, Search } from 'lucide-react';

interface Role    { id: number; name: string; }
interface Company { id: number; name: string; }
interface Division{ id: number; divisi: string; }
interface Project { id: number; title: string; companies_id: number; }
interface PermissionMatrix {
  sidebar?: string[];
  features?: Record<string, string[]>;
  data_scope?: string;
  project_access?: Record<string, { view_project: boolean; view_progress: boolean; edit_task: boolean }>;
}
interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  company: string | null;
  companies_id: number | null;
  divisions_id: number | null;
  division: string | null;
  created_by: string;
  is_standalone: boolean;
  permission_matrix: PermissionMatrix | null;
  created_at: string;
}

const SIDEBAR_OPTIONS = ['Dashboard', 'Project List', 'Project Detail', 'Tasks', 'Timeline', 'Weekly Progress', 'S-Curve Report', 'Budget Management', 'Division Progress', 'User Management'];
const FEATURE_OPTIONS = {
  projects: ['view', 'create', 'edit', 'delete'],
  tasks: ['view', 'create', 'edit', 'delete', 'toggle_status'],
  weekly: ['view', 'submit', 'edit', 'delete'],
  budget: ['view', 'create', 'edit', 'delete'],
  reports: ['view']
};

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin:    'bg-violet-100 text-violet-700',
  admin_utama:   'bg-indigo-100 text-indigo-700',
  admin_progres: 'bg-amber-100 text-amber-700',
  pic:           'bg-emerald-100 text-emerald-700',
  worker:        'bg-neutral-100 text-neutral-600',
};

export default function SuperAdminUserManagementPage({
  users, companies, divisions, roles, projects
}: { users: User[]; companies: Company[]; divisions: Division[]; roles: Role[]; projects: Project[] }) {

  const [search, setSearch]       = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const { data, setData, post, put, delete: destroy, processing, errors, reset } = useForm({
    username: '',
    email: '',
    password: '',
    roles_id: '',
    companies_id: '',
    divisions_id: '',
    permission_matrix: {
      sidebar: [] as string[],
      features: {} as Record<string, string[]>,
      data_scope: 'own_company',
      project_access: {} as Record<string, { view_project: boolean; view_progress: boolean; edit_task: boolean }>,
    } as PermissionMatrix,
  });

  const openCreate = () => {
    setEditUser(null);
    reset();
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setData({
      username: u.username,
      email: u.email,
      password: '',
      roles_id: roles.find(r => r.name === u.role)?.id.toString() ?? '',
      companies_id: u.companies_id?.toString() ?? '',
      divisions_id: u.divisions_id?.toString() ?? '',
      permission_matrix: u.permission_matrix ?? { sidebar: [], features: {}, data_scope: 'own_company', project_access: {} },
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editUser) {
      put(`/admin/users/${editUser.id}`, {
        onSuccess: () => { setModalOpen(false); setToast({ msg: 'User updated.', type: 'success' }); },
        onError:   () => setToast({ msg: 'Error updating user.', type: 'error' }),
      });
    } else {
      post('/admin/users', {
        onSuccess: () => { setModalOpen(false); setToast({ msg: 'User created.', type: 'success' }); },
        onError:   () => setToast({ msg: 'Error creating user.', type: 'error' }),
      });
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete user "${name}"? This action cannot be undone.`)) {
      destroy(`/admin/users/${id}`, {
        onSuccess: () => setToast({ msg: 'User deleted.', type: 'success' }),
        onError:   () => setToast({ msg: 'Error deleting user.', type: 'error' }),
      });
    }
  };

  const toggleSidebar = (opt: string) => {
    const cur = data.permission_matrix.sidebar ?? [];
    setData('permission_matrix', { ...data.permission_matrix, sidebar: cur.includes(opt) ? cur.filter(s => s !== opt) : [...cur, opt] });
  };

  const toggleFeature = (feat: string, act: string) => {
    const cur = data.permission_matrix.features ?? {};
    const curActs = cur[feat] ?? [];
    setData('permission_matrix', { ...data.permission_matrix, features: { ...cur, [feat]: curActs.includes(act) ? curActs.filter(a => a !== act) : [...curActs, act] } });
  };

  const toggleProjectAccess = (projId: number, key: 'view_project' | 'view_progress' | 'edit_task') => {
    const cur = data.permission_matrix.project_access ?? {};
    const projAcc = cur[projId] ?? { view_project: false, view_progress: false, edit_task: false };
    setData('permission_matrix', { ...data.permission_matrix, project_access: { ...cur, [projId]: { ...projAcc, [key]: !projAcc[key] } } });
  };

  const selectedRoleName = roles.find(r => r.id.toString() === data.roles_id)?.name;
  const isWorkerTarget   = selectedRoleName === 'worker';
  const selectedCompanyId = data.companies_id ? Number(data.companies_id) : null;
  const companyProjects  = selectedCompanyId ? projects.filter(p => p.companies_id === selectedCompanyId) : [];

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.role ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.company ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <Head title="User Management — SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">User Management</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">Create, update, and remove user accounts. Manage permissions and project access.</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-95 shadow-md"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Plus size={15} />
            Add User
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-[13px] border rounded-xl focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: 'rgba(139,92,246,0.2)', focusRingColor: '#7c3aed' }}
          />
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border overflow-hidden"
          style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr style={{ background: 'rgba(139,92,246,0.03)', borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Company</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Division</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Created By</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-neutral-900">{u.username}</div>
                      <div className="text-[11px] text-neutral-400">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[u.role] ?? 'bg-neutral-100 text-neutral-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-600">{u.company ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-600">{u.division ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-500 text-[12px]">{u.created_by}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg transition-colors hover:bg-violet-100 text-neutral-400 hover:text-violet-600" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        {u.role !== 'SuperAdmin' && (
                          <button onClick={() => handleDelete(u.id, u.username)} className="p-1.5 rounded-lg transition-colors hover:bg-red-100 text-neutral-400 hover:text-red-500" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-neutral-400">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-black text-[16px] text-neutral-900">
                {editUser ? `Edit User: ${editUser.username}` : 'Create New User'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Username</label>
                  <input type="text" value={data.username} onChange={e => setData('username', e.target.value)} required className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  {errors.username && <p className="text-red-500 text-[11px] mt-1">{errors.username}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Email</label>
                  <input type="email" value={data.email} onChange={e => setData('email', e.target.value)} required className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Password {editUser && '(blank = keep)'}</label>
                  <input type="password" value={data.password} onChange={e => setData('password', e.target.value)} required={!editUser} className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Role</label>
                  <select value={data.roles_id} onChange={e => setData('roles_id', e.target.value)} required className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="">Select Role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Company</label>
                  <select value={data.companies_id} onChange={e => setData('companies_id', e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="">No Company (Standalone)</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">Division</label>
                  <select value={data.divisions_id} onChange={e => setData('divisions_id', e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="">No Division</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.divisi}</option>)}
                  </select>
                </div>
              </div>

              {/* Global Permission Matrix */}
              {selectedRoleName && selectedRoleName !== 'SuperAdmin' && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-neutral-100 bg-neutral-50">
                    <Shield size={15} style={{ color: '#7c3aed' }} />
                    <h3 className="font-bold text-[13px] text-neutral-800">Global Permission Matrix</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Data Scope */}
                    <div>
                      <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Data Scope</h4>
                      <div className="flex gap-4">
                        {['all', 'own_company'].map(scope => (
                          <label key={scope} className="flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer">
                            <input type="radio" name="scope" value={scope} checked={data.permission_matrix.data_scope === scope} onChange={() => setData('permission_matrix', { ...data.permission_matrix, data_scope: scope })} className="accent-violet-600" />
                            {scope === 'all' ? 'All Companies' : 'Own Company Only'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Sidebar Access */}
                    <div>
                      <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Sidebar Visibility</h4>
                      <div className="flex flex-wrap gap-2">
                        {SIDEBAR_OPTIONS.map(opt => (
                          <label key={opt} className="flex items-center gap-1.5 text-[12px] text-neutral-700 bg-neutral-50 px-2.5 py-1 rounded-lg border border-neutral-200 hover:bg-violet-50 hover:border-violet-200 cursor-pointer transition-colors">
                            <input type="checkbox" checked={(data.permission_matrix.sidebar ?? []).includes(opt)} onChange={() => toggleSidebar(opt)} className="accent-violet-600" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Feature Access */}
                    <div>
                      <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Feature Access</h4>
                      <div className="space-y-2">
                        {Object.entries(FEATURE_OPTIONS).map(([feat, acts]) => (
                          <div key={feat} className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                            <div className="w-24 text-[12px] font-semibold text-neutral-700 capitalize">{feat}</div>
                            <div className="flex flex-wrap gap-3">
                              {acts.map(act => (
                                <label key={act} className="flex items-center gap-1.5 text-[12px] text-neutral-600 cursor-pointer">
                                  <input type="checkbox" checked={(data.permission_matrix.features?.[feat] ?? []).includes(act)} onChange={() => toggleFeature(feat, act)} className="accent-violet-600" />
                                  {act}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Access (for workers with company selected) */}
              {isWorkerTarget && companyProjects.length > 0 && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-neutral-100 bg-neutral-50">
                    <FolderOpen size={15} style={{ color: '#7c3aed' }} />
                    <h3 className="font-bold text-[13px] text-neutral-800">Project Access (Initial Setup)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-100">
                          <th className="px-4 py-2 text-left text-neutral-500 font-semibold text-[11px] uppercase">Project</th>
                          <th className="px-4 py-2 text-center text-neutral-500 font-semibold text-[11px] uppercase">View Project</th>
                          <th className="px-4 py-2 text-center text-neutral-500 font-semibold text-[11px] uppercase">View Progress</th>
                          <th className="px-4 py-2 text-center text-neutral-500 font-semibold text-[11px] uppercase">Edit Task</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {companyProjects.map(proj => {
                          const acc = data.permission_matrix.project_access?.[proj.id] ?? { view_project: false, view_progress: false, edit_task: false };
                          return (
                            <tr key={proj.id} className="hover:bg-violet-50/30">
                              <td className="px-4 py-2.5 font-medium text-neutral-800">{proj.title}</td>
                              {(['view_project', 'view_progress', 'edit_task'] as const).map(key => (
                                <td key={key} className="px-4 py-2.5 text-center">
                                  <input type="checkbox" checked={acc[key]} onChange={() => toggleProjectAccess(proj.id, key)} className="w-4 h-4 accent-violet-600 cursor-pointer" />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={processing} className="px-5 py-2 text-[13px] font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  {processing ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl text-white text-[13px] font-semibold shadow-xl transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-4 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </SuperAdminLayout>
  );
}
