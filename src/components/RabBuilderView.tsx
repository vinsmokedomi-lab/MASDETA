import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ItemBantuan, KpmRecord, ProposalRecord } from '../types/kpm';
import {
  DEFAULT_PAGU_PER_KPM,
  RAB_SIMULATION_PRESETS,
  RabPackage,
  RabSourceMode,
  buildRabPackagesFromProposal,
  calculateRabSummary,
  computeStandardPaguPerKpm,
  createDefaultRabPackages,
  formatRupiahCurrency,
  formatRupiahPlain,
  optimizeRabRounding,
  parseRupiahInput,
  rebalanceAllPackages,
  rebalancePackage,
} from '../utils/rabCalculator';
import { exportRabToPdf } from '../utils/pdfExporter';

interface RabBuilderViewProps {
  proposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  onBack: () => void;
}

type ViewMode = 'editor' | 'preview';
type PackageFilter = 'all' | 'active' | 'unbalanced';

export function RabBuilderView({
  proposals,
  records,
  items,
  onBack,
}: RabBuilderViewProps) {
  // Urutkan proposal terbaru lebih dulu dan hitung jumlah KPM diterima
  const sortedProposals = useMemo(() => {
    const countMap = new Map<string, number>();
    records.forEach((rec) => {
      if (rec.validasi === 'accepted' && rec.proposalId) {
        countMap.set(rec.proposalId, (countMap.get(rec.proposalId) || 0) + 1);
      }
    });

    return [...proposals]
      .map((p) => ({
        proposal: p,
        acceptedCount: countMap.get(p.id) || 0,
      }))
      .sort((a, b) => {
        const yearDiff = Number(b.proposal.tahun || 0) - Number(a.proposal.tahun || 0);
        if (yearDiff !== 0) return yearDiff;
        return a.proposal.namaProposal.localeCompare(b.proposal.namaProposal, 'id');
      });
  }, [proposals, records]);

  // Default state awal: jika ada proposal dengan KPM diterima, mulai dari mode proposal; jika tidak, mulai dari simulasi preset pertama (66 KPM · 181,5 Jt)
  const defaultPreset = RAB_SIMULATION_PRESETS[0];

  const [sourceMode, setSourceMode] = useState<RabSourceMode>(() =>
    sortedProposals.some((p) => p.acceptedCount > 0) ? 'proposal' : 'manual'
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string>(() => {
    const firstWithKpm = sortedProposals.find((p) => p.acceptedCount > 0);
    return firstWithKpm?.proposal.id || sortedProposals[0]?.proposal.id || '';
  });

  const [judulRab, setJudulRab] = useState<string>(defaultPreset.judul);
  const [totalAnggaran, setTotalAnggaran] = useState<number>(defaultPreset.totalAnggaran);
  const [budgetInputText, setBudgetInputText] = useState<string>(
    formatRupiahPlain(defaultPreset.totalAnggaran)
  );
  const [autoRebalanceOnChange, setAutoRebalanceOnChange] = useState<boolean>(true);
  const [packages, setPackages] = useState<RabPackage[]>(() => {
    const pagu = computeStandardPaguPerKpm(
      defaultPreset.totalAnggaran,
      Object.values(defaultPreset.counts).reduce((a, b) => a + b, 0)
    );
    return createDefaultRabPackages(defaultPreset.counts, pagu.paguStandarPerKpm);
  });

  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [packageFilter, setPackageFilter] = useState<PackageFilter>('all');
  const [expandedPackageIds, setExpandedPackageIds] = useState<Record<string, boolean>>({});
  const [statusNotice, setStatusNotice] = useState<{
    tone: 'teal' | 'amber' | 'rose';
    text: string;
  } | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Sinkronisasi awal saat membuka halaman jika mode default = 'proposal'
  const [hasInitializedProposal, setHasInitializedProposal] = useState<boolean>(false);
  useEffect(() => {
    if (hasInitializedProposal) return;
    if (sourceMode === 'proposal' && selectedProposalId) {
      const found = sortedProposals.find((item) => item.proposal.id === selectedProposalId);
      if (found) {
        const built = buildRabPackagesFromProposal(
          found.proposal,
          records,
          items,
          found.acceptedCount > 0 ? found.acceptedCount * DEFAULT_PAGU_PER_KPM : 0
        );
        setJudulRab(built.judul);
        setTotalAnggaran(built.suggestedBudget);
        setBudgetInputText(formatRupiahPlain(built.suggestedBudget));
        setPackages(built.packages);

        const initialExpanded: Record<string, boolean> = {};
        built.packages.forEach((pkg) => {
          initialExpanded[pkg.id] = pkg.jumlahPenerima > 0;
        });
        setExpandedPackageIds(initialExpanded);
      }
    } else {
      const initialExpanded: Record<string, boolean> = {};
      packages.forEach((pkg) => {
        initialExpanded[pkg.id] = pkg.jumlahPenerima > 0;
      });
      setExpandedPackageIds(initialExpanded);
    }
    setHasInitializedProposal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitializedProposal, sourceMode, selectedProposalId]);

  const summary = useMemo(
    () => calculateRabSummary(packages, totalAnggaran),
    [packages, totalAnggaran]
  );

  // Terapkan pilihan Proposal MASDETA
  const handleSelectProposal = (proposalId: string) => {
    setSelectedProposalId(proposalId);
    setStatusNotice(null);
    const found = sortedProposals.find((p) => p.proposal.id === proposalId);
    if (!found) return;

    const nextBudget =
      found.acceptedCount > 0
        ? found.acceptedCount * DEFAULT_PAGU_PER_KPM
        : totalAnggaran;

    const built = buildRabPackagesFromProposal(found.proposal, records, items, nextBudget);
    setJudulRab(built.judul);
    setTotalAnggaran(built.suggestedBudget);
    setBudgetInputText(formatRupiahPlain(built.suggestedBudget));
    setPackages(built.packages);

    const nextExpanded: Record<string, boolean> = {};
    built.packages.forEach((pkg) => {
      nextExpanded[pkg.id] = pkg.jumlahPenerima > 0;
    });
    setExpandedPackageIds(nextExpanded);

    setStatusNotice({
      tone: 'teal',
      text: `Kuota ${built.totalKpm} KPM berhasil dimuat dari proposal "${found.proposal.namaProposal}".`,
    });
  };

  // Beralih antara mode Proposal MASDETA vs Manual / Simulasi
  const handleChangeSourceMode = (mode: RabSourceMode) => {
    setSourceMode(mode);
    setStatusNotice(null);
    if (mode === 'proposal' && selectedProposalId) {
      handleSelectProposal(selectedProposalId);
    }
  };

  // Terapkan Preset Simulasi cepat
  const handleApplyPreset = (presetId: string) => {
    const preset = RAB_SIMULATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSourceMode('manual');
    setJudulRab(preset.judul);
    setTotalAnggaran(preset.totalAnggaran);
    setBudgetInputText(formatRupiahPlain(preset.totalAnggaran));

    const totalKpm = Object.values(preset.counts).reduce((a, b) => a + b, 0);
    const pagu = computeStandardPaguPerKpm(preset.totalAnggaran, totalKpm);
    const built = createDefaultRabPackages(preset.counts, pagu.paguStandarPerKpm);
    setPackages(built);

    const nextExpanded: Record<string, boolean> = {};
    built.forEach((pkg) => {
      nextExpanded[pkg.id] = pkg.jumlahPenerima > 0;
    });
    setExpandedPackageIds(nextExpanded);
    setStatusNotice({
      tone: 'teal',
      text: `Preset simulasi ${preset.label} diterapkan (Pagu Rp ${formatRupiahPlain(pagu.paguStandarPerKpm)}/KPM).`,
    });
  };

  // Ubah Total Anggaran Tersedia
  const handleBudgetChange = (rawText: string) => {
    const parsed = parseRupiahInput(rawText);
    setTotalAnggaran(parsed);
    setBudgetInputText(parsed > 0 ? formatRupiahPlain(parsed) : '');
    setStatusNotice(null);

    if (autoRebalanceOnChange) {
      const totalKpm = packages.reduce((sum, p) => sum + Math.max(0, p.jumlahPenerima), 0);
      const pagu = computeStandardPaguPerKpm(parsed, totalKpm);
      setPackages((prev) => rebalanceAllPackages(prev, pagu.paguStandarPerKpm));
    }
  };

  // Shortcut: set Total Anggaran = 2.750.000 x Total KPM
  const handleSetStandard275Budget = () => {
    if (summary.totalPenerima <= 0) return;
    const target = summary.totalPenerima * DEFAULT_PAGU_PER_KPM;
    setTotalAnggaran(target);
    setBudgetInputText(formatRupiahPlain(target));
    setPackages((prev) =>
      rebalanceAllPackages(
        prev.map((pkg) => ({ ...pkg, customTargetHarga: null })),
        DEFAULT_PAGU_PER_KPM
      )
    );
    setStatusNotice({
      tone: 'teal',
      text: `Total anggaran disetel ke Rp ${formatRupiahPlain(target)} (${summary.totalPenerima} KPM × Rp 2.750.000).`,
    });
  };

  // Terapkan Pagu Standar ke semua paket (hapus custom override & rebalance semua)
  const handleApplyStandardPaguAll = () => {
    const pagu = summary.paguInfo.paguStandarPerKpm;
    setPackages((prev) =>
      rebalanceAllPackages(
        prev.map((pkg) => ({ ...pkg, customTargetHarga: null })),
        pagu
      )
    );
    setStatusNotice({
      tone: 'teal',
      text: `Seluruh paket Master Item diselaraskan ke Pagu Standar Rp ${formatRupiahPlain(pagu)}/paket.`,
    });
  };

  // Reset harga baku ke template default (pertahankan jumlah penerima saat ini)
  const handleResetDefaultPrices = () => {
    const currentCounts: Record<string, number> = {};
    packages.forEach((p) => {
      currentCounts[p.kode] = p.jumlahPenerima;
    });
    const totalKpm = Object.values(currentCounts).reduce((a, b) => a + b, 0);
    const pagu = computeStandardPaguPerKpm(totalAnggaran, totalKpm);
    setPackages(createDefaultRabPackages(currentCounts, pagu.paguStandarPerKpm));
    setStatusNotice({
      tone: 'teal',
      text: 'Harga baku & struktur sub-item dikembalikan ke template standar MASDETA.',
    });
  };

  // Ubah jumlah penerima pada 1 paket Master Item
  const handleUpdatePackageRecipients = (packageId: string, nextCountRaw: string) => {
    const nextCount = Math.max(0, Math.min(9999, parseInt(nextCountRaw.replace(/[^\d]/g, ''), 10) || 0));
    setStatusNotice(null);
    setPackages((prev) => {
      const updated = prev.map((pkg) =>
        pkg.id === packageId ? { ...pkg, jumlahPenerima: nextCount } : pkg
      );
      if (!autoRebalanceOnChange) return updated;
      const newTotalKpm = updated.reduce((sum, p) => sum + Math.max(0, p.jumlahPenerima), 0);
      const pagu = computeStandardPaguPerKpm(totalAnggaran, newTotalKpm);
      return rebalanceAllPackages(updated, pagu.paguStandarPerKpm);
    });
  };

  // Ubah Target Harga Khusus 1 paket Master Item
  const handleUpdatePackageTargetPrice = (packageId: string, rawText: string) => {
    const parsed = parseRupiahInput(rawText);
    setStatusNotice(null);
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const nextPkg: RabPackage = { ...pkg, customTargetHarga: parsed };
        return autoRebalanceOnChange
          ? rebalancePackage(nextPkg, summary.paguInfo.paguStandarPerKpm)
          : nextPkg;
      })
    );
  };

  // Reset target harga 1 paket agar kembali mengikuti Pagu Standar
  const handleResetPackageTargetPrice = (packageId: string) => {
    setStatusNotice(null);
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const nextPkg: RabPackage = { ...pkg, customTargetHarga: null };
        return rebalancePackage(nextPkg, summary.paguInfo.paguStandarPerKpm);
      })
    );
  };

  // Auto-seimbangkan 1 paket
  const handleAutoBalanceSinglePackage = (packageId: string) => {
    setStatusNotice(null);
    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.id === packageId
          ? rebalancePackage(pkg, summary.paguInfo.paguStandarPerKpm)
          : pkg
      )
    );
  };

  // Ubah mode pembagian penyeimbang ganda (khusus paket dengan > 1 penyeimbang seperti KPR)
  const handleChangePackageBalancerMode = (
    packageId: string,
    mode: 'proportional' | 'primary'
  ) => {
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        return rebalancePackage({ ...pkg, balancerMode: mode }, summary.paguInfo.paguStandarPerKpm);
      })
    );
  };

  // Edit field sub-item (nama, volume, harga satuan)
  const handleUpdateSubItem = (
    packageId: string,
    subItemId: string,
    patch: Partial<{ namaBarang: string; volumePerPaket: number; hargaSatuan: number; isBalancer: boolean }>
  ) => {
    setStatusNotice(null);
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const nextSubItems = pkg.subItems.map((sub) =>
          sub.id === subItemId ? { ...sub, ...patch } : sub
        );
        const updatedPkg: RabPackage = { ...pkg, subItems: nextSubItems };

        // Jika pengguna mengubah status Baku <-> Penyeimbang atau mengubah harga item Baku saat auto-rebalance aktif,
        // langsung seimbangkan sub-item Penyeimbang agar tidak repot hitung ulang manual
        const editedSub = nextSubItems.find((s) => s.id === subItemId);
        const shouldRebalance =
          autoRebalanceOnChange &&
          (patch.isBalancer !== undefined ||
            (patch.hargaSatuan !== undefined && editedSub && !editedSub.isBalancer) ||
            (patch.volumePerPaket !== undefined && editedSub && !editedSub.isBalancer));

        return shouldRebalance
          ? rebalancePackage(updatedPkg, summary.paguInfo.paguStandarPerKpm)
          : updatedPkg;
      })
    );
  };

  // Tambah sub-item baru di dalam paket
  const handleAddSubItem = (packageId: string) => {
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const newSub = {
          id: `rab-sub-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          namaBarang: 'Barang Tambahan',
          volumePerPaket: 1,
          satuan: 'Unit',
          hargaDasar: 0,
          hargaSatuan: 0,
          isBalancer: false,
        };
        return { ...pkg, subItems: [...pkg.subItems, newSub] };
      })
    );
  };

  // Hapus sub-item dari paket
  const handleRemoveSubItem = (packageId: string, subItemId: string) => {
    setPackages((prev) =>
      prev.map((pkg) => {
        if (pkg.id !== packageId || pkg.subItems.length <= 1) return pkg;
        const updatedPkg: RabPackage = {
          ...pkg,
          subItems: pkg.subItems.filter((s) => s.id !== subItemId),
        };
        return autoRebalanceOnChange
          ? rebalancePackage(updatedPkg, summary.paguInfo.paguStandarPerKpm)
          : updatedPkg;
      })
    );
  };

  // Optimalkan pembulatan rupiah terhadap Total Anggaran Target
  const handleOptimizeRounding = () => {
    const result = optimizeRabRounding(packages, totalAnggaran);
    setPackages(result.packages);
    setStatusNotice({
      tone: result.remainingDiff === 0 ? 'teal' : 'amber',
      text: result.message,
    });
  };

  // Ekspor PDF RAB siap cetak
  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setStatusNotice(null);
    try {
      const saved = await exportRabToPdf({
        judul: judulRab,
        summary,
      });
      setStatusNotice({
        tone: 'teal',
        text: `PDF RAB berhasil dibuat: ${saved.savedFileName}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat file PDF RAB.';
      setStatusNotice({
        tone: 'rose',
        text: msg,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Filter daftar paket di mode Editor
  const filteredPackages = useMemo(() => {
    return summary.packages.filter((pkg) => {
      if (packageFilter === 'active') return pkg.jumlahPenerima > 0;
      if (packageFilter === 'unbalanced') return !pkg.isBalanced;
      return true;
    });
  }, [summary.packages, packageFilter]);

  const toggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    summary.packages.forEach((pkg) => {
      next[pkg.id] = expand;
    });
    setExpandedPackageIds(next);
  };

  const isExactGrandTotal = summary.selisihTotal === 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Calculator className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900">
                Pembuat RAB
              </h1>
              <p className="truncate text-xs text-slate-500">
                Rencana Anggaran Biaya otomatis &amp; penyeimbang harga sub-item presisi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switcher Editor / Pratinjau Dokumen */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'editor'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Editor RAB</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Pratinjau Dokumen</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExportingPdf ? 'Menyiapkan PDF...' : 'Download PDF RAB'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 pt-5 sm:px-6">
        {/* Notifikasi Status Inline */}
        {statusNotice && (
          <div
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
              statusNotice.tone === 'teal'
                ? 'border-teal-200 bg-teal-50/80 text-teal-900'
                : statusNotice.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2">
              {statusNotice.tone === 'teal' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{statusNotice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="shrink-0 text-[11px] font-semibold underline underline-offset-2 opacity-75 hover:opacity-100"
            >
              Tutup
            </button>
          </div>
        )}

        {/* LANGKAH 1: PENGATURAN PARAMETER UTAMA RAB */}
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                1. Parameter Utama &amp; Kuota Penerima RAB
              </h2>
              <p className="text-xs text-slate-500">
                Pilih sumber kuota dari Proposal MASDETA atau gunakan mode Input Manual / Simulasi
              </p>
            </div>

            {/* Sumber Data Toggle */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
              <button
                type="button"
                onClick={() => handleChangeSourceMode('proposal')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sourceMode === 'proposal'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Ambil dari Proposal MASDETA</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeSourceMode('manual')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sourceMode === 'manual'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Input Manual / Simulasi</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* Baris Input Utama */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {sourceMode === 'proposal' ? (
                <div className="lg:col-span-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Pilih Proposal MASDETA
                  </label>
                  <select
                    value={selectedProposalId}
                    onChange={(e) => handleSelectProposal(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    {sortedProposals.length === 0 && (
                      <option value="">Belum ada proposal tersimpan</option>
                    )}
                    {sortedProposals.map(({ proposal, acceptedCount }) => (
                      <option key={proposal.id} value={proposal.id}>
                        {proposal.tahun} · {proposal.namaProposal} ({acceptedCount} KPM)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="lg:col-span-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Preset Uji Cepat (Simulasi)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {RAB_SIMULATION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.id)}
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Judul RAB / Wilayah (Header PDF)
                </label>
                <input
                  type="text"
                  value={judulRab}
                  onChange={(e) => setJudulRab(e.target.value)}
                  placeholder="Contoh: 2026 KECAMATAN PONTIANAK TENGGARA"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-900 placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="lg:col-span-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Total Anggaran Tersedia (Rp)
                  </label>
                  {summary.totalPenerima > 0 && (
                    <button
                      type="button"
                      onClick={handleSetStandard275Budget}
                      className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                    >
                      Setel × Rp 2.750.000
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={budgetInputText}
                    onChange={(e) => handleBudgetChange(e.target.value)}
                    placeholder="181.500.000"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-right text-sm font-bold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Strip Kalkulasi Pagu Standar Real-Time */}
            <div className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500">Total Penerima (KPM)</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                  {summary.totalPenerima} Orang
                </p>
                <p className="text-[11px] text-slate-500">
                  {summary.activePackagesCount} dari {summary.packages.length} Master Item aktif
                </p>
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500">
                  Pagu Standar per 1 Master Item
                </p>
                <p className="mt-0.5 text-lg font-bold text-teal-800 tabular-nums">
                  {formatRupiahCurrency(summary.paguInfo.paguStandarPerKpm)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {summary.totalPenerima === 0
                    ? 'Isi jumlah penerima per Master Item terlebih dahulu'
                    : summary.paguInfo.exactDivision
                    ? 'Pembagian tepat tanpa sisa rupiah'
                    : `Sisa pembulatan bagi Rp ${formatRupiahPlain(summary.paguInfo.sisaBagiRupiah)} (${summary.totalPenerima} × ${formatRupiahPlain(summary.paguInfo.paguStandarPerKpm)})`}
                </p>
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500">
                  Validasi Total Terhitung RAB
                </p>
                <p
                  className={`mt-0.5 text-lg font-bold tabular-nums ${
                    isExactGrandTotal ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {formatRupiahCurrency(summary.totalTerhitung)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {isExactGrandTotal
                    ? 'Pas 100% dengan Target Total Anggaran'
                    : `Selisih ${summary.selisihTotal > 0 ? '+' : '-'}Rp ${formatRupiahPlain(Math.abs(summary.selisihTotal))} dari target`}
                </p>
              </div>
            </div>

            {/* Grid Cepat Jumlah Penerima per Master Item */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  Kuota Penerima per Master Item (Orang)
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={autoRebalanceOnChange}
                    onChange={(e) => setAutoRebalanceOnChange(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Auto-sesuaikan sub-item Penyeimbang saat pagu / kuota berubah</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                {summary.packages.map((pkg) => {
                  const isActive = pkg.jumlahPenerima > 0;
                  return (
                    <div
                      key={pkg.id}
                      className={`rounded-xl border px-2.5 py-2 transition-colors ${
                        isActive
                          ? 'border-teal-200 bg-teal-50/40'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-bold ${
                            isActive ? 'text-teal-800' : 'text-slate-400'
                          }`}
                        >
                          {pkg.kode}
                        </span>
                        {!pkg.isBalanced && isActive && (
                          <span
                            title={`Selisih ${formatRupiahCurrency(pkg.selisihPerPaket)}`}
                            className="h-2 w-2 rounded-full bg-rose-500"
                          />
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={pkg.jumlahPenerima}
                        onChange={(e) => handleUpdatePackageRecipients(pkg.id, e.target.value)}
                        aria-label={`Jumlah penerima ${pkg.kode}`}
                        className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aksi Cepat Parameter */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
                  <span className="h-2 w-2 rounded-full bg-red-600" />
                  Teks merah = Sub-Item Penyeimbang otomatis
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyStandardPaguAll}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Terapkan Pagu Standar ke Semua Paket</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaultPrices}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Harga Baku Default</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MODE 1: EDITOR PAKET MASTER ITEM & SUB-ITEM PENYEIMBANG */}
        {viewMode === 'editor' ? (
          <section className="space-y-3">
            {/* Toolbar Daftar Paket */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPackageFilter('all')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    packageFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Semua Paket ({summary.packages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPackageFilter('active')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    packageFilter === 'active'
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Aktif ({summary.activePackagesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPackageFilter('unbalanced')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    packageFilter === 'unbalanced'
                      ? 'bg-rose-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Selisih ({summary.packages.filter((p) => !p.isBalanced).length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpandAll(true)}
                  className="text-xs font-semibold text-slate-600 hover:text-teal-700"
                >
                  Buka Semua
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => toggleExpandAll(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-teal-700"
                >
                  Tutup Semua
                </button>
              </div>
            </div>

            {filteredPackages.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Tidak ada paket pada filter ini.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {packageFilter === 'unbalanced'
                    ? 'Seluruh paket Master Item saat ini sudah dalam status PAS / SEIMBANG.'
                    : 'Ubah filter untuk melihat seluruh daftar paket Master Item.'}
                </p>
              </div>
            ) : (
              filteredPackages.map((pkg) => {
                const isExpanded = expandedPackageIds[pkg.id] ?? pkg.jumlahPenerima > 0;
                const balancerCount = pkg.subItems.filter((s) => s.isBalancer).length;
                const isZeroRecipient = pkg.jumlahPenerima === 0;

                return (
                  <article
                    key={pkg.id}
                    className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
                      !pkg.isBalanced && !isZeroRecipient
                        ? 'border-rose-300'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Header Paket */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPackageIds((prev) => ({
                            ...prev,
                            [pkg.id]: !isExpanded,
                          }))
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold tracking-wide ${
                            isZeroRecipient
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-teal-50 text-teal-800'
                          }`}
                        >
                          {pkg.kode}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-bold text-slate-900">
                              {pkg.namaPaket}
                            </h3>
                            <span className="text-xs font-semibold text-slate-500 tabular-nums">
                              · {pkg.jumlahPenerima} Orang
                            </span>
                            {isZeroRecipient && (
                              <span className="text-[11px] font-medium text-slate-400">
                                (Tidak masuk Grand Total)
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                            <span>
                              Harga/Paket:{' '}
                              <strong className="text-slate-800">
                                {formatRupiahCurrency(pkg.subtotalPerPaket)}
                              </strong>
                            </span>
                            <span>
                              Subtotal:{' '}
                              <strong className="text-slate-900">
                                {formatRupiahCurrency(pkg.subtotalHarga, { zeroAsDash: true })}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Kontrol Target Harga & Status Keseimbangan */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Target Harga Paket (Fleksibel per Master Item) */}
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1">
                          <span className="text-[11px] font-medium text-slate-500">Target:</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatRupiahPlain(pkg.targetHargaPaket)}
                            onChange={(e) =>
                              handleUpdatePackageTargetPrice(pkg.id, e.target.value)
                            }
                            aria-label={`Target harga paket ${pkg.kode}`}
                            className="w-24 bg-transparent text-right text-xs font-bold text-slate-900 tabular-nums focus:outline-none"
                          />
                          {pkg.isCustomTarget && (
                            <button
                              type="button"
                              onClick={() => handleResetPackageTargetPrice(pkg.id)}
                              title="Kembalikan ke Pagu Standar"
                              className="rounded p-0.5 text-teal-700 hover:bg-teal-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Indikator Status Paket */}
                        {pkg.isBalanced ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>PAS / SEIMBANG</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 tabular-nums">
                              <AlertTriangle className="h-4 w-4" />
                              <span>
                                SELISIH {pkg.selisihPerPaket > 0 ? '+' : '-'}Rp{' '}
                                {formatRupiahPlain(Math.abs(pkg.selisihPerPaket))}
                              </span>
                            </span>
                            {pkg.hasBalancer && (
                              <button
                                type="button"
                                onClick={() => handleAutoBalanceSinglePackage(pkg.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-rose-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700"
                              >
                                <Wand2 className="h-3 w-3" />
                                <span>Auto-Seimbangkan Sekarang</span>
                              </button>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPackageIds((prev) => ({
                              ...prev,
                              [pkg.id]: !isExpanded,
                            }))
                          }
                          aria-label={isExpanded ? 'Tutup rincian paket' : 'Buka rincian paket'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Rincian Sub-Item Tabel */}
                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                                <th className="px-4 py-2.5">Nama Barang</th>
                                <th className="w-28 px-3 py-2.5 text-center">Vol / Paket</th>
                                <th className="w-40 px-3 py-2.5 text-right">Harga Satuan (Rp)</th>
                                <th className="w-32 px-3 py-2.5 text-center">Status Harga</th>
                                <th className="w-28 px-3 py-2.5 text-center">Jumlah Volume</th>
                                <th className="w-36 px-4 py-2.5 text-right">Jumlah Harga</th>
                                <th className="w-10 px-2 py-2.5" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pkg.subItems.map((sub) => (
                                <tr
                                  key={sub.id}
                                  className={sub.isBalancer ? 'bg-rose-50/30' : 'bg-white'}
                                >
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      value={sub.namaBarang}
                                      onChange={(e) =>
                                        handleUpdateSubItem(pkg.id, sub.id, {
                                          namaBarang: e.target.value,
                                        })
                                      }
                                      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-medium text-slate-900 hover:border-slate-200 focus:border-teal-600 focus:bg-white focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-1">
                                      <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        value={sub.volumePerPaket}
                                        onChange={(e) =>
                                          handleUpdateSubItem(pkg.id, sub.id, {
                                            volumePerPaket: Math.max(
                                              1,
                                              parseInt(e.target.value, 10) || 1
                                            ),
                                          })
                                        }
                                        className="h-8 w-14 rounded-lg border border-slate-200 bg-white px-1.5 text-center font-semibold text-slate-900 tabular-nums focus:border-teal-600 focus:outline-none"
                                      />
                                      <span className="text-[11px] text-slate-500">
                                        {sub.satuan}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={formatRupiahPlain(sub.hargaSatuan)}
                                      onChange={(e) =>
                                        handleUpdateSubItem(pkg.id, sub.id, {
                                          hargaSatuan: parseRupiahInput(e.target.value),
                                        })
                                      }
                                      className={`h-8 w-full rounded-lg border px-2.5 text-right font-bold tabular-nums focus:outline-none ${
                                        sub.isBalancer
                                          ? 'border-red-300 bg-white text-[#DC2626] focus:border-red-500'
                                          : 'border-slate-200 bg-white text-slate-900 focus:border-teal-600'
                                      }`}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateSubItem(pkg.id, sub.id, {
                                          isBalancer: !sub.isBalancer,
                                        })
                                      }
                                      title="Klik untuk beralih antara Harga Baku dan Penyeimbang otomatis"
                                      className={`inline-flex h-7 items-center rounded-lg px-2.5 text-[11px] font-semibold transition-colors ${
                                        sub.isBalancer
                                          ? 'bg-red-100 text-[#DC2626] hover:bg-red-200/80'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                                      }`}
                                    >
                                      {sub.isBalancer ? 'Penyeimbang' : 'Baku'}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-center font-medium text-slate-700 tabular-nums">
                                    {sub.jumlahVolume} {sub.satuan}
                                  </td>
                                  <td
                                    className={`px-4 py-2 text-right font-semibold tabular-nums ${
                                      sub.jumlahHarga === 0 ? 'text-slate-400' : 'text-slate-900'
                                    }`}
                                  >
                                    {formatRupiahCurrency(sub.jumlahHarga, { zeroAsDash: true })}
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    {pkg.subItems.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSubItem(pkg.id, sub.id)}
                                        title="Hapus sub-item"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Footer Paket */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleAddSubItem(pkg.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Tambah Sub-Item</span>
                            </button>

                            {balancerCount > 1 && (
                              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 text-[11px] text-slate-600">
                                <span>Mode Penyeimbang Ganda:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangePackageBalancerMode(pkg.id, 'primary')
                                  }
                                  className={`rounded px-2 py-0.5 font-semibold ${
                                    pkg.balancerMode === 'primary'
                                      ? 'bg-teal-700 text-white'
                                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  Fokus Utama
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangePackageBalancerMode(pkg.id, 'proportional')
                                  }
                                  className={`rounded px-2 py-0.5 font-semibold ${
                                    pkg.balancerMode === 'proportional'
                                      ? 'bg-teal-700 text-white'
                                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  Proporsional
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                            <span className="text-slate-500">
                              Jumlah Penerima:{' '}
                              <input
                                type="number"
                                min={0}
                                max={9999}
                                value={pkg.jumlahPenerima}
                                onChange={(e) =>
                                  handleUpdatePackageRecipients(pkg.id, e.target.value)
                                }
                                className="ml-1 h-7 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-bold text-slate-900 focus:border-teal-600 focus:outline-none"
                              />{' '}
                              Orang
                            </span>
                            <span className="font-bold text-slate-900">
                              Total Paket:{' '}
                              {formatRupiahCurrency(pkg.subtotalHarga, { zeroAsDash: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        ) : (
          /* MODE 2: PRATINJAU DOKUMEN RAB SIAP CETAK (2 BAGIAN PERSIS PDF) */
          <section className="mx-auto max-w-[860px] rounded-2xl border border-slate-300 bg-white p-5 shadow-xs sm:p-8">
            {/* Judul Dokumen */}
            <h2 className="text-center text-base font-extrabold tracking-wide text-slate-900 uppercase">
              {(judulRab || 'RENCANA ANGGARAN BIAYA (RAB)').trim()}
            </h2>

            {/* BAGIAN 1: TABEL REKAPITULASI SELURUH BARANG */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse border border-slate-900 text-xs tabular-nums">
                <thead>
                  <tr className="bg-slate-50 text-slate-900">
                    <th className="border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                      Nama Barang
                    </th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center font-bold">
                      Volume Satuan
                    </th>
                    <th className="border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                      Harga Satuan
                    </th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center font-bold">
                      Jumlah Volume
                    </th>
                    <th className="border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                      Jumlah Harga
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.packages.map((pkg, pkgIdx) => (
                    <FragmentRows key={pkg.id} pkg={pkg} addSpacer={pkgIdx > 0} />
                  ))}
                </tbody>
              </table>

              {/* Box Total & Total Penerima */}
              <table className="mt-3 w-full min-w-[640px] border-collapse border border-slate-900 text-xs tabular-nums">
                <tbody>
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-slate-900 px-2.5 py-1.5 text-center font-bold text-slate-900"
                    >
                      Total
                    </td>
                    <td className="w-40 border border-slate-900 px-2.5 py-1.5 text-right font-bold text-[#DC2626]">
                      {formatRupiahCurrency(summary.totalTerhitung, { withDecimals: true })}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td
                      colSpan={3}
                      className="border border-slate-900 px-2.5 py-1.5 text-center font-bold text-slate-900"
                    >
                      Total Penerima
                    </td>
                    <td className="w-28 border border-slate-900 px-2 py-1.5 text-center font-bold text-slate-900">
                      {summary.totalPenerima} Orang
                    </td>
                    <td className="w-40 border border-slate-900 px-2.5 py-1.5 text-right font-bold text-slate-900">
                      {formatRupiahCurrency(summary.totalAnggaranTarget)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BAGIAN 2: TABEL RINCIAN PER MASTER ITEM */}
            <div className="mt-8 space-y-4">
              <p className="text-xs font-extrabold tracking-wide text-slate-900 uppercase">
                Rincian Anggaran Per Paket Master Item
              </p>

              {summary.packages.map((pkg) => (
                <div key={`preview-pkg-${pkg.id}`} className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse border border-slate-900 text-xs tabular-nums">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900">
                        <th className="border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                          Nama &amp; Jenis Barang
                        </th>
                        <th className="w-24 border border-slate-900 px-2 py-1.5 text-center font-bold">
                          Volume Satuan
                        </th>
                        <th className="w-36 border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                          Harga Satuan
                        </th>
                        <th className="w-24 border border-slate-900 px-2 py-1.5 text-center font-bold">
                          Jumlah Volume
                        </th>
                        <th className="w-36 border border-slate-900 px-2.5 py-1.5 text-center font-bold">
                          Jumlah Harga
                        </th>
                        <th className="w-28 border border-slate-900 px-2 py-1.5 text-center font-bold">
                          Jumlah Penerima
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.subItems.map((sub, subIdx) => (
                        <tr key={sub.id}>
                          <td className="border border-slate-900 px-2.5 py-1 text-slate-900">
                            {sub.namaBarang}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 text-center text-slate-800">
                            {sub.volumePerPaket} {sub.satuan}
                          </td>
                          <td
                            className={`border border-slate-900 px-2.5 py-1 text-right ${
                              sub.isBalancer ? 'font-bold text-[#DC2626]' : 'text-slate-900'
                            }`}
                          >
                            {formatRupiahCurrency(sub.hargaSatuan, { withDecimals: true })}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 text-center text-slate-800">
                            {sub.jumlahVolume} {sub.satuan}
                          </td>
                          <td
                            className={`border border-slate-900 px-2.5 py-1 text-right ${
                              sub.jumlahHarga === 0 ? 'text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {formatRupiahCurrency(sub.jumlahHarga, { zeroAsDash: true })}
                          </td>
                          {subIdx === 0 && (
                            <td
                              rowSpan={pkg.subItems.length}
                              className={`border border-slate-900 px-2 py-1 text-center font-bold ${
                                pkg.jumlahPenerima > 0 ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {pkg.jumlahPenerima} Orang
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td
                          colSpan={4}
                          className="border border-slate-900 px-2.5 py-1.5 text-center text-slate-900"
                        >
                          Total ({pkg.kode} · {pkg.namaPaket})
                        </td>
                        <td className="border border-slate-900 px-2.5 py-1.5 text-right text-slate-900">
                          {formatRupiahCurrency(pkg.subtotalHarga, { zeroAsDash: true })}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Baris Grand Total Highlight Merah Muda Lembut */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse border border-slate-900 text-xs tabular-nums">
                  <tbody>
                    <tr className="bg-[#FECDD3] font-extrabold">
                      <td className="border border-slate-900 px-3 py-2 text-center text-sm text-slate-900">
                        TOTAL
                      </td>
                      <td className="w-64 border border-slate-900 px-3 py-2 text-right text-sm text-[#B91C1C]">
                        {formatRupiahCurrency(summary.totalTerhitung)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Panel Validasi Grand Total & Optimasi Pembulatan (Fixed Bottom Bar) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xs md:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs tabular-nums">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Target Total Anggaran
              </span>
              <span className="text-sm font-bold text-slate-900">
                {formatRupiahCurrency(summary.totalAnggaranTarget)}
              </span>
            </div>

            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Total Terhitung RAB
              </span>
              <span className="text-sm font-bold text-slate-900">
                {formatRupiahCurrency(summary.totalTerhitung)}
              </span>
            </div>

            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Selisih Pembulatan
              </span>
              <span
                className={`text-sm font-extrabold ${
                  isExactGrandTotal ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {isExactGrandTotal
                  ? 'Rp 0 (Pas)'
                  : `${summary.selisihTotal > 0 ? '+ ' : '- '}Rp ${formatRupiahPlain(Math.abs(summary.selisihTotal))}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isExactGrandTotal && summary.totalPenerima > 0 && (
              <button
                type="button"
                onClick={handleOptimizeRounding}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                <span>Optimalkan Pembulatan ke Total Anggaran</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExportingPdf ? 'Membuat PDF...' : 'Download PDF RAB'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper row group untuk Tabel Rekapitulasi Bagian 1 pada Pratinjau Dokumen */
function FragmentRows({
  pkg,
  addSpacer,
}: {
  pkg: ReturnType<typeof calculateRabSummary>['packages'][number];
  addSpacer: boolean;
}) {
  return (
    <>
      {addSpacer && (
        <tr>
          <td colSpan={5} className="h-3 border-y border-slate-900 bg-white p-0" />
        </tr>
      )}
      {pkg.subItems.map((sub) => (
        <tr key={sub.id}>
          <td className="border border-slate-900 px-2.5 py-1 text-slate-900">{sub.namaBarang}</td>
          <td className="border border-slate-900 px-2 py-1 text-center text-slate-800">
            {sub.volumePerPaket} {sub.satuan}
          </td>
          <td
            className={`border border-slate-900 px-2.5 py-1 text-right ${
              sub.isBalancer ? 'font-bold text-[#DC2626]' : 'text-slate-900'
            }`}
          >
            {formatRupiahCurrency(sub.hargaSatuan, { withDecimals: true })}
          </td>
          <td className="border border-slate-900 px-2 py-1 text-center text-slate-800">
            {sub.jumlahVolume} {sub.satuan}
          </td>
          <td
            className={`border border-slate-900 px-2.5 py-1 text-right ${
              sub.jumlahHarga === 0 ? 'text-slate-400' : 'text-slate-900'
            }`}
          >
            {formatRupiahCurrency(sub.jumlahHarga, { zeroAsDash: true })}
          </td>
        </tr>
      ))}
    </>
  );
}
