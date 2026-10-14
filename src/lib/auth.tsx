'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  role: 'owner' | 'buyer' | 'supervisor' | 'delivery' | 'seller';
}

interface AuthContextValue {
  currentUser: AuthUser | null;
  users: AuthUser[];
  loginWithPin: (userId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchRoleDirect: (role: AuthUser['role']) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'fnv_active_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);

  // Fetch users on mount
  useEffect(() => {
    fetch('/api/auth/pin')
      .then((res) => res.json())
      .then((json) => {
        if (json.users) {
          setUsers(json.users);
          // Restore saved user or default to Owner
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              const found = json.users.find((u: AuthUser) => u.id === parsed.id);
              if (found) setCurrentUser(found);
            } catch {
              // ignore
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const loginWithPin = useCallback(async (userId: string, pin: string) => {
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, pin }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Invalid PIN' };
      }
      setCurrentUser(json.user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json.user));
      return { success: true };
    } catch {
      return { success: false, error: 'Network error verifying PIN' };
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchRoleDirect = useCallback(
    (role: AuthUser['role']) => {
      const found = users.find((u) => u.role === role);
      if (found) {
        setCurrentUser(found);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
      }
    },
    [users],
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        loginWithPin,
        logout,
        switchRoleDirect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
