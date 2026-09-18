import { createContext, useContext, ReactNode } from 'react';
import { usePage, router } from '@inertiajs/react';

export interface User {
  id?: number;
  name: string;
  email: string;
  role: string;
  pic?: string | null;
  division?: string | null;
  company?: string | null;
  canCreateProject?: boolean;
  ownedProject?: { id: number; name: string } | null;
}

// Keep Role type for backwards compatibility with old UI components
export type Role = 'Admin' | 'PIC' | 'Worker';

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

  const user: User | null = authUser ? {
    id:       authUser.id,
    name:     authUser.name ?? 'User',
    email:    authUser.email ?? '',
    role:     authUser.role === 'admin_utama'    ? 'Admin'
            : authUser.role === 'admin_progres'  ? 'Admin'
            : authUser.role === 'pic'            ? 'PIC'
            : 'Worker',
    division: authUser.division ?? null,
    company:  authUser.company  ?? null,
    // Legacy fields — needed by old UI components
    pic:      authUser.division ?? authUser.company ?? 'PM',
    canCreateProject: authUser.role === 'pic' || authUser.role === 'admin_utama',
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
