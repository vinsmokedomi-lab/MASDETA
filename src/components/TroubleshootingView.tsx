import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Info,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Unlink,
  Upload,
  UserCheck,
  Users,
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
  BastExtractedRow,
  ProposalExtractedRow,
  ReconciledRowStatus,
  SlotPlacementStrategy,
  TroubleshootingManualOverrides,
  TroubleshootingReconcileResult,
  buildProposalRowsFromDatabase,
  buildWhatsAppReconcileSummary,
  getTroubleshootingItemBadgeClass,
  reconcileProposalWithBast,
} from '../utils/troubleshootingReconciler';

import {
  buildMergedProposalSlots,
  resolveProposalSlotStateForGroup,
} from '../utils/imageProcessor';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface TroubleshootingViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  reportTemplate?: ReportTemplateConfig;
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
  onOpenProposalDetail?: (proposalId: string) => void;
  onBack: () => void;
}

type ProposalSourceMode = 'pdf' | 'database';

interface TroubleshootingRawSourceState {
  proposalRows: ProposalExtractedRow[];
  bastRows: BastExtractedRow[];
  proposalTitle: string;
  bastTitle: string;
  proposalSourceType: 'pdf' | 'database';
}

interface TroubleshootingWorkspaceCache {
  proposalMode: ProposalSourceMode;
  proposalPdfFile: File | null;
  selectedProposalId: string;
  bastPdfFile: File | null;
  rawSource: TroubleshootingRawSourceState | null;
  overrides: TroubleshootingManualOverrides;
  analyzedProposalId: string | null;
  summaryPengelolaPdf: { name: string; count: number }[];
  applySuccessInfo: {
    proposalId: string;
    proposalName: string;
    message: string;
  } | null;
  searchQuery: string;
  itemFilter: string;
  statusFilter: 'all' | ReconciledRowStatus;
  resultSectionTab: 'summary' | 'main_table' | 'all';
  auditPanelOpen: boolean;
  auditTab: 'unmatched_bast' | 'pengelola';
}

const DEFAULT_TROUBLESHOOTING_OVERRIDES: TroubleshootingManualOverrides = {
  excludedRowKeysByItem: {},
  orderedIncludedKeysByItem: {},
  manualBastLinkByRowKey: {},
  placementStrategy: 'proposal_order',
};

const TROUBLESHOOTING_SESSION_KEY = 'masdeta_troubleshooting_workspace_v1';

let moduleTroubleshootingWorkspace: TroubleshootingWorkspaceCache | null = null;

function createInitialTroubleshootingWorkspace(): TroubleshootingWorkspaceCache {
  if (moduleTroubleshootingWorkspace) {
    return moduleTroubleshootingWorkspace;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(TROUBLESHOOTING_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TroubleshootingWorkspaceCache>;
        const hydrated: TroubleshootingWorkspaceCache = {
          proposalMode: parsed.proposalMode === 'database' ? 'database' : 'pdf',
          proposalPdfFile: null,
          selectedProposalId: typeof parsed.selectedProposalId === 'string' ? parsed.selectedProposalId : '',
          bastPdfFile: null,
          rawSource: parsed.rawSource ?? null,
          overrides: parsed.overrides
            ? {
                excludedRowKeysByItem: parsed.overrides.excludedRowKeysByItem || {},
                orderedIncludedKeysByItem: parsed.overrides.orderedIncludedKeysByItem || {},
                manualBastLinkByRowKey: parsed.overrides.manualBastLinkByRowKey || {},
                placementStrategy: parsed.overrides.placementStrategy || 'proposal_order',
              }
            : { ...DEFAULT_TROUBLESHOOTING_OVERRIDES },
          analyzedProposalId:
            typeof parsed.analyzedProposalId === 'string' ? parsed.analyzedProposalId : null,
          summaryPengelolaPdf: Array.isArray(parsed.summaryPengelolaPdf)
            ? parsed.summaryPengelolaPdf
            : [],
          applySuccessInfo: parsed.applySuccessInfo ?? null,
          searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
          itemFilter: typeof parsed.itemFilter === 'string' ? parsed.itemFilter : 'all',
          statusFilter: parsed.statusFilter ?? 'all',
          resultSectionTab:
            parsed.resultSectionTab === 'main_table' || parsed.resultSectionTab === 'all'
              ? parsed.resultSectionTab
              : 'summary',
          auditPanelOpen: Boolean(parsed.auditPanelOpen),
          auditTab: parsed.auditTab === 'pengelola' ? 'pengelola' : 'unmatched_bast',
        };
        moduleTroubleshootingWorkspace = hydrated;
        return hydrated;
      }
    }
  } catch {
    // Abaikan jika sessionStorage tidak tersedia atau korup
  }
  const fresh: TroubleshootingWorkspaceCache = {
    proposalMode: 'pdf',
    proposalPdfFile: null,
    selectedProposalId: '',
    bastPdfFile: null,
    rawSource: null,
    overrides: { ...DEFAULT_TROUBLESHOOTING_OVERRIDES },
    analyzedProposalId: null,
    summaryPengelolaPdf: [],
    applySuccessInfo: null,
    searchQuery: '',
    itemFilter: 'all',
    statusFilter: 'all',
    resultSectionTab: 'summary',
    auditPanelOpen: false,
    auditTab: 'unmatched_bast',
  };
  moduleTroubleshootingWorkspace = fresh;
  return fresh;
}

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
  canUpdate = true,
  onApplyReconciliation,
  onOpenProposalDetail,
  onBack,
}: TroubleshootingViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const { isOffline } = useOfflineStatus();

  const proposalInputRef = useRef<HTMLInputElement | null>(null);
  const bastInputRef = useRef<HTMLInputElement | null>(null);

  const initialCacheRef = useRef<TroubleshootingWorkspaceCache | null>(null);
  if (!initialCacheRef.current) {
    initialCacheRef.current = createInitialTroubleshootingWorkspace();
  }
  const initialCache = initialCacheRef.current;

  const [proposalMode, setProposalMode] = useState<ProposalSourceMode>(initialCache.proposalMode);
  const [proposalPdfFile, setProposalPdfFile] = useState<File | null>(initialCache.proposalPdfFile);
  const [selectedProposalId, setSelectedProposalId] = useState<string>(
    initialCache.selectedProposalId
  );
  const [bastPdfFile, setBastPdfFile] = useState<File | null>(initialCache.bastPdfFile);

  const [dragTarget, setDragTarget] = useState<'proposal' | 'bast' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [rawSource, setRawSource] = useState<TroubleshootingRawSourceState | null>(
    initialCache.rawSource
  );
  const [overrides, setOverrides] = useState<TroubleshootingManualOverrides>(
    initialCache.overrides
  );
  const [analyzedProposalId, setAnalyzedProposalId] = useState<string | null>(
    initialCache.analyzedProposalId
  );
  const [summaryPengelolaPdf, setSummaryPengelolaPdf] = useState<{ name: string; count: number }[]>(
    initialCache.summaryPengelolaPdf
  );

  // Filter & Tab tampilan hasil rekonsiliasi
  const [searchQuery, setSearchQuery] = useState(initialCache.searchQuery);
  const [itemFilter, setItemFilter] = useState<string>(initialCache.itemFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | ReconciledRowStatus>(
    initialCache.statusFilter
  );
  const [onlySequenceWarnings, setOnlySequenceWarnings] = useState(false);
  const [highlightedSequenceNo, setHighlightedSequenceNo] = useState<number | null>(null);
  const [resultSectionTab, setResultSectionTab] = useState<'summary' | 'main_table' | 'all'>(
    initialCache.resultSectionTab
  );

  // Modal pemilihan KPM over-kuota yang dikeluarkan
  const [overQuotaModalItem, setOverQuotaModalItem] = useState<string | null>(null);
  const [overQuotaSearch, setOverQuotaSearch] = useState('');

  // Panel Audit & Dampak Pengelola
  const [auditPanelOpen, setAuditPanelOpen] = useState(initialCache.auditPanelOpen);
  const [auditTab, setAuditTab] = useState<'unmatched_bast' | 'pengelola'>(initialCache.auditTab);
  const [copiedWaSummary, setCopiedWaSummary] = useState(false);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyingMode, setApplyingMode] = useState<'apply_only' | 'apply_and_fill' | null>(null);
  const [applySuccessInfo, setApplySuccessInfo] = useState<{
    proposalId: string;
    proposalName: string;
    message: string;
  } | null>(initialCache.applySuccessInfo);

  useEffect(() => {
    const nextCache: TroubleshootingWorkspaceCache = {
      proposalMode,
      proposalPdfFile,
      selectedProposalId,
      bastPdfFile,
      rawSource,
      overrides,
      analyzedProposalId,
      summaryPengelolaPdf,
      applySuccessInfo,
      searchQuery,
      itemFilter,
      statusFilter,
      resultSectionTab,
      auditPanelOpen,
      auditTab,
    };
    moduleTroubleshootingWorkspace = nextCache;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const serializable = {
          proposalMode,
          selectedProposalId,
          rawSource,
          overrides,
          analyzedProposalId,
          summaryPengelolaPdf,
          applySuccessInfo,
          searchQuery,
          itemFilter,
          statusFilter,
          resultSectionTab,
          auditPanelOpen,
          auditTab,
        };
        window.sessionStorage.setItem(TROUBLESHOOTING_SESSION_KEY, JSON.stringify(serializable));
      }
    } catch {
      // Abaikan error kuota storage
    }
  }, [
    proposalMode,
    proposalPdfFile,
    selectedProposalId,
    bastPdfFile,
    rawSource,
    overrides,
    analyzedProposalId,
    summaryPengelolaPdf,
    applySuccessInfo,
    searchQuery,
    itemFilter,
    statusFilter,
    resultSectionTab,
    auditPanelOpen,
    auditTab,
  ]);

  const hasWorkspaceData = Boolean(
    rawSource ||
      proposalPdfFile ||
      bastPdfFile ||
      selectedProposalId ||
      applySuccessInfo
  );

  const handleResetWorkspace = () => {
    setProposalMode('pdf');
    setProposalPdfFile(null);
    setSelectedProposalId('');
    setBastPdfFile(null);
    setRawSource(null);
    setOverrides({ ...DEFAULT_TROUBLESHOOTING_OVERRIDES });
    setAnalyzedProposalId(null);
    setSummaryPengelolaPdf([]);
    setApplySuccessInfo(null);
    setSearchQuery('');
    setItemFilter('all');
    setStatusFilter('all');
    setOnlySequenceWarnings(false);
    setHighlightedSequenceNo(null);
    setResultSectionTab('summary');
    setAuditPanelOpen(false);
    setAuditTab('unmatched_bast');
    setErrorMessage(null);
    setExportSuccessNotice(null);
    moduleTroubleshootingWorkspace = null;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(TROUBLESHOOTING_SESSION_KEY);
      }
    } catch {
      // Abaikan
    }
  };

  const result: TroubleshootingReconcileResult | null = useMemo(() => {
    if (!rawSource) return null;
    return reconcileProposalWithBast({
      proposalRows: rawSource.proposalRows,
      bastRows: rawSource.bastRows,
      proposalTitle: rawSource.proposalTitle,
      bastTitle: rawSource.bastTitle,
      proposalSourceType: rawSource.proposalSourceType,
      catalog: items,
      overrides,
    });
  }, [rawSource, items, overrides]);

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
        setOverrides({
          excludedRowKeysByItem: {},
          orderedIncludedKeysByItem: {},
          manualBastLinkByRowKey: {},
          placementStrategy: 'proposal_order',
        });
        setRawSource({
          proposalRows,
          bastRows: bastRes.rows,
          proposalTitle,
          bastTitle: bastRes.documentTitle,
          proposalSourceType: 'pdf',
        });
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
        setOverrides({
          excludedRowKeysByItem: {},
          orderedIncludedKeysByItem: {},
          manualBastLinkByRowKey: {},
          placementStrategy: 'proposal_order',
        });
        setRawSource({
          proposalRows,
          bastRows: bastRes.rows,
          proposalTitle,
          bastTitle: bastRes.documentTitle,
          proposalSourceType: 'database',
        });
        setAnalyzedProposalId(selectedProposalOption.proposal.id);
        setApplySuccessInfo(null);
        setSummaryPengelolaPdf([]);
      }

      setSearchQuery('');
      setItemFilter('all');
      setStatusFilter('all');
      setOnlySequenceWarnings(false);
      setHighlightedSequenceNo(null);
      setOverQuotaModalItem(null);
      setOverQuotaSearch('');
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

  // === HANDLER PILIH KPM OVER-KUOTA ===
  const handleToggleExcludedCandidate = (
    kodeItem: string,
    rowKey: string,
    excessCount: number,
    currentExcludedKeys: string[]
  ) => {
    setOverrides((prev) => {
      const existing = [...currentExcludedKeys];
      let nextKeys: string[];

      if (excessCount <= 1) {
        // Radio behavior: 1 klik langsung mengganti KPM yang dikeluarkan
        nextKeys = [rowKey];
      } else if (existing.includes(rowKey)) {
        nextKeys = existing.filter((k) => k !== rowKey);
      } else if (existing.length < excessCount) {
        nextKeys = [...existing, rowKey];
      } else {
        // Ganti pilihan paling lama jika sudah mencapai batas excessCount
        nextKeys = [...existing.slice(1), rowKey];
      }

      const nextCustomOrder = { ...(prev.orderedIncludedKeysByItem || {}) };
      delete nextCustomOrder[kodeItem];

      return {
        ...prev,
        excludedRowKeysByItem: {
          ...(prev.excludedRowKeysByItem || {}),
          [kodeItem]: nextKeys,
        },
        orderedIncludedKeysByItem: nextCustomOrder,
      };
    });
  };

  const handleAutoExcludeNotInBast = (kodeItem: string) => {
    const group = result?.overQuotaGroups.find((g) => g.kodeItem === kodeItem);
    if (!group) return;
    const notInBast = group.candidates.filter((c) => c.matchedBastNo === null);
    const inBast = group.candidates.filter((c) => c.matchedBastNo !== null);
    // Ambil dari urutan terbawah yg tidak ada di BAST dulu, sisanya dari urutan terbawah yg ada di BAST
    const prioritized = [...notInBast.reverse(), ...inBast.reverse()];
    const picked = prioritized.slice(0, group.excessCount).map((c) => c.rowKey);

    setOverrides((prev) => {
      const nextCustomOrder = { ...(prev.orderedIncludedKeysByItem || {}) };
      delete nextCustomOrder[kodeItem];
      return {
        ...prev,
        excludedRowKeysByItem: {
          ...(prev.excludedRowKeysByItem || {}),
          [kodeItem]: picked,
        },
        orderedIncludedKeysByItem: nextCustomOrder,
      };
    });
  };

  const handleResetExcludedForItem = (kodeItem: string) => {
    setOverrides((prev) => {
      const nextMap = { ...(prev.excludedRowKeysByItem || {}) };
      delete nextMap[kodeItem];
      const nextCustomOrder = { ...(prev.orderedIncludedKeysByItem || {}) };
      delete nextCustomOrder[kodeItem];
      return {
        ...prev,
        excludedRowKeysByItem: nextMap,
        orderedIncludedKeysByItem: nextCustomOrder,
      };
    });
  };

  // === HANDLER TUKAR URUTAN ↑ / ↓ DALAM BLOK ITEM YANG SAMA ===
  const handleMoveRowInItemBlock = (kodeItem: string, rowKey: string, direction: 'up' | 'down') => {
    if (!result) return;
    const filledKeysInItem = result.mainRows
      .filter((r) => r.kodeItem === kodeItem && !r.isEmpty && r.rowKey)
      .map((r) => r.rowKey as string);
    const currentIdx = filledKeysInItem.indexOf(rowKey);
    if (currentIdx < 0) return;
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= filledKeysInItem.length) return;

    const swapped = [...filledKeysInItem];
    const tmp = swapped[currentIdx];
    swapped[currentIdx] = swapped[targetIdx];
    swapped[targetIdx] = tmp;

    setOverrides((prev) => ({
      ...prev,
      orderedIncludedKeysByItem: {
        ...(prev.orderedIncludedKeysByItem || {}),
        [kodeItem]: swapped,
      },
    }));
  };

  const handleResetCustomOrder = () => {
    setOverrides((prev) => ({
      ...prev,
      orderedIncludedKeysByItem: {},
    }));
  };

  const handleChangePlacementStrategy = (strategy: SlotPlacementStrategy) => {
    setOverrides((prev) => ({
      ...prev,
      placementStrategy: strategy,
      orderedIncludedKeysByItem: {},
    }));
  };

  // === HANDLER LINK MANUAL BAST <-> PROPOSAL (ATASI TYPO / BEDA EJAAN NAMA) ===
  const handleLinkBastManually = (proposalRowKey: string, bastNo: number) => {
    if (!proposalRowKey) return;
    setOverrides((prev) => {
      const nextLinks = { ...(prev.manualBastLinkByRowKey || {}) };
      // Pastikan bastNo tidak terpasang ganda
      Object.keys(nextLinks).forEach((k) => {
        if (nextLinks[k] === bastNo) delete nextLinks[k];
      });
      nextLinks[proposalRowKey] = bastNo;
      return {
        ...prev,
        manualBastLinkByRowKey: nextLinks,
      };
    });
  };

  const handleUnlinkBastManually = (proposalRowKey: string) => {
    setOverrides((prev) => {
      const nextLinks = { ...(prev.manualBastLinkByRowKey || {}) };
      delete nextLinks[proposalRowKey];
      return {
        ...prev,
        manualBastLinkByRowKey: nextLinks,
      };
    });
  };

  // === HANDLER SALIN RINGKASAN WHATSAPP ===
  const handleCopyWhatsAppSummary = async () => {
    if (!result) return;
    const text = buildWhatsAppReconcileSummary(result);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedWaSummary(true);
      setExportSuccessNotice('Ringkasan rekonsiliasi siap kirim WhatsApp berhasil disalin ke clipboard.');
      setTimeout(() => setCopiedWaSummary(false), 2500);
    } catch {
      setErrorMessage('Gagal menyalin ringkasan ke clipboard.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!result || exportingPdf) return;
    setExportingPdf(true);
    setErrorMessage(null);
    setExportSuccessNotice(null);
    try {
      const { exportTroubleshootingToPdf } = await import('../utils/pdfExporter');
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

  // Bandingkan kondisi aktual Proposal di MASDETA saat ini vs hasil rekonsiliasi BAST
  // agar proposal yang sudah 100% sinkron tidak memunculkan Apply palsu & tidak menimpa snapshot Undo.
  const proposalApplyDiff = useMemo(() => {
    if (!isDatabaseResultReady || !result || !analyzedProposalRecord) {
      return {
        actualShiftedCount: 0,
        actualEmptySlotsChanged: false,
        actualMovedToDatabaseCount: 0,
        currentEmptySlotsCount: 0,
        targetEmptySlotsCount: 0,
        hasActualChanges: false,
      };
    }

    const propRecords = records.filter(
      (r) =>
        r.validasi === 'accepted' &&
        (r.proposalId
          ? r.proposalId === analyzedProposalRecord.id
          : r.proposal === analyzedProposalRecord.namaProposal &&
            r.tahun === analyzedProposalRecord.tahun)
    );

    const { state: currentSlotState } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      analyzedProposalRecord.id,
      analyzedProposalRecord.namaProposal,
      analyzedProposalRecord.tahun,
      proposals
    );

    const currentMerged = buildMergedProposalSlots({
      groupRecords: propRecords,
      slotState: currentSlotState,
      proposals,
      catalog: items,
      wilayahList,
    });

    const currentSlotByKpmId = new Map<string, number>();
    const currentEmptySig: string[] = [];
    for (const entry of currentMerged) {
      if (entry.kind === 'kpm') {
        currentSlotByKpmId.set(entry.record.id, entry.slotNumber);
      } else {
        const code = (entry.emptySlot.item || '').trim().toUpperCase();
        currentEmptySig.push(`${entry.slotNumber}:${code}`);
      }
    }
    currentEmptySig.sort();

    let actualShiftedCount = 0;
    const targetEmptySig: string[] = [];
    for (const row of result.mainRows) {
      if (row.isEmpty) {
        targetEmptySig.push(`${row.noUrut}:${(row.kodeItem || '').trim().toUpperCase()}`);
      } else if (row.sourceKpmId) {
        const currentSlot = currentSlotByKpmId.get(row.sourceKpmId);
        if (currentSlot !== row.noUrut) {
          actualShiftedCount += 1;
        }
      }
    }
    targetEmptySig.sort();

    const actualEmptySlotsChanged =
      currentEmptySig.length !== targetEmptySig.length ||
      currentEmptySig.some((sig, idx) => sig !== targetEmptySig[idx]);
    const actualMovedToDatabaseCount = result.excludedRows.length;
    const hasActualChanges =
      actualShiftedCount > 0 || actualEmptySlotsChanged || actualMovedToDatabaseCount > 0;

    return {
      actualShiftedCount,
      actualEmptySlotsChanged,
      actualMovedToDatabaseCount,
      currentEmptySlotsCount: currentEmptySig.length,
      targetEmptySlotsCount: targetEmptySig.length,
      hasActualChanges,
    };
  }, [
    isDatabaseResultReady,
    result,
    analyzedProposalRecord,
    records,
    proposalSlotMap,
    proposals,
    items,
    wilayahList,
  ]);

  const isAlreadySyncedWithProposal = Boolean(
    isDatabaseResultReady &&
      !isSelectedProposalDifferent &&
      !isMismatchBlocked &&
      !proposalApplyDiff.hasActualChanges
  );

  const canExecuteApply = Boolean(
    onApplyReconciliation &&
      isDatabaseResultReady &&
      !isSelectedProposalDifferent &&
      !isProposalLocked &&
      !isMismatchBlocked &&
      !isAlreadySyncedWithProposal &&
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

  const handleJumpToSequenceRow = (bastNo: number) => {
    setResultSectionTab('main_table');
    setItemFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setOnlySequenceWarnings(false);
    setHighlightedSequenceNo(bastNo);
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`troubleshooting-main-row-${bastNo}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  };

  const sequenceWarningRowCount = useMemo(() => {
    if (!result) return 0;
    return result.mainRows.filter((r) => r.hasSequenceWarning).length;
  }, [result]);

  const filteredMainRows = useMemo(() => {
    if (!result) return [];
    const q = searchQuery.trim().toLowerCase();
    return result.mainRows.filter((row) => {
      if (onlySequenceWarnings && !row.hasSequenceWarning) return false;
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
  }, [result, searchQuery, itemFilter, statusFilter, onlySequenceWarnings]);

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
          {hasWorkspaceData && (
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Cek Baru</span>
            </button>
          )}
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
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Troubleshooting Rekonsiliasi BAST
              </h1>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                Penyelarasan otomatis urutan KPM Proposal terhadap kuota resmi BAST Dinas
              </p>
            </div>
          </div>

          {hasWorkspaceData && (
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-teal-200 bg-teal-50 px-3.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Cek Proposal / BAST Baru</span>
            </button>
          )}
        </div>
      )}

      <div
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'mx-auto max-w-[1440px] md:px-6 md:pt-5' : ''
        }`}
      >
        {isOffline && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="leading-relaxed">
              Mode Offline Read-Only aktif. Analisis &amp; pratinjau PDF digital tetap berjalan
              secara lokal, sedangkan aksi Apply memerlukan koneksi internet aktif.
            </p>
          </div>
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
                  Pilih sumber Proposal (PDF atau Database) dan file PDF BAST Dinas
                </p>
              </div>
            </div>

            {hasWorkspaceData && (
              <button
                type="button"
                onClick={handleResetWorkspace}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Bersihkan Dokumen</span>
              </button>
            )}
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
                    Dokumen 2 · Acuan Kuota &amp; Urutan Blok
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
                      Hanya menjadi acuan urutan blok item dan kuota per item (detail KPM tetap
                      mengikuti data Proposal)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TOMBOL AKSI UTAMA (TERSTRUKTUR) */}
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleProcessReconciliation()}
                disabled={!canProcess}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>
                  {processing
                    ? processingStep || 'Menganalisis...'
                    : result
                      ? 'Analisis Ulang'
                      : 'Proses & Analisis Rekonsiliasi'}
                </span>
              </button>

              {result && (
                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Cek Proposal / BAST Baru</span>
                </button>
              )}
            </div>

            {result && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyWhatsAppSummary()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {copiedWaSummary ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-slate-500" />
                  )}
                  <span>{copiedWaSummary ? 'Tersalin!' : 'Salin Ringkasan WA'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={exportingPdf}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-teal-700 bg-white px-3.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>{exportingPdf ? 'Menyusun PDF...' : 'Download PDF Hasil'}</span>
                </button>

                {proposalMode === 'database' && result.proposalSourceType === 'database' && (
                  <button
                    type="button"
                    disabled={!canExecuteApply}
                    onClick={() => setIsApplyModalOpen(true)}
                    className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                      isAlreadySyncedWithProposal
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500'
                    }`}
                  >
                    {isAlreadySyncedWithProposal ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : isMismatchBlocked || isProposalLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>
                      {isAlreadySyncedWithProposal
                        ? 'Sudah Sinkron'
                        : 'Apply ke Proposal'}
                    </span>
                  </button>
                )}
              </div>
            )}
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
              ) : isAlreadySyncedWithProposal ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-emerald-900">
                      Proposal {analyzedProposalRecord?.namaProposal} sudah 100% sinkron dengan BAST
                      ini — tidak ada perubahan baru untuk diterapkan.
                    </p>
                    <p className="text-[11px] leading-relaxed text-emerald-800">
                      Urutan nomor KPM, posisi baris kosong ({proposalApplyDiff.currentEmptySlotsCount}{' '}
                      slot), dan kuota item di database MASDETA sudah sama persis dengan hasil
                      rekonsiliasi. Tombol Apply dinonaktifkan otomatis agar snapshot Undo sebelumnya
                      tetap aman
                      {result.totals.shiftedCount > 0
                        ? ` (catatan: angka "${result.totals.shiftedCount} bergeser" di bawah adalah perbandingan terhadap nomor BAST PDF awal, bukan perubahan baru ke Proposal)`
                        : ''}
                      .
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
                      KPM) · perubahan ke <strong>{analyzedProposalRecord?.namaProposal}</strong>:{' '}
                      <strong className="tabular-nums">
                        {proposalApplyDiff.actualShiftedCount} berubah posisi
                      </strong>
                      {proposalApplyDiff.actualEmptySlotsChanged
                        ? ` · ${proposalApplyDiff.targetEmptySlotsCount} baris kosong`
                        : ''}
                      {proposalApplyDiff.actualMovedToDatabaseCount > 0
                        ? ` · ${proposalApplyDiff.actualMovedToDatabaseCount} ke Database`
                        : ''}
                      .
                    </span>
                  </span>
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
            {/* PERINGATAN KEKELIRUAN NOMOR URUT / BLOK ITEM DI BAST DINAS */}
            {result.sequenceAnomalies.length > 0 && (
              <section className="overflow-hidden rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-4 shadow-xs">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-rose-950">
                        Peringatan: Terdeteksi Kekeliruan Nomor Urut pada BAST Dinas (
                        {result.sequenceAnomalies.length} Temuan)
                      </h2>
                      <span className="rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-bold text-rose-700">
                        Wajib Cek Sebelum Cetak / Apply
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-rose-900">
                      Dokumen BAST dari Dinas mengandung item yang terpisah/terselip di luar blok
                      urutannya atau penomoran yang tidak berurutan. Periksa bagian berikut sebelum
                      mencetak kupon/BAST atau menekan Apply:
                    </p>

                    <div className="mt-3 space-y-2">
                      {result.sequenceAnomalies.map((anom) => {
                        const targetNo = anom.affectedBastNos[0];
                        const isCritical = anom.severity === 'critical';
                        return (
                          <div
                            key={anom.id}
                            className={`flex flex-col gap-2.5 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between ${
                              isCritical ? 'border-rose-300' : 'border-amber-300'
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {anom.kodeItem !== 'UMUM' && (
                                  <span
                                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getTroubleshootingItemBadgeClass(
                                      anom.kodeItem
                                    )}`}
                                  >
                                    {anom.kodeItem}
                                  </span>
                                )}
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    isCritical
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {anom.type === 'duplicate_bast_no'
                                    ? 'Nomor Ganda'
                                    : anom.type === 'missing_bast_no'
                                      ? 'Nomor Terlewat'
                                      : isCritical
                                        ? 'Item Terselip / Terpisah'
                                        : 'Blok Terpecah'}
                                </span>
                                <span className="text-xs font-bold text-slate-900">
                                  {anom.title}
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed text-slate-700">
                                {anom.message}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {typeof targetNo === 'number' && (
                                <button
                                  type="button"
                                  onClick={() => handleJumpToSequenceRow(targetNo)}
                                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-rose-700 px-3 text-[11px] font-bold text-white transition-colors hover:bg-rose-800"
                                >
                                  <span>
                                    Lihat No. {String(targetNo).padStart(2, '0')} di Tabel
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {anom.kodeItem !== 'UMUM' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResultSectionTab('main_table');
                                    setItemFilter(anom.kodeItem);
                                    setStatusFilter('all');
                                    setOnlySequenceWarnings(false);
                                    setSearchQuery('');
                                  }}
                                  className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  Filter {anom.kodeItem}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* KPI RINGKAS (Klik untuk langsung buka bagian terkait) */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <button
                type="button"
                onClick={() => setResultSectionTab('summary')}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-teal-300 hover:bg-slate-50/60"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Kuota BAST
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {result.totals.kuotaBast}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Lihat rincian paket</p>
              </button>

              <button
                type="button"
                onClick={() => setResultSectionTab('summary')}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-teal-300 hover:bg-slate-50/60"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Usulan Proposal
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {result.totals.usulanKpm}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Total KPM diusulkan</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setResultSectionTab('main_table');
                }}
                className="rounded-2xl border border-teal-200 bg-white p-3.5 text-left transition-colors hover:bg-teal-50/50"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  Terisi (Masuk)
                </p>
                <p className="mt-1 text-2xl font-bold text-teal-700 tabular-nums">
                  {result.totals.terisi}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  {result.totals.unchangedCount} tetap · {result.totals.shiftedCount} bergeser
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('empty_slot');
                  setResultSectionTab('main_table');
                }}
                className="rounded-2xl border border-amber-200 bg-white p-3.5 text-left transition-colors hover:bg-amber-50/50"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Baris Kosong
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                  {result.totals.barisKosong}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Sisa kuota belum terisi</p>
              </button>

              <button
                type="button"
                onClick={() => setResultSectionTab('summary')}
                className="col-span-2 rounded-2xl border border-rose-200 bg-white p-3.5 text-left transition-colors hover:bg-rose-50/50 sm:col-span-1"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                  Dikeluarkan
                </p>
                <p className="mt-1 text-2xl font-bold text-rose-700 tabular-nums">
                  {result.totals.dikeluarkan}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Lihat KPM dikeluarkan</p>
              </button>
            </section>

            {/* NAVIGASI TAMPILAN HASIL (TIDAK PERLU SCROLL JAUH) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setResultSectionTab('summary')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    resultSectionTab === 'summary'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ringkasan Paket &amp; Dikeluarkan
                  {result.totals.dikeluarkan > 0 ? ` (${result.totals.dikeluarkan})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setResultSectionTab('main_table')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    resultSectionTab === 'main_table'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tabel Utama ({result.mainRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResultSectionTab('all')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    resultSectionTab === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tampilkan Semua
                </button>
              </div>
              <span className="text-[11px] text-slate-500">
                {resultSectionTab === 'summary'
                  ? 'Menampilkan Rekap Paket Barang BAST & Daftar KPM Dikeluarkan secara langsung'
                  : resultSectionTab === 'main_table'
                    ? 'Menampilkan susunan Tabel Utama BAST lengkap'
                    : 'Menampilkan Ringkasan Paket, KPM Dikeluarkan, dan Tabel Utama'}
              </span>
            </div>

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

            {/* PANEL AUDIT: NAMA BAST TANPA PASANGAN & DAMPAK PENGELOLA */}
            {(result.unmatchedBastRows.length > 0 ||
              result.hasProposalPengelolaData ||
              Object.keys(overrides.manualBastLinkByRowKey || {}).length > 0) && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setAuditPanelOpen((v) => !v)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold text-slate-900">
                        Ringkasan Nama BAST &amp; Dampak per Pengelola
                      </h2>
                      <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                        {result.unmatchedBastRows.length} nama di BAST belum terpasang
                        {result.hasProposalPengelolaData
                          ? ` · ${result.pengelolaImpacts.length} pengelola`
                          : ''}
                        {Object.keys(overrides.manualBastLinkByRowKey || {}).length > 0
                          ? ` · ${Object.keys(overrides.manualBastLinkByRowKey || {}).length} link manual aktif`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.unmatchedBastRows.length > 0 && (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 tabular-nums">
                        {result.unmatchedBastRows.length} BAST Tanpa Pasangan
                      </span>
                    )}
                    {auditPanelOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {auditPanelOpen && (
                  <div className="border-t border-slate-200">
                    {/* Tabs Audit */}
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setAuditTab('unmatched_bast')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          auditTab === 'unmatched_bast'
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900'
                        }`}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        <span>Nama BAST Tanpa Pasangan ({result.unmatchedBastRows.length})</span>
                      </button>

                      {result.hasProposalPengelolaData && (
                        <button
                          type="button"
                          onClick={() => setAuditTab('pengelola')}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            auditTab === 'pengelola'
                              ? 'bg-teal-700 text-white'
                              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900'
                          }`}
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>Dampak per Pengelola ({result.pengelolaImpacts.length})</span>
                        </button>
                      )}
                    </div>

                    {/* Tab 1: Nama BAST Tanpa Pasangan + Link Manual untuk Typo Urutan */}
                    {auditTab === 'unmatched_bast' && (
                      <div className="p-4">
                        <p className="mb-3 text-xs text-slate-600">
                          Daftar nama yang tercetak di <strong>BAST Dinas</strong> namun tidak ditemukan
                          pasangannya di Proposal. Jika sebenarnya orang yang sama namun beda ejaan
                          (typo), gunakan tombol <strong>Cocokkan</strong> untuk menyamakan status
                          urutan (<em>Tetap/Bergeser</em>) tanpa mengubah detail data KPM Proposal.
                        </p>
                        {result.unmatchedBastRows.length === 0 ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs font-semibold text-teal-800">
                            Seluruh nama pada dokumen BAST Dinas sudah terpasang dengan data KPM Proposal.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                                  <th className="w-20 px-3 py-2 text-center">No. BAST</th>
                                  <th className="w-20 px-3 py-2 text-center">Item</th>
                                  <th className="px-3 py-2">Nama di BAST</th>
                                  <th className="w-72 px-3 py-2">Cocokkan Urutan ke KPM Proposal (Typo)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {(() => {
                                  const unmatchedProposalMain = result.mainRows.filter(
                                    (r) => !r.isEmpty && r.status === 'new_in_proposal' && r.rowKey
                                  );
                                  return result.unmatchedBastRows.map((u) => (
                                    <tr key={`unmatched-bast-${u.bastNo}`} className="bg-white">
                                      <td className="px-3 py-2 text-center font-bold text-slate-900 tabular-nums">
                                        {u.bastNoText}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span
                                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getTroubleshootingItemBadgeClass(
                                            u.kodeItem
                                          )}`}
                                        >
                                          {u.kodeItem}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-bold text-slate-900">{u.nama}</td>
                                      <td className="px-3 py-2">
                                        {u.suggestedProposalRowKey ? (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-2 py-1.5">
                                              <div className="min-w-0">
                                                <p className="truncate text-[11px] font-bold text-teal-900">
                                                  Mirip {u.suggestedSimilarityScore}%: {u.suggestedProposalName}
                                                </p>
                                                <p className="text-[10px] text-teal-700">
                                                  Item Proposal: {u.suggestedProposalItem}
                                                </p>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleLinkBastManually(
                                                    u.suggestedProposalRowKey!,
                                                    u.bastNo
                                                  )
                                                }
                                                className="shrink-0 rounded-md bg-teal-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-teal-800"
                                              >
                                                Cocokkan
                                              </button>
                                            </div>
                                          </div>
                                        ) : unmatchedProposalMain.length > 0 ? (
                                          <select
                                            defaultValue=""
                                            onChange={(e) => {
                                              if (e.target.value) {
                                                handleLinkBastManually(e.target.value, u.bastNo);
                                                e.target.value = '';
                                              }
                                            }}
                                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:border-teal-700 focus:outline-none"
                                          >
                                            <option value="">-- Pilih KPM Usulan Baru... --</option>
                                            {unmatchedProposalMain.map((m) => (
                                              <option key={m.rowKey} value={m.rowKey}>
                                                {m.nama} ({m.kodeItem} · No. {m.noUrutText})
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-[11px] text-slate-400">
                                            Tidak ada KPM usulan baru tersisa
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Rekap Dampak per Pengelola */}
                    {auditTab === 'pengelola' && result.hasProposalPengelolaData && (
                      <div className="p-4">
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full min-w-[520px] border-collapse text-left text-xs tabular-nums">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-100 text-[11px] font-bold uppercase text-slate-600">
                                <th className="px-3 py-2">Nama Pengelola</th>
                                <th className="w-28 px-3 py-2 text-center">Usulan</th>
                                <th className="w-28 px-3 py-2 text-center">Masuk BAST</th>
                                <th className="w-32 px-3 py-2 text-center">Dikeluarkan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {result.pengelolaImpacts.map((p) => (
                                <tr
                                  key={`pengelola-impact-${p.pengelola}`}
                                  className={p.dikeluarkan > 0 ? 'bg-rose-50/40' : 'bg-white'}
                                >
                                  <td className="px-3 py-2 font-semibold text-slate-900">
                                    {p.pengelola}
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-700">{p.usulan}</td>
                                  <td className="px-3 py-2 text-center font-bold text-teal-700">
                                    {p.masuk}
                                  </td>
                                  <td
                                    className={`px-3 py-2 text-center font-bold ${
                                      p.dikeluarkan > 0 ? 'text-rose-700' : 'text-slate-400'
                                    }`}
                                  >
                                    {p.dikeluarkan}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* BAGIAN 3 & BAGIAN 2: DITAMPILKAN TERATAS PADA TAB RINGKASAN & SEMUA */}
            {(resultSectionTab === 'summary' || resultSectionTab === 'all') && (
              <>
                {/* BAGIAN 3: SATU TABEL REKAPITULASI PERBANDINGAN KUOTA ITEM (BAST VS PROPOSAL) */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4.5 w-4.5 text-teal-700" />
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          Rincian Paket &amp; Perbandingan Kuota Item (BAST vs Proposal)
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Ringkasan kecukupan kuota per kode item beserta rincian paket barang BAST
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
                          <tr
                            key={item.kodeItem}
                            className={
                              item.hasSequenceAnomaly
                                ? 'bg-rose-50/45 hover:bg-rose-50/75'
                                : 'bg-white hover:bg-slate-50/70'
                            }
                          >
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
                              <p>
                                <span className="font-semibold text-slate-900">
                                  {item.namaItem}:
                                </span>{' '}
                                {item.rincianBarangBast}
                              </p>
                              {item.blockRangesText && (
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {item.hasSequenceAnomaly ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResultSectionTab('main_table');
                                        setItemFilter(item.kodeItem);
                                        setStatusFilter('all');
                                        setOnlySequenceWarnings(false);
                                      }}
                                      className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-100/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 tabular-nums hover:bg-rose-200/80"
                                    >
                                      <AlertTriangle className="h-3 w-3 shrink-0" />
                                      <span>Urutan BAST Terpisah: {item.blockRangesText}</span>
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-medium text-slate-500 tabular-nums">
                                      Urutan BAST: {item.blockRangesText}
                                    </span>
                                  )}
                                </div>
                              )}
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

                {/* BAGIAN 2: TABEL TERPISAH DAFTAR KPM YANG DIKELUARKAN (OVER LIMIT) + PILIH SIAPA YANG DIKELUARKAN */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Daftar KPM yang Dikeluarkan (Melebihi Kuota/Limit BAST)
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {result.excludedRows.length > 0
                          ? `${result.excludedRows.length} KPM melebihi limit unit BAST dikeluarkan — Anda dapat memilih sendiri siapa KPM yang ingin dikeluarkan`
                          : 'Tidak ada KPM berlebih (seluruh usulan masuk dalam batas kuota BAST)'}
                      </p>
                    </div>

                    {result.overQuotaGroups.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {result.overQuotaGroups.map((grp) => (
                          <button
                            key={`pick-over-${grp.kodeItem}`}
                            type="button"
                            onClick={() => {
                              setOverQuotaModalItem(grp.kodeItem);
                              setOverQuotaSearch('');
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-bold text-rose-800 transition-colors hover:bg-rose-100"
                          >
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            <span>
                              Pilih {grp.kodeItem} ({grp.excessCount}/{grp.usulanKpm})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border-collapse text-left text-xs">
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
                          <th className="w-60 px-3 py-2.5">Alamat &amp; Kelurahan</th>
                          <th className="w-32 px-3 py-2.5">Pengelola</th>
                          <th className="px-3 py-2.5">Keterangan Alasan Pengeluaran</th>
                          {result.excludedRows.length > 0 && (
                            <th className="w-32 px-3 py-2.5 text-center">Aksi</th>
                          )}
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
                            <tr key={`${row.no}-${row.rowKey || row.nama}`} className="bg-rose-50/30">
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
                              <td className="px-3 py-2.5">
                                <p className="font-bold text-slate-900">{row.nama}</p>
                                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                  {row.matchedBastNo
                                    ? `Ada di BAST awal (No. ${String(row.matchedBastNo).padStart(2, '0')})`
                                    : 'Tidak ada di BAST awal'}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 leading-relaxed text-slate-700">
                                {row.alamat}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-700">
                                {row.pengelola}
                              </td>
                              <td className="px-3 py-2.5 font-medium leading-relaxed text-rose-900">
                                {row.isManuallySelected && (
                                  <span className="mb-1 inline-flex items-center rounded border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                    Pilihan Manual Admin
                                  </span>
                                )}
                                <p>{row.keterangan}</p>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOverQuotaModalItem(row.kodeItem);
                                    setOverQuotaSearch('');
                                  }}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-600 hover:text-white"
                                >
                                  <ArrowUpDown className="h-3 w-3" />
                                  <span>Ganti KPM</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* BAGIAN 1: TABEL UTAMA DAFTAR KPM HASIL PENYESUAIAN KUOTA BAST */}
            {(resultSectionTab === 'main_table' || resultSectionTab === 'all') && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3.5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Tabel Utama Daftar KPM Hasil Penyesuaian Kuota BAST
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        Menampilkan {filteredMainRows.length} dari {result.mainRows.length} slot
                        BAST (No. 01 s.d. {String(result.totals.kuotaBast).padStart(2, '0')})
                      </p>
                    </div>

                    {/* Strategi Penempatan Slot */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
                        <button
                          type="button"
                          onClick={() => handleChangePlacementStrategy('proposal_order')}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                            result.placementStrategy === 'proposal_order'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Urutan Proposal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangePlacementStrategy('preserve_bast_number')}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                            result.placementStrategy === 'preserve_bast_number'
                              ? 'bg-white text-teal-800 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="KPM yang nomor BAST awalnya masih dalam blok itemnya akan dipertahankan di nomor yang sama untuk meminimalkan pergeseran"
                        >
                          Minimalkan Pergeseran (No. BAST)
                        </button>
                      </div>

                      {Object.keys(overrides.orderedIncludedKeysByItem || {}).length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetCustomOrder}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset Urutan</span>
                        </button>
                      )}
                    </div>
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

                    {sequenceWarningRowCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setOnlySequenceWarnings((v) => !v)}
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors tabular-nums ${
                          onlySequenceWarnings
                            ? 'border-rose-600 bg-rose-600 text-white'
                            : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Keliru Urutan ({sequenceWarningRowCount})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-teal-700 text-[11px] font-bold uppercase tracking-wider text-white">
                        <th className="w-16 px-3 py-2.5 text-center">No. Urut</th>
                        <th className="w-24 px-3 py-2.5 text-center">Kode Item</th>
                        <th className="w-48 px-3 py-2.5">Nama Penerima (KPM)</th>
                        <th className="w-36 px-3 py-2.5 text-center">NIK</th>
                        <th className="w-60 px-3 py-2.5">Alamat &amp; Kelurahan</th>
                        <th className="w-32 px-3 py-2.5">Pengelola</th>
                        <th className="px-3 py-2.5">Keterangan Perubahan</th>
                        <th className="w-20 px-2 py-2.5 text-center">Urutan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredMainRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">
                            Tidak ada baris yang cocok dengan filter pencarian.
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const filledIndexByItem = new Map<string, string[]>();
                          result.mainRows.forEach((r) => {
                            if (!r.isEmpty && r.rowKey) {
                              const arr = filledIndexByItem.get(r.kodeItem) || [];
                              arr.push(r.rowKey);
                              filledIndexByItem.set(r.kodeItem, arr);
                            }
                          });

                          return filteredMainRows.map((row, rowIdx) => {
                            const badgeMeta = statusMeta(row.status);
                            const itemKeys = filledIndexByItem.get(row.kodeItem) || [];
                            const idxInItem = row.rowKey ? itemKeys.indexOf(row.rowKey) : -1;
                            const canMoveUp = !row.isEmpty && idxInItem > 0;
                            const canMoveDown =
                              !row.isEmpty && idxInItem >= 0 && idxInItem < itemKeys.length - 1;
                            const isSeqHighlighted =
                              Boolean(row.hasSequenceWarning) ||
                              highlightedSequenceNo === row.noUrut;

                            return (
                              <tr
                                id={`troubleshooting-main-row-${row.noUrut}`}
                                key={`${row.noUrut}-${row.kodeItem}-${rowIdx}`}
                                className={
                                  row.hasSequenceWarning
                                    ? 'border-l-4 border-l-rose-600 bg-rose-50/75 text-slate-900'
                                    : highlightedSequenceNo === row.noUrut
                                      ? 'border-l-4 border-l-amber-500 bg-amber-50/80'
                                      : row.isEmpty
                                        ? 'bg-[#FEFCE8] text-amber-950'
                                        : 'bg-white hover:bg-slate-50/70'
                                }
                              >
                                <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums">
                                  <div className="inline-flex flex-col items-center">
                                    <span>{row.noUrutText}</span>
                                    {isSeqHighlighted && row.hasSequenceWarning && (
                                      <span className="mt-0.5 text-[9px] font-bold uppercase text-rose-700">
                                        Cek No.
                                      </span>
                                    )}
                                  </div>
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
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span
                                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${badgeMeta.className}`}
                                      >
                                        {badgeMeta.label}
                                      </span>
                                      {row.hasSequenceWarning && (
                                        <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          <span>Keliru Urutan BAST</span>
                                        </span>
                                      )}
                                      {row.isManuallyLinked && row.rowKey && (
                                        <button
                                          type="button"
                                          onClick={() => handleUnlinkBastManually(row.rowKey!)}
                                          className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 hover:bg-rose-50 hover:text-rose-700"
                                          title="Lepaskan pencocokan manual BAST"
                                        >
                                          <Unlink className="h-2.5 w-2.5" />
                                          <span>Lepas Link</span>
                                        </button>
                                      )}
                                    </div>
                                    <span
                                      className={`leading-relaxed ${
                                        row.hasSequenceWarning
                                          ? 'font-medium text-rose-950'
                                          : row.isEmpty
                                            ? 'font-semibold text-amber-900'
                                            : 'text-slate-700'
                                      }`}
                                    >
                                      {row.keterangan}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 text-center">
                                  {!row.isEmpty && row.rowKey ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={!canMoveUp}
                                        onClick={() =>
                                          handleMoveRowInItemBlock(row.kodeItem, row.rowKey!, 'up')
                                        }
                                        title={`Geser ke atas dalam blok ${row.kodeItem}`}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canMoveDown}
                                        onClick={() =>
                                          handleMoveRowInItemBlock(row.kodeItem, row.rowKey!, 'down')
                                        }
                                        title={`Geser ke bawah dalam blok ${row.kodeItem}`}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
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

            <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Berubah Posisi di Proposal</p>
                <p className="mt-0.5 text-lg font-bold text-sky-700 tabular-nums">
                  {proposalApplyDiff.actualShiftedCount} KPM
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Baris Kosong</p>
                <p className="mt-0.5 text-lg font-bold text-amber-700 tabular-nums">
                  {proposalApplyDiff.targetEmptySlotsCount} Slot
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] text-slate-500">Over Kuota → Database</p>
                <p className="mt-0.5 text-lg font-bold text-rose-700 tabular-nums">
                  {proposalApplyDiff.actualMovedToDatabaseCount} KPM
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
              <p>
                Detail KPM (nama, NIK, alamat, RT/RW, kelurahan, pengelola) tetap menggunakan data
                inputan <strong>Proposal MASDETA</strong> dan tidak diubah mengikuti BAST.
              </p>
            </div>

            {result.sequenceAnomalies.length > 0 && (
              <div className="space-y-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-[11px] leading-relaxed text-rose-900">
                <p className="flex items-center gap-1.5 font-bold text-rose-950">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  <span>
                    Perhatian: BAST Dinas memiliki {result.sequenceAnomalies.length} kekeliruan nomor
                    urut!
                  </span>
                </p>
                <p>
                  {result.sequenceAnomalies[0].message} Jika tetap Apply, posisi slot di Proposal akan
                  mengikuti urutan BAST tersebut.
                </p>
              </div>
            )}

            {result.totals.dikeluarkan > 0 && (
              <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] leading-relaxed text-sky-900">
                <p>
                  <strong>Catatan Over-Kuota:</strong> {result.totals.dikeluarkan} KPM berikut akan
                  dipindahkan ke <strong>Database KPM</strong> (bukan Arsip Ditolak) dengan catatan{' '}
                  <em>Eks Proposal {analyzedProposalRecord.namaProposal}</em>:
                </p>
                <ul className="list-disc space-y-0.5 pl-4 font-semibold text-sky-950">
                  {result.excludedRows.map((ex) => (
                    <li key={`apply-ex-${ex.rowKey || ex.no}`}>
                      {ex.nama} ({ex.kodeItem}
                      {ex.pengelola && ex.pengelola !== '-' ? ` · ${ex.pengelola}` : ''})
                    </li>
                  ))}
                </ul>
              </div>
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

      {/* MODAL PILIH KPM OVER-KUOTA YANG DIKELUARKAN */}
      {overQuotaModalItem && result && (() => {
        const activeGroup =
          result.overQuotaGroups.find((g) => g.kodeItem === overQuotaModalItem) ||
          result.overQuotaGroups[0];
        if (!activeGroup) return null;

        const currentExcludedKeys = activeGroup.candidates
          .filter((c) => c.isExcluded)
          .map((c) => c.rowKey);

        const q = overQuotaSearch.trim().toLowerCase();
        const visibleCandidates = activeGroup.candidates.filter((c) => {
          if (!q) return true;
          return (
            c.nama.toLowerCase().includes(q) ||
            c.pengelola.toLowerCase().includes(q) ||
            c.noAsalProposal.toLowerCase().includes(q) ||
            c.alamat.toLowerCase().includes(q)
          );
        });

        // Hitung distribusi pengelola khusus pada item ini agar admin mudah menjaga keadilan kuota
        const pengelolaStatsMap = new Map<string, { total: number; excluded: number }>();
        activeGroup.candidates.forEach((c) => {
          const pName = c.pengelola && c.pengelola !== '-' ? c.pengelola : 'Tanpa Pengelola';
          const prev = pengelolaStatsMap.get(pName) || { total: 0, excluded: 0 };
          prev.total += 1;
          if (c.isExcluded) prev.excluded += 1;
          pengelolaStatsMap.set(pName, prev);
        });
        const itemPengelolaStats = Array.from(pengelolaStatsMap.entries()).sort(
          (a, b) => b[1].total - a[1].total
        );

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pilih KPM Over-Kuota yang Dikeluarkan"
            onClick={() => setOverQuotaModalItem(null)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            >
              {/* Header Modal */}
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                      Penentuan KPM Over-Kuota BAST
                    </p>
                    <h2 className="mt-0.5 text-base font-bold text-slate-900">
                      Pilih KPM yang Dikeluarkan — {activeGroup.kodeItem} ({activeGroup.namaItem})
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      Usulan Proposal: <strong>{activeGroup.usulanKpm} KPM</strong> · Kuota BAST:{' '}
                      <strong>{activeGroup.kuotaBast} Unit</strong> · Wajib dikeluarkan:{' '}
                      <strong className="text-rose-700">{activeGroup.excessCount} KPM</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverQuotaModalItem(null)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Tutup"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tab pindah antar item over-kuota jika > 1 item */}
                {result.overQuotaGroups.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.overQuotaGroups.map((grp) => (
                      <button
                        key={`tab-over-${grp.kodeItem}`}
                        type="button"
                        onClick={() => {
                          setOverQuotaModalItem(grp.kodeItem);
                          setOverQuotaSearch('');
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                          grp.kodeItem === activeGroup.kodeItem
                            ? 'bg-rose-700 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {grp.kodeItem} · Keluarkan {grp.excessCount} dari {grp.usulanKpm}
                      </button>
                    ))}
                  </div>
                )}

                {/* Toolbar Pencarian & Bantuan Pilihan Cepat */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={overQuotaSearch}
                      onChange={(e) => setOverQuotaSearch(e.target.value)}
                      placeholder="Cari nama KPM atau pengelola..."
                      className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAutoExcludeNotInBast(activeGroup.kodeItem)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-[11px] font-bold text-teal-800 hover:bg-teal-100"
                    title="Otomatis memilih KPM yang tidak tercatat di BAST awal untuk dikeluarkan terlebih dahulu"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Prioritaskan yg Tidak di BAST</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetExcludedForItem(activeGroup.kodeItem)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Default</span>
                  </button>
                </div>

                {/* Ringkasan Pengelola pada item ini */}
                {result.hasProposalPengelolaData && itemPengelolaStats.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-slate-500">
                      Sebaran Pengelola ({activeGroup.kodeItem}):
                    </span>
                    {itemPengelolaStats.map(([pName, stat]) => (
                      <span
                        key={pName}
                        className={`rounded-md border px-2 py-0.5 font-semibold tabular-nums ${
                          stat.excluded > 0
                            ? 'border-rose-200 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {pName}: {stat.total}
                        {stat.excluded > 0 ? ` (-${stat.excluded})` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Daftar Kandidat KPM */}
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-2.5 text-[11px] text-slate-500">
                  {activeGroup.excessCount === 1
                    ? 'Klik satu nama KPM di bawah untuk menjadikannya KPM yang dikeluarkan. KPM lainnya otomatis masuk ke Tabel Utama.'
                    : `Pilih tepat ${activeGroup.excessCount} nama KPM untuk dikeluarkan (${currentExcludedKeys.length}/${activeGroup.excessCount} terpilih).`}
                </p>

                <div className="space-y-2">
                  {visibleCandidates.map((cand) => (
                    <button
                      key={cand.rowKey}
                      type="button"
                      onClick={() =>
                        handleToggleExcludedCandidate(
                          activeGroup.kodeItem,
                          cand.rowKey,
                          activeGroup.excessCount,
                          currentExcludedKeys
                        )
                      }
                      className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                        cand.isExcluded
                          ? 'border-rose-400 bg-rose-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                            cand.isExcluded
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 tabular-nums">
                              No. {cand.noAsalProposal}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{cand.nama}</span>
                            {cand.pengelola && cand.pengelola !== '-' && (
                              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                {cand.pengelola}
                              </span>
                            )}
                            {cand.matchedBastNo ? (
                              <span className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 tabular-nums">
                                Ada di BAST No. {String(cand.matchedBastNo).padStart(2, '0')}
                                {cand.matchedBastItemCode &&
                                cand.matchedBastItemCode !== activeGroup.kodeItem
                                  ? ` (${cand.matchedBastItemCode})`
                                  : ''}
                              </span>
                            ) : (
                              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Tidak ada di BAST
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-[11px] text-slate-600">{cand.alamat}</p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          cand.isExcluded
                            ? 'bg-rose-700 text-white'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {cand.isExcluded ? 'Dikeluarkan' : 'Masuk Utama'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer Modal */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <p className="text-xs text-slate-600">
                  Perubahan langsung diterapkan ke Tabel Utama, PDF, dan Apply Proposal.
                </p>
                <button
                  type="button"
                  onClick={() => setOverQuotaModalItem(null)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Selesai &amp; Terapkan</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
