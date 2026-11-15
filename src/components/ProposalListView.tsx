import { useMemo, useState } from 'react';
import { ChevronRight, Lock, Search, Unlock } from 'lucide-react';
import { PROPOSAL_TIPE_OPTIONS, TAHUN_OPTIONS } from '../data/kpmOptions';
import { KpmRecord, ProposalRecord, ProposalTipe } from '../types/kpm';
import { FilterSelect, SegmentedTabs } from './FormControls';

interface ProposalListViewProps {
  proposals: ProposalRecord[];
  records: KpmRecord[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  onOpenProposalDetail: (proposalId: string) => void;
}

export function ProposalListView({
  proposals,
  records,
  selectedYear,
  onChangeYear,
  onOpenProposalDetail,
}: ProposalListViewProps) {
  const [query, setQuery] = useState('');
  const [tipeFilter, setTipeFilter] = useState<'all' | ProposalTipe>('all');

  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [proposals]);

  const yearScopedProposals = useMemo(() => {
    if (selectedYear === 'all') return proposals;
    return proposals.filter((p) => p.tahun === selectedYear);
  }, [proposals, selectedYear]);

  const filteredProposals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return yearScopedProposals.filter((prop) => {
      if (tipeFilter !== 'all' && prop.tipe !== tipeFilter) return false;
      if (!q) return true;
      return (
        prop.namaProposal.toLowerCase().includes(q) ||
        prop.tipe.toLowerCase().includes(q) ||
        (prop.kecamatan && prop.kecamatan.toLowerCase().includes(q)) ||
        (prop.kelurahan && prop.kelurahan.toLowerCase().includes(q))
      );
    });
  }, [yearScopedProposals, tipeFilter, query]);

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header: hanya judul, tanpa dropdown / tombol aksi */}
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <h1 className="truncate text-base font-bold text-slate-900">Daftar Proposal</h1>
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
                placeholder="Cari proposal atau wilayah..."
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

        {/* Proposal List */}
        {filteredProposals.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada proposal ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter tahun / tipe, atau tambahkan proposal baru.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredProposals.map((prop) => {
              const matchingRecords = records.filter(
                (r) =>
                  r.proposal === prop.namaProposal &&
                  (selectedYear === 'all' ? r.tahun === prop.tahun : r.tahun === selectedYear)
              );

              return (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => onOpenProposalDetail(prop.id)}
                  className="flex min-h-[66px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      prop.status === 'locked'
                        ? 'bg-slate-900 text-white'
                        : 'bg-teal-50 text-teal-800'
                    }`}
                  >
                    {prop.status === 'locked' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{prop.namaProposal}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {matchingRecords.length}/{prop.jumlahKpm ?? 66} · {prop.tipe} · {prop.tahun}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-medium ${
                        prop.checklist.dinas ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {prop.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
