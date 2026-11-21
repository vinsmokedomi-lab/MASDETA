import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  TroubleshootingReconcileSnapshot,
  WilayahKabKota,
} from '../types/kpm';
import {
  extractBastPdfData,
  extractProposalPdfData,
} from '../services/troubleshootingPdfExtractor';
import {
  ReconciledRowStatus,
  TroubleshootingReconcileResult,
  buildProposalRowsFromDatabase,
  countRecordsNeedingBastAddressEnrichment,
  getTroubleshootingItemBadgeClass,
  reconcileProposalWithBast,
} from '../utils/troubleshootingReconciler';
import { exportTroubleshootingToPdf } from '../utils/pdfExporter';
import { formatUploadDateTime } from '../utils/imageProcessor';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface TroubleshootingViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
  reconcileSnapshots?: Record<string, TroubleshootingReconcileSnapshot>;
  canUpdate?: boolean;
  onApplyReconciliation?: (params: {
    proposalId: string;
    result: TroubleshootingReconcileResult;
    goToProposalDetail: boolean;
  }) => Promise<{
    ok: boolean;
    snapshot?: TroubleshootingReconcileSnapshot;
    error?: string;
  }>;
  onUndoSnapshot?: (
    snapshotOrProposalId: string
  ) => Promise<{ ok: boolean; message?: string; warning?: string }>;
  onOpenProposalDetail?: (proposalId: string) => void;
  onBack: () => void;
}

type ProposalSourceMode = 'pdf' | 'database';

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPdfFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return file.type === 'application/pdf' || lower.endsWith('.pdf');
}

export function TroubleshootingView({
  records,
  proposals,
  items,
  wilayahList,
  proposalSlotMap = {},
  reportTemplate,
  reconcileSnapshots = {},
  canUpdate = true,
  onApplyReconciliation,
  onUndoSnapshot,
  onOpenProposalDetail,
  onBack,
}: TroubleshootingViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const { isOffline } = useOfflineStatus();

  const proposalInputRef = useRef<HTMLInputElement | null>(null);
  const bastInputRef = useRef<HTMLInputElement | null>(null);

  const [proposalMode, setProposalMode] = useState<ProposalSourceMode>('pdf');
  const [proposalPdfFile, setProposalPdfFile] = useState<File | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');
  const [bastPdfFile, setBastPdfFile] = useState<File | null>(null);

  const [dragTarget, setDragTarget] = useState<'proposal' | 'bast' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [result, setResult] = useState<TroubleshootingReconcileResult | null>(null);
  const [analyzedProposalId, setAnalyzedProposalId] = useState<string | null>(null);
  const [summaryPengelolaPdf, setSummaryPengelolaPdf] = useState<{ name: string; count: number }[]>(
    []
  );

  // Filter untuk preview Tabel Utama (Bagian 1)
  const [searchQuery, setSearchQuery] = useState('');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReconciledRowStatus>('all');

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyingMode, setApplyingMode] = useState<'apply_only' | 'apply_and_fill' | null>(null);
  const [applySuccessInfo, setApplySuccessInfo] = useState<{
    proposalId: string;
    proposalName: string;
    message: string;
  } | null>(null);
  const [pendingUndoSnapshot, setPendingUndoSnapshot] =
    useState<TroubleshootingReconcileSnapshot | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  // Daftar proposal database beserta jumlah KPM accepted
  const proposalOptions = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const r of records) {
      if (r.validasi !== 'accepted') continue;
      if (r.proposalId) {
        countMap.set(`id:${r.proposalId}`, (countMap.get(`id:${r.proposalId}`) ?? 0) + 1);
      }
      const keyName = `name:${(r.tahun || '').trim()}::${(r.proposal || '').trim()}`;
      countMap.set(keyName, (countMap.get(keyName) ?? 0) + 1);
    }

    return [...proposals]
      .map((p) => {
        const byId = countMap.get(`id:${p.id}`) ?? 0;
        const byName = countMap.get(`name:${(p.tahun || '').trim()}::${p.namaProposal.trim()}`) ?? 0;
        return {
          proposal: p,
          kpmCount: byId > 0 ? byId : byName,
        };
      })
      .sort((a, b) => {
        const yearDiff = b.proposal.tahun.localeCompare(a.proposal.tahun, 'id');
        if (yearDiff !== 0) return yearDiff;
        return a.proposal.namaProposal.localeCompare(b.proposal.namaProposal, 'id');
      });
  }, [proposals, records]);

  const selectedProposalOption = useMemo(
    () => proposalOptions.find((opt) => opt.proposal.id === selectedProposalId) ?? null,
    [proposalOptions, selectedProposalId]
  );

  const canProcess = useMemo(() => {
    if (processing) return false;
    if (!bastPdfFile) return false;
    if (proposalMode === 'pdf') return Boolean(proposalPdfFile);
    return Boolean(selectedProposalOption && selectedProposalOption.kpmCount > 0);
  }, [processing, bastPdfFile, proposalMode, proposalPdfFile, selectedProposalOption]);

  const handleProposalFileSelected = (file: File | null) => {
    setErrorMessage(null);
    setExportSuccessNotice(null);
    if (!file) return;
    if (!isPdfFile(file)) {
      setErrorMessage('File Daftar KPM Proposal harus berformat PDF (.pdf).');
      return;
    }
    setProposalPdfFile(file);
  };

  const handleBastFileSelected = (file: File | null) => {
    setErrorMessage(null);
    setExportSuccessNotice(null);
    if (!file) return;
    if (!isPdfFile(file)) {
      setErrorMessage('File BAST Dinas harus berformat PDF (.pdf).');
      return;
    }
    setBastPdfFile(file);
  };

  const handleFileInputChange = (
    e: ChangeEvent<HTMLInputElement>,
    kind: 'proposal' | 'bast'
  ) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (kind === 'proposal') {
      handleProposalFileSelected(file);
    } else {
      handleBastFileSelected(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, kind: 'proposal' | 'bast') => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (kind === 'proposal') {
      handleProposalFileSelected(file);
    } else {
      handleBastFileSelected(file);
    }
  };

  const handleProcessReconciliation = async () => {
    if (!bastPdfFile) {
      setErrorMessage('Unggah File PDF BAST Dinas terlebih dahulu.');
      return;
    }
    if (proposalMode === 'pdf' && !proposalPdfFile) {
      setErrorMessage('Unggah File PDF Daftar KPM Proposal terlebih dahulu.');
      return;
    }
    if (proposalMode === 'database' && !selectedProposalOption) {
      setErrorMessage('Pilih proposal dari database MASDETA terlebih dahulu.');
      return;
    }
    if (proposalMode === 'database' && selectedProposalOption && selectedProposalOption.kpmCount === 0) {
      setErrorMessage('Proposal yang dipilih belum memiliki KPM berstatus Diterima.');
      return;
    }

    setProcessing(true);
    setErrorMessage(null);
    setExportSuccessNotice(null);

    try {
      let proposalRows;
      let proposalTitle = '';
      let extractedSummaryPengelola: { name: string; count: number }[] = [];

      if (proposalMode === 'pdf' && proposalPdfFile) {
        setProcessingStep('Membaca & mengekstrak PDF Proposal serta PDF BAST Dinas...');
        const [propRes, bastRes] = await Promise.all([
          extractProposalPdfData(proposalPdfFile),
          extractBastPdfData(bastPdfFile),
        ]);
        proposalRows = propRes.rows;
        proposalTitle = propRes.documentTitle;
        extractedSummaryPengelola = propRes.summaryPengelola;

        setProcessingStep('Menyelaraskan urutan KPM terhadap kuota BAST Dinas...');
        const reconciled = reconcileProposalWithBast({
          proposalRows,
          bastRows: bastRes.rows,
          proposalTitle,
          bastTitle: bastRes.documentTitle,
          proposalSourceType: 'pdf',
          catalog: items,
        });
        setResult(reconciled);
        setAnalyzedProposalId(null);
        setApplySuccessInfo(null);
        setSummaryPengelolaPdf(extractedSummaryPengelola);
      } else if (selectedProposalOption) {
        setProcessingStep('Membaca & mengekstrak PDF BAST Dinas...');
        const bastRes = await extractBastPdfData(bastPdfFile);
        setProcessingStep('Mengambil data KPM proposal MASDETA & menyelaraskan kuota BAST...');
        proposalRows = buildProposalRowsFromDatabase({
          proposal: selectedProposalOption.proposal,
          records,
          allProposals: proposals,
          items,
          wilayahList,
          proposalSlotMap,
        });
        proposalTitle = `${selectedProposalOption.proposal.namaProposal} (${selectedProposalOption.proposal.tahun})`;
        const reconciled = reconcileProposalWithBast({
          proposalRows,
          bastRows: bastRes.rows,
          proposalTitle,
          bastTitle: bastRes.documentTitle,
          proposalSourceType: 'database',
          catalog: items,
        });
        setResult(reconciled);
        setAnalyzedProposalId(selectedProposalOption.proposal.id);
        setApplySuccessInfo(null);
        setSummaryPengelolaPdf([]);
      }

      setSearchQuery('');
      setItemFilter('all');
      setStatusFilter('all');
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Terjadi kesalahan saat mengekstrak dan memproses rekonsiliasi dokumen.';
      setErrorMessage(msg);
    } finally {
      setProcessing(false);
      setProcessingStep('');
    }
  };

  const handleDownloadPdf = async () => {
    if (!result || exportingPdf) return;
    setExportingPdf(true);
    setErrorMessage(null);
    setExportSuccessNotice(null);
    try {
      const res = await exportTroubleshootingToPdf(result, { reportTemplate });
      setExportSuccessNotice(
        res.openedNative
          ? `PDF "${res.savedFileName}" berhasil dibuat dan siap dibuka.`
          : `PDF "${res.savedFileName}" berhasil diunduh (${res.count} slot BAST).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat file PDF hasil rekonsiliasi.';
      setErrorMessage(msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const analyzedProposalRecord = useMemo(() => {
    if (!analyzedProposalId) return null;
    return proposals.find((p) => p.id === analyzedProposalId) ?? null;
  }, [proposals, analyzedProposalId]);

  const addressUpdateCount = useMemo(() => {
    if (!result || result.proposalSourceType !== 'database') return 0;
    return countRecordsNeedingBastAddressEnrichment(result, records);
  }, [result, records]);

  const activeUndoSnapshot = useMemo(() => {
    const targetId = analyzedProposalId || selectedProposalId;
    if (targetId && reconcileSnapshots[targetId]) {
      return reconcileSnapshots[targetId];
    }
    const all = Object.values(reconcileSnapshots);
    if (all.length === 0) return null;
    return [...all].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0] ?? null;
  }, [reconcileSnapshots, analyzedProposalId, selectedProposalId]);

  const isDatabaseResultReady = Boolean(
    result &&
      proposalMode === 'database' &&
      result.proposalSourceType === 'database' &&
      analyzedProposalRecord
  );
  const isSelectedProposalDifferent = Boolean(
    result &&
      proposalMode === 'database' &&
      analyzedProposalId &&
      selectedProposalId &&
      analyzedProposalId !== selectedProposalId
  );
  const isProposalLocked = Boolean(analyzedProposalRecord?.status === 'locked');
  const isMismatchBlocked = Boolean(isDatabaseResultReady && result?.matchMetrics.isMismatch);
  const canExecuteApply = Boolean(
    onApplyReconciliation &&
      isDatabaseResultReady &&
      !isSelectedProposalDifferent &&
      !isProposalLocked &&
      !isMismatchBlocked &&
      !isOffline &&
      canUpdate &&
      !applyingMode
  );

  const handleConfirmApply = async (goToProposalDetail: boolean) => {
    if (!onApplyReconciliation || !result || !analyzedProposalRecord || applyingMode) return;
    setApplyingMode(goToProposalDetail ? 'apply_and_fill' : 'apply_only');
    setErrorMessage(null);
    setApplySuccessInfo(null);
    try {
      const res = await onApplyReconciliation({
        proposalId: analyzedProposalRecord.id,
        result,
        goToProposalDetail,
      });
      if (!res.ok) {
        setErrorMessage(res.error || 'Gagal menerapkan hasil rekonsiliasi ke proposal.');
        return;
      }
      setIsApplyModalOpen(false);
      if (!goToProposalDetail) {
        setApplySuccessInfo({
          proposalId: analyzedProposalRecord.id,
          proposalName: analyzedProposalRecord.namaProposal,
          message: `Berhasil menerapkan hasil rekonsiliasi BAST ke Proposal "${analyzedProposalRecord.namaProposal}". Snapshot tersimpan untuk fitur Undo.`,
        });
      }
    } finally {
      setApplyingMode(null);
    }
  };

  const handleConfirmUndo = async () => {
    if (!onUndoSnapshot || !pendingUndoSnapshot || undoBusy) return;
    setUndoBusy(true);
    setErrorMessage(null);
    try {
      const res = await onUndoSnapshot(pendingUndoSnapshot.id);
      setPendingUndoSnapshot(null);
      if (!res.ok) {
        setErrorMessage(res.message || 'Gagal membatalkan Apply terakhir.');
        return;
      }
      setApplySuccessInfo(null);
      setExportSuccessNotice(
        res.message || `Perubahan Apply terakhir pada "${pendingUndoSnapshot.proposalName}" dibatalkan.`
      );
    } finally {
      setUndoBusy(false);
    }
  };

  const filteredMainRows = useMemo(() => {
    if (!result) return [];
    const q = searchQuery.trim().toLowerCase();
    return result.mainRows.filter((row) => {
      if (itemFilter !== 'all' && row.kodeItem !== itemFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.noUrutText.toLowerCase().includes(q) ||
        row.kodeItem.toLowerCase().includes(q) ||
        row.nama.toLowerCase().includes(q) ||
        row.nik.toLowerCase().includes(q) ||
        row.alamat.toLowerCase().includes(q) ||
        row.pengelola.toLowerCase().includes(q) ||
        row.keterangan.toLowerCase().includes(q)
      );
    });
  }, [result, searchQuery, itemFilter, statusFilter]);

  const itemFilterOptions = useMemo(() => {
    if (!result) return [];
    return result.itemComparisons.map((c) => c.kodeItem);
  }, [result]);

  const statusMeta = (status: ReconciledRowStatus) => {
    switch (status) {
      case 'unchanged':
        return {
          label: 'Tetap',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'shifted':
        return {
          label: 'Bergeser',
          className: 'bg-sky-50 text-sky-700 border-sky-200',
        };
      case 'new_in_proposal':
        return {
          label: 'Usulan Baru',
          className: 'bg-teal-50 text-teal-700 border-teal-200',
        };
      case 'empty_slot':
        return {
          label: 'Baris Kosong',
          className: 'bg-amber-100 text-amber-800 border-amber-300',
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {isNativeApp ? (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-900">Troubleshooting</h1>
          </div>
        </header>
      ) : (
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6 md:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                  Troubleshooting Rekonsiliasi BAST
                </h1>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                Penyelarasan otomatis urutan KPM Proposal terhadap kuota resmi BAST Dinas
              </p>
            </div>
          </div>

          {result && (
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={exportingPdf}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{exportingPdf ? 'Menyusun PDF...' : 'Download PDF Hasil Penyesuaian'}</span>
            </button>
          )}
        </div>
      )}

      <div
        className={`space-y-5 px-4 pt-4 ${
          !isNativeApp ? 'mx-auto max-w-[1440px] md:px-6 md:pt-5' : ''
        }`}
      >
        {isOffline && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="leading-relaxed">
              Mode Offline Read-Only aktif. Analisis &amp; pratinjau PDF digital tetap berjalan
              secara lokal, sedangkan aksi Apply/Undo memerlukan koneksi internet aktif.
            </p>
          </div>
        )}

        {/* BANNER UNDO APPLY TERAKHIR */}
        {activeUndoSnapshot && onUndoSnapshot && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-xs text-amber-950">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-bold text-amber-950">
                  Apply Terakhir Tersimpan: {activeUndoSnapshot.proposalName} ({activeUndoSnapshot.tahun})
                </p>
                <p className="text-[11px] leading-relaxed text-amber-900 tabular-nums">
                  Diterapkan {formatUploadDateTime(activeUndoSnapshot.appliedAt)} oleh{' '}
                  <strong>{activeUndoSnapshot.appliedBy}</strong> ·{' '}
                  {activeUndoSnapshot.summary.shiftedCount} bergeser ·{' '}
                  {activeUndoSnapshot.summary.emptySlotsCount} baris kosong ·{' '}
                  {activeUndoSnapshot.summary.movedToDatabaseCount} ke Database ·{' '}
                  {activeUndoSnapshot.summary.addressUpdatedCount} alamat RT/RW dilengkapi
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onOpenProposalDetail && (
                <button
                  type="button"
                  onClick={() => onOpenProposalDetail(activeUndoSnapshot.proposalId)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/70"
                >
                  <span>Lihat Detail Proposal</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={isOffline || !canUpdate || undoBusy}
                onClick={() => setPendingUndoSnapshot(activeUndoSnapshot)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Batalkan Apply Terakhir</span>
              </button>
            </div>
          </section>
        )}

        {/* PANEL INPUT DOKUMEN: 2 KOTAK UPLOAD BERDAMPINGAN */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Wrench className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Sumber Dokumen Rekonsiliasi
                </h2>
                <p className="text-xs text-slate-500">
                  Unggah pasangan PDF Daftar KPM Proposal dan BAST Dinas untuk menyusun urutan final
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* KOTAK 1: DAFTAR KPM PROPOSAL */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                    Dokumen 1 · Usulan
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Daftar KPM (Proposal)
                  </h3>
                </div>

                {/* Toggle PDF vs Database MASDETA */}
                <div className="inline-flex rounded-xl bg-slate-200/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProposalMode('pdf');
                      setErrorMessage(null);
                    }}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      proposalMode === 'pdf'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-teal-700" />
                    <span>Upload File PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProposalMode('database');
                      setErrorMessage(null);
                    }}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      proposalMode === 'database'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5 text-teal-700" />
                    <span>Database Proposal</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex-1">
                {proposalMode === 'pdf' ? (
                  <>
                    <input
                      ref={proposalInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => handleFileInputChange(e, 'proposal')}
                    />
                    {proposalPdfFile ? (
                      <div className="flex h-full min-h-[126px] flex-col justify-between rounded-xl border border-teal-200 bg-white p-3.5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                            <FileCheck2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {proposalPdfFile.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                              PDF Proposal · {formatFileSize(proposalPdfFile.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProposalPdfFile(null)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Hapus file PDF Proposal"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                          <span className="text-[11px] font-medium text-teal-700">
                            Siap diekstrak
                          </span>
                          <button
                            type="button"
                            onClick={() => proposalInputRef.current?.click()}
                            className="text-xs font-semibold text-teal-700 hover:underline"
                          >
                            Ganti File
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => proposalInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            proposalInputRef.current?.click();
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragTarget('proposal');
                        }}
                        onDragLeave={() => setDragTarget(null)}
                        onDrop={(e) => handleDrop(e, 'proposal')}
                        className={`flex min-h-[126px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
                          dragTarget === 'proposal'
                            ? 'border-teal-600 bg-teal-50/70'
                            : 'border-slate-300 bg-white hover:border-teal-500 hover:bg-teal-50/30'
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                          <Upload className="h-5 w-5" />
                        </div>
                        <p className="mt-2.5 text-xs font-bold text-slate-800">
                          Klik atau seret File PDF Daftar KPM Proposal
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Mendukung format 4 kolom maupun 9 kolom lengkap dengan Pengelola
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[126px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5">
                    <div>
                      <label
                        htmlFor="troubleshooting-db-proposal"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Pilih dari Database Proposal MASDETA
                      </label>
                      <select
                        id="troubleshooting-db-proposal"
                        value={selectedProposalId}
                        onChange={(e) => {
                          setSelectedProposalId(e.target.value);
                          setErrorMessage(null);
                        }}
                        className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                      >
                        <option value="">-- Pilih Proposal ({proposalOptions.length} tersedia) --</option>
                        {proposalOptions.map(({ proposal, kpmCount }) => (
                          <option key={proposal.id} value={proposal.id}>
                            {proposal.tahun} · {proposal.namaProposal} ({kpmCount} KPM)
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedProposalOption ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                        <span className="font-medium text-slate-600">
                          Total KPM berstatus Diterima:
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            selectedProposalOption.kpmCount > 0
                              ? 'text-teal-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {selectedProposalOption.kpmCount} KPM
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500">
                        Mengambil data KPM, kode item, pengelola, dan alamat langsung dari MASDETA.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* KOTAK 2: FILE PDF BAST DINAS */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Dokumen 2 · Acuan Kuota &amp; Identitas
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    File PDF BAST Dinas
                  </h3>
                </div>
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  Format PDF Resmi Dinas
                </span>
              </div>

              <div className="mt-3 flex-1">
                <input
                  ref={bastInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => handleFileInputChange(e, 'bast')}
                />
                {bastPdfFile ? (
                  <div className="flex h-full min-h-[126px] flex-col justify-between rounded-xl border border-teal-200 bg-white p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <FileCheck2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {bastPdfFile.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          PDF BAST Dinas · {formatFileSize(bastPdfFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBastPdfFile(null)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Hapus file PDF BAST Dinas"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <span className="text-[11px] font-medium text-teal-700">
                        Siap diekstrak
                      </span>
                      <button
                        type="button"
                        onClick={() => bastInputRef.current?.click()}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Ganti File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => bastInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        bastInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragTarget('bast');
                    }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={(e) => handleDrop(e, 'bast')}
                    className={`flex min-h-[126px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
                      dragTarget === 'bast'
                        ? 'border-teal-600 bg-teal-50/70'
                        : 'border-slate-300 bg-white hover:border-teal-500 hover:bg-teal-50/30'
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="mt-2.5 text-xs font-bold text-slate-800">
                      Klik atau seret File PDF BAST Dinas
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Menjadi acuan urutan blok item, kuota per item, NIK, dan alamat RT/RW lengkap
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TOMBOL AKSI UTAMA */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500">
              {processing ? (
                <span className="inline-flex items-center gap-2 font-medium text-teal-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{processingStep || 'Memproses dokumen...'}</span>
                </span>
              ) : (
                <span>
                  Item pada Proposal selalu dipertahankan dan dicocokkan ke kuota blok BAST Dinas.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleProcessReconciliation()}
                disabled={!canProcess}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-teal-700 px-5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>
                  {processing ? 'Menganalisis Dokumen...' : 'Proses & Analisis Rekonsiliasi'}
                </span>
              </button>

              {result && (
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={exportingPdf}
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-teal-700 bg-white px-4 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>{exportingPdf ? 'Menyusun PDF...' : 'Download PDF Hasil Penyesuaian'}</span>
                </button>
              )}

              {result && proposalMode === 'database' && result.proposalSourceType === 'database' && (
                <button
                  type="button"
                  disabled={!canExecuteApply}
                  onClick={() => setIsApplyModalOpen(true)}
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {isMismatchBlocked || isProposalLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Apply Hasil ke Proposal</span>
                </button>
              )}
            </div>
          </div>

          {/* KETERANGAN MODE SIMULASI PDF ATAU GUARD VALIDASI ANTI-SALAH FILE */}
          {result && (proposalMode === 'pdf' || result.proposalSourceType === 'pdf') && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                <p className="leading-relaxed">
                  <strong>Mode simulasi PDF aktif.</strong> Pilih Proposal dari database MASDETA
                  untuk menerapkan perubahan secara langsung.
                </p>
                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-[32px] cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 text-[11px] font-semibold text-slate-400"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Apply Hasil ke Proposal</span>
                </button>
              </div>
            </div>
          )}

          {result && proposalMode === 'database' && result.proposalSourceType === 'database' && (
            <div className="mt-3 space-y-2">
              {isSelectedProposalDifferent && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <p className="leading-relaxed">
                    Pilihan Proposal pada kotak Dokumen 1 berubah setelah analisis terakhir. Klik{' '}
                    <strong>Proses &amp; Analisis Rekonsiliasi</strong> ulang agar Apply sesuai dengan
                    Proposal yang dipilih.
                  </p>
                </div>
              )}

              {isProposalLocked && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <p className="leading-relaxed">
                    Proposal <strong>{analyzedProposalRecord?.namaProposal}</strong> berstatus{' '}
                    <strong>Terkunci</strong>. Buka kunci proposal terlebih dahulu bila ingin
                    menerapkan hasil rekonsiliasi.
                  </p>
                </div>
              )}

              {isMismatchBlocked ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3 text-xs text-rose-900">
                  <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-600" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-rose-900">
                      File BAST tidak cocok dengan Proposal yang dipilih! Periksa kembali dokumen
                      BAST Anda.
                    </p>
                    <p className="text-[11px] text-rose-700 tabular-nums">
                      Kecocokan nama Proposal vs BAST hanya{' '}
                      <strong>{result.matchMetrics.proposalMatchPercentage}%</strong> (
                      {result.matchMetrics.matchedBastCount} dari{' '}
                      {result.matchMetrics.totalProposalCount} KPM Proposal cocok di BAST · total{' '}
                      {result.matchMetrics.totalBastCount} baris BAST). Batas minimum wajib 50%
                      untuk mengaktifkan Apply.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-2 text-xs text-teal-900">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
                    <span>
                      Validasi dokumen lolos: kecocokan nama{' '}
                      <strong className="tabular-nums">
                        {result.matchMetrics.proposalMatchPercentage}%
                      </strong>{' '}
                      ({result.matchMetrics.matchedBastCount}/{result.matchMetrics.totalProposalCount}{' '}
                      KPM) · siap diterapkan ke{' '}
                      <strong>{analyzedProposalRecord?.namaProposal}</strong>.
                    </span>
                  </span>
                  {addressUpdateCount > 0 && (
                    <span className="text-[11px] font-semibold text-teal-800 tabular-nums">
                      +{addressUpdateCount} alamat RT/RW akan dilengkapi dari BAST
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {applySuccessInfo && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="leading-relaxed">{applySuccessInfo.message}</p>
              </div>
              {onOpenProposalDetail && (
                <button
                  type="button"
                  onClick={() => onOpenProposalDetail(applySuccessInfo.proposalId)}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-bold text-white transition-colors hover:bg-teal-800"
                >
                  <span>Lihat Detail Proposal</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {exportSuccessNotice && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="leading-relaxed">{exportSuccessNotice}</p>
            </div>
          )}
        </section>

        {/* PRATINJAU HASIL REKONSILIASI (3 BAGIAN TUNGGAL) */}
        {result && (
          <>
            {/* KPI RINGKAS */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Kuota BAST
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {result.totals.kuotaBast}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Total slot unit resmi</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Usulan Proposal
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {result.totals.usulanKpm}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Total KPM diusulkan</p>
              </div>

              <div className="rounded-2xl border border-teal-200 bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  Terisi (Masuk)
                </p>
                <p className="mt-1 text-2xl font-bold text-teal-700 tabular-nums">
                  {result.totals.terisi}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  {result.totals.unchangedCount} tetap · {result.totals.shiftedCount} bergeser
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Baris Kosong
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                  {result.totals.barisKosong}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Sisa kuota belum terisi</p>
              </div>

              <div className="col-span-2 rounded-2xl border border-rose-200 bg-white p-3.5 sm:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                  Dikeluarkan
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-700 tabular-nums">
                  {result.totals.dikeluarkan}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Melebihi limit kuota BAST</p>
              </div>
            </section>

            {/* INFO JIKA KOLOM PENGELOLA TIDAK TERSEDIA DI PDF PROPOSAL */}
            {!result.hasProposalPengelolaData && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                <div className="space-y-1 leading-relaxed">
                  <p>
                    File PDF Proposal <strong>{result.proposalTitle}</strong> tidak memiliki kolom{' '}
                    <strong>Pengelola</strong> per baris penerima, sehingga kolom Pengelola
                    ditampilkan <code>-</code>. Gunakan sumber{' '}
                    <strong>Database Proposal</strong> jika ingin menampilkan Pengelola per KPM.
                  </p>
                  {summaryPengelolaPdf.length > 0 && (
                    <p className="text-[11px] text-sky-800">
                      Ringkasan Pengelola pada bagian bawah PDF Proposal:{' '}
                      {summaryPengelolaPdf.map((s) => `${s.name} (${s.count})`).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* BAGIAN 1: TABEL UTAMA DAFTAR KPM HASIL PENYESUAIAN KUOTA BAST */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Bagian 1 — Tabel Utama Daftar KPM Hasil Penyesuaian Kuota BAST
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    Menampilkan {filteredMainRows.length} dari {result.mainRows.length} slot BAST (No. 01
                    s.d. {String(result.totals.kuotaBast).padStart(2, '0')})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama, NIK, alamat..."
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <select
                    aria-label="Filter Kode Item"
                    value={itemFilter}
                    onChange={(e) => setItemFilter(e.target.value)}
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="all">Semua Item</option>
                    {itemFilterOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter Status Rekonsiliasi"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | ReconciledRowStatus)
                    }
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="all">Semua Status</option>
                    <option value="unchanged">Tetap</option>
                    <option value="shifted">Bergeser</option>
                    <option value="new_in_proposal">Usulan Baru</option>
                    <option value="empty_slot">Baris Kosong</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-teal-700 text-[11px] font-bold uppercase tracking-wider text-white">
                      <th className="w-16 px-3 py-2.5 text-center">No. Urut</th>
                      <th className="w-24 px-3 py-2.5 text-center">Kode Item</th>
                      <th className="w-48 px-3 py-2.5">Nama Penerima (KPM)</th>
                      <th className="w-36 px-3 py-2.5 text-center">NIK</th>
                      <th className="w-64 px-3 py-2.5">Alamat &amp; Kelurahan</th>
                      <th className="w-32 px-3 py-2.5">Pengelola</th>
                      <th className="px-3 py-2.5">Keterangan Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredMainRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                          Tidak ada baris yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredMainRows.map((row) => {
                        const badgeMeta = statusMeta(row.status);
                        return (
                          <tr
                            key={`${row.noUrut}-${row.kodeItem}`}
                            className={
                              row.isEmpty
                                ? 'bg-[#FEFCE8] text-amber-950'
                                : 'bg-white hover:bg-slate-50/70'
                            }
                          >
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums">
                              {row.noUrutText}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getTroubleshootingItemBadgeClass(
                                  row.kodeItem
                                )}`}
                              >
                                {row.kodeItem}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2.5 ${
                                row.isEmpty
                                  ? 'text-center text-slate-400'
                                  : 'font-bold text-slate-900'
                              }`}
                            >
                              {row.isEmpty ? '-' : row.nama}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-center tabular-nums ${
                                row.isEmpty ? 'text-slate-400' : 'text-slate-700'
                              }`}
                            >
                              {row.isEmpty ? '-' : row.nik}
                            </td>
                            <td
                              className={`px-3 py-2.5 leading-relaxed ${
                                row.isEmpty ? 'text-center text-slate-400' : 'text-slate-700'
                              }`}
                            >
                              {row.isEmpty ? '-' : row.alamat}
                            </td>
                            <td
                              className={`px-3 py-2.5 ${
                                row.isEmpty ? 'text-center text-slate-400' : 'font-medium text-slate-700'
                              }`}
                            >
                              {row.isEmpty ? '-' : row.pengelola}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col items-start gap-1">
                                <span
                                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${badgeMeta.className}`}
                                >
                                  {badgeMeta.label}
                                </span>
                                <span
                                  className={`leading-relaxed ${
                                    row.isEmpty
                                      ? 'font-semibold text-amber-900'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {row.keterangan}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* BAGIAN 2: TABEL TERPISAH DAFTAR KPM YANG DIKELUARKAN (OVER LIMIT) */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Bagian 2 — Daftar KPM yang Dikeluarkan (Melebihi Kuota/Limit BAST)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {result.excludedRows.length > 0
                      ? `${result.excludedRows.length} KPM melebihi limit unit BAST dikeluarkan dari tabel utama`
                      : 'Tidak ada KPM berlebih (seluruh usulan masuk dalam batas kuota BAST)'}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                  <thead>
                    <tr
                      className={`border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-white ${
                        result.excludedRows.length > 0 ? 'bg-rose-700' : 'bg-amber-700'
                      }`}
                    >
                      <th className="w-14 px-3 py-2.5 text-center">No.</th>
                      <th className="w-28 px-3 py-2.5 text-center">No. Asal Proposal</th>
                      <th className="w-24 px-3 py-2.5 text-center">Kode Item</th>
                      <th className="w-48 px-3 py-2.5">Nama Penerima (KPM)</th>
                      <th className="w-64 px-3 py-2.5">Alamat &amp; Kelurahan</th>
                      <th className="w-32 px-3 py-2.5">Pengelola</th>
                      <th className="px-3 py-2.5">Keterangan Alasan Pengeluaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {result.excludedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-emerald-50/50 px-4 py-4 text-center text-xs font-semibold text-teal-800"
                        >
                          Tidak ada KPM yang dikeluarkan — seluruh {result.totals.usulanKpm} KPM
                          usulan Proposal masuk dalam batas kuota BAST Dinas.
                        </td>
                      </tr>
                    ) : (
                      result.excludedRows.map((row) => (
                        <tr key={`${row.no}-${row.nama}`} className="bg-rose-50/30">
                          <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums">
                            {row.noText}
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold text-slate-700 tabular-nums">
                            {row.noAsalProposal}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getTroubleshootingItemBadgeClass(
                                row.kodeItem
                              )}`}
                            >
                              {row.kodeItem}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-900">{row.nama}</td>
                          <td className="px-3 py-2.5 leading-relaxed text-slate-700">
                            {row.alamat}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">
                            {row.pengelola}
                          </td>
                          <td className="px-3 py-2.5 font-medium leading-relaxed text-rose-900">
                            {row.keterangan}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* BAGIAN 3: SATU TABEL REKAPITULASI PERBANDINGAN KUOTA ITEM (BAST VS PROPOSAL) */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-teal-700" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Bagian 3 — Rekapitulasi Perbandingan Kuota Item (BAST vs Proposal)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Ringkasan tunggal kecukupan kuota per kode item beserta jumlah terisi, baris
                      kosong, dan over-limit
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-white">
                      <th className="w-24 px-3 py-2.5 text-center">Kode Item</th>
                      <th className="px-3 py-2.5">Rincian Paket Barang BAST</th>
                      <th className="w-28 px-3 py-2.5 text-center">Kuota BAST</th>
                      <th className="w-28 px-3 py-2.5 text-center">Usulan KPM</th>
                      <th className="w-28 px-3 py-2.5 text-center">Terisi (Masuk)</th>
                      <th className="w-28 px-3 py-2.5 text-center">Baris Kosong</th>
                      <th className="w-36 px-3 py-2.5 text-center">Dikeluarkan (Over Limit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {result.itemComparisons.map((item) => (
                      <tr key={item.kodeItem} className="bg-white hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getTroubleshootingItemBadgeClass(
                              item.kodeItem
                            )}`}
                          >
                            {item.kodeItem}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-900">{item.namaItem}:</span>{' '}
                          {item.rincianBarangBast}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums">
                          {item.kuotaBast}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-slate-700 tabular-nums">
                          {item.usulanKpm}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-teal-700 tabular-nums">
                          {item.terisi}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-semibold tabular-nums ${
                            item.barisKosong > 0 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {item.barisKosong}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-semibold tabular-nums ${
                            item.dikeluarkan > 0 ? 'text-rose-700' : 'text-slate-400'
                          }`}
                        >
                          {item.dikeluarkan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900 tabular-nums">
                      <td className="px-3 py-2.5 text-center">TOTAL</td>
                      <td className="px-3 py-2.5">
                        Seluruh Paket Item ({result.itemComparisons.length} Kode)
                      </td>
                      <td className="px-3 py-2.5 text-center">{result.totals.kuotaBast}</td>
                      <td className="px-3 py-2.5 text-center">{result.totals.usulanKpm}</td>
                      <td className="px-3 py-2.5 text-center text-teal-700">
                        {result.totals.terisi}
                      </td>
                      <td className="px-3 py-2.5 text-center text-amber-700">
                        {result.totals.barisKosong}
                      </td>
                      <td className="px-3 py-2.5 text-center text-rose-700">
                        {result.totals.dikeluarkan}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {/* MODAL KONFIRMASI APPLY KE PROPOSAL (2 OPSI EKSEKUSI) */}
      {isApplyModalOpen && result && analyzedProposalRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Apply Rekonsiliasi ke Proposal"
          onClick={() => !applyingMode && setIsApplyModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  Konfirmasi Penerapan Rekonsiliasi
                </p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">
                  Terapkan ke {analyzedProposalRecord.namaProposal}?
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tahun {analyzedProposalRecord.tahun} · Snapshot sebelum perubahan akan disimpan
                  otomatis untuk Undo
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(applyingMode)}
                onClick={() => setIsApplyModalOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">KPM Bergeser Urutan</p>
                <p className="mt-0.5 text-lg font-bold text-sky-700 tabular-nums">
                  {result.totals.shiftedCount} KPM
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Baris Kosong Dibuat</p>
                <p className="mt-0.5 text-lg font-bold text-amber-700 tabular-nums">
                  {result.totals.barisKosong} Slot
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Over Kuota → Database</p>
                <p className="mt-0.5 text-lg font-bold text-rose-700 tabular-nums">
                  {result.totals.dikeluarkan} KPM
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Alamat RT/RW Dilengkapi</p>
                <p className="mt-0.5 text-lg font-bold text-teal-700 tabular-nums">
                  {addressUpdateCount} KPM
                </p>
              </div>
            </div>

            {result.totals.dikeluarkan > 0 && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
                <strong>Catatan Over-Kuota:</strong> {result.totals.dikeluarkan} KPM yang melebihi
                kuota BAST dipindahkan ke <strong>Database KPM</strong> (bukan Arsip Ditolak)
                dengan catatan <em>Eks Proposal {analyzedProposalRecord.namaProposal}</em>.
              </p>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={Boolean(applyingMode)}
                onClick={() => void handleConfirmApply(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {applyingMode === 'apply_and_fill' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                <span>
                  {applyingMode === 'apply_and_fill'
                    ? 'Menerapkan & Membuka Proposal...'
                    : 'Apply & Isi dari Database'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(applyingMode)}
                  onClick={() => setIsApplyModalOpen(false)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={Boolean(applyingMode)}
                  onClick={() => void handleConfirmApply(false)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-700 bg-teal-50 px-4 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-60"
                >
                  {applyingMode === 'apply_only' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{applyingMode === 'apply_only' ? 'Menerapkan...' : 'Apply Saja'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI UNDO APPLY TERAKHIR */}
      {pendingUndoSnapshot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Undo Apply Terakhir"
          onClick={() => !undoBusy && setPendingUndoSnapshot(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">Batalkan Apply Terakhir?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Batalkan perubahan Apply terakhir dan kembalikan susunan Proposal{' '}
                  <strong>{pendingUndoSnapshot.proposalName}</strong> &amp; Database ke kondisi
                  sebelum Apply?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={undoBusy}
                onClick={() => setPendingUndoSnapshot(null)}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={undoBusy}
                onClick={() => void handleConfirmUndo()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {undoBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{undoBusy ? 'Mengembalikan...' : 'Ya, Batalkan Apply'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
