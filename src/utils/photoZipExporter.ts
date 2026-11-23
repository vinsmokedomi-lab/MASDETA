import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { KpmDocumentFile, SingleDocumentKey } from '../types/kpm';
import {
  getDocumentDirectUrl,
  getDocumentThumbnailUrl,
  hasRenderableMedia,
  MergedProposalSlot,
} from './imageProcessor';
import {
  getPendingPhotoBytesByDoc,
  isIosBrowser,
  isLocalPendingDocument,
} from './photoUploadManager';

export interface ExportProposalPhotosZipOptions {
  proposalName: string;
  tahun?: string;
  mergedSlots: MergedProposalSlot[];
  category?: SingleDocumentKey;
  kelurahanFilter?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface ExportProposalPhotosZipResult {
  savedFileName: string;
  exportedCount: number;
  failedCount: number;
  totalWithPhoto: number;
  openedNative: boolean;
  /** On iOS Safari if async fetch expired user gesture before Share Sheet could open */
  pendingIosFile?: File;
}

function sanitizeZipSegment(raw: string, maxLen = 40): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
}

function sanitizeZipFileName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const base = cleaned || 'Foto_Penyaluran';
  return base.toLowerCase().endsWith('.zip') ? base : `${base}.zip`;
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

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const b64 = dataUrl.slice(commaIdx + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.byteLength > 0 ? out : null;
  } catch {
    return null;
  }
}

async function loadImageViaCanvasBytes(url: string, timeoutMs = 4500): Promise<Uint8Array | null> {
  if (!url || typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(res);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 800;
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              finish(null);
              return;
            }
            const buf = await blob.arrayBuffer().catch(() => null);
            finish(buf && buf.byteLength > 0 ? new Uint8Array(buf) : null);
          },
          'image/jpeg',
          0.9
        );
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

async function resolveDocumentImageBytes(
  doc?: KpmDocumentFile
): Promise<{ bytes: Uint8Array; ext: string } | null> {
  if (!doc || !hasRenderableMedia(doc)) return null;

  if (isLocalPendingDocument(doc)) {
    const pending = await getPendingPhotoBytesByDoc(doc);
    if (pending && pending.bytes.byteLength > 0) {
      const ext = pending.mimeType.includes('png')
        ? 'png'
        : pending.mimeType.includes('webp')
          ? 'webp'
          : 'jpg';
      return { bytes: new Uint8Array(pending.bytes), ext };
    }
  }

  if (doc.dataUrl && doc.dataUrl.startsWith('data:image/')) {
    const arr = dataUrlToUint8Array(doc.dataUrl);
    if (arr) {
      const ext = doc.mimeType?.includes('png') ? 'png' : 'jpg';
      return { bytes: arr, ext };
    }
  }

  const urls = Array.from(
    new Set([getDocumentDirectUrl(doc), getDocumentThumbnailUrl(doc)].filter(Boolean))
  );

  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.startsWith('image/') || ct === 'application/octet-stream') {
          const buf = await res.arrayBuffer();
          if (buf && buf.byteLength > 100) {
            const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
            return { bytes: new Uint8Array(buf), ext };
          }
        }
      }
    } catch {
      // Fallback to canvas load below
    }

    const canvasBytes = await loadImageViaCanvasBytes(url);
    if (canvasBytes && canvasBytes.byteLength > 0) {
      return { bytes: canvasBytes, ext: 'jpg' };
    }
  }

  return null;
}

export async function triggerIosShareZipFile(file: File): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    (navigator.canShare && !navigator.canShare({ files: [file] }))
  ) {
    return false;
  }
  await navigator.share({
    files: [file],
    title: file.name,
  });
  return true;
}

export async function exportProposalPhotosZip({
  proposalName,
  tahun,
  mergedSlots,
  category = 'penerima',
  kelurahanFilter,
  onProgress,
}: ExportProposalPhotosZipOptions): Promise<ExportProposalPhotosZipResult> {
  const entriesWithDoc = mergedSlots
    .filter((entry): entry is Extract<MergedProposalSlot, { kind: 'kpm' }> => entry.kind === 'kpm')
    .map((entry) => ({
      slotNumber: entry.slotNumber,
      record: entry.record,
      doc: entry.record.documents[category],
    }))
    .filter((item) => Boolean(item.doc && hasRenderableMedia(item.doc)));

  if (entriesWithDoc.length === 0) {
    throw new Error('Tidak ada foto pada daftar KPM yang terpilih untuk diunduh sebagai ZIP.');
  }

  const zip = new JSZip();
  let exportedCount = 0;
  let failedCount = 0;
  const failedLines: string[] = [];

  const BATCH_SIZE = 4;
  for (let i = 0; i < entriesWithDoc.length; i += BATCH_SIZE) {
    const batch = entriesWithDoc.slice(i, i + BATCH_SIZE);
    const resolvedBatch = await Promise.all(
      batch.map(async (item) => {
        const resolved = await resolveDocumentImageBytes(item.doc);
        return { item, resolved };
      })
    );

    for (const { item, resolved } of resolvedBatch) {
      const seqLabel = String(item.slotNumber).padStart(2, '0');
      const safeName = sanitizeZipSegment(item.record.nama, 36) || `KPM_${seqLabel}`;
      if (resolved) {
        const fileName = `${seqLabel}_${safeName}.${resolved.ext}`;
        zip.file(fileName, resolved.bytes);
        exportedCount += 1;
      } else {
        failedCount += 1;
        failedLines.push(`#${seqLabel} - ${item.record.nama} (${item.record.nikKtp || '-'})`);
      }
    }
    onProgress?.(Math.min(i + BATCH_SIZE, entriesWithDoc.length), entriesWithDoc.length);
  }

  if (exportedCount === 0) {
    throw new Error(
      'Semua foto gagal diunduh dari server/Drive (periksa koneksi internet Anda atau tunggu upload antrean).'
    );
  }

  if (failedLines.length > 0) {
    zip.file(
      '_FOTO_GAGAL_UNDUH.txt',
      [
        `Proposal: ${proposalName}${tahun ? ` (${tahun})` : ''}`,
        `Kategori: Foto ${category.toUpperCase()}`,
        `Berhasil: ${exportedCount} | Gagal: ${failedCount}`,
        '',
        'Daftar KPM yang fotonya gagal diambil saat offline/gangguan CORS:',
        ...failedLines,
      ].join('\n')
    );
  }

  const catLabel =
    category === 'penerima'
      ? 'Foto_Penerima'
      : category === 'survey'
        ? 'Foto_Survey'
        : category === 'ktp'
          ? 'Foto_KTP'
          : 'Foto_KK';
  const kelSuffix =
    kelurahanFilter && kelurahanFilter !== 'all' ? `_${kelurahanFilter}` : '';
  const zipFileName = sanitizeZipFileName(
    `${catLabel}_${proposalName}${kelSuffix}${tahun ? `_${tahun}` : ''}`
  );

  if (Capacitor.isNativePlatform()) {
    const base64Zip = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    const targets: { directory: Directory; path: string }[] = [
      { directory: Directory.Documents, path: `MASDETA/${zipFileName}` },
      { directory: Directory.Cache, path: zipFileName },
    ];
    let writtenUri: string | null = null;
    for (const t of targets) {
      try {
        await Filesystem.writeFile({
          directory: t.directory,
          path: t.path,
          data: base64Zip,
          recursive: true,
        });
        const uriRes = await Filesystem.getUri({
          directory: t.directory,
          path: t.path,
        });
        writtenUri = uriRes.uri;
        break;
      } catch {
        // try next target
      }
    }
    if (!writtenUri) {
      throw new Error('Gagal menyimpan file ZIP ke penyimpanan perangkat.');
    }
    await FileOpener.openFile({
      path: writtenUri,
      mimeType: 'application/zip',
    });
    return {
      savedFileName: zipFileName,
      exportedCount,
      failedCount,
      totalWithPhoto: entriesWithDoc.length,
      openedNative: true,
    };
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  if (isIosBrowser()) {
    const zipFile = new File([zipBlob], zipFileName, { type: 'application/zip' });
    try {
      const shared = await triggerIosShareZipFile(zipFile);
      if (shared) {
        return {
          savedFileName: zipFileName,
          exportedCount,
          failedCount,
          totalWithPhoto: entriesWithDoc.length,
          openedNative: false,
        };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Pengunduhan ZIP dibatalkan.');
      }
      // iOS expired async user gesture — hand file back for immediate 1-tap Share trigger
      return {
        savedFileName: zipFileName,
        exportedCount,
        failedCount,
        totalWithPhoto: entriesWithDoc.length,
        openedNative: false,
        pendingIosFile: zipFile,
      };
    }
    return {
      savedFileName: zipFileName,
      exportedCount,
      failedCount,
      totalWithPhoto: entriesWithDoc.length,
      openedNative: false,
      pendingIosFile: zipFile,
    };
  }

  const blobUrl = URL.createObjectURL(zipBlob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = zipFileName;
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
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    }, 60_000);
  } catch (err) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
    throw err;
  }

  return {
    savedFileName: zipFileName,
    exportedCount,
    failedCount,
    totalWithPhoto: entriesWithDoc.length,
    openedNative: false,
  };
}
