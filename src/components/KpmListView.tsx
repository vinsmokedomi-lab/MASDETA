import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Lock,
  Package,
  QrCode,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST, TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  getAbsenSeq,
  getItemHierarchyRank,
  getItemsForYear,
  getPrimaryKpmPhoto,
  isKecamatanProposal,
  resolveProposalDomicile,
} from '../utils/imageProcessor';
import { DriveImage } from './DriveImage';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { QrScannerLookupModal } from './QrScannerLookupModal';
import { SwipeAction, SwipeableRow } from './SwipeableRow';

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
  canUpdate?: boolean;
  canDelete?: boolean;
  isLoading?: boolean;
  onBack?: () => void;
  onCreateNew: () => void;
  onSelectRecord: (record: KpmRecord) => void;
  onDeleteRecord: (id: string) => void;
  onBulkUpdateKpms?: (
    ids: string[],
    patch: {
      validasi?: ValidationStatus;
      dtsen?: string;
      item?: string;
      markAllSubItems?: boolean;
    }
  ) => Promise<void> | void;
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
  canUpdate = true,
  canDelete = true,
  isLoading = false,
  onSelectRecord,
  onDeleteRecord,
  onBulkUpdateKpms,
}: KpmListViewProps) {
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
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSheet, setBulkSheet] = useState<'none' | 'dtsen' | 'item'>('none');
  const [bulkProcessing, setBulkProcessing] = useState(false);

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

  const isRecordProposalLocked = (rec: KpmRecord) => {
    const match =
      proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
      proposals.find((p) => p.namaProposal === rec.proposal);
    return match?.status === 'locked';
  };

  const getRecordKelurahan = (rec: KpmRecord) => {
    if (rec.kelurahan?.trim()) return rec.kelurahan.trim();
    return resolveProposalDomicile(rec.proposal, proposals, rec.tahun, wilayahList).kelurahan || '';
  };

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
    (itemFilter !== 'all' ? 1 : 0) +
    (kelurahanFilter !== 'all' ? 1 : 0) +
    (rtRwFilter !== 'all' ? 1 : 0) +
    (pengelolaFilter !== 'all' ? 1 : 0) +
    (pekerjaanFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'absen' ? 1 : 0);

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

  const toggleSelectRecord = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAllUnlocked = () => {
    if (
      unlockedFilteredIds.length > 0 &&
      unlockedFilteredIds.every((id) => selectedIds.includes(id))
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unlockedFilteredIds);
    }
  };

  const runBulkPatch = async (patch: {
    validasi?: ValidationStatus;
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

  const handleResetExtraFilters = () => {
    onChangeItemFilter('all');
    setSortBy('absen');
    setKelurahanFilter('all');
    setRtRwFilter('all');
    setPengelolaFilter('all');
    setPekerjaanFilter('all');
  };

  return (
    <div className="min-h-screen pb-28">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <h1 className="truncate text-base font-bold text-slate-900">
          Keluarga Penerima Manfaat (KPM)
        </h1>
        {canUpdate && onBulkUpdateKpms && (
          <button
            type="button"
            onClick={() => {
              setBulkMode((prev) => {
                if (prev) {
                  setSelectedIds([]);
                  setBulkSheet('none');
                }
                return !prev;
              });
            }}
            className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
              bulkMode
                ? 'border-teal-700 bg-teal-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>{bulkMode ? 'Selesai' : 'Pilih Banyak'}</span>
          </button>
        )}
      </header>

      <div className="space-y-4 px-4 pt-4">
        {proposalFilter !== 'all' && onChangeProposalFilter && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs text-teal-900">
            <span className="truncate font-semibold">Proposal: {proposalFilter}</span>
            <button
              type="button"
              onClick={() => onChangeProposalFilter('all')}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
            >
              <X className="h-3 w-3" />
              <span>Reset</span>
            </button>
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
                placeholder="Cari nama, NIK, wilayah..."
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
              onClick={() => setIsQrModalOpen(true)}
              aria-label="Scan QR atau cari 4 digit NIK"
              title="Scan QR / 4 Digit NIK"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
            >
              <QrCode className="h-4 w-4" />
            </button>

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
            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
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
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5">
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
                {unlockedFilteredIds.every((id) => selectedIds.includes(id))
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
        ) : filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada data calon KPM ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter pencarian, atau daftarkan calon KPM lewat tombol + di bawah.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredRecords.slice(0, visibleLimit).map((rec) => {
              const thumb = getPrimaryKpmPhoto(rec.documents);
              const locked = isRecordProposalLocked(rec);
              const absenSeq = getAbsenSeq(rec.registerCode);
              const absenLabel =
                absenSeq < 999999 ? String(absenSeq).padStart(2, '0') : '--';
              const desilNumeric = rec.dtsen && /^\d/.test(rec.dtsen.trim())
                ? rec.dtsen.trim().replace(/\s*-\s*/g, '-')
                : '';
              const kelurahanName = isKecamatanProposal(rec.proposal)
                ? getCompactKelurahan(getRecordKelurahan(rec))
                : '';
              const metaLine = [kelurahanName, rec.pengelola?.trim()]
                .filter(Boolean)
                .join(' · ');

              const swipeActions: SwipeAction[] = locked
                ? [
                    {
                      key: 'locked',
                      label: 'Terkunci',
                      icon: <Lock className="h-4 w-4" />,
                      tone: 'locked',
                      onClick: () => setLockedNoticeRecord(rec),
                    },
                  ]
                : canDelete
                  ? [
                      {
                        key: 'delete',
                        label: 'Hapus',
                        icon: <Trash2 className="h-4 w-4" />,
                        tone: 'danger',
                        onClick: () => setPendingDeleteRecord(rec),
                      },
                    ]
                  : [];

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
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-teal-50/70'
                        : 'hover:bg-slate-50 active:bg-slate-100/70'
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
                    ) : (
                      <div className="flex w-5 shrink-0 items-center justify-center">
                        <span className="font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                          {absenLabel}
                        </span>
                      </div>
                    )}

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

                      {/* Baris 2: Proposal & Tahun */}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] leading-tight">
                        <span className="truncate font-medium text-slate-600">
                          {rec.proposal}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-400 tabular-nums">
                          {rec.tahun}
                        </span>
                      </div>

                      {/* Baris 3: Kelurahan / Pengelola */}
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
                        {metaLine || (rec.nikKtp ? `NIK ···${rec.nikKtp.slice(-4)}` : '-')}
                      </p>
                    </div>
                  </button>
                </SwipeableRow>
              );
            })}
            {filteredRecords.length > visibleLimit && (
              <div className="bg-slate-50/70 p-3">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 40)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50"
                >
                  Muat Lebih Banyak ({filteredRecords.length - visibleLimit} tersisa)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDeleteRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setPendingDeleteRecord(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus KPM"
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
                <h2 className="text-base font-bold text-slate-900">Hapus Calon KPM?</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Apakah Anda yakin ingin menghapus data calon KPM{' '}
                  <strong>&ldquo;{pendingDeleteRecord.nama}&rdquo;</strong> (
                  {pendingDeleteRecord.registerCode})?
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  Tindakan ini akan menghapus data KPM beserta dokumen foto terkait secara
                  permanen.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPendingDeleteRecord(null)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDeleteRecord.id;
                  setPendingDeleteRecord(null);
                  onDeleteRecord(id);
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

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
                  Calon KPM <strong>&ldquo;{lockedNoticeRecord.nama}&rdquo;</strong> berada di
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
        <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl">
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
              onClick={() => void runBulkPatch({ validasi: 'accepted' })}
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

      {/* QR Code & 4-Digit NIK Fast Lookup Modal */}
      <QrScannerLookupModal
        isOpen={isQrModalOpen}
        records={records}
        onClose={() => setIsQrModalOpen(false)}
        onSelectRecord={onSelectRecord}
      />
    </div>
  );
}
