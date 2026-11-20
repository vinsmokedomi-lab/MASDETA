import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatAlamatLengkap,
  getAbsenSeq,
  getKpmSlotNumberInProposal,
  resolveProposalSlotStateForGroup,
} from './imageProcessor';

export interface BastExtractedRow {
  no: number;
  nama: string;
  nik: string;
  alamat: string;
  barangList: string[];
}

export interface ProposalExtractedRow {
  sourceKpmId?: string;
  no: string;
  item: string;
  nama: string;
  alamat: string;
  rtRw: string;
  kelurahan: string;
  pengelola: string;
  nik?: string;
}

export interface TroubleshootingItemMeta {
  code: string;
  name: string;
  defaultBastDescription: string;
}

export const TROUBLESHOOTING_ITEM_META: Record<string, TroubleshootingItemMeta> = {
  OV: {
    code: 'OV',
    name: 'Oven Kue',
    defaultBastDescription: 'Mixer, Oven Gas, Blender, Teflon Kue',
  },
  KPR: {
    code: 'KPR',
    name: 'Kompor Gas',
    defaultBastDescription: 'Selang Gas, Regulator, Kompor Gas, Dispenser, Blender, Rice Cooker',
  },
  JHT: {
    code: 'JHT',
    name: 'Mesin Jahit',
    defaultBastDescription: 'Mesin Jahit',
  },
  MC: {
    code: 'MC',
    name: 'Mesin Cuci',
    defaultBastDescription: 'Mesin Cuci, Keranjang Pakaian',
  },
  TKG: {
    code: 'TKG',
    name: 'Peralatan Tukang',
    defaultBastDescription:
      'Mesin Potong Papan, Mesin Gerinda Kayu, Mesin Serut Kayu, Mesin Amplas, Mesin Bor',
  },
  ES: {
    code: 'ES',
    name: 'Paket Es',
    defaultBastDescription: 'Alat Cup Es, Alat Serut Es, Termos Es, Blender',
  },
  CMT: {
    code: 'CMT',
    name: 'Cuci Motor',
    defaultBastDescription: 'Mesin Cuci Kendaraan',
  },
  TBS: {
    code: 'TBS',
    name: 'Peralatan Tebas',
    defaultBastDescription: 'Mesin Potong Rumput, Mini Chainsaw, Alat Semprot',
  },
  MSK: {
    code: 'MSK',
    name: 'Peralatan Masak',
    defaultBastDescription:
      'Kompor 1000, Panci 30 cm, Panci 28 cm, Panci 26 cm, Panci 24 cm, Teko Siul, Termos, Blender',
  },
  TND: {
    code: 'TND',
    name: 'Tenda & Kursi',
    defaultBastDescription: 'Tenda Lipat, Kursi Plastik',
  },
  LE: {
    code: 'LE',
    name: 'Lemari Es',
    defaultBastDescription: 'Lemari Es / Kulkas',
  },
};

export const TROUBLESHOOTING_ITEM_BADGE_CLASSES: Record<string, string> = {
  OV: 'bg-teal-50 text-teal-800 border-teal-200',
  KPR: 'bg-sky-50 text-sky-800 border-sky-200',
  JHT: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  MC: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  TKG: 'bg-amber-50 text-amber-800 border-amber-200',
  ES: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CMT: 'bg-slate-100 text-slate-800 border-slate-300',
  TBS: 'bg-lime-50 text-lime-800 border-lime-200',
  MSK: 'bg-orange-50 text-orange-800 border-orange-200',
};

export function getTroubleshootingItemBadgeClass(code: string): string {
  return (
    TROUBLESHOOTING_ITEM_BADGE_CLASSES[code.trim().toUpperCase()] ||
    'bg-slate-100 text-slate-700 border-slate-200'
  );
}

export function getTroubleshootingItemName(code: string, catalog: ItemBantuan[] = []): string {
  const upper = code.trim().toUpperCase();
  if (TROUBLESHOOTING_ITEM_META[upper]) {
    return TROUBLESHOOTING_ITEM_META[upper].name;
  }
  const found = catalog.find((it) => it.code.trim().toUpperCase() === upper);
  return found?.name || upper || '-';
}

function normalizeTextUpper(value: string): string {
  return (value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Memetakan rincian daftar barang BAST pada satu slot penerima ke kode item standar MASDETA (Aturan 1).
 */
export function mapBastBarangToItemCode(barangList: string[]): string {
  const normalizedItems = barangList.map((b) => normalizeTextUpper(b)).filter(Boolean);
  const joined = normalizedItems.join(' | ');
  if (!joined) return 'LAINNYA';

  // Pencocokan ciri khas utama tiap paket (menghindari ambiguitas BLENDER / TERMOS)
  if (
    joined.includes('OVEN GAS') ||
    joined.includes('MIXER') ||
    joined.includes('TEFLON')
  ) {
    return 'OV';
  }
  if (
    joined.includes('SELANG GAS') ||
    joined.includes('REGULATOR') ||
    joined.includes('KOMPOR GAS') ||
    joined.includes('DISPENSER') ||
    joined.includes('RICE COOKER')
  ) {
    return 'KPR';
  }
  if (joined.includes('MESIN JAHIT')) {
    return 'JHT';
  }
  if (joined.includes('CUCI KENDARAAN') || joined.includes('CUCI MOTOR')) {
    return 'CMT';
  }
  if (
    joined.includes('KERANJANG') ||
    (joined.includes('MESIN CUCI') && !joined.includes('KENDARAAN') && !joined.includes('MOTOR'))
  ) {
    return 'MC';
  }
  if (
    joined.includes('POTONG PAPAN') ||
    joined.includes('GERINDA') ||
    joined.includes('SERUT KAYU') ||
    joined.includes('AMPLAS') ||
    joined.includes('MESIN BOR')
  ) {
    return 'TKG';
  }
  if (
    joined.includes('CUP ES') ||
    joined.includes('SERUT ES') ||
    joined.includes('TERMOS ES')
  ) {
    return 'ES';
  }
  if (
    joined.includes('POTONG RUMPUT') ||
    joined.includes('CHAINSAW') ||
    joined.includes('ALAT SEMPROT')
  ) {
    return 'TBS';
  }
  if (
    joined.includes('KOMPOR 1000') ||
    joined.includes('KOMPOR SERIBU') ||
    joined.includes('PANCI') ||
    joined.includes('TEKO SIUL')
  ) {
    return 'MSK';
  }
  if (joined.includes('TENDA') || joined.includes('KURSI')) {
    return 'TND';
  }
  if (joined.includes('LEMARI ES') || joined.includes('KULKAS')) {
    return 'LE';
  }

  // Fallback jika hanya sebagian baris barang yang terbaca
  if (joined.includes('TERMOS') && !joined.includes('ES')) return 'MSK';
  if (joined.includes('BLENDER')) return 'KPR';

  return 'LAINNYA';
}

function normalizeStrictName(name: string): string {
  return (name || '')
    .toUpperCase()
    .replace(/[.,'`’"()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAlphaName(name: string): string {
  return (name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev, dp[j], dp[j - 1]) + 1;
      }
      prev = temp;
    }
  }
  return dp[n];
}

function formatTitleCaseItem(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
    .replace(/\bCm\b/g, 'cm');
}

export function formatProposalAddressFull(row: ProposalExtractedRow): string {
  const parts: string[] = [];
  const alamat = (row.alamat || '').trim();
  if (alamat) parts.push(alamat);

  const rtRwRaw = (row.rtRw || '').trim();
  if (rtRwRaw && !/\bRT\b/i.test(alamat)) {
    const cleaned = rtRwRaw.replace(/\s+/g, '');
    const segments = cleaned.split('/').filter(Boolean);
    if (segments.length === 2) {
      parts.push(`RT ${segments[0].padStart(3, '0')} RW ${segments[1].padStart(3, '0')}`);
    } else if (cleaned !== '-' && cleaned !== '/') {
      parts.push(`RT/RW ${rtRwRaw}`);
    }
  }

  const kel = (row.kelurahan || '').trim();
  if (kel && !alamat.toUpperCase().includes(kel.toUpperCase())) {
    const hasPrefix = /^(kelurahan|kel\.?|desa)\b/i.test(kel);
    parts.push(hasPrefix ? kel : `Kelurahan ${kel}`);
  }

  return parts.join(', ').trim();
}

export type ReconciledRowStatus = 'unchanged' | 'shifted' | 'new_in_proposal' | 'empty_slot';

export interface ReconciledMainRow {
  sourceKpmId?: string;
  noUrut: number;
  noUrutText: string;
  kodeItem: string;
  namaItem: string;
  nama: string;
  nik: string;
  alamat: string;
  bastRawAlamat?: string | null;
  pengelola: string;
  isEmpty: boolean;
  status: ReconciledRowStatus;
  bastOriginalNo: number | null;
  bastOriginalItemCode: string | null;
  proposalOriginalNo: string | null;
  keterangan: string;
}

export interface ReconciledExcludedRow {
  sourceKpmId?: string;
  no: number;
  noText: string;
  noAsalProposal: string;
  kodeItem: string;
  namaItem: string;
  nama: string;
  alamat: string;
  pengelola: string;
  keterangan: string;
}

export interface ReconciledItemComparison {
  kodeItem: string;
  namaItem: string;
  rincianBarangBast: string;
  kuotaBast: number;
  usulanKpm: number;
  terisi: number;
  barisKosong: number;
  dikeluarkan: number;
}

export interface TroubleshootingMatchMetrics {
  totalProposalCount: number;
  totalBastCount: number;
  matchedBastCount: number;
  proposalMatchPercentage: number;
  bastMatchPercentage: number;
  effectiveMatchPercentage: number;
  isMismatch: boolean;
}

export interface TroubleshootingReconcileResult {
  proposalTitle: string;
  bastTitle: string;
  proposalSourceType: 'pdf' | 'database';
  generatedAt: string;
  mainRows: ReconciledMainRow[];
  excludedRows: ReconciledExcludedRow[];
  itemComparisons: ReconciledItemComparison[];
  totals: {
    kuotaBast: number;
    usulanKpm: number;
    terisi: number;
    barisKosong: number;
    dikeluarkan: number;
    unchangedCount: number;
    shiftedCount: number;
    newInProposalCount: number;
  };
  matchMetrics: TroubleshootingMatchMetrics;
  hasProposalPengelolaData: boolean;
}

interface IndexedBastSlot {
  bastNo: number;
  itemCode: string;
  nama: string;
  nik: string;
  alamat: string;
  barangList: string[];
  strictName: string;
  alphaName: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function findMatchingBastSlot(
  propRow: ProposalExtractedRow,
  bastSlots: IndexedBastSlot[],
  preferredIndexMap: Map<IndexedBastSlot, boolean>
): IndexedBastSlot | null {
  const propNikDigits = (propRow.nik || '').replace(/\D/g, '');
  if (propNikDigits.length === 16) {
    const byNik = bastSlots.find((s) => s.nik.replace(/\D/g, '') === propNikDigits);
    if (byNik) return byNik;
  }

  const strictProp = normalizeStrictName(propRow.nama);
  const alphaProp = normalizeAlphaName(propRow.nama);
  if (!alphaProp) return null;

  const propNoNum = Number(String(propRow.no || '').replace(/\D/g, '')) || 0;
  const pickBest = (candidates: IndexedBastSlot[]): IndexedBastSlot | null => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    // Prioritaskan yang belum dipasangkan, lalu kedekatan nomor urut
    return [...candidates].sort((a, b) => {
      const aUsed = preferredIndexMap.get(a) ? 1 : 0;
      const bUsed = preferredIndexMap.get(b) ? 1 : 0;
      if (aUsed !== bUsed) return aUsed - bUsed;
      return Math.abs(a.bastNo - propNoNum) - Math.abs(b.bastNo - propNoNum);
    })[0];
  };

  const strictMatches = bastSlots.filter((s) => s.strictName === strictProp);
  if (strictMatches.length > 0) return pickBest(strictMatches);

  const alphaMatches = bastSlots.filter((s) => s.alphaName === alphaProp);
  if (alphaMatches.length > 0) return pickBest(alphaMatches);

  // Fuzzy tolerance kecil untuk minor typo OCR (jarak <= 2 pada nama >= 6 huruf)
  if (alphaProp.length >= 6) {
    let bestCandidate: IndexedBastSlot | null = null;
    let bestDist = Infinity;
    let tie = false;

    for (const s of bastSlots) {
      if (Math.abs(s.alphaName.length - alphaProp.length) > 2) continue;
      const dist = levenshteinDistance(alphaProp, s.alphaName);
      const maxAllowed = alphaProp.length >= 10 ? 2 : 1;
      if (dist <= maxAllowed) {
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = s;
          tie = false;
        } else if (dist === bestDist) {
          tie = true;
        }
      }
    }

    if (bestCandidate && !tie) {
      return bestCandidate;
    }
  }

  return null;
}

export function buildProposalRowsFromDatabase(params: {
  proposal: ProposalRecord;
  records: KpmRecord[];
  allProposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  proposalSlotMap: ProposalSlotMap;
}): ProposalExtractedRow[] {
  const { proposal, records, allProposals, items, wilayahList, proposalSlotMap } = params;

  const proposalRecords = records.filter(
    (r) =>
      r.validasi === 'accepted' &&
      (r.proposalId
        ? r.proposalId === proposal.id
        : r.proposal === proposal.namaProposal && r.tahun === proposal.tahun)
  );

  const { state: slotState } = resolveProposalSlotStateForGroup(
    proposalSlotMap,
    proposal.id,
    proposal.namaProposal,
    proposal.tahun,
    allProposals
  );

  const ordered = proposalRecords
    .map((rec) => {
      const slotNumber = getKpmSlotNumberInProposal(
        rec,
        records,
        allProposals,
        items,
        wilayahList,
        proposalSlotMap
      );
      const absen = getAbsenSeq(rec.registerCode);
      const rank =
        slotState?.pinnedOrder?.indexOf(rec.id) !== undefined &&
        slotState.pinnedOrder.indexOf(rec.id) >= 0
          ? slotState.pinnedOrder.indexOf(rec.id)
          : 999999;
      return {
        rec,
        slotNumber: slotNumber ?? (absen < 999999 ? absen : 999999),
        rank,
      };
    })
    .sort((a, b) => {
      if (a.slotNumber !== b.slotNumber) return a.slotNumber - b.slotNumber;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.rec.nama.localeCompare(b.rec.nama, 'id');
    });

  return ordered.map(({ rec, slotNumber }, idx) => {
    const displayNo = slotNumber < 999999 ? pad2(slotNumber) : pad2(idx + 1);
    const rt = (rec.rt || '').trim().padStart(3, '0');
    const rw = (rec.rw || '').trim().padStart(3, '0');
    const rtRw = rec.rt || rec.rw ? `${rt} / ${rw}` : '';
    return {
      sourceKpmId: rec.id,
      no: displayNo,
      item: (rec.item || '').trim().toUpperCase(),
      nama: (rec.nama || '').trim().toUpperCase(),
      alamat: formatAlamatLengkap(rec.alamat || ''),
      rtRw,
      kelurahan: (rec.kelurahan || '').trim(),
      pengelola: (rec.pengelola || '').trim(),
      nik: (rec.nikKtp || '').replace(/\D/g, ''),
    };
  });
}

export function parseRtRwFromBastAddress(bastAlamat: string): {
  rt: string;
  rw: string;
  streetAlamat: string;
} {
  const raw = (bastAlamat || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { rt: '', rw: '', streetAlamat: '' };

  let rt = '';
  let rw = '';
  const combinedMatch = raw.match(/\bRT\.?\s*0*(\d{1,3})\s*[/\\-]?\s*RW\.?\s*0*(\d{1,3})\b/i);
  if (combinedMatch) {
    rt = combinedMatch[1].padStart(3, '0');
    rw = combinedMatch[2].padStart(3, '0');
  } else {
    const rtMatch = raw.match(/\bRT\.?\s*[:.]?\s*0*(\d{1,3})\b/i);
    const rwMatch = raw.match(/\bRW\.?\s*[:.]?\s*0*(\d{1,3})\b/i);
    if (rtMatch) rt = rtMatch[1].padStart(3, '0');
    if (rwMatch) rw = rwMatch[1].padStart(3, '0');
  }

  // Ambil bagian alamat jalan (sebelum RT/RW atau Kelurahan/Kecamatan/Kota)
  let streetPart = raw
    .replace(/[,;\s]*\bRT\.?\s*0*\d{1,3}\s*[/\\-]?\s*RW\.?\s*0*\d{1,3}\b.*$/i, '')
    .replace(/[,;\s]*\bRT\.?\s*[:.]?\s*0*\d{1,3}\b.*$/i, '')
    .replace(/[,;\s]*\b(KELURAHAN|KEL\.?|DESA|KECAMATAN|KEC\.?|KOTA|KAB\.?)\b.*$/i, '')
    .replace(/[,\s]+$/g, '')
    .trim();

  if (!streetPart && raw) {
    streetPart = raw;
  }

  return { rt, rw, streetAlamat: streetPart };
}

export function computeKpmAddressEnrichmentFromBast(
  rec: Pick<KpmRecord, 'alamat' | 'rt' | 'rw'>,
  bastAlamat: string | null | undefined
): {
  changed: boolean;
  nextAlamat: string;
  nextRt: string;
  nextRw: string;
} {
  const currentAlamat = (rec.alamat || '').trim();
  const currentRt = (rec.rt || '').trim();
  const currentRw = (rec.rw || '').trim();

  if (!bastAlamat || !bastAlamat.trim() || bastAlamat.trim() === '-') {
    return { changed: false, nextAlamat: currentAlamat, nextRt: currentRt, nextRw: currentRw };
  }

  const parsed = parseRtRwFromBastAddress(bastAlamat);
  const missingRt = !currentRt || /^0+$/.test(currentRt);
  const missingRw = !currentRw || /^0+$/.test(currentRw);

  const nextRt = missingRt && parsed.rt ? parsed.rt : currentRt;
  const nextRw = missingRw && parsed.rw ? parsed.rw : currentRw;

  const missingStreet =
    !currentAlamat ||
    currentAlamat === '-' ||
    (parsed.streetAlamat.length > currentAlamat.length + 6 &&
      !/\b(JL|JALAN|GG|GANG|BLOK|NO)\b/i.test(currentAlamat));

  const nextAlamat = missingStreet && parsed.streetAlamat
    ? formatAlamatLengkap(parsed.streetAlamat)
    : currentAlamat;

  const changed =
    nextRt !== currentRt ||
    nextRw !== currentRw ||
    nextAlamat !== currentAlamat;

  return { changed, nextAlamat, nextRt, nextRw };
}

export function countRecordsNeedingBastAddressEnrichment(
  result: TroubleshootingReconcileResult,
  records: KpmRecord[]
): number {
  if (!result || result.proposalSourceType !== 'database') return 0;
  const byId = new Map(records.map((r) => [r.id, r]));
  let count = 0;
  for (const row of result.mainRows) {
    if (row.isEmpty || !row.sourceKpmId || !row.bastRawAlamat) continue;
    const rec = byId.get(row.sourceKpmId);
    if (!rec) continue;
    if (computeKpmAddressEnrichmentFromBast(rec, row.bastRawAlamat).changed) {
      count += 1;
    }
  }
  return count;
}

export function reconcileProposalWithBast(params: {
  proposalRows: ProposalExtractedRow[];
  bastRows: BastExtractedRow[];
  proposalTitle: string;
  bastTitle: string;
  proposalSourceType: 'pdf' | 'database';
  catalog?: ItemBantuan[];
}): TroubleshootingReconcileResult {
  const {
    proposalRows,
    bastRows,
    proposalTitle,
    bastTitle,
    proposalSourceType,
    catalog = [],
  } = params;

  const sortedBast = [...bastRows]
    .filter((r) => Number.isFinite(Number(r.no)) && Number(r.no) > 0)
    .sort((a, b) => Number(a.no) - Number(b.no));

  const indexedBastSlots: IndexedBastSlot[] = sortedBast.map((row) => ({
    bastNo: Number(row.no),
    itemCode: mapBastBarangToItemCode(row.barangList || []),
    nama: (row.nama || '').trim().toUpperCase(),
    nik: (row.nik || '').replace(/\s+/g, '').trim(),
    alamat: (row.alamat || '').replace(/\s+/g, ' ').trim(),
    barangList: (row.barangList || []).map((b) => b.trim()).filter(Boolean),
    strictName: normalizeStrictName(row.nama || ''),
    alphaName: normalizeAlphaName(row.nama || ''),
  }));

  // Hitung kuota BAST dan contoh rincian barang per kode item, serta susunan blok berurutan
  const bastQuotaByItem = new Map<string, number>();
  const bastBarangSetByItem = new Map<string, Set<string>>();
  const bastBlocks: { itemCode: string; slots: IndexedBastSlot[] }[] = [];

  for (const slot of indexedBastSlots) {
    bastQuotaByItem.set(slot.itemCode, (bastQuotaByItem.get(slot.itemCode) ?? 0) + 1);
    const barangSet = bastBarangSetByItem.get(slot.itemCode) ?? new Set<string>();
    for (const b of slot.barangList) {
      barangSet.add(formatTitleCaseItem(b));
    }
    bastBarangSetByItem.set(slot.itemCode, barangSet);

    const lastBlock = bastBlocks[bastBlocks.length - 1];
    if (lastBlock && lastBlock.itemCode === slot.itemCode) {
      lastBlock.slots.push(slot);
    } else {
      bastBlocks.push({ itemCode: slot.itemCode, slots: [slot] });
    }
  }

  // Kelompokkan KPM Proposal menurut kode item ASLI-nya (Aturan 2: DILARANG mengubah item usulan)
  const cleanProposalRows = proposalRows
    .map((r) => ({
      ...r,
      item: (r.item || '').trim().toUpperCase(),
      nama: (r.nama || '').trim().toUpperCase(),
      pengelola: (r.pengelola || '').trim(),
      kelurahan: (r.kelurahan || '').trim(),
      alamat: (r.alamat || '').trim(),
      rtRw: (r.rtRw || '').trim(),
      no: String(r.no || '').trim(),
    }))
    .filter((r) => Boolean(r.nama && r.item));

  const proposalQueueByItem = new Map<string, ProposalExtractedRow[]>();
  const proposalTotalByItem = new Map<string, number>();
  const proposalItemOrder: string[] = [];

  for (const row of cleanProposalRows) {
    const code = row.item;
    if (!proposalQueueByItem.has(code)) {
      proposalQueueByItem.set(code, []);
      proposalItemOrder.push(code);
    }
    proposalQueueByItem.get(code)!.push(row);
    proposalTotalByItem.set(code, (proposalTotalByItem.get(code) ?? 0) + 1);
  }

  // Pre-match Proposal KPM ke slot BAST agar setiap KPM terhubung ke nomor/item BAST awal, NIK, & alamat lengkapnya
  const matchedBastByPropRow = new Map<ProposalExtractedRow, IndexedBastSlot | null>();
  const usedBastSlotMap = new Map<IndexedBastSlot, boolean>();

  for (const row of cleanProposalRows) {
    const match = findMatchingBastSlot(row, indexedBastSlots, usedBastSlotMap);
    matchedBastByPropRow.set(row, match);
    if (match) {
      usedBastSlotMap.set(match, true);
    }
  }

  // Konsumsi antrean per kode item sesuai urutan blok di BAST (Aturan 3, 4, 6)
  const consumedCountByItem = new Map<string, number>();
  const mainRows: ReconciledMainRow[] = [];

  let unchangedCount = 0;
  let shiftedCount = 0;
  let newInProposalCount = 0;
  let emptyCount = 0;

  for (const block of bastBlocks) {
    const code = block.itemCode;
    const queue = proposalQueueByItem.get(code) || [];
    const totalPropForItem = proposalTotalByItem.get(code) ?? 0;
    const totalBastForItem = bastQuotaByItem.get(code) ?? 0;
    const itemName = getTroubleshootingItemName(code, catalog);

    for (const slot of block.slots) {
      const cursor = consumedCountByItem.get(code) ?? 0;
      const propKpm = cursor < queue.length ? queue[cursor] : null;

      if (propKpm) {
        consumedCountByItem.set(code, cursor + 1);
        const matchedBast = matchedBastByPropRow.get(propKpm) || null;
        const resolvedNik = matchedBast?.nik || propKpm.nik || '-';
        const resolvedAlamat =
          matchedBast?.alamat || formatProposalAddressFull(propKpm) || '-';
        const resolvedPengelola = propKpm.pengelola || '-';
        const newNo = slot.bastNo;

        let status: ReconciledRowStatus;
        let keterangan: string;

        if (matchedBast) {
          const bastOrigName = getTroubleshootingItemName(matchedBast.itemCode, catalog);
          if (newNo === matchedBast.bastNo && code === matchedBast.itemCode) {
            status = 'unchanged';
            unchangedCount += 1;
            keterangan = `Tetap pada No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) — sesuai BAST dan Proposal.`;
          } else {
            status = 'shifted';
            shiftedCount += 1;
            keterangan = `Di BAST awal tercatat pada No. Urut ${pad2(matchedBast.bastNo)} dengan item ${matchedBast.itemCode} (${bastOrigName}); bergeser menjadi No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) sesuai usulan Proposal.`;
          }
        } else {
          status = 'new_in_proposal';
          newInProposalCount += 1;
          keterangan = `Tidak tercatat di BAST awal (KPM usulan pada No. Asal Proposal ${propKpm.no || '-'}); ditempatkan pada No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) sesuai usulan Proposal.`;
        }

        mainRows.push({
          sourceKpmId: propKpm.sourceKpmId,
          noUrut: newNo,
          noUrutText: pad2(newNo),
          kodeItem: code,
          namaItem: itemName,
          nama: propKpm.nama,
          nik: resolvedNik || '-',
          alamat: resolvedAlamat || '-',
          bastRawAlamat: matchedBast?.alamat ?? null,
          pengelola: resolvedPengelola,
          isEmpty: false,
          status,
          bastOriginalNo: matchedBast?.bastNo ?? null,
          bastOriginalItemCode: matchedBast?.itemCode ?? null,
          proposalOriginalNo: propKpm.no || null,
          keterangan,
        });
      } else {
        // Aturan 4: Sisa kuota di akhir blok dikosongkan
        emptyCount += 1;
        mainRows.push({
          noUrut: slot.bastNo,
          noUrutText: pad2(slot.bastNo),
          kodeItem: code,
          namaItem: itemName,
          nama: '-',
          nik: '-',
          alamat: '-',
          bastRawAlamat: null,
          pengelola: '-',
          isEmpty: true,
          status: 'empty_slot',
          bastOriginalNo: null,
          bastOriginalItemCode: null,
          proposalOriginalNo: null,
          keterangan: `BARIS KOSONG (Sisa kuota BAST item ${code} - ${itemName} belum terisi; usulan Proposal ${totalPropForItem} KPM dari kuota ${totalBastForItem} unit).`,
        });
      }
    }
  }

  // Aturan 5: KPM Kelebihan (Over Limit BAST) dikeluarkan ke Tabel Terpisah Bagian 2
  const excludedRows: ReconciledExcludedRow[] = [];
  const orderedItemCodes = Array.from(
    new Set([...bastBlocks.map((b) => b.itemCode), ...proposalItemOrder])
  );

  for (const code of orderedItemCodes) {
    const queue = proposalQueueByItem.get(code) || [];
    const consumed = consumedCountByItem.get(code) ?? 0;
    const totalPropForItem = proposalTotalByItem.get(code) ?? 0;
    const totalBastForItem = bastQuotaByItem.get(code) ?? 0;
    const itemName = getTroubleshootingItemName(code, catalog);

    if (consumed < queue.length) {
      for (let i = consumed; i < queue.length; i += 1) {
        const propKpm = queue[i];
        const matchedBast = matchedBastByPropRow.get(propKpm) || null;
        const resolvedAlamat =
          matchedBast?.alamat || formatProposalAddressFull(propKpm) || '-';
        const nextIdx = excludedRows.length + 1;
        excludedRows.push({
          sourceKpmId: propKpm.sourceKpmId,
          no: nextIdx,
          noText: pad2(nextIdx),
          noAsalProposal: propKpm.no || '-',
          kodeItem: code,
          namaItem: itemName,
          nama: propKpm.nama,
          alamat: resolvedAlamat,
          pengelola: propKpm.pengelola || '-',
          keterangan: `Dikeluarkan dari daftar utama karena melebihi limit/kuota item ${code} (${itemName}) yang tersedia di BAST (Usulan Proposal: ${totalPropForItem} KPM, Kuota BAST: ${totalBastForItem} Unit).`,
        });
      }
    }
  }

  // Bagian 3: Satu Tabel Rekapitulasi Perbandingan Kuota Item (BAST vs Proposal)
  const itemComparisons: ReconciledItemComparison[] = orderedItemCodes.map((code) => {
    const kuotaBast = bastQuotaByItem.get(code) ?? 0;
    const usulanKpm = proposalTotalByItem.get(code) ?? 0;
    const terisi = consumedCountByItem.get(code) ?? 0;
    const barisKosong = Math.max(0, kuotaBast - terisi);
    const dikeluarkan = Math.max(0, usulanKpm - terisi);

    const detectedItems = Array.from(bastBarangSetByItem.get(code) || []);
    const rincianBarangBast =
      detectedItems.length > 0
        ? detectedItems.join(', ')
        : TROUBLESHOOTING_ITEM_META[code]?.defaultBastDescription ||
          getTroubleshootingItemName(code, catalog);

    return {
      kodeItem: code,
      namaItem: getTroubleshootingItemName(code, catalog),
      rincianBarangBast,
      kuotaBast,
      usulanKpm,
      terisi,
      barisKosong,
      dikeluarkan,
    };
  });

  const totals = {
    kuotaBast: indexedBastSlots.length,
    usulanKpm: cleanProposalRows.length,
    terisi: itemComparisons.reduce((s, r) => s + r.terisi, 0),
    barisKosong: emptyCount,
    dikeluarkan: excludedRows.length,
    unchangedCount,
    shiftedCount,
    newInProposalCount,
  };

  let matchedBastCount = 0;
  matchedBastByPropRow.forEach((slot) => {
    if (slot) matchedBastCount += 1;
  });
  const totalProposalCount = cleanProposalRows.length;
  const totalBastCount = indexedBastSlots.length;
  const proposalMatchPercentage =
    totalProposalCount > 0 ? Math.round((matchedBastCount / totalProposalCount) * 100) : 0;
  const bastMatchPercentage =
    totalBastCount > 0 ? Math.round((matchedBastCount / totalBastCount) * 100) : 0;
  const effectiveMatchPercentage =
    totalProposalCount > 0 && totalBastCount > 0
      ? Math.round((matchedBastCount / Math.max(totalProposalCount, totalBastCount)) * 100)
      : proposalMatchPercentage;
  const isMismatch =
    totalProposalCount === 0 ||
    totalBastCount === 0 ||
    proposalMatchPercentage < 50 ||
    (totalBastCount > totalProposalCount * 1.8 && bastMatchPercentage < 50);

  const matchMetrics: TroubleshootingMatchMetrics = {
    totalProposalCount,
    totalBastCount,
    matchedBastCount,
    proposalMatchPercentage,
    bastMatchPercentage,
    effectiveMatchPercentage,
    isMismatch,
  };

  const hasProposalPengelolaData = cleanProposalRows.some(
    (r) => Boolean(r.pengelola && r.pengelola !== '-')
  );

  return {
    proposalTitle: proposalTitle.trim() || 'Daftar KPM Proposal',
    bastTitle: bastTitle.trim() || 'Dokumen BAST Dinas',
    proposalSourceType,
    generatedAt: new Date().toISOString(),
    mainRows,
    excludedRows,
    itemComparisons,
    totals,
    matchMetrics,
    hasProposalPengelolaData,
  };
}
