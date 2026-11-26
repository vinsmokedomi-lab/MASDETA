import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { DTSEN_OPTIONS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import { resolveKpmDomicile } from '../utils/imageProcessor';
import { DEFAULT_PDF_COLUMN_KEYS } from '../utils/pdfFormatHelpers';
import { exportKpmTableToPdf } from '../utils/pdfExporter';
import { exportKpmTableToXlsx } from '../utils/xlsxExporter';
import { FilterSelect, SegmentedTabs } from './FormControls';

interface DownloadStandalonePanelProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pengelolaList: PengelolaProfile[];
  wilayahList?: WilayahKabKota[];
  reportTemplate?: ReportTemplateConfig;
  proposalSlotMap?: ProposalSlotMap;
}

export function DownloadStandalonePanel({
  records,
  proposals,
  items,
  pengelolaList,
  wilayahList = INITIAL_WILAYAH_LIST,
  reportTemplate,
  proposalSlotMap = {},
}: DownloadStandalonePanelProps) {
  const [sourceMode, setSourceMode] = useState<'database' | 'arsip'>('database');
  const [yearFilter, setYearFilter] = useState('all');
  const [kecamatanFilter, setKecamatanFilter] = useState('all');
  const [kelurahanFilter, setKelurahanFilter] = useState('all');
  const [pengelolaFilter, setPengelolaFilter] = useState('all');
  const [itemFilter, setItemFilter] = useState('all');
  const [dtsenFilter, setDtsenFilter] = useState('all');
  const [splitByPengelola, setSplitByPengelola] = useState(false);
  const [busyFormat, setBusyFormat] = useState<'pdf' | 'xlsx' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const databaseCount = useMemo(
    () => records.filter((r) => r.validasi === 'pending' && !(r.proposal || '').trim()).length,
    [records]
  );
  const arsipCount = useMemo(
    () => records.filter((r) => r.validasi === 'rejected' && !(r.proposal || '').trim()).length,
    [records]
  );

  const enrichedBase = useMemo(() => {
    const targetStatus = sourceMode === 'database' ? 'pending' : 'rejected';
    return records
      .filter((r) => r.validasi === targetStatus && !(r.proposal || '').trim())
      .map((rec) => {
        const dom = resolveKpmDomicile(rec, proposals, wilayahList);
        return {
          record: rec,
          kecamatan: dom.kecamatan || rec.kecamatan || '',
          kelurahan: dom.kelurahan || rec.kelurahan || '',
        };
      });
  }, [records, sourceMode, proposals, wilayahList]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    enrichedBase.forEach((e) => {
      if (e.record.tahun?.trim()) set.add(e.record.tahun.trim());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [enrichedBase]);

  const kecamatanOptions = useMemo(() => {
    const set = new Set<string>();
    wilayahList.forEach((w) => w.kecamatanList.forEach((k) => set.add(k.nama)));
    enrichedBase.forEach((e) => {
      if (e.kecamatan.trim()) set.add(e.kecamatan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [wilayahList, enrichedBase]);

  const kelurahanOptions = useMemo(() => {
    const set = new Set<string>();
    enrichedBase.forEach((e) => {
      if (!e.kelurahan.trim()) return;
      if (
        kecamatanFilter !== 'all' &&
        e.kecamatan.trim().toLowerCase() !== kecamatanFilter.toLowerCase()
      ) {
        return;
      }
      set.add(e.kelurahan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [enrichedBase, kecamatanFilter]);

  const pengelolaOptions = useMemo(() => {
    const set = new Set<string>();
    pengelolaList.forEach((p) => {
      if (p.displayName) set.add(p.displayName);
    });
    enrichedBase.forEach((e) => {
      if (e.record.pengelola?.trim()) set.add(e.record.pengelola.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [pengelolaList, enrichedBase]);

  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.code) set.add(it.code);
    });
    enrichedBase.forEach((e) => {
      if (e.record.item?.trim()) set.add(e.record.item.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [items, enrichedBase]);

  const filteredRecords = useMemo(() => {
    return enrichedBase
      .filter(({ record, kecamatan, kelurahan }) => {
        if (yearFilter !== 'all' && (record.tahun || '').trim() !== yearFilter) return false;
        if (
          kecamatanFilter !== 'all' &&
          kecamatan.trim().toLowerCase() !== kecamatanFilter.toLowerCase()
        ) {
          return false;
        }
        if (
          kelurahanFilter !== 'all' &&
          kelurahan.trim().toLowerCase() !== kelurahanFilter.toLowerCase()
        ) {
          return false;
        }
        if (
          pengelolaFilter !== 'all' &&
          (record.pengelola || '').trim().toLowerCase() !== pengelolaFilter.toLowerCase()
        ) {
          return false;
        }
        if (
          itemFilter !== 'all' &&
          (record.item || '').trim().toUpperCase() !== itemFilter.toUpperCase()
        ) {
          return false;
        }
        if (
          dtsenFilter !== 'all' &&
          (record.dtsen || '').trim().toLowerCase() !== dtsenFilter.toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .map((e) => e.record);
  }, [
    enrichedBase,
    yearFilter,
    kecamatanFilter,
    kelurahanFilter,
    pengelolaFilter,
    itemFilter,
    dtsenFilter,
  ]);

  const activeFiltersCount = [
    yearFilter !== 'all',
    kecamatanFilter !== 'all',
    kelurahanFilter !== 'all',
    pengelolaFilter !== 'all',
    itemFilter !== 'all',
    dtsenFilter !== 'all',
  ].filter(Boolean).length;

  const itemBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredRecords.forEach((r) => {
      const code = (r.item || 'Tanpa Item').trim() || 'Tanpa Item';
      map.set(code, (map.get(code) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const resetFilters = () => {
    setYearFilter('all');
    setKecamatanFilter('all');
    setKelurahanFilter('all');
    setPengelolaFilter('all');
    setItemFilter('all');
    setDtsenFilter('all');
    setFeedback(null);
  };

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    if (filteredRecords.length === 0 || busyFormat) return;
    setBusyFormat(format);
    setFeedback(null);

    const isDatabase = sourceMode === 'database';
    const title = isDatabase ? 'DATABASE KPM (MENUNGGU)' : 'ARSIP BERKAS KPM DITOLAK';
    const filterParts: string[] = [];
    if (yearFilter !== 'all') filterParts.push(`Tahun ${yearFilter}`);
    if (kecamatanFilter !== 'all') filterParts.push(kecamatanFilter);
    if (kelurahanFilter !== 'all') filterParts.push(kelurahanFilter);
    if (pengelolaFilter !== 'all') filterParts.push(`Pengelola: ${pengelolaFilter}`);
    if (itemFilter !== 'all') filterParts.push(`Item: ${itemFilter}`);
    if (dtsenFilter !== 'all') filterParts.push(`Desil: ${dtsenFilter}`);
    const subtitle =
      filterParts.length > 0
        ? `Filter: ${filterParts.join(' · ')}`
        : isDatabase
          ? 'Seluruh KPM Database (Menunggu)'
          : 'Seluruh Arsip Berkas Ditolak';
    const fileName = isDatabase ? 'Database_KPM' : 'Arsip_Ditolak_KPM';

    try {
      if (format === 'pdf') {
        const res = await exportKpmTableToPdf({
          records: filteredRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          selectedColumns: DEFAULT_PDF_COLUMN_KEYS,
          title,
          subtitle,
          fileName,
          includeSummary: true,
          reportTemplate,
          splitByPengelola,
          selectedPengelolaLabel: pengelolaFilter !== 'all' ? pengelolaFilter : undefined,
          proposalSlotMap,
          includeEmptySlots: false,
        });
        setFeedback({
          type: 'success',
          text: `PDF berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      } else {
        const res = await exportKpmTableToXlsx({
          records: filteredRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          proposalSlotMap,
          title,
          subtitle,
          fileName,
          includeEmptySlots: false,
          splitByPengelola,
        });
        setFeedback({
          type: 'success',
          text: `Excel berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat dokumen ekspor.',
      });
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="max-w-lg">
        <SegmentedTabs
          value={sourceMode}
          onChange={(v) => {
            setSourceMode(v);
            setFeedback(null);
          }}
          tabs={[
            { key: 'database', label: 'Database KPM', count: databaseCount },
            { key: 'arsip', label: 'Arsip Ditolak', count: arsipCount },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Filter Domisili &amp; Atribut</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Saring data sebelum diunduh ke PDF F4 atau Excel.
              </p>
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset ({activeFiltersCount})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Tahun</label>
              <FilterSelect ariaLabel="Filter tahun" value={yearFilter} onChange={setYearFilter}>
                <option value="all">Semua Tahun</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Kecamatan
              </label>
              <FilterSelect
                ariaLabel="Filter kecamatan"
                value={kecamatanFilter}
                onChange={(v) => {
                  setKecamatanFilter(v);
                  setKelurahanFilter('all');
                }}
              >
                <option value="all">Semua Kecamatan</option>
                {kecamatanOptions.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Kelurahan / Desa
              </label>
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
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Pengelola</label>
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
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Item Bantuan
              </label>
              <FilterSelect ariaLabel="Filter item" value={itemFilter} onChange={setItemFilter}>
                <option value="all">Semua Item</option>
                {itemOptions.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Desil DTSEN
              </label>
              <FilterSelect ariaLabel="Filter desil" value={dtsenFilter} onChange={setDtsenFilter}>
                <option value="all">Semua Desil</option>
                {DTSEN_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
            <div>
              <p className="text-xs font-semibold text-slate-800">
                Pisahkan halaman / sheet per Pengelola
              </p>
              <p className="text-[11px] text-slate-500">
                Kelompokkan hasil ekspor berdasarkan pengelola lapangan masing-masing.
              </p>
            </div>
            <input
              type="checkbox"
              checked={splitByPengelola}
              onChange={(e) => setSplitByPengelola(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-5 lg:sticky lg:top-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
              Ringkasan Ekspor
            </p>
            <h3 className="mt-0.5 text-base font-bold text-slate-900">
              {sourceMode === 'database' ? 'Database KPM (Menunggu)' : 'Arsip Berkas Ditolak'}
            </h3>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-600">Data sesuai filter</span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums">
                {filteredRecords.length}
              </span>
            </div>
            {itemBreakdown.length > 0 && (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 tabular-nums">
                {itemBreakdown.map(([code, qty]) => `${code}: ${qty}`).join(' · ')}
              </p>
            )}
          </div>

          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={filteredRecords.length === 0 || busyFormat !== null}
              onClick={() => void handleExport('pdf')}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {busyFormat === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>Unduh PDF F4 ({filteredRecords.length} KPM)</span>
            </button>

            <button
              type="button"
              disabled={filteredRecords.length === 0 || busyFormat !== null}
              onClick={() => void handleExport('xlsx')}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busyFormat === 'xlsx' ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              )}
              <span>Unduh Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
