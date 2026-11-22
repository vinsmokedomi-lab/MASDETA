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

function computeNameSimilarityScore(nameA: string, nameB: string): number {
  const aAlpha = normalizeAlphaName(nameA);
  const bAlpha = normalizeAlphaName(nameB);
  if (!aAlpha || !bAlpha) return 0;
  if (aAlpha === bAlpha) return 100;

  const maxLen = Math.max(aAlpha.length, bAlpha.length);
  const dist = levenshteinDistance(aAlpha, bAlpha);
  const levScore = Math.max(0, Math.round((1 - dist / maxLen) * 100));

  const tokensA = normalizeStrictName(nameA).split(' ').filter((t) => t.length >= 2);
  const tokensB = normalizeStrictName(nameB).split(' ').filter((t) => t.length >= 2);
  let tokenScore = 0;
  if (tokensA.length > 0 && tokensB.length > 0) {
    const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
    const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;
    let fuzzyMatched = 0;
    for (const tok of shorter) {
      const hasMatch = longer.some((cand) => {
        if (cand === tok) return true;
        if (Math.min(cand.length, tok.length) >= 4) {
          return levenshteinDistance(tok, cand) <= 1;
        }
        return false;
      });
      if (hasMatch) fuzzyMatched += 1;
    }
    const denom = shorter.length >= 2 ? shorter.length : Math.max(tokensA.length, tokensB.length);
    tokenScore = Math.round((fuzzyMatched / denom) * 90);
  }

  return Math.max(levScore, tokenScore);
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
    const segments = cleaned.split('/').map((s) => s.trim());
    if (segments.length === 2) {
      const rtPart = segments[0] && segments[0] !== '-' ? segments[0].padStart(3, '0') : '';
      const rwPart = segments[1] && segments[1] !== '-' ? segments[1].padStart(3, '0') : '';
      if (rtPart && rwPart) {
        parts.push(`RT ${rtPart} RW ${rwPart}`);
      } else if (rtPart) {
        parts.push(`RT ${rtPart}`);
      } else if (rwPart) {
        parts.push(`RW ${rwPart}`);
      }
    } else if (cleaned && cleaned !== '-' && cleaned !== '/') {
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
export type SlotPlacementStrategy = 'proposal_order' | 'preserve_bast_number';

export interface TroubleshootingManualOverrides {
  /** Map kodeItem -> daftar rowKey KPM yang dipilih manual untuk DIKELUARKAN */
  excludedRowKeysByItem?: Record<string, string[]>;
  /** Map kodeItem -> urutan kustom rowKey KPM yang MASUK dalam blok item tsb */
  orderedIncludedKeysByItem?: Record<string, string[]>;
  /** Map proposal rowKey -> bastNo untuk pencocokan manual beda ejaan / typo nama */
  manualBastLinkByRowKey?: Record<string, number>;
  /** Strategi penempatan slot dalam blok BAST */
  placementStrategy?: SlotPlacementStrategy;
}

export interface ReconciledMainRow {
  rowKey?: string;
  sourceKpmId?: string;
  noUrut: number;
  noUrutText: string;
  kodeItem: string;
  namaItem: string;
  nama: string;
  nik: string;
  isManuallyLinked?: boolean;
  alamat: string;
  pengelola: string;
  isEmpty: boolean;
  status: ReconciledRowStatus;
  bastOriginalNo: number | null;
  bastOriginalItemCode: string | null;
  proposalOriginalNo: string | null;
  keterangan: string;
}

export interface ReconciledExcludedRow {
  rowKey?: string;
  sourceKpmId?: string;
  no: number;
  noText: string;
  noAsalProposal: string;
  kodeItem: string;
  namaItem: string;
  nama: string;
  alamat: string;
  pengelola: string;
  matchedBastNo?: number | null;
  matchedBastItemCode?: string | null;
  isManuallySelected?: boolean;
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

export interface OverQuotaCandidate {
  rowKey: string;
  sourceKpmId?: string;
  noAsalProposal: string;
  kodeItem: string;
  nama: string;
  alamat: string;
  pengelola: string;
  matchedBastNo: number | null;
  matchedBastItemCode: string | null;
  isExcluded: boolean;
  isManuallySelected: boolean;
}

export interface OverQuotaItemGroup {
  kodeItem: string;
  namaItem: string;
  kuotaBast: number;
  usulanKpm: number;
  excessCount: number;
  candidates: OverQuotaCandidate[];
}

export interface UnmatchedBastRow {
  bastNo: number;
  bastNoText: string;
  kodeItem: string;
  namaItem: string;
  nama: string;
  nik: string;
  alamat: string;
  suggestedProposalRowKey: string | null;
  suggestedProposalName: string | null;
  suggestedProposalItem: string | null;
  suggestedSimilarityScore: number;
}

export interface PengelolaImpactRow {
  pengelola: string;
  usulan: number;
  masuk: number;
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
  placementStrategy: SlotPlacementStrategy;
  mainRows: ReconciledMainRow[];
  excludedRows: ReconciledExcludedRow[];
  itemComparisons: ReconciledItemComparison[];
  overQuotaGroups: OverQuotaItemGroup[];
  unmatchedBastRows: UnmatchedBastRow[];
  pengelolaImpacts: PengelolaImpactRow[];
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

interface CleanProposalRow extends ProposalExtractedRow {
  rowKey: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getProposalRowKey(row: ProposalExtractedRow, index: number): string {
  if (row.sourceKpmId) {
    return `id:${row.sourceKpmId}`;
  }
  const cleanNo = String(row.no || '').trim();
  const cleanItem = (row.item || '').trim().toUpperCase();
  const alpha = normalizeAlphaName(row.nama || '');
  return `pdf:${index}:${cleanNo}:${cleanItem}:${alpha}`;
}

function findMatchingBastSlot(
  propRow: CleanProposalRow,
  bastSlots: IndexedBastSlot[],
  preferredIndexMap: Map<IndexedBastSlot, boolean>
): IndexedBastSlot | null {
  const strictProp = normalizeStrictName(propRow.nama);
  const alphaProp = normalizeAlphaName(propRow.nama);
  if (!alphaProp) return null;

  const propNoNum = Number(String(propRow.no || '').replace(/\D/g, '')) || 0;
  const pickBest = (candidates: IndexedBastSlot[]): IndexedBastSlot | null => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return [...candidates].sort((a, b) => {
      const aUsed = preferredIndexMap.get(a) ? 1 : 0;
      const bUsed = preferredIndexMap.get(b) ? 1 : 0;
      if (aUsed !== bUsed) return aUsed - bUsed;
      return Math.abs(a.bastNo - propNoNum) - Math.abs(b.bastNo - propNoNum);
    })[0];
  };

  // 0. Prioritas tertinggi: kecocokan eksak NIK 16 digit (mengatasi perbedaan ejaan/singkatan nama di BAST Dinas)
  const cleanPropNik = (propRow.nik || '').replace(/\D/g, '');
  if (cleanPropNik.length === 16) {
    const nikMatches = bastSlots.filter(
      (s) => s.nik.replace(/\D/g, '') === cleanPropNik
    );
    if (nikMatches.length > 0) return pickBest(nikMatches);
  }

  const strictMatches = bastSlots.filter((s) => s.strictName === strictProp);
  if (strictMatches.length > 0) return pickBest(strictMatches);

  const alphaMatches = bastSlots.filter((s) => s.alphaName === alphaProp);
  if (alphaMatches.length > 0) return pickBest(alphaMatches);

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
      return (a.rec.nama || '').localeCompare(b.rec.nama || '', 'id');
    });

  return ordered.map(({ rec, slotNumber }, idx) => {
    const displayNo = slotNumber < 999999 ? pad2(slotNumber) : pad2(idx + 1);
    const rtRaw = (rec.rt || '').trim();
    const rwRaw = (rec.rw || '').trim();
    const rtRw =
      rtRaw || rwRaw
        ? `${rtRaw ? rtRaw.padStart(3, '0') : '-'} / ${rwRaw ? rwRaw.padStart(3, '0') : '-'}`
        : '';
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

export function reconcileProposalWithBast(params: {
  proposalRows: ProposalExtractedRow[];
  bastRows: BastExtractedRow[];
  proposalTitle: string;
  bastTitle: string;
  proposalSourceType: 'pdf' | 'database';
  catalog?: ItemBantuan[];
  overrides?: TroubleshootingManualOverrides;
}): TroubleshootingReconcileResult {
  const {
    proposalRows,
    bastRows,
    proposalTitle,
    bastTitle,
    proposalSourceType,
    catalog = [],
    overrides,
  } = params;

  const placementStrategy: SlotPlacementStrategy =
    overrides?.placementStrategy || 'proposal_order';

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

  const bastSlotByNo = new Map<number, IndexedBastSlot>();
  const bastQuotaByItem = new Map<string, number>();
  const bastBarangSetByItem = new Map<string, Set<string>>();
  const bastBlocks: { itemCode: string; slots: IndexedBastSlot[] }[] = [];

  for (const slot of indexedBastSlots) {
    bastSlotByNo.set(slot.bastNo, slot);
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
  const cleanProposalRows: CleanProposalRow[] = proposalRows
    .map((r, idx) => ({
      ...r,
      item: (r.item || '').trim().toUpperCase(),
      nama: (r.nama || '').trim().toUpperCase(),
      pengelola: (r.pengelola || '').trim(),
      kelurahan: (r.kelurahan || '').trim(),
      alamat: (r.alamat || '').trim(),
      rtRw: (r.rtRw || '').trim(),
      no: String(r.no || '').trim(),
      rowKey: getProposalRowKey(r, idx),
    }))
    .filter((r) => Boolean(r.nama && r.item));

  const proposalQueueByItem = new Map<string, CleanProposalRow[]>();
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

  // Pre-match Proposal KPM ke slot BAST:
  // 1) Terapkan link manual terlebih dahulu (untuk kasus typo / beda ejaan nama)
  const matchedBastByPropRow = new Map<CleanProposalRow, IndexedBastSlot | null>();
  const manuallyLinkedRowKeys = new Set<string>();
  const usedBastSlotMap = new Map<IndexedBastSlot, boolean>();

  const manualLinks = overrides?.manualBastLinkByRowKey || {};
  for (const row of cleanProposalRows) {
    const targetBastNo = manualLinks[row.rowKey];
    if (typeof targetBastNo === 'number' && bastSlotByNo.has(targetBastNo)) {
      const slot = bastSlotByNo.get(targetBastNo)!;
      if (!usedBastSlotMap.get(slot)) {
        matchedBastByPropRow.set(row, slot);
        usedBastSlotMap.set(slot, true);
        manuallyLinkedRowKeys.add(row.rowKey);
      }
    }
  }

  // 2) Auto-match sisa KPM Proposal ke slot BAST
  for (const row of cleanProposalRows) {
    if (matchedBastByPropRow.has(row)) continue;
    const match = findMatchingBastSlot(row, indexedBastSlots, usedBastSlotMap);
    matchedBastByPropRow.set(row, match);
    if (match) {
      usedBastSlotMap.set(match, true);
    }
  }

  // Tentukan KPM yang MASUK vs DIKELUARKAN per kode item (mendukung pilihan manual admin!)
  const orderedItemCodes = Array.from(
    new Set([...bastBlocks.map((b) => b.itemCode), ...proposalItemOrder])
  );

  const includedQueueByItem = new Map<string, CleanProposalRow[]>();
  const excludedQueueByItem = new Map<string, CleanProposalRow[]>();
  const manualExcludedKeysSetByItem = new Map<string, Set<string>>();
  const overQuotaGroups: OverQuotaItemGroup[] = [];

  for (const code of orderedItemCodes) {
    const queue = proposalQueueByItem.get(code) || [];
    const kuotaBast = bastQuotaByItem.get(code) ?? 0;
    const excessCount = Math.max(0, queue.length - kuotaBast);

    if (excessCount === 0) {
      includedQueueByItem.set(code, [...queue]);
      excludedQueueByItem.set(code, []);
      continue;
    }

    const rawManualKeys = overrides?.excludedRowKeysByItem?.[code] || [];
    const validRowKeySet = new Set(queue.map((r) => r.rowKey));
    const chosenExcludedKeys: string[] = [];

    for (const k of rawManualKeys) {
      if (validRowKeySet.has(k) && !chosenExcludedKeys.includes(k) && chosenExcludedKeys.length < excessCount) {
        chosenExcludedKeys.push(k);
      }
    }

    const manualSet = new Set(chosenExcludedKeys);
    manualExcludedKeysSetByItem.set(code, manualSet);

    // Jika pilihan manual lebih sedikit dari kelebihan kuota, lengkapi otomatis dari urutan terbawah
    const finalExcludedSet = new Set(chosenExcludedKeys);
    if (finalExcludedSet.size < excessCount) {
      for (let i = queue.length - 1; i >= 0 && finalExcludedSet.size < excessCount; i -= 1) {
        finalExcludedSet.add(queue[i].rowKey);
      }
    }

    const included: CleanProposalRow[] = [];
    const excluded: CleanProposalRow[] = [];
    for (const row of queue) {
      if (finalExcludedSet.has(row.rowKey)) {
        excluded.push(row);
      } else {
        included.push(row);
      }
    }

    includedQueueByItem.set(code, included);
    excludedQueueByItem.set(code, excluded);

    overQuotaGroups.push({
      kodeItem: code,
      namaItem: getTroubleshootingItemName(code, catalog),
      kuotaBast,
      usulanKpm: queue.length,
      excessCount,
      candidates: queue.map((row) => {
        const matchedBast = matchedBastByPropRow.get(row) || null;
        return {
          rowKey: row.rowKey,
          sourceKpmId: row.sourceKpmId,
          noAsalProposal: row.no || '-',
          kodeItem: code,
          nama: row.nama,
          alamat: formatProposalAddressFull(row) || '-',
          pengelola: row.pengelola || '-',
          matchedBastNo: matchedBast?.bastNo ?? null,
          matchedBastItemCode: matchedBast?.itemCode ?? null,
          isExcluded: finalExcludedSet.has(row.rowKey),
          isManuallySelected: manualSet.has(row.rowKey),
        };
      }),
    });
  }

  // Terapkan urutan kustom (hasil tombol ↑/↓ per item) jika ada
  for (const code of orderedItemCodes) {
    const customOrder = overrides?.orderedIncludedKeysByItem?.[code];
    const inc = includedQueueByItem.get(code);
    if (!customOrder || customOrder.length === 0 || !inc || inc.length <= 1) continue;
    const rankMap = new Map<string, number>();
    customOrder.forEach((k, idx) => rankMap.set(k, idx));
    const reordered = [...inc].sort((a, b) => {
      const ra = rankMap.has(a.rowKey) ? rankMap.get(a.rowKey)! : 999999;
      const rb = rankMap.has(b.rowKey) ? rankMap.get(b.rowKey)! : 999999;
      return ra - rb;
    });
    includedQueueByItem.set(code, reordered);
  }

  // Siapkan assignment per slot BAST berdasarkan strategi penempatan
  // Strategi 1 ('proposal_order'): isi berurutan dari atas blok, kosong di akhir blok
  // Strategi 2 ('preserve_bast_number'): KPM yg sudah punya No. BAST di item tsb tetap di nomornya, sisanya isi celah kosong
  const assignedPropByBastNo = new Map<number, CleanProposalRow | null>();
  const consumedCountByItem = new Map<string, number>();

  // Kelompokkan seluruh slot BAST per itemCode
  const allSlotsByItem = new Map<string, IndexedBastSlot[]>();
  for (const slot of indexedBastSlots) {
    const list = allSlotsByItem.get(slot.itemCode) || [];
    list.push(slot);
    allSlotsByItem.set(slot.itemCode, list);
  }

  for (const [code, slots] of allSlotsByItem.entries()) {
    const inc = includedQueueByItem.get(code) || [];
    const hasCustomOrderForItem = Boolean(overrides?.orderedIncludedKeysByItem?.[code]?.length);

    if (placementStrategy === 'preserve_bast_number' && !hasCustomOrderForItem) {
      const slotNoSet = new Set(slots.map((s) => s.bastNo));
      const claimedSlots = new Set<number>();
      const unpinned: CleanProposalRow[] = [];

      // Pass 1: pin KPM ke nomor BAST aslinya jika slot tsb bagian dari blok item ini
      for (const row of inc) {
        const matched = matchedBastByPropRow.get(row) || null;
        if (matched && slotNoSet.has(matched.bastNo) && !claimedSlots.has(matched.bastNo)) {
          assignedPropByBastNo.set(matched.bastNo, row);
          claimedSlots.add(matched.bastNo);
        } else {
          unpinned.push(row);
        }
      }

      // Pass 2: isi slot tersisa secara berurutan
      let cursor = 0;
      for (const slot of slots) {
        if (claimedSlots.has(slot.bastNo)) continue;
        const nextRow = cursor < unpinned.length ? unpinned[cursor] : null;
        if (nextRow) {
          cursor += 1;
          assignedPropByBastNo.set(slot.bastNo, nextRow);
        } else {
          assignedPropByBastNo.set(slot.bastNo, null);
        }
      }
      consumedCountByItem.set(code, Math.min(inc.length, slots.length));
    } else {
      // Strategi 'proposal_order' (atau saat urutan kustom item diterapkan)
      let cursor = 0;
      for (const slot of slots) {
        const nextRow = cursor < inc.length ? inc[cursor] : null;
        if (nextRow) {
          cursor += 1;
          assignedPropByBastNo.set(slot.bastNo, nextRow);
        } else {
          assignedPropByBastNo.set(slot.bastNo, null);
        }
      }
      consumedCountByItem.set(code, cursor);
    }
  }

  // Susun Tabel Utama (Bagian 1) mengikuti urutan blok BAST
  // Detail KPM (nama, NIK, alamat, pengelola) SELALU diambil murni dari Proposal (tidak mengambil detail dari BAST).
  const mainRows: ReconciledMainRow[] = [];

  let unchangedCount = 0;
  let shiftedCount = 0;
  let newInProposalCount = 0;
  let emptyCount = 0;

  for (const block of bastBlocks) {
    const code = block.itemCode;
    const totalPropForItem = proposalTotalByItem.get(code) ?? 0;
    const totalBastForItem = bastQuotaByItem.get(code) ?? 0;
    const itemName = getTroubleshootingItemName(code, catalog);

    for (const slot of block.slots) {
      const propKpm = assignedPropByBastNo.get(slot.bastNo) || null;

      if (propKpm) {
        const matchedBast = matchedBastByPropRow.get(propKpm) || null;
        const resolvedNik = (propKpm.nik || '').replace(/\D/g, '') || '-';
        const resolvedAlamat = formatProposalAddressFull(propKpm) || '-';
        const resolvedPengelola = propKpm.pengelola || '-';
        const newNo = slot.bastNo;
        const isManuallyLinked = manuallyLinkedRowKeys.has(propKpm.rowKey);

        let status: ReconciledRowStatus;
        let keterangan: string;

        if (matchedBast) {
          const bastOrigName = getTroubleshootingItemName(matchedBast.itemCode, catalog);
          const linkSuffix = isManuallyLinked ? ' [Dicocokkan manual]' : '';
          if (newNo === matchedBast.bastNo && code === matchedBast.itemCode) {
            status = 'unchanged';
            unchangedCount += 1;
            keterangan = `Tetap pada No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) — sesuai BAST dan Proposal.${linkSuffix}`;
          } else {
            status = 'shifted';
            shiftedCount += 1;
            keterangan = `Di BAST awal tercatat pada No. Urut ${pad2(matchedBast.bastNo)} dengan item ${matchedBast.itemCode} (${bastOrigName}); bergeser menjadi No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) sesuai usulan Proposal.${linkSuffix}`;
          }
        } else {
          status = 'new_in_proposal';
          newInProposalCount += 1;
          keterangan = `Tidak tercatat di BAST awal (KPM usulan pada No. Asal Proposal ${propKpm.no || '-'}); ditempatkan pada No. Urut ${pad2(newNo)} dengan item ${code} (${itemName}) sesuai usulan Proposal.`;
        }

        mainRows.push({
          rowKey: propKpm.rowKey,
          sourceKpmId: propKpm.sourceKpmId,
          noUrut: newNo,
          noUrutText: pad2(newNo),
          kodeItem: code,
          namaItem: itemName,
          nama: propKpm.nama,
          nik: resolvedNik,
          isManuallyLinked,
          alamat: resolvedAlamat,
          pengelola: resolvedPengelola,
          isEmpty: false,
          status,
          bastOriginalNo: matchedBast?.bastNo ?? null,
          bastOriginalItemCode: matchedBast?.itemCode ?? null,
          proposalOriginalNo: propKpm.no || null,
          keterangan,
        });
      } else {
        emptyCount += 1;
        mainRows.push({
          noUrut: slot.bastNo,
          noUrutText: pad2(slot.bastNo),
          kodeItem: code,
          namaItem: itemName,
          nama: '-',
          nik: '-',
          alamat: '-',
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

  // Susun Tabel Terpisah Bagian 2 (KPM Over Limit) sesuai pilihan manual / default
  const excludedRows: ReconciledExcludedRow[] = [];
  for (const code of orderedItemCodes) {
    const excludedForItem = excludedQueueByItem.get(code) || [];
    const manualSet = manualExcludedKeysSetByItem.get(code) || new Set<string>();
    const totalPropForItem = proposalTotalByItem.get(code) ?? 0;
    const totalBastForItem = bastQuotaByItem.get(code) ?? 0;
    const itemName = getTroubleshootingItemName(code, catalog);

    for (const propKpm of excludedForItem) {
      const matchedBast = matchedBastByPropRow.get(propKpm) || null;
      const resolvedAlamat = formatProposalAddressFull(propKpm) || '-';
      const isManuallySelected = manualSet.has(propKpm.rowKey);
      const nextIdx = excludedRows.length + 1;
      excludedRows.push({
        rowKey: propKpm.rowKey,
        sourceKpmId: propKpm.sourceKpmId,
        no: nextIdx,
        noText: pad2(nextIdx),
        noAsalProposal: propKpm.no || '-',
        kodeItem: code,
        namaItem: itemName,
        nama: propKpm.nama,
        alamat: resolvedAlamat,
        pengelola: propKpm.pengelola || '-',
        matchedBastNo: matchedBast?.bastNo ?? null,
        matchedBastItemCode: matchedBast?.itemCode ?? null,
        isManuallySelected,
        keterangan: `${
          isManuallySelected ? 'Dipilih manual oleh admin untuk dikeluarkan' : 'Dikeluarkan dari daftar utama'
        } karena melebihi limit/kuota item ${code} (${itemName}) yang tersedia di BAST (Usulan Proposal: ${totalPropForItem} KPM, Kuota BAST: ${totalBastForItem} Unit).`,
      });
    }
  }

  // Audit Nama di BAST yang Tidak Terpasang di Proposal (potensi dihapus / typo ejaan)
  const unmatchedProposalRows = cleanProposalRows.filter((r) => !matchedBastByPropRow.get(r));
  const unmatchedBastRows: UnmatchedBastRow[] = indexedBastSlots
    .filter((slot) => !usedBastSlotMap.get(slot))
    .map((slot) => {
      let bestRow: CleanProposalRow | null = null;
      let bestScore = 0;

      for (const propRow of unmatchedProposalRows) {
        const score = computeNameSimilarityScore(slot.nama, propRow.nama);
        if (score > bestScore) {
          bestScore = score;
          bestRow = propRow;
        }
      }

      const hasSuggestion = Boolean(bestRow && bestScore >= 45);
      return {
        bastNo: slot.bastNo,
        bastNoText: pad2(slot.bastNo),
        kodeItem: slot.itemCode,
        namaItem: getTroubleshootingItemName(slot.itemCode, catalog),
        nama: slot.nama || '-',
        nik: slot.nik || '-',
        alamat: slot.alamat || '-',
        suggestedProposalRowKey: hasSuggestion ? bestRow!.rowKey : null,
        suggestedProposalName: hasSuggestion ? bestRow!.nama : null,
        suggestedProposalItem: hasSuggestion ? bestRow!.item : null,
        suggestedSimilarityScore: hasSuggestion ? bestScore : 0,
      };
    });

  // Rekap Dampak per Pengelola
  const pengelolaMap = new Map<string, PengelolaImpactRow>();
  const excludedKeySet = new Set(excludedRows.map((r) => r.rowKey).filter(Boolean) as string[]);

  for (const row of cleanProposalRows) {
    const label = row.pengelola && row.pengelola !== '-' ? row.pengelola : 'Tanpa Pengelola';
    const existing = pengelolaMap.get(label) || {
      pengelola: label,
      usulan: 0,
      masuk: 0,
      dikeluarkan: 0,
    };
    existing.usulan += 1;
    if (excludedKeySet.has(row.rowKey)) {
      existing.dikeluarkan += 1;
    } else {
      existing.masuk += 1;
    }
    pengelolaMap.set(label, existing);
  }

  const pengelolaImpacts = Array.from(pengelolaMap.values()).sort((a, b) => {
    if (b.dikeluarkan !== a.dikeluarkan) return b.dikeluarkan - a.dikeluarkan;
    if (b.usulan !== a.usulan) return b.usulan - a.usulan;
    return a.pengelola.localeCompare(b.pengelola, 'id');
  });

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
    placementStrategy,
    mainRows,
    excludedRows,
    itemComparisons,
    overQuotaGroups,
    unmatchedBastRows,
    pengelolaImpacts,
    totals,
    matchMetrics,
    hasProposalPengelolaData,
  };
}

/**
 * Menyusun ringkasan teks siap kirim ke grup WhatsApp koordinasi tim / Pengelola.
 */
export function buildWhatsAppReconcileSummary(result: TroubleshootingReconcileResult): string {
  const lines: string[] = [];
  lines.push(`*LAPORAN REKONSILIASI PROPOSAL vs BAST DINAS*`);
  lines.push(`Proposal: ${result.proposalTitle}`);
  lines.push(`BAST Dinas: ${result.bastTitle}`);
  lines.push('');
  lines.push(`*Ringkasan Kuota:*`);
  lines.push(`• Kuota BAST: ${result.totals.kuotaBast} unit`);
  lines.push(`• Usulan Proposal: ${result.totals.usulanKpm} KPM`);
  lines.push(
    `• Terisi (Masuk): ${result.totals.terisi} KPM (${result.totals.unchangedCount} tetap, ${result.totals.shiftedCount} bergeser, ${result.totals.newInProposalCount} usulan baru)`
  );
  lines.push(`• Baris Kosong: ${result.totals.barisKosong} slot`);
  lines.push(`• Dikeluarkan (Over Kuota): ${result.totals.dikeluarkan} KPM`);

  const emptyRows = result.mainRows.filter((r) => r.isEmpty);
  if (emptyRows.length > 0) {
    lines.push('');
    lines.push(`*Slot Kosong Tersedia (${emptyRows.length}):*`);
    emptyRows.forEach((r) => {
      lines.push(`- No. ${r.noUrutText} · ${r.kodeItem} (${r.namaItem})`);
    });
  }

  if (result.excludedRows.length > 0) {
    lines.push('');
    lines.push(`*KPM Dikeluarkan / Over Kuota (${result.excludedRows.length}):*`);
    result.excludedRows.forEach((r, i) => {
      const peng = r.pengelola && r.pengelola !== '-' ? ` · Pengelola: ${r.pengelola}` : '';
      lines.push(`${i + 1}. ${r.nama} (${r.kodeItem}, No. Asal ${r.noAsalProposal})${peng}`);
    });
  }

  if (result.unmatchedBastRows.length > 0) {
    lines.push('');
    lines.push(`*Nama di BAST Belum Terpasang di Proposal (${result.unmatchedBastRows.length}):*`);
    result.unmatchedBastRows.slice(0, 12).forEach((u) => {
      lines.push(`- BAST No. ${u.bastNoText} (${u.kodeItem}): ${u.nama}`);
    });
    if (result.unmatchedBastRows.length > 12) {
      lines.push(`...dan ${result.unmatchedBastRows.length - 12} nama lainnya.`);
    }
  }

  return lines.join('\n');
}
