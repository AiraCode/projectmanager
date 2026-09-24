import React, { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import { PageHeader, Card, Button, Modal, Toast } from '@/components/ui';
import { Plus, Edit2, Trash2, Shield, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';

interface Role { id: number; name: string; }
interface Company { id: number; name: string; }
interface Division { id: number; divisi: string; }
interface Project { id: number; title: string; }
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
  roles_id: number;
  companies_id: number | null;
  divisions_id: number | null;
  role?: Role;
  company?: Company;
  division?: Division;
  permission_matrix: PermissionMatrix | null;
}

const MODULE_PERMISSIONS = [
  { module: 'Dashboard', sidebarKey: 'Dashboard', features: [] },
  { module: 'Project List', sidebarKey: 'Project List', featureGroup: 'projects', features: ['create', 'edit', 'delete'] },
  { module: 'Project Detail', sidebarKey: 'Project Detail', features: [] },
  { module: 'Tasks', sidebarKey: 'Tasks', featureGroup: 'tasks', features: ['create', 'edit', 'delete', 'toggle_status'] },
  { module: 'Timeline', sidebarKey: 'Timeline', features: [] },
  { module: 'Weekly Progress', sidebarKey: 'Weekly Progress', featureGroup: 'weekly', features: ['submit', 'edit', 'delete'] },
  { module: 'S-Curve Report', sidebarKey: 'S-Curve Report', featureGroup: 'reports', features: [] },
  { module: 'Budget Management', sidebarKey: 'Budget Management', featureGroup: 'budget', features: ['create', 'edit', 'delete'] },
  { module: 'Division Progress', sidebarKey: 'Division Progress', features: [] },
  { module: 'User Management', sidebarKey: 'User Management', features: [] },
];

export default function UserManagementPage({
  users, companies, divisions, roles, currentUser, projects = []
}: {
  users: User[], companies: Company[], divisions: Division[], roles: Role[], currentUser: User, projects?: Project[]
}) {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isGlobalMatrixOpen, setIsGlobalMatrixOpen] = useState(false);
  const [isProjectAccessOpen, setIsProjectAccessOpen] = useState(false);

  const isSuperAdmin = currentUser.role?.name === 'SuperAdmin';
  const isPIC = currentUser.role?.name === 'pic';

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
      project_access: {} as Record<string, { view_project: boolean; view_progress: boolean; edit_task: boolean }>
    } as PermissionMatrix
  });

  const openModal = (user: User | null = null) => {
    setEditingUser(user);
    if (user) {
      setData({
        username: user.username,
        email: user.email,
        password: '',
        roles_id: user.roles_id?.toString() || '',
        companies_id: user.companies_id?.toString() || '',
        divisions_id: user.divisions_id?.toString() || '',
        permission_matrix: user.permission_matrix || { sidebar: [], features: {}, data_scope: 'own_company', project_access: {} }
      });
    } else {
      reset();
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      put(`/users/${editingUser.id}`, {
        onSuccess: () => { closeModal(); setToast({ msg: 'User updated successfully', type: 'success' }); },
        onError: () => setToast({ msg: 'Error updating user', type: 'danger' })
      });
    } else {
      post('/users', {
        onSuccess: () => { closeModal(); setToast({ msg: 'User created successfully', type: 'success' }); },
        onError: () => setToast({ msg: 'Error creating user', type: 'danger' })
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      destroy(`/users/${id}`, {
        onSuccess: () => setToast({ msg: 'User deleted successfully', type: 'success' }),
        onError: () => setToast({ msg: 'Error deleting user', type: 'danger' })
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

  const handleFeatureToggle = (feature: string, action: string) => {
    const currentFeat = data.permission_matrix.features || {};
    const currentActions = currentFeat[feature] || [];
    const updatedActions = currentActions.includes(action) ? currentActions.filter(a => a !== action) : [...currentActions, action];
    setData('permission_matrix', { ...data.permission_matrix, features: { ...currentFeat, [feature]: updatedActions } });
  };

  const handleProjectAccessToggle = (projectId: number, accessType: 'view_project' | 'view_progress' | 'edit_task') => {
    const currentAccess = data.permission_matrix.project_access || {};
    const projectAccess = currentAccess[projectId] || { view_project: false, view_progress: false, edit_task: false };
    
    setData('permission_matrix', {
      ...data.permission_matrix,
      project_access: {
        ...currentAccess,
        [projectId]: { ...projectAccess, [accessType]: !projectAccess[accessType] }
      }
    });
  };

  const selectedRoleName = isPIC ? editingUser?.role?.name : roles.find(r => r.id.toString() === data.roles_id)?.name;
  const showGlobalMatrix = isSuperAdmin && selectedRoleName !== 'SuperAdmin';
  // PIC can only assign project access if user is worker (or if they just want to give specific access)
  const isWorkerTarget = selectedRoleName === 'worker';

  return (
    <>
      <Head title="User Management" />
      <div className="p-5 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="User Management"
          subtitle={isPIC ? "Manage project access for users in your company." : "Manage users, roles, and fine-grained permissions."}
          actions={
            isSuperAdmin && <Button onClick={() => openModal()} icon={Plus}>Add User</Button>
          }
        />

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-neutral-50/80 text-neutral-500 font-semibold uppercase text-[11px] tracking-wider border-b border-neutral-200">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Division</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-bold text-neutral-900">{u.username}</div>
                      <div className="text-[11px] text-neutral-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 bg-brand-light text-brand rounded font-semibold text-[11px]">
                        {u.role?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-600">{u.company?.name || '—'}</td>
                    <td className="px-5 py-3 text-neutral-600">{u.division?.divisi || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* PIC can only edit workers in their company */}
                        {(isSuperAdmin || (isPIC && u.role?.name === 'worker' && u.companies_id === currentUser.companies_id)) && (
                          <button onClick={() => openModal(u)} className="p-1.5 text-neutral-400 hover:text-brand hover:bg-brand-light rounded transition-colors" title={isPIC ? "Edit Project Access" : "Edit User"}>
                            <Edit2 size={15} />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button onClick={() => handleDelete(u.id)} className="p-1.5 text-neutral-400 hover:text-danger hover:bg-danger-light rounded transition-colors"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-neutral-500">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={isPIC ? `Manage Project Access: ${editingUser?.username}` : (editingUser ? "Edit User" : "Create User")} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {isSuperAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">Username</label>
                <input type="text" value={data.username} onChange={e => setData('username', e.target.value)} required className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand" />
                {errors.username && <p className="text-danger text-[11px] mt-1">{errors.username}</p>}
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">Email</label>
                <input type="email" value={data.email} onChange={e => setData('email', e.target.value)} required className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand" />
                {errors.email && <p className="text-danger text-[11px] mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">Password {editingUser && '(Leave blank to keep)'}</label>
                <input type="password" value={data.password} onChange={e => setData('password', e.target.value)} required={!editingUser} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand" />
                {errors.password && <p className="text-danger text-[11px] mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">Role</label>
                <select value={data.roles_id} onChange={e => setData('roles_id', e.target.value)} required className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand">
                  <option value="">Select Role</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              
              {showGlobalMatrix && (
                <>
                  <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">Company</label>
                    <select value={data.companies_id} onChange={e => setData('companies_id', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand">
                      <option value="">No Company</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">Division</label>
                    <select value={data.divisions_id} onChange={e => setData('divisions_id', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-brand focus:border-brand">
                      <option value="">No Division</option>
                      {divisions.map(d => <option key={d.id} value={d.id}>{d.divisi}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {isPIC && (
            <div className="bg-brand-light/30 border border-brand/20 p-4 rounded-xl text-[13px] text-brand-dark mb-4">
              PIC mode: You are only allowed to modify project-specific access for workers in your company.
            </div>
          )}

          {/* Project-Level Granularity */}
          {isWorkerTarget && (isPIC || isSuperAdmin) && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden mt-4">
              <div 
                className="bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center cursor-pointer hover:bg-neutral-100 transition-colors"
                onClick={() => setIsProjectAccessOpen(!isProjectAccessOpen)}
              >
                <h3 className="font-bold text-[13px] flex items-center gap-2"><FolderOpen size={16} className="text-brand" /> Project Access Matrix (Initial Setup)</h3>
                {isProjectAccessOpen ? <ChevronDown size={16} className="text-neutral-400" /> : <ChevronRight size={16} className="text-neutral-400" />}
              </div>
              
              {isProjectAccessOpen && (
                <div className="p-0">
                  {projects.length === 0 ? (
                    <div className="p-5 text-center text-[13px] text-neutral-500">No projects available in this company yet.</div>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-white text-neutral-500 font-semibold text-[11px] uppercase tracking-wider border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
                          <tr>
                            <th className="px-4 py-2">Project Name</th>
                            <th className="px-4 py-2 text-center">Can View Project</th>
                            <th className="px-4 py-2 text-center">Can View Progress</th>
                            <th className="px-4 py-2 text-center">Can Edit Task</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {projects.map(proj => {
                            const access = data.permission_matrix.project_access?.[proj.id] || { view_project: false, view_progress: false, edit_task: false };
                            return (
                              <tr key={proj.id} className="hover:bg-neutral-50/50">
                                <td className="px-4 py-3 font-medium text-neutral-900">{proj.title}</td>
                                <td className="px-4 py-3 text-center">
                                  <input type="checkbox" checked={access.view_project} onChange={() => handleProjectAccessToggle(proj.id, 'view_project')} className="rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer" />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <input type="checkbox" checked={access.view_progress} onChange={() => handleProjectAccessToggle(proj.id, 'view_progress')} className="rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer" />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <input type="checkbox" checked={access.edit_task} onChange={() => handleProjectAccessToggle(proj.id, 'edit_task')} className="rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer" />
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
            </div>
          )}

          {showGlobalMatrix && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden mt-4">
              <div 
                className="bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center cursor-pointer hover:bg-neutral-100 transition-colors"
                onClick={() => setIsGlobalMatrixOpen(!isGlobalMatrixOpen)}
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-brand" />
                  <h3 className="font-bold text-[13px]">Global Permission Matrix</h3>
                  <span className="text-[10px] font-bold text-neutral-500 bg-white border border-neutral-200 px-1.5 py-0.5 rounded ml-2">SuperAdmin Only</span>
                </div>
                {isGlobalMatrixOpen ? <ChevronDown size={16} className="text-neutral-400" /> : <ChevronRight size={16} className="text-neutral-400" />}
              </div>
              
              {isGlobalMatrixOpen && (
                <div className="p-4 space-y-5">
                  {/* Data Access Scope */}
                  <div>
                    <h4 className="text-[12px] font-bold text-neutral-800 mb-2 uppercase tracking-wide">Data Access Scope</h4>
                    <div className="flex gap-4 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 w-fit">
                      <label className="flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer">
                        <input type="radio" name="scope" value="all" checked={data.permission_matrix.data_scope === 'all'} onChange={() => setData('permission_matrix', { ...data.permission_matrix, data_scope: 'all' })} className="text-brand focus:ring-brand cursor-pointer" /> All Companies
                      </label>
                      <label className="flex items-center gap-2 text-[13px] text-neutral-700 cursor-pointer">
                        <input type="radio" name="scope" value="own_company" checked={data.permission_matrix.data_scope === 'own_company'} onChange={() => setData('permission_matrix', { ...data.permission_matrix, data_scope: 'own_company' })} className="text-brand focus:ring-brand cursor-pointer" /> Own Company Only
                      </label>
                    </div>
                  </div>

                  {/* Unified Module Permissions */}
                  <div>
                    <h4 className="text-[12px] font-bold text-neutral-800 mb-2 uppercase tracking-wide">Module Access & Features</h4>
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
                                <td className="px-4 py-2.5 font-semibold text-neutral-800">{mod.module}</td>
                                <td className="px-4 py-2.5 text-center border-l border-neutral-100">
                                  <input 
                                    type="checkbox" 
                                    checked={isView} 
                                    onChange={() => handleUnifiedViewToggle(mod)} 
                                    className="rounded text-brand focus:ring-brand w-4 h-4 cursor-pointer" 
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
                                              onChange={() => handleFeatureToggle(mod.featureGroup!, feat)} 
                                              disabled={!isView} 
                                              className="rounded text-brand focus:ring-brand" 
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

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={processing}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
