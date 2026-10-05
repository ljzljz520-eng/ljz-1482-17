export interface User { id: string; email: string; name: string; tenantId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }
export interface Tenant { id: string; name: string; balance: number; storageUsed: number; storageQuota: number; reservedUnits: number; availableUnits: number; memberCount: number; openTaskCount: number }
export interface TemplateVersion { id: string; version: number; body: string; changeNote: string; createdAt: string }
export interface Favorite {
  id: string; templateId: string; mode: 'PINNED' | 'FOLLOW_LATEST'; versionId: string | null;
  template: { id: string; name: string; description: string; isDeleted: boolean; currentVersion: number; versions: TemplateVersion[] };
  version?: TemplateVersion | null
}
export interface Template {
  id: string; name: string; description: string; isDeleted: boolean; currentVersion: number;
  versions: TemplateVersion[]; favorites: Favorite[]
}
export interface ProjectCursor { id: string; deviceId: string; data: string; updatedAt: string }
export interface Project {
  id: string; name: string; sourceTemplate?: { id: string; name: string; isDeleted: boolean } | null;
  sourceVersion?: { id: string; version: number } | null; sourceSnapshot?: string | null;
  cursors: ProjectCursor[]; tasks: Array<{ id: string; status: string; estimatedUnits: number }>
}
export interface Artifact { id: string; fileName: string; sizeBytes: number; createdAt: string }
export interface ExportTask {
  id: string; projectId: string; idempotencyKey: string; status: 'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'|'CANCELLED'|'EXPIRED'|'ORPHANED';
  estimatedUnits: number; artifactSize?: number | null; reservedUnits: number; actualUnits?: number | null; failureMode?: string | null;
  cancelRequestedAt?: string | null; leaseToken: number; leasedBy?: string | null; leaseExpiresAt?: string | null;
  createdAt: string; finalizedAt?: string | null; project?: { name: string }; artifacts: Artifact[]
}
export interface LedgerEntry {
  id: string; kind: 'CREDIT'|'RESERVE'|'CONSUME'|'RELEASE'|'COMPENSATE'; units: number; amount: number;
  reservationDelta: number; storageDelta: number; balanceAfter: number; note: string; createdAt: string;
  task?: { id: string; project: { name: string } } | null
}
