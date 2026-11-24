import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckSquare,
  Database,
  Eye,
  Lock,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST, TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDeleteAction,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  SlotRemovalMode,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  doesKpmMatchProposalDomicile,
  getAbsenSeq,
  getItemHierarchyRank,
  getItemsForYear,
  getKpmSlotNumberInProposal,
  getPrimaryKpmPhoto,
  ProposalMergedSlotItem,
  resolveKpmDomicile,
  resolveProposalAreaScope,
  resolveProposalSlotStateForGroup,
} from '../utils/imageProcessor';
import { useIsDesktopWeb } from '../utils/platform';
import { DriveImage } from './DriveImage';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { ProposalPickerModal } from './ProposalPickerModal';
import { SlotHandlingConfirmModal } from './SlotHandlingConfirmModal';
import { SwipeAction, SwipeableRow } from './SwipeableRow';
import { useOfflineStatus } from '../contexts/OfflineContext';

type KpmSortKey = 'absen' | 'item' | 'rtrw' | 'pengelola' | 'pekerjaan' | 'kelurahan';

interface KpmListViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  statusFilter: 'all' | ValidationStatus;
  onChangeStatusFilter: (status: 'all' | ValidationStatus) => void;
  itemFilter: string;
  onChangeItemFilter: (item: string) => void;
  proposalFilter?: string;
  onChangeProposalFilter?: (proposal: string) => void;
  proposalSlotMap?: ProposalSlotMap;
  canUpdate?: boolean;
  canDelete?: boolean;
  isLoading?: boolean;
  openedFromProposalDetail?: boolean;
  onOpenProposalDetail?: (proposalId: string) => void;
  onBack?: () => void;
  onCreateNew: () => void;
  onCreateForEmptySlot?: (
    proposalId: string,
    proposalName: string,
    tahun: string,
    slotNumber: number,
    item?: string
  ) => void;
  onMoveSlot?: (
    proposalName: string,
    tahun: string,
    target: { kind: 'kpm'; kpmId: string } | { kind: 'empty'; slotNumber: number },
    direction: 'up' | 'down'
  ) => void;
  onRemoveEmptySlot?: (proposalName: string, tahun: string, slotNumber: number) => void;
  onFillEmptySlotFromDatabase?: (
    kpmId: string,
    proposalName: string,
    tahun: string,
    slotNumber: number,
    slotItem?: string
  ) => void;
  onSelectRecord: (record: KpmRecord) => void;
  onEditRecord?: (record: KpmRecord) => void;
  onDeleteRecord: (
    id: string,
    slotHandling?: SlotRemovalMode,
    deleteAction?: KpmDeleteAction
  ) => void;
  onToggleAttendance?: (kpmId: string, nextPresent: boolean) => void;
  onBulkUpdateKpms?: (
    ids: string[],
    patch: {
      validasi?: ValidationStatus;
      targetProposalId?: string;
      dtsen?: string;
      item?: string;
      markAllSubItems?: boolean;
    }
  ) => Promise<void> | void;
  onBulkPermanentDeleteKpms?: (ids: string[]) => Promise<void> | void;
}

export function KpmListView({
  records,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  selectedYear,
  onChangeYear,
  statusFilter,
  onChangeStatusFilter,
  itemFilter,
  onChangeItemFilter,
  proposalFilter = 'all',
  onChangeProposalFilter,
  proposalSlotMap = {},
  canUpdate = true,
  canDelete = true,
  isLoading = false,
  openedFromProposalDetail = false,
  onOpenProposalDetail,
  onBack,
  onCreateNew,
  onCreateForEmptySlot,
  onMoveSlot,
  onRemoveEmptySlot,
  onFillEmptySlotFromDatabase,
  onSelectRecord,
  onEditRecord,
  onDeleteRecord,
  onToggleAttendance,
  onBulkUpdateKpms,
  onBulkPermanentDeleteKpms,
}: KpmListViewProps) {
  const { isOffline } = useOfflineStatus();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<KpmSortKey>('absen');
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [rtRwFilter, setRtRwFilter] = useState<string>('all');
  const [pengelolaFilter, setPengelolaFilter] = useState<string>('all');
  const [pekerjaanFilter, setPekerjaanFilter] = useState<string>('all');
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<KpmRecord | null>(null);
  const [lockedNoticeRecord, setLockedNoticeRecord] = useState<KpmRecord | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSheet, setBulkSheet] = useState<
    'none' | 'dtsen' | 'item' | 'delete' | 'delete-confirm-permanent'
  >('none');
  const [isBulkProposalPickerOpen, setIsBulkProposalPickerOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [dbPickerTargetSlot, setDbPickerTargetSlot] = useState<{
    proposalName: string;
    tahun: string;
    slotNumber: number;
    item?: string;
  } | null>(null);
  const [dbPickerQuery, setDbPickerQuery] = useState('');

  useEffect(() => {
    if (isOffline && bulkMode) {
      setBulkMode(false);
      setSelectedIds([]);
      setBulkSheet('none');
      setIsBulkProposalPickerOpen(false);
    }
  }, [isOffline, bulkMode]);

  useEffect(() => {
    setVisibleLimit(40);
  }, [
    query,
    selectedYear,
    statusFilter,
    itemFilter,
    proposalFilter,
    kelurahanFilter,
    rtRwFilter,
    pengelolaFilter,
    pekerjaanFilter,
    sortBy,
  ]);

  const proposalLockIndex = useMemo(() => {
    const byId = new Map<string, boolean>();
    const byNameYear = new Map<string, boolean>();
    const byName = new Map<string, boolean>();
    for (const p of proposals) {
      const isLocked = p.status === 'locked';
      byId.set(p.id, isLocked);
      byNameYear.set(`${p.tahun}::${p.namaProposal}`, isLocked);
      if (!byName.has(p.namaProposal)) byName.set(p.namaProposal, isLocked);
    }
    return { byId, byNameYear, byName };
  }, [proposals]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isRecordProposalLocked = (rec: KpmRecord) => {
    if (!rec.proposal?.trim() && !rec.proposalId) return false;
    if (rec.proposalId && proposalLockIndex.byId.has(rec.proposalId)) {
      return Boolean(proposalLockIndex.byId.get(rec.proposalId));
    }
    const nameYearKey = `${rec.tahun}::${rec.proposal}`;
    if (proposalLockIndex.byNameYear.has(nameYearKey)) {
      return Boolean(proposalLockIndex.byNameYear.get(nameYearKey));
    }
    return Boolean(proposalLockIndex.byName.get(rec.proposal));
  };

  const getRecordKelurahan = (rec: KpmRecord) => {
    return resolveKpmDomicile(rec, proposals, wilayahList).kelurahan || '';
  };

  const getStandalonePlaceLabel = (rec: KpmRecord) =>
    rec.validasi === 'rejected' ? 'Arsip Ditolak' : 'Database KPM';

  const getCompactKelurahan = (rawKel: string) =>
    rawKel.replace(/^(kelurahan|kel\.?)\s+/i, '').trim();

  const getRecordRtRw = (rec: KpmRecord) => {
    if (!rec.rt && !rec.rw) return '';
    const rt = rec.rt ? rec.rt.padStart(3, '0') : '000';
    const rw = rec.rw ? rec.rw.padStart(3, '0') : '000';
    return `RT ${rt}/RW ${rw}`;
  };

  const yearItemOptions = useMemo(
    () => getItemsForYear(items, selectedYear),
    [items, selectedYear]
  );

  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    records.forEach((r) => {
      if (r.tahun) set.add(r.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const yearBaseRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedYear !== 'all' && rec.tahun !== selectedYear) return false;
      if (proposalFilter !== 'all' && rec.proposal !== proposalFilter) return false;
      return true;
    });
  }, [records, selectedYear, proposalFilter]);

  const kelurahanScopedRecords = useMemo(() => {
    if (kelurahanFilter === 'all') return yearBaseRecords;
    return yearBaseRecords.filter((rec) => getRecordKelurahan(rec) === kelurahanFilter);
  }, [yearBaseRecords, kelurahanFilter, proposals, wilayahList]);

  const kelurahanOptions = useMemo(() => {
    const kels = new Set<string>();
    for (const rec of yearBaseRecords) {
      const kel = getRecordKelurahan(rec);
      if (kel) kels.add(kel);
    }
    return Array.from(kels).sort((a, b) => a.localeCompare(b, 'id'));
  }, [yearBaseRecords, proposals, wilayahList]);

  const { rtRwOptions, pengelolaOptions, pekerjaanOptions } = useMemo(() => {
    const rtRws = new Set<string>();
    const pengelolas = new Set<string>();
    const pekerjaans = new Set<string>();

    for (const rec of kelurahanScopedRecords) {
      if (rec.rt || rec.rw) rtRws.add(getRecordRtRw(rec));
      if (rec.pengelola?.trim()) pengelolas.add(rec.pengelola.trim());
      if (rec.pekerjaan?.trim()) pekerjaans.add(rec.pekerjaan.trim());
    }

    return {
      rtRwOptions: Array.from(rtRws).sort((a, b) => {
        const [, rtA = '0', rwA = '0'] = a.match(/RT\s*(\d+)\s*\/\s*RW\s*(\d+)/) || [];
        const [, rtB = '0', rwB = '0'] = b.match(/RT\s*(\d+)\s*\/\s*RW\s*(\d+)/) || [];
        return (parseInt(rwA, 10) - parseInt(rwB, 10)) || (parseInt(rtA, 10) - parseInt(rtB, 10));
      }),
      pengelolaOptions: Array.from(pengelolas).sort((a, b) => a.localeCompare(b, 'id')),
      pekerjaanOptions: Array.from(pekerjaans).sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [kelurahanScopedRecords]);

  const activeExtraFilterCount =
    (proposalFilter !== 'all' ? 1 : 0) +
    (itemFilter !== 'all' ? 1 : 0) +
    (kelurahanFilter !== 'all' ? 1 : 0) +
    (rtRwFilter !== 'all' ? 1 : 0) +
    (pengelolaFilter !== 'all' ? 1 : 0) +
    (pekerjaanFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'absen' ? 1 : 0);

  const proposalFilterOptions = useMemo(() => {
    return proposals
      .filter((p) => selectedYear === 'all' || p.tahun === selectedYear)
      .sort((a, b) => a.namaProposal.localeCompare(b.namaProposal, 'id'));
  }, [proposals, selectedYear]);

  const activeProposalRecord = useMemo(() => {
    if (proposalFilter === 'all') return null;
    return (
      proposals.find(
        (p) =>
          p.namaProposal === proposalFilter &&
          (selectedYear === 'all' || p.tahun === selectedYear)
      ) ??
      proposals.find((p) => p.namaProposal === proposalFilter) ??
      null
    );
  }, [proposals, proposalFilter, selectedYear]);

  const activeProposalLocked = activeProposalRecord?.status === 'locked';

  const handleKelurahanChange = (nextKelurahan: string) => {
    setKelurahanFilter(nextKelurahan);
    const nextSubset =
      nextKelurahan === 'all'
        ? yearBaseRecords
        : yearBaseRecords.filter((rec) => getRecordKelurahan(rec) === nextKelurahan);

    if (rtRwFilter !== 'all' && !nextSubset.some((r) => getRecordRtRw(r) === rtRwFilter)) {
      setRtRwFilter('all');
    }
    if (
      pengelolaFilter !== 'all' &&
      !nextSubset.some((r) => r.pengelola.trim() === pengelolaFilter)
    ) {
      setPengelolaFilter('all');
    }
    if (
      pekerjaanFilter !== 'all' &&
      !nextSubset.some((r) => r.pekerjaan.trim() === pekerjaanFilter)
    ) {
      setPekerjaanFilter('all');
    }
  };

  const scopedRecords = useMemo(() => {
    return yearBaseRecords.filter((rec) => {
      if (itemFilter === '__missing__') {
        if ((rec.item || '').trim() !== '') return false;
      } else if (itemFilter !== 'all' && rec.item !== itemFilter) {
        return false;
      }
      if (kelurahanFilter !== 'all' && getRecordKelurahan(rec) !== kelurahanFilter) return false;
      if (rtRwFilter !== 'all' && getRecordRtRw(rec) !== rtRwFilter) return false;
      if (pengelolaFilter !== 'all' && rec.pengelola.trim() !== pengelolaFilter) return false;
      if (pekerjaanFilter !== 'all' && rec.pekerjaan.trim() !== pekerjaanFilter) return false;
      return true;
    });
  }, [
    yearBaseRecords,
    itemFilter,
    kelurahanFilter,
    rtRwFilter,
    pengelolaFilter,
    pekerjaanFilter,
    proposals,
    wilayahList,
  ]);

  const counts = useMemo(() => {
    return {
      all: scopedRecords.length,
      accepted: scopedRecords.filter((r) => r.validasi === 'accepted').length,
      pending: scopedRecords.filter((r) => r.validasi === 'pending').length,
      rejected: scopedRecords.filter((r) => r.validasi === 'rejected').length,
    };
  }, [scopedRecords]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = scopedRecords.filter((rec) => {
      if (statusFilter !== 'all' && rec.validasi !== statusFilter) return false;
      if (!q) return true;
      const kel = getRecordKelurahan(rec).toLowerCase();
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.proposal.toLowerCase().includes(q) ||
        kel.includes(q) ||
        (rec.kecamatan && rec.kecamatan.toLowerCase().includes(q)) ||
        rec.pekerjaan.toLowerCase().includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.registerCode.toLowerCase().includes(q) ||
        rec.nikKtp.includes(q) ||
        rec.nikKk.includes(q) ||
        rec.pengelola.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'item': {
          const rankA = getItemHierarchyRank(a.item, a.tahun, items);
          const rankB = getItemHierarchyRank(b.item, b.tahun, items);
          if (rankA !== rankB) return rankA - rankB;
          const itemCmp = a.item.localeCompare(b.item, 'id');
          if (itemCmp !== 0) return itemCmp;
          return (
            getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode) ||
            a.nama.localeCompare(b.nama, 'id')
          );
        }
        case 'rtrw': {
          const rwCmp = (parseInt(a.rw || '0', 10) || 0) - (parseInt(b.rw || '0', 10) || 0);
          if (rwCmp !== 0) return rwCmp;
          const rtCmp = (parseInt(a.rt || '0', 10) || 0) - (parseInt(b.rt || '0', 10) || 0);
          if (rtCmp !== 0) return rtCmp;
          return a.nama.localeCompare(b.nama, 'id');
        }
        case 'pengelola':
          return (
            (a.pengelola || '').localeCompare(b.pengelola || '', 'id') ||
            a.nama.localeCompare(b.nama, 'id')
          );
        case 'pekerjaan':
          return (
            (a.pekerjaan || '').localeCompare(b.pekerjaan || '', 'id') ||
            a.nama.localeCompare(b.nama, 'id')
          );
        case 'kelurahan': {
          const kelA = getRecordKelurahan(a);
          const kelB = getRecordKelurahan(b);
          const kelCmp = kelA.localeCompare(kelB, 'id');
          if (kelCmp !== 0) return kelCmp;
          const rwCmp = (parseInt(a.rw || '0', 10) || 0) - (parseInt(b.rw || '0', 10) || 0);
          if (rwCmp !== 0) return rwCmp;
          const rtCmp = (parseInt(a.rt || '0', 10) || 0) - (parseInt(b.rt || '0', 10) || 0);
          if (rtCmp !== 0) return rtCmp;
          return a.nama.localeCompare(b.nama, 'id');
        }
        case 'absen':
        default:
          return (
            a.proposal.localeCompare(b.proposal, 'id') ||
            a.tahun.localeCompare(b.tahun, 'id') ||
            getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode) ||
            a.nama.localeCompare(b.nama, 'id')
          );
      }
    });
  }, [scopedRecords, query, statusFilter, sortBy, items, proposals, wilayahList]);

  const unlockedFilteredIds = useMemo(
    () => filteredRecords.filter((r) => !isRecordProposalLocked(r)).map((r) => r.id),
    [filteredRecords, proposals]
  );

  const isSlotViewActive = Boolean(
    activeProposalRecord &&
      sortBy === 'absen' &&
      (statusFilter === 'all' || statusFilter === 'accepted') &&
      !query.trim() &&
      itemFilter === 'all' &&
      kelurahanFilter === 'all' &&
      rtRwFilter === 'all' &&
      pengelolaFilter === 'all' &&
      pekerjaanFilter === 'all' &&
      !bulkMode
  );

  const mergedSlots = useMemo<ProposalMergedSlotItem[]>(() => {
    if (!isSlotViewActive || !activeProposalRecord) return [];
    const { state } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      activeProposalRecord.id,
      activeProposalRecord.namaProposal,
      activeProposalRecord.tahun,
      proposals
    );
    return buildMergedProposalSlots({
      groupRecords: scopedRecords,
      slotState: state,
      proposals,
      catalog: items,
      wilayahList,
    });
  }, [isSlotViewActive, activeProposalRecord, proposalSlotMap, proposals, scopedRecords, items, wilayahList]);

  const dbPickerAreaScope = useMemo(() => {
    if (!dbPickerTargetSlot) {
      return {
        hasScope: false,
        scopeType: 'none' as const,
        normalizedTarget: '',
        scopeLabel: '',
      };
    }
    return resolveProposalAreaScope(
      dbPickerTargetSlot.proposalName,
      proposals,
      dbPickerTargetSlot.tahun,
      wilayahList
    );
  }, [dbPickerTargetSlot, proposals, wilayahList]);

  const databaseCandidates = useMemo(() => {
    if (!dbPickerTargetSlot) return [];
    const q = dbPickerQuery.trim().toLowerCase();
    return records
      .filter((r) => {
        if (r.validasi !== 'pending') return false;
        const propStr = (r.proposal || '').trim();
        if (propStr && propStr !== dbPickerTargetSlot.proposalName) return false;
        if (
          !doesKpmMatchProposalDomicile({
            record: r,
            proposalName: dbPickerTargetSlot.proposalName,
            proposalTahun: dbPickerTargetSlot.tahun,
            proposals,
            wilayahList,
          })
        ) {
          return false;
        }
        if (!q) return true;
        const dom = resolveKpmDomicile(r, proposals, wilayahList);
        return (
          r.nama.toLowerCase().includes(q) ||
          (r.nikKtp || '').includes(q) ||
          (r.nikKk || '').includes(q) ||
          (r.item || '').toLowerCase().includes(q) ||
          (dom.kelurahan || '').toLowerCase().includes(q) ||
          (dom.kecamatan || '').toLowerCase().includes(q) ||
          (r.pengelola || '').toLowerCase().includes(q)
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
  }, [dbPickerTargetSlot, dbPickerQuery, records, proposals, wilayahList]);

  const renderedEntries = useMemo<ProposalMergedSlotItem[]>(() => {
    if (isSlotViewActive) return mergedSlots;
    return filteredRecords.map((record) => ({
      kind: 'kpm' as const,
      slotNumber: getAbsenSeq(record.registerCode),
      record,
    }));
  }, [isSlotViewActive, mergedSlots, filteredRecords]);

  const emptySlotCountInProposal = useMemo(
    () => mergedSlots.filter((entry) => entry.kind === 'empty').length,
    [mergedSlots]
  );

  const toggleSelectRecord = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAllUnlocked = () => {
    if (
      unlockedFilteredIds.length > 0 &&
      unlockedFilteredIds.every((id) => selectedIdSet.has(id))
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unlockedFilteredIds);
    }
  };

  const runBulkPatch = async (patch: {
    validasi?: ValidationStatus;
    targetProposalId?: string;
    dtsen?: string;
    item?: string;
    markAllSubItems?: boolean;
  }) => {
    if (!onBulkUpdateKpms || selectedIds.length === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    try {
      await onBulkUpdateKpms(selectedIds, patch);
      setBulkSheet('none');
      setSelectedIds([]);
      setBulkMode(false);
    } finally {
      setBulkProcessing(false);
    }
  };

  const runBulkPermanentDelete = async () => {
    if (!onBulkPermanentDeleteKpms || selectedIds.length === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    try {
      await onBulkPermanentDeleteKpms(selectedIds);
      setBulkSheet('none');
      setSelectedIds([]);
      setBulkMode(false);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkAcceptClick = () => {
    if (selectedIds.length === 0 || bulkProcessing) return;
    const selectedRecs = records.filter((r) => selectedIds.includes(r.id));
    const needsProposalPicker = selectedRecs.some(
      (r) => !r.proposal?.trim() || r.validasi !== 'accepted'
    );
    if (needsProposalPicker) {
      setIsBulkProposalPickerOpen(true);
      return;
    }
    void runBulkPatch({ validasi: 'accepted' });
  };

  const handleResetExtraFilters = () => {
    onChangeProposalFilter?.('all');
    onChangeItemFilter('all');
    setSortBy('absen');
    setKelurahanFilter('all');
    setRtRwFilter('all');
    setPengelolaFilter('all');
    setPekerjaanFilter('all');
  };

  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;

  return (
    <div className={`min-h-screen pb-28 ${!isNativeApp ? 'md:pb-12' : ''}`}>
      {/* Sticky Header (Native APK only) */}
      {isNativeApp && (
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          {(openedFromProposalDetail || (proposalFilter !== 'all' && activeProposalRecord && onOpenProposalDetail)) && (
            <button
              type="button"
              onClick={() => {
                if (openedFromProposalDetail && onBack) {
                  onBack();
                } else if (activeProposalRecord && onOpenProposalDetail) {
                  onOpenProposalDetail(activeProposalRecord.id);
                }
              }}
              className="-ml-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Kembali ke Detail Proposal"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="truncate text-base font-bold text-slate-900">
            Keluarga Penerima Manfaat
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {((canUpdate && onBulkUpdateKpms) || (canDelete && onBulkPermanentDeleteKpms)) && (
            <button
              type="button"
              disabled={isOffline}
              onClick={() => {
                if (isOffline) return;
                setBulkMode((prev) => {
                  if (prev) {
                    setSelectedIds([]);
                    setBulkSheet('none');
                  }
                  return !prev;
                });
              }}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                bulkMode
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{bulkMode ? 'Selesai' : 'Pilih Banyak'}</span>
            </button>
          )}
        </div>
      </header>
      )}

      <div className={`space-y-4 px-4 pt-4 ${!isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''}`}>
        {!isNativeApp && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {(openedFromProposalDetail ||
                (proposalFilter !== 'all' && activeProposalRecord && onOpenProposalDetail)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (openedFromProposalDetail && onBack) {
                      onBack();
                    } else if (activeProposalRecord && onOpenProposalDetail) {
                      onOpenProposalDetail(activeProposalRecord.id);
                    }
                  }}
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>{openedFromProposalDetail ? 'Kembali ke Proposal' : 'Detail Proposal'}</span>
                </button>
              )}
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Keluarga Penerima Manfaat
              </h1>
              <span className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 tabular-nums">
                {filteredRecords.length} KPM
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {((canUpdate && onBulkUpdateKpms) || (canDelete && onBulkPermanentDeleteKpms)) && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => {
                    if (isOffline) return;
                    setBulkMode((prev) => {
                      if (prev) {
                        setSelectedIds([]);
                        setBulkSheet('none');
                      }
                      return !prev;
                    });
                  }}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    bulkMode
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{bulkMode ? 'Selesai' : 'Pilih Banyak'}</span>
                </button>
              )}
              <button
                type="button"
                disabled={isOffline}
                onClick={onCreateNew}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Daftarkan KPM</span>
              </button>
            </div>
          </div>
        )}
        {proposalFilter !== 'all' && onChangeProposalFilter && (
          <div className="space-y-1.5 rounded-2xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs text-teal-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate font-semibold">Proposal: {proposalFilter}</span>
                {emptySlotCountInProposal > 0 && (
                  <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {emptySlotCountInProposal} Baris Kosong
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {(openedFromProposalDetail || (activeProposalRecord && onOpenProposalDetail)) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (openedFromProposalDetail && onBack) {
                        onBack();
                      } else if (activeProposalRecord && onOpenProposalDetail) {
                        onOpenProposalDetail(activeProposalRecord.id);
                      }
                    }}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-teal-300 bg-white px-2.5 text-[11px] font-semibold text-teal-800 transition-colors hover:bg-teal-100"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span>{openedFromProposalDetail ? 'Kembali ke Proposal' : 'Buka Detail Proposal'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChangeProposalFilter('all')}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
                >
                  <X className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
            {isSlotViewActive && canUpdate && !activeProposalLocked && (
              <p className="text-[11px] text-teal-800/85">
                {isNativeApp ? (
                  <>
                    Geser kiri baris KPM untuk tombol <strong>↑ / ↓</strong> &amp; <strong>Edit</strong>, atau gunakan toggle di kanan untuk absensi kehadiran.
                  </>
                ) : (
                  <>
                    <span className="hidden md:inline">
                      Gunakan tombol panah ↑ / ↓ pada kolom Aksi untuk mengatur urutan prioritas KPM. Jika KPM dikeluarkan, nomor urutnya dipertahankan sebagai Baris Kosong.
                    </span>
                    <span className="md:hidden">
                      Geser kiri baris KPM untuk tombol <strong>↑ / ↓</strong> &amp; <strong>Edit</strong>, atau gunakan toggle di kanan untuk absensi kehadiran.
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {/* Search + Tahun sebaris, tombol Filter ringkas, lalu tab status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pencarian..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            <FilterSelect
              ariaLabel="Filter tahun KPM"
              value={selectedYear}
              onChange={onChangeYear}
              className="w-[82px] shrink-0"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">Semua</option>
            </FilterSelect>

            <button
              type="button"
              onClick={() => setShowExtraFilters((prev) => !prev)}
              aria-label="Filter dan urutkan"
              aria-expanded={showExtraFilters}
              className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                showExtraFilters || activeExtraFilterCount > 0
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeExtraFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white tabular-nums">
                  {activeExtraFilterCount}
                </span>
              )}
            </button>
          </div>

          {showExtraFilters && (
            <div className={`rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5 ${!isNativeApp ? 'md:p-4' : ''}`}>
              <div className={!isNativeApp ? 'grid grid-cols-2 gap-2 md:grid-cols-7 md:gap-2.5' : 'grid grid-cols-2 gap-2'}>
                {onChangeProposalFilter && (
                  <FilterSelect
                    ariaLabel="Filter proposal"
                    value={proposalFilter}
                    onChange={onChangeProposalFilter}
                  >
                    <option value="all">Semua Proposal</option>
                    {proposalFilterOptions.map((prop) => (
                      <option key={prop.id} value={prop.namaProposal}>
                        {prop.namaProposal} ({prop.tahun})
                      </option>
                    ))}
                  </FilterSelect>
                )}

                <FilterSelect
                  ariaLabel="Filter item bantuan"
                  value={itemFilter}
                  onChange={onChangeItemFilter}
                >
                  <option value="all">Semua Item</option>
                  <option value="__missing__">Belum Ada Item</option>
                  {yearItemOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  ariaLabel="Urutkan daftar KPM"
                  value={sortBy}
                  onChange={(v) => setSortBy(v as KpmSortKey)}
                >
                  <option value="absen">Urut: Nomor Absen</option>
                  <option value="item">Urut: Item</option>
                  <option value="rtrw">Urut: RT &amp; RW</option>
                  <option value="pengelola">Urut: Pengelola</option>
                  <option value="pekerjaan">Urut: Pekerjaan</option>
                  <option value="kelurahan">Urut: Kelurahan</option>
                </FilterSelect>

                <FilterSelect
                  ariaLabel="Filter kelurahan"
                  value={kelurahanFilter}
                  onChange={handleKelurahanChange}
                >
                  <option value="all">Semua Kelurahan</option>
                  {kelurahanOptions.map((kel) => (
                    <option key={kel} value={kel}>
                      {kel}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  ariaLabel="Filter RT dan RW"
                  value={rtRwFilter}
                  onChange={setRtRwFilter}
                >
                  <option value="all">Semua RT &amp; RW</option>
                  {rtRwOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  ariaLabel="Filter pengelola"
                  value={pengelolaFilter}
                  onChange={setPengelolaFilter}
                >
                  <option value="all">Semua Pengelola</option>
                  {pengelolaOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  ariaLabel="Filter pekerjaan"
                  value={pekerjaanFilter}
                  onChange={setPekerjaanFilter}
                >
                  <option value="all">Semua Pekerjaan</option>
                  {pekerjaanOptions.map((job) => (
                    <option key={job} value={job}>
                      {job}
                    </option>
                  ))}
                </FilterSelect>
              </div>

              {activeExtraFilterCount > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleResetExtraFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset Filter</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <SegmentedTabs<'all' | ValidationStatus>
            value={statusFilter}
            onChange={onChangeStatusFilter}
            tabs={[
              { key: 'all', label: 'Semua', count: counts.all },
              { key: 'accepted', label: 'Diterima', count: counts.accepted },
              { key: 'pending', label: 'Menunggu', count: counts.pending },
              { key: 'rejected', label: 'Ditolak', count: counts.rejected },
            ]}
          />

          {bulkMode && unlockedFilteredIds.length > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs">
              <span className="font-semibold text-teal-900 tabular-nums">
                {selectedIds.length} dipilih dari {unlockedFilteredIds.length} KPM terbuka
              </span>
              <button
                type="button"
                onClick={handleSelectAllUnlocked}
                className="font-bold text-teal-700 hover:underline"
              >
                {unlockedFilteredIds.every((id) => selectedIdSet.has(id))
                  ? 'Batal Semua'
                  : 'Pilih Semua'}
              </button>
            </div>
          )}
        </div>

        {/* Records List */}
        {isLoading && records.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 animate-pulse">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} className="flex items-center gap-3 px-3.5 py-3">
                <div className="h-4 w-5 rounded bg-slate-200" />
                <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 rounded bg-slate-200" />
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : renderedEntries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada data KPM ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter pencarian, atau daftarkan KPM lewat tombol tambah data.
            </p>
          </div>
        ) : (
          <>
          {/* Desktop SaaS High-Density Data Table */}
          {!isNativeApp ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="w-11 px-2 py-3 text-center">No</th>
                      <th className="w-[33%] px-2.5 py-3">KPM</th>
                      <th className="w-[24%] px-2.5 py-3">Proposal &amp; Wilayah</th>
                      <th className="w-[13%] px-2.5 py-3">Pengelola</th>
                      <th className="w-[12%] px-2.5 py-3">Status</th>
                      <th className="w-[176px] px-2.5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {renderedEntries.slice(0, visibleLimit).map((entry, entryIdx) => {
                      const canMoveUp = entryIdx > 0;
                      const canMoveDown = entryIdx < renderedEntries.length - 1;

                      if (entry.kind === 'empty') {
                        const slotLabel = String(entry.slotNumber).padStart(2, '0');
                        return (
                          <tr
                            key={`dt-empty-${entry.slotNumber}`}
                            className="border-l-4 border-l-amber-400 bg-amber-50/50"
                          >
                            <td className="px-2 py-2.5 text-center font-mono text-[11px] font-bold text-amber-800 tabular-nums">
                              {slotLabel}
                            </td>
                            <td className="px-2.5 py-2.5" colSpan={4}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className="rounded-md border border-dashed border-amber-400 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                    Baris Kosong
                                  </span>
                                  {entry.emptySlot.item && (
                                    <span className="inline-flex rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                      {entry.emptySlot.item}
                                    </span>
                                  )}
                                  <span className="truncate text-xs font-medium text-amber-900">
                                    {entry.emptySlot.previousKpmName
                                      ? `Slot bekas ${entry.emptySlot.previousKpmName}`
                                      : 'Slot dicadangkan untuk pengganti SK / BAST'}
                                  </span>
                                </div>
                                {activeProposalRecord && !activeProposalLocked && canUpdate && (
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {onCreateForEmptySlot && (
                                      <button
                                        type="button"
                                        disabled={isOffline}
                                        onClick={() =>
                                          onCreateForEmptySlot(
                                            activeProposalRecord.id,
                                            activeProposalRecord.namaProposal,
                                            activeProposalRecord.tahun,
                                            entry.slotNumber,
                                            entry.emptySlot.item
                                          )
                                        }
                                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-teal-700 px-2 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
                                      >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        <span>Daftar Baru</span>
                                      </button>
                                    )}
                                    {onFillEmptySlotFromDatabase && (
                                      <button
                                        type="button"
                                        disabled={isOffline}
                                        onClick={() => {
                                          if (isOffline) return;
                                          setDbPickerQuery('');
                                          setDbPickerTargetSlot({
                                            proposalName: activeProposalRecord.namaProposal,
                                            tahun: activeProposalRecord.tahun,
                                            slotNumber: entry.slotNumber,
                                            item: entry.emptySlot.item,
                                          });
                                        }}
                                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-teal-700 bg-white px-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45"
                                      >
                                        <Database className="h-3.5 w-3.5" />
                                        <span>Dari Database</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                              {activeProposalRecord && !activeProposalLocked && canUpdate ? (
                                <div className="inline-flex items-center gap-1">
                                  {onMoveSlot && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isOffline || !canMoveUp}
                                        onClick={() =>
                                          onMoveSlot(
                                            activeProposalRecord.namaProposal,
                                            activeProposalRecord.tahun,
                                            { kind: 'empty', slotNumber: entry.slotNumber },
                                            'up'
                                          )
                                        }
                                        title="Naikkan urutan slot"
                                        aria-label="Naikkan urutan slot"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isOffline || !canMoveDown}
                                        onClick={() =>
                                          onMoveSlot(
                                            activeProposalRecord.namaProposal,
                                            activeProposalRecord.tahun,
                                            { kind: 'empty', slotNumber: entry.slotNumber },
                                            'down'
                                          )
                                        }
                                        title="Turunkan urutan slot"
                                        aria-label="Turunkan urutan slot"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  {onRemoveEmptySlot && canDelete && (
                                    <button
                                      type="button"
                                      disabled={isOffline}
                                      onClick={() =>
                                        onRemoveEmptySlot(
                                          activeProposalRecord.namaProposal,
                                          activeProposalRecord.tahun,
                                          entry.slotNumber
                                        )
                                      }
                                      title="Hapus Baris Kosong (geser urutan di bawahnya naik)"
                                      aria-label="Hapus Baris Kosong"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">Terkunci</span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      const rec = entry.record;
                      const thumb = getPrimaryKpmPhoto(rec.documents);
                      const locked = isRecordProposalLocked(rec);
                      const isStandalone = !rec.proposal?.trim() || rec.validasi !== 'accepted';
                      const absenSeq = isStandalone
                        ? 999999
                        : isSlotViewActive
                          ? entry.slotNumber
                          : getAbsenSeq(rec.registerCode);
                      const absenLabel = isStandalone
                        ? '—'
                        : absenSeq < 999999
                          ? String(absenSeq).padStart(2, '0')
                          : '--';
                      const desilNumeric =
                        rec.dtsen && /^\d/.test(rec.dtsen.trim())
                          ? rec.dtsen.trim().replace(/\s*-\s*/g, '-')
                          : '';
                      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
                      const kelurahanName = getCompactKelurahan(dom.kelurahan);
                      const containerTitle = isStandalone
                        ? getStandalonePlaceLabel(rec)
                        : rec.proposal;
                      const desktopYearText = isStandalone
                        ? rec.tahun?.trim() || ''
                        : rec.tahun || 'Tanpa Tahun';
                      const isSelected = selectedIdSet.has(rec.id);
                      const isAttending = Boolean(rec.attendance?.present);

                      return (
                        <tr
                          key={`dt-${rec.id}`}
                          onClick={() => {
                            if (bulkMode) {
                              if (locked) {
                                setLockedNoticeRecord(rec);
                              } else {
                                toggleSelectRecord(rec.id);
                              }
                              return;
                            }
                            onSelectRecord(rec);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-2 py-2.5 text-center font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                            {bulkMode ? (
                              <span className="inline-flex items-center justify-center">
                                {locked ? (
                                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                                ) : isSelected ? (
                                  <CheckSquare className="h-4 w-4 text-teal-700" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-300" />
                                )}
                              </span>
                            ) : (
                              absenLabel
                            )}
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                                {thumb ? (
                                  <DriveImage
                                    doc={thumb}
                                    alt={rec.nama}
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <User className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate font-semibold text-slate-900">
                                    {rec.nama}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                                      rec.item?.trim()
                                        ? 'bg-slate-100 text-slate-700'
                                        : 'bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    {rec.item?.trim() || 'Tanpa Item'}
                                    {desilNumeric ? ` · D${desilNumeric}` : ''}
                                  </span>
                                  {locked && (
                                    <Lock className="h-3 w-3 shrink-0 text-rose-600" />
                                  )}
                                </div>
                                <p className="truncate text-[11px] text-slate-500">
                                  {rec.alamat || rec.kontak || '-'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <p className="truncate font-medium text-slate-800">{containerTitle}</p>
                            <p className="truncate text-[11px] text-slate-500 tabular-nums">
                              {[
                                desktopYearText,
                                dom.kecamatan,
                                kelurahanName,
                                rec.rt || rec.rw ? `RT ${rec.rt || '-'}/RW ${rec.rw || '-'}` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || '-'}
                            </p>
                          </td>
                          <td className="px-2.5 py-2.5 truncate text-slate-700">
                            {rec.pengelola?.trim() || '-'}
                          </td>
                          <td
                            className="px-2.5 py-2.5 whitespace-nowrap"
                            onClick={(e) => {
                              if (!isStandalone && onToggleAttendance && canUpdate && !locked && !isOffline) {
                                e.stopPropagation();
                              }
                            }}
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  rec.validasi === 'accepted'
                                    ? 'bg-teal-50 text-teal-800'
                                    : rec.validasi === 'rejected'
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {rec.validasi === 'accepted'
                                  ? 'Diterima'
                                  : rec.validasi === 'rejected'
                                    ? 'Ditolak'
                                    : 'Menunggu'}
                              </span>
                              {!isStandalone && onToggleAttendance && (
                                <button
                                  type="button"
                                  disabled={locked || !canUpdate || isOffline}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleAttendance(rec.id, !isAttending);
                                  }}
                                  title={
                                    isAttending
                                      ? 'KPM hadir — klik untuk batalkan absensi'
                                      : 'Tandai KPM hadir (absensi)'
                                  }
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    isAttending
                                      ? 'border-teal-200 bg-teal-600 text-white hover:bg-teal-700'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700'
                                  }`}
                                >
                                  <Check className={`h-2.5 w-2.5 ${isAttending ? 'opacity-100' : 'opacity-40'}`} />
                                  <span>{isAttending ? 'Hadir' : 'Absen'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td
                            className="px-2.5 py-2.5 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              {isSlotViewActive &&
                                activeProposalRecord &&
                                canUpdate &&
                                !locked &&
                                onMoveSlot && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isOffline || !canMoveUp}
                                      onClick={() =>
                                        onMoveSlot(
                                          activeProposalRecord.namaProposal,
                                          activeProposalRecord.tahun,
                                          { kind: 'kpm', kpmId: rec.id },
                                          'up'
                                        )
                                      }
                                      title="Naikkan urutan KPM"
                                      aria-label="Naikkan urutan KPM"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isOffline || !canMoveDown}
                                      onClick={() =>
                                        onMoveSlot(
                                          activeProposalRecord.namaProposal,
                                          activeProposalRecord.tahun,
                                          { kind: 'kpm', kpmId: rec.id },
                                          'down'
                                        )
                                      }
                                      title="Turunkan urutan KPM"
                                      aria-label="Turunkan urutan KPM"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              <button
                                type="button"
                                onClick={() => onSelectRecord(rec)}
                                title="Lihat Detail KPM"
                                aria-label={`Lihat Detail ${rec.nama}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-teal-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {canUpdate && onEditRecord && (
                                <button
                                  type="button"
                                  disabled={isOffline}
                                  onClick={() =>
                                    locked
                                      ? setLockedNoticeRecord(rec)
                                      : onEditRecord(rec)
                                  }
                                  title={locked ? 'Proposal Terkunci' : 'Edit Data KPM'}
                                  aria-label={locked ? 'Proposal Terkunci' : `Edit ${rec.nama}`}
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                                    locked
                                      ? 'border-slate-200 bg-slate-50 text-slate-400'
                                      : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                                  }`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  disabled={isOffline}
                                  onClick={() =>
                                    locked
                                      ? setLockedNoticeRecord(rec)
                                      : setPendingDeleteRecord(rec)
                                  }
                                  title={locked ? 'Proposal Terkunci' : 'Hapus KPM'}
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                                    locked
                                      ? 'border-slate-200 bg-slate-50 text-slate-400'
                                      : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                                  }`}
                                >
                                  {locked ? (
                                    <Lock className="h-3.5 w-3.5" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderedEntries.length > visibleLimit && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-3">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 40)}
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50"
                  >
                    Muat Lebih Banyak ({renderedEntries.length - visibleLimit} tersisa)
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Mobile & Native APK Swipeable Cards */
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {renderedEntries.slice(0, visibleLimit).map((entry, entryIdx) => {
              const canMoveUp = entryIdx > 0;
              const canMoveDown = entryIdx < renderedEntries.length - 1;

              if (entry.kind === 'empty') {
                const slotLabel = String(entry.slotNumber).padStart(2, '0');
                return (
                  <div
                    key={`mob-empty-${entry.slotNumber}`}
                    className="border-l-4 border-l-amber-400 bg-amber-50/50 px-3.5 py-3 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-amber-400 bg-white font-mono text-xs font-bold text-amber-800 tabular-nums">
                          {slotLabel}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-bold text-amber-900">
                              Baris Kosong
                            </span>
                            {entry.emptySlot.item && (
                              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                {entry.emptySlot.item}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-amber-800/85">
                            {entry.emptySlot.previousKpmName
                              ? `Slot bekas: ${entry.emptySlot.previousKpmName}`
                              : 'Nomor urut SK / BAST dipertahankan'}
                          </p>
                        </div>
                      </div>

                      {activeProposalRecord && !activeProposalLocked && canUpdate && onMoveSlot && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isOffline || !canMoveUp}
                            onClick={() =>
                              onMoveSlot(
                                activeProposalRecord.namaProposal,
                                activeProposalRecord.tahun,
                                { kind: 'empty', slotNumber: entry.slotNumber },
                                'up'
                              )
                            }
                            aria-label="Naikkan slot"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isOffline || !canMoveDown}
                            onClick={() =>
                              onMoveSlot(
                                activeProposalRecord.namaProposal,
                                activeProposalRecord.tahun,
                                { kind: 'empty', slotNumber: entry.slotNumber },
                                'down'
                              )
                            }
                            aria-label="Turunkan slot"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {activeProposalRecord && !activeProposalLocked && canUpdate && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {onCreateForEmptySlot && (
                          <button
                            type="button"
                            disabled={isOffline}
                            onClick={() =>
                              onCreateForEmptySlot(
                                activeProposalRecord.id,
                                activeProposalRecord.namaProposal,
                                activeProposalRecord.tahun,
                                entry.slotNumber,
                                entry.emptySlot.item
                              )
                            }
                            className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-xl bg-teal-700 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Daftar Baru</span>
                          </button>
                        )}
                        {onFillEmptySlotFromDatabase && (
                          <button
                            type="button"
                            disabled={isOffline}
                            onClick={() => {
                              if (isOffline) return;
                              setDbPickerQuery('');
                              setDbPickerTargetSlot({
                                proposalName: activeProposalRecord.namaProposal,
                                tahun: activeProposalRecord.tahun,
                                slotNumber: entry.slotNumber,
                                item: entry.emptySlot.item,
                              });
                            }}
                            className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-xl border border-teal-700 bg-white px-2.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Database className="h-3.5 w-3.5" />
                            <span>Dari Database</span>
                          </button>
                        )}
                        {onRemoveEmptySlot && canDelete && (
                          <button
                            type="button"
                            disabled={isOffline}
                            onClick={() =>
                              onRemoveEmptySlot(
                                activeProposalRecord.namaProposal,
                                activeProposalRecord.tahun,
                                entry.slotNumber
                              )
                            }
                            aria-label="Hapus Baris Kosong"
                            className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              const rec = entry.record;
              const thumb = getPrimaryKpmPhoto(rec.documents);
              const locked = isRecordProposalLocked(rec);
              const isStandalone = !rec.proposal?.trim() || rec.validasi !== 'accepted';
              const absenSeq = isStandalone
                ? 999999
                : isSlotViewActive
                  ? entry.slotNumber
                  : getAbsenSeq(rec.registerCode);
              const absenLabel = isStandalone
                ? ''
                : absenSeq < 999999
                  ? String(absenSeq).padStart(2, '0')
                  : '--';
              const desilNumeric = rec.dtsen && /^\d/.test(rec.dtsen.trim())
                ? rec.dtsen.trim().replace(/\s*-\s*/g, '-')
                : '';
              const dom = resolveKpmDomicile(rec, proposals, wilayahList);
              const kelurahanName = getCompactKelurahan(dom.kelurahan);
              const containerTitle = isStandalone ? getStandalonePlaceLabel(rec) : rec.proposal;
              const mobileYearText = isStandalone
                ? rec.tahun?.trim() || ''
                : rec.tahun || 'Tanpa Tahun';
              const metaLine = [dom.kecamatan, kelurahanName, rec.pengelola?.trim()]
                .filter(Boolean)
                .join(' · ');

              const showMobileMoveArrows = Boolean(
                isSlotViewActive &&
                  activeProposalRecord &&
                  canUpdate &&
                  !locked &&
                  !bulkMode &&
                  onMoveSlot
              );
              const isAttending = Boolean(rec.attendance?.present);
              const showMobileAttendanceToggle = Boolean(
                !isStandalone && !bulkMode && onToggleAttendance
              );

              const swipeActions: SwipeAction[] = locked
                ? [
                    {
                      key: 'locked',
                      label: 'Terkunci',
                      icon: <Lock className="h-4 w-4" />,
                      tone: 'locked',
                      disabled: isOffline,
                      onClick: () => setLockedNoticeRecord(rec),
                    },
                  ]
                : [
                    ...(showMobileMoveArrows && activeProposalRecord && onMoveSlot
                      ? [
                          {
                            key: 'reorder',
                            label: 'Urutan',
                            icon: <ArrowUp className="h-3.5 w-3.5" />,
                            tone: 'neutral' as const,
                            width: 52,
                            onClick: () => {},
                            stackedActions: [
                              {
                                key: 'move-up',
                                label: 'Naikkan urutan KPM',
                                icon: <ArrowUp className="h-4 w-4" />,
                                tone: 'neutral' as const,
                                disabled: isOffline || !canMoveUp,
                                keepOpen: true,
                                onClick: () =>
                                  onMoveSlot(
                                    activeProposalRecord.namaProposal,
                                    activeProposalRecord.tahun,
                                    { kind: 'kpm', kpmId: rec.id },
                                    'up'
                                  ),
                              },
                              {
                                key: 'move-down',
                                label: 'Turunkan urutan KPM',
                                icon: <ArrowDown className="h-4 w-4" />,
                                tone: 'neutral' as const,
                                disabled: isOffline || !canMoveDown,
                                keepOpen: true,
                                onClick: () =>
                                  onMoveSlot(
                                    activeProposalRecord.namaProposal,
                                    activeProposalRecord.tahun,
                                    { kind: 'kpm', kpmId: rec.id },
                                    'down'
                                  ),
                              },
                            ],
                          },
                        ]
                      : []),
                    ...(canUpdate && onEditRecord
                      ? [
                          {
                            key: 'edit',
                            label: 'Edit',
                            icon: <Pencil className="h-4 w-4" />,
                            tone: 'teal' as const,
                            width: 64,
                            disabled: isOffline,
                            onClick: () => onEditRecord(rec),
                          },
                        ]
                      : []),
                    ...(canDelete
                      ? [
                          {
                            key: 'delete',
                            label: 'Hapus',
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: 'danger' as const,
                            width: 64,
                            disabled: isOffline,
                            onClick: () => setPendingDeleteRecord(rec),
                          },
                        ]
                      : []),
                  ];

              const isSelected = selectedIds.includes(rec.id);

              return (
                <SwipeableRow
                  key={rec.id}
                  id={rec.id}
                  isOpen={openSwipeId === rec.id}
                  onOpen={setOpenSwipeId}
                  onClose={() => setOpenSwipeId(null)}
                  actions={bulkMode ? [] : swipeActions}
                >
                  <div
                    className={`flex w-full items-center transition-colors ${
                      isSelected
                        ? 'bg-teal-50/70'
                        : 'hover:bg-slate-50 active:bg-slate-100/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (bulkMode) {
                          if (locked) {
                            setLockedNoticeRecord(rec);
                          } else {
                            toggleSelectRecord(rec.id);
                          }
                          return;
                        }
                        onSelectRecord(rec);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 pl-3.5 py-2.5 text-left ${
                        showMobileAttendanceToggle ? 'pr-2' : 'pr-3.5'
                      }`}
                    >
                      {bulkMode ? (
                        <div className="flex w-5 shrink-0 items-center justify-center">
                          {locked ? (
                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                          ) : isSelected ? (
                            <CheckSquare className="h-4.5 w-4.5 text-teal-700" />
                          ) : (
                            <Square className="h-4.5 w-4.5 text-slate-300" />
                          )}
                        </div>
                      ) : !isStandalone ? (
                        <div className="flex w-5 shrink-0 items-center justify-center">
                          <span className="font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                            {absenLabel}
                          </span>
                        </div>
                      ) : null}

                      {/* Foto Thumbnail Fixed Frame (48x48) */}
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                        {thumb ? (
                          <DriveImage
                            doc={thumb}
                            alt={rec.nama}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                      </div>

                      {/* Konten Utama */}
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        {/* Baris 1: Nama + Item & Angka Desil */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1">
                            <span className="truncate text-[13px] font-medium leading-tight text-slate-900">
                              {rec.nama}
                            </span>
                            {locked && <Lock className="h-3 w-3 shrink-0 text-rose-600" />}
                          </div>

                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
                              rec.item?.trim()
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {rec.item?.trim() || 'Tanpa Item'}
                            {desilNumeric ? ` · D${desilNumeric}` : ''}
                          </span>
                        </div>

                        {/* Baris 2: Proposal / Status Standalone & Tahun */}
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] leading-tight">
                          <span className="truncate font-medium text-slate-600">
                            {containerTitle}
                          </span>
                          {mobileYearText && (
                            <span className="shrink-0 font-semibold text-slate-400 tabular-nums">
                              {mobileYearText}
                            </span>
                          )}
                        </div>

                        {/* Baris 3: Kelurahan / Pengelola */}
                        <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
                          {metaLine || '-'}
                        </p>
                      </div>
                    </button>

                    {showMobileAttendanceToggle && onToggleAttendance && (
                      <div
                        className="flex shrink-0 flex-col items-center justify-center gap-1 py-2 pr-3 pl-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isAttending}
                          aria-label={`Absensi kehadiran ${rec.nama}`}
                          disabled={locked || !canUpdate || isOffline}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleAttendance(rec.id, !isAttending);
                          }}
                          className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:cursor-not-allowed disabled:opacity-45 ${
                            isAttending ? 'bg-teal-700' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition duration-200 ${
                              isAttending ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span
                          className={`text-[10px] font-semibold leading-none ${
                            isAttending ? 'text-teal-700' : 'text-slate-400'
                          }`}
                        >
                          {isAttending ? 'Hadir' : 'Absen'}
                        </span>
                      </div>
                    )}
                  </div>
                </SwipeableRow>
              );
            })}
            {renderedEntries.length > visibleLimit && (
              <div className="bg-slate-50/70 p-3">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 40)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50"
                >
                  Muat Lebih Banyak ({renderedEntries.length - visibleLimit} tersisa)
                </button>
              </div>
            )}
          </div>
          )}
          </>
        )}
      </div>

      {/* Multi-Step Delete Disposition, Slot Handling & Confirmation Modal */}
      <SlotHandlingConfirmModal
        isOpen={Boolean(pendingDeleteRecord)}
        actionType="delete"
        kpmName={pendingDeleteRecord?.nama || ''}
        registerCode={pendingDeleteRecord?.registerCode}
        originProposalName={pendingDeleteRecord?.proposal}
        originSlotNumber={
          pendingDeleteRecord
            ? getKpmSlotNumberInProposal(
                pendingDeleteRecord,
                records,
                proposals,
                items,
                wilayahList,
                proposalSlotMap
              )
            : null
        }
        currentStatus={pendingDeleteRecord?.validasi}
        requiresSlotChoice={Boolean(
          pendingDeleteRecord &&
            pendingDeleteRecord.validasi === 'accepted' &&
            pendingDeleteRecord.proposal?.trim()
        )}
        onCancel={() => setPendingDeleteRecord(null)}
        onConfirm={(slotHandling, deleteAction) => {
          if (!pendingDeleteRecord) return;
          const id = pendingDeleteRecord.id;
          setPendingDeleteRecord(null);
          onDeleteRecord(id, slotHandling, deleteAction);
        }}
      />

      {/* Locked KPM Notice Modal */}
      {lockedNoticeRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setLockedNoticeRecord(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Informasi KPM Terkunci"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">Data KPM Terkunci</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  KPM <strong>&ldquo;{lockedNoticeRecord.nama}&rdquo;</strong> berada di
                  dalam proposal <strong>&ldquo;{lockedNoticeRecord.proposal}&rdquo;</strong> yang
                  sedang berstatus Terkunci, sehingga ikut terkunci dan tidak dapat diubah atau
                  dihapus.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  Buka kunci proposal terkait terlebih dahulu apabila ingin menghapus data KPM ini.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLockedNoticeRecord(null)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bulk Action Bar */}
      {bulkMode && selectedIds.length > 0 && (
        <div
          className={`fixed bottom-20 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl ${
            !isNativeApp ? 'md:bottom-6 md:left-[calc(50%+8rem)] md:max-w-xl' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <span className="text-xs font-bold tabular-nums">
              {selectedIds.length} KPM Dipilih
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              Bersihkan
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={handleBulkAcceptClick}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-teal-600 px-2 text-[11px] font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Terima</span>
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => void runBulkPatch({ validasi: 'pending' })}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-amber-600 px-2 text-[11px] font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
            >
              Menunggu
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => void runBulkPatch({ validasi: 'rejected' })}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-rose-600 px-2 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              Tolak
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => setBulkSheet('dtsen')}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-slate-800 px-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-60"
            >
              Atur Desil
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => setBulkSheet('item')}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-slate-800 px-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-60"
            >
              <Package className="h-3 w-3" />
              <span>Ganti Item</span>
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => void runBulkPatch({ markAllSubItems: true })}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-slate-800 px-2 text-[11px] font-semibold text-teal-300 hover:bg-slate-700 disabled:opacity-60"
            >
              Sub-Item ✓
            </button>
          </div>

          {canDelete && (
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => setBulkSheet('delete')}
              className="mt-1.5 inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/70 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Hapus / Keluarkan {selectedIds.length} KPM...</span>
            </button>
          )}
        </div>
      )}

      {/* Bulk Delete Choice Modal */}
      {bulkSheet === 'delete' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => !bulkProcessing && setBulkSheet('none')}
          role="dialog"
          aria-modal="true"
          aria-label="Pilih Tindakan Hapus KPM Terpilih"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Pilih Tindakan untuk {selectedIds.length} KPM
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    Simpan ke Database / Arsip Ditolak agar bisa dipakai ulang, atau hapus permanen:
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={() => setBulkSheet('none')}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {onBulkUpdateKpms && (
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => void runBulkPatch({ validasi: 'pending' })}
                  className="flex w-full items-start gap-3 rounded-2xl border-2 border-teal-200 bg-teal-50/60 p-3.5 text-left transition-colors hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-700">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">Masukkan ke Database KPM</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                      Data &amp; foto tetap disimpan di Database KPM tanpa koneksi proposal agar mudah dimasukkan lagi nanti.
                    </p>
                  </div>
                </button>
              )}

              {onBulkUpdateKpms && (
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => void runBulkPatch({ validasi: 'rejected' })}
                  className="flex w-full items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50/55 p-3.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
                    <Archive className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">Tandai Ditolak (Arsip)</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                      Dipindahkan ke Arsip Berkas Ditolak sebagai catatan, tetap bisa dipulihkan kapan saja.
                    </p>
                  </div>
                </button>
              )}

              {onBulkPermanentDeleteKpms && (
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => setBulkSheet('delete-confirm-permanent')}
                  className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/50 disabled:opacity-50"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-rose-700">Hapus Permanen</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                      Menghapus {selectedIds.length} KPM terpilih secara permanen beserta dokumen dan riwayat terkait.
                    </p>
                  </div>
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => setBulkSheet('none')}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Confirm Bulk Permanent Delete */}
      {bulkSheet === 'delete-confirm-permanent' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => !bulkProcessing && setBulkSheet('none')}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Permanen Massal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Hapus Permanen {selectedIds.length} KPM?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Sebanyak <strong>{selectedIds.length} data KPM terpilih</strong> beserta dokumen foto &amp; riwayat terkait akan <strong>dihapus permanen</strong> dan tidak dapat dikembalikan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={() => setBulkSheet('delete')}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={bulkProcessing || isOffline}
                onClick={() => void runBulkPermanentDelete()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {bulkProcessing ? 'Menghapus...' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Desil Picker Modal */}
      {bulkSheet === 'dtsen' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setBulkSheet('none')}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Atur Desil DTSEN ({selectedIds.length} KPM)
              </h3>
              <button
                type="button"
                onClick={() => setBulkSheet('none')}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {DTSEN_OPTION_ITEMS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => void runBulkPatch({ dtsen: opt.value })}
                  className="flex min-h-[42px] w-full items-center justify-between rounded-xl border border-slate-200 px-3 text-left text-xs font-semibold text-slate-800 hover:bg-teal-50 hover:border-teal-300"
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Item Picker Modal */}
      {bulkSheet === 'item' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setBulkSheet('none')}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Ganti Paket Item ({selectedIds.length} KPM)
              </h3>
              <button
                type="button"
                onClick={() => setBulkSheet('none')}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {yearItemOptions.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => void runBulkPatch({ item: it.code })}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-teal-50 hover:border-teal-300"
                >
                  <span className="text-xs font-bold text-teal-800">{it.code}</span>
                  <span className="truncate text-xs text-slate-700">{it.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Database KPM Picker Modal for Empty Slot */}
      {dbPickerTargetSlot && onFillEmptySlotFromDatabase && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setDbPickerTargetSlot(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Pilih KPM dari Database"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-3.5"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  Isi Baris Kosong #{String(dbPickerTargetSlot.slotNumber).padStart(2, '0')} dari Database
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pilih KPM berstatus Menunggu di {dbPickerTargetSlot.proposalName}
                  {dbPickerTargetSlot.item ? ` · Item dicadangkan: ${dbPickerTargetSlot.item}` : ''}
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

            {(dbPickerAreaScope.hasScope || dbPickerTargetSlot.item) && (
              <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-900">
                {dbPickerAreaScope.hasScope && (
                  <p className="font-medium">
                    Filter wilayah aktif: <strong>{dbPickerAreaScope.scopeLabel}</strong>
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
                placeholder="Cari nama, NIK, item, pengelola..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200">
              {databaseCandidates.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">
                  {dbPickerAreaScope.hasScope
                    ? `Tidak ada KPM berstatus Menunggu dari ${dbPickerAreaScope.scopeLabel} di Database KPM.`
                    : 'Tidak ada KPM tersedia di Database KPM.'}
                </p>
              ) : (
                databaseCandidates.slice(0, 50).map((cand) => {
                  const dom = resolveKpmDomicile(cand, proposals, wilayahList);
                  const targetSlotItem = (dbPickerTargetSlot.item || '').trim().toUpperCase();
                  const candItem = (cand.item || '').trim().toUpperCase();
                  const isSameItem = Boolean(targetSlotItem) && candItem === targetSlotItem;
                  const willChangeItem = Boolean(targetSlotItem) && candItem !== targetSlotItem;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        onFillEmptySlotFromDatabase(
                          cand.id,
                          dbPickerTargetSlot.proposalName,
                          dbPickerTargetSlot.tahun,
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
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {cand.item || 'Tanpa Item'}
                          {dom.kelurahan ? ` · ${dom.kelurahan}` : ''}
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

      {/* Bulk Accept Target Proposal Picker Modal */}
      <ProposalPickerModal
        isOpen={isBulkProposalPickerOpen}
        title={`Pilih Proposal Tujuan (${selectedIds.length} KPM)`}
        subtitle="KPM berstatus Diterima wajib masuk ke salah satu Proposal aktif (Murni / Perubahan)."
        confirmLabel="Terima & Masukkan"
        proposals={proposals}
        records={records}
        wilayahList={wilayahList}
        initialYear={selectedYear}
        onClose={() => setIsBulkProposalPickerOpen(false)}
        onSelectProposal={(targetProp) => {
          setIsBulkProposalPickerOpen(false);
          void runBulkPatch({ validasi: 'accepted', targetProposalId: targetProp.id });
        }}
      />
    </div>
  );
}
