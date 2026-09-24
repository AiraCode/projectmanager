import { createContext, useContext, ReactNode } from 'react';
import { usePage, router } from '@inertiajs/react';

export interface User {
  id?: number;
  name: string;
  email: string;
  role: string; // 'admin_utama' | 'admin_progres' | 'pic' | 'worker'
  rawRole: string;
  displayRole: string;
  isAdminUtama: boolean;
  isAdminProgres: boolean;
  isPIC: boolean;
  isWorker: boolean;
  pic?: string | null;
  division?: string | null;
  company?: string | null;
  companies_id?: number | null;
  canCreateProject?: boolean;
  permission_matrix?: {
    sidebar?: string[];
    [key: string]: any;
  } | null;
  ownedProject?: any;
}

export type Role = 'Admin Utama' | 'Admin Progres' | 'PIC' | 'Worker';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchRole: (role: Role) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const page = usePage() as any;
  const authUser = page?.props?.auth?.user ?? null;

  const rawRole = authUser?.role ?? 'worker';
  const isAdminUtama   = rawRole === 'admin_utama';
  const isAdminProgres = rawRole === 'admin_progres';
  const isPIC          = rawRole === 'pic';
  const isWorker       = rawRole === 'worker';

  const displayRole = isAdminUtama   ? 'Admin Utama'
                    : isAdminProgres ? 'Admin Progres'
                    : isPIC          ? 'PIC'
                    : 'Worker';

  const user: User | null = authUser ? {
    id:       authUser.id,
    name:     authUser.name ?? 'User',
    email:    authUser.email ?? '',
    role:     rawRole,
    rawRole,
    displayRole,
    isAdminUtama,
    isAdminProgres,
    isPIC,
    isWorker,
    division: authUser.division ?? null,
    company:  authUser.company  ?? null,
    companies_id: authUser.companies_id ?? null,
    // Legacy fields — needed by old UI components
    pic:      authUser.division ?? authUser.company ?? 'PM',
    canCreateProject: isPIC && (authUser.canCreateProject ?? true),
    permission_matrix: authUser.permission_matrix ?? null,
  } : null;

  const login        = async () => ({ success: true });
  const logout       = async () => { router.post('/logout'); };
  const switchRole   = () => {};
  const refreshUser  = async () => {};

  return (
    <AuthContext.Provider value={{ user, loading: false, login, logout, switchRole, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
