import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { jsPDF } from 'jspdf';
import autoTable, { Styles } from 'jspdf-autotable';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_KOP_LOGO_URL,
  DEFAULT_SCHEDULE_BOOKS,
  DEFAULT_SPTJM_TEMPLATE,
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalBastMap,
  ProposalRecord,
  ProposalSlotMap,
  ProposalTipe,
  ReportTemplateConfig,
  SCHEDULE_CATEGORY_LABELS,
  ScheduleBook,
  ScheduleEventItem,
  SptjmTemplateConfig,
  WilayahKabKota,
  resolveScheduleBookId,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  computeSubItemRecap,
  formatRupiah,
  formatUploadDateTime,
  getAbsenSeq,
  getDocumentDirectUrl,
  getDocumentThumbnailUrl,
  getItemHierarchyRank,
  getKpmSlotNumberInProposal,
  getKpmSubItemStatusList,
  getPrimaryKpmPhotoWithMeta,
  isKecamatanProposal,
  normalizeSubItemKey,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalDomicile,
  resolveProposalKecamatanCategory,
  resolveProposalSlotStateForGroup,
} from './imageProcessor';
import type { TroubleshootingReconcileResult } from './troubleshootingReconciler';
import {
  RabCalculatedSummary,
  formatRupiahCurrency,
  formatRupiahPlain,
} from './rabCalculator';

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

const PRINTABLE_WIDTH_MM = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.left - F4_PDF_MARGINS.right; // 181mm

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

type AutoTableDoc = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function sanitizePdfFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const base = cleaned || 'masdeta_export';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function formatDesilValue(dtsen: string): string {
  const trimmed = (dtsen || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'tidak ada') return '-';
  const match = trimmed.match(/(\d+)/);
  return match ? match[1] : trimmed;
}

function formatPhoneForPdf(raw: string): string {
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

function formatNikForPdf(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length === 16) {
    return `${digits.slice(0, 12)}\n${digits.slice(12)}`;
  }
  return digits;
}



const INDONESIAN_WEEKDAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

const INDONESIAN_MONTHS = [
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

function numberToIndonesianWords(n: number): string {
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

export function formatIndonesianDateWords(isoDate?: string): string {
  let date: Date;
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) {
    const [y, m, d] = isoDate.trim().split('-').map(Number);
    date = new Date(y, m - 1, d);
  } else if (isoDate && isoDate.trim()) {
    const parsed = new Date(isoDate);
    date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    date = new Date();
  }

  const dayName = INDONESIAN_WEEKDAYS[date.getDay()] || 'Senin';
  const dayWords = numberToIndonesianWords(date.getDate());
  const monthName = INDONESIAN_MONTHS[date.getMonth()] || 'Januari';
  const yearWords = numberToIndonesianWords(date.getFullYear());

  return `${dayName} tanggal ${dayWords} bulan ${monthName} tahun ${yearWords}`;
}

export function formatIndonesianShortDate(isoDate?: string): string {
  let date: Date;
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) {
    const [y, m, d] = isoDate.trim().split('-').map(Number);
    date = new Date(y, m - 1, d);
  } else if (isoDate && isoDate.trim()) {
    const parsed = new Date(isoDate);
    date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    date = new Date();
  }
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
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) {
    const [y, m, d] = isoDate.trim().split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (isoDate && isoDate.trim()) {
    const parsed = new Date(isoDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
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
  const isoVal = (sptjmConfig?.tanggalIso || '').trim();
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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const dayName = manualDay || getSptjmAutoDayFromIso(raw);
    return `${dayName}, ${m[3]}-${m[2]}-${m[1]}`;
  }
  if (!raw) return manualDay || '-';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    const dayName = manualDay || (parsed.getDay() === 5 ? "Jum'at" : INDONESIAN_WEEKDAYS[parsed.getDay()] || 'Senin');
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
  // Judul Kelurahan atau Jalan + Kelurahan wajib ditambah Kecamatan jika belum ada di judul.
  // Judul Kecamatan atau Jalan + Kecamatan TIDAK ditambah Kelurahan.
  if (!isKecScope && (hasKelInTitle || !hasKecInTitle) && !hasKecInTitle && kecLabel) {
    parts.push(kecLabel);
  }
  if (kabKota && !lower.includes(kabKota.toLowerCase())) {
    parts.push(kabKota);
  }
  return parts.join(', ');
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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((targetDate || '').trim());
  let dateLabel = (targetDate || '').trim();
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
    if (ev.bookId === 'book-2') s += 25;
    if ((ev.location || '').trim()) s += 30;
    if (!ev.completed) s += 15;
    return s;
  };

  return [...matches].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    const yearCmp = ((b.tahun || '').trim() === targetYear ? 1 : 0) - ((a.tahun || '').trim() === targetYear ? 1 : 0);
    if (yearCmp !== 0) return yearCmp;
    return (b.targetDate || '').localeCompare(a.targetDate || '');
  })[0];
}

export function resolveCouponScheduleForRecord(
  record: Pick<KpmRecord, 'proposal' | 'proposalId' | 'tahun'>,
  schedules: ScheduleEventItem[] = [],
  proposals: ProposalRecord[] = [],
  fallbackConfig: CouponPrintConfig = DEFAULT_COUPON_CONFIG
): CouponPrintConfig & { matchedSchedule?: ScheduleEventItem } {
  const matchedProp =
    (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
    proposals.find((p) => p.namaProposal === record.proposal && p.tahun === record.tahun) ??
    proposals.find((p) => p.namaProposal === record.proposal);

  const propName = matchedProp?.namaProposal || record.proposal;
  const propYear = matchedProp?.tahun || record.tahun;
  const matchedSchedule = resolveScheduleForProposal(propName, propYear, schedules);

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

function computeScaledColumnWidths(columns: PdfColumnDefinition[]): number[] {
  if (columns.length === 0) return [];
  const totalBase = columns.reduce((sum, c) => sum + c.baseWidthMm, 0);

  if (totalBase <= PRINTABLE_WIDTH_MM) {
    // Distribusikan sisa lebar penuh ke seluruh kolom secara seimbang dengan porsi lebih untuk kolom fleksibel
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

  // Jika 9-12 kolom terpilih: skalakan proporsional dengan tetap menjaga minWidthMm tiap kolom
  const ratio = PRINTABLE_WIDTH_MM / totalBase;
  const scaled = columns.map((col) => Math.max(col.minWidthMm, col.baseWidthMm * ratio));
  const scaledSum = scaled.reduce((sum, w) => sum + w, 0);
  const adjustRatio = PRINTABLE_WIDTH_MM / scaledSum;
  return scaled.map((w) => Number((w * adjustRatio).toFixed(2)));
}

async function saveOrOpenPdfDocument(
  doc: jsPDF,
  rawFileName: string
): Promise<{ savedFileName: string; openedNative: boolean }> {
  const fileName = sanitizePdfFileName(rawFileName);

  if (!Capacitor.isNativePlatform()) {
    doc.save(fileName);
    return { savedFileName: fileName, openedNative: false };
  }

  const dataUri = doc.output('datauristring');
  const commaIdx = dataUri.indexOf(',');
  const base64Data = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;

  const writeTargets: { directory: Directory; path: string }[] = [
    { directory: Directory.Documents, path: `MASDETA/${fileName}` },
    { directory: Directory.Cache, path: fileName },
  ];

  let writtenUri: string | null = null;
  for (const target of writeTargets) {
    try {
      await Filesystem.writeFile({
        path: target.path,
        data: base64Data,
        directory: target.directory,
        recursive: true,
      });
      const uriRes = await Filesystem.getUri({
        path: target.path,
        directory: target.directory,
      });
      writtenUri = uriRes.uri;
      break;
    } catch {
      // Coba target penyimpanan berikutnya
    }
  }

  if (!writtenUri) {
    throw new Error('Gagal menyimpan file PDF ke penyimpanan perangkat.');
  }

  await FileOpener.openFile({
    path: writtenUri,
    mimeType: 'application/pdf',
  });

  return { savedFileName: fileName, openedNative: true };
}

export interface ExportKpmTablePdfOptions {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  selectedColumns: PdfColumnKey[];
  title: string;
  subtitle?: string;
  fileName: string;
  includeSummary?: boolean;
  reportTemplate?: ReportTemplateConfig;
  splitByProposal?: boolean;
  autoExcludeKelurahanWhenInProposalTitle?: boolean;
  selectedPengelolaLabel?: string;
  proposalSlotMap?: ProposalSlotMap;
  includeEmptySlots?: boolean;
  proposalMeta?: { id?: string; namaProposal: string; tahun: string };
}

export async function exportKpmTableToPdf({
  records,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  selectedColumns,
  title,
  subtitle,
  fileName,
  includeSummary = true,
  reportTemplate,
  splitByProposal = false,
  autoExcludeKelurahanWhenInProposalTitle = false,
  selectedPengelolaLabel,
  proposalSlotMap = {},
  includeEmptySlots = true,
  proposalMeta,
}: ExportKpmTablePdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  // Urutkan data KPM berdasarkan tahun, proposal, nomor absen, & hierarki item
  const sortedRecords = [...records].sort((a, b) => {
    const yearCmp = (a.tahun || '').localeCompare(b.tahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.proposal || '').localeCompare(b.proposal || '', 'id');
    if (propCmp !== 0) return propCmp;
    const seqCmp = getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode);
    if (seqCmp !== 0) return seqCmp;
    const rankCmp =
      getItemHierarchyRank(a.item, a.tahun, items) - getItemHierarchyRank(b.item, b.tahun, items);
    if (rankCmp !== 0) return rankCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Selalu posisi Portrait F4 (216mm x 310mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const loadedReportLogo = reportTemplate?.enabled
    ? await loadSingleImageForPdf((reportTemplate.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL)
    : null;

  const renderSection = (sectionOpts: {
    sectionRecords: KpmRecord[];
    sectionTitle: string;
    sectionSubtitle?: string;
    proposalTitleForAutoKel?: string;
    proposalInfo?: { id?: string; namaProposal: string; tahun: string };
    grandTotalMoney?: { totalNominal: number; paidCount: number; totalCount: number };
  }) => {
    const {
      sectionRecords,
      sectionTitle,
      sectionSubtitle,
      proposalTitleForAutoKel,
      proposalInfo,
      grandTotalMoney,
    } = sectionOpts;

    const shouldOmitKelurahan =
      autoExcludeKelurahanWhenInProposalTitle &&
      proposalTitleForAutoKel !== undefined &&
      !shouldAutoIncludeKelurahanColumn(proposalTitleForAutoKel);

    const filteredColumnInput = shouldOmitKelurahan
      ? selectedColumns.filter((k) => k !== 'kelurahan')
      : selectedColumns;

    // Selalu sertakan 4 kolom wajib + add-on terpilih hingga maksimal 10 kolom total
    const mergedKeys = Array.from(new Set([...MANDATORY_PDF_COLUMN_KEYS, ...filteredColumnInput]));
    const activeCols = PDF_COLUMN_DEFINITIONS.filter((c) => mergedKeys.includes(c.key)).slice(
      0,
      MAX_PDF_TOTAL_COLUMNS
    );

    let headerTopY: number = F4_PDF_MARGINS.top;
    if (reportTemplate?.enabled) {
      const logoSpaceW = loadedReportLogo ? 16 : 0;
      if (loadedReportLogo) {
        const ratio = loadedReportLogo.width / Math.max(loadedReportLogo.height, 1);
        let drawW = 14;
        let drawH = 17.5;
        if (ratio > drawW / drawH) {
          drawH = drawW / ratio;
        } else {
          drawW = drawH * ratio;
        }
        doc.addImage(
          loadedReportLogo.dataUrl,
          loadedReportLogo.format,
          F4_PDF_MARGINS.left + (logoSpaceW - drawW) / 2,
          headerTopY + Math.max(0, (17.5 - drawH) / 2),
          drawW,
          drawH
        );
      }

      const centerX =
        F4_PDF_MARGINS.left + logoSpaceW + (PRINTABLE_WIDTH_MM - logoSpaceW) / 2;
      let textBottomY = headerTopY;
      if (reportTemplate.orgHeaderLine1?.trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, textBottomY + 4.5, {
          align: 'center',
        });
        textBottomY += 5.5;
      }
      if (reportTemplate.orgHeaderLine2?.trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 118, 110);
        doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, textBottomY + 4, {
          align: 'center',
        });
        textBottomY += 5;
      }
      if (reportTemplate.orgAddress?.trim()) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(reportTemplate.orgAddress.trim(), centerX, textBottomY + 3.5, {
          align: 'center',
        });
        textBottomY += 5;
      }
      headerTopY = Math.max(textBottomY, loadedReportLogo ? headerTopY + 18 : textBottomY);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.line(
        F4_PDF_MARGINS.left,
        headerTopY + 1,
        F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
        headerTopY + 1
      );
      doc.setLineWidth(0.2);
      doc.line(
        F4_PDF_MARGINS.left,
        headerTopY + 2.1,
        F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
        headerTopY + 2.1
      );
      headerTopY += 5;
    }

    // Header Dokumen
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(sectionTitle.trim() || 'Daftar KPM', F4_PDF_MARGINS.left, headerTopY + 6);

    let tableStartY = headerTopY + 11;
    if (sectionSubtitle && sectionSubtitle.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(sectionSubtitle.trim(), F4_PDF_MARGINS.left, headerTopY + 11);
      tableStartY = headerTopY + 15;
    }

    const colWidths = computeScaledColumnWidths(activeCols);
    const colCount = activeCols.length;
    // Skala ukuran huruf, tinggi baris minimum, dan padding secara adaptif agar tabel selalu proporsional & tidak dempetan
    const bodyFontSize =
      colCount <= 6 ? 9.2 : colCount <= 8 ? 8.6 : colCount === 9 ? 7.8 : colCount === 10 ? 7.2 : 6.4;
    const headFontSize =
      colCount <= 6 ? 9.0 : colCount <= 8 ? 8.4 : colCount === 9 ? 7.6 : colCount === 10 ? 7.0 : 6.1;
    const bodyMinCellHeight =
      colCount <= 6 ? 10.5 : colCount <= 8 ? 9.2 : colCount === 9 ? 8.4 : colCount === 10 ? 7.8 : 7.0;
    const headMinCellHeight = colCount <= 8 ? 9.5 : colCount <= 10 ? 8.5 : 7.8;
    const padY = colCount <= 6 ? 3.0 : colCount <= 8 ? 2.5 : colCount <= 10 ? 2.0 : 1.7;
    const padX = colCount <= 8 ? 1.8 : colCount <= 10 ? 1.3 : 0.85;

    const columnStyles: Record<number, Partial<Styles>> = {};
    activeCols.forEach((col, idx) => {
      columnStyles[idx] = {
        cellWidth: colWidths[idx],
        halign: col.halign,
      };
    });

    let slotEntries:
      | Array<
          | { kind: 'kpm'; slotNumber: number; record: KpmRecord }
          | { kind: 'empty'; slotNumber: number; item: string }
        >
      | null = null;

    if (includeEmptySlots && proposalInfo && proposalInfo.namaProposal?.trim()) {
      const propObj =
        (proposalInfo.id ? proposals.find((p) => p.id === proposalInfo.id) : undefined) ??
        proposals.find(
          (p) =>
            p.namaProposal === proposalInfo.namaProposal &&
            (!proposalInfo.tahun || p.tahun === proposalInfo.tahun)
        ) ??
        proposals.find((p) => p.namaProposal === proposalInfo.namaProposal);

      const { state: slotState } = resolveProposalSlotStateForGroup(
        proposalSlotMap,
        propObj?.id ?? proposalInfo.id,
        proposalInfo.namaProposal,
        proposalInfo.tahun,
        proposals
      );

      if (slotState && slotState.emptySlots.length > 0) {
        const merged = buildMergedProposalSlots({
          groupRecords: sectionRecords,
          slotState,
          proposals,
          catalog: items,
          wilayahList,
        });
        slotEntries = merged.map((item) =>
          item.kind === 'empty'
            ? {
                kind: 'empty' as const,
                slotNumber: item.slotNumber,
                item: (item.emptySlot.item || '').trim().toUpperCase(),
              }
            : { kind: 'kpm' as const, slotNumber: item.slotNumber, record: item.record }
        );
      }
    }

    const renderRows = slotEntries
      ? slotEntries
      : sectionRecords.map((rec, rowIdx) => {
          const seq = getAbsenSeq(rec.registerCode);
          return {
            kind: 'kpm' as const,
            slotNumber: seq < 999999 ? seq : rowIdx + 1,
            record: rec,
          };
        });

    const headRow = activeCols.map((c) => c.pdfHeader);
    const bodyRows = renderRows.map((entry) => {
      const absenText = String(entry.slotNumber).padStart(2, '0');
      if (entry.kind === 'empty') {
        return activeCols.map((col) => {
          if (col.key === 'no') return absenText;
          if (col.key === 'item') return entry.item || '';
          return '';
        });
      }

      const rec = entry.record;
      const domicile = resolveKpmDomicile(rec, proposals, wilayahList);
      const resolvedKel = (domicile.kelurahan || '-').trim();
      const resolvedKec = (
        domicile.kecamatan ||
        (rec.proposal
          ? resolveProposalKecamatanCategory(rec.proposal, proposals, rec.tahun, wilayahList)
          : '')
      ).replace(/^Kecamatan\s+/i, '');

      return activeCols.map((col) => {
        switch (col.key) {
          case 'no':
            return absenText;
          case 'nikKtp':
            return formatNikForPdf(rec.nikKtp);
          case 'nikKk':
            return formatNikForPdf(rec.nikKk);
          case 'item':
            return rec.item || '-';
          case 'desil':
            return formatDesilValue(rec.dtsen);
          case 'nama':
            return (rec.nama || '-').toUpperCase();
          case 'alamat':
            return rec.alamat || '-';
          case 'rtRw': {
            const rt = (rec.rt || '').trim();
            const rw = (rec.rw || '').trim();
            if (!rt && !rw) return '-';
            return `${rt ? rt.padStart(3, '0') : '-'} / ${rw ? rw.padStart(3, '0') : '-'}`;
          }
          case 'administrasi': {
            const paid = Number(rec.payment || 0);
            return paid > 0 ? formatRupiah(paid).replace(/\u00A0/g, ' ') : '-';
          }
          case 'proposal': {
            return (
              (rec.proposal || '').trim() ||
              (rec.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM')
            );
          }
          case 'kelurahan':
            return resolvedKel || '-';
          case 'kecamatan':
            return resolvedKec || '-';
          case 'kontak':
            return formatPhoneForPdf(rec.kontak) || '';
          case 'pengelola':
            return rec.pengelola || '-';
          case 'catatan':
            return (rec.catatan || '').trim() || '-';
          default:
            return '-';
        }
      });
    });

    autoTable(doc, {
      startY: tableStartY,
      margin: {
        top: F4_PDF_MARGINS.top,
        right: F4_PDF_MARGINS.right,
        bottom: F4_PDF_MARGINS.bottom,
        left: F4_PDF_MARGINS.left,
      },
      tableWidth: PRINTABLE_WIDTH_MM,
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: bodyFontSize,
        minCellHeight: bodyMinCellHeight,
        textColor: [15, 23, 42],
        lineColor: [30, 41, 59],
        lineWidth: 0.22,
        valign: 'middle',
        cellPadding: { top: padY, right: padX, bottom: padY, left: padX },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [252, 211, 77], // Warna kuning keemasan sesuai referensi PDF
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: headFontSize,
        minCellHeight: headMinCellHeight,
        halign: 'center',
        valign: 'middle',
        lineColor: [30, 41, 59],
        lineWidth: 0.25,
        cellPadding: {
          top: padY + 0.3,
          right: colCount <= 10 ? 1.2 : 0.75,
          bottom: padY + 0.3,
          left: colCount <= 10 ? 1.2 : 0.75,
        },
      },
      columnStyles,
    });

    // Ringkasan DAFTAR ITEM & PENGELOLA di bawah tabel (sesuai halaman akhir referensi PDF)
    if (includeSummary && sectionRecords.length > 0) {
      const itemMap = new Map<string, { count: number; emptyCount: number; rank: number }>();
      const pengelolaMap = new Map<string, number>();

      for (const rec of sectionRecords) {
        const code = rec.item || '-';
        const existingItem = itemMap.get(code);
        const rank = getItemHierarchyRank(code, rec.tahun, items);
        if (existingItem) {
          existingItem.count += 1;
          existingItem.rank = Math.min(existingItem.rank, rank);
        } else {
          itemMap.set(code, { count: 1, emptyCount: 0, rank });
        }

        const peng = (rec.pengelola || 'Tanpa Pengelola').trim();
        pengelolaMap.set(peng, (pengelolaMap.get(peng) || 0) + 1);
      }

      if (slotEntries) {
        const refYear = proposalInfo?.tahun || sectionRecords[0]?.tahun || '';
        for (const entry of slotEntries) {
          if (entry.kind !== 'empty' || !entry.item) continue;
          const code = entry.item;
          const existingItem = itemMap.get(code);
          const rank = getItemHierarchyRank(code, refYear, items);
          if (existingItem) {
            existingItem.emptyCount += 1;
            existingItem.rank = Math.min(existingItem.rank, rank);
          } else {
            itemMap.set(code, { count: 0, emptyCount: 1, rank });
          }
        }
      }

      const itemEntries = Array.from(itemMap.entries()).sort((a, b) => {
        if (a[1].rank !== b[1].rank) return a[1].rank - b[1].rank;
        return a[0].localeCompare(b[0], 'id');
      });
      const pengelolaEntries = Array.from(pengelolaMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0], 'id')
      );

      const showMoneySummary = activeCols.some((c) => c.key === 'administrasi');
      const sectionTotalNominal = sectionRecords.reduce(
        (sum, rec) => sum + Math.max(0, Number(rec.payment || 0)),
        0
      );
      const sectionPaidCount = sectionRecords.filter(
        (rec) => Number(rec.payment || 0) > 0
      ).length;
      const moneyLinesCount = showMoneySummary ? (grandTotalMoney ? 3 : 2) : 0;

      const maxLines = Math.max(itemEntries.length, pengelolaEntries.length, moneyLinesCount);
      const neededHeight = 14 + maxLines * 4.5;
      let cursorY = (doc.lastAutoTable?.finalY ?? tableStartY) + 9;

      if (cursorY + neededHeight > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom) {
        doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
        cursorY = F4_PDF_MARGINS.top + 6;
      }

      const leftColX = F4_PDF_MARGINS.left;
      const rightColX = F4_PDF_MARGINS.left + 58;
      const thirdColX = F4_PDF_MARGINS.left + 116;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('DAFTAR ITEM :', leftColX, cursorY);
      doc.text('PENGELOLA :', rightColX, cursorY);
      if (showMoneySummary) {
        doc.text('AKUMULASI UANG MASUK :', thirdColX, cursorY);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lineStep = 4.6;

      itemEntries.forEach(([code, meta], idx) => {
        const emptySuffix = meta.emptyCount > 0 ? ` (+${meta.emptyCount} kosong)` : '';
        doc.text(`- ${code} : ${meta.count}${emptySuffix}`, leftColX, cursorY + 6 + idx * lineStep);
      });

      pengelolaEntries.forEach(([name, cnt], idx) => {
        doc.text(`- ${name} : ${cnt}`, rightColX, cursorY + 6 + idx * lineStep);
      });

      if (showMoneySummary) {
        const formattedSectionTotal = formatRupiah(sectionTotalNominal).replace(/\u00A0/g, ' ');
        doc.setFont('helvetica', 'bold');
        doc.text(`- Total : ${formattedSectionTotal}`, thirdColX, cursorY + 6);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `- Terbayar : ${sectionPaidCount} / ${sectionRecords.length} KPM`,
          thirdColX,
          cursorY + 6 + lineStep
        );
        if (grandTotalMoney) {
          const formattedGrand = formatRupiah(grandTotalMoney.totalNominal).replace(/\u00A0/g, ' ');
          doc.setFont('helvetica', 'bold');
          doc.text(
            `- Total Semua : ${formattedGrand}`,
            thirdColX,
            cursorY + 6 + lineStep * 2
          );
          doc.setFont('helvetica', 'normal');
        }
      }

      if (
        reportTemplate?.enabled &&
        (reportTemplate.signatoryName?.trim() || reportTemplate.signatoryTitle?.trim())
      ) {
        let sigY = cursorY + 10 + maxLines * lineStep;
        if (sigY + 34 > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom) {
          doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
          sigY = F4_PDF_MARGINS.top + 8;
        }
        const sigX = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right - 34;
        const dateStr = new Intl.DateTimeFormat('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(new Date());
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(15, 23, 42);
        doc.text(`${reportTemplate.city?.trim() || 'Pontianak'}, ${dateStr}`, sigX, sigY, {
          align: 'center',
        });
        if (reportTemplate.signatoryTitle?.trim()) {
          doc.text(reportTemplate.signatoryTitle.trim(), sigX, sigY + 4.8, { align: 'center' });
        }
        if (reportTemplate.signatoryName?.trim()) {
          doc.setFont('helvetica', 'bold');
          doc.text(reportTemplate.signatoryName.trim(), sigX, sigY + 23, { align: 'center' });
        }
        if (reportTemplate.signatoryNip?.trim()) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(`NIP. ${reportTemplate.signatoryNip.trim()}`, sigX, sigY + 27.5, { align: 'center' });
        }
      }
    } else if (
      reportTemplate?.enabled &&
      (reportTemplate.signatoryName?.trim() || reportTemplate.signatoryTitle?.trim())
    ) {
      let sigY = (doc.lastAutoTable?.finalY ?? tableStartY) + 12;
      if (sigY + 34 > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom) {
        doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
        sigY = F4_PDF_MARGINS.top + 8;
      }
      const sigX = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right - 34;
      const dateStr = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(15, 23, 42);
      doc.text(`${reportTemplate.city?.trim() || 'Pontianak'}, ${dateStr}`, sigX, sigY, {
        align: 'center',
      });
      if (reportTemplate.signatoryTitle?.trim()) {
        doc.text(reportTemplate.signatoryTitle.trim(), sigX, sigY + 4.8, { align: 'center' });
      }
      if (reportTemplate.signatoryName?.trim()) {
        doc.setFont('helvetica', 'bold');
        doc.text(reportTemplate.signatoryName.trim(), sigX, sigY + 23, { align: 'center' });
      }
      if (reportTemplate.signatoryNip?.trim()) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`NIP. ${reportTemplate.signatoryNip.trim()}`, sigX, sigY + 27.5, { align: 'center' });
      }
    }
  };

  if (splitByProposal && sortedRecords.length > 0) {
    interface ProposalPrintGroup {
      key: string;
      tahun: string;
      proposalName: string;
      label: string;
      isStandalone: boolean;
      records: KpmRecord[];
    }
    const groupMap = new Map<string, ProposalPrintGroup>();
    for (const rec of sortedRecords) {
      const propName = (rec.proposal || '').trim();
      const tahun = (rec.tahun || '').trim();
      const isStandalone = !propName;
      const label = propName
        ? propName
        : rec.validasi === 'rejected'
          ? 'Arsip Berkas Ditolak'
          : 'Database KPM';
      const key = isStandalone
        ? rec.validasi === 'rejected'
          ? '__ARSIP_DITOLAK__'
          : '__DATABASE_KPM__'
        : `${tahun}::${propName}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.records.push(rec);
      } else {
        groupMap.set(key, {
          key,
          tahun: isStandalone ? '' : tahun,
          proposalName: propName,
          label,
          isStandalone,
          records: [rec],
        });
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;
      if (a.isStandalone && b.isStandalone) {
        if (a.key === b.key) return 0;
        return a.key === '__DATABASE_KPM__' ? -1 : 1;
      }
      const yearCmp = a.tahun.localeCompare(b.tahun);
      if (yearCmp !== 0) return yearCmp;
      const isKecA = isKecamatanProposal(a.proposalName);
      const isKecB = isKecamatanProposal(b.proposalName);
      if (isKecA !== isKecB) return isKecA ? -1 : 1;
      return a.label.localeCompare(b.label, 'id');
    });

    const grandTotalMoney =
      groups.length > 1
        ? {
            totalNominal: sortedRecords.reduce(
              (sum, rec) => sum + Math.max(0, Number(rec.payment || 0)),
              0
            ),
            paidCount: sortedRecords.filter((rec) => Number(rec.payment || 0) > 0).length,
            totalCount: sortedRecords.length,
          }
        : undefined;

    groups.forEach((group, idx) => {
      if (idx > 0) {
        doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
      }
      const sectionTitle = group.isStandalone
        ? group.label
        : [group.label, group.tahun].filter(Boolean).join(' ').trim();
      const sectionSubtitle = [
        selectedPengelolaLabel ? `Pengelola: ${selectedPengelolaLabel}` : '',
        `Total: ${group.records.length} KPM`,
      ]
        .filter(Boolean)
        .join('  ·  ');

      renderSection({
        sectionRecords: group.records,
        sectionTitle,
        sectionSubtitle,
        proposalTitleForAutoKel: group.proposalName,
        proposalInfo: !group.isStandalone
          ? { namaProposal: group.proposalName, tahun: group.tahun }
          : undefined,
        grandTotalMoney: idx === groups.length - 1 ? grandTotalMoney : undefined,
      });
    });
  } else {
    const singleProposalInfo =
      proposalMeta && proposalMeta.namaProposal?.trim()
        ? proposalMeta
        : sortedRecords.length > 0 &&
            sortedRecords.every(
              (r) =>
                r.validasi === 'accepted' &&
                Boolean(r.proposal?.trim()) &&
                r.proposal === sortedRecords[0].proposal &&
                r.tahun === sortedRecords[0].tahun
            )
          ? {
              id: sortedRecords[0].proposalId || undefined,
              namaProposal: sortedRecords[0].proposal,
              tahun: sortedRecords[0].tahun,
            }
          : undefined;

    renderSection({
      sectionRecords: sortedRecords,
      sectionTitle: title,
      sectionSubtitle: subtitle,
      proposalInfo: singleProposalInfo,
    });
  }

  const result = await saveOrOpenPdfDocument(doc, fileName);
  return { ...result, count: sortedRecords.length };
}

interface LoadedPdfImage {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}

function loadSingleImageForPdf(url: string, timeoutMs = 2400): Promise<LoadedPdfImage | null> {
  return new Promise((resolve) => {
    if (!url || typeof window === 'undefined') {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (res: LoadedPdfImage | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(res);
    };

    const appBase = ((import.meta.env?.BASE_URL as string | undefined) || '/').replace(/\/+$/, '');
    const normalizedPathUrl =
      url.startsWith('/') && !url.startsWith('//') && appBase && !url.startsWith(`${appBase}/`)
        ? `${appBase}${url}`
        : url;
    const resolvedUrl =
      normalizedPathUrl.startsWith('/') && !normalizedPathUrl.startsWith('//')
        ? `${window.location.origin}${normalizedPathUrl}`
        : normalizedPathUrl;

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const img = new Image();
    const isSameOrigin = resolvedUrl.startsWith(window.location.origin);
    if (!resolvedUrl.startsWith('data:') && !isSameOrigin) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      try {
        const w = img.naturalWidth || 600;
        const h = img.naturalHeight || 800;
        const maxDim = 900;
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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        finish({ dataUrl: jpegDataUrl, format: 'JPEG', width: cw, height: ch });
      } catch {
        finish(null);
      }
    };

    img.onerror = () => finish(null);
    img.src = resolvedUrl;
  });
}

async function resolveKpmPortraitForPdf(docFile?: KpmDocumentFile): Promise<LoadedPdfImage | null> {
  if (!docFile) return null;
  const candidates = Array.from(
    new Set(
      [
        docFile.dataUrl && docFile.dataUrl.startsWith('data:image/') ? docFile.dataUrl : '',
        getDocumentDirectUrl(docFile),
        getDocumentThumbnailUrl(docFile),
      ].filter(Boolean)
    )
  );

  for (const url of candidates) {
    const loaded = await loadSingleImageForPdf(url);
    if (loaded) return loaded;
  }
  return null;
}

export interface ExportSingleKpmPdfOptions {
  record: KpmRecord;
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
}

interface SingleKpmDensityPreset {
  photoW: number;
  photoH: number;
  identityCol0W: number;
  sectionGap: number;
  t1Font: number;
  t1PadY: number;
  t2Font: number;
  t2PadY: number;
  t3Font: number;
  t3PadY: number;
  t4Font: number;
  t4PadY: number;
}

const SINGLE_KPM_DENSITY_PRESETS: SingleKpmDensityPreset[] = [
  {
    photoW: 54,
    photoH: 72,
    identityCol0W: 43,
    sectionGap: 5,
    t1Font: 9.2,
    t1PadY: 2.35,
    t2Font: 9.3,
    t2PadY: 2.5,
    t3Font: 9.0,
    t3PadY: 2.35,
    t4Font: 8.8,
    t4PadY: 2.25,
  },
  {
    photoW: 49.5,
    photoH: 66,
    identityCol0W: 43,
    sectionGap: 4,
    t1Font: 8.8,
    t1PadY: 1.9,
    t2Font: 8.9,
    t2PadY: 2.0,
    t3Font: 8.6,
    t3PadY: 1.85,
    t4Font: 8.5,
    t4PadY: 1.85,
  },
  {
    photoW: 45,
    photoH: 60,
    identityCol0W: 42,
    sectionGap: 3.2,
    t1Font: 8.4,
    t1PadY: 1.55,
    t2Font: 8.5,
    t2PadY: 1.65,
    t3Font: 8.1,
    t3PadY: 1.45,
    t4Font: 8.1,
    t4PadY: 1.5,
  },
  {
    photoW: 40.5,
    photoH: 54,
    identityCol0W: 41,
    sectionGap: 2.6,
    t1Font: 8.0,
    t1PadY: 1.25,
    t2Font: 8.0,
    t2PadY: 1.3,
    t3Font: 7.5,
    t3PadY: 1.15,
    t4Font: 7.7,
    t4PadY: 1.2,
  },
  {
    photoW: 36,
    photoH: 48,
    identityCol0W: 40,
    sectionGap: 2.1,
    t1Font: 7.6,
    t1PadY: 1.0,
    t2Font: 7.6,
    t2PadY: 1.05,
    t3Font: 7.0,
    t3PadY: 0.9,
    t4Font: 7.3,
    t4PadY: 0.95,
  },
  {
    photoW: 33,
    photoH: 44,
    identityCol0W: 39,
    sectionGap: 1.7,
    t1Font: 7.2,
    t1PadY: 0.85,
    t2Font: 7.2,
    t2PadY: 0.85,
    t3Font: 6.5,
    t3PadY: 0.72,
    t4Font: 7.0,
    t4PadY: 0.8,
  },
];

export async function exportSingleKpmToPdf({
  record,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
}: ExportSingleKpmPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  // Ukuran kertas Full A4 Portrait (210mm x 297mm) — dijamin 1 lembar untuk 1 KPM
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const A4_MARGIN = { top: 12, right: 14, bottom: 12, left: 14 };
  const A4_PRINT_WIDTH = A4_WIDTH_MM - A4_MARGIN.left - A4_MARGIN.right; // 182mm

  const domicile = resolveProposalDomicile(record.proposal, proposals, record.tahun, wilayahList);
  const kelurahan = record.kelurahan?.trim() || domicile.kelurahan || '-';
  const rawKec = record.kecamatan?.trim() || domicile.kecamatan || '';
  const kecamatan = rawKec
    ? /^kecamatan\s+/i.test(rawKec)
      ? rawKec
      : `Kecamatan ${rawKec}`
    : '-';

  const pkg = resolvePackageForKpm(items, record.tahun, record.item);
  const itemLabel =
    pkg.name && pkg.name !== pkg.code ? `${pkg.code} — ${pkg.name}` : record.item || '-';

  const dtsenFound = DTSEN_OPTION_ITEMS.find((d) => d.value === record.dtsen);
  const dtsenShort = formatDesilValue(record.dtsen);
  const dtsenText =
    dtsenShort !== '-'
      ? `Desil ${dtsenShort}`
      : dtsenFound
        ? dtsenFound.label
        : record.dtsen || 'Non-DTSEN';

  const statusText =
    record.validasi === 'accepted'
      ? 'Diterima'
      : record.validasi === 'rejected'
        ? 'Ditolak'
        : 'Menunggu';

  const statusColor: [number, number, number] =
    record.validasi === 'accepted'
      ? [15, 118, 110]
      : record.validasi === 'rejected'
        ? [190, 18, 60]
        : [180, 83, 9];

  const heroPhotoMeta = getPrimaryKpmPhotoWithMeta(record.documents);
  const heroPhotoDoc = heroPhotoMeta?.doc;
  const loadedPortrait = await resolveKpmPortraitForPdf(heroPhotoDoc);

  const subStatuses = getKpmSubItemStatusList(record, items);
  const docs = record.documents;
  const rumahCount = Array.isArray(docs.rumah) ? docs.rumah.length : docs.rumah ? 1 : 0;
  const lainnyaCount = Array.isArray(docs.lainnya) ? docs.lainnya.length : 0;
  const rtRwText = `${record.rt ? record.rt.padStart(3, '0') : '-'} / ${record.rw ? record.rw.padStart(3, '0') : '-'}`;
  const printedAtStr = formatUploadDateTime(new Date().toISOString());

  const renderSingleKpmPage = (preset: SingleKpmDensityPreset): { doc: AutoTableDoc; finalY: number } => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [A4_WIDTH_MM, A4_HEIGHT_MM],
      compress: true,
    }) as AutoTableDoc;

    // 1. Header Dokumen A4 (tanpa QR Code)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PROFIL DATA KPM', A4_MARGIN.left, A4_MARGIN.top + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Kode Register: ${record.registerCode || '-'}   ·   Tahun Anggaran: ${record.tahun}`,
      A4_MARGIN.left,
      A4_MARGIN.top + 11.5
    );

    const rightTextEdge = A4_WIDTH_MM - A4_MARGIN.right;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...statusColor);
    doc.text(`STATUS: ${statusText.toUpperCase()}`, rightTextEdge, A4_MARGIN.top + 5.5, {
      align: 'right',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('MASDETA', rightTextEdge, A4_MARGIN.top + 11.5, { align: 'right' });

    const dividerY = A4_MARGIN.top + 15.5;
    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(0.5);
    doc.line(A4_MARGIN.left, dividerY, A4_WIDTH_MM - A4_MARGIN.right, dividerY);

    // 2. Blok Atas: Foto (Kiri) + Identitas KPM (Kanan)
    const topBlockY = dividerY + 4.5;
    const photoW = preset.photoW;
    const photoH = preset.photoH;
    const photoX = A4_MARGIN.left;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(photoX, topBlockY, photoW, photoH, 'FD');

    if (loadedPortrait) {
      const padImg = 1.2;
      const availW = photoW - padImg * 2;
      const availH = photoH - padImg * 2;
      const imgRatio = loadedPortrait.width / loadedPortrait.height;
      const boxRatio = availW / availH;
      let drawW = availW;
      let drawH = availH;
      if (imgRatio > boxRatio) {
        drawH = availW / imgRatio;
      } else {
        drawW = availH * imgRatio;
      }
      const drawX = photoX + (photoW - drawW) / 2;
      const drawY = topBlockY + (photoH - drawH) / 2;
      doc.addImage(loadedPortrait.dataUrl, loadedPortrait.format, drawX, drawY, drawW, drawH);
    } else {
      const initials = (record.nama || 'KPM')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() || '')
        .join('');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(148, 163, 184);
      doc.text(initials || 'KPM', photoX + photoW / 2, topBlockY + photoH / 2 - 2, {
        align: 'center',
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.text(
        heroPhotoDoc ? 'Foto tersimpan di Drive' : 'Belum ada foto',
        photoX + photoW / 2,
        topBlockY + photoH / 2 + 5.5,
        { align: 'center' }
      );
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      heroPhotoMeta?.label || 'Foto KPM',
      photoX + photoW / 2,
      topBlockY + photoH + 3.8,
      { align: 'center' }
    );

    const identityGap = 5;
    const identityX = photoX + photoW + identityGap;
    const identityW = A4_PRINT_WIDTH - photoW - identityGap;

    autoTable(doc, {
      startY: topBlockY,
      margin: { ...A4_MARGIN, left: identityX },
      tableWidth: identityW,
      rowPageBreak: 'avoid',
      head: [['01. IDENTITAS KPM', 'KETERANGAN']],
      body: [
        ['Nama Lengkap', (record.nama || '-').toUpperCase()],
        ['NIK KTP', record.nikKtp || '-'],
        ['Nomor Kartu Keluarga', record.nikKk || '-'],
        ['Pekerjaan', record.pekerjaan || '-'],
        ['No. HP / Kontak', formatPhoneForPdf(record.kontak) || '-'],
        ['RT / RW', rtRwText],
        ['Kelurahan / Desa', kelurahan],
        ['Kecamatan', kecamatan],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: preset.t1Font,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.22,
        cellPadding: { top: preset.t1PadY, right: 2.4, bottom: preset.t1PadY, left: 2.4 },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: preset.t1Font,
        lineColor: [15, 118, 110],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: {
          cellWidth: preset.identityCol0W,
          fontStyle: 'bold',
          fillColor: [248, 250, 252],
          textColor: [51, 65, 85],
        },
        1: { cellWidth: identityW - preset.identityCol0W },
      },
    });

    // 3. Blok Tengah: Data Usulan & Bantuan (1-line header)
    const afterTopY = Math.max(
      topBlockY + photoH + 6.5,
      (doc.lastAutoTable?.finalY ?? topBlockY + photoH) + preset.sectionGap
    );

    autoTable(doc, {
      startY: afterTopY,
      margin: A4_MARGIN,
      tableWidth: A4_PRINT_WIDTH,
      rowPageBreak: 'avoid',
      head: [['02. ALAMAT & USULAN', 'KETERANGAN']],
      body: [
        ['Alamat Lengkap', record.alamat || '-'],
        ['Proposal Pengajuan', `${record.proposal || '-'} (Tahun ${record.tahun})`],
        ['Item Bantuan', itemLabel],
        ['Klasifikasi DTSEN', dtsenText],
        ['Pengelola Lapangan', record.pengelola || '-'],
        ['Status Validasi Berkas', statusText],
        ['Catatan Petugas', record.catatan?.trim() || '-'],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: preset.t2Font,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.22,
        cellPadding: { top: preset.t2PadY, right: 3, bottom: preset.t2PadY, left: 3 },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: preset.t2Font,
        lineColor: [148, 163, 184],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
        1: { cellWidth: A4_PRINT_WIDTH - 48 },
      },
    });

    // 4. Blok Bawah 1: Rincian Sub-Item Bantuan
    const afterMidY = (doc.lastAutoTable?.finalY ?? afterTopY + 60) + preset.sectionGap;

    autoTable(doc, {
      startY: afterMidY,
      margin: A4_MARGIN,
      tableWidth: A4_PRINT_WIDTH,
      rowPageBreak: 'avoid',
      head: [['NO', '03. RINCIAN SUB-ITEM BANTUAN', 'STATUS PENYALURAN', 'PEMBARUAN']],
      body:
        subStatuses.length > 0
          ? subStatuses.map((sub, i) => [
              String(i + 1).padStart(2, '0'),
              sub.name,
              sub.delivered ? 'Sudah Diterima' : 'Belum Diterima',
              sub.updatedAt ? formatUploadDateTime(sub.updatedAt) : '-',
            ])
          : [['-', 'Belum ada rincian sub-item pada paket bantuan ini', '-', '-']],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: preset.t3Font,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.22,
        cellPadding: { top: preset.t3PadY, right: 2.5, bottom: preset.t3PadY, left: 2.5 },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: preset.t3Font,
        halign: 'center',
        lineColor: [148, 163, 184],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: A4_PRINT_WIDTH - 90 },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 38, halign: 'center' },
      },
    });

    // 5. Blok Bawah 2: Kelengkapan Dokumen (1-line header)
    const afterSubY = (doc.lastAutoTable?.finalY ?? afterMidY + 26) + preset.sectionGap;

    autoTable(doc, {
      startY: afterSubY,
      margin: A4_MARGIN,
      tableWidth: A4_PRINT_WIDTH,
      rowPageBreak: 'avoid',
      head: [['04. KELENGKAPAN', 'STATUS', 'DOKUMEN LAINNYA', 'STATUS']],
      body: [
        [
          'Foto KTP',
          docs.ktp ? 'Tersedia' : 'Belum diunggah',
          'Foto Survey Lapangan',
          docs.survey ? 'Tersedia' : 'Belum diunggah',
        ],
        [
          'Foto Kartu Keluarga (KK)',
          docs.kk ? 'Tersedia' : 'Belum diunggah',
          'Foto Rumah',
          rumahCount > 0 ? `${rumahCount} foto tersedia` : 'Belum diunggah',
        ],
        [
          'Foto Calon Penerima',
          docs.penerima ? 'Tersedia' : 'Belum diunggah',
          'Foto Lainnya',
          lainnyaCount > 0 ? `${lainnyaCount} foto tersedia` : 'Belum diunggah',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: preset.t4Font,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.22,
        cellPadding: { top: preset.t4PadY, right: 2.5, bottom: preset.t4PadY, left: 2.5 },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: preset.t4Font,
        lineColor: [148, 163, 184],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
        1: { cellWidth: 43 },
        2: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
        3: { cellWidth: A4_PRINT_WIDTH - 139 },
      },
    });

    const finalY = doc.lastAutoTable?.finalY ?? afterSubY + 25;
    return { doc, finalY };
  };

  const maxAllowedTableBottom = A4_HEIGHT_MM - A4_MARGIN.bottom - 7;
  let chosen = renderSingleKpmPage(SINGLE_KPM_DENSITY_PRESETS[0]);
  for (let i = 0; i < SINGLE_KPM_DENSITY_PRESETS.length; i += 1) {
    const attempt = i === 0 ? chosen : renderSingleKpmPage(SINGLE_KPM_DENSITY_PRESETS[i]);
    chosen = attempt;
    if (attempt.doc.getNumberOfPages() === 1 && attempt.finalY <= maxAllowedTableBottom) {
      break;
    }
  }

  const finalDoc = chosen.doc;
  const footerLineY = A4_HEIGHT_MM - A4_MARGIN.bottom - 3;
  const effectiveFooterY = Math.max(
    chosen.finalY + 5.5,
    Math.min(A4_HEIGHT_MM - 8, footerLineY)
  );

  finalDoc.setDrawColor(226, 232, 240);
  finalDoc.setLineWidth(0.25);
  finalDoc.line(
    A4_MARGIN.left,
    effectiveFooterY - 3.5,
    A4_WIDTH_MM - A4_MARGIN.right,
    effectiveFooterY - 3.5
  );

  finalDoc.setFont('helvetica', 'normal');
  finalDoc.setFontSize(8.2);
  finalDoc.setTextColor(100, 116, 139);
  finalDoc.text('Dokumen Profil KPM · Sistem Informasi MASDETA', A4_MARGIN.left, effectiveFooterY);
  finalDoc.text(
    `Dicetak pada ${printedAtStr}`,
    A4_WIDTH_MM - A4_MARGIN.right,
    effectiveFooterY,
    { align: 'right' }
  );

  const safeName = `${record.tahun}_${record.nama}_${record.registerCode || 'kpm'}`;
  return saveOrOpenPdfDocument(finalDoc, safeName);
}

export interface ExportKuponPdfOptions {
  records: KpmRecord[];
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  schedules?: ScheduleEventItem[];
  couponConfig?: CouponPrintConfig;
  resolvePerProposalSchedule?: boolean;
  mode?: 'single' | 'bulk';
  fileName?: string;
}

function drawCouponCard(
  doc: jsPDF,
  {
    x,
    y,
    cardW,
    cardH,
    noKupon,
    record,
    proposals,
    wilayahList,
    couponConfig,
    loadedKalbarLogo,
    loadedGerindraLogo,
  }: {
    x: number;
    y: number;
    cardW: number;
    cardH: number;
    noKupon: string;
    record: KpmRecord;
    proposals: ProposalRecord[];
    wilayahList: WilayahKabKota[];
    couponConfig: CouponPrintConfig;
    loadedKalbarLogo?: LoadedPdfImage | null;
    loadedGerindraLogo?: LoadedPdfImage | null;
  }
) {
  const showKelurahan = isKecamatanScopedProposalForCoupon(record, proposals);
  const dom = resolveKpmDomicile(record, proposals, wilayahList);
  const displayKel = (record.kelurahan || dom.kelurahan || '').replace(/^(kelurahan|desa)\s+/i, '').trim() || '-';
  const propLabel = (record.proposal || '').trim() || (record.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');
  const tahunStr = (record.tahun || '').trim() || String(new Date().getFullYear());

  // Outer border kartu kupon (88 x 54 mm)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.32);
  doc.roundedRect(x, y, cardW, cardH, 1.4, 1.4, 'FD');

  // Kiri atas: No. Kupon (tanpa kode item)
  const noBoxX = x + 2.6;
  const noBoxY = y + 4.8;
  const noBoxW = 16;
  const noBoxH = 11.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.text('No. Kupon', noBoxX + noBoxW / 2, y + 3.6, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.roundedRect(noBoxX, noBoxY, noBoxW, noBoxH, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(noKupon.length > 3 ? 11.5 : 14);
  doc.setTextColor(15, 23, 42);
  doc.text(noKupon, noBoxX + noBoxW / 2, noBoxY + 7.6, { align: 'center' });

  // Area Header Kanan No. Kupon: Logo Kalbar (opsional) · Judul · Logo Gerindra (opsional)
  const headerLeft = x + 20.0;
  const headerRight = x + cardW - 2.6;
  const logoBoxW = 10.6;
  const logoBoxH = 11.4;
  const logoBoxY = y + 3.8;

  const drawCouponLogo = (img: LoadedPdfImage, boxX: number) => {
    const ratio = (img.width || 1) / (img.height || 1);
    let dw = logoBoxW;
    let dh = logoBoxH;
    if (ratio > logoBoxW / logoBoxH) {
      dh = logoBoxW / ratio;
    } else {
      dw = logoBoxH * ratio;
    }
    doc.addImage(
      img.dataUrl,
      img.format,
      boxX + (logoBoxW - dw) / 2,
      logoBoxY + (logoBoxH - dh) / 2,
      dw,
      dh
    );
  };

  if (loadedKalbarLogo) {
    drawCouponLogo(loadedKalbarLogo, headerLeft);
  }
  if (loadedGerindraLogo) {
    drawCouponLogo(loadedGerindraLogo, headerRight - logoBoxW);
  }

  const hasAnyLogo = Boolean(loadedKalbarLogo || loadedGerindraLogo);
  const titleAreaLeft = loadedKalbarLogo ? headerLeft + logoBoxW + 1.2 : headerLeft;
  const titleAreaRight = loadedGerindraLogo ? headerRight - logoBoxW - 1.2 : headerRight;
  const titleCenterX = (titleAreaLeft + titleAreaRight) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  if (hasAnyLogo) {
    doc.setFontSize(8.8);
    doc.text('KUPON PEMBAGIAN', titleCenterX, y + 8.3, { align: 'center' });
    doc.text(`TAHUN ${tahunStr}`, titleCenterX, y + 12.6, { align: 'center' });
  } else {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.16);
    doc.setFontSize(13.2);
    doc.text('KUPON PEMBAGIAN', titleCenterX, y + 8.1, {
      align: 'center',
      renderingMode: 'fillThenStroke',
    });
    doc.setLineWidth(0.14);
    doc.setFontSize(12.2);
    doc.text(`TAHUN ${tahunStr}`, titleCenterX, y + 13.5, {
      align: 'center',
      renderingMode: 'fillThenStroke',
    });
  }

  // Kotak isi informasi KPM (Item/UNI disembunyikan)
  const innerX = x + 2.5;
  const innerY = y + 18.0;
  const innerW = cardW - 5.0; // 83mm
  const innerH = 30.8;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.24);
  doc.roundedRect(innerX, innerY, innerW, innerH, 1.1, 1.1, 'FD');

  const rows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Nama', value: (record.nama || '-').toUpperCase(), bold: true },
    { label: 'NIK', value: record.nikKtp || '-' },
    { label: 'Proposal', value: propLabel },
  ];
  if (showKelurahan) {
    rows.push({ label: 'Kelurahan', value: displayKel });
  }
  rows.push({ label: 'Jadwal', value: couponConfig.jadwal?.trim() || '-' });
  rows.push({ label: 'Lokasi', value: couponConfig.lokasi?.trim() || '-' });

  const labelX = innerX + 2.0;
  const colonX = innerX + 17.5;
  const valueX = innerX + 19.3;
  const maxValW = innerW - 21.0; // ~62mm

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const prepared = rows.map((row) => {
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(row.value, maxValW).slice(0, 2) as string[];
    return { ...row, lines };
  });

  const totalLines = prepared.reduce((sum, r) => sum + Math.max(1, r.lines.length), 0);
  const availInnerH = innerH - 3.6;
  const lineStep = Math.min(4.4, Math.max(3.1, availInnerH / Math.max(totalLines, 1)));
  let rowY = innerY + (totalLines <= 5 ? 4.3 : 3.7);

  for (const row of prepared) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(row.label, labelX, rowY);
    doc.text(':', colonX, rowY);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setTextColor(15, 23, 42);
    row.lines.forEach((ln, li) => {
      doc.text(ln, valueX, rowY + li * lineStep);
    });

    rowY += Math.max(1, row.lines.length) * lineStep;
  }

  // Catatan kaki kupon
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.1);
  doc.setTextColor(15, 23, 42);
  doc.text(
    couponConfig.footerText?.trim() || DEFAULT_COUPON_CONFIG.footerText,
    x + cardW / 2,
    y + cardH - 2.0,
    { align: 'center' }
  );
}

export async function exportKuponPdf({
  records,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  schedules = [],
  couponConfig = DEFAULT_COUPON_CONFIG,
  resolvePerProposalSchedule,
  mode = 'bulk',
  fileName,
}: ExportKuponPdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const CARD_W = 88;
  const CARD_H = 54;
  const COL_GAP = 5;
  const ROW_GAP = 5;
  const CARDS_PER_ROW = 2;
  const CARDS_PER_COL = 5;
  const CARDS_PER_PAGE = CARDS_PER_ROW * CARDS_PER_COL;

  const sourcePool = allRecords && allRecords.length > 0 ? allRecords : records;
  const shouldAutoResolveSchedule =
    resolvePerProposalSchedule !== undefined ? resolvePerProposalSchedule : mode === 'bulk';

  const targetRecords =
    mode === 'single'
      ? records.slice(0, 1)
      : records.filter((r) => r.validasi === 'accepted' && Boolean((r.proposal || '').trim()));

  if (targetRecords.length === 0) {
    throw new Error('Tidak ada KPM berstatus Diterima pada proposal aktif untuk dicetak kupon.');
  }

  const getCouponNumber = (rec: KpmRecord, fallbackIdx: number): { num: number; label: string } => {
    const slotNo = getKpmSlotNumberInProposal(
      rec,
      sourcePool,
      proposals,
      items,
      wilayahList,
      proposalSlotMap
    );
    const absenNo = getAbsenSeq(rec.registerCode);
    const num =
      slotNo && slotNo > 0
        ? slotNo
        : absenNo < 999999
          ? absenNo
          : fallbackIdx + 1;
    return { num, label: String(num).padStart(2, '0') };
  };

  const kalbarLogoUrl = (couponConfig.logoKalbarUrl || '').trim();
  const gerindraLogoUrl = (couponConfig.logoGerindraUrl || '').trim();
  const [loadedKalbarLogo, loadedGerindraLogo] = await Promise.all([
    kalbarLogoUrl ? loadSingleImageForPdf(kalbarLogoUrl) : Promise.resolve(null),
    gerindraLogoUrl ? loadSingleImageForPdf(gerindraLogoUrl) : Promise.resolve(null),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  });

  if (mode === 'single') {
    const rec = targetRecords[0];
    const { label } = getCouponNumber(rec, 0);
    const effectiveConfig = shouldAutoResolveSchedule
      ? resolveCouponScheduleForRecord(rec, schedules, proposals, couponConfig)
      : couponConfig;
    drawCouponCard(doc, {
      x: F4_PDF_MARGINS.left,
      y: F4_PDF_MARGINS.top,
      cardW: CARD_W,
      cardH: CARD_H,
      noKupon: label,
      record: rec,
      proposals,
      wilayahList,
      couponConfig: effectiveConfig,
      loadedKalbarLogo,
      loadedGerindraLogo,
    });

    const defaultName = `Kupon_${rec.tahun || 'KPM'}_${rec.nama}_${label}`;
    const res = await saveOrOpenPdfDocument(doc, fileName || defaultName);
    return { ...res, count: 1 };
  }

  // Kelompokkan per proposal (tahun + nama proposal) sehingga jumlah kupon presisi per proposal
  const groups = new Map<string, KpmRecord[]>();
  for (const rec of targetRecords) {
    const key = `${(rec.tahun || '').trim()}::${(rec.proposal || '').trim()}`;
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));
  let isFirstPageOverall = true;

  for (const [, groupRecs] of sortedGroups) {
    const withNum = groupRecs
      .map((rec, i) => ({ rec, ...getCouponNumber(rec, i) }))
      .sort((a, b) => a.num - b.num || a.rec.nama.localeCompare(b.rec.nama, 'id'));

    withNum.forEach((entry, idx) => {
      const slotIdxOnPage = idx % CARDS_PER_PAGE;
      if (slotIdxOnPage === 0) {
        if (!isFirstPageOverall) {
          doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
        }
        isFirstPageOverall = false;
      }

      const colIdx = slotIdxOnPage % CARDS_PER_ROW;
      const rowIdx = Math.floor(slotIdxOnPage / CARDS_PER_ROW);
      const x = F4_PDF_MARGINS.left + colIdx * (CARD_W + COL_GAP);
      const y = F4_PDF_MARGINS.top + rowIdx * (CARD_H + ROW_GAP);

      const effectiveConfig = shouldAutoResolveSchedule
        ? resolveCouponScheduleForRecord(entry.rec, schedules, proposals, couponConfig)
        : couponConfig;

      drawCouponCard(doc, {
        x,
        y,
        cardW: CARD_W,
        cardH: CARD_H,
        noKupon: entry.label,
        record: entry.rec,
        proposals,
        wilayahList,
        couponConfig: effectiveConfig,
        loadedKalbarLogo,
        loadedGerindraLogo,
      });
    });
  }

  const defaultBulkName = `Cetak_Kupon_${targetRecords.length}_KPM`;
  const res = await saveOrOpenPdfDocument(doc, fileName || defaultBulkName);
  return { ...res, count: targetRecords.length };
}

interface FenceDensityPreset {
  bodyFontSize: number;
  titleFontSize: number;
  subTitleFontSize: number;
  lineHeightFactor: number;
  idRowStep: number;
  tableHeadFontSize: number;
  tableBodyFontSize: number;
  cellPadY: number;
  cellPadX: number;
  minCellHeight: number;
  gapScale: number;
  minBlankRowsBast: number;
  minBlankRowsSptjm: number;
}

const FENCE_DENSITY_PRESETS: FenceDensityPreset[] = [
  {
    bodyFontSize: 10,
    titleFontSize: 11,
    subTitleFontSize: 10,
    lineHeightFactor: 1.48,
    idRowStep: 5.5,
    tableHeadFontSize: 9.5,
    tableBodyFontSize: 9.2,
    cellPadY: 2.1,
    cellPadX: 2.2,
    minCellHeight: 8.2,
    gapScale: 1.0,
    minBlankRowsBast: 4,
    minBlankRowsSptjm: 0,
  },
  {
    bodyFontSize: 9.6,
    titleFontSize: 10.6,
    subTitleFontSize: 9.6,
    lineHeightFactor: 1.4,
    idRowStep: 5.0,
    tableHeadFontSize: 9.1,
    tableBodyFontSize: 8.8,
    cellPadY: 1.65,
    cellPadX: 2.0,
    minCellHeight: 7.0,
    gapScale: 0.84,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  },
  {
    bodyFontSize: 9.1,
    titleFontSize: 10.3,
    subTitleFontSize: 9.2,
    lineHeightFactor: 1.32,
    idRowStep: 4.55,
    tableHeadFontSize: 8.6,
    tableBodyFontSize: 8.3,
    cellPadY: 1.35,
    cellPadX: 1.8,
    minCellHeight: 6.0,
    gapScale: 0.72,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  },
  {
    bodyFontSize: 8.5,
    titleFontSize: 10.0,
    subTitleFontSize: 8.8,
    lineHeightFactor: 1.24,
    idRowStep: 4.15,
    tableHeadFontSize: 8.1,
    tableBodyFontSize: 7.8,
    cellPadY: 1.05,
    cellPadX: 1.6,
    minCellHeight: 5.1,
    gapScale: 0.58,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  },
  {
    bodyFontSize: 8.0,
    titleFontSize: 9.6,
    subTitleFontSize: 8.4,
    lineHeightFactor: 1.18,
    idRowStep: 3.8,
    tableHeadFontSize: 7.5,
    tableBodyFontSize: 7.2,
    cellPadY: 0.78,
    cellPadX: 1.4,
    minCellHeight: 4.3,
    gapScale: 0.48,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  },
  {
    bodyFontSize: 7.4,
    titleFontSize: 9.2,
    subTitleFontSize: 8.0,
    lineHeightFactor: 1.13,
    idRowStep: 3.45,
    tableHeadFontSize: 6.9,
    tableBodyFontSize: 6.6,
    cellPadY: 0.55,
    cellPadX: 1.2,
    minCellHeight: 3.65,
    gapScale: 0.38,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  },
];

function drawOfficialDinsosKop(
  doc: AutoTableDoc,
  kopConfig: BastTemplateConfig,
  loadedKopLogo: LoadedPdfImage | null
): number {
  const left = F4_PDF_MARGINS.left; // 20mm
  const right = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right; // 201mm
  const centerX = left + PRINTABLE_WIDTH_MM / 2;
  const topY = F4_PDF_MARGINS.top; // 10mm (FIXATED mentok batas margin atas)

  const logoW = loadedKopLogo ? 17 : 0;
  const logoH = loadedKopLogo ? 21 : 0;
  if (loadedKopLogo) {
    const imgRatio = loadedKopLogo.width / Math.max(loadedKopLogo.height, 1);
    let drawW = logoW;
    let drawH = logoH;
    if (imgRatio > logoW / logoH) {
      drawH = logoW / imgRatio;
    } else {
      drawW = logoH * imgRatio;
    }
    doc.addImage(
      loadedKopLogo.dataUrl,
      loadedKopLogo.format,
      left + (logoW - drawW) / 2,
      topY + (logoH - drawH) / 2,
      drawW,
      drawH
    );
  }

  const kopCenterX = loadedKopLogo ? left + logoW + (PRINTABLE_WIDTH_MM - logoW) / 2 : centerX;

  doc.setTextColor(15, 23, 42);
  if (kopConfig.orgHeaderLine1?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(kopConfig.orgHeaderLine1.trim().toUpperCase(), kopCenterX, topY + 4.5, {
      align: 'center',
    });
  }
  if (kopConfig.orgHeaderLine2?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15.5);
    doc.text(kopConfig.orgHeaderLine2.trim().toUpperCase(), kopCenterX, topY + 10.5, {
      align: 'center',
    });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  if (kopConfig.orgAddress1?.trim()) {
    doc.text(kopConfig.orgAddress1.trim(), kopCenterX, topY + 14.8, { align: 'center' });
  }
  if (kopConfig.orgAddress2?.trim()) {
    doc.text(kopConfig.orgAddress2.trim(), kopCenterX, topY + 18.5, { align: 'center' });
  }
  if (kopConfig.orgAddress3?.trim()) {
    doc.text(kopConfig.orgAddress3.trim(), kopCenterX, topY + 22.2, { align: 'center' });
  }

  const lineY = topY + 25.2;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.75);
  doc.line(left, lineY, right, lineY);
  doc.setLineWidth(0.25);
  doc.line(left, lineY + 1.1, right, lineY + 1.1);
  return lineY + 1.1; // 36.3mm
}

function estimateSinglePageTableHeight(
  doc: AutoTableDoc,
  headRow: string[],
  bodyRows: string[][],
  colWidths: number[],
  headFontSize: number,
  bodyFontSize: number,
  cellPadY: number,
  cellPadX: number,
  minCellHeight: number
): number {
  const PT_TO_MM = 0.352778;
  const LINE_FACTOR = 1.18;

  const measureRow = (cells: string[], fontSize: number, bold: boolean): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    let maxLines = 1;
    for (let c = 0; c < colWidths.length; c += 1) {
      const txt = String(cells[c] ?? '');
      if (!txt) continue;
      const availW = Math.max(4, colWidths[c] - cellPadX * 2);
      const wrapped = doc.splitTextToSize(txt, availW) as string[];
      if (wrapped.length > maxLines) {
        maxLines = wrapped.length;
      }
    }
    const textH = maxLines * fontSize * PT_TO_MM * LINE_FACTOR + cellPadY * 2;
    return Math.max(minCellHeight, textH);
  };

  let total = measureRow(headRow, headFontSize, true);
  for (const row of bodyRows) {
    total += measureRow(row, bodyFontSize, false);
  }
  return total;
}

function resolveAutoFitPreset(
  measureHeightForPreset: (preset: FenceDensityPreset) => number,
  availableMiddleH: number
): { preset: FenceDensityPreset; estimatedH: number } {
  for (const preset of FENCE_DENSITY_PRESETS) {
    const estimatedH = measureHeightForPreset(preset);
    if (estimatedH <= availableMiddleH) {
      return { preset, estimatedH };
    }
  }

  // Fallback ekstrem (misal sub-item kustom sangat banyak 15-25+ baris): kompresi progresif ekstra
  const base = FENCE_DENSITY_PRESETS[FENCE_DENSITY_PRESETS.length - 1];
  for (let step = 1; step <= 8; step += 1) {
    const scale = Math.max(0.45, 1 - step * 0.07);
    const customPreset: FenceDensityPreset = {
      bodyFontSize: Math.max(6.2, Number((base.bodyFontSize * scale).toFixed(2))),
      titleFontSize: Math.max(8.2, Number((base.titleFontSize * scale).toFixed(2))),
      subTitleFontSize: Math.max(7.0, Number((base.subTitleFontSize * scale).toFixed(2))),
      lineHeightFactor: Math.max(1.06, Number((base.lineHeightFactor - step * 0.01).toFixed(2))),
      idRowStep: Math.max(2.9, Number((base.idRowStep * scale).toFixed(2))),
      tableHeadFontSize: Math.max(5.8, Number((base.tableHeadFontSize * scale).toFixed(2))),
      tableBodyFontSize: Math.max(5.6, Number((base.tableBodyFontSize * scale).toFixed(2))),
      cellPadY: Math.max(0.28, Number((base.cellPadY * scale).toFixed(2))),
      cellPadX: Math.max(0.85, Number((base.cellPadX * scale).toFixed(2))),
      minCellHeight: Math.max(2.75, Number((base.minCellHeight * scale).toFixed(2))),
      gapScale: Math.max(0.22, Number((base.gapScale * scale).toFixed(2))),
      minBlankRowsBast: 0,
      minBlankRowsSptjm: 0,
    };
    const estimatedH = measureHeightForPreset(customPreset);
    if (estimatedH <= availableMiddleH) {
      return { preset: customPreset, estimatedH };
    }
  }

  const ultra = {
    ...base,
    bodyFontSize: 6.2,
    idRowStep: 2.8,
    tableHeadFontSize: 5.6,
    tableBodyFontSize: 5.4,
    cellPadY: 0.25,
    cellPadX: 0.8,
    minCellHeight: 2.6,
    gapScale: 0.2,
    minBlankRowsBast: 0,
    minBlankRowsSptjm: 0,
  };
  return { preset: ultra, estimatedH: measureHeightForPreset(ultra) };
}

function renderSingleBastPage(
  doc: AutoTableDoc,
  {
    record,
    allRecords,
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    bastConfig,
    loadedKopLogo,
    loadedSig,
  }: {
    record: KpmRecord;
    allRecords: KpmRecord[];
    proposals: ProposalRecord[];
    items: ItemBantuan[];
    wilayahList: WilayahKabKota[];
    proposalSlotMap: ProposalSlotMap;
    bastConfig: BastTemplateConfig;
    loadedKopLogo: LoadedPdfImage | null;
    loadedSig: LoadedPdfImage | null;
  }
) {
  const PT_TO_MM = 0.352778;
  const left = F4_PDF_MARGINS.left; // 20mm
  const right = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right; // 201mm
  const centerX = left + PRINTABLE_WIDTH_MM / 2;
  const bottomEdgeY = F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom; // 300mm

  // 1. PAGAR ATAS: KOP DINAS SOSIAL MENTOK MARGIN ATAS (10mm)
  const kopEndY = drawOfficialDinsosKop(doc, bastConfig, loadedKopLogo);

  const leftSigX = left + PRINTABLE_WIDTH_MM * 0.23;
  const rightSigX = left + PRINTABLE_WIDTH_MM * 0.77;
  const sigColMaxW = PRINTABLE_WIDTH_MM * 0.40;

  const pejabatNama = bastConfig.pejabatNama?.trim() || DEFAULT_BAST_TEMPLATE.pejabatNama;
  const pejabatJabatan =
    bastConfig.pejabatJabatan?.trim() || DEFAULT_BAST_TEMPLATE.pejabatJabatan;
  const pejabatPangkat =
    bastConfig.pejabatPangkat !== undefined
      ? bastConfig.pejabatPangkat.trim()
      : DEFAULT_BAST_TEMPLATE.pejabatPangkat;
  const pejabatNipLine = formatOfficialNipLine(
    bastConfig.pejabatNip?.trim() || DEFAULT_BAST_TEMPLATE.pejabatNip
  );
  const kpmFullName = (record.bast?.recipientName || record.nama || '-').toUpperCase();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  const leftJabLines = doc.splitTextToSize(pejabatJabatan, sigColMaxW) as string[];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const kpmSigNameLines = (doc.splitTextToSize(kpmFullName, sigColMaxW) as string[]).slice(0, 2);

  // Siapkan data konten tengah
  const subStatuses = getKpmSubItemStatusList(record, items);
  const pkg = resolvePackageForKpm(items, record.tahun, record.item);
  const rawTableRows: string[][] =
    subStatuses.length > 0
      ? subStatuses.map((s, i) => [
          `${i + 1}.`,
          s.baseName || s.name,
          s.satuan || 'Unit',
          String(s.volume > 0 ? s.volume : 1),
          'Berfungsi Dengan Baik dan Lengkap',
        ])
      : [
          [
            '1.',
            pkg.name && pkg.name !== pkg.code ? pkg.name : record.item || 'Paket Bantuan',
            'Unit',
            '1',
            'Berfungsi Dengan Baik dan Lengkap',
          ],
        ];

  const dateWords = bastConfig.tanggalSerahTerimaCustomText?.trim()
    ? bastConfig.tanggalSerahTerimaCustomText.trim()
    : formatIndonesianDateWords(
        bastConfig.tanggalSerahTerimaIso?.trim() || new Date().toISOString().slice(0, 10)
      );
  const locationText = formatBastProposalLocation(record, proposals, wilayahList);
  const nomorSk = bastConfig.nomorSk?.trim() || DEFAULT_BAST_TEMPLATE.nomorSk;
  const nomorPesanan = bastConfig.nomorPesanan?.trim() || DEFAULT_BAST_TEMPLATE.nomorPesanan;
  const tanggalPemesanan =
    bastConfig.tanggalPemesanan?.trim() || DEFAULT_BAST_TEMPLATE.tanggalPemesanan;
  const tahunAnggaran =
    (record.tahun || '').trim() ||
    (bastConfig.tanggalSerahTerimaIso ? bastConfig.tanggalSerahTerimaIso.slice(0, 4) : '') ||
    String(new Date().getFullYear());

  const p1 =
    `Pada hari ini ${dateWords} bertempat di ${locationText}. ` +
    `Berdasarkan keputusan Kepala Dinas Sosial Provinsi Kalimantan Barat nomor : ${nomorSk} ` +
    `tentang barang untuk dijual/diserahkan kepada masyarakat berupa peralatan kerja bagi keluarga fakir miskin potensial ` +
    `kegiatan pengelolaan data fakir miskin cakupan daerah provinsi sub kegiatan fasilitasi bantuan pengembangan ekonomi Masyarakat ` +
    `tahun anggaran ${tahunAnggaran}. ` +
    `Berdasarkan surat pesanan nomor : ${nomorPesanan} tanggal ${tanggalPemesanan}.`;

  const slotNo = getKpmSlotNumberInProposal(
    record,
    allRecords,
    proposals,
    items,
    wilayahList,
    proposalSlotMap
  );
  const absenSeq = getAbsenSeq(record.registerCode);
  const noBantuanNum =
    slotNo && slotNo > 0 ? slotNo : absenSeq < 999999 ? absenSeq : null;
  const noBantuanStr = noBantuanNum ? String(noBantuanNum).padStart(2, '0') : '01';

  const idValX = left + 38;
  const idMaxW = right - idValX;
  const nominalRaw =
    bastConfig.nilaiNominalText?.trim() || DEFAULT_BAST_TEMPLATE.nilaiNominalText;
  const isDottedBlank = !nominalRaw || /^[.\s_…-]+$/.test(nominalRaw);
  const p2 = isDottedBlank
    ? 'Dengan ini PIHAK PERTAMA secara sah telah menyerahkan barang berupa 1 (satu) paket bantuan peralatan kerja dengan rincian barang sebagai berikut :'
    : `Dengan ini PIHAK PERTAMA secara sah telah menyerahkan barang berupa 1 (satu) paket bantuan peralatan kerja senilai ${nominalRaw} dengan rincian barang sebagai berikut :`;
  const pClose =
    'Maka PIHAK KEDUA menyatakan telah menerima bantuan diatas dalam keadaan sadar dengan kondisi barang bantuan yang di berikan “berfungsi dengan baik dan lengkap”. Demikian berita acara ini dibuat untuk digunakan sebagaimana mestinya.';

  const colWidths = [11, 61, 17, 17, 75]; // sum = 181mm
  const headRow = ['No.', 'Nama Barang', 'Satuan', 'Volume', 'Keterangan'];

  const buildTableRowsForPreset = (preset: FenceDensityPreset): string[][] => {
    const rows = rawTableRows.map((r) => [...r]);
    while (rows.length < preset.minBlankRowsBast) {
      rows.push(['', '', '', '', '']);
    }
    return rows;
  };

  const getBastSigMetrics = (preset: FenceDensityPreset) => {
    const sigScale = Math.max(0.7, preset.gapScale);
    const sigGap = 6.8 * Math.max(0.65, preset.gapScale);
    const sigTitleH = 4.6 * sigScale;
    const jabLineStep = 4.0 * sigScale;
    const jabH = Math.max(1, leftJabLines.length) * jabLineStep;
    const signingSpaceH = 16.5 * Math.max(0.7, preset.gapScale);
    const extraKpmOffset = Math.max(0, kpmSigNameLines.length - 1) * 3.8;
    const pangkatOffset = pejabatPangkat ? 4.8 : 0;
    const nipOffset = 4.3;
    const totalSigH =
      sigTitleH + jabH + signingSpaceH + extraKpmOffset + pangkatOffset + nipOffset;
    return {
      sigGap,
      sigTitleH,
      jabLineStep,
      jabH,
      signingSpaceH,
      extraKpmOffset,
      pangkatOffset,
      nipOffset,
      totalSigH,
    };
  };

  // Ruang total di bawah Kop Surat sampai batas margin bawah (agar selalu 1 halaman F4)
  const middleStartBaseY = kopEndY + 5.8; // 42.1mm
  const totalAvailableH = Math.max(120, bottomEdgeY - middleStartBaseY);

  const measureBastTotalHeight = (preset: FenceDensityPreset): number => {
    const gs = preset.gapScale;
    const bodyStep = preset.bodyFontSize * PT_TO_MM * preset.lineHeightFactor;
    let h = 0;

    // Judul + Nomor BAST
    h += 4.8 * gs;
    h += 6.4 * gs;

    // Paragraf 1
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(preset.bodyFontSize);
    const p1Lines = doc.splitTextToSize(p1, PRINTABLE_WIDTH_MM) as string[];
    h += p1Lines.length * bodyStep + 4.2 * gs;

    // Lead + Pihak Pertama + Pihak Kedua
    h += 5.2 * gs;
    const jabLines = doc.splitTextToSize(pejabatJabatan, idMaxW) as string[];
    const idJabStep = Math.max(3.3, preset.idRowStep * 0.9);
    h += preset.idRowStep;
    h += jabLines.length * idJabStep + 0.8 * gs;
    h += 5.8 * gs;
    h += preset.idRowStep * 2;
    h += 5.8 * gs;

    // Paragraf penyerahan
    const p2Lines = doc.splitTextToSize(p2, PRINTABLE_WIDTH_MM) as string[];
    h += p2Lines.length * bodyStep + 5.6 * gs;

    // Tabel Rincian Barang
    const rows = buildTableRowsForPreset(preset);
    const tableH = estimateSinglePageTableHeight(
      doc,
      headRow,
      rows,
      colWidths,
      preset.tableHeadFontSize,
      preset.tableBodyFontSize,
      preset.cellPadY,
      preset.cellPadX,
      preset.minCellHeight
    );
    h += tableH + 7.4 * gs;

    // Paragraf Penutup
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(preset.bodyFontSize);
    const pCloseLines = doc.splitTextToSize(pClose, PRINTABLE_WIDTH_MM) as string[];
    h += pCloseLines.length * bodyStep;

    // Blok Tanda Tangan mengikuti baris akhir paragraf penutup
    const sigMetrics = getBastSigMetrics(preset);
    h += sigMetrics.sigGap + sigMetrics.totalSigH;
    return h;
  };

  const { preset } = resolveAutoFitPreset(measureBastTotalHeight, totalAvailableH);
  const gs = preset.gapScale;
  const bodyStep = preset.bodyFontSize * PT_TO_MM * preset.lineHeightFactor;
  const sigMetrics = getBastSigMetrics(preset);

  let cursorY = middleStartBaseY;

  // 2. KONTEN TENGAH MENGALIR ALAMI
  const titleText = 'BERITA ACARA SERAH TERIMA BARANG';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(preset.titleFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text(titleText, centerX, cursorY, { align: 'center' });

  cursorY += 4.8 * gs;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(preset.subTitleFontSize);
  const nomorBastText = (bastConfig.nomorBast ?? '').trim();
  if (nomorBastText) {
    doc.text(nomorBastText, centerX, cursorY, { align: 'center' });
  }
  cursorY += 6.4 * gs;

  // Paragraf pembuka
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(preset.bodyFontSize);
  doc.setTextColor(15, 23, 42);
  const p1Lines = doc.splitTextToSize(p1, PRINTABLE_WIDTH_MM) as string[];
  doc.text(p1, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });
  cursorY += p1Lines.length * bodyStep + 4.2 * gs;

  // Identitas Pihak Pertama & Kedua
  doc.text('Kami yang bertanda tangan dibawah ini :', left, cursorY);
  cursorY += 5.2 * gs;

  const idLabelX = left + 9;
  const idColonX = left + 35;

  doc.setFont('helvetica', 'normal');
  doc.text('Nama', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.text(pejabatNama, idValX, cursorY);
  cursorY += preset.idRowStep;

  doc.setFont('helvetica', 'normal');
  doc.text('Jabatan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  const jabatanLines = doc.splitTextToSize(pejabatJabatan, idMaxW) as string[];
  const idJabStep = Math.max(3.3, preset.idRowStep * 0.9);
  doc.text(jabatanLines, idValX, cursorY);
  cursorY += jabatanLines.length * idJabStep + 0.8 * gs;

  doc.text('selanjutnya disebut sebagai ', idLabelX, cursorY);
  const p1PrefixW = doc.getTextWidth('selanjutnya disebut sebagai ');
  doc.setFont('helvetica', 'bold');
  doc.text('PIHAK PERTAMA', idLabelX + p1PrefixW, cursorY);
  cursorY += 5.8 * gs;

  doc.setFont('helvetica', 'normal');
  doc.text('Nama', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.text(kpmFullName, idValX, cursorY);
  cursorY += preset.idRowStep;

  doc.setFont('helvetica', 'normal');
  doc.text('No. Bantuan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.text(noBantuanStr, idValX, cursorY);
  cursorY += preset.idRowStep;

  doc.text('sebagai Keluarga Penerima Manfaat (KPM) selanjutnya disebut sebagai ', idLabelX, cursorY);
  const p2PrefixW = doc.getTextWidth(
    'sebagai Keluarga Penerima Manfaat (KPM) selanjutnya disebut sebagai '
  );
  doc.setFont('helvetica', 'bold');
  doc.text('PIHAK KEDUA', idLabelX + p2PrefixW, cursorY);
  cursorY += 5.8 * gs;

  // Paragraf penyerahan
  const p2Lines = doc.splitTextToSize(p2, PRINTABLE_WIDTH_MM) as string[];
  doc.setFont('helvetica', 'normal');
  doc.text(p2, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });
  cursorY += p2Lines.length * bodyStep + 5.6 * gs;

  // Tabel rincian barang (selalu 1 halaman)
  const tableRows = buildTableRowsForPreset(preset);
  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: 2,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    head: [headRow],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: preset.tableBodyFontSize,
      minCellHeight: preset.minCellHeight,
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.25,
      valign: 'middle',
      cellPadding: {
        top: preset.cellPadY,
        right: preset.cellPadX,
        bottom: preset.cellPadY,
        left: preset.cellPadX,
      },
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: preset.tableHeadFontSize,
      halign: 'center',
      lineColor: [30, 41, 59],
      lineWidth: 0.28,
    },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: 'center' },
      1: { cellWidth: colWidths[1], halign: 'left' },
      2: { cellWidth: colWidths[2], halign: 'center' },
      3: { cellWidth: colWidths[3], halign: 'center' },
      4: { cellWidth: colWidths[4], halign: 'center' },
    },
  });

  const pCloseLines = doc.splitTextToSize(pClose, PRINTABLE_WIDTH_MM) as string[];
  const maxCloseY = bottomEdgeY - sigMetrics.totalSigH - sigMetrics.sigGap - pCloseLines.length * bodyStep;
  const rawCloseY = (doc.lastAutoTable?.finalY ?? cursorY + 30) + 7.4 * gs;
  const closeY = Math.min(rawCloseY, Math.max(cursorY + 5, maxCloseY));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(preset.bodyFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text(pClose, left, closeY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });

  // 3. BLOK TANDA TANGAN MENGIKUTI BARIS AKHIR (TIDAK FIXATED KE BAWAH)
  const pCloseEndY = closeY + pCloseLines.length * bodyStep;
  const sigTopY = Math.min(
    pCloseEndY + sigMetrics.sigGap,
    bottomEdgeY - sigMetrics.totalSigH
  );
  const jabTopY = sigTopY + sigMetrics.sigTitleH;
  const jabBottomY = jabTopY + sigMetrics.jabH;
  const nameY = jabBottomY + sigMetrics.signingSpaceH;
  const pangkatY = nameY + sigMetrics.extraKpmOffset + sigMetrics.pangkatOffset;
  const nipY = pangkatY + sigMetrics.nipOffset;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PIHAK PERTAMA', leftSigX, sigTopY, { align: 'center' });
  doc.text('PIHAK KEDUA', rightSigX, sigTopY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.1);
  doc.text(leftJabLines, leftSigX, jabTopY, { align: 'center' });
  doc.text('Keluarga Penerima Manfaat (KPM)', rightSigX, jabTopY, { align: 'center' });

  // Kotak Materai Rp. 10.000 tepat di tengah antara dua tanda tangan
  const materaiW = 16;
  const materaiH = Math.min(10.5, Math.max(8, sigMetrics.signingSpaceH - 4));
  const materaiX = left + PRINTABLE_WIDTH_MM * 0.5 - materaiW / 2;
  const materaiY = jabBottomY + (sigMetrics.signingSpaceH - materaiH) / 2 - 1.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.28);
  doc.rect(materaiX, materaiY, materaiW, materaiH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('MATERAI', materaiX + materaiW / 2, materaiY + materaiH * 0.42, { align: 'center' });
  doc.text('RP. 10.000', materaiX + materaiW / 2, materaiY + materaiH * 0.76, { align: 'center' });

  if (loadedSig) {
    const boxW = 40;
    const boxH = Math.max(10, sigMetrics.signingSpaceH - 4.2);
    const imgRatio = loadedSig.width / Math.max(loadedSig.height, 1);
    let drawW = boxW;
    let drawH = boxH;
    if (imgRatio > boxW / boxH) {
      drawH = boxW / imgRatio;
    } else {
      drawW = boxH * imgRatio;
    }
    doc.addImage(
      loadedSig.dataUrl,
      loadedSig.format,
      rightSigX - drawW / 2,
      jabBottomY + 0.5 + (boxH - drawH) / 2,
      drawW,
      drawH
    );
  }

  // Nama PIHAK PERTAMA & PIHAK KEDUA beserta garis tanda tangan simetris & sejajar
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.4);
  const pejabatW = doc.getTextWidth(pejabatNama);
  const kpmMaxW = kpmSigNameLines.reduce((mx, ln) => Math.max(mx, doc.getTextWidth(ln)), 0);
  const sharedSigLineW = Math.max(
    46,
    Math.min(sigColMaxW * 0.88, Math.max(pejabatW, kpmMaxW) + 10)
  );
  const sharedSigLineY = nameY + sigMetrics.extraKpmOffset + 1.0;

  doc.text(pejabatNama, leftSigX, nameY, { align: 'center' });
  doc.text(kpmSigNameLines, rightSigX, nameY, { align: 'center' });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.32);
  doc.line(
    leftSigX - sharedSigLineW / 2,
    sharedSigLineY,
    leftSigX + sharedSigLineW / 2,
    sharedSigLineY
  );
  doc.line(
    rightSigX - sharedSigLineW / 2,
    sharedSigLineY,
    rightSigX + sharedSigLineW / 2,
    sharedSigLineY
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.0);
  if (pejabatPangkat) {
    doc.text(pejabatPangkat, leftSigX, pangkatY, { align: 'center' });
    if (pejabatNipLine) {
      doc.text(pejabatNipLine, leftSigX, nipY, { align: 'center' });
    }
  } else if (pejabatNipLine) {
    doc.text(pejabatNipLine, leftSigX, nameY + sigMetrics.extraKpmOffset + 4.8, { align: 'center' });
  }
}

function renderSingleSptjmPage(
  doc: AutoTableDoc,
  {
    record,
    allRecords,
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    kopConfig,
    sptjmConfig,
    loadedKopLogo,
  }: {
    record: KpmRecord;
    allRecords: KpmRecord[];
    proposals: ProposalRecord[];
    items: ItemBantuan[];
    wilayahList: WilayahKabKota[];
    proposalSlotMap: ProposalSlotMap;
    kopConfig: BastTemplateConfig;
    sptjmConfig: SptjmTemplateConfig;
    loadedKopLogo: LoadedPdfImage | null;
  }
) {
  const PT_TO_MM = 0.352778;
  const left = F4_PDF_MARGINS.left; // 20mm
  const right = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right; // 201mm
  const centerX = left + PRINTABLE_WIDTH_MM / 2;
  const bottomEdgeY = F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom; // 300mm

  // 1. PAGAR ATAS: KOP DINAS SOSIAL MENTOK MARGIN ATAS (10mm)
  const kopEndY = drawOfficialDinsosKop(doc, kopConfig, loadedKopLogo);

  const leftSigX = left + PRINTABLE_WIDTH_MM * 0.25;
  const rightSigX = left + PRINTABLE_WIDTH_MM * 0.75;
  const sigColMaxW = PRINTABLE_WIDTH_MM * 0.45;

  const tempat = sptjmConfig.tempat?.trim() || DEFAULT_SPTJM_TEMPLATE.tempat;
  const tanggalText = formatSptjmFullDate(sptjmConfig);
  const pejabatJabatan =
    sptjmConfig.pejabatJabatan?.trim() || DEFAULT_SPTJM_TEMPLATE.pejabatJabatan;
  const pejabatNama =
    sptjmConfig.pejabatNama?.trim() || DEFAULT_SPTJM_TEMPLATE.pejabatNama;
  const pejabatNipLine = formatOfficialNipLine(
    sptjmConfig.pejabatNip?.trim() || DEFAULT_SPTJM_TEMPLATE.pejabatNip
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  const leftJabLines = doc.splitTextToSize(pejabatJabatan, sigColMaxW) as string[];

  const subStatuses = getKpmSubItemStatusList(record, items);
  const pkg = resolvePackageForKpm(items, record.tahun, record.item);
  const rawTableRows: string[][] =
    subStatuses.length > 0
      ? subStatuses.map((s, i) => [
          `${i + 1}.`,
          s.baseName || s.name,
          s.satuan || 'Unit',
          String(s.volume > 0 ? s.volume : 1),
          'Berfungsi Dengan Baik dan Lengkap',
        ])
      : [
          [
            '1.',
            pkg.name && pkg.name !== pkg.code ? pkg.name : record.item || 'Paket Bantuan',
            'Unit',
            '1',
            'Berfungsi Dengan Baik dan Lengkap',
          ],
        ];

  const slotNo = getKpmSlotNumberInProposal(
    record,
    allRecords,
    proposals,
    items,
    wilayahList,
    proposalSlotMap
  );
  const absenSeq = getAbsenSeq(record.registerCode);
  const noBantuanNum =
    slotNo && slotNo > 0 ? slotNo : absenSeq < 999999 ? absenSeq : null;
  const noBantuanStr = noBantuanNum ? String(noBantuanNum).padStart(2, '0') : '01';

  const kpmFullName = (record.nama || '-').toUpperCase();
  const rawAlamat = (record.alamat || '').trim();
  const kpmAlamatText = rawAlamat && rawAlamat !== '-' ? rawAlamat : '';
  const locationText = formatBastProposalLocation(record, proposals, wilayahList);

  const pIntro =
    `Berkenaan dengan permohonan bantuan peralatan kerja di ${locationText}. ` +
    `Kegiatan pengelolaan data fakir miskin cakupan daerah Provinsi sub kegiatan fasilitasi bantuan pengembangan ekonomi Masyarakat pada Dinas Sosial Provinsi Kalimantan Barat yang telah direalisasikan barang-barang / peralatan berupa :`;

  const pWill =
    'Akan saya gunakan sesuai dengan proposal/ajuan saya dan dengan ini menyatakan dengan sebenar benarnya bahwa :';

  const statementPoints = [
    'Bertanggungjawab mutlak terhadap penggunaan bantuan tersebut diatas;',
    'Bersedia memenuhi kewajiban yang ada, yaitu bertanggung jawab secara formil dan materil atas penggunaan bantuan peralatan kerja yang diterima serta bersedia menyampaikan laporan pemanfaatannya kepada pihak yang berwenang secara berjenjang;',
    'Bersedia dan kooperatif terhadap auditor/pemeriksa yang akan melakukan pemeriksaan atas keabsahan laporan yang saya sampaikan terhadap pemanfaatan bantuan yang diterima;',
    'Tidak akan memperjual belikan bantuan yang telah diterima dari Dinas Sosial Provinsi Kalimantan Barat.',
  ];

  const pClose =
    'Demikian surat pernyataan ini saya buat dengan sebenar-benarnya. Apabila di kemudian hari terbukti terdapat keterangan yang tidak benar atau saya melanggar ketentuan terkait pemanfaatan bantuan ini, saya bersedia menanggung segala konsekuensi hukum, administratif, dan/atau finansial yang timbul tanpa hak untuk menuntut kompensasi dari pihak manapun.';

  const idLabelX = left;
  const idColonX = left + 25;
  const idValX = left + 28.5;
  const idMaxW = right - idValX;

  const numColX = left + 4;
  const pointTextX = left + 10.5;
  const pointMaxW = right - pointTextX;

  const colWidths = [11, 59, 17, 17, 77]; // sum = 181mm
  const headRow = ['No.', 'Nama Barang', 'Satuan', 'Volume', 'Keterangan'];

  const buildTableRowsForPreset = (preset: FenceDensityPreset): string[][] => {
    const rows = rawTableRows.map((r) => [...r]);
    while (rows.length < preset.minBlankRowsSptjm) {
      rows.push(['', '', '', '', '']);
    }
    return rows;
  };

  const getSptjmSigMetrics = (preset: FenceDensityPreset) => {
    const sigScale = Math.max(0.7, preset.gapScale);
    const sigGap = 7.0 * Math.max(0.65, preset.gapScale);
    const mengetahuiRowH = 4.6 * sigScale;
    const jabLineStep = 4.0 * sigScale;
    const jabH = Math.max(1, leftJabLines.length) * jabLineStep;
    const signingSpaceH = 18.0 * Math.max(0.68, preset.gapScale);
    const nipOffset = 4.8;
    const totalSigH = mengetahuiRowH + jabH + signingSpaceH + nipOffset;
    return {
      sigGap,
      mengetahuiRowH,
      jabLineStep,
      jabH,
      signingSpaceH,
      nipOffset,
      totalSigH,
    };
  };

  const middleStartBaseY = kopEndY + 6.5; // 42.8mm
  const totalAvailableH = Math.max(120, bottomEdgeY - middleStartBaseY);

  const measureSptjmTotalHeight = (preset: FenceDensityPreset): number => {
    const gs = preset.gapScale;
    const bodyStep = preset.bodyFontSize * PT_TO_MM * preset.lineHeightFactor;
    let h = 0;

    // Judul SPTJM (tanpa nomor surat)
    h += 8.0 * gs;

    // 'Saya yang bertanda tangan dibawah ini :' + Nama, Alamat, No. Bantuan
    h += 5.8 * gs;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(preset.bodyFontSize);
    const namaLines = doc.splitTextToSize(kpmFullName, idMaxW) as string[];
    const alamatLines = kpmAlamatText
      ? (doc.splitTextToSize(kpmAlamatText, idMaxW) as string[])
      : [''];
    h += Math.max(1, namaLines.length) * preset.idRowStep;
    h += Math.max(1, alamatLines.length) * preset.idRowStep;
    h += preset.idRowStep + 3.4 * gs;

    // Paragraf pembuka
    const pIntroLines = doc.splitTextToSize(pIntro, PRINTABLE_WIDTH_MM) as string[];
    h += pIntroLines.length * bodyStep + 5.2 * gs;

    // Tabel Rincian Barang
    const rows = buildTableRowsForPreset(preset);
    const tableH = estimateSinglePageTableHeight(
      doc,
      headRow,
      rows,
      colWidths,
      preset.tableHeadFontSize,
      preset.tableBodyFontSize,
      preset.cellPadY,
      preset.cellPadX,
      preset.minCellHeight
    );
    h += tableH + 7.2 * gs;

    // Kalimat lead 4 poin
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(preset.bodyFontSize);
    const pWillLines = doc.splitTextToSize(pWill, PRINTABLE_WIDTH_MM) as string[];
    h += pWillLines.length * bodyStep + 1.4 * gs;

    // 4 poin pernyataan
    for (const pt of statementPoints) {
      const ptLines = doc.splitTextToSize(pt, pointMaxW) as string[];
      h += ptLines.length * bodyStep + 0.8 * gs;
    }
    h += 2.6 * gs;

    // Paragraf Penutup
    const pCloseLines = doc.splitTextToSize(pClose, PRINTABLE_WIDTH_MM) as string[];
    h += pCloseLines.length * bodyStep;

    // Blok Tanggal & Tanda Tangan mengikuti baris akhir
    const sigMetrics = getSptjmSigMetrics(preset);
    h += sigMetrics.sigGap + sigMetrics.totalSigH;
    return h;
  };

  const { preset } = resolveAutoFitPreset(measureSptjmTotalHeight, totalAvailableH);
  const gs = preset.gapScale;
  const bodyStep = preset.bodyFontSize * PT_TO_MM * preset.lineHeightFactor;
  const sigMetrics = getSptjmSigMetrics(preset);

  let cursorY = middleStartBaseY;

  // Judul Resmi (persis contoh PDF: bold uppercase tanpa garis bawah & tanpa nomor surat)
  const titleText = 'SURAT PERNYATAAN TANGGUNG JAWAB MUTLAK (SPTJM)';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(preset.titleFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text(titleText, centerX, cursorY, { align: 'center' });
  cursorY += 8.0 * gs;

  // Identitas Yang Membuat Pernyataan (KPM)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(preset.bodyFontSize);
  doc.text('Saya yang bertanda tangan dibawah ini :', left, cursorY);
  cursorY += 5.8 * gs;

  doc.text('Nama', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  const namaLines = doc.splitTextToSize(kpmFullName, idMaxW) as string[];
  doc.text(namaLines, idValX, cursorY);
  cursorY += Math.max(1, namaLines.length) * preset.idRowStep;

  doc.text('Alamat', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  const alamatLines = kpmAlamatText
    ? (doc.splitTextToSize(kpmAlamatText, idMaxW) as string[])
    : [];
  if (alamatLines.length > 0) {
    doc.text(alamatLines, idValX, cursorY);
  }
  cursorY += Math.max(1, alamatLines.length) * preset.idRowStep;

  doc.text('No. Bantuan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.text(noBantuanStr, idValX, cursorY);
  cursorY += preset.idRowStep + 3.4 * gs;

  // Paragraf Permohonan & Realisasi Barang
  const pIntroLines = doc.splitTextToSize(pIntro, PRINTABLE_WIDTH_MM) as string[];
  doc.text(pIntro, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });
  cursorY += pIntroLines.length * bodyStep + 5.2 * gs;

  // Tabel Rincian Barang
  const tableRows = buildTableRowsForPreset(preset);
  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: 2,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    head: [headRow],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: preset.tableBodyFontSize,
      minCellHeight: preset.minCellHeight,
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.25,
      valign: 'middle',
      cellPadding: {
        top: preset.cellPadY,
        right: preset.cellPadX,
        bottom: preset.cellPadY,
        left: preset.cellPadX,
      },
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: preset.tableHeadFontSize,
      halign: 'center',
      lineColor: [30, 41, 59],
      lineWidth: 0.28,
    },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: 'center' },
      1: { cellWidth: colWidths[1], halign: 'left' },
      2: { cellWidth: colWidths[2], halign: 'center' },
      3: { cellWidth: colWidths[3], halign: 'center' },
      4: { cellWidth: colWidths[4], halign: 'center' },
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 30) + 7.2 * gs;

  // Pernyataan 4 poin bernomor
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(preset.bodyFontSize);
  doc.setTextColor(15, 23, 42);
  const pWillLines = doc.splitTextToSize(pWill, PRINTABLE_WIDTH_MM) as string[];
  doc.text(pWill, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });
  cursorY += pWillLines.length * bodyStep + 1.4 * gs;

  statementPoints.forEach((pt, idx) => {
    doc.text(`${idx + 1}.`, numColX, cursorY);
    const ptLines = doc.splitTextToSize(pt, pointMaxW) as string[];
    doc.text(pt, pointTextX, cursorY, {
      maxWidth: pointMaxW,
      align: 'justify',
      lineHeightFactor: preset.lineHeightFactor,
    });
    cursorY += ptLines.length * bodyStep + 0.8 * gs;
  });
  cursorY += 2.6 * gs;

  // Paragraf Penutup
  const pCloseLines = doc.splitTextToSize(pClose, PRINTABLE_WIDTH_MM) as string[];
  const maxCloseY =
    bottomEdgeY - sigMetrics.totalSigH - sigMetrics.sigGap - pCloseLines.length * bodyStep;
  const closeY = Math.min(cursorY, Math.max(middleStartBaseY + 30, maxCloseY));

  doc.text(pClose, left, closeY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: preset.lineHeightFactor,
  });

  // 2. BLOK TANGGAL & TANDA TANGAN 2 KOLOM MENGIKUTI BARIS AKHIR
  const pCloseEndY = closeY + pCloseLines.length * bodyStep;
  const mengetahuiY = Math.min(
    pCloseEndY + sigMetrics.sigGap,
    bottomEdgeY - sigMetrics.totalSigH
  );
  const jabTopY = mengetahuiY + sigMetrics.mengetahuiRowH;
  const nameY = jabTopY + sigMetrics.jabH + sigMetrics.signingSpaceH;
  const nipY = nameY + sigMetrics.nipOffset;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  doc.setTextColor(15, 23, 42);
  doc.text('MENGETAHUI', leftSigX, mengetahuiY, { align: 'center' });
  doc.text(`${tempat}, ${tanggalText}`, rightSigX, mengetahuiY, { align: 'center' });

  doc.setFontSize(9.2);
  doc.text(leftJabLines, leftSigX, jabTopY, { align: 'center' });
  doc.text('Yang Menyatakan', rightSigX, jabTopY, { align: 'center' });

  // Kiri: Pejabat (bold) + NIP & Kanan: Nama KPM, dengan garis tanda tangan simetris sejajar
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.4);
  const pejabatW = doc.getTextWidth(pejabatNama);
  doc.text(pejabatNama, leftSigX, nameY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  const kpmW = doc.getTextWidth(kpmFullName);
  doc.text(kpmFullName, rightSigX, nameY, { align: 'center' });

  const sharedSptjmLineW = Math.max(
    46,
    Math.min(sigColMaxW * 0.9, Math.max(pejabatW, kpmW) + 12)
  );
  const sigLineY = nameY + 1.0;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.32);
  doc.line(
    leftSigX - sharedSptjmLineW / 2,
    sigLineY,
    leftSigX + sharedSptjmLineW / 2,
    sigLineY
  );
  doc.line(
    rightSigX - sharedSptjmLineW / 2,
    sigLineY,
    rightSigX + sharedSptjmLineW / 2,
    sigLineY
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  if (pejabatNipLine) {
    doc.text(pejabatNipLine, leftSigX, nipY, { align: 'center' });
  }
}

export interface ExportKpmBastPdfOptions {
  record: KpmRecord;
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
  bastConfig?: BastTemplateConfig;
  proposalBastMap?: ProposalBastMap;
  useProposalBastMap?: boolean;
}

export async function exportKpmBastToPdf({
  record,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  reportTemplate,
  bastConfig = DEFAULT_BAST_TEMPLATE,
  proposalBastMap,
  useProposalBastMap = false,
}: ExportKpmBastPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const matchedProp =
    (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
    proposals.find((p) => p.namaProposal === record.proposal && p.tahun === record.tahun) ??
    proposals.find((p) => p.namaProposal === record.proposal);

  const effectiveConfig = resolveEffectiveBastConfig(
    bastConfig,
    useProposalBastMap ? proposalBastMap : undefined,
    matchedProp?.id,
    reportTemplate
  );

  const logoUrl = (effectiveConfig.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL;
  const loadedKopLogo = logoUrl ? await loadSingleImageForPdf(logoUrl) : null;
  const sigDoc =
    record.bast?.signatureDoc ||
    (record.documents.lainnya || []).find((d) =>
      (d.fileName || '').toUpperCase().startsWith('BAST-TTD-')
    );
  const loadedSig = await resolveKpmPortraitForPdf(sigDoc);

  renderSingleBastPage(doc, {
    record,
    allRecords: allRecords && allRecords.length > 0 ? allRecords : [record],
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    bastConfig: effectiveConfig,
    loadedKopLogo,
    loadedSig,
  });

  const safeName = `BAST_${record.tahun || 'KPM'}_${record.nama}_${record.registerCode || 'kpm'}`;
  return saveOrOpenPdfDocument(doc, safeName);
}

export interface ExportKpmSptjmPdfOptions {
  record: KpmRecord;
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
  bastConfig?: BastTemplateConfig;
  sptjmConfig?: SptjmTemplateConfig;
}

export async function exportKpmSptjmToPdf({
  record,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  reportTemplate,
  bastConfig = DEFAULT_BAST_TEMPLATE,
  sptjmConfig = DEFAULT_SPTJM_TEMPLATE,
}: ExportKpmSptjmPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const kopConfig = resolveEffectiveBastConfig(bastConfig, undefined, undefined, reportTemplate);
  const logoUrl = (kopConfig.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL;
  const loadedKopLogo = logoUrl ? await loadSingleImageForPdf(logoUrl) : null;

  renderSingleSptjmPage(doc, {
    record,
    allRecords: allRecords && allRecords.length > 0 ? allRecords : [record],
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    kopConfig,
    sptjmConfig,
    loadedKopLogo,
  });

  const safeName = `SPTJM_${record.tahun || 'KPM'}_${record.nama}_${record.registerCode || 'kpm'}`;
  return saveOrOpenPdfDocument(doc, safeName);
}

export interface ExportKpmBastBulkPdfOptions {
  records: KpmRecord[];
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
  bastConfig?: BastTemplateConfig;
  proposalBastMap?: ProposalBastMap;
  fileName?: string;
}

export async function exportKpmBastBulkToPdf({
  records,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  reportTemplate,
  bastConfig = DEFAULT_BAST_TEMPLATE,
  proposalBastMap,
  fileName,
}: ExportKpmBastBulkPdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  if (records.length === 0) {
    throw new Error('Tidak ada data KPM yang memenuhi filter untuk dicetak BAST.');
  }

  const pool = allRecords && allRecords.length > 0 ? allRecords : records;
  const sortedRecords = [...records].sort((a, b) => {
    const yearCmp = (a.tahun || '').localeCompare(b.tahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.proposal || '').localeCompare(b.proposal || '', 'id');
    if (propCmp !== 0) return propCmp;
    const slotA =
      getKpmSlotNumberInProposal(a, pool, proposals, items, wilayahList, proposalSlotMap) ??
      getAbsenSeq(a.registerCode);
    const slotB =
      getKpmSlotNumberInProposal(b, pool, proposals, items, wilayahList, proposalSlotMap) ??
      getAbsenSeq(b.registerCode);
    if (slotA !== slotB) return slotA - slotB;
    return a.nama.localeCompare(b.nama, 'id');
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const kopLogoCache = new Map<string, LoadedPdfImage | null>();
  const getCachedKopLogo = async (url: string): Promise<LoadedPdfImage | null> => {
    if (kopLogoCache.has(url)) return kopLogoCache.get(url) ?? null;
    const loaded = url ? await loadSingleImageForPdf(url) : null;
    kopLogoCache.set(url, loaded);
    return loaded;
  };

  for (let i = 0; i < sortedRecords.length; i += 1) {
    const rec = sortedRecords[i];
    if (i > 0) {
      doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
    }
    const matchedProp =
      (rec.proposalId ? proposals.find((p) => p.id === rec.proposalId) : undefined) ??
      proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
      proposals.find((p) => p.namaProposal === rec.proposal);

    const effectiveConfig = resolveEffectiveBastConfig(
      bastConfig,
      proposalBastMap,
      matchedProp?.id,
      reportTemplate
    );
    const logoUrl = (effectiveConfig.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL;
    const loadedKopLogo = await getCachedKopLogo(logoUrl);

    const sigDoc =
      rec.bast?.signatureDoc ||
      (rec.documents.lainnya || []).find((d) =>
        (d.fileName || '').toUpperCase().startsWith('BAST-TTD-')
      );
    const loadedSig = await resolveKpmPortraitForPdf(sigDoc);

    renderSingleBastPage(doc, {
      record: rec,
      allRecords: pool,
      proposals,
      items,
      wilayahList,
      proposalSlotMap,
      bastConfig: effectiveConfig,
      loadedKopLogo,
      loadedSig,
    });
  }

  const resolvedName = fileName || `BAST_Bulk_${sortedRecords.length}_KPM`;
  const res = await saveOrOpenPdfDocument(doc, resolvedName);
  return { ...res, count: sortedRecords.length };
}

export interface ExportKpmSptjmBulkPdfOptions {
  records: KpmRecord[];
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
  bastConfig?: BastTemplateConfig;
  sptjmConfig?: SptjmTemplateConfig;
  fileName?: string;
}

export async function exportKpmSptjmBulkToPdf({
  records,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  reportTemplate,
  bastConfig = DEFAULT_BAST_TEMPLATE,
  sptjmConfig = DEFAULT_SPTJM_TEMPLATE,
  fileName,
}: ExportKpmSptjmBulkPdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  if (records.length === 0) {
    throw new Error('Tidak ada data KPM yang memenuhi filter untuk dicetak SPTJM.');
  }

  const pool = allRecords && allRecords.length > 0 ? allRecords : records;
  const sortedRecords = [...records].sort((a, b) => {
    const yearCmp = (a.tahun || '').localeCompare(b.tahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.proposal || '').localeCompare(b.proposal || '', 'id');
    if (propCmp !== 0) return propCmp;
    const slotA =
      getKpmSlotNumberInProposal(a, pool, proposals, items, wilayahList, proposalSlotMap) ??
      getAbsenSeq(a.registerCode);
    const slotB =
      getKpmSlotNumberInProposal(b, pool, proposals, items, wilayahList, proposalSlotMap) ??
      getAbsenSeq(b.registerCode);
    if (slotA !== slotB) return slotA - slotB;
    return a.nama.localeCompare(b.nama, 'id');
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const kopConfig = resolveEffectiveBastConfig(bastConfig, undefined, undefined, reportTemplate);
  const logoUrl = (kopConfig.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL;
  const loadedKopLogo = logoUrl ? await loadSingleImageForPdf(logoUrl) : null;

  for (let i = 0; i < sortedRecords.length; i += 1) {
    const rec = sortedRecords[i];
    if (i > 0) {
      doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
    }
    renderSingleSptjmPage(doc, {
      record: rec,
      allRecords: pool,
      proposals,
      items,
      wilayahList,
      proposalSlotMap,
      kopConfig,
      sptjmConfig,
      loadedKopLogo,
    });
  }

  const resolvedName = fileName || `SPTJM_Bulk_${sortedRecords.length}_KPM`;
  const res = await saveOrOpenPdfDocument(doc, resolvedName);
  return { ...res, count: sortedRecords.length };
}

export interface SubItemRecapPdfOptions {
  records: KpmRecord[];
  items: ItemBantuan[];
  selectedYear: string;
  proposalTypeFilter?: 'all' | ProposalTipe;
  reportTemplate?: ReportTemplateConfig;
  fileName?: string;
}

export async function exportSubItemRecapToPdf({
  records,
  items,
  selectedYear,
  proposalTypeFilter = 'all',
  reportTemplate,
  fileName,
}: SubItemRecapPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  const scopedRecords = records.filter(
    (rec) => rec.validasi === 'accepted' && (selectedYear === 'all' || rec.tahun === selectedYear)
  );

  const overallRecap = computeSubItemRecap(scopedRecords, items);
  const yearLabel = selectedYear === 'all' ? 'Semua Tahun' : selectedYear || 'Tanpa Tahun';

  // Kelompokkan per kode item utama
  const byItemCode = new Map<string, KpmRecord[]>();
  for (const rec of scopedRecords) {
    const code = (rec.item || '').trim() || 'TANPA-ITEM';
    const arr = byItemCode.get(code) ?? [];
    arr.push(rec);
    byItemCode.set(code, arr);
  }

  const sortedItemCodes = Array.from(byItemCode.keys()).sort((a, b) => {
    const rankA = getItemHierarchyRank(a, selectedYear, items);
    const rankB = getItemHierarchyRank(b, selectedYear, items);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b, 'id');
  });

  const itemSummaryEntries = sortedItemCodes.map((code) => {
    const itemRecs = byItemCode.get(code) ?? [];
    const refYear = selectedYear !== 'all' ? selectedYear : itemRecs[0]?.tahun || '';
    const pkg = resolvePackageForKpm(items, refYear, code);
    const itemRecap = computeSubItemRecap(itemRecs, items);
    const completeKpm = itemRecap.kpmRows.filter((r) => r.debtStatus === 'complete').length;
    const totalKpm = itemRecs.length;
    const pendingKpm = totalKpm - completeKpm;

    // Urutkan sub-item sesuai urutan katalog item jika tersedia
    const catalogOrder = new Map<string, number>();
    pkg.subItems.forEach((subName, idx) => {
      catalogOrder.set(normalizeSubItemKey(subName), idx);
    });
    const sortedSubAggregates = [...itemRecap.aggregates].sort((a, b) => {
      const ordA = catalogOrder.get(normalizeSubItemKey(a.key || a.name)) ?? 9999;
      const ordB = catalogOrder.get(normalizeSubItemKey(b.key || b.name)) ?? 9999;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name, 'id');
    });

    return {
      code,
      name: pkg.name && pkg.name !== code ? pkg.name : code,
      subItemCount: pkg.subItems.length,
      totalKpm,
      completeKpm,
      pendingKpm,
      totalUnits: itemRecap.totalUnits,
      totalDelivered: itemRecap.totalDelivered,
      totalPending: itemRecap.totalPending,
      subAggregates: sortedSubAggregates,
    };
  });

  const totalPackages = overallRecap.kpmRows.length;
  const deliveredPackages = overallRecap.kpmRows.filter((r) => r.debtStatus === 'complete').length;
  const pendingPackages = totalPackages - deliveredPackages;
  const pctPackages = totalPackages > 0 ? Math.round((deliveredPackages / totalPackages) * 100) : 0;
  const pctUnits =
    overallRecap.totalUnits > 0
      ? Math.round((overallRecap.totalDelivered / overallRecap.totalUnits) * 100)
      : 0;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  let cursorY = F4_PDF_MARGINS.top;
  const centerX = F4_PDF_MARGINS.left + PRINTABLE_WIDTH_MM / 2;

  if (reportTemplate?.enabled) {
    if (reportTemplate.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, cursorY + 4.5, {
        align: 'center',
      });
      cursorY += 5.2;
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 118, 110);
      doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, cursorY + 4, { align: 'center' });
      cursorY += 4.8;
    }
    if (reportTemplate.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTemplate.orgAddress.trim(), centerX, cursorY + 3.5, { align: 'center' });
      cursorY += 4.5;
    }
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(F4_PDF_MARGINS.left, cursorY + 1, F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right, cursorY + 1);
    doc.setLineWidth(0.2);
    doc.line(
      F4_PDF_MARGINS.left,
      cursorY + 2.1,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      cursorY + 2.1
    );
    cursorY += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text('REKAPITULASI ITEM & SUB-ITEM BANTUAN', F4_PDF_MARGINS.left, cursorY + 4);

  const tipeSubtitlePart =
    proposalTypeFilter === 'all' ? 'Semua Tipe Proposal' : `Proposal ${proposalTypeFilter}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Tahun Anggaran: ${yearLabel}   ·   ${tipeSubtitlePart}   ·   KPM Diterima   ·   Dicetak: ${formatUploadDateTime(new Date().toISOString())}`,
    F4_PDF_MARGINS.left,
    cursorY + 9.2
  );
  cursorY += 13;

  // Ringkasan Eksekutif
  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom + 8,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: [['TOTAL PAKET KPM', 'PAKET LENGKAP', 'TOTAL UNIT SUB-ITEM', 'UNIT DITERIMA', 'UNIT BELUM']],
    body: [
      [
        `${totalPackages} Paket`,
        `${deliveredPackages} Paket (${pctPackages}%)`,
        `${overallRecap.totalUnits} Unit`,
        `${overallRecap.totalDelivered} Unit (${pctUnits}%)`,
        `${overallRecap.totalPending} Unit`,
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.8,
      fontStyle: 'bold',
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 18) + 6;

  // Bagian 1: Rekapitulasi per Paket Item
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Rekapitulasi Paket Item Utama', F4_PDF_MARGINS.left, cursorY);
  cursorY += 2.5;

  const itemTableBody: (string | number)[][] = itemSummaryEntries.map((row, idx) => [
    String(idx + 1).padStart(2, '0'),
    row.code,
    row.name,
    row.subItemCount,
    row.totalKpm,
    row.completeKpm,
    row.pendingKpm,
  ]);

  if (itemSummaryEntries.length > 0) {
    itemTableBody.push([
      '',
      'TOTAL',
      `${itemSummaryEntries.length} Jenis Item`,
      itemSummaryEntries.reduce((s, r) => s + r.subItemCount, 0),
      totalPackages,
      deliveredPackages,
      pendingPackages,
    ]);
  } else {
    itemTableBody.push(['-', '-', 'Belum ada data item diterima pada tahun ini', 0, 0, 0, 0]);
  }

  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom + 8,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: [['NO', 'KODE', 'NAMA PAKET ITEM', 'SUB-ITEM', 'TOTAL PAKET', 'LENGKAP', 'BELUM']],
    body: itemTableBody,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 8.4,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      valign: 'middle',
      cellPadding: { top: 2, right: 2.2, bottom: 2, left: 2.2 },
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: PRINTABLE_WIDTH_MM - 109, halign: 'left' },
      3: { cellWidth: 19, halign: 'center' },
      4: { cellWidth: 23, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 19, halign: 'center' },
      6: { cellWidth: 19, halign: 'center' },
    },
    didParseCell: (data) => {
      if (
        itemSummaryEntries.length > 0 &&
        data.section === 'body' &&
        data.row.index === itemTableBody.length - 1
      ) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 30) + 7;
  if (cursorY > F4_PAPER_HEIGHT_MM - 38) {
    doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
    cursorY = F4_PDF_MARGINS.top + 2;
  }

  // Bagian 2: Rincian Lengkap Sub-Item per Item
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Rincian Sub-Item per Paket Item', F4_PDF_MARGINS.left, cursorY);
  cursorY += 2.5;

  // Sub-item yang muncul di lebih dari 1 paket item digabung jadi 1 baris akumulasi di bawah
  const sharedAggregates = [...overallRecap.aggregates]
    .filter((agg) => agg.packageSources.length > 1)
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const sharedSubKeySet = new Set(
    sharedAggregates.map((agg) => normalizeSubItemKey(agg.key || agg.name))
  );

  const subDetailBody: (string | number)[][] = [];
  const sharedRowIndices = new Set<number>();
  let rowCounter = 1;
  for (const itemEntry of itemSummaryEntries) {
    if (itemEntry.subAggregates.length === 0) {
      subDetailBody.push([
        String(rowCounter++).padStart(2, '0'),
        itemEntry.code,
        itemEntry.name,
        '(Belum ada sub-item terdaftar)',
        itemEntry.totalKpm,
        itemEntry.completeKpm,
        itemEntry.pendingKpm,
        itemEntry.totalKpm > 0
          ? `${Math.round((itemEntry.completeKpm / itemEntry.totalKpm) * 100)}%`
          : '0%',
      ]);
    } else {
      const uniqueSubs = itemEntry.subAggregates.filter(
        (sub) => !sharedSubKeySet.has(normalizeSubItemKey(sub.key || sub.name))
      );
      if (uniqueSubs.length === 0) {
        subDetailBody.push([
          String(rowCounter++).padStart(2, '0'),
          itemEntry.code,
          `${itemEntry.name} (${itemEntry.totalKpm} Paket)`,
          '(Seluruh sub-item digabung di akumulasi bawah)',
          '-',
          '-',
          '-',
          '-',
        ]);
      } else {
        uniqueSubs.forEach((sub, subIdx) => {
          const pct =
            sub.totalNeeded > 0 ? Math.round((sub.deliveredCount / sub.totalNeeded) * 100) : 0;
          subDetailBody.push([
            String(rowCounter++).padStart(2, '0'),
            subIdx === 0 ? itemEntry.code : '',
            subIdx === 0 ? `${itemEntry.name} (${itemEntry.totalKpm} Paket)` : '',
            sub.name,
            `${sub.totalNeeded} ${sub.satuan || 'Unit'}`,
            sub.deliveredCount,
            sub.pendingCount,
            `${pct}%`,
          ]);
        });
      }
    }
  }

  for (const shared of sharedAggregates) {
    const pct =
      shared.totalNeeded > 0 ? Math.round((shared.deliveredCount / shared.totalNeeded) * 100) : 0;
    const sourceCodes = shared.packageSources.map((s) => s.code).join(', ');
    const idx = subDetailBody.length;
    sharedRowIndices.add(idx);
    subDetailBody.push([
      String(rowCounter++).padStart(2, '0'),
      'MULTI',
      `Gabungan (${sourceCodes})`,
      shared.name,
      `${shared.totalNeeded} ${shared.satuan || 'Unit'}`,
      shared.deliveredCount,
      shared.pendingCount,
      `${pct}%`,
    ]);
  }

  if (itemSummaryEntries.length > 0) {
    subDetailBody.push([
      '',
      'TOTAL',
      'Seluruh Item & Sub-Item',
      `${overallRecap.aggregates.length} Sub-Item`,
      `${overallRecap.totalUnits} Unit`,
      overallRecap.totalDelivered,
      overallRecap.totalPending,
      `${pctUnits}%`,
    ]);
  } else {
    subDetailBody.push(['-', '-', '-', 'Belum ada rincian sub-item tersedia', 0, 0, 0, '0%']);
  }

  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom + 8,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: [['NO', 'KODE', 'PAKET ITEM', 'SUB-ITEM', 'JUMLAH', 'DITERIMA', 'BELUM', 'PROGRES']],
    body: subDetailBody,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      valign: 'middle',
      cellPadding: { top: 1.9, right: 2, bottom: 1.9, left: 2 },
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 44, halign: 'left', fontStyle: 'bold' },
      3: { cellWidth: PRINTABLE_WIDTH_MM - 142, halign: 'left' },
      4: { cellWidth: 19, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 15, halign: 'center' },
      7: { cellWidth: 19, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (sharedRowIndices.has(data.row.index)) {
        data.cell.styles.fillColor = [240, 253, 250];
        if (data.column.index === 1) {
          data.cell.styles.textColor = [15, 118, 110];
        }
        if (data.column.index === 3 || data.column.index === 4) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (
        itemSummaryEntries.length > 0 &&
        data.row.index === subDetailBody.length - 1
      ) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Nomor halaman pada footer
  const totalPages = doc.getNumberOfPages();
  const footerScope =
    proposalTypeFilter === 'all' ? yearLabel : `${yearLabel} · ${proposalTypeFilter}`;
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · Rekapitulasi Item & Sub-Item (${footerScope})`,
      F4_PDF_MARGINS.left,
      F4_PAPER_HEIGHT_MM - 5.5
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      F4_PAPER_HEIGHT_MM - 5.5,
      { align: 'right' }
    );
  }

  const tipeSlug = proposalTypeFilter === 'all' ? '' : `-${proposalTypeFilter.toLowerCase()}`;
  const resolvedFileName =
    fileName ||
    `masdeta-rekap-item-subitem-${selectedYear === 'all' ? 'semua-tahun' : selectedYear}${tipeSlug}`;
  return saveOrOpenPdfDocument(doc, resolvedFileName);
}

export interface ExportSchedulesPdfOptions {
  schedules: import('../types/kpm').ScheduleEventItem[];
  title?: string;
  bookLabel?: string;
  books?: ScheduleBook[];
  scheduleBookMap?: Record<string, string>;
  showBookColumn?: boolean;
  selectedYear?: string;
  fileName?: string;
  reportTemplate?: ReportTemplateConfig;
}

export async function exportSchedulesToPdf({
  schedules,
  title = 'JADWAL KEGIATAN & TARGET PROPOSAL',
  bookLabel,
  books = DEFAULT_SCHEDULE_BOOKS,
  scheduleBookMap = {},
  showBookColumn = false,
  selectedYear = 'all',
  fileName,
  reportTemplate,
}: ExportSchedulesPdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const catLabelMap = SCHEDULE_CATEGORY_LABELS;

  const todayStr = new Date().toISOString().slice(0, 10);
  const sorted = [...schedules].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const dateCmp = (a.targetDate || '').localeCompare(b.targetDate || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99');
  });

  const completedCount = sorted.filter((s) => s.completed).length;
  const overdueCount = sorted.filter((s) => !s.completed && s.targetDate < todayStr).length;
  const activeCount = sorted.length - completedCount;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  let cursorY = F4_PDF_MARGINS.top;
  const centerX = F4_PDF_MARGINS.left + PRINTABLE_WIDTH_MM / 2;

  if (reportTemplate?.enabled) {
    if (reportTemplate.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, cursorY + 4.5, {
        align: 'center',
      });
      cursorY += 5.2;
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 118, 110);
      doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, cursorY + 4, { align: 'center' });
      cursorY += 4.8;
    }
    if (reportTemplate.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTemplate.orgAddress.trim(), centerX, cursorY + 3.5, { align: 'center' });
      cursorY += 4.5;
    }
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(F4_PDF_MARGINS.left, cursorY + 1, F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right, cursorY + 1);
    doc.setLineWidth(0.2);
    doc.line(
      F4_PDF_MARGINS.left,
      cursorY + 2.1,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      cursorY + 2.1
    );
    cursorY += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title, F4_PDF_MARGINS.left, cursorY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  const yearLabel = selectedYear === 'all' ? 'Semua Tahun' : `Tahun ${selectedYear}`;
  const bookMetaPart = bookLabel ? `Buku: ${bookLabel}   ·   ` : '';
  doc.text(
    `${bookMetaPart}Cakupan: ${yearLabel}   ·   Total: ${sorted.length} Agenda   ·   Dicetak: ${formatUploadDateTime(new Date().toISOString())}`,
    F4_PDF_MARGINS.left,
    cursorY + 9.2
  );
  cursorY += 13;

  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom + 8,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: [['TOTAL AGENDA', 'AKTIF / TERJADWAL', 'MELEWATI TARGET', 'SELESAI']],
    body: [[`${sorted.length} Agenda`, `${activeCount} Agenda`, `${overdueCount} Agenda`, `${completedCount} Agenda`]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.8,
      fontStyle: 'bold',
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 18) + 6;

  const bookMapById = new Map(books.map((b) => [b.id, b]));
  const tableHead = showBookColumn
    ? [['NO', 'BUKU / BAB', 'HARI, TANGGAL & JAM', 'KELURAHAN / PROPOSAL', 'KATEGORI', 'TAHUN', 'LOKASI', 'STATUS']]
    : [['NO', 'HARI, TANGGAL & JAM', 'KELURAHAN / PROPOSAL', 'KATEGORI / AGENDA', 'TAHUN', 'LOKASI', 'STATUS']];

  const tableBody: string[][] =
    sorted.length === 0
      ? [showBookColumn ? ['-', '-', '-', '-', '-', '-', '-', '-'] : ['-', '-', '-', '-', '-', '-', '-']]
      : sorted.map((ev, idx) => {
          const isOverdue = !ev.completed && ev.targetDate < todayStr;
          const statusText = ev.completed ? 'Selesai' : isOverdue ? 'Terlambat' : 'Terjadwal';
          const formattedDate = formatScheduleIndonesianDate(ev.targetDate, ev.targetDay);
          const dateTimeStr = ev.targetTime ? `${formattedDate}\nPukul ${ev.targetTime}` : formattedDate;
          const categoryLabel = catLabelMap[ev.category] || ev.title || ev.category;
          const proposalTitle = ev.proposalName?.trim() || 'Umum / Tanpa Proposal';
          const cleanLocation =
            (ev.location || '')
              .trim()
              .replace(/^lokasi\s*:\s*/i, '')
              .trim() || '-';
          const bId = resolveScheduleBookId(ev, scheduleBookMap, books);
          const bookObj = bookMapById.get(bId);
          const bookCell = bookObj
            ? bookObj.subtitle
              ? `${bookObj.title}\n${bookObj.subtitle}`
              : bookObj.title
            : bId;
          if (showBookColumn) {
            return [
              String(idx + 1).padStart(2, '0'),
              bookCell,
              dateTimeStr,
              proposalTitle,
              categoryLabel,
              ev.tahun || '-',
              cleanLocation,
              statusText,
            ];
          }
          return [
            String(idx + 1).padStart(2, '0'),
            dateTimeStr,
            proposalTitle,
            categoryLabel,
            ev.tahun || '-',
            cleanLocation,
            statusText,
          ];
        });

  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom + 8,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      valign: 'middle',
      cellPadding: { top: 2.1, right: 2, bottom: 2.1, left: 2 },
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      halign: 'center',
    },
    columnStyles: showBookColumn
      ? {
          0: { cellWidth: 8.5, halign: 'center' },
          1: { cellWidth: 24, halign: 'left' },
          2: { cellWidth: 29, halign: 'center' },
          3: { cellWidth: 34, halign: 'left', fontStyle: 'bold' },
          4: { cellWidth: 23, halign: 'left' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: PRINTABLE_WIDTH_MM - 148.5, halign: 'left' },
          7: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        }
      : {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 31, halign: 'center' },
          2: { cellWidth: 36, halign: 'left', fontStyle: 'bold' },
          3: { cellWidth: 26, halign: 'left' },
          4: { cellWidth: 13, halign: 'center' },
          5: { cellWidth: PRINTABLE_WIDTH_MM - 133.5, halign: 'left' },
          6: { cellWidth: 18.5, halign: 'center', fontStyle: 'bold' },
        },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · ${bookLabel || 'Jadwal & Target Proposal'} (${yearLabel})`,
      F4_PDF_MARGINS.left,
      F4_PAPER_HEIGHT_MM - 5.5
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      F4_PAPER_HEIGHT_MM - 5.5,
      { align: 'right' }
    );
  }

  const bookSlug = bookLabel
    ? `-${bookLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`
    : '';
  const resolvedFileName =
    fileName || `masdeta-jadwal${bookSlug}-${selectedYear === 'all' ? 'semua' : selectedYear}`;
  const res = await saveOrOpenPdfDocument(doc, resolvedFileName);
  return { ...res, count: sorted.length };
}

export type KpmSubItemStatusFilter = 'all' | 'incomplete' | 'complete';

export interface ExportKpmSubItemChecklistPdfOptions {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  title: string;
  subtitle?: string;
  fileName: string;
  statusFilter?: KpmSubItemStatusFilter;
  reportTemplate?: ReportTemplateConfig;
  splitByProposal?: boolean;
  autoExcludeKelurahanWhenInProposalTitle?: boolean;
  showProposalColumn?: boolean;
  showKelurahanColumn?: boolean;
  showPengelolaColumn?: boolean;
  showKontakColumn?: boolean;
  selectedPengelolaLabel?: string;
}

interface SubItemBreakdownAggregate {
  itemCode: string;
  itemName: string;
  itemRank: number;
  subKey: string;
  subName: string;
  subOrder: number;
  satuan: string;
  kpmTotal: number;
  kpmDelivered: number;
  kpmPending: number;
  qtyTotal: number;
  qtyDelivered: number;
  qtyPending: number;
}

interface ComputedChecklistTotals {
  totalKpm: number;
  completeKpm: number;
  partialKpm: number;
  unstartedKpm: number;
  noSubItemKpm: number;
  totalSubItemUnits: number;
  deliveredSubItemUnits: number;
  pendingSubItemUnits: number;
  breakdownRows: SubItemBreakdownAggregate[];
}

function computeChecklistTotalsForRecords(
  recs: KpmRecord[],
  items: ItemBantuan[]
): ComputedChecklistTotals {
  let completeKpm = 0;
  let partialKpm = 0;
  let unstartedKpm = 0;
  let noSubItemKpm = 0;
  let totalSubItemUnits = 0;
  let deliveredSubItemUnits = 0;
  let pendingSubItemUnits = 0;

  const map = new Map<string, SubItemBreakdownAggregate>();

  for (const rec of recs) {
    const pkg = resolvePackageForKpm(items, rec.tahun, rec.item);
    const statuses = getKpmSubItemStatusList(rec, items);

    if (statuses.length === 0) {
      noSubItemKpm += 1;
      continue;
    }

    const delivCount = statuses.filter((s) => s.delivered).length;
    if (delivCount === statuses.length) {
      completeKpm += 1;
    } else if (delivCount > 0) {
      partialKpm += 1;
    } else {
      unstartedKpm += 1;
    }

    const itemCode = (pkg.code || rec.item || '-').trim() || '-';
    const itemName = pkg.name && pkg.name !== itemCode ? pkg.name : itemCode;
    const itemRank = getItemHierarchyRank(itemCode, rec.tahun, items);

    statuses.forEach((sub, subIdx) => {
      const qty = sub.volume > 0 ? sub.volume : 1;
      const satuan = sub.satuan || 'Unit';
      totalSubItemUnits += qty;
      if (sub.delivered) {
        deliveredSubItemUnits += qty;
      } else {
        pendingSubItemUnits += qty;
      }

      const aggKey = `${itemCode.toUpperCase()}::${sub.key}`;
      const existing = map.get(aggKey);
      if (existing) {
        existing.kpmTotal += 1;
        if (sub.delivered) existing.kpmDelivered += 1;
        else existing.kpmPending += 1;
        existing.qtyTotal += qty;
        if (sub.delivered) existing.qtyDelivered += qty;
        else existing.qtyPending += qty;
      } else {
        map.set(aggKey, {
          itemCode,
          itemName,
          itemRank,
          subKey: sub.key,
          subName: sub.baseName || sub.name,
          subOrder: subIdx,
          satuan,
          kpmTotal: 1,
          kpmDelivered: sub.delivered ? 1 : 0,
          kpmPending: sub.delivered ? 0 : 1,
          qtyTotal: qty,
          qtyDelivered: sub.delivered ? qty : 0,
          qtyPending: sub.delivered ? 0 : qty,
        });
      }
    });
  }

  const breakdownRows = Array.from(map.values()).sort((a, b) => {
    if (a.itemRank !== b.itemRank) return a.itemRank - b.itemRank;
    const codeCmp = a.itemCode.localeCompare(b.itemCode, 'id');
    if (codeCmp !== 0) return codeCmp;
    if (a.subOrder !== b.subOrder) return a.subOrder - b.subOrder;
    return a.subName.localeCompare(b.subName, 'id');
  });

  return {
    totalKpm: recs.length,
    completeKpm,
    partialKpm,
    unstartedKpm,
    noSubItemKpm,
    totalSubItemUnits,
    deliveredSubItemUnits,
    pendingSubItemUnits,
    breakdownRows,
  };
}

export async function exportKpmSubItemChecklistToPdf({
  records,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  title,
  subtitle,
  fileName,
  statusFilter = 'all',
  reportTemplate,
  splitByProposal = false,
  autoExcludeKelurahanWhenInProposalTitle = false,
  showProposalColumn = false,
  showKelurahanColumn = false,
  showPengelolaColumn = false,
  showKontakColumn = false,
  selectedPengelolaLabel,
}: ExportKpmSubItemChecklistPdfOptions): Promise<{
  savedFileName: string;
  openedNative: boolean;
  count: number;
}> {
  if (records.length === 0) {
    throw new Error('Tidak ada data KPM yang cocok dengan filter Sub-Item saat ini.');
  }

  const sortedRecords = [...records].sort((a, b) => {
    const yearCmp = (a.tahun || '').localeCompare(b.tahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.proposal || '').localeCompare(b.proposal || '', 'id');
    if (propCmp !== 0) return propCmp;
    const seqCmp = getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode);
    if (seqCmp !== 0) return seqCmp;
    const rankCmp =
      getItemHierarchyRank(a.item, a.tahun, items) - getItemHierarchyRank(b.item, b.tahun, items);
    if (rankCmp !== 0) return rankCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const loadedReportLogo = reportTemplate?.enabled
    ? await loadSingleImageForPdf((reportTemplate.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL)
    : null;

  const drawReportHeaderKop = (startTopY: number): number => {
    if (!reportTemplate?.enabled) return startTopY;
    const logoSpaceW = loadedReportLogo ? 16 : 0;
    if (loadedReportLogo) {
      const ratio = loadedReportLogo.width / Math.max(loadedReportLogo.height, 1);
      let drawW = 14;
      let drawH = 17.5;
      if (ratio > drawW / drawH) {
        drawH = drawW / ratio;
      } else {
        drawW = drawH * ratio;
      }
      doc.addImage(
        loadedReportLogo.dataUrl,
        loadedReportLogo.format,
        F4_PDF_MARGINS.left + (logoSpaceW - drawW) / 2,
        startTopY + Math.max(0, (17.5 - drawH) / 2),
        drawW,
        drawH
      );
    }

    const centerX = F4_PDF_MARGINS.left + logoSpaceW + (PRINTABLE_WIDTH_MM - logoSpaceW) / 2;
    let textBottomY = startTopY;
    if (reportTemplate.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, textBottomY + 4.5, {
        align: 'center',
      });
      textBottomY += 5.5;
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 118, 110);
      doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, textBottomY + 4, { align: 'center' });
      textBottomY += 5;
    }
    if (reportTemplate.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTemplate.orgAddress.trim(), centerX, textBottomY + 3.5, { align: 'center' });
      textBottomY += 5;
    }
    const headerEnd = Math.max(textBottomY, loadedReportLogo ? startTopY + 18 : textBottomY);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(
      F4_PDF_MARGINS.left,
      headerEnd + 1,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      headerEnd + 1
    );
    doc.setLineWidth(0.2);
    doc.line(
      F4_PDF_MARGINS.left,
      headerEnd + 2.1,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      headerEnd + 2.1
    );
    return headerEnd + 5;
  };

  const drawSignatoryIfEnabled = (afterY: number) => {
    if (
      !reportTemplate?.enabled ||
      (!reportTemplate.signatoryName?.trim() && !reportTemplate.signatoryTitle?.trim())
    ) {
      return;
    }
    let sigY = afterY + 10;
    if (sigY + 34 > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom - 5) {
      doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
      sigY = F4_PDF_MARGINS.top + 8;
    }
    const sigX = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right - 34;
    const dateStr = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(`${reportTemplate.city?.trim() || 'Pontianak'}, ${dateStr}`, sigX, sigY, {
      align: 'center',
    });
    if (reportTemplate.signatoryTitle?.trim()) {
      doc.text(reportTemplate.signatoryTitle.trim(), sigX, sigY + 4.8, { align: 'center' });
    }
    if (reportTemplate.signatoryName?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.text(reportTemplate.signatoryName.trim(), sigX, sigY + 23, { align: 'center' });
    }
    if (reportTemplate.signatoryNip?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`NIP. ${reportTemplate.signatoryNip.trim()}`, sigX, sigY + 27.5, { align: 'center' });
    }
  };

  const renderTotalsRecapBlock = ({
    totals,
    heading,
    startY,
  }: {
    totals: ComputedChecklistTotals;
    heading: string;
    startY: number;
  }): number => {
    let cursorY = startY;
    if (cursorY + 46 > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom - 6) {
      doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
      cursorY = F4_PDF_MARGINS.top + 2;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(heading, F4_PDF_MARGINS.left, cursorY);
    cursorY += 2.6;

    const incompleteKpmCount = totals.partialKpm + totals.unstartedKpm;
    const pctDelivered =
      totals.totalSubItemUnits > 0
        ? Math.round((totals.deliveredSubItemUnits / totals.totalSubItemUnits) * 100)
        : 0;

    // 1. Ringkasan KPM & Total Unit Sub-Item
    autoTable(doc, {
      startY: cursorY,
      margin: {
        top: F4_PDF_MARGINS.top,
        right: F4_PDF_MARGINS.right,
        bottom: F4_PDF_MARGINS.bottom + 7,
        left: F4_PDF_MARGINS.left,
      },
      tableWidth: PRINTABLE_WIDTH_MM,
      rowPageBreak: 'avoid',
      head: [
        [
          'TOTAL KPM',
          'KPM LENGKAP',
          'KPM BELUM LENGKAP',
          'TOTAL SUB-ITEM',
          'SUDAH DITERIMA',
          'BELUM DITERIMA',
        ],
      ],
      body: [
        [
          `${totals.totalKpm} KPM`,
          `${totals.completeKpm} KPM`,
          `${incompleteKpmCount} KPM`,
          `${totals.totalSubItemUnits} Unit`,
          `${totals.deliveredSubItemUnits} Unit (${pctDelivered}%)`,
          `${totals.pendingSubItemUnits} Unit`,
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        textColor: [15, 23, 42],
        lineColor: [148, 163, 184],
        lineWidth: 0.24,
        cellPadding: { top: 2.0, right: 1.5, bottom: 2.0, left: 1.5 },
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.2,
        fontStyle: 'bold',
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 1 || data.column.index === 4) {
            data.cell.styles.textColor = [15, 118, 110];
          } else if (data.column.index === 2 || data.column.index === 5) {
            data.cell.styles.textColor =
              (data.column.index === 2 ? incompleteKpmCount : totals.pendingSubItemUnits) > 0
                ? [190, 18, 60]
                : [15, 118, 110];
          }
        }
      },
    });

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 14) + 3.5;

    // 2. Listing Total Rekap Per Sub-Item (Sudah vs Belum)
    const breakdownBody: (string | number)[][] = totals.breakdownRows.map((row, idx) => [
      String(idx + 1).padStart(2, '0'),
      row.itemCode,
      row.subName,
      `${row.qtyTotal} ${row.satuan}`,
      `${row.qtyDelivered} ${row.satuan} (${row.kpmDelivered} KPM)`,
      `${row.qtyPending} ${row.satuan} (${row.kpmPending} KPM)`,
    ]);

    if (totals.breakdownRows.length > 0) {
      breakdownBody.push([
        '',
        'TOTAL',
        `Seluruh Sub-Item (${totals.breakdownRows.length} jenis)`,
        `${totals.totalSubItemUnits} Unit`,
        `${totals.deliveredSubItemUnits} Unit`,
        `${totals.pendingSubItemUnits} Unit`,
      ]);
    } else {
      breakdownBody.push(['-', '-', 'Belum ada rincian sub-item terdaftar', '-', '-', '-']);
    }

    autoTable(doc, {
      startY: cursorY,
      margin: {
        top: F4_PDF_MARGINS.top,
        right: F4_PDF_MARGINS.right,
        bottom: F4_PDF_MARGINS.bottom + 7,
        left: F4_PDF_MARGINS.left,
      },
      tableWidth: PRINTABLE_WIDTH_MM,
      head: [
        [
          'NO',
          'ITEM',
          'NAMA SUB-ITEM',
          'TOTAL KEBUTUHAN',
          'TOTAL SUDAH DITERIMA',
          'TOTAL BELUM DITERIMA',
        ],
      ],
      body: breakdownBody,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 8.0,
        textColor: [15, 23, 42],
        lineColor: [148, 163, 184],
        lineWidth: 0.22,
        valign: 'middle',
        cellPadding: { top: 1.7, right: 2, bottom: 1.7, left: 2 },
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.4,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: PRINTABLE_WIDTH_MM - 117, halign: 'left' },
        3: { cellWidth: 27, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 32, halign: 'center' },
        5: { cellWidth: 32, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const isTotalRow =
          totals.breakdownRows.length > 0 && data.row.index === breakdownBody.length - 1;
        if (isTotalRow) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 8.4;
        }
        if (data.column.index === 4) {
          data.cell.styles.textColor = [15, 118, 110];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.column.index === 5) {
          const pendingQty = isTotalRow
            ? totals.pendingSubItemUnits
            : totals.breakdownRows[data.row.index]?.qtyPending ?? 0;
          data.cell.styles.textColor = pendingQty > 0 ? [190, 18, 60] : [15, 118, 110];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    return doc.lastAutoTable?.finalY ?? cursorY + 20;
  };

  const renderChecklistSection = (sectionOpts: {
    sectionRecords: KpmRecord[];
    sectionTitle: string;
    sectionSubtitle?: string;
    proposalTitleForAutoKel?: string;
    recapHeading: string;
  }): number => {
    const {
      sectionRecords,
      sectionTitle,
      sectionSubtitle,
      proposalTitleForAutoKel,
      recapHeading,
    } = sectionOpts;

    const shouldOmitKelurahan =
      autoExcludeKelurahanWhenInProposalTitle &&
      proposalTitleForAutoKel !== undefined &&
      !shouldAutoIncludeKelurahanColumn(proposalTitleForAutoKel);

    const includeKel = showKelurahanColumn && !shouldOmitKelurahan;
    const includeProp = showProposalColumn;
    const includePengelola = showPengelolaColumn;
    const includeKontak = showKontakColumn;

    const headerTopY = drawReportHeaderKop(F4_PDF_MARGINS.top);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sectionTitle.trim() || 'Rekap Sub-Item KPM', F4_PDF_MARGINS.left, headerTopY + 5.5);

    let tableStartY = headerTopY + 10.5;
    if (sectionSubtitle && sectionSubtitle.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(sectionSubtitle.trim(), F4_PDF_MARGINS.left, headerTopY + 10.2);
      tableStartY = headerTopY + 14;
    }

    type ColSpec = {
      id:
        | 'no'
        | 'item'
        | 'nama'
        | 'proposal'
        | 'kelurahan'
        | 'pengelola'
        | 'kontak'
        | 'delivered'
        | 'pending'
        | 'status';
      header: string;
      width: number;
      halign: 'left' | 'center' | 'right';
    };

    const optCols: ColSpec[] = [];
    if (includeProp) {
      optCols.push({ id: 'proposal', header: 'PROPOSAL', width: 22, halign: 'left' });
    }
    if (includeKel) {
      optCols.push({ id: 'kelurahan', header: 'KELURAHAN', width: 20, halign: 'left' });
    }
    if (includePengelola) {
      optCols.push({ id: 'pengelola', header: 'PENGELOLA', width: 18, halign: 'left' });
    }
    if (includeKontak) {
      optCols.push({ id: 'kontak', header: 'KONTAK', width: 19, halign: 'center' });
    }

    const optTotalW = optCols.reduce((s, c) => s + c.width, 0);
    const fixedNoW = 8.5;
    const fixedItemW = 12.5;
    const fixedStatusW = 16.5;
    const namaW = optCols.length >= 2 ? 25 : optCols.length === 1 ? 28 : 32;
    const remainingForSubs = Math.max(
      52,
      PRINTABLE_WIDTH_MM - fixedNoW - fixedItemW - namaW - fixedStatusW - optTotalW
    );
    const deliveredW = Number((remainingForSubs * 0.48).toFixed(2));
    const pendingW = Number((remainingForSubs - deliveredW).toFixed(2));

    const columns: ColSpec[] = [
      { id: 'no', header: 'NO', width: fixedNoW, halign: 'center' },
      { id: 'item', header: 'ITEM', width: fixedItemW, halign: 'center' },
      { id: 'nama', header: 'NAMA KPM', width: namaW, halign: 'left' },
      ...optCols,
      { id: 'delivered', header: 'SUB-ITEM DITERIMA', width: deliveredW, halign: 'left' },
      { id: 'pending', header: 'SUB-ITEM BELUM DITERIMA', width: pendingW, halign: 'left' },
      { id: 'status', header: 'STATUS', width: fixedStatusW, halign: 'center' },
    ];

    const colCount = columns.length;
    const bodyFontSize = colCount <= 6 ? 8.1 : colCount <= 8 ? 7.4 : 6.8;
    const headFontSize = colCount <= 6 ? 7.8 : colCount <= 8 ? 7.2 : 6.6;
    const padY = colCount <= 6 ? 2.1 : 1.75;
    const padX = colCount <= 6 ? 1.8 : 1.3;

    const columnStyles: Record<number, Partial<Styles>> = {};
    columns.forEach((col, idx) => {
      columnStyles[idx] = {
        cellWidth: col.width,
        halign: col.halign,
      };
    });

    const deliveredColIdx = columns.findIndex((c) => c.id === 'delivered');
    const pendingColIdx = columns.findIndex((c) => c.id === 'pending');
    const statusColIdx = columns.findIndex((c) => c.id === 'status');

    type RowMeta = {
      statusKind: 'complete' | 'partial' | 'unstarted' | 'empty';
      hasDelivered: boolean;
      hasPending: boolean;
    };
    const rowMetas: RowMeta[] = [];

    const formatSubLabel = (sub: { baseName: string; name: string; volume: number; satuan: string }) => {
      const base = (sub.baseName || sub.name || '').trim();
      if (sub.volume > 1) {
        return `• ${base} (${sub.volume} ${sub.satuan || 'Unit'})`;
      }
      return `• ${base}`;
    };

    const bodyRows = sectionRecords.map((rec, rowIdx) => {
      const seq = getAbsenSeq(rec.registerCode);
      const absenText = seq < 999999 ? String(seq).padStart(2, '0') : String(rowIdx + 1).padStart(2, '0');
      const domicile = resolveKpmDomicile(rec, proposals, wilayahList);
      const statuses = getKpmSubItemStatusList(rec, items);
      const deliveredList = statuses.filter((s) => s.delivered);
      const pendingList = statuses.filter((s) => !s.delivered);

      const statusKind: RowMeta['statusKind'] =
        statuses.length === 0
          ? 'empty'
          : pendingList.length === 0
            ? 'complete'
            : deliveredList.length > 0
              ? 'partial'
              : 'unstarted';

      rowMetas.push({
        statusKind,
        hasDelivered: deliveredList.length > 0,
        hasPending: pendingList.length > 0,
      });

      const deliveredText =
        statuses.length === 0
          ? '-'
          : deliveredList.length > 0
            ? deliveredList.map(formatSubLabel).join('\n')
            : '-';

      const pendingText =
        statuses.length === 0
          ? '(Belum ada daftar sub-item)'
          : pendingList.length > 0
            ? pendingList.map(formatSubLabel).join('\n')
            : 'Lengkap';

      const statusText =
        statuses.length === 0
          ? '-'
          : `${deliveredList.length}/${statuses.length}\n${
              statusKind === 'complete'
                ? 'Lengkap'
                : statusKind === 'partial'
                  ? 'Sebagian'
                  : 'Belum'
            }`;

      return columns.map((col) => {
        switch (col.id) {
          case 'no':
            return absenText;
          case 'item':
            return rec.item || '-';
          case 'nama':
            return (rec.nama || '-').toUpperCase();
          case 'proposal':
            return (
              (rec.proposal || '').trim() ||
              (rec.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM')
            );
          case 'kelurahan':
            return (domicile.kelurahan || '-').trim() || '-';
          case 'pengelola':
            return (rec.pengelola || '-').trim() || '-';
          case 'kontak':
            return formatPhoneForPdf(rec.kontak) || '-';
          case 'delivered':
            return deliveredText;
          case 'pending':
            return pendingText;
          case 'status':
            return statusText;
          default:
            return '-';
        }
      });
    });

    autoTable(doc, {
      startY: tableStartY,
      margin: {
        top: F4_PDF_MARGINS.top,
        right: F4_PDF_MARGINS.right,
        bottom: F4_PDF_MARGINS.bottom + 7,
        left: F4_PDF_MARGINS.left,
      },
      tableWidth: PRINTABLE_WIDTH_MM,
      head: [columns.map((c) => c.header)],
      body: bodyRows,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: bodyFontSize,
        minCellHeight: 8.5,
        textColor: [15, 23, 42],
        lineColor: [30, 41, 59],
        lineWidth: 0.22,
        valign: 'middle',
        cellPadding: { top: padY, right: padX, bottom: padY, left: padX },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [252, 211, 77],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: headFontSize,
        minCellHeight: 8.5,
        halign: 'center',
        valign: 'middle',
        lineColor: [30, 41, 59],
        lineWidth: 0.25,
        cellPadding: { top: padY + 0.3, right: 1.0, bottom: padY + 0.3, left: 1.0 },
      },
      columnStyles,
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const meta = rowMetas[data.row.index];
        if (!meta) return;
        if (data.column.index === deliveredColIdx) {
          data.cell.styles.textColor = meta.hasDelivered ? [15, 118, 110] : [148, 163, 184];
        } else if (data.column.index === pendingColIdx) {
          if (meta.statusKind === 'complete') {
            data.cell.styles.textColor = [15, 118, 110];
            data.cell.styles.fontStyle = 'bold';
          } else if (meta.hasPending) {
            data.cell.styles.textColor = [180, 83, 9];
          } else {
            data.cell.styles.textColor = [100, 116, 139];
          }
        } else if (data.column.index === statusColIdx) {
          data.cell.styles.fontStyle = 'bold';
          if (meta.statusKind === 'complete') {
            data.cell.styles.textColor = [15, 118, 110];
          } else if (meta.statusKind === 'partial') {
            data.cell.styles.textColor = [180, 83, 9];
          } else if (meta.statusKind === 'unstarted') {
            data.cell.styles.textColor = [190, 18, 60];
          } else {
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
      },
    });

    const sectionTotals = computeChecklistTotalsForRecords(sectionRecords, items);
    const afterTableY = (doc.lastAutoTable?.finalY ?? tableStartY + 20) + 6;
    return renderTotalsRecapBlock({
      totals: sectionTotals,
      heading: recapHeading,
      startY: afterTableY,
    });
  };

  const statusTagLabel =
    statusFilter === 'incomplete'
      ? 'Filter: Belum Lengkap'
      : statusFilter === 'complete'
        ? 'Filter: Sudah Lengkap'
        : 'Semua Status Sub-Item';

  let finalBlockEndY: number = F4_PDF_MARGINS.top;

  if (splitByProposal) {
    interface ChecklistGroup {
      key: string;
      tahun: string;
      proposalName: string;
      label: string;
      isStandalone: boolean;
      records: KpmRecord[];
    }
    const groupMap = new Map<string, ChecklistGroup>();
    for (const rec of sortedRecords) {
      const propName = (rec.proposal || '').trim();
      const tahun = (rec.tahun || '').trim();
      const isStandalone = !propName;
      const label = propName
        ? propName
        : rec.validasi === 'rejected'
          ? 'Arsip Berkas Ditolak'
          : 'Database KPM';
      const key = isStandalone
        ? rec.validasi === 'rejected'
          ? '__ARSIP_DITOLAK__'
          : '__DATABASE_KPM__'
        : `${tahun}::${propName}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.records.push(rec);
      } else {
        groupMap.set(key, {
          key,
          tahun: isStandalone ? '' : tahun,
          proposalName: propName,
          label,
          isStandalone,
          records: [rec],
        });
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;
      if (a.isStandalone && b.isStandalone) {
        if (a.key === b.key) return 0;
        return a.key === '__DATABASE_KPM__' ? -1 : 1;
      }
      const yearCmp = a.tahun.localeCompare(b.tahun);
      if (yearCmp !== 0) return yearCmp;
      const isKecA = isKecamatanProposal(a.proposalName);
      const isKecB = isKecamatanProposal(b.proposalName);
      if (isKecA !== isKecB) return isKecA ? -1 : 1;
      return a.label.localeCompare(b.label, 'id');
    });

    groups.forEach((group, idx) => {
      if (idx > 0) {
        doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
      }
      const secTitle = `Rekap Sub-Item KPM · ${
        group.isStandalone ? group.label : [group.label, group.tahun].filter(Boolean).join(' ')
      }`;
      const secSub = [
        statusTagLabel,
        selectedPengelolaLabel ? `Pengelola: ${selectedPengelolaLabel}` : '',
        `Total: ${group.records.length} KPM`,
      ]
        .filter(Boolean)
        .join('  ·  ');

      finalBlockEndY = renderChecklistSection({
        sectionRecords: group.records,
        sectionTitle: secTitle,
        sectionSubtitle: secSub,
        proposalTitleForAutoKel: group.proposalName,
        recapHeading:
          groups.length > 1
            ? `Rekap Total Sub-Item (${group.label})`
            : 'REKAP TOTAL LISTING SUB-ITEM (SUDAH & BELUM DITERIMA)',
      });
    });

    if (groups.length > 1) {
      const grandTotals = computeChecklistTotalsForRecords(sortedRecords, items);
      finalBlockEndY = renderTotalsRecapBlock({
        totals: grandTotals,
        heading: `REKAP TOTAL KESELURUHAN (${groups.length} PROPOSAL · ${sortedRecords.length} KPM)`,
        startY: finalBlockEndY + 8,
      });
    }
  } else {
    const resolvedSubtitle = [
      subtitle?.trim() || '',
      statusTagLabel,
      `Dicetak: ${formatUploadDateTime(new Date().toISOString())}`,
    ]
      .filter(Boolean)
      .join('  ·  ');

    finalBlockEndY = renderChecklistSection({
      sectionRecords: sortedRecords,
      sectionTitle: title,
      sectionSubtitle: resolvedSubtitle,
      recapHeading: 'REKAP TOTAL LISTING SUB-ITEM (SUDAH & BELUM DITERIMA)',
    });
  }

  drawSignatoryIfEnabled(finalBlockEndY);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · Rekap Sub-Item KPM (${sortedRecords.length} KPM)`,
      F4_PDF_MARGINS.left,
      F4_PAPER_HEIGHT_MM - 5.5
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right,
      F4_PAPER_HEIGHT_MM - 5.5,
      { align: 'right' }
    );
  }

  const result = await saveOrOpenPdfDocument(doc, fileName);
  return { ...result, count: sortedRecords.length };
}

export interface ExportNomorDinsosOptions {
  records: KpmRecord[];
  allRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  provinsiLabel?: string;
  prefixLabel?: string;
  fileName?: string;
}

export async function exportNomorDinsosToPdf({
  records,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  provinsiLabel = 'PROVINSI KALIMANTAN BARAT',
  prefixLabel = 'DINSOS',
  fileName,
}: ExportNomorDinsosOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  // Kertas F4 Folio: 216mm x 330mm (dilipat 2 & dipotong di tengah = 216mm x 165mm per label)
  const PAPER_W = 216;
  const PAPER_H = 330;
  const HALF_H = PAPER_H / 2; // 165mm

  const sourcePool = allRecords && allRecords.length > 0 ? allRecords : records;
  const targetRecords = records.filter(
    (r) => r.validasi === 'accepted' && Boolean((r.proposal || '').trim())
  );

  if (targetRecords.length === 0) {
    throw new Error('Tidak ada KPM berstatus Diterima pada proposal aktif untuk dicetak Nomor DINSOS.');
  }

  const getDinsosNumber = (rec: KpmRecord, fallbackIdx: number): { num: number; label: string } => {
    const slotNo = getKpmSlotNumberInProposal(
      rec,
      sourcePool,
      proposals,
      items,
      wilayahList,
      proposalSlotMap
    );
    const absenNo = getAbsenSeq(rec.registerCode);
    const num =
      slotNo && slotNo > 0
        ? slotNo
        : absenNo < 999999
          ? absenNo
          : fallbackIdx + 1;
    return { num, label: String(num).padStart(2, '0') };
  };

  // Kelompokkan per proposal (tahun + nama proposal) agar nomor & halaman tetap terpisah rapi
  const groups = new Map<string, KpmRecord[]>();
  for (const rec of targetRecords) {
    const key = `${(rec.tahun || '').trim()}::${(rec.proposal || '').trim()}`;
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAPER_W, PAPER_H],
    compress: true,
  });

  const cleanProv = (provinsiLabel || 'PROVINSI KALIMANTAN BARAT').trim().toUpperCase();
  const cleanPrefix = (prefixLabel || 'DINSOS').trim().toUpperCase();
  const centerX = PAPER_W / 2;
  const maxTextW = PAPER_W - 28; // Margin kiri-kanan 14mm (~1.4 cm) agar teks maksimal memenuhi kertas

  const drawCutGuideLine = () => {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([3.5, 2.5], 0);
    doc.line(0, HALF_H, PAPER_W, HALF_H);
    doc.setLineDashPattern([], 0);
  };

  const drawHalfLabel = (halfStartY: number, rec: KpmRecord, numLabel: string) => {
    const tahunText = `TAHUN ${(rec.tahun || '').trim() || new Date().getFullYear()}`;
    const heroText = `${cleanPrefix} ${numLabel}`;

    const dom = resolveKpmDomicile(rec, proposals, wilayahList);
    const rawKel = (rec.kelurahan || dom.kelurahan || '').trim();
    const kelText = rawKel
      ? /^(kelurahan|desa)\s+/i.test(rawKel)
        ? rawKel
        : `Kelurahan ${rawKel}`
      : '';
    const rawKec = (rec.kecamatan || dom.kecamatan || '').replace(/^kecamatan\s+/i, '').trim();
    const kecText = rawKec ? `Kecamatan ${rawKec}` : '';
    const kabText = (rec.kabKota || dom.kabKota || '').trim();

    // 1. Header Provinsi & Tahun (skala otomatis hingga 27pt, muat 1 baris lebar penuh)
    doc.setFont('helvetica', 'bold');
    let headerFontSize = 27;
    doc.setFontSize(headerFontSize);
    while (
      (doc.getTextWidth(cleanProv) > maxTextW || doc.getTextWidth(tahunText) > maxTextW) &&
      headerFontSize > 16
    ) {
      headerFontSize -= 1;
      doc.setFontSize(headerFontSize);
    }

    // 2. Domisili: upayakan setiap baris muat dalam 1 baris di ukuran besar (hingga 26pt)
    const rawDomLines = [kelText, kecText, kabText].filter(Boolean);
    let domFontSize = 26;
    doc.setFontSize(domFontSize);
    while (
      rawDomLines.some((line) => doc.getTextWidth(line) > maxTextW) &&
      domFontSize > 17
    ) {
      domFontSize -= 1;
      doc.setFontSize(domFontSize);
    }
    const domLines: string[] = [];
    for (const line of rawDomLines) {
      const wrapped = doc.splitTextToSize(line, maxTextW) as string[];
      domLines.push(...wrapped);
    }

    // 3. Hero Nomor DINSOS: skala maksimal memenuhi lebar kertas (188mm) & sangat tebal
    let heroFontSize = 110;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(heroFontSize);
    while (doc.getTextWidth(heroText) > maxTextW - 2 && heroFontSize > 36) {
      heroFontSize -= 1;
      doc.setFontSize(heroFontSize);
    }

    // Hitung metrik vertikal agar terpusat persis (center-middle) di area 216mm x 165mm
    const headerCapH = headerFontSize * 0.255;
    const headerLineStep = headerFontSize * 0.43;
    const topBlockH = headerLineStep + headerCapH;

    const heroCapH = heroFontSize * 0.255;

    const domCapH = domFontSize * 0.255;
    const domLineStep = domFontSize * 0.435;
    const bottomBlockH =
      domLines.length > 0 ? (domLines.length - 1) * domLineStep + domCapH : 0;

    let gapAfterHeader = 22;
    let gapBeforeDom = 22;
    const maxAllowedStackH = HALF_H - 26; // Sisakan minimal ~1.3 cm margin atas & bawah
    const fixedContentH = topBlockH + heroCapH + (domLines.length > 0 ? bottomBlockH : 0);
    if (domLines.length > 0 && fixedContentH + gapAfterHeader + gapBeforeDom > maxAllowedStackH) {
      const availableGap = Math.max(18, maxAllowedStackH - fixedContentH);
      gapAfterHeader = availableGap / 2;
      gapBeforeDom = availableGap / 2;
    }

    const totalStackH =
      topBlockH +
      gapAfterHeader +
      heroCapH +
      (domLines.length > 0 ? gapBeforeDom + bottomBlockH : 0);

    const blockTopY = halfStartY + (HALF_H - totalStackH) / 2;

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');

    // Cetak 1. Header Provinsi & Tahun
    doc.setFontSize(headerFontSize);
    const headerLine1Y = blockTopY + headerCapH;
    doc.text(cleanProv, centerX, headerLine1Y, { align: 'center' });
    doc.text(tahunText, centerX, headerLine1Y + headerLineStep, { align: 'center' });

    // Cetak 2. Hero Nomor DINSOS (fill + stroke agar ekstra tebal & tegas saat difoto)
    doc.setFontSize(heroFontSize);
    const heroStrokeW = Math.min(0.95, Math.max(0.45, heroFontSize * 0.0088));
    doc.setLineWidth(heroStrokeW);
    doc.setLineJoin('round');
    const heroBaselineY = blockTopY + topBlockH + gapAfterHeader + heroCapH;
    doc.text(heroText, centerX, heroBaselineY, {
      align: 'center',
      renderingMode: 'fillThenStroke',
    });
    doc.setLineWidth(0.25);

    // Cetak 3. Domisili (Kelurahan / Kecamatan / Kab-Kota)
    if (domLines.length > 0) {
      doc.setFontSize(domFontSize);
      const domStartBaselineY = heroBaselineY + gapBeforeDom + domCapH;
      domLines.forEach((line, lineIdx) => {
        doc.text(line, centerX, domStartBaselineY + lineIdx * domLineStep, { align: 'center' });
      });
    }
  };

  let isFirstPageOverall = true;
  for (const [, groupRecs] of sortedGroups) {
    const withNum = groupRecs
      .map((rec, i) => ({ rec, ...getDinsosNumber(rec, i) }))
      .sort((a, b) => a.num - b.num || a.rec.nama.localeCompare(b.rec.nama, 'id'));

    withNum.forEach((entry, idx) => {
      const slotOnPage = idx % 2;
      if (slotOnPage === 0) {
        if (!isFirstPageOverall) {
          doc.addPage([PAPER_W, PAPER_H], 'portrait');
        }
        isFirstPageOverall = false;
        drawCutGuideLine();
      }
      const halfStartY = slotOnPage === 0 ? 0 : HALF_H;
      drawHalfLabel(halfStartY, entry.rec, entry.label);
    });
  }

  const defaultName = `Nomor_DINSOS_${targetRecords.length}_Label`;
  const res = await saveOrOpenPdfDocument(doc, fileName || defaultName);
  return { ...res, count: targetRecords.length };
}

export async function exportTroubleshootingToPdf(
  result: TroubleshootingReconcileResult,
  options?: {
    fileName?: string;
    reportTemplate?: ReportTemplateConfig;
  }
): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  // Kertas F4 Landscape (330mm x 216mm) agar 7 kolom lengkap beserta Keterangan Perubahan terbaca lega & siap cetak
  const PAGE_W = 330;
  const PAGE_H = 216;
  const MARGIN = { top: 12, right: 12, bottom: 13, left: 12 };
  const PRINT_W = PAGE_W - MARGIN.left - MARGIN.right; // 306mm

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PAGE_W, PAGE_H],
    compress: true,
  }) as AutoTableDoc;

  const tpl = options?.reportTemplate;
  const loadedLogo = tpl?.enabled
    ? await loadSingleImageForPdf((tpl.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL)
    : null;

  let cursorY = MARGIN.top;

  // Kop Surat opsional jika diaktifkan di Pengaturan Template Laporan
  if (tpl?.enabled) {
    const logoSpaceW = loadedLogo ? 16 : 0;
    if (loadedLogo) {
      const ratio = loadedLogo.width / Math.max(loadedLogo.height, 1);
      let drawW = 13;
      let drawH = 16;
      if (ratio > drawW / drawH) {
        drawH = drawW / ratio;
      } else {
        drawW = drawH * ratio;
      }
      doc.addImage(
        loadedLogo.dataUrl,
        loadedLogo.format,
        MARGIN.left + (logoSpaceW - drawW) / 2,
        cursorY,
        drawW,
        drawH
      );
    }

    const centerX = MARGIN.left + logoSpaceW + (PRINT_W - logoSpaceW) / 2;
    let textY = cursorY + 4;
    if (tpl.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(tpl.orgHeaderLine1.trim().toUpperCase(), centerX, textY, { align: 'center' });
      textY += 4.8;
    }
    if (tpl.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 118, 110);
      doc.text(tpl.orgHeaderLine2.trim(), centerX, textY, { align: 'center' });
      textY += 4.5;
    }
    if (tpl.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(tpl.orgAddress.trim(), centerX, textY, { align: 'center' });
      textY += 4;
    }
    cursorY = Math.max(textY + 1, loadedLogo ? cursorY + 17 : textY + 1);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.45);
    doc.line(MARGIN.left, cursorY, PAGE_W - MARGIN.right, cursorY);
    cursorY += 5;
  }

  // Judul Dokumen Resmi Hasil Penyesuaian
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text('HASIL REKONSILIASI & PENYESUAIAN URUTAN KPM TERHADAP KUOTA BAST DINAS', MARGIN.left, cursorY + 3.5);
  cursorY += 7.5;

  const generatedDate = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(result.generatedAt || Date.now()));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Proposal: ${result.proposalTitle}   ·   BAST Dinas: ${result.bastTitle}   ·   Dicetak: ${generatedDate}`,
    MARGIN.left,
    cursorY
  );
  cursorY += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 118, 110);
  doc.text(
    `Ringkasan: Kuota BAST ${result.totals.kuotaBast} Unit  |  Usulan Proposal ${result.totals.usulanKpm} KPM  |  Terisi ${result.totals.terisi} KPM  |  Baris Kosong ${result.totals.barisKosong}  |  Dikeluarkan (Over Limit) ${result.totals.dikeluarkan}`,
    MARGIN.left,
    cursorY
  );
  cursorY += 6;

  // BAGIAN 1: TABEL UTAMA DAFTAR KPM HASIL PENYESUAIAN KUOTA BAST
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `1. Tabel Utama Daftar KPM Hasil Penyesuaian Kuota BAST (No. 01 s.d. ${String(
      result.totals.kuotaBast
    ).padStart(2, '0')})`,
    MARGIN.left,
    cursorY
  );
  cursorY += 2.8;

  const mainBody = result.mainRows.map((r) => [
    r.noUrutText,
    r.kodeItem,
    r.isEmpty ? '-' : r.nama,
    r.isEmpty ? '-' : r.nik,
    r.isEmpty ? '-' : r.alamat,
    r.isEmpty ? '-' : r.pengelola,
    r.keterangan,
  ]);

  autoTable(doc, {
    startY: cursorY,
    margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
    head: [
      [
        'No. Urut',
        'Kode Item',
        'Nama Penerima (KPM)',
        'NIK',
        'Alamat & Kelurahan',
        'Pengelola',
        'Keterangan Perubahan',
      ],
    ],
    body: mainBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.6,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 38, halign: 'left', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 68, halign: 'left' },
      5: { cellWidth: 25, halign: 'left' },
      6: { cellWidth: 116, halign: 'left' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const rowData = result.mainRows[hookData.row.index];
        if (rowData?.isEmpty) {
          hookData.cell.styles.fillColor = [254, 252, 232]; // #FEFCE8
          if (hookData.column.index >= 2 && hookData.column.index <= 5) {
            hookData.cell.styles.textColor = [148, 163, 184];
            hookData.cell.styles.halign = 'center';
          } else if (hookData.column.index === 6) {
            hookData.cell.styles.textColor = [146, 64, 14];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  // BAGIAN 2: TABEL TERPISAH KPM YANG DIKELUARKAN (OVER LIMIT BAST)
  let nextY = (doc.lastAutoTable?.finalY ?? cursorY) + 8;
  if (nextY + 26 > PAGE_H - MARGIN.bottom) {
    doc.addPage([PAGE_W, PAGE_H], 'landscape');
    nextY = MARGIN.top + 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    '2. Daftar KPM yang Dikeluarkan (Melebihi Kuota/Limit BAST)',
    MARGIN.left,
    nextY
  );
  nextY += 2.8;

  if (result.excludedRows.length === 0) {
    autoTable(doc, {
      startY: nextY,
      margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
      head: [
        [
          'No.',
          'No. Asal Proposal',
          'Kode Item',
          'Nama Penerima (KPM)',
          'Alamat & Kelurahan',
          'Pengelola',
          'Keterangan Alasan Pengeluaran',
        ],
      ],
      body: [
        [
          {
            content: `Tidak ada KPM yang dikeluarkan — seluruh ${result.totals.usulanKpm} KPM usulan Proposal masuk dalam batas kuota BAST Dinas.`,
            colSpan: 7,
            styles: { halign: 'center', textColor: [15, 118, 110], fontStyle: 'bold' },
          },
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.5,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [180, 83, 9],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
    });
  } else {
    autoTable(doc, {
      startY: nextY,
      margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
      head: [
        [
          'No.',
          'No. Asal Proposal',
          'Kode Item',
          'Nama Penerima (KPM)',
          'Alamat & Kelurahan',
          'Pengelola',
          'Keterangan Alasan Pengeluaran',
        ],
      ],
      body: result.excludedRows.map((r) => [
        r.noText,
        r.noAsalProposal,
        r.kodeItem,
        r.nama,
        r.alamat,
        r.pengelola,
        r.keterangan,
      ]),
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [190, 18, 60],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.6,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 42, halign: 'left', fontStyle: 'bold' },
        4: { cellWidth: 74, halign: 'left' },
        5: { cellWidth: 26, halign: 'left' },
        6: { cellWidth: 113, halign: 'left' },
      },
    });
  }

  // BAGIAN 3: SATU TABEL REKAPITULASI PERBANDINGAN KUOTA ITEM (BAST VS PROPOSAL)
  let recapY = (doc.lastAutoTable?.finalY ?? nextY) + 9;
  const estimatedRecapHeight = 22 + (result.itemComparisons.length + 1) * 7;
  if (recapY + estimatedRecapHeight > PAGE_H - MARGIN.bottom) {
    doc.addPage([PAGE_W, PAGE_H], 'landscape');
    recapY = MARGIN.top + 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Rekapitulasi Perbandingan Kuota Item (BAST vs Proposal)', MARGIN.left, recapY);
  recapY += 2.8;

  const recapRows = result.itemComparisons.map((item) => [
    item.kodeItem,
    item.rincianBarangBast,
    String(item.kuotaBast),
    String(item.usulanKpm),
    String(item.terisi),
    String(item.barisKosong),
    String(item.dikeluarkan),
  ]);

  recapRows.push([
    'TOTAL',
    `Seluruh Paket Item (${result.itemComparisons.length} Kode)`,
    String(result.totals.kuotaBast),
    String(result.totals.usulanKpm),
    String(result.totals.terisi),
    String(result.totals.barisKosong),
    String(result.totals.dikeluarkan),
  ]);

  autoTable(doc, {
    startY: recapY,
    margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
    head: [
      [
        'Kode Item',
        'Rincian Paket Barang BAST',
        'Kuota BAST',
        'Usulan KPM',
        'Terisi (Masuk)',
        'Baris Kosong',
        'Dikeluarkan (Over Limit)',
      ],
    ],
    body: recapRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.2, right: 2.4, bottom: 2.2, left: 2.4 },
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 132, halign: 'left' },
      2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 28, halign: 'center' },
      6: { cellWidth: 36, halign: 'center' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.row.index === recapRows.length - 1) {
        hookData.cell.styles.fillColor = [241, 245, 249];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [15, 23, 42];
      }
    },
  });

  // Footer nomor halaman di tiap halaman
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · Rekonsiliasi KPM & BAST Dinas   ·   Halaman ${p} dari ${pageCount}`,
      PAGE_W - MARGIN.right,
      PAGE_H - 5,
      { align: 'right' }
    );
  }

  const defaultFileName = `Troubleshooting_Rekonsiliasi_${result.proposalTitle}`;
  const saved = await saveOrOpenPdfDocument(doc, options?.fileName || defaultFileName);
  return { ...saved, count: result.mainRows.length };
}

export interface ExportRabPdfOptions {
  judul: string;
  summary: RabCalculatedSummary;
  fileName?: string;
}

export async function exportRabToPdf(
  options: ExportRabPdfOptions
): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const { summary } = options;
  const cleanTitle = (options.judul || 'RENCANA ANGGARAN BIAYA (RAB)').trim().toUpperCase();

  // A4 Portrait (210mm x 297mm)
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = { top: 14, right: 14, bottom: 14, left: 14 };
  const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right; // 182mm

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  }) as AutoTableDoc;

  // Judul dokumen rata tengah tebal (konsisten dengan PDF referensi)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(cleanTitle, CONTENT_W) as string[];
  let cursorY = MARGIN.top + 2;
  titleLines.forEach((line) => {
    doc.text(line, PAGE_W / 2, cursorY, { align: 'center' });
    cursorY += 5.2;
  });
  cursorY += 2;

  // =========================================================================
  // BAGIAN 1: TABEL REKAPITULASI SELURUH BARANG (DIKELOMPOKKAN PER MASTER ITEM)
  // =========================================================================
  interface RecapRowMeta {
    isSpacer: boolean;
    isBalancer: boolean;
    isZero: boolean;
  }

  const recapBody: Array<Array<string | { content: string; colSpan?: number; styles?: Partial<Styles> }>> = [];
  const recapMeta: RecapRowMeta[] = [];

  summary.packages.forEach((pkg, pkgIdx) => {
    if (pkgIdx > 0) {
      recapBody.push([
        {
          content: '',
          colSpan: 5,
          styles: {
            fillColor: [255, 255, 255],
            minCellHeight: 3.2,
            cellPadding: 0,
            lineWidth: { top: 0.25, right: 0, bottom: 0.25, left: 0 },
            lineColor: [15, 23, 42],
          },
        },
      ]);
      recapMeta.push({ isSpacer: true, isBalancer: false, isZero: false });
    }

    pkg.subItems.forEach((sub) => {
      const isZero = sub.jumlahHarga === 0;
      recapBody.push([
        sub.namaBarang,
        `${sub.volumePerPaket} ${sub.satuan}`,
        formatRupiahCurrency(sub.hargaSatuan, { withDecimals: true }),
        `${sub.jumlahVolume} ${sub.satuan}`,
        formatRupiahCurrency(sub.jumlahHarga, { zeroAsDash: true }),
      ]);
      recapMeta.push({
        isSpacer: false,
        isBalancer: sub.isBalancer,
        isZero,
      });
    });
  });

  autoTable(doc, {
    startY: cursorY,
    margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
    head: [['Nama Barang', 'Volume Satuan', 'Harga Satuan', 'Jumlah Volume', 'Jumlah Harga']],
    body: recapBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: { top: 1.5, right: 2.2, bottom: 1.5, left: 2.2 },
      lineColor: [15, 23, 42],
      lineWidth: 0.22,
      textColor: [15, 23, 42],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.4,
      halign: 'center',
      lineColor: [15, 23, 42],
      lineWidth: 0.28,
    },
    columnStyles: {
      0: { cellWidth: 54, halign: 'left' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 36, halign: 'right' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 42, halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return;
      const meta = recapMeta[hookData.row.index];
      if (!meta || meta.isSpacer) return;
      if (hookData.column.index === 2 && meta.isBalancer) {
        hookData.cell.styles.textColor = [220, 38, 38]; // #DC2626
        hookData.cell.styles.fontStyle = 'bold';
      }
      if (hookData.column.index === 4 && meta.isZero) {
        hookData.cell.styles.textColor = [100, 116, 139];
      }
    },
  });

  // Ringkasan Total & Total Penerima di bawah Tabel 1
  let summaryY = (doc.lastAutoTable?.finalY ?? cursorY) + 3.5;
  if (summaryY + 24 > PAGE_H - MARGIN.bottom) {
    doc.addPage('a4', 'portrait');
    summaryY = MARGIN.top;
  }

  autoTable(doc, {
    startY: summaryY,
    margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
    body: [
      [
        {
          content: 'Total',
          colSpan: 4,
          styles: { halign: 'center', fontStyle: 'bold', textColor: [15, 23, 42] },
        },
        {
          content: formatRupiahCurrency(summary.totalTerhitung, { withDecimals: true }),
          styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
        },
      ],
      [
        {
          content: 'Total Penerima',
          colSpan: 3,
          styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252] },
        },
        {
          content: `${summary.totalPenerima} Orang`,
          styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252] },
        },
        {
          content: formatRupiahCurrency(summary.totalAnggaranTarget),
          styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] },
        },
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.6,
      cellPadding: { top: 2, right: 2.2, bottom: 2, left: 2.2 },
      lineColor: [15, 23, 42],
      lineWidth: 0.28,
      textColor: [15, 23, 42],
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: 24 },
      2: { cellWidth: 36 },
      3: { cellWidth: 26 },
      4: { cellWidth: 42 },
    },
  });

  // =========================================================================
  // BAGIAN 2: TABEL RINCIAN PER MASTER ITEM (PER PAKET)
  // =========================================================================
  let pkgCursorY = (doc.lastAutoTable?.finalY ?? summaryY) + 8;

  // Pastikan Bagian 2 dimulai rapi (jika ruang tersisa < 48mm, pindah halaman baru)
  if (pkgCursorY + 48 > PAGE_H - MARGIN.bottom) {
    doc.addPage('a4', 'portrait');
    pkgCursorY = MARGIN.top;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('RINCIAN ANGGARAN PER PAKET MASTER ITEM', MARGIN.left, pkgCursorY);
  pkgCursorY += 3.2;

  summary.packages.forEach((pkg) => {
    const estimatedBoxHeight = 14 + (pkg.subItems.length + 1) * 6.4;
    if (pkgCursorY + estimatedBoxHeight > PAGE_H - MARGIN.bottom) {
      doc.addPage('a4', 'portrait');
      pkgCursorY = MARGIN.top;
    }

    const pkgBody: Array<Array<string | { content: string; rowSpan?: number; colSpan?: number; styles?: Partial<Styles> }>> = [];
    const balancerFlags: boolean[] = [];

    pkg.subItems.forEach((sub, subIdx) => {
      const row: Array<string | { content: string; rowSpan?: number; colSpan?: number; styles?: Partial<Styles> }> = [
        sub.namaBarang,
        `${sub.volumePerPaket} ${sub.satuan}`,
        formatRupiahCurrency(sub.hargaSatuan, { withDecimals: true }),
        `${sub.jumlahVolume} ${sub.satuan}`,
        formatRupiahCurrency(sub.jumlahHarga, { zeroAsDash: true }),
      ];

      if (subIdx === 0) {
        row.push({
          content: `${pkg.jumlahPenerima} Orang`,
          rowSpan: pkg.subItems.length,
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            textColor: pkg.jumlahPenerima > 0 ? [15, 23, 42] : [148, 163, 184],
          },
        });
      }

      pkgBody.push(row);
      balancerFlags.push(sub.isBalancer);
    });

    // Footer Total per paket Master Item
    pkgBody.push([
      {
        content: `Total (${pkg.kode} · ${pkg.namaPaket})`,
        colSpan: 4,
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
        },
      },
      {
        content: formatRupiahCurrency(pkg.subtotalHarga, { zeroAsDash: true }),
        styles: {
          halign: 'right',
          fontStyle: 'bold',
          fillColor: [248, 250, 252],
          textColor: pkg.subtotalHarga > 0 ? [15, 23, 42] : [100, 116, 139],
        },
      },
      {
        content: '',
        styles: {
          fillColor: [248, 250, 252],
        },
      },
    ]);

    autoTable(doc, {
      startY: pkgCursorY,
      margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
      head: [
        [
          'Nama & Jenis Barang',
          'Volume Satuan',
          'Harga Satuan',
          'Jumlah Volume',
          'Jumlah Harga',
          'Jumlah Penerima',
        ],
      ],
      body: pkgBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
        lineColor: [15, 23, 42],
        lineWidth: 0.22,
        textColor: [15, 23, 42],
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        lineColor: [15, 23, 42],
        lineWidth: 0.25,
      },
      columnStyles: {
        0: { cellWidth: 48, halign: 'left' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 34, halign: 'right' },
        5: { cellWidth: 24, halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== 'body') return;
        const idx = hookData.row.index;
        if (idx < balancerFlags.length && hookData.column.index === 2 && balancerFlags[idx]) {
          hookData.cell.styles.textColor = [220, 38, 38];
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });

    pkgCursorY = (doc.lastAutoTable?.finalY ?? pkgCursorY) + 4.5;
  });

  // Baris Grand Total akhir dengan highlight merah muda lembut (sesuai PDF referensi)
  if (pkgCursorY + 14 > PAGE_H - MARGIN.bottom) {
    doc.addPage('a4', 'portrait');
    pkgCursorY = MARGIN.top;
  }

  autoTable(doc, {
    startY: pkgCursorY,
    margin: { top: MARGIN.top, right: MARGIN.right, bottom: MARGIN.bottom, left: MARGIN.left },
    body: [
      [
        {
          content: 'TOTAL',
          colSpan: 4,
          styles: {
            halign: 'center',
            fontStyle: 'bold',
            fontSize: 9.2,
            fillColor: [254, 205, 211], // #FECDD3
            textColor: [15, 23, 42],
          },
        },
        {
          content: formatRupiahCurrency(summary.totalTerhitung),
          colSpan: 2,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 9.2,
            fillColor: [254, 205, 211],
            textColor: [185, 28, 28], // #B91C1C
          },
        },
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      cellPadding: { top: 2.3, right: 2.5, bottom: 2.3, left: 2.5 },
      lineColor: [15, 23, 42],
      lineWidth: 0.3,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 22 },
      2: { cellWidth: 32 },
      3: { cellWidth: 22 },
      4: { cellWidth: 34 },
      5: { cellWidth: 24 },
    },
  });

  // Nomor halaman kecil di pojok kanan bawah
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · RAB ${summary.totalPenerima} KPM (Rp ${formatRupiahPlain(summary.totalTerhitung)})   ·   Halaman ${p} dari ${totalPages}`,
      PAGE_W - MARGIN.right,
      PAGE_H - 6,
      { align: 'right' }
    );
  }

  const safeBudgetLabel = formatRupiahPlain(summary.totalAnggaranTarget || summary.totalTerhitung);
  const defaultFileName = `RAB_${summary.totalPenerima}_KPM_Total_${safeBudgetLabel}`;
  const saved = await saveOrOpenPdfDocument(doc, options.fileName || defaultFileName);
  return { ...saved, count: summary.totalPenerima };
}

