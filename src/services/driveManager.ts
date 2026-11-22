const MAX_MEDIA_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface DriveMediaResult {
  fileId: string;
  directUrl: string;
  thumbnailUrl: string;
  viewUrl: string;
}

export interface DriveDeleteResult {
  ok: boolean;
  fileId?: string;
  message?: string;
}

function getGasConfig(): { uploadUrl: string; apiKey: string } {
  const uploadUrl = (
    import.meta.env.VITE_GAS_UPLOAD_URL ||
    'https://script.google.com/macros/s/AKfycbzWA6Nea-ScYwzEOfAueQ5r0UOTScVk17ty5AXizM85Wxl0r5w4I6XYgN_Jz4OF2QJi/exec'
  ).trim();
  const apiKey = (
    import.meta.env.VITE_GAS_API_KEY || 'MASDETA_DRIVE_KEY_2026_AMAN'
  ).trim();

  if (!uploadUrl) {
    throw new Error('VITE_GAS_UPLOAD_URL belum dikonfigurasi pada environment.');
  }
  if (!apiKey) {
    throw new Error('VITE_GAS_API_KEY belum dikonfigurasi pada environment.');
  }

  return { uploadUrl, apiKey };
}

export function extractDriveFileId(urlOrId?: string | null): string {
  const raw = (urlOrId || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{15,}$/.test(raw) && !raw.includes('/') && !raw.includes('.')) {
    return raw;
  }

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/,
  ];

  for (const re of patterns) {
    const match = raw.match(re);
    if (match?.[1]) return match[1];
  }
  return '';
}

export function isDriveMediaUrl(url?: string | null): boolean {
  const raw = (url || '').trim();
  if (!raw) return false;
  return (
    raw.includes('drive.google.com') ||
    raw.includes('googleusercontent.com') ||
    Boolean(extractDriveFileId(raw))
  );
}

export function buildDriveFallbackThumbnailUrl(urlOrId?: string | null, size = 1000): string {
  const fileId = extractDriveFileId(urlOrId);
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
}

export function buildDriveDownloadUrl(urlOrId?: string | null): string {
  const fileId = extractDriveFileId(urlOrId);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  }
  return (urlOrId || '').trim();
}

export function readFileAsPureBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Gagal membaca file sebagai Base64.'));
        return;
      }
      const commaIdx = reader.result.indexOf(',');
      const pureBase64 = commaIdx >= 0 ? reader.result.slice(commaIdx + 1) : reader.result;
      if (!pureBase64) {
        reject(new Error('Konten file kosong atau tidak dapat dibaca.'));
        return;
      }
      resolve(pureBase64);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file menggunakan FileReader.'));
    reader.readAsDataURL(file);
  });
}

export function measureImageFileDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    return Promise.resolve({ width: 0, height: 0 });
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
      resolve({ width: 0, height: 0 });
    };
    img.src = objectUrl;
  });
}

function validateFileSize(file: File): void {
  if (!file) {
    throw new Error('File tidak ditemukan.');
  }
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new Error('Ukuran file terlalu besar. Maksimal 15 MB per file.');
  }
}

async function postToGasEndpoint<T>(
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number; maxAttempts?: number }
): Promise<T> {
  const { uploadUrl } = getGasConfig();
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const maxAttempts = options?.maxAttempts ?? 2;
  const body = JSON.stringify(payload);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        redirect: 'follow',
        body,
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (response.status >= 500 && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        throw new Error(
          response.ok
            ? 'Respon Google Apps Script bukan format JSON yang valid.'
            : `Gagal menghubungi layanan Google Drive (${response.status}).`
        );
      }

      if (
        !response.ok ||
        parsed.success === false ||
        parsed.ok === false ||
        parsed.status === 'error' ||
        typeof parsed.error === 'string'
      ) {
        const msg =
          (typeof parsed.error === 'string' && parsed.error) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          `Operasi Google Drive gagal (${response.status}).`;
        throw new Error(msg);
      }

      const dataLayer =
        parsed.data && typeof parsed.data === 'object'
          ? (parsed.data as Record<string, unknown>)
          : parsed;

      return dataLayer as T;
    } catch (err) {
      lastError = err;
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      const isTransient =
        isAbort ||
        err instanceof TypeError ||
        (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message));

      if (!isTransient || attempt >= maxAttempts) {
        if (isAbort) {
          throw new Error(
            'Koneksi ke Google Drive melewati batas waktu (timeout). Periksa koneksi internet lalu coba lagi.'
          );
        }
        throw err instanceof Error
          ? err
          : new Error('Gagal terhubung ke layanan penyimpanan Google Drive.');
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gagal terhubung ke layanan penyimpanan Google Drive.');
}

function normalizeDriveMediaResponse(raw: Record<string, unknown>): DriveMediaResult {
  const fileId = String(raw.fileId || raw.id || '').trim() ||
    extractDriveFileId(String(raw.directUrl || raw.viewUrl || raw.url || ''));

  const directUrl =
    String(raw.directUrl || raw.url || '').trim() ||
    (fileId ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}` : '');

  const thumbnailUrl =
    String(raw.thumbnailUrl || '').trim() ||
    (fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000` : directUrl);

  const viewUrl =
    String(raw.viewUrl || '').trim() ||
    (fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view` : directUrl);

  if (!directUrl && !fileId) {
    throw new Error('Google Apps Script tidak mengembalikan URL atau ID file Drive.');
  }

  return {
    fileId,
    directUrl,
    thumbnailUrl,
    viewUrl,
  };
}

/**
 * Unggah media baru ke Google Drive melalui Google Apps Script (maks. 15 MB).
 */
export async function uploadMediaToDrive(file: File): Promise<DriveMediaResult> {
  validateFileSize(file);
  const { apiKey } = getGasConfig();
  const base64Data = await readFileAsPureBase64(file);

  const result = await postToGasEndpoint<Record<string, unknown>>({
    apiKey,
    action: 'upload',
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64Data,
  });

  return normalizeDriveMediaResponse(result);
}

/**
 * Ganti media yang sudah ada di Google Drive (upload baru + pindahkan file lama ke Trash).
 */
export async function replaceMediaInDrive(
  newFile: File,
  oldFileUrlOrId: string
): Promise<DriveMediaResult> {
  validateFileSize(newFile);
  const cleanOld = (oldFileUrlOrId || '').trim();
  if (!cleanOld) {
    return uploadMediaToDrive(newFile);
  }

  const { apiKey } = getGasConfig();
  const base64Data = await readFileAsPureBase64(newFile);

  const result = await postToGasEndpoint<Record<string, unknown>>({
    apiKey,
    action: 'replace',
    fileName: newFile.name,
    mimeType: newFile.type || 'application/octet-stream',
    base64Data,
    oldFileUrl: cleanOld,
  });

  return normalizeDriveMediaResponse(result);
}

/**
 * Pindahkan file media di Google Drive ke Trash.
 */
export async function deleteMediaFromDrive(fileUrlOrId: string): Promise<DriveDeleteResult> {
  const cleanTarget = (fileUrlOrId || '').trim();
  if (!cleanTarget) {
    return { ok: true, message: 'Tidak ada URL/ID Drive untuk dihapus.' };
  }

  // Jika bukan URL/ID Google Drive (mis. data legacy lokal), lewati panggilan GAS
  if (cleanTarget.startsWith('data:')) {
    return { ok: true, message: 'Data lokal dilewati.' };
  }

  const { apiKey } = getGasConfig();
  const result = await postToGasEndpoint<Record<string, unknown>>(
    {
      apiKey,
      action: 'delete',
      fileUrl: cleanTarget,
    },
    { timeoutMs: 20_000, maxAttempts: 2 }
  );

  return {
    ok: true,
    fileId:
      (typeof result.fileId === 'string' && result.fileId) ||
      extractDriveFileId(cleanTarget) ||
      undefined,
    message: typeof result.message === 'string' ? result.message : 'File dipindahkan ke Trash Drive.',
  };
}
