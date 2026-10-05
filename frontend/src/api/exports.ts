import { api } from './client';
import type { ExportTask, LedgerEntry } from '../types';

export const listTasks = () => api.get<ExportTask[]>('/exports/tasks').then(r => r.data);
export const createTask = (payload: { projectId: string; quality: 'DRAFT'|'STANDARD'|'PREMIUM'; failureMode?: 'NONE'|'FAIL_ONCE'|'WORKER_LOST'; idempotencyKey?: string }) =>
  api.post<ExportTask & { replayed?: boolean }>('/exports/tasks', payload).then(r => r.data);
export const leaseTask = (id: string) => api.post<{ task: ExportTask; workerId: string; fenceToken: number; leaseSeconds: number }>(`/exports/tasks/${id}/lease`).then(r => r.data);
export const completeTask = (id: string, fenceToken: number, content: string) =>
  api.post<{ task: ExportTask; message: string }>(`/exports/tasks/${id}/complete`, { fenceToken, content }).then(r => r.data);
export const failTask = (id: string, fenceToken: number) =>
  api.post<{ task: ExportTask; message: string }>(`/exports/tasks/${id}/fail`, { fenceToken, reason: '模拟渲染失败' }).then(r => r.data);
export const cancelTask = (id: string) => api.post<{ task: ExportTask; message: string }>(`/exports/tasks/${id}/cancel`).then(r => r.data);
export const retryTask = (id: string) => api.post<{ task: ExportTask; message: string }>(`/exports/tasks/${id}/retry`).then(r => r.data);
export const runReaper = () => api.post<{ released: number; message: string }>('/exports/reaper/run').then(r => r.data);
export const listLedger = () => api.get<LedgerEntry[]>('/exports/ledger').then(r => r.data);
export const downloadArtifact = async (id: string, fileName: string) => {
  const response = await api.get(`/artifacts/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const simulateWorkerLostApi = (id: string) =>
  api.post<{ task: ExportTask; message: string }>(`/exports/tasks/${id}/simulate-lost`).then(r => r.data);
