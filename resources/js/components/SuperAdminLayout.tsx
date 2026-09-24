import { useState, useEffect, useRef } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import {
  LayoutDashboard, Users, ScrollText, LogOut, Menu, X, ChevronLeft, Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Modal, Button } from '@/components/ui';

const ADMIN_NAV = [
  { to: '/admin',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users',     icon: Users,            label: 'User Management' },
  { to: '/admin/audit-log', icon: ScrollText,       label: 'Audit Log' },
];

export default function SuperAdminLayout({ children }: { children?: React.ReactNode }) {
  const { url } = usePage();
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [profileOpen, setProfileOpen]       = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('jeker_sa_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const mainRef = useRef<HTMLElement>(null);

  const toggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('jeker_sa_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [url]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-profile-menu]')) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (!user) return null;

  const currentUrl = url ?? '';
  const purePath   = currentUrl.split('?')[0];

  const handleLogout = () => {
    if (typeof window !== 'undefined') localStorage.removeItem('jeker_last_project_id');
    router.post('/logout');
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f0f1a' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SuperAdmin Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'w-[76px]' : 'w-64'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
        style={{ background: 'linear-gradient(180deg, #1a1040 0%, #120d2e 100%)', borderRight: '1px solid rgba(139,92,246,0.15)' }}
      >
        {/* Logo */}
        <div className={`h-[73px] flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-5'} flex-shrink-0`}
          style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}
        >
          {sidebarCollapsed ? (
            <div
              onClick={toggleCollapse}
              className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
              title="Expand sidebar"
            >
              <Shield size={16} className="text-white" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  <Shield size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-black text-[13px] tracking-tight text-white leading-none">SUPER ADMIN</div>
                  <div className="text-[10px] mt-0.5 font-medium truncate" style={{ color: 'rgba(167,139,250,0.6)' }}>JEKER Control Panel</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleCollapse}
                  className="hidden lg:flex items-center justify-center p-1.5 rounded-lg transition-colors"
                  style={{ color: 'rgba(167,139,250,0.5)' }}
                  title="Collapse sidebar"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="lg:hidden p-1.5 rounded-lg transition-colors"
                  onClick={() => setSidebarOpen(false)}
                  style={{ color: 'rgba(167,139,250,0.5)' }}
                >
                  <X size={18} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto scrollbar-hide">
          {ADMIN_NAV.map(({ to, icon: Icon, label }) => {
            const isActive = purePath === to || (to !== '/admin' && purePath.startsWith(to));
            return (
              <Link
                key={to}
                href={to}
                title={sidebarCollapsed ? label : undefined}
                className={`flex items-center rounded-xl transition-all duration-150 ${
                  sidebarCollapsed
                    ? `w-10 h-10 mx-auto justify-center`
                    : `gap-3 px-3 py-2.5 text-[13.5px] font-medium`
                }`}
                style={
                  isActive
                    ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(79,70,229,0.4))', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.4)', fontWeight: 600 }
                    : { color: 'rgba(167,139,250,0.6)', border: '1px solid transparent' }
                }
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#c4b5fd'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(167,139,250,0.6)'; }}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}>
          {!sidebarCollapsed && (
            <div className="text-center">
              <div className="text-[10px] font-mono font-medium" style={{ color: 'rgba(167,139,250,0.3)' }}>JEKER v1.0 © 2026</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#f8f7ff' }}>
        {/* Topbar */}
        <header className="flex items-center gap-4 px-5 lg:px-8 py-3 bg-white flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', boxShadow: '0 1px 0 rgba(139,92,246,0.06)' }}
        >
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-violet-50 transition-colors"
            onClick={() => setSidebarOpen(true)}
            style={{ color: '#7c3aed' }}
          >
            <Menu size={20} />
          </button>

          {/* SuperAdmin badge */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg shadow-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              <Shield size={13} className="text-white" />
            </div>
            <span className="font-black text-sm tracking-tight" style={{ color: '#1a1040' }}>Super Admin</span>
          </div>

          <div className="flex-1" />

          {/* Profile Dropdown */}
          <div className="relative" data-profile-menu>
            <button
              onClick={() => setProfileOpen(v => !v)}
              className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-lg hover:bg-violet-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
              >
                <span className="text-white text-[12px] font-bold">
                  {(user.name ?? 'S').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[13px] font-semibold text-neutral-800 leading-none">{user.name}</div>
                <div className="text-[11px] mt-0.5 font-semibold" style={{ color: '#7c3aed' }}>SuperAdmin</div>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border shadow-xl z-50 py-1.5"
                style={{ borderColor: 'rgba(139,92,246,0.2)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
                  <div className="text-[13px] font-bold text-neutral-900">{user.name}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{user.email}</div>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                    >
                      <Shield size={9} />
                      SuperAdmin
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
