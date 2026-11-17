import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { jsPDF } from 'jspdf';
import autoTable, { Styles } from 'jspdf-autotable';
import QRCode from 'qrcode';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_KOP_LOGO_URL,
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalBastMap,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  ScheduleEventItem,
  WilayahKabKota,
} from '../types/kpm';
import {
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
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalDomicile,
  resolveProposalKecamatanCategory,
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
  | 'pengelola';

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
    minWidthMm: 8.5,
    halign: 'center',
  },
  {
    key: 'nikKtp',
    pdfHeader: 'NIK KTP',
    uiLabel: 'NIK KTP',
    defaultEnabled: false,
    baseWidthMm: 27,
    minWidthMm: 22.5,
    halign: 'center',
  },
  {
    key: 'nikKk',
    pdfHeader: 'NIK KK',
    uiLabel: 'NIK KK',
    defaultEnabled: false,
    baseWidthMm: 27,
    minWidthMm: 22.5,
    halign: 'center',
  },
  {
    key: 'item',
    pdfHeader: 'ITEM',
    uiLabel: 'Item',
    defaultEnabled: true,
    baseWidthMm: 13.5,
    minWidthMm: 11.5,
    halign: 'center',
  },
  {
    key: 'desil',
    pdfHeader: 'DESIL',
    uiLabel: 'Desil',
    defaultEnabled: true,
    baseWidthMm: 12,
    minWidthMm: 10,
    halign: 'center',
  },
  {
    key: 'nama',
    pdfHeader: 'NAMA',
    uiLabel: 'Nama',
    defaultEnabled: true,
    baseWidthMm: 36,
    minWidthMm: 23,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'alamat',
    pdfHeader: 'ALAMAT',
    uiLabel: 'Alamat',
    defaultEnabled: true,
    baseWidthMm: 48,
    minWidthMm: 28,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'rtRw',
    pdfHeader: 'RT / RW',
    uiLabel: 'RT / RW',
    defaultEnabled: true,
    baseWidthMm: 18,
    minWidthMm: 15,
    halign: 'center',
  },
  {
    key: 'administrasi',
    pdfHeader: 'ADMINISTRASI',
    uiLabel: 'Administrasi',
    description: 'Status pembayaran administrasi (Sudah Bayar / Belum Bayar)',
    defaultEnabled: false,
    baseWidthMm: 23,
    minWidthMm: 18,
    halign: 'center',
  },
  {
    key: 'proposal',
    pdfHeader: 'PROPOSAL',
    uiLabel: 'Proposal',
    description: 'Nama proposal atau status standalone',
    defaultEnabled: false,
    baseWidthMm: 30,
    minWidthMm: 20,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'kelurahan',
    pdfHeader: 'KELURAHAN',
    uiLabel: 'Kelurahan',
    defaultEnabled: false,
    baseWidthMm: 25,
    minWidthMm: 17,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'kecamatan',
    pdfHeader: 'KECAMATAN',
    uiLabel: 'Kecamatan',
    defaultEnabled: false,
    baseWidthMm: 25,
    minWidthMm: 17,
    flexible: true,
    halign: 'left',
  },
  {
    key: 'kontak',
    pdfHeader: 'KONTAK',
    uiLabel: 'Kontak',
    defaultEnabled: true,
    baseWidthMm: 25,
    minWidthMm: 20,
    halign: 'center',
  },
  {
    key: 'pengelola',
    pdfHeader: 'PENGELOLA',
    uiLabel: 'Pengelola',
    defaultEnabled: true,
    baseWidthMm: 26,
    minWidthMm: 18,
    flexible: true,
    halign: 'center',
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

export function buildKpmQrUrl(record: Pick<KpmRecord, 'id' | 'registerCode'>): string {
  const envPublic = (import.meta.env?.VITE_PUBLIC_APP_URL as string | undefined)
    ?.trim()
    .replace(/\/+$/, '');
  let baseUrl = envPublic || 'https://masdeta.pages.dev';
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    if (
      /^https?:\/\//i.test(origin) &&
      !origin.includes('localhost') &&
      !origin.includes('127.0.0.1')
    ) {
      baseUrl = origin.replace(/\/+$/, '');
    }
  }
  const token = encodeURIComponent(record.id || record.registerCode || '');
  return `${baseUrl}/?kpm=${token}`;
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

export function formatScheduleDateTimeForCoupon(targetDate: string, targetTime?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((targetDate || '').trim());
  let dateLabel = (targetDate || '').trim();
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(dt.getTime())) {
      const dayName = INDONESIAN_WEEKDAYS[dt.getDay()] || 'Senin';
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
    if ((ev.location || '').trim()) s += 30;
    if ((ev.footerNote || '').trim()) s += 10;
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
    return { ...fallbackConfig };
  }

  const autoJadwal = formatScheduleDateTimeForCoupon(
    matchedSchedule.targetDate,
    matchedSchedule.targetTime
  );
  const autoLokasi = (matchedSchedule.location || '').trim();
  const autoFooter =
    (matchedSchedule.footerNote || '').trim() || (matchedSchedule.notes || '').trim();

  return {
    jadwal: autoJadwal || fallbackConfig.jadwal || '',
    lokasi: autoLokasi || fallbackConfig.lokasi || '',
    footerText:
      autoFooter || fallbackConfig.footerText || DEFAULT_COUPON_CONFIG.footerText,
    matchedSchedule,
  };
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

  // Jika 9-10 kolom terpilih: skalakan proporsional dengan tetap menjaga minWidthMm tiap kolom
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
}: ExportKpmTablePdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  // Selalu sertakan 4 kolom wajib + add-on terpilih hingga maksimal 10 kolom total
  const mergedKeys = Array.from(new Set([...MANDATORY_PDF_COLUMN_KEYS, ...selectedColumns]));
  const activeCols = PDF_COLUMN_DEFINITIONS.filter((c) => mergedKeys.includes(c.key)).slice(
    0,
    MAX_PDF_TOTAL_COLUMNS
  );

  // Urutkan data KPM berdasarkan urutan hierarki item & nomor absen
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

  let headerTopY: number = F4_PDF_MARGINS.top;
  if (reportTemplate?.enabled) {
    const reportLogoUrl = (reportTemplate.kopLogoDataUrl || '').trim() || DEFAULT_KOP_LOGO_URL;
    const loadedReportLogo = reportLogoUrl ? await loadSingleImageForPdf(reportLogoUrl) : null;
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
    doc.line(F4_PDF_MARGINS.left, headerTopY + 1, F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right, headerTopY + 1);
    doc.setLineWidth(0.2);
    doc.line(F4_PDF_MARGINS.left, headerTopY + 2.1, F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right, headerTopY + 2.1);
    headerTopY += 5;
  }

  // Header Dokumen
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(title.trim() || 'Daftar Calon KPM', F4_PDF_MARGINS.left, headerTopY + 6);

  let tableStartY = headerTopY + 11;
  if (subtitle && subtitle.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(subtitle.trim(), F4_PDF_MARGINS.left, headerTopY + 11);
    tableStartY = headerTopY + 15;
  }

  const colWidths = computeScaledColumnWidths(activeCols);
  const colCount = activeCols.length;
  // Skala ukuran huruf, tinggi baris minimum, dan padding secara adaptif agar tabel selalu proporsional & tidak dempetan
  const bodyFontSize = colCount <= 6 ? 9.2 : colCount <= 8 ? 8.6 : colCount === 9 ? 7.9 : 7.3;
  const headFontSize = colCount <= 6 ? 9.0 : colCount <= 8 ? 8.4 : colCount === 9 ? 7.8 : 7.2;
  const bodyMinCellHeight = colCount <= 6 ? 10.5 : colCount <= 8 ? 9.2 : colCount === 9 ? 8.4 : 7.8;
  const headMinCellHeight = colCount <= 8 ? 9.5 : 8.5;
  const padY = colCount <= 6 ? 3.0 : colCount <= 8 ? 2.5 : 2.1;
  const padX = colCount <= 8 ? 1.8 : 1.3;

  const columnStyles: Record<number, Partial<Styles>> = {};
  activeCols.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: colWidths[idx],
      halign: col.halign,
    };
  });

  const headRow = activeCols.map((c) => c.pdfHeader);
  const bodyRows = sortedRecords.map((rec, rowIdx) => {
    const seq = getAbsenSeq(rec.registerCode);
    const absenText = seq < 999999 ? String(seq).padStart(2, '0') : String(rowIdx + 1).padStart(2, '0');
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
          return paid > 0
            ? `Sudah Bayar\n${formatRupiah(paid).replace(/\u00A0/g, ' ')}`
            : 'Belum Bayar';
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
      cellPadding: { top: padY + 0.3, right: 1.2, bottom: padY + 0.3, left: 1.2 },
    },
    columnStyles,
  });

  // Ringkasan DAFTAR ITEM & PENGELOLA di bawah tabel (sesuai halaman akhir referensi PDF)
  if (includeSummary && sortedRecords.length > 0) {
    const itemMap = new Map<string, { count: number; rank: number }>();
    const pengelolaMap = new Map<string, number>();

    for (const rec of sortedRecords) {
      const code = rec.item || '-';
      const existingItem = itemMap.get(code);
      const rank = getItemHierarchyRank(code, rec.tahun, items);
      if (existingItem) {
        existingItem.count += 1;
        existingItem.rank = Math.min(existingItem.rank, rank);
      } else {
        itemMap.set(code, { count: 1, rank });
      }

      const peng = (rec.pengelola || 'Tanpa Pengelola').trim();
      pengelolaMap.set(peng, (pengelolaMap.get(peng) || 0) + 1);
    }

    const itemEntries = Array.from(itemMap.entries()).sort((a, b) => {
      if (a[1].rank !== b[1].rank) return a[1].rank - b[1].rank;
      return a[0].localeCompare(b[0], 'id');
    });
    const pengelolaEntries = Array.from(pengelolaMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'id')
    );

    const maxLines = Math.max(itemEntries.length, pengelolaEntries.length);
    const neededHeight = 14 + maxLines * 4.5;
    let cursorY = (doc.lastAutoTable?.finalY ?? tableStartY) + 9;

    if (cursorY + neededHeight > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom) {
      doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
      cursorY = F4_PDF_MARGINS.top + 6;
    }

    const leftColX = F4_PDF_MARGINS.left;
    const rightColX = F4_PDF_MARGINS.left + 58;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('DAFTAR ITEM :', leftColX, cursorY);
    doc.text('PENGELOLA :', rightColX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lineStep = 4.6;

    itemEntries.forEach(([code, meta], idx) => {
      doc.text(`- ${code} : ${meta.count}`, leftColX, cursorY + 6 + idx * lineStep);
    });

    pengelolaEntries.forEach(([name, cnt], idx) => {
      doc.text(`- ${name} : ${cnt}`, rightColX, cursorY + 6 + idx * lineStep);
    });

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

    const resolvedUrl =
      url.startsWith('/') && !url.startsWith('//')
        ? `${window.location.origin}${url}`
        : url;

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

export async function exportSingleKpmToPdf({
  record,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
}: ExportSingleKpmPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  // Ukuran kertas Full A4 Portrait (210mm x 297mm)
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const A4_MARGIN = { top: 12, right: 14, bottom: 12, left: 14 };
  const A4_PRINT_WIDTH = A4_WIDTH_MM - A4_MARGIN.left - A4_MARGIN.right; // 182mm

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

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

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(buildKpmQrUrl(record), {
      width: 180,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    qrDataUrl = '';
  }

  // =========================================================================
  // 1. HEADER DOKUMEN A4 (TANPA BINGKAI KARTU ROUNDED)
  // =========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PROFIL DATA CALON KPM', A4_MARGIN.left, A4_MARGIN.top + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Kode Register: ${record.registerCode || '-'}   ·   Tahun Anggaran: ${record.tahun}`,
    A4_MARGIN.left,
    A4_MARGIN.top + 11.5
  );

  const rightTextEdge = qrDataUrl ? A4_WIDTH_MM - A4_MARGIN.right - 19 : A4_WIDTH_MM - A4_MARGIN.right;
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

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', A4_WIDTH_MM - A4_MARGIN.right - 16, A4_MARGIN.top - 1, 16, 16);
  }

  const dividerY = A4_MARGIN.top + 16;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.line(A4_MARGIN.left, dividerY, A4_WIDTH_MM - A4_MARGIN.right, dividerY);

  // =========================================================================
  // 2. BLOK ATAS: FOTO PROPORSIONAL (KIRI) + IDENTITAS CALON PENERIMA (KANAN)
  // =========================================================================
  const topBlockY = dividerY + 5;
  const photoW = 54;
  const photoH = 72; // Rasio 3:4 standar foto resmi
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
    doc.setFontSize(16);
    doc.setTextColor(148, 163, 184);
    doc.text(initials || 'KPM', photoX + photoW / 2, topBlockY + photoH / 2 - 2, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      heroPhotoDoc ? 'Foto tersimpan di Drive' : 'Belum ada foto',
      photoX + photoW / 2,
      topBlockY + photoH / 2 + 6,
      { align: 'center' }
    );
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    heroPhotoMeta?.label || 'Foto KPM',
    photoX + photoW / 2,
    topBlockY + photoH + 4.2,
    { align: 'center' }
  );

  const identityGap = 5;
  const identityX = photoX + photoW + identityGap;
  const identityW = A4_PRINT_WIDTH - photoW - identityGap; // 123mm

  autoTable(doc, {
    startY: topBlockY,
    margin: { ...A4_MARGIN, left: identityX },
    tableWidth: identityW,
    head: [['01. IDENTITAS & DOMISILI', 'KETERANGAN']],
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
      fontSize: 9.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.35, right: 2.5, bottom: 2.35, left: 2.5 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.2,
      lineColor: [15, 118, 110],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
      1: { cellWidth: identityW - 42 },
    },
  });

  // =========================================================================
  // 3. BLOK TENGAH: DATA ALAMAT, USULAN, BANTUAN & VALIDASI (FULL WIDTH A4)
  // =========================================================================
  const afterTopY = Math.max(topBlockY + photoH + 8, (doc.lastAutoTable?.finalY ?? topBlockY + 72) + 5);

  autoTable(doc, {
    startY: afterTopY,
    margin: A4_MARGIN,
    tableWidth: A4_PRINT_WIDTH,
    head: [['02. DATA ALAMAT, USULAN & VALIDASI', 'KETERANGAN']],
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
      fontSize: 9.3,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.6, right: 3, bottom: 2.6, left: 3 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9.3,
      lineColor: [148, 163, 184],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
      1: { cellWidth: A4_PRINT_WIDTH - 48 },
    },
  });

  // =========================================================================
  // 4. BLOK BAWAH 1: RINCIAN SUB-ITEM BANTUAN
  // =========================================================================
  const afterMidY = (doc.lastAutoTable?.finalY ?? afterTopY + 68) + 5.5;

  autoTable(doc, {
    startY: afterMidY,
    margin: A4_MARGIN,
    tableWidth: A4_PRINT_WIDTH,
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
      fontSize: 9,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.4, right: 2.5, bottom: 2.4, left: 2.5 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9,
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

  // =========================================================================
  // 5. BLOK BAWAH 2: KELENGKAPAN DOKUMEN LAPANGAN (2 KOLOM RINGKAS)
  // =========================================================================
  const afterSubY = (doc.lastAutoTable?.finalY ?? afterMidY + 30) + 5.5;

  autoTable(doc, {
    startY: afterSubY,
    margin: A4_MARGIN,
    tableWidth: A4_PRINT_WIDTH,
    head: [['04. KELENGKAPAN DOKUMEN', 'STATUS', 'DOKUMEN LAINNYA', 'STATUS']],
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
      fontSize: 8.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.3, right: 2.5, bottom: 2.3, left: 2.5 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.8,
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

  // =========================================================================
  // 6. FOOTER HALAMAN A4
  // =========================================================================
  const footerLineY = A4_HEIGHT_MM - A4_MARGIN.bottom - 5;
  const lastTableEnd = (doc.lastAutoTable?.finalY ?? afterSubY + 28) + 4;
  const effectiveFooterY = Math.max(footerLineY, Math.min(A4_HEIGHT_MM - 10, lastTableEnd + 4));

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(A4_MARGIN.left, effectiveFooterY - 3.5, A4_WIDTH_MM - A4_MARGIN.right, effectiveFooterY - 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(100, 116, 139);
  doc.text('Dokumen Profil Calon KPM · Sistem Informasi MASDETA', A4_MARGIN.left, effectiveFooterY);
  doc.text(
    `Dicetak pada ${formatUploadDateTime(new Date().toISOString())}`,
    A4_WIDTH_MM - A4_MARGIN.right,
    effectiveFooterY,
    { align: 'right' }
  );

  const safeName = `${record.tahun}_${record.nama}_${record.registerCode || 'kpm'}`;
  return saveOrOpenPdfDocument(doc, safeName);
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
    qrDataUrl,
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
    qrDataUrl: string;
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

  // Tengah atas: Judul kupon (ukuran font sama & warna hitam polos, tanpa subjudul program)
  const titleCenterX = x + cardW / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('KUPON PEMBAGIAN', titleCenterX, y + 7.6, { align: 'center' });
  doc.text(`TAHUN ${tahunStr}`, titleCenterX, y + 12.2, { align: 'center' });

  // Kanan atas: QR Code mengarah ke detail KPM
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', x + cardW - 17.2, y + 1.8, 14.8, 14.8);
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

  // Footer wajib
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.1);
  doc.setTextColor(15, 23, 42);
  doc.text(
    couponConfig.footerText?.trim() || 'Wajib membawa Kupon dan KTP asli saat pembagian.',
    titleCenterX,
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

  // Pre-generate QR code untuk semua KPM target dalam batch paralel
  const qrEntries = await Promise.all(
    targetRecords.map(async (rec) => {
      try {
        const url = await QRCode.toDataURL(buildKpmQrUrl(rec), {
          width: 180,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        return [rec.id, url] as const;
      } catch {
        return [rec.id, ''] as const;
      }
    })
  );
  const qrMap = new Map<string, string>(qrEntries);

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
      qrDataUrl: qrMap.get(rec.id) || '',
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
        qrDataUrl: qrMap.get(entry.rec.id) || '',
      });
    });
  }

  const defaultBulkName = `Cetak_Kupon_${targetRecords.length}_KPM`;
  const res = await saveOrOpenPdfDocument(doc, fileName || defaultBulkName);
  return { ...res, count: targetRecords.length };
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
  const left = F4_PDF_MARGINS.left; // 20mm
  const right = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.right; // 201mm
  const centerX = left + PRINTABLE_WIDTH_MM / 2;
  let cursorY = F4_PDF_MARGINS.top; // 10mm

  // 1. KOP DINAS SOSIAL
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
      cursorY + (logoH - drawH) / 2,
      drawW,
      drawH
    );
  }

  const kopCenterX = loadedKopLogo ? left + logoW + (PRINTABLE_WIDTH_MM - logoW) / 2 : centerX;

  doc.setTextColor(15, 23, 42);
  if (bastConfig.orgHeaderLine1?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(bastConfig.orgHeaderLine1.trim().toUpperCase(), kopCenterX, cursorY + 4.5, {
      align: 'center',
    });
  }
  if (bastConfig.orgHeaderLine2?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15.5);
    doc.text(bastConfig.orgHeaderLine2.trim().toUpperCase(), kopCenterX, cursorY + 10.5, {
      align: 'center',
    });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  if (bastConfig.orgAddress1?.trim()) {
    doc.text(bastConfig.orgAddress1.trim(), kopCenterX, cursorY + 14.8, { align: 'center' });
  }
  if (bastConfig.orgAddress2?.trim()) {
    doc.text(bastConfig.orgAddress2.trim(), kopCenterX, cursorY + 18.5, { align: 'center' });
  }
  if (bastConfig.orgAddress3?.trim()) {
    doc.text(bastConfig.orgAddress3.trim(), kopCenterX, cursorY + 22.2, { align: 'center' });
  }

  cursorY += 24.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.75);
  doc.line(left, cursorY, right, cursorY);
  doc.setLineWidth(0.25);
  doc.line(left, cursorY + 1.1, right, cursorY + 1.1);
  cursorY += 6.5;

  // 2. JUDUL & NOMOR BAST (#1)
  const titleText = 'BERITA ACARA SERAH TERIMA BARANG';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.8);
  doc.setTextColor(15, 23, 42);
  doc.text(titleText, centerX, cursorY, { align: 'center' });
  const titleW = doc.getTextWidth(titleText);
  doc.setLineWidth(0.35);
  doc.line(centerX - titleW / 2, cursorY + 0.8, centerX + titleW / 2, cursorY + 0.8);

  cursorY += 4.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    bastConfig.nomorBast?.trim() || DEFAULT_BAST_TEMPLATE.nomorBast,
    centerX,
    cursorY,
    { align: 'center' }
  );
  cursorY += 6.8;

  // 3. PARAGRAF PEMBUKA (#2, #3, #4, #5; tanpa kata merah "dan penampungan air hujan")
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
    `tentang barang yang diserahkan kepada masyarakat berupa peralatan kerja bagi keluarga fakir miskin ` +
    `kegiatan pengelolaan data fakir miskin cakupan daerah provinsi sub kegiatan fasilitasi bantuan sosial ` +
    `kesejahteraan keluarga provinsi kalimantan barat tahun anggaran ${tahunAnggaran}. ` +
    `Berdasarkan surat pesanan (SP) nomor : ${nomorPesanan} tanggal ${tanggalPemesanan}.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.8);
  doc.setTextColor(15, 23, 42);
  const p1Lines = doc.splitTextToSize(p1, PRINTABLE_WIDTH_MM) as string[];
  doc.text(p1, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: 1.38,
  });
  cursorY += p1Lines.length * 4.75 + 4.5;

  // 4. IDENTITAS PIHAK PERTAMA & PIHAK KEDUA (#6, #7, #8, #9)
  doc.text('Kami yang bertanda tangan dibawah ini :', left, cursorY);
  cursorY += 5.5;

  const idLabelX = left + 9;
  const idColonX = left + 35;
  const idValX = left + 38;
  const idMaxW = right - idValX;

  doc.setFont('helvetica', 'normal');
  doc.text('Nama', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.text(bastConfig.pejabatNama?.trim() || DEFAULT_BAST_TEMPLATE.pejabatNama, idValX, cursorY);
  cursorY += 5.0;

  doc.setFont('helvetica', 'normal');
  doc.text('Jabatan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  const jabatanLines = doc.splitTextToSize(
    bastConfig.pejabatJabatan?.trim() || DEFAULT_BAST_TEMPLATE.pejabatJabatan,
    idMaxW
  ) as string[];
  doc.text(jabatanLines, idValX, cursorY);
  cursorY += jabatanLines.length * 4.6 + 0.6;

  doc.text('selanjutnya disebut sebagai ', idLabelX, cursorY);
  const p1PrefixW = doc.getTextWidth('selanjutnya disebut sebagai ');
  doc.setFont('helvetica', 'bold');
  doc.text('PIHAK PERTAMA', idLabelX + p1PrefixW, cursorY);
  cursorY += 7.0;

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
  const kpmFullName = (record.bast?.recipientName || record.nama || '-').toUpperCase();

  doc.setFont('helvetica', 'normal');
  doc.text('Nama', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.text(kpmFullName, idValX, cursorY);
  cursorY += 5.0;

  doc.setFont('helvetica', 'normal');
  doc.text('No. Bantuan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.text(noBantuanStr, idValX, cursorY);
  cursorY += 5.0;

  doc.text('Jabatan', idLabelX, cursorY);
  doc.text(':', idColonX, cursorY);
  doc.text('sebagai Keluarga Penerima Manfaat (KPM)', idValX, cursorY);
  cursorY += 5.0;

  doc.text('selanjutnya disebut sebagai ', idLabelX, cursorY);
  const p2PrefixW = doc.getTextWidth('selanjutnya disebut sebagai ');
  doc.setFont('helvetica', 'bold');
  doc.text('PIHAK KEDUA', idLabelX + p2PrefixW, cursorY);
  cursorY += 7.0;

  // 5. PARAGRAF PENYERAHAN BARANG + GARIS NOMINAL SEDIKIT TURUN (#10)
  const nominalRaw =
    bastConfig.nilaiNominalText?.trim() || DEFAULT_BAST_TEMPLATE.nilaiNominalText;
  const isDottedBlank = /^[.\s_…-]+$/.test(nominalRaw);

  if (isDottedBlank) {
    // Sisakan ruang vertikal ekstra sebelum baris titik-titik agar mudah ditulis angka secara manual
    const p2Lead =
      'Dengan ini PIHAK PERTAMA secara sah telah menyerahkan barang berupa 1 (satu) paket bantuan berupa peralatan kerja dan dalam keadaan “berfungsi dengan baik dan lengkap”';
    const leadLines = doc.splitTextToSize(p2Lead, PRINTABLE_WIDTH_MM) as string[];
    doc.setFont('helvetica', 'normal');
    doc.text(p2Lead, left, cursorY, {
      maxWidth: PRINTABLE_WIDTH_MM,
      align: 'justify',
      lineHeightFactor: 1.38,
    });
    cursorY += leadLines.length * 4.75 + 2.4;

    const prefixNominal = 'dengan nilai sebesar ';
    doc.text(prefixNominal, left, cursorY);
    const prefixW = doc.getTextWidth(prefixNominal);
    const dotWidth = 56;
    // Garis titik-titik diturunkan 1.4mm di bawah baseline normal agar ruang tulis di atasnya lapang
    doc.text(nominalRaw, left + prefixW + 1, cursorY + 1.4);
    const suffixX = Math.min(left + prefixW + Math.max(doc.getTextWidth(nominalRaw), dotWidth) + 3, right - 58);
    doc.text('dengan rincian barang sebagai berikut :', suffixX, cursorY);
    cursorY += 5.2;
  } else {
    const p2 =
      `Dengan ini PIHAK PERTAMA secara sah telah menyerahkan barang berupa 1 (satu) paket bantuan berupa peralatan kerja ` +
      `dan dalam keadaan “berfungsi dengan baik dan lengkap” dengan nilai sebesar ${nominalRaw} dengan rincian barang sebagai berikut :`;
    const p2Lines = doc.splitTextToSize(p2, PRINTABLE_WIDTH_MM) as string[];
    doc.setFont('helvetica', 'normal');
    doc.text(p2, left, cursorY, {
      maxWidth: PRINTABLE_WIDTH_MM,
      align: 'justify',
      lineHeightFactor: 1.38,
    });
    cursorY += p2Lines.length * 4.75 + 3.0;
  }

  // 6. TABEL RINCIAN BARANG DARI SUB-ITEM KPM (#11)
  const subStatuses = getKpmSubItemStatusList(record, items);
  const pkg = resolvePackageForKpm(items, record.tahun, record.item);
  const barangNames =
    subStatuses.length > 0
      ? subStatuses.map((s) => s.name)
      : [pkg.name && pkg.name !== pkg.code ? pkg.name : record.item || 'Paket Bantuan'];

  const tableRows: string[][] = barangNames.map((name, i) => [
    `${i + 1}.`,
    name,
    'Unit',
    '1',
    'Berfungsi Dengan Baik dan Lengkap',
  ]);

  // Tambahkan minimal beberapa baris kosong bila barang sangat sedikit agar proporsi formulir resmi terjaga
  while (tableRows.length < 4) {
    tableRows.push(['', '', '', '', '']);
  }

  autoTable(doc, {
    startY: cursorY,
    margin: {
      top: F4_PDF_MARGINS.top,
      right: F4_PDF_MARGINS.right,
      bottom: F4_PDF_MARGINS.bottom,
      left: F4_PDF_MARGINS.left,
    },
    tableWidth: PRINTABLE_WIDTH_MM,
    head: [['No.', 'Nama Barang', 'Satuan', 'Volume', 'Keterangan']],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9.2,
      minCellHeight: 6.8,
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.25,
      valign: 'middle',
      cellPadding: { top: 1.6, right: 2.2, bottom: 1.6, left: 2.2 },
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9.5,
      halign: 'center',
      lineColor: [30, 41, 59],
      lineWidth: 0.28,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: PRINTABLE_WIDTH_MM - 109, halign: 'left' }, // 72mm
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 17, halign: 'center' },
      4: { cellWidth: 62, halign: 'center' },
    },
  });

  cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 34) + 5.5;

  // 7. PARAGRAF PENUTUP
  const pClose =
    'Maka PIHAK KEDUA menyatakan telah menerima bantuan diatas dalam keadaan sadar dengan kondisi barang bantuan yang di berikan “berfungsi dengan baik dan lengkap”. Demikian berita acara ini dibuat untuk digunakan sebagaimana mestinya.';
  const pCloseLines = doc.splitTextToSize(pClose, PRINTABLE_WIDTH_MM) as string[];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.8);
  doc.setTextColor(15, 23, 42);
  doc.text(pClose, left, cursorY, {
    maxWidth: PRINTABLE_WIDTH_MM,
    align: 'justify',
    lineHeightFactor: 1.38,
  });
  cursorY += pCloseLines.length * 4.75 + 7.5;

  // 8. BLOK TANDA TANGAN (#12, #13 + MATERAI RP. 10.000)
  if (cursorY + 46 > F4_PAPER_HEIGHT_MM - F4_PDF_MARGINS.bottom) {
    doc.addPage([F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM], 'portrait');
    cursorY = F4_PDF_MARGINS.top + 8;
  }

  const leftSigX = left + PRINTABLE_WIDTH_MM * 0.24;
  const rightSigX = left + PRINTABLE_WIDTH_MM * 0.78;
  const sigColMaxW = PRINTABLE_WIDTH_MM * 0.44;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.6);
  doc.text('PIHAK PERTAMA', leftSigX, cursorY, { align: 'center' });
  doc.text('PIHAK KEDUA', rightSigX, cursorY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  const leftJabLines = doc.splitTextToSize(
    bastConfig.pejabatJabatan?.trim() || DEFAULT_BAST_TEMPLATE.pejabatJabatan,
    sigColMaxW
  ) as string[];
  doc.text(leftJabLines, leftSigX, cursorY + 4.8, { align: 'center' });
  doc.text('Keluarga Penerima Manfaat (KPM)', rightSigX, cursorY + 4.8, { align: 'center' });

  // Kotak Materai Rp. 10.000 di antara dua tanda tangan
  const materaiW = 16.5;
  const materaiH = 10.5;
  const materaiX = left + PRINTABLE_WIDTH_MM * 0.54 - materaiW / 2;
  const materaiY = cursorY + 13;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.28);
  doc.rect(materaiX, materaiY, materaiW, materaiH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.text('MATERAI', materaiX + materaiW / 2, materaiY + 4.3, { align: 'center' });
  doc.text('RP. 10.000', materaiX + materaiW / 2, materaiY + 7.8, { align: 'center' });

  // Jika tersedia tanda tangan digital KPM, tampilkan di atas garis tanda tangan PIHAK KEDUA
  if (loadedSig) {
    const boxW = 42;
    const boxH = 16;
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
      cursorY + 9 + (boxH - drawH) / 2,
      drawW,
      drawH
    );
  }

  const nameY = cursorY + 29.5;
  const pejabatNama = bastConfig.pejabatNama?.trim() || DEFAULT_BAST_TEMPLATE.pejabatNama;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.text(pejabatNama, leftSigX, nameY, { align: 'center' });
  const pejabatW = doc.getTextWidth(pejabatNama);
  doc.setLineWidth(0.32);
  doc.line(leftSigX - pejabatW / 2, nameY + 0.8, leftSigX + pejabatW / 2, nameY + 0.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  doc.text(
    bastConfig.pejabatPangkat?.trim() || DEFAULT_BAST_TEMPLATE.pejabatPangkat,
    leftSigX,
    nameY + 4.8,
    { align: 'center' }
  );
  doc.text(
    bastConfig.pejabatNip?.trim() || DEFAULT_BAST_TEMPLATE.pejabatNip,
    leftSigX,
    nameY + 9.2,
    { align: 'center' }
  );

  // Garis tanda tangan & nama lengkap PIHAK KEDUA (#13)
  doc.setLineWidth(0.3);
  doc.line(rightSigX - 28, nameY - 4.2, rightSigX + 28, nameY - 4.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.text(kpmFullName, rightSigX, nameY, { align: 'center' });
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

export interface SubItemRecapPdfOptions {
  records: KpmRecord[];
  items: ItemBantuan[];
  selectedYear: string;
  reportTemplate?: ReportTemplateConfig;
  fileName?: string;
}

export async function exportSubItemRecapToPdf({
  records,
  items,
  selectedYear,
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
      catalogOrder.set(subName.trim().toLowerCase(), idx);
    });
    const sortedSubAggregates = [...itemRecap.aggregates].sort((a, b) => {
      const ordA = catalogOrder.get(a.name.trim().toLowerCase()) ?? 9999;
      const ordB = catalogOrder.get(b.name.trim().toLowerCase()) ?? 9999;
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Tahun Anggaran: ${yearLabel}   ·   KPM Diterima   ·   Dicetak: ${formatUploadDateTime(new Date().toISOString())}`,
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

  const subDetailBody: (string | number)[][] = [];
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
      itemEntry.subAggregates.forEach((sub, subIdx) => {
        const pct =
          sub.totalNeeded > 0 ? Math.round((sub.deliveredCount / sub.totalNeeded) * 100) : 0;
        subDetailBody.push([
          String(rowCounter++).padStart(2, '0'),
          subIdx === 0 ? itemEntry.code : '',
          subIdx === 0 ? `${itemEntry.name} (${itemEntry.totalKpm} Paket)` : '',
          sub.name,
          sub.totalNeeded,
          sub.deliveredCount,
          sub.pendingCount,
          `${pct}%`,
        ]);
      });
    }
  }

  if (itemSummaryEntries.length > 0) {
    subDetailBody.push([
      '',
      'TOTAL',
      'Seluruh Item & Sub-Item',
      `${overallRecap.aggregates.length} Sub-Item`,
      overallRecap.totalUnits,
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
    head: [['NO', 'KODE', 'PAKET ITEM', 'SUB-ITEM', 'UNIT', 'DITERIMA', 'BELUM', 'PROGRES']],
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
      1: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 44, halign: 'left', fontStyle: 'bold' },
      3: { cellWidth: PRINTABLE_WIDTH_MM - 135, halign: 'left' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
    },
    didParseCell: (data) => {
      if (
        itemSummaryEntries.length > 0 &&
        data.section === 'body' &&
        data.row.index === subDetailBody.length - 1
      ) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Nomor halaman pada footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · Rekapitulasi Item & Sub-Item (${yearLabel})`,
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

  const resolvedFileName =
    fileName || `masdeta-rekap-item-subitem-${selectedYear === 'all' ? 'semua-tahun' : selectedYear}`;
  return saveOrOpenPdfDocument(doc, resolvedFileName);
}

export interface ExportSchedulesPdfOptions {
  schedules: import('../types/kpm').ScheduleEventItem[];
  title?: string;
  selectedYear?: string;
  fileName?: string;
  reportTemplate?: ReportTemplateConfig;
}

export async function exportSchedulesToPdf({
  schedules,
  title = 'JADWAL KEGIATAN & TARGET PROPOSAL',
  selectedYear = 'all',
  fileName,
  reportTemplate,
}: ExportSchedulesPdfOptions): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const catLabelMap: Record<import('../types/kpm').ScheduleCategory, string> = {
    survey: 'Survey Lapangan',
    dinas: 'Antar ke Dinas',
    distribusi: 'Penyaluran / Distribusi',
    lainnya: 'Agenda Lainnya',
  };

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
  doc.text(
    `Cakupan: ${yearLabel}   ·   Total: ${sorted.length} Agenda   ·   Dicetak: ${formatUploadDateTime(new Date().toISOString())}`,
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

  const tableBody: string[][] =
    sorted.length === 0
      ? [['-', '-', '-', '-', '-', 'Belum ada agenda terjadwal.', '-']]
      : sorted.map((ev, idx) => {
          const isOverdue = !ev.completed && ev.targetDate < todayStr;
          const statusText = ev.completed ? 'Selesai' : isOverdue ? 'Terlambat' : 'Terjadwal';
          const dateTimeStr = ev.targetTime ? `${ev.targetDate}\nPukul ${ev.targetTime}` : ev.targetDate;
          const agendaDesc = [
            ev.title,
            ev.location ? `Lokasi: ${ev.location}` : '',
            ev.footerNote ? `Catatan Kaki: ${ev.footerNote}` : '',
            ev.notes ? `Catatan: ${ev.notes}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return [
            String(idx + 1).padStart(2, '0'),
            dateTimeStr,
            catLabelMap[ev.category] || ev.category,
            ev.tahun || '-',
            ev.proposalName?.trim() || 'Umum / Tanpa Proposal',
            agendaDesc,
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
    head: [['NO', 'TANGGAL & JAM', 'KATEGORI', 'TAHUN', 'PROPOSAL', 'AGENDA & CATATAN', 'STATUS']],
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
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 27, halign: 'center' },
      2: { cellWidth: 28, halign: 'left' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 38, halign: 'left' },
      5: { cellWidth: PRINTABLE_WIDTH_MM - 138, halign: 'left' },
      6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `MASDETA · Jadwal & Target Proposal (${yearLabel})`,
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

  const resolvedFileName =
    fileName || `masdeta-jadwal-proposal-${selectedYear === 'all' ? 'semua' : selectedYear}`;
  const res = await saveOrOpenPdfDocument(doc, resolvedFileName);
  return { ...res, count: sorted.length };
}

