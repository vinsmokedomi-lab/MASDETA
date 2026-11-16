import { useMemo, useState } from 'react';
import { Lock, Search, SlidersHorizontal, User, X } from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
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
  getPrimaryKpmPhoto,
  isKecamatanProposal,
  resolveProposalDomicile,
} from '../utils/imageProcessor';
import { DriveImage } from './DriveImage';
import { FilterSelect, SegmentedTabs } from './FormControls';

type CorrespondentSortKey = 'absen' | 'nama' | 'item' | 'rtrw' | 'terbaru';

interface CorrespondentKpmListPanelProps {
  records: KpmRecord[];
  items: ItemBantuan[];
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  emptyTitle: string;
  emptySubtitle: string;
  headerCard?: React.ReactNode;
  onSelectRecord?: (record: KpmRecord) => void;
}

export function CorrespondentKpmListPanel({
  records,
  items,
  proposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  emptyTitle,
  emptySubtitle,
  headerCard,
  onSelectRecord,
}: CorrespondentKpmListPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ValidationStatus>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [proposalFilter, setProposalFilter] = useState<string>('all');
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<CorrespondentSortKey>('absen');
  const [showFilters, setShowFilters] = useState(false);

  const getRecordKelurahan = (rec: KpmRecord) => {
    if (rec.kelurahan?.trim()) return rec.kelurahan.trim();
    return resolveProposalDomicile(rec.proposal, proposals, rec.tahun, wilayahList).kelurahan || '';
  };

  const getCompactKelurahan = (rawKel: string) =>
    rawKel.replace(/^(kelurahan|kel\.?)\s+/i, '').trim();

  const isRecordProposalLocked = (rec: KpmRecord) => {
    const match =
      proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
      proposals.find((p) => p.namaProposal === rec.proposal);
    return match?.status === 'locked';
  };

  const { yearOptions, itemOptions, proposalOptions, kelurahanOptions } = useMemo(() => {
    const years = new Set<string>();
    const itemCodes = new Set<string>();
    const propNames = new Set<string>();
    const kels = new Set<string>();

    for (const r of records) {
      if (r.tahun) years.add(r.tahun);
      if (r.item) itemCodes.add(r.item);
      if (r.proposal) propNames.add(r.proposal);
      const kel = getRecordKelurahan(r);
      if (kel) kels.add(kel);
    }

    return {
      yearOptions: Array.from(years).sort((a, b) => b.localeCompare(a)),
      itemOptions: Array.from(itemCodes).sort((a, b) => a.localeCompare(b, 'id')),
      proposalOptions: Array.from(propNames).sort((a, b) => a.localeCompare(b, 'id')),
      kelurahanOptions: Array.from(kels).sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [records, proposals, wilayahList]);

  const scopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (yearFilter !== 'all' && rec.tahun !== yearFilter) return false;
      if (itemFilter !== 'all' && rec.item !== itemFilter) return false;
      if (proposalFilter !== 'all' && rec.proposal !== proposalFilter) return false;
      if (kelurahanFilter !== 'all' && getRecordKelurahan(rec) !== kelurahanFilter) return false;
      return true;
    });
  }, [records, yearFilter, itemFilter, proposalFilter, kelurahanFilter, proposals, wilayahList]);

  const statusCounts = useMemo(() => {
    return {
      all: scopedRecords.length,
      accepted: scopedRecords.filter((r) => r.validasi === 'accepted').length,
      pending: scopedRecords.filter((r) => r.validasi === 'pending').length,
      rejected: scopedRecords.filter((r) => r.validasi === 'rejected').length,
    };
  }, [scopedRecords]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scopedRecords.filter((rec) => {
      if (statusFilter !== 'all' && rec.validasi !== statusFilter) return false;
      if (!q) return true;
      const kel = getRecordKelurahan(rec).toLowerCase();
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.includes(q) ||
        rec.nikKk.includes(q) ||
        rec.registerCode.toLowerCase().includes(q) ||
        rec.proposal.toLowerCase().includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.pekerjaan.toLowerCase().includes(q) ||
        rec.pengelola.toLowerCase().includes(q) ||
        kel.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'nama':
          return a.nama.localeCompare(b.nama, 'id');
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
        case 'terbaru': {
          const tA = new Date(a.updatedAt || a.createdAt).getTime();
          const tB = new Date(b.updatedAt || b.createdAt).getTime();
          return tB - tA;
        }
        case 'absen':
        default: {
          const seqA = getAbsenSeq(a.registerCode);
          const seqB = getAbsenSeq(b.registerCode);
          if (seqA !== seqB) return seqA - seqB;
          return a.nama.localeCompare(b.nama, 'id');
        }
      }
    });
  }, [scopedRecords, statusFilter, query, sortBy, items, proposals, wilayahList]);

  const activeExtraFilterCount =
    (yearFilter !== 'all' ? 1 : 0) +
    (itemFilter !== 'all' ? 1 : 0) +
    (proposalFilter !== 'all' ? 1 : 0) +
    (kelurahanFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'absen' ? 1 : 0);

  const resetAllFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setYearFilter('all');
    setItemFilter('all');
    setProposalFilter('all');
    setKelurahanFilter('all');
    setSortBy('absen');
  };

  return (
    <div className="space-y-3">
      {headerCard}

      {/* Search + Toggle Filter & Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, NIK, proposal, atau alamat..."
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-9 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Hapus pencarian"
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          aria-expanded={showFilters}
          className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors ${
            showFilters || activeExtraFilterCount > 0
              ? 'border-teal-700 bg-teal-50 text-teal-800'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          <span>Filter</span>
          {activeExtraFilterCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white tabular-nums">
              {activeExtraFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Status Segmented Tabs */}
      <SegmentedTabs<'all' | ValidationStatus>
        value={statusFilter}
        onChange={setStatusFilter}
        tabs={[
          { key: 'all', label: 'Semua', count: statusCounts.all },
          { key: 'accepted', label: 'Diterima', count: statusCounts.accepted },
          { key: 'pending', label: 'Menunggu', count: statusCounts.pending },
          { key: 'rejected', label: 'Ditolak', count: statusCounts.rejected },
        ]}
      />

      {/* Collapsible Filter & Sorting Panel */}
      {showFilters && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Tahun Anggaran
              </label>
              <FilterSelect
                value={yearFilter}
                onChange={setYearFilter}
                ariaLabel="Filter tahun anggaran"
              >
                <option value="all">Semua Tahun</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Tahun {y}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Paket Item
              </label>
              <FilterSelect
                value={itemFilter}
                onChange={setItemFilter}
                ariaLabel="Filter paket item"
              >
                <option value="all">Semua Item</option>
                {itemOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Proposal
              </label>
              <FilterSelect
                value={proposalFilter}
                onChange={setProposalFilter}
                ariaLabel="Filter proposal"
              >
                <option value="all">Semua Proposal</option>
                {proposalOptions.map((prop) => (
                  <option key={prop} value={prop}>
                    {prop}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Kelurahan
              </label>
              <FilterSelect
                value={kelurahanFilter}
                onChange={setKelurahanFilter}
                ariaLabel="Filter kelurahan"
              >
                <option value="all">Semua Kelurahan</option>
                {kelurahanOptions.map((kel) => (
                  <option key={kel} value={kel}>
                    {kel}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2.5 border-t border-slate-100 pt-2.5">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Urutkan Data
              </label>
              <FilterSelect
                value={sortBy}
                onChange={(v) => setSortBy(v as CorrespondentSortKey)}
                ariaLabel="Urutkan daftar KPM"
              >
                <option value="absen">No. Absen / Urutan</option>
                <option value="nama">Nama (A–Z)</option>
                <option value="item">Paket Item</option>
                <option value="rtrw">RT / RW</option>
                <option value="terbaru">Terbaru Diperbarui</option>
              </FilterSelect>
            </div>

            {(activeExtraFilterCount > 0 || statusFilter !== 'all' || query) && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
        <span>
          Menampilkan <strong className="text-slate-800 tabular-nums">{filteredRecords.length}</strong>{' '}
          dari <strong className="text-slate-800 tabular-nums">{records.length}</strong> KPM
        </span>
      </div>

      {/* KPM Correspondent List */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">
            {records.length === 0 ? emptyTitle : 'Tidak ada KPM yang sesuai filter'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {records.length === 0
              ? emptySubtitle
              : 'Ubah kata kunci pencarian atau reset filter untuk melihat semua data.'}
          </p>
          {records.length > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-3 min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filteredRecords.map((rec) => {
            const thumb = getPrimaryKpmPhoto(rec.documents);
            const locked = isRecordProposalLocked(rec);
            const absenSeq = getAbsenSeq(rec.registerCode);
            const absenLabel =
              absenSeq < 999999 ? String(absenSeq).padStart(2, '0') : '--';
            const desilNumeric =
              rec.dtsen && /^\d/.test(rec.dtsen.trim())
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
                onClick={() => onSelectRecord?.(rec)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
              >
                <div className="flex w-5 shrink-0 items-center justify-center">
                  <span className="font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                    {absenLabel}
                  </span>
                </div>

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
            );
          })}
        </div>
      )}
    </div>
  );
}
