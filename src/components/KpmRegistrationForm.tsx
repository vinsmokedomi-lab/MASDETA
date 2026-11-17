import { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  ScanLine,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  KtpKkScanIssue,
  OcrImagePayload,
  SCAN_FIELD_LABELS,
  ScanIdentityField,
  scanKtpAndKkDocuments,
} from '../services/ktpKkOcr';
import {
  ALL_KELURAHAN_OPTIONS,
  DTSEN_OPTION_ITEMS,
  INITIAL_FORM_VALUES,
  INITIAL_WILAYAH_LIST,
  PEKERJAAN_OPTIONS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmDocuments,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  ProposalSlotMap,
  SingleDocumentKey,
  SlotRemovalMode,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  blockNonNumericKeyDown,
  capitalizeWords,
  formatAlamatLengkap,
  getItemsForYear,
  getKelurahanOptionsForProposal,
  getKpmSlotNumberInProposal,
  isKecamatanProposal,
  isValidNik16,
  isValidRtRw,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalDomicile,
  resolveProposalKecamatanCategory,
  resolveProposalSlotStateForGroup,
  sanitizeDigits,
  sortKecamatanCategoryNames,
} from '../utils/imageProcessor';
import { DocumentUploadCard } from './DocumentUploadCard';
import { DriveImage } from './DriveImage';
import { MultiDocumentUploadCard } from './MultiDocumentUploadCard';
import { PengelolaSelectorModal } from './PengelolaSelectorModal';
import { SelectionPickerModal, SelectionPickerOption } from './SelectionPickerModal';
import { SlotHandlingConfirmModal } from './SlotHandlingConfirmModal';
import { PlaceholderSelect } from './FormControls';
import { useIsDesktopWeb } from '../utils/platform';

interface KpmRegistrationFormProps {
  editingRecord: KpmRecord | null;
  existingRecords?: KpmRecord[];
  pengelolaList: PengelolaProfile[];
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  itemOptions?: ItemBantuan[];
  pekerjaanOptions?: string[];
  yearOptions?: string[];
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  preselectedProposal?: { namaProposal: string; tahun: string } | null;
  lockedProposalScope?: { namaProposal: string; tahun: string } | null;
  proposalSlotMap?: ProposalSlotMap;
  targetSlot?: {
    proposalId: string;
    proposalName: string;
    tahun: string;
    slotNumber: number;
    item?: string;
  } | null;
  initialStandaloneStatus?: 'pending' | 'rejected' | null;
  onClearPreselectedProposal?: () => void;
  onBack?: () => void;
  onOpenAddProposal: (selectedYear?: string) => void;
  onCreatePengelola: (profile: PengelolaProfile) => void;
  onAddPekerjaan?: (job: string) => void;
  onAddYear?: (year: string) => void;
  onSave: (
    values: KpmFormValues,
    editingId?: string,
    targetSlotNumber?: number | null,
    oldSlotHandling?: SlotRemovalMode
  ) => Promise<boolean> | boolean | void;
  onQuickSyncKpmDocuments?: (kpmId: string, nextDocuments: KpmDocuments) => Promise<void> | void;
  onCancelEdit: () => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
}

type FormErrors = Partial<Record<keyof KpmFormValues | 'docKtp' | 'docKk', string>>;

export function KpmRegistrationForm({
  editingRecord,
  existingRecords = [],
  pengelolaList,
  proposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  itemOptions,
  pekerjaanOptions,
  yearOptions,
  feedback,
  onDismissFeedback,
  preselectedProposal,
  lockedProposalScope,
  proposalSlotMap = {},
  targetSlot = null,
  initialStandaloneStatus,
  onClearPreselectedProposal,
  onBack,
  onOpenAddProposal,
  onCreatePengelola,
  onAddPekerjaan,
  onAddYear,
  onSave,
  onQuickSyncKpmDocuments,
  onCancelEdit,
  onPreviewDocument,
}: KpmRegistrationFormProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const isProposalScopeLocked = Boolean(lockedProposalScope && !editingRecord);

  const buildInitialFormValues = (): KpmFormValues => {
    if (lockedProposalScope) {
      const matched = proposals.find(
        (p) =>
          p.namaProposal === lockedProposalScope.namaProposal &&
          p.tahun === lockedProposalScope.tahun
      );
      const dom = resolveProposalDomicile(
        lockedProposalScope.namaProposal,
        proposals,
        lockedProposalScope.tahun,
        wilayahList
      );
      return {
        ...INITIAL_FORM_VALUES,
        tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
        proposalId: matched?.id || null,
        proposal: lockedProposalScope.namaProposal,
        kabKota: dom.kabKota || wilayahList[0]?.nama || '',
        kecamatan: dom.kecamatan || '',
        kelurahan: dom.kelurahan || '',
        item: targetSlot?.item || INITIAL_FORM_VALUES.item,
        validasi: 'accepted',
      };
    }
    if (initialStandaloneStatus === 'pending' || initialStandaloneStatus === 'rejected') {
      return {
        ...INITIAL_FORM_VALUES,
        tahun: '',
        proposalId: null,
        proposal: '',
        kabKota: wilayahList[0]?.nama || '',
        validasi: initialStandaloneStatus,
      };
    }
    return {
      ...INITIAL_FORM_VALUES,
      kabKota: wilayahList[0]?.nama || '',
    };
  };

  const [values, setValues] = useState<KpmFormValues>(buildInitialFormValues);
  const [selectedEmptySlotNo, setSelectedEmptySlotNo] = useState<number | null>(
    targetSlot?.slotNumber ?? null
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [isTahunModalOpen, setIsTahunModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isPekerjaanModalOpen, setIsPekerjaanModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isPengelolaModalOpen, setIsPengelolaModalOpen] = useState(false);
  const [isDtsenModalOpen, setIsDtsenModalOpen] = useState(false);
  const [extraYears, setExtraYears] = useState<string[]>([]);
  const [extraPekerjaan, setExtraPekerjaan] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ktpOcrImage, setKtpOcrImage] = useState<OcrImagePayload | undefined>(undefined);
  const [kkOcrImage, setKkOcrImage] = useState<OcrImagePayload | undefined>(undefined);
  const [isScanningDocs, setIsScanningDocs] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanReport, setScanReport] = useState<{
    filledFields: ScanIdentityField[];
    blurryFields: ScanIdentityField[];
    fieldIssues: KtpKkScanIssue[];
    ktpNameMatchesKk: boolean;
  } | null>(null);
  const [pendingEditMovePayload, setPendingEditMovePayload] = useState<{
    normalizedValues: KpmFormValues;
    targetSlotNumber: number | null;
    destinationLabel: string;
  } | null>(null);

  const editingOriginSlotNumber = useMemo(
    () =>
      editingRecord
        ? getKpmSlotNumberInProposal(
            editingRecord,
            existingRecords,
            proposals,
            itemOptions || [],
            wilayahList,
            proposalSlotMap
          )
        : null,
    [editingRecord, existingRecords, proposals, itemOptions, wilayahList, proposalSlotMap]
  );

  const resolvedYearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    (yearOptions || []).forEach((y) => {
      if (y) set.add(y);
    });
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    (itemOptions || []).forEach((i) => {
      if (i.tahun) set.add(i.tahun);
    });
    extraYears.forEach((y) => {
      if (y) set.add(y);
    });
    if (values.tahun) set.add(values.tahun);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [yearOptions, proposals, itemOptions, extraYears, values.tahun]);

  const resolvedPekerjaanOptions = useMemo(() => {
    const base =
      pekerjaanOptions && pekerjaanOptions.length > 0 ? pekerjaanOptions : PEKERJAAN_OPTIONS;
    const map = new Map<string, string>();
    for (const opt of [...base, ...extraPekerjaan]) {
      const clean = opt.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'id'));
  }, [pekerjaanOptions, extraPekerjaan]);
  const resolvedItemOptions: ItemBantuan[] = useMemo(() => {
    const base = getItemsForYear(itemOptions || [], values.tahun || '2026');
    if (editingRecord && values.item && !base.some((b) => b.code === values.item)) {
      const legacyPkg = resolvePackageForKpm(itemOptions || [], values.tahun || '2026', values.item);
      return [legacyPkg, ...base];
    }
    return base;
  }, [itemOptions, values.tahun, values.item, editingRecord]);

  const selectedPackageSubItems = useMemo(() => {
    if (!values.item) return [];
    return resolvePackageForKpm(itemOptions || [], values.tahun || '2026', values.item).subItems;
  }, [itemOptions, values.tahun, values.item]);

  useEffect(() => {
    if (editingRecord) {
      const dom = resolveKpmDomicile(editingRecord, proposals, wilayahList);
      const isStandalone = editingRecord.validasi !== 'accepted';
      setValues({
        tahun: editingRecord.tahun || '',
        proposalId: isStandalone ? null : editingRecord.proposalId ?? null,
        proposal: isStandalone ? '' : editingRecord.proposal || '',
        kabKota: editingRecord.kabKota || dom.kabKota || wilayahList[0]?.nama || '',
        kecamatan: editingRecord.kecamatan || dom.kecamatan || '',
        kelurahan: editingRecord.kelurahan || dom.kelurahan || '',
        item: editingRecord.item,
        nama: editingRecord.nama,
        alamat: editingRecord.alamat,
        rt: editingRecord.rt,
        rw: editingRecord.rw,
        nikKk: editingRecord.nikKk,
        nikKtp: editingRecord.nikKtp,
        dtsen: editingRecord.dtsen,
        validasi: editingRecord.validasi,
        kontak: editingRecord.kontak,
        pekerjaan: editingRecord.pekerjaan,
        pengelola: editingRecord.pengelola,
        catatan: editingRecord.catatan,
        payment: editingRecord.payment,
        documents: {
          ...editingRecord.documents,
          rumah: Array.isArray(editingRecord.documents.rumah)
            ? editingRecord.documents.rumah
            : editingRecord.documents.rumah
              ? [editingRecord.documents.rumah]
              : [],
          lainnya: editingRecord.documents.lainnya || [],
        },
      });
      setErrors({});
      setKtpOcrImage(undefined);
      setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
    } else if (lockedProposalScope) {
      const matched = proposals.find(
        (p) =>
          p.namaProposal === lockedProposalScope.namaProposal &&
          p.tahun === lockedProposalScope.tahun
      );
      const dom = resolveProposalDomicile(
        lockedProposalScope.namaProposal,
        proposals,
        lockedProposalScope.tahun,
        wilayahList
      );
      setValues({
        ...INITIAL_FORM_VALUES,
        tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
        proposalId: matched?.id || null,
        proposal: lockedProposalScope.namaProposal,
        kabKota: dom.kabKota || wilayahList[0]?.nama || '',
        kecamatan: dom.kecamatan || '',
        kelurahan: dom.kelurahan || '',
        item: targetSlot?.item || INITIAL_FORM_VALUES.item,
        validasi: 'accepted',
      });
      setSelectedEmptySlotNo(targetSlot?.slotNumber ?? null);
      setErrors({});
      setKtpOcrImage(undefined);
      setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
    } else if (initialStandaloneStatus === 'pending' || initialStandaloneStatus === 'rejected') {
      setValues({
        ...INITIAL_FORM_VALUES,
        tahun: '',
        proposalId: null,
        proposal: '',
        kabKota: wilayahList[0]?.nama || '',
        validasi: initialStandaloneStatus,
      });
      setSelectedEmptySlotNo(null);
      setErrors({});
      setKtpOcrImage(undefined);
      setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
    } else {
      setValues({
        ...INITIAL_FORM_VALUES,
        kabKota: wilayahList[0]?.nama || '',
      });
      setSelectedEmptySlotNo(null);
      setErrors({});
      setKtpOcrImage(undefined);
      setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
    }
  }, [editingRecord, lockedProposalScope, initialStandaloneStatus, targetSlot]);

  useEffect(() => {
    if (preselectedProposal && !editingRecord && !lockedProposalScope) {
      const matched = proposals.find(
        (p) =>
          p.namaProposal === preselectedProposal.namaProposal &&
          p.tahun === preselectedProposal.tahun
      );
      const nextOptions = getKelurahanOptionsForProposal(
        preselectedProposal.namaProposal,
        wilayahList
      );
      const dom = resolveProposalDomicile(
        preselectedProposal.namaProposal,
        proposals,
        preselectedProposal.tahun,
        wilayahList
      );
      setValues((prev) => ({
        ...prev,
        validasi: 'accepted',
        tahun: preselectedProposal.tahun || prev.tahun || '2026',
        proposalId: matched?.id || null,
        proposal: preselectedProposal.namaProposal,
        kabKota: dom.kabKota || prev.kabKota || wilayahList[0]?.nama || '',
        kecamatan: dom.kecamatan || prev.kecamatan || '',
        kelurahan: nextOptions.includes(prev.kelurahan)
          ? prev.kelurahan
          : dom.kelurahan || '',
      }));
      setErrors((prev) => ({ ...prev, proposal: undefined, kelurahan: undefined, kecamatan: undefined }));
      onClearPreselectedProposal?.();
    }
  }, [preselectedProposal, editingRecord, lockedProposalScope, onClearPreselectedProposal, wilayahList, proposals]);

  const proposalMenuItems = useMemo(() => {
    const map = new Map<
      string,
      { name: string; locked: boolean; tipe?: string; jumlahKpm?: number; kecamatanGroup: string }
    >();
    for (const prop of proposals) {
      if (values.tahun && prop.tahun !== values.tahun) continue;
      map.set(prop.namaProposal, {
        name: prop.namaProposal,
        locked: prop.status === 'locked',
        tipe: prop.tipe,
        jumlahKpm: prop.jumlahKpm,
        kecamatanGroup: resolveProposalKecamatanCategory(
          prop.namaProposal,
          proposals,
          prop.tahun,
          wilayahList
        ),
      });
    }
    if ((editingRecord || isProposalScopeLocked) && values.proposal && !map.has(values.proposal)) {
      const legacy = proposals.find((p) => p.namaProposal === values.proposal);
      map.set(values.proposal, {
        name: values.proposal,
        locked: legacy?.status === 'locked',
        tipe: legacy?.tipe,
        jumlahKpm: legacy?.jumlahKpm,
        kecamatanGroup: resolveProposalKecamatanCategory(
          values.proposal,
          proposals,
          values.tahun,
          wilayahList
        ),
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      const groupCmp = sortKecamatanCategoryNames(a.kecamatanGroup, b.kecamatanGroup);
      if (groupCmp !== 0) return groupCmp;
      const isKecA = isKecamatanProposal(a.name);
      const isKecB = isKecamatanProposal(b.name);
      if (isKecA !== isKecB) return isKecA ? -1 : 1;
      return a.name.localeCompare(b.name, 'id');
    });
  }, [proposals, values.tahun, values.proposal, editingRecord, isProposalScopeLocked, wilayahList]);

  const duplicateKkMatches = useMemo(() => {
    if (!isValidNik16(values.nikKk)) return [];
    return existingRecords
      .filter((r) => r.id !== editingRecord?.id && r.nikKk === values.nikKk)
      .sort((a, b) => (a.tahun === values.tahun ? -1 : b.tahun === values.tahun ? 1 : 0));
  }, [existingRecords, editingRecord?.id, values.nikKk, values.tahun]);

  const duplicateKtpMatches = useMemo(() => {
    if (!isValidNik16(values.nikKtp)) return [];
    return existingRecords
      .filter((r) => r.id !== editingRecord?.id && r.nikKtp === values.nikKtp)
      .sort((a, b) => (a.tahun === values.tahun ? -1 : b.tahun === values.tahun ? 1 : 0));
  }, [existingRecords, editingRecord?.id, values.nikKtp, values.tahun]);

  const selectedProposalRecord = useMemo(
    () =>
      proposals.find((p) => p.namaProposal === values.proposal && p.tahun === values.tahun) ??
      proposals.find((p) => p.namaProposal === values.proposal),
    [proposals, values.proposal, values.tahun]
  );

  const editingProposalLocked = useMemo(() => {
    if (!editingRecord) return false;
    const recProp =
      proposals.find(
        (p) => p.namaProposal === editingRecord.proposal && p.tahun === editingRecord.tahun
      ) ?? proposals.find((p) => p.namaProposal === editingRecord.proposal);
    return recProp?.status === 'locked';
  }, [editingRecord, proposals]);

  const isStandaloneMode = values.validasi === 'pending' || values.validasi === 'rejected';

  const availableEmptySlots = useMemo(() => {
    if (isStandaloneMode || !values.proposal?.trim()) return [];
    const { state } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      values.proposalId,
      values.proposal,
      values.tahun,
      proposals
    );
    return [...(state?.emptySlots || [])].sort((a, b) => a.slotNumber - b.slotNumber);
  }, [isStandaloneMode, proposalSlotMap, values.proposalId, values.proposal, values.tahun, proposals]);

  const standaloneKabKotaOptions = useMemo(() => wilayahList.map((w) => w.nama), [wilayahList]);

  const standaloneKecamatanOptions = useMemo(() => {
    const activeKab =
      wilayahList.find((w) => w.nama === values.kabKota) || wilayahList[0];
    return activeKab ? activeKab.kecamatanList.map((k) => k.nama) : [];
  }, [wilayahList, values.kabKota]);

  const standaloneKelurahanOptions = useMemo(() => {
    const activeKab =
      wilayahList.find((w) => w.nama === values.kabKota) || wilayahList[0];
    if (!values.kecamatan) {
      return activeKab
        ? Array.from(new Set(activeKab.kecamatanList.flatMap((k) => k.kelurahanList)))
        : ALL_KELURAHAN_OPTIONS;
    }
    const kecLower = (values.kecamatan ?? '').toLowerCase();
    const matchedKec = activeKab?.kecamatanList.find(
      (k) => k.nama.toLowerCase() === kecLower
    );
    return matchedKec ? matchedKec.kelurahanList : [];
  }, [wilayahList, values.kabKota, values.kecamatan]);

  const isKecamatanSelected = !isStandaloneMode && isKecamatanProposal(values.proposal);
  const showKelurahanField = isKecamatanSelected;
  const matchedKelurahanOptions = getKelurahanOptionsForProposal(values.proposal, wilayahList);
  const allWilayahKelurahanOptions = useMemo(() => {
    const list = wilayahList.flatMap((kab) =>
      kab.kecamatanList.flatMap((kec) => kec.kelurahanList)
    );
    return list.length > 0 ? Array.from(new Set(list)) : ALL_KELURAHAN_OPTIONS;
  }, [wilayahList]);
  const kelurahanOptions = isStandaloneMode
    ? standaloneKelurahanOptions
    : matchedKelurahanOptions.length > 0
      ? matchedKelurahanOptions
      : isKecamatanSelected
        ? allWilayahKelurahanOptions
        : [];

  const updateField = <K extends keyof KpmFormValues>(key: K, val: KpmFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    setScanReport((prev) => {
      if (!prev) return prev;
      const keyStr = key as string;
      if (!prev.blurryFields.includes(key as ScanIdentityField)) return prev;
      return {
        ...prev,
        blurryFields: prev.blurryFields.filter((f) => f !== keyStr),
        fieldIssues: prev.fieldIssues.filter((issue) => issue.field !== keyStr),
      };
    });
  };

  const handleStatusRoutingChange = (nextStatus: ValidationStatus) => {
    if (isProposalScopeLocked && nextStatus !== 'accepted') return;
    if (!targetSlot && nextStatus !== 'accepted') {
      setSelectedEmptySlotNo(null);
    }
    setValues((prev) => {
      if (nextStatus === 'pending' || nextStatus === 'rejected') {
        const resolvedDom = prev.proposal
          ? resolveProposalDomicile(prev.proposal, proposals, prev.tahun, wilayahList)
          : { kabKota: prev.kabKota || '', kecamatan: prev.kecamatan || '', kelurahan: prev.kelurahan || '' };
        return {
          ...prev,
          validasi: nextStatus,
          proposalId: null,
          proposal: '',
          kabKota: prev.kabKota || resolvedDom.kabKota || wilayahList[0]?.nama || '',
          kecamatan: prev.kecamatan || resolvedDom.kecamatan || '',
          kelurahan: prev.kelurahan || resolvedDom.kelurahan || '',
        };
      }
      // Switching to 'accepted' -> require active proposal
      return {
        ...prev,
        validasi: 'accepted',
        tahun: prev.tahun || '2026',
      };
    });
    setErrors((prev) => ({
      ...prev,
      validasi: undefined,
      proposal: undefined,
      tahun: undefined,
      kecamatan: undefined,
      kelurahan: undefined,
    }));
  };

  const handleYearChange = (nextYear: string) => {
    if (!targetSlot) setSelectedEmptySlotNo(null);
    setValues((prev) => {
      const keepProposal =
        editingRecord ||
        isProposalScopeLocked ||
        (prev.validasi === 'accepted' &&
          proposals.some((p) => p.tahun === nextYear && p.namaProposal === prev.proposal));
      const itemYearRef = nextYear || '2026';
      const nextYearItems = getItemsForYear(itemOptions || [], itemYearRef);
      const keepItem =
        editingRecord ||
        nextYearItems.some((item) => item.code === prev.item);
      return {
        ...prev,
        tahun: nextYear,
        proposalId: keepProposal ? prev.proposalId : null,
        proposal: keepProposal ? prev.proposal : '',
        kelurahan:
          prev.validasi !== 'accepted' || keepProposal ? prev.kelurahan : '',
        item: keepItem ? prev.item : '',
      };
    });
    setErrors((prev) => ({
      ...prev,
      tahun: undefined,
      proposal: undefined,
      kelurahan: undefined,
      item: undefined,
    }));
  };

  const handleProposalChange = (nextProposal: string) => {
    if (nextProposal === '__new_proposal__') {
      onOpenAddProposal();
      return;
    }
    if (!targetSlot) setSelectedEmptySlotNo(null);
    const matchedProp = proposals.find(
      (p) => p.namaProposal === nextProposal && (!values.tahun || p.tahun === values.tahun)
    );
    const nextOptions = getKelurahanOptionsForProposal(nextProposal, wilayahList);
    const resolvedDom = resolveProposalDomicile(nextProposal, proposals, values.tahun, wilayahList);
    setValues((prev) => ({
      ...prev,
      validasi: 'accepted',
      proposalId: matchedProp?.id || null,
      proposal: nextProposal,
      kabKota: resolvedDom.kabKota || prev.kabKota || wilayahList[0]?.nama || '',
      kecamatan: resolvedDom.kecamatan || prev.kecamatan || '',
      kelurahan: nextOptions.includes(prev.kelurahan)
        ? prev.kelurahan
        : resolvedDom.kelurahan || '',
    }));
    setErrors((prev) => ({ ...prev, proposal: undefined, kelurahan: undefined, validasi: undefined }));
  };

  const handleDtsenChange = (nextDtsen: string) => {
    setValues((prev) => ({
      ...prev,
      dtsen: nextDtsen,
    }));
    setErrors((prev) => ({ ...prev, dtsen: undefined }));
  };

  const handleRtRwChange = (key: 'rt' | 'rw', rawVal: string) => {
    const digits = sanitizeDigits(rawVal, 3);
    updateField(key, digits);
  };

  const handleRtRwBlur = (key: 'rt' | 'rw') => {
    const current = values[key].trim();
    if (!current) return;
    if (current.length < 3) {
      const padded = current.padStart(3, '0');
      updateField(key, padded);
    }
  };

  const updateSingleDocument = (key: SingleDocumentKey, file?: KpmDocumentFile) => {
    setValues((prev) => {
      const nextDocuments: KpmDocuments = {
        ...prev.documents,
        [key]: file,
      };
      if (editingRecord && onQuickSyncKpmDocuments) {
        void onQuickSyncKpmDocuments(editingRecord.id, nextDocuments);
      }
      return {
        ...prev,
        documents: nextDocuments,
      };
    });
    if (key === 'ktp') {
      if (!file) setKtpOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
      if (errors.docKtp) {
        setErrors((prev) => ({ ...prev, docKtp: undefined }));
      }
    }
    if (key === 'kk') {
      if (!file) setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
      if (errors.docKk) {
        setErrors((prev) => ({ ...prev, docKk: undefined }));
      }
    }
  };

  const updateRumahDocuments = (files: KpmDocumentFile[]) => {
    setValues((prev) => {
      const nextDocuments: KpmDocuments = {
        ...prev.documents,
        rumah: files,
      };
      if (editingRecord && onQuickSyncKpmDocuments) {
        void onQuickSyncKpmDocuments(editingRecord.id, nextDocuments);
      }
      return {
        ...prev,
        documents: nextDocuments,
      };
    });
  };

  const updateLainnyaDocuments = (files: KpmDocumentFile[]) => {
    setValues((prev) => {
      const nextDocuments: KpmDocuments = {
        ...prev.documents,
        lainnya: files,
      };
      if (editingRecord && onQuickSyncKpmDocuments) {
        void onQuickSyncKpmDocuments(editingRecord.id, nextDocuments);
      }
      return {
        ...prev,
        documents: nextDocuments,
      };
    });
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    // Kategori 01: Aturan routing Proposal vs Standalone Domisili
    if (values.validasi === 'accepted') {
      if (!values.tahun) nextErrors.tahun = 'Pilih tahun anggaran proposal.';
      if (!values.proposal) {
        nextErrors.proposal = 'KPM berstatus Diterima wajib dihubungkan ke Proposal aktif (Murni / Perubahan).';
      } else if (selectedProposalRecord?.status === 'locked') {
        nextErrors.proposal =
          'Proposal ini berstatus Terkunci dan tidak dapat menerima atau mengubah data KPM.';
      }
      if (showKelurahanField && !values.kelurahan) {
        nextErrors.kelurahan = 'Pilih kelurahan domisili calon KPM.';
      }
    } else {
      // Standalone (Database KPM / Arsip Ditolak): tahun boleh kosong, domisili wajib
      if (!values.kecamatan?.trim()) {
        nextErrors.kecamatan = 'Pilih kecamatan domisili calon KPM.';
      }
      if (!values.kelurahan?.trim()) {
        nextErrors.kelurahan = 'Pilih kelurahan / desa domisili calon KPM.';
      }
    }

    // Kategori 02: Wajib semua KECUALI Nomor HP (kontak)
    if (!isValidNik16(values.nikKk)) {
      nextErrors.nikKk = 'Nomor Kartu Keluarga (KK) harus terdiri dari tepat 16 digit angka.';
    }
    if (!isValidNik16(values.nikKtp)) {
      nextErrors.nikKtp = 'NIK KTP harus terdiri dari tepat 16 digit angka.';
    }
    if (!values.nama.trim()) nextErrors.nama = 'Nama lengkap wajib diisi.';
    if (!values.alamat.trim()) nextErrors.alamat = 'Alamat domisili wajib diisi.';

    const normalizedRt =
      values.rt.length > 0 && values.rt.length < 3 ? values.rt.padStart(3, '0') : values.rt;
    const normalizedRw =
      values.rw.length > 0 && values.rw.length < 3 ? values.rw.padStart(3, '0') : values.rw;

    if (!isValidRtRw(normalizedRt)) {
      nextErrors.rt = 'RT wajib 3 digit dan berawalan angka 0 (contoh: 001).';
    }
    if (!isValidRtRw(normalizedRw)) {
      nextErrors.rw = 'RW wajib 3 digit dan berawalan angka 0 (contoh: 001).';
    }
    if (!values.pekerjaan) nextErrors.pekerjaan = 'Pilih pekerjaan utama.';

    // Kategori 03: Wajib untuk Item, Pengelola, DTSEN, dan Validasi Berkas (Biaya Administrasi & Catatan Petugas opsional)
    if (!values.item) nextErrors.item = 'Pilih item bantuan.';
    if (!values.pengelola) nextErrors.pengelola = 'Pilih atau tambahkan pengelola.';
    if (!values.dtsen) nextErrors.dtsen = 'Pilih status DTSEN.';
    if (!values.validasi) nextErrors.validasi = 'Pilih status validasi berkas.';

    // Kategori 04: Foto KTP & KK opsional sementara agar data KPM yang sudah diunggah tetap dapat diperbarui & disimpan
    return nextErrors;
  };

  const executeSave = async (
    normalizedValues: KpmFormValues,
    resolvedTargetSlot: number | null,
    oldSlotHandling: SlotRemovalMode = 'vacate'
  ) => {
    setIsSubmitting(true);
    try {
      const saveResult = await onSave(
        normalizedValues,
        editingRecord?.id,
        resolvedTargetSlot,
        oldSlotHandling
      );

      if (saveResult !== false && !editingRecord) {
        setValues(buildInitialFormValues());
        setSelectedEmptySlotNo(null);
        setErrors({});
        setKtpOcrImage(undefined);
        setKkOcrImage(undefined);
        setScanError(null);
        setScanReport(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingProposalLocked || isSubmitting) return;
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstErrorKey = Object.keys(validationErrors)[0];
      const targetId =
        firstErrorKey === 'docKtp'
          ? 'upload-ktp'
          : firstErrorKey === 'docKk'
            ? 'upload-kk'
            : `field-${firstErrorKey}`;
      const el = document.getElementById(targetId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const isStandalone = values.validasi === 'pending' || values.validasi === 'rejected';
    const resolvedProp = !isStandalone
      ? selectedProposalRecord ||
        proposals.find(
          (p) => p.namaProposal === values.proposal && (!values.tahun || p.tahun === values.tahun)
        )
      : undefined;
    const resolvedDomicile = !isStandalone
      ? resolveProposalDomicile(values.proposal, proposals, values.tahun, wilayahList)
      : { kabKota: values.kabKota || '', kecamatan: values.kecamatan || '', kelurahan: values.kelurahan || '' };

    const normalizedValues: KpmFormValues = {
      ...values,
      tahun: isStandalone ? values.tahun.trim() : values.tahun,
      proposalId: isStandalone ? null : resolvedProp?.id || values.proposalId || null,
      proposal: isStandalone ? '' : values.proposal,
      kabKota: resolvedDomicile.kabKota || values.kabKota || '',
      kecamatan: resolvedDomicile.kecamatan || values.kecamatan || '',
      kelurahan: isStandalone
        ? values.kelurahan
        : showKelurahanField
          ? values.kelurahan
          : resolvedDomicile.kelurahan || values.kelurahan || '',
      nama: values.nama.trim().toUpperCase(),
      alamat: formatAlamatLengkap(values.alamat, true),
      catatan: values.catatan.trim(),
      rt: values.rt.trim().padStart(3, '0'),
      rw: values.rw.trim().padStart(3, '0'),
    };
    const resolvedTargetSlot = isStandalone
      ? null
      : (targetSlot?.slotNumber ?? selectedEmptySlotNo ?? null);

    const leavesOldProposalSlot = Boolean(
      editingRecord &&
        editingRecord.validasi === 'accepted' &&
        editingRecord.proposal?.trim() &&
        (isStandalone ||
          normalizedValues.proposal !== editingRecord.proposal ||
          normalizedValues.tahun !== editingRecord.tahun)
    );

    if (leavesOldProposalSlot && editingRecord) {
      const destinationLabel = isStandalone
        ? normalizedValues.validasi === 'rejected'
          ? 'Arsip Ditolak'
          : 'Database KPM'
        : normalizedValues.tahun
          ? `${normalizedValues.proposal} (${normalizedValues.tahun})`
          : normalizedValues.proposal;
      setPendingEditMovePayload({
        normalizedValues,
        targetSlotNumber: resolvedTargetSlot,
        destinationLabel,
      });
      return;
    }

    await executeSave(normalizedValues, resolvedTargetSlot, 'vacate');
  };

  const handleReset = () => {
    if (editingRecord) {
      onCancelEdit();
    } else {
      setValues(buildInitialFormValues());
      setErrors({});
      setKtpOcrImage(undefined);
      setKkOcrImage(undefined);
      setScanError(null);
      setScanReport(null);
    }
  };

  const scrollToIdentityField = (fieldKey: ScanIdentityField) => {
    const wrapper = document.getElementById(`field-${fieldKey}`);
    wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inputIdMap: Record<ScanIdentityField, string> = {
      nikKk: 'input-nik-kk',
      nikKtp: 'input-nik-ktp',
      nama: 'input-nama',
      alamat: 'input-alamat',
      rt: 'input-rt',
      rw: 'input-rw',
      pekerjaan: 'input-pekerjaan',
    };
    const inputEl = document.getElementById(inputIdMap[fieldKey]);
    if (inputEl instanceof HTMLElement) {
      window.setTimeout(() => inputEl.focus({ preventScroll: true }), 250);
    }
  };

  const handleScanKtpKk = async () => {
    const ktpDoc = values.documents.ktp;
    const kkDoc = values.documents.kk;
    if (!ktpDoc || !kkDoc || isScanningDocs || editingProposalLocked) return;

    setIsScanningDocs(true);
    setScanError(null);
    setScanReport(null);

    try {
      const result = await scanKtpAndKkDocuments({
        ktpDoc,
        kkDoc,
        ktpOcrImage,
        kkOcrImage,
        pekerjaanOptions: resolvedPekerjaanOptions,
        kelurahanOptions,
      });

      const filled: ScanIdentityField[] = [];
      setValues((prev) => {
        const next = { ...prev };
        if (result.nikKk) {
          next.nikKk = result.nikKk;
        }
        if (result.nikKtp) {
          next.nikKtp = result.nikKtp;
        }
        if (result.nama) {
          next.nama = result.nama;
        }
        if (result.alamat) {
          next.alamat = result.alamat;
        }
        if (result.rt) {
          next.rt = result.rt;
        }
        if (result.rw) {
          next.rw = result.rw;
        }
        if (result.pekerjaan) {
          next.pekerjaan = result.pekerjaan;
        }
        if (showKelurahanField && !prev.kelurahan && result.kelurahan) {
          next.kelurahan = result.kelurahan;
        }
        return next;
      });

      if (result.nikKk) filled.push('nikKk');
      if (result.nikKtp) filled.push('nikKtp');
      if (result.nama) filled.push('nama');
      if (result.alamat) filled.push('alamat');
      if (result.rt) filled.push('rt');
      if (result.rw) filled.push('rw');
      if (result.pekerjaan) filled.push('pekerjaan');

      setErrors((prev) => ({
        ...prev,
        ...(result.nikKk ? { nikKk: undefined } : {}),
        ...(result.nikKtp ? { nikKtp: undefined } : {}),
        ...(result.nama ? { nama: undefined } : {}),
        ...(result.alamat ? { alamat: undefined } : {}),
        ...(result.rt ? { rt: undefined } : {}),
        ...(result.rw ? { rw: undefined } : {}),
        ...(result.pekerjaan ? { pekerjaan: undefined } : {}),
        ...(showKelurahanField && result.kelurahan ? { kelurahan: undefined } : {}),
      }));

      setScanReport({
        filledFields: filled,
        blurryFields: result.blurryFields,
        fieldIssues: result.fieldIssues,
        ktpNameMatchesKk: result.ktpNameMatchesKk,
      });
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Gagal memindai foto KTP & KK. Pastikan gambar jelas dan coba lagi.'
      );
    } finally {
      setIsScanningDocs(false);
    }
  };

  const renderFieldScanBadge = (field: ScanIdentityField) => {
    if (!scanReport) return null;
    if (scanReport.blurryFields.includes(field)) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          <AlertTriangle className="h-2.5 w-2.5" />
          Buram — isi manual
        </span>
      );
    }
    if (scanReport.filledFields.includes(field)) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
          <Sparkles className="h-2.5 w-2.5" />
          Hasil scan
        </span>
      );
    }
    return null;
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  const selectedPengelolaObj = pengelolaList.find((p) => p.displayName === values.pengelola);
  const hasProposalSelected = isStandaloneMode || Boolean(values.tahun && values.proposal);

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="min-h-screen pb-24">
        {/* Native Mobile Sub-Screen Header (Native APK only) */}
        {isNativeApp && (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              if (editingRecord) {
                onCancelEdit();
              } else if (onBack) {
                onBack();
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">
            {editingRecord ? 'Perbarui Data Calon KPM' : 'Pendaftaran Calon KPM'}
          </h1>
        </header>
        )}

        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          {!isNativeApp && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (editingRecord) {
                    onCancelEdit();
                  } else if (onBack) {
                    onBack();
                  } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                aria-label="Kembali"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali</span>
              </button>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                {editingRecord ? 'Perbarui Data Calon KPM' : 'Pendaftaran Calon KPM'}
              </h1>
            </div>
          )}

          {editingProposalLocked && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs text-amber-950"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Data KPM Terkunci oleh Status Proposal</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Proposal &ldquo;{editingRecord?.proposal}&rdquo; sedang berstatus Terkunci. Data KPM di dalamnya tidak dapat diedit atau dipindahkan ke proposal lain.
                </p>
              </div>
            </div>
          )}

          {errorCount > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="font-semibold">
                  Terdapat {errorCount} kolom wajib yang belum dilengkapi atau tidak valid.
                </p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">
                  Kategori 1, Kategori 2 (kecuali Nomor HP), Kategori 3 (kecuali Biaya Administrasi & Catatan Petugas), dan Kategori 4 wajib diisi sebelum menyimpan.
                </p>
              </div>
            </div>
          )}

          {/* Mobile Single-Column / Desktop Web 2-Column Split */}
          <div
            className={
              !isNativeApp
                ? 'space-y-4 md:grid md:grid-cols-12 md:items-start md:gap-6 md:space-y-0'
                : 'space-y-4'
            }
          >
            <div
              className={
                !isNativeApp
                  ? hasProposalSelected
                    ? 'space-y-4 md:col-span-7 md:space-y-5'
                    : 'space-y-4 md:col-span-5'
                  : 'space-y-4'
              }
            >
          {/* Section 1: Tujuan Penempatan & Data Usulan */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              01. Penempatan Data &amp; Usulan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tentukan tujuan penyimpanan data KPM: Proposal aktif (Diterima), Database KPM (Menunggu), atau Arsip Berkas Ditolak.
            </p>

            <div className="mt-4 space-y-4">
              {/* Status Routing Selector */}
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Status / Tujuan Penempatan <span className="text-rose-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      { key: 'accepted', label: 'Diterima (Proposal)' },
                      { key: 'pending', label: 'Database KPM' },
                      { key: 'rejected', label: 'Arsip Ditolak' },
                    ] as { key: ValidationStatus; label: string }[]
                  ).map((opt) => {
                    const active = values.validasi === opt.key;
                    const activeTone =
                      opt.key === 'accepted'
                        ? 'bg-teal-700 text-white'
                        : opt.key === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-900 shadow-sm';
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={editingProposalLocked || (isProposalScopeLocked && opt.key !== 'accepted')}
                        onClick={() => handleStatusRoutingChange(opt.key)}
                        className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          active ? activeTone : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {isStandaloneMode
                    ? values.validasi === 'rejected'
                      ? 'Mode Standalone: data tidak terhubung ke proposal (proposal_id = NULL) dan langsung masuk ke menu Arsip Berkas Ditolak.'
                      : 'Mode Standalone: data tidak terhubung ke proposal (proposal_id = NULL) dan langsung masuk ke menu Database KPM.'
                    : 'Mode Proposal: KPM berstatus Diterima wajib terhubung ke salah satu Proposal aktif bertipe Murni atau Perubahan.'}
                </p>
              </div>

              <div id="field-tahun">
                <div className="flex items-center justify-between gap-2">
                  <span className="block text-xs font-semibold text-slate-700">
                    Tahun Anggaran {!isStandaloneMode && <span className="text-rose-600">*</span>}
                  </span>
                  {isStandaloneMode && (
                    <span className="text-[11px] text-slate-400">Opsional (boleh kosong)</span>
                  )}
                </div>
                <button
                  type="button"
                  id="input-tahun"
                  disabled={editingProposalLocked || isProposalScopeLocked}
                  onClick={() => setIsTahunModalOpen(true)}
                  className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 ${
                    errors.tahun ? 'border-rose-400' : 'border-slate-300'
                  }`}
                >
                  <span
                    className={`truncate ${
                      values.tahun ? 'font-medium text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {values.tahun || (isStandaloneMode ? 'Tanpa Tahun' : 'Pilih Tahun')}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                </button>
                {errors.tahun && <p className="mt-1 text-xs text-rose-600">{errors.tahun}</p>}
              </div>

              {!isStandaloneMode ? (
                <>
                  <div id="field-proposal">
                    <span className="block text-xs font-semibold text-slate-700">
                      Proposal Tujuan (Murni / Perubahan) <span className="text-rose-600">*</span>
                    </span>
                    <button
                      type="button"
                      id="input-proposal"
                      disabled={editingProposalLocked || isProposalScopeLocked}
                      onClick={() => setIsProposalModalOpen(true)}
                      className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 ${
                        errors.proposal ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    >
                      <span
                        className={`truncate ${
                          values.proposal ? 'font-medium text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {values.proposal || 'Pilih Proposal Aktif'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    </button>

                    {isProposalScopeLocked && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-teal-800">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Tahun dan proposal dikunci otomatis. Ubah nanti melalui menu Edit Data KPM jika perlu.
                        </span>
                      </p>
                    )}

                    {errors.proposal && <p className="mt-0.5 text-xs text-rose-600">{errors.proposal}</p>}
                  </div>

                  {targetSlot && !editingRecord ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                      <p className="font-bold">
                        Mengisi Baris Kosong Nomor Urut #{String(targetSlot.slotNumber).padStart(2, '0')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-800">
                        KPM baru akan langsung menempati urutan #{String(targetSlot.slotNumber).padStart(2, '0')} di {targetSlot.proposalName}
                        {targetSlot.item ? ` (paket barang ${targetSlot.item})` : ''} untuk menjaga penomoran SK Dinas / BAST.
                      </p>
                    </div>
                  ) : !editingRecord && availableEmptySlots.length > 0 ? (
                    <div>
                      <label htmlFor="input-empty-slot" className="block text-xs font-semibold text-slate-700">
                        Penempatan Nomor Urut / Baris Kosong (opsional)
                      </label>
                      <select
                        id="input-empty-slot"
                        value={selectedEmptySlotNo ? String(selectedEmptySlotNo) : ''}
                        onChange={(e) => {
                          const nextSlot = e.target.value ? parseInt(e.target.value, 10) : null;
                          setSelectedEmptySlotNo(nextSlot);
                          if (nextSlot) {
                            const matchedSlot = availableEmptySlots.find(
                              (s) => s.slotNumber === nextSlot
                            );
                            if (matchedSlot?.item && !values.item) {
                              updateField('item', matchedSlot.item);
                            }
                          }
                        }}
                        className="mt-1.5 min-h-[42px] w-full rounded-xl border border-amber-300 bg-amber-50/60 px-3 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                      >
                        <option value="">Urutan Normal (Tambahkan / Ikuti Hierarki)</option>
                        {availableEmptySlots.map((slot) => (
                          <option key={slot.slotNumber} value={String(slot.slotNumber)}>
                            Isi Baris Kosong #{String(slot.slotNumber).padStart(2, '0')}
                            {slot.previousKpmName ? ` (bekas ${slot.previousKpmName})` : ''}
                            {slot.item ? ` · ${slot.item}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {/* Conditional Kelurahan Field when Proposal is Kecamatan */}
                  {showKelurahanField && (
                    <div id="field-kelurahan">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="input-kelurahan" className="block text-xs font-semibold text-slate-700">
                          Kelurahan / Desa Domisili Calon KPM <span className="text-rose-600">*</span>
                        </label>
                        <span className="text-[11px] text-slate-500">
                          Wajib (Kecamatan)
                        </span>
                      </div>
                      <PlaceholderSelect
                        placeholder={`Pilih Kelurahan / Desa di ${values.proposal}`}
                        id="input-kelurahan"
                        value={values.kelurahan}
                        onChange={(v) => updateField('kelurahan', v)}
                        className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                          errors.kelurahan ? 'border-rose-400' : 'border-slate-300'
                        }`}
                      >
                        {kelurahanOptions.map((kel) => (
                          <option key={kel} value={kel}>
                            {kel}
                          </option>
                        ))}
                      </PlaceholderSelect>
                      {errors.kelurahan && (
                        <p className="mt-1 text-xs text-rose-600">{errors.kelurahan}</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Standalone Domicile Fields */
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <p className="text-xs font-bold text-slate-800">
                    Domisili Calon KPM (Tanpa Proposal)
                  </p>

                  {standaloneKabKotaOptions.length > 1 && (
                    <div>
                      <label htmlFor="input-kabkota-standalone" className="block text-xs font-semibold text-slate-700">
                        Kabupaten / Kota
                      </label>
                      <PlaceholderSelect
                        placeholder="Pilih Kabupaten / Kota"
                        id="input-kabkota-standalone"
                        value={values.kabKota || standaloneKabKotaOptions[0] || ''}
                        onChange={(v) => {
                          setValues((prev) => ({
                            ...prev,
                            kabKota: v,
                            kecamatan: '',
                            kelurahan: '',
                          }));
                        }}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm"
                      >
                        {standaloneKabKotaOptions.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </PlaceholderSelect>
                    </div>
                  )}

                  <div id="field-kecamatan">
                    <label htmlFor="input-kecamatan-standalone" className="block text-xs font-semibold text-slate-700">
                      Kecamatan Domisili <span className="text-rose-600">*</span>
                    </label>
                    <PlaceholderSelect
                      placeholder="Pilih Kecamatan"
                      id="input-kecamatan-standalone"
                      value={values.kecamatan || ''}
                      onChange={(v) => {
                        setValues((prev) => ({
                          ...prev,
                          kecamatan: v,
                          kelurahan: '',
                        }));
                        setErrors((prev) => ({ ...prev, kecamatan: undefined, kelurahan: undefined }));
                      }}
                      className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                        errors.kecamatan ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    >
                      {standaloneKecamatanOptions.map((kec) => (
                        <option key={kec} value={kec}>
                          {kec}
                        </option>
                      ))}
                    </PlaceholderSelect>
                    {errors.kecamatan && (
                      <p className="mt-1 text-xs text-rose-600">{errors.kecamatan}</p>
                    )}
                  </div>

                  <div id="field-kelurahan">
                    <label htmlFor="input-kelurahan-standalone" className="block text-xs font-semibold text-slate-700">
                      Kelurahan / Desa Domisili <span className="text-rose-600">*</span>
                    </label>
                    <PlaceholderSelect
                      placeholder={values.kecamatan ? `Pilih Kelurahan / Desa` : 'Pilih Kecamatan terlebih dahulu'}
                      id="input-kelurahan-standalone"
                      disabled={!values.kecamatan}
                      value={values.kelurahan || ''}
                      onChange={(v) => updateField('kelurahan', v)}
                      className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 ${
                        errors.kelurahan ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    >
                      {standaloneKelurahanOptions.map((kel) => (
                        <option key={kel} value={kel}>
                          {kel}
                        </option>
                      ))}
                    </PlaceholderSelect>
                    {errors.kelurahan && (
                      <p className="mt-1 text-xs text-rose-600">{errors.kelurahan}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {hasProposalSelected && (
            <>
          {/* Section 2: Profil Calon KPM */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              02. Profil Calon KPM
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Seluruh data wajib diisi sesuai dokumen kecuali Nomor HP (opsional).
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3.5">
                <div id="field-nikKk" className={!isNativeApp ? 'col-span-2 md:col-span-1' : 'col-span-2'}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label htmlFor="input-nik-kk" className="text-xs font-semibold text-slate-700">
                        NIK KK (No. Kartu Keluarga) <span className="text-rose-600">*</span>
                      </label>
                      {renderFieldScanBadge('nikKk')}
                    </div>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isValidNik16(values.nikKk) ? 'font-semibold text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {values.nikKk.length}/16
                    </span>
                  </div>
                  <input
                    id="input-nik-kk"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={16}
                    placeholder="16 digit angka Nomor KK"
                    value={values.nikKk}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('nikKk', sanitizeDigits(e.target.value, 16))}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 font-mono text-sm tracking-wide text-slate-900 tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nikKk
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('nikKk')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.nikKk && <p className="mt-1 text-xs text-rose-600">{errors.nikKk}</p>}
                  {duplicateKkMatches.length > 0 && (
                    <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 space-y-1">
                      <p className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>No. KK ini sudah terdaftar ({duplicateKkMatches.length} data):</span>
                      </p>
                      <ul className="space-y-1 pl-5 list-disc">
                        {duplicateKkMatches.map((dup) => (
                          <li key={dup.id} className="leading-snug">
                            <span className="font-bold">{dup.nama}</span> ({dup.proposal} · {dup.tahun}){' '}
                            <span
                              className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                dup.validasi === 'accepted'
                                  ? 'bg-teal-100 text-teal-800'
                                  : dup.validasi === 'rejected'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {dup.validasi === 'accepted'
                                ? 'Diterima'
                                : dup.validasi === 'rejected'
                                  ? 'Ditolak'
                                  : 'Menunggu'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div id="field-nikKtp" className={!isNativeApp ? 'col-span-2 md:col-span-1' : 'col-span-2'}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label htmlFor="input-nik-ktp" className="text-xs font-semibold text-slate-700">
                        NIK KTP <span className="text-rose-600">*</span>
                      </label>
                      {renderFieldScanBadge('nikKtp')}
                    </div>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isValidNik16(values.nikKtp) ? 'font-semibold text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {values.nikKtp.length}/16
                    </span>
                  </div>
                  <input
                    id="input-nik-ktp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={16}
                    placeholder="16 digit angka NIK KTP"
                    value={values.nikKtp}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('nikKtp', sanitizeDigits(e.target.value, 16))}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 font-mono text-sm tracking-wide text-slate-900 tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nikKtp
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('nikKtp')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.nikKtp && <p className="mt-1 text-xs text-rose-600">{errors.nikKtp}</p>}
                  {duplicateKtpMatches.length > 0 && (
                    <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 space-y-1">
                      <p className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>NIK KTP ini sudah terdaftar ({duplicateKtpMatches.length} data):</span>
                      </p>
                      <ul className="space-y-1 pl-5 list-disc">
                        {duplicateKtpMatches.map((dup) => (
                          <li key={dup.id} className="leading-snug">
                            <span className="font-bold">{dup.nama}</span> ({dup.proposal} · {dup.tahun}){' '}
                            <span
                              className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                dup.validasi === 'accepted'
                                  ? 'bg-teal-100 text-teal-800'
                                  : dup.validasi === 'rejected'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {dup.validasi === 'accepted'
                                ? 'Diterima'
                                : dup.validasi === 'rejected'
                                  ? 'Ditolak'
                                  : 'Menunggu'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div id="field-nama" className="col-span-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label htmlFor="input-nama" className="block text-xs font-semibold text-slate-700">
                      Nama Lengkap Calon KPM <span className="text-rose-600">*</span>
                    </label>
                    {renderFieldScanBadge('nama')}
                  </div>
                  <input
                    id="input-nama"
                    type="text"
                    autoCapitalize="characters"
                    placeholder="Sesuai KTP elektronik"
                    value={values.nama}
                    onChange={(e) => updateField('nama', e.target.value.toUpperCase())}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 text-sm uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nama
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('nama')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.nama && <p className="mt-1 text-xs text-rose-600">{errors.nama}</p>}
                </div>

                <div id="field-alamat" className="col-span-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label htmlFor="input-alamat" className="block text-xs font-semibold text-slate-700">
                      Alamat Lengkap <span className="text-rose-600">*</span>
                    </label>
                    {renderFieldScanBadge('alamat')}
                  </div>
                  <input
                    id="input-alamat"
                    type="text"
                    autoCapitalize="words"
                    placeholder="Contoh: Jl. Imam Bonjol Gg. 1 No. 5"
                    value={values.alamat}
                    onChange={(e) => updateField('alamat', formatAlamatLengkap(e.target.value, false))}
                    onBlur={() => {
                      if (values.alamat) {
                        updateField('alamat', formatAlamatLengkap(values.alamat, true));
                      }
                    }}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.alamat
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('alamat')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.alamat && <p className="mt-1 text-xs text-rose-600">{errors.alamat}</p>}
                </div>

                <div id="field-rt">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <label htmlFor="input-rt" className="block text-xs font-semibold text-slate-700">
                        RT <span className="text-rose-600">*</span>
                      </label>
                      {renderFieldScanBadge('rt')}
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {values.rt.length}/3
                    </span>
                  </div>
                  <input
                    id="input-rt"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="001"
                    value={values.rt}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => handleRtRwChange('rt', e.target.value)}
                    onBlur={() => handleRtRwBlur('rt')}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.rt
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('rt')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">3 digit awalan 0</p>
                  {errors.rt && <p className="mt-1 text-xs text-rose-600">{errors.rt}</p>}
                </div>

                <div id="field-rw">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <label htmlFor="input-rw" className="block text-xs font-semibold text-slate-700">
                        RW <span className="text-rose-600">*</span>
                      </label>
                      {renderFieldScanBadge('rw')}
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {values.rw.length}/3
                    </span>
                  </div>
                  <input
                    id="input-rw"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="001"
                    value={values.rw}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => handleRtRwChange('rw', e.target.value)}
                    onBlur={() => handleRtRwBlur('rw')}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.rw
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('rw')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">3 digit awalan 0</p>
                  {errors.rw && <p className="mt-1 text-xs text-rose-600">{errors.rw}</p>}
                </div>

                <div id="field-pekerjaan" className={!isNativeApp ? 'col-span-2 md:col-span-1' : 'col-span-2'}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="block text-xs font-semibold text-slate-700">
                      Pekerjaan <span className="text-rose-600">*</span>
                    </span>
                    {renderFieldScanBadge('pekerjaan')}
                  </div>
                  <button
                    type="button"
                    id="input-pekerjaan"
                    onClick={() => setIsPekerjaanModalOpen(true)}
                    className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.pekerjaan
                        ? 'border-rose-400 bg-white'
                        : scanReport?.blurryFields.includes('pekerjaan')
                          ? 'border-amber-400 bg-amber-50/40'
                          : 'border-slate-300 bg-white'
                    }`}
                  >
                    <span
                      className={`truncate ${
                        values.pekerjaan ? 'font-medium text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {values.pekerjaan || 'Pilih Pekerjaan'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                  </button>
                  {errors.pekerjaan && <p className="mt-1 text-xs text-rose-600">{errors.pekerjaan}</p>}
                </div>

                <div id="field-kontak" className={!isNativeApp ? 'col-span-2 md:col-span-1' : 'col-span-2'}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-kontak" className="block text-xs font-semibold text-slate-700">
                      Nomor HP
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <input
                    id="input-kontak"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    placeholder="08xxxxxxxxxx"
                    value={values.kontak}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('kontak', sanitizeDigits(e.target.value, 15))}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:font-sans placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Item, Pengelola & Validasi */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">
                03. Item, Pengelola & Validasi
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Item Bantuan, Pengelola, DTSEN, dan Validasi Berkas wajib diisi sebelum menyimpan.
              </p>

              <div
                className={`mt-4 space-y-4 ${
                  !isNativeApp ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' : ''
                }`}
              >
                <div id="field-item">
                  <span className="block text-xs font-semibold text-slate-700">
                    Item Bantuan <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    id="input-item"
                    disabled={resolvedItemOptions.length === 0}
                    onClick={() => setIsItemModalOpen(true)}
                    className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-50 ${
                      errors.item ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {(() => {
                      const matchedItem = resolvedItemOptions.find((i) => i.code === values.item);
                      const label = matchedItem
                        ? matchedItem.name && matchedItem.name !== matchedItem.code
                          ? `${matchedItem.code} — ${matchedItem.name}`
                          : matchedItem.code
                        : values.item || '';
                      return (
                        <span
                          className={`truncate ${
                            label ? 'font-mono font-medium text-slate-900' : 'text-slate-400'
                          }`}
                        >
                          {label ||
                            (resolvedItemOptions.length === 0
                              ? `Belum ada item tahun ${values.tahun || 'ini'}`
                              : 'Pilih Item')}
                        </span>
                      );
                    })()}
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                  </button>
                  {resolvedItemOptions.length === 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      Master item untuk tahun {values.tahun || '2026'} masih kosong. Tambahkan paket melalui Kelola Item &amp; Sub-Item.
                    </p>
                  )}
                  {selectedPackageSubItems.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                      Sub-item ({values.tahun}):{' '}
                      <span className="font-medium text-slate-700">
                        {selectedPackageSubItems.join(', ')}
                      </span>
                    </p>
                  )}
                  {errors.item && <p className="mt-1 text-xs text-rose-600">{errors.item}</p>}
                </div>

                {/* Searchable Pengelola Picker + New Pengelola Trigger */}
                <div id="field-pengelola">
                  <span className="block text-xs font-semibold text-slate-700">
                    Pengelola <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPengelolaModalOpen(true)}
                    className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.pengelola ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {selectedPengelolaObj?.foto ? (
                        <DriveImage
                          doc={selectedPengelolaObj.foto}
                          alt={selectedPengelolaObj.displayName}
                          className="h-6 w-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`truncate ${
                          values.pengelola ? 'font-medium text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {values.pengelola || 'Pilih atau Tambah Pengelola'}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                  </button>
                  {errors.pengelola && (
                    <p className="mt-1 text-xs text-rose-600">{errors.pengelola}</p>
                  )}
                </div>

                <div id="field-dtsen">
                  <span className="block text-xs font-semibold text-slate-700">
                    DTSEN <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    id="input-dtsen"
                    onClick={() => setIsDtsenModalOpen(true)}
                    className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.dtsen ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {(() => {
                      const matched = DTSEN_OPTION_ITEMS.find((d) => d.value === values.dtsen);
                      const label = matched?.label || values.dtsen || '';
                      return (
                        <span
                          className={`truncate ${
                            label ? 'font-medium text-slate-900' : 'text-slate-400'
                          }`}
                        >
                          {label || 'Pilih Status DTSEN'}
                        </span>
                      );
                    })()}
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                  </button>
                  {errors.dtsen && <p className="mt-1 text-xs text-rose-600">{errors.dtsen}</p>}
                </div>

                <div id="field-validasi" className={!isNativeApp ? 'md:col-span-2' : ''}>
                  <span className="block text-xs font-semibold text-slate-700">
                    Validasi Berkas <span className="text-rose-600">*</span>
                  </span>
                  <div
                    className={`mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 ${
                      errors.validasi ? 'ring-1 ring-rose-400' : ''
                    }`}
                  >
                    {(
                      [
                        { key: 'pending', label: 'Menunggu' },
                        { key: 'rejected', label: 'Ditolak' },
                        { key: 'accepted', label: 'Diterima' },
                      ] as { key: ValidationStatus; label: string }[]
                    ).map((opt) => {
                      const active = values.validasi === opt.key;
                      const activeTone =
                        opt.key === 'accepted'
                          ? 'bg-teal-700 text-white'
                          : opt.key === 'rejected'
                            ? 'bg-rose-600 text-white'
                            : 'bg-white text-slate-900 shadow-sm';
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={editingProposalLocked || (isProposalScopeLocked && opt.key !== 'accepted')}
                          onClick={() => handleStatusRoutingChange(opt.key)}
                          className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
                            active ? activeTone : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {values.validasi === 'accepted'
                      ? 'Diterima wajib terhubung ke Proposal aktif (Murni / Perubahan).'
                      : values.validasi === 'rejected'
                        ? 'Ditolak otomatis memutuskan proposal dan memindahkan data ke Arsip Berkas Ditolak.'
                        : 'Menunggu otomatis memutuskan proposal dan memindahkan data ke Database KPM.'}
                  </p>
                  {errors.validasi && (
                    <p className="mt-1 text-xs text-rose-600">{errors.validasi}</p>
                  )}
                </div>

                <div id="field-payment" className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-payment" className="block text-xs font-semibold text-slate-700">
                      Biaya Administrasi / Pelayanan
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-xs font-medium text-slate-500">
                      Rp
                    </span>
                    <input
                      id="input-payment"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={values.payment === 0 ? '' : values.payment.toLocaleString('id-ID')}
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        updateField('payment', raw ? parseInt(raw, 10) : 0);
                      }}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Biaya pelayanan administrasi dari calon KPM (kosongkan jika tidak ada).
                  </p>
                </div>

                <div id="field-catatan" className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-catatan" className="block text-xs font-semibold text-slate-700">
                      Catatan Petugas
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <textarea
                    id="input-catatan"
                    rows={2}
                    placeholder="Keterangan hasil survei atau kondisi keluarga (jika ada)..."
                    value={values.catatan}
                    onChange={(e) => updateField('catatan', e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>
            </section>
                </>
              )}
            </div>

            {!hasProposalSelected ? (
              <div
                className={`rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center ${
                  !isNativeApp ? 'md:col-span-7 md:py-12' : ''
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">
                  Pilih Tahun dan Proposal Terlebih Dahulu
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Kolom pengisian profil calon KPM, bantuan, dan dokumen akan tampil otomatis setelah tahun anggaran dan proposal dipilih.
                </p>
              </div>
            ) : (
              <div className={!isNativeApp ? 'space-y-4 md:col-span-5 md:space-y-5' : 'space-y-4'}>
          {/* 04. Dokumen KTP & KK */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              04. Dokumen KTP & KK
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Unggah foto KTP dan Kartu Keluarga jika tersedia (opsional sementara).
            </p>

            <div className="mt-4 space-y-5">
              <DocumentUploadCard
                id="upload-ktp"
                label="Foto KTP"
                helperText="Foto e-KTP asli dengan NIK terlihat jelas (opsional)"
                variant="ktp"
                value={values.documents.ktp}
                error={errors.docKtp}
                onChange={(file) => updateSingleDocument('ktp', file)}
                onImageForOcrReady={(img) => setKtpOcrImage(img)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-kk"
                  label="Foto Kartu Keluarga (KK)"
                  helperText="Foto seluruh halaman Kartu Keluarga (opsional)"
                  variant="kk"
                  value={values.documents.kk}
                  error={errors.docKk}
                  onChange={(file) => updateSingleDocument('kk', file)}
                  onImageForOcrReady={(img) => setKkOcrImage(img)}
                  onPreview={onPreviewDocument}
                />
              </div>

              {Boolean(values.documents.ktp && values.documents.kk) && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <button
                    type="button"
                    onClick={handleScanKtpKk}
                    disabled={isScanningDocs || editingProposalLocked}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {isScanningDocs ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Membaca Data KTP & KK...</span>
                      </>
                    ) : (
                      <>
                        <ScanLine className="h-4 w-4 text-teal-300" />
                        <span>Scan & Isi Otomatis dari KTP & KK</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Data diri diambil sesuai orang pada KTP dan Nomor KK diambil dari Kartu Keluarga. Bagian yang buram akan dilewati untuk diisi manual.
                  </p>

                  {scanError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  {scanReport && (
                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      {!scanReport.ktpNameMatchesKk && (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-rose-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                          <span className="leading-snug">
                            Nama pada foto KTP belum cocok / tidak terlihat jelas di daftar anggota Kartu Keluarga. Mohon pastikan foto KTP dan KK berasal dari pemohon yang tepat.
                          </span>
                        </div>
                      )}

                      {scanReport.filledFields.length > 0 && (
                        <div className="flex items-start gap-2 text-teal-800">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                          <div>
                            <p className="font-semibold">
                              {scanReport.filledFields.length} bagian berhasil diisi otomatis:
                            </p>
                            <p className="mt-0.5 text-[11px] text-teal-700">
                              {scanReport.filledFields.map((f) => SCAN_FIELD_LABELS[f]).join(', ')}
                            </p>
                          </div>
                        </div>
                      )}

                      {scanReport.blurryFields.length > 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-950 space-y-1.5">
                          <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>
                              {scanReport.blurryFields.length} bagian buram / perlu diisi manual:
                            </span>
                          </p>
                          <ul className="space-y-1 pl-4 list-disc text-[11px] text-amber-900">
                            {scanReport.blurryFields.map((fieldKey) => {
                              const issue = scanReport.fieldIssues.find((i) => i.field === fieldKey);
                              return (
                                <li key={fieldKey}>
                                  <span className="font-semibold">{SCAN_FIELD_LABELS[fieldKey]}</span>
                                  {issue?.reason ? ` — ${issue.reason}` : ''}
                                </li>
                              );
                            })}
                          </ul>
                          <button
                            type="button"
                            onClick={() => scrollToIdentityField(scanReport.blurryFields[0])}
                            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-800"
                          >
                            <ArrowUp className="h-3 w-3" />
                            <span>Isi Bagian Buram di Atas</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => scrollToIdentityField('nikKk')}
                          className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-teal-800 transition-colors hover:bg-teal-50"
                        >
                          <ArrowUp className="h-3 w-3" />
                          <span>Periksa Hasil di Bagian 02</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 05. Dokumentasi Lapangan */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              05. Dokumentasi Lapangan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Foto penerima (1 foto), foto survey (1 foto), dan foto kondisi rumah (maks. 3 foto).
            </p>

            <div className="mt-4 space-y-5">
              <DocumentUploadCard
                id="upload-penerima"
                label="Foto Penerima"
                helperText="Foto diri calon penerima bantuan"
                variant="penerima"
                value={values.documents.penerima}
                onChange={(file) => updateSingleDocument('penerima', file)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-survey"
                  label="Foto Survey"
                  helperText="Foto kegiatan wawancara / survei lapangan"
                  variant="survey"
                  value={values.documents.survey}
                  onChange={(file) => updateSingleDocument('survey', file)}
                  onPreview={onPreviewDocument}
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <MultiDocumentUploadCard
                  id="upload-rumah"
                  label="Foto Rumah"
                  helperText="Tambahkan foto tampak depan atau kondisi rumah (maks. 3 foto)"
                  maxFiles={3}
                  values={values.documents.rumah}
                  onChange={updateRumahDocuments}
                  onPreview={onPreviewDocument}
                />
              </div>
            </div>
          </section>

          {/* 06. Foto Lainnya */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              06. Foto Lainnya
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bisa unggah bertahap atau langsung hingga maksimal 5 foto pendukung.
            </p>

            <div className="mt-4">
              <MultiDocumentUploadCard
                id="upload-lainnya"
                label="Foto Lainnya"
                helperText="Tambahkan satu atau beberapa foto pendukung (maks. 5 foto)"
                maxFiles={5}
                values={values.documents.lainnya}
                onChange={updateLainnyaDocuments}
                onPreview={onPreviewDocument}
              />
            </div>
          </section>
            </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Action Bar constrained to Mobile Screen */}
        {hasProposalSelected && (
        <div
          className={`fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md ${
            !isNativeApp ? 'md:left-64 md:right-0 md:w-auto md:max-w-none md:translate-x-0 md:px-6' : ''
          }`}
        >
          <div
            className={`flex items-center gap-2.5 ${
              !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:justify-end' : ''
            }`}
          >
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              {editingRecord ? <X className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              <span>{editingRecord ? 'Batal' : 'Reset'}</span>
            </button>

            <button
              type="submit"
              disabled={editingProposalLocked || isSubmitting}
              className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap ${
                !isNativeApp ? 'md:flex-none md:min-w-[200px]' : ''
              }`}
            >
              {editingProposalLocked ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Terkunci</span>
                </>
              ) : editingRecord ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Simpan Perubahan</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Simpan Calon KPM</span>
                </>
              )}
            </button>
          </div>
        </div>
        )}
      </form>

      {/* Pop-up Pilihan Tahun Anggaran (Search + Tambah Tahun Baru) */}
      <SelectionPickerModal
        isOpen={isTahunModalOpen}
        title="Pilih Tahun Anggaran"
        options={[
          ...(isStandaloneMode
            ? [
                {
                  value: '',
                  label: 'Tanpa Tahun',
                  subtitle: 'Untuk data arsip / database tanpa tahun spesifik',
                },
              ]
            : []),
          ...resolvedYearOptions.map(
            (yr): SelectionPickerOption => ({
              value: yr,
              label: `Tahun ${yr}`,
              subtitle: TAHUN_OPTIONS.includes(yr) ? 'Tahun standar operasional' : 'Tahun tambahan',
            })
          ),
        ]}
        selectedValue={values.tahun}
        onClose={() => setIsTahunModalOpen(false)}
        onSelect={handleYearChange}
        searchable
        searchInputMode="numeric"
        searchPlaceholder="Pencarian..."
        showAddButton
        addButtonLabel="Tambah Tahun Anggaran Baru"
        inlineCreateConfig={{
          title: 'Tambah Tahun Anggaran',
          fieldLabel: 'Tahun Anggaran (4 Digit)',
          placeholder: 'Contoh: 2028',
          helperText: 'Aplikasi dapat digunakan jangka panjang untuk tahun mana saja.',
          submitLabel: 'Simpan Tahun',
          inputMode: 'numeric',
          maxLength: 4,
          normalizeInput: (raw) => sanitizeDigits(raw, 4),
          validateInput: (val) => {
            const num = Number(val);
            if (!/^\d{4}$/.test(val) || num < 1990 || num > 2100) {
              return 'Masukkan 4 digit tahun yang valid (1990–2100).';
            }
            return null;
          },
          onCreate: (yr) => {
            if (!resolvedYearOptions.includes(yr)) {
              setExtraYears((prev) => (prev.includes(yr) ? prev : [...prev, yr]));
              onAddYear?.(yr);
            }
          },
        }}
      />

      {/* Pop-up Pilihan Proposal (Search + Tombol + Hijau + Kategori per Kecamatan) */}
      <SelectionPickerModal
        isOpen={isProposalModalOpen}
        title="Pilih Proposal"
        options={proposalMenuItems.map(
          (item): SelectionPickerOption => ({
            value: item.name,
            label: item.name,
            group: item.kecamatanGroup,
            subtitle: item.tipe
              ? `${item.tipe} · Target ${item.jumlahKpm ?? 66} KPM`
              : undefined,
            disabled: item.locked,
            disabledBadge: 'Terkunci',
          })
        )}
        selectedValue={values.proposal}
        onClose={() => setIsProposalModalOpen(false)}
        onSelect={(v) => handleProposalChange(v)}
        searchable
        searchPlaceholder="Pencarian..."
        emptyMessage={`Belum ada proposal untuk tahun ${values.tahun || 'ini'}. Tekan tombol + di kanan atas untuk membuat baru.`}
        showAddButton={!isProposalScopeLocked && !editingProposalLocked}
        addButtonLabel="Tambah Proposal Baru"
        onExternalAdd={() => onOpenAddProposal(values.tahun)}
      />

      {/* Pop-up Pilihan Pekerjaan (Search + Tombol + Hijau) */}
      <SelectionPickerModal
        isOpen={isPekerjaanModalOpen}
        title="Pilih Pekerjaan"
        options={resolvedPekerjaanOptions.map(
          (job): SelectionPickerOption => ({
            value: job,
            label: job,
          })
        )}
        selectedValue={values.pekerjaan}
        onClose={() => setIsPekerjaanModalOpen(false)}
        onSelect={(v) => {
          const canonical =
            resolvedPekerjaanOptions.find((p) => p.toLowerCase() === v.toLowerCase()) || v;
          updateField('pekerjaan', canonical);
        }}
        searchable
        searchPlaceholder="Pencarian..."
        showAddButton
        addButtonLabel="Tambah Pekerjaan Baru"
        inlineCreateConfig={{
          title: 'Tambah Pekerjaan Baru',
          fieldLabel: 'Nama Pekerjaan',
          placeholder: 'Contoh: Penjahit Rumahan',
          helperText: 'Huruf awal setiap kata otomatis kapital.',
          submitLabel: 'Simpan Pekerjaan',
          normalizeInput: (raw) => capitalizeWords(raw),
          validateInput: (val) =>
            val.trim().length < 2 ? 'Nama pekerjaan minimal 2 huruf.' : null,
          onCreate: (job) => {
            const clean = capitalizeWords(job.trim()).replace(/\s+/g, ' ');
            const exists = resolvedPekerjaanOptions.some(
              (p) => p.trim().toLowerCase() === clean.toLowerCase()
            );
            if (!exists) {
              setExtraPekerjaan((prev) => [...prev, clean]);
              onAddPekerjaan?.(clean);
            }
          },
        }}
      />

      {/* Pop-up Pilihan Item Bantuan (Daftar Item Saja, Tanpa Search & +) */}
      <SelectionPickerModal
        isOpen={isItemModalOpen}
        title="Pilih Item Bantuan"
        options={resolvedItemOptions.map(
          (item): SelectionPickerOption => ({
            value: item.code,
            codeBadge: item.code,
            label: item.name && item.name !== item.code ? item.name : item.code,
            subtitle:
              item.subItems.length > 0 ? `Sub-item: ${item.subItems.join(', ')}` : undefined,
          })
        )}
        selectedValue={values.item}
        onClose={() => setIsItemModalOpen(false)}
        onSelect={(v) => updateField('item', v)}
        emptyMessage={`Belum ada item untuk tahun ${values.tahun || 'ini'}.`}
      />

      {/* Pop-up Pilihan DTSEN (Daftar Item Saja, Tanpa Search & +) */}
      <SelectionPickerModal
        isOpen={isDtsenModalOpen}
        title="Pilih Status DTSEN"
        options={DTSEN_OPTION_ITEMS.map(
          (opt): SelectionPickerOption => ({
            value: opt.value,
            label: opt.label,
          })
        )}
        selectedValue={values.dtsen}
        onClose={() => setIsDtsenModalOpen(false)}
        onSelect={(v) => handleDtsenChange(v)}
      />

      {/* Searchable Pengelola Selector & Add New Pengelola Modal */}
      <PengelolaSelectorModal
        isOpen={isPengelolaModalOpen}
        pengelolaList={pengelolaList}
        wilayahList={wilayahList}
        selectedName={values.pengelola}
        onClose={() => setIsPengelolaModalOpen(false)}
        onSelect={(displayName) => updateField('pengelola', displayName)}
        onCreatePengelola={onCreatePengelola}
        onPreviewDocument={onPreviewDocument}
      />

      {/* 2-Step Confirmation when editing proposal/year/status moves KPM out of old proposal slot */}
      <SlotHandlingConfirmModal
        isOpen={Boolean(pendingEditMovePayload)}
        actionType="move"
        kpmName={pendingEditMovePayload?.normalizedValues.nama || editingRecord?.nama || ''}
        registerCode={editingRecord?.registerCode}
        originProposalName={
          editingRecord?.proposal
            ? editingRecord.tahun
              ? `${editingRecord.proposal} (${editingRecord.tahun})`
              : editingRecord.proposal
            : ''
        }
        originSlotNumber={editingOriginSlotNumber}
        destinationLabel={pendingEditMovePayload?.destinationLabel}
        requiresSlotChoice
        isBusy={isSubmitting}
        onCancel={() => !isSubmitting && setPendingEditMovePayload(null)}
        onConfirm={(oldSlotHandling) => {
          if (!pendingEditMovePayload) return;
          const payload = pendingEditMovePayload;
          setPendingEditMovePayload(null);
          void executeSave(
            payload.normalizedValues,
            payload.targetSlotNumber,
            oldSlotHandling
          );
        }}
      />
    </>
  );
}
