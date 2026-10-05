import { create } from 'zustand';
import { fetchMe, login as loginApi } from '../api/auth';
import { tokenStorageKey } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  tenantName: string;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  load: () => Promise<void>;
  logoutLocal: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  tenantName: '',
  initialized: false,
  login: async (email, password) => {
    const data = await loginApi(email, password);
    localStorage.setItem(tokenStorageKey, data.token);
    set({ user: data.user, tenantName: data.tenant.name });
  },
  load: async () => {
    if (!localStorage.getItem(tokenStorageKey)) {
      set({ initialized: true, user: null });
      return;
    }
    try {
      const data = await fetchMe();
      set({ user: data.user, tenantName: data.tenant.name, initialized: true });
    } catch {
      set({ initialized: true, user: null });
    }
  },
  logoutLocal: () => {
    localStorage.removeItem(tokenStorageKey);
    set({ user: null, tenantName: '' });
  }
}));
