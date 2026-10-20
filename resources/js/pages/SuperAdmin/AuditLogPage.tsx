import { Head, router } from '@inertiajs/react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { ScrollText, Filter, Search, Globe, User as UserIcon, ChevronDown, Check, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const handleFilterChange = (newAction: string, newSearch: string) => {
    router.get('/admin/audit-log', {
      action: newAction || undefined,
      search: newSearch || undefined,
    }, { preserveState: true, replace: true });
  };

  const applyActionFilter = (action: string) => {
    setSelectedAction(action);
    setDropdownOpen(false);
    handleFilterChange(action, search);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange(selectedAction, search);
  };

  const filteredActionTypes = actionTypes.filter(a =>
    a.toLowerCase().replace(/_/g, ' ').includes(dropdownFilter.toLowerCase().trim())
  );

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
                Monitor all system activities: Authentication, Task Changes, User Management, Projects, and Security.
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder="Search user, email, IP, activity..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-[12.5px] border border-neutral-200 rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-neutral-800 w-56 sm:w-64 placeholder-neutral-400 shadow-2xs h-[34px]"
              />
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            </form>

            {/* Custom UI Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(prev => !prev);
                  setDropdownFilter('');
                }}
                className={`flex items-center gap-2 h-[34px] px-3 rounded-xl border text-[12.5px] font-medium transition-all duration-150 select-none ${
                  selectedAction
                    ? 'bg-violet-50/90 border-violet-300 text-violet-900 font-semibold shadow-xs'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-2xs'
                }`}
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
              >
                <Filter size={13} className={selectedAction ? 'text-violet-600' : 'text-violet-500'} />
                <span className="truncate max-w-[160px] sm:max-w-[200px]">
                  {selectedAction ? selectedAction.replace(/_/g, ' ') : `All Activities (${actionTypes.length})`}
                </span>
                {selectedAction ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      applyActionFilter('');
                    }}
                    className="p-0.5 -mr-1 rounded-full hover:bg-violet-200/70 text-violet-600 hover:text-violet-900 transition-colors"
                    title="Clear filter"
                  >
                    <X size={12} />
                  </span>
                ) : (
                  <ChevronDown
                    size={13}
                    className={`text-neutral-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-violet-600' : ''}`}
                  />
                )}
              </button>

              {/* Custom Dropdown Menu */}
              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-violet-100 shadow-xl shadow-violet-950/10 z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                  style={{ boxShadow: '0 10px 25px -5px rgba(124, 58, 237, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.05)' }}
                >
                  {/* Dropdown Quick Search (if list > 6 items) */}
                  {actionTypes.length > 6 && (
                    <div className="px-2.5 pb-2 pt-1 border-b border-neutral-100">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Filter actions..."
                          value={dropdownFilter}
                          onChange={(e) => setDropdownFilter(e.target.value)}
                          className="w-full text-[11.5px] bg-neutral-50/90 border border-neutral-200 rounded-lg pl-7 pr-2.5 py-1 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1.5 focus:ring-violet-400 focus:bg-white transition-all"
                          autoFocus
                        />
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                      </div>
                    </div>
                  )}

                  {/* Options List */}
                  <div className="max-h-64 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
                    {/* All Activities Option */}
                    {(!dropdownFilter || 'all activities'.includes(dropdownFilter.toLowerCase())) && (
                      <button
                        type="button"
                        onClick={() => applyActionFilter('')}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-[12px] transition-colors ${
                          !selectedAction
                            ? 'bg-violet-50 text-violet-900 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-50/80 font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          <span>All Activities</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-mono font-semibold">
                            {actionTypes.length}
                          </span>
                          {!selectedAction && <Check size={13} className="text-violet-600" />}
                        </div>
                      </button>
                    )}

                    {/* Filtered Action Types */}
                    {filteredActionTypes.map((action) => {
                      const isSelected = selectedAction === action;
                      const label = action.replace(/_/g, ' ');
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => applyActionFilter(action)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors ${
                            isSelected
                              ? 'bg-violet-50 text-violet-900 font-semibold'
                              : 'hover:bg-neutral-50/80 text-neutral-700 font-medium'
                          }`}
                        >
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide ${ACTION_COLORS[action] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {label}
                          </span>
                          {isSelected && <Check size={13} className="text-violet-600 shrink-0 ml-2" />}
                        </button>
                      );
                    })}

                    {filteredActionTypes.length === 0 && dropdownFilter && (
                      <div className="py-4 text-center text-[11.5px] text-neutral-400">
                        No actions found matching "{dropdownFilter}"
                      </div>
                    )}
                  </div>
                </div>
              )}
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
              Showing {logs.data.length} of {logs.total} activity logs
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
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Actor</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Description</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">IP Address</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Timestamp</th>
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
                      No audit log records match your search criteria.
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
