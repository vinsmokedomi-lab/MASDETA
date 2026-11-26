import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PengelolaBookingItem, PengelolaBookingStatus } from '../types/kpm';
import { F4_PAPER_HEIGHT_MM, F4_PAPER_WIDTH_MM, sanitizePdfFileName } from './pdfFormatHelpers';

const STATUS_LABELS: Record<PengelolaBookingStatus, string> = {
  booked: 'Dibooking',
  assigned: 'Masuk Proposal',
  cancelled: 'Batal',
};

async function saveNativeOrWebFile(
  fileName: string,
  mimeType: string,
  blobOrBase64: { blob: Blob; base64: string }
): Promise<{ savedFileName: string; openedNative: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blobOrBase64.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { savedFileName: fileName, openedNative: false };
  }

  const writeTargets: { directory: Directory; path: string }[] = [
    { directory: Directory.Documents, path: `MASDETA/${fileName}` },
    { directory: Directory.Cache, path: fileName },
  ];

  let writtenUri: string | null = null;
  for (const target of writeTargets) {
    try {
      await Filesystem.writeFile({
        path: target.path,
        data: blobOrBase64.base64,
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
      // Coba folder fallback
    }
  }

  if (!writtenUri) {
    throw new Error('Gagal menyimpan dokumen ke penyimpanan perangkat.');
  }

  await FileOpener.openFile({
    path: writtenUri,
    mimeType,
  });

  return { savedFileName: fileName, openedNative: true };
}

export async function exportPengelolaBookingsToPdf(options: {
  bookings: PengelolaBookingItem[];
  title: string;
  subtitle?: string;
  fileName: string;
}): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const { bookings, title, subtitle, fileName } = options;
  const sorted = [...bookings].sort((a, b) => {
    const yearCmp = (a.targetTahun || '').localeCompare(b.targetTahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.targetProposal || 'zzz').localeCompare(b.targetProposal || 'zzz', 'id');
    if (propCmp !== 0) return propCmp;
    if (a.priority !== b.priority) return a.priority === 'prioritas' ? -1 : 1;
    return a.pengelolaName.localeCompare(b.pengelolaName, 'id');
  });

  // F4 Landscape agar kolom target proposal, wilayah, estimasi & catatan lega
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [F4_PAPER_WIDTH_MM, F4_PAPER_HEIGHT_MM],
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const metaParts: string[] = [];
  if (subtitle) metaParts.push(subtitle);
  const totalEstimasi = sorted
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + Math.max(0, Number(b.estimasiKpm) || 0), 0);
  metaParts.push(`${sorted.length} Booking · Estimasi ${totalEstimasi} KPM`);
  metaParts.push(
    `Dicetak ${new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`
  );
  doc.text(metaParts.join('  |  '), marginX, 20.5);

  const bodyRows = sorted.map((item, idx) => {
    const wilayahText = [item.kelurahan, item.kecamatan, item.alamatCatatan]
      .filter((v) => Boolean(v && v.trim()))
      .join(', ');
    return [
      String(idx + 1),
      item.targetTahun || '-',
      item.targetProposal || 'Belum ditentukan',
      item.pengelolaName + (item.priority === 'prioritas' ? ' [PRIORITAS]' : ''),
      item.kontak || '-',
      wilayahText || '-',
      item.estimasiKpm > 0 ? String(item.estimasiKpm) : '-',
      item.rencanaItem || '-',
      STATUS_LABELS[item.status] || item.status,
      item.catatan || '-',
    ];
  });

  autoTable(doc, {
    startY: 25,
    margin: { left: marginX, right: marginX, bottom: 14 },
    head: [
      [
        'No',
        'Tahun',
        'Rencana Proposal',
        'Pengelola / Kontak',
        'No. HP / WA',
        'Wilayah / Gang',
        'Est. KPM',
        'Rencana Item',
        'Status',
        'Catatan',
      ],
    ],
    body: bodyRows,
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      valign: 'top',
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 44 },
      3: { cellWidth: 38 },
      4: { cellWidth: 26 },
      5: { cellWidth: 42 },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 26 },
      8: { cellWidth: 24 },
      9: { cellWidth: 'auto' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount}`,
        pageWidth - marginX,
        doc.internal.pageSize.getHeight() - 7,
        { align: 'right' }
      );
    },
  });

  const safeName = `${sanitizePdfFileName(fileName)}.pdf`;
  const pdfBlob = doc.output('blob');
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1] || '';

  const saved = await saveNativeOrWebFile(safeName, 'application/pdf', {
    blob: pdfBlob,
    base64,
  });

  return { ...saved, count: sorted.length };
}

export async function exportPengelolaBookingsToXlsx(options: {
  bookings: PengelolaBookingItem[];
  title: string;
  fileName: string;
}): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
  const { bookings, title, fileName } = options;
  const sorted = [...bookings].sort((a, b) => {
    const yearCmp = (a.targetTahun || '').localeCompare(b.targetTahun || '');
    if (yearCmp !== 0) return yearCmp;
    const propCmp = (a.targetProposal || 'zzz').localeCompare(b.targetProposal || 'zzz', 'id');
    if (propCmp !== 0) return propCmp;
    return a.pengelolaName.localeCompare(b.pengelolaName, 'id');
  });

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const rows = [
    [title],
    [
      'No',
      'Tahun Target',
      'Target Proposal / Tahap',
      'Nama Pengelola',
      'Prioritas',
      'No. HP / WA',
      'Kecamatan',
      'Kelurahan',
      'Gang / Alamat Wilayah',
      'Estimasi KPM',
      'Rencana Item',
      'Status',
      'Catatan',
      'Dicatat Oleh',
    ],
    ...sorted.map((item, idx) => [
      idx + 1,
      item.targetTahun || '',
      item.targetProposal || '',
      item.pengelolaName || '',
      item.priority === 'prioritas' ? 'Prioritas' : 'Normal',
      item.kontak || '',
      item.kecamatan || '',
      item.kelurahan || '',
      item.alamatCatatan || '',
      item.estimasiKpm || 0,
      item.rencanaItem || '',
      STATUS_LABELS[item.status] || item.status,
      item.catatan || '',
      item.createdBy || '',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 30 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 20 },
    { wch: 26 },
    { wch: 13 },
    { wch: 20 },
    { wch: 16 },
    { wch: 36 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Booking Pengelola');

  const safeName = `${sanitizePdfFileName(fileName)}.xlsx`;
  const mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;

  const saved = await saveNativeOrWebFile(safeName, mimeType, {
    blob: new Blob([arrayBuf], { type: mimeType }),
    base64,
  });

  return { ...saved, count: sorted.length };
}
