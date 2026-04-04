// IndexedDB cache for menu images — no size limit, persists across sessions
const DB_NAME = 'actImgCache';
const STORE   = 'images';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function imgCacheGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function imgCacheSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // ignore — IndexedDB not available
  }
}

export async function imgCacheDel(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
    });
  } catch { /* ignore */ }
}

// Load all cached images at once (used on startup)
export async function imgCacheGetAll(): Promise<Record<string, string>> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const result: Record<string, string> = {};
      const tx      = db.transaction(STORE, 'readonly');
      const cursor  = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = (e) => {
        const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (c) { result[c.key as string] = c.value as string; c.continue(); }
        else resolve(result);
      };
      cursor.onerror = () => resolve(result);
    });
  } catch {
    return {};
  }
}
