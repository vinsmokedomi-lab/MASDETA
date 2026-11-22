import { KeyboardEvent } from 'react';
import {
  INITIAL_ITEM_LIST,
  INITIAL_WILAYAH_LIST,
  KELURAHAN_BY_KECAMATAN,
  SUB_ITEM_SATUAN_OPTIONS,
} from '../data/kpmOptions';
import {
  buildDriveDownloadUrl,
  buildDriveFallbackThumbnailUrl,
  deleteMediaFromDrive,
  DriveMediaResult,
  extractDriveFileId,
  measureImageFileDimensions,
  replaceMediaInDrive,
  uploadMediaToDrive,
} from '../services/driveManager';
import {
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmDocuments,
  KpmFieldChange,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalEmptySlot,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ProposalSlotMap,
  ProposalSlotState,
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
const CUSTOM_YEARS_STORAGE_KEY = 'masdeta_custom_years_v1';
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

export function normalizeWilayahToken(
  value: string | undefined | null,
  kind: 'kelurahan' | 'kecamatan'
): string {
  const cleaned = (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (kind === 'kelurahan') {
    return cleaned.replace(/^(?:kelurahan|kel\.?|desa|ds\.?)\s+/i, '').trim();
  }
  return cleaned.replace(/^(?:kecamatan|kec\.?)\s+/i, '').trim();
}

export function resolveProposalAreaScope(
  proposalName: string,
  proposals: ProposalRecord[],
  proposalTahun?: string,
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): {
  hasScope: boolean;
  scopeType: 'kelurahan' | 'kecamatan' | 'none';
  normalizedTarget: string;
  scopeLabel: string;
} {
  const dom = resolveProposalDomicile(proposalName, proposals, proposalTahun, wilayahList);
  const isKecProp = isKecamatanProposal(proposalName);
  const targetKel = isKecProp ? '' : normalizeWilayahToken(dom.kelurahan, 'kelurahan');
  const targetKec = normalizeWilayahToken(dom.kecamatan, 'kecamatan');

  if (targetKel) {
    const label = dom.kelurahan.trim() || `Kelurahan ${capitalizeWords(targetKel)}`;
    return {
      hasScope: true,
      scopeType: 'kelurahan',
      normalizedTarget: targetKel,
      scopeLabel: label,
    };
  }
  if (targetKec) {
    const bareKec = dom.kecamatan.replace(/^(?:kecamatan|kec\.?)\s+/i, '').trim();
    return {
      hasScope: true,
      scopeType: 'kecamatan',
      normalizedTarget: targetKec,
      scopeLabel: `Kecamatan ${bareKec || capitalizeWords(targetKec)}`,
    };
  }
  return {
    hasScope: false,
    scopeType: 'none',
    normalizedTarget: '',
    scopeLabel: '',
  };
}

export function doesKpmMatchProposalDomicile(params: {
  record: Pick<KpmRecord, 'kabKota' | 'kecamatan' | 'kelurahan' | 'proposal' | 'proposalId' | 'tahun'>;
  proposalName: string;
  proposalTahun?: string;
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
}): boolean {
  const {
    record,
    proposalName,
    proposalTahun,
    proposals,
    wilayahList = INITIAL_WILAYAH_LIST,
  } = params;
  const scope = resolveProposalAreaScope(proposalName, proposals, proposalTahun, wilayahList);
  if (!scope.hasScope) return true;

  const kpmDom = resolveKpmDomicile(record, proposals, wilayahList);
  if (scope.scopeType === 'kelurahan') {
    const candKel = normalizeWilayahToken(kpmDom.kelurahan || record.kelurahan, 'kelurahan');
    return Boolean(candKel && candKel === scope.normalizedTarget);
  }
  if (scope.scopeType === 'kecamatan') {
    const candKec = normalizeWilayahToken(kpmDom.kecamatan || record.kecamatan, 'kecamatan');
    return Boolean(candKec && candKec === scope.normalizedTarget);
  }
  return true;
}

export function isLegacyDummyProposal(prop: { tipe?: unknown; namaProposal?: string }): boolean {
  const tipeStr = String(prop?.tipe || '').trim();
  return tipeStr !== 'Murni' && tipeStr !== 'Perubahan';
}

export function resolveKpmDomicile(
  record: Pick<KpmRecord, 'kabKota' | 'kecamatan' | 'kelurahan' | 'proposal' | 'proposalId' | 'tahun'>,
  proposals: ProposalRecord[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): { kabKota: string; kecamatan: string; kelurahan: string } {
  let kabKota = (record.kabKota || '').trim();
  let kecamatan = (record.kecamatan || '').trim();
  let kelurahan = (record.kelurahan || '').trim();

  const propName = (record.proposal || '').trim();
  if (propName) {
    const matchedProp =
      (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
      resolveProposalDomicile(propName, proposals, record.tahun, wilayahList);
    if ('namaProposal' in matchedProp) {
      const dom = resolveProposalDomicile(matchedProp.namaProposal, proposals, matchedProp.tahun, wilayahList);
      if (!kabKota) kabKota = matchedProp.kabKota?.trim() || dom.kabKota;
      if (!kecamatan) kecamatan = matchedProp.kecamatan?.trim() || dom.kecamatan;
      if (!kelurahan) kelurahan = matchedProp.kelurahan?.trim() || dom.kelurahan;
    } else {
      if (!kabKota) kabKota = matchedProp.kabKota;
      if (!kecamatan) kecamatan = matchedProp.kecamatan;
      if (!kelurahan) kelurahan = matchedProp.kelurahan;
    }
  }

  if ((!kabKota || !kecamatan) && kelurahan) {
    const kelLower = kelurahan.toLowerCase();
    const bareKel = kelLower.replace(/^(kelurahan|desa)\s+/i, '').trim();
    outer: for (const w of wilayahList) {
      for (const kec of w.kecamatanList) {
        const hit = kec.kelurahanList.some((k) => {
          const kLow = k.toLowerCase();
          return kLow === kelLower || kLow.replace(/^(kelurahan|desa)\s+/i, '').trim() === bareKel;
        });
        if (hit) {
          if (!kabKota) kabKota = w.nama;
          if (!kecamatan) kecamatan = kec.nama;
          break outer;
        }
      }
    }
  }

  if (!kabKota && kecamatan) {
    const kecBare = kecamatan.replace(/^kecamatan\s+/i, '').trim().toLowerCase();
    const matchedKab = wilayahList.find((w) =>
      w.kecamatanList.some((k) => k.nama.toLowerCase() === kecBare)
    );
    if (matchedKab) kabKota = matchedKab.nama;
  }

  return { kabKota, kecamatan, kelurahan };
}

export function normalizeKpmRouting(
  record: KpmRecord,
  proposals: ProposalRecord[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): KpmRecord {
  const dom = resolveKpmDomicile(record, proposals, wilayahList);
  const rawTahun = (record.tahun || '').trim();
  const tahun = rawTahun.toLowerCase() === 'tanpa tahun' ? '' : rawTahun.slice(0, 10);

  if (record.validasi !== 'accepted') {
    return {
      ...record,
      tahun: '',
      proposalId: null,
      proposal: '',
      kabKota: dom.kabKota,
      kecamatan: dom.kecamatan,
      kelurahan: dom.kelurahan,
    };
  }

  const activeProposals = proposals.filter((p) => !isLegacyDummyProposal(p));
  const matchedProp =
    (record.proposalId ? activeProposals.find((p) => p.id === record.proposalId) : undefined) ??
    (record.proposal
      ? activeProposals.find(
          (p) => p.namaProposal === record.proposal && (!tahun || p.tahun === tahun)
        ) ?? activeProposals.find((p) => p.namaProposal === record.proposal)
      : undefined);

  if (!matchedProp && !record.proposal?.trim()) {
    return {
      ...record,
      tahun: '',
      validasi: 'pending',
      proposalId: null,
      proposal: '',
      kabKota: dom.kabKota,
      kecamatan: dom.kecamatan,
      kelurahan: dom.kelurahan,
    };
  }

  return {
    ...record,
    tahun: tahun || matchedProp?.tahun || '',
    proposalId: matchedProp?.id ?? record.proposalId ?? null,
    proposal: matchedProp?.namaProposal ?? (record.proposal || '').trim(),
    kabKota: dom.kabKota,
    kecamatan: dom.kecamatan,
    kelurahan: dom.kelurahan,
  };
}

export function formatKecamatanCategoryLabel(rawKecamatan?: string): string {
  const trimmed = (rawKecamatan || '').trim();
  if (!trimmed) return 'Wilayah Lainnya';
  const withoutPrefix = trimmed.replace(/^kecamatan\s+/i, '').trim();
  if (!withoutPrefix) return 'Wilayah Lainnya';
  return `Kecamatan ${capitalizeWords(withoutPrefix)}`;
}

export function resolveProposalKecamatanCategory(
  proposalName: string,
  proposals: ProposalRecord[],
  tahun?: string,
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): string {
  const domicile = resolveProposalDomicile(proposalName, proposals, tahun, wilayahList);
  if (domicile.kecamatan) {
    return formatKecamatanCategoryLabel(domicile.kecamatan);
  }

  const lower = proposalName.trim().toLowerCase();
  const allKecamatans = wilayahList
    .flatMap((w) => w.kecamatanList.map((k) => k.nama))
    .sort((a, b) => b.length - a.length);
  const directKec = allKecamatans.find((kec) => lower.includes(kec.toLowerCase()));
  if (directKec) {
    return formatKecamatanCategoryLabel(directKec);
  }

  const regexMatch = proposalName.match(/Kecamatan\s+([^,/-]+)/i);
  if (regexMatch) {
    return formatKecamatanCategoryLabel(regexMatch[1]);
  }

  return 'Wilayah Lainnya';
}

export function sortProposalsWithinKecamatan<T>(
  items: T[],
  getName: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const nameA = getName(a);
    const nameB = getName(b);
    const isKecA = isKecamatanProposal(nameA);
    const isKecB = isKecamatanProposal(nameB);
    if (isKecA !== isKecB) return isKecA ? -1 : 1;
    return nameA.localeCompare(nameB, 'id');
  });
}

export function sortKecamatanCategoryNames(a: string, b: string): number {
  if (a === 'Wilayah Lainnya' && b !== 'Wilayah Lainnya') return 1;
  if (b === 'Wilayah Lainnya' && a !== 'Wilayah Lainnya') return -1;
  return a.localeCompare(b, 'id');
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

export const HIGH_DESIL_VALUES = new Set(['5', '6', '7', '8', '9', '10', '6 - 10']);

export function isArchivedKpm(record: KpmRecord): boolean {
  return record.validasi === 'rejected';
}

export function formatWhatsAppUrl(phone?: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  let normalized = digits;
  if (normalized.startsWith('0')) {
    normalized = `62${normalized.slice(1)}`;
  } else if (normalized.startsWith('8')) {
    normalized = `62${normalized}`;
  }
  return `https://wa.me/${normalized}`;
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

export async function processImageUpload(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<KpmDocumentFile> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Format file harus berupa gambar (JPG, PNG, atau WebP).');
  }

  if (file.size > MAX_RAW_SIZE_BYTES) {
    throw new Error('Ukuran file terlalu besar. Maksimal 15 MB per dokumen.');
  }

  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const quality = options?.quality ?? JPEG_QUALITY;

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rawDataUrl);

  let targetWidth = image.naturalWidth || image.width;
  let targetHeight = image.naturalHeight || image.height;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    const scale = Math.min(maxDim / targetWidth, maxDim / targetHeight);
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

  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
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

export function getDocumentDirectUrl(doc?: KpmDocumentFile | null): string {
  if (!doc) return '';
  return (doc.directUrl || doc.dataUrl || '').trim();
}

export function getDocumentThumbnailUrl(doc?: KpmDocumentFile | null): string {
  if (!doc) return '';
  if (doc.thumbnailUrl) return doc.thumbnailUrl;
  const target = doc.fileId || doc.directUrl || doc.dataUrl;
  return buildDriveFallbackThumbnailUrl(target) || doc.dataUrl || '';
}

export function getDocumentViewUrl(doc?: KpmDocumentFile | null): string {
  if (!doc) return '';
  if (doc.viewUrl) return doc.viewUrl;
  const fileId = doc.fileId || extractDriveFileId(doc.directUrl || doc.dataUrl);
  if (fileId) return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  return doc.directUrl || doc.dataUrl || '';
}

export function getDocumentDownloadHref(doc?: KpmDocumentFile | null): string {
  if (!doc) return '';
  const target = doc.fileId || doc.directUrl || doc.dataUrl;
  if (target.startsWith('data:')) return target;
  return buildDriveDownloadUrl(target);
}

export function buildKpmDocumentFileFromDrive(
  file: File,
  driveResult: DriveMediaResult,
  dims: { width: number; height: number } = { width: 0, height: 0 },
  prefix = 'doc'
): KpmDocumentFile {
  const lowerName = file.name.toLowerCase();
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
            : 'image/jpeg';

  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: driveResult.directUrl,
    fileId: driveResult.fileId,
    directUrl: driveResult.directUrl,
    thumbnailUrl: driveResult.thumbnailUrl,
    viewUrl: driveResult.viewUrl,
    fileName: file.name,
    originalSize: file.size,
    compressedSize: file.size,
    width: dims.width,
    height: dims.height,
    mimeType: file.type || fallbackMime,
    uploadedAt: new Date().toISOString(),
  };
}

export function validateImageUploadFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Format file harus berupa gambar (JPG, PNG, atau WebP).');
  }
  if (file.size > MAX_RAW_SIZE_BYTES) {
    throw new Error('Ukuran file terlalu besar. Maksimal 15 MB per dokumen.');
  }
}

export function validateProposalDocumentFile(file: File): void {
  if (file.type.startsWith('image/')) {
    if (file.size > MAX_RAW_SIZE_BYTES) {
      throw new Error('Ukuran gambar terlalu besar. Maksimal 15 MB per file.');
    }
    return;
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_PROPOSAL_DOC_EXT.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = ALLOWED_PROPOSAL_DOC_MIME.includes(file.type);

  if (!hasAllowedExt && !hasAllowedMime) {
    throw new Error('Format file harus PDF, Word (.doc/.docx), Excel (.xls/.xlsx), atau gambar.');
  }

  if (file.size > MAX_RAW_SIZE_BYTES) {
    throw new Error('Ukuran dokumen terlalu besar. Maksimal 15 MB per berkas.');
  }
}

export async function uploadImageDocumentToDrive(
  file: File,
  existingDoc?: KpmDocumentFile | null
): Promise<KpmDocumentFile> {
  validateImageUploadFile(file);
  const dims = await measureImageFileDimensions(file);
  const existingTarget = existingDoc?.fileId || existingDoc?.directUrl || existingDoc?.dataUrl || '';
  const driveResult =
    existingTarget && !existingTarget.startsWith('data:')
      ? await replaceMediaInDrive(file, existingTarget)
      : await uploadMediaToDrive(file);
  return buildKpmDocumentFileFromDrive(file, driveResult, dims, 'doc');
}

export async function uploadProposalDocumentToDrive(
  file: File,
  existingDoc?: KpmDocumentFile | null
): Promise<KpmDocumentFile> {
  validateProposalDocumentFile(file);
  const dims = file.type.startsWith('image/')
    ? await measureImageFileDimensions(file)
    : { width: 0, height: 0 };
  const existingTarget = existingDoc?.fileId || existingDoc?.directUrl || existingDoc?.dataUrl || '';
  const driveResult =
    existingTarget && !existingTarget.startsWith('data:')
      ? await replaceMediaInDrive(file, existingTarget)
      : await uploadMediaToDrive(file);
  return buildKpmDocumentFileFromDrive(file, driveResult, dims, 'pdoc');
}

export async function removeDocumentFromDrive(doc?: KpmDocumentFile | null): Promise<void> {
  if (!doc) return;
  const target = doc.fileId || doc.directUrl || doc.dataUrl;
  if (!target || target.startsWith('data:')) return;
  await deleteMediaFromDrive(target);
}

export async function processProposalDocumentUpload(file: File): Promise<KpmDocumentFile> {
  return uploadProposalDocumentToDrive(file);
}

export async function compressImageFileForOcr(
  file: File,
  maxEdge = 1600,
  quality = 0.86
): Promise<{ base64: string; mimeType: string }> {
  validateImageUploadFile(file);
  const rawDataUrl = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(rawDataUrl);
    const srcW = img.naturalWidth || img.width || 0;
    const srcH = img.naturalHeight || img.height || 0;
    if (srcW > 0 && srcH > 0) {
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const dstW = Math.max(1, Math.round(srcW * scale));
      const dstH = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dstW, dstH);
        ctx.drawImage(img, 0, 0, dstW, dstH);
        const jpegUrl = canvas.toDataURL('image/jpeg', quality);
        const commaIdx = jpegUrl.indexOf(',');
        const base64 = commaIdx >= 0 ? jpegUrl.slice(commaIdx + 1) : '';
        if (base64) {
          return { base64, mimeType: 'image/jpeg' };
        }
      }
    }
  } catch {
    // Fallback to raw dataUrl below
  }
  const commaIdx = rawDataUrl.indexOf(',');
  return {
    base64: commaIdx >= 0 ? rawDataUrl.slice(commaIdx + 1) : rawDataUrl,
    mimeType: file.type || 'image/jpeg',
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
    if (!Array.isArray(parsed)) return fallback;
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
    if (!Array.isArray(parsed)) return fallback;
    const validTipes = new Set(['Murni', 'Perubahan']);
    return parsed
      .filter((prop: ProposalRecord) => validTipes.has(String(prop?.tipe || '')))
      .map((prop: ProposalRecord) => {
        const docs = prop.documents || {};
        return {
          ...prop,
          tipe: prop.tipe === 'Perubahan' ? 'Perubahan' : 'Murni',
          checklist: {
            docx: Boolean(docs.proposalOpd || docs.proposalLurahCamat),
            dinas: Boolean(prop.checklist?.dinas),
            dinasAt: prop.checklist?.dinasAt,
            rab: Boolean(docs.rab),
            rt: Boolean(docs.capRt),
            rw: Boolean(docs.capRw),
            lurah: Boolean(docs.capLurah),
            camat: Boolean(docs.capCamat),
          },
        };
      });
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
  const yearPart = (tahun || '').trim() || 'NON';
  const itemCode = item || 'BNS';
  return `${seq}. ${yearPart} - ${itemCode}`;
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

export function getProposalSlotKey(
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  proposals: ProposalRecord[] = []
): string {
  const cleanId = (proposalId || '').trim();
  const cleanName = (proposalName || '').trim();
  const cleanYear = (tahun || '').trim();
  const matched =
    (cleanId ? proposals.find((p) => p.id === cleanId) : undefined) ??
    (cleanName && cleanYear
      ? proposals.find((p) => p.namaProposal === cleanName && p.tahun === cleanYear)
      : undefined) ??
    (cleanName ? proposals.find((p) => p.namaProposal === cleanName) : undefined);

  const keyId = matched?.id || cleanId || cleanName || 'NON';
  const keyYear = matched?.tahun || cleanYear || 'NON';
  return `prop::${keyId}__${keyYear}`;
}

export function compareRecordsByDefaultHierarchy(
  a: KpmRecord,
  b: KpmRecord,
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): number {
  const rankA = getItemHierarchyRank(a.item, a.tahun, catalog);
  const rankB = getItemHierarchyRank(b.item, b.tahun, catalog);
  if (rankA !== rankB) return rankA - rankB;
  const itemCmp = (a.item || '').localeCompare(b.item || '', 'id');
  if (itemCmp !== 0) return itemCmp;

  const domA = resolveKpmDomicile(a, proposals, wilayahList);
  const domB = resolveKpmDomicile(b, proposals, wilayahList);
  const kecCmp = domA.kecamatan.localeCompare(domB.kecamatan, 'id');
  if (kecCmp !== 0) return kecCmp;

  const rwNumA = parseInt(a.rw || '0', 10) || 0;
  const rwNumB = parseInt(b.rw || '0', 10) || 0;
  if (rwNumA !== rwNumB) return rwNumA - rwNumB;

  const rtNumA = parseInt(a.rt || '0', 10) || 0;
  const rtNumB = parseInt(b.rt || '0', 10) || 0;
  if (rtNumA !== rtNumB) return rtNumA - rtNumB;

  const kelCmp = domA.kelurahan.localeCompare(domB.kelurahan, 'id');
  if (kelCmp !== 0) return kelCmp;

  const namaCmp = (a.nama || '').localeCompare(b.nama || '', 'id');
  if (namaCmp !== 0) return namaCmp;

  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

export type ProposalMergedSlotItem =
  | {
      kind: 'kpm';
      slotNumber: number;
      record: KpmRecord;
    }
  | {
      kind: 'empty';
      slotNumber: number;
      emptySlot: ProposalEmptySlot;
    };

export function resolveProposalSlotStateForGroup(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  proposals: ProposalRecord[] = []
): { key: string; state?: ProposalSlotState } {
  const key = getProposalSlotKey(proposalId, proposalName, tahun, proposals);
  if (slotMap[key]) {
    return { key, state: slotMap[key] };
  }
  const cleanName = (proposalName || '').trim();
  const cleanYear = (tahun || '').trim();
  if (cleanName) {
    const legacyKey = `prop::${cleanName}__${cleanYear || 'NON'}`;
    if (slotMap[legacyKey]) {
      return { key, state: slotMap[legacyKey] };
    }
  }
  return { key, state: undefined };
}

export function buildMergedProposalSlots({
  groupRecords,
  slotState,
  proposals,
  catalog,
  wilayahList = INITIAL_WILAYAH_LIST,
}: {
  groupRecords: KpmRecord[];
  slotState?: ProposalSlotState;
  proposals: ProposalRecord[];
  catalog: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
}): ProposalMergedSlotItem[] {
  const acceptedRecords = groupRecords.filter((r) => r.validasi === 'accepted');
  const defaultSorted = [...acceptedRecords].sort((a, b) =>
    compareRecordsByDefaultHierarchy(a, b, proposals, catalog, wilayahList)
  );

  if (
    !slotState ||
    (slotState.pinnedOrder.length === 0 && slotState.emptySlots.length === 0)
  ) {
    return defaultSorted.map((record, idx) => ({
      kind: 'kpm' as const,
      slotNumber: idx + 1,
      record,
    }));
  }

  const byId = new Map(acceptedRecords.map((r) => [r.id, r]));
  const orderedRecords: KpmRecord[] = [];
  const seenIds = new Set<string>();

  for (const kpmId of slotState.pinnedOrder) {
    const rec = byId.get(kpmId);
    if (rec && !seenIds.has(rec.id)) {
      orderedRecords.push(rec);
      seenIds.add(rec.id);
    }
  }
  for (const rec of defaultSorted) {
    if (!seenIds.has(rec.id)) {
      orderedRecords.push(rec);
      seenIds.add(rec.id);
    }
  }

  const emptyBySlot = new Map<number, ProposalEmptySlot>();
  for (const es of slotState.emptySlots) {
    if (es.slotNumber >= 1 && !emptyBySlot.has(es.slotNumber)) {
      emptyBySlot.set(es.slotNumber, es);
    }
  }

  const merged: ProposalMergedSlotItem[] = [];
  let recordIdx = 0;
  let slotNo = 1;
  const maxEmptySlot =
    emptyBySlot.size > 0 ? Math.max(...Array.from(emptyBySlot.keys())) : 0;
  const maxIterations = orderedRecords.length + emptyBySlot.size + maxEmptySlot + 5;

  while (
    (recordIdx < orderedRecords.length || slotNo <= maxEmptySlot) &&
    slotNo <= maxIterations
  ) {
    const reservedEmpty = emptyBySlot.get(slotNo);
    if (reservedEmpty) {
      merged.push({
        kind: 'empty',
        slotNumber: slotNo,
        emptySlot: reservedEmpty,
      });
    } else if (recordIdx < orderedRecords.length) {
      merged.push({
        kind: 'kpm',
        slotNumber: slotNo,
        record: orderedRecords[recordIdx],
      });
      recordIdx += 1;
    }
    slotNo += 1;
  }

  return merged;
}

export function ensureProposalPinnedOrder(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  allRecords: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): { key: string; state: ProposalSlotState; merged: ProposalMergedSlotItem[] } {
  const { key, state: existing } = resolveProposalSlotStateForGroup(
    slotMap,
    proposalId,
    proposalName,
    tahun,
    proposals
  );
  const propRecords = allRecords.filter((r) => {
    if (r.validasi !== 'accepted' || !r.proposal?.trim()) return false;
    return getProposalSlotKey(r.proposalId, r.proposal, r.tahun, proposals) === key;
  });
  const merged = buildMergedProposalSlots({
    groupRecords: propRecords,
    slotState: existing,
    proposals,
    catalog,
    wilayahList,
  });
  const nextState: ProposalSlotState = {
    pinnedOrder: merged
      .filter((m): m is Extract<ProposalMergedSlotItem, { kind: 'kpm' }> => m.kind === 'kpm')
      .map((m) => m.record.id),
    emptySlots: merged
      .filter((m): m is Extract<ProposalMergedSlotItem, { kind: 'empty' }> => m.kind === 'empty')
      .map((m) => ({ ...m.emptySlot, slotNumber: m.slotNumber })),
    updatedAt: existing?.updatedAt || new Date().toISOString(),
  };
  return { key, state: nextState, merged };
}

export function vacateKpmSlotsInMap(
  slotMap: ProposalSlotMap,
  vacatedRecords: KpmRecord[],
  allRecordsBeforeChange: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalSlotMap {
  const acceptedVacated = vacatedRecords.filter(
    (r) => r.validasi === 'accepted' && Boolean(r.proposal?.trim())
  );
  if (acceptedVacated.length === 0) return slotMap;

  const nextMap: ProposalSlotMap = { ...slotMap };
  const now = new Date().toISOString();
  const byPropKey = new Map<string, KpmRecord[]>();

  for (const rec of acceptedVacated) {
    const key = getProposalSlotKey(rec.proposalId, rec.proposal, rec.tahun, proposals);
    const list = byPropKey.get(key) ?? [];
    list.push(rec);
    byPropKey.set(key, list);
  }

  for (const [key, vacatedList] of byPropKey.entries()) {
    const sample = vacatedList[0];
    const ensured = ensureProposalPinnedOrder(
      nextMap,
      sample.proposalId,
      sample.proposal,
      sample.tahun,
      allRecordsBeforeChange,
      proposals,
      catalog,
      wilayahList
    );

    const slotById = new Map<string, number>();
    for (const item of ensured.merged) {
      if (item.kind === 'kpm') {
        slotById.set(item.record.id, item.slotNumber);
      }
    }

    const vacatedIds = new Set(vacatedList.map((v) => v.id));
    const nextPinnedOrder = ensured.state.pinnedOrder.filter((id) => !vacatedIds.has(id));
    const nextEmptySlots = [...ensured.state.emptySlots];

    for (const v of vacatedList) {
      const seqFallback = getAbsenSeq(v.registerCode);
      const slotNum =
        slotById.get(v.id) ?? (seqFallback < 999999 ? seqFallback : nextPinnedOrder.length + nextEmptySlots.length + 1);
      if (!nextEmptySlots.some((es) => es.slotNumber === slotNum)) {
        nextEmptySlots.push({
          slotNumber: slotNum,
          item: v.item || undefined,
          previousKpmId: v.id,
          previousKpmName: v.nama,
          vacatedAt: now,
        });
      }
    }

    nextEmptySlots.sort((a, b) => a.slotNumber - b.slotNumber);
    nextMap[key] = {
      pinnedOrder: nextPinnedOrder,
      emptySlots: nextEmptySlots,
      updatedAt: now,
    };
  }

  return nextMap;
}

export function collapseKpmSlotsInMap(
  slotMap: ProposalSlotMap,
  removedRecords: KpmRecord[],
  allRecordsBeforeChange: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalSlotMap {
  const acceptedRemoved = removedRecords.filter(
    (r) => r.validasi === 'accepted' && Boolean(r.proposal?.trim())
  );
  if (acceptedRemoved.length === 0) return slotMap;

  const nextMap: ProposalSlotMap = { ...slotMap };
  const now = new Date().toISOString();
  const byPropKey = new Map<string, KpmRecord[]>();

  for (const rec of acceptedRemoved) {
    const key = getProposalSlotKey(rec.proposalId, rec.proposal, rec.tahun, proposals);
    const list = byPropKey.get(key) ?? [];
    list.push(rec);
    byPropKey.set(key, list);
  }

  for (const [key, removedList] of byPropKey.entries()) {
    const sample = removedList[0];
    const resolvedExisting = resolveProposalSlotStateForGroup(
      nextMap,
      sample.proposalId,
      sample.proposal,
      sample.tahun,
      proposals
    );
    const hadCustomState =
      Boolean(resolvedExisting.state) &&
      (resolvedExisting.state!.pinnedOrder.length > 0 ||
        resolvedExisting.state!.emptySlots.length > 0);

    const ensured = ensureProposalPinnedOrder(
      nextMap,
      sample.proposalId,
      sample.proposal,
      sample.tahun,
      allRecordsBeforeChange,
      proposals,
      catalog,
      wilayahList
    );

    const slotById = new Map<string, number>();
    for (const item of ensured.merged) {
      if (item.kind === 'kpm') {
        slotById.set(item.record.id, item.slotNumber);
      }
    }

    const removedIds = new Set(removedList.map((r) => r.id));
    const removedSlotNums = removedList
      .map((r) => slotById.get(r.id) ?? getAbsenSeq(r.registerCode))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 999999)
      .sort((a, b) => b - a);

    const nextPinnedOrder = ensured.state.pinnedOrder.filter((id) => !removedIds.has(id));
    let nextEmptySlots = [...ensured.state.emptySlots];
    for (const removedSlotNo of removedSlotNums) {
      nextEmptySlots = nextEmptySlots
        .filter((es) => es.slotNumber !== removedSlotNo)
        .map((es) =>
          es.slotNumber > removedSlotNo ? { ...es, slotNumber: es.slotNumber - 1 } : es
        );
    }
    nextEmptySlots.sort((a, b) => a.slotNumber - b.slotNumber);

    if ((!hadCustomState && nextEmptySlots.length === 0) || (nextPinnedOrder.length === 0 && nextEmptySlots.length === 0)) {
      delete nextMap[key];
      const legacyKey = sample.proposal?.trim()
        ? `prop::${sample.proposal.trim()}__${(sample.tahun || '').trim() || 'NON'}`
        : '';
      if (legacyKey && legacyKey !== key) {
        delete nextMap[legacyKey];
      }
    } else {
      nextMap[key] = {
        pinnedOrder: nextPinnedOrder,
        emptySlots: nextEmptySlots,
        updatedAt: now,
      };
    }
  }

  return nextMap;
}

export function getKpmSlotNumberInProposal(
  record: KpmRecord,
  allRecords: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST,
  slotMap: ProposalSlotMap = {}
): number | null {
  if (record.validasi !== 'accepted' || !record.proposal?.trim()) return null;
  const key = getProposalSlotKey(record.proposalId, record.proposal, record.tahun, proposals);
  const groupRecords = allRecords.filter(
    (r) =>
      r.validasi === 'accepted' &&
      Boolean(r.proposal?.trim()) &&
      getProposalSlotKey(r.proposalId, r.proposal, r.tahun, proposals) === key
  );
  const { state: slotState } = resolveProposalSlotStateForGroup(
    slotMap,
    record.proposalId,
    record.proposal,
    record.tahun,
    proposals
  );
  const merged = buildMergedProposalSlots({
    groupRecords,
    slotState,
    proposals,
    catalog,
    wilayahList,
  });
  const found = merged.find((m) => m.kind === 'kpm' && m.record.id === record.id);
  if (found) return found.slotNumber;
  const seq = getAbsenSeq(record.registerCode);
  return seq < 999999 ? seq : null;
}

export function sanitizeProposalSlotMap(
  slotMap: ProposalSlotMap,
  currentRecords: KpmRecord[],
  proposals: ProposalRecord[]
): ProposalSlotMap {
  if (!slotMap || typeof slotMap !== 'object' || currentRecords.length === 0) {
    return slotMap || {};
  }
  const activeIdsByPropKey = new Map<string, Set<string>>();
  for (const rec of currentRecords) {
    if (rec.validasi !== 'accepted' || !rec.proposal?.trim()) continue;
    const key = getProposalSlotKey(rec.proposalId, rec.proposal, rec.tahun, proposals);
    const set = activeIdsByPropKey.get(key) ?? new Set<string>();
    set.add(rec.id);
    activeIdsByPropKey.set(key, set);
    const legacyKey = `prop::${rec.proposal.trim()}__${(rec.tahun || '').trim() || 'NON'}`;
    if (legacyKey !== key) {
      const legacySet = activeIdsByPropKey.get(legacyKey) ?? new Set<string>();
      legacySet.add(rec.id);
      activeIdsByPropKey.set(legacyKey, legacySet);
    }
  }

  let changed = false;
  const nextMap: ProposalSlotMap = {};
  for (const [key, state] of Object.entries(slotMap)) {
    if (!state || typeof state !== 'object') {
      changed = true;
      continue;
    }
    const activeIds = activeIdsByPropKey.get(key) ?? new Set<string>();
    const rawPinned = Array.isArray(state.pinnedOrder) ? state.pinnedOrder : [];
    const seenPinned = new Set<string>();
    const cleanPinned = rawPinned.filter((id) => {
      if (!id || seenPinned.has(id) || !activeIds.has(id)) return false;
      seenPinned.add(id);
      return true;
    });

    const rawEmpty = Array.isArray(state.emptySlots) ? state.emptySlots : [];
    const seenSlots = new Set<number>();
    const cleanEmpty = rawEmpty
      .filter((es) => {
        if (!es || typeof es.slotNumber !== 'number' || es.slotNumber < 1) return false;
        if (seenSlots.has(es.slotNumber)) return false;
        seenSlots.add(es.slotNumber);
        return true;
      })
      .sort((a, b) => a.slotNumber - b.slotNumber);

    if (cleanPinned.length === 0 && cleanEmpty.length === 0) {
      changed = true;
      continue;
    }
    if (
      cleanPinned.length !== rawPinned.length ||
      cleanEmpty.length !== rawEmpty.length
    ) {
      changed = true;
    }
    nextMap[key] = {
      pinnedOrder: cleanPinned,
      emptySlots: cleanEmpty,
      updatedAt: state.updatedAt || new Date().toISOString(),
    };
  }

  return changed ? nextMap : slotMap;
}

export function assignKpmToProposalSlot(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  kpmId: string,
  targetSlotNumber: number | null | undefined,
  allRecordsIncludingNew: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalSlotMap {
  const cleanName = (proposalName || '').trim();
  if (!cleanName) return slotMap;

  const { key, state } = ensureProposalPinnedOrder(
    slotMap,
    proposalId,
    cleanName,
    tahun,
    allRecordsIncludingNew.filter((r) => r.id !== kpmId),
    proposals,
    catalog,
    wilayahList
  );

  const hasCustomOrderOrEmpty =
    Boolean(slotMap[key]) && (state.pinnedOrder.length > 0 || state.emptySlots.length > 0);
  if (!targetSlotNumber && !hasCustomOrderOrEmpty) {
    // Proposal standar tanpa urutan tetap / baris kosong tetap memakai hierarki otomatis
    return slotMap;
  }

  const now = new Date().toISOString();
  const cleanPinned = state.pinnedOrder.filter((id) => id !== kpmId);
  const cleanEmpty = state.emptySlots.filter((es) => es.slotNumber !== targetSlotNumber);

  if (targetSlotNumber && targetSlotNumber >= 1) {
    const emptyBeforeTarget = cleanEmpty.filter((es) => es.slotNumber < targetSlotNumber).length;
    const insertIdx = Math.max(0, Math.min(cleanPinned.length, targetSlotNumber - 1 - emptyBeforeTarget));
    cleanPinned.splice(insertIdx, 0, kpmId);
  } else {
    // Penambahan baru tanpa target slot tidak boleh merebut Baris Kosong; taruh di akhir
    cleanPinned.push(kpmId);
  }

  return {
    ...slotMap,
    [key]: {
      pinnedOrder: cleanPinned,
      emptySlots: cleanEmpty.sort((a, b) => a.slotNumber - b.slotNumber),
      updatedAt: now,
    },
  };
}

export function replaceKpmInProposalSlotMap(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  oldKpmId: string,
  newKpmId: string,
  allRecordsBeforeChange: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): { slotMap: ProposalSlotMap; slotNumber: number | null } {
  const cleanName = (proposalName || '').trim();
  if (!cleanName) return { slotMap, slotNumber: null };

  const { key, state, merged } = ensureProposalPinnedOrder(
    slotMap,
    proposalId,
    cleanName,
    tahun,
    allRecordsBeforeChange,
    proposals,
    catalog,
    wilayahList
  );

  const foundSlot = merged.find((m) => m.kind === 'kpm' && m.record.id === oldKpmId);
  const slotNumber = foundSlot ? foundSlot.slotNumber : null;

  const nextPinned = state.pinnedOrder.filter((id) => id !== newKpmId);
  const oldIdx = nextPinned.indexOf(oldKpmId);
  if (oldIdx >= 0) {
    nextPinned.splice(oldIdx, 1, newKpmId);
  } else {
    nextPinned.push(newKpmId);
  }

  return {
    slotMap: {
      ...slotMap,
      [key]: {
        pinnedOrder: nextPinned,
        emptySlots: state.emptySlots,
        updatedAt: new Date().toISOString(),
      },
    },
    slotNumber,
  };
}

export function moveProposalSlotDirection(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  target: { kind: 'kpm'; kpmId: string } | { kind: 'empty'; slotNumber: number },
  direction: 'up' | 'down',
  allRecords: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalSlotMap | null {
  const { key, merged } = ensureProposalPinnedOrder(
    slotMap,
    proposalId,
    proposalName,
    tahun,
    allRecords,
    proposals,
    catalog,
    wilayahList
  );
  if (merged.length < 2) return null;

  const idx = merged.findIndex((item) =>
    target.kind === 'kpm'
      ? item.kind === 'kpm' && item.record.id === target.kpmId
      : item.kind === 'empty' && item.slotNumber === target.slotNumber
  );
  if (idx < 0) return null;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= merged.length) return null;

  const reordered = [...merged];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

  const nextPinnedOrder: string[] = [];
  const nextEmptySlots: ProposalEmptySlot[] = [];
  reordered.forEach((entry, i) => {
    const nextSlotNo = i + 1;
    if (entry.kind === 'kpm') {
      nextPinnedOrder.push(entry.record.id);
    } else {
      nextEmptySlots.push({
        ...entry.emptySlot,
        slotNumber: nextSlotNo,
      });
    }
  });

  return {
    ...slotMap,
    [key]: {
      pinnedOrder: nextPinnedOrder,
      emptySlots: nextEmptySlots,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function removeEmptySlotFromMap(
  slotMap: ProposalSlotMap,
  proposalId: string | null | undefined,
  proposalName: string | undefined,
  tahun: string | undefined,
  slotNumber: number,
  allRecords: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalSlotMap {
  const { key, state } = ensureProposalPinnedOrder(
    slotMap,
    proposalId,
    proposalName,
    tahun,
    allRecords,
    proposals,
    catalog,
    wilayahList
  );
  const nextEmptySlots = state.emptySlots
    .filter((es) => es.slotNumber !== slotNumber)
    .map((es) => (es.slotNumber > slotNumber ? { ...es, slotNumber: es.slotNumber - 1 } : es));

  return {
    ...slotMap,
    [key]: {
      pinnedOrder: state.pinnedOrder,
      emptySlots: nextEmptySlots,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function recalculateProposalRegisterCodes(
  records: KpmRecord[],
  proposals: ProposalRecord[],
  catalog: ItemBantuan[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST,
  proposalSlotMap: ProposalSlotMap = {}
): KpmRecord[] {
  if (records.length === 0) return records;

  // Normalisasi status routing standalone vs proposal-bound terlebih dahulu
  const normalizedRecords = records.map((rec) => {
    const dom = resolveKpmDomicile(rec, proposals, wilayahList);
    if (rec.validasi !== 'accepted') {
      return {
        ...rec,
        tahun: '',
        proposalId: null,
        proposal: '',
        kabKota: dom.kabKota,
        kecamatan: dom.kecamatan,
        kelurahan: dom.kelurahan,
      };
    }
    return {
      ...rec,
      tahun: (rec.tahun || '').trim(),
      kabKota: dom.kabKota,
      kecamatan: dom.kecamatan,
      kelurahan: dom.kelurahan,
    };
  });

  // Group records by proposal (accepted only); standalone (pending / rejected) have no registerCode
  const groups = new Map<string, KpmRecord[]>();
  for (const rec of normalizedRecords) {
    const propName = (rec.proposal || '').trim();
    const tahunVal = (rec.tahun || '').trim();
    if (rec.validasi !== 'accepted' || !propName) continue;
    const key = getProposalSlotKey(rec.proposalId, propName, tahunVal, proposals);
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const nextCodeById = new Map<string, string>();

  for (const [groupKey, group] of groups.entries()) {
    if (groupKey.startsWith('prop::') && group.length > 0) {
      const sample = group[0];
      const { state: slotState } = resolveProposalSlotStateForGroup(
        proposalSlotMap,
        sample.proposalId,
        sample.proposal,
        sample.tahun,
        proposals
      );
      if (
        slotState &&
        (slotState.pinnedOrder.length > 0 || slotState.emptySlots.length > 0)
      ) {
        const merged = buildMergedProposalSlots({
          groupRecords: group,
          slotState,
          proposals,
          catalog,
          wilayahList,
        });
        for (const entry of merged) {
          if (entry.kind === 'kpm') {
            const seq = String(entry.slotNumber).padStart(3, '0');
            const yearPart = (entry.record.tahun || '').trim() || 'NON';
            nextCodeById.set(
              entry.record.id,
              `${seq}. ${yearPart} - ${entry.record.item || 'BNS'}`
            );
          }
        }
        continue;
      }
    }

    const sorted = [...group].sort((a, b) =>
      compareRecordsByDefaultHierarchy(a, b, proposals, catalog, wilayahList)
    );

    sorted.forEach((rec, idx) => {
      const seq = String(idx + 1).padStart(3, '0');
      const yearPart = (rec.tahun || '').trim() || 'NON';
      nextCodeById.set(rec.id, `${seq}. ${yearPart} - ${rec.item || 'BNS'}`);
    });
  }

  let changed = false;
  const updated = normalizedRecords.map((rec, idx) => {
    const orig = records[idx];
    const isAcceptedProp = rec.validasi === 'accepted' && Boolean((rec.proposal || '').trim());
    const nextCode = isAcceptedProp ? nextCodeById.get(rec.id) || rec.registerCode || '' : '';
    const codeChanged = nextCode !== (rec.registerCode || '');
    const routingChanged =
      (rec.tahun || '') !== (orig.tahun || '') ||
      rec.proposal !== orig.proposal ||
      (rec.proposalId ?? null) !== (orig.proposalId ?? null) ||
      (rec.kecamatan || '') !== (orig.kecamatan || '') ||
      (rec.kelurahan || '') !== (orig.kelurahan || '');
    if (codeChanged || routingChanged) {
      changed = true;
      return {
        ...rec,
        registerCode: nextCode,
      };
    }
    return rec;
  });

  return changed ? updated : normalizedRecords;
}

export interface ParsedSubItemSpec {
  baseName: string;
  volume: number;
  satuan: string;
  formatted: string;
}

const SUB_ITEM_SUFFIX_RE = /\s*\(\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s*\)\s*$/;

export function normalizeSubItemSatuan(raw?: string): string {
  const clean = (raw || '').trim();
  if (!clean) return 'Unit';
  const matched = SUB_ITEM_SATUAN_OPTIONS.find(
    (opt) => opt.toLowerCase() === clean.toLowerCase()
  );
  if (matched) return matched;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

export function formatSubItemSpec(baseName: string, volume: number, satuan: string): string {
  const cleanBase = baseName.replace(SUB_ITEM_SUFFIX_RE, '').trim();
  if (!cleanBase) return '';
  const cleanVol =
    Number.isFinite(volume) && volume > 0 ? Math.round(volume * 100) / 100 : 1;
  const cleanSatuan = normalizeSubItemSatuan(satuan);
  return cleanVol === 1 && cleanSatuan === 'Unit'
    ? cleanBase
    : `${cleanBase} (${cleanVol} ${cleanSatuan})`;
}

const SELANG_REGULATOR_COMBO_RE =
  /^(?:selang(?:\s+(?:gas|kompor))?\s*(?:&|\+|\/|,|-|dan|\s)\s*regulato?r?(?:\s+(?:gas|kompor))?|regulato?r?(?:\s+(?:gas|kompor))?\s*(?:&|\+|\/|,|-|dan|\s)\s*selang(?:\s+(?:gas|kompor))?)$/i;

export function parseSubItemSpec(
  raw: string,
  context?: { itemCode?: string; itemName?: string }
): ParsedSubItemSpec {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(SUB_ITEM_SUFFIX_RE);
  let baseName = (match && match.index !== undefined
    ? trimmed.slice(0, match.index)
    : trimmed
  ).trim();
  let volume = match ? Number((match[1] || '1').replace(',', '.')) || 1 : 1;
  let satuan = match ? normalizeSubItemSatuan(match[2] || 'Unit') : 'Unit';

  const isTendaContext =
    (context?.itemCode || '').trim().toUpperCase() === 'TND' ||
    /\btenda\b/i.test(context?.itemName || '');
  if (isTendaContext && /\bkursi\b/i.test(baseName)) {
    if (!match || volume === 1 || (volume === 6 && /^pcs$/i.test(match[2] || ''))) {
      volume = 6;
      satuan = 'Unit';
    }
  }

  if (SELANG_REGULATOR_COMBO_RE.test(baseName.replace(/\s+/g, ' '))) {
    baseName = 'Selang Gas & Regulator';
    if (!match || !match[2] || /^unit$/i.test(match[2].trim())) {
      volume = match ? volume : 1;
      satuan = 'Set';
    }
  }

  return {
    baseName: baseName || trimmed,
    volume,
    satuan,
    formatted: formatSubItemSpec(baseName || trimmed, volume, satuan),
  };
}

export function upgradeCatalogTendaKursi(catalog: ItemBantuan[]): {
  nextItems: ItemBantuan[];
  changedItems: ItemBantuan[];
  changed: boolean;
} {
  let changed = false;
  const changedItems: ItemBantuan[] = [];

  const isSelangOrRegulatorSub = (raw: string): boolean => {
    const base = normalizeSubItemKey(raw);
    return (
      /^selang(\s+(gas|kompor))?$/.test(base) ||
      /^regulato?r?(\s+(gas|kompor))?$/.test(base) ||
      SELANG_REGULATOR_COMBO_RE.test(base)
    );
  };

  const nextItems = catalog.map((item) => {
    const codeUpper = (item.code || '').trim().toUpperCase();
    const isTenda = codeUpper === 'TND' || /\btenda\b/i.test(item.name || '');
    const subs = item.subItems || [];
    const hasSplitSelangAndRegulator =
      subs.some((s) => /^selang(\s+(gas|kompor))?$/i.test(normalizeSubItemKey(s))) &&
      subs.some((s) => /^regulato?r?(\s+(gas|kompor))?$/i.test(normalizeSubItemKey(s)));
    const isKomporGas =
      codeUpper === 'KPR' ||
      codeUpper === 'KG' ||
      /\bkompor\s*gas\b/i.test(item.name || '') ||
      hasSplitSelangAndRegulator ||
      subs.some((s) => SELANG_REGULATOR_COMBO_RE.test(normalizeSubItemKey(s)));

    if (!isTenda && !isKomporGas) return item;

    let itemChanged = false;
    let nextSubItems = [...subs];

    if (isTenda) {
      nextSubItems = nextSubItems.map((sub) => {
        if (!/\bkursi\b/i.test(sub)) return sub;
        const parsed = parseSubItemSpec(sub, { itemCode: item.code, itemName: item.name });
        const target = formatSubItemSpec(parsed.baseName, parsed.volume, parsed.satuan);
        if (target && target !== sub.trim()) {
          itemChanged = true;
          return target;
        }
        return sub;
      });
    }

    if (isKomporGas) {
      let insertedCombined = false;
      const mergedList: string[] = [];
      for (const sub of nextSubItems) {
        if (isSelangOrRegulatorSub(sub)) {
          if (!insertedCombined) {
            insertedCombined = true;
            const target = 'Selang Gas & Regulator (1 Set)';
            if (sub.trim() !== target) {
              itemChanged = true;
            }
            mergedList.push(target);
          } else {
            itemChanged = true;
          }
        } else {
          mergedList.push(sub);
        }
      }
      if (mergedList.length !== nextSubItems.length) {
        itemChanged = true;
      }
      nextSubItems = mergedList;
    }

    if (!itemChanged) return item;
    changed = true;
    const updatedItem: ItemBantuan = {
      ...item,
      subItems: nextSubItems,
    };
    changedItems.push(updatedItem);
    return updatedItem;
  });

  return { nextItems, changedItems, changed };
}

export function normalizeSubItemKey(name: string): string {
  const withoutSpec = (name || '').replace(SUB_ITEM_SUFFIX_RE, '');
  return withoutSpec.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function loadItemList(fallback: ItemBantuan[]): ItemBantuan[] {
  try {
    const raw = localStorage.getItem(ITEM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const mapped: ItemBantuan[] = parsed.map((item: Partial<ItemBantuan>) => ({
          id: item.id || `${item.tahun || '2026'}-${item.code || 'ITEM'}`,
          tahun: String(item.tahun || '2026'),
          code: String(item.code || '').toUpperCase(),
          name: String(item.name || item.code || ''),
          subItems: Array.isArray(item.subItems)
            ? item.subItems.map((s) => String(s).trim()).filter(Boolean)
            : [],
        }));
        return upgradeCatalogTendaKursi(mapped).nextItems;
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
        return upgradeCatalogTendaKursi([...fallback, ...extraItems]).nextItems;
      }
    }

    return upgradeCatalogTendaKursi(fallback).nextItems;
  } catch {
    return upgradeCatalogTendaKursi(fallback).nextItems;
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
  baseName: string;
  volume: number;
  satuan: string;
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
    const parsed = parseSubItemSpec(subName, { itemCode: pkg.code, itemName: pkg.name });
    const key = normalizeSubItemKey(parsed.baseName || subName);
    let state =
      deliveries[key] ??
      deliveries[normalizeSubItemKey(subName)] ??
      deliveries[subName] ??
      deliveries[parsed.baseName];
    if (!state && key === 'selang gas & regulator') {
      const legacyCombo =
        deliveries['selang & regulator'] ??
        deliveries['regulator + selang'] ??
        deliveries['regulator & selang'] ??
        deliveries['selang regulator'];
      if (legacyCombo) {
        state = legacyCombo;
      } else {
        const legacySelang = deliveries['selang gas'] ?? deliveries['selang'];
        const legacyReg = deliveries['regulator'] ?? deliveries['regulator gas'];
        if (legacySelang?.delivered && legacyReg?.delivered) {
          state = legacySelang;
        }
      }
    }
    return {
      key,
      name: parsed.formatted || subName,
      baseName: parsed.baseName,
      volume: parsed.volume,
      satuan: parsed.satuan,
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
  satuan: string;
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
      satuan: string;
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
      const qty = sub.volume > 0 ? sub.volume : 1;
      totalUnits += qty;
      if (sub.delivered) totalDelivered += qty;
      else totalPending += qty;

      const existing = aggMap.get(sub.key) ?? {
        key: sub.key,
        name: sub.baseName || sub.name,
        satuan: sub.satuan || 'Unit',
        totalNeeded: 0,
        deliveredCount: 0,
        pendingCount: 0,
        packageMap: new Map<string, SubItemPackageSource>(),
        owedKpmIds: [],
      };

      existing.totalNeeded += qty;
      if (sub.delivered) {
        existing.deliveredCount += qty;
      } else {
        existing.pendingCount += qty;
        existing.owedKpmIds.push(rec.id);
      }

      const pkgEntry = existing.packageMap.get(pkg.code) ?? {
        code: pkg.code,
        name: pkg.name,
        total: 0,
        delivered: 0,
        pending: 0,
      };
      pkgEntry.total += qty;
      if (sub.delivered) pkgEntry.delivered += qty;
      else pkgEntry.pending += qty;
      existing.packageMap.set(pkg.code, pkgEntry);

      aggMap.set(sub.key, existing);
    }
  }

  const aggregates: SubItemAggregateRow[] = Array.from(aggMap.values())
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      satuan: entry.satuan,
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
      if (Array.isArray(parsed)) return parsed;
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
    if (!Array.isArray(parsed)) return fallback;
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
    const raw = String(val ?? '');
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
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
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
    const raw = String(val ?? '');
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const rows = aggregates.map((row) => [
    row.name,
    row.totalNeeded,
    row.deliveredCount,
    row.pendingCount,
    row.packageSources.map((p) => `${p.code}: ${p.total} (Belum dibagi ${p.pending})`).join('; '),
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
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

export function loadCustomYears(fallback: string[] = []): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_YEARS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .map((yr) => String(yr || '').trim())
      .filter((yr) => /^\d{4}$/.test(yr));
  } catch {
    return fallback;
  }
}

export function saveCustomYears(years: string[]): boolean {
  try {
    localStorage.setItem(CUSTOM_YEARS_STORAGE_KEY, JSON.stringify(years));
    return true;
  } catch {
    return false;
  }
}

const hasRenderableMedia = (doc?: KpmDocumentFile): doc is KpmDocumentFile =>
  Boolean(doc && (doc.dataUrl || doc.directUrl || doc.thumbnailUrl || doc.fileId));

export function getPrimaryKpmPhotoWithMeta(
  documents?: Partial<KpmDocuments> | null
): { doc: KpmDocumentFile; label: string } | null {
  if (!documents) return null;
  if (hasRenderableMedia(documents.penerima)) {
    return { doc: documents.penerima, label: 'Foto Calon Penerima' };
  }
  if (hasRenderableMedia(documents.survey)) {
    return { doc: documents.survey, label: 'Foto Survey' };
  }
  if (hasRenderableMedia(documents.ktp)) {
    return { doc: documents.ktp, label: 'Foto KTP' };
  }
  if (hasRenderableMedia(documents.kk)) {
    return { doc: documents.kk, label: 'Foto KK' };
  }
  const lainnyaArr = Array.isArray(documents.lainnya) ? documents.lainnya : [];
  const firstLainnya = lainnyaArr.find(hasRenderableMedia);
  if (firstLainnya) {
    return { doc: firstLainnya, label: 'Foto Lainnya' };
  }
  const rumahArr = Array.isArray(documents.rumah)
    ? documents.rumah
    : documents.rumah
      ? [documents.rumah as unknown as KpmDocumentFile]
      : [];
  const firstRumah = rumahArr.find(hasRenderableMedia);
  if (firstRumah) {
    return { doc: firstRumah, label: 'Foto Rumah' };
  }
  return null;
}

export function getPrimaryKpmPhoto(
  documents?: Partial<KpmDocuments> | null
): KpmDocumentFile | undefined {
  return getPrimaryKpmPhotoWithMeta(documents)?.doc;
}
