import { Directory, Filesystem } from '@capacitor/filesystem';
import { KpmDocumentFile, SingleDocumentKey } from '../types/kpm';
import { isNativeAppPlatform } from './platform';
import { uploadImageDocumentToDrive } from './imageProcessor';

export type PhotoDocCategory = SingleDocumentKey | 'rumah' | 'lainnya';
export type PhotoUploadJobStatus = 'queued' | 'uploading' | 'failed';
export type PhotoCaptureSource = 'camera' | 'file';

export const LOCAL_PENDING_URL_PREFIX = 'local-pending://';
const PHOTO_VAULT_DB_NAME = 'masdeta_photo_vault_v1';
const PHOTO_VAULT_STORE = 'jobs';
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
  blob: Blob;
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

type JobsListener = (jobs: PhotoUploadJobSummary[]) => void;
type CompletedListener = (event: PhotoUploadCompletedEvent) => Promise<void> | void;

const jobsMap = new Map<string, PhotoUploadJob>();
const objectUrlMap = new Map<string, string>();
const jobsListeners = new Set<JobsListener>();
const completedListeners = new Set<CompletedListener>();
const activeUploadIds = new Set<string>();
const recentlyCompletedDrafts = new Map<string, PhotoUploadCompletedEvent[]>();

let vaultDbPromise: Promise<IDBDatabase | null> | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let retryTimerId: number | null = null;
let beforeUnloadBound = false;

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

async function putVaultJobToDb(job: PhotoUploadJob): Promise<void> {
  const db = await openPhotoVaultDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(PHOTO_VAULT_STORE, 'readwrite');
      tx.objectStore(PHOTO_VAULT_STORE).put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      vaultDbPromise = null;
      resolve();
    }
  });
}

async function deleteVaultJobFromDb(jobId: string): Promise<void> {
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
  const existing = objectUrlMap.get(job.id);
  if (existing) return existing;
  try {
    if (job.blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(job.blob);
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
  return {
    id: job.id,
    kpmId: job.kpmId,
    formDraftId: job.formDraftId,
    kpmName: job.kpmName,
    category: job.category,
    slotLabel: job.slotLabel,
    existingDoc: job.existingDoc,
    previewUrl: getOrCreateObjectUrl(job) || job.previewThumbDataUrl || '',
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
  if (!job) return null;
  try {
    return new File([job.blob], job.fileName, {
      type: job.mimeType || job.blob.type || 'image/jpeg',
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
    > & { previewUrl?: string }
): KpmDocumentFile {
  const thumbFallback =
    job.previewThumbDataUrl ||
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
            reason: 'Memori perangkat penuh/hampir habis — dilewati dari Galeri, disimpan aman di cache browser.',
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

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Gagal mengonversi foto.'));
        return;
      }
      const idx = reader.result.indexOf(',');
      resolve(idx >= 0 ? reader.result.slice(idx + 1) : reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca data foto.'));
    reader.readAsDataURL(blob);
  });
}

function triggerWebBlobDownload(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  let tempUrl = '';
  try {
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
    }, 1500);
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
  blob: Blob,
  fileName: string,
  source: PhotoCaptureSource
): Promise<{ savedToGallery: boolean; galleryStatusNote: string }> {
  if (source === 'file') {
    return {
      savedToGallery: false,
      galleryStatusNote: 'File dari perangkat · diamankan di cache browser hingga Drive selesai',
    };
  }

  if (!getAutoSaveGallerySetting()) {
    return {
      savedToGallery: false,
      galleryStatusNote: 'Simpan galeri nonaktif · diamankan di cache browser hingga Drive selesai',
    };
  }

  const headroom = await checkStorageHeadroomForGallery(blob.size);
  if (!headroom.ok) {
    return {
      savedToGallery: false,
      galleryStatusNote:
        headroom.reason ||
        'Memori HP penuh — tidak disimpan ke galeri, disimpan aman di cache browser hingga terunggah',
    };
  }

  if (isNativeAppPlatform()) {
    try {
      const base64Data = await blobToPureBase64(blob);
      const targets: Array<{ directory: Directory; path: string; label: string }> = [
        {
          directory: Directory.ExternalStorage,
          path: `Pictures/MASDETA/${fileName}`,
          label: 'Tersimpan di Galeri (Pictures/MASDETA) & cache aplikasi',
        },
        {
          directory: Directory.Documents,
          path: `MASDETA/Foto/${fileName}`,
          label: 'Tersimpan di Dokumen/MASDETA & cache aplikasi',
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
          'Memori/izin penyimpanan terbatas — foto disimpan aman di cache aplikasi hingga terunggah',
      };
    } catch {
      return {
        savedToGallery: false,
        galleryStatusNote:
          'Memori perangkat penuh — foto disimpan aman di cache aplikasi hingga terunggah',
      };
    }
  }

  const triggered = triggerWebBlobDownload(blob, fileName);
  return triggered
    ? {
        savedToGallery: true,
        galleryStatusNote: 'Salinan dikirim ke Galeri/Unduhan & diamankan di cache browser',
      }
    : {
        savedToGallery: false,
        galleryStatusNote: 'Disimpan aman di cache browser hingga berhasil diunggah ke Drive',
      };
}

export async function downloadPendingJobToGallery(jobId: string): Promise<boolean> {
  await initPhotoUploadManager();
  const job = jobsMap.get(jobId);
  if (!job) return false;

  if (isNativeAppPlatform()) {
    try {
      const base64Data = await blobToPureBase64(job.blob);
      await Filesystem.writeFile({
        directory: Directory.Documents,
        path: `MASDETA/Foto/${job.fileName}`,
        data: base64Data,
        recursive: true,
      });
      job.savedToGallery = true;
      job.galleryStatusNote = 'Tersimpan di Dokumen/MASDETA & cache aplikasi';
      await putVaultJobToDb(job);
      notifyJobsListeners();
      return true;
    } catch {
      return false;
    }
  }

  const ok = triggerWebBlobDownload(job.blob, job.fileName);
  if (ok) {
    job.savedToGallery = true;
    job.galleryStatusNote = 'Salinan dikirim ke Galeri/Unduhan & diamankan di cache browser';
    await putVaultJobToDb(job);
    notifyJobsListeners();
  }
  return ok;
}

function loadImageElementFromFile(file: File): Promise<{
  img: HTMLImageElement;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        img,
        cleanup: () => {
          img.onload = null;
          img.onerror = null;
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // ignore
          }
        },
      });
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      reject(new Error('File gambar tidak valid atau rusak.'));
    };
    img.src = objectUrl;
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

async function preparePhotoForSafeUpload(
  file: File,
  friendlyName: string
): Promise<{
  blob: Blob;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  previewThumbDataUrl?: string;
}> {
  if (!file.type.startsWith('image/')) {
    return {
      blob: file,
      mimeType: file.type || 'application/octet-stream',
      fileName: friendlyName || file.name,
      width: 0,
      height: 0,
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  const { img, cleanup } = await loadImageElementFromFile(file);
  try {
    const srcW = img.naturalWidth || img.width || 0;
    const srcH = img.naturalHeight || img.height || 0;

    // Generate tiny 180px thumbnail for instant preview across browser restarts
    let previewThumbDataUrl: string | undefined;
    if (srcW > 0 && srcH > 0) {
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
    }

    const needsResize = Math.max(srcW, srcH) > MAX_IMAGE_EDGE || file.size > SKIP_REENCODE_SIZE_BYTES;
    if (!needsResize || srcW === 0 || srcH === 0) {
      return {
        blob: file,
        mimeType: file.type || 'image/jpeg',
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: file.size,
        compressedSize: file.size,
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
        blob: file,
        mimeType: file.type || 'image/jpeg',
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: file.size,
        compressedSize: file.size,
        previewThumbDataUrl,
      };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dstW, dstH);
    ctx.drawImage(img, 0, 0, dstW, dstH);

    let outBlob = await canvasToBlobAsync(canvas, 'image/jpeg', JPEG_QUALITY);
    if (outBlob && outBlob.size > 1_200_000) {
      const lighter = await canvasToBlobAsync(canvas, 'image/jpeg', 0.74);
      if (lighter) outBlob = lighter;
    }

    if (!outBlob || (outBlob.size >= file.size && Math.max(srcW, srcH) <= MAX_IMAGE_EDGE)) {
      return {
        blob: file,
        mimeType: file.type || 'image/jpeg',
        fileName: friendlyName,
        width: srcW,
        height: srcH,
        originalSize: file.size,
        compressedSize: file.size,
        previewThumbDataUrl,
      };
    }

    const jpgName = friendlyName.replace(/\.(png|webp|heic|heif)$/i, '.jpg');
    return {
      blob: outBlob,
      mimeType: 'image/jpeg',
      fileName: jpgName.endsWith('.jpg') || jpgName.endsWith('.jpeg') ? jpgName : `${jpgName}.jpg`,
      width: dstW,
      height: dstH,
      originalSize: file.size,
      compressedSize: outBlob.size,
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
    if (jobsMap.size > 0) {
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
      for (const job of stored) {
        if (!job?.id || !job.blob) continue;
        // Any upload interrupted by reload/crash starts cleanly as queued again
        const normalized: PhotoUploadJob = {
          ...job,
          status: job.status === 'uploading' ? 'queued' : job.status,
          nextRetryAt: job.status === 'uploading' ? now : job.nextRetryAt || now,
        };
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
  if (!file.type.startsWith('image/')) {
    throw new Error('Format file harus berupa gambar (JPG, PNG, atau WebP).');
  }

  const friendlyName = buildFriendlyPhotoFileName(
    kpmName,
    slotLabel,
    file.name,
    file.type || 'image/jpeg'
  );
  const prepared = await preparePhotoForSafeUpload(file, friendlyName);
  const galleryRes = await trySavePhotoToDeviceGallery(
    prepared.blob,
    prepared.fileName,
    source
  );

  // If replacing a single slot that already has a non-uploading pending job, inherit its real Drive existingDoc & clean the superseded pending job
  let preservedExistingDoc =
    existingDoc && !isLocalPendingDocument(existingDoc) ? existingDoc : undefined;

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
        }
      }
    }
  }

  const nowIso = new Date().toISOString();
  const jobId = `pjob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const job: PhotoUploadJob = {
    id: jobId,
    kpmId,
    formDraftId,
    kpmName: kpmName.trim() || 'KPM',
    category,
    slotLabel,
    existingDoc: preservedExistingDoc,
    blob: prepared.blob,
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

  // Persist to IndexedDB FIRST before returning to UI — guaranteed crash/back safe
  await putVaultJobToDb(job);
  jobsMap.set(job.id, job);
  getOrCreateObjectUrl(job);
  notifyJobsListeners();

  // Trigger background upload immediately (never awaits inside caller!)
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
  jobsMap.delete(jobId);
  activeUploadIds.delete(jobId);
  revokeObjectUrl(jobId);
  await deleteVaultJobFromDb(jobId);
  notifyJobsListeners();
}

export async function retryPhotoUploadJob(jobId: string): Promise<void> {
  await initPhotoUploadManager();
  const job = jobsMap.get(jobId);
  if (!job) return;
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
    if (job.status !== 'uploading') {
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
  if (!jobsMap.has(job.id) || activeUploadIds.has(job.id)) return;
  activeUploadIds.add(job.id);
  job.status = 'uploading';
  job.attempts += 1;
  job.lastError = undefined;
  job.updatedAt = new Date().toISOString();
  await putVaultJobToDb(job);
  notifyJobsListeners();

  try {
    const fileToSend = new File([job.blob], job.fileName, {
      type: job.mimeType || job.blob.type || 'image/jpeg',
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

    const summarySnapshot = toSummary(job);

    if (!job.kpmId && job.formDraftId) {
      const existingList = recentlyCompletedDrafts.get(job.formDraftId) ?? [];
      existingList.push({ job: summarySnapshot, uploadedDoc: enrichedDoc });
      recentlyCompletedDrafts.set(job.formDraftId, existingList);
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
      const backoffMs = Math.min(30_000, 3000 * Math.pow(2, Math.max(0, latest.attempts - 1)));
      latest.status = 'failed';
      latest.nextRetryAt = Date.now() + backoffMs;
      latest.lastError =
        err instanceof Error ? err.message : 'Koneksi terganggu saat mengunggah ke Google Drive.';
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
