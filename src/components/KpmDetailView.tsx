import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Home,
  ImagePlus,
  Images,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  PenTool,
  Plus,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Ticket,
  Trash2,
  Upload,
  User,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { ProposalPickerModal } from './ProposalPickerModal';
import { SignaturePadModal } from './SignaturePadModal';
import { SlotHandlingConfirmModal } from './SlotHandlingConfirmModal';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_PEJABAT_LIST,
  DEFAULT_SPTJM_TEMPLATE,
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDeleteAction,
  KpmDocumentFile,
  KpmDocuments,
  KpmRecord,
  PejabatProfile,
  ProposalBastMap,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  ScheduleEventItem,
  SharedKpmCard,
  SingleDocumentKey,
  SlotRemovalMode,
  SptjmTemplateConfig,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatNikDisplay,
  formatRupiah,
  formatUploadDateTime,
  formatWhatsAppUrl,
  getAbsenSeq,
  getDocumentDirectUrl,
  getDocumentThumbnailUrl,
  getKpmSlotNumberInProposal,
  getKpmSubItemStatusList,
  getPrimaryKpmPhoto,
  removeDocumentFromDrive,
  resolveKpmDomicile,
  resolvePackageForKpm,
  uploadImageDocumentToDrive,
} from '../utils/imageProcessor';
import {
  SPTJM_DAY_OPTIONS,
  exportKpmBastToPdf,
  exportKpmSptjmToPdf,
  exportKuponPdf,
  exportSingleKpmToPdf,
  formatBastProposalLocation,
  formatIndonesianDDMonthYYYY,
  formatIndonesianDateWords,
  formatSptjmFullDate,
  getSptjmAutoDayFromIso,
  normalizePejabatNipNumber,
  resolveCouponScheduleForRecord,
  resolveEffectiveBastConfig,
} from '../utils/pdfExporter';
import { openCekBansosWithNik } from '../services/cekBansos';
import { isNativeAppPlatform, useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';
import {
  extractPendingJobId,
  isLocalPendingDocument,
  PhotoCaptureSource,
  PhotoDocCategory,
  PhotoUploadJobSummary,
  retryPhotoUploadJob,
  subscribePhotoUploadJobs,
} from '../utils/photoUploadManager';

interface KpmDetailViewProps {
  record: KpmRecord;
  allRecords: KpmRecord[];
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  items: ItemBantuan[];
  auditLogs: KpmAuditLogEntry[];
  currentUserId: string;
  internalUsers: InternalUser[];
  userAliases?: Record<string, string>;
  canUpdate?: boolean;
  canDelete?: boolean;
  onBack: () => void;
  onEditRecord: (record: KpmRecord) => void;
  onDeleteRecord: (
    id: string,
    slotHandling?: SlotRemovalMode,
    deleteAction?: KpmDeleteAction
  ) => void;
  onUpdateStatus: (
    id: string,
    status: ValidationStatus,
    targetProposalId?: string,
    slotHandling?: SlotRemovalMode
  ) => void;
  onToggleAttendance?: (kpmId: string, nextPresent: boolean) => void;
  onToggleSubItem: (
    kpmId: string,
    subItemKey: string,
    subItemName: string,
    nextDelivered: boolean
  ) => void;
  onMarkAllSubItemsDelivered: (
    kpmId: string,
    subItems: { key: string; name: string }[]
  ) => void;
  onShareToChat: (recipientId: string, card: SharedKpmCard, message: string) => Promise<void>;
  onSelectDuplicateRecord: (record: KpmRecord) => void;
  onOpenProposal: (proposalName: string, tahun: string) => void;
  onOpenFullHistory: () => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
  onUpdateKpmDocuments?: (
    kpmId: string,
    nextDocuments: KpmDocuments,
    auditChange: { field: string; before: string; after: string }
  ) => Promise<void> | void;
  onEnqueuePhoto?: (
    kpmId: string,
    params: {
      file: File;
      source: PhotoCaptureSource;
      category: PhotoDocCategory;
      label: string;
      existingDoc?: KpmDocumentFile;
    }
  ) => Promise<void>;
  onCancelPendingPhoto?: (
    kpmId: string,
    jobId: string,
    category: PhotoDocCategory,
    label: string
  ) => Promise<void>;
  reportTemplate?: ReportTemplateConfig;
  schedules?: ScheduleEventItem[];
  couponConfig?: CouponPrintConfig;
  onSaveCouponConfig?: (next: CouponPrintConfig) => void;
  bastTemplate?: BastTemplateConfig;
  onSaveBastTemplate?: (next: BastTemplateConfig) => void;
  sptjmTemplate?: SptjmTemplateConfig;
  onSaveSptjmTemplate?: (next: SptjmTemplateConfig) => void;
  pejabatList?: PejabatProfile[];
  proposalBastMap?: ProposalBastMap;
  onSaveProposalBastConfig?: (
    proposalId: string,
    config: Partial<BastTemplateConfig> | null
  ) => void;
  onSaveBast?: (
    kpmId: string,
    file: File,
    meta: { recipientName: string; lat?: number; lng?: number; accuracy?: number }
  ) => Promise<void>;
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
}

async function compressKuponLogoFile(file: File): Promise<string> {
  const objectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : '';
  const src = objectUrl || (await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar logo.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  }));
  if (!src) {
    throw new Error('File gambar tidak valid.');
  }
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar logo tidak didukung.'));
      img.onload = () => {
        const maxDim = 220;
        const scale = Math.min(
          1,
          maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim)
        );
        const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser tidak mendukung pemrosesan logo.'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    });
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    }
  }
}

export function KpmDetailView({
  record,
  allRecords,
  proposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  items,
  auditLogs,
  currentUserId,
  internalUsers,
  userAliases = {},
  canUpdate = true,
  canDelete = true,
  onBack,
  onEditRecord,
  onDeleteRecord,
  onUpdateStatus,
  onToggleAttendance,
  onToggleSubItem,
  onMarkAllSubItemsDelivered,
  onShareToChat,
  onSelectDuplicateRecord,
  onOpenProposal,
  onOpenFullHistory,
  onPreviewDocument,
  onUpdateKpmDocuments,
  onEnqueuePhoto,
  onCancelPendingPhoto,
  reportTemplate,
  schedules = [],
  couponConfig,
  onSaveCouponConfig,
  bastTemplate,
  onSaveBastTemplate,
  sptjmTemplate,
  onSaveSptjmTemplate,
  pejabatList = DEFAULT_PEJABAT_LIST,
  proposalBastMap = {},
  onSaveProposalBastConfig,
  onSaveBast,
  feedback,
  onDismissFeedback,
}: KpmDetailViewProps) {
  const isNativeApp = isNativeAppPlatform();
  const isDesktopWeb = useIsDesktopWeb();
  const { isOffline } = useOfflineStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareRecipientId, setShareRecipientId] = useState<string>('');
  const [shareMessage, setShareMessage] = useState<string>('');
  const [sharingChat, setSharingChat] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingKuponPdf, setIsDownloadingKuponPdf] = useState(false);
  const [isDownloadingBastPdf, setIsDownloadingBastPdf] = useState(false);
  const [isDownloadingSptjmPdf, setIsDownloadingSptjmPdf] = useState(false);
  const kuponKalbarInputRef = useRef<HTMLInputElement | null>(null);
  const kuponGerindraInputRef = useRef<HTMLInputElement | null>(null);
  const [isKuponModalOpen, setIsKuponModalOpen] = useState(false);
  const [couponDraft, setCouponDraft] = useState<CouponPrintConfig>(
    () => couponConfig ?? DEFAULT_COUPON_CONFIG
  );
  const [matchedKuponScheduleTitle, setMatchedKuponScheduleTitle] = useState<string | null>(null);
  const [saveCouponDefault, setSaveCouponDefault] = useState(true);
  const [isBastModalOpen, setIsBastModalOpen] = useState(false);
  const [bastDraft, setBastDraft] = useState<BastTemplateConfig>(
    () => bastTemplate ?? DEFAULT_BAST_TEMPLATE
  );
  const [saveBastDefault, setSaveBastDefault] = useState(true);
  const [isSptjmModalOpen, setIsSptjmModalOpen] = useState(false);
  const [sptjmDraft, setSptjmDraft] = useState<SptjmTemplateConfig>(
    () => sptjmTemplate ?? DEFAULT_SPTJM_TEMPLATE
  );
  const [saveSptjmDefault, setSaveSptjmDefault] = useState(true);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [isProposalPickerOpen, setIsProposalPickerOpen] = useState(false);
  const [pendingStatusConfirm, setPendingStatusConfirm] = useState<{
    targetStatus: 'pending' | 'rejected';
  } | null>(null);
  const [pdfNotice, setPdfNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [docBusySlot, setDocBusySlot] = useState<string | null>(null);
  const [docBusyAction, setDocBusyAction] = useState<'preparing' | 'deleting' | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [vaultJobs, setVaultJobs] = useState<PhotoUploadJobSummary[]>([]);
  const pendingUploadTargetRef = useRef<{
    category: PhotoDocCategory;
    label: string;
    source: PhotoCaptureSource;
    existingDoc?: KpmDocumentFile;
  } | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{
    category: PhotoDocCategory;
    label: string;
    doc: KpmDocumentFile;
  } | null>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const detailMultiFileInputRef = useRef<HTMLInputElement>(null);
  const detailCameraInputRef = useRef<HTMLInputElement>(null);
  const heroCardRef = useRef<HTMLElement | null>(null);
  const [isHeroScrolledOut, setIsHeroScrolledOut] = useState(false);
  const [cekBansosStatus, setCekBansosStatus] = useState<string | null>(null);

  useEffect(() => {
    return subscribePhotoUploadJobs((jobs) => {
      setVaultJobs(jobs.filter((j) => j.kpmId === record.id));
    });
  }, [record.id]);

  useEffect(() => {
    if (isDesktopWeb) {
      setIsHeroScrolledOut(false);
      return;
    }
    const target = heroCardRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setIsHeroScrolledOut(false);
      return;
    }
    setIsHeroScrolledOut(false);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const scrolledPastTop =
          !entry.isIntersecting && entry.boundingClientRect.bottom < 72;
        setIsHeroScrolledOut(scrolledPastTop);
      },
      {
        rootMargin: '-64px 0px 0px 0px',
        threshold: 0,
      }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [record.id, isDesktopWeb]);

  const handleCheckNikAtKemensos = async () => {
    try {
      const result = await openCekBansosWithNik(record.nikKtp);
      setCekBansosStatus(
        result.openedInNativeWebView
          ? `Membuka Cek Bansos Kemensos dengan NIK ${result.nik} terisi otomatis.`
          : `NIK ${result.nik} disalin otomatis. Tempel di kolom NIK Cek Bansos lalu isi captcha.`
      );
      window.setTimeout(() => {
        setCekBansosStatus((prev) =>
          prev && prev.includes(result.nik) ? null : prev
        );
      }, 6000);
    } catch (err) {
      setCekBansosStatus(
        err instanceof Error ? err.message : 'Gagal membuka situs Cek Bansos.'
      );
    }
  };

  const isStandalone = record.validasi !== 'accepted' || !record.proposal?.trim();

  const matchingProposal = useMemo(
    () =>
      isStandalone
        ? undefined
        : (record.proposalId
            ? proposals.find((p) => p.id === record.proposalId)
            : undefined) ??
          proposals.find(
            (p) => p.namaProposal === record.proposal && p.tahun === record.tahun
          ) ??
          proposals.find((p) => p.namaProposal === record.proposal),
    [isStandalone, proposals, record.proposalId, record.proposal, record.tahun]
  );

  const resolvedDomicile = useMemo(
    () => resolveKpmDomicile(record, proposals, wilayahList),
    [record, proposals, wilayahList]
  );

  const displayKabKota = record.kabKota?.trim() || resolvedDomicile.kabKota;
  const displayKelurahan = record.kelurahan?.trim() || resolvedDomicile.kelurahan;
  const rawKecamatan = record.kecamatan?.trim() || resolvedDomicile.kecamatan;
  const displayKecamatan = rawKecamatan
    ? /^kecamatan\s+/i.test(rawKecamatan)
      ? rawKecamatan
      : `Kecamatan ${rawKecamatan}`
    : '';

  const standaloneContainerLabel =
    record.validasi === 'rejected' ? 'Arsip Ditolak' : 'Database KPM';
  const displayTahun = isStandalone
    ? record.tahun?.trim() || ''
    : record.tahun?.trim() || 'Tanpa Tahun';

  const isProposalLocked = !isStandalone && matchingProposal?.status === 'locked';

  const currentSlotNumber = useMemo(
    () =>
      getKpmSlotNumberInProposal(
        record,
        allRecords,
        proposals,
        items,
        wilayahList,
        proposalSlotMap
      ),
    [record, allRecords, proposals, items, wilayahList, proposalSlotMap]
  );

  const handleClickStatus = (nextStatus: ValidationStatus) => {
    if (isProposalLocked || !canUpdate || isOffline || nextStatus === record.validasi) return;
    if (nextStatus === 'accepted' && isStandalone) {
      setIsProposalPickerOpen(true);
      return;
    }
    if (
      (nextStatus === 'pending' || nextStatus === 'rejected') &&
      record.validasi === 'accepted' &&
      Boolean(record.proposal?.trim())
    ) {
      setPendingStatusConfirm({ targetStatus: nextStatus });
      return;
    }
    onUpdateStatus(record.id, nextStatus);
  };

  const resolvedPackage = useMemo(
    () => resolvePackageForKpm(items, record.tahun, record.item),
    [items, record.tahun, record.item]
  );

  const itemName = useMemo(() => {
    return resolvedPackage.name && resolvedPackage.name !== resolvedPackage.code
      ? `${resolvedPackage.code} — ${resolvedPackage.name}`
      : record.item;
  }, [resolvedPackage, record.item]);

  const subItemStatuses = useMemo(
    () => getKpmSubItemStatusList(record, items),
    [record, items]
  );

  const subItemStats = useMemo(() => {
    const total = subItemStatuses.length;
    const delivered = subItemStatuses.filter((s) => s.delivered).length;
    const pending = total - delivered;
    return {
      total,
      delivered,
      pending,
      isPartialDebt: delivered > 0 && pending > 0,
      isComplete: total > 0 && pending === 0,
    };
  }, [subItemStatuses]);

  const dtsenLabel = useMemo(() => {
    const found = DTSEN_OPTION_ITEMS.find((d) => d.value === record.dtsen);
    return found ? found.label : record.dtsen || '-';
  }, [record.dtsen]);

  // Live Duplication Analysis (NIK KTP & Nomor KK against all other records)
  const duplicateInfo = useMemo(() => {
    const matches: {
      record: KpmRecord;
      sameKtp: boolean;
      sameKk: boolean;
    }[] = [];

    let hasKtpMatch = false;
    let hasKkMatch = false;

    for (const other of allRecords) {
      if (other.id === record.id) continue;
      const sameKtp = Boolean(record.nikKtp && other.nikKtp === record.nikKtp);
      const sameKk = Boolean(record.nikKk && other.nikKk === record.nikKk);
      if (sameKtp || sameKk) {
        if (sameKtp) hasKtpMatch = true;
        if (sameKk) hasKkMatch = true;
        matches.push({ record: other, sameKtp, sameKk });
      }
    }

    const statusLabel =
      hasKtpMatch && hasKkMatch
        ? 'Duplikat NIK KTP & KK'
        : hasKtpMatch
          ? 'Duplikat NIK KTP'
          : hasKkMatch
            ? 'Duplikat Nomor KK'
            : 'Tidak Ada Duplikasi';

    return {
      hasDuplicates: matches.length > 0,
      statusLabel,
      matches,
    };
  }, [allRecords, record]);

  // Audit logs for this specific KPM (sorted newest first, keeping initial creation clearly tagged)
  const recordAuditLogs = useMemo(() => {
    const logs = auditLogs
      .filter((entry) => entry.kpmId === record.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (logs.length > 0) return logs;

    // Fallback creation entry if no explicit audit logs existed yet
    return [
      {
        id: `fallback-create-${record.id}`,
        kpmId: record.id,
        action: 'created' as const,
        actorName: 'Petugas Internal',
        timestamp: record.createdAt,
        proposal: record.proposal || standaloneContainerLabel,
        tahun: record.tahun?.trim() || '',
        changes: [
          {
            field: 'Penempatan Awal',
            before: '-',
            after: record.proposal
              ? `${record.proposal}${record.tahun?.trim() ? ` (${record.tahun.trim()})` : ''}`
              : `${standaloneContainerLabel}${record.tahun?.trim() ? ` (${record.tahun.trim()})` : ''}`,
          },
          { field: 'Item Bantuan', before: '-', after: itemName },
        ],
      },
    ];
  }, [auditLogs, record, itemName]);

  const initialCreationEntry = useMemo(() => {
    return (
      [...recordAuditLogs]
        .reverse()
        .find((l) => l.action === 'created') ?? recordAuditLogs[recordAuditLogs.length - 1]
    );
  }, [recordAuditLogs]);

  const renderStatusIndicator = (status: ValidationStatus) => {
    if (status === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Diterima
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Ditolak
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Menunggu
      </span>
    );
  };

  const rumahDocs = Array.isArray(record.documents.rumah)
    ? record.documents.rumah
    : record.documents.rumah
      ? [record.documents.rumah]
      : [];
  const lainnyaDocs = record.documents.lainnya || [];
  const heroPhotoDoc = getPrimaryKpmPhoto(record.documents);
  const heroWaUrl = formatWhatsAppUrl(record.kontak);

  const chatRecipients = useMemo(() => {
    const currentUser = internalUsers.find((u) => u.id === currentUserId);
    const isPrimaryDomi = currentUser?.email.toLowerCase() === 'vinsmoke.domi@gmail.com';
    return internalUsers
      .filter((u) => {
        if (u.id === currentUserId || u.status !== 'active') return false;
        if (
          isPrimaryDomi &&
          u.email.toLowerCase() === 'la.qsas@gmail.com' &&
          u.presenceStatus === 'offline' &&
          !u.fotoDataUrl
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aName = (userAliases[a.id] || '').trim() || a.nama;
        const bName = (userAliases[b.id] || '').trim() || b.nama;
        return aName.localeCompare(bName, 'id');
      });
  }, [internalUsers, currentUserId, userAliases]);

  const handleOpenShareModal = () => {
    if (isOffline) return;
    setShareRecipientId(chatRecipients[0]?.id || '');
    setShareMessage(`Mohon info terkait data KPM atas nama ${record.nama}.`);
    setIsShareModalOpen(true);
  };

  const handleTriggerSingleOrMultiUpload = (
    category: PhotoDocCategory,
    label: string,
    source: PhotoCaptureSource,
    existingDoc?: KpmDocumentFile
  ) => {
    if (isProposalLocked || !canUpdate) return;
    setDocError(null);
    pendingUploadTargetRef.current = { category, label, source, existingDoc };
    if (source === 'camera') {
      detailCameraInputRef.current?.click();
    } else if (category === 'rumah' || category === 'lainnya') {
      detailMultiFileInputRef.current?.click();
    } else {
      detailFileInputRef.current?.click();
    }
  };

  const handleDetailDocFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    const target = pendingUploadTargetRef.current;
    pendingUploadTargetRef.current = null;
    if (selectedFiles.length === 0 || !target) return;

    setDocError(null);
    const maxForCategory =
      target.category === 'rumah'
        ? Math.max(0, 3 - rumahDocs.length)
        : target.category === 'lainnya'
          ? Math.max(0, 5 - lainnyaDocs.length)
          : 1;
    const filesToProcess =
      target.category === 'rumah' || target.category === 'lainnya'
        ? selectedFiles.slice(0, maxForCategory)
        : [selectedFiles[0]];

    if (filesToProcess.length === 0) {
      setDocError(`Slot ${target.label} sudah penuh.`);
      return;
    }

    if (onEnqueuePhoto) {
      setDocBusySlot(target.existingDoc ? `${target.category}:${target.existingDoc.id}` : target.category);
      setDocBusyAction('preparing');
      try {
        for (const file of filesToProcess) {
          await onEnqueuePhoto(record.id, {
            file,
            source: target.source,
            category: target.category,
            label: target.label,
            existingDoc: target.existingDoc,
          });
        }
        if (selectedFiles.length > filesToProcess.length) {
          setDocError(
            `Hanya ${filesToProcess.length} foto pertama yang ditambahkan karena batas maksimal ${target.label}.`
          );
        }
      } catch (err) {
        setDocError(
          err instanceof Error ? err.message : 'Gagal menyimpan foto ke perangkat.'
        );
      } finally {
        setDocBusySlot(null);
        setDocBusyAction(null);
      }
      return;
    }

    if (!onUpdateKpmDocuments) return;
    const file = filesToProcess[0];
    setDocBusySlot(target.existingDoc ? `${target.category}:${target.existingDoc.id}` : target.category);
    setDocBusyAction('preparing');
    try {
      const uploaded = await uploadImageDocumentToDrive(file, target.existingDoc);
      const nextDocs: KpmDocuments = {
        ...record.documents,
        rumah: [...rumahDocs],
        lainnya: [...lainnyaDocs],
      };

      if (
        target.category === 'ktp' ||
        target.category === 'kk' ||
        target.category === 'penerima' ||
        target.category === 'survey'
      ) {
        nextDocs[target.category] = uploaded;
      } else if (target.category === 'rumah') {
        nextDocs.rumah = [...rumahDocs, uploaded].slice(0, 3);
      } else if (target.category === 'lainnya') {
        nextDocs.lainnya = [...lainnyaDocs, uploaded].slice(0, 5);
      }

      await onUpdateKpmDocuments(record.id, nextDocs, {
        field: target.label,
        before: target.existingDoc ? target.existingDoc.fileName : 'Kosong',
        after: uploaded.fileName,
      });
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : 'Gagal mengunggah atau mengganti foto ke Google Drive.'
      );
    } finally {
      setDocBusySlot(null);
      setDocBusyAction(null);
    }
  };

  const handleConfirmDeleteDocument = async () => {
    if (!pendingDeleteDoc || docBusySlot) return;
    const { category, label, doc } = pendingDeleteDoc;
    const isPendingDoc = isLocalPendingDocument(doc);
    if (!isPendingDoc && isOffline) return;

    setDocError(null);
    setDocBusySlot(`${category}:${doc.id}`);
    setDocBusyAction('deleting');
    try {
      if (isPendingDoc && onCancelPendingPhoto) {
        const jobId = extractPendingJobId(doc);
        if (jobId) {
          await onCancelPendingPhoto(record.id, jobId, category, label);
        }
        setPendingDeleteDoc(null);
        return;
      }

      if (!onUpdateKpmDocuments) return;
      await removeDocumentFromDrive(doc);
      const nextDocs: KpmDocuments = {
        ...record.documents,
        rumah: [...rumahDocs],
        lainnya: [...lainnyaDocs],
      };

      if (
        category === 'ktp' ||
        category === 'kk' ||
        category === 'penerima' ||
        category === 'survey'
      ) {
        delete nextDocs[category as SingleDocumentKey];
      } else if (category === 'rumah') {
        nextDocs.rumah = rumahDocs.filter((d) => d.id !== doc.id);
      } else if (category === 'lainnya') {
        nextDocs.lainnya = lainnyaDocs.filter((d) => d.id !== doc.id);
      }

      await onUpdateKpmDocuments(record.id, nextDocs, {
        field: label,
        before: doc.fileName || 'Ada foto',
        after: 'Dihapus',
      });
      setPendingDeleteDoc(null);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Gagal menghapus foto dari Google Drive.');
    } finally {
      setDocBusySlot(null);
      setDocBusyAction(null);
    }
  };

  const handleConfirmShare = async () => {
    if (!shareRecipientId || sharingChat || isOffline) return;
    setSharingChat(true);
    const card: SharedKpmCard = {
      kpmId: record.id,
      registerCode: record.registerCode,
      nama: record.nama,
      tahun: record.tahun || '-',
      item: record.item,
      itemName,
      proposal: record.proposal || standaloneContainerLabel,
      kontak: record.kontak,
      dtsen: record.dtsen,
      kelurahan: displayKelurahan,
      kecamatan: displayKecamatan,
      pengelola: record.pengelola,
      validasi: record.validasi,
      fotoDataUrl: heroPhotoDoc ? getDocumentDirectUrl(heroPhotoDoc) : undefined,
      fotoThumbnailUrl: heroPhotoDoc ? getDocumentThumbnailUrl(heroPhotoDoc) : undefined,
    };
    await onShareToChat(shareRecipientId, card, shareMessage.trim());
    setSharingChat(false);
    setIsShareModalOpen(false);
  };

  const handleDownloadKpmPdf = async () => {
    if (isDownloadingPdf) return;
    setPdfNotice(null);
    setIsDownloadingPdf(true);
    try {
      const res = await exportSingleKpmToPdf({
        record,
        proposals,
        items,
        wilayahList,
      });
      setPdfNotice({
        type: 'success',
        message: res.openedNative
          ? `PDF "${res.savedFileName}" berhasil dibuat dan dibuka.`
          : `PDF "${res.savedFileName}" berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF data KPM.',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleOpenSingleKuponModal = () => {
    const fallback = couponConfig ?? DEFAULT_COUPON_CONFIG;
    const resolved = resolveCouponScheduleForRecord(record, schedules, proposals, fallback);
    setCouponDraft({
      jadwal: resolved.jadwal,
      lokasi: resolved.lokasi,
      footerText: resolved.footerText || fallback.footerText || DEFAULT_COUPON_CONFIG.footerText,
      logoKalbarUrl: fallback.logoKalbarUrl || '',
      logoGerindraUrl: fallback.logoGerindraUrl || '',
    });
    setMatchedKuponScheduleTitle(resolved.matchedSchedule?.title || null);
    setSaveCouponDefault(!resolved.matchedSchedule);
    setIsKuponModalOpen(true);
  };

  const handleSingleKuponLogoUpload = async (
    slot: 'kalbar' | 'gerindra',
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressKuponLogoFile(file);
      setCouponDraft((prev) => ({
        ...prev,
        ...(slot === 'kalbar' ? { logoKalbarUrl: dataUrl } : { logoGerindraUrl: dataUrl }),
      }));
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses file logo kupon.',
      });
    }
  };

  const handleDownloadSingleKuponPdf = async () => {
    if (isDownloadingKuponPdf) return;
    setPdfNotice(null);
    setIsDownloadingKuponPdf(true);
    try {
      if (saveCouponDefault && !isOffline && onSaveCouponConfig) {
        onSaveCouponConfig(couponDraft);
      }
      const res = await exportKuponPdf({
        records: [record],
        allRecords,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        schedules,
        couponConfig: couponDraft,
        resolvePerProposalSchedule: false,
        mode: 'single',
      });
      setIsKuponModalOpen(false);
      setPdfNotice({
        type: 'success',
        message: res.openedNative
          ? `Kupon "${res.savedFileName}" berhasil dibuat dan dibuka.`
          : `Kupon "${res.savedFileName}" berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mencetak PDF Kupon.',
      });
    } finally {
      setIsDownloadingKuponPdf(false);
    }
  };

  const handleOpenBastModal = () => {
    setBastDraft(
      resolveEffectiveBastConfig(bastTemplate, proposalBastMap, matchingProposal?.id, reportTemplate)
    );
    setSaveBastDefault(true);
    setIsBastModalOpen(true);
  };

  const handleDownloadBastPdf = async () => {
    if (isDownloadingBastPdf) return;
    setPdfNotice(null);
    setIsDownloadingBastPdf(true);
    try {
      if (saveBastDefault && !isOffline) {
        if (matchingProposal && onSaveProposalBastConfig) {
          onSaveProposalBastConfig(matchingProposal.id, bastDraft);
        } else if (onSaveBastTemplate) {
          onSaveBastTemplate(bastDraft);
        }
      }
      const res = await exportKpmBastToPdf({
        record,
        allRecords,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        reportTemplate,
        bastConfig: bastDraft,
        proposalBastMap,
        useProposalBastMap: false,
      });
      setIsBastModalOpen(false);
      setPdfNotice({
        type: 'success',
        message: res.openedNative
          ? `BAST "${res.savedFileName}" berhasil dibuat dan dibuka.`
          : `BAST "${res.savedFileName}" berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mencetak PDF BAST.',
      });
    } finally {
      setIsDownloadingBastPdf(false);
    }
  };

  const handleOpenSptjmModal = () => {
    const merged = {
      ...DEFAULT_SPTJM_TEMPLATE,
      ...(sptjmTemplate || {}),
    };
    setSptjmDraft({
      ...merged,
      pejabatNip: normalizePejabatNipNumber(merged.pejabatNip).trim(),
    });
    setSaveSptjmDefault(true);
    setIsSptjmModalOpen(true);
  };

  const handleDownloadSptjmPdf = async () => {
    if (isDownloadingSptjmPdf) return;
    setPdfNotice(null);
    setIsDownloadingSptjmPdf(true);
    try {
      if (saveSptjmDefault && !isOffline && onSaveSptjmTemplate) {
        onSaveSptjmTemplate(sptjmDraft);
      }
      const effectiveKopBast = resolveEffectiveBastConfig(
        bastTemplate,
        proposalBastMap,
        matchingProposal?.id,
        reportTemplate
      );
      const res = await exportKpmSptjmToPdf({
        record,
        allRecords,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        reportTemplate,
        bastConfig: effectiveKopBast,
        sptjmConfig: sptjmDraft,
      });
      setIsSptjmModalOpen(false);
      setPdfNotice({
        type: 'success',
        message: res.openedNative
          ? `SPTJM "${res.savedFileName}" berhasil dibuat dan dibuka.`
          : `SPTJM "${res.savedFileName}" berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mencetak PDF SPTJM.',
      });
    } finally {
      setIsDownloadingSptjmPdf(false);
    }
  };

  const lockedBannerBlock = isProposalLocked ? (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-100 px-3.5 py-2.5 text-xs font-medium text-slate-700">
      <Lock className="h-4 w-4 shrink-0 text-slate-700" />
      <span>
        Proposal <strong>{record.proposal}</strong> berstatus Terkunci. Data KPM ini tidak
        dapat diubah, dipindahkan, atau dihapus.
      </span>
    </div>
  ) : null;

  const identityAndDupBlock = (
    <>
      {/* Hero Identity Card: Foto, Nama, Item, Proposal, Nomor HP */}
      <section
        ref={heroCardRef}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs"
      >
          {/* Card Top Bar */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <p className="truncate text-xs font-medium text-teal-800 tabular-nums">
              {[isStandalone ? '' : record.registerCode, displayTahun]
                .filter(Boolean)
                .join(' · ') || standaloneContainerLabel}
            </p>
            {renderStatusIndicator(record.validasi)}
          </div>

          {/* Core Identity Body */}
          <div className="p-4">
            <div className="flex items-start gap-3.5">
              {/* Foto KPM Fixed Frame */}
              {heroPhotoDoc ? (
                <button
                  type="button"
                  onClick={() => onPreviewDocument(heroPhotoDoc, record.nama)}
                  className="relative h-[88px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-xs"
                  aria-label={`Lihat foto ${record.nama}`}
                >
                  <DriveImage
                    doc={heroPhotoDoc}
                    alt={record.nama}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex h-[88px] w-[72px] shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-400">
                  <User className="h-8 w-8" />
                </div>
              )}

              {/* Nama, Item, Proposal, Pengelola, Nomor HP */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="break-words text-base font-bold leading-snug tracking-tight text-slate-900">
                  {record.nama}
                </h2>

                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Package className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span className="truncate font-medium">{itemName}</span>
                </div>

                {!isStandalone && record.proposal ? (
                  <button
                    type="button"
                    onClick={() => onOpenProposal(record.proposal, record.tahun)}
                    className="flex w-full items-start gap-1 text-left text-xs font-medium leading-snug text-teal-700 hover:underline"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">
                      {displayKelurahan &&
                      !record.proposal.toLowerCase().includes(displayKelurahan.toLowerCase())
                        ? `${record.proposal} · ${displayKelurahan}`
                        : record.proposal}
                    </span>
                  </button>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      {record.validasi === 'rejected' ? (
                        <Archive className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                      ) : (
                        <Database className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">{standaloneContainerLabel}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                      <span className="line-clamp-2 font-medium">
                        {displayKecamatan || displayKelurahan
                          ? [displayKecamatan, displayKelurahan].filter(Boolean).join(', ')
                          : 'Domisili belum diisi'}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span className="truncate font-medium">
                    Pengelola: {record.pengelola?.trim() || '-'}
                  </span>
                </div>

                <div className="pt-0.5">
                  {heroWaUrl && record.kontak ? (
                    <a
                      href={heroWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 tabular-nums"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{record.kontak}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Tanpa No. HP</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Validasi Quick Switch */}
            <div className="mt-4 border-t border-slate-100 pt-3.5">
              <div>
                <p className="text-xs font-medium text-slate-500">Ubah Status Validasi</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { key: 'pending', label: 'Menunggu' },
                      { key: 'rejected', label: 'Ditolak' },
                      { key: 'accepted', label: 'Diterima' },
                    ] as { key: ValidationStatus; label: string }[]
                  ).map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      disabled={isProposalLocked || !canUpdate || isOffline}
                      onClick={() => handleClickStatus(st.key)}
                      className={`min-h-[38px] rounded-xl px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        record.validasi === st.key
                          ? st.key === 'accepted'
                            ? 'bg-teal-700 text-white'
                            : st.key === 'rejected'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Container Terpisah: Aksi PDF, Kupon & Share ke Chat */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isDownloadingPdf}
              onClick={() => void handleDownloadKpmPdf()}
              className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-teal-700 px-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
            >
              {isDownloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {isDownloadingPdf ? 'Membuat...' : 'PDF'}
              </span>
            </button>

            <button
              type="button"
              disabled={isDownloadingKuponPdf}
              onClick={handleOpenSingleKuponModal}
              className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-teal-200 bg-teal-50/70 px-2 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60"
            >
              {isDownloadingKuponPdf ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Ticket className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">Kupon</span>
            </button>

            <button
              type="button"
              disabled={isOffline}
              onClick={handleOpenShareModal}
              className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-teal-200 bg-teal-50/70 px-2 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Chat</span>
            </button>
          </div>

          {pdfNotice && (
            <div
              role="status"
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                pdfNotice.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <span className="font-medium leading-snug">{pdfNotice.message}</span>
              <button
                type="button"
                onClick={() => setPdfNotice(null)}
                className="shrink-0 rounded p-0.5 text-current/70 hover:text-current"
                aria-label="Tutup notifikasi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Catatan Petugas (tampil tepat di bawah heading jika tidak ada duplikasi) */}
        {!duplicateInfo.hasDuplicates && record.catatan?.trim() && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Catatan Petugas</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{record.catatan}</p>
          </section>
        )}

        {/* Status Duplikasi NIK / KK */}
        {duplicateInfo.hasDuplicates ? (
          <section className="overflow-hidden rounded-2xl border border-amber-300 bg-white">
            <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-950">{duplicateInfo.statusLabel}</p>
                <p className="mt-0.5 text-xs text-amber-800 tabular-nums">
                  Ditemukan {duplicateInfo.matches.length} data KPM lain dengan NIK KTP atau Nomor KK
                  yang sama
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {duplicateInfo.matches.map(({ record: dup, sameKtp, sameKk }) => {
                const matchReason =
                  sameKtp && sameKk
                    ? 'NIK KTP & KK Sama'
                    : sameKtp
                      ? 'NIK KTP Sama'
                      : 'Nomor KK Sama';

                const dupStandalone = !dup.proposal?.trim() || dup.validasi !== 'accepted';

                return (
                  <button
                    key={dup.id}
                    type="button"
                    onClick={() => onSelectDuplicateRecord(dup)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {[dupStandalone ? '' : dup.registerCode, dup.nama]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-amber-800">
                        {matchReason} · {renderStatusIndicator(dup.validasi)}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        {dup.proposal
                          ? `${dup.proposal}${dup.tahun ? ` (${dup.tahun})` : ''}`
                          : `${dup.validasi === 'rejected' ? 'Arsip Ditolak' : 'Database KPM'}${dup.tahun ? ` (${dup.tahun})` : ''}`}{' '}
                        · DTSEN: {dup.dtsen}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {dup.pekerjaan} · Pengelola: {dup.pengelola}
                      </p>
                      {dup.catatan && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                          Catatan: {dup.catatan}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>

            {record.catatan?.trim() && (
              <div className="border-t border-amber-200 bg-amber-50/35 px-4 py-3">
                <p className="text-xs text-slate-500">Catatan Petugas</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">{record.catatan}</p>
              </div>
            )}
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">Pemeriksaan Duplikasi Bersih</p>
              <p className="text-[11px] text-slate-500">
                NIK KTP dan Nomor KK tidak tercatat ganda pada usulan lain
              </p>
            </div>
          </section>
        )}
    </>
  );

  const isAttending = Boolean(record.attendance?.present);

  const subItemAndBastBlock = (
    <>
        {/* Kehadiran (Absensi) KPM */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isAttending
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <UserCheck className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-slate-900">Kehadiran (Absensi)</h3>
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      isAttending
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isAttending ? 'Hadir' : 'Belum Hadir'}
                  </span>
                </div>
                <p
                  className={`mt-0.5 text-xs leading-snug ${
                    isAttending ? 'font-medium text-teal-700' : 'text-slate-500'
                  }`}
                >
                  {isAttending
                    ? `${record.attendance?.source === 'auto_photo' ? 'Sudah hadir (Otomatis dari Foto Penerima)' : 'Sudah hadir'}${record.attendance?.updatedAt ? ` · ${formatUploadDateTime(record.attendance.updatedAt)}` : ''}${record.attendance?.updatedBy && record.attendance?.source !== 'auto_photo' ? ` (${record.attendance.updatedBy})` : ''}`
                    : 'Aktifkan toggle untuk menandai KPM hadir saat penyaluran'}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isAttending}
              aria-label={`Kehadiran ${record.nama}`}
              disabled={isProposalLocked || !canUpdate || isOffline || !onToggleAttendance}
              onClick={() => onToggleAttendance?.(record.id, !isAttending)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                isAttending ? 'bg-teal-700' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-xs transition duration-200 ${
                  isAttending ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Penyaluran Sub-Item Bantuan (Interactive Toggles & Hutang Tracking) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Package className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Penyaluran Sub-Item</h3>
                <p className="text-xs leading-snug text-slate-500">
                  {[itemName || 'Tanpa Item', displayTahun].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-slate-900 tabular-nums">
                {subItemStats.delivered} / {subItemStats.total} Diterima
              </p>
              {(subItemStats.total === 0 ||
                subItemStats.isComplete ||
                subItemStats.isPartialDebt) && (
                <p
                  className={`text-[11px] font-semibold tabular-nums ${
                    subItemStats.isComplete
                      ? 'text-teal-700'
                      : subItemStats.isPartialDebt
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {subItemStats.total === 0
                    ? 'Tanpa sub-item'
                    : subItemStats.isComplete
                      ? 'Lengkap Diterima'
                      : `Hutang ${subItemStats.pending} Item`}
                </p>
              )}
            </div>
          </div>

          {subItemStatuses.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">
              Belum ada rincian sub-item untuk paket {record.item || 'bantuan'}
              {displayTahun ? ` (${displayTahun})` : ''}.
            </div>
          ) : (
            <>
              {subItemStats.isPartialDebt && (
                <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2 text-xs text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <span>
                    Penyelenggara masih berhutang{' '}
                    <strong>{subItemStats.pending} sub-item</strong> yang belum dibagikan.
                  </span>
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {subItemStatuses.map((sub) => (
                  <div
                    key={sub.key}
                    className="flex min-h-[58px] items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal text-slate-800">{sub.name}</p>
                      <p
                        className={`mt-0.5 text-[11px] font-medium ${
                          sub.delivered
                            ? 'text-teal-700'
                            : subItemStats.delivered > 0
                              ? 'text-amber-700'
                              : 'text-rose-600'
                        }`}
                      >
                        {sub.delivered
                          ? 'Sudah diterima'
                          : subItemStats.delivered > 0
                            ? 'Belum diterima · Hutang'
                            : 'Belum diterima'}
                        {sub.updatedAt ? ` · ${formatUploadDateTime(sub.updatedAt)}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={sub.delivered}
                      aria-label={`Status terima ${sub.name}`}
                      disabled={isProposalLocked || !canUpdate || isOffline}
                      onClick={() =>
                        onToggleSubItem(record.id, sub.key, sub.name, !sub.delivered)
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                        sub.delivered ? 'bg-teal-700' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-xs transition duration-200 ${
                          sub.delivered ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {!subItemStats.isComplete && !isProposalLocked && canUpdate && (
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() =>
                      onMarkAllSubItemsDelivered(
                        record.id,
                        subItemStatuses.map((s) => ({ key: s.key, name: s.name }))
                      )
                    }
                    className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Tandai Semua Sub-Item Sudah Diterima</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Tanda Terima Digital (BAST) & Berkas Penyerahan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <PenTool className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Tanda Terima &amp; Berkas Penyerahan</h3>
                <p className="text-xs text-slate-500">
                  Tanda tangan BAST lapangan serta cetak PDF BAST &amp; SPTJM ukuran F4
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {record.bast ? (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  {record.bast.signatureDoc ? (
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewDocument(record.bast!.signatureDoc!, 'Tanda Tangan BAST')
                      }
                      className="h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1"
                    >
                      <DriveImage
                        doc={record.bast.signatureDoc}
                        alt="Tanda Tangan BAST"
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-xs font-bold text-slate-900">
                      Penerima: {record.bast.recipientName}
                    </p>
                    <p className="text-[11px] text-slate-600 tabular-nums">
                      Ditandatangani: {formatUploadDateTime(record.bast.signedAt)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Petugas: {record.bast.signedBy}
                    </p>
                    {typeof record.bast.lat === 'number' && typeof record.bast.lng === 'number' && (
                      <a
                        href={`https://maps.google.com/?q=${record.bast.lat},${record.bast.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-semibold text-teal-700 hover:underline tabular-nums"
                      >
                        <MapPin className="h-3 w-3" />
                        <span>
                          {record.bast.lat.toFixed(5)}, {record.bast.lng.toFixed(5)}
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-center text-xs text-slate-500">
                Belum ada tanda tangan Berita Acara Serah Terima (BAST) yang direkam.
              </p>
            )}

            <div className="space-y-2">
              {onSaveBast && (
                <button
                  type="button"
                  disabled={isProposalLocked || !canUpdate || isOffline}
                  onClick={() => setIsSignatureOpen(true)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PenTool className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {record.bast ? 'Ulangi Tanda Tangan BAST' : 'Tanda Tangan BAST'}
                  </span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isDownloadingBastPdf}
                  onClick={handleOpenBastModal}
                  className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60"
                >
                  {isDownloadingBastPdf ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {isDownloadingBastPdf ? 'Mencetak...' : 'Cetak BAST PDF'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isDownloadingSptjmPdf}
                  onClick={handleOpenSptjmModal}
                  className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {isDownloadingSptjmPdf ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  )}
                  <span className="truncate">
                    {isDownloadingSptjmPdf ? 'Mencetak...' : 'Cetak SPTJM PDF'}
                  </span>
                </button>
              </div>
            </div>

            {pdfNotice && (
              <div
                role="status"
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                  pdfNotice.type === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                <span className="font-medium leading-snug">{pdfNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setPdfNotice(null)}
                  className="shrink-0 rounded p-0.5 text-current/70 hover:text-current"
                  aria-label="Tutup notifikasi"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </section>
    </>
  );

  const pengajuanAndDomisiliBlock = (
    <>
        {/* Pengajuan & Bantuan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Pengajuan Bantuan</h3>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            {displayTahun && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Tahun</dt>
                <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                  {displayTahun}
                </dd>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">
                {!isStandalone && record.proposal ? 'Proposal' : 'Status Penempatan'}
              </dt>
              <dd className="max-w-[64%] text-right text-xs font-medium">
                {!isStandalone && record.proposal ? (
                  <button
                    type="button"
                    onClick={() => onOpenProposal(record.proposal, record.tahun)}
                    className="text-right text-teal-700 hover:underline"
                  >
                    {record.proposal}
                  </button>
                ) : (
                  <span
                    className={
                      record.validasi === 'rejected'
                        ? 'text-rose-700'
                        : 'text-amber-700'
                    }
                  >
                    Standalone · {standaloneContainerLabel}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Item Bantuan</dt>
              <dd className="max-w-[64%] text-right text-xs font-medium text-slate-900">
                {itemName}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">DTSEN</dt>
              <dd className="text-right text-xs font-medium text-slate-900">{dtsenLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Biaya Administrasi</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {formatRupiah(record.payment)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Identitas & Domisili */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Identitas & Domisili</h3>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-500 shrink-0">NIK KTP</dt>
                <dd className="text-right">
                  {record.nikKtp && record.nikKtp.replace(/\D/g, '').length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleCheckNikAtKemensos()}
                      title="Cek NIK di cekbansos.kemensos.go.id"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 active:bg-teal-200 tabular-nums"
                    >
                      <span>{formatNikDisplay(record.nikKtp)}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-slate-900 tabular-nums">
                      {formatNikDisplay(record.nikKtp)}
                    </span>
                  )}
                </dd>
              </div>
              {cekBansosStatus && (
                <p className="mt-1.5 text-right text-[11px] font-medium text-teal-700">
                  {cekBansosStatus}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Nomor KK</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {formatNikDisplay(record.nikKk)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="shrink-0 text-xs text-slate-500">Alamat Lengkap</dt>
              <dd className="max-w-[64%] text-right text-xs font-medium leading-relaxed text-slate-900 break-words">
                <span>{record.alamat || '-'}</span>
                <span className="mt-0.5 block text-slate-600 tabular-nums">
                  RT {record.rt || '-'} / RW {record.rw || '-'}
                </span>
              </dd>
            </div>
            {displayKelurahan && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Kelurahan / Desa</dt>
                <dd className="text-right text-xs font-medium text-slate-900">
                  {displayKelurahan}
                </dd>
              </div>
            )}
            {displayKecamatan && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Kecamatan</dt>
                <dd className="text-right text-xs font-medium text-slate-900">
                  {displayKecamatan}
                </dd>
              </div>
            )}
            {displayKabKota && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Kab / Kota</dt>
                <dd className="text-right text-xs font-medium text-slate-900">
                  {displayKabKota}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Pekerjaan</dt>
              <dd className="text-right text-xs font-medium text-slate-900">
                {record.pekerjaan}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Pengelola</dt>
              <dd className="text-right text-xs font-medium text-slate-900">
                {record.pengelola}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Nomor HP</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {(() => {
                  const waUrl = formatWhatsAppUrl(record.kontak);
                  if (!waUrl || !record.kontak) return '-';
                  return (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{record.kontak}</span>
                    </a>
                  );
                })()}
              </dd>
            </div>
          </dl>
        </section>
    </>
  );

  const docsAndHistoryBlock = (
    <>
        {/* Dokumentasi */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Dokumentasi</h3>
              <p className="text-[11px] text-slate-500">
                Foto diamankan di perangkat &amp; diunggah paralel · Bebas pindah KPM kapan saja
              </p>
            </div>
            {(docBusySlot || vaultJobs.length > 0) && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  isOffline
                    ? 'border border-amber-200 bg-amber-50 text-amber-800'
                    : 'border border-teal-200 bg-teal-50 text-teal-800'
                }`}
              >
                {(!isOffline || docBusySlot) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {docBusySlot
                    ? docBusyAction === 'deleting'
                      ? 'Menghapus...'
                      : 'Menyimpan foto...'
                    : isOffline
                      ? `${vaultJobs.length} Foto Tersimpan Lokal`
                      : `Mengunggah ${vaultJobs.length} Foto...`}
                </span>
              </span>
            )}
          </div>

          <input
            ref={detailFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleDetailDocFileChange}
            className="sr-only"
          />
          <input
            ref={detailMultiFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleDetailDocFileChange}
            className="sr-only"
          />
          <input
            ref={detailCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleDetailDocFileChange}
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

          {/* 4 Kartu Foto Utama: Grid 2x2 Simetris di Mobile & Webview */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(
              [
                { key: 'penerima', label: 'Foto Penerima', icon: User },
                { key: 'survey', label: 'Foto Survey', icon: FileText },
                { key: 'ktp', label: 'Foto KTP', icon: CreditCard },
                { key: 'kk', label: 'Foto KK', icon: FileText },
              ] as const
            ).map((item) => {
              const doc = record.documents[item.key];
              const Icon = item.icon;
              const isSlotBusy =
                docBusySlot === item.key || (doc && docBusySlot === `${item.key}:${doc.id}`);
              const isPendingDoc = isLocalPendingDocument(doc);
              const pendingJobId = isPendingDoc ? extractPendingJobId(doc) : '';
              const pendingJob = pendingJobId
                ? vaultJobs.find((j) => j.id === pendingJobId)
                : undefined;
              const editableDocs = Boolean(
                !isProposalLocked && canUpdate && (onEnqueuePhoto || onUpdateKpmDocuments)
              );

              return (
                <div
                  key={item.key}
                  className={`flex flex-col overflow-hidden rounded-xl border bg-slate-50/70 ${
                    isPendingDoc ? 'border-amber-300' : 'border-slate-200'
                  }`}
                >
                  {doc ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(isSlotBusy)}
                        onClick={() => onPreviewDocument(doc, item.label)}
                        className="relative block aspect-[1.45/1] w-full overflow-hidden bg-slate-200 text-left"
                      >
                        <DriveImage
                          doc={doc}
                          alt={item.label}
                          className="h-full w-full object-cover"
                        />
                        {isPendingDoc && !isSlotBusy && (
                          <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {pendingJob?.status === 'uploading' ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin text-teal-300" />
                            ) : (
                              <Clock className="h-2.5 w-2.5 text-amber-300" />
                            )}
                            <span>
                              {pendingJob?.status === 'uploading'
                                ? 'Mengunggah...'
                                : isOffline
                                  ? 'Tersimpan Lokal'
                                  : pendingJob?.status === 'failed'
                                    ? 'Gagal · Ulangi'
                                    : 'Antrean Drive'}
                            </span>
                          </span>
                        )}
                        {isSlotBusy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-white">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </div>
                        )}
                        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {item.label}
                        </span>
                      </button>
                      {isPendingDoc && pendingJob && (
                        <div className="border-t border-amber-100 bg-amber-50/80 px-2 py-1 text-[10px] leading-tight text-amber-900">
                          {pendingJob.lastError || pendingJob.galleryStatusNote}
                        </div>
                      )}
                      {editableDocs && (
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-slate-200 bg-white p-2">
                          <button
                            type="button"
                            disabled={Boolean(isSlotBusy)}
                            onClick={() =>
                              handleTriggerSingleOrMultiUpload(item.key, item.label, 'camera', doc)
                            }
                            className="inline-flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                            title="Ambil foto ulang pakai kamera"
                          >
                            <Camera className="h-3 w-3 shrink-0" />
                            <span>Kamera</span>
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(isSlotBusy)}
                            onClick={() =>
                              handleTriggerSingleOrMultiUpload(item.key, item.label, 'file', doc)
                            }
                            className="inline-flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            title="Pilih foto dari galeri/file"
                          >
                            <Upload className="h-3 w-3 shrink-0" />
                            <span>Ganti</span>
                          </button>
                          {isPendingDoc &&
                            pendingJob &&
                            pendingJob.status !== 'uploading' &&
                            !pendingJob.corrupted &&
                            !isOffline && (
                              <button
                                type="button"
                                onClick={() => void retryPhotoUploadJob(pendingJob.id)}
                                className="inline-flex min-h-[32px] w-8 items-center justify-center rounded-lg border border-teal-200 bg-white text-teal-800 hover:bg-teal-50"
                                title="Kirim ulang ke Google Drive"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </button>
                            )}
                          <button
                            type="button"
                            disabled={Boolean(docBusySlot) || (!isPendingDoc && isOffline)}
                            onClick={() =>
                              setPendingDeleteDoc({
                                category: item.key,
                                label: item.label,
                                doc,
                              })
                            }
                            aria-label={isPendingDoc ? `Batalkan ${item.label}` : `Hapus Foto ${item.label}`}
                            title={
                              isPendingDoc
                                ? 'Batalkan antrean unggahan'
                                : isOffline
                                  ? 'Hapus foto Drive butuh sinyal'
                                  : 'Hapus Foto'
                            }
                            className="inline-flex min-h-[32px] w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-[144px] w-full flex-1 flex-col justify-between p-3">
                      <div className="flex flex-1 flex-col items-center justify-center text-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                          {isSlotBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-700">
                          {isSlotBusy ? 'Memproses...' : item.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">Belum diunggah</p>
                      </div>
                      {editableDocs && !isSlotBusy && (
                        <div className="mt-2.5 flex w-full items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerSingleOrMultiUpload(item.key, item.label, 'camera')
                            }
                            className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-lg bg-teal-700 px-2 text-[11px] font-semibold text-white hover:bg-teal-800 active:scale-[0.99]"
                          >
                            <Camera className="h-3 w-3 shrink-0" />
                            <span>Kamera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerSingleOrMultiUpload(item.key, item.label, 'file')
                            }
                            className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99]"
                          >
                            <Upload className="h-3 w-3 shrink-0" />
                            <span>Galeri</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sub-Bagian Foto Tambahan: Foto Rumah & Foto Lainnya Terpisah Rapi */}
          {(() => {
            const editableDocs = Boolean(
              !isProposalLocked && canUpdate && (onEnqueuePhoto || onUpdateKpmDocuments)
            );
            const multiGroups: Array<{
              key: 'rumah' | 'lainnya';
              title: string;
              subtitle: string;
              max: number;
              docs: KpmDocumentFile[];
              icon: typeof Home;
            }> = [
              {
                key: 'rumah',
                title: 'Foto Rumah',
                subtitle: 'Tampak depan & kondisi rumah',
                max: 3,
                docs: rumahDocs,
                icon: Home,
              },
              {
                key: 'lainnya',
                title: 'Foto Lainnya',
                subtitle: 'Penyerahan bantuan & pendukung',
                max: 5,
                docs: lainnyaDocs,
                icon: Images,
              },
            ];

            return (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {multiGroups.map((group) => {
                  const GroupIcon = group.icon;
                  const isAtMax = group.docs.length >= group.max;
                  const isGroupPreparing =
                    docBusySlot === group.key && docBusyAction === 'preparing';

                  return (
                    <div
                      key={group.key}
                      className="flex flex-col justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                            <GroupIcon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-xs font-bold text-slate-800">
                              {group.title}
                            </h4>
                            <p className="truncate text-[10px] text-slate-500">
                              {group.subtitle}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                            group.docs.length > 0
                              ? 'border border-teal-200 bg-teal-50 text-teal-800'
                              : 'border border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          {group.docs.length}/{group.max}
                        </span>
                      </div>

                      {group.docs.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {group.docs.map((doc, idx) => {
                            const isBusy = docBusySlot === `${group.key}:${doc.id}`;
                            const isPendingDoc = isLocalPendingDocument(doc);
                            const pendingJobId = isPendingDoc ? extractPendingJobId(doc) : '';
                            const pendingJob = pendingJobId
                              ? vaultJobs.find((j) => j.id === pendingJobId)
                              : undefined;
                            const itemLabel = `${group.title} #${idx + 1}`;
                            return (
                              <div
                                key={doc.id}
                                className={`flex flex-col overflow-hidden rounded-lg border bg-white ${
                                  isPendingDoc ? 'border-amber-300' : 'border-slate-200'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => onPreviewDocument(doc, itemLabel)}
                                  className="relative block aspect-square w-full overflow-hidden bg-slate-200 text-left"
                                >
                                  <DriveImage
                                    doc={doc}
                                    alt={itemLabel}
                                    className="h-full w-full object-cover"
                                  />
                                  {isPendingDoc && !isBusy && (
                                    <span className="pointer-events-none absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-slate-900/85 px-1 py-0.5 text-[9px] font-semibold text-white">
                                      {pendingJob?.status === 'uploading' ? (
                                        <Loader2 className="h-2.5 w-2.5 animate-spin text-teal-300" />
                                      ) : (
                                        <Clock className="h-2.5 w-2.5 text-amber-300" />
                                      )}
                                      <span>{isOffline ? 'Lokal' : 'Antre'}</span>
                                    </span>
                                  )}
                                  {isBusy && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-white">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    </div>
                                  )}
                                  <span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-1 py-0.5 text-[9px] font-semibold text-white">
                                    #{idx + 1}
                                  </span>
                                </button>
                                {editableDocs && (
                                  <div className="flex items-center gap-1 border-t border-slate-100 p-1">
                                    {isPendingDoc &&
                                      pendingJob &&
                                      pendingJob.status !== 'uploading' &&
                                      !pendingJob.corrupted &&
                                      !isOffline && (
                                        <button
                                          type="button"
                                          onClick={() => void retryPhotoUploadJob(pendingJob.id)}
                                          className="inline-flex h-6 flex-1 items-center justify-center rounded border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
                                          title="Kirim ulang ke Drive"
                                        >
                                          <RefreshCw className="h-2.5 w-2.5" />
                                        </button>
                                      )}
                                    <button
                                      type="button"
                                      disabled={Boolean(docBusySlot) || (!isPendingDoc && isOffline)}
                                      onClick={() =>
                                        setPendingDeleteDoc({
                                          category: group.key,
                                          label: itemLabel,
                                          doc,
                                        })
                                      }
                                      className="inline-flex h-6 flex-1 items-center justify-center rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                                      title={isPendingDoc ? 'Batalkan antrean' : 'Hapus foto'}
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {editableDocs && (
                        isAtMax ? (
                          <div className="mt-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center text-[11px] font-medium text-slate-500">
                            Maksimal {group.max} foto tercapai
                          </div>
                        ) : (
                          <div className="mt-auto flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isGroupPreparing}
                              onClick={() =>
                                handleTriggerSingleOrMultiUpload(group.key, group.title, 'camera')
                              }
                              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                            >
                              {isGroupPreparing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <Camera className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>Kamera</span>
                            </button>
                            <button
                              type="button"
                              disabled={isGroupPreparing}
                              onClick={() =>
                                handleTriggerSingleOrMultiUpload(group.key, group.title, 'file')
                              }
                              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              title="Pilih satu atau beberapa foto dari Galeri"
                            >
                              <Upload className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                              <span>Galeri</span>
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* Rekam Jejak */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Rekam Jejak</h3>
            </div>
            <button
              type="button"
              onClick={onOpenFullHistory}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
            >
              <span>Lihat selengkapnya</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Ringkasan Input Awal */}
          {initialCreationEntry && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Clock className="h-3.5 w-3.5 text-teal-700" />
                <span>Waktu Input Awal</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-900 tabular-nums">
                {formatUploadDateTime(initialCreationEntry.timestamp)} · Oleh{' '}
                {initialCreationEntry.actorName}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Masuk ke{' '}
                <span className="font-medium text-slate-800">
                  {initialCreationEntry.proposal || standaloneContainerLabel}
                </span>
                {initialCreationEntry.tahun ? ` · Tahun ${initialCreationEntry.tahun}` : ''}
              </p>
            </div>
          )}

          {recordAuditLogs.length > 0 && (
            <button
              type="button"
              onClick={onOpenFullHistory}
              className="flex min-h-[42px] w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100"
            >
              <span>Lihat selengkapnya</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>
    </>
  );

  return (
    <div className="min-h-screen pb-24">
      {/* Sub-Screen Header (Android View: APK & Phone Browser) */}
      {!isDesktopWeb && (
      <header className="sticky top-0 z-20 relative flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali ke daftar KPM"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">Detail KPM</h1>
        </div>

        {(canUpdate || canDelete) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {canUpdate && (
              <button
                type="button"
                disabled={isProposalLocked || isOffline}
                onClick={() => onEditRecord(record)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                aria-label="Edit Data KPM"
                title={
                  isProposalLocked
                    ? 'Proposal Terkunci'
                    : isOffline
                      ? 'Mode Read-Only (Offline)'
                      : 'Edit Data KPM'
                }
              >
                <Pencil className="h-4.5 w-4.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={isProposalLocked || isOffline}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                aria-label="Hapus Data KPM"
                title={
                  isProposalLocked
                    ? 'Proposal Terkunci'
                    : isOffline
                      ? 'Mode Read-Only (Offline)'
                      : 'Hapus Data KPM'
                }
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        )}

        {isHeroScrolledOut && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label={`Kembali ke ringkasan ${record.nama}`}
            className="absolute top-full left-0 right-0 flex w-full items-center gap-2.5 border-b border-slate-200 bg-white/95 px-3 py-2 text-left shadow-xs backdrop-blur-md transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            {heroPhotoDoc ? (
              <span className="relative h-8 w-7 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <DriveImage
                  doc={heroPhotoDoc}
                  alt={record.nama}
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                <User className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-slate-900">{record.nama}</p>
                <div className="shrink-0">{renderStatusIndicator(record.validasi)}</div>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-500 tabular-nums">
                {[
                  isStandalone ? '' : record.registerCode,
                  itemName,
                  !isStandalone && record.proposal ? record.proposal : standaloneContainerLabel,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </button>
        )}
      </header>
      )}

      {isDesktopWeb ? (
        <main className="mx-auto max-w-[1440px] space-y-5 px-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                aria-label="Kembali ke daftar KPM"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali</span>
              </button>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Detail KPM
              </h1>
            </div>

            {(canUpdate || canDelete) && (
              <div className="flex shrink-0 items-center gap-2">
                {canUpdate && (
                  <button
                    type="button"
                    disabled={isProposalLocked || isOffline}
                    onClick={() => onEditRecord(record)}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label="Edit Data KPM"
                    title={
                      isProposalLocked
                        ? 'Proposal Terkunci'
                        : isOffline
                          ? 'Mode Read-Only (Offline)'
                          : 'Edit Data KPM'
                    }
                  >
                    <Pencil className="h-4 w-4" />
                    <span>Edit Data</span>
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={isProposalLocked || isOffline}
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    aria-label="Hapus Data KPM"
                    title={
                      isProposalLocked
                        ? 'Proposal Terkunci'
                        : isOffline
                          ? 'Mode Read-Only (Offline)'
                          : 'Hapus Data KPM'
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Hapus Data</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {lockedBannerBlock}
          <div className="grid grid-cols-12 items-start gap-5">
            <div className="col-span-5 space-y-5 md:sticky md:top-6 self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto md:pr-1">
              {identityAndDupBlock}
              {pengajuanAndDomisiliBlock}
            </div>
            <div className="col-span-7 space-y-5">
              {subItemAndBastBlock}
              {docsAndHistoryBlock}
            </div>
          </div>
        </main>
      ) : (
        <main className="space-y-4 px-4 pt-4">
          {lockedBannerBlock}
          {identityAndDupBlock}
          {subItemAndBastBlock}
          {pengajuanAndDomisiliBlock}
          {docsAndHistoryBlock}
        </main>
      )}

      {/* Persistent Bottom-Right Floating Pencil Edit KPM Button */}
      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4 ${
          !isNativeApp ? 'md:left-auto md:right-6 md:w-auto md:max-w-none md:translate-x-0 md:px-0' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onEditRecord(record)}
          disabled={isProposalLocked || !canUpdate || isOffline}
          aria-label={
            isProposalLocked
              ? 'Proposal Terkunci'
              : isOffline
                ? 'Mode Read-Only (Offline)'
                : !canUpdate
                  ? 'Akses Edit Dinonaktifkan'
                  : 'Edit Data KPM'
          }
          title={
            isProposalLocked
              ? 'Proposal Terkunci'
              : isOffline
                ? 'Mode Read-Only (Offline)'
                : !canUpdate
                  ? 'Akses Edit Dinonaktifkan'
                  : 'Edit Data KPM'
          }
          className={`pointer-events-auto inline-flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
            isProposalLocked || !canUpdate || isOffline
              ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-500 shadow-slate-900/10'
              : 'bg-teal-700 text-white shadow-teal-900/25 hover:bg-teal-800'
          }`}
        >
          {isProposalLocked || !canUpdate || isOffline ? (
            <Lock className="h-[22px] w-[22px]" />
          ) : (
            <Pencil className="h-[22px] w-[22px]" />
          )}
        </button>
      </div>

      {/* Share KPM Card to Direct Chat Bottom-Sheet Modal */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setIsShareModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Bagikan Kartu KPM ke Chat"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-base font-bold text-slate-900">Bagikan Kartu KPM ke Chat</h2>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Compact Card Preview */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-400">
                {heroPhotoDoc ? (
                  <DriveImage
                    doc={heroPhotoDoc}
                    alt={record.nama}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-teal-700 tabular-nums">
                  {[isStandalone ? '' : record.registerCode, displayTahun]
                    .filter(Boolean)
                    .join(' · ') || standaloneContainerLabel}
                </p>
                <p className="truncate text-sm font-bold text-slate-900">{record.nama}</p>
                <p className="truncate text-xs text-slate-500">
                  {[itemName, record.proposal || standaloneContainerLabel].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {chatRecipients.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Tidak ada kontak ditemukan.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pilih Penerima Chat
                  </label>
                  <div className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                    {chatRecipients.map((recipient) => {
                      const selected = shareRecipientId === recipient.id;
                      const recipientDisplayName =
                        (userAliases[recipient.id] || '').trim() || recipient.nama;
                      const hasAlias = recipientDisplayName !== recipient.nama;
                      return (
                        <button
                          key={recipient.id}
                          type="button"
                          onClick={() => setShareRecipientId(recipient.id)}
                          className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-teal-700 bg-teal-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
                              {recipient.fotoDataUrl ? (
                                <DriveImage
                                  src={recipient.fotoDataUrl}
                                  thumbnailUrl={recipient.fotoThumbnailUrl}
                                  alt={recipientDisplayName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {recipientDisplayName}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {recipient.role}
                                {hasAlias ? ` · Asli: ${recipient.nama}` : ` · ${recipient.email}`}
                              </p>
                            </div>
                          </div>
                          {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Catatan / Pertanyaan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Tulis pertanyaan atau catatan terkait KPM ini..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={!shareRecipientId || sharingChat || isOffline}
                  onClick={handleConfirmShare}
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  <span>{sharingChat ? 'Mengirim...' : 'Kirim Kartu ke Chat'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting KPM Photo from Drive + Supabase (or Canceling Local Queue) */}
      {pendingDeleteDoc && (isLocalPendingDocument(pendingDeleteDoc.doc) || !isOffline) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => !docBusySlot && setPendingDeleteDoc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Foto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isLocalPendingDocument(pendingDeleteDoc.doc)
                    ? 'Batalkan Antrean Foto?'
                    : 'Hapus Foto?'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {isLocalPendingDocument(pendingDeleteDoc.doc) ? (
                    <>
                      Foto <strong>{pendingDeleteDoc.label}</strong> yang belum terunggah akan
                      dibatalkan dari antrean dan dihapus dari perangkat.
                    </>
                  ) : (
                    <>
                      Foto <strong>{pendingDeleteDoc.label}</strong> akan dipindahkan ke Trash
                      Google Drive dan kolom foto pada database Supabase akan dikosongkan.
                    </>
                  )}
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
                disabled={
                  Boolean(docBusySlot) ||
                  (!isLocalPendingDocument(pendingDeleteDoc.doc) && isOffline)
                }
                onClick={() => void handleConfirmDeleteDocument()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {docBusySlot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {docBusySlot
                    ? 'Memproses...'
                    : isLocalPendingDocument(pendingDeleteDoc.doc)
                      ? 'Ya, Batalkan'
                      : 'Ya, Hapus Foto'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Step Delete Disposition, Slot Handling & Confirmation Modal */}
      <SlotHandlingConfirmModal
        isOpen={Boolean(confirmDelete && canDelete && !isProposalLocked && !isOffline)}
        actionType="delete"
        kpmName={record.nama}
        registerCode={record.registerCode}
        originProposalName={record.proposal}
        originSlotNumber={currentSlotNumber}
        currentStatus={record.validasi}
        requiresSlotChoice={Boolean(!isStandalone && record.validasi === 'accepted' && record.proposal?.trim())}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={(slotHandling, deleteAction) => {
          setConfirmDelete(false);
          onDeleteRecord(record.id, slotHandling, deleteAction);
        }}
      />

      {/* Digital Signature & GPS Modal for BAST */}
      {onSaveBast && (
        <SignaturePadModal
          isOpen={isSignatureOpen && !isOffline}
          defaultRecipientName={record.nama}
          registerCode={record.registerCode}
          onClose={() => setIsSignatureOpen(false)}
          onSave={async (payload) => {
            await onSaveBast(record.id, payload.file, {
              recipientName: payload.recipientName,
              lat: payload.lat,
              lng: payload.lng,
              accuracy: payload.accuracy,
            });
          }}
        />
      )}

      {/* Proposal Picker Modal when accepting standalone KPM */}
      <ProposalPickerModal
        isOpen={isProposalPickerOpen && !isOffline}
        title="Pilih Proposal untuk KPM Diterima"
        subtitle={`Menyetujui "${record.nama}" menjadi Diterima mewajibkan pemilihan proposal aktif (Murni / Perubahan).`}
        confirmLabel="Terima & Masukkan"
        proposals={proposals}
        records={allRecords}
        wilayahList={wilayahList}
        initialYear={record.tahun || 'all'}
        onClose={() => setIsProposalPickerOpen(false)}
        onSelectProposal={(targetProp) => {
          setIsProposalPickerOpen(false);
          onUpdateStatus(record.id, 'accepted', targetProp.id);
        }}
      />

      {/* Single Coupon Print Modal (88 x 54 mm on F4) */}
      {isKuponModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => !isDownloadingKuponPdf && setIsKuponModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Cetak Kupon Satuan KPM"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Ticket className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cetak Kupon Satuan (88 × 54 mm)</h3>
                  <p className="text-[11px] text-slate-500">
                    {record.nama} · No. Kupon{' '}
                    {String(
                      currentSlotNumber || (getAbsenSeq(record.registerCode) < 999999 ? getAbsenSeq(record.registerCode) : 1)
                    ).padStart(2, '0')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsKuponModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {matchedKuponScheduleTitle && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] font-medium text-teal-900">
                Terisi otomatis dari jadwal proposal <strong>{record.proposal}</strong> ({matchedKuponScheduleTitle}).
              </div>
            )}

            {/* Pratinjau Header Kupon */}
            {(() => {
              const hasKalbar = Boolean(couponDraft.logoKalbarUrl?.trim());
              const hasGerindra = Boolean(couponDraft.logoGerindraUrl?.trim());
              const hasAny = hasKalbar || hasGerindra;
              return (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-[8px] font-medium text-slate-500">No. Kupon</span>
                      <div className="mt-0.5 flex h-7 w-10 items-center justify-center rounded-md border border-slate-900 text-xs font-bold text-slate-900 tabular-nums">
                        {String(
                          currentSlotNumber ||
                            (getAbsenSeq(record.registerCode) < 999999
                              ? getAbsenSeq(record.registerCode)
                              : 1)
                        ).padStart(2, '0')}
                      </div>
                    </div>
                    {hasAny ? (
                      <div className="flex flex-1 min-w-0 items-center justify-between gap-1.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                          {hasKalbar && (
                            <img
                              src={couponDraft.logoKalbarUrl}
                              alt="Logo Kalimantan Barat"
                              className="max-h-full max-w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-center">
                          <p className="text-[10px] font-bold tracking-wide text-slate-900 leading-tight">
                            KUPON PEMBAGIAN
                          </p>
                          <p className="text-[10px] font-bold tracking-wide text-slate-900 leading-tight">
                            TAHUN {record.tahun || '2026'}
                          </p>
                        </div>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                          {hasGerindra && (
                            <img
                              src={couponDraft.logoGerindraUrl}
                              alt="Logo Gerindra"
                              className="max-h-full max-w-full object-contain"
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-center pr-2">
                        <p className="text-[13px] font-black tracking-wide text-slate-950 leading-tight">
                          KUPON PEMBAGIAN
                        </p>
                        <p className="text-[13px] font-black tracking-wide text-slate-950 leading-tight">
                          TAHUN {record.tahun || '2026'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Jadwal Pembagian
                </label>
                <input
                  type="text"
                  value={couponDraft.jadwal}
                  onChange={(e) => setCouponDraft((prev) => ({ ...prev, jadwal: e.target.value }))}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Lokasi Penyaluran
                </label>
                <input
                  type="text"
                  value={couponDraft.lokasi}
                  onChange={(e) => setCouponDraft((prev) => ({ ...prev, lokasi: e.target.value }))}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Catatan Kaki Kupon
                </label>
                <input
                  type="text"
                  value={couponDraft.footerText}
                  onChange={(e) =>
                    setCouponDraft((prev) => ({ ...prev, footerText: e.target.value }))
                  }
                  placeholder={DEFAULT_COUPON_CONFIG.footerText}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2">
                <div>
                  <p className="text-[11px] font-bold text-slate-800">Logo Kupon (Opsional)</p>
                  <p className="text-[10px] text-slate-500">
                    Ada logo → judul di tengah. Tanpa logo → judul diperbesar &amp; ditebalkan.
                  </p>
                </div>
                <input
                  ref={kuponKalbarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleSingleKuponLogoUpload('kalbar', e)}
                />
                <input
                  ref={kuponGerindraInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleSingleKuponLogoUpload('gerindra', e)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {couponDraft.logoKalbarUrl ? (
                          <img
                            src={couponDraft.logoKalbarUrl}
                            alt="Logo Kalimantan Barat"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                      <span className="truncate text-[10px] font-semibold text-slate-700">
                        Logo Kalbar
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => kuponKalbarInputRef.current?.click()}
                        className="flex-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {couponDraft.logoKalbarUrl ? 'Ganti' : 'Unggah'}
                      </button>
                      {couponDraft.logoKalbarUrl && (
                        <button
                          type="button"
                          disabled={isOffline}
                          onClick={() =>
                            setCouponDraft((prev) => ({ ...prev, logoKalbarUrl: '' }))
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {couponDraft.logoGerindraUrl ? (
                          <img
                            src={couponDraft.logoGerindraUrl}
                            alt="Logo Gerindra"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                      <span className="truncate text-[10px] font-semibold text-slate-700">
                        Logo Gerindra
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => kuponGerindraInputRef.current?.click()}
                        className="flex-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {couponDraft.logoGerindraUrl ? 'Ganti' : 'Unggah'}
                      </button>
                      {couponDraft.logoGerindraUrl && (
                        <button
                          type="button"
                          disabled={isOffline}
                          onClick={() =>
                            setCouponDraft((prev) => ({ ...prev, logoGerindraUrl: '' }))
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {onSaveCouponConfig && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={isOffline}
                  checked={saveCouponDefault && !isOffline}
                  onChange={(e) => setSaveCouponDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  Simpan jadwal &amp; lokasi ini sebagai pengaturan default
                  {isOffline ? ' (nonaktif saat offline)' : ''}
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={isDownloadingKuponPdf}
              onClick={() => void handleDownloadSingleKuponPdf()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isDownloadingKuponPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isDownloadingKuponPdf ? 'Menyiapkan Kupon...' : 'Download Kupon PDF F4'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Single BAST Print Modal */}
      {isBastModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => !isDownloadingBastPdf && setIsBastModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Cetak BAST Resmi KPM"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <FileCheck2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cetak BAST PDF F4</h3>
                  <p className="text-[11px] text-slate-500">
                    {record.nama} · No. Bantuan{' '}
                    {String(
                      currentSlotNumber || (getAbsenSeq(record.registerCode) < 999999 ? getAbsenSeq(record.registerCode) : 1)
                    ).padStart(2, '0')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBastModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 space-y-0.5">
              <p>
                <strong>Lokasi BAST:</strong>{' '}
                {formatBastProposalLocation(record, proposals, wilayahList)}
              </p>
              <p>
                <strong>Tanggal Terbilang:</strong>{' '}
                {bastDraft.tanggalSerahTerimaCustomText?.trim() ||
                  formatIndonesianDateWords(
                    bastDraft.tanggalSerahTerimaIso || new Date().toISOString().slice(0, 10)
                  )}
              </p>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Nomor BAST</label>
                <input
                  type="text"
                  value={bastDraft.nomorBast}
                  placeholder="Kosongkan agar baris nomor di PDF tetap kosong (tulis tangan)"
                  onChange={(e) => setBastDraft((prev) => ({ ...prev, nomorBast: e.target.value }))}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Tanggal Serah Terima
                  </label>
                  <input
                    type="date"
                    value={bastDraft.tanggalSerahTerimaIso}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, tanggalSerahTerimaIso: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nilai Nominal (Opsional)
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nilaiNominalText}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, nilaiNominalText: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Nomor SK &amp; Tanggal SK
                </label>
                <input
                  type="text"
                  value={bastDraft.nomorSk}
                  onChange={(e) => setBastDraft((prev) => ({ ...prev, nomorSk: e.target.value }))}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nomor Pesanan (SP)
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nomorPesanan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, nomorPesanan: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Tanggal Pemesanan
                  </label>
                  <input
                    type="text"
                    value={bastDraft.tanggalPemesanan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, tanggalPemesanan: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
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
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nama Pejabat Dinas
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatNama}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatNama: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Jabatan + OPD + Provinsi
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatJabatan}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatJabatan: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Kelas / Pangkat / Golongan Pejabat
                  </label>
                  <input
                    type="text"
                    value={bastDraft.pejabatPangkat}
                    onChange={(e) =>
                      setBastDraft((prev) => ({ ...prev, pejabatPangkat: e.target.value }))
                    }
                    placeholder="Contoh: Pembina Utama Muda / (IV/c)"
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    NIP Pejabat (tanpa &ldquo;NIP.&rdquo;)
                  </label>
                  <div className="mt-1 flex min-h-[38px] w-full items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-teal-700">
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
                      className="min-h-[36px] w-full border-0 bg-transparent px-3 text-xs text-slate-900 tabular-nums focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {(matchingProposal && onSaveProposalBastConfig) || onSaveBastTemplate ? (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={isOffline}
                  checked={saveBastDefault && !isOffline}
                  onChange={(e) => setSaveBastDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  {matchingProposal && onSaveProposalBastConfig
                    ? `Simpan perubahan ini untuk Proposal "${matchingProposal.namaProposal}"`
                    : 'Simpan perubahan ini sebagai template BAST default'}
                  {isOffline ? ' (nonaktif saat offline)' : ''}
                </span>
              </label>
            ) : null}

            <button
              type="button"
              disabled={isDownloadingBastPdf}
              onClick={() => void handleDownloadBastPdf()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isDownloadingBastPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>{isDownloadingBastPdf ? 'Menyiapkan BAST PDF...' : 'Download BAST PDF F4'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Single SPTJM Print Modal */}
      {isSptjmModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
          onClick={() => !isDownloadingSptjmPdf && setIsSptjmModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cetak SPTJM PDF F4</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {record.nama} · No. Bantuan{' '}
                  {String(currentSlotNumber || getAbsenSeq(record.registerCode) || 1).padStart(
                    2,
                    '0'
                  )}{' '}
                  · 1 Halaman F4
                </p>
              </div>
              <button
                type="button"
                disabled={isDownloadingSptjmPdf}
                onClick={() => setIsSptjmModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">Lokasi:</span>{' '}
                {formatBastProposalLocation(record, proposals, wilayahList)}
              </p>
              <p className="mt-0.5">
                <span className="font-semibold text-slate-900">Tempat &amp; Tanggal:</span>{' '}
                {(sptjmDraft.tempat || DEFAULT_SPTJM_TEMPLATE.tempat).trim()},{' '}
                {formatSptjmFullDate(sptjmDraft)}
              </p>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Tempat Penandatanganan
                </label>
                <input
                  type="text"
                  value={sptjmDraft.tempat}
                  onChange={(e) =>
                    setSptjmDraft((prev) => ({ ...prev, tempat: e.target.value }))
                  }
                  placeholder="Pontianak"
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    1. Pilih Hari
                  </label>
                  <select
                    value={sptjmDraft.hari || ''}
                    onChange={(e) =>
                      setSptjmDraft((prev) => ({
                        ...prev,
                        hari: e.target.value,
                        tanggalCustomText: '',
                      }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="">
                      Otomatis ({getSptjmAutoDayFromIso(sptjmDraft.tanggalIso)})
                    </option>
                    {SPTJM_DAY_OPTIONS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    2. Pilih Tanggal (00 Bulan 0000)
                  </label>
                  <input
                    type="date"
                    value={sptjmDraft.tanggalIso}
                    onChange={(e) =>
                      setSptjmDraft((prev) => ({
                        ...prev,
                        tanggalIso: e.target.value,
                        tanggalCustomText: '',
                      }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  <p className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                    Format: {formatIndonesianDDMonthYYYY(sptjmDraft.tanggalIso)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Pilih Pejabat Penandatangan Default (Otomatis Isi Jabatan, Nama &amp; NIP)
                </label>
                <select
                  value={
                    pejabatList.find(
                      (p) =>
                        p.nama.trim().toLowerCase() ===
                        (sptjmDraft.pejabatNama || '').trim().toLowerCase()
                    )?.id || ''
                  }
                  onChange={(e) => {
                    const picked = pejabatList.find((p) => p.id === e.target.value);
                    if (!picked) return;
                    setSptjmDraft((prev) => ({
                      ...prev,
                      pejabatNama: picked.nama,
                      pejabatJabatan: picked.jabatan,
                      pejabatNip: normalizePejabatNipNumber(picked.nip).trim(),
                    }));
                  }}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
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

              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Jabatan Pejabat (Mengetahui)
                </label>
                <input
                  type="text"
                  value={sptjmDraft.pejabatJabatan}
                  onChange={(e) =>
                    setSptjmDraft((prev) => ({ ...prev, pejabatJabatan: e.target.value }))
                  }
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nama Pejabat
                  </label>
                  <input
                    type="text"
                    value={sptjmDraft.pejabatNama}
                    onChange={(e) =>
                      setSptjmDraft((prev) => ({ ...prev, pejabatNama: e.target.value }))
                    }
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    NIP Pejabat (tanpa &ldquo;NIP.&rdquo;)
                  </label>
                  <div className="mt-1 flex min-h-[38px] w-full items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-teal-700">
                    <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-500">
                      NIP.
                    </span>
                    <input
                      type="text"
                      value={normalizePejabatNipNumber(sptjmDraft.pejabatNip)}
                      onChange={(e) =>
                        setSptjmDraft((prev) => ({
                          ...prev,
                          pejabatNip: normalizePejabatNipNumber(e.target.value),
                        }))
                      }
                      placeholder="19680514 198901 2 002"
                      className="min-h-[36px] w-full border-0 bg-transparent px-3 text-xs text-slate-900 tabular-nums focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {onSaveSptjmTemplate ? (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={isOffline}
                  checked={saveSptjmDefault && !isOffline}
                  onChange={(e) => setSaveSptjmDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  Simpan perubahan ini sebagai template SPTJM default
                  {isOffline ? ' (nonaktif saat offline)' : ''}
                </span>
              </label>
            ) : null}

            <button
              type="button"
              disabled={isDownloadingSptjmPdf}
              onClick={() => void handleDownloadSptjmPdf()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isDownloadingSptjmPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>
                {isDownloadingSptjmPdf ? 'Menyiapkan SPTJM PDF...' : 'Download SPTJM PDF F4'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 2-Step Confirmation Modal when detaching KPM from an active proposal */}
      <SlotHandlingConfirmModal
        isOpen={Boolean(pendingStatusConfirm && !isOffline)}
        actionType="move"
        kpmName={record.nama}
        registerCode={record.registerCode}
        originProposalName={record.proposal}
        originSlotNumber={currentSlotNumber}
        destinationLabel={
          pendingStatusConfirm?.targetStatus === 'rejected' ? 'Arsip Ditolak' : 'Database KPM'
        }
        requiresSlotChoice={Boolean(!isStandalone && record.validasi === 'accepted' && record.proposal?.trim())}
        onCancel={() => setPendingStatusConfirm(null)}
        onConfirm={(slotHandling) => {
          if (!pendingStatusConfirm) return;
          const nextSt = pendingStatusConfirm.targetStatus;
          setPendingStatusConfirm(null);
          onUpdateStatus(record.id, nextSt, undefined, slotHandling);
        }}
      />
    </div>
  );
}
