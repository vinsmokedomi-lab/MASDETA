import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Images,
  Lock,
  MapPin,
  Search,
  Settings,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST, PROPOSAL_TIPE_OPTIONS, TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  KpmRecord,
  ProposalLockStatus,
  ProposalRecord,
  ProposalTipe,
  WilayahKabKota,
} from '../types/kpm';
import {
  hasRenderableMedia,
  resolveProposalKecamatanCategory,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from '../utils/imageProcessor';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { SwipeAction, SwipeableRow } from './SwipeableRow';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface ProposalListViewProps {
  proposals: ProposalRecord[];
  records: KpmRecord[];
  wilayahList?: WilayahKabKota[];
  yearOptions?: string[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  canUpdate?: boolean;
  canDelete?: boolean;
  onOpenProposalDetail: (proposalId: string) => void;
  onOpenPhotoGallery?: (proposalId?: string) => void;
  onToggleProposalLock: (proposalId: string) => void;
  onBulkSetProposalLock?: (proposalIds: string[], nextStatus: ProposalLockStatus) => void;
  onDeleteProposal: (proposalId: string) => void;
}

export function ProposalListView({
  proposals,
  records,
  wilayahList = INITIAL_WILAYAH_LIST,
  yearOptions: extraYearOptions,
  selectedYear,
  onChangeYear,
  canUpdate = true,
  canDelete = true,
  onOpenProposalDetail,
  onOpenPhotoGallery,
  onToggleProposalLock,
  onBulkSetProposalLock,
  onDeleteProposal,
}: ProposalListViewProps) {
  const { isOffline } = useOfflineStatus();
  const [query, setQuery] = useState('');
  const [tipeFilter, setTipeFilter] = useState<'all' | ProposalTipe>('all');
  const [dinasFilter, setDinasFilter] = useState<'all' | 'sent' | 'unsent'>('all');
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [collapsedKecamatans, setCollapsedKecamatans] = useState<Record<string, boolean>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsScope, setSettingsScope] = useState<'current' | 'all'>(
    selectedYear === 'all' ? 'all' : 'current'
  );
  const [pendingAction, setPendingAction] = useState<{
    type: 'lock' | 'delete';
    proposal: ProposalRecord;
    kpmCount: number;
  } | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<{
    nextStatus: ProposalLockStatus;
    targetProposals: ProposalRecord[];
    scopeLabel: string;
    affectedKpmCount: number;
  } | null>(null);

  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    (extraYearOptions || []).forEach((y) => {
      if (y) set.add(y);
    });
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [extraYearOptions, proposals]);

  const yearScopedProposals = useMemo(() => {
    if (selectedYear === 'all') return proposals;
    return proposals.filter((p) => p.tahun === selectedYear);
  }, [proposals, selectedYear]);

  const isKpmInProposal = (r: KpmRecord, prop: ProposalRecord, matchSelectedYear = false) =>
    r.validasi === 'accepted' &&
    (r.proposalId
      ? r.proposalId === prop.id
      : r.proposal === prop.namaProposal &&
        (matchSelectedYear && selectedYear !== 'all'
          ? r.tahun === selectedYear
          : r.tahun === prop.tahun));

  // Precompute KPM & Foto Penerima counts per proposal
  const proposalStatsById = useMemo(() => {
    const map = new Map<string, { kpmCount: number; penerimaPhotoCount: number }>();
    for (const prop of yearScopedProposals) {
      let kpmCount = 0;
      let penerimaPhotoCount = 0;
      for (const r of records) {
        if (isKpmInProposal(r, prop, true)) {
          kpmCount += 1;
          if (hasRenderableMedia(r.documents.penerima)) {
            penerimaPhotoCount += 1;
          }
        }
      }
      map.set(prop.id, { kpmCount, penerimaPhotoCount });
    }
    return map;
  }, [yearScopedProposals, records, selectedYear]);

  const filteredProposals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return yearScopedProposals.filter((prop) => {
      if (tipeFilter !== 'all' && prop.tipe !== tipeFilter) return false;
      if (dinasFilter === 'sent' && !prop.checklist.dinas) return false;
      if (dinasFilter === 'unsent' && prop.checklist.dinas) return false;
      if (!q) return true;
      const resolvedKec = resolveProposalKecamatanCategory(
        prop.namaProposal,
        proposals,
        prop.tahun,
        wilayahList
      ).toLowerCase();
      return (
        prop.namaProposal.toLowerCase().includes(q) ||
        prop.tipe.toLowerCase().includes(q) ||
        resolvedKec.includes(q) ||
        (prop.kecamatan && prop.kecamatan.toLowerCase().includes(q)) ||
        (prop.kelurahan && prop.kelurahan.toLowerCase().includes(q))
      );
    });
  }, [yearScopedProposals, tipeFilter, dinasFilter, query, proposals, wilayahList]);

  const summaryStats = useMemo(() => {
    let totalKpm = 0;
    let totalQuota = 0;
    let totalPenerimaPhoto = 0;
    let sentDinas = 0;
    let lockedCount = 0;

    for (const prop of filteredProposals) {
      const st = proposalStatsById.get(prop.id) ?? { kpmCount: 0, penerimaPhotoCount: 0 };
      totalKpm += st.kpmCount;
      totalQuota += prop.jumlahKpm ?? 66;
      totalPenerimaPhoto += st.penerimaPhotoCount;
      if (prop.checklist.dinas) sentDinas += 1;
      if (prop.status === 'locked') lockedCount += 1;
    }

    return {
      totalProposals: filteredProposals.length,
      totalKpm,
      totalQuota,
      totalPenerimaPhoto,
      sentDinas,
      unsentDinas: Math.max(0, filteredProposals.length - sentDinas),
      lockedCount,
      unlockedCount: Math.max(0, filteredProposals.length - lockedCount),
    };
  }, [filteredProposals, proposalStatsById]);

  const groupedByKecamatan = useMemo(() => {
    const groups = new Map<string, ProposalRecord[]>();
    for (const prop of filteredProposals) {
      const category = resolveProposalKecamatanCategory(
        prop.namaProposal,
        proposals,
        prop.tahun,
        wilayahList
      );
      const list = groups.get(category);
      if (list) {
        list.push(prop);
      } else {
        groups.set(category, [prop]);
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => sortKecamatanCategoryNames(a, b))
      .map(([kecamatan, items]) => {
        const sortedItems = sortProposalsWithinKecamatan(items, (item) => item.namaProposal);
        let groupKpm = 0;
        let groupQuota = 0;
        for (const item of sortedItems) {
          groupKpm += proposalStatsById.get(item.id)?.kpmCount ?? 0;
          groupQuota += item.jumlahKpm ?? 66;
        }
        return {
          kecamatan,
          proposals: sortedItems,
          groupKpm,
          groupQuota,
        };
      });
  }, [filteredProposals, proposals, wilayahList, proposalStatsById]);

  const isSearching = query.trim().length > 0;
  const areAllCollapsed =
    groupedByKecamatan.length > 0 &&
    groupedByKecamatan.every((g) => Boolean(collapsedKecamatans[g.kecamatan]));

  const toggleAllKecamatans = () => {
    if (areAllCollapsed) {
      setCollapsedKecamatans({});
    } else {
      const next: Record<string, boolean> = {};
      groupedByKecamatan.forEach((g) => {
        next[g.kecamatan] = true;
      });
      setCollapsedKecamatans(next);
    }
  };

  const activeSettingsProposals = useMemo(() => {
    if (selectedYear === 'all' || settingsScope === 'all') return proposals;
    return yearScopedProposals;
  }, [proposals, yearScopedProposals, selectedYear, settingsScope]);

  const unlockedInScope = useMemo(
    () => activeSettingsProposals.filter((p) => p.status !== 'locked'),
    [activeSettingsProposals]
  );

  const lockedInScope = useMemo(
    () => activeSettingsProposals.filter((p) => p.status === 'locked'),
    [activeSettingsProposals]
  );

  const countKpmsInProposals = (list: ProposalRecord[]) => {
    const idSet = new Set(list.map((p) => p.id));
    const keySet = new Set(list.map((p) => `${p.tahun}::${p.namaProposal}`));
    return records.filter(
      (r) =>
        r.validasi === 'accepted' &&
        (r.proposalId ? idSet.has(r.proposalId) : keySet.has(`${r.tahun}::${r.proposal}`))
    ).length;
  };

  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;

  return (
    <div className={`min-h-screen pb-24 ${!isNativeApp ? 'md:pb-12' : ''}`}>
      {/* Sticky Header (Native APK only) */}
      {isNativeApp && (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-bold text-slate-900">Daftar Proposal</h1>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              · {filteredProposals.length}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenPhotoGallery && proposals.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenPhotoGallery(filteredProposals[0]?.id)}
                aria-label="Galeri Foto Pembagian"
                title="Galeri Foto Pembagian"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100"
              >
                <Images className="h-4 w-4" />
                <span>Foto</span>
              </button>
            )}
            {canUpdate && onBulkSetProposalLock && proposals.length > 0 && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => {
                  setOpenSwipeId(null);
                  setSettingsScope(selectedYear === 'all' ? 'all' : 'current');
                  setIsSettingsOpen(true);
                }}
                aria-label="Pengaturan Kunci Proposal"
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Pengaturan Proposal'}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Settings className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </header>
      )}

      <div
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
        }`}
      >
        {!isNativeApp && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Daftar Proposal
              </h1>
              <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                {filteredProposals.length} Proposal · {groupedByKecamatan.length} Kecamatan
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onOpenPhotoGallery && proposals.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenPhotoGallery(filteredProposals[0]?.id)}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/80 px-3.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 whitespace-nowrap"
                >
                  <Images className="h-4 w-4" />
                  <span>Galeri Foto Pembagian</span>
                </button>
              )}
              {canUpdate && onBulkSetProposalLock && proposals.length > 0 && (
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => {
                    setOpenSwipeId(null);
                    setSettingsScope(selectedYear === 'all' ? 'all' : 'current');
                    setIsSettingsOpen(true);
                  }}
                  aria-label="Pengaturan Kunci Proposal"
                  title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Pengaturan Proposal'}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap"
                >
                  <Settings className="h-4 w-4" />
                  <span>Pengaturan Proposal</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Clean Summary Strip */}
        <section className="grid grid-cols-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-4 md:divide-x md:divide-y-0">
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">Total Proposal</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
              {summaryStats.totalProposals}
              <span className="ml-1.5 text-xs font-medium text-slate-500">
                ({groupedByKecamatan.length} Kec.)
              </span>
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">Total KPM Terisi</p>
            <p className="mt-0.5 text-lg font-bold text-teal-700 tabular-nums">
              {summaryStats.totalKpm}{' '}
              <span className="text-xs font-medium text-slate-500">
                / {summaryStats.totalQuota}
              </span>
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">Pengantaran ke Dinas</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
              <span className="text-teal-700">{summaryStats.sentDinas} Sudah</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="text-amber-700">{summaryStats.unsentDinas} Belum</span>
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">Foto Penerima · Kunci</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
              <span>{summaryStats.totalPenerimaPhoto} Foto</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className={summaryStats.lockedCount > 0 ? 'text-rose-600' : 'text-slate-600'}>
                {summaryStats.lockedCount} Terkunci
              </span>
            </p>
          </div>
        </section>

        {/* Filter Toolbar */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari proposal, kelurahan, atau kecamatan..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white pr-9 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <FilterSelect
              ariaLabel="Filter status antar ke Dinas"
              value={dinasFilter}
              onChange={(val) => setDinasFilter(val as 'all' | 'sent' | 'unsent')}
              className="w-[155px] shrink-0"
            >
              <option value="all">Semua Dinas</option>
              <option value="unsent">Belum ke Dinas</option>
              <option value="sent">Sudah ke Dinas</option>
            </FilterSelect>

            <FilterSelect
              ariaLabel="Filter tahun proposal"
              value={selectedYear}
              onChange={onChangeYear}
              className="w-[96px] shrink-0"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">Semua</option>
            </FilterSelect>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <SegmentedTabs<'all' | ProposalTipe>
                value={tipeFilter}
                onChange={setTipeFilter}
                tabs={(['all', ...PROPOSAL_TIPE_OPTIONS] as ('all' | ProposalTipe)[]).map(
                  (tipe) => ({
                    key: tipe,
                    label: tipe === 'all' ? 'Semua' : tipe,
                  })
                )}
              />
            </div>

            {groupedByKecamatan.length > 1 && !isSearching && (
              <button
                type="button"
                onClick={toggleAllKecamatans}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <span>{areAllCollapsed ? 'Buka Semua Kec.' : 'Tutup Semua Kec.'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Proposal Directory Grouped by Kecamatan */}
        {filteredProposals.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada proposal ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter tahun, tipe, status Dinas, atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {groupedByKecamatan.map((group) => {
              const isCollapsed = !isSearching && Boolean(collapsedKecamatans[group.kecamatan]);
              const groupPct =
                group.groupQuota > 0
                  ? Math.min(100, Math.round((group.groupKpm / group.groupQuota) * 100))
                  : 0;

              return (
                <section
                  key={group.kecamatan}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  {/* Kecamatan Group Header */}
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedKecamatans((prev) => ({
                        ...prev,
                        [group.kecamatan]: !prev[group.kecamatan],
                      }))
                    }
                    aria-expanded={!isCollapsed}
                    className={`flex min-h-[46px] w-full items-center justify-between gap-3 bg-slate-50/80 px-4 py-2.5 text-left transition-colors hover:bg-slate-100/70 ${
                      !isCollapsed ? 'border-b border-slate-200/80' : ''
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-bold text-slate-900">
                          {group.kecamatan}
                        </h2>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 text-xs text-slate-600 tabular-nums">
                      <span className="font-semibold text-slate-700">
                        {group.proposals.length} Proposal
                      </span>
                      <span className="hidden text-slate-300 sm:inline">·</span>
                      <span className="hidden font-medium text-slate-600 sm:inline">
                        {group.groupKpm}/{group.groupQuota} KPM ({groupPct}%)
                      </span>
                      {!isSearching && (
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform ${
                            isCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                      )}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <>
                      {/* Desktop High-Density Scannable Directory Table */}
                      {!isNativeApp && (
                        <div className="hidden md:block">
                          <div className="grid grid-cols-[minmax(0,2.4fr)_130px_210px_175px_136px] items-center gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-2 text-[11px] font-semibold text-slate-500">
                            <span>Proposal / Lokasi</span>
                            <span>Tipe · Tahun</span>
                            <span>Kuota KPM</span>
                            <span>Status Dinas</span>
                            <span className="text-right">Aksi</span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {group.proposals.map((prop) => {
                              const st = proposalStatsById.get(prop.id) ?? {
                                kpmCount: 0,
                                penerimaPhotoCount: 0,
                              };
                              const isLocked = prop.status === 'locked';
                              const targetQuota = prop.jumlahKpm ?? 66;
                              const pctQuota =
                                targetQuota > 0
                                  ? Math.min(100, Math.round((st.kpmCount / targetQuota) * 100))
                                  : 0;
                              const isFull = st.kpmCount >= targetQuota && targetQuota > 0;

                              return (
                                <div
                                  key={`dt-prop-${prop.id}`}
                                  onClick={() => onOpenProposalDetail(prop.id)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      onOpenProposalDetail(prop.id);
                                    }
                                  }}
                                  className="group grid cursor-pointer grid-cols-[minmax(0,2.4fr)_130px_210px_175px_136px] items-center gap-3 px-4 py-3 transition-colors hover:bg-teal-50/40 focus:outline-none focus-visible:bg-teal-50/60"
                                >
                                  {/* Col 1: Nama Proposal + Inline Lock/Photo info */}
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                      <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-teal-800">
                                        {prop.namaProposal}
                                      </p>
                                      {isLocked && (
                                        <span
                                          className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                          title="Proposal Terkunci"
                                        >
                                          <Lock className="h-2.5 w-2.5" />
                                          <span>Terkunci</span>
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                                      {st.penerimaPhotoCount > 0
                                        ? `${st.penerimaPhotoCount}/${st.kpmCount} Foto Penerima`
                                        : 'Belum ada foto penerima'}
                                    </p>
                                  </div>

                                  {/* Col 2: Tipe · Tahun */}
                                  <div className="text-xs font-medium text-slate-600 tabular-nums whitespace-nowrap">
                                    {prop.tipe} · {prop.tahun}
                                  </div>

                                  {/* Col 3: Progres Kuota KPM */}
                                  <div className="flex items-center gap-2.5 pr-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          isFull ? 'bg-emerald-600' : 'bg-teal-700'
                                        }`}
                                        style={{ width: `${pctQuota}%` }}
                                      />
                                    </div>
                                    <span className="w-[74px] shrink-0 text-right text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                      {st.kpmCount}/{targetQuota}
                                    </span>
                                  </div>

                                  {/* Col 4: Status Dinas */}
                                  <div className="min-w-0">
                                    <span
                                      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                                        prop.checklist.dinas ? 'text-teal-700' : 'text-amber-700'
                                      }`}
                                    >
                                      {prop.checklist.dinas ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      ) : (
                                        <Clock className="h-3.5 w-3.5 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        {prop.checklist.dinas
                                          ? 'Sudah ke Dinas'
                                          : 'Belum ke Dinas'}
                                      </span>
                                    </span>
                                  </div>

                                  {/* Col 5: Quick Actions */}
                                  <div
                                    className="flex items-center justify-end gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {onOpenPhotoGallery && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenPhotoGallery(prop.id)}
                                        title={`Galeri Foto (${prop.namaProposal})`}
                                        aria-label={`Galeri Foto ${prop.namaProposal}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-teal-700 hover:bg-teal-50"
                                      >
                                        <Images className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {canUpdate && (
                                      <button
                                        type="button"
                                        disabled={isOffline}
                                        onClick={() =>
                                          setPendingAction({
                                            type: 'lock',
                                            proposal: prop,
                                            kpmCount: st.kpmCount,
                                          })
                                        }
                                        title={
                                          isOffline
                                            ? 'Mode Offline (Hanya Baca)'
                                            : isLocked
                                              ? 'Buka Kunci'
                                              : 'Kunci Proposal'
                                        }
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                      >
                                        {isLocked ? (
                                          <Unlock className="h-3.5 w-3.5" />
                                        ) : (
                                          <Lock className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        type="button"
                                        disabled={isOffline}
                                        onClick={() =>
                                          setPendingAction({
                                            type: 'delete',
                                            proposal: prop,
                                            kpmCount: st.kpmCount,
                                          })
                                        }
                                        title={
                                          isOffline ? 'Mode Offline (Hanya Baca)' : 'Hapus Proposal'
                                        }
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <ChevronRight className="ml-0.5 h-4 w-4 text-slate-300 group-hover:text-teal-700" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Mobile / Native Compact Directory Rows */}
                      <div className={`divide-y divide-slate-100 ${!isNativeApp ? 'md:hidden' : ''}`}>
                        {group.proposals.map((prop) => {
                          const st = proposalStatsById.get(prop.id) ?? {
                            kpmCount: 0,
                            penerimaPhotoCount: 0,
                          };
                          const isLocked = prop.status === 'locked';
                          const targetQuota = prop.jumlahKpm ?? 66;
                          const pctQuota =
                            targetQuota > 0
                              ? Math.min(100, Math.round((st.kpmCount / targetQuota) * 100))
                              : 0;

                          const swipeActions: SwipeAction[] = [];
                          if (canUpdate) {
                            swipeActions.push({
                              key: 'lock',
                              label: isLocked ? 'Buka' : 'Kunci',
                              icon: isLocked ? (
                                <Unlock className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              ),
                              tone: isLocked ? 'amber' : 'neutral',
                              disabled: isOffline,
                              onClick: () =>
                                setPendingAction({
                                  type: 'lock',
                                  proposal: prop,
                                  kpmCount: st.kpmCount,
                                }),
                            });
                          }
                          if (canDelete) {
                            swipeActions.push({
                              key: 'delete',
                              label: 'Hapus',
                              icon: <Trash2 className="h-4 w-4" />,
                              tone: 'danger',
                              disabled: isOffline,
                              onClick: () =>
                                setPendingAction({
                                  type: 'delete',
                                  proposal: prop,
                                  kpmCount: st.kpmCount,
                                }),
                            });
                          }

                          return (
                            <SwipeableRow
                              key={prop.id}
                              id={prop.id}
                              isOpen={openSwipeId === prop.id}
                              onOpen={setOpenSwipeId}
                              onClose={() => setOpenSwipeId(null)}
                              actions={swipeActions}
                            >
                              <div className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 active:bg-slate-100/70">
                                <button
                                  type="button"
                                  onClick={() => onOpenProposalDetail(prop.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {prop.namaProposal}
                                    </p>
                                    <span className="shrink-0 text-xs font-bold text-slate-900 tabular-nums">
                                      {st.kpmCount}/{targetQuota}
                                    </span>
                                  </div>

                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-teal-700"
                                      style={{ width: `${pctQuota}%` }}
                                    />
                                  </div>

                                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                                    <span className="truncate text-slate-500">
                                      {prop.tipe} · {prop.tahun}
                                      {st.penerimaPhotoCount > 0
                                        ? ` · ${st.penerimaPhotoCount} foto`
                                        : ''}
                                    </span>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      {isLocked && (
                                        <Lock className="h-3 w-3 text-rose-600" />
                                      )}
                                      <span
                                        className={`font-medium ${
                                          prop.checklist.dinas ? 'text-teal-700' : 'text-amber-700'
                                        }`}
                                      >
                                        {prop.checklist.dinas
                                          ? 'Sudah ke Dinas'
                                          : 'Belum ke Dinas'}
                                      </span>
                                    </div>
                                  </div>
                                </button>

                                {onOpenPhotoGallery && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenPhotoGallery(prop.id)}
                                    aria-label={`Galeri Foto ${prop.namaProposal}`}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-teal-700 hover:bg-teal-50"
                                  >
                                    <Images className="h-4 w-4" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onOpenProposalDetail(prop.id)}
                                  aria-label={`Buka ${prop.namaProposal}`}
                                  className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-slate-400"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                            </SwipeableRow>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Lock/Unlock or Delete */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setPendingAction(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Aksi Proposal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

            {pendingAction.type === 'lock' ? (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      pendingAction.proposal.status === 'locked'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {pendingAction.proposal.status === 'locked' ? (
                      <Unlock className="h-5 w-5" />
                    ) : (
                      <Lock className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">
                      {pendingAction.proposal.status === 'locked'
                        ? 'Buka Kunci Proposal?'
                        : 'Kunci Proposal?'}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Apakah Anda yakin ingin{' '}
                      {pendingAction.proposal.status === 'locked' ? 'membuka kunci' : 'mengunci'}{' '}
                      proposal <strong>&ldquo;{pendingAction.proposal.namaProposal}&rdquo;</strong> (
                      {pendingAction.proposal.tahun})?
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      {pendingAction.proposal.status === 'locked'
                        ? 'Setelah dibuka, data proposal dan seluruh KPM di dalamnya dapat diubah atau dihapus kembali.'
                        : `Saat dikunci, seluruh data proposal dan ${pendingAction.kpmCount} KPM di dalamnya ikut terkunci dan tidak dapat diubah atau dihapus.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() => {
                      const id = pendingAction.proposal.id;
                      setPendingAction(null);
                      onToggleProposalLock(id);
                    }}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                      pendingAction.proposal.status === 'locked'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    {pendingAction.proposal.status === 'locked' ? 'Ya, Buka Kunci' : 'Ya, Kunci'}
                  </button>
                </div>
              </>
            ) : pendingAction.proposal.status === 'locked' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">Proposal Sedang Terkunci</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Proposal <strong>&ldquo;{pendingAction.proposal.namaProposal}&rdquo;</strong>{' '}
                      sedang berstatus Terkunci sehingga tidak dapat dihapus. Buka kunci proposal
                      terlebih dahulu untuk menghapusnya.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Mengerti
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">Hapus Proposal?</h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Apakah Anda yakin ingin menghapus proposal{' '}
                      <strong>&ldquo;{pendingAction.proposal.namaProposal}&rdquo;</strong> (
                      {pendingAction.proposal.tahun})?
                    </p>
                    {pendingAction.kpmCount > 0 && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                        Terdapat {pendingAction.kpmCount} data KPM pada proposal ini. Data KPM tetap
                        tersimpan dan tidak ikut terhapus.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() => {
                      const id = pendingAction.proposal.id;
                      setPendingAction(null);
                      onDeleteProposal(id);
                    }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Ya, Hapus
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Proposal Settings Modal (Kunci / Buka Semua Proposal) */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setIsSettingsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Pengaturan Proposal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">Pengaturan Proposal</h2>
                  <p className="text-xs text-slate-500">
                    Kunci atau buka semua proposal sekaligus
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Tutup pengaturan"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {selectedYear !== 'all' && proposals.length !== yearScopedProposals.length && (
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setSettingsScope('current')}
                  className={`min-h-[38px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    settingsScope === 'current'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tahun {selectedYear} ({yearScopedProposals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsScope('all')}
                  className={`min-h-[38px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    settingsScope === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Tahun ({proposals.length})
                </button>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <span className="font-medium text-slate-600">
                {selectedYear === 'all' || settingsScope === 'all'
                  ? 'Semua Tahun'
                  : `Tahun ${selectedYear}`}
              </span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                  <Lock className="h-3.5 w-3.5" />
                  {lockedInScope.length} Terkunci
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                  <Unlock className="h-3.5 w-3.5" />
                  {unlockedInScope.length} Terbuka
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={unlockedInScope.length === 0}
                onClick={() => {
                  const scopeLabel =
                    selectedYear === 'all' || settingsScope === 'all'
                      ? 'semua tahun'
                      : `tahun ${selectedYear}`;
                  setIsSettingsOpen(false);
                  setPendingBulkAction({
                    nextStatus: 'locked',
                    targetProposals: unlockedInScope,
                    scopeLabel,
                    affectedKpmCount: countKpmsInProposals(unlockedInScope),
                  });
                }}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Lock className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">Kunci Semua Proposal</p>
                  <p className="text-[11px] text-slate-500">
                    {unlockedInScope.length > 0
                      ? `${unlockedInScope.length} proposal terbuka akan dikunci`
                      : 'Semua proposal pada cakupan ini sudah terkunci'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                disabled={lockedInScope.length === 0}
                onClick={() => {
                  const scopeLabel =
                    selectedYear === 'all' || settingsScope === 'all'
                      ? 'semua tahun'
                      : `tahun ${selectedYear}`;
                  setIsSettingsOpen(false);
                  setPendingBulkAction({
                    nextStatus: 'unlocked',
                    targetProposals: lockedInScope,
                    scopeLabel,
                    affectedKpmCount: countKpmsInProposals(lockedInScope),
                  });
                }}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Unlock className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">Buka Semua Proposal</p>
                  <p className="text-[11px] text-slate-500">
                    {lockedInScope.length > 0
                      ? `${lockedInScope.length} proposal terkunci akan dibuka`
                      : 'Tidak ada proposal terkunci pada cakupan ini'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Lock / Unlock All Proposals */}
      {pendingBulkAction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setPendingBulkAction(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Kunci atau Buka Semua Proposal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  pendingBulkAction.nextStatus === 'locked'
                    ? 'bg-slate-100 text-slate-800'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {pendingBulkAction.nextStatus === 'locked' ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <Unlock className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  {pendingBulkAction.nextStatus === 'locked'
                    ? 'Kunci Semua Proposal?'
                    : 'Buka Semua Proposal?'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Apakah Anda yakin ingin{' '}
                  {pendingBulkAction.nextStatus === 'locked' ? 'mengunci' : 'membuka kunci'}{' '}
                  <strong>{pendingBulkAction.targetProposals.length} proposal</strong> pada{' '}
                  <strong>{pendingBulkAction.scopeLabel}</strong>?
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {pendingBulkAction.nextStatus === 'locked'
                    ? `Seluruh data pada ${pendingBulkAction.targetProposals.length} proposal tersebut dan ${pendingBulkAction.affectedKpmCount} KPM di dalamnya akan ikut terkunci.`
                    : `Setelah dibuka, seluruh data pada ${pendingBulkAction.targetProposals.length} proposal tersebut dan ${pendingBulkAction.affectedKpmCount} KPM di dalamnya dapat diubah kembali.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPendingBulkAction(null)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isOffline}
                onClick={() => {
                  const ids = pendingBulkAction.targetProposals.map((p) => p.id);
                  const nextStatus = pendingBulkAction.nextStatus;
                  setPendingBulkAction(null);
                  onBulkSetProposalLock?.(ids, nextStatus);
                }}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  pendingBulkAction.nextStatus === 'locked'
                    ? 'bg-slate-900 hover:bg-slate-800'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {pendingBulkAction.nextStatus === 'locked' ? 'Ya, Kunci Semua' : 'Ya, Buka Semua'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
