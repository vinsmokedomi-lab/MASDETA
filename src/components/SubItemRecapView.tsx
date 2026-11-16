import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Package,
} from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import { ItemBantuan, KpmRecord } from '../types/kpm';
import {
  computeSubItemRecap,
  exportSubItemRecapToCsv,
  getItemHierarchyRank,
  resolvePackageForKpm,
} from '../utils/imageProcessor';
import { SegmentedTabs } from './FormControls';

export type RecapDrillTarget =
  | { kind: 'item'; code: string; name: string }
  | { kind: 'subitem'; key: string; name: string }
  | { kind: 'pending_all' }
  | null;

interface SubItemRecapViewProps {
  records: KpmRecord[];
  items: ItemBantuan[];
  selectedYear: string;
  onChangeYear: (year: string) => void;
  drillTarget?: RecapDrillTarget;
  onChangeDrillTarget?: (next: RecapDrillTarget) => void;
  onBack: () => void;
  onSelectKpm: (record: KpmRecord) => void;
}

type RecapMainTab = 'item' | 'subitem';

export function SubItemRecapView({
  records,
  items,
  selectedYear,
  onChangeYear,
  drillTarget: controlledDrillTarget,
  onChangeDrillTarget,
  onBack,
  onSelectKpm,
}: SubItemRecapViewProps) {
  const [activeTab, setActiveTab] = useState<RecapMainTab>('item');
  const [internalDrillTarget, setInternalDrillTarget] = useState<RecapDrillTarget>(null);
  const drillTarget =
    controlledDrillTarget !== undefined ? controlledDrillTarget : internalDrillTarget;
  const setDrillTarget = (next: RecapDrillTarget) => {
    if (onChangeDrillTarget) {
      onChangeDrillTarget(next);
    } else {
      setInternalDrillTarget(next);
    }
  };

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

  // Scope: KPM Diterima pada tahun terpilih
  const scopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedYear !== 'all' && rec.tahun !== selectedYear) return false;
      return rec.validasi === 'accepted';
    });
  }, [records, selectedYear]);

  const recap = useMemo(
    () => computeSubItemRecap(scopedRecords, items),
    [scopedRecords, items]
  );

  // Ringkasan per Paket Item
  const itemRows = useMemo(() => {
    const map = new Map<
      string,
      {
        code: string;
        name: string;
        subItemCount: number;
        totalKpm: number;
        completeKpm: number;
        pendingKpm: number;
        deliveredUnits: number;
        pendingUnits: number;
      }
    >();

    for (const kpmRow of recap.kpmRows) {
      const code = (kpmRow.record.item || '').trim();
      if (!code) continue;
      const pkg = resolvePackageForKpm(items, kpmRow.record.tahun, code);
      const existing = map.get(code) ?? {
        code,
        name: pkg.name && pkg.name !== code ? pkg.name : code,
        subItemCount: pkg.subItems.length,
        totalKpm: 0,
        completeKpm: 0,
        pendingKpm: 0,
        deliveredUnits: 0,
        pendingUnits: 0,
      };

      existing.totalKpm += 1;
      if (kpmRow.debtStatus === 'complete') {
        existing.completeKpm += 1;
      } else {
        existing.pendingKpm += 1;
      }
      existing.deliveredUnits += kpmRow.deliveredItems.length;
      existing.pendingUnits += kpmRow.pendingItems.length;
      map.set(code, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      const rankA = getItemHierarchyRank(a.code, selectedYear, items);
      const rankB = getItemHierarchyRank(b.code, selectedYear, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code, 'id');
    });
  }, [recap.kpmRows, items, selectedYear]);

  const totalPackages = recap.kpmRows.length;
  const deliveredPackages = useMemo(
    () => recap.kpmRows.filter((r) => r.debtStatus === 'complete').length,
    [recap.kpmRows]
  );
  const pendingPackages = totalPackages - deliveredPackages;
  const pctItemComplete =
    totalPackages > 0 ? Math.round((deliveredPackages / totalPackages) * 100) : 0;

  const pctSubDelivered =
    recap.totalUnits > 0 ? Math.round((recap.totalDelivered / recap.totalUnits) * 100) : 0;

  // Drill-down KPM rows
  const drillKpmRows = useMemo(() => {
    if (!drillTarget) return [];
    const list = recap.kpmRows.filter((row) => {
      if (drillTarget.kind === 'item') {
        return (row.record.item || '').trim() === drillTarget.code;
      }
      if (drillTarget.kind === 'subitem') {
        return (
          row.deliveredItems.some((d) => d.key === drillTarget.key) ||
          row.pendingItems.some((p) => p.key === drillTarget.key)
        );
      }
      return row.pendingItems.length > 0;
    });

    return [...list].sort((a, b) => {
      const order = { unstarted: 0, partial: 1, complete: 2 };
      const diff = order[a.debtStatus] - order[b.debtStatus];
      if (diff !== 0) return diff;
      return a.record.nama.localeCompare(b.record.nama, 'id');
    });
  }, [recap.kpmRows, drillTarget]);

  if (drillTarget) {
    const drillTitle =
      drillTarget.kind === 'pending_all' ? 'Belum Di Bagikan' : drillTarget.name;

    return (
      <div className="min-h-screen pb-24">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setDrillTarget(null)}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali ke Rekapitulasi"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">
            {drillTitle}
          </h1>
          <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
            {drillKpmRows.length} KPM
          </span>
        </header>

        <main className="px-4 pt-4">
          {drillKpmRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                Belum ada data penerima
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Semua unit pada kategori ini sudah selesai dibagikan.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {drillKpmRows.map((row) => {
                const isSubDelivered =
                  drillTarget.kind === 'subitem'
                    ? row.deliveredItems.some((d) => d.key === drillTarget.key)
                    : row.debtStatus === 'complete';

                const statusLabel =
                  drillTarget.kind === 'subitem'
                    ? isSubDelivered
                      ? 'Diterima'
                      : 'Belum'
                    : row.debtStatus === 'complete'
                      ? 'Lengkap'
                      : `Belum (${row.pendingItems.length})`;

                return (
                  <button
                    key={row.record.id}
                    type="button"
                    onClick={() => onSelectKpm(row.record)}
                    className="flex min-h-[58px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {row.record.nama}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.record.proposal} · {row.record.item}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isSubDelivered ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{statusLabel}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700 tabular-nums">
                          {statusLabel}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">
          Rekapitulasi Item &amp; Sub-Item
        </h1>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* 2 Tab Navigasi: Item vs Sub-Item */}
        <SegmentedTabs<RecapMainTab>
          value={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
            setDrillTarget(null);
          }}
          tabs={[
            { key: 'item', label: 'Item' },
            { key: 'subitem', label: 'Sub-Item' },
          ]}
        />

        {/* Hero Heading Container (identik dengan Dashboard) */}
        <section className="rounded-3xl bg-slate-900 p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold tracking-tight text-white leading-snug">
                {activeTab === 'item' ? 'Rekapitulasi Item' : 'Rekapitulasi Sub-Item'}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">KPM Diterima</p>
            </div>

            <div className="relative inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center rounded-xl border border-white/50 bg-white/15 transition-colors hover:border-white/75 hover:bg-white/20">
              <select
                aria-label="Pilih tahun anggaran"
                value={selectedYear}
                onChange={(e) => onChangeYear(e.target.value)}
                className="h-full min-h-[44px] w-full cursor-pointer appearance-none bg-transparent py-2.5 pr-9 pl-3.5 text-sm font-bold text-white focus:outline-none"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr} className="text-slate-900">
                    {yr}
                  </option>
                ))}
                <option value="all" className="text-slate-900">
                  Semua Tahun
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-white" />
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight tabular-nums">
                {activeTab === 'item' ? totalPackages : recap.totalUnits}
              </span>
              <span className="text-xs font-medium text-slate-300">
                {activeTab === 'item' ? 'Total Paket' : 'Total Unit'}
              </span>
            </div>
            <span className="text-xs font-bold text-teal-300 tabular-nums">
              {activeTab === 'item'
                ? `${pctItemComplete}% Lengkap`
                : `${pctSubDelivered}% Terbagi`}
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-300"
              style={{
                width: `${activeTab === 'item' ? pctItemComplete : pctSubDelivered}%`,
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 divide-x divide-slate-800 border-t border-slate-800 pt-3.5">
            <div className="px-2 text-center">
              <p className="text-xs text-slate-400">Sudah Diterima</p>
              <p className="mt-0.5 text-lg font-bold text-teal-300 tabular-nums">
                {activeTab === 'item'
                  ? `${deliveredPackages} Paket`
                  : `${recap.totalDelivered} Unit`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrillTarget({ kind: 'pending_all' })}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-xs text-slate-400">Belum Di Bagikan</p>
              <p className="mt-0.5 text-lg font-bold text-amber-300 tabular-nums">
                {activeTab === 'item'
                  ? `${pendingPackages} Paket`
                  : `${recap.totalPending} Unit`}
              </p>
            </button>
          </div>
        </section>

        {/* LISTING ITEM */}
        {activeTab === 'item' && (
          <section className="space-y-3">
            {itemRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada data item diterima
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Pilih tahun lain atau pastikan data KPM diterima sudah tersedia.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {itemRows.map((row) => (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() =>
                      setDrillTarget({ kind: 'item', code: row.code, name: row.name })
                    }
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 font-mono text-xs font-bold text-teal-800">
                        {row.code}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                          {row.subItemCount} sub-item · {row.completeKpm}/{row.totalKpm} lengkap
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">
                          {row.totalKpm} Paket
                        </p>
                        <p
                          className={`text-xs font-semibold tabular-nums ${
                            row.pendingKpm > 0 ? 'text-amber-700' : 'text-teal-700'
                          }`}
                        >
                          {row.pendingKpm > 0 ? `Belum ${row.pendingKpm}` : 'Lengkap'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* LISTING SUB-ITEM */}
        {activeTab === 'subitem' && (
          <section className="space-y-3">
            {recap.aggregates.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada data sub-item diterima
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Pilih tahun lain atau pastikan paket item memiliki sub-item terdaftar.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {recap.aggregates.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() =>
                        setDrillTarget({ kind: 'subitem', key: row.key, name: row.name })
                      }
                      className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {row.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                            Paket {row.packageSources.map((s) => s.code).join(', ')} ·{' '}
                            {row.deliveredCount}/{row.totalNeeded} diterima
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            {row.totalNeeded} Unit
                          </p>
                          <p
                            className={`text-xs font-semibold tabular-nums ${
                              row.pendingCount > 0 ? 'text-amber-700' : 'text-teal-700'
                            }`}
                          >
                            {row.pendingCount > 0 ? `Belum ${row.pendingCount}` : 'Lengkap'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    exportSubItemRecapToCsv(
                      recap.aggregates,
                      `masdeta-rekap-subitem-${selectedYear}.csv`
                    )
                  }
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4 text-teal-700" />
                  <span>Download Rekap Sub-Item (.CSV)</span>
                </button>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
