import { KeyboardEvent } from 'react';
import {
  INITIAL_ITEM_LIST,
  INITIAL_WILAYAH_LIST,
  KELURAHAN_BY_KECAMATAN,
} from '../data/kpmOptions';
import {
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmFieldChange,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';

const STORAGE_KEY = 'masdeta_kpm_records_v1';
const PENGELOLA_STORAGE_KEY = 'masdeta_pengelola_v1';
const PROPOSAL_STORAGE_KEY = 'masdeta_proposals_v1';
const LEGACY_ITEM_STORAGE_KEY = 'masdeta_items_v1';
const ITEM_STORAGE_KEY = 'masdeta_item_catalog_v2';
const LEGACY_PEKERJAAN_STORAGE_KEY = 'masdeta_pekerjaan_v1';
const PEKERJAAN_STORAGE_KEY = 'masdeta_pekerjaan_v2';
const WILAYAH_STORAGE_KEY = 'masdeta_wilayah_v1';
const INTERNAL_USERS_STORAGE_KEY = 'masdeta_internal_users_v1';
const PROPOSAL_HISTORY_STORAGE_KEY = 'masdeta_proposal_history_v1';
const KPM_AUDIT_STORAGE_KEY = 'masdeta_kpm_audit_v1';
const CLEAN_SLATE_KEY = 'masdeta_clean_slate_v1';
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_RAW_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function clearSampleRecordsOnce(): void {
  try {
    if (localStorage.getItem(CLEAN_SLATE_KEY) === 'done') return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENGELOLA_STORAGE_KEY);
    localStorage.removeItem(PROPOSAL_STORAGE_KEY);
    localStorage.removeItem(INTERNAL_USERS_STORAGE_KEY);
    localStorage.removeItem(PROPOSAL_HISTORY_STORAGE_KEY);
    localStorage.removeItem(KPM_AUDIT_STORAGE_KEY);
    localStorage.setItem(CLEAN_SLATE_KEY, 'done');
  } catch {
    // Ignore storage access errors
  }
}

export function isKecamatanProposal(proposal: string): boolean {
  const lower = proposal.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('kecamatan ') &&
    !lower.includes('kelurahan ') &&
    !lower.includes('desa ')
  );
}

export function getKelurahanOptionsForProposal(
  proposal: string,
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): string[] {
  if (!isKecamatanProposal(proposal)) return [];
  const lower = proposal.toLowerCase();

  // Search dynamic wilayah hierarchy first (longest kecamatan name match wins)
  const allKecamatans = wilayahList
    .flatMap((w) => w.kecamatanList)
    .sort((a, b) => b.nama.length - a.nama.length);

  const matchedDynamic = allKecamatans.find((kec) =>
    lower.includes(`kecamatan ${kec.nama.toLowerCase()}`)
  );
  if (matchedDynamic) return matchedDynamic.kelurahanList;

  const matchedFallback = Object.keys(KELURAHAN_BY_KECAMATAN).find((kec) =>
    lower.includes(`kecamatan ${kec.toLowerCase()}`)
  );
  return matchedFallback ? KELURAHAN_BY_KECAMATAN[matchedFallback] : [];
}

export function resolveProposalDomicile(
  proposalName: string,
  proposals: ProposalRecord[],
  tahun?: string,
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): { kabKota: string; kecamatan: string; kelurahan: string } {
  const trimmedName = proposalName.trim();
  const matchedProposal =
    (tahun
      ? proposals.find((p) => p.namaProposal === trimmedName && p.tahun === tahun)
      : undefined) ?? proposals.find((p) => p.namaProposal === trimmedName);

  let kabKota = matchedProposal?.kabKota?.trim() || '';
  let kecamatan = matchedProposal?.kecamatan?.trim() || '';
  let kelurahan = matchedProposal?.kelurahan?.trim() || '';

  if (kelurahan && !/^(kelurahan|desa)\s+/i.test(kelurahan)) {
    kelurahan = `Kelurahan ${kelurahan}`;
  }

  const lower = trimmedName.toLowerCase();

  if (!isKecamatanProposal(trimmedName)) {
    // Find matching kelurahan/desa across wilayahList if kelurahan or kecamatan is still missing
    if (!kelurahan || !kecamatan) {
      const flatVillages: { kabKota: string; kecamatan: string; kelurahan: string }[] = [];
      for (const kab of wilayahList) {
        for (const kec of kab.kecamatanList) {
          for (const kel of kec.kelurahanList) {
            flatVillages.push({ kabKota: kab.nama, kecamatan: kec.nama, kelurahan: kel });
          }
        }
      }
      flatVillages.sort((a, b) => b.kelurahan.length - a.kelurahan.length);

      const villageMatch = flatVillages.find((v) => {
        const vLower = v.kelurahan.toLowerCase();
        const bare = vLower.replace(/^(kelurahan|desa)\s+/i, '').trim();
        return (
          lower.includes(vLower) ||
          (kelurahan && vLower === kelurahan.toLowerCase()) ||
          (bare && (lower.includes(`kelurahan ${bare}`) || lower.includes(`desa ${bare}`)))
        );
      });

      if (villageMatch) {
        if (!kabKota) kabKota = villageMatch.kabKota;
        if (!kecamatan) kecamatan = villageMatch.kecamatan;
        if (!kelurahan) kelurahan = villageMatch.kelurahan;
      } else if (!kelurahan) {
        const extractMatch = trimmedName.match(/((?:Kelurahan|Desa)\s+.+)$/i);
        if (extractMatch) {
          kelurahan = capitalizeWords(extractMatch[1].trim());
        }
      }
    }
  } else if (!kecamatan) {
    const allKecamatans = wilayahList
      .flatMap((kab) => kab.kecamatanList.map((kec) => ({ kabKota: kab.nama, kecamatan: kec.nama })))
      .sort((a, b) => b.kecamatan.length - a.kecamatan.length);
    const kecMatch = allKecamatans.find((item) =>
      lower.includes(`kecamatan ${item.kecamatan.toLowerCase()}`)
    );
    if (kecMatch) {
      if (!kabKota) kabKota = kecMatch.kabKota;
      kecamatan = kecMatch.kecamatan;
    } else {
      const extractKec = trimmedName.match(/Kecamatan\s+(.+)$/i);
      if (extractKec) {
        kecamatan = capitalizeWords(extractKec[1].trim());
      }
    }
  }

  return { kabKota, kecamatan, kelurahan };
}

export function buildCombinedProposalName({
  kecamatan,
  kelurahan,
  jalan,
}: {
  kecamatan: string;
  kelurahan: string;
  jalan: string;
}): string {
  const cleanJalan = capitalizeWords(jalan.trim()).replace(/\s+/g, ' ');
  const jalanLabel = cleanJalan
    ? /^(jalan|jl\.?|gang|gg\.?|komp\.?|komplek)\b/i.test(cleanJalan)
      ? cleanJalan
      : `Jalan ${cleanJalan}`
    : '';

  const cleanKel = kelurahan.trim();
  const kelLabel = cleanKel
    ? /^(kelurahan|desa)\s+/i.test(cleanKel)
      ? cleanKel
      : `Kelurahan ${cleanKel}`
    : '';

  const cleanKec = kecamatan.trim();
  const kecLabel = cleanKec
    ? cleanKec.toLowerCase().startsWith('kecamatan ')
      ? cleanKec
      : `Kecamatan ${cleanKec}`
    : '';

  if (jalanLabel && kelLabel) return `${jalanLabel} ${kelLabel}`;
  if (jalanLabel && kecLabel) return `${jalanLabel} ${kecLabel}`;
  if (kelLabel) return kelLabel;
  if (kecLabel) return kecLabel;
  return '';
}

export function getValidationForDtsen(dtsen: string): 'accepted' | 'pending' | '' {
  if (!dtsen) return '';
  if (['1', '2', '3', '4'].includes(dtsen)) return 'accepted';
  return 'pending';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatUploadDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '';
  }
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function isValidNik16(value: string): boolean {
  return /^\d{16}$/.test(value.trim());
}

export function isValidRtRw(value: string): boolean {
  return /^0\d{2}$/.test(value.trim());
}

export function formatNikDisplay(nik: string): string {
  const digits = nik.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function sanitizeDigits(value: string, maxLen = 16): string {
  return value.replace(/\D/g, '').slice(0, maxLen);
}

export function capitalizeWords(value: string): string {
  return value.replace(/(^|\s)([a-z\u00e0-\u00ff])/g, (_, space: string, ch: string) => {
    return `${space}${ch.toUpperCase()}`;
  });
}

const ROMAN_1_TO_39: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
  XVI: 16,
  XVII: 17,
  XVIII: 18,
  XIX: 19,
  XX: 20,
  XXI: 21,
  XXII: 22,
  XXIII: 23,
  XXIV: 24,
  XXV: 25,
  XXVI: 26,
  XXVII: 27,
  XXVIII: 28,
  XXIX: 29,
  XXX: 30,
  XXXI: 31,
  XXXII: 32,
  XXXIII: 33,
  XXXIV: 34,
  XXXV: 35,
  XXXVI: 36,
  XXXVII: 37,
  XXXVIII: 38,
  XXXIX: 39,
};

export function formatAlamatLengkap(value: string, finalize = false): string {
  let result = value.replace(/ {2,}/g, ' ');
  // Wajib spasi setelah titik jika langsung diikuti huruf/angka
  result = result.replace(/\.([^\s.,/)])/g, '. $1');

  const jalanRegex = finalize
    ? /(^|[\s,/])(?:jalan|jln|jl)\.?(?=\s|,|\/|$)/gi
    : /(^|[\s,/])(?:jalan|jln|jl)\.?(?=\s|,|\/)/gi;
  result = result.replace(jalanRegex, '$1Jl.');

  const gangRegex = finalize
    ? /(^|[\s,/])(?:gang|gg)\.?(?=\s|,|\/|$)/gi
    : /(^|[\s,/])(?:gang|gg)\.?(?=\s|,|\/)/gi;
  result = result.replace(gangRegex, '$1Gg.');

  const romanRegex = finalize
    ? /(^|[\s,/])([IVXivx]{1,7})\.?(?=\s|,|\/|$)/g
    : /(^|[\s,/])([IVXivx]{1,7})(?=\s|,|\/)/g;
  result = result.replace(romanRegex, (full, prefix: string, token: string) => {
    const mapped = ROMAN_1_TO_39[token.toUpperCase()];
    return mapped ? `${prefix}${mapped}` : full;
  });

  result = capitalizeWords(result);
  return finalize ? result.trim() : result;
}

export function blockNonNumericKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const allowedKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Enter',
    'Escape',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];
  if (allowedKeys.includes(e.key)) return;
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
}

export async function processImageUpload(file: File): Promise<KpmDocumentFile> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Format file harus berupa gambar (JPG, PNG, atau WebP).');
  }

  if (file.size > MAX_RAW_SIZE_BYTES) {
    throw new Error('Ukuran file terlalu besar. Maksimal 15 MB per dokumen.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rawDataUrl);

  let targetWidth = image.naturalWidth || image.width;
  let targetHeight = image.naturalHeight || image.height;

  if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
    const scale = Math.min(MAX_DIMENSION / targetWidth, MAX_DIMENSION / targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser tidak mendukung pemrosesan gambar.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const compressedSize = estimateDataUrlByteSize(compressedDataUrl);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: compressedDataUrl,
    fileName: file.name,
    originalSize: file.size,
    compressedSize,
    width: targetWidth,
    height: targetHeight,
    mimeType: 'image/jpeg',
    uploadedAt: new Date().toISOString(),
  };
}

const ALLOWED_PROPOSAL_DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ALLOWED_PROPOSAL_DOC_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

export async function processProposalDocumentUpload(file: File): Promise<KpmDocumentFile> {
  if (file.type.startsWith('image/')) {
    return processImageUpload(file);
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_PROPOSAL_DOC_EXT.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = ALLOWED_PROPOSAL_DOC_MIME.includes(file.type);

  if (!hasAllowedExt && !hasAllowedMime) {
    throw new Error('Format file harus PDF, Word (.doc/.docx), Excel (.xls/.xlsx), atau gambar.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran dokumen terlalu besar. Maksimal 5 MB per berkas.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const fallbackMime = lowerName.endsWith('.pdf')
    ? 'application/pdf'
    : lowerName.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : lowerName.endsWith('.doc')
        ? 'application/msword'
        : lowerName.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : lowerName.endsWith('.xls')
            ? 'application/vnd.ms-excel'
            : 'application/octet-stream';

  return {
    id: `pdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl,
    fileName: file.name,
    originalSize: file.size,
    compressedSize: file.size,
    width: 0,
    height: 0,
    mimeType: file.type || fallbackMime,
    uploadedAt: new Date().toISOString(),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File gambar rusak atau format tidak didukung.'));
    img.src = src;
  });
}

function estimateDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function loadKpmRecords(fallback: KpmRecord[]): KpmRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.map((rec) => {
      const rawLainnya = rec?.documents?.lainnya;
      const normalizedLainnya = Array.isArray(rawLainnya)
        ? rawLainnya
        : rawLainnya
          ? [rawLainnya]
          : [];
      const rawRumah = rec?.documents?.rumah;
      const normalizedRumah = Array.isArray(rawRumah)
        ? rawRumah
        : rawRumah
          ? [rawRumah]
          : [];
      return {
        kecamatan: '',
        kelurahan: '',
        ...rec,
        documents: {
          ...rec?.documents,
          rumah: normalizedRumah,
          lainnya: normalizedLainnya,
        },
      };
    });
  } catch {
    return fallback;
  }
}

export function saveKpmRecords(records: KpmRecord[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function loadPengelolaList(fallback: PengelolaProfile[]): PengelolaProfile[] {
  try {
    const raw = localStorage.getItem(PENGELOLA_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function savePengelolaList(list: PengelolaProfile[]): boolean {
  try {
    localStorage.setItem(PENGELOLA_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadProposals(fallback: ProposalRecord[]): ProposalRecord[] {
  try {
    const raw = localStorage.getItem(PROPOSAL_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const validTipes = new Set(['Murni', 'Perubahan', 'Database', 'Arsip']);
    return parsed.map((prop: ProposalRecord) => ({
      ...prop,
      tipe: validTipes.has(prop.tipe) ? prop.tipe : 'Murni',
    }));
  } catch {
    return fallback;
  }
}

export function saveProposals(list: ProposalRecord[]): boolean {
  try {
    localStorage.setItem(PROPOSAL_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function generateRegisterCode(tahun: string, item: string, count: number): string {
  const seq = String(count + 1).padStart(3, '0');
  const itemCode = item || 'BNS';
  return `${seq}. ${tahun} - ${itemCode}`;
}

export function getAbsenSeq(registerCode: string): number {
  const match = registerCode.trim().match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 999999;
}

export function getItemHierarchyRank(
  itemCode: string,
  tahun: string,
  catalog: ItemBantuan[]
): number {
  const yearItems = getItemsForYear(catalog, tahun);
  const idx = yearItems.findIndex((i) => i.code === itemCode);
  return idx >= 0 ? idx : 9999;
}

export function recalculateProposalRegisterCodes(
  records: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): KpmRecord[] {
  if (records.length === 0) return records;

  // Group records by proposal + tahun
  const groups = new Map<string, KpmRecord[]>();
  for (const rec of records) {
    const key = `${rec.proposal}__${rec.tahun}`;
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const nextCodeById = new Map<string, string>();

  for (const group of groups.values()) {
    const sample = group[0];
    const matchedProposal =
      proposals.find(
        (p) => p.namaProposal === sample.proposal && p.tahun === sample.tahun
      ) ?? proposals.find((p) => p.namaProposal === sample.proposal);
    const targetCount = matchedProposal?.jumlahKpm ?? 66;
    const isFinalizedOrder = targetCount > 0 && group.length >= targetCount;

    const sorted = [...group].sort((a, b) => {
      if (!isFinalizedOrder) {
        return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      }

      // Hierarchy: Item (per year) -> Kecamatan -> RW -> RT -> Kelurahan -> Inisial/Nama KPM
      const rankA = getItemHierarchyRank(a.item, a.tahun, catalog);
      const rankB = getItemHierarchyRank(b.item, b.tahun, catalog);
      if (rankA !== rankB) return rankA - rankB;
      const itemCmp = a.item.localeCompare(b.item, 'id');
      if (itemCmp !== 0) return itemCmp;

      const domA = resolveProposalDomicile(a.proposal, proposals, a.tahun, wilayahList);
      const domB = resolveProposalDomicile(b.proposal, proposals, b.tahun, wilayahList);
      const kecA = (a.kecamatan || domA.kecamatan || '').trim();
      const kecB = (b.kecamatan || domB.kecamatan || '').trim();
      const kecCmp = kecA.localeCompare(kecB, 'id');
      if (kecCmp !== 0) return kecCmp;

      const rwNumA = parseInt(a.rw || '0', 10) || 0;
      const rwNumB = parseInt(b.rw || '0', 10) || 0;
      if (rwNumA !== rwNumB) return rwNumA - rwNumB;

      const rtNumA = parseInt(a.rt || '0', 10) || 0;
      const rtNumB = parseInt(b.rt || '0', 10) || 0;
      if (rtNumA !== rtNumB) return rtNumA - rtNumB;

      const kelA = (a.kelurahan || domA.kelurahan || '').trim();
      const kelB = (b.kelurahan || domB.kelurahan || '').trim();
      const kelCmp = kelA.localeCompare(kelB, 'id');
      if (kelCmp !== 0) return kelCmp;

      const namaCmp = a.nama.localeCompare(b.nama, 'id');
      if (namaCmp !== 0) return namaCmp;

      return a.createdAt.localeCompare(b.createdAt);
    });

    sorted.forEach((rec, idx) => {
      const seq = String(idx + 1).padStart(3, '0');
      nextCodeById.set(rec.id, `${seq}. ${rec.tahun} - ${rec.item || 'BNS'}`);
    });
  }

  let changed = false;
  const updated = records.map((rec) => {
    const nextCode = nextCodeById.get(rec.id);
    if (nextCode && nextCode !== rec.registerCode) {
      changed = true;
      return { ...rec, registerCode: nextCode };
    }
    return rec;
  });

  return changed ? updated : records;
}

export function normalizeSubItemKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function loadItemList(fallback: ItemBantuan[]): ItemBantuan[] {
  try {
    const raw = localStorage.getItem(ITEM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: Partial<ItemBantuan>) => ({
          id: item.id || `${item.tahun || '2026'}-${item.code || 'ITEM'}`,
          tahun: String(item.tahun || '2026'),
          code: String(item.code || '').toUpperCase(),
          name: String(item.name || item.code || ''),
          subItems: Array.isArray(item.subItems)
            ? item.subItems.map((s) => String(s).trim()).filter(Boolean)
            : [],
        }));
      }
    }

    // Migrate custom items from legacy v1 key if present, preserving full year catalog
    const legacyRaw = localStorage.getItem(LEGACY_ITEM_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (Array.isArray(legacyParsed)) {
        const knownCodes = new Set(fallback.map((f) => f.code));
        const extraItems: ItemBantuan[] = [];
        for (const oldItem of legacyParsed) {
          const code = String(oldItem?.code || '').trim().toUpperCase();
          if (code && !knownCodes.has(code)) {
            knownCodes.add(code);
            extraItems.push({
              id: `2026-${code}`,
              tahun: '2026',
              code,
              name: String(oldItem?.name || code),
              subItems: [String(oldItem?.name || code)],
            });
          }
        }
        return [...fallback, ...extraItems];
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function loadProposalHistory(
  fallback: ProposalKpmHistoryEntry[]
): ProposalKpmHistoryEntry[] {
  try {
    const raw = localStorage.getItem(PROPOSAL_HISTORY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveProposalHistory(list: ProposalKpmHistoryEntry[]): boolean {
  try {
    localStorage.setItem(PROPOSAL_HISTORY_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function saveItemList(list: ItemBantuan[]): boolean {
  try {
    localStorage.setItem(ITEM_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function getItemsForYear(catalog: ItemBantuan[], tahun: string): ItemBantuan[] {
  if (!tahun || tahun === 'all') {
    const map = new Map<string, ItemBantuan>();
    // Prefer newest year definition when showing across all years
    const sorted = [...catalog].sort((a, b) => b.tahun.localeCompare(a.tahun));
    for (const item of sorted) {
      if (!map.has(item.code)) {
        map.set(item.code, item);
      }
    }
    return Array.from(map.values());
  }
  return catalog.filter((item) => item.tahun === tahun);
}

export function resolvePackageForKpm(
  catalog: ItemBantuan[],
  tahun: string,
  code: string
): ItemBantuan {
  const exact = catalog.find((item) => item.tahun === tahun && item.code === code);
  if (exact) return exact;

  const fallbackMatch = [...catalog]
    .filter((item) => item.code === code)
    .sort((a, b) => b.tahun.localeCompare(a.tahun))[0];
  if (fallbackMatch) return fallbackMatch;

  const initialMatch = INITIAL_ITEM_LIST.find((item) => item.code === code);
  if (initialMatch) return initialMatch;

  return {
    tahun,
    code,
    name: code,
    subItems: [],
  };
}

export interface ResolvedKpmSubItem {
  key: string;
  name: string;
  delivered: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export function getKpmSubItemStatusList(
  record: KpmRecord,
  catalog: ItemBantuan[]
): ResolvedKpmSubItem[] {
  const pkg = resolvePackageForKpm(catalog, record.tahun, record.item);
  const deliveries = record.subItemDeliveries || {};

  return pkg.subItems.map((subName) => {
    const key = normalizeSubItemKey(subName);
    const state = deliveries[key] ?? deliveries[subName];
    return {
      key,
      name: subName,
      delivered: Boolean(state?.delivered),
      updatedAt: state?.updatedAt,
      updatedBy: state?.updatedBy,
    };
  });
}

export interface SubItemPackageSource {
  code: string;
  name: string;
  total: number;
  delivered: number;
  pending: number;
}

export interface SubItemAggregateRow {
  key: string;
  name: string;
  totalNeeded: number;
  deliveredCount: number;
  pendingCount: number;
  packageSources: SubItemPackageSource[];
  owedKpmIds: string[];
}

export interface KpmSubItemDebtRow {
  record: KpmRecord;
  packageName: string;
  totalSubItems: number;
  deliveredItems: ResolvedKpmSubItem[];
  pendingItems: ResolvedKpmSubItem[];
  debtStatus: 'complete' | 'partial' | 'unstarted';
}

export function computeSubItemRecap(
  records: KpmRecord[],
  catalog: ItemBantuan[]
): {
  aggregates: SubItemAggregateRow[];
  kpmRows: KpmSubItemDebtRow[];
  totalUnits: number;
  totalDelivered: number;
  totalPending: number;
} {
  const aggMap = new Map<
    string,
    {
      key: string;
      name: string;
      totalNeeded: number;
      deliveredCount: number;
      pendingCount: number;
      packageMap: Map<string, SubItemPackageSource>;
      owedKpmIds: string[];
    }
  >();

  const kpmRows: KpmSubItemDebtRow[] = [];
  let totalUnits = 0;
  let totalDelivered = 0;
  let totalPending = 0;

  for (const rec of records) {
    const pkg = resolvePackageForKpm(catalog, rec.tahun, rec.item);
    const statuses = getKpmSubItemStatusList(rec, catalog);
    const deliveredItems = statuses.filter((s) => s.delivered);
    const pendingItems = statuses.filter((s) => !s.delivered);

    const debtStatus: KpmSubItemDebtRow['debtStatus'] =
      statuses.length === 0 || pendingItems.length === 0
        ? 'complete'
        : deliveredItems.length > 0
          ? 'partial'
          : 'unstarted';

    kpmRows.push({
      record: rec,
      packageName: pkg.name,
      totalSubItems: statuses.length,
      deliveredItems,
      pendingItems,
      debtStatus,
    });

    for (const sub of statuses) {
      totalUnits += 1;
      if (sub.delivered) totalDelivered += 1;
      else totalPending += 1;

      const existing = aggMap.get(sub.key) ?? {
        key: sub.key,
        name: sub.name,
        totalNeeded: 0,
        deliveredCount: 0,
        pendingCount: 0,
        packageMap: new Map<string, SubItemPackageSource>(),
        owedKpmIds: [],
      };

      existing.totalNeeded += 1;
      if (sub.delivered) {
        existing.deliveredCount += 1;
      } else {
        existing.pendingCount += 1;
        existing.owedKpmIds.push(rec.id);
      }

      const pkgEntry = existing.packageMap.get(pkg.code) ?? {
        code: pkg.code,
        name: pkg.name,
        total: 0,
        delivered: 0,
        pending: 0,
      };
      pkgEntry.total += 1;
      if (sub.delivered) pkgEntry.delivered += 1;
      else pkgEntry.pending += 1;
      existing.packageMap.set(pkg.code, pkgEntry);

      aggMap.set(sub.key, existing);
    }
  }

  const aggregates: SubItemAggregateRow[] = Array.from(aggMap.values())
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      totalNeeded: entry.totalNeeded,
      deliveredCount: entry.deliveredCount,
      pendingCount: entry.pendingCount,
      packageSources: Array.from(entry.packageMap.values()).sort((a, b) => b.total - a.total),
      owedKpmIds: entry.owedKpmIds,
    }))
    .sort((a, b) => b.pendingCount - a.pendingCount || b.totalNeeded - a.totalNeeded || a.name.localeCompare(b.name));

  return {
    aggregates,
    kpmRows,
    totalUnits,
    totalDelivered,
    totalPending,
  };
}

export function loadPekerjaanList(fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(PEKERJAAN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // Migrate any custom entries from v1 key into comprehensive default list
    const legacyRaw = localStorage.getItem(LEGACY_PEKERJAAN_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (Array.isArray(legacyParsed)) {
        const merged = [...fallback];
        const lowerSet = new Set(merged.map((m) => m.toLowerCase()));
        for (const item of legacyParsed) {
          const clean = String(item || '').trim();
          if (clean && !lowerSet.has(clean.toLowerCase())) {
            lowerSet.add(clean.toLowerCase());
            merged.push(clean);
          }
        }
        return merged.sort((a, b) => a.localeCompare(b));
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function savePekerjaanList(list: string[]): boolean {
  try {
    localStorage.setItem(PEKERJAAN_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadWilayahList(fallback: WilayahKabKota[]): WilayahKabKota[] {
  try {
    const raw = localStorage.getItem(WILAYAH_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveWilayahList(list: WilayahKabKota[]): boolean {
  try {
    localStorage.setItem(WILAYAH_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadInternalUsers(fallback: InternalUser[]): InternalUser[] {
  try {
    const raw = localStorage.getItem(INTERNAL_USERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveInternalUsers(list: InternalUser[]): boolean {
  try {
    localStorage.setItem(INTERNAL_USERS_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function exportKpmRecordsToCsv(
  records: KpmRecord[],
  filename: string,
  catalog: ItemBantuan[] = INITIAL_ITEM_LIST
): void {
  const headers = [
    'Kode Register',
    'Tahun',
    'Proposal',
    'Kecamatan',
    'Kelurahan',
    'Item',
    'Nama KPM',
    'NIK KTP',
    'NIK KK',
    'Alamat',
    'RT',
    'RW',
    'Pekerjaan',
    'Pengelola',
    'DTSEN',
    'Validasi',
    'Biaya Administrasi',
    'Kontak',
    'Sub-Item Diterima',
    'Sub-Item Belum Diterima (Hutang)',
    'Catatan',
  ];

  const escapeCsv = (val: string | number | undefined) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map((r) => {
    const subStatuses = getKpmSubItemStatusList(r, catalog);
    const deliveredNames = subStatuses
      .filter((s) => s.delivered)
      .map((s) => s.name)
      .join('; ');
    const pendingNames = subStatuses
      .filter((s) => !s.delivered)
      .map((s) => s.name)
      .join('; ');

    return [
      r.registerCode,
      r.tahun,
      r.proposal,
      r.kecamatan || '',
      r.kelurahan || '',
      r.item,
      r.nama,
      `'${r.nikKtp}`,
      `'${r.nikKk}`,
      r.alamat,
      r.rt,
      r.rw,
      r.pekerjaan,
      r.pengelola,
      r.dtsen,
      r.validasi === 'accepted' ? 'Diterima' : r.validasi === 'rejected' ? 'Ditolak' : 'Menunggu',
      r.payment,
      r.kontak || '',
      deliveredNames,
      pendingNames,
      r.catatan || '',
    ];
  });

  const csvContent =
    '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSubItemRecapToCsv(
  aggregates: SubItemAggregateRow[],
  filename: string
): void {
  const headers = [
    'Sub-Item',
    'Total Kebutuhan (Unit)',
    'Sudah Diterima',
    'Belum Diterima / Hutang',
    'Rincian Asal Paket',
  ];

  const escapeCsv = (val: string | number | undefined) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = aggregates.map((row) => [
    row.name,
    row.totalNeeded,
    row.deliveredCount,
    row.pendingCount,
    row.packageSources.map((p) => `${p.code}: ${p.total} (Kurang ${p.pending})`).join('; '),
  ]);

  const csvContent =
    '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function loadKpmAuditLogs(fallback: KpmAuditLogEntry[]): KpmAuditLogEntry[] {
  try {
    const raw = localStorage.getItem(KPM_AUDIT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveKpmAuditLogs(logs: KpmAuditLogEntry[]): boolean {
  try {
    localStorage.setItem(KPM_AUDIT_STORAGE_KEY, JSON.stringify(logs));
    return true;
  } catch {
    return false;
  }
}

export function formatValidationLabel(status: ValidationStatus | ''): string {
  if (status === 'accepted') return 'Diterima';
  if (status === 'rejected') return 'Ditolak';
  if (status === 'pending') return 'Menunggu';
  return 'Kosong';
}

export function diffKpmRecordChanges(
  prev: KpmRecord,
  next: KpmFormValues
): KpmFieldChange[] {
  const changes: KpmFieldChange[] = [];

  const compare = (field: string, beforeVal: string, afterVal: string) => {
    const b = beforeVal.trim() || 'Kosong';
    const a = afterVal.trim() || 'Kosong';
    if (b !== a) {
      changes.push({ field, before: b, after: a });
    }
  };

  compare('Tahun', prev.tahun, next.tahun);
  compare('Proposal', prev.proposal, next.proposal);
  compare('Kecamatan', prev.kecamatan || '', next.kecamatan || '');
  compare('Kelurahan', prev.kelurahan || '', next.kelurahan || '');
  compare('Item Bantuan', prev.item, next.item);
  compare('Nama Lengkap', prev.nama, next.nama);
  compare('Alamat', prev.alamat, next.alamat);
  compare('RT', prev.rt, next.rt);
  compare('RW', prev.rw, next.rw);
  compare('Nomor KK', prev.nikKk, next.nikKk);
  compare('NIK KTP', prev.nikKtp, next.nikKtp);
  compare('Status DTSEN', prev.dtsen, next.dtsen);
  compare(
    'Status Validasi',
    formatValidationLabel(prev.validasi),
    formatValidationLabel(next.validasi || prev.validasi)
  );
  compare('Nomor HP', prev.kontak || '', next.kontak || '');
  compare('Pekerjaan', prev.pekerjaan, next.pekerjaan);
  compare('Pengelola', prev.pengelola, next.pengelola);
  compare('Catatan Petugas', prev.catatan || '', next.catatan || '');

  if ((prev.payment || 0) !== (next.payment || 0)) {
    changes.push({
      field: 'Biaya Administrasi',
      before: formatRupiah(prev.payment || 0),
      after: formatRupiah(next.payment || 0),
    });
  }

  const compareDoc = (label: string, beforeDoc?: KpmDocumentFile, afterDoc?: KpmDocumentFile) => {
    const b = beforeDoc ? beforeDoc.fileName : 'Kosong';
    const a = afterDoc ? afterDoc.fileName : 'Kosong';
    if ((beforeDoc?.id || '') !== (afterDoc?.id || '')) {
      changes.push({ field: label, before: b, after: a });
    }
  };

  compareDoc('Foto KTP', prev.documents.ktp, next.documents.ktp);
  compareDoc('Foto KK', prev.documents.kk, next.documents.kk);
  compareDoc('Foto Penerima', prev.documents.penerima, next.documents.penerima);
  compareDoc('Foto Survey', prev.documents.survey, next.documents.survey);

  const prevRumahCount = Array.isArray(prev.documents.rumah) ? prev.documents.rumah.length : 0;
  const nextRumahCount = Array.isArray(next.documents.rumah) ? next.documents.rumah.length : 0;
  const prevRumahIds = (prev.documents.rumah || []).map((d) => d.id).join(',');
  const nextRumahIds = (next.documents.rumah || []).map((d) => d.id).join(',');
  if (prevRumahIds !== nextRumahIds) {
    changes.push({
      field: 'Foto Rumah',
      before: `${prevRumahCount} foto`,
      after: `${nextRumahCount} foto`,
    });
  }

  const prevLainnyaCount = (prev.documents.lainnya || []).length;
  const nextLainnyaCount = (next.documents.lainnya || []).length;
  const prevLainnyaIds = (prev.documents.lainnya || []).map((d) => d.id).join(',');
  const nextLainnyaIds = (next.documents.lainnya || []).map((d) => d.id).join(',');
  if (prevLainnyaIds !== nextLainnyaIds) {
    changes.push({
      field: 'Foto Lainnya',
      before: `${prevLainnyaCount} foto`,
      after: `${nextLainnyaCount} foto`,
    });
  }

  return changes;
}


