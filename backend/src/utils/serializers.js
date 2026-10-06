const numberOrZero = (value) => Number(value || 0);

export const serializeTenant = (tenant) => ({
  id: tenant.id,
  name: tenant.name,
  slug: tenant.slug,
  exportQuota: tenant.exportQuota,
  storageLimit: numberOrZero(tenant.storageLimit),
  storageUsed: numberOrZero(tenant.storageUsed)
});

export const serializeUser = (user, membership) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  tenant: membership ? serializeTenant(membership.tenant) : null,
  role: membership?.role || null
});

export const serializeAccount = (account, tenant) => ({
  availableBalance: account.availableBalance,
  heldAmount: account.heldAmount,
  consumedTotal: account.consumedTotal,
  actualQuota: tenant.exportQuota,
  exportableNow: Math.min(account.availableBalance, Math.max(tenant.exportQuota - account.consumedTotal, 0))
});

export const serializeTemplateVersion = (version) => ({
  id: version.id,
  version: version.version,
  changelog: version.changelog,
  publishedAt: version.publishedAt
});

const sortVersionsDesc = (versions = []) =>
  [...versions].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

export const serializeTemplate = (template, favorite = null) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  deleted: Boolean(template.deletedAt),
  versions: sortVersionsDesc(template.versions).map(serializeTemplateVersion),
  favorite: favorite
    ? {
        mode: favorite.mode,
        pinnedVersionId: favorite.pinnedVersionId,
        effectiveVersion: resolveFavoriteVersion(template, favorite)
      }
    : null
});

export function resolveFavoriteVersion(template, favorite) {
  const versions = sortVersionsDesc(template.versions);
  if (favorite?.mode === "PINNED" && favorite.pinnedVersionId) {
    return versions.find((version) => version.id === favorite.pinnedVersionId) || versions[0] || null;
  }
  return versions[0] || null;
}

export const serializeProject = (project) => ({
  id: project.id,
  name: project.name,
  summary: project.summary,
  content: project.content,
  deleted: Boolean(project.deletedAt),
  templateSnapshot: project.templateSnapshot,
  updatedAt: project.updatedAt,
  createdAt: project.createdAt
});

export const serializeVisit = (visit) => ({
  projectId: visit.projectId,
  cursor: visit.cursor,
  content: visit.content,
  visitedAt: visit.visitedAt
});

export const serializeTask = (task) => ({
  id: task.id,
  projectId: task.projectId,
  requestedById: task.requestedById,
  projectName: task.project?.name,
  status: task.status,
  scenario: task.scenario,
  estimatedUnits: task.estimatedUnits,
  actualUnits: task.actualUnits,
  attempt: task.attempt,
  resultName: task.resultName,
  resultUrl: task.resultUrl,
  resultBytes: task.resultBytes ? Number(task.resultBytes) : null,
  failureReason: task.failureReason,
  workerId: task.workerId,
  cancelRequestedAt: task.cancelRequestedAt,
  leasedAt: task.leasedAt,
  lastHeartbeatAt: task.lastHeartbeatAt,
  completedAt: task.completedAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt
});

export const serializeLedger = (ledger) => ({
  id: ledger.id,
  taskId: ledger.taskId,
  type: ledger.type,
  amount: ledger.amount,
  heldDelta: ledger.heldDelta,
  balanceAfter: ledger.balanceAfter,
  heldAfter: ledger.heldAfter,
  note: ledger.note,
  createdAt: ledger.createdAt
});
