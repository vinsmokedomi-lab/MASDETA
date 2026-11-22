import { KpmFormValues, ValidationStatus } from '../types/kpm';

export type OfflineQueuedAction =
  | {
      id: string;
      createdAt: string;
      kind: 'save_kpm';
      label: string;
      clientRecordId?: string;
      editingRecordId?: string;
      values: KpmFormValues;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'update_status';
      label: string;
      kpmId: string;
      status: ValidationStatus;
      targetProposalId?: string;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'toggle_subitem';
      label: string;
      kpmId: string;
      subItemKey: string;
      subItemName: string;
      delivered: boolean;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'upload_doc';
      label: string;
      kpmId: string;
      category: 'ktp' | 'kk' | 'penerima' | 'survey' | 'rumah' | 'lainnya';
      slotLabel: string;
      fileBlob: Blob;
      fileName: string;
      mimeType: string;
    };

const DB_NAME = 'masdeta_offline_queue_v1';
const STORE_NAME = 'actions';
const FALLBACK_KEY = 'masdeta_offline_queue_fallback_v1';

let queueDbPromise: Promise<IDBDatabase | null> | null = null;

function openQueueDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (queueDbPromise) return queueDbPromise;

  queueDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          queueDbPromise = null;
        };
        db.onclose = () => {
          queueDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        queueDbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        queueDbPromise = null;
        resolve(null);
      };
    } catch {
      queueDbPromise = null;
      resolve(null);
    }
  });

  return queueDbPromise;
}

function readFallbackQueue(): OfflineQueuedAction[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueuedAction[]) : [];
  } catch {
    return [];
  }
}

export async function getOfflineQueue(): Promise<OfflineQueuedAction[]> {
  const db = await openQueueDb();
  if (!db) {
    return readFallbackQueue();
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as OfflineQueuedAction[];
        rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(rows);
      };
      req.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      queueDbPromise = null;
      resolve([]);
    }
  });
}

export async function enqueueOfflineAction(action: OfflineQueuedAction): Promise<void> {
  const db = await openQueueDb();
  if (!db) {
    try {
      const curr = readFallbackQueue();
      const serializable = action.kind === 'upload_doc' ? null : action;
      if (serializable) {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify([...curr, serializable]));
      }
    } catch {
      // ignore fallback quota failure
    }
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      queueDbPromise = null;
      resolve();
    }
  });
}

export async function removeOfflineAction(id: string): Promise<void> {
  const db = await openQueueDb();
  if (!db) {
    try {
      const curr = readFallbackQueue();
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(curr.filter((a) => a.id !== id)));
    } catch {
      // ignore
    }
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      queueDbPromise = null;
      resolve();
    }
  });
}
