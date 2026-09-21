import { useState, useEffect } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import {
  LayoutDashboard, FolderOpen, CheckSquare, GitBranch,
  BarChart2, TrendingUp, DollarSign, Menu, X, LogOut,
  ChevronRight, Shield, User
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { to: '/projects',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/project',   icon: FolderOpen,      label: 'Project'   },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks'     },
  { to: '/timeline',  icon: GitBranch,       label: 'Timeline'  },
  { to: '/weekly',    icon: BarChart2,       label: 'Weekly'    },
  { to: '/scurve',    icon: TrendingUp,      label: 'S-Curve'   },
  { to: '/budget',    icon: DollarSign,      label: 'Budget',   adminOnly: true },
] as const;

export default function Layout({ children }: { children?: React.ReactNode }) {
  const { url } = usePage();          // url comes from the top-level page object
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-profile-menu]')) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const handleLogout = () => { router.post('/logout'); };

  // While user data is still loading / not available, show nothing
  if (!user) return null;

  const currentUrl = url ?? '';
  const isProjectSelector = currentUrl === '/projects';

  const isAdminProgres = user.isAdminProgres || user.role === 'admin_progres';
  const isAdminUtama   = user.isAdminUtama || user.role === 'admin_utama';
  const isWorker       = user.isWorker || user.role === 'worker';
  const isPIC          = user.isPIC || user.role === 'pic';

  // Navigation filtering according to strict authorization rules:
  // - Admin Progres: ONLY S-Curve (and All Projects selector)
  // - Worker: ONLY Tasks
  // - PIC: Dashboard, Project, Tasks, Timeline, Weekly, S-Curve, Budget
  // - Admin Utama: All Projects, Dashboard, Project, Tasks, Timeline, Weekly, S-Curve, Budget (Read-only)
  let visibleNav: { to: string; icon: any; label: string }[] = [];

  if (isAdminProgres) {
    visibleNav = [
      { to: '/projects', icon: FolderOpen, label: 'All Projects' },
      { to: '/scurve',   icon: TrendingUp, label: 'S-Curve' },
    ];
  } else if (isWorker) {
    visibleNav = [
      { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
    ];
  } else if (isAdminUtama) {
    visibleNav = [
      { to: '/projects',  icon: FolderOpen,      label: 'All Projects' },
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/project',   icon: FolderOpen,      label: 'Project' },
      { to: '/tasks',     icon: CheckSquare,     label: 'Tasks' },
      { to: '/timeline',  icon: GitBranch,       label: 'Timeline' },
      { to: '/weekly',    icon: BarChart2,       label: 'Weekly' },
      { to: '/scurve',    icon: TrendingUp,      label: 'S-Curve' },
      { to: '/budget',    icon: DollarSign,      label: 'Budget' },
    ];
  } else {
    // PIC
    visibleNav = [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/project',   icon: FolderOpen,      label: 'Project' },
      { to: '/tasks',     icon: CheckSquare,     label: 'Tasks' },
      { to: '/timeline',  icon: GitBranch,       label: 'Timeline' },
      { to: '/weekly',    icon: BarChart2,       label: 'Weekly' },
      { to: '/scurve',    icon: TrendingUp,      label: 'S-Curve' },
      { to: '/budget',    icon: DollarSign,      label: 'Budget' },
    ];
  }

  const roleBadgeStyle = isAdminUtama
    ? 'bg-brand/25 text-brand-light border border-brand/40'
    : isAdminProgres
    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
    : isPIC
    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
    : 'bg-white/10 text-white/80 border border-white/20';

  const pageProps = usePage().props as any;
  const activeProjectId = pageProps?.project?.id;

  const getNavUrl = (basePath: string) => {
    if (!activeProjectId || basePath === '/projects') return basePath;
    if (basePath === '/dashboard') return `/projects/${activeProjectId}`;
    return `${basePath}?project_id=${activeProjectId}`;
  };

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && !isProjectSelector && (
        <div
          className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {!isProjectSelector && (
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 flex flex-col bg-sidebar text-white shadow-xl lg:shadow-none
          transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-brand flex-shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm tracking-tight">J</span>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger ring-2 ring-sidebar" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-bold text-base tracking-tight text-white leading-none">
              <span>JEKER</span>
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            </div>
            <div className="text-[11px] text-white/40 mt-1 font-medium truncate">Project Management</div>
          </div>
          <button
            className="ml-auto lg:hidden p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${roleBadgeStyle}`}>
            <Shield size={11} />
            {user.displayRole || user.role} {user.division ? `· ${user.division}` : (user.company ? `· ${user.company}` : '')}
          </span>
          <span className="text-[10px] text-white/40 font-mono">v1.0</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto scrollbar-hide">
          {visibleNav.map(({ to, icon: Icon, label }) => {
            const targetUrl = getNavUrl(to);
            const purePath = currentUrl.split('?')[0];
            const isActive = purePath === to || purePath.startsWith(to + '/') || (to === '/dashboard' && purePath.startsWith('/projects/'));
            return (
              <Link
                key={to}
                href={targetUrl}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand text-white shadow-sm font-semibold'
                    : 'text-white/65 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span>{label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto opacity-70" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/10">
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/8 cursor-pointer transition-colors"
            onClick={handleLogout}
            title="Click to logout"
          >
            <div className="w-8 h-8 rounded-full bg-brand/30 flex items-center justify-center flex-shrink-0 border border-brand/40">
              <User size={14} className="text-brand-light" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">{user.name}</div>
              <div className="text-[11px] text-white/40 truncate">{user.email}</div>
            </div>
            <LogOut size={15} className="text-white/40 hover:text-danger flex-shrink-0 transition-colors" />
          </div>
        </div>
      </aside>
      )}

      {/* Main app */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-5 lg:px-8 py-3 bg-white border-b border-neutral-200 flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* Mobile title */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-brand text-white font-bold text-xs">J</div>
            <span className="font-bold text-neutral-900 text-sm tracking-tight">JEKER</span>
          </div>

          <div className="flex-1" />

          {/* User profile dropdown */}
          <div className="relative" data-profile-menu>
            <button
              onClick={() => setProfileOpen(v => !v)}
              className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shadow-xs">
                <span className="text-white text-[12px] font-bold">
                  {(user.name ?? 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[13px] font-semibold text-neutral-800 leading-none">{user.name}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{user.role}</div>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-neutral-200 shadow-xl z-50 py-1.5">
                <div className="px-4 py-3 border-b border-neutral-100">
                  <div className="text-[13px] font-bold text-neutral-900">{user.name}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{user.email}</div>
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-light text-brand">
                      {user.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] font-medium text-danger hover:bg-danger-light transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
