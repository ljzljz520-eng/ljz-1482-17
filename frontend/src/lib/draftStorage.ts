const PREFIX = "user-center:draft:";
const LOCAL_DATA_KEY = "user-center:local-data-v1";

export function readDraft(projectId: string) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${projectId}`);
    return raw ? (JSON.parse(raw) as { content: string; cursor: string; updatedAt: string }) : null;
  } catch {
    return null;
  }
}

export function writeDraft(projectId: string, draft: { content: string; cursor: string }) {
  localStorage.setItem(
    `${PREFIX}${projectId}`,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
  );
}

export function clearAllLocalData() {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("user-center:")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(LOCAL_DATA_KEY, new Date().toISOString());
}
