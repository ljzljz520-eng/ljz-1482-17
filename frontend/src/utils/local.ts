const DEVICE_KEY = 'usercenter.deviceId';
const DRAFT_PREFIX = 'usercenter.draft.';
const CURSOR_PREFIX = 'usercenter.pendingCursor.';

export const getDeviceId = () => {
  const current = localStorage.getItem(DEVICE_KEY);
  if (current) return current;
  const created = `${navigator.platform || 'device'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(DEVICE_KEY, created);
  return created;
};

export const draftKey = (projectId: string) => `${DRAFT_PREFIX}${projectId}`;
export const cursorKey = (projectId: string) => `${CURSOR_PREFIX}${projectId}`;
const INTENT_PREFIX = 'usercenter.exportIntent.';
export const exportIntentKey = (projectId: string) => `${INTENT_PREFIX}${projectId}`;
export const readExportIntent = (projectId: string) => localStorage.getItem(exportIntentKey(projectId));
export const writeExportIntent = (projectId: string, value: string) => localStorage.setItem(exportIntentKey(projectId), value);
export const clearExportIntent = (projectId: string) => localStorage.removeItem(exportIntentKey(projectId));

export const readDraft = (projectId: string) => localStorage.getItem(draftKey(projectId)) ?? '';
export const writeDraft = (projectId: string, value: string) => localStorage.setItem(draftKey(projectId), value);
export const clearLocalWorkspace = () => {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('usercenter.')) localStorage.removeItem(key);
  });
};
