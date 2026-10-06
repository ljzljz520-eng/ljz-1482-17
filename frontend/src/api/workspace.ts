import { api } from "./client";
import type {
  AccountOverview,
  ExportTask,
  FollowMode,
  LedgerEntry,
  Project,
  Template,
  VisitCursor
} from "@/types/domain";

async function unwrap<T>(promise: Promise<{ data: T }>) {
  const { data } = await promise;
  return data;
}

export const workspaceApi = {
  overview: () => unwrap(api.get<AccountOverview>("/account/overview")),
  ledger: () => unwrap(api.get<{ entries: LedgerEntry[] }>("/account/ledger")),
  projects: () => unwrap(api.get<{ projects: Project[] }>("/projects")),
  openProject: (id: string) =>
    unwrap(api.get<{ project: Project; cloudCursor: VisitCursor | null; hint: string }>(`/projects/${id}/open`)),
  saveCursor: (id: string, payload: { cursor: string; content: string }) =>
    unwrap(api.put<{ visit: VisitCursor }>(`/projects/${id}/cursor`, payload)),
  updateProject: (id: string, payload: Partial<Pick<Project, "name" | "summary" | "content">>) =>
    unwrap(api.patch<{ project: Project }>(`/projects/${id}`, payload)),
  createProject: (payload: { name: string; summary: string; templateId?: string }) =>
    unwrap(api.post<{ project: Project }>("/projects", payload)),
  deleteProject: (id: string) => unwrap(api.delete<{ message: string }>(`/projects/${id}`)),
  templates: () => unwrap(api.get<{ templates: Template[] }>("/templates")),
  favoriteTemplate: (payload: { templateId: string; mode: FollowMode; pinnedVersionId?: string }) =>
    unwrap(api.put("/templates/favorite", payload)),
  publishTemplate: (id: string, payload: { version: string; changelog: string }) =>
    unwrap(api.post(`/templates/${id}/publish`, payload)),
  deleteTemplate: (id: string) => unwrap(api.delete<{ message: string }>(`/templates/${id}`)),
  exports: () => unwrap(api.get<{ tasks: ExportTask[] }>("/exports")),
  createExport: (payload: {
    projectId: string;
    estimatedUnits: number;
    scenario: ExportTask["scenario"];
    clientRequestId: string;
  }) => unwrap(api.post<{ task: ExportTask }>("/exports", payload)),
  cancelExport: (id: string) => unwrap(api.post<{ task: ExportTask; message: string }>(`/exports/${id}/cancel`)),
  retryExport: (id: string) => unwrap(api.post<{ task: ExportTask; message: string }>(`/exports/${id}/retry`)),
  leaveTeam: () => unwrap(api.post<{ message: string }>("/auth/leave-team"))
};
