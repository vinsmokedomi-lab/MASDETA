import { useEffect, useMemo, useState } from 'react';
import { Check, FolderOpen, MapPin, Search, X } from 'lucide-react';
import { INITIAL_WILAYAH_LIST, TAHUN_OPTIONS } from '../data/kpmOptions';
import { KpmRecord, ProposalRecord, WilayahKabKota } from '../types/kpm';
import {
  isLegacyDummyProposal,
  resolveProposalKecamatanCategory,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from '../utils/imageProcessor';
import { FilterSelect } from './FormControls';

interface ProposalPickerModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  proposals: ProposalRecord[];
  records: KpmRecord[];
  wilayahList?: WilayahKabKota[];
  initialYear?: string;
  onClose: () => void;
  onSelectProposal: (proposal: ProposalRecord) => void;
}

export function ProposalPickerModal({
  isOpen,
  title = 'Pilih Proposal Tujuan',
  subtitle = 'Pilih proposal aktif (Murni / Perubahan) untuk menampung KPM berstatus Diterima.',
  confirmLabel = 'Masukkan ke Proposal',
  proposals,
  records,
  wilayahList = INITIAL_WILAYAH_LIST,
  initialYear = 'all',
  onClose,
  onSelectProposal,
}: ProposalPickerModalProps) {
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>(initialYear || 'all');
  const [selectedId, setSelectedId] = useState<string>('');

  const activeUnlockedProposals = useMemo(
    () =>
      proposals.filter(
        (p) => !isLegacyDummyProposal(p) && p.status !== 'locked'
      ),
    [proposals]
  );

  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    activeUnlockedProposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [activeUnlockedProposals]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedId('');
    if (
      initialYear &&
      initialYear !== 'all' &&
      activeUnlockedProposals.some((p) => p.tahun === initialYear)
    ) {
      setYearFilter(initialYear);
    } else {
      setYearFilter('all');
    }
  }, [isOpen, initialYear, activeUnlockedProposals]);

  const acceptedCountByProposalId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (r.validasi !== 'accepted') continue;
      if (r.proposalId) {
        map.set(r.proposalId, (map.get(r.proposalId) || 0) + 1);
      } else if (r.proposal) {
        const key = `${r.tahun}::${r.proposal}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [records]);

  const filteredProposals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeUnlockedProposals.filter((prop) => {
      if (yearFilter !== 'all' && prop.tahun !== yearFilter) return false;
      if (!q) return true;
      const kecCat = resolveProposalKecamatanCategory(
        prop.namaProposal,
        proposals,
        prop.tahun,
        wilayahList
      ).toLowerCase();
      return (
        prop.namaProposal.toLowerCase().includes(q) ||
        prop.tipe.toLowerCase().includes(q) ||
        prop.tahun.toLowerCase().includes(q) ||
        kecCat.includes(q) ||
        (prop.kecamatan && prop.kecamatan.toLowerCase().includes(q)) ||
        (prop.kelurahan && prop.kelurahan.toLowerCase().includes(q))
      );
    });
  }, [activeUnlockedProposals, yearFilter, query, proposals, wilayahList]);

  const groupedProposals = useMemo(() => {
    const groups = new Map<string, ProposalRecord[]>();
    for (const prop of filteredProposals) {
      const cat = resolveProposalKecamatanCategory(
        prop.namaProposal,
        proposals,
        prop.tahun,
        wilayahList
      );
      const list = groups.get(cat) ?? [];
      list.push(prop);
      groups.set(cat, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => sortKecamatanCategoryNames(a, b))
      .map(([kecamatan, items]) => ({
        kecamatan,
        items: sortProposalsWithinKecamatan(items, (p) => p.namaProposal),
      }));
  }, [filteredProposals, proposals, wilayahList]);

  const selectedProposal = useMemo(
    () => activeUnlockedProposals.find((p) => p.id === selectedId) || null,
    [activeUnlockedProposals, selectedId]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal pilih proposal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Year Filter */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama proposal atau wilayah..."
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
          <FilterSelect
            ariaLabel="Filter tahun proposal tujuan"
            value={yearFilter}
            onChange={setYearFilter}
            className="w-[104px] shrink-0"
          >
            <option value="all">Semua</option>
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </FilterSelect>
        </div>

        {/* Proposal List */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {groupedProposals.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900">
                Tidak ada proposal aktif tersedia
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Pastikan ada proposal bertipe Murni atau Perubahan dengan status Terbuka.
              </p>
            </div>
          ) : (
            groupedProposals.map((group) => (
              <div key={group.kecamatan} className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  <MapPin className="h-3.5 w-3.5 text-teal-700" />
                  <span>{group.kecamatan}</span>
                </div>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {group.items.map((prop) => {
                    const isSelected = selectedId === prop.id;
                    const count =
                      acceptedCountByProposalId.get(prop.id) ??
                      acceptedCountByProposalId.get(`${prop.tahun}::${prop.namaProposal}`) ??
                      0;
                    const quota = prop.jumlahKpm ?? 66;
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => setSelectedId(prop.id)}
                        className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                          isSelected ? 'bg-teal-50/90' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            isSelected
                              ? 'border-teal-700 bg-teal-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {prop.namaProposal}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                            {prop.tipe} · {prop.tahun} · Terisi {count}/{quota} KPM
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-2.5 border-t border-slate-100 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selectedProposal}
            onClick={() => {
              if (!selectedProposal) return;
              onSelectProposal(selectedProposal);
            }}
            className="inline-flex min-h-[44px] flex-[1.5] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            <Check className="h-4 w-4" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
