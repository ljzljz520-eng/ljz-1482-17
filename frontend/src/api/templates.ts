import { api } from './client';
import type { Favorite, Template } from '../types';

export const listTemplates = () => api.get<Template[]>('/templates').then(r => r.data);
export const listFavorites = () => api.get<Favorite[]>('/templates/favorites').then(r => r.data);
export const addFavorite = (templateId: string, mode: 'PINNED' | 'FOLLOW_LATEST') =>
  api.post<Favorite>('/templates/favorites', { templateId, mode }).then(r => r.data);
export const updateFavorite = (id: string, mode: 'PINNED' | 'FOLLOW_LATEST') =>
  api.put<Favorite>(`/templates/favorites/${id}`, { mode }).then(r => r.data);
export const removeFavorite = (id: string) => api.delete(`/templates/favorites/${id}`);

export const deleteTemplate = (id: string) => api.delete<{ message: string }>(`/templates/${id}`).then(r => r.data);

export const publishTemplate = (id: string) =>
  api.post(`/templates/${id}/publish`, {
    body: JSON.stringify({ layout: `updated-${Date.now()}`, publishedAt: new Date().toISOString() }),
    changeNote: `工作区发布 ${new Date().toLocaleString('zh-CN')}`
  }).then(r => r.data);
