import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_KOP_LOGO_URL,
  ItemBantuan,
  KpmRecord,
  ProposalBastMap,
  ProposalRecord,
  ProposalSlotMap,
  ProposalTipe,
  ReportTemplateConfig,
  ScheduleBook,
  ScheduleEventItem,
  SptjmTemplateConfig,
  WilayahKabKota,
  resolveScheduleBookId,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  getItemHierarchyRank,
  isKecamatanProposal,
  resolveKpmDomicile,
  resolveProposalDomicile,
  resolveProposalKecamatanCategory,
  resolveProposalSlotStateForGroup,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from './imageProcessor';

// Ukuran kertas F4: 216mm x 310mm
export const F4_PAPER_WIDTH_MM = 216;
export const F4_PAPER_HEIGHT_MM = 310;

// Margin: atas 1 cm, kanan 1,5 cm, bawah 1 cm, kiri 2 cm
export const F4_PDF_MARGINS = {
  top: 10,
  right: 15,
  bottom: 10,
  left: 20,
} as const;

export const PRINTABLE_WIDTH_MM =
  F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.left - F4_PDF_MARGINS.right; // 181mm

export type PdfColumnKey =
  | 'no'
  | 'nikKtp'
  | 'nikKk'
  | 'item'
  | 'desil'
  | 'nama'
  | 'alamat'
  | 'rtRw'
  | 'administrasi'
  | 'proposal'
  | 'kelurahan'
  | 'kecamatan'
  | 'kontak'
  | 'pengelola'
  | 'catatan';

export interface PdfColumnDefinition {
  key: PdfColumnKey;
  pdfHeader: string;
  uiLabel: string;
  description?: string;
  defaultEnabled: boolean;
  baseWidthMm: number;
  minWidthMm: number;
  flexible?: boolean;
  halign: 'left' | 'center' | 'right';
}

export const MAX_PDF_TOTAL_COLUMNS = 10;

export const MANDATORY_PDF_COLUMN_KEYS: PdfColumnKey[] = ['no', 'item', 'nama', 'alamat'];

export const PDF_COLUMN_DEFINITIONS: PdfColumnDefinition[] = [
  {
    key: 'no',
    pdfHeader: 'NO',
    uiLabel: 'No (Absen)',
    defaultEnabled: true,
    baseWidthMm: 10,
    minWidthMm: 8,
    halign: 'center',
  },
  {
    key: 'item',
    pdfHeader: 'ITEM',
    uiLabel: 'Item',
    defaultEnabled: true,
    baseWidthMm: 13.5,
    minWidthMm: 10.5,
    halign: 'center',
  },
  {
    key: 'desil',
    pdfHeader: 'DESIL',
    uiLabel: 'Desil',
    defaultEnabled: true,
    baseWidthMm: 11.5,
    minWidthMm: 9.5,
    halign: 'center',
  },
  {
    key: 'nama',
    pdfHeader: 'NAMA',
    uiLabel: 'Nama',
    defaultEnabled: true,
    baseWidthMm: 34,
    minWidthMm: 20,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'alamat',
    pdfHeader: 'ALAMAT',
    uiLabel: 'Alamat',
    defaultEnabled: true,
    baseWidthMm: 42,
    minWidthMm: 23,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'rtRw',
    pdfHeader: 'RT / RW',
    uiLabel: 'RT / RW',
    defaultEnabled: true,
    baseWidthMm: 17.5,
    minWidthMm: 13.5,
    halign: 'center',
  },
  {
    key: 'kontak',
    pdfHeader: 'KONTAK',
    uiLabel: 'Kontak',
    defaultEnabled: true,
    baseWidthMm: 24,
    minWidthMm: 18,
    halign: 'center',
  },
  {
    key: 'pengelola',
    pdfHeader: 'PENGELOLA',
    uiLabel: 'Pengelola',
    defaultEnabled: true,
    baseWidthMm: 24,
    minWidthMm: 16,
    flexible: true,
    halign: 'center',
  },
  {
    key: 'kelurahan',
    pdfHeader: 'KELURAHAN',
    uiLabel: 'Kelurahan',
    defaultEnabled: false,
    baseWidthMm: 24,
    minWidthMm: 16.5,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'kecamatan',
    pdfHeader: 'KECAMATAN',
    uiLabel: 'Kecamatan',
    defaultEnabled: false,
    baseWidthMm: 24,
    minWidthMm: 16.5,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'proposal',
    pdfHeader: 'PROPOSAL',
    uiLabel: 'Proposal',
    description: 'Nama proposal atau status standalone',
    defaultEnabled: false,
    baseWidthMm: 28,
    minWidthMm: 18,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'administrasi',
    pdfHeader: 'ADMINISTRASI',
    uiLabel: 'Administrasi',
    description: 'Nominal uang administrasi yang masuk',
    defaultEnabled: false,
    baseWidthMm: 23,
    minWidthMm: 18.5,
    halign: 'center',
  },
  {
    key: 'nikKtp',
    pdfHeader: 'NIK KTP',
    uiLabel: 'NIK KTP',
    defaultEnabled: false,
    baseWidthMm: 26,
    minWidthMm: 20,
    halign: 'center',
  },
  {
    key: 'nikKk',
    pdfHeader: 'NIK KK',
    uiLabel: 'NIK KK',
    defaultEnabled: false,
    baseWidthMm: 26,
    minWidthMm: 20,
    halign: 'center',
  },
  {
    key: 'catatan',
    pdfHeader: 'CATATAN',
    uiLabel: 'Catatan',
    description: 'Catatan petugas pada data KPM',
    defaultEnabled: false,
    baseWidthMm: 26,
    minWidthMm: 16,
    flexible: true,
    halign: 'left',
  },
];

export const ADDON_PDF_COLUMN_DEFINITIONS: PdfColumnDefinition[] = PDF_COLUMN_DEFINITIONS.filter(
  (c) => !MANDATORY_PDF_COLUMN_KEYS.includes(c.key)
);

export const DEFAULT_PDF_COLUMN_KEYS: PdfColumnKey[] = PDF_COLUMN_DEFINITIONS.filter(
  (c) => c.defaultEnabled
).map((c) => c.key);

export const DEFAULT_ADDON_PDF_COLUMN_KEYS: PdfColumnKey[] = ADDON_PDF_COLUMN_DEFINITIONS.filter(
  (c) => c.defaultEnabled
).map((c) => c.key);

export function sanitizePdfFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const base = cleaned || 'masdeta_export';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export function formatDesilValue(dtsen: string): string {
  const trimmed = (dtsen || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'tidak ada') return '-';
  const match = trimmed.match(/(\d+(?:\s*-\s*\d+)?)/);
  return match ? match[1].replace(/\s+/g, '') : trimmed;
}

export function formatPhoneForPdf(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 9 && digits.length <= 14) {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 8);
    const p3 = digits.slice(8);
    return p3 ? `${p1}-${p2}-${p3}` : `${p1}-${p2}`;
  }
  return raw.trim();
}

export function formatNikForPdf(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length === 16) {
    return `${digits.slice(0, 12)}\n${digits.slice(12)}`;
  }
  return digits;
}

export const INDONESIAN_WEEKDAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function numberToIndonesianWords(n: number): string {
  const satuan = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
  ];
  const val = Math.floor(Math.abs(n));
  if (val === 0) return 'Nol';
  if (val < 12) return satuan[val];
  if (val < 20) return `${satuan[val - 10]} Belas`;
  if (val < 100) {
    const tens = Math.floor(val / 10);
    const rem = val % 10;
    return `${satuan[tens]} Puluh${rem > 0 ? ` ${satuan[rem]}` : ''}`;
  }
  if (val < 200) {
    const rem = val % 100;
    return `Seratus${rem > 0 ? ` ${numberToIndonesianWords(rem)}` : ''}`;
  }
  if (val < 1000) {
    const hundreds = Math.floor(val / 100);
    const rem = val % 100;
    return `${satuan[hundreds]} Ratus${rem > 0 ? ` ${numberToIndonesianWords(rem)}` : ''}`;
  }
  if (val < 2000) {
    const rem = val % 1000;
    return `Seribu${rem > 0 ? ` ${numberToIndonesianWords(rem)}` : ''}`;
  }
  if (val < 1_000_000) {
    const thousands = Math.floor(val / 1000);
    const rem = val % 1000;
    return `${numberToIndonesianWords(thousands)} Ribu${rem > 0 ? ` ${numberToIndonesianWords(rem)}` : ''}`;
  }
  return String(val);
}

export function getTodayLocalIsoDate(offsetDays = 0): string {
  const dt = new Date();
  if (offsetDays !== 0) {
    dt.setDate(dt.getDate() + offsetDays);
  }
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeIsoDateInput(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const isoPrefix = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/.exec(trimmed);
  if (isoPrefix) {
    const y = Number(isoPrefix[1]);
    const m = Number(isoPrefix[2]);
    const d = Number(isoPrefix[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const dmy = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function parseLocalDateFromInput(raw?: string): Date {
  const iso = normalizeIsoDateInput(raw);
  if (iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export function formatIndonesianDateWords(isoDate?: string): string {
  const date = parseLocalDateFromInput(isoDate);

  const dayName = INDONESIAN_WEEKDAYS[date.getDay()] || 'Senin';
  const dayWords = numberToIndonesianWords(date.getDate());
  const monthName = INDONESIAN_MONTHS[date.getMonth()] || 'Januari';
  const yearWords = numberToIndonesianWords(date.getFullYear());

  return `${dayName} tanggal ${dayWords} bulan ${monthName} tahun ${yearWords}`;
}

export function formatIndonesianShortDate(isoDate?: string): string {
  const date = parseLocalDateFromInput(isoDate);
  const monthName = INDONESIAN_MONTHS[date.getMonth()] || 'Januari';
  return `${date.getDate()} ${monthName} ${date.getFullYear()}`;
}

export const SPTJM_DAY_OPTIONS = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  "Jum'at",
  'Sabtu',
  'Minggu',
] as const;

function parseIsoOrTodayDate(isoDate?: string): Date {
  return parseLocalDateFromInput(isoDate);
}

export function getSptjmAutoDayFromIso(isoDate?: string): string {
  const date = parseIsoOrTodayDate(isoDate);
  const idx = date.getDay();
  if (idx === 5) return "Jum'at";
  return INDONESIAN_WEEKDAYS[idx] || 'Senin';
}

export function formatIndonesianDDMonthYYYY(isoDate?: string): string {
  const date = parseIsoOrTodayDate(isoDate);
  const dd = String(date.getDate()).padStart(2, '0');
  const monthName = INDONESIAN_MONTHS[date.getMonth()] || 'Januari';
  return `${dd} ${monthName} ${date.getFullYear()}`;
}

export function formatSptjmFullDate(sptjmConfig?: Partial<SptjmTemplateConfig>): string {
  const hariVal = (sptjmConfig?.hari || '').trim();
  const isoVal = normalizeIsoDateInput(sptjmConfig?.tanggalIso) || (sptjmConfig?.tanggalIso || '').trim();
  const customLegacy = (sptjmConfig?.tanggalCustomText || '').trim();
  if (customLegacy && !hariVal && !isoVal) {
    return customLegacy;
  }
  const resolvedDay = hariVal || getSptjmAutoDayFromIso(isoVal);
  const resolvedDate = formatIndonesianDDMonthYYYY(isoVal);
  return `${resolvedDay} ${resolvedDate}`;
}

export function formatIndonesianDayShortDate(isoDate?: string): string {
  const dayName = getSptjmAutoDayFromIso(isoDate);
  return `${dayName} ${formatIndonesianDDMonthYYYY(isoDate)}`;
}

export function formatScheduleIndonesianDate(targetDate?: string, targetDay?: string): string {
  const raw = (targetDate || '').trim();
  const manualDay = (targetDay || '').trim();
  if (!raw) return manualDay || '-';
  const normalizedIso = normalizeIsoDateInput(raw);
  if (normalizedIso) {
    const [yyyy, mm, dd] = normalizedIso.split('-');
    const dayName = manualDay || getSptjmAutoDayFromIso(normalizedIso);
    return `${dayName}, ${dd}-${mm}-${yyyy}`;
  }
  return manualDay ? `${manualDay}, ${raw}` : raw;
}

export function formatBastProposalLocation(
  record: Pick<KpmRecord, 'kabKota' | 'kecamatan' | 'kelurahan' | 'proposal' | 'proposalId' | 'tahun'>,
  proposals: ProposalRecord[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): string {
  const dom = resolveKpmDomicile(record, proposals, wilayahList);
  const propTitle = (record.proposal || '').trim();
  const kabKota = (record.kabKota || dom.kabKota || '').trim();
  const rawKec = (record.kecamatan || dom.kecamatan || '').replace(/^kecamatan\s+/i, '').trim();
  const kecLabel = rawKec ? `Kecamatan ${rawKec}` : '';
  const rawKel = (record.kelurahan || dom.kelurahan || '').trim();
  const kelLabel = rawKel
    ? /^(kelurahan|desa)\s+/i.test(rawKel)
      ? rawKel
      : `Kelurahan ${rawKel}`
    : '';

  if (!propTitle) {
    return [kelLabel, kecLabel, kabKota].filter(Boolean).join(', ') || '-';
  }

  const lower = propTitle.toLowerCase();
  const hasKecInTitle = /\bkecamatan\s+/i.test(lower);
  const hasKelInTitle = /\b(kelurahan|desa)\s+/i.test(lower);
  const isKecScope = isKecamatanProposal(propTitle);

  const parts: string[] = [propTitle];
  if (!isKecScope && (hasKelInTitle || !hasKecInTitle) && !hasKecInTitle && kecLabel) {
    parts.push(kecLabel);
  }
  if (kabKota && !lower.includes(kabKota.toLowerCase())) {
    parts.push(kabKota);
  }
  return parts.join(', ');
}

export function formatNomorDinsosLocationLines(
  proposalName: string | undefined,
  tahun: string | undefined,
  proposals: ProposalRecord[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST,
  fallbackRecord?: Pick<KpmRecord, 'kabKota' | 'kecamatan' | 'kelurahan'>
): string[] {
  const propTitle = (proposalName || '').trim();
  const matchedProp =
    (tahun
      ? proposals.find((p) => p.namaProposal === propTitle && p.tahun === tahun)
      : undefined) ?? proposals.find((p) => p.namaProposal === propTitle);

  const dom = propTitle
    ? resolveProposalDomicile(propTitle, proposals, tahun, wilayahList)
    : {
        kabKota: fallbackRecord?.kabKota || '',
        kecamatan: fallbackRecord?.kecamatan || '',
        kelurahan: fallbackRecord?.kelurahan || '',
      };

  const rawKel = (matchedProp?.kelurahan || dom.kelurahan || fallbackRecord?.kelurahan || '').trim();
  const kelLabel = rawKel
    ? /^(kelurahan|kel\.?|desa|ds\.?)\s+/i.test(rawKel)
      ? rawKel.replace(/^kel\.?\s+/i, 'Kelurahan ')
      : `Kelurahan ${rawKel}`
    : '';

  const rawKec = (matchedProp?.kecamatan || dom.kecamatan || fallbackRecord?.kecamatan || '')
    .replace(/^(?:kecamatan|kec\.?)\s+/i, '')
    .trim();
  const kecLabel = rawKec ? `Kecamatan ${rawKec}` : '';

  let kabKota = (matchedProp?.kabKota || dom.kabKota || fallbackRecord?.kabKota || '').trim();
  if (!kabKota && rawKec) {
    const matchedKab = wilayahList.find((w) =>
      w.kecamatanList.some((k) => k.nama.toLowerCase() === rawKec.toLowerCase())
    );
    if (matchedKab) kabKota = matchedKab.nama;
  }

  if (!propTitle) {
    return [kelLabel, kecLabel, kabKota].filter(Boolean);
  }

  const startsWithKel = /^(?:kelurahan|kel\.?|desa|ds\.?)\s+/i.test(propTitle);
  const startsWithKec = /^(?:kecamatan|kec\.?)\s+/i.test(propTitle);
  const hasKelInTitle = /\b(?:kelurahan|kel\.?|desa|ds\.?)\s+/i.test(propTitle);
  const hasKecInTitle = /\b(?:kecamatan|kec\.?)\s+/i.test(propTitle);
  const propLower = propTitle.toLowerCase();

  const lines: string[] = [];
  const pushUnique = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    const cleanLower = clean.toLowerCase();
    if (lines.some((existing) => existing.toLowerCase() === cleanLower)) return;
    lines.push(clean);
  };

  if (startsWithKel) {
    pushUnique(propTitle);
    if (!hasKecInTitle && kecLabel) pushUnique(kecLabel);
    if (kabKota && !propLower.includes(kabKota.toLowerCase())) pushUnique(kabKota);
    return lines;
  }

  if (startsWithKec) {
    pushUnique(propTitle);
    if (kabKota && !propLower.includes(kabKota.toLowerCase())) pushUnique(kabKota);
    return lines;
  }

  if (hasKelInTitle) {
    const splitKel = propTitle.match(/^(.+?)[,\s\-–]+\b((?:kelurahan|kel\.?|desa|ds\.?)\s+.+)$/i);
    if (splitKel) {
      const streetPart = splitKel[1].replace(/[,\s\-–]+$/, '').trim();
      const restPart = splitKel[2].trim();
      const splitKecInRest = restPart.match(/^(.+?)[,\s\-–]+\b((?:kecamatan|kec\.?)\s+.+)$/i);
      if (streetPart) pushUnique(streetPart);
      if (splitKecInRest) {
        pushUnique(splitKecInRest[1].replace(/[,\s\-–]+$/, '').trim());
        pushUnique(splitKecInRest[2].trim());
      } else {
        pushUnique(restPart);
        if (kecLabel) pushUnique(kecLabel);
      }
    } else {
      pushUnique(propTitle);
      if (!hasKecInTitle && kecLabel) pushUnique(kecLabel);
    }
    if (kabKota && !propLower.includes(kabKota.toLowerCase())) pushUnique(kabKota);
    return lines;
  }

  if (hasKecInTitle) {
    const splitKec = propTitle.match(/^(.+?)[,\s\-–]+\b((?:kecamatan|kec\.?)\s+.+)$/i);
    if (splitKec) {
      const streetPart = splitKec[1].replace(/[,\s\-–]+$/, '').trim();
      const kecPart = splitKec[2].trim();
      if (streetPart) pushUnique(streetPart);
      if (kecPart) pushUnique(kecPart);
    } else {
      pushUnique(propTitle);
    }
    return lines;
  }

  const hasMetaKel = Boolean((matchedProp?.kelurahan || '').trim());
  if (hasMetaKel && kelLabel) {
    pushUnique(propTitle);
    pushUnique(kelLabel);
    if (kecLabel) pushUnique(kecLabel);
    if (kabKota && !propLower.includes(kabKota.toLowerCase())) pushUnique(kabKota);
    return lines;
  }
  if (kecLabel) {
    pushUnique(propTitle);
    pushUnique(kecLabel);
    return lines;
  }

  pushUnique(propTitle);
  if (kabKota && !propLower.includes(kabKota.toLowerCase())) pushUnique(kabKota);
  return lines;
}

export function isKecamatanScopedProposalForCoupon(
  record: Pick<KpmRecord, 'proposal' | 'proposalId' | 'tahun'>,
  proposals: ProposalRecord[] = []
): boolean {
  const propName = (record.proposal || '').trim();
  if (!propName) return true;
  const lower = propName.toLowerCase();
  const hasKel = /\b(kelurahan|desa)\s+/i.test(lower);
  const hasKec = /\bkecamatan\s+/i.test(lower);
  if (hasKec && !hasKel) return true;
  if (isKecamatanProposal(propName)) return true;
  const matchedProp =
    (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
    proposals.find((p) => p.namaProposal === propName && p.tahun === record.tahun) ??
    proposals.find((p) => p.namaProposal === propName);
  if (
    matchedProp &&
    !(matchedProp.kelurahan || '').trim() &&
    Boolean((matchedProp.kecamatan || '').trim())
  ) {
    return true;
  }
  return false;
}

export function shouldAutoIncludeKelurahanColumn(proposalName?: string): boolean {
  const trimmed = (proposalName || '').trim();
  if (!trimmed) return true;
  return !trimmed.toLowerCase().includes('kelurahan');
}

export function doesKpmRecordMatchCheckedColumns(
  rec: KpmRecord,
  selectedColumns: PdfColumnKey[],
  proposals: ProposalRecord[],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST,
  autoExcludeKelurahanWhenInProposalTitle = false
): boolean {
  const effectiveCols =
    autoExcludeKelurahanWhenInProposalTitle && !shouldAutoIncludeKelurahanColumn(rec.proposal)
      ? selectedColumns.filter((c) => c !== 'kelurahan')
      : selectedColumns;

  const domicile = resolveKpmDomicile(rec, proposals, wilayahList);

  for (const col of effectiveCols) {
    switch (col) {
      case 'no':
        break;
      case 'item': {
        const val = (rec.item || '').trim();
        if (!val || val === '-') return false;
        break;
      }
      case 'nama': {
        const val = (rec.nama || '').trim();
        if (!val || val === '-') return false;
        break;
      }
      case 'alamat': {
        const val = (rec.alamat || '').trim();
        if (!val || val === '-') return false;
        break;
      }
      case 'desil': {
        if (formatDesilValue(rec.dtsen) === '-') return false;
        break;
      }
      case 'rtRw': {
        const rt = (rec.rt || '').trim();
        const rw = (rec.rw || '').trim();
        const hasRt = Boolean(rt && rt !== '-');
        const hasRw = Boolean(rw && rw !== '-');
        if (!hasRt && !hasRw) return false;
        break;
      }
      case 'kontak': {
        if (!formatPhoneForPdf(rec.kontak)) return false;
        break;
      }
      case 'pengelola': {
        const val = (rec.pengelola || '').trim();
        if (!val || val === '-' || val.toLowerCase() === 'tanpa pengelola') return false;
        break;
      }
      case 'kelurahan': {
        const val = (domicile.kelurahan || '').trim();
        if (!val || val === '-' || val.toLowerCase() === 'tanpa kelurahan') return false;
        break;
      }
      case 'kecamatan': {
        const val = (
          domicile.kecamatan ||
          (rec.proposal
            ? resolveProposalKecamatanCategory(rec.proposal, proposals, rec.tahun, wilayahList)
            : '')
        )
          .replace(/^Kecamatan\s+/i, '')
          .trim();
        if (!val || val === '-') return false;
        break;
      }
      case 'proposal': {
        if (!(rec.proposal || '').trim()) return false;
        break;
      }
      case 'administrasi': {
        if (!(Number(rec.payment || 0) > 0)) return false;
        break;
      }
      case 'nikKtp': {
        if (!(rec.nikKtp || '').replace(/\D/g, '')) return false;
        break;
      }
      case 'nikKk': {
        if (!(rec.nikKk || '').replace(/\D/g, '')) return false;
        break;
      }
      case 'catatan': {
        const val = (rec.catatan || '').trim();
        if (!val || val === '-') return false;
        break;
      }
    }
  }
  return true;
}

export function formatScheduleDateTimeForCoupon(
  targetDate: string,
  targetTime?: string,
  targetDay?: string
): string {
  const normalizedIso = normalizeIsoDateInput(targetDate);
  let dateLabel = (targetDate || '').trim();
  if (normalizedIso) {
    const [y, m, d] = normalizedIso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      const autoDay = dt.getDay() === 5 ? "Jum'at" : INDONESIAN_WEEKDAYS[dt.getDay()] || 'Senin';
      const dayName = (targetDay || '').trim() || autoDay;
      const monthName = INDONESIAN_MONTHS[dt.getMonth()] || 'Januari';
      dateLabel = `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
    }
  }
  const timeTrimmed = (targetTime || '').trim();
  if (!timeTrimmed) return dateLabel;
  const normalizedTime = timeTrimmed.replace(/:/g, '.');
  return dateLabel ? `${dateLabel} - Pukul : ${normalizedTime}` : `Pukul : ${normalizedTime}`;
}

export function resolveScheduleForProposal(
  proposalName: string | undefined,
  tahun: string | undefined,
  schedules: ScheduleEventItem[] = []
): ScheduleEventItem | undefined {
  const targetName = (proposalName || '').trim().toLowerCase();
  if (!targetName || !Array.isArray(schedules) || schedules.length === 0) return undefined;
  const targetYear = (tahun || '').trim();

  const matches = schedules.filter((ev) => {
    const evProp = (ev.proposalName || '').trim().toLowerCase();
    if (!evProp || evProp !== targetName) return false;
    const evYear = (ev.tahun || '').trim();
    if (evYear && targetYear && evYear !== targetYear) return false;
    return true;
  });

  if (matches.length === 0) return undefined;

  const score = (ev: ScheduleEventItem): number => {
    let s = 0;
    if (ev.category === 'distribusi') s += 100;
    else if (ev.category === 'dinas') s += 20;
    if (ev.bookId === 'book-2') s += 200;
    if ((ev.location || '').trim()) s += 30;
    if (!ev.completed) s += 15;
    return s;
  };

  return [...matches].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    const yearCmp =
      ((b.tahun || '').trim() === targetYear ? 1 : 0) -
      ((a.tahun || '').trim() === targetYear ? 1 : 0);
    if (yearCmp !== 0) return yearCmp;
    return (b.targetDate || '').localeCompare(a.targetDate || '');
  })[0];
}

export function resolveScheduleForProposalInBook(
  proposalName: string | undefined,
  tahun: string | undefined,
  schedules: ScheduleEventItem[] = [],
  bookId?: string,
  scheduleBooks?: ScheduleBook[],
  scheduleBookMap: Record<string, string> = {}
): ScheduleEventItem | undefined {
  const targetName = (proposalName || '').trim().toLowerCase();
  if (!targetName || !Array.isArray(schedules) || schedules.length === 0) return undefined;
  const targetYear = (tahun || '').trim();
  const normalizedBookId = (bookId || '').trim();

  if (!normalizedBookId || normalizedBookId === 'all') {
    return resolveScheduleForProposal(proposalName, tahun, schedules);
  }

  const matches = schedules.filter((ev) => {
    if (resolveScheduleBookId(ev, scheduleBookMap, scheduleBooks) !== normalizedBookId) {
      return false;
    }
    const evProp = (ev.proposalName || '').trim().toLowerCase();
    if (!evProp || evProp !== targetName) return false;
    const evYear = (ev.tahun || '').trim();
    if (evYear && targetYear && evYear !== targetYear) return false;
    return true;
  });

  if (matches.length === 0) return undefined;

  return [...matches].sort((a, b) => {
    const activeDiff = (a.completed ? 0 : 1) - (b.completed ? 0 : 1);
    if (activeDiff !== 0) return -activeDiff;
    const yearCmp =
      ((b.tahun || '').trim() === targetYear ? 1 : 0) -
      ((a.tahun || '').trim() === targetYear ? 1 : 0);
    if (yearCmp !== 0) return yearCmp;
    return (b.targetDate || '').localeCompare(a.targetDate || '');
  })[0];
}

export interface AbsensiScheduleFields {
  tanggal: string;
  hari: string;
  pukul: string;
}

export function formatAbsensiScheduleFields(
  schedule?: Pick<ScheduleEventItem, 'targetDate' | 'targetDay' | 'targetTime'>
): AbsensiScheduleFields {
  if (!schedule) {
    return { tanggal: '', hari: '', pukul: '' };
  }
  const iso = normalizeIsoDateInput(schedule.targetDate);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  let tanggal = '';
  let autoDay = '';
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map((n) => Number(n));
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, '0');
      const monthName = months[dt.getMonth()] || '';
      tanggal = `${dd} ${monthName} ${dt.getFullYear()}`;
      autoDay = days[dt.getDay()] || '';
    }
  }

  const hari = (schedule.targetDay || '').trim() || autoDay;
  const rawTime = (schedule.targetTime || '').trim();
  let pukul = '';
  if (rawTime) {
    pukul = /\bwib\b/i.test(rawTime) ? rawTime : `${rawTime} WIB`;
  }

  return { tanggal, hari, pukul };
}

export function resolveCouponScheduleForRecord(
  record: Pick<KpmRecord, 'proposal' | 'proposalId' | 'tahun'>,
  schedules: ScheduleEventItem[] = [],
  proposals: ProposalRecord[] = [],
  fallbackConfig: CouponPrintConfig = DEFAULT_COUPON_CONFIG,
  bookOptions?: {
    scheduleBookId?: string;
    scheduleBooks?: ScheduleBook[];
    scheduleBookMap?: Record<string, string>;
  }
): CouponPrintConfig & { matchedSchedule?: ScheduleEventItem } {
  const matchedProp =
    (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
    proposals.find((p) => p.namaProposal === record.proposal && p.tahun === record.tahun) ??
    proposals.find((p) => p.namaProposal === record.proposal);

  const propName = matchedProp?.namaProposal || record.proposal;
  const propYear = matchedProp?.tahun || record.tahun;
  const targetBookId = (bookOptions?.scheduleBookId || '').trim();
  const matchedSchedule =
    targetBookId && targetBookId !== 'all'
      ? resolveScheduleForProposalInBook(
          propName,
          propYear,
          schedules,
          targetBookId,
          bookOptions?.scheduleBooks,
          bookOptions?.scheduleBookMap
        )
      : resolveScheduleForProposal(propName, propYear, schedules);

  if (!matchedSchedule) {
    return {
      ...fallbackConfig,
      jadwal: fallbackConfig.jadwal || '',
      lokasi: fallbackConfig.lokasi || '',
      footerText: fallbackConfig.footerText || DEFAULT_COUPON_CONFIG.footerText,
    };
  }

  const autoJadwal = formatScheduleDateTimeForCoupon(
    matchedSchedule.targetDate,
    matchedSchedule.targetTime,
    matchedSchedule.targetDay
  );
  const autoLokasi = (matchedSchedule.location || '').trim();

  return {
    ...fallbackConfig,
    jadwal: autoJadwal || fallbackConfig.jadwal || '',
    lokasi: autoLokasi || fallbackConfig.lokasi || '',
    footerText: fallbackConfig.footerText || DEFAULT_COUPON_CONFIG.footerText,
    matchedSchedule,
  };
}

export function normalizePejabatNipNumber(raw?: string): string {
  return (raw || '')
    .replace(/^\s*NIP\.?\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trimStart();
}

export function formatOfficialNipLine(raw?: string): string {
  const digits = normalizePejabatNipNumber(raw).trim();
  return digits ? `NIP. ${digits}` : '';
}

export function resolveEffectiveBastConfig(
  globalTemplate: BastTemplateConfig | undefined,
  proposalBastMap: ProposalBastMap | undefined,
  proposalId?: string,
  reportTemplate?: ReportTemplateConfig
): BastTemplateConfig {
  const base: BastTemplateConfig = {
    ...DEFAULT_BAST_TEMPLATE,
    ...(globalTemplate || {}),
  };
  const override = proposalId && proposalBastMap ? proposalBastMap[proposalId] : undefined;
  const merged: BastTemplateConfig = {
    ...base,
    ...(override || {}),
  };
  const resolvedLogo =
    (override?.kopLogoDataUrl || '').trim() ||
    (globalTemplate?.kopLogoDataUrl || '').trim() ||
    (reportTemplate?.kopLogoDataUrl || '').trim() ||
    DEFAULT_KOP_LOGO_URL;

  return {
    ...merged,
    pejabatNip: normalizePejabatNipNumber(merged.pejabatNip).trim(),
    kopLogoDataUrl: resolvedLogo,
  };
}

export function computeScaledColumnWidths(columns: PdfColumnDefinition[]): number[] {
  if (columns.length === 0) return [];
  const totalBase = columns.reduce((sum, c) => sum + c.baseWidthMm, 0);

  if (totalBase <= PRINTABLE_WIDTH_MM) {
    const remaining = PRINTABLE_WIDTH_MM - totalBase;
    const flexTotal = columns
      .filter((c) => c.flexible)
      .reduce((sum, c) => sum + c.baseWidthMm, 0);
    const nonFlexExtraRatio = flexTotal > 0 ? 0.25 : 1;
    const flexExtraPool = remaining * (1 - nonFlexExtraRatio);
    const nonFlexExtraPool = remaining * nonFlexExtraRatio;
    const nonFlexTotal = columns
      .filter((c) => !c.flexible)
      .reduce((sum, c) => sum + c.baseWidthMm, 0);

    const rawWidths = columns.map((col) => {
      if (col.flexible && flexTotal > 0) {
        return col.baseWidthMm + (flexExtraPool * col.baseWidthMm) / flexTotal;
      }
      if (!col.flexible && nonFlexTotal > 0) {
        return col.baseWidthMm + (nonFlexExtraPool * col.baseWidthMm) / nonFlexTotal;
      }
      return (col.baseWidthMm / totalBase) * PRINTABLE_WIDTH_MM;
    });

    const sum = rawWidths.reduce((s, w) => s + w, 0);
    return rawWidths.map((w) => Number(((w / sum) * PRINTABLE_WIDTH_MM).toFixed(2)));
  }

  const ratio = PRINTABLE_WIDTH_MM / totalBase;
  const scaled = columns.map((col) => Math.max(col.minWidthMm, col.baseWidthMm * ratio));
  const scaledSum = scaled.reduce((sum, w) => sum + w, 0);
  const adjustRatio = PRINTABLE_WIDTH_MM / scaledSum;
  return scaled.map((w) => Number((w * adjustRatio).toFixed(2)));
}

export type KpmSubItemStatusFilter = 'all' | 'incomplete' | 'complete';
export type CatNomorOrientation = 'landscape' | 'portrait';
export type CatNomorPaperSize = 'a4' | 'f4';

export interface CatNomorItemColumn {
  code: string;
  name: string;
  shortLabel: string;
  totalUnits: number;
}

export interface CatNomorProposalRow {
  key: string;
  proposalId?: string;
  proposalName: string;
  tahun: string;
  tipe?: ProposalTipe;
  kecamatanCategory: string;
  totalSlots: number;
  rangesByItem: Record<string, string>;
  countsByItem: Record<string, number>;
}

export interface CatNomorMatrixData {
  yearLabel: string;
  columns: CatNomorItemColumn[];
  rows: CatNomorProposalRow[];
  totalProposals: number;
  totalSlots: number;
}

function formatCatNomorItemShortLabel(code: string, rawName?: string): string {
  const cleanName = (rawName || '').trim();
  if (!cleanName || cleanName.toUpperCase() === code.toUpperCase()) {
    return code.toUpperCase();
  }
  const shortened = cleanName
    .replace(/^Peralatan\s+/i, 'Alat ')
    .replace(/^Paket\s+/i, 'Alat ')
    .replace(/^Tenda\s*&\s*Kursi$/i, 'Tenda')
    .trim();
  return shortened || cleanName;
}

function formatSlotNumberRanges(
  slotNumbers: number[],
  emptySlotNumbers?: Set<number>
): string {
  if (slotNumbers.length === 0) return '—';
  const sorted = Array.from(
    new Set(slotNumbers.filter((n) => Number.isFinite(n) && n >= 1))
  ).sort((a, b) => a - b);
  if (sorted.length === 0) return '—';

  const pad = (n: number) => String(n).padStart(2, '0');
  const runs: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const isGapOnlyEmpty =
      cur > prev + 1 &&
      Boolean(emptySlotNumbers && emptySlotNumbers.size > 0) &&
      Array.from({ length: cur - prev - 1 }, (_, idx) => prev + 1 + idx).every((n) =>
        emptySlotNumbers!.has(n)
      );
    if (cur === prev + 1 || isGapOnlyEmpty) {
      prev = cur;
    } else {
      runs.push([start, prev]);
      start = cur;
      prev = cur;
    }
  }
  runs.push([start, prev]);

  return runs.map(([a, b]) => `${pad(a)} – ${pad(b)}`).join('\n');
}

export function buildCatNomorBarangMatrix(options: {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  selectedYear: string;
  proposalNameFilter?: string;
  proposalTipeFilter?: 'all' | ProposalTipe;
  proposalKeysFilter?: string[];
}): CatNomorMatrixData {
  const {
    records,
    proposals,
    items,
    wilayahList = INITIAL_WILAYAH_LIST,
    proposalSlotMap = {},
    selectedYear,
    proposalNameFilter = 'all',
    proposalTipeFilter = 'all',
    proposalKeysFilter,
  } = options;

  const isSpecificYear = Boolean(
    selectedYear &&
      selectedYear !== 'all' &&
      selectedYear !== 'database' &&
      selectedYear !== 'arsip' &&
      selectedYear !== 'database_arsip'
  );
  const yearLabel = isSpecificYear ? selectedYear : 'Semua Tahun';

  interface ProposalCandidate {
    key: string;
    proposalId?: string;
    proposalName: string;
    tahun: string;
    tipe?: ProposalTipe;
    groupRecords: KpmRecord[];
  }

  const candidateMap = new Map<string, ProposalCandidate>();

  const matchesScope = (namaProposal: string, tahun: string, tipe?: ProposalTipe): boolean => {
    if (!namaProposal.trim()) return false;
    if (isSpecificYear && tahun !== selectedYear) return false;
    if (proposalNameFilter && proposalNameFilter !== 'all') {
      if (namaProposal.trim().toLowerCase() !== proposalNameFilter.trim().toLowerCase()) {
        return false;
      }
    }
    if (proposalTipeFilter !== 'all' && tipe !== proposalTipeFilter) {
      return false;
    }
    return true;
  };

  for (const prop of proposals) {
    const name = (prop.namaProposal || '').trim();
    const yr = (prop.tahun || '').trim();
    if (!matchesScope(name, yr, prop.tipe)) continue;
    const key = `${name.toLowerCase()}__${yr}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        key,
        proposalId: prop.id,
        proposalName: name,
        tahun: yr,
        tipe: prop.tipe,
        groupRecords: [],
      });
    }
  }

  const propById = new Map<string, ProposalRecord>();
  const propByNameYear = new Map<string, ProposalRecord>();
  for (const p of proposals) {
    if (p.id) propById.set(p.id, p);
    const k = `${(p.namaProposal || '').trim().toLowerCase()}__${(p.tahun || '').trim()}`;
    if (!propByNameYear.has(k)) propByNameYear.set(k, p);
  }

  for (const rec of records) {
    if (rec.validasi !== 'accepted') continue;
    const name = (rec.proposal || '').trim();
    const yr = (rec.tahun || '').trim();
    if (!name) continue;
    const matchedProp =
      (rec.proposalId ? propById.get(rec.proposalId) : undefined) ??
      propByNameYear.get(`${name.toLowerCase()}__${yr}`);
    const resolvedName = matchedProp?.namaProposal?.trim() || name;
    const resolvedYear = matchedProp?.tahun?.trim() || yr;
    if (!matchesScope(resolvedName, resolvedYear, matchedProp?.tipe)) continue;

    const key = `${resolvedName.toLowerCase()}__${resolvedYear}`;
    let cand = candidateMap.get(key);
    if (!cand) {
      cand = {
        key,
        proposalId: matchedProp?.id ?? rec.proposalId ?? undefined,
        proposalName: resolvedName,
        tahun: resolvedYear,
        tipe: matchedProp?.tipe,
        groupRecords: [],
      };
      candidateMap.set(key, cand);
    }
    cand.groupRecords.push(rec);
  }

  const presentItemCodes = new Set<string>();
  const itemTotals = new Map<string, number>();
  const rawRows: CatNomorProposalRow[] = [];

  const allowedKeysSet = Array.isArray(proposalKeysFilter)
    ? new Set(proposalKeysFilter)
    : null;

  const recordById = new Map<string, KpmRecord>();
  for (const rec of records) {
    if (rec.id) recordById.set(rec.id, rec);
  }

  for (const cand of candidateMap.values()) {
    if (allowedKeysSet && !allowedKeysSet.has(cand.key)) continue;
    const slotResolution = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      cand.proposalId,
      cand.proposalName,
      cand.tahun,
      proposals
    );
    const mergedSlots = buildMergedProposalSlots({
      groupRecords: cand.groupRecords,
      slotState: slotResolution.state,
      proposals,
      catalog: items,
      wilayahList,
    });

    if (mergedSlots.length === 0) continue;

    const slotsByItem = new Map<string, number[]>();
    const emptySlotNumbers = new Set<number>();

    for (let slotIdx = 0; slotIdx < mergedSlots.length; slotIdx += 1) {
      const slot = mergedSlots[slotIdx];
      let rawCode = '';

      if (slot.kind === 'empty') {
        rawCode = (slot.emptySlot.item || '').trim().toUpperCase();
        if (!rawCode && slot.emptySlot.previousKpmId) {
          rawCode = (recordById.get(slot.emptySlot.previousKpmId)?.item || '')
            .trim()
            .toUpperCase();
        }
        if (!rawCode) {
          let prevItem = '';
          for (let i = slotIdx - 1; i >= 0; i -= 1) {
            const candidate = mergedSlots[i];
            if (candidate.kind === 'kpm') {
              prevItem = (candidate.record.item || '').trim().toUpperCase();
              break;
            }
            if ((candidate.emptySlot.item || '').trim()) {
              prevItem = (candidate.emptySlot.item || '').trim().toUpperCase();
              break;
            }
          }
          let nextItem = '';
          for (let i = slotIdx + 1; i < mergedSlots.length; i += 1) {
            const candidate = mergedSlots[i];
            if (candidate.kind === 'kpm') {
              nextItem = (candidate.record.item || '').trim().toUpperCase();
              break;
            }
            if ((candidate.emptySlot.item || '').trim()) {
              nextItem = (candidate.emptySlot.item || '').trim().toUpperCase();
              break;
            }
          }
          if (prevItem && prevItem === nextItem) {
            rawCode = prevItem;
          } else if (prevItem && !nextItem) {
            rawCode = prevItem;
          } else if (!prevItem && nextItem) {
            rawCode = nextItem;
          }
        }
        if (!rawCode) {
          emptySlotNumbers.add(slot.slotNumber);
          continue;
        }
      } else {
        rawCode = (slot.record.item || '').trim().toUpperCase();
        if (!rawCode) continue;
      }

      presentItemCodes.add(rawCode);
      const bucket = slotsByItem.get(rawCode) ?? [];
      bucket.push(slot.slotNumber);
      slotsByItem.set(rawCode, bucket);
      itemTotals.set(rawCode, (itemTotals.get(rawCode) ?? 0) + 1);
    }

    const rangesByItem: Record<string, string> = {};
    const countsByItem: Record<string, number> = {};
    for (const [code, slotNums] of slotsByItem.entries()) {
      rangesByItem[code] = formatSlotNumberRanges(slotNums, emptySlotNumbers);
      countsByItem[code] = slotNums.length;
    }

    rawRows.push({
      key: cand.key,
      proposalId: cand.proposalId,
      proposalName: cand.proposalName,
      tahun: cand.tahun,
      tipe: cand.tipe,
      kecamatanCategory: resolveProposalKecamatanCategory(
        cand.proposalName,
        proposals,
        cand.tahun,
        wilayahList
      ),
      totalSlots: mergedSlots.length,
      rangesByItem,
      countsByItem,
    });
  }

  const rowsByKecamatan = new Map<string, CatNomorProposalRow[]>();
  for (const row of rawRows) {
    const list = rowsByKecamatan.get(row.kecamatanCategory) ?? [];
    list.push(row);
    rowsByKecamatan.set(row.kecamatanCategory, list);
  }
  const sortedCategories = Array.from(rowsByKecamatan.keys()).sort(sortKecamatanCategoryNames);
  const sortedRows: CatNomorProposalRow[] = [];
  for (const cat of sortedCategories) {
    const group = rowsByKecamatan.get(cat) ?? [];
    const orderedGroup = sortProposalsWithinKecamatan(group, (r) => r.proposalName);
    sortedRows.push(...orderedGroup);
  }

  const catalogCodes = new Set<string>();
  const catalogNameMap = new Map<string, string>();
  const targetCatalogItems = isSpecificYear
    ? items.filter((it) => it.tahun === selectedYear)
    : items;

  for (const it of targetCatalogItems) {
    const code = (it.code || '').trim().toUpperCase();
    if (!code) continue;
    catalogCodes.add(code);
    if (!catalogNameMap.has(code) && it.name?.trim()) {
      catalogNameMap.set(code, it.name.trim());
    }
  }
  for (const code of presentItemCodes) {
    catalogCodes.add(code);
    if (!catalogNameMap.has(code)) {
      const found = items.find((it) => (it.code || '').trim().toUpperCase() === code);
      if (found?.name?.trim()) {
        catalogNameMap.set(code, found.name.trim());
      }
    }
  }

  const rankYear = isSpecificYear ? selectedYear : 'all';
  const columns: CatNomorItemColumn[] = Array.from(catalogCodes)
    .sort((a, b) => {
      const rankA = getItemHierarchyRank(a, rankYear, items);
      const rankB = getItemHierarchyRank(b, rankYear, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b, 'id');
    })
    .map((code) => {
      const fullName = catalogNameMap.get(code) || code;
      return {
        code,
        name: fullName,
        shortLabel: formatCatNomorItemShortLabel(code, fullName),
        totalUnits: itemTotals.get(code) ?? 0,
      };
    });

  const totalSlots = sortedRows.reduce((acc, r) => acc + r.totalSlots, 0);

  return {
    yearLabel,
    columns,
    rows: sortedRows,
    totalProposals: sortedRows.length,
    totalSlots,
  };
}

export interface AbsensiManualOverride {
  tanggal?: string;
  hari?: string;
  pukul?: string;
  lokasiKegiatan?: string;
}

export type AbsenDinasVariant = 'daftar_hadir' | 'makan_minum';

export interface AbsenArsipManualOverride {
  tanggal?: string;
  hari?: string;
  pukul?: string;
  judulKegiatan?: string;
  lokasiPembagian?: string;
  footerYear?: string;
}

export function formatAbsenDinasLocationText(
  proposalName: string,
  proposals: ProposalRecord[],
  tahun?: string,
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): string {
  const cleanProp = (proposalName || '').trim();
  const dom = resolveProposalDomicile(cleanProp, proposals, tahun, wilayahList);
  const kel = (dom.kelurahan || '').trim();
  const kec = (dom.kecamatan || '').trim();
  const kota = (dom.kabKota || '').trim();

  const cleanUpper = cleanProp.toUpperCase();
  const parts: string[] = [];

  if (kel) {
    parts.push(`KELURAHAN ${kel.toUpperCase()}`);
  } else if (cleanUpper && !kec) {
    parts.push(cleanUpper);
  } else if (cleanUpper && kec && !cleanUpper.includes(kec.toUpperCase())) {
    parts.push(cleanUpper);
  }

  if (kec) {
    parts.push(`KECAMATAN ${kec.toUpperCase()}`);
  }
  if (kota) {
    parts.push(kota.toUpperCase());
  }

  return parts.join(' ') || cleanUpper || '-';
}
