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

function buildImageDescriptor(
  doc: KpmDocumentFile,
  localOcrImage?: OcrImagePayload | null
): Record<string, string> {
  if (localOcrImage?.base64) {
    return {
      base64: localOcrImage.base64,
      mimeType: localOcrImage.mimeType || 'image/jpeg',
    };
  }
  const direct = (doc.directUrl || doc.dataUrl || '').trim();
  if (direct.startsWith('data:image/')) {
    const commaIdx = direct.indexOf(',');
    const meta = commaIdx >= 0 ? direct.slice(5, commaIdx) : '';
    const mimeType = meta.split(';')[0] || doc.mimeType || 'image/jpeg';
    const base64 = commaIdx >= 0 ? direct.slice(commaIdx + 1) : '';
    if (base64) return { base64, mimeType };
  }
  return {
    ...(doc.fileId ? { fileId: doc.fileId } : {}),
    ...(direct ? { url: direct } : {}),
    ...(doc.thumbnailUrl ? { thumbnailUrl: doc.thumbnailUrl } : {}),
  };
}

export async function scanKtpAndKkDocuments(params: {
  ktpDoc: KpmDocumentFile;
  kkDoc: KpmDocumentFile;
  ktpOcrImage?: OcrImagePayload | null;
  kkOcrImage?: OcrImagePayload | null;
  pekerjaanOptions: string[];
  kelurahanOptions?: string[];
}): Promise<KtpKkScanResult> {
  const requestBody = {
    ktp: buildImageDescriptor(params.ktpDoc, params.ktpOcrImage),
    kk: buildImageDescriptor(params.kkDoc, params.kkOcrImage),
    pekerjaanOptions: params.pekerjaanOptions,
    kelurahanOptions: params.kelurahanOptions || [],
  };

  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  let raw: RawOcrResponse | null = null;

  if (apiBase || !Capacitor.isNativePlatform()) {
    const endpoint = apiBase ? `${apiBase}/api/ocr/ktp-kk` : '/api/ocr/ktp-kk';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const json = (await response.json().catch(() => ({}))) as RawOcrResponse;
    if (!response.ok) {
      throw new Error(
        typeof json.error === 'string' && json.error
          ? json.error
          : `Gagal memindai foto KTP & KK (${response.status}).`
      );
    }
    raw = json;
  } else if (isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke<RawOcrResponse>('ocr-ktp-kk', {
      body: requestBody,
    });
    if (error) {
      throw new Error(
        error.message ||
          'Layanan scan KTP & KK untuk APK membutuhkan endpoint server (VITE_API_BASE_URL) atau Supabase Edge Function "ocr-ktp-kk".'
      );
    }
    if (data && typeof data.error === 'string' && data.error) {
      throw new Error(data.error);
    }
    raw = data;
  } else {
    throw new Error('Endpoint pemindaian KTP & KK belum tersedia pada lingkungan ini.');
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
