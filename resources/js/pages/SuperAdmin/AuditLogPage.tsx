import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { ScrollText, Filter, Search, Globe, User as UserIcon } from 'lucide-react';
import { useState } from 'react';

interface AuditEntry {
  id: number;
  actor: string;
  actor_email?: string | null;
  action: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

interface PaginatedLogs {
  data: AuditEntry[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: { url: string | null; label: string; active: boolean }[];
}

const ACTION_COLORS: Record<string, string> = {
  // Authentication & Security
  LOGIN:                    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  LOGOUT:                   'bg-neutral-100 text-neutral-600 border border-neutral-200',
  LOGIN_FAILED:             'bg-red-50 text-red-700 border border-red-200 font-bold',
  ADMIN_LOGIN:              'bg-violet-50 text-violet-700 border border-violet-200 font-bold',
  ADMIN_LOGIN_FAILED:       'bg-rose-50 text-rose-700 border border-rose-200 font-bold',
  UNAUTHORIZED_ADMIN_LOGIN: 'bg-red-100 text-red-800 border border-red-300 font-black',
  PASSWORD_CHANGE:          'bg-amber-50 text-amber-700 border border-amber-200',

  // User Management
  CREATE_USER:              'bg-emerald-100 text-emerald-800',
  UPDATE_USER:              'bg-blue-100 text-blue-800',
  DELETE_USER:              'bg-red-100 text-red-800',
  UPDATE_PROJECT_ACCESS:    'bg-violet-100 text-violet-800',

  // Project Management
  CREATE_PROJECT:           'bg-indigo-100 text-indigo-800 font-medium',
  DELETE_PROJECT:           'bg-rose-100 text-rose-800 font-medium',
  COMPLETE_PROJECT_SETUP:   'bg-teal-100 text-teal-800 font-medium',
  TOGGLE_PRIVATE_PROJECT:   'bg-purple-100 text-purple-800',

  // Task & WBS
  TASK_COMPLETED:           'bg-emerald-100 text-emerald-800 font-semibold',
  TASK_PROGRESS_UPDATED:    'bg-sky-100 text-sky-800',
  CREATE_TASK:              'bg-blue-50 text-blue-700',
  UPDATE_TASK:              'bg-blue-50/60 text-blue-700',
  DELETE_TASK:              'bg-red-50 text-red-700',

  // Company & Division
  CREATE_COMPANY:           'bg-cyan-100 text-cyan-800',
  UPDATE_COMPANY:           'bg-cyan-50 text-cyan-700',
  DELETE_COMPANY:           'bg-red-100 text-red-700',
  CREATE_DIVISION:          'bg-teal-100 text-teal-800',
  UPDATE_DIVISION:          'bg-teal-50 text-teal-700',
  DELETE_DIVISION:          'bg-red-100 text-red-700',
};

export default function AuditLogPage({
  logs, actionTypes, filters
}: { logs: PaginatedLogs; actionTypes: string[]; filters: { action?: string; search?: string } }) {
  const [selectedAction, setSelectedAction] = useState(filters.action ?? '');
  const [search, setSearch] = useState(filters.search ?? '');

  const handleFilterChange = (newAction: string, newSearch: string) => {
    router.get('/admin/audit-log', {
      action: newAction || undefined,
      search: newSearch || undefined,
    }, { preserveState: true, replace: true });
  };

  const applyActionFilter = (action: string) => {
    setSelectedAction(action);
    handleFilterChange(action, search);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange(selectedAction, search);
  };

  return (
    <SuperAdminLayout>
      <Head title="Audit Log — PROVIS SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <ScrollText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-neutral-900 tracking-tight">System Audit Log</h1>
              <p className="text-[12px] text-neutral-500">
                Memantau seluruh aktivitas sistem: Login/Logout, Perubahan Task, Manajemen User, Proyek, dan Keamanan.
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder="Cari user, email, IP, aktivitas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-[12.5px] border border-neutral-200 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-neutral-800 w-56 sm:w-64 placeholder-neutral-400 shadow-2xs"
              />
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            </form>

            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-xl px-2.5 py-1 shadow-2xs">
              <Filter size={13} className="text-violet-600 shrink-0" />
              <select
                value={selectedAction}
                onChange={e => applyActionFilter(e.target.value)}
                className="text-[12px] bg-transparent text-neutral-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="">Semua Aktivitas ({actionTypes.length})</option>
                {actionTypes.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl border overflow-hidden"
          style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}
        >
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.08)', background: 'rgba(139,92,246,0.02)' }}
          >
            <span className="text-[12px] font-semibold text-neutral-500">
              Menampilkan {logs.data.length} dari {logs.total} riwayat aktivitas
            </span>
            {(selectedAction || search) && (
              <button
                onClick={() => {
                  setSelectedAction('');
                  setSearch('');
                  handleFilterChange('', '');
                }}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-800 hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr style={{ background: 'rgba(139,92,246,0.03)' }}>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">#</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Pelaku (Actor)</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Aktivitas</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Deskripsi</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">IP Address</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.data.map(log => (
                  <tr key={log.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-5 py-3 text-neutral-400 font-mono text-[11px]">#{log.id}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                          <UserIcon size={12} />
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-800 leading-tight">{log.actor}</div>
                          {log.actor_email && (
                            <div className="text-[11px] text-neutral-400">{log.actor_email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide ${ACTION_COLORS[log.action] ?? 'bg-neutral-100 text-neutral-600'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-700 max-w-md text-[12.5px] leading-relaxed">
                      {log.description}
                    </td>
                    <td className="px-5 py-3">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-neutral-100/80 text-neutral-600 font-mono text-[11px] border border-neutral-200/60">
                        <Globe size={11} className="text-neutral-400 shrink-0" />
                        <span>{log.ip_address ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-neutral-500 text-[11.5px] whitespace-nowrap">{log.created_at}</td>
                  </tr>
                ))}
                {logs.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-neutral-400">
                      Tidak ada catatan audit yang cocok dengan pencarian Anda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logs.last_page > 1 && (
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(139,92,246,0.08)' }}
            >
              <span className="text-[12px] text-neutral-400">
                Halaman {logs.current_page} dari {logs.last_page}
              </span>
              <div className="flex gap-1.5">
                {logs.links.map((link, i) => (
                  link.url ? (
                    <button
                      key={i}
                      onClick={() => router.visit(link.url!)}
                      className="px-3 py-1 text-[12px] rounded-lg font-medium transition-colors"
                      style={
                        link.active
                          ? { background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }
                          : { background: 'rgba(139,92,246,0.08)', color: '#7c3aed' }
                      }
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  ) : (
                    <span
                      key={i}
                      className="px-3 py-1 text-[12px] rounded-lg text-neutral-300"
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
