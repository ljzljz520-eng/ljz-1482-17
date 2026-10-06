export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type TaskStatus = "QUEUED" | "RUNNING" | "CANCELLING" | "SUCCEEDED" | "FAILED" | "CANCELED";
export type TaskScenario = "NORMAL" | "FAIL_ONCE" | "CANCEL_RACE" | "WORKER_LOST" | "STORAGE_FULL";
export type FollowMode = "PINNED" | "FOLLOWING";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  exportQuota: number;
  storageLimit: number;
  storageUsed: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenant: Tenant;
}

export interface AccountOverview {
  account: {
    availableBalance: number;
    heldAmount: number;
    consumedTotal: number;
    actualQuota: number;
    exportableNow: number;
  };
  storage: { used: number; limit: number; available: number };
  stats: { projects: number; favorites: number; openTasks: number };
  openTasks: Array<{
    id: string;
    projectName?: string;
    status: TaskStatus;
    estimatedUnits: number;
    updatedAt: string;
  }>;
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  content: string;
  deleted: boolean;
  templateSnapshot: string;
  updatedAt: string;
  createdAt: string;
  lastVisit?: VisitCursor | null;
}

export interface VisitCursor {
  projectId: string;
  cursor: string;
  content: string;
  visitedAt: string;
}

export interface TemplateVersion {
  id: string;
  version: string;
  changelog: string;
  publishedAt: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  deleted: boolean;
  versions: TemplateVersion[];
  favorite: {
    mode: FollowMode;
    pinnedVersionId: string | null;
    effectiveVersion: TemplateVersion | null;
  } | null;
}

export interface ExportTask {
  id: string;
  projectId: string;
  requestedById: string;
  projectName?: string;
  status: TaskStatus;
  scenario: TaskScenario;
  estimatedUnits: number;
  actualUnits: number | null;
  attempt: number;
  resultName: string | null;
  resultUrl: string | null;
  resultBytes: number | null;
  failureReason: string | null;
  workerId: string | null;
  cancelRequestedAt: string | null;
  leasedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  taskId: string | null;
  type: "RESERVE" | "SETTLE" | "RELEASE";
  amount: number;
  heldDelta: number;
  balanceAfter: number;
  heldAfter: number;
  note: string;
  createdAt: string;
}
