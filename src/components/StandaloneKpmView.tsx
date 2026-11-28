import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  DTSEN_OPTIONS,
  INITIAL_WILAYAH_LIST,
} from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatKecamatanCategoryLabel,
  getPrimaryKpmPhoto,
  resolveKpmDomicile,
} from '../utils/imageProcessor';
import { DEFAULT_PDF_COLUMN_KEYS } from '../utils/pdfFormatHelpers';
import { exportKpmTableToPdf } from '../utils/pdfExporter';
import { exportKpmTableToXlsx } from '../utils/xlsxExporter';
import { useIsDesktopWeb } from '../utils/platform';
import { DriveImage } from './DriveImage';
import { FilterSelect } from './FormControls';
import { ProposalPickerModal } from './ProposalPickerModal';
import { useOfflineStatus } from '../contexts/OfflineContext';
import { fetchKpmPageFromSupabase } from '../services/supabaseData';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export type StandaloneMode = 'database' | 'arsip';

interface StandaloneKpmViewProps {
  mode: StandaloneMode;
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pengelolaList: PengelolaProfile[];
  wilayahList?: WilayahKabKota[];
  reportTemplate?: ReportTemplateConfig;
  proposalSlotMap?: ProposalSlotMap;
  canAdd?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  onBack: () => void;
  onSelectKpm: (record: KpmRecord) => void;
  onCreateNewStandalone?: () => void;
  onBulkRecoverToDatabase?: (kpmIds: string[]) => Promise<void> | void;
  onBulkRejectToArsip?: (kpmIds: string[]) => Promise<void> | void;
  onBulkAssignToProposal?: (kpmIds: string[], targetProposal: ProposalRecord) => Promise<void> | void;
  onBulkPermanentDelete?: (kpmIds: string[]) => Promise<void> | void;
}

const NO_YEAR_KEY = '__no_year__';
const NO_KECAMATAN_KEY = '__no_kecamatan__';

export function StandaloneKpmView({
  mode,
  records,
  proposals,
  items,
  pengelolaList,
  wilayahList = INITIAL_WILAYAH_LIST,
  reportTemplate,
  proposalSlotMap = {},
  canAdd = true,
  canUpdate = true,
  canDelete = true,
  onBack,
  onSelectKpm,
  onCreateNewStandalone,
  onBulkRecoverToDatabase,
  onBulkRejectToArsip,
  onBulkAssignToProposal,
  onBulkPermanentDelete,
}: StandaloneKpmViewProps) {
  const { isOffline } = useOfflineStatus();
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;

  const isDatabase = mode === 'database';
  const targetStatus = isDatabase ? 'pending' : 'rejected';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [kecamatanFilter, setKecamatanFilter] = useState('all');
  const [kelurahanFilter, setKelurahanFilter] = useState('all');
  const [pengelolaFilter, setPengelolaFilter] = useState('all');
  const [itemFilter, setItemFilter] = useState('all');
  const [dtsenFilter, setDtsenFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const [serverPage, setServerPage] = useState(1);
  const [serverPageRecords, setServerPageRecords] = useState<KpmRecord[] | null>(null);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [isServerPageLoading, setIsServerPageLoading] = useState(false);
  const SERVER_PAGE_SIZE = 40;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProposalPickerOpen, setIsProposalPickerOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: 'recover'; ids: string[] }
    | { kind: 'reject'; ids: string[] }
    | { kind: 'delete'; ids: string[] }
    | null
  >(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSplitByPengelola, setExportSplitByPengelola] = useState(false);
  const [exportBusyFormat, setExportBusyFormat] = useState<'pdf' | 'xlsx' | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Debounce pencarian minimal 500ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setServerPage(1);
  }, [
    mode,
    debouncedQuery,
    yearFilter,
    kecamatanFilter,
    kelurahanFilter,
    pengelolaFilter,
    itemFilter,
    dtsenFilter,
  ]);

  useEffect(() => {
    if (isOffline && selectionMode) {
      setSelectionMode(false);
      setSelectedIds([]);
      setPendingConfirm(null);
      setIsProposalPickerOpen(false);
    }
  }, [isOffline, selectionMode]);

  // Semua data standalone sesuai mode (tidak terhubung proposal mana pun)
  const modeRecords = useMemo(
    () =>
      records.filter((r) => r.validasi === targetStatus && !(r.proposal || '').trim()),
    [records, targetStatus]
  );

  // Enrich domicile secara aman meskipun tanpa proposal / tanpa tahun
  const enrichedRecords = useMemo(() => {
    return modeRecords.map((rec) => {
      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
      return {
        record: rec,
        kabKota: dom.kabKota || rec.kabKota || '',
        kecamatan: dom.kecamatan || rec.kecamatan || '',
        kelurahan: dom.kelurahan || rec.kelurahan || '',
      };
    });
  }, [modeRecords, proposals, wilayahList]);

  const hasRecordsWithoutYear = useMemo(
    () => enrichedRecords.some((e) => !(e.record.tahun || '').trim()),
    [enrichedRecords]
  );

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    enrichedRecords.forEach((e) => {
      const yr = (e.record.tahun || '').trim();
      if (yr) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [enrichedRecords]);

  const kecamatanOptions = useMemo(() => {
    const set = new Set<string>();
    wilayahList.forEach((w) => w.kecamatanList.forEach((k) => set.add(k.nama)));
    enrichedRecords.forEach((e) => {
      if (e.kecamatan.trim()) set.add(e.kecamatan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [wilayahList, enrichedRecords]);

  const kelurahanOptions = useMemo(() => {
    const set = new Set<string>();
    wilayahList.forEach((w) =>
      w.kecamatanList.forEach((k) => {
        if (kecamatanFilter === 'all' || k.nama.toLowerCase() === kecamatanFilter.toLowerCase()) {
          k.kelurahanList.forEach((kel) => set.add(kel));
        }
      })
    );
    enrichedRecords.forEach((e) => {
      if (!e.kelurahan.trim()) return;
      if (
        kecamatanFilter !== 'all' &&
        kecamatanFilter !== NO_KECAMATAN_KEY &&
        e.kecamatan.trim().toLowerCase() !== kecamatanFilter.toLowerCase()
      ) {
        return;
      }
      set.add(e.kelurahan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [wilayahList, enrichedRecords, kecamatanFilter]);

  const pengelolaOptions = useMemo(() => {
    const set = new Set<string>();
    pengelolaList.forEach((p) => {
      if (p.displayName) set.add(p.displayName);
    });
    enrichedRecords.forEach((e) => {
      if (e.record.pengelola?.trim()) set.add(e.record.pengelola.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [pengelolaList, enrichedRecords]);

  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.code) set.add(it.code);
    });
    enrichedRecords.forEach((e) => {
      if (e.record.item?.trim()) set.add(e.record.item.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [items, enrichedRecords]);

  const dtsenOptions = useMemo(() => {
    const set = new Set<string>(DTSEN_OPTIONS);
    enrichedRecords.forEach((e) => {
      if (e.record.dtsen?.trim()) set.add(e.record.dtsen.trim());
    });
    return Array.from(set);
  }, [enrichedRecords]);

  const activeExtraFilterCount = useMemo(() => {
    let count = 0;
    if (kecamatanFilter !== 'all') count += 1;
    if (kelurahanFilter !== 'all') count += 1;
    if (pengelolaFilter !== 'all') count += 1;
    if (itemFilter !== 'all') count += 1;
    if (dtsenFilter !== 'all') count += 1;
    return count;
  }, [kecamatanFilter, kelurahanFilter, pengelolaFilter, itemFilter, dtsenFilter]);

  const filteredEntries = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return enrichedRecords
      .filter(({ record, kecamatan, kelurahan }) => {
        const recTahun = (record.tahun || '').trim();
        if (yearFilter === NO_YEAR_KEY) {
          if (recTahun !== '') return false;
        } else if (yearFilter !== 'all' && recTahun !== yearFilter) {
          return false;
        }

        if (kecamatanFilter === NO_KECAMATAN_KEY) {
          if (kecamatan.trim() !== '') return false;
        } else if (
          kecamatanFilter !== 'all' &&
          kecamatan.trim().toLowerCase() !== kecamatanFilter.toLowerCase()
        ) {
          return false;
        }

        if (
          kelurahanFilter !== 'all' &&
          kelurahan.trim().toLowerCase() !== kelurahanFilter.toLowerCase()
        ) {
          return false;
        }

        if (
          pengelolaFilter !== 'all' &&
          (record.pengelola || '').trim().toLowerCase() !== pengelolaFilter.toLowerCase()
        ) {
          return false;
        }

        if (
          itemFilter !== 'all' &&
          (record.item || '').trim().toUpperCase() !== itemFilter.toUpperCase()
        ) {
          return false;
        }

        if (
          dtsenFilter !== 'all' &&
          (record.dtsen || '').trim().toLowerCase() !== dtsenFilter.toLowerCase()
        ) {
          return false;
        }

        if (!q) return true;
        return (
          record.nama.toLowerCase().includes(q) ||
          (record.nikKtp || '').includes(q) ||
          (record.nikKk || '').includes(q) ||
          (record.alamat || '').toLowerCase().includes(q) ||
          kecamatan.toLowerCase().includes(q) ||
          kelurahan.toLowerCase().includes(q) ||
          (record.pengelola || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const kecCmp = (a.kecamatan || 'zzz').localeCompare(b.kecamatan || 'zzz', 'id');
        if (kecCmp !== 0) return kecCmp;
        const kelCmp = (a.kelurahan || 'zzz').localeCompare(b.kelurahan || 'zzz', 'id');
        if (kelCmp !== 0) return kelCmp;
        return a.record.nama.localeCompare(b.record.nama, 'id');
      });
  }, [
    enrichedRecords,
    yearFilter,
    kecamatanFilter,
    kelurahanFilter,
    pengelolaFilter,
    itemFilter,
    dtsenFilter,
    debouncedQuery,
  ]);

  const canUseServerPagination = Boolean(isSupabaseConfigured && !isOffline && !selectionMode);

  useEffect(() => {
    if (!canUseServerPagination) {
      setServerPageRecords(null);
      return;
    }
    let cancelled = false;
    setIsServerPageLoading(true);
    void fetchKpmPageFromSupabase({
      page: serverPage,
      pageSize: SERVER_PAGE_SIZE,
      validasi: targetStatus,
      standaloneOnly: true,
      tahun: yearFilter,
      kecamatan: kecamatanFilter,
      kelurahan: kelurahanFilter,
      pengelola: pengelolaFilter,
      item: itemFilter,
      dtsen: dtsenFilter,
      search: debouncedQuery,
      proposals,
    })
      .then((res) => {
        if (cancelled) return;
        setServerPageRecords(res.records);
        setServerTotalCount(res.totalCount);
      })
      .catch(() => {
        if (cancelled) return;
        setServerPageRecords(null);
      })
      .finally(() => {
        if (!cancelled) setIsServerPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    canUseServerPagination,
    serverPage,
    targetStatus,
    yearFilter,
    kecamatanFilter,
    kelurahanFilter,
    pengelolaFilter,
    itemFilter,
    dtsenFilter,
    debouncedQuery,
    proposals,
  ]);

  const localRecordById = useMemo(() => {
    const map = new Map<string, KpmRecord>();
    for (const r of records) map.set(r.id, r);
    return map;
  }, [records]);

  const visiblePageEntries = useMemo(() => {
    if (canUseServerPagination && serverPageRecords) {
      return serverPageRecords
        .filter((r) => localRecordById.size === 0 || localRecordById.has(r.id))
        .map((r) => {
          const merged = localRecordById.get(r.id) ?? r;
          const dom = resolveKpmDomicile(merged, proposals, wilayahList);
          return {
            record: merged,
            kabKota: dom.kabKota || merged.kabKota || '',
            kecamatan: dom.kecamatan || merged.kecamatan || '',
            kelurahan: dom.kelurahan || merged.kelurahan || '',
          };
        });
    }
    return filteredEntries;
  }, [canUseServerPagination, serverPageRecords, localRecordById, proposals, wilayahList, filteredEntries]);

  const serverTotalPages = Math.max(1, Math.ceil(serverTotalCount / SERVER_PAGE_SIZE));

  // Kelompokkan berdasarkan Domisili (Kecamatan)
  const groupedByDomicile = useMemo(() => {
    const groups = new Map<string, typeof visiblePageEntries>();
    for (const entry of visiblePageEntries) {
      const kecLabel = entry.kecamatan.trim()
        ? formatKecamatanCategoryLabel(entry.kecamatan)
        : 'Domisili Belum Dilengkapi';
      const arr = groups.get(kecLabel) ?? [];
      arr.push(entry);
      groups.set(kecLabel, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Domisili Belum Dilengkapi') return 1;
      if (b === 'Domisili Belum Dilengkapi') return -1;
      return a.localeCompare(b, 'id');
    });
  }, [visiblePageEntries]);

  const filteredIdList = useMemo(
    () => filteredEntries.map((e) => e.record.id),
    [filteredEntries]
  );

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedFilteredCount = useMemo(
    () => filteredIdList.filter((id) => selectedIdSet.has(id)).length,
    [filteredIdList, selectedIdSet]
  );
  const isAllFilteredSelected =
    filteredIdList.length > 0 && selectedFilteredCount === filteredIdList.length;

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredSet = new Set(filteredIdList);
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIdList])));
    }
  };

  const resetAllFilters = () => {
    setQuery('');
    setYearFilter('all');
    setKecamatanFilter('all');
    setKelurahanFilter('all');
    setPengelolaFilter('all');
    setItemFilter('all');
    setDtsenFilter('all');
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm || isBusy) return;
    const { kind, ids } = pendingConfirm;
    setIsBusy(true);
    try {
      if (kind === 'recover' && onBulkRecoverToDatabase) {
        await onBulkRecoverToDatabase(ids);
      } else if (kind === 'reject' && onBulkRejectToArsip) {
        await onBulkRejectToArsip(ids);
      } else if (kind === 'delete' && onBulkPermanentDelete) {
        await onBulkPermanentDelete(ids);
      }
      setSelectedIds([]);
      setSelectionMode(false);
      setPendingConfirm(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAssignProposal = async (targetProposal: ProposalRecord) => {
    if (!onBulkAssignToProposal || selectedIds.length === 0 || isBusy) return;
    setIsBusy(true);
    try {
      await onBulkAssignToProposal(selectedIds, targetProposal);
      setIsProposalPickerOpen(false);
      setSelectedIds([]);
      setSelectionMode(false);
    } finally {
      setIsBusy(false);
    }
  };

  const title = isDatabase ? 'Database KPM' : 'Arsip Berkas Ditolak';
  const subtitle = isDatabase
    ? 'KPM berstatus Menunggu berbasis domisili yang belum terikat ke proposal mana pun.'
    : 'Berkas KPM berstatus Ditolak berbasis domisili. Dapat dipulihkan ke Database KPM atau dihapus permanen.';

  const canBulkAct = canUpdate || canDelete;

  const activeFilterSummaryParts = useMemo(() => {
    const parts: string[] = [];
    if (yearFilter === NO_YEAR_KEY) parts.push('Tanpa Tahun');
    else if (yearFilter !== 'all') parts.push(`Tahun ${yearFilter}`);
    if (kecamatanFilter === NO_KECAMATAN_KEY) parts.push('Kec. Kosong');
    else if (kecamatanFilter !== 'all') parts.push(kecamatanFilter);
    if (kelurahanFilter !== 'all') parts.push(kelurahanFilter);
    if (pengelolaFilter !== 'all') parts.push(`Pengelola: ${pengelolaFilter}`);
    if (itemFilter !== 'all') parts.push(`Item: ${itemFilter}`);
    if (dtsenFilter !== 'all') parts.push(`Desil: ${dtsenFilter}`);
    if (debouncedQuery.trim()) parts.push(`Cari: "${debouncedQuery.trim()}"`);
    return parts;
  }, [
    yearFilter,
    kecamatanFilter,
    kelurahanFilter,
    pengelolaFilter,
    itemFilter,
    dtsenFilter,
    debouncedQuery,
  ]);

  const handleStandaloneExport = async (format: 'pdf' | 'xlsx') => {
    const targetRecords = filteredEntries.map((e) => e.record);
    if (targetRecords.length === 0 || exportBusyFormat) return;
    setExportBusyFormat(format);
    setExportFeedback(null);

    const exportTitle = isDatabase ? 'DATABASE KPM (MENUNGGU)' : 'ARSIP BERKAS KPM DITOLAK';
    const exportSubtitle =
      activeFilterSummaryParts.length > 0
        ? `Filter: ${activeFilterSummaryParts.join(' · ')}`
        : isDatabase
          ? 'Seluruh KPM berstatus Menunggu (Tanpa Proposal)'
          : 'Seluruh Berkas KPM Ditolak (Tanpa Proposal)';
    const baseName = isDatabase ? 'Database_KPM' : 'Arsip_Ditolak_KPM';
    const suffixParts: string[] = [];
    if (yearFilter !== 'all' && yearFilter !== NO_YEAR_KEY) suffixParts.push(yearFilter);
    if (kecamatanFilter !== 'all' && kecamatanFilter !== NO_KECAMATAN_KEY) {
      suffixParts.push(kecamatanFilter.replace(/[^a-zA-Z0-9]+/g, '_'));
    }
    if (pengelolaFilter !== 'all') {
      suffixParts.push(pengelolaFilter.replace(/[^a-zA-Z0-9]+/g, '_'));
    }
    const fileName = [baseName, ...suffixParts].join('_');

    try {
      if (format === 'pdf') {
        const res = await exportKpmTableToPdf({
          records: targetRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          selectedColumns: DEFAULT_PDF_COLUMN_KEYS,
          title: exportTitle,
          subtitle: exportSubtitle,
          fileName,
          includeSummary: true,
          reportTemplate,
          splitByPengelola: exportSplitByPengelola,
          selectedPengelolaLabel: pengelolaFilter !== 'all' ? pengelolaFilter : undefined,
          proposalSlotMap,
          includeEmptySlots: false,
        });
        setExportFeedback({
          type: 'success',
          text: `PDF berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      } else {
        const res = await exportKpmTableToXlsx({
          records: targetRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          proposalSlotMap,
          title: exportTitle,
          subtitle: exportSubtitle,
          fileName,
          includeEmptySlots: false,
          splitByPengelola: exportSplitByPengelola,
        });
        setExportFeedback({
          type: 'success',
          text: `Excel berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      }
    } catch (err) {
      setExportFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat file ekspor.',
      });
    } finally {
      setExportBusyFormat(null);
    }
  };

  return (
    <div className={`min-h-screen ${selectionMode && selectedIds.length > 0 ? 'pb-40' : 'pb-24'}`}>
      {/* Native Mobile Header */}
      {isNativeApp && (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Kembali ke Menu"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-bold text-slate-900">{title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {filteredEntries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setExportFeedback(null);
                  setIsExportModalOpen(true);
                }}
                aria-label="Unduh data hasil filter"
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="h-4 w-4 text-teal-700" />
                <span>Unduh</span>
              </button>
            )}
            {isDatabase && canAdd && onCreateNewStandalone && (
              <button
                type="button"
                disabled={isOffline}
                onClick={onCreateNewStandalone}
                aria-label="Tambah KPM ke Database"
                className="inline-flex h-10 items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah</span>
              </button>
            )}
            {canBulkAct && enrichedRecords.length > 0 && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => {
                  if (isOffline) return;
                  setSelectionMode((prev) => !prev);
                  if (selectionMode) setSelectedIds([]);
                }}
                className={`inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  selectionMode
                    ? 'border-teal-700 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {selectionMode ? 'Selesai' : 'Pilih'}
              </button>
            )}
          </div>
        </header>
      )}

      {/* Sticky Desktop Header Bar */}
      {!isNativeApp && (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Menu</span>
              </button>
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isDatabase ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {isDatabase ? (
                    <Database className="h-4.5 w-4.5" />
                  ) : (
                    <Archive className="h-4.5 w-4.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                      {title}
                    </h1>
                    <span className="text-xs font-bold text-slate-500 tabular-nums">
                      · {filteredEntries.length}/{enrichedRecords.length} KPM
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{subtitle}</p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {filteredEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setExportFeedback(null);
                    setIsExportModalOpen(true);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50/60 hover:text-teal-800 whitespace-nowrap"
                >
                  <Download className="h-4 w-4 text-teal-700" />
                  <span>Unduh ({filteredEntries.length})</span>
                </button>
              )}

              {canBulkAct && enrichedRecords.length > 0 && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => {
                    if (isOffline) return;
                    setSelectionMode((prev) => !prev);
                    if (selectionMode) setSelectedIds([]);
                  }}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    selectionMode
                      ? 'border-teal-700 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CheckSquare className="h-4 w-4" />
                  <span>{selectionMode ? 'Selesai Memilih' : 'Pilih Massal'}</span>
                </button>
              )}

              {isDatabase && canAdd && onCreateNewStandalone && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={onCreateNewStandalone}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="h-4 w-4" />
                  <span>Input ke Database KPM</span>
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <div
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-5' : ''
        }`}
      >

        {isNativeApp && (
          <p className="px-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        )}

        {/* Filter Bar */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, NIK KTP/KK, atau alamat..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            {yearOptions.length > 0 && (
              <FilterSelect
                ariaLabel="Filter tahun"
                value={yearFilter}
                onChange={setYearFilter}
                className="w-[106px] shrink-0"
              >
                <option value="all">Semua</option>
                {hasRecordsWithoutYear && <option value={NO_YEAR_KEY}>Tanpa Tahun</option>}
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </FilterSelect>
            )}

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-label="Filter domisili dan atribut"
              aria-expanded={showFilters}
              className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                showFilters || activeExtraFilterCount > 0
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

          {showFilters && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Kecamatan
                  </label>
                  <FilterSelect
                    ariaLabel="Filter kecamatan"
                    value={kecamatanFilter}
                    onChange={(val) => {
                      setKecamatanFilter(val);
                      setKelurahanFilter('all');
                    }}
                  >
                    <option value="all">Semua Kecamatan</option>
                    <option value={NO_KECAMATAN_KEY}>Belum Ada Kecamatan</option>
                    {kecamatanOptions.map((kec) => (
                      <option key={kec} value={kec}>
                        {kec}
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Kelurahan / Desa
                  </label>
                  <FilterSelect
                    ariaLabel="Filter kelurahan"
                    value={kelurahanFilter}
                    onChange={setKelurahanFilter}
                  >
                    <option value="all">Semua Kelurahan</option>
                    {kelurahanOptions.map((kel) => (
                      <option key={kel} value={kel}>
                        {kel}
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Pengelola
                  </label>
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
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Item Bantuan
                  </label>
                  <FilterSelect
                    ariaLabel="Filter item bantuan"
                    value={itemFilter}
                    onChange={setItemFilter}
                  >
                    <option value="all">Semua Item</option>
                    {itemOptions.map((it) => (
                      <option key={it} value={it}>
                        {it}
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Desil DTSEN
                  </label>
                  <FilterSelect
                    ariaLabel="Filter desil DTSEN"
                    value={dtsenFilter}
                    onChange={setDtsenFilter}
                  >
                    <option value="all">Semua Desil</option>
                    {dtsenOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </div>

              {(activeExtraFilterCount > 0 || yearFilter !== 'all' || query.trim() !== '') && (
                <div className="flex justify-end border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset Semua Filter</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Toolbar Pilih Semua saat Mode Pilih Massal aktif */}
          {selectionMode && filteredEntries.length > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50/70 px-3.5 py-2.5">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50"
              >
                {isAllFilteredSelected ? (
                  <CheckSquare className="h-4 w-4 text-teal-700" />
                ) : (
                  <Square className="h-4 w-4 text-slate-400" />
                )}
                <span>
                  {isAllFilteredSelected ? 'Batal Pilih Semua' : 'Pilih Semua'} ({filteredEntries.length})
                </span>
              </button>

              <span className="text-xs font-bold text-teal-900 tabular-nums">
                {selectedIds.length} terpilih
              </span>
            </div>
          )}
        </div>

        {/* Daftar KPM Dikelompokkan per Domisili */}
        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-900">
              {isDatabase
                ? 'Belum ada data KPM di Database KPM'
                : 'Tidak ada berkas di Arsip Ditolak'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {isDatabase
                ? 'KPM baru atau KPM yang berstatus Menunggu akan tersimpan mandiri di sini berdasarkan domisili.'
                : 'KPM yang berstatus Ditolak akan tersimpan mandiri di sini dan tidak terhubung ke proposal.'}
            </p>
            {isDatabase && canAdd && onCreateNewStandalone && enrichedRecords.length === 0 && (
              <button
                type="button"
                disabled={isOffline}
                onClick={onCreateNewStandalone}
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah KPM ke Database</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByDomicile.map(([kecGroup, entries]) => (
              <section key={kecGroup} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-teal-200/70 bg-teal-50 text-teal-700">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="truncate text-xs font-bold tracking-wide text-slate-800">
                      {kecGroup}
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                    {entries.length} KPM
                  </span>
                </div>

                <div
                  className={`overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 ${
                    !isNativeApp
                      ? 'md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent'
                      : ''
                  }`}
                >
                  {entries.map(({ record: rec, kecamatan, kelurahan }) => {
                    const thumb = getPrimaryKpmPhoto(rec.documents);
                    const isChecked = selectedIdSet.has(rec.id);
                    const rawDtsen = rec.dtsen?.trim() || '';
                    const desilText = rawDtsen
                      ? /^\d/.test(rawDtsen)
                        ? `D${rawDtsen.replace(/\s*-\s*/g, '-')}`
                        : rawDtsen
                      : '';
                    const kelShort = kelurahan
                      ? kelurahan.replace(/^(kelurahan|kel\.?)\s+/i, '').trim()
                      : '';
                    const domicileLine = [
                      kelShort || kecamatan || 'Domisili belum lengkap',
                      rec.rt || rec.rw
                        ? `RT ${rec.rt || '-'} / RW ${rec.rw || '-'}`
                        : '',
                      rec.pengelola?.trim() || '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    const rowSecondaryLine = [
                      rec.nikKtp ? `NIK ${rec.nikKtp}` : '',
                      rec.tahun?.trim() || '',
                      rec.alamat?.trim() || '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <div
                        key={rec.id}
                        className={`bg-white transition-colors ${
                          !isNativeApp
                            ? `md:overflow-hidden md:rounded-2xl md:border ${
                                isChecked
                                  ? 'md:border-teal-600 md:bg-teal-50/40'
                                  : 'md:border-slate-200'
                              }`
                            : isChecked
                              ? 'bg-teal-50/40'
                              : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (selectionMode) {
                              toggleSelectId(rec.id);
                            } else {
                              onSelectKpm(rec);
                            }
                          }}
                          className="flex min-h-[68px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50/80 active:bg-slate-100/60"
                        >
                          {selectionMode && (
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                isChecked
                                  ? 'border-teal-700 bg-teal-700 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                            </div>
                          )}

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

                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold leading-tight text-slate-900">
                                {rec.nama}
                              </span>
                              <span
                                className={`shrink-0 text-[11px] font-bold tabular-nums ${
                                  isDatabase ? 'text-amber-700' : 'text-rose-700'
                                }`}
                              >
                                {rec.item || 'Tanpa Item'}
                                {desilText ? ` · ${desilText}` : ''}
                              </span>
                            </div>

                            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-700">
                              {domicileLine}
                            </p>

                            <p className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                              {rowSecondaryLine}
                            </p>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {canUseServerPagination && serverPageRecords && serverTotalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  Halaman {serverPage} dari {serverTotalPages} · {serverTotalCount} KPM
                  {isServerPageLoading ? ' · Memuat...' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={serverPage <= 1 || isServerPageLoading}
                    onClick={() => {
                      setServerPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Sebelumnya</span>
                  </button>
                  <button
                    type="button"
                    disabled={serverPage >= serverTotalPages || isServerPageLoading}
                    onClick={() => {
                      setServerPage((p) => Math.min(serverTotalPages, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bulk Action Bar */}
      {selectionMode && selectedIds.length > 0 && (
        <div
          className={`fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md ${
            !isNativeApp
              ? 'md:left-64 md:right-0 md:w-auto md:max-w-none md:translate-x-0 md:px-6'
              : ''
          }`}
        >
          <div
            className={`flex flex-wrap items-center justify-between gap-2 ${
              !isNativeApp ? 'md:mx-auto md:max-w-[1440px]' : ''
            }`}
          >
            <span className="text-xs font-bold text-slate-800 tabular-nums">
              {selectedIds.length} KPM dipilih
            </span>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              {isDatabase ? (
                <>
                  {canUpdate && onBulkAssignToProposal && (
                    <button
                      type="button"
                      disabled={isBusy || isOffline}
                      onClick={() => setIsProposalPickerOpen(true)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderPlus className="h-4 w-4 shrink-0" />
                      <span>Masukkan ke Proposal</span>
                    </button>
                  )}

                  {canUpdate && onBulkRejectToArsip && (
                    <button
                      type="button"
                      disabled={isBusy || isOffline}
                      onClick={() => setPendingConfirm({ kind: 'reject', ids: selectedIds })}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4 shrink-0" />
                      <span>Tolak ke Arsip</span>
                    </button>
                  )}

                  {canDelete && onBulkPermanentDelete && (
                    <button
                      type="button"
                      disabled={isBusy || isOffline}
                      onClick={() => setPendingConfirm({ kind: 'delete', ids: selectedIds })}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>Hapus Permanen</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  {canUpdate && onBulkRecoverToDatabase && (
                    <button
                      type="button"
                      disabled={isBusy || isOffline}
                      onClick={() => setPendingConfirm({ kind: 'recover', ids: selectedIds })}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" />
                      <span>Pulihkan ke Database KPM</span>
                    </button>
                  )}

                  {canDelete && onBulkPermanentDelete && (
                    <button
                      type="button"
                      disabled={isBusy || isOffline}
                      onClick={() => setPendingConfirm({ kind: 'delete', ids: selectedIds })}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span>Hapus Permanen</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proposal Picker Modal untuk Bulk Assign */}
      <ProposalPickerModal
        isOpen={isProposalPickerOpen}
        title="Masukkan KPM ke Proposal"
        subtitle={`Pilih Proposal aktif (Murni / Perubahan) untuk menampung ${selectedIds.length} KPM terpilih dengan status Diterima.`}
        confirmLabel={`Terima ke Proposal (${selectedIds.length})`}
        proposals={proposals}
        records={records}
        wilayahList={wilayahList}
        initialYear={yearFilter !== 'all' && yearFilter !== NO_YEAR_KEY ? yearFilter : 'all'}
        onClose={() => setIsProposalPickerOpen(false)}
        onSelectProposal={handleAssignProposal}
      />

      {/* Confirmation Dialog untuk Recover / Reject / Permanent Delete */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => !isBusy && setPendingConfirm(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Aksi Massal KPM"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  pendingConfirm.kind === 'delete'
                    ? 'bg-rose-50 text-rose-600'
                    : pendingConfirm.kind === 'reject'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-teal-50 text-teal-700'
                }`}
              >
                {pendingConfirm.kind === 'delete' ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : pendingConfirm.kind === 'reject' ? (
                  <Archive className="h-5 w-5" />
                ) : (
                  <RotateCcw className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  {pendingConfirm.kind === 'delete'
                    ? 'Hapus Permanen KPM?'
                    : pendingConfirm.kind === 'reject'
                      ? 'Tolak ke Arsip?'
                      : 'Pulihkan ke Database KPM?'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {pendingConfirm.kind === 'delete' ? (
                    <>
                      Sebanyak <strong>{pendingConfirm.ids.length} KPM terpilih</strong> beserta dokumen foto dan riwayat terkait akan <strong>dihapus permanen</strong> dari database dan tidak dapat dikembalikan.
                    </>
                  ) : pendingConfirm.kind === 'reject' ? (
                    <>
                      Sebanyak <strong>{pendingConfirm.ids.length} KPM terpilih</strong> akan dipindahkan ke menu <strong>Arsip Berkas Ditolak</strong> (tanpa koneksi proposal).
                    </>
                  ) : (
                    <>
                      Sebanyak <strong>{pendingConfirm.ids.length} KPM terpilih</strong> akan dipulihkan ke menu <strong>Database KPM</strong> dengan status Menunggu (tanpa koneksi proposal).
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setPendingConfirm(null)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isBusy || isOffline}
                onClick={() => void executeConfirmedAction()}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  pendingConfirm.kind === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : pendingConfirm.kind === 'reject'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>
                  {isBusy
                    ? 'Memproses...'
                    : pendingConfirm.kind === 'delete'
                      ? 'Ya, Hapus Permanen'
                      : pendingConfirm.kind === 'reject'
                        ? 'Ya, Tolak ke Arsip'
                        : 'Ya, Pulihkan'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Unduh Database / Arsip Ditolak */}
      {isExportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setIsExportModalOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                  Ekspor Data Sesuai Filter
                </p>
                <h3 className="mt-0.5 text-base font-bold text-slate-900">{title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">Jumlah data terfilter</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">
                    {filteredEntries.length} KPM
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {activeFilterSummaryParts.length > 0
                    ? activeFilterSummaryParts.join(' · ')
                    : 'Semua data tanpa filter tambahan'}
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 transition-colors hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    Pisahkan halaman / sheet per Pengelola
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Kelompokkan hasil unduhan berdasarkan masing-masing pengelola lapangan.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={exportSplitByPengelola}
                  onChange={(e) => setExportSplitByPengelola(e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
              </label>

              {exportFeedback && (
                <div
                  className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                    exportFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{exportFeedback.text}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={filteredEntries.length === 0 || exportBusyFormat !== null}
                onClick={() => void handleStandaloneExport('xlsx')}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap"
              >
                {exportBusyFormat === 'xlsx' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                )}
                <span>Unduh Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                disabled={filteredEntries.length === 0 || exportBusyFormat !== null}
                onClick={() => void handleStandaloneExport('pdf')}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-45 whitespace-nowrap"
              >
                {exportBusyFormat === 'pdf' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span>Unduh PDF (F4)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
