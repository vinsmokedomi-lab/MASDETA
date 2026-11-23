import { Directory, Filesystem } from '@capacitor/filesystem';
import { KpmDocumentFile, SingleDocumentKey } from '../types/kpm';
import { isNativeAppPlatform } from './platform';
import {
  inferImageMimeType,
  isImageFileLike,
  uploadImageDocumentToDrive,
} from './imageProcessor';

export type PhotoDocCategory = SingleDocumentKey | 'rumah' | 'lainnya';
export type PhotoUploadJobStatus = 'queued' | 'uploading' | 'failed';
export type PhotoCaptureSource = 'camera' | 'file';

export const LOCAL_PENDING_URL_PREFIX = 'local-pending://';
const PHOTO_VAULT_DB_NAME = 'masdeta_photo_vault_v1';
const PHOTO_VAULT_STORE = 'jobs';
const PHOTO_VAULT_CACHE_NAME = 'masdeta-photo-vault-bytes-v1';
const AUTO_SAVE_GALLERY_KEY = 'masdeta_auto_save_gallery_v1';
const MAX_CONCURRENT_UPLOADS = 2;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.84;
const SKIP_REENCODE_SIZE_BYTES = 450 * 1024;
const MIN_GALLERY_FREE_BYTES = 35 * 1024 * 1024; // 35 MB safety headroom

export interface PhotoUploadJob {
  id: string;
  kpmId?: string;
  formDraftId?: string;
  kpmName: string;
  category: PhotoDocCategory;
  slotLabel: string;
  existingDoc?: KpmDocumentFile;
  supersededByJobId?: string;
  /** Primary durable binary buffer (WebKit/iOS Safari NEVER corrupts ArrayBuffer in IDB, unlike Blob) */
  bytes?: ArrayBuffer;
  /** Legacy v1 field only — never persisted for new jobs */
  blob?: Blob;
  corrupted?: boolean;
  previewThumbDataUrl?: string;
  fileName: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  status: PhotoUploadJobStatus;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  savedToGallery: boolean;
  galleryStatusNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoUploadJobSummary {
  id: string;
  kpmId?: string;
  formDraftId?: string;
  kpmName: string;
  category: PhotoDocCategory;
  slotLabel: string;
  existingDoc?: KpmDocumentFile;
  previewUrl: string;
  previewThumbUrl?: string;
  corrupted?: boolean;
  fileName: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  status: PhotoUploadJobStatus;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  savedToGallery: boolean;
  galleryStatusNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoUploadCompletedEvent {
  job: PhotoUploadJobSummary;
  uploadedDoc: KpmDocumentFile;
}

export interface SaveToGalleryResult {
  ok: boolean;
  note: string;
  fallbackPreviewDataUrl?: string;
}

type JobsListener = (jobs: PhotoUploadJobSummary[]) => void;
type CompletedListener = (event: PhotoUploadCompletedEvent) => Promise<void> | void;
type CancelledListener = (job: PhotoUploadJobSummary) => void;

const jobsMap = new Map<string, PhotoUploadJob>();
const objectUrlMap = new Map<string, string>();
const jobsListeners = new Set<JobsListener>();
const completedListeners = new Set<CompletedListener>();
const cancelledListeners = new Set<CancelledListener>();
const activeUploadIds = new Set<string>();
const recentlyCompletedDrafts = new Map<string, PhotoUploadCompletedEvent[]>();
const completedByJobId = new Map<string, KpmDocumentFile>();

let vaultDbPromise: Promise<IDBDatabase | null> | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let retryTimerId: number | null = null;
let beforeUnloadBound = false;

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ||
    navigator.platform ||
    '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === 'MacIntel' &&
      typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 1)
  );
}

export function isLocalPendingDocument(doc?: KpmDocumentFile | null): boolean {
  if (!doc) return false;
  const u = (doc.directUrl || doc.dataUrl || '').trim();
  return u.startsWith(LOCAL_PENDING_URL_PREFIX) || doc.id.startsWith('pjob-');
}

export function extractPendingJobId(doc?: KpmDocumentFile | null): string {
  if (!doc) return '';
  const u = (doc.directUrl || doc.dataUrl || '').trim();
  if (u.startsWith(LOCAL_PENDING_URL_PREFIX)) {
    return u.slice(LOCAL_PENDING_URL_PREFIX.length);
  }
  if (doc.id.startsWith('pjob-')) return doc.id;
  return '';
}

export function getAutoSaveGallerySetting(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_GALLERY_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setAutoSaveGallerySetting(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_GALLERY_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
  notifyJobsListeners();
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(''));
}

function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType || 'image/jpeg'};base64,${uint8ArrayToBase64(bytes)}`;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const b64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out.buffer;
  } catch {
    return null;
  }
}

function normalizeStoredBytes(raw: unknown): ArrayBuffer | undefined {
  if (!raw) return undefined;
  if (raw instanceof ArrayBuffer) {
    return raw.byteLength > 0 ? raw : undefined;
  }
  if (ArrayBuffer.isView(raw)) {
    const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    if (view.byteLength === 0) return undefined;
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  }
  return undefined;
}

async function blobToArrayBufferSafe(blob: Blob): Promise<ArrayBuffer | null> {
  if (!blob) return null;
  if (typeof blob.arrayBuffer === 'function') {
    try {
      const buf = await blob.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } catch {
      // Fallback to FileReader below
    }
  }
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer && reader.result.byteLength > 0) {
          resolve(reader.result);
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(blob);
    } catch {
      resolve(null);
    }
  });
}

function openPhotoVaultDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (vaultDbPromise) return vaultDbPromise;

  vaultDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(PHOTO_VAULT_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_VAULT_STORE)) {
          db.createObjectStore(PHOTO_VAULT_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          vaultDbPromise = null;
        };
        db.onclose = () => {
          vaultDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        vaultDbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        vaultDbPromise = null;
        resolve(null);
      };
    } catch {
      vaultDbPromise = null;
      resolve(null);
    }
  });

  return vaultDbPromise;
}

async function putCacheApiBackup(jobId: string, bytes: ArrayBuffer, mimeType: string): Promise<boolean> {
  if (typeof caches === 'undefined' || !bytes || bytes.byteLength === 0) return false;
  try {
    const cache = await caches.open(PHOTO_VAULT_CACHE_NAME);
    const req = new Request(`/__masdeta_vault__/${encodeURIComponent(jobId)}`);
    await cache.put(
      req,
      new Response(bytes.slice(0), {
        headers: { 'Content-Type': mimeType || 'image/jpeg' },
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function getCacheApiBackup(jobId: string): Promise<ArrayBuffer | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(PHOTO_VAULT_CACHE_NAME);
    const res = await cache.match(`/__masdeta_vault__/${encodeURIComponent(jobId)}`);
    if (!res) return null;
    const buf = await res.arrayBuffer();
    return buf && buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function deleteCacheApiBackup(jobId: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PHOTO_VAULT_CACHE_NAME);
    await cache.delete(`/__masdeta_vault__/${encodeURIComponent(jobId)}`);
  } catch {
    // ignore
  }
}

async function readAllVaultJobsFromDb(): Promise<PhotoUploadJob[]> {
  const db = await openPhotoVaultDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTO_VAULT_STORE, 'readonly');
      const req = tx.objectStore(PHOTO_VAULT_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as PhotoUploadJob[];
        resolve(rows);
      };
      req.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      vaultDbPromise = null;
      resolve([]);
    }
  });
}

function buildPersistableRecord(job: PhotoUploadJob, includeThumb = true): PhotoUploadJob {
  const copy: PhotoUploadJob = {
    ...job,
    blob: undefined, // NEVER persist Blob in IDB — avoids WebKit/iOS Safari IDB Blob corruption
    ...(includeThumb ? {} : { previewThumbDataUrl: undefined }),
  };
  delete copy.blob;
  return copy;
}

async function putVaultJobToDb(job: PhotoUploadJob): Promise<boolean> {
  const cacheOk =
    job.bytes && job.bytes.byteLength > 0
      ? await putCacheApiBackup(job.id, job.bytes, job.mimeType)
      : false;

  const db = await openPhotoVaultDb();
  if (!db) return cacheOk;

  const writeAttempt = (payload: PhotoUploadJob): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(PHOTO_VAULT_STORE, 'readwrite');
        tx.objectStore(PHOTO_VAULT_STORE).put(payload);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        vaultDbPromise = null;
        resolve(false);
      }
    });

  let idbOk = await writeAttempt(buildPersistableRecord(job, true));
  if (!idbOk) {
    idbOk = await writeAttempt(buildPersistableRecord(job, false));
  }
  return idbOk || cacheOk;
}

async function deleteVaultJobFromDb(jobId: string): Promise<void> {
  await deleteCacheApiBackup(jobId);
  const db = await openPhotoVaultDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(PHOTO_VAULT_STORE, 'readwrite');
      tx.objectStore(PHOTO_VAULT_STORE).delete(jobId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      vaultDbPromise = null;
      resolve();
    }
  });
}

function getOrCreateObjectUrl(job: PhotoUploadJob): string {
  if (job.corrupted || !job.bytes || job.bytes.byteLength === 0) {
    return job.previewThumbDataUrl || '';
  }
  const existing = objectUrlMap.get(job.id);
  if (existing) return existing;
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const liveBlob = new Blob([job.bytes], { type: job.mimeType || 'image/jpeg' });
      const url = URL.createObjectURL(liveBlob);
      objectUrlMap.set(job.id, url);
      return url;
    }
  } catch {
    // ignore
  }
  return job.previewThumbDataUrl || '';
}

function revokeObjectUrl(jobId: string): void {
  const existing = objectUrlMap.get(jobId);
  if (!existing) return;
  objectUrlMap.delete(jobId);
  try {
    if (existing.startsWith('blob:')) {
      URL.revokeObjectURL(existing);
    }
  } catch {
    // ignore
  }
}

function toSummary(job: PhotoUploadJob): PhotoUploadJobSummary {
  const objUrl = getOrCreateObjectUrl(job);
  return {
    id: job.id,
    kpmId: job.kpmId,
    formDraftId: job.formDraftId,
    kpmName: job.kpmName,
    category: job.category,
    slotLabel: job.slotLabel,
    existingDoc: job.existingDoc,
    previewUrl: objUrl || job.previewThumbDataUrl || '',
    previewThumbUrl: job.previewThumbDataUrl,
    corrupted: job.corrupted,
    fileName: job.fileName,
    mimeType: job.mimeType,
    originalSize: job.originalSize,
    compressedSize: job.compressedSize,
    width: job.width,
    height: job.height,
    status: job.status,
    attempts: job.attempts,
    nextRetryAt: job.nextRetryAt,
    lastError: job.lastError,
    savedToGallery: job.savedToGallery,
    galleryStatusNote: job.galleryStatusNote,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function getPendingPhotoUploadJobs(): PhotoUploadJobSummary[] {
  return Array.from(jobsMap.values())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toSummary);
}

export function getPendingPhotoObjectUrl(jobId: string): string {
  if (!jobId) return '';
  const cached = objectUrlMap.get(jobId);
  if (cached) return cached;
  const job = jobsMap.get(jobId);
  if (!job) return '';
  return getOrCreateObjectUrl(job);
}

export async function ensurePendingPhotoObjectUrl(jobId: string): Promise<string> {
  if (!jobId) return '';
  const direct = getPendingPhotoObjectUrl(jobId);
  if (direct) return direct;
  await initPhotoUploadManager();
  return getPendingPhotoObjectUrl(jobId);
}

export async function getPendingPhotoFile(jobId: string): Promise<File | null> {
  if (!jobId) return null;
  await initPhotoUploadManager();
  const job = jobsMap.get(jobId);
  if (!job || job.corrupted || !job.bytes || job.bytes.byteLength === 0) return null;
  try {
    return new File([job.bytes], job.fileName, {
      type: job.mimeType || 'image/jpeg',
    });
  } catch {
    return null;
  }
}

export function getExistingDriveFallbackDoc(
  kpmId: string | undefined,
  category: PhotoDocCategory
): KpmDocumentFile | undefined {
  if (!kpmId) return undefined;
  for (const job of jobsMap.values()) {
    if (job.kpmId === kpmId && job.category === category && job.existingDoc) {
      return job.existingDoc;
    }
  }
  return undefined;
}

export function buildLocalPendingDocumentFile(
  job: Partial<Pick<PhotoUploadJob, 'previewThumbDataUrl'>> &
    Pick<
      PhotoUploadJob,
      | 'id'
      | 'fileName'
      | 'originalSize'
      | 'compressedSize'
      | 'width'
      | 'height'
      | 'mimeType'
      | 'createdAt'
    > & { previewUrl?: string; previewThumbUrl?: string }
): KpmDocumentFile {
  const thumbFallback =
    job.previewThumbDataUrl ||
    job.previewThumbUrl ||
    (job.previewUrl && !job.previewUrl.startsWith('blob:') ? job.previewUrl : '') ||
    `${LOCAL_PENDING_URL_PREFIX}${job.id}`;
  return {
    id: job.id,
    dataUrl: `${LOCAL_PENDING_URL_PREFIX}${job.id}`,
    directUrl: `${LOCAL_PENDING_URL_PREFIX}${job.id}`,
    thumbnailUrl: thumbFallback,
    fileName: job.fileName,
    originalSize: job.originalSize,
    compressedSize: job.compressedSize,
    width: job.width,
    height: job.height,
    mimeType: job.mimeType,
    uploadedAt: job.createdAt,
  };
}

function notifyJobsListeners(): void {
  const snapshot = getPendingPhotoUploadJobs();
  jobsListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribePhotoUploadJobs(listener: JobsListener): () => void {
  jobsListeners.add(listener);
  listener(getPendingPhotoUploadJobs());
  return () => {
    jobsListeners.delete(listener);
  };
}

export function subscribePhotoUploadCompleted(listener: CompletedListener): () => void {
  completedListeners.add(listener);
  return () => {
    completedListeners.delete(listener);
  };
}

export function subscribePhotoUploadCancelled(listener: CancelledListener): () => void {
  cancelledListeners.add(listener);
  return () => {
    cancelledListeners.delete(listener);
  };
}

export function getCompletedUploadForJob(jobId: string): KpmDocumentFile | undefined {
  if (!jobId) return undefined;
  return completedByJobId.get(jobId);
}

function requestPersistentStorageBestEffort(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {});
    }
  } catch {
    // ignore
  }
}

async function checkStorageHeadroomForGallery(requiredBytes: number): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const quota = est.quota ?? 0;
      const usage = est.usage ?? 0;
      if (quota > 0) {
        const free = quota - usage;
        const usedRatio = usage / quota;
        if (free < Math.max(requiredBytes * 6, MIN_GALLERY_FREE_BYTES) || usedRatio >= 0.92) {
          return {
            ok: false,
            reason:
              'Memori perangkat penuh/hampir habis — dilewati dari Galeri, disimpan aman di cache browser.',
          };
        }
      }
    }
  } catch {
    // Ignore estimate failure and allow best-effort save
  }
  return { ok: true };
}

function sanitizeFileSegment(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

function buildFriendlyPhotoFileName(
  kpmName: string,
  slotLabel: string,
  originalName: string,
  mimeType: string
): string {
  const safeKpm = sanitizeFileSegment(kpmName) || 'KPM';
  const safeSlot = sanitizeFileSegment(slotLabel.replace(/^Foto\s+/i, '')) || 'Foto';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext =
    mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
          ? 'webp'
          : originalName.toLowerCase().endsWith('.png')
            ? 'png'
            : 'jpg';
  return `MASDETA_${safeKpm}_${safeSlot}_${stamp}.${ext}`;
}

function triggerDesktopOrAndroidWebDownload(
  bytes: ArrayBuffer,
  mimeType: string,
  fileName: string
): boolean {
  // NEVER call <a href="blob:..." download> on iOS Safari / WebKit mobile — it triggers WebKitBlobResource error 1
  if (isIosBrowser()) return false;
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  let tempUrl = '';
  try {
    const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' });
    tempUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = tempUrl;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch {
        // ignore
      }
      try {
        URL.revokeObjectURL(tempUrl);
      } catch {
        // ignore
      }
    }, 60_000);
    return true;
  } catch {
    if (tempUrl) {
      try {
        URL.revokeObjectURL(tempUrl);
      } catch {
        // ignore
      }
    }
    return false;
  }
}

async function trySavePhotoToDeviceGallery(
  bytes: ArrayBuffer,
  mimeType: string,
  fileName: string,
  source: PhotoCaptureSource
): Promise<{ savedToGallery: boolean; galleryStatusNote: string }> {
  if (source === 'file') {
    return {
      savedToGallery: false,
      galleryStatusNote: 'File dari perangkat · diamankan di brankas aplikasi hingga Drive selesai',
    };
  }

  if (!getAutoSaveGallerySetting()) {
    return {
      savedToGallery: false,
      galleryStatusNote: 'Simpan galeri nonaktif · diamankan di brankas browser hingga Drive selesai',
    };
  }

  const headroom = await checkStorageHeadroomForGallery(bytes.byteLength);
  if (!headroom.ok) {
    return {
      savedToGallery: false,
      galleryStatusNote:
        headroom.reason ||
        'Memori HP penuh — tidak disimpan ke galeri, disimpan aman di brankas browser hingga terunggah',
    };
  }

  if (isNativeAppPlatform()) {
    try {
      const base64Data = uint8ArrayToBase64(new Uint8Array(bytes));
      const targets: Array<{ directory: Directory; path: string; label: string }> = [
        {
          directory: Directory.ExternalStorage,
          path: `Pictures/MASDETA/${fileName}`,
          label: 'Tersimpan di Galeri (Pictures/MASDETA) & brankas aplikasi',
        },
        {
          directory: Directory.Documents,
          path: `MASDETA/Foto/${fileName}`,
          label: 'Tersimpan di Dokumen/MASDETA & brankas aplikasi',
        },
      ];
      for (const target of targets) {
        try {
          await Filesystem.writeFile({
            directory: target.directory,
            path: target.path,
            data: base64Data,
            recursive: true,
          });
          return { savedToGallery: true, galleryStatusNote: target.label };
        } catch {
          // Try next folder or fall back gracefully
        }
      }
      return {
        savedToGallery: false,
        galleryStatusNote:
          'Memori/izin penyimpanan terbatas — foto diamankan di brankas aplikasi hingga terunggah',
      };
    } catch {
      return {
        savedToGallery: false,
        galleryStatusNote:
          'Memori perangkat penuh — foto diamankan di brankas aplikasi hingga terunggah',
      };
    }
  }

  // On iOS Safari / WebKit mobile, automatic <a download> of a blob crashes Safari (WebKitBlobResource 1).
  // Keep photo safely in permanent IndexedDB ArrayBuffer + Cache Storage instead, and let user share-to-Photos on tap.
  if (isIosBrowser()) {
    return {
      savedToGallery: false,
      galleryStatusNote:
        'Diamankan permanen di brankas Safari iPhone (ketuk "Simpan Galeri" bila ingin salin ke Foto)',
    };
  }

  const triggered = triggerDesktopOrAndroidWebDownload(bytes, mimeType, fileName);
  return triggered
    ? {
        savedToGallery: true,
        galleryStatusNote: 'Salinan dikirim ke Unduhan/Galeri & diamankan di brankas browser',
      }
    : {
        savedToGallery: false,
        galleryStatusNote: 'Disimpan aman di brankas browser hingga berhasil diunggah ke Drive',
      };
}

export async function downloadPendingJobToGallery(jobId: string): Promise<SaveToGalleryResult> {
  // IMPORTANT for iOS Safari: capture live job synchronously BEFORE any await so navigator.share keeps user gesture!
  let job = jobsMap.get(jobId);
  if (!job) {
    await initPhotoUploadManager();
    job = jobsMap.get(jobId);
  }
  if (!job) {
    return { ok: false, note: 'Foto tidak ditemukan di antrean.' };
  }
  if (job.corrupted || !job.bytes || job.bytes.byteLength === 0) {
    return {
      ok: false,
      note: 'File foto lama ini sudah rusak oleh cache Safari iOS sebelum pembaruan.',
      fallbackPreviewDataUrl: job.previewThumbDataUrl,
    };
  }

  if (isNativeAppPlatform()) {
    try {
      const base64Data = uint8ArrayToBase64(new Uint8Array(job.bytes));
      await Filesystem.writeFile({
        directory: Directory.Documents,
        path: `MASDETA/Foto/${job.fileName}`,
        data: base64Data,
        recursive: true,
      });
      job.savedToGallery = true;
      job.galleryStatusNote = 'Tersimpan di Dokumen/MASDETA & brankas aplikasi';
      await putVaultJobToDb(job);
      notifyJobsListeners();
      return { ok: true, note: 'Foto disimpan ke folder MASDETA/Foto.' };
    } catch {
      return {
        ok: false,
        note: 'Memori/izin perangkat penuh. Foto tetap aman di brankas aplikasi.',
      };
    }
  }

  if (isIosBrowser()) {
    try {
      const shareFile = new File([job.bytes], job.fileName, {
        type: job.mimeType || 'image/jpeg',
      });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [shareFile] }))
      ) {
        await navigator.share({
          files: [shareFile],
          title: job.fileName,
        });
        job.savedToGallery = true;
        job.galleryStatusNote = 'Diteruskan ke Galeri Foto iPhone & tetap aman di brankas';
        await putVaultJobToDb(job);
        notifyJobsListeners();
        return {
          ok: true,
          note: 'Berhasil! Pilih "Simpan Gambar" di menu Bagikan iPhone untuk menyimpan ke Galeri.',
        };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          ok: false,
          note: 'Penyimpanan ke Foto iPhone dibatalkan. Foto tetap aman di brankas.',
        };
      }
      // Fall through to safe in-app data URL preview (never blob <a download> on iOS!)
    }

    return {
      ok: false,
      note: 'Tekan & tahan pratinjau foto lalu pilih "Simpan ke Foto" (Save Image).',
      fallbackPreviewDataUrl: uint8ArrayToDataUrl(
        new Uint8Array(job.bytes),
        job.mimeType || 'image/jpeg'
      ),
    };
  }

  const ok = triggerDesktopOrAndroidWebDownload(job.bytes, job.mimeType, job.fileName);
  if (ok) {
    job.savedToGallery = true;
    job.galleryStatusNote = 'Salinan dikirim ke Unduhan/Galeri & diamankan di brankas browser';
    await putVaultJobToDb(job);
    notifyJobsListeners();
    return { ok: true, note: 'Salinan foto berhasil diunduh ke perangkat.' };
  }

  return {
    ok: false,
    note: 'Gagal mengunduh otomatis, gunakan pratinjau manual.',
    fallbackPreviewDataUrl: uint8ArrayToDataUrl(
      new Uint8Array(job.bytes),
      job.mimeType || 'image/jpeg'
    ),
  };
}

function loadImageElementFromBytes(
  bytes: ArrayBuffer,
  mimeType: string
): Promise<{
  img: HTMLImageElement;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' });
    let objectUrl = '';
    let fallbackTried = false;

    const tryLoad = (src: string, isBlobUrl: boolean) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          img,
          cleanup: () => {
            img.onload = null;
            img.onerror = null;
            if (isBlobUrl && objectUrl) {
              try {
                URL.revokeObjectURL(objectUrl);
              } catch {
                // ignore
              }
            }
          },
        });
      };
      img.onerror = () => {
        img.onload = null;
        img.onerror = null;
        if (isBlobUrl && objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // ignore
          }
        }
        if (!fallbackTried) {
          fallbackTried = true;
          try {
            const dataUrl = uint8ArrayToDataUrl(new Uint8Array(bytes), mimeType || 'image/jpeg');
            tryLoad(dataUrl, false);
            return;
          } catch {
            // reject below
          }
        }
        reject(new Error('File gambar tidak valid atau rusak.'));
      };
      img.src = src;
    };

    try {
      objectUrl = URL.createObjectURL(blob);
      tryLoad(objectUrl, true);
    } catch {
      const dataUrl = uint8ArrayToDataUrl(new Uint8Array(bytes), mimeType || 'image/jpeg');
      tryLoad(dataUrl, false);
    }
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

async function encodeCanvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<ArrayBuffer | null> {
  const blob = await canvasToBlobAsync(canvas, 'image/jpeg', quality);
  if (blob) {
    const buf = await blobToArrayBufferSafe(blob);
    if (buf && buf.byteLength > 0) return buf;
  }
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrlToArrayBuffer(dataUrl);
  } catch {
    return null;
  }
}

async function preparePhotoForSafeUpload(
  file: File,
  friendlyName: string
): Promise<{
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  previewThumbDataUrl?: string;
}> {
  const rawBytes = await blobToArrayBufferSafe(file);
  if (!rawBytes || rawBytes.byteLength === 0) {
    throw new Error('Gagal membaca foto dari kamera/file perangkat. Silakan ambil foto ulang.');
  }

  const sourceMime = inferImageMimeType(file);
  if (!isImageFileLike(file)) {
    return {
      bytes: rawBytes,
      mimeType: file.type || 'application/octet-stream',
      fileName: friendlyName || file.name,
      width: 0,
      height: 0,
      originalSize: rawBytes.byteLength,
      compressedSize: rawBytes.byteLength,
    };
  }

  let loaded: { img: HTMLImageElement; cleanup: () => void } | null = null;
  try {
    loaded = await loadImageElementFromBytes(rawBytes, sourceMime);
  } catch {
    // Jika format gambar valid namun browser tidak bisa render (mis. HEIC di desktop Chrome),
    // tetap amankan file mentah agar tetap terkirim ke Google Drive.
    if (rawBytes.byteLength >= 64) {
      return {
        bytes: rawBytes,
        mimeType: sourceMime,
        fileName: friendlyName || file.name,
        width: 0,
        height: 0,
        originalSize: rawBytes.byteLength,
        compressedSize: rawBytes.byteLength,
      };
    }
    throw new Error('File gambar tidak valid atau rusak.');
  }

  const { img, cleanup } = loaded;
  try {
    const srcW = img.naturalWidth || img.width || 0;
    const srcH = img.naturalHeight || img.height || 0;

    // Generate tiny 180px thumbnail base64 string for guaranteed preview even across restarts
    let previewThumbDataUrl: string | undefined;
    if (srcW > 0 && srcH > 0) {
      try {
        const thumbScale = Math.min(1, 180 / Math.max(srcW, srcH));
        const tw = Math.max(1, Math.round(srcW * thumbScale));
        const th = Math.max(1, Math.round(srcH * thumbScale));
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tCtx = thumbCanvas.getContext('2d');
        if (tCtx) {
          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, tw, th);
          tCtx.drawImage(img, 0, 0, tw, th);
          previewThumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.65);
        }
      } catch {
        previewThumbDataUrl = undefined;
      }
    }

    const needsResize =
      Math.max(srcW, srcH) > MAX_IMAGE_EDGE || rawBytes.byteLength > SKIP_REENCODE_SIZE_BYTES;
    if (!needsResize || srcW === 0 || srcH === 0) {
      return {
        bytes: rawBytes,
        mimeType: sourceMime,
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: rawBytes.byteLength,
        compressedSize: rawBytes.byteLength,
        previewThumbDataUrl,
      };
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        bytes: rawBytes,
        mimeType: sourceMime,
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: rawBytes.byteLength,
        compressedSize: rawBytes.byteLength,
        previewThumbDataUrl,
      };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dstW, dstH);
    ctx.drawImage(img, 0, 0, dstW, dstH);

    let outBytes = await encodeCanvasToJpegBytes(canvas, JPEG_QUALITY);
    if (outBytes && outBytes.byteLength > 1_200_000) {
      const lighter = await encodeCanvasToJpegBytes(canvas, 0.74);
      if (lighter) outBytes = lighter;
    }

    if (
      !outBytes ||
      (outBytes.byteLength >= rawBytes.byteLength && Math.max(srcW, srcH) <= MAX_IMAGE_EDGE)
    ) {
      return {
        bytes: rawBytes,
        mimeType: sourceMime,
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: rawBytes.byteLength,
        compressedSize: rawBytes.byteLength,
        previewThumbDataUrl,
      };
    }

    const jpgName = friendlyName.replace(/\.(png|webp|heic|heif)$/i, '.jpg');
    return {
      bytes: outBytes,
      mimeType: 'image/jpeg',
      fileName: jpgName.endsWith('.jpg') || jpgName.endsWith('.jpeg') ? jpgName : `${jpgName}.jpg`,
      width: dstW,
      height: dstH,
      originalSize: rawBytes.byteLength,
      compressedSize: outBytes.byteLength,
      previewThumbDataUrl,
    };
  } finally {
    cleanup();
  }
}

function ensureGlobalLifecycleListeners(): void {
  if (typeof window === 'undefined' || beforeUnloadBound) return;
  beforeUnloadBound = true;

  window.addEventListener('beforeunload', (e) => {
    const activeJobs = Array.from(jobsMap.values()).filter((j) => !j.corrupted);
    if (activeJobs.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  window.addEventListener('online', () => {
    void processPhotoUploadQueue(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && jobsMap.size > 0) {
      void processPhotoUploadQueue(false);
    }
  });

  retryTimerId = window.setInterval(() => {
    if (jobsMap.size === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void processPhotoUploadQueue(false);
  }, 8000);
}

export async function initPhotoUploadManager(): Promise<PhotoUploadJobSummary[]> {
  ensureGlobalLifecycleListeners();
  if (initialized) {
    return getPendingPhotoUploadJobs();
  }
  if (!initPromise) {
    initPromise = (async () => {
      const stored = await readAllVaultJobsFromDb();
      const now = Date.now();
      for (const rawJob of stored) {
        if (!rawJob?.id) continue;

        let validBytes = normalizeStoredBytes(rawJob.bytes);
        if (!validBytes) {
          validBytes = (await getCacheApiBackup(rawJob.id)) ?? undefined;
        }
        // Migrate legacy v1 Blob if still readable; otherwise mark corrupted so it stops spinning 34x
        if (!validBytes && rawJob.blob) {
          const recovered = await blobToArrayBufferSafe(rawJob.blob);
          if (recovered && recovered.byteLength > 0) {
            validBytes = recovered;
          }
        }

        const isCorrupted = !validBytes || validBytes.byteLength === 0;
        const normalized: PhotoUploadJob = {
          ...rawJob,
          bytes: validBytes,
          blob: undefined,
          corrupted: isCorrupted,
          status: isCorrupted
            ? 'failed'
            : rawJob.status === 'uploading'
              ? 'queued'
              : rawJob.status,
          nextRetryAt: rawJob.status === 'uploading' ? now : rawJob.nextRetryAt || now,
          lastError: isCorrupted
            ? 'Foto lama ini terdampak bug cache Safari iOS sebelum pembaruan sehingga data file hilang. Foto ulang KPM ini lalu klik Hapus untuk membersihkan.'
            : rawJob.lastError,
        };

        // Immediately upgrade legacy readable v1 job in IDB to durable ArrayBuffer
        if (!isCorrupted && !rawJob.bytes) {
          void putVaultJobToDb(normalized);
        }

        jobsMap.set(normalized.id, normalized);
        getOrCreateObjectUrl(normalized);
      }
      initialized = true;
      notifyJobsListeners();
      if (jobsMap.size > 0 && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        void processPhotoUploadQueue(false);
      }
    })();
  }
  await initPromise;
  return getPendingPhotoUploadJobs();
}

export async function enqueuePhotoUploadJob(params: {
  file: File;
  kpmId?: string;
  formDraftId?: string;
  kpmName: string;
  category: PhotoDocCategory;
  slotLabel: string;
  existingDoc?: KpmDocumentFile;
  source: PhotoCaptureSource;
}): Promise<{ job: PhotoUploadJobSummary; pendingDoc: KpmDocumentFile }> {
  await initPhotoUploadManager();
  requestPersistentStorageBestEffort();

  const { file, kpmId, formDraftId, kpmName, category, slotLabel, existingDoc, source } = params;

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Ukuran file terlalu besar. Maksimal 15 MB per foto.');
  }
  if (!isImageFileLike(file)) {
    throw new Error('Format file harus berupa gambar (JPG, PNG, WebP, atau HEIC).');
  }

  const detectedMime = inferImageMimeType(file);
  const friendlyName = buildFriendlyPhotoFileName(
    kpmName,
    slotLabel,
    file.name,
    detectedMime
  );
  const prepared = await preparePhotoForSafeUpload(file, friendlyName);
  const galleryRes = await trySavePhotoToDeviceGallery(
    prepared.bytes,
    prepared.mimeType,
    prepared.fileName,
    source
  );

  // If replacing a single slot that already has a pending job, inherit its real Drive existingDoc & supersede/clean the older job
  let preservedExistingDoc =
    existingDoc && !isLocalPendingDocument(existingDoc) ? existingDoc : undefined;

  const nowIso = new Date().toISOString();
  const jobId = `pjob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (
    category === 'ktp' ||
    category === 'kk' ||
    category === 'penerima' ||
    category === 'survey'
  ) {
    for (const oldJob of Array.from(jobsMap.values())) {
      const sameOwner =
        (kpmId && oldJob.kpmId === kpmId) || (formDraftId && oldJob.formDraftId === formDraftId);
      if (sameOwner && oldJob.category === category) {
        if (!preservedExistingDoc && oldJob.existingDoc && !isLocalPendingDocument(oldJob.existingDoc)) {
          preservedExistingDoc = oldJob.existingDoc;
        }
        if (oldJob.status !== 'uploading') {
          jobsMap.delete(oldJob.id);
          revokeObjectUrl(oldJob.id);
          await deleteVaultJobFromDb(oldJob.id);
        } else {
          oldJob.supersededByJobId = jobId;
          void putVaultJobToDb(oldJob);
        }
      }
    }
  }

  const job: PhotoUploadJob = {
    id: jobId,
    kpmId,
    formDraftId,
    kpmName: kpmName.trim() || 'KPM',
    category,
    slotLabel,
    existingDoc: preservedExistingDoc,
    bytes: prepared.bytes,
    corrupted: false,
    previewThumbDataUrl: prepared.previewThumbDataUrl,
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    originalSize: prepared.originalSize,
    compressedSize: prepared.compressedSize,
    width: prepared.width,
    height: prepared.height,
    status: 'queued',
    attempts: 0,
    nextRetryAt: Date.now(),
    savedToGallery: galleryRes.savedToGallery,
    galleryStatusNote: galleryRes.galleryStatusNote,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Persist durable ArrayBuffer into IndexedDB + Cache API FIRST before returning to UI
  const persisted = await putVaultJobToDb(job);
  if (!persisted) {
    job.galleryStatusNote =
      'Memori penyimpanan browser penuh! Tetap buka halaman ini sampai foto selesai diunggah.';
  }
  jobsMap.set(job.id, job);
  getOrCreateObjectUrl(job);
  notifyJobsListeners();

  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    void processPhotoUploadQueue(false);
  }

  return {
    job: toSummary(job),
    pendingDoc: buildLocalPendingDocumentFile(job),
  };
}

export async function bindFormDraftJobsToKpm(
  formDraftId: string,
  kpmId: string,
  kpmName: string
): Promise<PhotoUploadCompletedEvent[]> {
  if (!formDraftId || !kpmId) return [];
  await initPhotoUploadManager();
  let changed = false;
  for (const job of jobsMap.values()) {
    if (job.formDraftId === formDraftId) {
      job.kpmId = kpmId;
      job.kpmName = kpmName.trim() || job.kpmName;
      job.formDraftId = undefined;
      job.updatedAt = new Date().toISOString();
      await putVaultJobToDb(job);
      changed = true;
    }
  }
  if (changed) {
    notifyJobsListeners();
  }
  const alreadyCompleted = recentlyCompletedDrafts.get(formDraftId) ?? [];
  if (alreadyCompleted.length > 0) {
    recentlyCompletedDrafts.delete(formDraftId);
  }
  return alreadyCompleted;
}

export async function cancelPendingPhotoUploadJob(jobId: string): Promise<void> {
  await initPhotoUploadManager();
  const existing = jobsMap.get(jobId);
  const cancelledSummary = existing ? toSummary(existing) : null;
  jobsMap.delete(jobId);
  activeUploadIds.delete(jobId);
  revokeObjectUrl(jobId);
  await deleteVaultJobFromDb(jobId);
  notifyJobsListeners();
  if (cancelledSummary) {
    cancelledListeners.forEach((listener) => {
      try {
        listener(cancelledSummary);
      } catch {
        // ignore listener error
      }
    });
  }
}

export async function retryPhotoUploadJob(jobId: string): Promise<void> {
  await initPhotoUploadManager();
  const job = jobsMap.get(jobId);
  if (!job || job.corrupted) return;
  if (job.status === 'uploading') return;
  job.status = 'queued';
  job.nextRetryAt = Date.now();
  job.lastError = undefined;
  job.updatedAt = new Date().toISOString();
  await putVaultJobToDb(job);
  notifyJobsListeners();
  void processPhotoUploadQueue(true);
}

export async function retryAllPendingPhotoUploads(): Promise<void> {
  await initPhotoUploadManager();
  const now = Date.now();
  let changed = false;
  for (const job of jobsMap.values()) {
    if (job.status !== 'uploading' && !job.corrupted) {
      job.status = 'queued';
      job.nextRetryAt = now;
      job.lastError = undefined;
      job.updatedAt = new Date().toISOString();
      await putVaultJobToDb(job);
      changed = true;
    }
  }
  if (changed) notifyJobsListeners();
  void processPhotoUploadQueue(true);
}

async function runSingleUploadJob(job: PhotoUploadJob): Promise<void> {
  if (!jobsMap.has(job.id) || activeUploadIds.has(job.id) || job.corrupted) return;
  if (!job.bytes || job.bytes.byteLength === 0) {
    job.corrupted = true;
    job.status = 'failed';
    job.lastError = 'Data file tidak ditemukan. Silakan foto ulang KPM ini lalu Hapus item ini.';
    await putVaultJobToDb(job);
    notifyJobsListeners();
    return;
  }

  activeUploadIds.add(job.id);
  job.status = 'uploading';
  job.attempts += 1;
  job.lastError = undefined;
  job.updatedAt = new Date().toISOString();
  await putVaultJobToDb(job);
  notifyJobsListeners();

  try {
    // Construct fresh File directly from durable in-memory ArrayBuffer — immune to WebKit Blob/FileReader failures!
    const fileToSend = new File([job.bytes], job.fileName, {
      type: job.mimeType || 'image/jpeg',
    });
    const uploadedDoc = await uploadImageDocumentToDrive(fileToSend, job.existingDoc);
    const enrichedDoc: KpmDocumentFile = {
      ...uploadedDoc,
      id: uploadedDoc.id,
      width: uploadedDoc.width || job.width,
      height: uploadedDoc.height || job.height,
      compressedSize: uploadedDoc.compressedSize || job.compressedSize,
      originalSize: job.originalSize || uploadedDoc.originalSize,
    };

    const latestJobState = jobsMap.get(job.id);
    if (!latestJobState) {
      // Job was cancelled while uploading — do not overwrite UI/Supabase
      return;
    }

    const newerSupersedingJob = latestJobState.supersededByJobId
      ? jobsMap.get(latestJobState.supersededByJobId)
      : undefined;
    if (newerSupersedingJob) {
      // Newer replacement photo already took over this slot — pass uploadedDoc so the newer job cleans it up cleanly
      newerSupersedingJob.existingDoc = enrichedDoc;
      void putVaultJobToDb(newerSupersedingJob);
      jobsMap.delete(job.id);
      revokeObjectUrl(job.id);
      await deleteVaultJobFromDb(job.id);
      notifyJobsListeners();
      return;
    }

    completedByJobId.set(job.id, enrichedDoc);
    if (completedByJobId.size > 100) {
      const oldestCompletedKey = completedByJobId.keys().next().value;
      if (oldestCompletedKey) completedByJobId.delete(oldestCompletedKey);
    }

    const summarySnapshot = toSummary(latestJobState);

    if (!latestJobState.kpmId && latestJobState.formDraftId) {
      const existingList = recentlyCompletedDrafts.get(latestJobState.formDraftId) ?? [];
      existingList.push({ job: summarySnapshot, uploadedDoc: enrichedDoc });
      recentlyCompletedDrafts.set(latestJobState.formDraftId, existingList);
      if (recentlyCompletedDrafts.size > 20) {
        const oldestKey = recentlyCompletedDrafts.keys().next().value;
        if (oldestKey) recentlyCompletedDrafts.delete(oldestKey);
      }
    }

    // Wait for registered completion handlers to persist Drive URL into app state + Supabase BEFORE removing local vault job
    for (const listener of Array.from(completedListeners)) {
      await listener({
        job: summarySnapshot,
        uploadedDoc: enrichedDoc,
      });
    }

    // Only delete from local vault once completion handlers finished saving Drive metadata
    jobsMap.delete(job.id);
    revokeObjectUrl(job.id);
    await deleteVaultJobFromDb(job.id);
    notifyJobsListeners();
  } catch (err) {
    const latest = jobsMap.get(job.id);
    if (latest) {
      const msg =
        err instanceof Error ? err.message : 'Koneksi terganggu saat mengunggah ke Google Drive.';
      const isPermanentReadError = /FileReader|tidak valid|rusak/i.test(msg);
      if (isPermanentReadError) {
        latest.corrupted = true;
      }
      const backoffMs = Math.min(30_000, 3000 * Math.pow(2, Math.max(0, latest.attempts - 1)));
      latest.status = 'failed';
      latest.nextRetryAt = Date.now() + backoffMs;
      latest.lastError = msg;
      latest.updatedAt = new Date().toISOString();
      await putVaultJobToDb(latest);
      notifyJobsListeners();
    }
  } finally {
    activeUploadIds.delete(job.id);
    void processPhotoUploadQueue(false);
  }
}

export async function processPhotoUploadQueue(forceImmediate: boolean): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  const now = Date.now();
  const candidates = Array.from(jobsMap.values())
    .filter((job) => {
      if (job.corrupted) return false;
      if (activeUploadIds.has(job.id)) return false;
      if (job.status === 'uploading') return false;
      if (!forceImmediate && job.nextRetryAt > now) return false;
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const job of candidates) {
    if (activeUploadIds.size >= MAX_CONCURRENT_UPLOADS) break;
    void runSingleUploadJob(job);
  }
}

export function clearPhotoVaultRetryTimer(): void {
  if (retryTimerId !== null && typeof window !== 'undefined') {
    window.clearInterval(retryTimerId);
    retryTimerId = null;
  }
}
