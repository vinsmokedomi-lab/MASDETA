import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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
  resolveProposalKecamatanCategory,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from '../utils/imageProcessor';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { SwipeAction, SwipeableRow } from './SwipeableRow';

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
  onToggleProposalLock,
  onBulkSetProposalLock,
  onDeleteProposal,
}: ProposalListViewProps) {
  const [query, setQuery] = useState('');
  const [tipeFilter, setTipeFilter] = useState<'all' | ProposalTipe>('all');
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

  const filteredProposals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return yearScopedProposals.filter((prop) => {
      if (tipeFilter !== 'all' && prop.tipe !== tipeFilter) return false;
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
  }, [yearScopedProposals, tipeFilter, query, proposals, wilayahList]);

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
      .map(([kecamatan, items]) => ({
        kecamatan,
        proposals: sortProposalsWithinKecamatan(items, (item) => item.namaProposal),
      }));
  }, [filteredProposals, proposals, wilayahList]);

  const isSearching = query.trim().length > 0;

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
    const keySet = new Set(list.map((p) => `${p.tahun}::${p.namaProposal}`));
    return records.filter((r) => keySet.has(`${r.tahun}::${r.proposal}`)).length;
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <h1 className="truncate text-base font-bold text-slate-900">Daftar Proposal</h1>
        {canUpdate && onBulkSetProposalLock && proposals.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpenSwipeId(null);
              setSettingsScope(selectedYear === 'all' ? 'all' : 'current');
              setIsSettingsOpen(true);
            }}
            aria-label="Pengaturan Kunci Proposal"
            title="Pengaturan Proposal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.97]"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        )}
      </header>

      <div className="space-y-4 px-4 pt-4">
        {/* Search + Tahun, lalu tab Tipe */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari proposal, kecamatan, atau kelurahan..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>
            <FilterSelect
              ariaLabel="Filter tahun proposal"
              value={selectedYear}
              onChange={onChangeYear}
              className="w-[88px] shrink-0"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">Semua</option>
            </FilterSelect>
          </div>

          <SegmentedTabs<'all' | ProposalTipe>
            value={tipeFilter}
            onChange={setTipeFilter}
            tabs={(['all', ...PROPOSAL_TIPE_OPTIONS] as ('all' | ProposalTipe)[]).map((tipe) => ({
              key: tipe,
              label: tipe === 'all' ? 'Semua' : tipe,
            }))}
          />
        </div>

        {/* Proposal List Categorized by Kecamatan */}
        {filteredProposals.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada proposal ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter tahun / tipe, atau tambahkan proposal baru.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {groupedByKecamatan.map((group) => {
              const isCollapsed = !isSearching && Boolean(collapsedKecamatans[group.kecamatan]);
              return (
                <section key={group.kecamatan} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedKecamatans((prev) => ({
                        ...prev,
                        [group.kecamatan]: !prev[group.kecamatan],
                      }))
                    }
                    aria-expanded={!isCollapsed}
                    className="flex min-h-[36px] w-full items-center justify-between gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-slate-100/80"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <h2 className="truncate text-xs font-bold tracking-wide text-slate-800">
                        {group.kecamatan}
                      </h2>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                        {group.proposals.length} Proposal
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
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                      {group.proposals.map((prop) => {
                        const matchingRecords = records.filter(
                          (r) =>
                            r.proposal === prop.namaProposal &&
                            (selectedYear === 'all' ? r.tahun === prop.tahun : r.tahun === selectedYear)
                        );
                        const isLocked = prop.status === 'locked';

                        const swipeActions: SwipeAction[] = [];
                        if (canUpdate) {
                          swipeActions.push({
                            key: 'lock',
                            label: isLocked ? 'Buka' : 'Kunci',
                            icon: isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                            tone: isLocked ? 'amber' : 'neutral',
                            onClick: () =>
                              setPendingAction({
                                type: 'lock',
                                proposal: prop,
                                kpmCount: matchingRecords.length,
                              }),
                          });
                        }
                        if (canDelete) {
                          swipeActions.push({
                            key: 'delete',
                            label: 'Hapus',
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: 'danger',
                            onClick: () =>
                              setPendingAction({
                                type: 'delete',
                                proposal: prop,
                                kpmCount: matchingRecords.length,
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
                            <button
                              type="button"
                              onClick={() => onOpenProposalDetail(prop.id)}
                              className="flex min-h-[66px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {prop.namaProposal}
                                </p>
                                <div className="mt-0.5 flex items-center text-xs text-slate-500 tabular-nums">
                                  <span className="truncate">
                                    {matchingRecords.length}/{prop.jumlahKpm ?? 66} · {prop.tipe} ·{' '}
                                    {prop.tahun}
                                  </span>
                                  <span
                                    className={`ml-1.5 inline-flex shrink-0 items-center ${
                                      isLocked ? 'text-rose-600' : 'text-slate-400'
                                    }`}
                                    title={isLocked ? 'Proposal Terkunci' : 'Proposal Terbuka'}
                                  >
                                    {isLocked ? (
                                      <Lock className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                </div>
                                <p
                                  className={`mt-0.5 text-xs font-medium ${
                                    prop.checklist.dinas ? 'text-teal-700' : 'text-slate-400'
                                  }`}
                                >
                                  {prop.checklist.dinas
                                    ? 'Sudah diantar ke Dinas'
                                    : 'Belum diantar ke Dinas'}
                                </p>
                              </div>

                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                            </button>
                          </SwipeableRow>
                        );
                      })}
                    </div>
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
                    onClick={() => {
                      const id = pendingAction.proposal.id;
                      setPendingAction(null);
                      onToggleProposalLock(id);
                    }}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white ${
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
                    onClick={() => {
                      const id = pendingAction.proposal.id;
                      setPendingAction(null);
                      onDeleteProposal(id);
                    }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
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
                onClick={() => {
                  const ids = pendingBulkAction.targetProposals.map((p) => p.id);
                  const nextStatus = pendingBulkAction.nextStatus;
                  setPendingBulkAction(null);
                  onBulkSetProposalLock?.(ids, nextStatus);
                }}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white ${
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
