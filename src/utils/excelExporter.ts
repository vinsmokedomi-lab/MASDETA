import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import * as XLSX from 'xlsx';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import { ItemBantuan, KpmRecord, ProposalRecord, ReportTemplateConfig, WilayahKabKota } from '../types/kpm';
import {
  formatKecamatanCategoryLabel,
  getAbsenSeq,
  getItemHierarchyRank,
  resolveKpmDomicile,
  resolvePackageForKpm,
} from './imageProcessor';

function sanitizeExcelFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const base = cleaned || 'masdeta_kpm';
  return base.toLowerCase().endsWith('.xlsx') ? base : `${base}.xlsx`;
}

export async function exportKpmRecordsToExcel({
  records,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  fileName,
  reportTemplate,
}: {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  fileName: string;
  reportTemplate?: ReportTemplateConfig;
}): Promise<{ savedFileName: string; openedNative: boolean; count: number }> {
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

  const rows = sortedRecords.map((rec, idx) => {
    const seq = getAbsenSeq(rec.registerCode);
    const noAbsen = seq < 999999 ? String(seq).padStart(2, '0') : String(idx + 1).padStart(2, '0');
    const domicile = resolveKpmDomicile(rec, proposals, wilayahList);
    const kelurahan = (domicile.kelurahan || '-').trim();
    const kecamatan = domicile.kecamatan
      ? formatKecamatanCategoryLabel(domicile.kecamatan)
      : 'Wilayah Lainnya';
    const pkg = resolvePackageForKpm(items, rec.tahun, rec.item);
    const statusLabel =
      rec.validasi === 'accepted'
        ? 'Diterima'
        : rec.validasi === 'rejected'
          ? 'Ditolak'
          : 'Menunggu';

    const proposalLabel =
      rec.proposal?.trim() ||
      (rec.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');

    return {
      No: noAbsen,
      'Kode Register': rec.registerCode || '-',
      Tahun: rec.tahun || 'Tanpa Tahun',
      Proposal: proposalLabel,
      Kecamatan: kecamatan,
      'Kelurahan / Desa': kelurahan,
      'Kode Item': rec.item || '-',
      'Nama Paket': pkg.name && pkg.name !== pkg.code ? pkg.name : rec.item || '-',
      'NIK KTP': rec.nikKtp || '-',
      'Nomor KK': rec.nikKk || '-',
      'Nama Lengkap': (rec.nama || '-').toUpperCase(),
      Alamat: rec.alamat || '-',
      RT: rec.rt ? rec.rt.padStart(3, '0') : '-',
      RW: rec.rw ? rec.rw.padStart(3, '0') : '-',
      'Status DTSEN': rec.dtsen || '-',
      'Status Validasi': statusLabel,
      Kontak: rec.kontak || '-',
      Pekerjaan: rec.pekerjaan || '-',
      Pengelola: rec.pengelola || '-',
      'Biaya Administrasi': rec.payment || 0,
      Catatan: rec.catatan || '-',
    };
  });

  let worksheet: XLSX.WorkSheet;
  if (reportTemplate?.enabled) {
    const kopRows: string[][] = [];
    if (reportTemplate.orgHeaderLine1?.trim()) {
      kopRows.push([reportTemplate.orgHeaderLine1.trim().toUpperCase()]);
    }
    if (reportTemplate.orgHeaderLine2?.trim()) {
      kopRows.push([reportTemplate.orgHeaderLine2.trim()]);
    }
    if (reportTemplate.orgAddress?.trim()) {
      kopRows.push([reportTemplate.orgAddress.trim()]);
    }
    kopRows.push([]);
    worksheet = XLSX.utils.aoa_to_sheet(kopRows);
    XLSX.utils.sheet_add_json(worksheet, rows, {
      origin: `A${kopRows.length + 1}`,
    });
  } else {
    worksheet = XLSX.utils.json_to_sheet(rows);
  }
  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 18 }, // Kode Register
    { wch: 8 },  // Tahun
    { wch: 30 }, // Proposal
    { wch: 24 }, // Kecamatan
    { wch: 24 }, // Kelurahan
    { wch: 10 }, // Kode Item
    { wch: 22 }, // Nama Paket
    { wch: 19 }, // NIK KTP
    { wch: 19 }, // Nomor KK
    { wch: 28 }, // Nama Lengkap
    { wch: 34 }, // Alamat
    { wch: 6 },  // RT
    { wch: 6 },  // RW
    { wch: 14 }, // Status DTSEN
    { wch: 14 }, // Status Validasi
    { wch: 16 }, // Kontak
    { wch: 20 }, // Pekerjaan
    { wch: 20 }, // Pengelola
    { wch: 16 }, // Biaya Administrasi
    { wch: 28 }, // Catatan
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data KPM');

  const safeName = sanitizeExcelFileName(fileName);

  if (!Capacitor.isNativePlatform()) {
    XLSX.writeFile(workbook, safeName);
    return { savedFileName: safeName, openedNative: false, count: sortedRecords.length };
  }

  const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }) as string;
  const writeTargets: { directory: Directory; path: string }[] = [
    { directory: Directory.Documents, path: `MASDETA/${safeName}` },
    { directory: Directory.Cache, path: safeName },
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
      // Coba direktori berikutnya
    }
  }

  if (!writtenUri) {
    throw new Error('Gagal menyimpan file Excel ke penyimpanan perangkat.');
  }

  await FileOpener.openFile({
    path: writtenUri,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return { savedFileName: safeName, openedNative: true, count: sortedRecords.length };
}
