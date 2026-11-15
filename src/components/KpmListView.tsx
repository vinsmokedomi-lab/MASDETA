import { useEffect, useMemo, useState } from 'react';
import { Lock, Search, SlidersHorizontal, User, X } from 'lucide-react';
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
  isKecamatanProposal,
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
  onSelectRecord,
}: KpmListViewProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<KpmSortKey>('absen');
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [rtRwFilter, setRtRwFilter] = useState<string>('all');
  const [pengelolaFilter, setPengelolaFilter] = useState<string>('all');
  const [pekerjaanFilter, setPekerjaanFilter] = useState<string>('all');
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(40);

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
    onChangeItemFilter('all');
    setSortBy('absen');
    setKelurahanFilter('all');
    setRtRwFilter('all');
    setPengelolaFilter('all');
    setPekerjaanFilter('all');
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header: hanya judul tanpa tombol kembali / aksi */}
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <h1 className="truncate text-base font-bold text-slate-900">
          Keluarga Penerima Manfaat (KPM)
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
            {filteredRecords.slice(0, visibleLimit).map((rec) => {
              const thumb = rec.documents.penerima || rec.documents.ktp;
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

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectRecord(rec)}
                  className="flex w-full items-stretch gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  {/* Nomor Absen sebelum Foto */}
                  <div className="flex w-5 shrink-0 items-center justify-center">
                    <span className="font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                      {absenLabel}
                    </span>
                  </div>

                  {/* Foto Thumbnail Persegi Panjang (sejajar ujung atas judul s.d. ujung bawah subjudul) */}
                  <div className="flex w-11 shrink-0 items-center justify-center self-stretch overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
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

                  {/* Konten Utama */}
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    {/* Baris 1: Nama + Item & Angka Desil */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-[13px] font-medium leading-tight text-slate-900">
                          {rec.nama}
                        </span>
                        {locked && <Lock className="h-3 w-3 shrink-0 text-slate-400" />}
                      </div>

                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-700 tabular-nums">
                        {rec.item}
                        {desilNumeric ? ` · ${desilNumeric}` : ''}
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

                    {/* Baris 3: Kelurahan (jika Proposal Kecamatan) · Pengelola */}
                    {metaLine && (
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
                        {metaLine}
                      </p>
                    )}
                  </div>
                </button>
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
    </div>
  );
}
