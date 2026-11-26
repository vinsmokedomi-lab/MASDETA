import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  PengelolaBookingItem,
  PengelolaBookingStatus,
  PengelolaProfile,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { DEFAULT_PDF_COLUMN_KEYS } from '../utils/pdfFormatHelpers';
import { exportKpmTableToPdf } from '../utils/pdfExporter';
import { exportKpmTableToXlsx } from '../utils/xlsxExporter';
import {
  exportPengelolaBookingsToPdf,
  exportPengelolaBookingsToXlsx,
} from '../utils/bookingExporter';

type KpmStatusFilter = 'all' | 'approved' | 'database' | 'arsip';

interface DownloadPengelolaPanelProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pengelolaList: PengelolaProfile[];
  wilayahList?: WilayahKabKota[];
  reportTemplate?: ReportTemplateConfig;
  proposalSlotMap?: ProposalSlotMap;
  pengelolaBookings?: PengelolaBookingItem[];
}

export function DownloadPengelolaPanel({
  records,
  proposals,
  items,
  pengelolaList,
  wilayahList = INITIAL_WILAYAH_LIST,
  reportTemplate,
  proposalSlotMap = {},
  pengelolaBookings = [],
}: DownloadPengelolaPanelProps) {
  const [subTab, setSubTab] = useState<'kpm' | 'booking'>('kpm');

  // --- KPM per Pengelola state ---
  const [scopeMode, setScopeMode] = useState<'single' | 'all_split'>('single');
  const [selectedPengelola, setSelectedPengelola] = useState<string>('');
  const [pengelolaSearch, setPengelolaSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<KpmStatusFilter>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [splitByProposal, setSplitByProposal] = useState<boolean>(true);
  const [kpmBusy, setKpmBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const [kpmFeedback, setKpmFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // --- Booking export state ---
  const [bookingYearFilter, setBookingYearFilter] = useState<string>('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | PengelolaBookingStatus>(
    'all'
  );
  const [bookingBusy, setBookingBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const [bookingFeedback, setBookingFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.tahun?.trim()) set.add(r.tahun.trim());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const statusFilteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (yearFilter !== 'all' && (r.tahun || '').trim() !== yearFilter) return false;
      if (statusFilter === 'approved') {
        return r.validasi === 'accepted' || Boolean((r.proposal || '').trim());
      }
      if (statusFilter === 'database') {
        return r.validasi === 'pending' && !(r.proposal || '').trim();
      }
      if (statusFilter === 'arsip') {
        return r.validasi === 'rejected' && !(r.proposal || '').trim();
      }
      return true;
    });
  }, [records, yearFilter, statusFilter]);

  const pengelolaDirectory = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    pengelolaList.forEach((p) => {
      const k = p.displayName.trim().toLowerCase();
      if (k && !map.has(k)) map.set(k, { name: p.displayName.trim(), count: 0 });
    });
    statusFilteredRecords.forEach((r) => {
      const raw = (r.pengelola || '').trim();
      if (!raw) return;
      const k = raw.toLowerCase();
      const prev = map.get(k);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(k, { name: raw, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'));
  }, [pengelolaList, statusFilteredRecords]);

  const visiblePengelolaChoices = useMemo(() => {
    const q = pengelolaSearch.trim().toLowerCase();
    return pengelolaDirectory.filter(
      (p) => !q || p.name.toLowerCase().includes(q)
    );
  }, [pengelolaDirectory, pengelolaSearch]);

  const targetKpmRecords = useMemo(() => {
    if (scopeMode === 'all_split') {
      return statusFilteredRecords;
    }
    if (!selectedPengelola.trim()) return [];
    const targetKey = selectedPengelola.trim().toLowerCase();
    return statusFilteredRecords.filter(
      (r) => (r.pengelola || '').trim().toLowerCase() === targetKey
    );
  }, [scopeMode, selectedPengelola, statusFilteredRecords]);

  const itemSummary = useMemo(() => {
    const map = new Map<string, number>();
    targetKpmRecords.forEach((r) => {
      const code = (r.item || 'Tanpa Item').trim() || 'Tanpa Item';
      map.set(code, (map.get(code) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [targetKpmRecords]);

  const statusLabels: Record<KpmStatusFilter, string> = {
    all: 'Semua Status',
    approved: 'Masuk Proposal / Diterima',
    database: 'Database KPM (Menunggu)',
    arsip: 'Arsip Ditolak',
  };

  const handleExportKpm = async (format: 'pdf' | 'xlsx') => {
    if (targetKpmRecords.length === 0 || kpmBusy) return;
    setKpmBusy(format);
    setKpmFeedback(null);

    const isSingle = scopeMode === 'single';
    const title = isSingle
      ? `DAFTAR KPM PENGELOLA - ${selectedPengelola.toUpperCase()}`
      : 'DAFTAR KPM PER PENGELOLA';
    const subtitleParts = [
      isSingle ? `Pengelola: ${selectedPengelola}` : 'Semua Pengelola (Terpisah per Pengelola)',
      statusFilter !== 'all' ? statusLabels[statusFilter] : 'Semua Status',
      yearFilter !== 'all' ? `Tahun ${yearFilter}` : 'Semua Tahun',
    ];
    const slug = isSingle
      ? selectedPengelola.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
      : 'Semua_Pengelola';
    const fileName = `KPM_Pengelola_${slug}${yearFilter !== 'all' ? `_${yearFilter}` : ''}`;

    try {
      if (format === 'pdf') {
        const res = await exportKpmTableToPdf({
          records: targetKpmRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          selectedColumns: DEFAULT_PDF_COLUMN_KEYS,
          title,
          subtitle: subtitleParts.join(' · '),
          fileName,
          includeSummary: true,
          reportTemplate,
          splitByPengelola: !isSingle,
          splitByProposal: isSingle ? splitByProposal : false,
          selectedPengelolaLabel: isSingle ? selectedPengelola : undefined,
          proposalSlotMap,
          includeEmptySlots: false,
        });
        setKpmFeedback({
          type: 'success',
          text: `PDF berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      } else {
        const res = await exportKpmTableToXlsx({
          records: targetKpmRecords,
          allRecords: records,
          proposals,
          items,
          wilayahList,
          proposalSlotMap,
          title,
          subtitle: subtitleParts.join(' · '),
          fileName,
          includeEmptySlots: false,
          splitByPengelola: !isSingle,
          splitByProposal: isSingle ? splitByProposal : false,
        });
        setKpmFeedback({
          type: 'success',
          text: `Excel berhasil diunduh (${res.count} KPM) — ${res.savedFileName}`,
        });
      }
    } catch (err) {
      setKpmFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengekspor data KPM pengelola.',
      });
    } finally {
      setKpmBusy(null);
    }
  };

  // --- Booking filtering ---
  const bookingYearOptions = useMemo(() => {
    const set = new Set<string>();
    pengelolaBookings.forEach((b) => {
      if (b.targetTahun?.trim()) set.add(b.targetTahun.trim());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [pengelolaBookings]);

  const filteredBookings = useMemo(() => {
    return pengelolaBookings.filter((b) => {
      if (bookingYearFilter !== 'all' && b.targetTahun !== bookingYearFilter) return false;
      if (bookingStatusFilter !== 'all' && b.status !== bookingStatusFilter) return false;
      return true;
    });
  }, [pengelolaBookings, bookingYearFilter, bookingStatusFilter]);

  const totalBookingEstKpm = useMemo(
    () =>
      filteredBookings
        .filter((b) => b.status !== 'cancelled')
        .reduce((acc, b) => acc + Math.max(0, Number(b.estimasiKpm) || 0), 0),
    [filteredBookings]
  );

  const handleExportBookings = async (format: 'pdf' | 'xlsx') => {
    if (filteredBookings.length === 0 || bookingBusy) return;
    setBookingBusy(format);
    setBookingFeedback(null);
    const yrLabel = bookingYearFilter !== 'all' ? `Tahun ${bookingYearFilter}` : 'Semua Tahun';
    const title = `DAFTAR BOOKING PENGELOLA (${yrLabel.toUpperCase()})`;
    const fileName = `Booking_Pengelola_${bookingYearFilter !== 'all' ? bookingYearFilter : 'Semua'}`;
    try {
      if (format === 'pdf') {
        const res = await exportPengelolaBookingsToPdf({
          bookings: filteredBookings,
          title,
          subtitle: 'Rencana Pengelola & Estimasi Kuota Tahun Berikutnya',
          fileName,
        });
        setBookingFeedback({
          type: 'success',
          text: `PDF daftar booking berhasil diunduh (${res.count} data) — ${res.savedFileName}`,
        });
      } else {
        const res = await exportPengelolaBookingsToXlsx({
          bookings: filteredBookings,
          title,
          fileName,
        });
        setBookingFeedback({
          type: 'success',
          text: `Excel daftar booking berhasil diunduh (${res.count} data) — ${res.savedFileName}`,
        });
      }
    } catch (err) {
      setBookingFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengekspor daftar booking.',
      });
    } finally {
      setBookingBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="max-w-lg">
        <SegmentedTabs
          value={subTab}
          onChange={setSubTab}
          tabs={[
            { key: 'kpm', label: 'Data KPM per Pengelola' },
            { key: 'booking', label: 'Booking Tahun Depan', count: pengelolaBookings.length },
          ]}
        />
      </div>

      {subTab === 'kpm' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Kolom Kiri: Pengaturan Filter */}
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white lg:col-span-7">
            <div className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Cakupan Pengelola</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pilih satu pengelola spesifik atau cetak semua pengelola secara terpisah per halaman/sheet.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setScopeMode('single');
                    setKpmFeedback(null);
                  }}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    scopeMode === 'single'
                      ? 'border-teal-700 bg-teal-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">1 Pengelola Tertentu</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Khusus daftar KPM milik satu pengelola
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScopeMode('all_split');
                    setKpmFeedback(null);
                  }}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    scopeMode === 'all_split'
                      ? 'border-teal-700 bg-teal-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Semua (Pisah per Pengelola)</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      1 halaman PDF / 1 sheet Excel per pengelola
                    </p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Status KPM
                  </label>
                  <FilterSelect
                    ariaLabel="Filter status KPM pengelola"
                    value={statusFilter}
                    onChange={(v) => {
                      setStatusFilter(v as KpmStatusFilter);
                      setKpmFeedback(null);
                    }}
                  >
                    <option value="all">Semua Status</option>
                    <option value="approved">Masuk Proposal / Diterima</option>
                    <option value="database">Database KPM (Menunggu)</option>
                    <option value="arsip">Arsip Ditolak</option>
                  </FilterSelect>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Tahun Anggaran
                  </label>
                  <FilterSelect
                    ariaLabel="Filter tahun pengelola"
                    value={yearFilter}
                    onChange={(v) => {
                      setYearFilter(v);
                      setKpmFeedback(null);
                    }}
                  >
                    <option value="all">Semua Tahun</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        Tahun {y}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </div>
            </div>

            {scopeMode === 'single' && (
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-900">
                    Pilih Pengelola Lapangan
                  </label>
                  <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                    {pengelolaDirectory.filter((p) => p.count > 0).length} memiliki KPM
                  </span>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={pengelolaSearch}
                    onChange={(e) => setPengelolaSearch(e.target.value)}
                    placeholder="Cari nama pengelola..."
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {visiblePengelolaChoices.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">
                      Tidak ada pengelola ditemukan.
                    </p>
                  ) : (
                    visiblePengelolaChoices.map((p) => {
                      const active = selectedPengelola.toLowerCase() === p.name.toLowerCase();
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            setSelectedPengelola(p.name);
                            setKpmFeedback(null);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition-colors ${
                            active
                              ? 'bg-teal-50 font-semibold text-teal-900'
                              : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          <span
                            className={`shrink-0 tabular-nums ${
                              p.count > 0 ? 'font-semibold text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            {p.count} KPM
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 pt-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Pisahkan halaman / sheet per Proposal
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Setiap proposal milik pengelola dicetak pada bagian tersendiri.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={splitByProposal}
                    onChange={(e) => setSplitByProposal(e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Kolom Kanan: Ringkasan & Tombol Unduh */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-5 lg:sticky lg:top-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                Ringkasan Unduhan
              </p>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                {scopeMode === 'single'
                  ? selectedPengelola || 'Belum memilih pengelola'
                  : 'Semua Pengelola (Terpisah)'}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {statusLabels[statusFilter]} · {yearFilter === 'all' ? 'Semua Tahun' : `Tahun ${yearFilter}`}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-600">Total KPM siap cetak</span>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {targetKpmRecords.length}
                </span>
              </div>
              {itemSummary.length > 0 && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 tabular-nums">
                  {itemSummary.map(([code, qty]) => `${code}: ${qty}`).join(' · ')}
                </p>
              )}
            </div>

            {kpmFeedback && (
              <div
                className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                  kpmFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{kpmFeedback.text}</span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={targetKpmRecords.length === 0 || kpmBusy !== null}
                onClick={() => void handleExportKpm('pdf')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {kpmBusy === 'pdf' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span>Unduh PDF F4 ({targetKpmRecords.length} KPM)</span>
              </button>

              <button
                type="button"
                disabled={targetKpmRecords.length === 0 || kpmBusy !== null}
                onClick={() => void handleExportKpm('xlsx')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {kpmBusy === 'xlsx' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                )}
                <span>Unduh Excel (.xlsx)</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-7">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <CalendarClock className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Filter Daftar Booking Pengelola
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ekspor rencana pengelola dan estimasi kuota KPM untuk proposal tahun berikutnya.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Tahun Target
                </label>
                <FilterSelect
                  ariaLabel="Filter tahun target booking"
                  value={bookingYearFilter}
                  onChange={setBookingYearFilter}
                >
                  <option value="all">Semua Tahun Target</option>
                  {bookingYearOptions.map((y) => (
                    <option key={y} value={y}>
                      Tahun {y}
                    </option>
                  ))}
                </FilterSelect>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Status Booking
                </label>
                <FilterSelect
                  ariaLabel="Filter status booking"
                  value={bookingStatusFilter}
                  onChange={(v) => setBookingStatusFilter(v as 'all' | PengelolaBookingStatus)}
                >
                  <option value="all">Semua Status</option>
                  <option value="booked">Dibooking</option>
                  <option value="assigned">Masuk Proposal</option>
                  <option value="cancelled">Batal</option>
                </FilterSelect>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 lg:col-span-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                Ringkasan Booking
              </p>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                Rencana Proposal Tahun Depan
              </h3>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3.5 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">Jumlah catatan booking</span>
                <span className="text-xl font-bold text-slate-900 tabular-nums">
                  {filteredBookings.length}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">Estimasi total KPM</span>
                <span className="text-sm font-bold text-teal-800 tabular-nums">
                  {totalBookingEstKpm} KPM
                </span>
              </div>
            </div>

            {bookingFeedback && (
              <div
                className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                  bookingFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{bookingFeedback.text}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={filteredBookings.length === 0 || bookingBusy !== null}
                onClick={() => void handleExportBookings('pdf')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {bookingBusy === 'pdf' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span>Unduh PDF F4 Landscape</span>
              </button>

              <button
                type="button"
                disabled={filteredBookings.length === 0 || bookingBusy !== null}
                onClick={() => void handleExportBookings('xlsx')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {bookingBusy === 'xlsx' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                )}
                <span>Unduh Excel (.xlsx)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
