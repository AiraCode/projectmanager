import React, { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Plus, Edit2, Trash2, Shield, FolderOpen, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface Role    { id: number; name: string; }
interface Company { id: number; name: string; }
interface Division{ id: number; divisi: string; }
interface Project { id: number; title: string; companies_id: number; }
interface PermissionMatrix {
  sidebar?: string[];
  features?: Record<string, string[]>;
  data_scope?: string;
  project_access?: Record<string, { view_project: boolean; view_progress: boolean }>;
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

const MODULE_PERMISSIONS = [
  { module: 'Dashboard', sidebarKey: 'Dashboard', features: [] },
  { module: 'Project List', sidebarKey: 'Project List', featureGroup: 'projects', features: ['create', 'edit', 'delete'] },
  { module: 'Project Detail', sidebarKey: 'Project Detail', features: [] },
  { module: 'Tasks', sidebarKey: 'Tasks', featureGroup: 'tasks', features: ['create', 'edit', 'delete', 'Edit Task'] },
  { module: "Today's Tasks", sidebarKey: "Today's Tasks", features: [] },
  { module: 'Timeline', sidebarKey: 'Timeline', features: [] },
  { module: 'Weekly Progress', sidebarKey: 'Weekly Progress', featureGroup: 'weekly', features: ['submit', 'edit', 'delete'] },
  { module: 'S-Curve Report', sidebarKey: 'S-Curve Report', featureGroup: 'reports', features: [] },
  { module: 'Budget Management', sidebarKey: 'Budget Management', featureGroup: 'budget', features: ['create', 'edit', 'delete'] },
  { module: 'Division Progress', sidebarKey: 'Division Progress', features: [] },
  { module: 'User Management', sidebarKey: 'User Management', features: [] },
];

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
  const [isGlobalMatrixOpen, setIsGlobalMatrixOpen] = useState(false);
  const [isProjectAccessOpen, setIsProjectAccessOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<'manage' | 'create'>('manage');
  const [filterRole, setFilterRole] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDivision, setFilterDivision] = useState('');

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
      project_access: {} as Record<string, { view_project: boolean; view_progress: boolean }>,
    } as PermissionMatrix,
  });

  const openCreate = () => {
    setEditUser(null);
    setData({
      username: '',
      email: '',
      password: '',
      roles_id: '',
      companies_id: '',
      divisions_id: '',
      permission_matrix: { sidebar: [], features: {}, data_scope: 'own_company', project_access: {} }
    });
    setModalOpen(false);
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

  const handleUnifiedViewToggle = (mod: typeof MODULE_PERMISSIONS[0]) => {
    const currentSidebar = data.permission_matrix.sidebar || [];
    const isCurrentlyView = currentSidebar.includes(mod.sidebarKey);
    
    const updatedSidebar = isCurrentlyView 
      ? currentSidebar.filter(s => s !== mod.sidebarKey)
      : [...currentSidebar, mod.sidebarKey];

    let updatedFeatures = { ...(data.permission_matrix.features || {}) };
    if (mod.featureGroup) {
      const currentActions = updatedFeatures[mod.featureGroup] || [];
      if (isCurrentlyView) {
        // Remove 'view'
        updatedFeatures[mod.featureGroup] = currentActions.filter(a => a !== 'view');
      } else {
        // Add 'view'
        updatedFeatures[mod.featureGroup] = [...currentActions.filter(a => a !== 'view'), 'view'];
      }
    }

    setData('permission_matrix', { 
      ...data.permission_matrix, 
      sidebar: updatedSidebar,
      features: updatedFeatures
    });
  };

  const toggleFeature = (feat: string, act: string) => {
    const cur = data.permission_matrix.features ?? {};
    const curActs = cur[feat] ?? [];
    const willBeRemoved = curActs.includes(act);
    const updatedActs = willBeRemoved ? curActs.filter(a => a !== act) : [...curActs, act];

    const updatedMatrix: typeof data.permission_matrix = {
      ...data.permission_matrix,
      features: { ...cur, [feat]: updatedActs },
    };

    // When "Multiple Projects" is unchecked, clear all project_access entries
    // so the worker's sidebar no longer shows the "All Projects" dropdown
    if (feat === 'projects' && act === 'Multiple Projects' && willBeRemoved) {
      updatedMatrix.project_access = {};
    }

    setData('permission_matrix', updatedMatrix);
  };

  const toggleProjectAccess = (projId: number, key: 'view_project' | 'view_progress') => {
    const cur = data.permission_matrix.project_access ?? {};
    const projAcc = cur[projId] ?? { view_project: false, view_progress: false };
    
    const newAccess = { ...projAcc, [key]: !projAcc[key] };
    
    // If view_project is unchecked, force view_progress to be unchecked too
    if (key === 'view_project' && !newAccess.view_project) {
      newAccess.view_progress = false;
    }
    
    setData('permission_matrix', { ...data.permission_matrix, project_access: { ...cur, [projId]: newAccess } });
  };

  const selectedRoleName = roles.find(r => r.id.toString() === data.roles_id)?.name;
  const isWorkerTarget   = selectedRoleName === 'worker';
  
  const showCompany = selectedRoleName === 'worker' || selectedRoleName === 'pic' || selectedRoleName === 'worker_b';
  const showDivision = selectedRoleName === 'worker' || selectedRoleName === 'worker_b';
  
  const selectedCompanyId = data.companies_id ? Number(data.companies_id) : null;
  const companyProjects  = selectedCompanyId ? projects.filter(p => p.companies_id === selectedCompanyId) : [];

  const filtered = users.filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterCompany && u.companies_id?.toString() !== filterCompany) return false;
    if (filterDivision && u.divisions_id?.toString() !== filterDivision) return false;
    
    if (search) {
      const searchLower = search.toLowerCase();

  return (
        u.username.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower) ||
        (u.role ?? '').toLowerCase().includes(searchLower) ||
        (u.company ?? '').toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

      const renderForm = () => (
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
                {showCompany && (
                  <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">Company</label>
                    <select value={data.companies_id} onChange={e => setData('companies_id', e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                      <option value="">No Company (Standalone)</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {showDivision && (
                  <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">Division</label>
                    <select value={data.divisions_id} onChange={e => setData('divisions_id', e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                      <option value="">No Division</option>
                      {divisions.map(d => <option key={d.id} value={d.id}>{d.divisi}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Global Permission Matrix */}
              {selectedRoleName && selectedRoleName !== 'SuperAdmin' && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div 
                    className="px-4 py-3 flex items-center justify-between border-b border-neutral-100 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => setIsGlobalMatrixOpen(!isGlobalMatrixOpen)}
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={15} style={{ color: '#7c3aed' }} />
                      <h3 className="font-bold text-[13px] text-neutral-800">Global Permission Matrix</h3>
                    </div>
                    {isGlobalMatrixOpen ? <ChevronDown size={15} className="text-neutral-400" /> : <ChevronRight size={15} className="text-neutral-400" />}
                  </div>
                  
                  {isGlobalMatrixOpen && (
                    <div className="p-4 space-y-5">
                      {/* Scope & Advanced Project Features */}
                      <div className="flex flex-wrap gap-6 items-start">
                        <div>
                          <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Data Scope</h4>
                          <div className="flex gap-4 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 w-fit">
                            {['all', 'own_company'].map(scope => (
                              <label key={scope} className="flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer">
                                <input type="radio" name="scope" value={scope} checked={data.permission_matrix.data_scope === scope} onChange={() => setData('permission_matrix', { ...data.permission_matrix, data_scope: scope })} className="accent-violet-600 cursor-pointer" />
                                {scope === 'all' ? 'All Companies' : 'Own Company Only'}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Project Options</h4>
                          <div className="flex gap-4 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 w-fit">
                            {['Multiple Projects', 'Private Projects'].map(feat => (
                              <label key={feat} className="flex items-center gap-1.5 text-[12.5px] text-neutral-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(data.permission_matrix.features?.projects || []).includes(feat)}
                                  onChange={() => toggleFeature('projects', feat)}
                                  className="accent-violet-600 rounded text-violet-600 focus:ring-violet-500"
                                />
                                {feat}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Unified Module Permissions */}
                      <div>
                        <h4 className="text-[11px] font-bold text-neutral-600 uppercase tracking-wide mb-2">Module Access & Features</h4>
                        <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                          <table className="w-full text-left text-[12.5px]">
                            <thead className="bg-neutral-50 border-b border-neutral-200 font-semibold text-neutral-600 text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="px-4 py-2.5">Module Name</th>
                                <th className="px-4 py-2.5 text-center border-l border-neutral-100">View (Sidebar)</th>
                                <th className="px-4 py-2.5 text-center border-l border-neutral-100 w-1/2">Advanced Permissions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {MODULE_PERMISSIONS.map(mod => {
                                const isView = (data.permission_matrix.sidebar || []).includes(mod.sidebarKey);
                                return (
                                  <tr key={mod.sidebarKey} className="hover:bg-neutral-50/50">
                                    <td className="px-4 py-2.5 font-medium text-neutral-800">{mod.module}</td>
                                    <td className="px-4 py-2.5 text-center border-l border-neutral-100">
                                      <input 
                                        type="checkbox" 
                                        checked={isView} 
                                        onChange={() => handleUnifiedViewToggle(mod)} 
                                        className="w-4 h-4 accent-violet-600 cursor-pointer rounded" 
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 border-l border-neutral-100">
                                      <div className="flex flex-wrap gap-4 items-center justify-center">
                                        {mod.features.length === 0 ? (
                                          <span className="text-neutral-400 italic text-[11px]">- None available -</span>
                                        ) : (
                                          mod.features.map(feat => {
                                            const isChecked = mod.featureGroup 
                                              ? (data.permission_matrix.features?.[mod.featureGroup] || []).includes(feat) 
                                              : false;
                                            return (
                                              <label 
                                                key={feat} 
                                                className={`flex items-center gap-1.5 text-[11.5px] cursor-pointer ${!isView ? 'opacity-40 pointer-events-none' : 'text-neutral-700 font-medium'}`}
                                              >
                                                <input 
                                                  type="checkbox" 
                                                  checked={isChecked} 
                                                  onChange={() => toggleFeature(mod.featureGroup!, feat)} 
                                                  disabled={!isView} 
                                                  className="accent-violet-600 rounded" 
                                                />
                                                <span className="capitalize">{feat.replace('_', ' ')}</span>
                                              </label>
                                            );
                                          })
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Project Access (for workers with company selected) */}
              {isWorkerTarget && companyProjects.length > 0 && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div 
                    className="px-4 py-3 flex items-center justify-between border-b border-neutral-100 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => setIsProjectAccessOpen(!isProjectAccessOpen)}
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen size={15} style={{ color: '#7c3aed' }} />
                      <h3 className="font-bold text-[13px] text-neutral-800">Project Access (Initial Setup)</h3>
                    </div>
                    {isProjectAccessOpen ? <ChevronDown size={15} className="text-neutral-400" /> : <ChevronRight size={15} className="text-neutral-400" />}
                  </div>
                  
                  {isProjectAccessOpen && (
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-[12.5px]">
                        <thead className="sticky top-0 z-10 shadow-sm">
                          <tr className="bg-neutral-50 border-b border-neutral-100">
                            <th className="px-4 py-2 text-left text-neutral-500 font-semibold text-[11px] uppercase">Project</th>
                            <th className="px-4 py-2 text-center text-neutral-500 font-semibold text-[11px] uppercase">View Project</th>
                            <th className="px-4 py-2 text-center text-neutral-500 font-semibold text-[11px] uppercase">View Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {companyProjects.map(proj => {
                            const acc = data.permission_matrix.project_access?.[proj.id] ?? { view_project: false, view_progress: false };
                            return (
                              <tr key={proj.id} className="hover:bg-violet-50/30">
                                <td className="px-4 py-2.5 font-medium text-neutral-800">{proj.title}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <input type="checkbox" checked={acc.view_project} onChange={() => toggleProjectAccess(proj.id, 'view_project')} className="w-4 h-4 accent-violet-600 cursor-pointer" />
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={acc.view_progress} 
                                    disabled={!acc.view_project}
                                    onChange={() => toggleProjectAccess(proj.id, 'view_progress')} 
                                    className={`w-4 h-4 ${!acc.view_project ? 'opacity-50 cursor-not-allowed' : 'accent-violet-600 cursor-pointer'}`} 
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                <button type="button" onClick={() => { if (viewMode === 'create') { setViewMode('manage'); reset(); } else { setModalOpen(false); } }} className="px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={processing} className="px-5 py-2 text-[13px] font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  {processing ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
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
        </div>

        {/* Custom Toggle Switch */}
        <div className="flex bg-neutral-100 p-1 rounded-lg w-fit mb-6">
          <button 
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all ${viewMode === 'manage' ? 'bg-white text-brand shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => setViewMode('manage')}
          >
            Manage Users
          </button>
          <button 
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all ${viewMode === 'create' ? 'bg-white text-brand shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => {
              setViewMode('create');
              openCreate();
            }}
          >
            Create User
          </button>
        </div>

        {viewMode === 'manage' ? (
          <>
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search users…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-[13px] border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
                  style={{ borderColor: 'rgba(139,92,246,0.2)' }}
                />
              </div>
              
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="w-full md:w-[150px] border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">All Roles</option>
                {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full md:w-[150px] border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} className="w-full md:w-[150px] border border-neutral-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">All Divisions</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.divisi}</option>)}
              </select>
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
        
        {/* Manage Mode vs Create Mode */}
        </>
        ) : (
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}>
            <div className="mb-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">Create New User</h2>
              <p className="text-neutral-500 text-[13px]">Fill in the details below to create a new user account.</p>
            </div>
            {renderForm()}
          </div>
        )}
      </div>

      {/* Edit Modal (Only in manage mode when editing) */}
      {modalOpen && viewMode === 'manage' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-black text-[16px] text-neutral-900">
                {editUser ? `Edit User: ${editUser.username}` : 'Create New User'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">✕</button>
            </div>
            <div className="overflow-y-auto">
              {renderForm()}
            </div>
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
