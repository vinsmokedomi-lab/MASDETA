import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ProposalDestinationType,
  SavedProposalRabConfig,
  SavedRabPackage,
} from '../types/kpm';
import {
  ProposalDestinationContext,
  ProposalKpmDataset,
  ProposalStyleTemplate,
  ResolvedOpdNarrative,
  ResolvedWilayahNarrative,
  formatChapterHeading,
  formatRupiahTerbilang,
  padTwoDigits,
} from '../data/proposalTemplates';
import { formatRupiahCurrency } from './rabCalculator';

// Ukuran kertas F4 presisi: 216mm x 330mm
export const PROPOSAL_F4_WIDTH_MM = 216;
export const PROPOSAL_F4_HEIGHT_MM = 330;

// Margin resmi F4: Atas 1cm (10mm), Kanan 1.5cm (15mm), Bawah 1cm (10mm), Kiri 2cm (20mm)
export const PROPOSAL_F4_MARGIN = {
  top: 10,
  right: 15,
  bottom: 10,
  left: 20,
} as const;

const CONTENT_WIDTH_MM =
  PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.left - PROPOSAL_F4_MARGIN.right; // 181mm
const RUNNING_HEADER_BOTTOM_Y = 20; // Header berada di 10mm..17mm, isi aman mulai di 21mm
const CONTENT_START_Y = 22;
const SAFE_BOTTOM_Y = PROPOSAL_F4_HEIGHT_MM - PROPOSAL_F4_MARGIN.bottom - 7; // 313mm (ruang footer nomor halaman)

export type OpdKetSourceMode = 'pekerjaan' | 'usaha';

export interface ExportProposalDocumentPdfOptions {
  styleTemplate: ProposalStyleTemplate;
  context: ProposalDestinationContext;
  destination: ProposalDestinationType;
  dataset: ProposalKpmDataset;
  savedRab?: SavedProposalRabConfig | null;
  opdNarrative: ResolvedOpdNarrative;
  wilayahNarrative: ResolvedWilayahNarrative;
  opdKetSource: OpdKetSourceMode;
}

type AutoTableDoc = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (!Number.isFinite(num)) return [15, 23, 42];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getJsPdfFont(fontStyle: ProposalStyleTemplate['fontStyle']): 'helvetica' | 'times' {
  return fontStyle === 'serif' || fontStyle === 'classic' ? 'times' : 'helvetica';
}

function sanitizeProposalFileName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || 'Proposal MASDETA';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

async function saveOrOpenProposalPdfDocument(
  doc: jsPDF,
  rawFileName: string
): Promise<{ savedFileName: string; openedNative: boolean }> {
  const fileName = sanitizeProposalFileName(rawFileName);

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
      // Coba direktori cadangan
    }
  }

  if (!writtenUri) {
    throw new Error('Gagal menyimpan file PDF Proposal ke penyimpanan perangkat.');
  }

  await FileOpener.openFile({
    path: writtenUri,
    mimeType: 'application/pdf',
  });

  return { savedFileName: fileName, openedNative: true };
}

function drawCoverPage(
  doc: jsPDF,
  style: ProposalStyleTemplate,
  context: ProposalDestinationContext,
  destination: ProposalDestinationType,
  totalKpm: number
) {
  const W = PROPOSAL_F4_WIDTH_MM;
  const H = PROPOSAL_F4_HEIGHT_MM;
  const primary = hexToRgb(style.palette.primary);
  const secondary = hexToRgb(style.palette.secondary);
  const accent = hexToRgb(style.palette.accent);
  const tint = hexToRgb(style.palette.tint);
  const border = hexToRgb(style.palette.border);
  const font = getJsPdfFont(style.fontStyle);

  // Latar belakang putih bersih
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // Ornamen vektor sesuai layout tetap masing-masing Style 01..15
  switch (style.coverLayout) {
    case 'blue-wave': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, W, 72, 'F');
      doc.setFillColor(...secondary);
      doc.triangle(0, 72, W, 58, W, 88, 'F');
      doc.triangle(0, 72, 0, 96, W, 88, 'F');
      doc.setFillColor(...accent);
      doc.rect(0, 92, W, 6, 'F');
      doc.setFillColor(...accent);
      doc.rect(0, H - 40, W, 6, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, H - 34, W, 34, 'F');
      break;
    }
    case 'terracotta-pillars': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, 22, H, 'F');
      doc.setFillColor(...secondary);
      doc.rect(22, 0, 8, H, 'F');
      doc.setFillColor(...accent);
      doc.rect(30, 0, 4, H, 'F');
      doc.setFillColor(...tint);
      doc.rect(34, 0, W - 34, 16, 'F');
      doc.rect(34, H - 16, W - 34, 16, 'F');
      doc.setFillColor(...primary);
      doc.rect(46, 42, 152, 1.5, 'F');
      doc.setFillColor(...secondary);
      doc.rect(46, H - 44, 152, 1.5, 'F');
      break;
    }
    case 'navy-right-arc': {
      doc.setFillColor(...secondary);
      doc.rect(0, 0, 10, H, 'F');
      doc.setFillColor(...primary);
      doc.triangle(136, 0, W, 0, W, H, 'F');
      doc.triangle(136, 0, W, H, 158, H, 'F');
      doc.setFillColor(...accent);
      doc.triangle(126, 0, 136, 0, 158, H, 'F');
      doc.triangle(126, 0, 148, H, 158, H, 'F');
      doc.setFillColor(...secondary);
      doc.rect(22, H - 36, 86, 2.5, 'F');
      break;
    }
    case 'diagonal-ribbons': {
      doc.setFillColor(...primary);
      doc.triangle(0, 0, W, 0, 0, 102, 'F');
      doc.triangle(W, 0, W, 44, 0, 102, 'F');
      doc.setFillColor(...accent);
      doc.triangle(0, 102, W, 44, W, 56, 'F');
      doc.triangle(0, 102, W, 56, 0, 114, 'F');
      doc.setFillColor(...accent);
      doc.triangle(0, H - 44, W, H - 94, W, H - 82, 'F');
      doc.triangle(0, H - 44, W, H - 82, 0, H - 32, 'F');
      doc.setFillColor(...primary);
      doc.triangle(0, H - 34, W, H - 84, W, H, 'F');
      doc.triangle(0, H - 34, W, H, 0, H, 'F');
      break;
    }
    case 'gold-mosaic': {
      doc.setFillColor(255, 253, 248);
      doc.rect(0, 0, W, H, 'F');
      doc.setFillColor(...primary);
      doc.triangle(0, 0, 112, 0, 0, 86, 'F');
      doc.setFillColor(...secondary);
      doc.triangle(112, 0, W, 0, W, 62, 'F');
      doc.triangle(112, 0, W, 62, 74, 38, 'F');
      doc.setFillColor(...accent);
      doc.triangle(0, 86, 74, 38, 112, 70, 'F');
      doc.setFillColor(...primary);
      doc.triangle(W, H - 84, W, H, 96, H, 'F');
      doc.setFillColor(...secondary);
      doc.triangle(0, H - 52, 134, H, 0, H, 'F');
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.7);
      doc.rect(16, 16, W - 32, H - 32, 'S');
      break;
    }
    case 'orange-top-block': {
      doc.setFillColor(...primary);
      doc.rect(108, 0, 108, 86, 'F');
      doc.setFillColor(...accent);
      doc.rect(92, 16, 16, 70, 'F');
      doc.setFillColor(...secondary);
      doc.rect(0, 0, 108, 14, 'F');
      doc.setFillColor(...accent);
      doc.rect(0, H - 30, 132, 8, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, H - 22, W, 22, 'F');
      break;
    }
    case 'emerald-left-bar': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, 44, H, 'F');
      doc.setFillColor(...accent);
      doc.rect(44, 0, 7, H, 'F');
      doc.setFillColor(...secondary);
      doc.circle(22, 54, 12, 'F');
      doc.setFillColor(255, 255, 255);
      doc.circle(22, 54, 5, 'F');
      doc.setFillColor(...secondary);
      doc.rect(64, 28, 132, 2.5, 'F');
      doc.setFillColor(...primary);
      doc.rect(64, H - 32, 132, 2.5, 'F');
      break;
    }
    case 'indigo-split-frame': {
      doc.setFillColor(...tint);
      doc.rect(0, 0, W, H, 'F');
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...primary);
      doc.setLineWidth(1.4);
      doc.rect(14, 14, W - 28, H - 28, 'FD');
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.6);
      doc.rect(19, 19, W - 38, H - 38, 'S');
      doc.setFillColor(...primary);
      doc.rect(14, 14, W - 28, 56, 'F');
      doc.setFillColor(...secondary);
      doc.rect(14, 70, W - 28, 5, 'F');
      doc.setFillColor(...primary);
      doc.rect(14, H - 36, W - 28, 22, 'F');
      break;
    }
    case 'burgundy-classic': {
      doc.setFillColor(255, 253, 253);
      doc.rect(0, 0, W, H, 'F');
      doc.setDrawColor(...primary);
      doc.setLineWidth(1.8);
      doc.rect(12, 12, W - 24, H - 24, 'S');
      doc.setDrawColor(...secondary);
      doc.setLineWidth(0.6);
      doc.rect(18, 18, W - 36, H - 36, 'S');
      doc.setFillColor(...primary);
      doc.triangle(12, 12, 44, 12, 12, 44, 'F');
      doc.triangle(W - 12, 12, W - 44, 12, W - 12, 44, 'F');
      doc.triangle(12, H - 12, 44, H - 12, 12, H - 44, 'F');
      doc.triangle(W - 12, H - 12, W - 44, H - 12, W - 12, H - 44, 'F');
      doc.rect(44, 66, W - 88, 1.5, 'F');
      doc.rect(44, H - 66, W - 88, 1.5, 'F');
      break;
    }
    case 'teal-corner-geo': {
      doc.setFillColor(...primary);
      doc.triangle(0, 0, 134, 0, 0, 112, 'F');
      doc.setFillColor(...accent);
      doc.triangle(134, 0, 168, 0, 0, 140, 'F');
      doc.triangle(134, 0, 0, 140, 0, 112, 'F');
      doc.setFillColor(...primary);
      doc.triangle(W, H, 84, H, W, H - 112, 'F');
      doc.setFillColor(...secondary);
      doc.triangle(84, H, 52, H, W, H - 140, 'F');
      doc.triangle(84, H, W, H - 140, W, H - 112, 'F');
      break;
    }
    case 'amber-horizon': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, W, 36, 'F');
      doc.setFillColor(...secondary);
      doc.rect(0, 36, W, 9, 'F');
      doc.setFillColor(...accent);
      doc.rect(0, 45, W, 5, 'F');
      doc.setFillColor(...tint);
      doc.rect(0, 134, W, 68, 'F');
      doc.setFillColor(...secondary);
      doc.rect(0, 134, W, 1.5, 'F');
      doc.rect(0, 202, W, 1.5, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, H - 28, W, 28, 'F');
      break;
    }
    case 'slate-executive': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, W, 80, 'F');
      doc.setFillColor(...accent);
      doc.rect(0, 80, W, 5, 'F');
      doc.setFillColor(...secondary);
      doc.rect(18, 104, 4, 178, 'F');
      doc.setFillColor(...accent);
      doc.rect(148, H - 24, 68, 8, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, H - 16, W, 16, 'F');
      break;
    }
    case 'forest-curve': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, W, 68, 'F');
      doc.triangle(0, 68, W, 68, W / 2, 100, 'F');
      doc.setFillColor(...accent);
      doc.triangle(0, 68, W / 2, 100, 0, 78, 'F');
      doc.triangle(W, 68, W / 2, 100, W, 78, 'F');
      doc.setFillColor(...primary);
      doc.rect(0, H - 52, W, 52, 'F');
      doc.triangle(0, H - 52, W, H - 52, W / 2, H - 76, 'F');
      break;
    }
    case 'cobalt-grid': {
      doc.setFillColor(...primary);
      doc.rect(0, 0, W, 20, 'F');
      doc.setFillColor(...secondary);
      doc.rect(0, 20, 72, 12, 'F');
      doc.setFillColor(...accent);
      doc.rect(72, 20, 72, 12, 'F');
      doc.setFillColor(...tint);
      doc.rect(144, 20, 72, 12, 'F');
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.7);
      doc.rect(18, 52, W - 36, H - 102, 'S');
      doc.setFillColor(...primary);
      doc.rect(0, H - 26, 144, 26, 'F');
      doc.setFillColor(...secondary);
      doc.rect(144, H - 26, 72, 26, 'F');
      break;
    }
    case 'plum-editorial':
    default: {
      doc.setFillColor(...primary);
      doc.rect(0, 0, 14, H, 'F');
      doc.rect(W - 14, 0, 14, H, 'F');
      doc.setFillColor(...secondary);
      doc.rect(14, 28, W - 28, 3.5, 'F');
      doc.setFillColor(...accent);
      doc.rect(14, 34, W - 28, 1.2, 'F');
      doc.rect(14, H - 36, W - 28, 1.2, 'F');
      doc.setFillColor(...secondary);
      doc.rect(14, H - 32, W - 28, 3.5, 'F');
      doc.setFillColor(...primary);
      doc.rect(72, 74, 72, 2.5, 'F');
      break;
    }
  }

  const isLeftAligned =
    style.coverLayout === 'terracotta-pillars' ||
    style.coverLayout === 'navy-right-arc' ||
    style.coverLayout === 'emerald-left-bar' ||
    style.coverLayout === 'slate-executive';

  const hasDarkTopHeader =
    style.coverLayout === 'blue-wave' ||
    style.coverLayout === 'diagonal-ribbons' ||
    style.coverLayout === 'indigo-split-frame' ||
    style.coverLayout === 'slate-executive' ||
    style.coverLayout === 'forest-curve';

  const hasDarkBottomFooter =
    style.coverLayout === 'blue-wave' ||
    style.coverLayout === 'diagonal-ribbons' ||
    style.coverLayout === 'orange-top-block' ||
    style.coverLayout === 'indigo-split-frame' ||
    style.coverLayout === 'amber-horizon' ||
    style.coverLayout === 'slate-executive' ||
    style.coverLayout === 'forest-curve' ||
    style.coverLayout === 'cobalt-grid';

  const textX = isLeftAligned
    ? style.coverLayout === 'emerald-left-bar'
      ? 64
      : style.coverLayout === 'terracotta-pillars'
      ? 48
      : style.coverLayout === 'slate-executive'
      ? 30
      : 22
    : W / 2;
  const maxTextWidth = isLeftAligned
    ? style.coverLayout === 'navy-right-arc'
      ? 104
      : W - textX - 20
    : 158;
  const alignOpt: 'left' | 'center' = isLeftAligned ? 'left' : 'center';

  // Kicker atas
  doc.setFont(font, 'bold');
  doc.setFontSize(10.5);
  if (hasDarkTopHeader) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(...primary);
  }
  doc.text(style.coverKicker, textX, hasDarkTopHeader ? 34 : 52, {
    align: alignOpt,
    maxWidth: maxTextWidth,
  });

  doc.setFont(font, 'normal');
  doc.setFontSize(9.5);
  if (hasDarkTopHeader) {
    doc.setTextColor(235, 242, 255);
  } else {
    doc.setTextColor(...secondary);
  }
  doc.text(`TAHUN ANGGARAN ${context.tahun}`, textX, hasDarkTopHeader ? 42 : 59, {
    align: alignOpt,
  });

  // Lencana Mode Dokumen
  const badgeLabel =
    destination === 'OPD' ? 'MODE OPD · LENGKAP RAB' : `MODE ${destination.toUpperCase()}`;
  doc.setFont(font, 'bold');
  doc.setFontSize(8.5);
  const badgeW = Math.min(maxTextWidth, doc.getTextWidth(badgeLabel) + 12);
  const badgeX = isLeftAligned ? textX : W / 2 - badgeW / 2;
  const badgeY = 122;
  doc.setFillColor(...tint);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.4);
  doc.roundedRect(badgeX, badgeY - 5, badgeW, 8, 1.5, 1.5, 'FD');
  doc.setTextColor(...primary);
  doc.text(badgeLabel, badgeX + badgeW / 2, badgeY + 0.5, { align: 'center' });

  // Judul Utama Proposal
  doc.setFont(font, 'bold');
  doc.setFontSize(23);
  doc.setTextColor(15, 23, 42);
  const mainTitleLines = doc.splitTextToSize(style.coverMainTitle, maxTextWidth) as string[];
  let cursorY = 144;
  doc.text(mainTitleLines, textX, cursorY, { align: alignOpt });
  cursorY += mainTitleLines.length * 10 + 4;

  // Subjudul
  doc.setFont(font, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...secondary);
  const subTitleLines = doc.splitTextToSize(style.coverSubTitle, maxTextWidth) as string[];
  doc.text(subTitleLines, textX, cursorY, { align: alignOpt });
  cursorY += subTitleLines.length * 5.5 + 8;

  // Garis pemisah aksen
  doc.setFillColor(...primary);
  const lineW = 36;
  doc.rect(isLeftAligned ? textX : W / 2 - lineW / 2, cursorY, lineW, 1.6, 'F');
  cursorY += 12;

  // Baris Wilayah (Jalan, Kelurahan, Kecamatan, Kab/Kota)
  context.coverLines.forEach((line, idx) => {
    doc.setFont(font, 'bold');
    doc.setFontSize(idx === 0 ? 15 : 12);
    doc.setTextColor(idx === 0 ? 15 : 51, idx === 0 ? 23 : 65, idx === 0 ? 42 : 85);
    const wrapped = doc.splitTextToSize(line, maxTextWidth) as string[];
    doc.text(wrapped, textX, cursorY, { align: alignOpt });
    cursorY += wrapped.length * (idx === 0 ? 7 : 5.8) + 2;
  });

  // Footer Cover
  const destCaption =
    destination === 'OPD'
      ? 'DINAS SOSIAL PROVINSI KALIMANTAN BARAT'
      : destination === 'Kecamatan'
      ? (context.kecamatan || 'PEMERINTAH KECAMATAN').toUpperCase()
      : (context.kelurahan || 'PEMERINTAH KELURAHAN').toUpperCase();

  const footerBaseY = hasDarkBottomFooter ? H - 15 : H - 46;
  doc.setFont(font, 'bold');
  doc.setFontSize(8.5);
  if (hasDarkBottomFooter) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(51, 65, 85);
  }
  doc.text(`DIAJUKAN KEPADA: ${destCaption}`, textX, footerBaseY, {
    align: alignOpt,
    maxWidth: maxTextWidth,
  });

  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  if (hasDarkBottomFooter) {
    doc.setTextColor(226, 232, 240);
  } else {
    doc.setTextColor(...primary);
  }
  doc.text(
    `TAHUN ${context.tahun} · ${totalKpm} CALON PENERIMA MANFAAT`,
    textX,
    footerBaseY + 5.5,
    { align: alignOpt }
  );
}

function drawRunningHeaderAndFooterOnContentPages(
  doc: jsPDF,
  style: ProposalStyleTemplate,
  context: ProposalDestinationContext,
  destination: ProposalDestinationType
) {
  const totalPages = doc.getNumberOfPages();
  const primary = hexToRgb(style.palette.primary);
  const border = hexToRgb(style.palette.border);
  const font = getJsPdfFont(style.fontStyle);

  // Halaman 1 (Cover) WAJIB bersih tanpa running header!
  for (let page = 2; page <= totalPages; page++) {
    doc.setPage(page);

    // Running Header mulai tepat di batas margin atas 1cm (10mm)
    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text(
      `PROPOSAL BANTUAN USAHA MANDIRI — ${context.runningHeaderLabel}`,
      PROPOSAL_F4_MARGIN.left,
      PROPOSAL_F4_MARGIN.top + 3.5
    );

    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Tahun ${context.tahun} · ${destination}`,
      PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right,
      PROPOSAL_F4_MARGIN.top + 3.5,
      { align: 'right' }
    );

    // Garis pemisah tipis dengan jarak aman dari konten (konten mulai y = 22mm)
    doc.setDrawColor(...border);
    doc.setLineWidth(0.35);
    doc.line(
      PROPOSAL_F4_MARGIN.left,
      RUNNING_HEADER_BOTTOM_Y - 3,
      PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right,
      RUNNING_HEADER_BOTTOM_Y - 3
    );

    // Footer nomor halaman di batas aman margin bawah
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Halaman ${page} dari ${totalPages}`,
      PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right,
      PROPOSAL_F4_HEIGHT_MM - PROPOSAL_F4_MARGIN.bottom + 1.5,
      { align: 'right' }
    );
  }
}

function getTableThemeStyles(style: ProposalStyleTemplate) {
  const primary = hexToRgb(style.palette.primary);
  const tint = hexToRgb(style.palette.tint);
  const border = hexToRgb(style.palette.border);

  if (style.tableTheme === 'dark-slate') {
    return {
      headFill: [15, 23, 42] as [number, number, number],
      headText: [255, 255, 255] as [number, number, number],
      altFill: [248, 250, 252] as [number, number, number],
      lineColor: [203, 213, 225] as [number, number, number],
    };
  }
  if (style.tableTheme === 'soft-tint') {
    return {
      headFill: tint,
      headText: primary,
      altFill: [252, 253, 254] as [number, number, number],
      lineColor: border,
    };
  }
  if (style.tableTheme === 'classic-bordered') {
    return {
      headFill: [241, 245, 249] as [number, number, number],
      headText: [15, 23, 42] as [number, number, number],
      altFill: [255, 255, 255] as [number, number, number],
      lineColor: [100, 116, 139] as [number, number, number],
    };
  }
  return {
    headFill: primary,
    headText: [255, 255, 255] as [number, number, number],
    altFill: tint,
    lineColor: border,
  };
}

export async function exportProposalDocumentToPdf(
  options: ExportProposalDocumentPdfOptions
): Promise<{ savedFileName: string; openedNative: boolean }> {
  const {
    styleTemplate,
    context,
    destination,
    dataset,
    savedRab,
    opdNarrative,
    wilayahNarrative,
    opdKetSource,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PROPOSAL_F4_WIDTH_MM, PROPOSAL_F4_HEIGHT_MM],
    compress: true,
  }) as AutoTableDoc;

  const font = getJsPdfFont(styleTemplate.fontStyle);
  const primary = hexToRgb(styleTemplate.palette.primary);
  const secondary = hexToRgb(styleTemplate.palette.secondary);
  const tint = hexToRgb(styleTemplate.palette.tint);
  const border = hexToRgb(styleTemplate.palette.border);
  const tableTheme = getTableThemeStyles(styleTemplate);

  // ============================================================================
  // HALAMAN 1: COVER (Bebas running header)
  // ============================================================================
  drawCoverPage(doc, styleTemplate, context, destination, dataset.totalActiveKpm);

  // Halaman 2+: Isi Dokumen
  doc.addPage([PROPOSAL_F4_WIDTH_MM, PROPOSAL_F4_HEIGHT_MM], 'portrait');
  let cursorY = CONTENT_START_Y + 2;

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > SAFE_BOTTOM_Y) {
      doc.addPage([PROPOSAL_F4_WIDTH_MM, PROPOSAL_F4_HEIGHT_MM], 'portrait');
      cursorY = CONTENT_START_Y + 2;
    }
  };

  const writeSectionHeading = (index: number, rawTitle: string) => {
    ensureSpace(16);
    const label = formatChapterHeading(styleTemplate.chapterFormat, index, rawTitle);
    doc.setFont(font, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...primary);
    doc.text(label, PROPOSAL_F4_MARGIN.left, cursorY);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.4);
    doc.line(
      PROPOSAL_F4_MARGIN.left,
      cursorY + 2,
      PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right,
      cursorY + 2
    );
    cursorY += 7.5;
  };

  const writeParagraphs = (paragraphs: string[]) => {
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const lineH = 5.2;
    for (const para of paragraphs) {
      const clean = String(para || '').trim();
      if (!clean) continue;
      const lines = doc.splitTextToSize(clean, CONTENT_WIDTH_MM) as string[];
      for (const line of lines) {
        ensureSpace(lineH + 1);
        doc.text(line, PROPOSAL_F4_MARGIN.left, cursorY);
        cursorY += lineH;
      }
      cursorY += 2.5;
    }
  };

  const writeBulletPoints = (points: string[]) => {
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const lineH = 5.2;
    points.forEach((pt, idx) => {
      const clean = String(pt || '').trim();
      if (!clean) return;
      const prefix = `${idx + 1}. `;
      const lines = doc.splitTextToSize(clean, CONTENT_WIDTH_MM - 7) as string[];
      ensureSpace(lines.length * lineH + 2);
      doc.setFont(font, 'bold');
      doc.text(prefix, PROPOSAL_F4_MARGIN.left + 1.5, cursorY);
      doc.setFont(font, 'normal');
      lines.forEach((line, lIdx) => {
        if (lIdx > 0) ensureSpace(lineH + 1);
        doc.text(line, PROPOSAL_F4_MARGIN.left + 7.5, cursorY);
        cursorY += lineH;
      });
      cursorY += 1.5;
    });
    cursorY += 2;
  };

  // Judul Atas Halaman 2
  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `PROPOSAL ${styleTemplate.coverMainTitle.replace(/^PROPOSAL\s+/i, '')}`,
    PROPOSAL_F4_MARGIN.left + CONTENT_WIDTH_MM / 2,
    cursorY,
    { align: 'center', maxWidth: CONTENT_WIDTH_MM }
  );
  cursorY += 6;
  doc.setFont(font, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...secondary);
  doc.text(
    `${context.wilayahUpper} · TAHUN ${context.tahun}`,
    PROPOSAL_F4_MARGIN.left + CONTENT_WIDTH_MM / 2,
    cursorY,
    { align: 'center', maxWidth: CONTENT_WIDTH_MM }
  );
  cursorY += 9;

  if (destination === 'OPD') {
    // ============================================================================
    // MODE OPD: Narasi + Lampiran Per Kelompok Master Item (RAB + Daftar KPM)
    // ============================================================================
    let chapterIdx = 1;

    writeSectionHeading(chapterIdx++, opdNarrative.pengantarTitle);
    writeParagraphs(opdNarrative.pengantar);

    writeSectionHeading(chapterIdx++, opdNarrative.tujuanTitle);
    if (opdNarrative.tujuanIntro.trim()) {
      writeParagraphs([opdNarrative.tujuanIntro]);
    }
    writeBulletPoints(opdNarrative.tujuanPoints);

    writeSectionHeading(chapterIdx++, opdNarrative.kegiatanTitle);
    writeParagraphs(opdNarrative.kegiatan);

    writeSectionHeading(chapterIdx++, opdNarrative.anggaranTitle);
    writeParagraphs(opdNarrative.anggaran);

    if (styleTemplate.opdClosingPosition === 'before-appendix') {
      writeSectionHeading(chapterIdx++, opdNarrative.penutupTitle);
      writeParagraphs(opdNarrative.penutup);
    }

    // Halaman baru untuk Lampiran agar tabel RAB & Daftar KPM rapi
    doc.addPage([PROPOSAL_F4_WIDTH_MM, PROPOSAL_F4_HEIGHT_MM], 'portrait');
    cursorY = CONTENT_START_Y + 2;

    writeSectionHeading(
      chapterIdx++,
      'LAMPIRAN RINCIAN ANGGARAN DAN DAFTAR CALON PENERIMA MANFAAT'
    );

    const rabPkgByCode = new Map<string, SavedRabPackage>();
    (savedRab?.packages || []).forEach((pkg) => {
      rabPkgByCode.set(String(pkg.kode || '').trim().toUpperCase(), pkg);
    });

    let grandTotalBiaya = 0;

    dataset.opdGroups.forEach((group, groupIndex) => {
      const rabPkg = rabPkgByCode.get(group.itemCode);
      const penerimaCount = group.kpms.length;

      // Jika kelompok baru tidak cukup ruang untuk header + minimal 3 baris RAB, pindah halaman
      if (groupIndex > 0) {
        ensureSpace(46);
      }

      // Header Banner Kelompok Master Item
      doc.setFillColor(...tint);
      doc.setDrawColor(...border);
      doc.setLineWidth(0.35);
      doc.rect(PROPOSAL_F4_MARGIN.left, cursorY, CONTENT_WIDTH_MM, 7.5, 'FD');
      doc.setFont(font, 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...primary);
      const groupTitle = `${groupIndex + 1}. PAKET ${group.itemCode} — ${
        rabPkg?.namaPaket || group.itemName
      }`.toUpperCase();
      doc.text(groupTitle, PROPOSAL_F4_MARGIN.left + 3, cursorY + 5);
      doc.setFontSize(8.5);
      doc.text(
        `${penerimaCount} Calon Penerima`,
        PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right - 3,
        cursorY + 5,
        { align: 'right' }
      );
      cursorY += 9.5;

      // 1) Tabel RAB Kelompok
      const rabRows: (string | number)[][] = [];
      let groupSubtotalBiaya = 0;
      const subItems = rabPkg?.subItems || [];

      subItems.forEach((sub, sIdx) => {
        const volPerPaket = Math.max(1, Math.floor(sub.volumePerPaket || 1));
        const unitPrice = Math.max(0, Math.round(sub.hargaSatuan || 0));
        const totalUnit = volPerPaket * penerimaCount;
        const totalHarga = totalUnit * unitPrice;
        groupSubtotalBiaya += totalHarga;

        rabRows.push([
          String(sIdx + 1),
          sub.namaBarang,
          `${volPerPaket} ${sub.satuan || 'Unit'}`,
          formatRupiahCurrency(unitPrice),
          `${totalUnit} ${sub.satuan || 'Unit'}`,
          formatRupiahCurrency(totalHarga),
        ]);
      });

      grandTotalBiaya += groupSubtotalBiaya;

      rabRows.push([
        '',
        'Total Calon Penerima',
        '',
        '',
        `${penerimaCount} Orang`,
        '',
      ]);
      rabRows.push([
        '',
        'Total Biaya',
        '',
        '',
        '',
        formatRupiahCurrency(groupSubtotalBiaya),
      ]);

      autoTable(doc, {
        startY: cursorY,
        margin: {
          top: CONTENT_START_Y,
          left: PROPOSAL_F4_MARGIN.left,
          right: PROPOSAL_F4_MARGIN.right,
          bottom: PROPOSAL_F4_MARGIN.bottom + 7,
        },
        head: [['NO', 'NAMA BARANG', 'SATUAN / PAKET', 'HARGA SATUAN', 'TOTAL UNIT', 'TOTAL HARGA']],
        body: rabRows,
        theme: 'grid',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: {
          font,
          fontSize: 8.5,
          cellPadding: { top: 2, right: 2.2, bottom: 2, left: 2.2 },
          lineColor: tableTheme.lineColor,
          lineWidth: 0.2,
          textColor: [30, 41, 59],
          valign: 'middle',
        },
        headStyles: {
          fillColor: tableTheme.headFill,
          textColor: tableTheme.headText,
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 11, halign: 'center' },
          1: { cellWidth: 64, halign: 'left' },
          2: { cellWidth: 23, halign: 'center' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 21, halign: 'center' },
          5: { cellWidth: 32, halign: 'right' },
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const isTotalRow = hookData.row.index >= rabRows.length - 2;
            if (isTotalRow) {
              hookData.cell.styles.fontStyle = 'bold';
              hookData.cell.styles.fillColor = tint;
              hookData.cell.styles.textColor = primary;
            }
          }
        },
      });

      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 3.5;

      // 2) Tabel Daftar KPM Kelompok (Nomor berlanjut 2 digit 01..NN)
      const kpmRows = group.kpms.map((kpm) => [
        padTwoDigits(kpm.continuousNo),
        kpm.nama,
        kpm.alamatLengkap,
        kpm.nikKtp,
        opdKetSource === 'usaha' ? kpm.usahaByItem : kpm.pekerjaanDb,
      ]);

      autoTable(doc, {
        startY: cursorY,
        margin: {
          top: CONTENT_START_Y,
          left: PROPOSAL_F4_MARGIN.left,
          right: PROPOSAL_F4_MARGIN.right,
          bottom: PROPOSAL_F4_MARGIN.bottom + 7,
        },
        head: [['NO', 'NAMA', 'ALAMAT', 'NIK KTP', 'KET / PEKERJAAN']],
        body: kpmRows,
        theme: 'grid',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: {
          font,
          fontSize: 8.2,
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
          lineColor: tableTheme.lineColor,
          lineWidth: 0.2,
          textColor: [30, 41, 59],
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: tableTheme.headFill,
          textColor: tableTheme.headText,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: tableTheme.altFill,
        },
        columnStyles: {
          0: { cellWidth: 11, halign: 'center' },
          1: { cellWidth: 38, halign: 'left' },
          2: { cellWidth: 64, halign: 'left' },
          3: { cellWidth: 34, halign: 'center', overflow: 'linebreak' },
          4: { cellWidth: 34, halign: 'left' },
        },
      });

      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 7;
    });

    // Ringkasan Total Keseluruhan RAB (tinggi kotak dinamis agar teks Terbilang panjang tidak overflow)
    const finalTotal = grandTotalBiaya > 0 ? grandTotalBiaya : savedRab?.totalTerhitung || 0;
    doc.setFont(font, 'italic');
    doc.setFontSize(8.2);
    const terbilangLines = doc.splitTextToSize(
      `Terbilang: ${formatRupiahTerbilang(finalTotal)}`,
      CONTENT_WIDTH_MM - 8
    ) as string[];
    const terbilangLineH = 4.2;
    const summaryBoxHeight = Math.max(16, 10.5 + terbilangLines.length * terbilangLineH + 2.5);
    ensureSpace(summaryBoxHeight + 6);
    doc.setFillColor(...tint);
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.45);
    doc.rect(PROPOSAL_F4_MARGIN.left, cursorY, CONTENT_WIDTH_MM, summaryBoxHeight, 'FD');
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...primary);
    doc.text(
      `TOTAL KESELURUHAN: ${dataset.totalActiveKpm} CALON PENERIMA MANFAAT`,
      PROPOSAL_F4_MARGIN.left + 4,
      cursorY + 6
    );
    doc.text(
      formatRupiahCurrency(finalTotal),
      PROPOSAL_F4_WIDTH_MM - PROPOSAL_F4_MARGIN.right - 4,
      cursorY + 6,
      { align: 'right' }
    );
    doc.setFont(font, 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(51, 65, 85);
    terbilangLines.forEach((line, idx) => {
      doc.text(line, PROPOSAL_F4_MARGIN.left + 4, cursorY + 12 + idx * terbilangLineH);
    });
    cursorY += summaryBoxHeight + 6;

    if (styleTemplate.opdClosingPosition === 'after-appendix') {
      writeSectionHeading(chapterIdx++, opdNarrative.penutupTitle);
      writeParagraphs(opdNarrative.penutup);
    }
  } else {
    // ============================================================================
    // MODE KELURAHAN / KECAMATAN: Tanpa RAB & Tanpa Harga, 1 Tabel KPM Utuh
    // ============================================================================
    let chapterIdx = 1;

    writeSectionHeading(chapterIdx++, wilayahNarrative.pendahuluanTitle);
    writeParagraphs(wilayahNarrative.pendahuluan);

    writeSectionHeading(chapterIdx++, wilayahNarrative.maksudTujuanTitle);
    ensureSpace(14);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primary);
    doc.text(`${wilayahNarrative.maksudLabel}:`, PROPOSAL_F4_MARGIN.left, cursorY);
    cursorY += 5.2;
    writeParagraphs([wilayahNarrative.maksud]);

    ensureSpace(14);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primary);
    doc.text(`${wilayahNarrative.tujuanLabel}:`, PROPOSAL_F4_MARGIN.left, cursorY);
    cursorY += 5.5;
    writeBulletPoints(wilayahNarrative.tujuanPoints);

    writeSectionHeading(chapterIdx++, wilayahNarrative.lampiranTitle);
    writeParagraphs([wilayahNarrative.lampiranIntro]);

    const unifiedRows = dataset.wilayahSortedRows.map((row) => [
      padTwoDigits(row.seqNo),
      row.nama,
      row.alamatJalan,
      row.rtPadded,
      row.rwPadded,
      row.nikKtp,
      row.desilText,
      row.kelurahan,
    ]);

    autoTable(doc, {
      startY: cursorY,
      margin: {
        top: CONTENT_START_Y,
        left: PROPOSAL_F4_MARGIN.left,
        right: PROPOSAL_F4_MARGIN.right,
        bottom: PROPOSAL_F4_MARGIN.bottom + 7,
      },
      head: [['No.', 'Nama Calon KPM', 'Alamat', 'RT', 'RW', 'NIK KTP', 'Desil', 'KEL']],
      body: unifiedRows,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font,
        fontSize: 8,
        cellPadding: { top: 2, right: 1.8, bottom: 2, left: 1.8 },
        lineColor: tableTheme.lineColor,
        lineWidth: 0.2,
        textColor: [30, 41, 59],
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: tableTheme.headFill,
        textColor: tableTheme.headText,
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: tableTheme.altFill,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 34, halign: 'left' },
        2: { cellWidth: 46, halign: 'left' },
        3: { cellWidth: 11, halign: 'center' },
        4: { cellWidth: 11, halign: 'center' },
        5: { cellWidth: 33, halign: 'center', overflow: 'linebreak' },
        6: { cellWidth: 11, halign: 'center' },
        7: { cellWidth: 25, halign: 'left' },
      },
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 9;

    writeSectionHeading(chapterIdx++, wilayahNarrative.penutupTitle);
    writeParagraphs(wilayahNarrative.penutup);
  }

  // Terapkan Running Header & Footer hanya pada halaman 2..N (Halaman 1 Cover bersih)
  drawRunningHeaderAndFooterOnContentPages(doc, styleTemplate, context, destination);

  const fileName = context.buildFileName(destination);
  return saveOrOpenProposalPdfDocument(doc, fileName);
}
