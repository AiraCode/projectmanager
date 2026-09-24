import { Head } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Users, Building2, FolderOpen, Shield, UserPlus, Clock } from 'lucide-react';

interface Stats {
  total_users: number;
  total_companies: number;
  total_projects: number;
  total_admins: number;
  total_pics: number;
  total_workers: number;
}

interface RecentUser {
  id: number;
  username: string;
  email: string;
  role: string;
  company: string | null;
  created_by: string;
  created_at: string;
}

interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_USER:           'bg-emerald-100 text-emerald-700',
  UPDATE_USER:           'bg-blue-100 text-blue-700',
  DELETE_USER:           'bg-red-100 text-red-700',
  UPDATE_PROJECT_ACCESS: 'bg-violet-100 text-violet-700',
};

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin:    'bg-violet-100 text-violet-700',
  admin_utama:   'bg-indigo-100 text-indigo-700',
  admin_progres: 'bg-amber-100 text-amber-700',
  pic:           'bg-emerald-100 text-emerald-700',
  worker:        'bg-neutral-100 text-neutral-600',
};

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border flex items-center gap-4" style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}>
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0 ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-[28px] font-black leading-none text-neutral-900">{value}</div>
        <div className="text-[12px] font-semibold text-neutral-500 mt-1">{label}</div>
        {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function SuperAdminDashboardPage({
  stats, recentUsers, recentAuditLogs
}: { stats: Stats; recentUsers: RecentUser[]; recentAuditLogs: AuditEntry[] }) {
  return (
    <SuperAdminLayout>
      <Head title="SuperAdmin Dashboard — PROVIS" />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl shadow-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Shield size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight">System Control Panel</h1>
            <p className="text-[13px] text-neutral-500 mt-0.5">Manage users, access rights, and review audit activity across the entire system.</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Users}      label="Total Users"     value={stats.total_users}     color="bg-violet-100 text-violet-600" />
          <StatCard icon={Building2}  label="Companies"       value={stats.total_companies}  color="bg-indigo-100 text-indigo-600" />
          <StatCard icon={FolderOpen} label="Projects"        value={stats.total_projects}   color="bg-blue-100 text-blue-600" />
          <StatCard icon={Shield}     label="Admins"          value={stats.total_admins}     color="bg-amber-100 text-amber-600" />
          <StatCard icon={UserPlus}   label="PICs"            value={stats.total_pics}       color="bg-emerald-100 text-emerald-600" />
          <StatCard icon={Users}      label="Workers"         value={stats.total_workers}    color="bg-neutral-100 text-neutral-600" />
        </div>

        {/* Recent Users + Recent Audit Logs */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Recent Users */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
              <div className="flex items-center gap-2.5">
                <UserPlus size={16} style={{ color: '#7c3aed' }} />
                <h2 className="font-bold text-[14px] text-neutral-900">Recently Created Users</h2>
              </div>
              <a href="/admin/users" className="text-[12px] font-semibold hover:underline" style={{ color: '#7c3aed' }}>
                View all →
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: 'rgba(139,92,246,0.03)' }}>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">User</th>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">Created By</th>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {recentUsers.map(u => (
                    <tr key={u.id} className="hover:bg-violet-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-neutral-900">{u.username}</div>
                        <div className="text-[11px] text-neutral-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[u.role] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{u.created_by}</td>
                      <td className="px-4 py-3 text-neutral-400 text-[11px]">{u.created_at}</td>
                    </tr>
                  ))}
                  {recentUsers.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-400">No users yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Audit Logs */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.1)', boxShadow: '0 1px 8px rgba(139,92,246,0.06)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
              <div className="flex items-center gap-2.5">
                <Clock size={16} style={{ color: '#7c3aed' }} />
                <h2 className="font-bold text-[14px] text-neutral-900">Recent Activity Log</h2>
              </div>
              <a href="/admin/audit-log" className="text-[12px] font-semibold hover:underline" style={{ color: '#7c3aed' }}>
                View all →
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: 'rgba(139,92,246,0.03)' }}>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">Actor</th>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">Action</th>
                    <th className="px-4 py-2.5 font-semibold text-neutral-500 text-[11px] uppercase tracking-wider">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {recentAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-violet-50/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-neutral-800">{log.actor}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ACTION_COLORS[log.action] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <div className="text-[11px] text-neutral-400 mt-0.5 truncate max-w-[180px]">{log.description}</div>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-[11px]">{log.created_at}</td>
                    </tr>
                  ))}
                  {recentAuditLogs.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-400">No activity recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </SuperAdminLayout>
  );
}
