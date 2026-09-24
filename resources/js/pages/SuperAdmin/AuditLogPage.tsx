import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { ScrollText, Filter } from 'lucide-react';
import { useState } from 'react';

interface AuditEntry {
  id: number;
  actor: string;
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
  CREATE_USER:           'bg-emerald-100 text-emerald-700',
  UPDATE_USER:           'bg-blue-100 text-blue-700',
  DELETE_USER:           'bg-red-100 text-red-700',
  UPDATE_PROJECT_ACCESS: 'bg-violet-100 text-violet-700',
};

export default function AuditLogPage({
  logs, actionTypes, filters
}: { logs: PaginatedLogs; actionTypes: string[]; filters: { action?: string } }) {
  const [selectedAction, setSelectedAction] = useState(filters.action ?? '');

  const applyFilter = (action: string) => {
    setSelectedAction(action);
    router.get('/admin/audit-log', { action: action || undefined }, { preserveState: true });
  };

  return (
    <SuperAdminLayout>
      <Head title="Audit Log — PROVIS SuperAdmin" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <ScrollText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-neutral-900 tracking-tight">Audit Log</h1>
              <p className="text-[12px] text-neutral-500">Track all system actions performed by administrators and PICs.</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: '#7c3aed' }} />
            <select
              value={selectedAction}
              onChange={e => applyFilter(e.target.value)}
              className="text-[13px] border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white text-neutral-700"
              style={{ borderColor: 'rgba(139,92,246,0.3)' }}
            >
              <option value="">All Actions</option>
              {actionTypes.map(a => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border overflow-hidden"
          style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}
        >
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(139,92,246,0.08)', background: 'rgba(139,92,246,0.02)' }}
          >
            <span className="text-[12px] font-semibold text-neutral-500">
              Showing {logs.data.length} of {logs.total} records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr style={{ background: 'rgba(139,92,246,0.03)' }}>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">#</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Actor</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Description</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">IP</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {logs.data.map(log => (
                  <tr key={log.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-5 py-3 text-neutral-400 text-[11px]">#{log.id}</td>
                    <td className="px-5 py-3 font-semibold text-neutral-800">{log.actor}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ACTION_COLORS[log.action] ?? 'bg-neutral-100 text-neutral-600'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-600 max-w-xs truncate">{log.description}</td>
                    <td className="px-5 py-3 text-neutral-400 font-mono text-[11px]">{log.ip_address ?? '—'}</td>
                    <td className="px-5 py-3 text-neutral-500 text-[11px]">{log.created_at}</td>
                  </tr>
                ))}
                {logs.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                      No audit log entries found.
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
                Page {logs.current_page} of {logs.last_page}
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
