import React, { useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react';

interface Company {
  id: number;
  name: string;
  created_at: string;
  projects_count: number;
  users_count: number;
}

export default function CompaniesPage({ companies }: { companies: Company[] }) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const { data, setData, post, put, delete: destroy, processing, reset, errors } = useForm({ name: '' });

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const openCreate = () => { setEditCompany(null); reset(); setModalOpen(true); };
  const openEdit   = (c: Company) => { setEditCompany(c); setData('name', c.name); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editCompany) {
      put(`/admin/companies/${editCompany.id}`, { onSuccess: () => setModalOpen(false) });
    } else {
      post('/admin/companies', { onSuccess: () => { setModalOpen(false); reset(); } });
    }
  };

  const handleDelete = (c: Company) => {
    if (confirm(`Delete company "${c.name}"? This will affect all related data.`)) {
      destroy(`/admin/companies/${c.id}`);
    }
  };

  return (
    <SuperAdminLayout>
      <Head title="Companies — SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Company Management</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">Manage all registered companies in the system.</p>
          </div>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            <Plus size={15} /> Add Company
          </button>
        </div>

        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="text" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white" />
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Company Name</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Projects</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Users</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Created</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-neutral-400">No companies found.</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-neutral-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">{c.projects_count}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">{c.users_count}</span>
                  </td>
                  <td className="px-5 py-3.5 text-neutral-500 text-[12px]">{c.created_at}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-neutral-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <div>
                <h2 className="text-[15px] font-bold text-neutral-900">{editCompany ? 'Edit Company' : 'Add New Company'}</h2>
                <p className="text-[11.5px] text-neutral-500 mt-0.5">{editCompany ? `Editing: ${editCompany.name}` : 'Register a new company'}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-neutral-700 mb-1.5">Company Name <span className="text-red-500">*</span></label>
                <input type="text" value={data.name} onChange={e => setData('name', e.target.value)} required placeholder="e.g. PT. KARABHA WIRATAMA"
                  className="w-full px-3 py-2.5 text-[13px] border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
                {errors.name && <p className="text-red-500 text-[11px] mt-1">{errors.name}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl">Cancel</button>
                <button type="submit" disabled={processing} className="px-5 py-2 text-[13px] font-semibold text-white rounded-xl disabled:opacity-60 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  {processing ? 'Saving…' : editCompany ? 'Update Company' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
