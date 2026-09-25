import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Search, Lock, Globe, Trash2, ExternalLink, Building2, Calendar } from 'lucide-react';

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
  const [filterPrivate, setFilterPrivate] = useState<'all' | 'public' | 'private'>('all');

  const filtered = projects.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.company ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPrivate = filterPrivate === 'all' ? true :
      filterPrivate === 'private' ? p.is_private : !p.is_private;
    return matchSearch && matchPrivate;
  });

  const handleDelete = (p: Project) => {
    if (confirm(`Delete project "${p.title}"? This action cannot be undone and will delete all related tasks and data.`)) {
      router.delete(`/admin/projects/${p.id}`);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'On Track')  return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'At Risk')   return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'Delayed')   return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  };

  return (
    <SuperAdminLayout>
      <Head title="All Projects — SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">All Projects</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">View and manage all projects across companies, including private ones.</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-neutral-500">
            <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-bold">{projects.length} total</span>
            <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-bold flex items-center gap-1">
              <Lock size={10} /> {projects.filter(p => p.is_private).length} private
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input type="text" placeholder="Search projects or company..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white" />
          </div>
          <div className="flex bg-neutral-100 p-1 rounded-lg gap-1">
            {(['all', 'public', 'private'] as const).map(f => (
              <button key={f} onClick={() => setFilterPrivate(f)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all capitalize ${
                  filterPrivate === f ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}>
                {f === 'private' && <Lock size={10} className="inline mr-1" />}
                {f === 'public' && <Globe size={10} className="inline mr-1" />}
                {f}
              </button>
            ))}
          </div>
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
                    <div className="flex items-center gap-1 text-[11.5px] text-neutral-500">
                      <Calendar size={11} className="text-neutral-400" />
                      {p.start_date ?? '?'} → {p.end_date ?? '?'}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <a href={`/projects/${p.id}`} target="_blank" className="p-1.5 rounded-lg text-neutral-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Open project">
                        <ExternalLink size={14} />
                      </a>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete project">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
