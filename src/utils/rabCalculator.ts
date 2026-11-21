import { ItemBantuan, KpmRecord, ProposalRecord } from '../types/kpm';

export type RabSourceMode = 'proposal' | 'manual';

export interface RabSubItem {
  id: string;
  namaBarang: string;
  volumePerPaket: number;
  satuan: string;
  hargaDasar: number;
  hargaSatuan: number;
  isBalancer: boolean;
}

export interface RabPackage {
  id: string;
  kode: string;
  namaPaket: string;
  jumlahPenerima: number;
  /** Jika null, mengikuti Pagu Standar per Master Item. Jika angka, menggunakan harga khusus paket ini. */
  customTargetHarga: number | null;
  /** Mode pembagian jika paket memiliki > 1 sub-item Penyeimbang */
  balancerMode: 'proportional' | 'primary';
  subItems: RabSubItem[];
}

export interface RabCalculatedSubItem extends RabSubItem {
  jumlahVolume: number;
  jumlahHarga: number;
}

export interface RabCalculatedPackage extends Omit<RabPackage, 'subItems'> {
  subItems: RabCalculatedSubItem[];
  targetHargaPaket: number;
  isCustomTarget: boolean;
  subtotalPerPaket: number;
  subtotalHarga: number;
  selisihPerPaket: number;
  isBalanced: boolean;
  hasBalancer: boolean;
  fixedTotalPerPaket: number;
}

export interface RabPaguInfo {
  totalPenerima: number;
  paguStandarPerKpm: number;
  exactDivision: boolean;
  sisaBagiRupiah: number;
  projectedTotalFromPagu: number;
}

export interface RabCalculatedSummary {
  packages: RabCalculatedPackage[];
  paguInfo: RabPaguInfo;
  totalPenerima: number;
  totalAnggaranTarget: number;
  totalTerhitung: number;
  /** Positif = kelebihan dari target anggaran, Negatif = kekurangan dari target anggaran */
  selisihTotal: number;
  unbalancedPackagesCount: number;
  activePackagesCount: number;
}

export interface RabOptimizeResult {
  packages: RabPackage[];
  applied: boolean;
  remainingDiff: number;
  adjustments: Array<{
    kodePaket: string;
    namaBarang: string;
    deltaHargaSatuan: number;
    jumlahPenerima: number;
    volumePerPaket: number;
    totalImpact: number;
  }>;
  message: string;
}

export interface RabSimulationPreset {
  id: string;
  label: string;
  judul: string;
  totalAnggaran: number;
  counts: Record<string, number>;
}

export const DEFAULT_PAGU_PER_KPM = 2_750_000;

interface DefaultPackageTemplate {
  kode: string;
  namaPaket: string;
  subItems: Array<{
    namaBarang: string;
    volumePerPaket: number;
    satuan: string;
    hargaDasar: number;
    isBalancer: boolean;
  }>;
}

const DEFAULT_PACKAGE_TEMPLATES: DefaultPackageTemplate[] = [
  {
    kode: 'OV',
    namaPaket: 'Paket Oven Gas',
    subItems: [
      { namaBarang: 'Mixer', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 650_000, isBalancer: false },
      { namaBarang: 'Oven Gas', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 1_000_000, isBalancer: false },
      { namaBarang: 'Blender', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 700_000, isBalancer: true },
      { namaBarang: 'Teflon Kue', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 400_000, isBalancer: false },
    ],
  },
  {
    kode: 'KPR',
    namaPaket: 'Paket Kompor Gas',
    subItems: [
      { namaBarang: 'Selang Gas', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 200_000, isBalancer: false },
      { namaBarang: 'Regulator', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 200_000, isBalancer: false },
      { namaBarang: 'Kompor Gas', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 649_910, isBalancer: true },
      { namaBarang: 'Dispenser', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 401_181, isBalancer: true },
      { namaBarang: 'Blender', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 698_909, isBalancer: true },
      { namaBarang: 'Rice Cooker', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 600_000, isBalancer: false },
    ],
  },
  {
    kode: 'JHT',
    namaPaket: 'Mesin Jahit',
    subItems: [
      { namaBarang: 'Mesin Jahit', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 2_750_000, isBalancer: true },
    ],
  },
  {
    kode: 'MC',
    namaPaket: 'Paket Mesin Cuci',
    subItems: [
      { namaBarang: 'Mesin Cuci', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 2_670_000, isBalancer: true },
      { namaBarang: 'Keranjang Pakaian', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 80_000, isBalancer: false },
    ],
  },
  {
    kode: 'TKG',
    namaPaket: 'Paket Peralatan Tukang',
    subItems: [
      { namaBarang: 'Mesin Potong Papan', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 760_000, isBalancer: true },
      { namaBarang: 'Mesin Gerinda Kayu', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 375_000, isBalancer: false },
      { namaBarang: 'Mesin Serut Kayu', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 670_000, isBalancer: false },
      { namaBarang: 'Mesin Amplas', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 570_000, isBalancer: false },
      { namaBarang: 'Mesin Bor', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 375_000, isBalancer: false },
    ],
  },
  {
    kode: 'ES',
    namaPaket: 'Paket Peralatan Es',
    subItems: [
      { namaBarang: 'Alat Cup Es', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 1_150_000, isBalancer: false },
      { namaBarang: 'Alat Serut Es', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 600_000, isBalancer: false },
      { namaBarang: 'Termos Es', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 300_000, isBalancer: false },
      { namaBarang: 'Blender', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 700_000, isBalancer: true },
    ],
  },
  {
    kode: 'CMT',
    namaPaket: 'Mesin Cuci Motor',
    subItems: [
      { namaBarang: 'Mesin Cuci Kendaraan', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 2_750_000, isBalancer: true },
    ],
  },
  {
    kode: 'TBS',
    namaPaket: 'Paket Peralatan Tebas',
    subItems: [
      { namaBarang: 'Mesin Potong Rumput', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 1_800_000, isBalancer: false },
      { namaBarang: 'Mini Chainsaw', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 250_000, isBalancer: true },
      { namaBarang: 'Alat Semprot', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 700_000, isBalancer: false },
    ],
  },
  {
    kode: 'TND',
    namaPaket: 'Paket Tenda & Kursi',
    subItems: [
      { namaBarang: 'Tenda', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 1_800_000, isBalancer: false },
      { namaBarang: 'Kursi Plastik', volumePerPaket: 6, satuan: 'Unit', hargaDasar: 158_334, isBalancer: true },
    ],
  },
  {
    kode: 'MSK',
    namaPaket: 'Paket Kompor Seribu',
    subItems: [
      { namaBarang: 'Kompor 1000', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 1_000_000, isBalancer: false },
      { namaBarang: 'Panci 30 cm', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 136_000, isBalancer: false },
      { namaBarang: 'Panci 28 cm', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 120_000, isBalancer: false },
      { namaBarang: 'Panci 26 cm', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 116_000, isBalancer: false },
      { namaBarang: 'Panci 24 cm', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 108_000, isBalancer: false },
      { namaBarang: 'Teko Siul', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 150_000, isBalancer: false },
      { namaBarang: 'Termos', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 420_000, isBalancer: false },
      { namaBarang: 'Blender', volumePerPaket: 1, satuan: 'Unit', hargaDasar: 700_000, isBalancer: true },
    ],
  },
];

export const RAB_SIMULATION_PRESETS: RabSimulationPreset[] = [
  {
    id: 'sim-66',
    label: '66 KPM · 181,5 Jt',
    judul: '2026 KECAMATAN PONTIANAK TENGGARA',
    totalAnggaran: 181_500_000,
    counts: { OV: 10, KPR: 15, JHT: 3, MC: 10, TKG: 4, ES: 3, CMT: 1, TBS: 5, TND: 1, MSK: 14 },
  },
  {
    id: 'sim-65',
    label: '65 KPM · 177,5 Jt',
    judul: '2026 KECAMATAN PONTIANAK BARAT',
    totalAnggaran: 177_500_000,
    counts: { OV: 9, KPR: 15, JHT: 3, MC: 10, TKG: 4, ES: 3, CMT: 1, TBS: 5, TND: 0, MSK: 15 },
  },
  {
    id: 'sim-62',
    label: '62 KPM · 170,5 Jt',
    judul: '2026 KECAMATAN PONTIANAK TIMUR',
    totalAnggaran: 170_500_000,
    counts: { OV: 10, KPR: 15, JHT: 3, MC: 9, TKG: 4, ES: 3, CMT: 1, TBS: 4, TND: 0, MSK: 13 },
  },
];

export function formatRupiahPlain(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  return `${sign}${abs.toLocaleString('id-ID')}`;
}

export function formatRupiahCurrency(value: number, options?: { zeroAsDash?: boolean; withDecimals?: boolean }): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  if (options?.zeroAsDash && safe === 0) {
    return 'Rp -';
  }
  const sign = safe < 0 ? '-Rp ' : 'Rp ';
  const abs = Math.abs(safe);
  const formatted = abs.toLocaleString('id-ID');
  return options?.withDecimals ? `${sign}${formatted},00` : `${sign}${formatted}`;
}

export function parseRupiahInput(raw: string): number {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeStandardPaguPerKpm(totalAnggaran: number, totalPenerima: number): RabPaguInfo {
  const safeBudget = Math.max(0, Math.round(Number.isFinite(totalAnggaran) ? totalAnggaran : 0));
  const safeKpm = Math.max(0, Math.floor(Number.isFinite(totalPenerima) ? totalPenerima : 0));
  if (safeKpm <= 0) {
    return {
      totalPenerima: 0,
      paguStandarPerKpm: DEFAULT_PAGU_PER_KPM,
      exactDivision: true,
      sisaBagiRupiah: 0,
      projectedTotalFromPagu: 0,
    };
  }
  const paguStandarPerKpm = Math.floor(safeBudget / safeKpm);
  const projectedTotalFromPagu = paguStandarPerKpm * safeKpm;
  const sisaBagiRupiah = safeBudget - projectedTotalFromPagu;
  return {
    totalPenerima: safeKpm,
    paguStandarPerKpm,
    exactDivision: sisaBagiRupiah === 0,
    sisaBagiRupiah,
    projectedTotalFromPagu,
  };
}

export function createDefaultRabPackages(
  countsByKode: Record<string, number> = {},
  targetPaguPerKpm: number = DEFAULT_PAGU_PER_KPM
): RabPackage[] {
  const packages: RabPackage[] = DEFAULT_PACKAGE_TEMPLATES.map((tpl) => {
    const pkg: RabPackage = {
      id: `rab-pkg-${tpl.kode}`,
      kode: tpl.kode,
      namaPaket: tpl.namaPaket,
      jumlahPenerima: Math.max(0, Math.floor(countsByKode[tpl.kode] || 0)),
      customTargetHarga: null,
      balancerMode: tpl.kode === 'KPR' ? 'primary' : 'proportional',
      subItems: tpl.subItems.map((sub, idx) => ({
        id: `rab-sub-${tpl.kode}-${idx + 1}`,
        namaBarang: sub.namaBarang,
        volumePerPaket: sub.volumePerPaket,
        satuan: sub.satuan,
        hargaDasar: sub.hargaDasar,
        hargaSatuan: sub.hargaDasar,
        isBalancer: sub.isBalancer,
      })),
    };
    return rebalancePackage(pkg, targetPaguPerKpm);
  });
  return packages;
}

/**
 * Menghitung ulang harga sub-item berstatus `Penyeimbang` (isBalancer === true)
 * agar subtotal 1 paket Master Item seimbang terhadap `targetHargaPaket`.
 */
export function rebalancePackage(pkg: RabPackage, standardPaguPerKpm: number): RabPackage {
  const targetHargaPaket =
    pkg.customTargetHarga !== null && Number.isFinite(pkg.customTargetHarga)
      ? Math.max(0, Math.round(pkg.customTargetHarga))
      : Math.max(0, Math.round(standardPaguPerKpm));

  const balancers = pkg.subItems.filter((sub) => sub.isBalancer);
  if (balancers.length === 0) {
    return pkg;
  }

  const fixedTotal = pkg.subItems
    .filter((sub) => !sub.isBalancer)
    .reduce((sum, sub) => sum + Math.max(1, sub.volumePerPaket) * Math.max(0, Math.round(sub.hargaSatuan)), 0);

  const remainingForBalancers = Math.max(0, targetHargaPaket - fixedTotal);

  if (balancers.length === 1) {
    const only = balancers[0];
    const vol = Math.max(1, only.volumePerPaket);
    const nextUnitPrice = Math.max(0, Math.round(remainingForBalancers / vol));
    return {
      ...pkg,
      subItems: pkg.subItems.map((sub) =>
        sub.id === only.id ? { ...sub, hargaSatuan: nextUnitPrice } : sub
      ),
    };
  }

  // Multi-balancer handling (contoh: KPR dengan Kompor Gas, Dispenser, Blender)
  const baseSum = balancers.reduce(
    (sum, sub) => sum + Math.max(1, sub.volumePerPaket) * Math.max(0, Math.round(sub.hargaDasar)),
    0
  );

  // Jika sisa anggaran persis sama dengan jumlah harga dasar, gunakan harga dasar eksak
  if (remainingForBalancers === baseSum && baseSum > 0) {
    return {
      ...pkg,
      subItems: pkg.subItems.map((sub) =>
        sub.isBalancer ? { ...sub, hargaSatuan: Math.max(0, Math.round(sub.hargaDasar)) } : sub
      ),
    };
  }

  const nextPriceById = new Map<string, number>();

  if (pkg.balancerMode === 'primary') {
    // Penyeimbang sekunder mempertahankan harga dasarnya (atau harga saat ini jika masih valid),
    // seluruh selisih diserap oleh penyeimbang utama (indeks pertama, mis. Kompor Gas)
    const primary = balancers[0];
    const others = balancers.slice(1);
    const othersTotal = others.reduce(
      (sum, sub) => sum + Math.max(1, sub.volumePerPaket) * Math.max(0, Math.round(sub.hargaDasar)),
      0
    );

    if (remainingForBalancers >= othersTotal) {
      others.forEach((sub) => {
        nextPriceById.set(sub.id, Math.max(0, Math.round(sub.hargaDasar)));
      });
      const primaryBudget = remainingForBalancers - othersTotal;
      const primaryVol = Math.max(1, primary.volumePerPaket);
      nextPriceById.set(primary.id, Math.max(0, Math.round(primaryBudget / primaryVol)));

      return {
        ...pkg,
        subItems: pkg.subItems.map((sub) =>
          sub.isBalancer && nextPriceById.has(sub.id)
            ? { ...sub, hargaSatuan: nextPriceById.get(sub.id)! }
            : sub
        ),
      };
    }
    // Jika sisa lebih kecil dari total sekunder, fallback otomatis ke proporsional agar tidak negatif
  }

  // Distribusi proporsional berdasarkan bobot harga dasar (atau sama rata jika harga dasar 0)
  const weights = balancers.map((sub) => {
    const vol = Math.max(1, sub.volumePerPaket);
    const baseContribution = vol * Math.max(0, Math.round(sub.hargaDasar));
    return baseSum > 0 ? baseContribution : vol;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || balancers.length;

  let allocatedTotal = 0;
  balancers.forEach((sub, idx) => {
    const vol = Math.max(1, sub.volumePerPaket);
    if (idx === 0) {
      // Penyeimbang pertama diisi terakhir agar menyerap sisa pembulatan rupiah
      return;
    }
    const shareBudget = Math.round((remainingForBalancers * weights[idx]) / totalWeight);
    const unitPrice = Math.max(0, Math.round(shareBudget / vol));
    nextPriceById.set(sub.id, unitPrice);
    allocatedTotal += unitPrice * vol;
  });

  const primary = balancers[0];
  const primaryVol = Math.max(1, primary.volumePerPaket);
  const primaryBudget = Math.max(0, remainingForBalancers - allocatedTotal);
  nextPriceById.set(primary.id, Math.max(0, Math.round(primaryBudget / primaryVol)));

  return {
    ...pkg,
    subItems: pkg.subItems.map((sub) =>
      sub.isBalancer && nextPriceById.has(sub.id)
        ? { ...sub, hargaSatuan: nextPriceById.get(sub.id)! }
        : sub
    ),
  };
}

export function rebalanceAllPackages(packages: RabPackage[], standardPaguPerKpm: number): RabPackage[] {
  return packages.map((pkg) => rebalancePackage(pkg, standardPaguPerKpm));
}

/**
 * Mengisi jumlah penerima per Master Item dari Proposal MASDETA (hanya KPM berstatus 'accepted').
 * Jika proposal memiliki kode item tambahan di luar 10 paket standar (mis. LE), ikut dibuatkan paketnya.
 */
export function buildRabPackagesFromProposal(
  proposal: ProposalRecord,
  records: KpmRecord[],
  catalogItems: ItemBantuan[],
  totalAnggaran: number
): { packages: RabPackage[]; judul: string; totalKpm: number; suggestedBudget: number } {
  const acceptedRecords = records.filter(
    (r) =>
      r.validasi === 'accepted' &&
      (r.proposalId === proposal.id ||
        (!r.proposalId &&
          r.proposal.trim().toLowerCase() === proposal.namaProposal.trim().toLowerCase() &&
          String(r.tahun) === String(proposal.tahun)))
  );

  const countsByKode: Record<string, number> = {};
  acceptedRecords.forEach((rec) => {
    const kode = String(rec.item || '').trim().toUpperCase();
    if (!kode) return;
    countsByKode[kode] = (countsByKode[kode] || 0) + 1;
  });

  const totalKpm = Object.values(countsByKode).reduce((sum, n) => sum + n, 0);
  const suggestedBudget =
    totalAnggaran > 0
      ? totalAnggaran
      : totalKpm > 0
      ? totalKpm * DEFAULT_PAGU_PER_KPM
      : 0;

  const paguInfo = computeStandardPaguPerKpm(suggestedBudget, totalKpm);
  const packages = createDefaultRabPackages(countsByKode, paguInfo.paguStandarPerKpm);

  // Cek apakah proposal memakai kode Master Item tambahan di luar 10 template standar
  const existingCodes = new Set(packages.map((p) => p.kode.toUpperCase()));
  Object.entries(countsByKode).forEach(([kode, count]) => {
    if (existingCodes.has(kode) || count <= 0) return;
    const catalogMatch = catalogItems.find(
      (item) => item.code.trim().toUpperCase() === kode
    );
    const rawSubNames = catalogMatch?.subItems?.length
      ? catalogMatch.subItems
      : [catalogMatch?.name || kode];

    const extraPkg: RabPackage = {
      id: `rab-pkg-${kode}`,
      kode,
      namaPaket: catalogMatch?.name ? `Paket ${catalogMatch.name}` : `Paket ${kode}`,
      jumlahPenerima: count,
      customTargetHarga: null,
      balancerMode: 'primary',
      subItems: rawSubNames.map((subName, idx) => ({
        id: `rab-sub-${kode}-${idx + 1}`,
        namaBarang: subName,
        volumePerPaket: 1,
        satuan: 'Unit',
        hargaDasar: idx === rawSubNames.length - 1 ? paguInfo.paguStandarPerKpm : 0,
        hargaSatuan: idx === rawSubNames.length - 1 ? paguInfo.paguStandarPerKpm : 0,
        isBalancer: idx === rawSubNames.length - 1,
      })),
    };
    packages.push(rebalancePackage(extraPkg, paguInfo.paguStandarPerKpm));
  });

  const cleanProposalName = proposal.namaProposal.trim().toUpperCase();
  const hasYearPrefix = proposal.tahun && cleanProposalName.startsWith(String(proposal.tahun));
  const judul = hasYearPrefix
    ? cleanProposalName
    : `${proposal.tahun || new Date().getFullYear()} ${cleanProposalName}`.trim();

  return {
    packages,
    judul,
    totalKpm,
    suggestedBudget,
  };
}

export function calculateRabSummary(
  packages: RabPackage[],
  totalAnggaranTarget: number
): RabCalculatedSummary {
  const safeTargetBudget = Math.max(0, Math.round(Number.isFinite(totalAnggaranTarget) ? totalAnggaranTarget : 0));
  const totalPenerima = packages.reduce((sum, pkg) => sum + Math.max(0, Math.floor(pkg.jumlahPenerima || 0)), 0);
  const paguInfo = computeStandardPaguPerKpm(safeTargetBudget, totalPenerima);

  let totalTerhitung = 0;
  let unbalancedPackagesCount = 0;
  let activePackagesCount = 0;

  const calculatedPackages: RabCalculatedPackage[] = packages.map((pkg) => {
    const penerima = Math.max(0, Math.floor(pkg.jumlahPenerima || 0));
    if (penerima > 0) activePackagesCount += 1;

    const isCustomTarget = pkg.customTargetHarga !== null && Number.isFinite(pkg.customTargetHarga);
    const targetHargaPaket = isCustomTarget
      ? Math.max(0, Math.round(pkg.customTargetHarga!))
      : paguInfo.paguStandarPerKpm;

    let subtotalPerPaket = 0;
    let subtotalHarga = 0;
    let fixedTotalPerPaket = 0;
    let hasBalancer = false;

    const calculatedSubItems: RabCalculatedSubItem[] = pkg.subItems.map((sub) => {
      const volPerPaket = Math.max(1, Math.floor(sub.volumePerPaket || 1));
      const unitPrice = Math.max(0, Math.round(sub.hargaSatuan || 0));
      const jumlahVolume = penerima * volPerPaket;
      const jumlahHarga = jumlahVolume * unitPrice;

      subtotalPerPaket += volPerPaket * unitPrice;
      subtotalHarga += jumlahHarga;
      if (sub.isBalancer) {
        hasBalancer = true;
      } else {
        fixedTotalPerPaket += volPerPaket * unitPrice;
      }

      return {
        ...sub,
        volumePerPaket: volPerPaket,
        hargaSatuan: unitPrice,
        jumlahVolume,
        jumlahHarga,
      };
    });

    totalTerhitung += subtotalHarga;

    const selisihPerPaket = subtotalPerPaket - targetHargaPaket;
    const isBalanced = selisihPerPaket === 0;
    if (!isBalanced && penerima > 0) {
      unbalancedPackagesCount += 1;
    }

    return {
      ...pkg,
      jumlahPenerima: penerima,
      subItems: calculatedSubItems,
      targetHargaPaket,
      isCustomTarget,
      subtotalPerPaket,
      subtotalHarga,
      selisihPerPaket,
      isBalanced,
      hasBalancer,
      fixedTotalPerPaket,
    };
  });

  const selisihTotal = totalTerhitung - safeTargetBudget;

  return {
    packages: calculatedPackages,
    paguInfo,
    totalPenerima,
    totalAnggaranTarget: safeTargetBudget,
    totalTerhitung,
    selisihTotal,
    unbalancedPackagesCount,
    activePackagesCount,
  };
}

/**
 * Mengoptimalkan selisih pembulatan kecil (mis. +Rp 4 atau -Rp 15) terhadap Total Anggaran Target
 * dengan menyesuaikan harga sub-item Penyeimbang pada paket aktif (penerima > 0),
 * memilih penyesuaian harga per unit sekecil mungkin.
 */
export function optimizeRabRounding(
  packages: RabPackage[],
  totalAnggaranTarget: number
): RabOptimizeResult {
  const summary = calculateRabSummary(packages, totalAnggaranTarget);
  const diffNeeded = summary.totalAnggaranTarget - summary.totalTerhitung; // positif = perlu tambah, negatif = perlu kurang

  if (diffNeeded === 0) {
    return {
      packages,
      applied: false,
      remainingDiff: 0,
      adjustments: [],
      message: 'Total terhitung RAB sudah pas dengan Target Total Anggaran (Rp 0 selisih).',
    };
  }

  interface CandidateBalancer {
    pkgIndex: number;
    subIndex: number;
    kodePaket: string;
    namaBarang: string;
    jumlahPenerima: number;
    volumePerPaket: number;
    step: number;
    currentPrice: number;
  }

  const candidates: CandidateBalancer[] = [];
  packages.forEach((pkg, pkgIndex) => {
    const penerima = Math.max(0, Math.floor(pkg.jumlahPenerima || 0));
    if (penerima <= 0) return;
    const balancers = pkg.subItems
      .map((sub, subIndex) => ({ sub, subIndex }))
      .filter(({ sub }) => sub.isBalancer);
    // Ambil penyeimbang utama tiap paket aktif agar perubahan tetap bersih & terpusat
    if (balancers.length > 0) {
      const first = balancers[0];
      const vol = Math.max(1, Math.floor(first.sub.volumePerPaket || 1));
      candidates.push({
        pkgIndex,
        subIndex: first.subIndex,
        kodePaket: pkg.kode,
        namaBarang: first.sub.namaBarang,
        jumlahPenerima: penerima,
        volumePerPaket: vol,
        step: penerima * vol,
        currentPrice: Math.max(0, Math.round(first.sub.hargaSatuan || 0)),
      });
    }
  });

  if (candidates.length === 0) {
    return {
      packages,
      applied: false,
      remainingDiff: diffNeeded,
      adjustments: [],
      message: 'Tidak ada sub-item Penyeimbang aktif (penerima > 0) untuk mengoptimalkan pembulatan.',
    };
  }

  const absDiff = Math.abs(diffNeeded);
  const direction = diffNeeded > 0 ? 1 : -1;

  // Clone packages untuk mutasi bersih
  const nextPackages: RabPackage[] = packages.map((pkg) => ({
    ...pkg,
    subItems: pkg.subItems.map((sub) => ({ ...sub })),
  }));
  const adjustments: RabOptimizeResult['adjustments'] = [];

  // Strategi 1: Cari satu penyeimbang yang step-nya membagi habis absDiff dengan delta harga unit paling kecil
  const exactDivisors = candidates
    .filter((c) => absDiff % c.step === 0)
    .filter((c) => direction > 0 || c.currentPrice >= absDiff / c.step)
    .sort((a, b) => b.step - a.step);

  let remaining = diffNeeded;

  if (exactDivisors.length > 0) {
    const best = exactDivisors[0];
    const deltaUnit = direction * (absDiff / best.step);
    const pkg = nextPackages[best.pkgIndex];
    pkg.subItems[best.subIndex].hargaSatuan = Math.max(
      0,
      pkg.subItems[best.subIndex].hargaSatuan + deltaUnit
    );
    // Selaraskan target khusus paket agar indikator paket tetap PAS / SEIMBANG
    const newPkgSubtotal = pkg.subItems.reduce(
      (sum, s) => sum + Math.max(1, s.volumePerPaket) * Math.max(0, Math.round(s.hargaSatuan)),
      0
    );
    pkg.customTargetHarga = newPkgSubtotal;

    adjustments.push({
      kodePaket: best.kodePaket,
      namaBarang: best.namaBarang,
      deltaHargaSatuan: deltaUnit,
      jumlahPenerima: best.jumlahPenerima,
      volumePerPaket: best.volumePerPaket,
      totalImpact: deltaUnit * best.step,
    });
    remaining = 0;
  } else {
    // Strategi 2: Kombinasi greedy dari step terbesar <= |remaining| hingga step terkecil
    const sorted = [...candidates].sort((a, b) => b.step - a.step);
    for (const c of sorted) {
      if (remaining === 0) break;
      const absRem = Math.abs(remaining);
      const dir = remaining > 0 ? 1 : -1;
      if (c.step > absRem) continue;

      let units = Math.floor(absRem / c.step);
      if (dir < 0) {
        units = Math.min(units, c.currentPrice);
      }
      if (units <= 0) continue;

      const deltaUnit = dir * units;
      const pkg = nextPackages[c.pkgIndex];
      pkg.subItems[c.subIndex].hargaSatuan = Math.max(
        0,
        pkg.subItems[c.subIndex].hargaSatuan + deltaUnit
      );
      const newPkgSubtotal = pkg.subItems.reduce(
        (sum, s) => sum + Math.max(1, s.volumePerPaket) * Math.max(0, Math.round(s.hargaSatuan)),
        0
      );
      pkg.customTargetHarga = newPkgSubtotal;

      const impact = deltaUnit * c.step;
      remaining -= impact;
      adjustments.push({
        kodePaket: c.kodePaket,
        namaBarang: c.namaBarang,
        deltaHargaSatuan: deltaUnit,
        jumlahPenerima: c.jumlahPenerima,
        volumePerPaket: c.volumePerPaket,
        totalImpact: impact,
      });
    }

    // Jika masih ada sisa kecil (< step terkecil), cek apakah menggeser 1 unit pada step terkecil memperkecil error
    if (remaining !== 0) {
      const smallest = sorted[sorted.length - 1];
      if (smallest && Math.abs(remaining) > smallest.step / 2) {
        const dir = remaining > 0 ? 1 : -1;
        const pkg = nextPackages[smallest.pkgIndex];
        const currentSub = pkg.subItems[smallest.subIndex];
        if (dir > 0 || currentSub.hargaSatuan >= 1) {
          currentSub.hargaSatuan = Math.max(0, currentSub.hargaSatuan + dir);
          const newPkgSubtotal = pkg.subItems.reduce(
            (sum, s) => sum + Math.max(1, s.volumePerPaket) * Math.max(0, Math.round(s.hargaSatuan)),
            0
          );
          pkg.customTargetHarga = newPkgSubtotal;
          const impact = dir * smallest.step;
          remaining -= impact;
          const existingAdj = adjustments.find(
            (a) => a.kodePaket === smallest.kodePaket && a.namaBarang === smallest.namaBarang
          );
          if (existingAdj) {
            existingAdj.deltaHargaSatuan += dir;
            existingAdj.totalImpact += impact;
          } else {
            adjustments.push({
              kodePaket: smallest.kodePaket,
              namaBarang: smallest.namaBarang,
              deltaHargaSatuan: dir,
              jumlahPenerima: smallest.jumlahPenerima,
              volumePerPaket: smallest.volumePerPaket,
              totalImpact: impact,
            });
          }
        }
      }
    }
  }

  if (adjustments.length === 0) {
    return {
      packages,
      applied: false,
      remainingDiff: remaining,
      adjustments: [],
      message: `Selisih Rp ${formatRupiahPlain(Math.abs(remaining))} lebih kecil dari kelipatan minimum penerima aktif sehingga tidak bisa diperkecil lagi.`,
    };
  }

  const desc = adjustments
    .map(
      (a) =>
        `${a.namaBarang} (${a.kodePaket}) ${a.deltaHargaSatuan > 0 ? '+' : '-'}Rp ${formatRupiahPlain(Math.abs(a.deltaHargaSatuan))}/unit`
    )
    .join(', ');

  return {
    packages: nextPackages,
    applied: true,
    remainingDiff: remaining,
    adjustments,
    message:
      remaining === 0
        ? `Pembulatan berhasil dioptimalkan ke Rp 0: ${desc}.`
        : `Pembulatan diperkecil (sisa ${remaining > 0 ? '-' : '+'}Rp ${formatRupiahPlain(Math.abs(remaining))}): ${desc}.`,
  };
}
