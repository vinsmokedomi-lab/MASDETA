import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Lock, Search, SlidersHorizontal, User, X } from 'lucide-react';
import { INITIAL_WILAYAH_LIST, TAHUN_OPTIONS } from '../data/kpmOptions';
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
  resolveProposalDomicile,
} from '../utils/imageProcessor';
import { FilterSelect, SegmentedTabs } from './FormControls';

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
  onBack?: () => void;
  onCreateNew: () => void;
  onSelectRecord: (record: KpmRecord) => void;
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
  onBack,
  onSelectRecord,
}: KpmListViewProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<KpmSortKey>('absen');
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [rtRwFilter, setRtRwFilter] = useState<string>('all');
  const [pengelolaFilter, setPengelolaFilter] = useState<string>('all');
  const [pekerjaanFilter, setPekerjaanFilter] = useState<string>('all');
  const [showExtraFilters, setShowExtraFilters] = useState(false);

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

  const getRecordRtRw = (rec: KpmRecord) => {
    const rt = rec.rt ? rec.rt.padStart(3, '0') : '000';
    const rw = rec.rw ? rec.rw.padStart(3, '0') : '000';
    return `RT ${rt} / RW ${rw}`;
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

  const { kelurahanOptions, rtRwOptions, pengelolaOptions, pekerjaanOptions } = useMemo(() => {
    const kels = new Set<string>();
    const rtRws = new Set<string>();
    const pengelolas = new Set<string>();
    const pekerjaans = new Set<string>();

    for (const rec of yearBaseRecords) {
      const kel = getRecordKelurahan(rec);
      if (kel) kels.add(kel);
      if (rec.rt || rec.rw) rtRws.add(getRecordRtRw(rec));
      if (rec.pengelola?.trim()) pengelolas.add(rec.pengelola.trim());
      if (rec.pekerjaan?.trim()) pekerjaans.add(rec.pekerjaan.trim());
    }

    return {
      kelurahanOptions: Array.from(kels).sort((a, b) => a.localeCompare(b, 'id')),
      rtRwOptions: Array.from(rtRws).sort((a, b) => {
        const [, rtA = '0', rwA = '0'] = a.match(/RT\s*(\d+)\s*\/\s*RW\s*(\d+)/) || [];
        const [, rtB = '0', rwB = '0'] = b.match(/RT\s*(\d+)\s*\/\s*RW\s*(\d+)/) || [];
        return (parseInt(rwA, 10) - parseInt(rwB, 10)) || (parseInt(rtA, 10) - parseInt(rtB, 10));
      }),
      pengelolaOptions: Array.from(pengelolas).sort((a, b) => a.localeCompare(b, 'id')),
      pekerjaanOptions: Array.from(pekerjaans).sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [yearBaseRecords, proposals, wilayahList]);

  const activeExtraFilterCount =
    (kelurahanFilter !== 'all' ? 1 : 0) +
    (rtRwFilter !== 'all' ? 1 : 0) +
    (pengelolaFilter !== 'all' ? 1 : 0) +
    (pekerjaanFilter !== 'all' ? 1 : 0);

  const scopedRecords = useMemo(() => {
    return yearBaseRecords.filter((rec) => {
      if (itemFilter !== 'all' && rec.item !== itemFilter) return false;
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

  const handleResetExtraFilters = () => {
    setKelurahanFilter('all');
    setRtRwFilter('all');
    setPengelolaFilter('all');
    setPekerjaanFilter('all');
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header: hanya judul (+ panah kembali), tanpa dropdown / tombol aksi */}
      <header
        className={`sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 backdrop-blur-md ${
          onBack ? 'px-3' : 'px-4'
        }`}
      >
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
        <h1 className="truncate text-base font-bold text-slate-900">
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

        {/* Search, Sort & Filter Toolbar */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, NIK, pekerjaan, pengelola, wilayah..."
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
                  {y}
                </option>
              ))}
              <option value="all">Semua</option>
            </FilterSelect>
          </div>

          <div className="grid grid-cols-2 gap-2">
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

            <button
              type="button"
              onClick={() => setShowExtraFilters((prev) => !prev)}
              className={`inline-flex min-h-[42px] items-center justify-between gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                showExtraFilters || activeExtraFilterCount > 0
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {activeExtraFilterCount > 0
                    ? `Filter (${activeExtraFilterCount})`
                    : 'Filter Lainnya'}
                </span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                  showExtraFilters ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {showExtraFilters && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
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
                    <span>Reset Filter Lainnya</span>
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
              const absenSeq = getAbsenSeq(rec.registerCode);
              const absenLabel =
                absenSeq < 999999 ? String(absenSeq).padStart(3, '0') : '';

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
                        {rec.nama}
                      </span>
                      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {[rec.proposal, rec.tahun, rec.item, rec.dtsen || '-']
                        .filter(Boolean)
                        .join(' - ')}
                    </p>
                  </div>

                  {absenLabel && (
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
                      {absenLabel}
                    </span>
                  )}

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
