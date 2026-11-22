import { Capacitor } from '@capacitor/core';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { KpmDocumentFile } from '../types/kpm';
import { formatAlamatLengkap, isValidNik16, sanitizeDigits } from '../utils/imageProcessor';

export type ScanIdentityField =
  | 'nikKk'
  | 'nikKtp'
  | 'nama'
  | 'alamat'
  | 'rt'
  | 'rw'
  | 'pekerjaan';

export interface OcrImagePayload {
  base64: string;
  mimeType: string;
}

export interface KtpKkScanIssue {
  field: string;
  reason: string;
}

export interface KtpKkScanResult {
  nikKk: string;
  nikKtp: string;
  nama: string;
  alamat: string;
  rt: string;
  rw: string;
  pekerjaan: string;
  kelurahan: string;
  ktpNameMatchesKk: boolean;
  blurryFields: ScanIdentityField[];
  fieldIssues: KtpKkScanIssue[];
}

interface RawOcrResponse {
  nikKk?: unknown;
  nikKtp?: unknown;
  nama?: unknown;
  alamat?: unknown;
  rt?: unknown;
  rw?: unknown;
  pekerjaan?: unknown;
  kelurahan?: unknown;
  ktpNameMatchesKk?: unknown;
  blurryFields?: unknown;
  fieldIssues?: unknown;
  error?: unknown;
}

const VALID_SCAN_FIELDS = new Set<ScanIdentityField>([
  'nikKk',
  'nikKtp',
  'nama',
  'alamat',
  'rt',
  'rw',
  'pekerjaan',
]);

export const SCAN_FIELD_LABELS: Record<ScanIdentityField, string> = {
  nikKk: 'NIK KK (No. KK)',
  nikKtp: 'NIK KTP',
  nama: 'Nama Lengkap',
  alamat: 'Alamat Lengkap',
  rt: 'RT',
  rw: 'RW',
  pekerjaan: 'Pekerjaan',
};

function normalizeAlphaNum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const OCCUPATION_SYNONYMS: Record<string, string[]> = {
  mengurusrumahtangga: ['ibu rumah tangga', 'mengurus rumah tangga', 'irt'],
  iburumahtangga: ['mengurus rumah tangga', 'ibu rumah tangga', 'irt'],
  belumtidakbekerja: ['belum / tidak bekerja', 'belum/tidak bekerja', 'tidak bekerja'],
  pelajarmahasiswa: ['pelajar / mahasiswa', 'pelajar/mahasiswa', 'mahasiswa', 'pelajar'],
  buruhharianlepas: ['buruh harian lepas', 'pekerja lepas'],
  buruhtaniperkebunan: ['buruh tani / perkebunan', 'buruh tani', 'petani / pekebun'],
  petanipekebun: ['petani / pekebun', 'buruh tani / perkebunan', 'petani'],
  karyawanswasta: ['karyawan swasta', 'pegawai swasta'],
  pegawainegerisipil: ['pns', 'asn', 'pegawai negeri sipil'],
  pns: ['asn', 'pns', 'pegawai negeri sipil'],
  pedagang: ['pedagang', 'wiraswasta'],
};

export function matchPekerjaanOption(rawJob: string, options: string[]): string {
  const trimmed = rawJob.trim();
  if (!trimmed) return '';
  const norm = normalizeAlphaNum(trimmed);
  if (!norm) return '';

  // 1. Exact case-insensitive / alphanumeric match
  const exact = options.find((opt) => normalizeAlphaNum(opt) === norm);
  if (exact) return exact;

  // 2. Synonym dictionary match
  const candidates = OCCUPATION_SYNONYMS[norm] || [];
  for (const cand of candidates) {
    const candNorm = normalizeAlphaNum(cand);
    const matched = options.find((opt) => normalizeAlphaNum(opt) === candNorm);
    if (matched) return matched;
  }

  // 3. Partial containment match (only for meaningful tokens)
  if (norm.length >= 4) {
    const partial = options.find((opt) => {
      const optNorm = normalizeAlphaNum(opt);
      return optNorm.includes(norm) || norm.includes(optNorm);
    });
    if (partial) return partial;
  }

  return '';
}

export function matchKelurahanOption(rawKel: string, options: string[]): string {
  const cleaned = rawKel
    .replace(/^(kelurahan|kel\.?|desa)\s+/i, '')
    .trim();
  if (!cleaned || options.length === 0) return '';
  const norm = normalizeAlphaNum(cleaned);
  const exact = options.find((opt) => normalizeAlphaNum(opt.replace(/^(kelurahan|kel\.?|desa)\s+/i, '')) === norm);
  if (exact) return exact;
  const partial = options.find((opt) => {
    const optNorm = normalizeAlphaNum(opt.replace(/^(kelurahan|kel\.?|desa)\s+/i, ''));
    return optNorm === norm || optNorm.includes(norm) || norm.includes(optNorm);
  });
  return partial || '';
}

async function compressBase64DataUrlIfLarge(
  dataUrl: string,
  maxBase64Chars = 650_000,
  maxEdge = 1400,
  quality = 0.82
): Promise<{ base64: string; mimeType: string } | null> {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const meta = dataUrl.slice(5, commaIdx);
  const rawMime = meta.split(';')[0] || 'image/jpeg';
  const rawBase64 = dataUrl.slice(commaIdx + 1);
  if (!rawBase64) return null;
  if (rawBase64.length <= maxBase64Chars || typeof document === 'undefined') {
    return { base64: rawBase64, mimeType: rawMime };
  }

  let canvas: HTMLCanvasElement | null = null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => {
        el.onload = null;
        el.onerror = null;
        resolve(el);
      };
      el.onerror = () => {
        el.onload = null;
        el.onerror = null;
        reject(new Error('load failed'));
      };
      el.src = dataUrl;
    });
    const srcW = img.naturalWidth || img.width || 0;
    const srcH = img.naturalHeight || img.height || 0;
    if (srcW > 0 && srcH > 0) {
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const dstW = Math.max(1, Math.round(srcW * scale));
      const dstH = Math.max(1, Math.round(srcH * scale));
      canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dstW, dstH);
        ctx.drawImage(img, 0, 0, dstW, dstH);
        const compressedUrl = canvas.toDataURL('image/jpeg', quality);
        const idx = compressedUrl.indexOf(',');
        const compactBase64 = idx >= 0 ? compressedUrl.slice(idx + 1) : '';
        if (compactBase64) {
          return { base64: compactBase64, mimeType: 'image/jpeg' };
        }
      }
    }
  } catch {
    // Fall back to raw base64 if canvas re-compression fails
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return { base64: rawBase64, mimeType: rawMime };
}

async function buildImageDescriptor(
  doc: KpmDocumentFile,
  localOcrImage?: OcrImagePayload | null
): Promise<Record<string, string>> {
  if (localOcrImage?.base64) {
    const mime = localOcrImage.mimeType || 'image/jpeg';
    if (localOcrImage.base64.length > 650_000) {
      const compacted = await compressBase64DataUrlIfLarge(
        `data:${mime};base64,${localOcrImage.base64}`
      );
      if (compacted) return compacted;
    }
    return {
      base64: localOcrImage.base64,
      mimeType: mime,
    };
  }
  const direct = (doc.directUrl || doc.dataUrl || '').trim();
  if (direct.startsWith('data:image/')) {
    const compacted = await compressBase64DataUrlIfLarge(direct);
    if (compacted) return compacted;
  }
  return {
    ...(doc.fileId ? { fileId: doc.fileId } : {}),
    ...(direct ? { url: direct } : {}),
    ...(doc.thumbnailUrl ? { thumbnailUrl: doc.thumbnailUrl } : {}),
  };
}

function isNetworkFetchError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('aborted')
  );
}

async function postJsonWithRetry(
  endpoint: string,
  payload: unknown,
  maxAttempts = 2,
  timeoutMs = 55_000
): Promise<Response> {
  const serialized = JSON.stringify(payload);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: serialized,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.status === 503 && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (!isNetworkFetchError(err) || attempt >= maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal terhubung ke server pemindai.');
}

export async function scanKtpAndKkDocuments(params: {
  ktpDoc: KpmDocumentFile;
  kkDoc: KpmDocumentFile;
  ktpOcrImage?: OcrImagePayload | null;
  kkOcrImage?: OcrImagePayload | null;
  pekerjaanOptions: string[];
  kelurahanOptions?: string[];
}): Promise<KtpKkScanResult> {
  const [ktpDescriptor, kkDescriptor] = await Promise.all([
    buildImageDescriptor(params.ktpDoc, params.ktpOcrImage),
    buildImageDescriptor(params.kkDoc, params.kkOcrImage),
  ]);

  const requestBody = {
    ktp: ktpDescriptor,
    kk: kkDescriptor,
    pekerjaanOptions: params.pekerjaanOptions,
    kelurahanOptions: params.kelurahanOptions || [],
  };

  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  let raw: RawOcrResponse | null = null;
  let shouldTrySupabaseEdge = false;
  let primaryFailureMessage: string | null = null;

  if (apiBase || !Capacitor.isNativePlatform()) {
    const endpoint = apiBase ? `${apiBase}/api/ocr/ktp-kk` : '/api/ocr/ktp-kk';
    try {
      const response = await postJsonWithRetry(endpoint, requestBody, 2, 55_000);

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const json = (isJson ? await response.json().catch(() => ({})) : {}) as RawOcrResponse;

      if (response.ok && isJson) {
        raw = json;
      } else if (
        !apiBase &&
        isSupabaseConfigured &&
        (response.status === 404 || response.status === 405 || !isJson)
      ) {
        shouldTrySupabaseEdge = true;
      } else {
        throw new Error(
          typeof json.error === 'string' && json.error
            ? json.error
            : `Gagal memindai foto KTP & KK (HTTP ${response.status}).`
        );
      }
    } catch (fetchErr) {
      const isTimeout =
        (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') ||
        (fetchErr instanceof Error && fetchErr.name === 'AbortError');
      if (isTimeout) {
        primaryFailureMessage =
          'Waktu tunggu pemindaian KTP & KK habis (timeout). Pastikan koneksi stabil atau unggah ulang foto dengan ukuran lebih ringan lalu coba Scan lagi.';
      } else if (isNetworkFetchError(fetchErr)) {
        primaryFailureMessage =
          'Tidak dapat terhubung ke server pemindai KTP & KK. Pastikan koneksi internet stabil (atau server API sedang aktif) lalu coba klik Scan lagi.';
      } else {
        primaryFailureMessage =
          fetchErr instanceof Error
            ? fetchErr.message
            : 'Gagal memindai foto KTP & KK.';
      }

      if (!apiBase && isSupabaseConfigured && isNetworkFetchError(fetchErr)) {
        shouldTrySupabaseEdge = true;
      } else {
        throw new Error(primaryFailureMessage);
      }
    }
  } else {
    shouldTrySupabaseEdge = true;
  }

  if (!raw && shouldTrySupabaseEdge) {
    if (!isSupabaseConfigured) {
      throw new Error(
        primaryFailureMessage ||
          'Endpoint pemindaian KTP & KK belum tersedia pada lingkungan ini.'
      );
    }
    try {
      const { data, error } = await supabase.functions.invoke<RawOcrResponse>('ocr-ktp-kk', {
        body: requestBody,
      });
      if (error) {
        throw new Error(
          primaryFailureMessage ||
            'Layanan scan KTP & KK tidak dapat dijangkau dari domain ini (endpoint server /api/ocr/ktp-kk atau Supabase Edge Function "ocr-ktp-kk" belum aktif).'
        );
      }
      if (data && typeof data.error === 'string' && data.error) {
        throw new Error(data.error);
      }
      raw = data;
    } catch (edgeErr) {
      if (edgeErr instanceof Error && !isNetworkFetchError(edgeErr)) {
        throw edgeErr;
      }
      throw new Error(
        primaryFailureMessage ||
          'Gagal terhubung ke layanan scan KTP & KK. Periksa koneksi internet atau konfigurasi server (VITE_API_BASE_URL).'
      );
    }
  }

  if (!raw) {
    throw new Error('Tidak menerima hasil pemindaian dari server.');
  }

  const blurrySet = new Set<ScanIdentityField>();
  if (Array.isArray(raw.blurryFields)) {
    for (const f of raw.blurryFields) {
      const key = String(f || '').trim() as ScanIdentityField;
      if (VALID_SCAN_FIELDS.has(key)) blurrySet.add(key);
    }
  }

  const issuesMap = new Map<string, string>();
  if (Array.isArray(raw.fieldIssues)) {
    for (const item of raw.fieldIssues) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const f = String(obj.field || '').trim();
      const reason = String(obj.reason || '').trim();
      if (f && reason) issuesMap.set(f, reason);
    }
  }

  // Strict field normalization & anti-partial guard
  const rawNikKk = sanitizeDigits(String(raw.nikKk || ''), 16);
  const nikKk = isValidNik16(rawNikKk) ? rawNikKk : '';
  if (!nikKk) {
    blurrySet.add('nikKk');
    if (!issuesMap.has('nikKk')) {
      issuesMap.set('nikKk', 'Nomor KK tidak terbaca utuh 16 digit pada foto KK — silakan isi manual.');
    }
  }

  const rawNikKtp = sanitizeDigits(String(raw.nikKtp || ''), 16);
  const nikKtp = isValidNik16(rawNikKtp) ? rawNikKtp : '';
  if (!nikKtp) {
    blurrySet.add('nikKtp');
    if (!issuesMap.has('nikKtp')) {
      issuesMap.set('nikKtp', 'NIK KTP tidak terbaca utuh 16 digit pada foto KTP — silakan isi manual.');
    }
  }

  const nama = String(raw.nama || '').trim().toUpperCase();
  if (!nama) {
    blurrySet.add('nama');
    if (!issuesMap.has('nama')) {
      issuesMap.set('nama', 'Nama lengkap pada KTP buram atau terpotong — silakan isi manual.');
    }
  }

  const rawAlamat = String(raw.alamat || '').trim();
  const alamat = rawAlamat ? formatAlamatLengkap(rawAlamat, true) : '';
  if (!alamat) {
    blurrySet.add('alamat');
    if (!issuesMap.has('alamat')) {
      issuesMap.set('alamat', 'Alamat pada KTP/KK kurang jelas — silakan isi manual.');
    }
  }

  const rtDigits = sanitizeDigits(String(raw.rt || ''), 3);
  const rt = rtDigits && Number(rtDigits) > 0 ? rtDigits.padStart(3, '0') : '';
  if (!rt) {
    blurrySet.add('rt');
    if (!issuesMap.has('rt')) {
      issuesMap.set('rt', 'Nomor RT pada KTP/KK kurang jelas — silakan isi manual.');
    }
  }

  const rwDigits = sanitizeDigits(String(raw.rw || ''), 3);
  const rw = rwDigits && Number(rwDigits) > 0 ? rwDigits.padStart(3, '0') : '';
  if (!rw) {
    blurrySet.add('rw');
    if (!issuesMap.has('rw')) {
      issuesMap.set('rw', 'Nomor RW pada KTP/KK kurang jelas — silakan isi manual.');
    }
  }

  const rawJob = String(raw.pekerjaan || '').trim();
  const matchedJob = matchPekerjaanOption(rawJob, params.pekerjaanOptions);
  if (!matchedJob) {
    blurrySet.add('pekerjaan');
    if (!issuesMap.has('pekerjaan')) {
      issuesMap.set(
        'pekerjaan',
        rawJob
          ? `Pekerjaan "${rawJob}" perlu dipilih manual dari daftar.`
          : 'Pekerjaan pada KTP/KK buram atau tidak terbaca — silakan pilih manual.'
      );
    }
  }

  const kelurahan = matchKelurahanOption(
    String(raw.kelurahan || ''),
    params.kelurahanOptions || []
  );

  const fieldIssues: KtpKkScanIssue[] = Array.from(issuesMap.entries()).map(([field, reason]) => ({
    field,
    reason,
  }));

  return {
    nikKk,
    nikKtp,
    nama,
    alamat,
    rt,
    rw,
    pekerjaan: matchedJob,
    kelurahan,
    ktpNameMatchesKk: raw.ktpNameMatchesKk !== false,
    blurryFields: Array.from(blurrySet),
    fieldIssues,
  };
}
