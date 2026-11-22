export interface ScannerDirEntryFile {
  name: string;
  lastModified: number;
  size: number;
  isPdf: boolean;
  getFile: () => Promise<File>;
}

interface MinimalFileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
}

interface MinimalFileSystemDirectoryHandle {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<MinimalFileSystemFileHandle | { kind: string; name: string }>;
}

let rememberedScannerDir: MinimalFileSystemDirectoryHandle | null = null;

export function getRememberedScannerDirHandle(): MinimalFileSystemDirectoryHandle | null {
  return rememberedScannerDir;
}

export function setRememberedScannerDirHandle(
  handle: MinimalFileSystemDirectoryHandle | null
): void {
  rememberedScannerDir = handle;
}

export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

export async function pickScannerOutputDirectory(): Promise<MinimalFileSystemDirectoryHandle | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error(
      'Browser Anda belum mendukung akses folder otomatis. Gunakan Chrome atau Edge terbaru di Laptop/PC, atau pilih file hasil scan (.PDF / .JPG / .PNG) secara langsung.'
    );
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker: (options?: {
        id?: string;
        mode?: 'read' | 'readwrite';
        startIn?: string;
      }) => Promise<MinimalFileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  try {
    const dirHandle = await picker({
      id: 'masdeta-scanner-folder',
      mode: 'read',
      startIn: 'documents',
    });
    rememberedScannerDir = dirHandle;
    return dirHandle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

export function isPdfDocumentFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

export function isSupportedScannerFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.pdf')
  );
}

export async function listRecentScannerFiles(
  dirHandle: MinimalFileSystemDirectoryHandle,
  limit = 8
): Promise<ScannerDirEntryFile[]> {
  const entries: ScannerDirEntryFile[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    if (!isSupportedScannerFileName(entry.name)) continue;
    const fileHandle = entry as MinimalFileSystemFileHandle;
    try {
      const file = await fileHandle.getFile();
      if (file.size === 0 || file.size > 15 * 1024 * 1024) continue;
      entries.push({
        name: file.name,
        lastModified: file.lastModified,
        size: file.size,
        isPdf: isPdfDocumentFile(file),
        getFile: () => fileHandle.getFile(),
      });
    } catch {
      // Ignore locked/in-progress file still being written by scanner software
    }
  }
  entries.sort((a, b) => b.lastModified - a.lastModified);
  return entries.slice(0, limit);
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsScannerPromise: Promise<PdfjsModule> | null = null;

async function getScannerPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsScannerPromise) {
    pdfjsScannerPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
        try {
          const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
          if (workerMod && typeof workerMod.default === 'string' && workerMod.default) {
            pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
          }
        } catch {
          // Fallback to main thread worker if needed
        }
      }
      return pdfjs;
    })().catch((err) => {
      pdfjsScannerPromise = null;
      throw err;
    });
  }
  return pdfjsScannerPromise;
}

/**
 * Mengonversi halaman pertama file PDF hasil scanner (Epson/Canon/HP/Windows Scan)
 * menjadi file gambar JPEG beresolusi tinggi agar tajam untuk OCR KTP & KK dan siap diunggah ke Drive.
 */
export async function convertPdfFirstPageToImageFile(pdfFile: File): Promise<File> {
  if (pdfFile.size > 15 * 1024 * 1024) {
    throw new Error('Ukuran file PDF hasil scan melebihi batas maksimal 15 MB.');
  }
  const pdfjs = await getScannerPdfjs();
  const buffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    verbosity: 0,
  });

  const pdfDoc = await loadingTask.promise;
  let canvas: HTMLCanvasElement | null = null;
  let pageCleanup: (() => void) | null = null;
  try {
    if (pdfDoc.numPages < 1) {
      throw new Error('File PDF hasil scan kosong.');
    }
    const page = await pdfDoc.getPage(1);
    pageCleanup = () => {
      try {
        page.cleanup();
      } catch {
        // Ignore page cleanup error
      }
    };
    const baseViewport = page.getViewport({ scale: 1 });
    const longestBase = Math.max(baseViewport.width, baseViewport.height, 1);
    // Target ~2000px di sisi terpanjang (setara ~250-300 DPI untuk A4/KTP) agar digit NIK/KK sangat tajam
    const targetScale = Math.min(3.2, Math.max(1.8, 2000 / longestBase));
    const viewport = page.getViewport({ scale: targetScale });

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser gagal menyiapkan kanvas konversi PDF hasil scan.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Gagal mengonversi halaman PDF hasil scan menjadi gambar.'));
        },
        'image/jpeg',
        0.92
      );
    });

    const baseName = pdfFile.name.replace(/\.pdf$/i, '').trim() || 'hasil_scan';
    return new File([blob], `${baseName}_scan.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    pageCleanup?.();
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore cleanup errors
    }
  }
}
