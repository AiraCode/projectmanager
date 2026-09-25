import { useState, useEffect, useRef } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import {
  LayoutDashboard, FolderOpen, CheckSquare, GitBranch,
  BarChart2, TrendingUp, DollarSign, Menu, X, LogOut,
  ChevronRight, ChevronLeft, Shield, User, Users, Clock, CalendarDays
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Modal, Button } from '@/components/ui';

const NAV_ITEMS = [
  { to: '/projectlistpage',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projectdetailpage', icon: FolderOpen,      label: 'Project Detail' },
  { to: '/tasks',             icon: CheckSquare,     label: 'Tasks'     },
  { to: '/today-tasks',       icon: CalendarDays,    label: "Today's Tasks" },
  { to: '/timeline',          icon: GitBranch,       label: 'Timeline'  },
  { to: '/weekly',            icon: BarChart2,       label: 'Weekly'    },
  { to: '/scurve',            icon: TrendingUp,      label: 'S-Curve'   },
  { to: '/budget',            icon: DollarSign,      label: 'Budget',   adminOnly: true },
  { to: '/division-progress', icon: Users,           label: 'Division Progress' },
] as const;

export default function Layout({ children }: { children?: React.ReactNode }) {
  const { url } = usePage();          // url comes from the top-level page object
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('provis_sidebar_collapsed') === 'true' || localStorage.getItem('jeker_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Real-time 24-hour clock (jam: menit: detik, format 24 jam tanpa am/pm)
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      setCurrentTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('provis_sidebar_collapsed', String(next));
        localStorage.setItem('jeker_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const mainRef = useRef<HTMLElement>(null);

  // Auto reset scroll to top on page navigation
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [url]);

  useEffect(() => {
    const unregister = router.on('navigate', () => {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    });
    return () => unregister();
  }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-profile-menu]')) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // While user data is still loading / not available, show nothing
  if (!user) return null;

  const currentUrl = url ?? '';
  const isProjectSelector = currentUrl === '/projectlistpage' || currentUrl === '/projects';

  const isAdminProgres = user.isAdminProgres || user.role === 'admin_progres';
  const isAdminUtama   = user.isAdminUtama || user.role === 'admin_utama';
  const isWorker       = user.isWorker || user.role === 'worker';
  const isPIC          = user.isPIC || user.role === 'pic';

  const isSuperAdmin = user.role === 'SuperAdmin';

  const ALL_NAV_ITEMS = [
    { to: '/projectlistpage',   icon: FolderOpen,      label: 'Project List' },
    { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/projectdetailpage', icon: FolderOpen,      label: 'Project Detail' },
    { to: '/tasks',             icon: CheckSquare,     label: 'Tasks' },
    { to: '/today-tasks',       icon: CalendarDays,    label: "Today's Tasks" },
    { to: '/timeline',          icon: GitBranch,       label: 'Timeline' },
    { to: '/weekly',            icon: BarChart2,       label: 'Weekly Progress' },
    { to: '/scurve',            icon: TrendingUp,      label: 'S-Curve Report' },
    { to: '/budget',            icon: DollarSign,      label: 'Budget Management' },
    { to: '/division-progress', icon: Users,           label: 'Division Progress' },
    { to: '/users',             icon: Shield,          label: 'User Management' },
  ];

  let visibleNav: { to: string; icon: any; label: string }[] = [];

  if (isSuperAdmin || user.permission_matrix?.sidebar?.includes('*')) {
    visibleNav = ALL_NAV_ITEMS;
  } else if (user.permission_matrix?.sidebar) {
    const hasMultipleProjects = (user.permission_matrix?.features?.projects || []).includes('Multiple Projects');

    visibleNav = ALL_NAV_ITEMS.filter(item => {
      // Project List is only visible for PIC if they have Multiple Projects enabled
      if (item.to === '/projectlistpage' && isPIC) {
        return hasMultipleProjects;
      }
      if (item.to === '/division-progress' && (isAdminProgres || isAdminUtama || isPIC)) return true;
      if (item.to === '/today-tasks') return true;
      return user.permission_matrix?.sidebar?.includes(item.label) ?? false;
    });
  } else {
    visibleNav = ALL_NAV_ITEMS.filter(item => {
      if (item.to === '/budget') return isAdminUtama || isSuperAdmin;
      if (item.to === '/users') return isAdminUtama || isSuperAdmin;
      return true;
    });
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
  const activeProject = pageProps?.project;
  const projectHeaderTitle = activeProject
    ? (activeProject.company && activeProject.name
        ? `${activeProject.company} — ${activeProject.name}`
        : activeProject.name || '')
    : '';

  useEffect(() => {
    if (activeProjectId && typeof window !== 'undefined') {
      localStorage.setItem('provis_last_project_id', String(activeProjectId));
      localStorage.setItem('jeker_last_project_id', String(activeProjectId));
    }
  }, [activeProjectId]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('provis_last_project_id');
      localStorage.removeItem('jeker_last_project_id');
    }
    router.post('/logout');
  };

  const getNavUrl = (basePath: string) => {
    if (basePath === '/projectlistpage' || basePath === '/projects') return basePath;
    const resolvedId = activeProjectId || (typeof window !== 'undefined' ? (localStorage.getItem('provis_last_project_id') || localStorage.getItem('jeker_last_project_id')) : null);
    if (!resolvedId) return basePath;
    if (basePath === '/dashboard') return `/projects/${resolvedId}`;
    if (basePath === '/division-progress') return `/projects/${resolvedId}/division-progress`;
    if (basePath === '/today-tasks') return `/today-tasks?project_id=${resolvedId}`;
    return `${basePath}?project_id=${resolvedId}`;
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
          flex flex-col bg-sidebar text-white shadow-xl lg:shadow-none
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-[76px]' : 'w-64'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Logo & Collapse button */}
          <div className={`h-[73px] flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-5'} border-b border-white/10 transition-all duration-300 flex-shrink-0`}>
            {sidebarCollapsed ? (
              <div
                onClick={toggleCollapse}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-white p-1 cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all overflow-hidden"
                title="Click to expand sidebar"
              >
                <img
                  src="/images/Logo Provis.png"
                  alt="PROVIS"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white p-1 flex-shrink-0 shadow-sm overflow-hidden">
                    <img
                      src="/images/Logo Provis.png"
                      alt="PROVIS"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-base tracking-tight text-white leading-none">
                      PROVIS
                    </div>
                    <div className="text-[11px] text-white/40 mt-1 font-medium truncate">Project Management</div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={toggleCollapse}
                    className="hidden lg:flex items-center justify-center p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title="Collapse sidebar"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="lg:hidden p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto scrollbar-hide">
            {visibleNav.map(({ to, icon: Icon, label }) => {
              const targetUrl = getNavUrl(to);
              const purePath = currentUrl.split('?')[0];
              const isAllProjects = to === '/projectlistpage' || to === '/projects';

              // Precise active state matching routes in routes/web.php:
              let isActive = false;
              if (to === '/projectlistpage' || to === '/projects') {
                isActive = purePath === '/projectlistpage' || purePath === '/projects';
              } else if (to === '/dashboard') {
                isActive = purePath === '/dashboard' || /^\/projects\/[^/]+$/.test(purePath);
              } else if (to === '/projectdetailpage' || to === '/project') {
                isActive = purePath === '/projectdetailpage' || purePath === '/project' || /^\/projects\/[^/]+\/detail/.test(purePath) || /^\/projectdetailpage\/[^/]+/.test(purePath);
              } else if (to === '/timeline') {
                isActive = purePath === '/timeline' || /^\/projects\/[^/]+\/timeline/.test(purePath);
              } else if (to === '/weekly') {
                isActive = purePath === '/weekly' || /^\/projects\/[^/]+\/weekly/.test(purePath);
              } else if (to === '/scurve') {
                isActive = purePath === '/scurve' || /^\/projects\/[^/]+\/scurve/.test(purePath);
              } else if (to === '/budget') {
                isActive = purePath === '/budget' || /^\/projects\/[^/]+\/budget/.test(purePath);
              } else if (to === '/division-progress') {
                isActive = purePath === '/division-progress' || /^\/projects\/[^/]+\/division-progress/.test(purePath);
              } else if (to === '/tasks') {
                isActive = purePath === '/tasks' || /^\/projects\/[^/]+\/tasks/.test(purePath);
              } else if (to === '/today-tasks') {
                isActive = purePath === '/today-tasks' || /^\/projects\/[^/]+\/today-tasks/.test(purePath);
              } else {
                isActive = purePath === to || purePath.startsWith(to + '/');
              }

              // Custom click handling for All Projects: confirm before leaving active project
              const handleClick = (e: React.MouseEvent) => {
                setSidebarOpen(false);
                if (isAllProjects && purePath !== '/projectlistpage' && purePath !== '/projects') {
                  e.preventDefault();
                  setShowExitConfirm(true);
                }
              };

              // Special distinction for All Projects:
              const allProjectsStyle = isAllProjects
                ? (isActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : 'text-amber-300/85 hover:text-amber-200 bg-amber-400/10 hover:bg-amber-400/15 border border-amber-400/25')
                : (isActive
                    ? 'bg-brand text-white shadow-sm font-semibold'
                    : 'text-white/65 hover:text-white hover:bg-white/8');

              return (
                <div key={to}>
                  <Link
                    href={targetUrl}
                    onClick={handleClick}
                    title={sidebarCollapsed ? label : undefined}
                    className={`flex items-center rounded-lg transition-all duration-150 ${
                      sidebarCollapsed
                        ? `w-10 h-10 mx-auto justify-center ${allProjectsStyle}`
                        : `gap-3 px-3 py-2.5 text-[13.5px] font-medium ${allProjectsStyle}`
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="truncate">{label}</span>
                        {isAllProjects && !isActive && (
                          <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-semibold uppercase tracking-wider">
                            Home
                          </span>
                        )}
                        {isActive && !isAllProjects && <ChevronRight size={14} className="ml-auto opacity-70" />}
                      </>
                    )}
                  </Link>
                  {/* Subtle separator below All Projects in expanded mode */}
                  {isAllProjects && !sidebarCollapsed && (
                    <div className="my-2 border-b border-white/5" />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="border-t border-white/10 flex-shrink-0 transition-all duration-300">
            {sidebarCollapsed ? (
              <div className="py-3.5 text-center" title="PROVIS v1.0 © 2026">
                <span className="text-[10px] text-white/40 font-mono font-bold">v1.0</span>
              </div>
            ) : (
              <div className="p-4 text-center">
                <div className="text-[11.5px] text-white/50 font-medium tracking-wide">
                  PROVIS, 2026. All rights reserved.
                </div>
                <div className="text-[10px] text-white/30 font-mono mt-0.5 font-medium">
                  Version 1.0
                </div>
              </div>
            )}
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
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-neutral-200 p-0.5 shadow-2xs overflow-hidden">
              <img src="/images/Logo Provis.png" alt="PROVIS" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-neutral-900 text-sm tracking-tight">PROVIS</span>
          </div>

          {/* Project Title Header (Format: [Company Name] — [Project Name]) */}
          {projectHeaderTitle && !isProjectSelector ? (
            <div className="flex-1 min-w-0 px-2 lg:px-4">
              <h1
                className={`font-black tracking-tight text-neutral-900 truncate leading-snug ${
                  projectHeaderTitle.length > 55
                    ? 'text-[12px] sm:text-[13.5px] lg:text-[14.5px]'
                    : projectHeaderTitle.length > 35
                    ? 'text-[13px] sm:text-[14.5px] lg:text-[16px]'
                    : 'text-[14px] sm:text-[16px] lg:text-[18px]'
                }`}
                title={projectHeaderTitle}
              >
                {projectHeaderTitle}
              </h1>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Real-time 24-hour clock (jam: menit: detik) immediately to the left of profile */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200/80 text-neutral-800 font-mono text-[13px] font-bold tracking-widest select-none shrink-0 shadow-2xs"
            title="Real-time 24-hour clock"
          >
            <Clock size={14} className="text-brand stroke-[2.2]" />
            <span>{currentTime}</span>
          </div>

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
        <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {children}
        </main>
      </div>

      {/* Exit Project Confirmation Modal */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Exit Project?"
        subtitle="Confirm return to Project List"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-neutral-600 leading-relaxed">
            You are currently viewing an active project. Are you sure you want to return to the <strong>Project List</strong>?
          </p>
          <div className="flex justify-end gap-2.5 pt-2 border-t border-neutral-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowExitConfirm(false);
                router.visit('/projectlistpage');
              }}
            >
              Yes, Back to Project List
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
