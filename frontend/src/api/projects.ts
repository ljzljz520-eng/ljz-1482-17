import { api } from './client';
import type { Project, ProjectCursor } from '../types';

export const listProjects = () => api.get<Project[]>('/projects').then(r => r.data);
export const createProject = (payload: { name: string; templateFavoriteId?: string }) =>
  api.post<Project>('/projects', payload).then(r => r.data);
export const deleteProject = (id: string) => api.delete<{ message: string }>(`/projects/${id}`).then(r => r.data);
export const putCursor = (projectId: string, deviceId: string, data: string) =>
  api.put<ProjectCursor>(`/projects/${projectId}/cursor`, { deviceId, data }).then(r => r.data);
export const getCursors = (projectId: string) =>
  api.get<ProjectCursor[]>(`/projects/${projectId}/cursors`).then(r => r.data);
