import {
  DirectChatMessage,
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmRecord,
  PengelolaProfile,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  WilayahKabKota,
} from '../types/kpm';

const IDB_NAME = 'masdeta_offline_db';
const IDB_VERSION = 1;
const STORE_NAME = 'operational_state';

export type OperationalStoreKey =
  | 'records'
  | 'proposals'
  | 'items'
  | 'pengelolaList'
  | 'pekerjaanList'
  | 'wilayahList'
  | 'proposalHistory'
  | 'kpmAuditLogs'
  | 'internalUsers'
  | 'customYears'
  | 'directMessages';

export interface OperationalIdbSnapshot {
  records?: KpmRecord[];
  proposals?: ProposalRecord[];
  items?: ItemBantuan[];
  pengelolaList?: PengelolaProfile[];
  pekerjaanList?: string[];
  wilayahList?: WilayahKabKota[];
  proposalHistory?: ProposalKpmHistoryEntry[];
  kpmAuditLogs?: KpmAuditLogEntry[];
  internalUsers?: InternalUser[];
  customYears?: string[];
  directMessages?: DirectChatMessage[];
}

const ALL_KEYS: OperationalStoreKey[] = [
  'records',
  'proposals',
  'items',
  'pengelolaList',
  'pekerjaanList',
  'wilayahList',
  'proposalHistory',
  'kpmAuditLogs',
  'internalUsers',
  'customYears',
  'directMessages',
];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      request.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

export async function saveIdbValue<K extends OperationalStoreKey>(
  key: K,
  value: NonNullable<OperationalIdbSnapshot[K]>
): Promise<boolean> {
  const db = await openOfflineDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      dbPromise = null;
      resolve(false);
    }
  });
}

export async function loadIdbSnapshot(): Promise<OperationalIdbSnapshot> {
  const db = await openOfflineDb();
  if (!db) return {};

  return new Promise((resolve) => {
    let settled = false;
    const finish = (snap: OperationalIdbSnapshot) => {
      if (settled) return;
      settled = true;
      resolve(snap);
    };

    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const snapshot: OperationalIdbSnapshot = {};
      let remaining = ALL_KEYS.length;

      for (const key of ALL_KEYS) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (Array.isArray(req.result)) {
            (snapshot as Record<string, unknown>)[key] = req.result;
          }
          remaining -= 1;
          if (remaining === 0) finish(snapshot);
        };
        req.onerror = () => {
          remaining -= 1;
          if (remaining === 0) finish(snapshot);
        };
      }

      tx.onerror = () => finish(snapshot);
      tx.onabort = () => finish(snapshot);
    } catch {
      dbPromise = null;
      finish({});
    }
  });
}
