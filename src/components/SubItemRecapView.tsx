import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Package,
  Search,
  X,
} from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import { ItemBantuan, KpmRecord } from '../types/kpm';
import { computeSubItemRecap, exportSubItemRecapToCsv } from '../utils/imageProcessor';

interface SubItemRecapViewProps {
  records: KpmRecord[];
  items: ItemBantuan[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  onBack: () => void;
  onSelectKpm: (record: KpmRecord) => void;
}

type RecapTab = 'akumulasi' | 'hutang';
type KpmScopeFilter = 'accepted' | 'all';
type DebtFilter = 'pending_only' | 'partial' | 'unstarted' | 'complete' | 'all';

export function SubItemRecapView({
  records,
  items,
  selectedYear,
  onChangeYear,
  onBack,
  onSelectKpm,
}: SubItemRecapViewProps) {
  const [activeTab, setActiveTab] = useState<RecapTab>('akumulasi');
  const [scopeFilter, setScopeFilter] = useState<KpmScopeFilter>('accepted');
  const [debtFilter, setDebtFilter] = useState<DebtFilter>('pending_only');
  const [selectedSubItemKey, setSelectedSubItemKey] = useState<string>('all');
  const [query, setQuery] = useState('');

  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    records.forEach((r) => {
      if (r.tahun) set.add(r.tahun);
    });
    items.forEach((i) => {
      if (i.tahun) set.add(i.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records, items]);

  const scopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedYear !== 'all' && rec.tahun !== selectedYear) return false;
      if (scopeFilter === 'accepted' && rec.validasi !== 'accepted') return false;
      return true;
    });
  }, [records, selectedYear, scopeFilter]);

  const recap = useMemo(
    () => computeSubItemRecap(scopedRecords, items),
    [scopedRecords, items]
  );

  const selectedSubItemLabel = useMemo(() => {
    if (selectedSubItemKey === 'all') return '';
    return recap.aggregates.find((a) => a.key === selectedSubItemKey)?.name || selectedSubItemKey;
  }, [recap.aggregates, selectedSubItemKey]);

  const filteredAggregates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recap.aggregates;
    return recap.aggregates.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.packageSources.some(
          (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
        )
    );
  }, [recap.aggregates, query]);

  const kpmCounts = useMemo(() => {
    const base =
      selectedSubItemKey === 'all'
        ? recap.kpmRows
        : recap.kpmRows.filter(
            (r) =>
              r.deliveredItems.some((d) => d.key === selectedSubItemKey) ||
              r.pendingItems.some((p) => p.key === selectedSubItemKey)
          );

    return {
      all: base.length,
      pending_only: base.filter((r) => r.pendingItems.length > 0).length,
      partial: base.filter((r) => r.debtStatus === 'partial').length,
      unstarted: base.filter((r) => r.debtStatus === 'unstarted').length,
      complete: base.filter((r) => r.debtStatus === 'complete').length,
    };
  }, [recap.kpmRows, selectedSubItemKey]);

  const filteredKpmRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recap.kpmRows
      .filter((row) => {
        if (selectedSubItemKey !== 'all') {
          const matchesPending = row.pendingItems.some((p) => p.key === selectedSubItemKey);
          const matchesDelivered = row.deliveredItems.some((d) => d.key === selectedSubItemKey);
          if (debtFilter === 'pending_only' || debtFilter === 'partial' || debtFilter === 'unstarted') {
            if (!matchesPending) return false;
          } else if (debtFilter === 'complete') {
            if (!matchesDelivered) return false;
          } else if (!matchesPending && !matchesDelivered) {
            return false;
          }
        }

        if (debtFilter === 'pending_only' && row.pendingItems.length === 0) return false;
        if (debtFilter === 'partial' && row.debtStatus !== 'partial') return false;
        if (debtFilter === 'unstarted' && row.debtStatus !== 'unstarted') return false;
        if (debtFilter === 'complete' && row.debtStatus !== 'complete') return false;

        if (!q) return true;
        return (
          row.record.nama.toLowerCase().includes(q) ||
          row.record.registerCode.toLowerCase().includes(q) ||
          row.record.proposal.toLowerCase().includes(q) ||
          row.pendingItems.some((p) => p.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const order = { partial: 0, unstarted: 1, complete: 2 };
        return order[a.debtStatus] - order[b.debtStatus];
      });
  }, [recap.kpmRows, selectedSubItemKey, debtFilter, query]);

  const yearLabel = selectedYear === 'all' ? 'Semua Tahun' : `Tahun ${selectedYear}`;
  const pctDelivered =
    recap.totalUnits > 0 ? Math.round((recap.totalDelivered / recap.totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Native Mobile Sub-Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">Rekapitulasi Sub-Item</h1>
        </div>

        <div className="relative shrink-0">
          <select
            aria-label="Filter tahun rekapitulasi"
            value={selectedYear}
            onChange={(e) => onChangeYear(e.target.value)}
            className="min-h-[38px] appearance-none rounded-xl border border-slate-200 bg-slate-50 pr-6 pl-2.5 text-xs font-bold text-slate-900 focus:border-teal-700 focus:bg-white focus:outline-none tabular-nums"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
            <option value="all">Semua</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Scope Switcher: KPM Diterima vs Semua Usulan */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setScopeFilter('accepted')}
            className={`min-h-[36px] flex-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
              scopeFilter === 'accepted'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            KPM Diterima
          </button>
          <button
            type="button"
            onClick={() => setScopeFilter('all')}
            className={`min-h-[36px] flex-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
              scopeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Usulan
          </button>
        </div>

        {/* Hero Summary Card */}
        <section className="rounded-3xl bg-slate-900 p-5 text-white">
          <p className="text-xs font-medium text-slate-300">
            Akumulasi Penyaluran · {yearLabel} ({scopedRecords.length} KPM)
          </p>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight tabular-nums">
                {recap.totalUnits}
              </span>
              <span className="text-xs font-medium text-slate-300">Total Unit Sub-Item</span>
            </div>
            <span className="text-xs font-bold text-teal-300 tabular-nums">{pctDelivered}% Terbagi</span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-300"
              style={{ width: `${pctDelivered}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 divide-x divide-slate-800 border-t border-slate-800 pt-3.5">
            <div className="pr-3">
              <p className="text-[11px] text-slate-400">Sudah Diterima KPM</p>
              <p className="mt-0.5 text-lg font-bold text-teal-300 tabular-nums">
                {recap.totalDelivered} Unit
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDebtFilter('pending_only');
                setActiveTab('hutang');
              }}
              className="pl-3 text-left transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-400">Belum Dibagikan / Hutang</p>
              <p className="mt-0.5 text-lg font-bold text-amber-300 tabular-nums">
                {recap.totalPending} Unit
              </p>
            </button>
          </div>
        </section>

        {/* Primary View Tabs */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab('akumulasi')}
            className={`min-h-[40px] rounded-lg px-2 text-xs font-bold transition-colors ${
              activeTab === 'akumulasi'
                ? 'bg-teal-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Akumulasi Sub-Item ({recap.aggregates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hutang')}
            className={`min-h-[40px] rounded-lg px-2 text-xs font-bold transition-colors ${
              activeTab === 'hutang'
                ? 'bg-teal-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Laporan KPM & Hutang ({kpmCounts.pending_only})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 'akumulasi'
                ? 'Cari sub-item (contoh: Blender) atau kode paket...'
                : 'Cari nama KPM, proposal, atau sub-item...'
            }
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        {/* TAB 1: AKUMULASI SUB-ITEM */}
        {activeTab === 'akumulasi' && (
          <section className="space-y-3">
            {filteredAggregates.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada data sub-item pada filter ini
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Coba ubah tahun atau cakupan usulan KPM.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {filteredAggregates.map((row) => {
                  const pct =
                    row.totalNeeded > 0
                      ? Math.round((row.deliveredCount / row.totalNeeded) * 100)
                      : 0;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => {
                        setSelectedSubItemKey(row.key);
                        setDebtFilter(row.pendingCount > 0 ? 'pending_only' : 'all');
                        setActiveTab('hutang');
                      }}
                      className="block w-full px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{row.name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                              Dari paket:{' '}
                              {row.packageSources
                                .map((src) => `${src.code} (${src.total})`)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 tabular-nums">
                              {row.totalNeeded} Unit
                            </p>
                            <p
                              className={`text-[11px] font-semibold tabular-nums ${
                                row.pendingCount > 0 ? 'text-amber-700' : 'text-teal-700'
                              }`}
                            >
                              {row.pendingCount > 0
                                ? `Kurang ${row.pendingCount}`
                                : 'Terpenuhi'}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-teal-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-slate-500 tabular-nums">
                          {row.deliveredCount}/{row.totalNeeded} Diterima
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredAggregates.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportSubItemRecapToCsv(
                    filteredAggregates,
                    `masdeta-rekap-subitem-${selectedYear}.csv`
                  )
                }
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Download className="h-4 w-4 text-teal-700" />
                <span>Download Rekap Sub-Item (.CSV)</span>
              </button>
            )}
          </section>
        )}

        {/* TAB 2: LAPORAN KPM & HUTANG PENYALURAN */}
        {activeTab === 'hutang' && (
          <section className="space-y-3">
            {selectedSubItemKey !== 'all' && (
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs text-teal-900">
                <span className="font-semibold">
                  Sub-Item: <strong>{selectedSubItemLabel}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSubItemKey('all')}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
                >
                  <X className="h-3 w-3" />
                  <span>Semua</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1">
              {(
                [
                  { key: 'pending_only', label: `Belum Lengkap (${kpmCounts.pending_only})` },
                  { key: 'partial', label: `Hutang Sebagian (${kpmCounts.partial})` },
                  { key: 'unstarted', label: `Belum Dibagi (${kpmCounts.unstarted})` },
                  { key: 'complete', label: `Lengkap (${kpmCounts.complete})` },
                  { key: 'all', label: `Semua (${kpmCounts.all})` },
                ] as { key: DebtFilter; label: string }[]
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setDebtFilter(chip.key)}
                  className={`min-h-[32px] shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    debtFilter === chip.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {filteredKpmRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Tidak ada data penerima pada filter ini
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {filteredKpmRows.map((row) => (
                  <button
                    key={row.record.id}
                    type="button"
                    onClick={() => onSelectKpm(row.record)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {row.record.registerCode} · {row.record.nama}
                        </p>
                        {row.debtStatus === 'complete' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-teal-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Lengkap
                          </span>
                        ) : row.debtStatus === 'partial' ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Hutang {row.pendingItems.length}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] font-bold text-rose-600">
                            Belum ({row.pendingItems.length})
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.record.proposal} · {row.record.tahun} ({row.packageName})
                      </p>

                      {row.deliveredItems.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-teal-700 leading-snug">
                          <span className="font-semibold">Sudah diterima:</span>{' '}
                          {row.deliveredItems.map((d) => d.name).join(', ')}
                        </p>
                      )}

                      {row.pendingItems.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-800 leading-snug">
                          <span className="font-semibold">Belum diterima:</span>{' '}
                          {row.pendingItems.map((p) => p.name).join(', ')}
                        </p>
                      )}
                    </div>

                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
