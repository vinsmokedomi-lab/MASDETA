import { PENGELOLA_TITLE_OPTIONS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmAuditLogEntry,
  KpmRecord,
  PengelolaProfile,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  capitalizeWords,
  formatAlamatLengkap,
  formatValidationLabel,
  getValidationForDtsen,
  recalculateProposalRegisterCodes,
  resolvePackageForKpm,
  resolveProposalDomicile,
  sanitizeDigits,
} from './imageProcessor';

export interface CsvImportParams {
  csvText: string;
  existingRecords: KpmRecord[];
  existingProposals: ProposalRecord[];
  existingPengelolaList: PengelolaProfile[];
  existingPekerjaanList: string[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  actorName: string;
  actorEmail?: string;
}

export interface CsvImportResult {
  nextRecords: KpmRecord[];
  nextProposals: ProposalRecord[];
  nextPengelolaList: PengelolaProfile[];
  nextPekerjaanList: string[];
  newAuditLogs: KpmAuditLogEntry[];
  newProposalHistory: ProposalKpmHistoryEntry[];
  importedRecordsCount: number;
  importedProposalsCount: number;
  addedPengelolaCount: number;
  skippedCount: number;
  error?: string;
}

function detectDelimiter(lines: string[]): string {
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const semiCount = (trimmed.match(/;/g) || []).length;
    const commaCount = (trimmed.match(/,/g) || []).length;
    if (semiCount >= commaCount && semiCount > 0) return ';';
    if (commaCount > 0) return ',';
  }
  return ';';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeaderKey(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function formatProposalTitle(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean === clean.toUpperCase()) {
    return capitalizeWords(clean.toLowerCase());
  }
  return capitalizeWords(clean);
}

function normalizeKelurahanName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const titled = clean === clean.toUpperCase() ? capitalizeWords(clean.toLowerCase()) : capitalizeWords(clean);
  if (/^(kelurahan|desa)\s+/i.test(titled)) {
    return titled.replace(/^kel\.?\s+/i, 'Kelurahan ');
  }
  return `Kelurahan ${titled}`;
}

function normalizeKecamatanName(raw: string): string {
  const clean = raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(kecamatan|kec\.?)\s+/i, '');
  if (!clean) return '';
  return clean === clean.toUpperCase() ? capitalizeWords(clean.toLowerCase()) : capitalizeWords(clean);
}

function padRtRw(raw: string): string {
  const digits = sanitizeDigits(raw, 3);
  if (!digits) return '001';
  return digits.padStart(3, '0');
}

function createPengelolaFromLabel(
  rawLabel: string,
  kecamatan: string,
  kabKota: string,
  now: string,
  indexSeed: number
): PengelolaProfile {
  const clean = rawLabel.trim().replace(/\s+/g, ' ');
  let matchedTitle = '';
  let nama = clean;

  const sortedTitles = [...PENGELOLA_TITLE_OPTIONS].sort((a, b) => b.length - a.length);
  for (const title of sortedTitles) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}\\s+(.+)$`, 'i');
    const m = clean.match(regex);
    if (m && m[1]?.trim()) {
      matchedTitle = title;
      nama = capitalizeWords(m[1].trim());
      break;
    }
  }

  if (!matchedTitle) {
    nama = capitalizeWords(clean);
  }

  const displayName = matchedTitle ? `${matchedTitle} ${nama}` : nama;

  return {
    id: `peng-csv-${Date.now()}-${indexSeed}-${Math.random().toString(36).slice(2, 6)}`,
    title: matchedTitle,
    nama,
    displayName,
    kabKota: kabKota || 'Kota Pontianak',
    kecamatan: kecamatan || 'Pontianak Kota',
    kelurahan: '',
    alamat: '',
    kontak: '',
    createdAt: now,
  };
}

export function importProposalKpmFromCsv({
  csvText,
  existingRecords,
  existingProposals,
  existingPengelolaList,
  existingPekerjaanList,
  items,
  wilayahList,
  actorName,
  actorEmail,
}: CsvImportParams): CsvImportResult {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rawLines = cleanText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (rawLines.length < 2) {
    return {
      nextRecords: existingRecords,
      nextProposals: existingProposals,
      nextPengelolaList: existingPengelolaList,
      nextPekerjaanList: existingPekerjaanList,
      newAuditLogs: [],
      newProposalHistory: [],
      importedRecordsCount: 0,
      importedProposalsCount: 0,
      addedPengelolaCount: 0,
      skippedCount: 0,
      error: 'File CSV kosong atau tidak memiliki baris data.',
    };
  }

  const delimiter = detectDelimiter(rawLines);

  // Scan top lines for header row and any optional banner row above it
  let headerRowIdx = -1;
  let headers: string[] = [];
  let bannerTahun = '';
  let bannerProposal = '';

  for (let i = 0; i < Math.min(rawLines.length, 6); i++) {
    const cols = parseDelimitedLine(rawLines[i], delimiter);
    const normalized = cols.map(normalizeHeaderKey);
    const hasNama = normalized.some((h) => h === 'NAMA' || h === 'NAMA KPM' || h === 'NAMA LENGKAP');
    const hasKeyCol = normalized.some(
      (h) => h === 'ITEM' || h === 'NIK KTP' || h === 'ALAMAT' || h === 'RT'
    );

    if (hasNama && hasKeyCol) {
      headerRowIdx = i;
      headers = normalized;
      break;
    }

    // Extract optional metadata banner above header (e.g. ";;;2026;KECAMATAN PONTIANAK KOTA")
    for (const cell of cols) {
      const val = cell.trim();
      if (!val) continue;
      if (/^20\d{2}$/.test(val) && !bannerTahun) {
        bannerTahun = val;
      } else if (/^(kecamatan|kelurahan|desa|jalan|jl\.?)\s+/i.test(val) && !bannerProposal) {
        bannerProposal = formatProposalTitle(val);
      }
    }
  }

  if (headerRowIdx < 0) {
    return {
      nextRecords: existingRecords,
      nextProposals: existingProposals,
      nextPengelolaList: existingPengelolaList,
      nextPekerjaanList: existingPekerjaanList,
      newAuditLogs: [],
      newProposalHistory: [],
      importedRecordsCount: 0,
      importedProposalsCount: 0,
      addedPengelolaCount: 0,
      skippedCount: 0,
      error: 'Header kolom CSV (NAMA, ITEM, NIK KTP, ALAMAT) tidak ditemukan.',
    };
  }

  const colIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxItem = colIndex(['ITEM', 'KODE ITEM']);
  const idxDtsen = colIndex(['DTSEN', 'DESIL']);
  const idxNama = colIndex(['NAMA', 'NAMA KPM', 'NAMA LENGKAP']);
  const idxAlamat = colIndex(['ALAMAT', 'ALAMAT LENGKAP']);
  const idxRt = colIndex(['RT']);
  const idxRw = colIndex(['RW']);
  const idxKontak = colIndex(['KONTAK', 'NO HP', 'NOMOR HP', 'HP']);
  const idxPengelola = colIndex(['PENGELOLA']);
  const idxNikKtp = colIndex(['NIK KTP', 'NIK']);
  const idxNikKk = colIndex(['NIK KK', 'NO KK', 'NOMOR KK']);
  const idxPekerjaan = colIndex(['PEKERJAAN']);
  const idxKelurahan = colIndex(['KELURAHAN', 'KELURAHAN / DESA', 'DESA']);
  const idxKecamatan = colIndex(['KECAMATAN']);
  const idxProposal = colIndex(['PROPOSAL', 'NAMA PROPOSAL']);
  const idxTahun = colIndex(['TAHUN']);
  const idxKet = colIndex(['KET', 'KETERANGAN', 'CATATAN']);
  const idxValidasi = colIndex(['VALIDASI', 'STATUS']);
  const idxPayment = colIndex(['BIAYA ADMINISTRASI', 'PEMBAYARAN', 'PAYMENT']);

  const now = new Date().toISOString();
  const baseTimeMs = Date.now();

  // Deduplication tracking against existing records
  const existingKeys = new Set<string>();
  for (const r of existingRecords) {
    if (r.nikKtp) {
      existingKeys.add(`${r.tahun}::${r.proposal.toLowerCase()}::ktp::${r.nikKtp}`);
    }
    existingKeys.add(
      `${r.tahun}::${r.proposal.toLowerCase()}::name::${r.nama.trim().toUpperCase()}::${r.rt}::${r.rw}`
    );
  }

  // Track existing proposals case-insensitively to reuse canonical proposal name
  const proposalLookup = new Map<string, ProposalRecord>();
  for (const p of existingProposals) {
    proposalLookup.set(`${p.tahun}::${p.namaProposal.toLowerCase()}`, p);
  }

  // Track pengelola case-insensitively
  const pengelolaListCopy = [...existingPengelolaList];
  const pengelolaByKey = new Map<string, PengelolaProfile>();
  for (const p of pengelolaListCopy) {
    pengelolaByKey.set(p.displayName.trim().toLowerCase(), p);
    pengelolaByKey.set(p.nama.trim().toLowerCase(), p);
  }

  // Track pekerjaan case-insensitively
  const pekerjaanListCopy = [...existingPekerjaanList];
  const pekerjaanByLower = new Map<string, string>();
  for (const job of pekerjaanListCopy) {
    pekerjaanByLower.set(job.trim().toLowerCase(), job);
  }

  const parsedRows: {
    record: KpmRecord;
    rawKecamatan: string;
    rawKelurahan: string;
  }[] = [];
  let skippedCount = 0;
  let addedPengelolaCount = 0;

  const dataLines = rawLines.slice(headerRowIdx + 1);

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseDelimitedLine(dataLines[i], delimiter);
    // Skip empty/separator rows (e.g. ";;;;;;;;;;;;;;;;;")
    if (cols.every((c) => c === '')) continue;

    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');

    const rawNama = get(idxNama);
    const rawItem = get(idxItem).toUpperCase();
    const rawNikKtp = sanitizeDigits(get(idxNikKtp).replace(/^'/, ''), 16);
    const rawNikKk = sanitizeDigits(get(idxNikKk).replace(/^'/, ''), 16);

    if (!rawNama && !rawNikKtp) continue;

    const tahunRaw = get(idxTahun) || bannerTahun || '2026';
    const tahun = /^20\d{2}$/.test(tahunRaw) ? tahunRaw : bannerTahun || '2026';

    const rawProposal = get(idxProposal) || bannerProposal || 'Kecamatan Pontianak Kota';
    let proposalName = formatProposalTitle(rawProposal);
    const existingProp = proposalLookup.get(`${tahun}::${proposalName.toLowerCase()}`);
    if (existingProp) {
      proposalName = existingProp.namaProposal;
    }

    const nama = rawNama.trim().toUpperCase();
    const rt = padRtRw(get(idxRt));
    const rw = padRtRw(get(idxRw));

    const dedupKtpKey = rawNikKtp
      ? `${tahun}::${proposalName.toLowerCase()}::ktp::${rawNikKtp}`
      : '';
    const dedupNameKey = `${tahun}::${proposalName.toLowerCase()}::name::${nama}::${rt}::${rw}`;

    if ((dedupKtpKey && existingKeys.has(dedupKtpKey)) || existingKeys.has(dedupNameKey)) {
      skippedCount += 1;
      continue;
    }
    if (dedupKtpKey) existingKeys.add(dedupKtpKey);
    existingKeys.add(dedupNameKey);

    const rawKelurahan = normalizeKelurahanName(get(idxKelurahan));
    const rawKecamatan = normalizeKecamatanName(get(idxKecamatan));

    const alamat = formatAlamatLengkap(get(idxAlamat), true);
    const kontakRaw = get(idxKontak);
    const kontak = kontakRaw === '-' ? '' : sanitizeDigits(kontakRaw, 15);
    const dtsen = get(idxDtsen) || '1';

    let validasi: ValidationStatus = getValidationForDtsen(dtsen) || 'pending';
    const rawValidasi = get(idxValidasi).toLowerCase();
    if (rawValidasi === 'diterima' || rawValidasi === 'accepted') validasi = 'accepted';
    else if (rawValidasi === 'ditolak' || rawValidasi === 'rejected') validasi = 'rejected';
    else if (rawValidasi === 'menunggu' || rawValidasi === 'pending') validasi = 'pending';

    // Match or add Pekerjaan
    const rawJob = get(idxPekerjaan).trim();
    let pekerjaan = 'Belum / Tidak Bekerja';
    if (rawJob) {
      const matchedJob = pekerjaanByLower.get(rawJob.toLowerCase());
      if (matchedJob) {
        pekerjaan = matchedJob;
      } else {
        const formattedJob = capitalizeWords(rawJob);
        pekerjaanByLower.set(formattedJob.toLowerCase(), formattedJob);
        pekerjaanListCopy.push(formattedJob);
        pekerjaan = formattedJob;
      }
    }

    // Match or add Pengelola
    const rawPengelola = get(idxPengelola).trim();
    let pengelolaName = rawPengelola || 'Petugas Lapangan';
    if (rawPengelola) {
      const matchedPeng = pengelolaByKey.get(rawPengelola.toLowerCase());
      if (matchedPeng) {
        pengelolaName = matchedPeng.displayName;
      } else {
        const createdPeng = createPengelolaFromLabel(
          rawPengelola,
          rawKecamatan || 'Pontianak Kota',
          'Kota Pontianak',
          now,
          addedPengelolaCount
        );
        pengelolaListCopy.unshift(createdPeng);
        pengelolaByKey.set(createdPeng.displayName.toLowerCase(), createdPeng);
        pengelolaByKey.set(createdPeng.nama.toLowerCase(), createdPeng);
        pengelolaName = createdPeng.displayName;
        addedPengelolaCount += 1;
      }
    }

    const catatan = get(idxKet);
    const paymentDigits = sanitizeDigits(get(idxPayment), 9);
    const payment = paymentDigits ? parseInt(paymentDigits, 10) : 0;

    // Resolve domicile fallback if missing
    const dom = resolveProposalDomicile(proposalName, existingProposals, tahun, wilayahList);
    const finalKecamatan = rawKecamatan || dom.kecamatan;
    const finalKelurahan = rawKelurahan || dom.kelurahan;

    const recCreatedAt = new Date(baseTimeMs + parsedRows.length).toISOString();
    const newRecord: KpmRecord = {
      id: `kpm-csv-${baseTimeMs}-${parsedRows.length}-${Math.random().toString(36).slice(2, 6)}`,
      registerCode: `${String(parsedRows.length + 1).padStart(3, '0')}. ${tahun} - ${rawItem || 'OV'}`,
      tahun,
      proposal: proposalName,
      kecamatan: finalKecamatan,
      kelurahan: finalKelurahan,
      item: rawItem || 'OV',
      nama,
      alamat,
      rt,
      rw,
      nikKk: rawNikKk,
      nikKtp: rawNikKtp,
      dtsen,
      validasi,
      kontak,
      pekerjaan,
      pengelola: pengelolaName,
      catatan,
      payment: Number.isFinite(payment) ? payment : 0,
      documents: {
        rumah: [],
        lainnya: [],
      },
      createdAt: recCreatedAt,
      updatedAt: recCreatedAt,
    };

    parsedRows.push({
      record: newRecord,
      rawKecamatan: finalKecamatan,
      rawKelurahan: finalKelurahan,
    });
  }

  if (parsedRows.length === 0) {
    return {
      nextRecords: existingRecords,
      nextProposals: existingProposals,
      nextPengelolaList: existingPengelolaList,
      nextPekerjaanList: existingPekerjaanList,
      newAuditLogs: [],
      newProposalHistory: [],
      importedRecordsCount: 0,
      importedProposalsCount: 0,
      addedPengelolaCount: 0,
      skippedCount,
      error:
        skippedCount > 0
          ? `Semua ${skippedCount} baris di file CSV sudah terdaftar sebelumnya.`
          : 'Tidak ada baris data calon KPM yang valid di dalam CSV.',
    };
  }

  // Ensure every referenced Proposal exists in nextProposals
  const proposalsToAdd: ProposalRecord[] = [];
  const rowsByProposal = new Map<string, typeof parsedRows>();
  for (const item of parsedRows) {
    const key = `${item.record.tahun}::${item.record.proposal}`;
    const list = rowsByProposal.get(key) ?? [];
    list.push(item);
    rowsByProposal.set(key, list);
  }

  for (const group of rowsByProposal.values()) {
    const first = group[0];
    const keyLower = `${first.record.tahun}::${first.record.proposal.toLowerCase()}`;
    if (!proposalLookup.has(keyLower)) {
      const dom = resolveProposalDomicile(
        first.record.proposal,
        existingProposals,
        first.record.tahun,
        wilayahList
      );
      const uniqueKelurahans = new Set(group.map((g) => g.rawKelurahan).filter(Boolean));
      const newProposal: ProposalRecord = {
        id: `prop-csv-${baseTimeMs}-${proposalsToAdd.length}-${Math.random().toString(36).slice(2, 5)}`,
        tahun: first.record.tahun,
        tipe: 'Murni',
        kabKota: dom.kabKota || 'Kota Pontianak',
        kecamatan: first.rawKecamatan || dom.kecamatan || 'Pontianak Kota',
        kelurahan: uniqueKelurahans.size === 1 ? Array.from(uniqueKelurahans)[0] : dom.kelurahan,
        namaProposal: first.record.proposal,
        jumlahKpm: Math.max(group.length, 66),
        status: 'unlocked',
        checklist: {
          docx: false,
          dinas: false,
          rab: false,
          rt: false,
          rw: false,
          lurah: false,
          camat: false,
        },
        catatan: `Diimpor otomatis dari CSV (${group.length} KPM).`,
        documents: {},
        createdAt: now,
        updatedAt: now,
      };
      proposalsToAdd.push(newProposal);
      proposalLookup.set(keyLower, newProposal);
    }
  }

  const nextProposals = [...proposalsToAdd, ...existingProposals];
  const mergedRawRecords = [...existingRecords, ...parsedRows.map((p) => p.record)];
  const nextRecords = recalculateProposalRegisterCodes(
    mergedRawRecords,
    nextProposals,
    items,
    wilayahList
  );

  // Build lookup of final registerCode for audit & history logs
  const finalById = new Map(nextRecords.map((r) => [r.id, r]));
  const newAuditLogs: KpmAuditLogEntry[] = [];
  const newProposalHistory: ProposalKpmHistoryEntry[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const saved = finalById.get(parsedRows[i].record.id) ?? parsedRows[i].record;
    const itemMatch = resolvePackageForKpm(items, saved.tahun, saved.item);
    const itemDisplay =
      itemMatch && itemMatch.name !== itemMatch.code
        ? `${itemMatch.code} — ${itemMatch.name}`
        : saved.item;

    newAuditLogs.push({
      id: `audit-csv-${baseTimeMs}-${i}`,
      kpmId: saved.id,
      action: 'created',
      actorName,
      actorEmail,
      timestamp: now,
      proposal: saved.proposal,
      tahun: saved.tahun,
      changes: [
        {
          field: 'Impor Proposal CSV',
          before: '-',
          after: `${saved.proposal} (${saved.tahun})`,
        },
        { field: 'Item Bantuan', before: '-', after: itemDisplay },
        {
          field: 'Status Validasi',
          before: '-',
          after: formatValidationLabel(saved.validasi),
        },
      ],
    });

    newProposalHistory.push({
      id: `hist-csv-${baseTimeMs}-${i}`,
      tahun: saved.tahun,
      proposalName: saved.proposal,
      kpmId: saved.id,
      kpmName: saved.nama,
      registerCode: saved.registerCode,
      action: 'entered',
      toProposal: saved.proposal,
      actorName,
      timestamp: now,
    });
  }

  const sortedPekerjaan =
    pekerjaanListCopy.length > existingPekerjaanList.length
      ? [...pekerjaanListCopy].sort((a, b) => a.localeCompare(b, 'id'))
      : existingPekerjaanList;

  return {
    nextRecords,
    nextProposals,
    nextPengelolaList: pengelolaListCopy,
    nextPekerjaanList: sortedPekerjaan,
    newAuditLogs,
    newProposalHistory,
    importedRecordsCount: parsedRows.length,
    importedProposalsCount: proposalsToAdd.length,
    addedPengelolaCount,
    skippedCount,
  };
}
