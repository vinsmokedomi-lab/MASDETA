import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import { FilterSelect } from './FormControls';
import { DEFAULT_PDF_COLUMN_KEYS } from '../utils/pdfFormatHelpers';
import { exportKpmTableToPdf } from '../utils/pdfExporter';
import { exportKpmTableToXlsx } from '../utils/xlsxExporter';

type PengelolaStatusFilter = 'all' | 'approved' | 'database' | 'arsip';

interface PengelolaExportModalProps {
  pengelolaName: string;
  records: KpmRecord[];
  allRecords: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  reportTemplate?: ReportTemplateConfig;
  proposalSlotMap?: ProposalSlotMap;
  onClose: () => void;
}

export function PengelolaExportModal({
  pengelolaName,
  records,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  reportTemplate,
  proposalSlotMap = {},
  onClose,
}: PengelolaExportModalProps) {
  const [statusFilter, setStatusFilter] = useState<PengelolaStatusFilter>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [splitByProposal, setSplitByProposal] = useState<boolean>(true);
  const [busyFormat, setBusyFormat] = useState<'pdf' | 'xlsx' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const pengelolaRecords = useMemo(() => {
    const key = pengelolaName.trim().toLowerCase();
    return records.filter((r) => (r.pengelola || '').trim().toLowerCase() === key);
  }, [records, pengelolaName]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    pengelolaRecords.forEach((r) => {
      const y = (r.tahun || '').trim();
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [pengelolaRecords]);

  const filteredRecords = useMemo(() => {
    return pengelolaRecords.filter((r) => {
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
  }, [pengelolaRecords, yearFilter, statusFilter]);

  const itemSummary = useMemo(() => {
    const counts = new Map<string, number>();
    filteredRecords.forEach((r) => {
      const code = (r.item || 'Tanpa Item').trim() || 'Tanpa Item';
      counts.set(code, (counts.get(code) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const statusLabelMap: Record<PengelolaStatusFilter, string> = {
    all: 'Semua Status',
    approved: 'Masuk Proposal / Diterima',
    database: 'Database KPM (Menunggu)',
    arsip: 'Arsip Ditolak',
  };

  const buildSubtitle = () => {
    const parts = [`Pengelola: ${pengelolaName}`];
    if (statusFilter !== 'all') parts.push(statusLabelMap[statusFilter]);
    if (yearFilter !== 'all') parts.push(`Tahun ${yearFilter}`);
    return parts.join(' · ');
  };

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    if (filteredRecords.length === 0 || busyFormat) return;
    setBusyFormat(format);
    setFeedback(null);
    const safeSlug = pengelolaName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const yearSuffix = yearFilter !== 'all' ? `_${yearFilter}` : '';
    const fileName = `KPM_Pengelola_${safeSlug || 'Data'}${yearSuffix}`;
    const title = `DAFTAR KPM PENGELOLA - ${pengelolaName.toUpperCase()}`;
    const subtitle = buildSubtitle();

    try {
      if (format === 'pdf') {
        const res = await exportKpmTableToPdf({
          records: filteredRecords,
          allRecords,
          proposals,
          items,
          wilayahList,
          selectedColumns: DEFAULT_PDF_COLUMN_KEYS,
          title,
          subtitle,
          fileName,
          includeSummary: true,
          reportTemplate,
          splitByProposal,
          selectedPengelolaLabel: pengelolaName,
          proposalSlotMap,
          includeEmptySlots: false,
        });
        setFeedback({
          type: 'success',
          text: `PDF berhasil dibuat (${res.count} KPM) — ${res.savedFileName}`,
        });
      } else {
        const res = await exportKpmTableToXlsx({
          records: filteredRecords,
          allRecords,
          proposals,
          items,
          wilayahList,
          proposalSlotMap,
          title,
          subtitle,
          fileName,
          includeEmptySlots: false,
          splitByProposal,
        });
        setFeedback({
          type: 'success',
          text: `Excel berhasil dibuat (${res.count} KPM) — ${res.savedFileName}`,
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
              Unduh Data KPM Pengelola
            </p>
            <h3 className="mt-0.5 truncate text-base font-bold text-slate-900">
              {pengelolaName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup dialog"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Status KPM
              </label>
              <FilterSelect
                ariaLabel="Filter status KPM"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as PengelolaStatusFilter)}
              >
                <option value="all">Semua Status ({pengelolaRecords.length})</option>
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
                ariaLabel="Filter tahun anggaran"
                value={yearFilter}
                onChange={setYearFilter}
              >
                <option value="all">Semua Tahun</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 transition-colors hover:bg-slate-50">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">
                Pisahkan halaman / sheet per Proposal
              </p>
              <p className="text-[11px] text-slate-500">
                Memudahkan pengecekan jika KPM pengelola tersebar di beberapa proposal.
              </p>
            </div>
            <input
              type="checkbox"
              checked={splitByProposal}
              onChange={(e) => setSplitByProposal(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
          </label>

          {/* Ringkasan KPM Terpilih */}
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">
                Data KPM siap diunduh
              </span>
              <span className="text-lg font-bold text-slate-900 tabular-nums">
                {filteredRecords.length} KPM
              </span>
            </div>
            {itemSummary.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {itemSummary.map(([code, qty]) => `${code}: ${qty}`).join(' · ')}
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
              {feedback.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Download className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={filteredRecords.length === 0 || busyFormat !== null}
            onClick={() => void handleExport('xlsx')}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            {busyFormat === 'xlsx' ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            )}
            <span>Unduh Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={filteredRecords.length === 0 || busyFormat !== null}
            onClick={() => void handleExport('pdf')}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            {busyFormat === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span>Unduh PDF (F4)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
