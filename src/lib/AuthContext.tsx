// src/lib/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  register: (nim: string, name: string, phone: string, email: string, password: string, role?: string) => Promise<void>;
  logOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('kkn_token');
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            localStorage.removeItem('kkn_token');
          }
        } catch (error) {
          console.error("Failed to verify token", error);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const signIn = async (phone: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('kkn_token', data.token);
    setUser(data.user);
  };

  const register = async (nim: string, name: string, phone: string, email: string, password: string, role?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim, name, phone, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('kkn_token', data.token);
    setUser(data.user);
  };

  const logOut = async () => {
    localStorage.removeItem('kkn_token');
    setUser(null);
  };

  const getToken = async () => {
    return localStorage.getItem('kkn_token');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, logOut, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

