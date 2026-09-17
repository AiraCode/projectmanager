import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CURRENT_USER, PIC_USER, Role } from '@/data/mockData';

export interface User {
  id?: number;
  name: string;
  email: string;
  role: Role;
  pic: string;
  canCreateProject?: boolean;
  ownedProject?: { id: number; name: string; company_id?: number } | null;
}

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role.toLowerCase() === 'admin' ? 'Admin' : 'PIC',
            pic: data.user.pic_role || (data.user.role.toLowerCase() === 'admin' ? 'PM' : 'Engineering'),
            canCreateProject: data.user.can_create_project,
            ownedProject: data.user.owned_project,
          });
        }
      }
    } catch {
      // offline / api fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const u = data.user;
        setUser({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role.toLowerCase() === 'admin' ? 'Admin' : 'PIC',
          pic: u.pic_role || (u.role.toLowerCase() === 'admin' ? 'PM' : 'Engineering'),
          canCreateProject: u.can_create_project,
          ownedProject: u.owned_project,
        });
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err.message || err.errors?.email?.[0] || 'Invalid credentials. Please try again.',
        };
      }
    } catch {
      // Fallback for demo mock accounts
      if (email === 'admin@jeker.id' && password === 'admin123') {
        setUser({ ...CURRENT_USER, canCreateProject: false, ownedProject: { id: 1, name: 'Pembangunan Pabrik Baru Tahap II' } });
        return { success: true };
      }
      if (email === 'admin2@jeker.id' && password === 'admin123') {
        setUser({ name: 'Siti Rahma', email: 'admin2@jeker.id', role: 'Admin', pic: 'PM', canCreateProject: true, ownedProject: null });
        return { success: true };
      }
      if (email === 'pic@jeker.id' && password === 'pic123') {
        setUser({ ...PIC_USER, canCreateProject: false });
        return { success: true };
      }
      return { success: false, error: 'Connection error. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // ignore
    }
    setUser(null);
  };

  const switchRole = (role: Role) => {
    if (!user) return;
    if (role === 'Admin') {
      setUser({
        ...user,
        role: 'Admin',
        pic: 'PM',
      });
    } else {
      setUser({
        ...user,
        role: 'PIC',
        pic: user.pic === 'PM' ? 'Engineering' : user.pic,
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchRole, refreshUser: fetchCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
