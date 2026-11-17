import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { jsPDF } from 'jspdf';
import autoTable, { Styles } from 'jspdf-autotable';
import QRCode from 'qrcode';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalRecord,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatRupiah,
  formatUploadDateTime,
  getAbsenSeq,
  getDocumentDirectUrl,
  getDocumentThumbnailUrl,
  getItemHierarchyRank,
  getKpmSubItemStatusList,
  getPrimaryKpmPhotoWithMeta,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalDomicile,
  resolveProposalKecamatanCategory,
} from './imageProcessor';

// Ukuran kertas F4: 216mm x 310mm
export const F4_PAPER_WIDTH_MM = 216;
export const F4_PAPER_HEIGHT_MM = 310;

// Margin: atas 1 cm, kanan 1 cm, bawah 1 cm, kiri 1,5 cm
export const F4_PDF_MARGINS = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 15,
} as const;

const PRINTABLE_WIDTH_MM = F4_PAPER_WIDTH_MM - F4_PDF_MARGINS.left - F4_PDF_MARGINS.right; // 191mm

export type PdfColumnKey =
  | 'no'
  | 'nikKtp'
  | 'nikKk'
  | 'item'
  | 'desil'
  | 'nama'
  | 'alamat'
  | 'rtRw'
  | 'rt'
  | 'rw'
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
    key: 'rt',
    pdfHeader: 'RT',
    uiLabel: 'RT (Terpisah)',
    defaultEnabled: false,
    baseWidthMm: 10.5,
    minWidthMm: 8.5,
    halign: 'center',
  },
  {
    key: 'rw',
    pdfHeader: 'RW',
    uiLabel: 'RW (Terpisah)',
    defaultEnabled: false,
    baseWidthMm: 10.5,
    minWidthMm: 8.5,
    halign: 'center',
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
    const rankCmp =
      getItemHierarchyRank(a.item, a.tahun, items) - getItemHierarchyRank(b.item, b.tahun, items);
    if (rankCmp !== 0) return rankCmp;
    const seqCmp = getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode);
    if (seqCmp !== 0) return seqCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Selalu posisi Portrait F4 (216mm x 310mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  let headerTopY = F4_PDF_MARGINS.top;
  if (reportTemplate?.enabled) {
    const centerX = F4_PDF_MARGINS.left + PRINTABLE_WIDTH_MM / 2;
    if (reportTemplate.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, headerTopY + 4.5, {
        align: 'center',
      });
      headerTopY += 5.5;
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 118, 110);
      doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, headerTopY + 4, {
        align: 'center',
      });
      headerTopY += 5;
    }
    if (reportTemplate.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTemplate.orgAddress.trim(), centerX, headerTopY + 3.5, {
        align: 'center',
      });
      headerTopY += 5;
    }
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
        case 'rt':
          return rec.rt ? rec.rt.padStart(3, '0') : '-';
        case 'rw':
          return rec.rw ? rec.rw.padStart(3, '0') : '-';
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

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const img = new Image();
    if (!url.startsWith('data:')) {
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
        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.86);
        finish({ dataUrl: jpegDataUrl, format: 'JPEG', width: cw, height: ch });
      } catch {
        finish(null);
      }
    };

    img.onerror = () => finish(null);
    img.src = url;
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
    qrDataUrl = await QRCode.toDataURL(`MASDETA:KPM:${record.registerCode || record.id}`, {
      width: 160,
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

export interface ExportKpmBastPdfOptions {
  record: KpmRecord;
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  reportTemplate?: ReportTemplateConfig;
}

export async function exportKpmBastToPdf({
  record,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  reportTemplate,
}: ExportKpmBastPdfOptions): Promise<{ savedFileName: string; openedNative: boolean }> {
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const A4_MARGIN = { top: 14, right: 15, bottom: 14, left: 15 };
  const PRINT_W = A4_WIDTH_MM - A4_MARGIN.left - A4_MARGIN.right;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  let cursorY = A4_MARGIN.top;
  const centerX = A4_MARGIN.left + PRINT_W / 2;

  if (reportTemplate?.enabled) {
    if (reportTemplate.orgHeaderLine1?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(reportTemplate.orgHeaderLine1.trim().toUpperCase(), centerX, cursorY + 4, {
        align: 'center',
      });
      cursorY += 5.5;
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 118, 110);
      doc.text(reportTemplate.orgHeaderLine2.trim(), centerX, cursorY + 4, { align: 'center' });
      cursorY += 5;
    }
    if (reportTemplate.orgAddress?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(reportTemplate.orgAddress.trim(), centerX, cursorY + 3.5, { align: 'center' });
      cursorY += 4.8;
    }
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.55);
    doc.line(A4_MARGIN.left, cursorY + 1, A4_WIDTH_MM - A4_MARGIN.right, cursorY + 1);
    doc.setLineWidth(0.2);
    doc.line(A4_MARGIN.left, cursorY + 2.2, A4_WIDTH_MM - A4_MARGIN.right, cursorY + 2.2);
    cursorY += 7;
  }

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(`MASDETA:BAST:${record.registerCode || record.id}`, {
      width: 160,
      margin: 1,
    });
  } catch {
    qrDataUrl = '';
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BERITA ACARA SERAH TERIMA BANTUAN (BAST)', A4_MARGIN.left, cursorY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `No. Register: ${record.registerCode || '-'}   ·   Tahun Anggaran ${record.tahun}`,
    A4_MARGIN.left,
    cursorY + 10
  );

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', A4_WIDTH_MM - A4_MARGIN.right - 16, cursorY - 1, 16, 16);
  }

  cursorY += 16;

  const domicile = resolveProposalDomicile(record.proposal, proposals, record.tahun, wilayahList);
  const kelurahan = record.kelurahan?.trim() || domicile.kelurahan || '-';
  const kecamatan = record.kecamatan?.trim() || domicile.kecamatan || '-';
  const pkg = resolvePackageForKpm(items, record.tahun, record.item);
  const itemLabel =
    pkg.name && pkg.name !== pkg.code ? `${pkg.code} — ${pkg.name}` : record.item || '-';
  const signedDateText = record.bast?.signedAt
    ? formatUploadDateTime(record.bast.signedAt)
    : formatUploadDateTime(new Date().toISOString());

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const introText = `Pada hari ini, tanggal ${signedDateText}, telah dilakukan serah terima barang bantuan program MASDETA kepada Keluarga Penerima Manfaat (KPM) dengan rincian sebagai berikut:`;
  const wrappedIntro = doc.splitTextToSize(introText, PRINT_W);
  doc.text(wrappedIntro, A4_MARGIN.left, cursorY);
  cursorY += wrappedIntro.length * 4.5 + 3;

  autoTable(doc, {
    startY: cursorY,
    margin: A4_MARGIN,
    tableWidth: PRINT_W,
    head: [['DATA PENERIMA MANFAAT', 'KETERANGAN']],
    body: [
      ['Nama Lengkap Penerima', (record.bast?.recipientName || record.nama || '-').toUpperCase()],
      ['NIK KTP / No. KK', `${record.nikKtp || '-'} / ${record.nikKk || '-'}`],
      [
        'Alamat Domisili',
        `${record.alamat || '-'}, RT ${record.rt || '-'} / RW ${record.rw || '-'}, ${kelurahan}, ${kecamatan}`,
      ],
      ['Proposal & Tahun', `${record.proposal || '-'} (${record.tahun})`],
      ['Paket Bantuan', itemLabel],
      ['Pengelola Lapangan', record.pengelola || '-'],
      ...(record.bast?.lat !== undefined && record.bast?.lng !== undefined
        ? [
            [
              'Koordinat Serah Terima (GPS)',
              `${record.bast.lat.toFixed(6)}, ${record.bast.lng.toFixed(6)}${record.bast.accuracy ? ` (±${Math.round(record.bast.accuracy)}m)` : ''}`,
            ],
          ]
        : []),
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.3, right: 3, bottom: 2.3, left: 3 },
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 54, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: PRINT_W - 54 },
    },
  });

  const subStatuses = getKpmSubItemStatusList(record, items);
  const subStartY = (doc.lastAutoTable?.finalY ?? cursorY + 45) + 5;

  autoTable(doc, {
    startY: subStartY,
    margin: A4_MARGIN,
    tableWidth: PRINT_W,
    head: [['NO', 'RINCIAN BARANG / SUB-ITEM', 'STATUS SERAH TERIMA']],
    body:
      subStatuses.length > 0
        ? subStatuses.map((sub, i) => [
            String(i + 1).padStart(2, '0'),
            sub.name,
            sub.delivered ? 'Diterima Baik & Lengkap' : 'Belum Diterima',
          ])
        : [['01', itemLabel, 'Paket Utama']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.2, right: 2.8, bottom: 2.2, left: 2.8 },
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: PRINT_W - 64 },
      2: { cellWidth: 50, halign: 'center' },
    },
  });

  let sigY = (doc.lastAutoTable?.finalY ?? subStartY + 30) + 10;
  if (sigY + 48 > A4_HEIGHT_MM - A4_MARGIN.bottom) {
    doc.addPage([A4_WIDTH_MM, A4_HEIGHT_MM], 'portrait');
    sigY = A4_MARGIN.top + 8;
  }

  const leftSigX = A4_MARGIN.left + PRINT_W * 0.23;
  const rightSigX = A4_MARGIN.left + PRINT_W * 0.77;
  const cityLabel = reportTemplate?.city?.trim() || 'Pontianak';
  const dateOnlyStr = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(record.bast?.signedAt ? new Date(record.bast.signedAt) : new Date());

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui / Petugas Penyerah,', leftSigX, sigY + 4.8, { align: 'center' });
  doc.text(`${cityLabel}, ${dateOnlyStr}`, rightSigX, sigY, { align: 'center' });
  doc.text('Penerima Manfaat (KPM),', rightSigX, sigY + 4.8, { align: 'center' });

  // Load KPM Signature PNG if available
  const sigDoc =
    record.bast?.signatureDoc ||
    (record.documents.lainnya || []).find((d) =>
      (d.fileName || '').toUpperCase().startsWith('BAST-TTD-')
    );
  const loadedSig = await resolveKpmPortraitForPdf(sigDoc);
  if (loadedSig) {
    const boxW = 46;
    const boxH = 20;
    const imgRatio = loadedSig.width / loadedSig.height;
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
      sigY + 7 + (boxH - drawH) / 2,
      drawW,
      drawH
    );
  }

  const officerName =
    reportTemplate?.enabled && reportTemplate.signatoryName?.trim()
      ? reportTemplate.signatoryName.trim()
      : record.bast?.signedBy || record.pengelola || 'Petugas Lapangan';
  const officerTitle =
    reportTemplate?.enabled && reportTemplate.signatoryTitle?.trim()
      ? reportTemplate.signatoryTitle.trim()
      : 'Admin / Pendamping';

  doc.setFont('helvetica', 'bold');
  doc.text(officerName, leftSigX, sigY + 31, { align: 'center' });
  doc.text((record.bast?.recipientName || record.nama || '-').toUpperCase(), rightSigX, sigY + 31, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    reportTemplate?.enabled && reportTemplate.signatoryNip?.trim()
      ? `NIP. ${reportTemplate.signatoryNip.trim()}`
      : officerTitle,
    leftSigX,
    sigY + 35.5,
    { align: 'center' }
  );
  doc.text(`NIK: ${record.nikKtp || '-'}`, rightSigX, sigY + 35.5, { align: 'center' });

  const safeName = `BAST_${record.tahun}_${record.nama}_${record.registerCode || 'kpm'}`;
  return saveOrOpenPdfDocument(doc, safeName);
}

