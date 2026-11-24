import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Images,
  Loader2,
  Lock,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  StickyNote,
  Tag,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  DEFAULT_PEJABAT_LIST,
  DEFAULT_SCHEDULE_BOOKS,
  DEFAULT_SPTJM_TEMPLATE,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmRecord,
  PejabatProfile,
  ProposalBastMap,
  ProposalChangeKind,
  ProposalChangeLogEntry,
  ProposalChecklist,
  ProposalDocuments,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  ScheduleBook,
  ScheduleEventItem,
  SptjmTemplateConfig,
  TroubleshootingReconcileSnapshot,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  computeSubItemRecap,
  doesKpmMatchProposalDomicile,
  formatNikDisplay,
  formatUploadDateTime,
  getAbsenSeq,
  getDocumentDownloadHref,
  getItemHierarchyRank,
  getKpmSubItemStatusList,
  removeDocumentFromDrive,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalAreaScope,
  resolveProposalSlotStateForGroup,
  uploadProposalDocumentToDrive,
} from '../utils/imageProcessor';
import {
  AbsenDinasVariant,
  DEFAULT_PDF_COLUMN_KEYS,
  formatAbsenDinasLocationText,
  formatAbsensiScheduleFields,
  formatBastProposalLocation,
  formatIndonesianDateWords,
  formatScheduleDateTimeForCoupon,
  normalizePejabatNipNumber,
  resolveEffectiveBastConfig,
  resolveScheduleForProposal,
  resolveScheduleForProposalInBook,
  shouldAutoIncludeKelurahanColumn,
} from '../utils/pdfFormatHelpers';
import { DriveImage } from './DriveImage';
import { isNativeAppPlatform, useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface ProposalDetailViewProps {
  proposal: ProposalRecord;
  allProposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  schedules?: ScheduleEventItem[];
  scheduleBooks?: ScheduleBook[];
  reportTemplate?: ReportTemplateConfig;
  bastTemplate?: BastTemplateConfig;
  sptjmTemplate?: SptjmTemplateConfig;
  pejabatList?: PejabatProfile[];
  proposalBastMap?: ProposalBastMap;
  onSaveProposalBastConfig?: (
    proposalId: string,
    config: Partial<BastTemplateConfig> | null
  ) => void;
  historyEntries: ProposalKpmHistoryEntry[];
  canAdd?: boolean;
  canUpdate?: boolean;
  onBack: () => void;
  onEditProposal: (proposalId: string) => void;
  onAddKpmInProposal: (proposalName: string, tahun: string) => void;
  onViewKpmInProposal: (proposalName: string, tahun: string) => void;
  onOpenPhotoGallery?: (proposalId: string) => void;
  onSelectKpm?: (record: KpmRecord) => void;
  onAcceptAllKpm?: (proposalName: string, tahun: string) => void;
  onTransferKpm?: (kpmIds: string[], targetProposalId: string) => Promise<boolean> | boolean;
  onOpenFullHistory: () => void;
  onPreviewDocument?: (file: KpmDocumentFile, title: string) => void;
  onUpdateProposalDocuments?: (
    proposalId: string,
    documents: ProposalDocuments,
    checklist: ProposalChecklist
  ) => Promise<void> | void;
  onCreateForEmptySlot?: (
    proposalId: string,
    proposalName: string,
    tahun: string,
    slotNumber: number,
    item?: string
  ) => void;
  onFillEmptySlotFromDatabase?: (
    kpmId: string,
    proposalName: string,
    tahun: string,
    slotNumber: number,
    slotItem?: string
  ) => void;
  activeReconcileSnapshot?: TroubleshootingReconcileSnapshot | null;
  onUndoReconcileSnapshot?: (
    snapshotOrProposalId: string
  ) => Promise<{ ok: boolean; message?: string; warning?: string }>;
  highlightEmptySlots?: boolean;
  onDismissHighlightEmptySlots?: () => void;
  onOpenProposalBuilder?: (proposalId: string) => void;
  proposalChangeLogs?: ProposalChangeLogEntry[];
  kpmAuditLogs?: KpmAuditLogEntry[];
  onReplaceKpmInProposal?: (params: {
    proposalId: string;
    slotNumber: number;
    oldKpmId: string;
    newKpmId: string;
    oldKpmDestination: 'database' | 'rejected';
    followSlotItem: boolean;
    reason?: string;
  }) => Promise<boolean>;
  onAddManualProposalChange?: (
    draft: Omit<ProposalChangeLogEntry, 'id' | 'actorName' | 'timestamp'>
  ) => void;
  onUpdateProposalChangeReason?: (entryId: string, reason: string) => void;
  onDeleteProposalChange?: (entryId: string) => void;
}

export function ProposalDetailView({
  proposal,
  allProposals,
  records,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  schedules = [],
  scheduleBooks = DEFAULT_SCHEDULE_BOOKS,
  reportTemplate,
  bastTemplate,
  sptjmTemplate = DEFAULT_SPTJM_TEMPLATE,
  pejabatList = DEFAULT_PEJABAT_LIST,
  proposalBastMap = {},
  onSaveProposalBastConfig,
  historyEntries,
  canAdd = true,
  canUpdate = true,
  onBack,
  onEditProposal,
  onAddKpmInProposal,
  onViewKpmInProposal,
  onOpenPhotoGallery,
  onSelectKpm,
  onTransferKpm,
  onOpenFullHistory,
  onOpenProposalBuilder,
  onPreviewDocument,
  onUpdateProposalDocuments,
  onCreateForEmptySlot,
  onFillEmptySlotFromDatabase,
  activeReconcileSnapshot = null,
  onUndoReconcileSnapshot,
  highlightEmptySlots = false,
  onDismissHighlightEmptySlots,
  proposalChangeLogs = [],
  kpmAuditLogs = [],
  onReplaceKpmInProposal,
  onAddManualProposalChange,
  onUpdateProposalChangeReason,
  onDeleteProposalChange,
}: ProposalDetailViewProps) {
  const { isOffline } = useOfflineStatus();
  const isNativeApp = isNativeAppPlatform();
  const isDesktopWeb = useIsDesktopWeb();
  const kpmListSectionRef = useRef<HTMLElement | null>(null);
  const firstEmptySlotRef = useRef<HTMLDivElement | null>(null);
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [absensiModalOpen, setAbsensiModalOpen] = useState(false);
  const [absensiBusy, setAbsensiBusy] = useState(false);
  const [absensiVariant, setAbsensiVariant] = useState<
    'daftar_hadir' | 'makan_minum' | 'kegiatan' | 'arsip'
  >('daftar_hadir');
  const [absensiLokasiJudul, setAbsensiLokasiJudul] = useState<string>('');
  const [absensiExtraBlankRows, setAbsensiExtraBlankRows] = useState<string>('0');
  const [absensiHandoverName, setAbsensiHandoverName] = useState<string>('');
  const [absensiHandoverNip, setAbsensiHandoverNip] = useState<string>('');
  const [absensiBookId, setAbsensiBookId] = useState<string>('');
  const [absensiTanggal, setAbsensiTanggal] = useState<string>('');
  const [absensiHari, setAbsensiHari] = useState<string>('');
  const [absensiPukul, setAbsensiPukul] = useState<string>('');
  const [absensiLokasiKegiatan, setAbsensiLokasiKegiatan] = useState<string>(proposal.namaProposal);
  const [absensiLokasiPembagian, setAbsensiLokasiPembagian] = useState<string>('');
  const [absensiArsipFooterYear, setAbsensiArsipFooterYear] = useState<string>(
    proposal.tahun || '2025'
  );

  // Rekap Pergantian KPM & Item
  const [isChangeRecapModalOpen, setIsChangeRecapModalOpen] = useState(false);
  const [recapSubMode, setRecapSubMode] = useState<'list' | 'replace' | 'manual'>('list');
  const [recapKindFilter, setRecapKindFilter] = useState<'all' | ProposalChangeKind>('all');
  const [recapQuery, setRecapQuery] = useState('');
  const [recapPdfBusy, setRecapPdfBusy] = useState(false);
  const [recapFeedback, setRecapFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [editingReasonText, setEditingReasonText] = useState('');

  // Form Ganti KPM (1-Klik)
  const [replaceOldKpmId, setReplaceOldKpmId] = useState('');
  const [replaceOldQuery, setReplaceOldQuery] = useState('');
  const [replaceNewKpmId, setReplaceNewKpmId] = useState('');
  const [replaceNewQuery, setReplaceNewQuery] = useState('');
  const [replaceDestination, setReplaceDestination] = useState<'database' | 'rejected'>('database');
  const [replaceFollowSlotItem, setReplaceFollowSlotItem] = useState(true);
  const [replaceReason, setReplaceReason] = useState('');
  const [replaceBusy, setReplaceBusy] = useState(false);

  // Form Catat Manual Perubahan
  const [manualKind, setManualKind] = useState<ProposalChangeKind>('kpm_replaced');
  const [manualSlotNumber, setManualSlotNumber] = useState('');
  const [manualOldName, setManualOldName] = useState('');
  const [manualOldNik, setManualOldNik] = useState('');
  const [manualOldItem, setManualOldItem] = useState('');
  const [manualNewName, setManualNewName] = useState('');
  const [manualNewNik, setManualNewNik] = useState('');
  const [manualNewItem, setManualNewItem] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [dbPickerTargetSlot, setDbPickerTargetSlot] = useState<{
    slotNumber: number;
    item?: string;
  } | null>(null);
  const [dbPickerQuery, setDbPickerQuery] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferYear, setTransferYear] = useState<string>(proposal.tahun);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferKelurahanFilter, setTransferKelurahanFilter] = useState<string>('all');
  const [transferQuery, setTransferQuery] = useState<string>('');
  const [selectedTransferIds, setSelectedTransferIds] = useState<string[]>([]);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [docBusySlot, setDocBusySlot] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [pendingUploadTarget, setPendingUploadTarget] = useState<{
    key: keyof ProposalDocuments;
    label: string;
    existingDoc?: KpmDocumentFile;
  } | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{
    key: keyof ProposalDocuments;
    label: string;
    doc: KpmDocumentFile;
  } | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleFontPx, setTitleFontPx] = useState<number>(16);
  const [allowTitleWrap, setAllowTitleWrap] = useState(false);
  const [kpmListQuery, setKpmListQuery] = useState('');
  const [kpmListItemFilter, setKpmListItemFilter] = useState<string>('all');
  const [subItemTrackerFilter, setSubItemTrackerFilter] = useState<
    'incomplete' | 'partial' | 'not_taken' | 'complete' | 'all'
  >('incomplete');
  const [subItemTrackerQuery, setSubItemTrackerQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    subItemTracker: true,
    kelurahan: false,
    item: false,
    subItem: false,
    pengelola: false,
    pekerjaan: false,
    rekapPergantian: false,
    rekamJejak: false,
  });
  const toggleBreakdownSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [kpmFilterDrill, setKpmFilterDrill] = useState<{
    kind: 'item' | 'pengelola' | 'pekerjaan';
    key: string;
    title: string;
    subtitle: string;
  } | null>(null);
  const [drillQuery, setDrillQuery] = useState('');

  const effectiveBastConfig = useMemo(
    () => resolveEffectiveBastConfig(bastTemplate, proposalBastMap, proposal.id, reportTemplate),
    [bastTemplate, proposalBastMap, proposal.id, reportTemplate]
  );
  const hasCustomProposalBast = Boolean(proposalBastMap && proposalBastMap[proposal.id]);
  const matchedSchedule = useMemo(
    () => resolveScheduleForProposal(proposal.namaProposal, proposal.tahun, schedules),
    [proposal.namaProposal, proposal.tahun, schedules]
  );
  const proposalBastLocationLabel = useMemo(
    () =>
      formatBastProposalLocation(
        {
          kabKota: proposal.kabKota || '',
          kecamatan: proposal.kecamatan || '',
          kelurahan: proposal.kelurahan || '',
          proposal: proposal.namaProposal,
          proposalId: proposal.id,
          tahun: proposal.tahun,
        },
        allProposals
      ),
    [proposal, allProposals]
  );

  const [isBastModalOpen, setIsBastModalOpen] = useState(false);
  const [bastDraft, setBastDraft] = useState<BastTemplateConfig>(effectiveBastConfig);
  const [bastBusy, setBastBusy] = useState(false);
  const [sptjmBusy, setSptjmBusy] = useState(false);
  const [dinsosBusy, setDinsosBusy] = useState(false);
  const [kpmPdfBusy, setKpmPdfBusy] = useState(false);
  const [kpmXlsxBusy, setKpmXlsxBusy] = useState(false);
  const [bastFeedback, setBastFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const openProposalBastModal = () => {
    setBastDraft(effectiveBastConfig);
    setBastFeedback(null);
    setIsBastModalOpen(true);
  };

  const handleSaveProposalBastOnly = () => {
    if (!onSaveProposalBastConfig || isOffline) return;
    onSaveProposalBastConfig(proposal.id, bastDraft);
    setIsBastModalOpen(false);
  };

  const handleResetProposalBastToDefault = () => {
    if (!onSaveProposalBastConfig || isOffline) return;
    onSaveProposalBastConfig(proposal.id, null);
    const defaultResolved = resolveEffectiveBastConfig(
      bastTemplate,
      {},
      proposal.id,
      reportTemplate
    );
    setBastDraft(defaultResolved);
    setBastFeedback({
      type: 'success',
      text: 'Pengaturan BAST proposal dikembalikan ke template default global.',
    });
  };

  const handleExportProposalBast = async (configOverride?: BastTemplateConfig) => {
    if (proposalRecords.length === 0 || bastBusy) return;
    setBastBusy(true);
    setBastFeedback(null);
    try {
      const cfg = configOverride || effectiveBastConfig;
      const mergedMap: ProposalBastMap = {
        ...proposalBastMap,
        [proposal.id]: cfg,
      };
      const { exportKpmBastBulkToPdf } = await import('../utils/pdfExporter');
      const result = await exportKpmBastBulkToPdf({
        records: proposalRecords,
        allRecords: records,
        proposals: allProposals,
        items,
        proposalSlotMap,
        reportTemplate,
        bastConfig: cfg,
        proposalBastMap: mergedMap,
        fileName: `BAST_${proposal.tahun}_${proposal.namaProposal}`,
      });
      setBastFeedback({
        type: 'success',
        text: `PDF BAST proposal (${result.count} KPM) disimpan: ${result.savedFileName}`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat PDF BAST proposal.',
      });
    } finally {
      setBastBusy(false);
    }
  };

  const handleExportProposalSptjm = async () => {
    if (proposalRecords.length === 0 || sptjmBusy) return;
    setSptjmBusy(true);
    setBastFeedback(null);
    try {
      const { exportKpmSptjmBulkToPdf } = await import('../utils/pdfExporter');
      const result = await exportKpmSptjmBulkToPdf({
        records: proposalRecords,
        allRecords: records,
        proposals: allProposals,
        items,
        wilayahList,
        proposalSlotMap,
        reportTemplate,
        bastConfig: effectiveBastConfig,
        sptjmConfig: sptjmTemplate ?? DEFAULT_SPTJM_TEMPLATE,
        fileName: `SPTJM_${proposal.tahun}_${proposal.namaProposal}`,
      });
      setBastFeedback({
        type: 'success',
        text: `PDF SPTJM proposal (${result.count} KPM) disimpan: ${result.savedFileName}`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat PDF SPTJM proposal.',
      });
    } finally {
      setSptjmBusy(false);
    }
  };

  const handleExportProposalDinsos = async () => {
    if (dinsosFixedCount === 0 || dinsosBusy) return;
    setDinsosBusy(true);
    setBastFeedback(null);
    try {
      const { exportNomorDinsosToPdf } = await import('../utils/pdfExporter');
      const result = await exportNomorDinsosToPdf({
        records: proposalRecords,
        allRecords: records,
        proposals: allProposals,
        targetProposals: [proposal],
        items,
        wilayahList,
        proposalSlotMap,
        includeEmptySlots: true,
        fileName: `Nomor_DINSOS_${proposal.tahun}_${proposal.namaProposal}`,
      });
      setBastFeedback({
        type: 'success',
        text: `PDF Nomor DINSOS (${result.count} label · F4 216×330 mm) disimpan: ${result.savedFileName}`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat PDF Nomor DINSOS proposal.',
      });
    } finally {
      setDinsosBusy(false);
    }
  };

  const handleExportProposalKpmPdf = async () => {
    if ((proposalRecords.length === 0 && emptySlotsCount === 0) || kpmPdfBusy) return;
    setKpmPdfBusy(true);
    setBastFeedback(null);
    try {
      const selectedColumns = shouldAutoIncludeKelurahanColumn(proposal.namaProposal)
        ? [...DEFAULT_PDF_COLUMN_KEYS, 'kelurahan' as const]
        : DEFAULT_PDF_COLUMN_KEYS;
      const subtitleParts = [
        `Tipe: ${proposal.tipe}`,
        `Total: ${proposalRecords.length} KPM`,
        emptySlotsCount > 0 ? `${emptySlotsCount} Baris Kosong` : '',
      ].filter(Boolean);
      const { exportKpmTableToPdf } = await import('../utils/pdfExporter');
      const result = await exportKpmTableToPdf({
        records: proposalRecords,
        allRecords: records,
        proposals: allProposals,
        items,
        wilayahList,
        selectedColumns,
        title: `${proposal.namaProposal} ${proposal.tahun}`.trim(),
        subtitle: subtitleParts.join('  ·  '),
        fileName: `KPM_${proposal.tahun}_${proposal.namaProposal}`,
        includeSummary: true,
        reportTemplate,
        splitByProposal: false,
        proposalSlotMap,
        includeEmptySlots: true,
        proposalMeta: {
          id: proposal.id,
          namaProposal: proposal.namaProposal,
          tahun: proposal.tahun,
        },
      });
      setBastFeedback({
        type: 'success',
        text: `PDF Daftar KPM (${result.count} KPM${
          emptySlotsCount > 0 ? ` + ${emptySlotsCount} baris kosong` : ''
        }) disimpan: ${result.savedFileName}`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat PDF Daftar KPM proposal.',
      });
    } finally {
      setKpmPdfBusy(false);
    }
  };

  const handleExportProposalKpmXlsx = async () => {
    if ((proposalRecords.length === 0 && emptySlotsCount === 0) || kpmXlsxBusy) return;
    setKpmXlsxBusy(true);
    setBastFeedback(null);
    try {
      const subtitleParts = [
        `Tipe: ${proposal.tipe}`,
        `Total: ${proposalRecords.length} KPM`,
        emptySlotsCount > 0 ? `${emptySlotsCount} Baris Kosong` : '',
      ].filter(Boolean);
      const { exportKpmTableToXlsx } = await import('../utils/xlsxExporter');
      const result = await exportKpmTableToXlsx({
        records: proposalRecords,
        allRecords: records,
        proposals: allProposals,
        items,
        wilayahList,
        proposalSlotMap,
        title: `${proposal.namaProposal} ${proposal.tahun}`.trim(),
        subtitle: subtitleParts.join('  ·  '),
        fileName: `KPM_${proposal.tahun}_${proposal.namaProposal}`,
        includeEmptySlots: true,
        splitByProposal: false,
        proposalMeta: {
          id: proposal.id,
          namaProposal: proposal.namaProposal,
          tahun: proposal.tahun,
        },
      });
      setBastFeedback({
        type: 'success',
        text: `Excel Daftar KPM (${result.count} KPM${
          result.emptyCount > 0 ? ` + ${result.emptyCount} baris kosong` : ''
        }) disimpan: ${result.savedFileName}`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat file Excel (.xlsx) Daftar KPM.',
      });
    } finally {
      setKpmXlsxBusy(false);
    }
  };

  const effectiveScheduleBooks = useMemo(
    () => (scheduleBooks && scheduleBooks.length > 0 ? scheduleBooks : DEFAULT_SCHEDULE_BOOKS),
    [scheduleBooks]
  );

  const applyAbsensiBookSchedule = (bookId: string) => {
    setAbsensiBookId(bookId);
    const ev = resolveScheduleForProposalInBook(
      proposal.namaProposal,
      proposal.tahun,
      schedules,
      bookId,
      effectiveScheduleBooks
    );
    const fields = formatAbsensiScheduleFields(ev);
    setAbsensiTanggal(fields.tanggal);
    setAbsensiHari(fields.hari);
    setAbsensiPukul(fields.pukul);
    setAbsensiLokasiPembagian((ev?.location || '').trim());
  };

  const openAbsensiModal = () => {
    const matchedBook = effectiveScheduleBooks.find((b) =>
      Boolean(
        resolveScheduleForProposalInBook(
          proposal.namaProposal,
          proposal.tahun,
          schedules,
          b.id,
          effectiveScheduleBooks
        )
      )
    );
    const initialBookId = matchedBook?.id || effectiveScheduleBooks[0]?.id || 'all';
    setAbsensiLokasiKegiatan(proposal.namaProposal);
    setAbsensiArsipFooterYear(proposal.tahun || String(new Date().getFullYear()));
    setAbsensiLokasiJudul(
      formatAbsenDinasLocationText(
        proposal.namaProposal,
        allProposals,
        proposal.tahun,
        wilayahList
      )
    );
    setAbsensiExtraBlankRows('0');
    applyAbsensiBookSchedule(initialBookId);
    setAbsensiModalOpen(true);
  };

  const selectedAbsensiBookSchedule = useMemo(
    () =>
      resolveScheduleForProposalInBook(
        proposal.namaProposal,
        proposal.tahun,
        schedules,
        absensiBookId,
        effectiveScheduleBooks
      ),
    [proposal.namaProposal, proposal.tahun, schedules, absensiBookId, effectiveScheduleBooks]
  );

  const handleExportProposalAbsensi = async () => {
    if ((proposalRecords.length === 0 && emptySlotsCount === 0) || absensiBusy) return;
    setAbsensiBusy(true);
    setBastFeedback(null);
    try {
      if (absensiVariant === 'daftar_hadir' || absensiVariant === 'makan_minum') {
        const parsedExtra = Math.max(0, Math.min(30, Math.floor(Number(absensiExtraBlankRows) || 0)));
        const variantPrefix =
          absensiVariant === 'makan_minum' ? 'Daftar_Makan_Minum' : 'Daftar_Hadir';
        const { exportAbsenDinasPesertaToPdf } = await import('../utils/pdfExporter');
        const result = await exportAbsenDinasPesertaToPdf({
          variant: absensiVariant as AbsenDinasVariant,
          records: proposalRecords,
          allRecords: records,
          proposals: allProposals,
          items,
          wilayahList,
          proposalSlotMap,
          singleProposal: proposal,
          extraBlankRows: parsedExtra,
          locationOverride: absensiLokasiJudul,
          handoverName: absensiVariant === 'makan_minum' ? absensiHandoverName : undefined,
          handoverNip: absensiVariant === 'makan_minum' ? absensiHandoverNip : undefined,
          fileName: `${variantPrefix}_${proposal.tahun}_${proposal.namaProposal}`,
        });
        setAbsensiModalOpen(false);
        setBastFeedback({
          type: 'success',
          text: `PDF ${
            absensiVariant === 'makan_minum' ? 'Daftar Makan & Minum' : 'Daftar Hadir'
          } (${result.totalRows} baris · F4) disimpan: ${result.savedFileName}`,
        });
      } else if (absensiVariant === 'arsip') {
        const parsedExtra = Math.max(0, Math.min(30, Math.floor(Number(absensiExtraBlankRows) || 0)));
        const { exportAbsenArsipToPdf } = await import('../utils/pdfExporter');
        const result = await exportAbsenArsipToPdf({
          records: proposalRecords,
          allRecords: records,
          proposals: allProposals,
          items,
          wilayahList,
          proposalSlotMap,
          schedules,
          scheduleBookId: absensiBookId,
          scheduleBooks: effectiveScheduleBooks,
          singleProposal: proposal,
          extraBlankRows: parsedExtra,
          manualOverride: {
            tanggal: absensiTanggal,
            hari: absensiHari,
            pukul: absensiPukul,
            judulKegiatan: absensiLokasiKegiatan || proposal.namaProposal,
            lokasiPembagian: absensiLokasiPembagian,
            footerYear: absensiArsipFooterYear,
          },
          fileName: `Absen_Arsip_-_${proposal.namaProposal}_${proposal.tahun}`,
        });
        setAbsensiModalOpen(false);
        setBastFeedback({
          type: 'success',
          text: `PDF Absen Arsip (${result.totalRows} baris · F4 DPRD) disimpan: ${result.savedFileName}`,
        });
      } else {
        const { exportAbsensiDinsosToPdf } = await import('../utils/pdfExporter');
        const result = await exportAbsensiDinsosToPdf({
          records: proposalRecords,
          allRecords: records,
          proposals: allProposals,
          items,
          wilayahList,
          proposalSlotMap,
          schedules,
          scheduleBookId: absensiBookId,
          scheduleBooks: effectiveScheduleBooks,
          bastConfig: effectiveBastConfig,
          reportTemplate,
          singleProposal: proposal,
          manualOverride: {
            tanggal: absensiTanggal,
            hari: absensiHari,
            pukul: absensiPukul,
            lokasiKegiatan: absensiLokasiKegiatan || proposal.namaProposal,
          },
          fileName: `Absensi_${proposal.tahun}_${proposal.namaProposal}`,
        });
        setAbsensiModalOpen(false);
        setBastFeedback({
          type: 'success',
          text: `PDF Absensi Kegiatan (${result.totalRows} baris · F4 DINSOS) disimpan: ${result.savedFileName}`,
        });
      }
    } catch (err) {
      setBastFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat PDF Daftar Absensi.',
      });
    } finally {
      setAbsensiBusy(false);
    }
  };

  useLayoutEffect(() => {
    const fitTitle = () => {
      const el = titleRef.current;
      if (!el) return;

      const parentWidth = el.parentElement?.clientWidth ?? el.clientWidth;
      if (parentWidth <= 0) return;

      // Mulai dari ukuran normal 16px pada 1 baris, perkecil bertahap hingga 11.5px bila kepanjangan
      el.style.whiteSpace = 'nowrap';
      let currentSize = 16;
      const minSize = 11.5;
      el.style.fontSize = `${currentSize}px`;

      while (el.scrollWidth > parentWidth && currentSize > minSize) {
        currentSize = Math.max(minSize, Number((currentSize - 0.5).toFixed(1)));
        el.style.fontSize = `${currentSize}px`;
      }

      const stillOverflows = el.scrollWidth > parentWidth;
      if (stillOverflows) {
        el.style.whiteSpace = 'normal';
      }
      setTitleFontPx(currentSize);
      setAllowTitleWrap(stillOverflows);
    };

    fitTitle();
    window.addEventListener('resize', fitTitle);
    return () => window.removeEventListener('resize', fitTitle);
  }, [proposal.namaProposal]);
  const proposalRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          r.validasi === 'accepted' &&
          (r.proposalId
            ? r.proposalId === proposal.id
            : r.proposal === proposal.namaProposal && r.tahun === proposal.tahun)
      ),
    [records, proposal.id, proposal.namaProposal, proposal.tahun]
  );

  const showKelurahanCard = !/\b(kelurahan|desa)\b/i.test(proposal.namaProposal);

  const subItemRecap = useMemo(
    () => computeSubItemRecap(proposalRecords, items),
    [proposalRecords, items]
  );

  // KPM Stats (Proposal hanya menampung KPM berstatus Diterima)
  const kpmCounts = useMemo(() => {
    const total = proposalRecords.length;
    const accepted = total;
    const quota = proposal.jumlahKpm ?? 66;
    const remainingQuota = Math.max(0, quota - total);
    return { total, accepted, quota, remainingQuota };
  }, [proposalRecords, proposal.jumlahKpm]);

  const emptySlotsCount = useMemo(() => {
    const { state } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      proposal.id,
      proposal.namaProposal,
      proposal.tahun,
      allProposals
    );
    return state?.emptySlots?.length ?? 0;
  }, [proposalSlotMap, proposal.id, proposal.namaProposal, proposal.tahun, allProposals]);

  const dinsosFixedCount = useMemo(() => {
    const { state } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      proposal.id,
      proposal.namaProposal,
      proposal.tahun,
      allProposals
    );
    const merged = buildMergedProposalSlots({
      groupRecords: proposalRecords,
      slotState: state,
      proposals: allProposals,
      catalog: items,
      wilayahList,
    });
    const maxMerged = merged.reduce((mx, m) => Math.max(mx, m.slotNumber), 0);
    return Math.max(maxMerged, proposal.jumlahKpm || 0, proposalRecords.length);
  }, [
    proposalSlotMap,
    proposal.id,
    proposal.namaProposal,
    proposal.tahun,
    proposal.jumlahKpm,
    allProposals,
    proposalRecords,
    items,
    wilayahList,
  ]);

  // DTSEN Breakdown (Desil 1-4, Desil 5, Desil 6-10, Belum Ada Desil, Data Tidak Ditemukan)
  const dtsenBreakdown = useMemo(() => {
    let desil1to4 = 0;
    let desil5 = 0;
    let desil6to10 = 0;
    let unassigned = 0;
    let notFound = 0;

    for (const rec of proposalRecords) {
      const d = (rec.dtsen || '').trim();
      if (['1 - 5', '1-5', '1', '2', '3', '4'].includes(d)) {
        desil1to4 += 1;
      } else if (d === '5') {
        desil5 += 1;
      } else if (['6', '7', '8', '9', '10', '6 - 10'].includes(d)) {
        desil6to10 += 1;
      } else if (d === 'Data Tidak Ditemukan') {
        notFound += 1;
      } else {
        unassigned += 1;
      }
    }

    const total = proposalRecords.length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    const allSegments = [
      {
        key: 'd14',
        label: 'Desil 1 - 4',
        shortLabel: 'Desil 1 - 4',
        count: desil1to4,
        pct: pct(desil1to4),
        color: '#0F766E',
        dotClass: 'bg-teal-700',
      },
      {
        key: 'd5',
        label: 'Desil 5',
        shortLabel: 'Desil 5',
        count: desil5,
        pct: pct(desil5),
        color: '#F59E0B',
        dotClass: 'bg-amber-500',
      },
      {
        key: 'd610',
        label: 'Desil 6 - 10',
        shortLabel: 'Desil 6 - 10',
        count: desil6to10,
        pct: pct(desil6to10),
        color: '#E11D48',
        dotClass: 'bg-rose-600',
      },
      {
        key: 'unassigned',
        label: 'Belum Ada Desil',
        shortLabel: 'Belum Ada',
        count: unassigned,
        pct: pct(unassigned),
        color: '#94A3B8',
        dotClass: 'bg-slate-400',
      },
      {
        key: 'notfound',
        label: 'Data Tidak Ditemukan',
        shortLabel: 'Tdk Ditemukan',
        count: notFound,
        pct: pct(notFound),
        color: '#0F172A',
        dotClass: 'bg-slate-950',
      },
    ];

    const activeSegments = allSegments.filter((seg) => seg.count > 0);
    const primarySegment =
      [...activeSegments].sort((a, b) => b.count - a.count)[0] ?? null;

    return {
      total,
      segments: activeSegments,
      primarySegment,
    };
  }, [proposalRecords]);

  // Conditional Kelurahan Distribution (tampil untuk proposal selain judul kelurahan)
  const kelurahanBreakdown = useMemo(() => {
    if (!showKelurahanCard) return [];
    const map = new Map<string, { name: string; total: number; accepted: number }>();
    for (const rec of proposalRecords) {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      const existing = map.get(kel) ?? { name: kel, total: 0, accepted: 0 };
      existing.total += 1;
      if (rec.validasi === 'accepted') existing.accepted += 1;
      map.set(kel, existing);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name)
    );
  }, [showKelurahanCard, proposalRecords]);

  // Item Breakdown (year-aware)
  const itemBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; total: number; accepted: number }
    >();
    for (const rec of proposalRecords) {
      const code = (rec.item || '').trim();
      if (!code) continue;
      const pkg = resolvePackageForKpm(items, proposal.tahun, code);
      const existing = map.get(code) ?? {
        code,
        name: pkg.name || code,
        total: 0,
        accepted: 0,
      };
      existing.total += 1;
      if (rec.validasi === 'accepted') existing.accepted += 1;
      map.set(code, existing);
    }
    return Array.from(map.values()).sort((a, b) => {
      const rankA = getItemHierarchyRank(a.code, proposal.tahun, items);
      const rankB = getItemHierarchyRank(b.code, proposal.tahun, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code, 'id');
    });
  }, [proposalRecords, items, proposal.tahun]);

  const mergedProposalSlots = useMemo(() => {
    const { state: slotState } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      proposal.id,
      proposal.namaProposal,
      proposal.tahun,
      allProposals
    );
    return buildMergedProposalSlots({
      groupRecords: proposalRecords,
      slotState,
      proposals: allProposals,
      catalog: items,
      wilayahList,
    });
  }, [proposalSlotMap, proposal.id, proposal.namaProposal, proposal.tahun, allProposals, proposalRecords, items, wilayahList]);

  const orderedProposalRecords = useMemo(() => {
    const slotNumberByRecordId = new Map<string, number>();
    for (const slot of mergedProposalSlots) {
      if (slot.kind === 'kpm') {
        slotNumberByRecordId.set(slot.record.id, slot.slotNumber);
      }
    }
    return [...proposalRecords]
      .map((rec) => {
        const slotNumber = slotNumberByRecordId.get(rec.id);
        const absen = getAbsenSeq(rec.registerCode);
        return {
          record: rec,
          displaySeq: slotNumber ?? (absen < 999999 ? absen : 999999),
        };
      })
      .sort((a, b) => {
        if (a.displaySeq !== b.displaySeq) return a.displaySeq - b.displaySeq;
        return a.record.nama.localeCompare(b.record.nama, 'id');
      });
  }, [proposalRecords, mergedProposalSlots]);

  const drillFilteredRecords = useMemo(() => {
    if (!kpmFilterDrill) return [];
    const base = orderedProposalRecords.filter(({ record: rec }) => {
      if (kpmFilterDrill.kind === 'item') {
        return (rec.item || '').trim() === kpmFilterDrill.key;
      }
      if (kpmFilterDrill.kind === 'pengelola') {
        return (rec.pengelola?.trim() || 'Tanpa Pengelola') === kpmFilterDrill.key;
      }
      return (rec.pekerjaan?.trim() || 'Lainnya') === kpmFilterDrill.key;
    });
    const q = drillQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      ({ record: rec }) =>
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.toLowerCase().includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.kelurahan.toLowerCase().includes(q) ||
        rec.pengelola.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q)
    );
  }, [kpmFilterDrill, orderedProposalRecords, drillQuery]);

  const filteredProposalRecords = useMemo(() => {
    const q = kpmListQuery.trim().toLowerCase();
    return orderedProposalRecords.filter(({ record: rec }) => {
      if (kpmListItemFilter !== 'all' && (rec.item || '').trim() !== kpmListItemFilter) {
        return false;
      }
      if (!q) return true;
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.toLowerCase().includes(q) ||
        rec.nikKk.toLowerCase().includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.kelurahan.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q) ||
        rec.pengelola.toLowerCase().includes(q)
      );
    });
  }, [orderedProposalRecords, kpmListQuery, kpmListItemFilter]);

  const filteredProposalSlots = useMemo(() => {
    const q = kpmListQuery.trim().toLowerCase();
    return mergedProposalSlots.filter((entry) => {
      if (entry.kind === 'empty') {
        const slotItem = (entry.emptySlot.item || '').trim();
        if (kpmListItemFilter !== 'all' && slotItem && slotItem !== kpmListItemFilter) {
          return false;
        }
        if (!q) return true;
        const slotNumText = String(entry.slotNumber).padStart(2, '0');
        return (
          'baris kosong'.includes(q) ||
          slotNumText.includes(q) ||
          slotItem.toLowerCase().includes(q) ||
          (entry.emptySlot.previousKpmName || '').toLowerCase().includes(q)
        );
      }
      const rec = entry.record;
      if (kpmListItemFilter !== 'all' && (rec.item || '').trim() !== kpmListItemFilter) {
        return false;
      }
      if (!q) return true;
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.toLowerCase().includes(q) ||
        rec.nikKk.toLowerCase().includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.kelurahan.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q) ||
        rec.pengelola.toLowerCase().includes(q)
      );
    });
  }, [mergedProposalSlots, kpmListQuery, kpmListItemFilter]);

  const proposalAreaScope = useMemo(
    () =>
      resolveProposalAreaScope(proposal.namaProposal, allProposals, proposal.tahun, wilayahList),
    [proposal.namaProposal, allProposals, proposal.tahun, wilayahList]
  );

  const databasePickerCandidates = useMemo(() => {
    if (!dbPickerTargetSlot) return [];
    const q = dbPickerQuery.trim().toLowerCase();

    return records
      .filter((r) => {
        if (r.validasi !== 'pending') return false;
        const propStr = (r.proposal || '').trim();
        if (propStr && propStr !== proposal.namaProposal) return false;
        if (
          !doesKpmMatchProposalDomicile({
            record: r,
            proposalName: proposal.namaProposal,
            proposalTahun: proposal.tahun,
            proposals: allProposals,
            wilayahList,
          })
        ) {
          return false;
        }
        if (!q) return true;
        const dom = resolveKpmDomicile(r, allProposals, wilayahList);
        return (
          r.nama.toLowerCase().includes(q) ||
          r.nikKtp.includes(q) ||
          r.item.toLowerCase().includes(q) ||
          dom.kelurahan.toLowerCase().includes(q) ||
          dom.kecamatan.toLowerCase().includes(q) ||
          r.pengelola.toLowerCase().includes(q) ||
          (r.catatan || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (dbPickerTargetSlot.item) {
          const aMatch =
            (a.item || '').trim().toUpperCase() === dbPickerTargetSlot.item.trim().toUpperCase()
              ? 0
              : 1;
          const bMatch =
            (b.item || '').trim().toUpperCase() === dbPickerTargetSlot.item.trim().toUpperCase()
              ? 0
              : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return a.nama.localeCompare(b.nama, 'id');
      });
  }, [
    dbPickerTargetSlot,
    dbPickerQuery,
    proposal.namaProposal,
    proposal.tahun,
    records,
    allProposals,
    wilayahList,
  ]);

  useEffect(() => {
    if (!highlightEmptySlots) return;
    const timer = window.setTimeout(() => {
      const targetEl = firstEmptySlotRef.current ?? kpmListSectionRef.current;
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [highlightEmptySlots, proposal.id]);

  const handleConfirmUndoProposal = async () => {
    if (!onUndoReconcileSnapshot || !activeReconcileSnapshot || undoBusy) return;
    setUndoBusy(true);
    try {
      const res = await onUndoReconcileSnapshot(activeReconcileSnapshot.id);
      if (res.ok) {
        setConfirmUndoOpen(false);
      }
    } finally {
      setUndoBusy(false);
    }
  };

  // Pengelola Breakdown
  const pengelolaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of proposalRecords) {
      const name = rec.pengelola?.trim() || 'Tanpa Pengelola';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [proposalRecords]);

  // Pekerjaan Breakdown
  const pekerjaanBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of proposalRecords) {
      const job = rec.pekerjaan?.trim() || 'Lainnya';
      map.set(job, (map.get(job) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [proposalRecords]);

  // Pantauan Pengambilan Item & Sub-Item per KPM dalam proposal ini (Web & Android)
  const subItemTrackerData = useMemo(() => {
    const rows: {
      record: KpmRecord;
      slotNumber: number | null;
      takenNames: string[];
      pendingNames: string[];
      takenCount: number;
      totalCount: number;
      statusCategory: 'not_taken' | 'partial' | 'complete';
    }[] = [];

    let partial = 0;
    let notTaken = 0;
    let complete = 0;

    for (const { record, displaySeq } of orderedProposalRecords) {
      if (record.validasi !== 'accepted') continue;
      const subList = getKpmSubItemStatusList(record, items);
      if (subList.length === 0) continue;

      const takenNames = subList.filter((s) => s.delivered).map((s) => s.baseName || s.name);
      const pendingNames = subList.filter((s) => !s.delivered).map((s) => s.baseName || s.name);
      const takenCount = takenNames.length;
      const totalCount = subList.length;
      const statusCategory: 'not_taken' | 'partial' | 'complete' =
        takenCount === 0 ? 'not_taken' : takenCount >= totalCount ? 'complete' : 'partial';

      if (statusCategory === 'partial') partial += 1;
      else if (statusCategory === 'not_taken') notTaken += 1;
      else complete += 1;

      rows.push({
        record,
        slotNumber: displaySeq < 999999 ? displaySeq : null,
        takenNames,
        pendingNames,
        takenCount,
        totalCount,
        statusCategory,
      });
    }

    return {
      rows,
      counts: {
        incomplete: partial + notTaken,
        partial,
        notTaken,
        complete,
        total: rows.length,
      },
    };
  }, [orderedProposalRecords, items]);

  const filteredSubItemTrackerRows = useMemo(() => {
    const q = subItemTrackerQuery.trim().toLowerCase();
    return subItemTrackerData.rows.filter((row) => {
      if (subItemTrackerFilter === 'incomplete' && row.statusCategory === 'complete') {
        return false;
      }
      if (subItemTrackerFilter === 'partial' && row.statusCategory !== 'partial') {
        return false;
      }
      if (subItemTrackerFilter === 'not_taken' && row.statusCategory !== 'not_taken') {
        return false;
      }
      if (subItemTrackerFilter === 'complete' && row.statusCategory !== 'complete') {
        return false;
      }
      if (!q) return true;
      return (
        row.record.nama.toLowerCase().includes(q) ||
        row.record.item.toLowerCase().includes(q) ||
        row.takenNames.some((n) => n.toLowerCase().includes(q)) ||
        row.pendingNames.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [subItemTrackerData.rows, subItemTrackerFilter, subItemTrackerQuery]);

  // History for this proposal (newest first; include KPM movement + Troubleshooting Reconcile logs)
  const proposalHistory = useMemo(() => {
    const base = historyEntries.filter(
      (h) =>
        (!h.registerCode?.startsWith('ACTLOG::') ||
          h.registerCode === 'ACTLOG::reconcile_apply' ||
          h.registerCode === 'ACTLOG::reconcile_undo') &&
        h.proposalName === proposal.namaProposal &&
        (!h.tahun || h.tahun === proposal.tahun)
    );

    if (activeReconcileSnapshot && activeReconcileSnapshot.proposalId === proposal.id) {
      const hasMatchingApplyLog = base.some(
        (h) =>
          h.registerCode === 'ACTLOG::reconcile_apply' &&
          (h.toProposal === activeReconcileSnapshot.id ||
            h.timestamp === activeReconcileSnapshot.appliedAt)
      );
      if (!hasMatchingApplyLog) {
        base.push({
          id: `synth-reconcile-${activeReconcileSnapshot.id}`,
          tahun: activeReconcileSnapshot.tahun || proposal.tahun,
          proposalName: activeReconcileSnapshot.proposalName || proposal.namaProposal,
          kpmId: '',
          kpmName: `Penyesuaian BAST diterapkan pada ${activeReconcileSnapshot.proposalName} (${activeReconcileSnapshot.tahun}): ${activeReconcileSnapshot.summary.shiftedCount} bergeser, ${activeReconcileSnapshot.summary.emptySlotsCount} baris kosong, ${activeReconcileSnapshot.summary.movedToDatabaseCount} ke Database.`,
          registerCode: 'ACTLOG::reconcile_apply',
          action: 'entered',
          fromProposal: 'Admin',
          toProposal: activeReconcileSnapshot.id,
          actorName: activeReconcileSnapshot.appliedBy,
          timestamp: activeReconcileSnapshot.appliedAt,
        });
      }
    }

    return base.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [historyEntries, proposal.id, proposal.namaProposal, proposal.tahun, activeReconcileSnapshot]);

  // Gabungan Rekap Pergantian KPM & Item (stored + retroaktif dari emptySlots & audit Item Bantuan)
  const combinedChangeRecapEntries = useMemo(() => {
    const scopedStored = proposalChangeLogs.filter(
      (entry) =>
        (entry.proposalId && entry.proposalId === proposal.id) ||
        (entry.proposalName === proposal.namaProposal &&
          (!entry.tahun || entry.tahun === proposal.tahun))
    );

    const coveredSlots = new Set<number>();
    const coveredItemSignatures = new Set<string>();
    const recById = new Map(records.map((r) => [r.id, r]));

    for (const entry of scopedStored) {
      if (
        (entry.kind === 'kpm_vacated' || entry.kind === 'kpm_replaced') &&
        entry.slotNumber &&
        entry.slotNumber > 0
      ) {
        coveredSlots.add(entry.slotNumber);
      }
      if (entry.kind === 'item_changed') {
        const dayKey = entry.timestamp.slice(0, 10);
        const kpmKey = entry.oldKpmId || entry.newKpmId || (entry.oldKpmName || '').toLowerCase();
        coveredItemSignatures.add(
          `${kpmKey}::${(entry.oldItem || '').toUpperCase()}::${(entry.newItem || '').toUpperCase()}::${dayKey}`
        );
      }
    }

    const derivedEntries: ProposalChangeLogEntry[] = [];

    // 1. Baris kosong yang sudah punya previousKpmName namun belum tercatat di proposalChangeLogs
    for (const slot of mergedProposalSlots) {
      if (slot.kind !== 'empty') continue;
      if (!slot.emptySlot.previousKpmName?.trim()) continue;
      if (coveredSlots.has(slot.slotNumber)) continue;
      const oldRec = slot.emptySlot.previousKpmId
        ? recById.get(slot.emptySlot.previousKpmId)
        : undefined;
      derivedEntries.push({
        id: `derived-empty-${proposal.id}-${slot.slotNumber}`,
        proposalId: proposal.id,
        proposalName: proposal.namaProposal,
        tahun: proposal.tahun,
        slotNumber: slot.slotNumber,
        kind: 'kpm_vacated',
        oldKpmId: slot.emptySlot.previousKpmId,
        oldKpmName: slot.emptySlot.previousKpmName,
        oldNik: oldRec?.nikKtp,
        oldItem: slot.emptySlot.item || oldRec?.item,
        oldKelurahan: oldRec?.kelurahan,
        reason: 'Baris kosong dari KPM sebelumnya (siap diisi pengganti)',
        source: 'auto',
        actorName: 'Sistem Slot',
        timestamp: slot.emptySlot.vacatedAt || proposal.updatedAt || proposal.createdAt,
      });
    }

    // 2. Audit log pergantian Item Bantuan pada KPM proposal ini yang belum masuk proposalChangeLogs
    const slotByKpmId = new Map<string, number>();
    orderedProposalRecords.forEach(({ record, displaySeq }) => {
      if (displaySeq < 999999) {
        slotByKpmId.set(record.id, displaySeq);
      }
    });
    const proposalKpmIds = new Set(proposalRecords.map((r) => r.id));

    for (const audit of kpmAuditLogs) {
      const belongsHere =
        proposalKpmIds.has(audit.kpmId) ||
        (audit.proposal === proposal.namaProposal &&
          (!audit.tahun || audit.tahun === proposal.tahun));
      if (!belongsHere) continue;
      const itemChange = audit.changes.find((c) => c.field === 'Item Bantuan');
      if (!itemChange) continue;
      const beforeClean = (itemChange.before || '').trim();
      const afterClean = (itemChange.after || '').trim();
      if (!beforeClean || beforeClean === '-' || beforeClean.toUpperCase() === afterClean.toUpperCase()) {
        continue;
      }
      const sig = `${audit.kpmId}::${beforeClean.toUpperCase()}::${afterClean.toUpperCase()}::${audit.timestamp.slice(0, 10)}`;
      if (coveredItemSignatures.has(sig)) continue;
      coveredItemSignatures.add(sig);

      const recObj = recById.get(audit.kpmId);
      derivedEntries.push({
        id: `derived-audit-${audit.id}`,
        proposalId: proposal.id,
        proposalName: proposal.namaProposal,
        tahun: proposal.tahun,
        slotNumber: slotByKpmId.get(audit.kpmId) ?? null,
        kind: 'item_changed',
        oldKpmId: audit.kpmId,
        oldKpmName: recObj?.nama || '-',
        oldNik: recObj?.nikKtp,
        oldItem: beforeClean,
        oldKelurahan: recObj?.kelurahan,
        newKpmId: audit.kpmId,
        newKpmName: recObj?.nama || '-',
        newNik: recObj?.nikKtp,
        newItem: afterClean,
        newKelurahan: recObj?.kelurahan,
        reason: 'Riwayat perubahan item bantuan KPM',
        source: 'auto',
        actorName: audit.actorName || 'Admin',
        timestamp: audit.timestamp,
      });
    }

    return [...scopedStored, ...derivedEntries].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  }, [
    proposalChangeLogs,
    proposal.id,
    proposal.namaProposal,
    proposal.tahun,
    proposal.updatedAt,
    proposal.createdAt,
    records,
    mergedProposalSlots,
    orderedProposalRecords,
    proposalRecords,
    kpmAuditLogs,
  ]);

  const recapCounts = useMemo(() => {
    let kpmReplaced = 0;
    let itemChanged = 0;
    let kpmVacated = 0;
    for (const item of combinedChangeRecapEntries) {
      if (item.kind === 'kpm_replaced') kpmReplaced += 1;
      else if (item.kind === 'item_changed') itemChanged += 1;
      else if (item.kind === 'kpm_vacated') kpmVacated += 1;
    }
    return {
      total: combinedChangeRecapEntries.length,
      kpmReplaced,
      itemChanged,
      kpmVacated,
    };
  }, [combinedChangeRecapEntries]);

  const filteredChangeRecapEntries = useMemo(() => {
    const q = recapQuery.trim().toLowerCase();
    return combinedChangeRecapEntries.filter((entry) => {
      if (recapKindFilter !== 'all' && entry.kind !== recapKindFilter) return false;
      if (!q) return true;
      const slotStr = entry.slotNumber ? String(entry.slotNumber).padStart(2, '0') : '';
      return (
        slotStr.includes(q) ||
        (entry.oldKpmName || '').toLowerCase().includes(q) ||
        (entry.newKpmName || '').toLowerCase().includes(q) ||
        (entry.oldNik || '').toLowerCase().includes(q) ||
        (entry.newNik || '').toLowerCase().includes(q) ||
        (entry.oldItem || '').toLowerCase().includes(q) ||
        (entry.newItem || '').toLowerCase().includes(q) ||
        (entry.reason || '').toLowerCase().includes(q) ||
        (entry.actorName || '').toLowerCase().includes(q)
      );
    });
  }, [combinedChangeRecapEntries, recapKindFilter, recapQuery]);

  const replaceOldOptions = useMemo(() => {
    const q = replaceOldQuery.trim().toLowerCase();
    return orderedProposalRecords.filter(({ record, displaySeq }) => {
      if (!q) return true;
      const seq = displaySeq < 999999 ? String(displaySeq).padStart(2, '0') : '';
      return (
        seq.includes(q) ||
        record.nama.toLowerCase().includes(q) ||
        record.nikKtp.includes(q) ||
        record.item.toLowerCase().includes(q) ||
        record.kelurahan.toLowerCase().includes(q)
      );
    });
  }, [orderedProposalRecords, replaceOldQuery]);

  const replaceNewCandidates = useMemo(() => {
    const q = replaceNewQuery.trim().toLowerCase();
    const selectedOldRec = records.find((r) => r.id === replaceOldKpmId);
    const oldItemUpper = (selectedOldRec?.item || '').trim().toUpperCase();

    return records
      .filter((r) => {
        if (r.validasi !== 'pending') return false;
        const propStr = (r.proposal || '').trim();
        if (propStr && propStr !== proposal.namaProposal) return false;
        if (
          !doesKpmMatchProposalDomicile({
            record: r,
            proposalName: proposal.namaProposal,
            proposalTahun: proposal.tahun,
            proposals: allProposals,
            wilayahList,
          })
        ) {
          return false;
        }
        if (!q) return true;
        const dom = resolveKpmDomicile(r, allProposals, wilayahList);
        return (
          r.nama.toLowerCase().includes(q) ||
          r.nikKtp.includes(q) ||
          r.item.toLowerCase().includes(q) ||
          dom.kelurahan.toLowerCase().includes(q) ||
          dom.kecamatan.toLowerCase().includes(q) ||
          r.pengelola.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (oldItemUpper) {
          const aMatch = (a.item || '').trim().toUpperCase() === oldItemUpper ? 0 : 1;
          const bMatch = (b.item || '').trim().toUpperCase() === oldItemUpper ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return a.nama.localeCompare(b.nama, 'id');
      });
  }, [records, replaceNewQuery, replaceOldKpmId, proposal.namaProposal, proposal.tahun, allProposals, wilayahList]);

  const openChangeRecapModal = (initialMode: 'list' | 'replace' | 'manual' = 'list') => {
    setRecapFeedback(null);
    setRecapSubMode(initialMode);
    if (initialMode === 'replace') {
      const firstRec = orderedProposalRecords[0]?.record;
      setReplaceOldKpmId((prev) => prev || firstRec?.id || '');
      setReplaceOldQuery('');
      setReplaceNewKpmId('');
      setReplaceNewQuery('');
      setReplaceDestination('database');
      setReplaceFollowSlotItem(true);
      setReplaceReason('');
    } else if (initialMode === 'manual') {
      setManualKind('kpm_replaced');
      setManualSlotNumber('');
      setManualOldName('');
      setManualOldNik('');
      setManualOldItem('');
      setManualNewName('');
      setManualNewNik('');
      setManualNewItem('');
      setManualReason('');
    }
    setIsChangeRecapModalOpen(true);
  };

  const handleExportChangeRecapPdf = async (
    entriesToExport: ProposalChangeLogEntry[] = filteredChangeRecapEntries,
    filterLabel?: string
  ) => {
    if (recapPdfBusy) return;
    setRecapPdfBusy(true);
    setRecapFeedback(null);
    try {
      const { exportProposalChangeRecapToPdf } = await import('../utils/pdfExporter');
      const res = await exportProposalChangeRecapToPdf({
        proposal,
        changes: entriesToExport,
        items,
        wilayahList,
        bastConfig: effectiveBastConfig,
        reportTemplate,
        totalActiveKpm: proposalRecords.length,
        emptySlotsCount,
        filterLabel,
        fileName: `Rekap_Perubahan_${proposal.tahun}_${proposal.namaProposal}`,
      });
      const msg = `PDF Rekap Perubahan (${res.totalChanges} catatan · F4) disimpan: ${res.savedFileName}`;
      setRecapFeedback({ type: 'success', text: msg });
      setBastFeedback({ type: 'success', text: msg });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Gagal membuat PDF Rekap Perubahan.';
      setRecapFeedback({ type: 'error', text: errMsg });
      setBastFeedback({ type: 'error', text: errMsg });
    } finally {
      setRecapPdfBusy(false);
    }
  };

  const handleSubmitReplaceKpm = async () => {
    if (!onReplaceKpmInProposal || replaceBusy) return;
    const selectedSlotEntry = orderedProposalRecords.find(
      ({ record }) => record.id === replaceOldKpmId
    );
    if (!selectedSlotEntry || !replaceNewKpmId) {
      setRecapFeedback({
        type: 'error',
        text: 'Pilih KPM lama pada proposal dan KPM pengganti dari Database KPM terlebih dahulu.',
      });
      return;
    }
    const slotNum =
      selectedSlotEntry.displaySeq < 999999 ? selectedSlotEntry.displaySeq : 1;
    setReplaceBusy(true);
    setRecapFeedback(null);
    try {
      const ok = await onReplaceKpmInProposal({
        proposalId: proposal.id,
        slotNumber: slotNum,
        oldKpmId: selectedSlotEntry.record.id,
        newKpmId: replaceNewKpmId,
        oldKpmDestination: replaceDestination,
        followSlotItem: replaceFollowSlotItem,
        reason: replaceReason.trim() || undefined,
      });
      if (ok) {
        setRecapSubMode('list');
        setReplaceOldKpmId('');
        setReplaceNewKpmId('');
        setReplaceReason('');
        setRecapFeedback({
          type: 'success',
          text: `Pergantian KPM di No. #${String(slotNum).padStart(2, '0')} berhasil dicatat ke rekap.`,
        });
      }
    } finally {
      setReplaceBusy(false);
    }
  };

  const handleSubmitManualProposalChange = () => {
    if (!onAddManualProposalChange) return;
    const cleanOld = manualOldName.trim();
    const cleanNew = manualNewName.trim();
    const cleanOldItem = manualOldItem.trim().toUpperCase();
    const cleanNewItem = manualNewItem.trim().toUpperCase();

    if (manualKind === 'kpm_replaced' && (!cleanOld || !cleanNew)) {
      setRecapFeedback({
        type: 'error',
        text: 'Untuk Pergantian KPM, isi Nama KPM Lama dan Nama KPM Baru.',
      });
      return;
    }
    if (manualKind === 'item_changed' && (!cleanOld || !cleanOldItem || !cleanNewItem)) {
      setRecapFeedback({
        type: 'error',
        text: 'Untuk Pergantian Item, isi Nama KPM, Item Lama, dan Item Baru.',
      });
      return;
    }
    if (manualKind === 'kpm_vacated' && !cleanOld) {
      setRecapFeedback({
        type: 'error',
        text: 'Isi Nama KPM yang keluar / dikosongkan.',
      });
      return;
    }

    const parsedSlot = Number(manualSlotNumber.replace(/\D/g, ''));
    onAddManualProposalChange({
      proposalId: proposal.id,
      proposalName: proposal.namaProposal,
      tahun: proposal.tahun,
      slotNumber: parsedSlot > 0 ? parsedSlot : null,
      kind: manualKind,
      oldKpmName: cleanOld || undefined,
      oldNik: manualOldNik.trim() || undefined,
      oldItem: cleanOldItem || undefined,
      newKpmName: manualKind === 'item_changed' ? cleanOld : cleanNew || undefined,
      newNik: manualNewNik.trim() || undefined,
      newItem: cleanNewItem || undefined,
      reason: manualReason.trim() || undefined,
      source: 'manual',
    });

    setRecapSubMode('list');
    setRecapFeedback({
      type: 'success',
      text: 'Catatan perubahan manual berhasil ditambahkan ke rekap proposal.',
    });
  };

  // Transfer KPM helpers
  const unlockedTargetProposals = useMemo(
    () =>
      allProposals.filter(
        (p) =>
          p.id !== proposal.id &&
          p.status !== 'locked' &&
          (p.tipe === 'Murni' || p.tipe === 'Perubahan')
      ),
    [allProposals, proposal.id]
  );

  const transferYearOptions = useMemo(() => {
    const years = Array.from(
      new Set(unlockedTargetProposals.map((p) => p.tahun).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));
    return years;
  }, [unlockedTargetProposals]);

  const transferTargetOptions = useMemo(() => {
    return unlockedTargetProposals
      .filter((p) => !transferYear || p.tahun === transferYear)
      .sort((a, b) => a.namaProposal.localeCompare(b.namaProposal, 'id'));
  }, [unlockedTargetProposals, transferYear]);

  const transferKelurahanOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of proposalRecords) {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      counts.set(kel, (counts.get(kel) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [proposalRecords]);

  const filteredTransferRecords = useMemo(() => {
    const q = transferQuery.trim().toLowerCase();
    return proposalRecords.filter((rec) => {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      if (transferKelurahanFilter !== 'all' && kel !== transferKelurahanFilter) {
        return false;
      }
      if (!q) return true;
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q)
      );
    });
  }, [proposalRecords, transferKelurahanFilter, transferQuery]);

  const openTransferModal = () => {
    const defaultYear = transferYearOptions.includes(proposal.tahun)
      ? proposal.tahun
      : (transferYearOptions[0] ?? proposal.tahun);
    const candidates = unlockedTargetProposals.filter((p) => p.tahun === defaultYear);
    setTransferYear(defaultYear);
    setTransferTargetId(candidates[0]?.id ?? '');
    setTransferKelurahanFilter('all');
    setTransferQuery('');
    setSelectedTransferIds([]);
    setConfirmTransferOpen(false);
    setIsTransferModalOpen(true);
  };

  const handleTransferYearChange = (nextYear: string) => {
    setTransferYear(nextYear);
    const candidates = unlockedTargetProposals
      .filter((p) => p.tahun === nextYear)
      .sort((a, b) => a.namaProposal.localeCompare(b.namaProposal, 'id'));
    setTransferTargetId(candidates[0]?.id ?? '');
  };

  const toggleSelectTransferId = (id: string) => {
    setSelectedTransferIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allFilteredSelected =
    filteredTransferRecords.length > 0 &&
    filteredTransferRecords.every((r) => selectedTransferIds.includes(r.id));

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredTransferRecords.map((r) => r.id);
    if (allFilteredSelected) {
      const removeSet = new Set(filteredIds);
      setSelectedTransferIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      setSelectedTransferIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleConfirmTransfer = async () => {
    if (!onTransferKpm || selectedTransferIds.length === 0 || !transferTargetId || isTransferring) {
      return;
    }
    setIsTransferring(true);
    try {
      const ok = await onTransferKpm(selectedTransferIds, transferTargetId);
      if (ok) {
        setConfirmTransferOpen(false);
        setIsTransferModalOpen(false);
        setSelectedTransferIds([]);
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const buildChecklistForDocs = (nextDocs: ProposalDocuments): ProposalChecklist => ({
    ...proposal.checklist,
    docx: Boolean(nextDocs.proposalOpd || nextDocs.proposalLurahCamat),
    rab: Boolean(nextDocs.rab),
    rt: Boolean(nextDocs.capRt),
    rw: Boolean(nextDocs.capRw),
    lurah: Boolean(nextDocs.capLurah),
    camat: Boolean(nextDocs.capCamat),
  });

  const handleTriggerDocUpload = (
    key: keyof ProposalDocuments,
    label: string,
    accept: string,
    existingDoc?: KpmDocumentFile
  ) => {
    if (isOffline || proposal.status === 'locked' || !canUpdate || !onUpdateProposalDocuments || docBusySlot) {
      return;
    }
    setDocError(null);
    setPendingUploadTarget({ key, label, existingDoc });
    if (docFileInputRef.current) {
      docFileInputRef.current.accept = accept;
      docFileInputRef.current.click();
    }
  };

  const handleDocFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = pendingUploadTarget;
    setPendingUploadTarget(null);
    if (!file || !target || !onUpdateProposalDocuments) return;

    setDocError(null);
    setDocBusySlot(target.key);
    try {
      const uploaded = await uploadProposalDocumentToDrive(file, target.existingDoc);
      const nextDocs: ProposalDocuments = {
        ...(proposal.documents || {}),
        [target.key]: uploaded,
      };
      await onUpdateProposalDocuments(proposal.id, nextDocs, buildChecklistForDocs(nextDocs));
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : 'Gagal mengunggah berkas dokumen ke Google Drive.'
      );
    } finally {
      setDocBusySlot(null);
    }
  };

  const handleConfirmDeleteDocument = async () => {
    if (!pendingDeleteDoc || !onUpdateProposalDocuments || docBusySlot) return;
    const { key, doc } = pendingDeleteDoc;
    setDocError(null);
    setDocBusySlot(key);
    try {
      await removeDocumentFromDrive(doc);
      const nextDocs: ProposalDocuments = { ...(proposal.documents || {}) };
      delete nextDocs[key];
      await onUpdateProposalDocuments(proposal.id, nextDocs, buildChecklistForDocs(nextDocs));
      setPendingDeleteDoc(null);
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : 'Gagal menghapus berkas dari Google Drive.'
      );
    } finally {
      setDocBusySlot(null);
    }
  };

  const proposalDocSlots: {
    key: keyof ProposalDocuments;
    label: string;
    icon: typeof FileText;
    accept: string;
  }[] = [
    {
      key: 'proposalOpd',
      label: 'Proposal OPD',
      icon: FileText,
      accept: '.pdf,.doc,.docx,image/*',
    },
    {
      key: 'proposalLurahCamat',
      label: 'Proposal Lurah / Camat',
      icon: FileText,
      accept: '.pdf,.doc,.docx,image/*',
    },
    {
      key: 'rab',
      label: 'Berkas RAB',
      icon: FileSpreadsheet,
      accept: '.pdf,.xls,.xlsx,.doc,.docx,image/*',
    },
    {
      key: 'capRt',
      label: 'Cap RT',
      icon: Camera,
      accept: 'image/*,.pdf',
    },
    {
      key: 'capRw',
      label: 'Cap RW',
      icon: Camera,
      accept: 'image/*,.pdf',
    },
    {
      key: 'capLurah',
      label: 'Cap Lurah',
      icon: Camera,
      accept: 'image/*,.pdf',
    },
    {
      key: 'capCamat',
      label: 'Cap Camat',
      icon: Camera,
      accept: 'image/*,.pdf',
    },
  ];

  // SVG Donut ring geometry
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  let runningOffset = 0;

  const overviewAndDtsenBlock = (
    <>
        {/* Hero Overview Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="space-y-2">
            {/* Baris 1: Judul Proposal Penuh di Atas Container (font otomatis mengecil bila panjang) */}
            <h2
              ref={titleRef}
              style={{ fontSize: `${titleFontPx}px` }}
              className={`font-bold leading-snug tracking-tight text-slate-900 ${
                allowTitleWrap ? 'whitespace-normal' : 'whitespace-nowrap'
              }`}
            >
              {proposal.namaProposal}
            </h2>

            {/* Baris 2: Tipe & Tahun + Status Kunci */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <p className="min-w-0 truncate text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                {proposal.tipe} · Tahun {proposal.tahun}
              </p>

              <div
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  proposal.status === 'locked'
                    ? 'bg-slate-900 text-white'
                    : 'bg-teal-50 text-teal-800'
                }`}
              >
                {proposal.status === 'locked' ? (
                  <>
                    <Lock className="h-3 w-3 shrink-0" />
                    <span>Terkunci</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-3 w-3 shrink-0" />
                    <span>Terbuka</span>
                  </>
                )}
              </div>
            </div>

            {/* Baris 3 & 4: Status & Waktu Pembaruan (1 baris rapi) */}
            <div className="space-y-1">
              <p className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-slate-600">
                <span className="shrink-0">Status :</span>
                <span
                  className={`truncate ${
                    proposal.checklist.dinas
                      ? 'font-semibold text-teal-700'
                      : 'font-medium text-slate-700'
                  }`}
                >
                  {proposal.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                </span>
              </p>
              <p className="truncate whitespace-nowrap text-xs text-slate-400 tabular-nums">
                Diperbarui {formatUploadDateTime(proposal.updatedAt)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t border-b border-slate-100 py-3.5">
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Total
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-slate-900 tabular-nums">
                {kpmCounts.total}{' '}
                <span className="text-xs font-medium text-slate-400">
                  / {proposal.jumlahKpm ?? 66}
                </span>
              </p>
            </div>
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Diterima
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-teal-700 tabular-nums">
                {kpmCounts.accepted}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Sisa Kuota
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-slate-700 tabular-nums">
                {kpmCounts.remainingQuota}
              </p>
            </div>
          </div>

          {/* Document Checklist Inline Strip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {[
              {
                label: 'DOCX',
                done: Boolean(proposal.documents?.proposalOpd || proposal.documents?.proposalLurahCamat),
              },
              { label: 'RAB', done: Boolean(proposal.documents?.rab) },
              { label: 'Cap RT', done: Boolean(proposal.documents?.capRt) },
              { label: 'Cap RW', done: Boolean(proposal.documents?.capRw) },
              { label: 'Cap Lurah', done: Boolean(proposal.documents?.capLurah) },
              { label: 'Cap Camat', done: Boolean(proposal.documents?.capCamat) },
            ].map((item) => (
              <span
                key={item.label}
                className={`inline-flex items-center gap-1 font-medium ${
                  item.done ? 'text-teal-700' : 'text-slate-400'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </span>
            ))}
          </div>

          {kpmCounts.total === 0 ? (
            <div className="mt-4 space-y-2">
              {proposal.status !== 'locked' && canAdd && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => onAddKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Tambah KPM'}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Tambah KPM</span>
                </button>
              )}
              {emptySlotsCount > 0 && (
                <button
                  type="button"
                  onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-900 hover:bg-amber-100/70"
                >
                  <span>Tersedia {emptySlotsCount} Baris Kosong (slot pengganti SK/BAST)</span>
                  <span className="shrink-0 underline">Lihat Slot</span>
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">Lihat Daftar KPM ({kpmCounts.total})</span>
                </button>

                {onOpenPhotoGallery && (
                  <button
                    type="button"
                    onClick={() => onOpenPhotoGallery(proposal.id)}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/80 px-3.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 active:scale-[0.98] whitespace-nowrap"
                  >
                    <Images className="h-4 w-4 shrink-0" />
                    <span>Galeri Foto</span>
                  </button>
                )}

                {proposal.status !== 'locked' && canUpdate && onTransferKpm && (
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={openTransferModal}
                    aria-label="Transfer KPM ke Proposal Lain"
                    title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Transfer KPM ke Proposal Lain'}
                    className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-teal-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                )}
              </div>

              {emptySlotsCount > 0 && (
                <button
                  type="button"
                  onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-900 hover:bg-amber-100/70"
                >
                  <span>Tersedia {emptySlotsCount} Baris Kosong untuk KPM pengganti</span>
                  <span className="shrink-0 underline">Isi Slot</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* Catatan Proposal (tepat di bawah container heading) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <StickyNote className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">Catatan Proposal</h2>
            </div>
            {canUpdate && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => onEditProposal(proposal.id)}
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Edit Catatan Proposal'}
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Pencil className="h-3 w-3" />
                <span>{proposal.catatan?.trim() ? 'Edit' : 'Tambah'}</span>
              </button>
            )}
          </div>
          {proposal.catatan?.trim() ? (
            <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
              {proposal.catatan.trim()}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              Belum ada catatan pada proposal ini.
            </p>
          )}
        </section>

        {/* Proporsi DTSEN Donut Ring */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Klasifikasi DTSEN</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sebaran kategori desil KPM yang terdaftar
          </p>

          {dtsenBreakdown.total === 0 ? (
            <p className="mt-4 py-4 text-center text-xs text-slate-400">
              Belum ada data KPM pada proposal ini.
            </p>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-28 w-28 shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={ringRadius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="12"
                  />
                  {dtsenBreakdown.segments.map((seg) => {
                    const length = (seg.count / dtsenBreakdown.total) * ringCircumference;
                    const dashOffset = -runningOffset;
                    runningOffset += length;
                    return (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r={ringRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="12"
                        strokeDasharray={`${length} ${ringCircumference}`}
                        strokeDashoffset={dashOffset}
                      />
                    );
                  })}
                </svg>
                {dtsenBreakdown.primarySegment && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-bold text-slate-900 tabular-nums leading-none">
                      {dtsenBreakdown.primarySegment.pct}%
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-slate-500">
                      {dtsenBreakdown.primarySegment.shortLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                {dtsenBreakdown.segments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass}`} />
                      <span className="truncate text-slate-700">{seg.label}</span>
                    </div>
                    <span className="shrink-0 font-medium text-slate-900 tabular-nums">
                      {seg.count} ({seg.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Pengaturan BAST & Jadwal Penyaluran Proposal */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">Info Surat BAST &amp; Jadwal</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                {hasCustomProposalBast ? 'Pengaturan khusus proposal ini' : 'Menggunakan pengaturan default'}
              </p>
            </div>
            {onSaveProposalBastConfig && canUpdate && (
              <button
                type="button"
                disabled={isOffline}
                onClick={openProposalBastModal}
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Setting BAST Proposal'}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <SlidersHorizontal className={`h-3.5 w-3.5 ${isOffline ? 'text-slate-400' : 'text-teal-700'}`} />
                <span>Setting</span>
              </button>
            )}
          </div>

          <dl className="divide-y divide-slate-100 px-4 text-xs">
            <div className="flex items-baseline gap-3 py-2.5">
              <dt className="w-24 shrink-0 text-[11px] font-medium text-slate-400">No. BAST</dt>
              <dd className="min-w-0 flex-1 font-semibold text-slate-900 break-words tabular-nums">
                {effectiveBastConfig.nomorBast || '-'}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-2.5">
              <dt className="w-24 shrink-0 text-[11px] font-medium text-slate-400">No. SK</dt>
              <dd className="min-w-0 flex-1 font-medium text-slate-700 break-words">
                {effectiveBastConfig.nomorSk || '-'}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-2.5">
              <dt className="w-24 shrink-0 text-[11px] font-medium text-slate-400">No. SP</dt>
              <dd className="min-w-0 flex-1 font-mono text-[11px] font-medium text-slate-700 break-all">
                {effectiveBastConfig.nomorPesanan || '-'}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-2.5">
              <dt className="w-24 shrink-0 text-[11px] font-medium text-slate-400">Serah Terima</dt>
              <dd className="min-w-0 flex-1 font-medium leading-relaxed text-slate-700">
                {(effectiveBastConfig.tanggalSerahTerimaCustomText || '').trim() ||
                  formatIndonesianDateWords(effectiveBastConfig.tanggalSerahTerimaIso)}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 py-2.5">
              <dt className="w-24 shrink-0 text-[11px] font-medium text-slate-400">Lokasi BAST</dt>
              <dd className="min-w-0 flex-1 font-medium text-slate-700">
                {proposalBastLocationLabel}
              </dd>
            </div>
          </dl>

          {matchedSchedule && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs">
              <div className="flex items-start gap-2.5">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-slate-900">
                    {formatScheduleDateTimeForCoupon(
                      matchedSchedule.targetDate,
                      matchedSchedule.targetTime,
                      matchedSchedule.targetDay
                    )}
                  </p>
                  {matchedSchedule.location && (
                    <p className="flex items-center gap-1 text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{matchedSchedule.location}</span>
                    </p>
                  )}
                  {matchedSchedule.notes && (
                    <p className="text-[11px] text-slate-500">
                      {matchedSchedule.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {bastFeedback && (
            <div className="border-t border-slate-100 px-4 pt-3">
              <p
                className={`rounded-xl px-3 py-2 text-xs font-medium ${
                  bastFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {bastFeedback.text}
              </p>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-100 px-4 py-3.5">
            {/* Aksi Utama: Surat BAST & SPTJM */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={proposalRecords.length === 0 || bastBusy}
                onClick={() => void handleExportProposalBast()}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-700 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
              >
                {bastBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>Cetak BAST</span>
              </button>

              <button
                type="button"
                disabled={proposalRecords.length === 0 || sptjmBusy}
                onClick={() => void handleExportProposalSptjm()}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {sptjmBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                )}
                <span>Download SPTJM</span>
              </button>
            </div>

            {/* Aksi Pendukung: Data Tabel & Label */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={(proposalRecords.length === 0 && emptySlotsCount === 0) || kpmPdfBusy}
                onClick={() => void handleExportProposalKpmPdf()}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {kpmPdfBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span>Data KPM (PDF)</span>
              </button>

              <button
                type="button"
                disabled={(proposalRecords.length === 0 && emptySlotsCount === 0) || kpmXlsxBusy}
                onClick={() => void handleExportProposalKpmXlsx()}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {kpmXlsxBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span>Data KPM (Excel)</span>
              </button>

              <button
                type="button"
                disabled={dinsosFixedCount === 0 || dinsosBusy}
                onClick={() => void handleExportProposalDinsos()}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white disabled:opacity-50"
              >
                {dinsosBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className="tabular-nums">Nomor DINSOS ({dinsosFixedCount})</span>
              </button>

              <button
                type="button"
                disabled={(proposalRecords.length === 0 && emptySlotsCount === 0) || absensiBusy}
                onClick={openAbsensiModal}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white disabled:opacity-50"
              >
                {absensiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span>Absensi (PDF)</span>
              </button>
            </div>

            {onOpenProposalBuilder && (
              <button
                type="button"
                onClick={() => onOpenProposalBuilder(proposal.id)}
                className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>Buat Proposal (F4 · OPD / Wilayah)</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}
          </div>
        </section>
    </>
  );

  const breakdownsBlock = (
    <>
        {/* Pantauan Pengambilan Item & Sub-Item KPM (Web & Mobile/Android) */}
        {subItemTrackerData.counts.total > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={expandedSections.subItemTracker}
              onClick={() => toggleBreakdownSection('subItemTracker')}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
                expandedSections.subItemTracker ? 'border-b border-slate-100' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <PackageCheck className="h-4 w-4 shrink-0 text-teal-700" />
                <h2 className="truncate text-sm font-bold text-slate-900">
                  Pantauan Item &amp; Sub-Item
                </h2>
                <span className="shrink-0 text-xs font-medium text-slate-500 tabular-nums">
                  · {subItemTrackerData.counts.incomplete} Belum Lengkap
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  expandedSections.subItemTracker ? 'rotate-180' : ''
                }`}
              />
            </button>

            {expandedSections.subItemTracker && (
              <div className="space-y-3 p-3.5">
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      {
                        key: 'incomplete',
                        label: `Belum Lengkap (${subItemTrackerData.counts.incomplete})`,
                      },
                      {
                        key: 'partial',
                        label: `Sebagian (${subItemTrackerData.counts.partial})`,
                      },
                      {
                        key: 'not_taken',
                        label: `Belum (${subItemTrackerData.counts.notTaken})`,
                      },
                      {
                        key: 'complete',
                        label: `Lengkap (${subItemTrackerData.counts.complete})`,
                      },
                      { key: 'all', label: `Semua (${subItemTrackerData.counts.total})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSubItemTrackerFilter(tab.key)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap tabular-nums ${
                        subItemTrackerFilter === tab.key
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={subItemTrackerQuery}
                    onChange={(e) => setSubItemTrackerQuery(e.target.value)}
                    placeholder="Cari nama KPM atau sub-item..."
                    className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
                  />
                </div>

                {filteredSubItemTrackerRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-5 text-center text-xs text-slate-500">
                    Tidak ada KPM pada filter status ini.
                  </p>
                ) : (
                  <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                    {filteredSubItemTrackerRows.map((row) => (
                      <button
                        key={`prop-subtracker-${row.record.id}`}
                        type="button"
                        onClick={() => onSelectKpm?.(row.record)}
                        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-teal-50/40 active:bg-teal-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {row.slotNumber && (
                              <span className="shrink-0 font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                                #{String(row.slotNumber).padStart(2, '0')}
                              </span>
                            )}
                            <span className="truncate text-xs font-bold text-slate-900">
                              {row.record.nama}
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-slate-500">
                              · {row.record.item || '-'}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 text-xs font-bold tabular-nums ${
                              row.statusCategory === 'complete'
                                ? 'text-emerald-700'
                                : row.statusCategory === 'partial'
                                  ? 'text-teal-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {row.takenCount}/{row.totalCount}
                          </span>
                        </div>

                        {row.takenNames.length > 0 && (
                          <p className="text-[11px] leading-relaxed text-emerald-800">
                            <span className="font-semibold">Sudah:</span>{' '}
                            {row.takenNames.join(', ')}
                          </p>
                        )}
                        {row.pendingNames.length > 0 && (
                          <p className="text-[11px] leading-relaxed text-amber-900">
                            <span className="font-semibold">Belum:</span>{' '}
                            {row.pendingNames.join(', ')}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Conditional Listing: Kelurahan (Collapsible, default collapsed) */}
        {showKelurahanCard && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={expandedSections.kelurahan}
              onClick={() => toggleBreakdownSection('kelurahan')}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
                expandedSections.kelurahan ? 'border-b border-slate-100' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Kelurahan</h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  · {kelurahanBreakdown.length} Kelurahan
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  expandedSections.kelurahan ? 'rotate-180' : ''
                }`}
              />
            </button>

            {expandedSections.kelurahan && (
              kelurahanBreakdown.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">
                  Belum ada KPM pada proposal ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {kelurahanBreakdown.map((kel) => {
                    const widthPct =
                      kpmCounts.total > 0 ? Math.round((kel.total / kpmCounts.total) * 100) : 0;
                    return (
                      <div key={kel.name} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-normal text-slate-800">
                            {kel.name}
                          </span>
                          <span className="shrink-0 text-xs font-medium text-slate-700 tabular-nums">
                            {kel.total}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-teal-700"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                            {kel.accepted} Diterima
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </section>
        )}

        {/* Rekap Item (Collapsible + Clickable KPM list) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={expandedSections.item}
            onClick={() => toggleBreakdownSection('item')}
            className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
              expandedSections.item ? 'border-b border-slate-100' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Item</h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                · {itemBreakdown.length} Item
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                expandedSections.item ? 'rotate-180' : ''
              }`}
            />
          </button>
          {expandedSections.item && (
            itemBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada item bantuan tercatat.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {itemBreakdown.map((row) => (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() => {
                      setDrillQuery('');
                      setKpmFilterDrill({
                        kind: 'item',
                        key: row.code,
                        title: `${row.code} — ${row.name}`,
                        subtitle: `${row.total} KPM · Item Bantuan`,
                      });
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/50 active:bg-teal-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-semibold text-teal-800">
                        {row.code}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-normal text-slate-800">{row.name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {row.accepted} Diterima · Ketuk untuk lihat KPM
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {row.total}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </section>

        {/* Sub-Item dalam Proposal (Collapsible) */}
        {subItemRecap.aggregates.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={expandedSections.subItem}
              onClick={() => toggleBreakdownSection('subItem')}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
                expandedSections.subItem ? 'border-b border-slate-100' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Sub-Item</h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  · {subItemRecap.aggregates.length} Sub-Item
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  expandedSections.subItem ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSections.subItem && (
              <div className="divide-y divide-slate-100">
                {subItemRecap.aggregates.map((sub) => (
                  <div key={sub.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-normal text-slate-800">{sub.name}</p>
                      <p className="truncate text-[11px] text-slate-500 tabular-nums">
                        {sub.packageSources.map((p) => `${p.code} (${p.total})`).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="text-sm font-medium text-slate-800">
                        {sub.totalNeeded} {sub.satuan || 'Unit'}
                      </p>
                      <p
                        className={`text-[11px] font-medium ${
                          sub.pendingCount > 0 ? 'text-amber-700' : 'text-teal-700'
                        }`}
                      >
                        {sub.pendingCount > 0 ? `Belum dibagi ${sub.pendingCount}` : 'Lengkap'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Rekap Pengelola (Collapsible + Clickable KPM list) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={expandedSections.pengelola}
            onClick={() => toggleBreakdownSection('pengelola')}
            className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
              expandedSections.pengelola ? 'border-b border-slate-100' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Pengelola</h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                · {pengelolaBreakdown.length} Pengelola
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                expandedSections.pengelola ? 'rotate-180' : ''
              }`}
            />
          </button>
          {expandedSections.pengelola && (
            pengelolaBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada pengelola tercatat.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pengelolaBreakdown.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => {
                      setDrillQuery('');
                      setKpmFilterDrill({
                        kind: 'pengelola',
                        key: row.name,
                        title: row.name,
                        subtitle: `${row.count} KPM · Pengelola`,
                      });
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/50 active:bg-teal-50"
                  >
                    <span className="truncate text-sm font-normal text-slate-800">{row.name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {row.count}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </section>

        {/* Rekap Pekerjaan (Collapsible + Clickable KPM list) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={expandedSections.pekerjaan}
            onClick={() => toggleBreakdownSection('pekerjaan')}
            className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
              expandedSections.pekerjaan ? 'border-b border-slate-100' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Pekerjaan</h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                · {pekerjaanBreakdown.length} Jenis
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                expandedSections.pekerjaan ? 'rotate-180' : ''
              }`}
            />
          </button>
          {expandedSections.pekerjaan && (
            pekerjaanBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada data pekerjaan tercatat.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pekerjaanBreakdown.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => {
                      setDrillQuery('');
                      setKpmFilterDrill({
                        kind: 'pekerjaan',
                        key: row.name,
                        title: row.name,
                        subtitle: `${row.count} KPM · Pekerjaan`,
                      });
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/50 active:bg-teal-50"
                  >
                    <span className="truncate text-sm font-normal text-slate-800">{row.name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">
                        {row.count}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </section>

        {/* Dokumentasi Proposal (hanya tampilkan berkas/foto yang sudah diunggah) */}
        {(() => {
          const uploadedDocSlots = proposalDocSlots.filter((slot) =>
            Boolean(proposal.documents?.[slot.key])
          );
          if (uploadedDocSlots.length === 0) return null;

          return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Dokumentasi</h3>
                  <p className="text-[11px] text-slate-500">
                    Disimpan langsung di Google Drive · Klik berkas atau foto untuk pratinjau
                  </p>
                </div>
                {docBusySlot && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Memproses Drive...</span>
                  </span>
                )}
              </div>

              <input
                ref={docFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                onChange={handleDocFileChange}
                className="sr-only"
              />

              {docError && (
                <div
                  role="alert"
                  className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{docError}</span>
                </div>
              )}

              <div className={`mt-3 grid grid-cols-2 gap-2.5 ${!isNativeApp ? 'md:grid-cols-3' : ''}`}>
                {uploadedDocSlots.map((slot) => {
                  const doc = proposal.documents?.[slot.key];
                  if (!doc) return null;
                  const Icon = slot.icon;
                  const isSlotBusy = docBusySlot === slot.key;
                  const editableDocs = Boolean(
                    proposal.status !== 'locked' && canUpdate && onUpdateProposalDocuments
                  );
                  const isImage = Boolean(doc.mimeType?.startsWith('image/'));
                  const isPdf =
                    doc.mimeType === 'application/pdf' ||
                    doc.fileName.toLowerCase().endsWith('.pdf');
                  const fileExt = doc.fileName.split('.').pop()?.toUpperCase() || 'FILE';
                  const downloadHref = getDocumentDownloadHref(doc);

                  return (
                    <div
                      key={slot.key}
                      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <button
                        type="button"
                        disabled={Boolean(docBusySlot)}
                        onClick={() => onPreviewDocument?.(doc, slot.label)}
                        className="relative block aspect-[1.45/1] w-full overflow-hidden bg-slate-200 text-left"
                      >
                        {isImage ? (
                          <DriveImage
                            doc={doc}
                            alt={slot.label}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-2.5 pb-6 text-center">
                            <div
                              className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white shadow-xs ${
                                isPdf
                                  ? 'border-rose-200 text-rose-600'
                                  : slot.key === 'rab'
                                    ? 'border-emerald-200 text-emerald-700'
                                    : 'border-teal-200 text-teal-700'
                              }`}
                            >
                              <Icon className="h-4.5 w-4.5" />
                            </div>
                            <span className="mt-1.5 font-mono text-[11px] font-bold text-slate-800">
                              {fileExt.slice(0, 5)}
                            </span>
                            <span className="mt-0.5 w-full truncate text-[10px] text-slate-500">
                              {doc.fileName}
                            </span>
                          </div>
                        )}
                        {isSlotBusy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-white">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </div>
                        )}
                        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {slot.label}
                        </span>
                      </button>

                      {(editableDocs || !isImage) && (
                        <div className="mt-auto flex items-center gap-1 border-t border-slate-200 bg-white p-1.5">
                          {!isImage && downloadHref && (
                            <a
                              href={downloadHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={doc.fileName}
                              aria-label={`Unduh ${slot.label}`}
                              title="Unduh"
                              className={`inline-flex min-h-[30px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 ${
                                editableDocs ? '' : 'flex-1'
                              }`}
                            >
                              <Download className="h-3 w-3" />
                              {!editableDocs && <span>Unduh</span>}
                            </a>
                          )}
                          {editableDocs && (
                            <>
                              <button
                                type="button"
                                disabled={Boolean(docBusySlot) || isOffline}
                                onClick={() =>
                                  handleTriggerDocUpload(slot.key, slot.label, slot.accept, doc)
                                }
                                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Ganti berkas'}
                                className="inline-flex min-h-[30px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Upload className="h-3 w-3" />
                                <span>Ganti</span>
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(docBusySlot) || isOffline}
                                onClick={() =>
                                  setPendingDeleteDoc({
                                    key: slot.key,
                                    label: slot.label,
                                    doc,
                                  })
                                }
                                aria-label={`Hapus ${slot.label}`}
                                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Hapus Berkas'}
                                className="inline-flex min-h-[30px] items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Hapus</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}
    </>
  );

  const historyBlock = (
    <>
        {/* Rekap Pergantian KPM & Item (Spesifik Proposal · Bisa Download PDF) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div
            className={`flex items-center justify-between gap-2 px-4 py-2.5 ${
              expandedSections.rekapPergantian ? 'border-b border-slate-100' : ''
            }`}
          >
            <button
              type="button"
              aria-expanded={expandedSections.rekapPergantian}
              onClick={() => toggleBreakdownSection('rekapPergantian')}
              className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left transition-colors hover:opacity-80"
            >
              <ArrowRightLeft className="h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-sm font-bold text-slate-900">Rekap Pergantian</h2>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    · {recapCounts.total} Perubahan
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  expandedSections.rekapPergantian ? 'rotate-180' : ''
                }`}
              />
            </button>

            <button
              type="button"
              disabled={recapPdfBusy}
              onClick={() => void handleExportChangeRecapPdf(combinedChangeRecapEntries)}
              title="Download Rekap Pergantian PDF (F4)"
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-teal-700 transition-colors hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50 whitespace-nowrap"
            >
              {recapPdfBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>PDF</span>
            </button>
          </div>

          {expandedSections.rekapPergantian && (
            <div className="space-y-3 p-4 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {recapCounts.kpmReplaced} Ganti KPM · {recapCounts.itemChanged} Ubah Item ·{' '}
                  {recapCounts.kpmVacated} KPM Keluar
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {onReplaceKpmInProposal &&
                    canUpdate &&
                    proposal.status !== 'locked' &&
                    proposalRecords.length > 0 && (
                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => openChangeRecapModal('replace')}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-teal-700 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span>Ganti KPM</span>
                      </button>
                    )}
                  {onAddManualProposalChange && canUpdate && (
                    <button
                      type="button"
                      disabled={isOffline}
                      onClick={() => openChangeRecapModal('manual')}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Catat Manual</span>
                    </button>
                  )}
                </div>
              </div>

              {combinedChangeRecapEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-5 text-center text-xs text-slate-500">
                  Belum ada catatan pergantian KPM atau item pada proposal ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {combinedChangeRecapEntries.slice(0, 4).map((entry) => {
                    const slotTag =
                      entry.slotNumber && entry.slotNumber > 0
                        ? `No. #${String(entry.slotNumber).padStart(2, '0')}`
                        : 'Tanpa No.';
                    const kindText =
                      entry.kind === 'kpm_replaced'
                        ? 'Pergantian KPM'
                        : entry.kind === 'item_changed'
                          ? 'Pergantian Item'
                          : entry.kind === 'kpm_vacated'
                            ? 'KPM Keluar'
                            : 'KPM Masuk';
                    const kindColor =
                      entry.kind === 'kpm_replaced'
                        ? 'text-teal-700'
                        : entry.kind === 'item_changed'
                          ? 'text-blue-700'
                          : entry.kind === 'kpm_vacated'
                            ? 'text-amber-700'
                            : 'text-emerald-700';

                    return (
                      <div key={entry.id} className="px-3.5 py-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-slate-800 tabular-nums">
                            {slotTag}
                          </span>
                          <span className={`font-semibold ${kindColor}`}>{kindText}</span>
                        </div>
                        {entry.kind === 'kpm_replaced' ? (
                          <p className="mt-1 font-medium text-slate-900">
                            <span className="text-slate-500 line-through">
                              {entry.oldKpmName || '-'}
                              {entry.oldItem ? ` (${entry.oldItem})` : ''}
                            </span>
                            <span className="mx-1.5 text-slate-400">→</span>
                            <span className="font-semibold text-teal-800">
                              {entry.newKpmName || '-'}
                              {entry.newItem ? ` (${entry.newItem})` : ''}
                            </span>
                          </p>
                        ) : entry.kind === 'item_changed' ? (
                          <p className="mt-1 font-medium text-slate-900">
                            {entry.oldKpmName || entry.newKpmName || '-'} ·{' '}
                            <span className="font-mono text-slate-500 line-through">
                              {entry.oldItem || '-'}
                            </span>{' '}
                            <span className="text-slate-400">→</span>{' '}
                            <span className="font-mono font-bold text-blue-700">
                              {entry.newItem || '-'}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1 font-medium text-slate-900">
                            {entry.oldKpmName || entry.newKpmName || '-'}
                            {entry.oldItem ? ` (${entry.oldItem})` : ''}
                          </p>
                        )}
                        {entry.reason && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                            {entry.reason}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
                          {formatUploadDateTime(entry.timestamp)} · {entry.actorName}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => openChangeRecapModal('list')}
                className="flex min-h-[40px] w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100"
              >
                <span>
                  Kelola &amp; Unduh Rekap Lengkap ({combinedChangeRecapEntries.length})
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Paling Bawah: Rekam Jejak (Collapsible, default collapsed + Lihat selengkapnya) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={expandedSections.rekamJejak}
            onClick={() => toggleBreakdownSection('rekamJejak')}
            className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 ${
              expandedSections.rekamJejak ? 'border-b border-slate-100' : ''
            }`}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <History className="h-4 w-4 shrink-0 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">Rekam Jejak</h2>
              {proposalHistory.length > 0 && (
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  · {proposalHistory.length} Aktivitas
                </span>
              )}
              {activeReconcileSnapshot && onUndoReconcileSnapshot && (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  Undo tersedia
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                expandedSections.rekamJejak ? 'rotate-180' : ''
              }`}
            />
          </button>

          {expandedSections.rekamJejak && (
            proposalHistory.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada riwayat perpindahan KPM atau rekonsiliasi pada proposal ini.
              </p>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {(() => {
                    const previewEntries = proposalHistory.slice(0, 5);
                    return previewEntries.map((entry) => {
                      const isReconcileApply = entry.registerCode === 'ACTLOG::reconcile_apply';
                      const isReconcileUndo = entry.registerCode === 'ACTLOG::reconcile_undo';

                      if (isReconcileApply || isReconcileUndo) {
                        const matchingActiveApply =
                          isReconcileApply &&
                          activeReconcileSnapshot &&
                          activeReconcileSnapshot.proposalId === proposal.id &&
                          (entry.toProposal === activeReconcileSnapshot.id ||
                            entry.timestamp === activeReconcileSnapshot.appliedAt);

                        return (
                          <div
                            key={entry.id}
                            className={`flex items-start gap-3 px-4 py-3 ${
                              matchingActiveApply ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                                isReconcileApply
                                  ? 'bg-teal-50 text-teal-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {isReconcileApply ? (
                                <Wrench className="h-4 w-4" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {isReconcileApply
                                    ? 'Troubleshooting & Rekonsiliasi BAST Dinas'
                                    : 'Undo Rekonsiliasi BAST Dinas'}
                                </p>
                                <span
                                  className={`shrink-0 text-xs font-semibold ${
                                    isReconcileApply ? 'text-teal-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isReconcileApply ? 'Apply BAST' : 'Dibatalkan'}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                                {entry.kpmName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                                {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                              </p>
                              {matchingActiveApply && onUndoReconcileSnapshot && (
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isOffline ||
                                      !canUpdate ||
                                      proposal.status === 'locked' ||
                                      undoBusy
                                    }
                                    onClick={() => setConfirmUndoOpen(true)}
                                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    <span>Batalkan Apply (Undo)</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const isIncoming =
                        entry.action === 'entered' || entry.action === 'moved_in';
                      const actionSummary =
                        entry.action === 'moved_in'
                          ? `Pindah masuk dari ${entry.fromProposal || 'proposal lain'}`
                          : entry.action === 'moved_out'
                            ? `Pindah keluar ke ${entry.toProposal || 'proposal lain'}`
                            : entry.action === 'removed'
                              ? 'Dihapus dari daftar proposal'
                              : 'Didaftarkan masuk ke proposal';

                      return (
                        <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                              isIncoming
                                ? 'bg-teal-50 text-teal-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {isIncoming ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {entry.kpmName}
                              </p>
                              <span
                                className={`shrink-0 text-xs font-semibold ${
                                  isIncoming ? 'text-teal-700' : 'text-amber-700'
                                }`}
                              >
                                {isIncoming ? 'Masuk' : 'Keluar'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600">{actionSummary}</p>
                            <p className="mt-1 text-xs text-slate-500 tabular-nums">
                              {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <button
                  type="button"
                  onClick={onOpenFullHistory}
                  className="flex min-h-[42px] w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100"
                >
                  <span>Lihat selengkapnya ({proposalHistory.length})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )
          )}
        </section>
    </>
  );

  let firstEmptySlotAssigned = false;

  const proposalKpmListBlock = (
    <section
      ref={kpmListSectionRef}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Daftar KPM</h2>
            <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800 tabular-nums">
              {proposalRecords.length} KPM
            </span>
            {emptySlotsCount > 0 && (
              <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 tabular-nums">
                {emptySlotsCount} Baris Kosong
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Klik baris KPM untuk membuka detail lengkap, atau isi Baris Kosong dari Database KPM
          </p>
        </div>
        <div className="flex flex-wrap shrink-0 items-center gap-2">
          {onOpenPhotoGallery && (
            <button
              type="button"
              onClick={() => onOpenPhotoGallery(proposal.id)}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 whitespace-nowrap"
            >
              <Images className="h-3.5 w-3.5 shrink-0" />
              <span>Galeri Foto</span>
            </button>
          )}
          <button
            type="button"
            disabled={(proposalRecords.length === 0 && emptySlotsCount === 0) || kpmPdfBusy}
            onClick={() => void handleExportProposalKpmPdf()}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {kpmPdfBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>Download PDF</span>
          </button>
          <button
            type="button"
            disabled={(proposalRecords.length === 0 && emptySlotsCount === 0) || kpmXlsxBusy}
            onClick={() => void handleExportProposalKpmXlsx()}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-50/80 px-3 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {kpmXlsxBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            <span>Excel (.xlsx)</span>
          </button>
          {proposal.status !== 'locked' && canAdd && (
            <button
              type="button"
              disabled={isOffline}
              onClick={() => onAddKpmInProposal(proposal.namaProposal, proposal.tahun)}
              title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Tambah KPM'}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Tambah KPM</span>
            </button>
          )}
        </div>
      </div>

      {highlightEmptySlots && emptySlotsCount > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-950">
          <p className="font-medium">
            <strong>{emptySlotsCount} Baris Kosong</strong> disorot. Klik{' '}
            <strong>+ Isi dari Database</strong> pada slot kosong untuk memilih KPM pengganti dari
            wilayah sesuai proposal.
          </p>
          {onDismissHighlightEmptySlots && (
            <button
              type="button"
              onClick={onDismissHighlightEmptySlots}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-800 hover:bg-amber-100"
              aria-label="Tutup sorotan"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={kpmListQuery}
            onChange={(e) => setKpmListQuery(e.target.value)}
            placeholder="Cari nama, NIK, alamat, kelurahan, atau pengelola..."
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
          />
          {kpmListQuery && (
            <button
              type="button"
              onClick={() => setKpmListQuery('')}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {itemBreakdown.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setKpmListItemFilter('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                kpmListItemFilter === 'all'
                  ? 'bg-teal-700 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              Semua ({proposalRecords.length})
            </button>
            {itemBreakdown.map((it) => (
              <button
                key={it.code}
                type="button"
                onClick={() => setKpmListItemFilter(it.code)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors tabular-nums ${
                  kpmListItemFilter === it.code
                    ? 'bg-teal-700 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {it.code} ({it.total})
              </button>
            ))}
          </div>
        )}
      </div>

      {filteredProposalSlots.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <Users className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2.5 text-sm font-semibold text-slate-900">
            {proposalRecords.length === 0 && emptySlotsCount === 0
              ? 'Belum ada KPM terdaftar di proposal ini'
              : 'Tidak ada KPM atau slot yang cocok dengan pencarian'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {proposalRecords.length === 0 && emptySlotsCount === 0
              ? 'Tambahkan KPM baru atau terima dari Database KPM ke proposal ini.'
              : 'Coba ubah kata kunci pencarian atau pilih filter item lain.'}
          </p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-16rem)] divide-y divide-slate-100 overflow-y-auto">
          {filteredProposalSlots.map((entry, idx) => {
            if (entry.kind === 'empty') {
              const seqLabel = String(entry.slotNumber).padStart(2, '0');
              const assignFirstRef = !firstEmptySlotAssigned;
              if (assignFirstRef) firstEmptySlotAssigned = true;
              const canFillEmpty =
                Boolean(onFillEmptySlotFromDatabase) &&
                proposal.status !== 'locked' &&
                canUpdate &&
                !isOffline;

              const canCreateEmpty =
                Boolean(onCreateForEmptySlot) &&
                proposal.status !== 'locked' &&
                canAdd &&
                !isOffline;

              return (
                <div
                  key={`empty-slot-${entry.slotNumber}`}
                  ref={assignFirstRef ? firstEmptySlotRef : undefined}
                  className={`flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-5 py-3 ${
                    highlightEmptySlots
                      ? 'bg-amber-100/75 ring-1 ring-inset ring-amber-300'
                      : 'bg-amber-50/70'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 font-mono text-xs font-bold text-amber-900 tabular-nums">
                      {seqLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
                          Baris Kosong
                        </span>
                        {entry.emptySlot.item && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            {entry.emptySlot.item}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-amber-900/80">
                        {entry.emptySlot.previousKpmName
                          ? `Slot bekas ${entry.emptySlot.previousKpmName}`
                          : 'Slot kuota BAST belum terisi · siap diisi KPM baru atau dari Database KPM'}
                      </p>
                    </div>
                  </div>

                  {(onCreateForEmptySlot || onFillEmptySlotFromDatabase) && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {onCreateForEmptySlot && (
                        <button
                          type="button"
                          disabled={!canCreateEmpty}
                          onClick={() =>
                            onCreateForEmptySlot(
                              proposal.id,
                              proposal.namaProposal,
                              proposal.tahun,
                              entry.slotNumber,
                              entry.emptySlot.item
                            )
                          }
                          title={
                            isOffline
                              ? 'Mode Offline (Hanya Baca)'
                              : proposal.status === 'locked'
                                ? 'Proposal Terkunci'
                                : 'Input KPM baru langsung pada slot ini'
                          }
                          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100/70 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Daftar Baru</span>
                        </button>
                      )}
                      {onFillEmptySlotFromDatabase && (
                        <button
                          type="button"
                          disabled={!canFillEmpty}
                          onClick={() => {
                            setDbPickerQuery('');
                            setDbPickerTargetSlot({
                              slotNumber: entry.slotNumber,
                              item: entry.emptySlot.item,
                            });
                          }}
                          title={
                            isOffline
                              ? 'Mode Offline (Hanya Baca)'
                              : proposal.status === 'locked'
                                ? 'Proposal Terkunci'
                                : 'Isi slot kosong dari Database KPM'
                          }
                          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          <Database className="h-3.5 w-3.5" />
                          <span>Dari Database</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            const rec = entry.record;
            const seqLabel =
              entry.slotNumber < 999999
                ? String(entry.slotNumber).padStart(2, '0')
                : String(idx + 1).padStart(2, '0');
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() =>
                  onSelectKpm
                    ? onSelectKpm(rec)
                    : onViewKpmInProposal(proposal.namaProposal, proposal.tahun)
                }
                className="flex min-h-[68px] w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 font-mono text-xs font-bold text-teal-800 tabular-nums">
                    {seqLabel}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-slate-900">{rec.nama}</p>
                      {rec.item && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                          {rec.item}
                        </span>
                      )}
                      {rec.dtsen && (
                        <span className="shrink-0 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                          {['1 - 5', '1-5', '1', '2', '3', '4', '5', '6 - 10', '6-10'].includes(
                            rec.dtsen.trim()
                          )
                            ? `Desil ${rec.dtsen}`
                            : rec.dtsen}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {formatNikDisplay(rec.nikKtp)}
                      {rec.kelurahan ? ` · ${rec.kelurahan}` : ''}
                      {rec.pengelola ? ` · ${rec.pengelola}` : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen pb-24">
      {/* Sub-Screen Header (Android View: APK & Phone Browser) */}
      {!isDesktopWeb && (
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Proposal</h1>
      </header>
      )}

      {isDesktopWeb ? (
        <main className="mx-auto grid max-w-[1440px] grid-cols-12 items-start gap-5 px-6 pt-6">
          <div className="col-span-12 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">Proposal</h1>
          </div>
          <div className="col-span-5 space-y-5">
            {overviewAndDtsenBlock}
            {breakdownsBlock}
            {historyBlock}
          </div>
          <div className="col-span-7 space-y-5 md:sticky md:top-6 self-start">
            {proposalKpmListBlock}
          </div>
        </main>
      ) : (
        <main className="space-y-4 px-4 pt-4">
          {overviewAndDtsenBlock}
          {(emptySlotsCount > 0 || highlightEmptySlots) && proposalKpmListBlock}
          {breakdownsBlock}
          {historyBlock}
        </main>
      )}

      {/* Persistent Bottom-Right Floating Pencil Edit Proposal Button */}
      {canUpdate && (
        <div
          className={`pointer-events-none fixed bottom-6 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4 ${
            !isNativeApp ? 'md:left-auto md:right-6 md:w-auto md:max-w-none md:translate-x-0 md:px-0' : ''
          }`}
        >
          <button
            type="button"
            disabled={isOffline}
            onClick={() => onEditProposal(proposal.id)}
            aria-label={isOffline ? 'Mode Offline (Hanya Baca)' : 'Edit Proposal'}
            title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Edit Proposal'}
            className={`pointer-events-auto inline-flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
              isOffline
                ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-400 shadow-slate-900/10'
                : 'bg-teal-700 text-white shadow-teal-900/25 hover:bg-teal-800'
            }`}
          >
            <Pencil className="h-[22px] w-[22px]" />
          </button>
        </div>
      )}

      {/* Modal Transfer KPM Antar Proposal / Tahun */}
      {isTransferModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-kpm-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => !isTransferring && setIsTransferModalOpen(false)}
        >
          <div
            className={`flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl ${
              !isNativeApp ? 'md:max-w-xl' : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 id="transfer-kpm-modal-title" className="text-base font-bold text-slate-900">
                  Transfer KPM Proposal
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Dari: {proposal.namaProposal} ({proposal.tahun})
                </p>
              </div>
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => setIsTransferModalOpen(false)}
                aria-label="Tutup"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Target Tahun & Proposal */}
              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-bold text-slate-800">1. Pilih Tujuan Transfer</p>
                {transferYearOptions.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Belum ada proposal lain yang berstatus Terbuka untuk menjadi tujuan transfer.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Tahun Tujuan
                      </label>
                      <select
                        value={transferYear}
                        onChange={(e) => handleTransferYearChange(e.target.value)}
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                      >
                        {transferYearOptions.map((yr) => (
                          <option key={yr} value={yr}>
                            Tahun {yr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Proposal Tujuan (Terbuka)
                      </label>
                      <select
                        value={transferTargetId}
                        onChange={(e) => setTransferTargetId(e.target.value)}
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                      >
                        {transferTargetOptions.map((tp) => {
                          const existingCount = records.filter(
                            (r) =>
                              r.validasi === 'accepted' &&
                              (r.proposalId
                                ? r.proposalId === tp.id
                                : r.proposal === tp.namaProposal && r.tahun === tp.tahun)
                          ).length;
                          return (
                            <option key={tp.id} value={tp.id}>
                              {tp.namaProposal} ({existingCount}/{tp.jumlahKpm ?? 66} KPM)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter & Select KPM */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate whitespace-nowrap text-xs font-bold text-slate-800">
                    2. Pilih KPM yang dipindahkan
                  </p>
                  {filteredTransferRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="shrink-0 whitespace-nowrap text-xs font-bold text-teal-700 hover:underline"
                    >
                      {allFilteredSelected ? 'Batalkan Semua' : 'Pilih Semua'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={transferQuery}
                      onChange={(e) => setTransferQuery(e.target.value)}
                      placeholder="Pencarian..."
                      className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <select
                    aria-label="Filter kelurahan domisili"
                    value={transferKelurahanFilter}
                    onChange={(e) => setTransferKelurahanFilter(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="all">
                      Semua Kelurahan ({proposalRecords.length})
                    </option>
                    {transferKelurahanOptions.map((kel) => (
                      <option key={kel.name} value={kel.name}>
                        {kel.name} ({kel.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {filteredTransferRecords.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-400">
                      Tidak ada KPM yang sesuai filter.
                    </p>
                  ) : (
                    filteredTransferRecords.map((rec) => {
                      const checked = selectedTransferIds.includes(rec.id);
                      const kelName = rec.kelurahan?.trim() || 'Belum ditentukan';
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => toggleSelectTransferId(rec.id)}
                          className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                            checked ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                              checked
                                ? 'border-teal-700 bg-teal-700 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {rec.nama}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {[kelName, rec.item?.trim() || 'Tanpa Item'].join(' · ')}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              rec.validasi === 'accepted'
                                ? 'bg-teal-50 text-teal-700'
                                : rec.validasi === 'rejected'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {rec.validasi === 'accepted'
                              ? 'Diterima'
                              : rec.validasi === 'rejected'
                                ? 'Ditolak'
                                : 'Menunggu'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5">
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => {
                  setConfirmTransferOpen(false);
                  setIsTransferModalOpen(false);
                }}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  isTransferring ||
                  selectedTransferIds.length === 0 ||
                  !transferTargetId
                }
                onClick={() => setConfirmTransferOpen(true)}
                className="min-h-[44px] flex-1 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {isTransferring
                  ? 'Memindahkan...'
                  : `Transfer (${selectedTransferIds.length} KPM)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal ("Yakin?") before executing Transfer KPM */}
      {confirmTransferOpen && isTransferModalOpen && (() => {
        const targetProp = transferTargetOptions.find((p) => p.id === transferTargetId);
        return (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => !isTransferring && setConfirmTransferOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Transfer KPM"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900">Yakin pindahkan KPM?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Apakah Anda yakin ingin memindahkan{' '}
                    <strong>{selectedTransferIds.length} KPM</strong> ke proposal{' '}
                    <strong>
                      {targetProp ? `${targetProp.namaProposal} (${targetProp.tahun})` : 'tujuan'}
                    </strong>
                    ?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={() => setConfirmTransferOpen(false)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={() => void handleConfirmTransfer()}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {isTransferring ? 'Memindahkan...' : 'Ya, Pindahkan'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Modal for Deleting Proposal Document */}
      {pendingDeleteDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => !docBusySlot && setPendingDeleteDoc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Berkas"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Hapus Berkas?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Berkas <strong>{pendingDeleteDoc.label}</strong> akan dipindahkan ke Trash Google
                  Drive dan kolom dokumen pada database Supabase akan dikosongkan.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={Boolean(docBusySlot)}
                onClick={() => setPendingDeleteDoc(null)}
                className="min-h-[42px] flex-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(docBusySlot)}
                onClick={() => void handleConfirmDeleteDocument()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {docBusySlot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{docBusySlot ? 'Menghapus...' : 'Ya, Hapus Berkas'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Setting Info Dinamis BAST Khusus Proposal */}
      {isBastModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
          onClick={() => !bastBusy && setIsBastModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Setting Info BAST Proposal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <FileCheck2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Setting Info BAST Proposal</h3>
                  <p className="text-[11px] text-slate-500">
                    {proposal.namaProposal} · Tahun {proposal.tahun}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBastModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2 text-[11px] text-teal-800">
                Pengaturan ini disimpan khusus untuk proposal{' '}
                <strong>{proposal.namaProposal}</strong> dan otomatis dipakai saat mencetak BAST
                satuan maupun BAST massal.
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  1. Nomor BAST
                </label>
                <input
                  type="text"
                  value={bastDraft.nomorBast}
                  onChange={(e) => setBastDraft((prev) => ({ ...prev, nomorBast: e.target.value }))}
                  placeholder="Kosongkan agar baris nomor di PDF tetap kosong (tulis tangan)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    2. Tanggal Serah Terima
                  </label>
                  <input
                    type="date"
                    value={bastDraft.tanggalSerahTerimaIso}
                    onChange={(e) =>
                      setBastDraft((prev) => ({
                        ...prev,
                        tanggalSerahTerimaIso: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Override Teks Tanggal (Opsional)
                  </label>
                  <input
                    type="text"
                    value={bastDraft.tanggalSerahTerimaCustomText || ''}
                    onChange={(e) =>
                      setBastDraft((prev) => ({
                        ...prev,
                        tanggalSerahTerimaCustomText: e.target.value,
                      }))
                    }
                    placeholder="Kosongkan untuk otomatis"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <p>
                  <strong className="text-slate-700">Pratinjau Tanggal:</strong>{' '}
                  {(bastDraft.tanggalSerahTerimaCustomText || '').trim() ||
                    formatIndonesianDateWords(bastDraft.tanggalSerahTerimaIso)}
                </p>
                <p className="mt-0.5">
                  <strong className="text-slate-700">Lokasi BAST:</strong>{' '}
                  {proposalBastLocationLabel}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  3. Nomor SK &amp; Tanggal SK
                </label>
                <input
                  type="text"
                  value={bastDraft.nomorSk}
                  onChange={(e) => setBastDraft((prev) => ({ ...prev, nomorSk: e.target.value }))}
                  placeholder="300.3.3/56/DINSOS tanggal 1 juli 2025"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    4. Nomor Pesanan (SP)
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nomorPesanan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, nomorPesanan: e.target.value }))
                    }
                    placeholder="EP-01K6M49TRC1H4TS8M7FRPN4C99"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    5. Tanggal Pemesanan
                  </label>
                  <input
                    type="text"
                    value={bastDraft.tanggalPemesanan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, tanggalPemesanan: e.target.value }))
                    }
                    placeholder="03 Oktober 2025"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Pilih Pejabat Dinas Default (Otomatis Isi Nama, Kelas, Jabatan &amp; NIP)
                </label>
                <select
                  value={
                    pejabatList.find(
                      (p) =>
                        p.nama.trim().toLowerCase() ===
                        (bastDraft.pejabatNama || '').trim().toLowerCase()
                    )?.id || ''
                  }
                  onChange={(e) => {
                    const picked = pejabatList.find((p) => p.id === e.target.value);
                    if (!picked) return;
                    setBastDraft((prev) => ({
                      ...prev,
                      pejabatNama: picked.nama,
                      pejabatPangkat: picked.kelas,
                      pejabatJabatan: picked.jabatan,
                      pejabatNip: normalizePejabatNipNumber(picked.nip).trim(),
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-600"
                >
                  <option value="">-- Pilih Pejabat atau Ubah Manual di Bawah --</option>
                  {pejabatList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                      {p.kelas ? ` (${p.kelas})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    6. Nama Pejabat Dinas
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatNama}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatNama: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    7. Jabatan + OPD + Provinsi
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatJabatan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatJabatan: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Kelas / Pangkat / Golongan
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatPangkat}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatPangkat: e.target.value }))
                    }
                    placeholder="Contoh: Pembina Utama Muda / (IV/c)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    NIP Pejabat (tanpa &ldquo;NIP.&rdquo;)
                  </label>
                  <div className="flex w-full items-center overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-teal-600">
                    <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-500">
                      NIP.
                    </span>
                    <input
                      type="text"
                      value={normalizePejabatNipNumber(bastDraft.pejabatNip)}
                      onChange={(e) =>
                        setBastDraft((prev) => ({
                          ...prev,
                          pejabatNip: normalizePejabatNipNumber(e.target.value),
                        }))
                      }
                      placeholder="19770830 199603 1 001"
                      className="w-full border-0 bg-transparent px-3 py-2 text-xs text-slate-800 tabular-nums outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5">
              {hasCustomProposalBast && onSaveProposalBastConfig && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={handleResetProposalBastToDefault}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Default</span>
                </button>
              )}
              <button
                type="button"
                disabled={isOffline}
                onClick={handleSaveProposalBastOnly}
                className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-600 bg-white px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Simpan Info BAST</span>
              </button>
              {proposalRecords.length > 0 && (
                <button
                  type="button"
                  disabled={bastBusy || isOffline}
                  onClick={() => {
                    onSaveProposalBastConfig?.(proposal.id, bastDraft);
                    setIsBastModalOpen(false);
                    void handleExportProposalBast(bastDraft);
                  }}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Simpan &amp; Cetak ({proposalRecords.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal Daftar KPM Berdasarkan Klik Pengelola / Item / Pekerjaan */}
      {kpmFilterDrill && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setKpmFilterDrill(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Daftar KPM ${kpmFilterDrill.title}`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                  {kpmFilterDrill.subtitle}
                </p>
                <h3 className="mt-0.5 truncate text-base font-bold text-slate-900">
                  {kpmFilterDrill.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setKpmFilterDrill(null)}
                aria-label="Tutup daftar KPM"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={drillQuery}
                  onChange={(e) => setDrillQuery(e.target.value)}
                  placeholder="Cari nama, NIK, alamat, atau kelurahan..."
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {drillFilteredRecords.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Users className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs font-semibold text-slate-700">
                    Tidak ada KPM yang cocok dengan pencarian.
                  </p>
                </div>
              ) : (
                drillFilteredRecords.map(({ record: rec, displaySeq }, idx) => {
                  const seqLabel =
                    displaySeq < 999999
                      ? String(displaySeq).padStart(2, '0')
                      : String(idx + 1).padStart(2, '0');
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => {
                        setKpmFilterDrill(null);
                        if (onSelectKpm) {
                          onSelectKpm(rec);
                        } else {
                          onViewKpmInProposal(proposal.namaProposal, proposal.tahun);
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 font-mono text-xs font-bold text-teal-800 tabular-nums">
                          {seqLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {rec.nama}
                            </p>
                            {rec.item && (
                              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                                {rec.item}
                              </span>
                            )}
                            {rec.dtsen && (
                              <span className="shrink-0 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                                {['1 - 5', '1-5', '1', '2', '3', '4', '5', '6 - 10', '6-10'].includes(
                                  rec.dtsen.trim()
                                )
                                  ? `Desil ${rec.dtsen}`
                                  : rec.dtsen}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                            {[
                              formatNikDisplay(rec.nikKtp),
                              rec.kelurahan,
                              rec.pengelola,
                              rec.pekerjaan,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Picker Database KPM untuk Mengisi Baris Kosong (Auto-Filter Wilayah Proposal) */}
      {dbPickerTargetSlot && onFillEmptySlotFromDatabase && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setDbPickerTargetSlot(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Isi Baris Kosong dari Database KPM"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3.5 rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  Isi Baris Kosong #{String(dbPickerTargetSlot.slotNumber).padStart(2, '0')} dari
                  Database
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {proposal.namaProposal}
                  {dbPickerTargetSlot.item ? ` · Item BAST: ${dbPickerTargetSlot.item}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDbPickerTargetSlot(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(proposalAreaScope.hasScope || dbPickerTargetSlot.item) && (
              <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-900">
                {proposalAreaScope.hasScope && (
                  <p className="font-medium">
                    Filter wilayah aktif: <strong>{proposalAreaScope.scopeLabel}</strong>
                  </p>
                )}
                {dbPickerTargetSlot.item && (
                  <p className="text-[11px] text-teal-800/90">
                    KPM yang dipilih otomatis disesuaikan item bantuannya mengikuti slot kosong:{' '}
                    <strong>{dbPickerTargetSlot.item}</strong>.
                  </p>
                )}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                autoFocus
                value={dbPickerQuery}
                onChange={(e) => setDbPickerQuery(e.target.value)}
                placeholder="Cari nama, NIK, item, pengelola, catatan..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200">
              {databasePickerCandidates.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs font-medium text-slate-600">
                    {proposalAreaScope.hasScope
                      ? `Tidak ada KPM berstatus Menunggu dari ${proposalAreaScope.scopeLabel} di Database KPM.`
                      : 'Tidak ada KPM berstatus Database yang cocok.'}
                  </p>
                </div>
              ) : (
                databasePickerCandidates.slice(0, 60).map((cand) => {
                  const dom = resolveKpmDomicile(cand, allProposals, wilayahList);
                  const targetSlotItem = (dbPickerTargetSlot.item || '').trim().toUpperCase();
                  const candItem = (cand.item || '').trim().toUpperCase();
                  const isSameItem = Boolean(targetSlotItem) && candItem === targetSlotItem;
                  const willChangeItem = Boolean(targetSlotItem) && candItem !== targetSlotItem;
                  const isExOverQuota = Boolean(
                    cand.catatan && cand.catatan.includes('Over Kuota BAST')
                  );
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        onFillEmptySlotFromDatabase(
                          cand.id,
                          proposal.namaProposal,
                          proposal.tahun,
                          dbPickerTargetSlot.slotNumber,
                          dbPickerTargetSlot.item
                        );
                        setDbPickerTargetSlot(null);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-teal-50/70"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {cand.nama}
                          </span>
                          {isSameItem && (
                            <span className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                              Item Cocok
                            </span>
                          )}
                          {willChangeItem && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              {candItem || 'Tanpa Item'} → {targetSlotItem}
                            </span>
                          )}
                          {isExOverQuota && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              Over Kuota
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {cand.item || 'Tanpa Item'}
                          {dom.kelurahan ? ` · ${dom.kelurahan}` : ''}
                          {dom.kecamatan ? ` · ${dom.kecamatan}` : ''}
                          {cand.pengelola ? ` · ${cand.pengelola}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white">
                        Pilih
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Undo Apply Terakhir dari Detail Proposal */}
      {confirmUndoOpen && activeReconcileSnapshot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Undo Apply Terakhir"
          onClick={() => !undoBusy && setConfirmUndoOpen(false)}
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
                  <strong>{activeReconcileSnapshot.proposalName}</strong> &amp; Database ke kondisi
                  sebelum Apply?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={undoBusy}
                onClick={() => setConfirmUndoOpen(false)}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={undoBusy}
                onClick={() => void handleConfirmUndoProposal()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {undoBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{undoBusy ? 'Mengembalikan...' : 'Ya, Batalkan Apply'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rekap Pergantian KPM & Item (Spesifik Proposal + Ganti KPM 1-Klik + Export PDF) */}
      {isChangeRecapModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rekap Pergantian KPM dan Item"
          onClick={() => !replaceBusy && !recapPdfBusy && setIsChangeRecapModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Rekap Pergantian KPM &amp; Item
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {proposal.namaProposal} · {proposal.tahun} ({recapCounts.total} Catatan Perubahan)
                </p>
              </div>
              <button
                type="button"
                disabled={replaceBusy || recapPdfBusy}
                onClick={() => setIsChangeRecapModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-Navigation & Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setRecapFeedback(null);
                    setRecapSubMode('list');
                  }}
                  className={`inline-flex min-h-[34px] items-center rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    recapSubMode === 'list'
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Daftar Rekap ({recapCounts.total})
                </button>
                {onReplaceKpmInProposal &&
                  canUpdate &&
                  proposal.status !== 'locked' &&
                  proposalRecords.length > 0 && (
                    <button
                      type="button"
                      disabled={isOffline}
                      onClick={() => {
                        setRecapFeedback(null);
                        setRecapSubMode('replace');
                        if (!replaceOldKpmId && orderedProposalRecords[0]) {
                          setReplaceOldKpmId(orderedProposalRecords[0].record.id);
                        }
                      }}
                      className={`inline-flex min-h-[34px] items-center gap-1 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
                        recapSubMode === 'replace'
                          ? 'bg-teal-700 text-white'
                          : 'border border-slate-200 bg-white text-teal-800 hover:bg-teal-50'
                      }`}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      <span>Ganti KPM</span>
                    </button>
                  )}
                {onAddManualProposalChange && canUpdate && (
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() => {
                      setRecapFeedback(null);
                      setRecapSubMode('manual');
                    }}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
                      recapSubMode === 'manual'
                        ? 'bg-slate-800 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Catat Manual</span>
                  </button>
                )}
              </div>

              {recapSubMode === 'list' && (
                <button
                  type="button"
                  disabled={recapPdfBusy}
                  onClick={() => {
                    const activeFilterName =
                      recapKindFilter === 'kpm_replaced'
                        ? 'Pergantian KPM'
                        : recapKindFilter === 'item_changed'
                          ? 'Pergantian Item'
                          : recapKindFilter === 'kpm_vacated'
                            ? 'KPM Keluar'
                            : undefined;
                    void handleExportChangeRecapPdf(filteredChangeRecapEntries, activeFilterName);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {recapPdfBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Download PDF ({filteredChangeRecapEntries.length})</span>
                </button>
              )}
            </div>

            {recapFeedback && (
              <div
                className={`mx-5 mt-3 rounded-xl border px-3 py-2 text-xs font-medium ${
                  recapFeedback.type === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                {recapFeedback.text}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {recapSubMode === 'list' && (
                <div className="space-y-3">
                  {/* Filter & Search */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={recapQuery}
                        onChange={(e) => setRecapQuery(e.target.value)}
                        placeholder="Cari nomor urut, nama KPM lama/baru, item, keterangan..."
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 focus:border-teal-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { key: 'all', label: `Semua (${recapCounts.total})` },
                        { key: 'kpm_replaced', label: `Ganti KPM (${recapCounts.kpmReplaced})` },
                        { key: 'item_changed', label: `Ubah Item (${recapCounts.itemChanged})` },
                        { key: 'kpm_vacated', label: `KPM Keluar (${recapCounts.kpmVacated})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setRecapKindFilter(tab.key)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          recapKindFilter === tab.key
                            ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {filteredChangeRecapEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center">
                      <p className="text-xs font-semibold text-slate-700">
                        Belum ada catatan perubahan sesuai filter ini.
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Pergantian KPM, perubahan item bantuan, maupun KPM keluar otomatis tercatat di sini.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
                      {filteredChangeRecapEntries.map((entry) => {
                        const isStoredEntry =
                          !entry.id.startsWith('derived-empty-') &&
                          !entry.id.startsWith('derived-audit-');
                        const slotBadge =
                          entry.slotNumber && entry.slotNumber > 0
                            ? `#${String(entry.slotNumber).padStart(2, '0')}`
                            : '—';
                        const kindTitle =
                          entry.kind === 'kpm_replaced'
                            ? 'Pergantian KPM'
                            : entry.kind === 'item_changed'
                              ? 'Pergantian Item'
                              : entry.kind === 'kpm_vacated'
                                ? 'KPM Keluar (Kosong)'
                                : 'KPM Masuk';
                        const kindClass =
                          entry.kind === 'kpm_replaced'
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : entry.kind === 'item_changed'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : entry.kind === 'kpm_vacated'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200';

                        return (
                          <div key={entry.id} className="space-y-2 p-3.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums">
                                  {slotBadge}
                                </span>
                                <span
                                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${kindClass}`}
                                >
                                  {kindTitle}
                                </span>
                                {entry.source === 'manual' && (
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    Manual
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 tabular-nums">
                                {formatUploadDateTime(entry.timestamp)} · {entry.actorName}
                              </span>
                            </div>

                            {entry.kind === 'kpm_replaced' && (
                              <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-2">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    KPM Lama (Sebelum)
                                  </p>
                                  <p className="mt-0.5 font-semibold text-slate-800">
                                    {entry.oldKpmName || '-'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 tabular-nums">
                                    {entry.oldNik ? `NIK ${entry.oldNik}` : 'NIK -'}
                                    {entry.oldItem ? ` · ${entry.oldItem}` : ''}
                                    {entry.oldKelurahan ? ` · ${entry.oldKelurahan}` : ''}
                                  </p>
                                </div>
                                <div className="sm:border-l sm:border-slate-200 sm:pl-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">
                                    KPM Baru (Pengganti)
                                  </p>
                                  <p className="mt-0.5 font-bold text-teal-950">
                                    {entry.newKpmName || '-'}
                                  </p>
                                  <p className="text-[11px] text-teal-800/80 tabular-nums">
                                    {entry.newNik ? `NIK ${entry.newNik}` : 'NIK -'}
                                    {entry.newItem ? ` · ${entry.newItem}` : ''}
                                    {entry.newKelurahan ? ` · ${entry.newKelurahan}` : ''}
                                  </p>
                                </div>
                              </div>
                            )}

                            {entry.kind === 'item_changed' && (
                              <div className="rounded-xl bg-slate-50 p-2.5">
                                <p className="font-semibold text-slate-900">
                                  {entry.oldKpmName || entry.newKpmName || '-'}
                                  {entry.oldNik ? ` · NIK ${entry.oldNik}` : ''}
                                </p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-500 line-through border border-slate-200">
                                    {entry.oldItem || '-'}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono font-bold text-blue-900">
                                    {entry.newItem || '-'}
                                  </span>
                                </p>
                              </div>
                            )}

                            {(entry.kind === 'kpm_vacated' || entry.kind === 'kpm_added') && (
                              <div className="rounded-xl bg-slate-50 p-2.5">
                                <p className="font-semibold text-slate-900">
                                  {entry.kind === 'kpm_vacated'
                                    ? `${entry.oldKpmName || '-'} → Baris Kosong`
                                    : `Slot Baru → ${entry.newKpmName || '-'}`}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                                  {(entry.oldNik || entry.newNik) &&
                                    `NIK ${entry.oldNik || entry.newNik} · `}
                                  {entry.oldItem || entry.newItem || 'Tanpa Item'}
                                </p>
                              </div>
                            )}

                            {/* Keterangan + Edit/Delete untuk entri tersimpan */}
                            {editingReasonId === entry.id ? (
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <input
                                  type="text"
                                  value={editingReasonText}
                                  onChange={(e) => setEditingReasonText(e.target.value)}
                                  placeholder="Tulis keterangan alasan perubahan..."
                                  className="min-h-[34px] flex-1 rounded-lg border border-teal-400 px-2.5 text-xs text-slate-800 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateProposalChangeReason?.(entry.id, editingReasonText);
                                    setEditingReasonId(null);
                                  }}
                                  className="min-h-[34px] rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingReasonId(null)}
                                  className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-600">
                                  <span className="font-semibold text-slate-700">Ket:</span>{' '}
                                  {entry.reason || '—'}
                                </p>
                                {isStoredEntry && canUpdate && !isOffline && (
                                  <div className="flex items-center gap-1.5">
                                    {onUpdateProposalChangeReason && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingReasonId(entry.id);
                                          setEditingReasonText(entry.reason || '');
                                        }}
                                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                                      >
                                        Ubah Ket
                                      </button>
                                    )}
                                    {onDeleteProposalChange && (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteProposalChange(entry.id)}
                                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                                      >
                                        Hapus
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {recapSubMode === 'replace' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-3.5 py-2.5 text-xs text-teal-950">
                    Ganti KPM secara langsung di slot nomor urut yang sama. Nomor urut BAST tidak akan bergeser dan pergantian otomatis masuk ke Rekap Perubahan.
                  </div>

                  {/* Step 1: Pilih KPM Lama */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      1. Pilih KPM yang Diganti (Dari Proposal Ini)
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={replaceOldQuery}
                        onChange={(e) => setReplaceOldQuery(e.target.value)}
                        placeholder="Cari nomor urut atau nama KPM lama..."
                        className="min-h-[36px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs focus:border-teal-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {replaceOldOptions.map(({ record, displaySeq }) => {
                        const active = replaceOldKpmId === record.id;
                        const seqLabel =
                          displaySeq < 999999 ? String(displaySeq).padStart(2, '0') : '--';
                        return (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => setReplaceOldKpmId(record.id)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                              active ? 'bg-teal-50 font-semibold text-teal-950' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="mr-2 font-mono font-bold text-teal-800">
                                #{seqLabel}
                              </span>
                              <span>{record.nama}</span>
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                ({record.item || '-'}) · {record.kelurahan}
                              </span>
                            </div>
                            {active && <Check className="h-4 w-4 shrink-0 text-teal-700" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Pilih KPM Pengganti dari Database */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      2. Pilih KPM Pengganti (Database KPM ·{' '}
                      {proposalAreaScope.hasScope ? proposalAreaScope.scopeLabel : 'Semua Wilayah'})
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={replaceNewQuery}
                        onChange={(e) => setReplaceNewQuery(e.target.value)}
                        placeholder="Cari nama, NIK, atau kelurahan KPM pengganti..."
                        className="min-h-[36px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs focus:border-teal-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {replaceNewCandidates.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-slate-500">
                          Tidak ada KPM berstatus Database yang cocok di wilayah proposal ini.
                        </p>
                      ) : (
                        replaceNewCandidates.slice(0, 50).map((cand) => {
                          const active = replaceNewKpmId === cand.id;
                          const dom = resolveKpmDomicile(cand, allProposals, wilayahList);
                          return (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => setReplaceNewKpmId(cand.id)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                                active
                                  ? 'bg-teal-50 font-semibold text-teal-950'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-slate-900">{cand.nama}</p>
                                <p className="truncate text-[11px] text-slate-500 tabular-nums">
                                  {cand.item || 'Tanpa Item'} · {formatNikDisplay(cand.nikKtp)}
                                  {dom.kelurahan ? ` · ${dom.kelurahan}` : ''}
                                </p>
                              </div>
                              {active && <Check className="h-4 w-4 shrink-0 text-teal-700" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Step 3: Opsi Tujuan & Keterangan */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        KPM Lama Dipindahkan Ke
                      </label>
                      <select
                        value={replaceDestination}
                        onChange={(e) =>
                          setReplaceDestination(e.target.value as 'database' | 'rejected')
                        }
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      >
                        <option value="database">Database KPM (Menunggu)</option>
                        <option value="rejected">Arsip Berkas Ditolak</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Item Bantuan KPM Pengganti
                      </label>
                      <button
                        type="button"
                        onClick={() => setReplaceFollowSlotItem((prev) => !prev)}
                        className={`flex min-h-[38px] w-full items-center justify-between rounded-xl border px-3 text-xs font-semibold ${
                          replaceFollowSlotItem
                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <span>
                          {replaceFollowSlotItem
                            ? 'Ikuti Item KPM Lama (Slot)'
                            : 'Pakai Item Asli Pengganti'}
                        </span>
                        {replaceFollowSlotItem && <Check className="h-3.5 w-3.5 text-teal-700" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Alasan / Keterangan Pergantian (Opsional)
                    </label>
                    <input
                      type="text"
                      value={replaceReason}
                      onChange={(e) => setReplaceReason(e.target.value)}
                      placeholder="cth: Mengundurkan diri / Pindah domisili / Tidak hadir verifikasi"
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={replaceBusy}
                      onClick={() => setRecapSubMode('list')}
                      className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={replaceBusy || !replaceOldKpmId || !replaceNewKpmId}
                      onClick={() => void handleSubmitReplaceKpm()}
                      className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      {replaceBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      )}
                      <span>{replaceBusy ? 'Memproses...' : 'Simpan Pergantian'}</span>
                    </button>
                  </div>
                </div>
              )}

              {recapSubMode === 'manual' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    Catat riwayat pergantian KPM atau perubahan item secara manual (misalnya dari catatan berkas sebelum masuk sistem) agar ikut tercetak dalam PDF Rekap Perubahan.
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Jenis Perubahan
                      </label>
                      <select
                        value={manualKind}
                        onChange={(e) => setManualKind(e.target.value as ProposalChangeKind)}
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      >
                        <option value="kpm_replaced">Pergantian KPM (Lama → Baru)</option>
                        <option value="item_changed">Pergantian Item Bantuan</option>
                        <option value="kpm_vacated">KPM Keluar / Dikosongkan</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Nomor Urut Proposal (Opsional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={manualSlotNumber}
                        onChange={(e) => setManualSlotNumber(e.target.value)}
                        placeholder="cth: 4"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        {manualKind === 'item_changed' ? 'Nama KPM' : 'Nama KPM Lama'}
                      </label>
                      <input
                        type="text"
                        value={manualOldName}
                        onChange={(e) => setManualOldName(e.target.value)}
                        placeholder="cth: USMAN"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Item Lama
                      </label>
                      <input
                        type="text"
                        value={manualOldItem}
                        onChange={(e) => setManualOldItem(e.target.value)}
                        placeholder="cth: KPR"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs uppercase focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {manualKind !== 'kpm_vacated' && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {manualKind === 'kpm_replaced' && (
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Nama KPM Baru (Pengganti)
                          </label>
                          <input
                            type="text"
                            value={manualNewName}
                            onChange={(e) => setManualNewName(e.target.value)}
                            placeholder="cth: AHMAD YANI"
                            className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-teal-600 focus:outline-none"
                          />
                        </div>
                      )}
                      <div className={manualKind === 'item_changed' ? 'sm:col-span-3' : ''}>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Item Baru
                        </label>
                        <input
                          type="text"
                          value={manualNewItem}
                          onChange={(e) => setManualNewItem(e.target.value)}
                          placeholder="cth: OV"
                          className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs uppercase focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Keterangan / Alasan Perubahan
                    </label>
                    <input
                      type="text"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="cth: Pengajuan pergantian sebelum cetak BAST"
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 px-3 text-xs focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setRecapSubMode('list')}
                      className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitManualProposalChange}
                      className="min-h-[42px] flex-1 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
                    >
                      Tambahkan ke Rekap
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Download Daftar Absensi (Absen Dinas 2 Tipe + Absensi Kegiatan) */}
      {absensiModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download Daftar Absensi Dinas Sosial"
          onClick={() => !absensiBusy && setAbsensiModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-200/70 bg-indigo-50 text-indigo-700">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Download Absensi (PDF F4)</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Pilih tipe format Absen Dinas atau Absensi Kegiatan dengan kop logo
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={absensiBusy}
                onClick={() => setAbsensiModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Pilihan 4 Tipe Format Absen */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Pilih Jenis Format Absensi
              </label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(
                  [
                    {
                      id: 'daftar_hadir',
                      title: 'Daftar Hadir',
                      sub: 'Absen Dinas · Tanpa Yang Menyerahkan',
                    },
                    {
                      id: 'makan_minum',
                      title: 'Daftar Makan & Minum',
                      sub: 'Absen Dinas · Dengan Yang Menyerahkan & NIP',
                    },
                    {
                      id: 'kegiatan',
                      title: 'Absensi Kegiatan',
                      sub: 'Dinas Sosial · Logo Provinsi & Jadwal',
                    },
                    {
                      id: 'arsip',
                      title: 'Absen Arsip',
                      sub: 'DPRD Kalbar · TTD, WA, Item, Stat, Ket',
                    },
                  ] as const
                ).map((opt) => {
                  const active = absensiVariant === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAbsensiVariant(opt.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-600/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-bold leading-snug">{opt.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">{opt.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {absensiVariant === 'daftar_hadir' || absensiVariant === 'makan_minum' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <p className="text-[11px] font-bold leading-snug text-slate-900 uppercase">
                    {absensiVariant === 'makan_minum'
                      ? 'DAFTAR MAKAN MINUM PESERTA PENERIMA BANTUAN PERALATAN KERJA DI'
                      : 'DAFTAR HADIR PESERTA PENERIMA BANTUAN PERALATAN KERJA DI'}{' '}
                    {absensiLokasiJudul || proposal.namaProposal.toUpperCase()}
                  </p>
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    Kolom: NO · NAMA · NIK · ALAMAT · TANDA TANGAN
                    {absensiVariant === 'makan_minum'
                      ? ' · + Blok YANG MENYERAHKAN & NIP di akhir'
                      : ' · Tanpa tanda tangan Yang Menyerahkan'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Lokasi pada Judul
                    </label>
                    <input
                      type="text"
                      value={absensiLokasiJudul}
                      onChange={(e) => setAbsensiLokasiJudul(e.target.value)}
                      placeholder="cth: KECAMATAN PONTIANAK BARAT KOTA PONTIANAK"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs uppercase text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Baris Kosong Tambahan
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={absensiExtraBlankRows}
                      onChange={(e) => setAbsensiExtraBlankRows(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                {absensiVariant === 'makan_minum' && (
                  <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-slate-800">
                        Penandatangan "YANG MENYERAHKAN" (Opsional)
                      </p>
                      {pejabatList.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const found = pejabatList.find((p) => p.id === e.target.value);
                            if (found) {
                              setAbsensiHandoverName(found.nama);
                              setAbsensiHandoverNip(found.nip || '');
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">Ambil dari Data Pejabat...</option>
                          {pejabatList.map((pj) => (
                            <option key={pj.id} value={pj.id}>
                              {pj.nama}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10.5px] font-semibold text-slate-600">
                          Nama (Kosongkan agar cetak "( ..... )")
                        </label>
                        <input
                          type="text"
                          value={absensiHandoverName}
                          onChange={(e) => setAbsensiHandoverName(e.target.value)}
                          placeholder="Kosongkan bila diisi tulisan tangan"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-semibold text-slate-600">
                          NIP (Kosongkan agar cetak "NIP.")
                        </label>
                        <input
                          type="text"
                          value={absensiHandoverNip}
                          onChange={(e) => setAbsensiHandoverNip(e.target.value)}
                          placeholder="cth: 19750101 200501 1 001"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Pilih Buku Jadwal (Sumber Tanggal, Hari &amp; Pukul)
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {effectiveScheduleBooks.map((book) => {
                      const hasMatch = Boolean(
                        resolveScheduleForProposalInBook(
                          proposal.namaProposal,
                          proposal.tahun,
                          schedules,
                          book.id,
                          effectiveScheduleBooks
                        )
                      );
                      const active = absensiBookId === book.id;
                      return (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => applyAbsensiBookSchedule(book.id)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-all ${
                            active
                              ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-900 ring-1 ring-indigo-600/20'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{book.title}</span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              hasMatch
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {hasMatch ? 'Ada' : 'Kosong'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={`mt-1.5 text-[11px] font-medium ${
                      selectedAbsensiBookSchedule ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {selectedAbsensiBookSchedule
                      ? `Terisi otomatis dari jadwal proposal di buku "${
                          effectiveScheduleBooks.find((b) => b.id === absensiBookId)?.title ||
                          'Terpilih'
                        }".`
                      : 'Belum ada agenda proposal ini di buku terpilih — bisa diisi manual atau dikosongkan.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Tanggal
                    </label>
                    <input
                      type="text"
                      value={absensiTanggal}
                      onChange={(e) => setAbsensiTanggal(e.target.value)}
                      placeholder="cth: 23 November 2026"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Hari
                    </label>
                    <input
                      type="text"
                      value={absensiHari}
                      onChange={(e) => setAbsensiHari(e.target.value)}
                      placeholder="cth: Senin"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Pukul
                    </label>
                    <input
                      type="text"
                      value={absensiPukul}
                      onChange={(e) => setAbsensiPukul(e.target.value)}
                      placeholder="cth: 09:00 WIB"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      {absensiVariant === 'arsip' ? 'Judul Kegiatan' : 'Lokasi Kegiatan (Nama Proposal)'}
                    </label>
                    <input
                      type="text"
                      value={absensiLokasiKegiatan}
                      onChange={(e) => setAbsensiLokasiKegiatan(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {absensiVariant === 'arsip' && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Lokasi Pembagian
                      </label>
                      <input
                        type="text"
                        value={absensiLokasiPembagian}
                        onChange={(e) => setAbsensiLokasiPembagian(e.target.value)}
                        placeholder="cth: Jl. Paralel Tol 1, Gedung Albarokah Center"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Tahun Footer ARSP
                      </label>
                      <input
                        type="text"
                        value={absensiArsipFooterYear}
                        onChange={(e) => setAbsensiArsipFooterYear(e.target.value)}
                        placeholder="cth: 2025"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={absensiBusy}
                onClick={() => setAbsensiModalOpen(false)}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={absensiBusy}
                onClick={() => void handleExportProposalAbsensi()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
              >
                {absensiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>
                  {absensiBusy
                    ? 'Menyiapkan PDF...'
                    : absensiVariant === 'makan_minum'
                      ? 'Download Makan & Minum'
                      : absensiVariant === 'daftar_hadir'
                        ? 'Download Daftar Hadir'
                        : absensiVariant === 'arsip'
                          ? 'Download Absen Arsip'
                          : 'Download PDF Absensi'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
