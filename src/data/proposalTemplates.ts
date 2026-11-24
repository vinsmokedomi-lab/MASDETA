import { INITIAL_WILAYAH_LIST } from './kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalDestinationType,
  ProposalRecord,
  ProposalSlotMap,
  SavedProposalRabConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  getAbsenSeq,
  getItemHierarchyRank,
  isKecamatanProposal,
  resolveKpmDomicile,
  resolveProposalDomicile,
  resolveProposalSlotStateForGroup,
} from '../utils/imageProcessor';
import { formatRupiahCurrency } from '../utils/rabCalculator';

export type ProposalCoverLayoutKey =
  | 'blue-wave'
  | 'terracotta-pillars'
  | 'navy-right-arc'
  | 'diagonal-ribbons'
  | 'gold-mosaic'
  | 'orange-top-block'
  | 'emerald-left-bar'
  | 'indigo-split-frame'
  | 'burgundy-classic'
  | 'teal-corner-geo'
  | 'amber-horizon'
  | 'slate-executive'
  | 'forest-curve'
  | 'cobalt-grid'
  | 'plum-editorial';

export type ProposalFontStyle = 'sans' | 'serif' | 'classic';
export type ProposalChapterFormat = 'roman' | 'numeric' | 'bab-roman' | 'alpha';
export type ProposalTableTheme = 'solid-primary' | 'soft-tint' | 'classic-bordered' | 'dark-slate';
export type ProposalOpdClosingPosition = 'before-appendix' | 'after-appendix';

export interface ProposalOpdNarrativeTemplate {
  pengantarTitle: string;
  pengantar: string[];
  tujuanTitle: string;
  tujuanIntro: string;
  tujuanPoints: string[];
  kegiatanTitle: string;
  kegiatan: string[];
  anggaranTitle: string;
  anggaran: string[];
  penutupTitle: string;
  penutup: string[];
}

export interface ProposalWilayahNarrativeTemplate {
  pendahuluanTitle: string;
  pendahuluan: string[];
  maksudTujuanTitle: string;
  maksudLabel: string;
  maksud: string;
  tujuanLabel: string;
  tujuanPoints: string[];
  lampiranTitle: string;
  lampiranIntro: string;
  penutupTitle: string;
  penutup: string[];
}

export interface ProposalStyleTemplate {
  id: number; // 1..15 (tetap & permanen)
  code: string; // "Style 01" .. "Style 15"
  name: string;
  tagline: string;
  coverLayout: ProposalCoverLayoutKey;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    tint: string;
    border: string;
    textOnPrimary: string;
  };
  fontStyle: ProposalFontStyle;
  chapterFormat: ProposalChapterFormat;
  tableTheme: ProposalTableTheme;
  opdClosingPosition: ProposalOpdClosingPosition;
  coverKicker: string;
  coverMainTitle: string;
  coverSubTitle: string;
  opdNarrative: ProposalOpdNarrativeTemplate;
  wilayahNarrative: ProposalWilayahNarrativeTemplate;
}

export interface ResolvedOpdNarrative {
  pengantarTitle: string;
  pengantar: string[];
  tujuanTitle: string;
  tujuanIntro: string;
  tujuanPoints: string[];
  kegiatanTitle: string;
  kegiatan: string[];
  anggaranTitle: string;
  anggaran: string[];
  penutupTitle: string;
  penutup: string[];
}

export interface ResolvedWilayahNarrative {
  pendahuluanTitle: string;
  pendahuluan: string[];
  maksudTujuanTitle: string;
  maksudLabel: string;
  maksud: string;
  tujuanLabel: string;
  tujuanPoints: string[];
  lampiranTitle: string;
  lampiranIntro: string;
  penutupTitle: string;
  penutup: string[];
}

export interface ProposalDestinationContext {
  isKelurahanLevel: boolean;
  allowedDestinations: ProposalDestinationType[];
  defaultDestination: ProposalDestinationType;
  wilayahDisplay: string;
  wilayahUpper: string;
  kabKota: string;
  kecamatan: string;
  kelurahan: string;
  jalan: string;
  tahun: string;
  coverLines: string[];
  runningHeaderLabel: string;
  buildFileName: (destination: ProposalDestinationType) => string;
}

export interface ProposalKpmRowResolved {
  record: KpmRecord;
  itemCode: string;
  itemName: string;
  nama: string;
  alamatLengkap: string;
  alamatJalan: string;
  rtPadded: string;
  rwPadded: string;
  nikKtp: string;
  desilText: string;
  kelurahan: string;
  kecamatan: string;
  pekerjaanDb: string;
  usahaByItem: string;
}

export interface ProposalOpdItemGroup {
  itemCode: string;
  itemName: string;
  startIndex: number; // 1-based continuous number across all groups
  kpms: Array<ProposalKpmRowResolved & { continuousNo: number }>;
}

export interface ProposalKpmDataset {
  activeRecords: KpmRecord[];
  resolvedRows: ProposalKpmRowResolved[];
  missingItemRecords: KpmRecord[];
  itemCounts: Record<string, number>;
  opdGroups: ProposalOpdItemGroup[];
  wilayahSortedRows: Array<ProposalKpmRowResolved & { seqNo: number }>;
  totalActiveKpm: number;
}

export interface ProposalOpdValidationDiff {
  itemCode: string;
  liveCount: number;
  rabCount: number;
}

export interface ProposalOpdValidationResult {
  isReady: boolean;
  hasSavedRab: boolean;
  isRabPositive: boolean;
  countsMatch: boolean;
  totalLiveKpm: number;
  totalRabKpm: number;
  diffs: ProposalOpdValidationDiff[];
  missingItemKpms: KpmRecord[];
  reasons: string[];
}

export function padTwoDigits(n: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return String(safe).padStart(2, '0');
}

export function padThreeDigits(raw?: string | null): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '-';
  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return '-';
  return String(num).padStart(3, '0');
}

export function formatDesilNumber(dtsen?: string | null): string {
  const trimmed = String(dtsen || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'tidak ada') return '-';
  const match = trimmed.match(/(\d+(?:\s*-\s*\d+)?)/);
  return match ? match[1].replace(/\s+/g, '') : trimmed;
}

export function getDefaultUsahaLabelForItem(itemCode: string, itemName?: string): string {
  const code = String(itemCode || '').trim().toUpperCase();
  const map: Record<string, string> = {
    OV: 'Usaha Kue / Roti Rumahan',
    KPR: 'Warung Makan / Jualan Makanan',
    JHT: 'Usaha Jahit Pakaian',
    MC: 'Usaha Laundry / Jasa Cuci',
    TKG: 'Jasa Pertukangan / Bengkel Kayu',
    ES: 'Usaha Minuman / Jualan Es',
    CMT: 'Usaha Cuci Motor / Kendaraan',
    TBS: 'Jasa Tebas / Pemeliharaan Lahan',
    TND: 'Usaha Sewa Tenda & Kursi',
    MSK: 'Usaha Kuliner / Katering Rumahan',
  };
  if (map[code]) return map[code];
  if (itemName && itemName.trim()) return `Usaha ${itemName.trim()}`;
  return 'Usaha Mikro Mandiri';
}

export function numberToIndonesianWords(rawNum: number): string {
  const n = Math.floor(Math.abs(Number.isFinite(rawNum) ? rawNum : 0));
  if (n === 0) return 'nol';
  const units = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas',
  ];

  const convert = (num: number): string => {
    if (num < 12) return units[num];
    if (num < 20) return `${convert(num - 10)} belas`;
    if (num < 100) {
      const rem = num % 10;
      return `${units[Math.floor(num / 10)]} puluh${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 200) {
      const rem = num - 100;
      return `seratus${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 1000) {
      const rem = num % 100;
      return `${units[Math.floor(num / 100)]} ratus${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 2000) {
      const rem = num - 1000;
      return `seribu${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 1_000_000) {
      const rem = num % 1000;
      return `${convert(Math.floor(num / 1000))} ribu${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 1_000_000_000) {
      const rem = num % 1_000_000;
      return `${convert(Math.floor(num / 1_000_000))} juta${rem ? ` ${convert(rem)}` : ''}`;
    }
    if (num < 1_000_000_000_000) {
      const rem = num % 1_000_000_000;
      return `${convert(Math.floor(num / 1_000_000_000))} miliar${rem ? ` ${convert(rem)}` : ''}`;
    }
    const rem = num % 1_000_000_000_000;
    return `${convert(Math.floor(num / 1_000_000_000_000))} triliun${rem ? ` ${convert(rem)}` : ''}`;
  };

  return convert(n).replace(/\s+/g, ' ').trim();
}

export function formatRupiahTerbilang(amount: number): string {
  const words = numberToIndonesianWords(amount);
  if (!words) return 'Nol rupiah';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
}

function cleanWilayahPrefix(raw: string, type: 'kelurahan' | 'kecamatan' | 'kabkota'): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (type === 'kelurahan') {
    return trimmed.replace(/^(?:kelurahan|kel\.?|desa)\s+/i, '').trim();
  }
  if (type === 'kecamatan') {
    return trimmed.replace(/^(?:kecamatan|kec\.?)\s+/i, '').trim();
  }
  return trimmed;
}

function formatShortProposalTitleForFile(proposal: ProposalRecord): string {
  let clean = String(proposal.namaProposal || '').trim();
  // Hindari duplikasi tahun jika namaProposal sudah diawali/diakhiri tahun proposal
  const tahun = String(proposal.tahun || '').trim();
  if (tahun) {
    clean = clean.replace(new RegExp(`^${tahun}\\s*[-·]?\\s*`, 'i'), '').trim();
    clean = clean.replace(new RegExp(`\\s*[-·]?\\s*${tahun}$`, 'i'), '').trim();
  }
  // Ringkas kata "Kelurahan " -> "Kel. " atau "Kecamatan " -> "Kec. " agar rapi & ringkas seperti referensi
  clean = clean.replace(/^Kelurahan\s+/i, 'Kel. ').replace(/^Kecamatan\s+/i, 'Kec. ');
  return clean || 'MASDETA';
}

export function resolveProposalDestinationContext(
  proposal: ProposalRecord,
  allProposals: ProposalRecord[] = [],
  wilayahList: WilayahKabKota[] = INITIAL_WILAYAH_LIST
): ProposalDestinationContext {
  const dom = resolveProposalDomicile(
    proposal.namaProposal,
    allProposals.length > 0 ? allProposals : [proposal],
    proposal.tahun,
    wilayahList
  );

  const rawKel = (proposal.kelurahan || dom.kelurahan || '').trim();
  const rawKec = (proposal.kecamatan || dom.kecamatan || '').trim();
  const rawKab = (proposal.kabKota || dom.kabKota || 'Kota Pontianak').trim();
  const rawJalan = (proposal.jalan || '').trim();
  const propNameLower = proposal.namaProposal.trim().toLowerCase();

  const explicitKecProp =
    isKecamatanProposal(proposal.namaProposal) && !(proposal.kelurahan || '').trim();
  const hasKelurahanWord = /\b(kelurahan|kel\.|desa)(?=\s|$)/i.test(propNameLower);
  const isKelurahanLevel = !explicitKecProp && (Boolean(rawKel) || hasKelurahanWord);

  const bareKel = cleanWilayahPrefix(rawKel, 'kelurahan');
  const bareKec = cleanWilayahPrefix(rawKec, 'kecamatan');

  const kelLabel = bareKel ? `Kelurahan ${bareKel}` : '';
  const kecLabel = bareKec ? `Kecamatan ${bareKec}` : '';
  const kabLabel = rawKab || 'Kota Pontianak';

  let wilayahDisplay = proposal.namaProposal.trim();
  if (isKelurahanLevel && kelLabel) {
    wilayahDisplay = [kelLabel, kecLabel, kabLabel].filter(Boolean).join(', ');
  } else if (kecLabel) {
    wilayahDisplay = [kecLabel, kabLabel].filter(Boolean).join(', ');
  } else if (kabLabel) {
    wilayahDisplay = [proposal.namaProposal.trim(), kabLabel].filter(Boolean).join(', ');
  }

  const coverLines: string[] = [];
  if (isKelurahanLevel) {
    if (rawJalan) coverLines.push(rawJalan.toUpperCase());
    if (kelLabel) coverLines.push(kelLabel.toUpperCase());
    if (kecLabel) coverLines.push(kecLabel.toUpperCase());
    if (kabLabel) coverLines.push(kabLabel.toUpperCase());
  } else {
    if (kecLabel) coverLines.push(kecLabel.toUpperCase());
    else coverLines.push(proposal.namaProposal.trim().toUpperCase());
    if (kabLabel) coverLines.push(kabLabel.toUpperCase());
  }
  if (coverLines.length === 0) {
    coverLines.push(proposal.namaProposal.trim().toUpperCase());
  }

  const runningHeaderLabel = isKelurahanLevel
    ? (kelLabel || proposal.namaProposal.trim()).toUpperCase()
    : (kecLabel || proposal.namaProposal.trim()).toUpperCase();

  const allowedDestinations: ProposalDestinationType[] = isKelurahanLevel
    ? ['Kelurahan', 'OPD']
    : ['Kecamatan', 'OPD'];

  const tahun = String(proposal.tahun || new Date().getFullYear()).trim();

  return {
    isKelurahanLevel,
    allowedDestinations,
    defaultDestination: 'OPD',
    wilayahDisplay,
    wilayahUpper: wilayahDisplay.toUpperCase(),
    kabKota: kabLabel,
    kecamatan: kecLabel,
    kelurahan: kelLabel,
    jalan: rawJalan,
    tahun,
    coverLines,
    runningHeaderLabel,
    buildFileName: (destination: ProposalDestinationType) => {
      const shortName = formatShortProposalTitleForFile(proposal);
      const destLabel = destination;
      return `Proposal ${shortName} ${tahun} - ${destLabel}.pdf`;
    },
  };
}

export function formatChapterHeading(
  format: ProposalChapterFormat,
  index: number, // 1-based
  title: string
): string {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const alphas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const cleanTitle = title.trim();
  const r = romans[index - 1] || String(index);
  const a = alphas[index - 1] || String(index);

  if (format === 'roman') return `${r}. ${cleanTitle}`;
  if (format === 'numeric') return `${index}. ${cleanTitle}`;
  if (format === 'bab-roman') return `BAB ${r} — ${cleanTitle}`;
  return `${a}. ${cleanTitle}`;
}

export function buildProposalKpmDataset(params: {
  proposal: ProposalRecord;
  allProposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
}): ProposalKpmDataset {
  const {
    proposal,
    allProposals,
    records,
    items,
    wilayahList = INITIAL_WILAYAH_LIST,
    proposalSlotMap = {},
  } = params;

  // Filter KPM yang ketat: hanya KPM berstatus 'accepted' yang tergabung pada proposal terpilih
  const activeRecords = records.filter(
    (r) =>
      r.validasi === 'accepted' &&
      (r.proposalId
        ? r.proposalId === proposal.id
        : r.proposal.trim().toLowerCase() === proposal.namaProposal.trim().toLowerCase() &&
          String(r.tahun) === String(proposal.tahun))
  );

  // Gunakan urutan slot resmi jika tersedia agar konsisten dengan Detail Proposal & Download PDF
  const { state: slotState } = resolveProposalSlotStateForGroup(
    proposalSlotMap,
    proposal.id,
    proposal.namaProposal,
    proposal.tahun,
    allProposals
  );

  let orderedActive: KpmRecord[];
  if (slotState && slotState.pinnedOrder.length > 0) {
    const merged = buildMergedProposalSlots({
      groupRecords: activeRecords,
      slotState,
      proposals: allProposals,
      catalog: items,
      wilayahList,
    });
    orderedActive = merged
      .filter((m): m is { kind: 'kpm'; slotNumber: number; record: KpmRecord } => m.kind === 'kpm')
      .map((m) => m.record);
  } else {
    orderedActive = [...activeRecords].sort((a, b) => {
      const rankDiff =
        getItemHierarchyRank(a.item, proposal.tahun, items) -
        getItemHierarchyRank(b.item, proposal.tahun, items);
      if (rankDiff !== 0) return rankDiff;
      const seqDiff = getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode);
      if (seqDiff !== 0) return seqDiff;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }

  const itemMap = new Map<string, ItemBantuan>();
  items.forEach((it) => {
    const code = it.code.trim().toUpperCase();
    if (!itemMap.has(code) || it.tahun === proposal.tahun) {
      itemMap.set(code, it);
    }
  });

  const missingItemRecords: KpmRecord[] = [];
  const itemCounts: Record<string, number> = {};
  const resolvedRows: ProposalKpmRowResolved[] = [];

  for (const rec of orderedActive) {
    const code = String(rec.item || '').trim().toUpperCase();
    if (!code) {
      missingItemRecords.push(rec);
    } else {
      itemCounts[code] = (itemCounts[code] || 0) + 1;
    }

    const dom = resolveKpmDomicile(rec, allProposals, wilayahList);
    const kelBare = cleanWilayahPrefix(
      dom.kelurahan || rec.kelurahan || proposal.kelurahan || '',
      'kelurahan'
    );
    const kecBare = cleanWilayahPrefix(
      dom.kecamatan || rec.kecamatan || proposal.kecamatan || '',
      'kecamatan'
    );
    const rtPadded = padThreeDigits(rec.rt);
    const rwPadded = padThreeDigits(rec.rw);
    const jalanRaw = (rec.alamat || '').trim() || '-';
    const rtRwPart =
      rtPadded !== '-' || rwPadded !== '-'
        ? `RT ${rtPadded !== '-' ? rtPadded : '-'} / RW ${rwPadded !== '-' ? rwPadded : '-'}`
        : '';
    const alamatLengkap = [
      jalanRaw,
      rtRwPart,
      kelBare ? `Kel. ${kelBare}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const matchedItem = code ? itemMap.get(code) : undefined;
    const itemName = matchedItem?.name || code || 'Belum Ditentukan';

    resolvedRows.push({
      record: rec,
      itemCode: code,
      itemName,
      nama: (rec.nama || '').trim() || '-',
      alamatLengkap: alamatLengkap || '-',
      alamatJalan: jalanRaw,
      rtPadded,
      rwPadded,
      nikKtp: (rec.nikKtp || '').replace(/\s+/g, '').trim() || '-',
      desilText: formatDesilNumber(rec.dtsen),
      kelurahan: kelBare || '-',
      kecamatan: kecBare || '-',
      pekerjaanDb: (rec.pekerjaan || '').trim() || '-',
      usahaByItem: getDefaultUsahaLabelForItem(code, itemName),
    });
  }

  // Kelompokkan untuk Mode OPD berdasarkan urutan Master Item resmi
  const byCode = new Map<string, ProposalKpmRowResolved[]>();
  resolvedRows.forEach((row) => {
    if (!row.itemCode) return;
    const list = byCode.get(row.itemCode) || [];
    list.push(row);
    byCode.set(row.itemCode, list);
  });

  const sortedCodes = Array.from(byCode.keys()).sort((a, b) => {
    const rankDiff =
      getItemHierarchyRank(a, proposal.tahun, items) -
      getItemHierarchyRank(b, proposal.tahun, items);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, 'id');
  });

  let runningNo = 1;
  const opdGroups: ProposalOpdItemGroup[] = sortedCodes.map((code) => {
    const rows = byCode.get(code) || [];
    const startIndex = runningNo;
    const numbered = rows.map((row) => ({
      ...row,
      continuousNo: runningNo++,
    }));
    const itemName = itemMap.get(code)?.name || code;
    return {
      itemCode: code,
      itemName,
      startIndex,
      kpms: numbered,
    };
  });

  // Urutan tabel Mode Kelurahan/Kecamatan: rapi per Kelurahan -> RW -> RT -> Nama
  const wilayahSortedRows = [...resolvedRows]
    .sort((a, b) => {
      const kelDiff = a.kelurahan.localeCompare(b.kelurahan, 'id');
      if (kelDiff !== 0) return kelDiff;
      const rwDiff = a.rwPadded.localeCompare(b.rwPadded, 'id');
      if (rwDiff !== 0) return rwDiff;
      const rtDiff = a.rtPadded.localeCompare(b.rtPadded, 'id');
      if (rtDiff !== 0) return rtDiff;
      return a.nama.localeCompare(b.nama, 'id');
    })
    .map((row, idx) => ({
      ...row,
      seqNo: idx + 1,
    }));

  return {
    activeRecords: orderedActive,
    resolvedRows,
    missingItemRecords,
    itemCounts,
    opdGroups,
    wilayahSortedRows,
    totalActiveKpm: orderedActive.length,
  };
}

export function validateProposalForOpd(
  dataset: ProposalKpmDataset,
  savedRab?: SavedProposalRabConfig | null
): ProposalOpdValidationResult {
  const reasons: string[] = [];
  const hasSavedRab = Boolean(savedRab);
  const isRabPositive = Boolean(savedRab && savedRab.totalTerhitung > 0 && savedRab.totalAnggaran > 0);

  if (dataset.totalActiveKpm === 0) {
    reasons.push('Proposal belum memiliki KPM aktif (status Diterima).');
  }

  if (dataset.missingItemRecords.length > 0) {
    const names = dataset.missingItemRecords
      .slice(0, 5)
      .map((r) => r.nama)
      .join(', ');
    const extra =
      dataset.missingItemRecords.length > 5
        ? ` (+${dataset.missingItemRecords.length - 5} KPM lainnya)`
        : '';
    reasons.push(
      `${dataset.missingItemRecords.length} KPM belum memiliki pilihan Item Bantuan: ${names}${extra}.`
    );
  }

  if (!hasSavedRab || !isRabPositive) {
    reasons.push(
      'Proposal ini belum memiliki data RAB tersimpan dengan total anggaran > Rp 0. Silakan susun dan simpan RAB terlebih dahulu.'
    );
    return {
      isReady: false,
      hasSavedRab,
      isRabPositive,
      countsMatch: false,
      totalLiveKpm: dataset.totalActiveKpm,
      totalRabKpm: savedRab?.totalKpmSnapshot || 0,
      diffs: [],
      missingItemKpms: dataset.missingItemRecords,
      reasons,
    };
  }

  // Bandingkan jumlah KPM per Master Item antara data live Proposal dengan snapshot RAB tersimpan
  const rabPackages = Array.isArray(savedRab?.packages) ? savedRab.packages : [];
  const rabPkgByCode = new Map<string, (typeof rabPackages)[number]>();
  const rabCounts: Record<string, number> = {};
  rabPackages.forEach((pkg) => {
    const code = String(pkg.kode || '').trim().toUpperCase();
    if (!code) return;
    rabPkgByCode.set(code, pkg);
    if (pkg.jumlahPenerima > 0) {
      rabCounts[code] = pkg.jumlahPenerima;
    }
  });

  const missingPackageDetails: string[] = [];
  if (rabPackages.length === 0) {
    reasons.push(
      'Rincian paket sub-item pada RAB tersimpan kosong (kemungkinan gagal tersinkron). Buka halaman RAB lalu simpan ulang RAB proposal ini.'
    );
  } else {
    dataset.opdGroups.forEach((group) => {
      const pkg = rabPkgByCode.get(group.itemCode);
      if (!pkg || !Array.isArray(pkg.subItems) || pkg.subItems.length === 0) {
        missingPackageDetails.push(group.itemCode);
      }
    });
    if (missingPackageDetails.length > 0) {
      reasons.push(
        `Rincian sub-item RAB belum tersedia untuk paket ${missingPackageDetails.join(', ')}. Buka halaman RAB dan simpan ulang.`
      );
    }
  }

  const allCodes = new Set<string>([
    ...Object.keys(dataset.itemCounts),
    ...Object.keys(rabCounts),
  ]);

  const diffs: ProposalOpdValidationDiff[] = [];
  allCodes.forEach((code) => {
    const liveCount = dataset.itemCounts[code] || 0;
    const rabCount = rabCounts[code] || 0;
    if (liveCount !== rabCount) {
      diffs.push({ itemCode: code, liveCount, rabCount });
    }
  });

  const totalRabKpm = Object.values(rabCounts).reduce((a, b) => a + b, 0);
  const countsMatch = diffs.length === 0 && totalRabKpm === dataset.totalActiveKpm;

  if (!countsMatch) {
    const diffDesc = diffs
      .map((d) => `${d.itemCode} (Proposal: ${d.liveCount}, RAB: ${d.rabCount})`)
      .join(', ');
    reasons.push(
      `Jumlah KPM aktif saat ini (${dataset.totalActiveKpm} KPM) tidak sinkron dengan RAB tersimpan (${totalRabKpm} KPM)${
        diffDesc ? `: ${diffDesc}` : ''
      }. Perbarui dan simpan ulang RAB terlebih dahulu.`
    );
  }

  const hasValidPackages = rabPackages.length > 0 && missingPackageDetails.length === 0;

  return {
    isReady:
      dataset.totalActiveKpm > 0 &&
      dataset.missingItemRecords.length === 0 &&
      hasSavedRab &&
      isRabPositive &&
      hasValidPackages &&
      countsMatch,
    hasSavedRab,
    isRabPositive,
    countsMatch,
    totalLiveKpm: dataset.totalActiveKpm,
    totalRabKpm,
    diffs,
    missingItemKpms: dataset.missingItemRecords,
    reasons,
  };
}

function interpolateText(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function resolveNarrativeVariables(params: {
  context: ProposalDestinationContext;
  destination: ProposalDestinationType;
  totalKpm: number;
  totalAnggaran: number;
}): Record<string, string> {
  const { context, destination, totalKpm, totalAnggaran } = params;
  const tujuanPenerima =
    destination === 'OPD'
      ? 'Dinas Sosial Provinsi Kalimantan Barat'
      : destination === 'Kecamatan'
      ? `Pemerintah ${context.kecamatan || 'Kecamatan'}`
      : `Pemerintah ${context.kelurahan || 'Kelurahan'}`;

  return {
    wilayah: context.wilayahDisplay,
    wilayahUpper: context.wilayahUpper,
    kabKota: context.kabKota,
    kecamatan: context.kecamatan || context.wilayahDisplay,
    kelurahan: context.kelurahan || context.wilayahDisplay,
    tahun: context.tahun,
    totalKpm: String(totalKpm),
    totalKpmTerbilang: numberToIndonesianWords(totalKpm),
    totalAnggaran: formatRupiahCurrency(totalAnggaran),
    totalAnggaranTerbilang: formatRupiahTerbilang(totalAnggaran),
    tujuanPenerima,
  };
}

export function resolveOpdNarrative(
  style: ProposalStyleTemplate,
  vars: Record<string, string>
): ResolvedOpdNarrative {
  const n = style.opdNarrative;
  return {
    pengantarTitle: interpolateText(n.pengantarTitle, vars),
    pengantar: n.pengantar.map((p) => interpolateText(p, vars)),
    tujuanTitle: interpolateText(n.tujuanTitle, vars),
    tujuanIntro: interpolateText(n.tujuanIntro, vars),
    tujuanPoints: n.tujuanPoints.map((p) => interpolateText(p, vars)),
    kegiatanTitle: interpolateText(n.kegiatanTitle, vars),
    kegiatan: n.kegiatan.map((p) => interpolateText(p, vars)),
    anggaranTitle: interpolateText(n.anggaranTitle, vars),
    anggaran: n.anggaran.map((p) => interpolateText(p, vars)),
    penutupTitle: interpolateText(n.penutupTitle, vars),
    penutup: n.penutup.map((p) => interpolateText(p, vars)),
  };
}

export function resolveWilayahNarrative(
  style: ProposalStyleTemplate,
  vars: Record<string, string>
): ResolvedWilayahNarrative {
  const n = style.wilayahNarrative;
  return {
    pendahuluanTitle: interpolateText(n.pendahuluanTitle, vars),
    pendahuluan: n.pendahuluan.map((p) => interpolateText(p, vars)),
    maksudTujuanTitle: interpolateText(n.maksudTujuanTitle, vars),
    maksudLabel: interpolateText(n.maksudLabel, vars),
    maksud: interpolateText(n.maksud, vars),
    tujuanLabel: interpolateText(n.tujuanLabel, vars),
    tujuanPoints: n.tujuanPoints.map((p) => interpolateText(p, vars)),
    lampiranTitle: interpolateText(n.lampiranTitle, vars),
    lampiranIntro: interpolateText(n.lampiranIntro, vars),
    penutupTitle: interpolateText(n.penutupTitle, vars),
    penutup: n.penutup.map((p) => interpolateText(p, vars)),
  };
}

// ============================================================================
// 15 TEMPLATE TETAP & PERMANEN (Style 01 – Style 15)
// Masing-masing memiliki desain cover, palet, tata letak, tipografi, posisi
// Penutup, dan narasi Bahasa Indonesia resmi yang 100% unik (tanpa duplikasi).
// ============================================================================
export const PROPOSAL_STYLE_TEMPLATES: ProposalStyleTemplate[] = [
  {
    id: 1,
    code: 'Style 01',
    name: 'Samudra Gelombang Biru',
    tagline: 'Cover gelombang biru bertumpuk · Bab Romawi · Penutup di akhir',
    coverLayout: 'blue-wave',
    palette: {
      primary: '#1E3A8A',
      secondary: '#2563EB',
      accent: '#93C5FD',
      tint: '#EFF6FF',
      border: '#BFDBFE',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'roman',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL PERMOHONAN BANTUAN',
    coverMainTitle: 'PERALATAN USAHA MANDIRI',
    coverSubTitle: 'PROGRAM PEMBERDAYAAN EKONOMI KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Penguatan ekonomi rumah tangga merupakan fondasi utama dalam mempercepat penanggulangan kemiskinan dan memperluas kemandirian masyarakat di wilayah {wilayah}. Masih banyak keluarga prasejahtera yang memiliki keterampilan kerja serta semangat berwirausaha, namun terhambat oleh keterbatasan sarana peralatan produksi.',
        'Melalui pendataan partisipatif dan verifikasi lapangan pada tahun {tahun}, telah terhimpun sebanyak {totalKpm} ({totalKpmTerbilang}) Keluarga Penerima Manfaat (KPM) yang siap mengembangkan usaha produktif secara berkelanjutan apabila didukung fasilitas alat kerja yang layak.',
      ],
      tujuanTitle: 'TUJUAN KEGIATAN',
      tujuanIntro:
        'Pengajuan bantuan peralatan usaha mandiri bagi warga {wilayah} tahun anggaran {tahun} ini diarahkan untuk mencapai sasaran sebagai berikut:',
      tujuanPoints: [
        'Menyediakan sarana kerja produktif yang sesuai dengan bidang keterampilan masing-masing calon penerima manfaat.',
        'Mendorong peningkatan pendapatan harian rumah tangga prasejahtera secara terukur dan berkesinambungan.',
        'Memperluas peluang kerja mandiri pada tingkat lingkungan sekaligus menekan angka kerentanan ekonomi keluarga.',
      ],
      kegiatanTitle: 'BENTUK DAN MEKANISME KEGIATAN',
      kegiatan: [
        'Program dilaksanakan dalam bentuk pengadaan dan penyaluran paket peralatan usaha yang disesuaikan dengan jenis rintisan usaha para penerima manfaat, mulai dari kuliner rumahan, jasa jahit, laundry, pertukangan, hingga jasa perawatan lingkungan.',
        'Seluruh daftar calon KPM telah melalui tahap pendataan administratif, pencocokan identitas kependudukan, serta pengecekan kelayakan di {wilayah} agar penyaluran tepat sasaran dan akuntabel.',
      ],
      anggaranTitle: 'RANCANGAN ANGGARAN BIAYA',
      anggaran: [
        'Kebutuhan anggaran pengadaan peralatan usaha bagi {totalKpm} ({totalKpmTerbilang}) KPM di {wilayah} tahun {tahun} direncanakan sebesar {totalAnggaran} ({totalAnggaranTerbilang}). Rincian satuan paket beserta daftar calon penerima manfaat per kelompok bantuan disajikan secara lengkap pada bagian lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal permohonan bantuan peralatan usaha mandiri ini kami sampaikan kepada {tujuanPenerima}. Besar harapan kami agar usulan ini memperoleh persetujuan dan dukungan realisasi demi terwujudnya kemandirian ekonomi masyarakat di {wilayah}.',
        'Atas perhatian, kerja sama, serta dukungan yang diberikan, kami mengucapkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Upaya mendorong kemandirian ekonomi masyarakat di lingkungan {wilayah} memerlukan sinergi pendataan yang akurat antara aparat kewilayahan dan pelaksana program pemberdayaan sosial. Keterbatasan alat usaha masih menjadi kendala nyata bagi keluarga prasejahtera yang ingin meningkatkan taraf hidupnya.',
        'Sehubungan dengan hal tersebut, kami mengajukan daftar usulan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat (KPM) tahun {tahun} untuk memperoleh rekomendasi dan dukungan administratif dari {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan data calon penerima bantuan peralatan usaha mikro yang terverifikasi di {wilayah} agar terjalin koordinasi dan pengesahan kewilayahan sebelum pengusulan ke instansi terkait.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Memastikan seluruh calon KPM berasal dari keluarga prioritas berdasarkan pemeringkatan DTSEN (Desil) serta hasil verifikasi dan validasi lapangan.',
        'Menghindari tumpang tindih penerima bantuan melalui pencocokan NIK KTP dan domisili RT/RW di {wilayah}.',
        'Mempercepat proses fasilitasi pemberdayaan usaha mikro bagi masyarakat yang membutuhkan sarana kerja.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR CALON KPM',
      lampiranIntro:
        'Terlampir rekapitulasi lengkap {totalKpm} calon penerima bantuan di {wilayah} beserta alamat, RT/RW, NIK KTP, peringkat Desil DTSEN, dan kelurahan domisili.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian permohonan rekomendasi dan pengantar daftar calon KPM ini kami sampaikan. Kami sangat mengharapkan arahan serta dukungan dari {tujuanPenerima} demi kelancaran pelaksanaan program pemberdayaan masyarakat tahun {tahun}.',
      ],
    },
  },
  {
    id: 2,
    code: 'Style 02',
    name: 'Pilar Terakota Klasik',
    tagline: 'Cover pilar vertikal terakota · Bab Angka · Penutup sebelum lampiran',
    coverLayout: 'terracotta-pillars',
    palette: {
      primary: '#9A3412',
      secondary: '#C2410C',
      accent: '#FDBA74',
      tint: '#FFF7ED',
      border: '#FED7AA',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'serif',
    chapterFormat: 'numeric',
    tableTheme: 'soft-tint',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'USULAN PROGRAM PEMBERDAYAAN',
    coverMainTitle: 'BANTUAN PERALATAN KERJA',
    coverSubTitle: 'PENGUATAN USAHA MIKRO RUMAH TANGGA MASYARAKAT',
    opdNarrative: {
      pengantarTitle: 'PENDAHULUAN',
      pengantar: [
        'Kondisi perekonomian keluarga berpenghasilan rendah di {wilayah} menuntut adanya langkah nyata yang tidak sekadar bersifat konsumtif, melainkan mampu menumbuhkan sumber penghasilan mandiri. Bantuan peralatan kerja menjadi instrumen strategis untuk menggerakkan produktivitas warga secara langsung.',
        'Berangkat dari hasil musyawarah serta peninjauan langsung terhadap kondisi sosial ekonomi warga tahun {tahun}, diusulkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon penerima manfaat yang telah memenuhi kriteria penerima program pemberdayaan.',
      ],
      tujuanTitle: 'MAKSUD DAN TUJUAN',
      tujuanIntro:
        'Pelaksanaan usulan bantuan peralatan kerja di {wilayah} ini disusun dengan orientasi tujuan sebagai berikut:',
      tujuanPoints: [
        'Menghadirkan akses alat produksi modern dan layak pakai bagi pelaku usaha skala rumah tangga.',
        'Meningkatkan daya tahan ekonomi keluarga melalui pembukaan maupun pengembangan unit usaha produktif.',
        'Menumbuhkan ekosistem kewirausahaan warga yang berdaya saing dan berkelanjutan di lingkungan setempat.',
      ],
      kegiatanTitle: 'RUANG LINGKUP KEGIATAN',
      kegiatan: [
        'Kegiatan mencakup pemetaan kebutuhan alat usaha per individu, penyusunan rencana anggaran secara transparan, serta pendistribusian paket peralatan kerja kepada seluruh KPM yang terdaftar di {wilayah}.',
        'Setiap paket bantuan dikelompokkan berdasarkan jenis keterampilan penerima agar alat yang disalurkan benar-benar dimanfaatkan untuk kegiatan produktif sehari-hari.',
      ],
      anggaranTitle: 'ESTIMASI KEBUTUHAN DANA',
      anggaran: [
        'Total pembiayaan yang dibutuhkan untuk merealisasikan paket bantuan bagi {totalKpm} ({totalKpmTerbilang}) KPM pada tahun {tahun} berjumlah {totalAnggaran} ({totalAnggaranTerbilang}). Rincian alokasi biaya per jenis paket serta daftar penerima manfaat dimuat pada lampiran proposal ini.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Harapan besar kami sampaikan kepada {tujuanPenerima} kiranya usulan ini dapat ditindaklanjuti dan direalisasikan pada tahun anggaran {tahun}. Semoga bantuan yang disalurkan kelak menjadi pemicu kebangkitan ekonomi warga {wilayah}.',
        'Atas kebijaksanaan dan perhatian Bapak/Ibu, kami haturkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'LATAR BELAKANG',
      pendahuluan: [
        'Dalam rangka memperluas jangkauan program pemberdayaan masyarakat di {wilayah}, diperlukan data calon penerima bantuan usaha yang akurat, tertib administrasi, dan mencerminkan kondisi riil warga di lapangan.',
        'Melalui surat proposal ini, kami menyerahkan daftar {totalKpm} ({totalKpmTerbilang}) warga calon penerima manfaat tahun {tahun} untuk diketahui serta memperoleh pengesahan kewilayahan dari {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Mengajukan verifikasi kewilayahan dan dukungan resmi atas data calon penerima bantuan peralatan usaha mandiri bagi warga {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menetapkan prioritas penerima bantuan secara objektif berdasarkan kategori Desil pada DTSEN serta hasil pengecekan langsung di lapangan.',
        'Menjamin tertib administrasi kependudukan berdasarkan kesesuaian nama, alamat, RT/RW, dan nomor NIK KTP.',
        'Membangun sinergi antara pemerintah kewilayahan dan pengelola program dalam mengawal penyaluran bantuan tepat sasaran.',
      ],
      lampiranTitle: 'DAFTAR CALON PENERIMA MANFAAT',
      lampiranIntro:
        'Berikut disampaikan daftar nominatif {totalKpm} calon KPM wilayah {wilayah} yang telah diverifikasi administrasi dan domisilinya.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan daftar calon KPM ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian, arahan, dan kerja sama yang terjalin baik, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 3,
    code: 'Style 03',
    name: 'Lengkung Navy Modern',
    tagline: 'Cover lengkung kanan navy · BAB Romawi · Penutup di akhir',
    coverLayout: 'navy-right-arc',
    palette: {
      primary: '#0F172A',
      secondary: '#1E40AF',
      accent: '#38BDF8',
      tint: '#F0F9FF',
      border: '#BAE6FD',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'bab-roman',
    tableTheme: 'dark-slate',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'DOKUMEN USULAN BANTUAN SOSIAL',
    coverMainTitle: 'BANTUAN USAHA MANDIRI',
    coverSubTitle: 'PENGEMBANGAN EKONOMI PRODUKTIF KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'GAMBARAN UMUM',
      pengantar: [
        'Dinamika biaya hidup yang terus meningkat menjadikan penguatan sektor usaha mikro sebagai solusi paling realistis untuk melindungi keluarga rentan di {wilayah}. Ketersediaan alat kerja yang memadai terbukti mampu mempercepat perputaran ekonomi skala rumah tangga.',
        'Oleh karena itu, pada tahun anggaran {tahun} diajukan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang telah diseleksi secara cermat berdasarkan kebutuhan jenis usaha dan kelayakan sosial ekonomi.',
      ],
      tujuanTitle: 'SASARAN DAN TUJUAN',
      tujuanIntro:
        'Pelaksanaan bantuan sarana usaha produktif di {wilayah} dirancang guna mewujudkan sasaran strategis berikut:',
      tujuanPoints: [
        'Memfasilitasi warga berpenghasilan rendah agar memiliki perlengkapan kerja yang siap pakai tanpa beban modal awal.',
        'Meningkatkan kualitas layanan maupun hasil produksi pelaku usaha kecil sehingga mampu bersaing di pasar lokal.',
        'Mendorong kemandirian ekonomi keluarga agar secara bertahap keluar dari ketergantungan bantuan konsumtif.',
      ],
      kegiatanTitle: 'RENCANA PELAKSANAAN',
      kegiatan: [
        'Penyaluran bantuan dikelompokkan ke dalam beberapa paket item usaha sesuai hasil pemetaan keterampilan warga {wilayah}. Setiap penerima memperoleh satu paket lengkap berdasarkan kategori usaha yang diajukan.',
        'Pelaksanaan diawali dengan verifikasi data kependudukan, penyusunan kebutuhan anggaran secara rinci, hingga pendampingan serah terima barang kepada penerima manfaat.',
      ],
      anggaranTitle: 'RINCIAN KEBUTUHAN ANGGARAN',
      anggaran: [
        'Keseluruhan pembiayaan pengadaan paket peralatan usaha untuk {totalKpm} ({totalKpmTerbilang}) KPM pada tahun {tahun} tercatat sebesar {totalAnggaran} ({totalAnggaranTerbilang}), sebagaimana terurai secara rinci per kelompok bantuan pada lampiran dokumen ini.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Besar harapan kami agar {tujuanPenerima} berkenan menyetujui dan merealisasikan permohonan bantuan peralatan usaha mandiri bagi masyarakat {wilayah}. Keberhasilan program ini akan memberikan dampak ekonomi nyata bagi keluarga penerima manfaat.',
        'Demikian dokumen proposal ini disusun, atas segala perhatian dan dukungannya kami sampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Pemberdayaan ekonomi warga di wilayah {wilayah} membutuhkan dukungan data sasaran yang valid serta pengawalan berjenjang dari unsur pemerintahan setempat. Ketepatan penetapan calon penerima merupakan kunci keberhasilan bantuan sarana usaha.',
        'Dokumen ini memuat usulan {totalKpm} ({totalKpmTerbilang}) calon KPM tahun {tahun} di {wilayah} sebagai bahan pertimbangan dan persetujuan rekomendasi oleh {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan rekapitulasi calon penerima bantuan usaha mandiri di {wilayah} untuk mendapatkan pengesahan dan rekomendasi resmi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Mengutamakan keluarga kurang mampu berdasarkan data pemeringkatan DTSEN (Desil) serta hasil verifikasi faktual di lapangan.',
        'Menyajikan informasi identitas penerima secara terbuka dan akurat guna mencegah duplikasi data antarwilayah.',
        'Mendukung kelancaran proses administrasi pengajuan bantuan usaha mikro tahun {tahun}.',
      ],
      lampiranTitle: 'LAMPIRAN DATA CALON PENERIMA',
      lampiranIntro:
        'Rincian identitas {totalKpm} calon penerima manfaat wilayah {wilayah} tercantum dalam tabel berikut.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian dokumen usulan kewilayahan ini disampaikan kepada {tujuanPenerima}. Atas dukungan dan kerja sama Bapak/Ibu dalam mendorong kemandirian ekonomi warga, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 4,
    code: 'Style 04',
    name: 'Garis Diagonal Zamrud',
    tagline: 'Cover garis diagonal tegas · Bab Huruf A/B · Penutup sebelum lampiran',
    coverLayout: 'diagonal-ribbons',
    palette: {
      primary: '#0F766E',
      secondary: '#0D9488',
      accent: '#5EEAD4',
      tint: '#F0FDFA',
      border: '#99F6E4',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'alpha',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'PENGAJUAN BANTUAN EKONOMI PRODUKTIF',
    coverMainTitle: 'SARANA USAHA MIKRO',
    coverSubTitle: 'PEMBERDAYAAN KELUARGA PENERIMA MANFAAT BERBASIS KETERAMPILAN',
    opdNarrative: {
      pengantarTitle: 'DASAR PEMIKIRAN',
      pengantar: [
        'Kemandirian finansial keluarga merupakan pilar penting dalam membangun ketahanan sosial masyarakat di {wilayah}. Banyak pelaku usaha rintisan skala rumah tangga memiliki potensi berkembang pesat apabila diberikan dukungan peralatan kerja yang tepat guna.',
        'Melalui proses penjaringan dan validasi berkas tahun {tahun}, telah ditetapkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap menerima serta mengoperasikan paket peralatan usaha sesuai keahlian masing-masing.',
      ],
      tujuanTitle: 'TUJUAN PENGUSULAN',
      tujuanIntro:
        'Penyampaian proposal bantuan peralatan usaha mikro di {wilayah} ini memiliki tujuan utama sebagai berikut:',
      tujuanPoints: [
        'Membantu pemenuhan kebutuhan alat produksi bagi keluarga prasejahtera yang telah merintis maupun berencana membuka usaha.',
        'Meningkatkan efisiensi kerja dan kapasitas produksi usaha mikro agar pendapatan rumah tangga bertumbuh secara stabil.',
        'Menciptakan iklim ekonomi kerakyatan yang produktif, mandiri, dan saling menguatkan di {wilayah}.',
      ],
      kegiatanTitle: 'PROGRAM DAN SASARAN',
      kegiatan: [
        'Sasaran program meliputi {totalKpm} warga {wilayah} yang terbagi ke dalam beberapa kelompok jenis bantuan peralatan usaha sesuai minat dan keterampilan kerjanya.',
        'Mekanisme pengadaan dilakukan secara terstruktur mengacu pada rencana anggaran per paket sehingga kualitas serta kelengkapan sub-item bantuan terjamin merata.',
      ],
      anggaranTitle: 'REKAPITULASI ANGGARAN',
      anggaran: [
        'Total dana yang diusulkan untuk merealisasikan keseluruhan paket bantuan tahun {tahun} mencapai {totalAnggaran} ({totalAnggaranTerbilang}). Detail anggaran per jenis bantuan dan identitas lengkap penerima manfaat tercantum dalam lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Kami berharap proposal ini dapat menjadi pertimbangan utama bagi {tujuanPenerima} untuk menyalurkan dukungan peralatan usaha bagi warga {wilayah}. Seluruh proses pemanfaatan bantuan akan kami kawal bersama agar memberi hasil optimal.',
        'Atas perhatian dan dukungan yang diberikan, kami menyampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Program fasilitasi sarana usaha mikro bagi warga {wilayah} dirancang untuk memperluas kesempatan berusaha bagi keluarga prasejahtera. Agar pelaksanaan berjalan tertib dan terukur, diperlukan rekomendasi resmi dari unsur pemerintahan setempat.',
        'Pada kesempatan ini, kami mengajukan daftar nominatif {totalKpm} ({totalKpmTerbilang}) calon penerima bantuan tahun {tahun} kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Memohon verifikasi kewilayahan dan rekomendasi atas pengusulan calon penerima manfaat program peralatan usaha di {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Memastikan seleksi penerima berpedoman pada prioritas DTSEN (Desil) serta hasil verifikasi dan peninjauan lapangan.',
        'Menjamin keabsahan data domisili RT/RW serta nomor kependudukan calon penerima di lingkungan {wilayah}.',
        'Memperlancar koordinasi antarlembaga dalam pelaksanaan program pemberdayaan ekonomi masyarakat.',
      ],
      lampiranTitle: 'LAMPIRAN NOMINATIF CALON KPM',
      lampiranIntro:
        'Berikut disajikan daftar {totalKpm} calon penerima manfaat di {wilayah} yang diusulkan pada tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan daftar calon penerima manfaat ini kami sampaikan. Besar harapan kami agar {tujuanPenerima} berkenan memberikan rekomendasi demi suksesnya pemberdayaan warga {wilayah}.',
      ],
    },
  },
  {
    id: 5,
    code: 'Style 05',
    name: 'Mozaik Emas Nusantara',
    tagline: 'Cover mozaik emas geometris · Bab Romawi · Penutup di akhir',
    coverLayout: 'gold-mosaic',
    palette: {
      primary: '#78350F',
      secondary: '#B45309',
      accent: '#FCD34D',
      tint: '#FFFBEB',
      border: '#FDE68A',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'classic',
    chapterFormat: 'roman',
    tableTheme: 'classic-bordered',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL PENGADAAN BANTUAN USAHA',
    coverMainTitle: 'PEMBERDAYAAN EKONOMI MASYARAKAT',
    coverSubTitle: 'USULAN SARANA KERJA KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Peningkatan kesejahteraan masyarakat di {wilayah} akan tercapai lebih cepat apabila keluarga berpenghasilan rendah memperoleh kesempatan nyata untuk mengembangkan usaha produktif. Keterbatasan permodalan dalam pengadaan alat kerja selama ini menjadi kendala utama bagi para perintis usaha kecil.',
        'Menjawab kebutuhan tersebut, pada tahun {tahun} kami menghimpun usulan {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang telah diverifikasi identitas, domisili, serta kesiapan usahanya.',
      ],
      tujuanTitle: 'TUJUAN PROGRAM',
      tujuanIntro:
        'Pengajuan bantuan peralatan usaha produktif bagi masyarakat {wilayah} bertujuan untuk:',
      tujuanPoints: [
        'Memberikan dukungan alat usaha tepat guna yang langsung menunjang aktivitas produksi maupun jasa warga.',
        'Mendorong peningkatan taraf hidup dan kemandirian ekonomi keluarga penerima manfaat secara berkelanjutan.',
        'Menggerakkan kegiatan ekonomi mikro lokal agar tercipta perputaran pendapatan di lingkungan masyarakat.',
      ],
      kegiatanTitle: 'JENIS KEGIATAN',
      kegiatan: [
        'Program berfokus pada pengadaan paket peralatan kerja yang disesuaikan dengan kebutuhan tiap kelompok usaha di {wilayah}. Setiap penerima manfaat tercatat pada kelompok item tertentu sesuai asesmen lapangan.',
        'Penyaluran bantuan dilaksanakan secara transparan dengan bukti berita acara serah terima kepada masing-masing penerima.',
      ],
      anggaranTitle: 'RENCANA ANGGARAN BIAYA',
      anggaran: [
        'Anggaran yang diajukan untuk mendukung {totalKpm} ({totalKpmTerbilang}) KPM pada tahun anggaran {tahun} sebesar {totalAnggaran} ({totalAnggaranTerbilang}). Rincian biaya satuan per jenis bantuan dan daftar lengkap calon penerima terlampir pada bagian berikutnya.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal pengadaan bantuan usaha ini kami ajukan kepada {tujuanPenerima}. Semoga usulan ini mendapat perhatian dan persetujuan sehingga mampu memberi manfaat besar bagi masyarakat {wilayah}.',
        'Atas segala bantuan dan perhatiannya, kami ucapkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Penguatan ekonomi berbasis keluarga di {wilayah} perlu didukung dengan pendataan calon penerima bantuan yang akuntabel serta melibatkan koordinasi aktif pemerintah setempat.',
        'Sebagai bentuk tertib administrasi pengusulan tahun {tahun}, kami sampaikan daftar {totalKpm} ({totalKpmTerbilang}) calon penerima bantuan peralatan usaha kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan usulan calon penerima bantuan peralatan usaha masyarakat {wilayah} guna memperoleh rekomendasi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menyeleksi calon penerima manfaat secara adil dengan mengacu pada prioritas DTSEN (Desil) dan hasil verifikasi lapangan.',
        'Memastikan kelengkapan serta ketepatan data alamat, RT/RW, dan NIK KTP setiap calon penerima.',
        'Memperkuat kolaborasi pengawasan agar bantuan yang direalisasikan benar-benar diterima warga yang berhak.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR KPM',
      lampiranIntro:
        'Terlampir data lengkap {totalKpm} calon KPM di {wilayah} tahun {tahun} untuk diperiksa dan disahkan.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Atas perhatian, dukungan, dan rekomendasi yang diberikan oleh {tujuanPenerima}, kami menyampaikan penghargaan dan terima kasih.',
      ],
    },
  },
  {
    id: 6,
    code: 'Style 06',
    name: 'Blok Oranye Tegas',
    tagline: 'Cover blok sudut oranye · Bab Angka · Penutup di akhir',
    coverLayout: 'orange-top-block',
    palette: {
      primary: '#EA580C',
      secondary: '#9A3412',
      accent: '#FDBA74',
      tint: '#FFF7ED',
      border: '#FED7AA',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'numeric',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL PENGAJUAN BANTUAN',
    coverMainTitle: 'PERALATAN USAHA MANDIRI',
    coverSubTitle: 'PROGRAM PEMBERDAYAAN KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'PENDAHULUAN',
      pengantar: [
        'Pemberdayaan ekonomi warga melalui penyediaan peralatan usaha merupakan pendekatan strategis yang mampu memberikan dampak jangka panjang bagi keluarga kurang mampu di {wilayah}. Dengan dukungan alat kerja yang layak, masyarakat dapat segera mengoptimalkan keterampilan yang dimilikinya.',
        'Berdasarkan hasil pendataan dan verifikasi berkas tahun {tahun}, telah terhimpun {totalKpm} ({totalKpmTerbilang}) calon KPM di {wilayah} yang memenuhi persyaratan untuk menerima dukungan sarana usaha mandiri.',
      ],
      tujuanTitle: 'MAKSUD DAN TUJUAN',
      tujuanIntro:
        'Adapun maksud dan tujuan dari pengajuan proposal bantuan usaha mandiri di {wilayah} adalah sebagai berikut:',
      tujuanPoints: [
        'Menyediakan paket peralatan kerja siap pakai bagi keluarga prasejahtera agar mampu memulai atau mengembangkan usahanya.',
        'Meningkatkan produktivitas serta pendapatan keluarga penerima manfaat secara nyata dan berkesinambungan.',
        'Mendukung program pemerintah dalam menurunkan angka kemiskinan melalui penguatan usaha mikro masyarakat.',
      ],
      kegiatanTitle: 'PELAKSANAAN KEGIATAN',
      kegiatan: [
        'Bantuan disalurkan dalam wujud paket peralatan kerja yang dikelompokkan menurut jenis usaha calon penerima di {wilayah}. Setiap paket disusun berdasarkan rincian sub-item yang saling melengkapi kebutuhan operasional usaha.',
        'Seluruh penerima telah diverifikasi data kependudukan dan kelayakan usahanya untuk memastikan program berjalan efektif dan tepat sasaran.',
      ],
      anggaranTitle: 'RANCANGAN ANGGARAN BIAYA',
      anggaran: [
        'Estimasi kebutuhan pembiayaan pengadaan paket peralatan bagi {totalKpm} ({totalKpmTerbilang}) KPM tahun {tahun} ditetapkan sebesar {totalAnggaran} ({totalAnggaranTerbilang}). Rincian anggaran per kelompok paket beserta daftar nama KPM tersaji pada bagian lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal permohonan bantuan peralatan usaha mandiri ini kami susun dan sampaikan kepada {tujuanPenerima}. Besar harapan kami agar permohonan ini dapat dikabulkan demi mendorong kesejahteraan masyarakat di {wilayah}.',
        'Atas perhatian dan dukungan Bapak/Ibu, kami ucapkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Dalam rangka mempercepat penguatan ekonomi keluarga kurang mampu di {wilayah}, diperlukan data usulan calon penerima bantuan peralatan usaha yang valid, transparan, dan terkoordinasi dengan pemerintah wilayah setempat.',
        'Oleh sebab itu, pada tahun {tahun} ini kami mengajukan sebanyak {totalKpm} ({totalKpmTerbilang}) calon KPM untuk memperoleh dukungan dan pengesahan dari {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Mengajukan daftar nominatif calon penerima bantuan peralatan usaha mandiri di {wilayah} agar memperoleh rekomendasi resmi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menjamin penyaluran bantuan diprioritaskan bagi warga prasejahtera berdasarkan pemeringkatan DTSEN (Desil) serta hasil verifikasi lapangan.',
        'Menertibkan pencatatan administratif calon penerima berdasarkan NIK KTP, alamat, dan domisili RT/RW.',
        'Memperkuat koordinasi pelaksanaan pemberdayaan ekonomi masyarakat pada tingkat kewilayahan.',
      ],
      lampiranTitle: 'LAMPIRAN',
      lampiranIntro:
        'Sebagai bagian tidak terpisahkan dari proposal ini, terlampir daftar {totalKpm} calon KPM wilayah {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian, arahan, serta persetujuan yang diberikan demi kelancaran program ini, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 7,
    code: 'Style 07',
    name: 'Pita Kiri Zamrud',
    tagline: 'Cover pita kiri emerald · BAB Romawi · Penutup sebelum lampiran',
    coverLayout: 'emerald-left-bar',
    palette: {
      primary: '#065F46',
      secondary: '#059669',
      accent: '#6EE7B7',
      tint: '#ECFDF5',
      border: '#A7F3D0',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'bab-roman',
    tableTheme: 'soft-tint',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'USULAN PEMBERDAYAAN EKONOMI',
    coverMainTitle: 'BANTUAN SARANA USAHA WARGA',
    coverSubTitle: 'PENINGKATAN KEMANDIRIAN KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Pengembangan usaha skala mikro terbukti menjadi penopang utama ketahanan ekonomi rumah tangga di {wilayah}. Namun demikian, keterbatasan modal untuk membeli perlengkapan kerja kerap membuat warga berkeahlian tidak dapat menjalankan usaha secara optimal.',
        'Melalui penjaringan aspirasi dan verifikasi lapangan tahun {tahun}, telah disusun daftar {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap menerima bantuan peralatan kerja produktif.',
      ],
      tujuanTitle: 'TUJUAN PENGAJUAN',
      tujuanIntro:
        'Adapun tujuan yang hendak diwujudkan melalui program bantuan peralatan usaha di {wilayah} meliputi:',
      tujuanPoints: [
        'Menghilangkan hambatan akses peralatan kerja bagi keluarga prasejahtera yang memiliki keterampilan usaha.',
        'Mendorong tumbuhnya sumber pendapatan baru bagi rumah tangga sasaran secara mandiri dan bermartabat.',
        'Memperkuat struktur ekonomi kerakyatan pada skala lingkungan di {wilayah}.',
      ],
      kegiatanTitle: 'BENTUK PROGRAM',
      kegiatan: [
        'Program diwujudkan melalui penyaluran paket barang usaha sesuai spesifikasi kebutuhan tiap jenis pekerjaan yang diajukan oleh {totalKpm} calon penerima manfaat di {wilayah}.',
        'Pendataan dan pengelompokan bantuan disusun secara sistematis guna mempermudah proses pengadaan, distribusi, serta pemantauan pemanfaatan alat.',
      ],
      anggaranTitle: 'KEBUTUHAN PEMBIAYAAN',
      anggaran: [
        'Total rencana anggaran yang diperlukan bagi {totalKpm} ({totalKpmTerbilang}) KPM pada tahun {tahun} sebesar {totalAnggaran} ({totalAnggaranTerbilang}), dengan uraian lengkap per jenis paket dan daftar penerima sebagaimana terlampir.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan proposal ini kami sampaikan kepada {tujuanPenerima}. Besar harapan kami agar dukungan peralatan usaha ini dapat segera terwujud demi kemajuan ekonomi warga {wilayah}.',
        'Atas perhatian dan perkenannya, kami ucapkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Kemandirian masyarakat di {wilayah} perlu terus didorong melalui sinergi program bantuan produktif yang tepat sasaran. Validitas data calon penerima di tingkat kewilayahan menjadi landasan penting sebelum tahap pengusulan lebih lanjut.',
        'Bersama dokumen ini kami ajukan daftar {totalKpm} ({totalKpmTerbilang}) warga calon penerima manfaat tahun {tahun} kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Memohon persetujuan dan rekomendasi kewilayahan atas data calon KPM bantuan sarana usaha mandiri di {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Memprioritaskan warga yang benar-benar membutuhkan berdasarkan pemeringkatan Desil DTSEN serta hasil verifikasi lapangan.',
        'Menjaga keakuratan identitas penerima melalui verifikasi alamat, RT/RW, dan NIK KTP.',
        'Mewujudkan pelaksanaan program pemberdayaan masyarakat yang tertib, terbuka, dan dapat dipertanggungjawabkan.',
      ],
      lampiranTitle: 'DAFTAR CALON KPM',
      lampiranIntro:
        'Rincian {totalKpm} calon penerima bantuan di {wilayah} tahun {tahun} disajikan dalam tabel lampiran berikut.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Atas dukungan administratif, arahan, serta rekomendasi dari {tujuanPenerima}, kami haturkan terima kasih.',
      ],
    },
  },
  {
    id: 8,
    code: 'Style 08',
    name: 'Bingkai Ganda Indigo',
    tagline: 'Cover bingkai split indigo · Bab Huruf A/B · Penutup di akhir',
    coverLayout: 'indigo-split-frame',
    palette: {
      primary: '#312E81',
      secondary: '#4F46E5',
      accent: '#A5B4FC',
      tint: '#EEF2FF',
      border: '#C7D2FE',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'serif',
    chapterFormat: 'alpha',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'DOKUMEN PERMOHONAN BANTUAN',
    coverMainTitle: 'PROGRAM PERALATAN USAHA MIKRO',
    coverSubTitle: 'DUKUNGAN SARANA PRODUKTIF KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'URGENSI PROGRAM',
      pengantar: [
        'Tantangan pemenuhan kebutuhan ekonomi rumah tangga di {wilayah} menuntut hadirnya program pemberdayaan yang menyentuh langsung akar permasalahan, yakni keterbatasan alat kerja produktif bagi keluarga prasejahtera.',
        'Pada tahun anggaran {tahun}, telah teridentifikasi sebanyak {totalKpm} ({totalKpmTerbilang}) calon penerima manfaat yang telah lolos pemeriksaan administrasi dan siap menggerakkan usaha kecil di lingkungan tempat tinggalnya.',
      ],
      tujuanTitle: 'ARAH DAN TUJUAN',
      tujuanIntro:
        'Pengajuan program bantuan sarana usaha di {wilayah} ini diarahkan pada pencapaian tujuan sebagai berikut:',
      tujuanPoints: [
        'Mempercepat kemandirian usaha keluarga melalui pemenuhan peralatan kerja sesuai bidang keterampilan masing-masing.',
        'Meningkatkan stabilitas penghasilan harian keluarga penerima manfaat secara terukur.',
        'Mendorong pemerataan kesempatan berusaha dan mengurangi kerentanan sosial ekonomi masyarakat.',
      ],
      kegiatanTitle: 'POLA PELAKSANAAN',
      kegiatan: [
        'Bantuan dilaksanakan dalam format pengadaan paket sarana usaha terstandar yang disesuaikan dengan kategori usaha setiap calon KPM di {wilayah}.',
        'Pengelompokan jenis paket dirancang agar distribusi barang mudah diverifikasi sekaligus memastikan kesesuaian nilai manfaat bagi seluruh penerima.',
      ],
      anggaranTitle: 'RANCANGAN PEMBIAYAAN',
      anggaran: [
        'Besarnya kebutuhan anggaran untuk memfasilitasi {totalKpm} ({totalKpmTerbilang}) KPM pada tahun {tahun} direncanakan senilai {totalAnggaran} ({totalAnggaranTerbilang}). Uraian rincian biaya serta daftar penerima manfaat dimuat pada lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Besar harapan kami agar {tujuanPenerima} dapat mempertimbangkan dan menyetujui proposal bantuan peralatan usaha bagi warga {wilayah}. Kami siap mendukung seluruh tahapan verifikasi hingga penyaluran di lapangan.',
        'Atas perhatian dan kerjasamanya, kami menyampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Keberhasilan program bantuan sarana usaha di {wilayah} sangat ditentukan oleh ketepatan penentuan calon penerima sejak tahap awal pendataan kewilayahan.',
        'Sehubungan dengan hal tersebut, kami mengajukan daftar {totalKpm} ({totalKpmTerbilang}) calon KPM tahun {tahun} untuk memperoleh dukungan dan pengesahan dari {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Mengkoordinasikan data calon penerima bantuan peralatan usaha warga {wilayah} guna memperoleh rekomendasi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menetapkan sasaran penerima berdasarkan prioritas pemeringkatan DTSEN (Desil) dan hasil validasi lapangan.',
        'Menghadirkan data kependudukan yang rapi, valid, dan bebas duplikasi sesuai domisili RT/RW.',
        'Memperkuat dukungan lintas pihak dalam mempercepat pemberdayaan usaha mikro masyarakat.',
      ],
      lampiranTitle: 'LAMPIRAN DATA CALON KPM',
      lampiranIntro:
        'Daftar lengkap {totalKpm} calon penerima bantuan di {wilayah} tahun {tahun} tercantum dalam tabel berikut.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan ini kami sampaikan kepada {tujuanPenerima}. Atas bantuan rekomendasi dan perhatian Bapak/Ibu, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 9,
    code: 'Style 09',
    name: 'Marun Klasik Protokol',
    tagline: 'Cover bingkai resmi marun · Bab Romawi · Penutup sebelum lampiran',
    coverLayout: 'burgundy-classic',
    palette: {
      primary: '#881337',
      secondary: '#BE123C',
      accent: '#FDA4AF',
      tint: '#FFF1F2',
      border: '#FECDD3',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'classic',
    chapterFormat: 'roman',
    tableTheme: 'classic-bordered',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'PROPOSAL RESMI BANTUAN SOSIAL',
    coverMainTitle: 'SARANA USAHA EKONOMI PRODUKTIF',
    coverSubTitle: 'PENGUATAN KEMANDIRIAN KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'PENDAHULUAN',
      pengantar: [
        'Peningkatan kesejahteraan keluarga kurang mampu di {wilayah} memerlukan dukungan intervensi ekonomi produktif yang tepat sasaran. Ketersediaan peralatan kerja yang memadai menjadi faktor penentu agar warga dapat memaksimalkan potensi usahanya.',
        'Berdasarkan hasil identifikasi kebutuhan di lapangan pada tahun {tahun}, diusulkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang telah melengkapi persyaratan administrasi kependudukan.',
      ],
      tujuanTitle: 'TUJUAN KEGIATAN',
      tujuanIntro:
        'Tujuan penyelenggaraan bantuan peralatan usaha ekonomi produktif di {wilayah} adalah:',
      tujuanPoints: [
        'Mewujudkan ketersediaan alat usaha yang memadai bagi pelaku usaha mikro dari keluarga prasejahtera.',
        'Meningkatkan kemampuan keluarga dalam memperoleh penghasilan mandiri secara berkesinambungan.',
        'Mengurangi angka kemiskinan dan mendorong pertumbuhan ekonomi lokal berbasis rumah tangga.',
      ],
      kegiatanTitle: 'URAIAN KEGIATAN',
      kegiatan: [
        'Kegiatan dilaksanakan melalui pengadaan beberapa jenis paket peralatan usaha yang disesuaikan dengan bidang pekerjaan atau rintisan usaha para calon KPM di {wilayah}.',
        'Setiap tahapan mulai dari pendataan, verifikasi, hingga serah terima barang dilaksanakan secara tertib dan terdokumentasi.',
      ],
      anggaranTitle: 'ESTIMASI ANGGARAN BIAYA',
      anggaran: [
        'Kebutuhan pembiayaan pengadaan seluruh paket peralatan bagi {totalKpm} ({totalKpmTerbilang}) KPM tahun {tahun} tercatat sejumlah {totalAnggaran} ({totalAnggaranTerbilang}), dengan rincian lengkap tersaji pada bagian lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal permohonan ini kami ajukan kepada {tujuanPenerima}. Besar harapan kami kiranya usulan warga {wilayah} ini dapat disetujui dan direalisasikan pada tahun anggaran {tahun}.',
        'Atas perhatian serta kebijaksanaan Bapak/Ibu, kami sampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'LATAR BELAKANG',
      pendahuluan: [
        'Tertib pendataan calon penerima bantuan di lingkungan {wilayah} merupakan langkah awal yang sangat penting untuk menjamin keadilan dan ketepatan sasaran program pemberdayaan sosial.',
        'Sehubungan dengan itu, kami sampaikan daftar usulan {totalKpm} ({totalKpmTerbilang}) calon KPM tahun {tahun} kepada {tujuanPenerima} untuk mendapatkan rekomendasi resmi.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan rekapitulasi nominatif calon KPM wilayah {wilayah} sebagai syarat kelengkapan administrasi pengusulan bantuan peralatan usaha.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Mengacu secara konsisten pada pemeringkatan DTSEN (Desil) dan hasil verifikasi lapangan dalam penetapan prioritas penerima.',
        'Memastikan akurasi domisili RT/RW serta nomor NIK KTP seluruh warga yang diusulkan.',
        'Membangun koordinasi pengawasan yang baik antara pemerintah setempat dan pelaksana kegiatan.',
      ],
      lampiranTitle: 'LAMPIRAN NOMINATIF KPM',
      lampiranIntro:
        'Berikut daftar {totalKpm} calon penerima bantuan di {wilayah} yang telah diverifikasi pada tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan rekomendasi ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian dan kerja sama yang diberikan, kami mengucapkan terima kasih.',
      ],
    },
  },
  {
    id: 10,
    code: 'Style 10',
    name: 'Geometri Sudut Toska',
    tagline: 'Cover sudut geometris toska · Bab Angka · Penutup di akhir',
    coverLayout: 'teal-corner-geo',
    palette: {
      primary: '#115E59',
      secondary: '#14B8A6',
      accent: '#99F6E4',
      tint: '#F0FDFA',
      border: '#5EEAD4',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'numeric',
    tableTheme: 'soft-tint',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'USULAN BANTUAN PERALATAN KERJA',
    coverMainTitle: 'USAHA MANDIRI',
    coverSubTitle: 'FASILITASI SARANA PRODUKSI KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Pengembangan usaha mikro di tingkat rumah tangga merupakan langkah konkret untuk memperkuat daya beli sekaligus menciptakan lapangan kerja mandiri di {wilayah}. Dukungan fasilitas peralatan kerja menjadi kebutuhan mendesak bagi warga yang telah memiliki keterampilan namun terkendala permodalan.',
        'Berdasarkan hasil pendataan terpadu tahun {tahun}, diusulkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap memanfaatkan bantuan peralatan usaha secara produktif.',
      ],
      tujuanTitle: 'TUJUAN KEGIATAN',
      tujuanIntro:
        'Pelaksanaan bantuan sarana usaha mandiri di {wilayah} ini memiliki sasaran utama sebagai berikut:',
      tujuanPoints: [
        'Membekali pelaku usaha mikro dari keluarga prasejahtera dengan peralatan kerja yang handal dan sesuai kebutuhan.',
        'Mempercepat peningkatan omzet serta pendapatan bersih keluarga penerima manfaat.',
        'Menumbuhkan kemandirian sosial ekonomi warga di lingkungan {wilayah} secara berkelanjutan.',
      ],
      kegiatanTitle: 'DESKRIPSI KEGIATAN',
      kegiatan: [
        'Bantuan yang diusulkan berbentuk paket peralatan usaha yang dibagi menurut kategori jenis keterampilan penerima manfaat di {wilayah}. Setiap paket dirinci hingga komponen sub-item agar transparan dan sesuai kebutuhan lapangan.',
        'Proses verifikasi identitas dan domisili telah dilakukan guna memastikan tidak terdapat data ganda.',
      ],
      anggaranTitle: 'RENCANA ANGGARAN BIAYA',
      anggaran: [
        'Kebutuhan dana untuk merealisasikan paket bantuan bagi {totalKpm} ({totalKpmTerbilang}) KPM pada tahun anggaran {tahun} berjumlah {totalAnggaran} ({totalAnggaranTerbilang}). Rincian alokasi per kelompok bantuan dan daftar calon penerima disajikan pada lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal ini disusun dan diajukan kepada {tujuanPenerima}. Kami sangat berharap usulan bantuan peralatan usaha bagi warga {wilayah} dapat direalisasikan demi meningkatkan kesejahteraan masyarakat.',
        'Atas perhatian dan dukungan Bapak/Ibu, kami sampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Untuk mendukung kelancaran pengusulan program pemberdayaan ekonomi warga di {wilayah}, diperlukan verifikasi serta rekomendasi kewilayahan atas data calon penerima manfaat yang telah dihimpun.',
        'Pada tahun {tahun} ini, kami menyampaikan daftar {totalKpm} ({totalKpmTerbilang}) calon KPM untuk memperoleh dukungan resmi dari {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan data terverifikasi calon penerima bantuan sarana usaha di {wilayah} guna mendapatkan rekomendasi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menjamin ketepatan sasaran penerima berdasarkan pemeringkatan DTSEN (Desil) serta hasil verifikasi faktual di lapangan.',
        'Menyajikan data kependudukan yang lengkap mencakup alamat, RT/RW, dan NIK KTP.',
        'Meningkatkan sinergi antara aparat kewilayahan dan pelaksana program pemberdayaan masyarakat.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR CALON KPM',
      lampiranIntro:
        'Tabel berikut memuat identitas lengkap {totalKpm} calon penerima manfaat di {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan daftar calon KPM ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian dan rekomendasi yang diberikan, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 11,
    code: 'Style 11',
    name: 'Cakrawala Amber',
    tagline: 'Cover pita horizon amber · BAB Romawi · Penutup di akhir',
    coverLayout: 'amber-horizon',
    palette: {
      primary: '#92400E',
      secondary: '#D97706',
      accent: '#FDE68A',
      tint: '#FFFBEB',
      border: '#FCD34D',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'bab-roman',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL KEGIATAN PEMBERDAYAAN',
    coverMainTitle: 'BANTUAN ALAT USAHA PRODUKTIF',
    coverSubTitle: 'PENGEMBANGAN EKONOMI RUMAH TANGGA MASYARAKAT',
    opdNarrative: {
      pengantarTitle: 'PENDAHULUAN',
      pengantar: [
        'Keberhasilan pembangunan sosial di {wilayah} tidak lepas dari peran aktif masyarakat dalam membangun usaha produktif secara mandiri. Agar potensi keterampilan warga dapat menghasilkan nilai ekonomi yang optimal, dukungan peralatan usaha menjadi kebutuhan pokok yang mendesak.',
        'Melalui pendataan dan penyeleksian pada tahun {tahun}, telah ditetapkan {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang layak menerima fasilitasi paket peralatan kerja.',
      ],
      tujuanTitle: 'MAKSUD DAN TUJUAN',
      tujuanIntro:
        'Pengusulan bantuan alat usaha produktif bagi warga {wilayah} ini diarahkan untuk:',
      tujuanPoints: [
        'Membantu warga kurang mampu mendapatkan sarana produksi yang layak untuk membuka maupun memperluas usaha.',
        'Meningkatkan kesejahteraan rumah tangga melalui pertambahan penghasilan rutin dari aktivitas usaha mandiri.',
        'Mendorong kemandirian ekonomi lokal agar tercipta masyarakat yang produktif dan berdaya tahan.',
      ],
      kegiatanTitle: 'RUANG LINGKUP BANTUAN',
      kegiatan: [
        'Bantuan diberikan dalam wujud paket barang produktif yang disesuaikan dengan pilihan jenis usaha masing-masing calon penerima manfaat di {wilayah}.',
        'Setiap kelompok jenis bantuan telah diperhitungkan kelengkapan sub-item dan kewajaran biayanya sehingga siap disalurkan secara transparan.',
      ],
      anggaranTitle: 'RINCIAN ANGGARAN',
      anggaran: [
        'Total rencana anggaran pengadaan paket alat usaha bagi {totalKpm} ({totalKpmTerbilang}) KPM tahun {tahun} adalah sebesar {totalAnggaran} ({totalAnggaranTerbilang}). Rincian tabel biaya serta daftar calon KPM terlampir pada bagian berikutnya.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Besar harapan kami agar {tujuanPenerima} berkenan menyetujui permohonan ini dan merealisasikan bantuan alat usaha bagi masyarakat {wilayah}.',
        'Demikian proposal ini kami sampaikan, atas segala dukungan dan perhatian Bapak/Ibu kami ucapkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Dalam rangka menyukseskan program pemberdayaan ekonomi masyarakat di {wilayah}, diperlukan kesesuaian data calon penerima manfaat yang telah diverifikasi pada tingkat lingkungan.',
        'Melalui proposal ini, kami menyampaikan data {totalKpm} ({totalKpmTerbilang}) calon KPM tahun {tahun} kepada {tujuanPenerima} untuk mendapatkan rekomendasi.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Mengajukan daftar calon penerima bantuan alat usaha produktif di {wilayah} guna memperoleh pengesahan kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Mengutamakan calon penerima manfaat sesuai peringkat DTSEN (Desil) dan hasil verifikasi faktual lapangan.',
        'Menjamin ketertiban administrasi data penerima mencakup NIK KTP, alamat, dan wilayah RT/RW.',
        'Mendukung kelancaran proses pengusulan bantuan pemberdayaan masyarakat tahun {tahun}.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR KPM',
      lampiranIntro:
        'Berikut kami lampirkan daftar nominatif {totalKpm} calon KPM di {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan rekomendasi ini disampaikan kepada {tujuanPenerima}. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 12,
    code: 'Style 12',
    name: 'Garis Eksekutif Arang',
    tagline: 'Cover garis eksekutif slate · Bab Huruf A/B · Penutup sebelum lampiran',
    coverLayout: 'slate-executive',
    palette: {
      primary: '#1E293B',
      secondary: '#475569',
      accent: '#0EA5E9',
      tint: '#F8FAFC',
      border: '#CBD5E1',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'alpha',
    tableTheme: 'dark-slate',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'DOKUMEN USULAN PROGRAM',
    coverMainTitle: 'BANTUAN PERALATAN USAHA',
    coverSubTitle: 'SKEMA PEMBERDAYAAN EKONOMI KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Stabilitas ekonomi keluarga merupakan kunci dalam meningkatkan kualitas hidup masyarakat di {wilayah}. Penyediaan sarana kerja bagi pelaku usaha mikro dari keluarga prasejahtera merupakan investasi sosial yang berdampak langsung pada penurunan kerentanan ekonomi.',
        'Berdasarkan hasil pendataan dan verifikasi kelayakan tahun {tahun}, telah terhimpun sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap mengembangkan usaha produktif.',
      ],
      tujuanTitle: 'TUJUAN PENGUSULAN',
      tujuanIntro:
        'Pengusulan dukungan sarana kerja bagi masyarakat {wilayah} dirancang untuk mencapai hasil nyata sebagai berikut:',
      tujuanPoints: [
        'Memenuhi kebutuhan peralatan produksi dasar bagi pelaku usaha kecil skala rumah tangga.',
        'Meningkatkan kapasitas usaha dan pendapatan rutin keluarga penerima manfaat.',
        'Memperkuat ekosistem ekonomi mandiri serta memperluas peluang kerja di {wilayah}.',
      ],
      kegiatanTitle: 'SKEMA PELAKSANAAN',
      kegiatan: [
        'Bantuan diwujudkan dalam bentuk paket peralatan kerja per kategori usaha yang telah disesuaikan dengan hasil asesmen kebutuhan masing-masing KPM di {wilayah}.',
        'Seluruh daftar calon penerima telah melalui pencocokan data kependudukan dan pengelompokan jenis item guna memastikan kelancaran distribusi.',
      ],
      anggaranTitle: 'ALOKASI ANGGARAN',
      anggaran: [
        'Kebutuhan anggaran pengadaan sarana usaha untuk {totalKpm} ({totalKpmTerbilang}) KPM pada tahun {tahun} ditetapkan sebesar {totalAnggaran} ({totalAnggaranTerbilang}), sebagaimana dirinci pada tabel anggaran dan daftar penerima di bagian lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Kami berharap {tujuanPenerima} dapat memberikan persetujuan atas dokumen usulan ini sehingga program bantuan peralatan usaha di {wilayah} dapat terlaksana dengan baik.',
        'Atas perhatian dan dukungan yang diberikan, kami menyampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Sebagai bagian dari tata kelola pengusulan bantuan yang tertib dan terukur di {wilayah}, data calon penerima manfaat perlu memperoleh verifikasi serta pengesahan dari pemerintah wilayah.',
        'Dokumen ini memuat daftar {totalKpm} ({totalKpmTerbilang}) calon penerima bantuan peralatan usaha tahun {tahun} untuk diajukan kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Memohon persetujuan dan rekomendasi kewilayahan terhadap daftar calon KPM program bantuan peralatan usaha di {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menentukan prioritas penerima bantuan secara objektif berdasarkan pemeringkatan DTSEN (Desil) dan hasil verifikasi lapangan.',
        'Memastikan kelengkapan identitas kependudukan calon penerima secara akurat dan akuntabel.',
        'Mendorong kolaborasi pengawasan demi keberhasilan pemberdayaan warga di {wilayah}.',
      ],
      lampiranTitle: 'LAMPIRAN DATA CALON KPM',
      lampiranIntro:
        'Berikut disajikan daftar {totalKpm} calon penerima bantuan di {wilayah} pada tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan daftar calon penerima ini kami sampaikan kepada {tujuanPenerima}. Atas dukungan dan rekomendasi Bapak/Ibu, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 13,
    code: 'Style 13',
    name: 'Kurva Rimba Hijau',
    tagline: 'Cover kurva hijau hutan · Bab Romawi · Penutup di akhir',
    coverLayout: 'forest-curve',
    palette: {
      primary: '#14532D',
      secondary: '#15803D',
      accent: '#86EFAC',
      tint: '#F0FDF4',
      border: '#BBF7D0',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'serif',
    chapterFormat: 'roman',
    tableTheme: 'soft-tint',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL PEMBERDAYAAN WARGA',
    coverMainTitle: 'BANTUAN SARANA USAHA MANDIRI',
    coverSubTitle: 'PENGUATAN KAPASITAS EKONOMI KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'PENDAHULUAN',
      pengantar: [
        'Pertumbuhan ekonomi yang inklusif di {wilayah} dimulai dari penguatan unit usaha paling kecil di tengah masyarakat, yaitu usaha mikro rumah tangga. Banyak warga memiliki semangat kerja tinggi, namun membutuhkan dukungan peralatan kerja agar dapat berproduksi secara layak.',
        'Oleh karena itu, pada tahun {tahun} disusun usulan bantuan peralatan usaha bagi {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang telah melalui pendataan serta pemeriksaan kelayakan.',
      ],
      tujuanTitle: 'TUJUAN KEGIATAN',
      tujuanIntro:
        'Adapun sasaran dan tujuan utama pengajuan bantuan di {wilayah} adalah sebagai berikut:',
      tujuanPoints: [
        'Memfasilitasi alat kerja produktif bagi keluarga prasejahtera agar mampu mengembangkan usaha mandiri.',
        'Meningkatkan pendapatan keluarga secara berkelanjutan sekaligus memperluas kemandirian ekonomi warga.',
        'Menggerakkan aktivitas usaha kecil di lingkungan {wilayah} agar tumbuh sehat dan produktif.',
      ],
      kegiatanTitle: 'BENTUK PELAKSANAAN',
      kegiatan: [
        'Bantuan diwujudkan dalam bentuk paket peralatan usaha yang jenis dan komposisinya disesuaikan dengan keterampilan serta kebutuhan usaha setiap kelompok penerima manfaat di {wilayah}.',
        'Penyaluran dilaksanakan secara langsung kepada penerima yang terdaftar guna memastikan tepat guna dan akuntabilitas.',
      ],
      anggaranTitle: 'KEBUTUHAN ANGGARAN',
      anggaran: [
        'Total rencana biaya pengadaan seluruh paket bagi {totalKpm} ({totalKpmTerbilang}) KPM tahun {tahun} mencapai {totalAnggaran} ({totalAnggaranTerbilang}), dengan uraian lengkap tercantum pada bagian lampiran proposal ini.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian dokumen proposal ini kami sampaikan kepada {tujuanPenerima}. Besar harapan kami kiranya usulan ini dapat terealisasi untuk meningkatkan taraf hidup warga {wilayah}.',
        'Atas perhatian serta dukungan Bapak/Ibu, kami sampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Pemberdayaan ekonomi keluarga di {wilayah} membutuhkan dukungan pendataan yang teliti serta koordinasi erat dengan pemerintah kewilayahan agar bantuan tepat mengenai warga yang membutuhkan.',
        'Melalui surat pengajuan ini, kami menyerahkan daftar {totalKpm} ({totalKpmTerbilang}) calon KPM tahun {tahun} kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Memohon rekomendasi dan pengesahan kewilayahan atas data calon penerima bantuan peralatan usaha di {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Memastikan seleksi penerima mengacu pada prioritas peringkat Desil DTSEN serta hasil verifikasi di lapangan.',
        'Menyajikan rekapitulasi identitas penerima yang akurat meliputi nama, alamat, RT/RW, dan NIK KTP.',
        'Memperkuat dukungan lintas unsur dalam mengawal program pemberdayaan masyarakat tahun {tahun}.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR CALON KPM',
      lampiranIntro:
        'Terlampir tabel daftar {totalKpm} calon penerima manfaat di {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Atas perhatian, arahan, dan rekomendasi dari {tujuanPenerima}, kami mengucapkan terima kasih.',
      ],
    },
  },
  {
    id: 14,
    code: 'Style 14',
    name: 'Arsitektur Grid Kobalt',
    tagline: 'Cover grid arsitektural kobalt · Bab Angka · Penutup sebelum lampiran',
    coverLayout: 'cobalt-grid',
    palette: {
      primary: '#1D4ED8',
      secondary: '#0369A1',
      accent: '#7DD3FC',
      tint: '#EFF6FF',
      border: '#93C5FD',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'sans',
    chapterFormat: 'numeric',
    tableTheme: 'solid-primary',
    opdClosingPosition: 'before-appendix',
    coverKicker: 'USULAN SARANA PRODUKTIF',
    coverMainTitle: 'BANTUAN PERALATAN USAHA',
    coverSubTitle: 'AKSELERASI KEMANDIRIAN EKONOMI KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Akselerasi peningkatan kesejahteraan masyarakat di {wilayah} dapat ditempuh secara efektif melalui pemberdayaan usaha produktif skala keluarga. Penyediaan peralatan kerja yang tepat sesuai minat usaha warga menjadi modal penting untuk membuka sumber pendapatan baru.',
        'Berdasarkan proses verifikasi berkas dan peninjauan lapangan tahun {tahun}, telah ditetapkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap menerima dukungan sarana kerja.',
      ],
      tujuanTitle: 'TUJUAN PROGRAM',
      tujuanIntro:
        'Tujuan yang hendak dicapai melalui pengajuan bantuan sarana usaha di {wilayah} adalah:',
      tujuanPoints: [
        'Menyediakan paket peralatan kerja terstandar yang menunjang kegiatan usaha mandiri warga prasejahtera.',
        'Mendorong peningkatan kualitas produk serta jasa pelaku usaha mikro agar berdaya saing.',
        'Mewujudkan kemandirian finansial keluarga penerima manfaat secara bertahap dan berkelanjutan.',
      ],
      kegiatanTitle: 'PELAKSANAAN PROGRAM',
      kegiatan: [
        'Program dilaksanakan melalui pengadaan dan pendistribusian paket peralatan kerja berdasarkan kategori item usaha yang diajukan oleh {totalKpm} calon KPM di {wilayah}.',
        'Rincian komponen sub-item dalam setiap paket disusun secara terukur agar dapat langsung digunakan untuk kegiatan usaha pascapenyaluran.',
      ],
      anggaranTitle: 'RANCANGAN ANGGARAN BIAYA',
      anggaran: [
        'Kebutuhan pembiayaan pengadaan paket sarana usaha bagi {totalKpm} ({totalKpmTerbilang}) KPM tahun {tahun} berjumlah {totalAnggaran} ({totalAnggaranTerbilang}), dengan rincian lengkap per kelompok paket dan daftar penerima manfaat pada bagian lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal permohonan bantuan sarana usaha ini kami sampaikan kepada {tujuanPenerima}. Kami berharap usulan masyarakat {wilayah} ini dapat disetujui dan direalisasikan pada tahun anggaran {tahun}.',
        'Atas perhatian serta dukungan Bapak/Ibu, kami sampaikan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Guna menjamin ketepatan sasaran program pemberdayaan ekonomi masyarakat di {wilayah}, dibutuhkan pendataan calon penerima yang tertib serta diketahui oleh pemerintah kewilayahan.',
        'Bersama proposal ini kami sampaikan usulan {totalKpm} ({totalKpmTerbilang}) calon penerima manfaat tahun {tahun} kepada {tujuanPenerima}.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Memperoleh rekomendasi kewilayahan atas rekapitulasi calon penerima bantuan peralatan usaha warga {wilayah}.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Memprioritaskan warga kurang mampu berdasarkan kategori Desil pada DTSEN serta hasil verifikasi lapangan.',
        'Memastikan kelengkapan dan kebenaran identitas domisili RT/RW serta nomor NIK KTP setiap calon penerima.',
        'Memperlancar koordinasi administratif pengusulan program bantuan usaha mikro tahun {tahun}.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR KPM',
      lampiranIntro:
        'Berikut disampaikan daftar nominatif {totalKpm} calon KPM wilayah {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian pengajuan rekomendasi ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
      ],
    },
  },
  {
    id: 15,
    code: 'Style 15',
    name: 'Editorial Plum Minimalis',
    tagline: 'Cover editorial plum modern · BAB Romawi · Penutup di akhir',
    coverLayout: 'plum-editorial',
    palette: {
      primary: '#581C87',
      secondary: '#7E22CE',
      accent: '#D8B4FE',
      tint: '#FAF5FF',
      border: '#E9D5FF',
      textOnPrimary: '#FFFFFF',
    },
    fontStyle: 'classic',
    chapterFormat: 'bab-roman',
    tableTheme: 'classic-bordered',
    opdClosingPosition: 'after-appendix',
    coverKicker: 'PROPOSAL PERMOHONAN BANTUAN',
    coverMainTitle: 'SARANA USAHA EKONOMI MANDIRI',
    coverSubTitle: 'PROGRAM PENGUATAN USAHA MIKRO KELUARGA PENERIMA MANFAAT',
    opdNarrative: {
      pengantarTitle: 'LATAR BELAKANG',
      pengantar: [
        'Mewujudkan kemandirian ekonomi rumah tangga di {wilayah} memerlukan langkah pemberdayaan yang konkret dan menyentuh langsung kebutuhan produksi masyarakat. Penyediaan peralatan usaha mandiri menjadi jembatan nyata bagi keluarga prasejahtera untuk meningkatkan taraf kehidupannya.',
        'Hasil pendataan serta validasi berkas pada tahun {tahun} menetapkan sebanyak {totalKpm} ({totalKpmTerbilang}) calon Keluarga Penerima Manfaat yang siap menerima dan memanfaatkan paket peralatan kerja secara produktif.',
      ],
      tujuanTitle: 'TUJUAN KEGIATAN',
      tujuanIntro:
        'Pengajuan proposal bantuan peralatan usaha mandiri bagi warga {wilayah} bertujuan untuk:',
      tujuanPoints: [
        'Menghadirkan akses sarana kerja yang memadai bagi pelaku usaha mikro dari kalangan keluarga prasejahtera.',
        'Meningkatkan pendapatan rumah tangga secara mandiri, berkelanjutan, dan terukur.',
        'Menumbuhkan semangat kewirausahaan warga guna memperkuat ketahanan sosial ekonomi di {wilayah}.',
      ],
      kegiatanTitle: 'MEKANISME KEGIATAN',
      kegiatan: [
        'Kegiatan dilaksanakan melalui pengadaan paket peralatan kerja yang dikelompokkan berdasarkan jenis usaha calon penerima di {wilayah}. Setiap penerima memperoleh satu paket bantuan yang utuh dan siap dioperasikan.',
        'Pendataan dilakukan dengan verifikasi identitas kependudukan secara cermat agar penyaluran berjalan transparan serta tepat sasaran.',
      ],
      anggaranTitle: 'RANCANGAN ANGGARAN BIAYA',
      anggaran: [
        'Total kebutuhan dana untuk memfasilitasi {totalKpm} ({totalKpmTerbilang}) KPM pada tahun anggaran {tahun} direncanakan sebesar {totalAnggaran} ({totalAnggaranTerbilang}). Rincian alokasi biaya per jenis paket serta daftar calon penerima manfaat disajikan lengkap pada lampiran.',
      ],
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian proposal permohonan bantuan sarana usaha ekonomi mandiri ini kami sampaikan kepada {tujuanPenerima}. Besar harapan kami agar usulan ini dapat dikabulkan demi mendorong kesejahteraan masyarakat {wilayah}.',
        'Atas perhatian, dukungan, dan kebijaksanaan Bapak/Ibu, kami haturkan terima kasih.',
      ],
    },
    wilayahNarrative: {
      pendahuluanTitle: 'PENDAHULUAN',
      pendahuluan: [
        'Sinergi pendataan yang akurat di tingkat kewilayahan merupakan fondasi utama dalam mewujudkan bantuan usaha mikro yang tepat sasaran bagi warga {wilayah}.',
        'Oleh sebab itu, pada tahun {tahun} kami menyampaikan daftar nominatif {totalKpm} ({totalKpmTerbilang}) calon penerima manfaat kepada {tujuanPenerima} untuk mendapatkan rekomendasi resmi.',
      ],
      maksudTujuanTitle: 'MAKSUD DAN TUJUAN',
      maksudLabel: 'Maksud',
      maksud:
        'Menyampaikan usulan calon penerima bantuan peralatan usaha warga {wilayah} guna memperoleh verifikasi dan rekomendasi kewilayahan.',
      tujuanLabel: 'Tujuan',
      tujuanPoints: [
        'Menjamin prioritas penerima bantuan mengacu pada peringkat Desil DTSEN serta hasil verifikasi dan validasi lapangan.',
        'Memastikan kelengkapan identitas domisili RT/RW serta nomor NIK KTP seluruh calon penerima manfaat.',
        'Mendukung kelancaran proses administrasi dan pengawasan pelaksanaan program pemberdayaan masyarakat.',
      ],
      lampiranTitle: 'LAMPIRAN DAFTAR CALON KPM',
      lampiranIntro:
        'Berikut dilampirkan daftar lengkap {totalKpm} calon penerima manfaat di {wilayah} tahun {tahun}.',
      penutupTitle: 'PENUTUP',
      penutup: [
        'Demikian permohonan rekomendasi kewilayahan ini kami sampaikan kepada {tujuanPenerima}. Atas perhatian dan kerja sama yang baik, kami ucapkan terima kasih.',
      ],
    },
  },
];

export function getProposalStyleById(styleId: number): ProposalStyleTemplate {
  return (
    PROPOSAL_STYLE_TEMPLATES.find((s) => s.id === styleId) || PROPOSAL_STYLE_TEMPLATES[0]
  );
}
