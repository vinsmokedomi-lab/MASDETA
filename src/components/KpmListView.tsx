import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Lock, Search, User, X } from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ValidationStatus,
} from '../types/kpm';
import { getItemsForYear } from '../utils/imageProcessor';
import { FilterSelect, SegmentedTabs } from './FormControls';

interface KpmListViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  statusFilter: 'all' | ValidationStatus;
  onChangeStatusFilter: (status: 'all' | ValidationStatus) => void;
  itemFilter: string;
  onChangeItemFilter: (item: string) => void;
  proposalFilter?: string;
  onChangeProposalFilter?: (proposal: string) => void;
  onBack?: () => void;
  onCreateNew: () => void;
  onSelectRecord: (record: KpmRecord) => void;
}

export function KpmListView({
  records,
  proposals,
  items,
  selectedYear,
  onChangeYear,
  statusFilter,
  onChangeStatusFilter,
  itemFilter,
  onChangeItemFilter,
  proposalFilter = 'all',
  onChangeProposalFilter,
  onBack,
  onCreateNew,
  onSelectRecord,
}: KpmListViewProps) {
  const [query, setQuery] = useState('');

  const isRecordProposalLocked = (rec: KpmRecord) => {
    const match =
      proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
      proposals.find((p) => p.namaProposal === rec.proposal);
    return match?.status === 'locked';
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

  const yearAndItemScopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedYear !== 'all' && rec.tahun !== selectedYear) return false;
      if (itemFilter !== 'all' && rec.item !== itemFilter) return false;
      if (proposalFilter !== 'all' && rec.proposal !== proposalFilter) return false;
      return true;
    });
  }, [records, selectedYear, itemFilter, proposalFilter]);

  const counts = useMemo(() => {
    return {
      all: yearAndItemScopedRecords.length,
      accepted: yearAndItemScopedRecords.filter((r) => r.validasi === 'accepted').length,
      pending: yearAndItemScopedRecords.filter((r) => r.validasi === 'pending').length,
      rejected: yearAndItemScopedRecords.filter((r) => r.validasi === 'rejected').length,
    };
  }, [yearAndItemScopedRecords]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return yearAndItemScopedRecords.filter((rec) => {
      if (statusFilter !== 'all' && rec.validasi !== statusFilter) return false;
      if (!q) return true;
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.proposal.toLowerCase().includes(q) ||
        (rec.kelurahan && rec.kelurahan.toLowerCase().includes(q)) ||
        rec.registerCode.toLowerCase().includes(q) ||
        rec.nikKtp.includes(q) ||
        rec.nikKk.includes(q) ||
        rec.pengelola.toLowerCase().includes(q)
      );
    });
  }, [yearAndItemScopedRecords, query, statusFilter]);

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header: hanya judul (+ panah kembali), tanpa dropdown / tombol aksi */}
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className={`truncate text-base font-bold text-slate-900 ${onBack ? '' : 'pl-1'}`}>
          Daftar Calon KPM
        </h1>
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

        {/* Search & Filter Toolbar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, NIK, pengelola, atau wilayah..."
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              ariaLabel="Filter item bantuan"
              value={itemFilter}
              onChange={onChangeItemFilter}
            >
              <option value="all">Semua Item</option>
              {yearItemOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              ariaLabel="Filter tahun KPM"
              value={selectedYear}
              onChange={onChangeYear}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  Tahun {y}
                </option>
              ))}
              <option value="all">Semua Tahun</option>
            </FilterSelect>
          </div>

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
        </div>

        {/* Records List */}
        {filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Tidak ada data calon KPM ditemukan</p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter pencarian, atau daftarkan calon KPM lewat tombol + di bawah.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredRecords.map((rec) => {
              const thumb = rec.documents.penerima || rec.documents.ktp;
              const locked = isRecordProposalLocked(rec);

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectRecord(rec)}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                    {thumb ? (
                      <img
                        src={thumb.dataUrl}
                        alt={rec.nama}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">
                        {rec.registerCode} · {rec.nama}
                      </span>
                      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {rec.proposal} · {rec.tahun}
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
