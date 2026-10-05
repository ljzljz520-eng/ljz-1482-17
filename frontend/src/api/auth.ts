import { api } from './client';
import type { Tenant, User } from '../types';

export const login = async (email: string, password: string) => {
  const { data } = await api.post<{ token: string; user: User; tenant: { id: string; name: string } }>('/auth/login', { email, password });
  return data;
};
export const fetchMe = () => api.get<{ user: User; tenant: { id: string; name: string } }>('/auth/me').then(r => r.data);
export const fetchTenant = () => api.get<Tenant>('/tenants/current').then(r => r.data);
export const leaveTenant = () => api.post<{ message: string }>('/tenants/leave').then(r => r.data);
