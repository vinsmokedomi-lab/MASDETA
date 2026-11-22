import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import type * as XLSXTypes from 'xlsx';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  getAbsenSeq,
  getItemHierarchyRank,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalKecamatanCategory,
  resolveProposalSlotStateForGroup,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from './imageProcessor';

export interface ExportKpmXlsxOptions {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  title: string;
  subtitle?: string;
  fileName: string;
  includeEmptySlots?: boolean;
  splitByProposal?: boolean;
  proposalMeta?: {
    id?: string;
    namaProposal: string;
    tahun: string;
  };
}

function sanitizeXlsxFileName(raw: string): string {
  const cleaned = (raw || 'Daftar_KPM')
    .replace(/\.xlsx$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleaned || 'Daftar_KPM'}.xlsx`;
}

function sanitizeExcelSheetName(raw: string, usedNames: Set<string>): string {
  // Excel melarang karakter : \ / ? * [ ] dan membatasi nama sheet maks 31 karakter
  const base = (raw || 'Sheet')
    .replace(/[:\\/?*[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';

  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function cleanDigitsOnly(raw?: string): string {
  return (raw || '').replace(/\D+/g, '');
}

function formatRtRwPart(raw?: string): string {
  const digits = cleanDigitsOnly(raw);
  if (!digits) return (raw || '').trim();
  return digits.padStart(3, '0');
}

function formatDesilShort(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d+(?:\s*-\s*\d+)?)/);
  return match ? match[1].replace(/\s+/g, '') : trimmed;
}

function formatValidationLabel(status: KpmRecord['validasi']): string {
  if (status === 'accepted') return 'Diterima';
  if (status === 'rejected') return 'Ditolak';
  return 'Menunggu';
}

function applyWorksheetColumnWidths(
  ws: XLSXTypes.WorkSheet,
  rows: (string | number)[][],
  minWidths?: number[],
  maxWidth = 44
): void {
  if (rows.length === 0) return;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const cols: XLSXTypes.ColInfo[] = [];

  for (let c = 0; c < colCount; c += 1) {
    let best = minWidths?.[c] ?? 8;
    for (let r = 0; r < rows.length; r += 1) {
      // Lewati baris judul atas (indeks 0 & 1) saat menghitung lebar kolom sempit seperti NO/ITEM
      if (r < 2 && c < 3) continue;
      const val = rows[r]?.[c];
      if (val === undefined || val === null) continue;
      const len = String(val).length;
      if (len + 3 > best) best = len + 3;
    }
    cols.push({ wch: Math.min(maxWidth, best) });
  }
  ws['!cols'] = cols;
}

function sanitizeSpreadsheetText(raw: string): string {
  if (!raw) return '';
  // Lindungi dari Excel/CSV formula injection tanpa merusak placeholder '-' tunggal
  if (raw !== '-' && /^[=+\-@\t\r]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

function forceTextColumnsOnWorksheet(
  XLSX: typeof XLSXTypes,
  ws: XLSXTypes.WorkSheet,
  headerRowIdx: number,
  rowCount: number,
  textColIndices: number[]
): void {
  for (let r = headerRowIdx + 1; r < rowCount; r += 1) {
    for (const c of textColIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const strVal = String(cell.v ?? '');
      cell.t = 's';
      cell.v = strVal;
      cell.z = '@';
    }
  }
}

interface BuiltSheetRow {
  no: string;
  item: string;
  namaItem: string;
  nama: string;
  nikKtp: string;
  nikKk: string;
  alamat: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  desil: string;
  kontak: string;
  pekerjaan: string;
  pengelola: string;
  status: string;
  catatan: string;
  proposal?: string;
  tahun?: string;
  isEmptySlot?: boolean;
}

function buildRowsForSingleGroup(params: {
  groupRecords: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  proposalSlotMap: ProposalSlotMap;
  includeEmptySlots: boolean;
  proposalMeta?: { id?: string; namaProposal: string; tahun: string };
}): {
  rows: BuiltSheetRow[];
  filledCount: number;
  emptyCount: number;
  itemSummary: Map<string, { name: string; filled: number; empty: number }>;
} {
  const {
    groupRecords,
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    includeEmptySlots,
    proposalMeta,
  } = params;

  const itemSummary = new Map<string, { name: string; filled: number; empty: number }>();
  const addSummary = (codeRaw: string, tahunRef: string, isEmpty: boolean) => {
    const code = (codeRaw || '').trim().toUpperCase();
    if (!code) return;
    const pkg = resolvePackageForKpm(items, tahunRef, code);
    const cur = itemSummary.get(code) ?? {
      name: pkg.name && pkg.name !== code ? pkg.name : code,
      filled: 0,
      empty: 0,
    };
    if (isEmpty) cur.empty += 1;
    else cur.filled += 1;
    itemSummary.set(code, cur);
  };

  const rows: BuiltSheetRow[] = [];
  let filledCount = 0;
  let emptyCount = 0;

  if (proposalMeta) {
    const slotRes = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      proposalMeta.id,
      proposalMeta.namaProposal,
      proposalMeta.tahun
    );
    const mergedSlots = buildMergedProposalSlots({
      groupRecords,
      slotState: includeEmptySlots ? slotRes.state : undefined,
      proposals,
      catalog: items,
      wilayahList,
    });

    for (const slot of mergedSlots) {
      const noStr = String(slot.slotNumber).padStart(2, '0');
      if (slot.kind === 'empty') {
        if (!includeEmptySlots) continue;
        const itemCode = (slot.emptySlot.item || '').trim().toUpperCase();
        const pkg = itemCode ? resolvePackageForKpm(items, proposalMeta.tahun, itemCode) : null;
        const itemName = pkg && pkg.name && pkg.name !== itemCode ? pkg.name : itemCode;
        addSummary(itemCode, proposalMeta.tahun, true);
        emptyCount += 1;
        rows.push({
          no: noStr,
          item: itemCode,
          namaItem: itemName,
          nama: '',
          nikKtp: '',
          nikKk: '',
          alamat: '',
          rt: '',
          rw: '',
          kelurahan: '',
          kecamatan: '',
          desil: '',
          kontak: '',
          pekerjaan: '',
          pengelola: '',
          status: 'Baris Kosong',
          catatan: slot.emptySlot.previousKpmName
            ? `Slot kosong bekas ${slot.emptySlot.previousKpmName}`
            : 'Slot kosong cadangan',
          proposal: proposalMeta.namaProposal,
          tahun: proposalMeta.tahun,
          isEmptySlot: true,
        });
      } else {
        const rec = slot.record;
        const itemCode = (rec.item || '').trim().toUpperCase();
        const pkg = resolvePackageForKpm(items, rec.tahun || proposalMeta.tahun, itemCode);
        const itemName = pkg.name && pkg.name !== itemCode ? pkg.name : itemCode;
        const dom = resolveKpmDomicile(rec, proposals, wilayahList);
        addSummary(itemCode, rec.tahun || proposalMeta.tahun, false);
        filledCount += 1;
        rows.push({
          no: noStr,
          item: itemCode,
          namaItem: itemName,
          nama: (rec.nama || '').trim(),
          nikKtp: cleanDigitsOnly(rec.nikKtp) || (rec.nikKtp || '').trim(),
          nikKk: cleanDigitsOnly(rec.nikKk) || (rec.nikKk || '').trim(),
          alamat: (rec.alamat || '').trim(),
          rt: formatRtRwPart(rec.rt),
          rw: formatRtRwPart(rec.rw),
          kelurahan: (dom.kelurahan || rec.kelurahan || '').trim(),
          kecamatan: (dom.kecamatan || rec.kecamatan || '').trim(),
          desil: formatDesilShort(rec.dtsen),
          kontak: (rec.kontak || '').trim(),
          pekerjaan: (rec.pekerjaan || '').trim(),
          pengelola: (rec.pengelola || '').trim(),
          status: formatValidationLabel(rec.validasi),
          catatan: (rec.catatan || '').trim(),
          proposal: rec.proposal || proposalMeta.namaProposal,
          tahun: rec.tahun || proposalMeta.tahun,
          isEmptySlot: false,
        });
      }
    }

    return { rows, filledCount, emptyCount, itemSummary };
  }

  // Fallback untuk daftar tanpa meta proposal tunggal (mis. Database KPM / Arsip / filter pengelola)
  const sorted = [...groupRecords].sort((a, b) => {
    const seqA = getAbsenSeq(a.registerCode);
    const seqB = getAbsenSeq(b.registerCode);
    if (seqA !== seqB) return seqA - seqB;
    return (a.nama || '').localeCompare(b.nama || '', 'id');
  });

  sorted.forEach((rec, idx) => {
    const itemCode = (rec.item || '').trim().toUpperCase();
    const pkg = resolvePackageForKpm(items, rec.tahun, itemCode);
    const itemName = pkg.name && pkg.name !== itemCode ? pkg.name : itemCode;
    const dom = resolveKpmDomicile(rec, proposals, wilayahList);
    addSummary(itemCode, rec.tahun, false);
    filledCount += 1;
    rows.push({
      no: String(idx + 1).padStart(2, '0'),
      item: itemCode,
      namaItem: itemName,
      nama: (rec.nama || '').trim(),
      nikKtp: cleanDigitsOnly(rec.nikKtp) || (rec.nikKtp || '').trim(),
      nikKk: cleanDigitsOnly(rec.nikKk) || (rec.nikKk || '').trim(),
      alamat: (rec.alamat || '').trim(),
      rt: formatRtRwPart(rec.rt),
      rw: formatRtRwPart(rec.rw),
      kelurahan: (dom.kelurahan || rec.kelurahan || '').trim(),
      kecamatan: (dom.kecamatan || rec.kecamatan || '').trim(),
      desil: formatDesilShort(rec.dtsen),
      kontak: (rec.kontak || '').trim(),
      pekerjaan: (rec.pekerjaan || '').trim(),
      pengelola: (rec.pengelola || '').trim(),
      status: formatValidationLabel(rec.validasi),
      catatan: (rec.catatan || '').trim(),
      proposal: rec.proposal || '',
      tahun: rec.tahun || '',
      isEmptySlot: false,
    });
  });

  return { rows, filledCount, emptyCount, itemSummary };
}

function createKpmWorksheet(
  XLSX: typeof XLSXTypes,
  params: {
    title: string;
    subtitle: string;
    rows: BuiltSheetRow[];
    includeProposalCols: boolean;
  }
): XLSXTypes.WorkSheet {
  const { title, subtitle, rows, includeProposalCols } = params;

  const headers = includeProposalCols
    ? [
        'NO',
        'TAHUN',
        'PROPOSAL',
        'ITEM',
        'NAMA ITEM',
        'NAMA KPM',
        'NIK KTP',
        'NO. KK',
        'ALAMAT',
        'RT',
        'RW',
        'KELURAHAN',
        'KECAMATAN',
        'DESIL',
        'NO. HP',
        'PEKERJAAN',
        'PENGELOLA',
        'STATUS',
        'CATATAN',
      ]
    : [
        'NO',
        'ITEM',
        'NAMA ITEM',
        'NAMA KPM',
        'NIK KTP',
        'NO. KK',
        'ALAMAT',
        'RT',
        'RW',
        'KELURAHAN',
        'KECAMATAN',
        'DESIL',
        'NO. HP',
        'PEKERJAAN',
        'PENGELOLA',
        'STATUS',
        'CATATAN',
      ];

  const aoa: (string | number)[][] = [
    [title],
    [subtitle],
    [],
    headers,
    ...rows.map((r) =>
      includeProposalCols
        ? [
            r.no,
            r.tahun || '',
            sanitizeSpreadsheetText(r.proposal || ''),
            sanitizeSpreadsheetText(r.item),
            sanitizeSpreadsheetText(r.namaItem),
            sanitizeSpreadsheetText(r.nama),
            r.nikKtp,
            r.nikKk,
            sanitizeSpreadsheetText(r.alamat),
            r.rt,
            r.rw,
            sanitizeSpreadsheetText(r.kelurahan),
            sanitizeSpreadsheetText(r.kecamatan),
            sanitizeSpreadsheetText(r.desil),
            sanitizeSpreadsheetText(r.kontak),
            sanitizeSpreadsheetText(r.pekerjaan),
            sanitizeSpreadsheetText(r.pengelola),
            sanitizeSpreadsheetText(r.status),
            sanitizeSpreadsheetText(r.catatan),
          ]
        : [
            r.no,
            sanitizeSpreadsheetText(r.item),
            sanitizeSpreadsheetText(r.namaItem),
            sanitizeSpreadsheetText(r.nama),
            r.nikKtp,
            r.nikKk,
            sanitizeSpreadsheetText(r.alamat),
            r.rt,
            r.rw,
            sanitizeSpreadsheetText(r.kelurahan),
            sanitizeSpreadsheetText(r.kecamatan),
            sanitizeSpreadsheetText(r.desil),
            sanitizeSpreadsheetText(r.kontak),
            sanitizeSpreadsheetText(r.pekerjaan),
            sanitizeSpreadsheetText(r.pengelola),
            sanitizeSpreadsheetText(r.status),
            sanitizeSpreadsheetText(r.catatan),
          ]
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const headerRowIdx = 3;
  const lastColIdx = headers.length - 1;
  const lastRowIdx = aoa.length - 1;

  // Merge baris judul & subjudul selebar tabel
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } },
  ];

  // AutoFilter aktif pada baris header untuk memudahkan filter di Excel
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIdx, c: 0 },
      e: { r: Math.max(headerRowIdx, lastRowIdx), c: lastColIdx },
    }),
  };

  // Pastikan NO, NIK KTP, NO. KK, RT, RW, NO. HP selalu bertipe teks agar nol di depan & 16 digit NIK aman
  const textCols = includeProposalCols
    ? [0, 1, 6, 7, 9, 10, 13, 14]
    : [0, 4, 5, 7, 8, 11, 12];
  forceTextColumnsOnWorksheet(XLSX, ws, headerRowIdx, aoa.length, textCols);

  const minWidths = includeProposalCols
    ? [6, 8, 24, 8, 18, 24, 19, 19, 30, 6, 6, 18, 18, 8, 15, 16, 15, 13, 22]
    : [6, 8, 18, 24, 19, 19, 30, 6, 6, 18, 18, 8, 15, 16, 15, 13, 22];
  applyWorksheetColumnWidths(ws, aoa, minWidths, 46);

  return ws;
}

function createItemSummaryWorksheet(
  XLSX: typeof XLSXTypes,
  params: {
    title: string;
    itemSummary: Map<string, { name: string; filled: number; empty: number }>;
    items: ItemBantuan[];
    tahunRef: string;
  }
): XLSXTypes.WorkSheet {
  const { title, itemSummary, items, tahunRef } = params;
  const entries = Array.from(itemSummary.entries()).sort(([codeA], [codeB]) => {
    const rankA = getItemHierarchyRank(codeA, tahunRef, items);
    const rankB = getItemHierarchyRank(codeB, tahunRef, items);
    if (rankA !== rankB) return rankA - rankB;
    return codeA.localeCompare(codeB, 'id');
  });

  let totalFilled = 0;
  let totalEmpty = 0;
  const aoa: (string | number)[][] = [
    [`REKAP ITEM — ${title}`],
    [],
    ['NO', 'KODE ITEM', 'NAMA ITEM', 'KPM TERISI', 'BARIS KOSONG', 'TOTAL SLOT'],
    ...entries.map(([code, meta], idx) => {
      totalFilled += meta.filled;
      totalEmpty += meta.empty;
      return [idx + 1, code, meta.name, meta.filled, meta.empty, meta.filled + meta.empty];
    }),
    ['', 'TOTAL', '', totalFilled, totalEmpty, totalFilled + totalEmpty],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  applyWorksheetColumnWidths(ws, aoa, [6, 12, 26, 13, 14, 13], 38);
  return ws;
}

async function saveOrOpenXlsxWorkbook(
  XLSX: typeof XLSXTypes,
  workbook: XLSXTypes.WorkBook,
  rawFileName: string
): Promise<{ savedFileName: string; openedNative: boolean }> {
  const fileName = sanitizeXlsxFileName(rawFileName);
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (!Capacitor.isNativePlatform()) {
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
    return { savedFileName: fileName, openedNative: false };
  }

  const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }) as string;
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
    throw new Error('Gagal menyimpan file Excel (.xlsx) ke penyimpanan perangkat.');
  }

  await FileOpener.openFile({
    path: writtenUri,
    mimeType,
  });

  return { savedFileName: fileName, openedNative: true };
}

export async function exportKpmTableToXlsx(
  options: ExportKpmXlsxOptions
): Promise<{
  savedFileName: string;
  openedNative: boolean;
  count: number;
  emptyCount: number;
}> {
  const {
    records,
    proposals,
    items,
    wilayahList = INITIAL_WILAYAH_LIST,
    proposalSlotMap = {},
    title,
    subtitle,
    fileName,
    includeEmptySlots = true,
    splitByProposal = false,
    proposalMeta,
  } = options;

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const exportedAt = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (proposalMeta || !splitByProposal) {
    const built = buildRowsForSingleGroup({
      groupRecords: records,
      proposals,
      items,
      wilayahList,
      proposalSlotMap,
      includeEmptySlots,
      proposalMeta,
    });

    if (built.rows.length === 0) {
      throw new Error('Tidak ada data KPM untuk diekspor ke Excel (.xlsx).');
    }

    const summaryLine = [
      subtitle || '',
      `Total: ${built.filledCount} KPM${built.emptyCount > 0 ? ` + ${built.emptyCount} Baris Kosong` : ''}`,
      `Diekspor: ${exportedAt}`,
    ]
      .filter(Boolean)
      .join('  ·  ');

    const kpmSheet = createKpmWorksheet(XLSX, {
      title: `DAFTAR KPM — ${title}`,
      subtitle: summaryLine,
      rows: built.rows,
      includeProposalCols: !proposalMeta,
    });
    XLSX.utils.book_append_sheet(wb, kpmSheet, sanitizeExcelSheetName('Daftar KPM', usedSheetNames));

    if (built.itemSummary.size > 0) {
      const summarySheet = createItemSummaryWorksheet(XLSX, {
        title,
        itemSummary: built.itemSummary,
        items,
        tahunRef: proposalMeta?.tahun || 'all',
      });
      XLSX.utils.book_append_sheet(
        wb,
        summarySheet,
        sanitizeExcelSheetName('Rekap Item', usedSheetNames)
      );
    }

    const saved = await saveOrOpenXlsxWorkbook(XLSX, wb, fileName);
    return {
      ...saved,
      count: built.filledCount,
      emptyCount: built.emptyCount,
    };
  }

  // Mode multi-proposal: sheet gabungan "Semua KPM" + "Rekap Item" + tab per proposal
  interface MultiGroup {
    key: string;
    proposalId?: string;
    proposalName: string;
    tahun: string;
    kecamatanCategory: string;
    groupRecords: KpmRecord[];
  }

  const groupMap = new Map<string, MultiGroup>();
  const propById = new Map<string, ProposalRecord>();
  const propByNameYear = new Map<string, ProposalRecord>();
  for (const p of proposals) {
    if (p.id) propById.set(p.id, p);
    const k = `${(p.namaProposal || '').trim().toLowerCase()}__${(p.tahun || '').trim()}`;
    if (!propByNameYear.has(k)) propByNameYear.set(k, p);
  }

  for (const rec of records) {
    const rawName = (rec.proposal || '').trim() || 'Tanpa Proposal';
    const yr = (rec.tahun || '').trim();
    const matched =
      (rec.proposalId ? propById.get(rec.proposalId) : undefined) ??
      propByNameYear.get(`${rawName.toLowerCase()}__${yr}`);
    const resolvedName = matched?.namaProposal?.trim() || rawName;
    const resolvedYear = matched?.tahun?.trim() || yr;
    const key = `${resolvedName.toLowerCase()}__${resolvedYear}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        key,
        proposalId: matched?.id ?? rec.proposalId ?? undefined,
        proposalName: resolvedName,
        tahun: resolvedYear,
        kecamatanCategory: resolveProposalKecamatanCategory(
          resolvedName,
          proposals,
          resolvedYear,
          wilayahList
        ),
        groupRecords: [],
      };
      groupMap.set(key, g);
    }
    g.groupRecords.push(rec);
  }

  const groupsByKec = new Map<string, MultiGroup[]>();
  for (const g of groupMap.values()) {
    const list = groupsByKec.get(g.kecamatanCategory) ?? [];
    list.push(g);
    groupsByKec.set(g.kecamatanCategory, list);
  }
  const orderedGroups: MultiGroup[] = [];
  for (const cat of Array.from(groupsByKec.keys()).sort(sortKecamatanCategoryNames)) {
    orderedGroups.push(...sortProposalsWithinKecamatan(groupsByKec.get(cat) ?? [], (x) => x.proposalName));
  }

  const combinedRows: BuiltSheetRow[] = [];
  const combinedItemSummary = new Map<string, { name: string; filled: number; empty: number }>();
  const perProposalSheets: Array<{ name: string; ws: XLSXTypes.WorkSheet }> = [];
  let totalFilled = 0;
  let totalEmpty = 0;

  for (const grp of orderedGroups) {
    const hasProposal = grp.proposalName !== 'Tanpa Proposal';
    const built = buildRowsForSingleGroup({
      groupRecords: grp.groupRecords,
      proposals,
      items,
      wilayahList,
      proposalSlotMap,
      includeEmptySlots: includeEmptySlots && hasProposal,
      proposalMeta: hasProposal
        ? { id: grp.proposalId, namaProposal: grp.proposalName, tahun: grp.tahun }
        : undefined,
    });
    if (built.rows.length === 0) continue;

    totalFilled += built.filledCount;
    totalEmpty += built.emptyCount;
    combinedRows.push(...built.rows);

    for (const [code, meta] of built.itemSummary.entries()) {
      const cur = combinedItemSummary.get(code) ?? { name: meta.name, filled: 0, empty: 0 };
      cur.filled += meta.filled;
      cur.empty += meta.empty;
      combinedItemSummary.set(code, cur);
    }

    if (orderedGroups.length > 1 && orderedGroups.length <= 35) {
      const ws = createKpmWorksheet(XLSX, {
        title: `DAFTAR KPM — ${grp.proposalName}${grp.tahun ? ` (${grp.tahun})` : ''}`,
        subtitle: `Total: ${built.filledCount} KPM${built.emptyCount > 0 ? ` + ${built.emptyCount} Baris Kosong` : ''}  ·  Diekspor: ${exportedAt}`,
        rows: built.rows,
        includeProposalCols: false,
      });
      const shortTab = grp.proposalName
        .replace(/^Kelurahan\s+/i, 'Kel. ')
        .replace(/^Kecamatan\s+/i, 'Kec. ');
      perProposalSheets.push({ name: shortTab, ws });
    }
  }

  if (combinedRows.length === 0) {
    throw new Error('Tidak ada data KPM untuk diekspor ke Excel (.xlsx).');
  }

  const allSheet = createKpmWorksheet(XLSX, {
    title: `DAFTAR KPM — ${title}`,
    subtitle: [
      subtitle || '',
      `Total: ${totalFilled} KPM${totalEmpty > 0 ? ` + ${totalEmpty} Baris Kosong` : ''}`,
      `Diekspor: ${exportedAt}`,
    ]
      .filter(Boolean)
      .join('  ·  '),
    rows: combinedRows,
    includeProposalCols: true,
  });
  XLSX.utils.book_append_sheet(wb, allSheet, sanitizeExcelSheetName('Semua KPM', usedSheetNames));

  if (combinedItemSummary.size > 0) {
    const summarySheet = createItemSummaryWorksheet(XLSX, {
      title,
      itemSummary: combinedItemSummary,
      items,
      tahunRef: 'all',
    });
    XLSX.utils.book_append_sheet(
      wb,
      summarySheet,
      sanitizeExcelSheetName('Rekap Item', usedSheetNames)
    );
  }

  for (const item of perProposalSheets) {
    XLSX.utils.book_append_sheet(wb, item.ws, sanitizeExcelSheetName(item.name, usedSheetNames));
  }

  const saved = await saveOrOpenXlsxWorkbook(XLSX, wb, fileName);
  return {
    ...saved,
    count: totalFilled,
    emptyCount: totalEmpty,
  };
}
