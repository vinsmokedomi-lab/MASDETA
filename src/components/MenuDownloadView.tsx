import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  DEFAULT_REPORT_TEMPLATE,
  ItemBantuan,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  isKecamatanProposal,
  resolveProposalKecamatanCategory,
  sortKecamatanCategoryNames,
} from '../utils/imageProcessor';
import { exportKpmRecordsToExcel } from '../utils/excelExporter';
import {
  ADDON_PDF_COLUMN_DEFINITIONS,
  DEFAULT_ADDON_PDF_COLUMN_KEYS,
  MANDATORY_PDF_COLUMN_KEYS,
  MAX_PDF_TOTAL_COLUMNS,
  PDF_COLUMN_DEFINITIONS,
  PdfColumnKey,
  exportKpmTableToPdf,
} from '../utils/pdfExporter';
import { SelectionPickerModal, SelectionPickerOption } from './SelectionPickerModal';
import { useIsDesktopWeb } from '../utils/platform';

interface MenuDownloadViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  pengelolaList: PengelolaProfile[];
  reportTemplate?: ReportTemplateConfig;
  onSaveReportTemplate?: (next: ReportTemplateConfig) => void;
  onBack: () => void;
}

export function MenuDownloadView({
  records,
  proposals,
  items,
  wilayahList,
  pengelolaList,
  reportTemplate,
  onSaveReportTemplate,
  onBack,
}: MenuDownloadViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    records.forEach((r) => {
      if (r.tahun) set.add(r.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [proposals, records]);

  const [selectedTahun, setSelectedTahun] = useState<string>(() => yearOptions[0] || '2026');
  const [selectedProposal, setSelectedProposal] = useState<string>('all');
  const [selectedPengelola, setSelectedPengelola] = useState<string>('all');
  const [selectedAddonColumns, setSelectedAddonColumns] = useState<PdfColumnKey[]>(
    DEFAULT_ADDON_PDF_COLUMN_KEYS
  );
  const [includeSummary, setIncludeSummary] = useState(true);

  const [isTahunModalOpen, setIsTahunModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isPengelolaModalOpen, setIsPengelolaModalOpen] = useState(false);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [limitNotice, setLimitNotice] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [excelFeedback, setExcelFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<ReportTemplateConfig>(
    () => reportTemplate ?? DEFAULT_REPORT_TEMPLATE
  );
  const [templateSavedNotice, setTemplateSavedNotice] = useState(false);

  useEffect(() => {
    if (reportTemplate) {
      setTemplateDraft(reportTemplate);
    }
  }, [reportTemplate]);

  const yearScopedProposals = useMemo(() => {
    if (selectedTahun === 'all') return proposals;
    return proposals.filter((p) => p.tahun === selectedTahun);
  }, [proposals, selectedTahun]);

  const availableProposalItems = useMemo(() => {
    const map = new Map<string, { name: string; kecamatanGroup: string; tipe?: string }>();
    for (const p of yearScopedProposals) {
      const kecGroup = resolveProposalKecamatanCategory(
        p.namaProposal,
        proposals,
        p.tahun,
        wilayahList
      );
      if (!map.has(p.namaProposal)) {
        map.set(p.namaProposal, {
          name: p.namaProposal,
          kecamatanGroup: kecGroup,
          tipe: p.tipe,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const grp = sortKecamatanCategoryNames(a.kecamatanGroup, b.kecamatanGroup);
      if (grp !== 0) return grp;
      const isKecA = isKecamatanProposal(a.name);
      const isKecB = isKecamatanProposal(b.name);
      if (isKecA !== isKecB) return isKecA ? -1 : 1;
      return a.name.localeCompare(b.name, 'id');
    });
  }, [yearScopedProposals, proposals, wilayahList]);

  const recordsBeforePengelola = useMemo(() => {
    return records.filter((rec) => {
      if (selectedTahun !== 'all' && rec.tahun !== selectedTahun) return false;
      if (selectedProposal !== 'all' && rec.proposal !== selectedProposal) return false;
      return true;
    });
  }, [records, selectedTahun, selectedProposal]);

  const pengelolaOptions = useMemo(() => {
    const countMap = new Map<string, number>();
    recordsBeforePengelola.forEach((r) => {
      const name = (r.pengelola || '').trim();
      if (!name) return;
      countMap.set(name, (countMap.get(name) || 0) + 1);
    });
    if (countMap.size === 0) {
      pengelolaList.forEach((p) => {
        if (p.displayName) countMap.set(p.displayName, 0);
      });
    }
    return Array.from(countMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'id'))
      .map(([name, count]) => ({ name, count }));
  }, [recordsBeforePengelola, pengelolaList]);

  const filteredRecords = useMemo(() => {
    if (selectedPengelola === 'all') return recordsBeforePengelola;
    return recordsBeforePengelola.filter(
      (r) => r.pengelola.trim().toLowerCase() === selectedPengelola.trim().toLowerCase()
    );
  }, [recordsBeforePengelola, selectedPengelola]);

  const maxAddonCount = MAX_PDF_TOTAL_COLUMNS - MANDATORY_PDF_COLUMN_KEYS.length; // 6 add-on

  const activeColumns = useMemo(() => {
    const merged = new Set<PdfColumnKey>([...MANDATORY_PDF_COLUMN_KEYS, ...selectedAddonColumns]);
    return PDF_COLUMN_DEFINITIONS.filter((c) => merged.has(c.key)).slice(
      0,
      MAX_PDF_TOTAL_COLUMNS
    );
  }, [selectedAddonColumns]);

  const totalColumnCount = activeColumns.length;
  const isAtColumnLimit = totalColumnCount >= MAX_PDF_TOTAL_COLUMNS;

  const toggleAddonColumn = (key: PdfColumnKey) => {
    setPdfFeedback(null);
    setSelectedAddonColumns((prev) => {
      if (prev.includes(key)) {
        setLimitNotice(false);
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= maxAddonCount) {
        setLimitNotice(true);
        return prev;
      }
      setLimitNotice(false);
      return [...prev, key];
    });
  };

  const handleSelectTahun = (nextTahun: string) => {
    setSelectedTahun(nextTahun);
    setSelectedProposal('all');
    setSelectedPengelola('all');
    setPdfFeedback(null);
    setExcelFeedback(null);
  };

  const handleSelectProposal = (nextProp: string) => {
    setSelectedProposal(nextProp);
    setSelectedPengelola('all');
    setPdfFeedback(null);
    setExcelFeedback(null);
  };

  const buildScopeTitleAndFileName = () => {
    const yearSuffix = selectedTahun === 'all' ? 'Semua Tahun' : selectedTahun;
    const baseScope =
      selectedProposal !== 'all' ? selectedProposal : 'Daftar Calon KPM MASDETA';

    const title = `${baseScope} ${yearSuffix}`.trim();

    const subParts: string[] = [];
    if (selectedPengelola !== 'all') {
      subParts.push(`Pengelola: ${selectedPengelola}`);
    }
    subParts.push(`Total: ${filteredRecords.length} KPM`);

    const fileBase = `${selectedTahun === 'all' ? 'Semua_Tahun' : selectedTahun}_${baseScope}${
      selectedPengelola !== 'all' ? `_${selectedPengelola}` : ''
    }`;

    return {
      title,
      subtitle: subParts.join('  ·  '),
      fileName: fileBase,
    };
  };

  const handleDownloadPdf = async () => {
    if (filteredRecords.length === 0 || isGeneratingPdf) return;
    setPdfFeedback(null);
    setIsGeneratingPdf(true);
    try {
      const { title, subtitle, fileName } = buildScopeTitleAndFileName();
      const res = await exportKpmTableToPdf({
        records: filteredRecords,
        proposals,
        items,
        wilayahList,
        selectedColumns: activeColumns.map((c) => c.key),
        title,
        subtitle,
        fileName,
        includeSummary,
        reportTemplate: templateDraft,
      });
      setPdfFeedback({
        type: 'success',
        message: res.openedNative
          ? `PDF "${res.savedFileName}" (${res.count} KPM) berhasil dibuat dan dibuka.`
          : `PDF "${res.savedFileName}" (${res.count} KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF.',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (filteredRecords.length === 0 || isGeneratingExcel) return;
    setExcelFeedback(null);
    setIsGeneratingExcel(true);
    try {
      const { fileName } = buildScopeTitleAndFileName();
      const res = await exportKpmRecordsToExcel({
        records: filteredRecords,
        proposals,
        items,
        wilayahList,
        fileName,
        reportTemplate: templateDraft,
      });
      setExcelFeedback({
        type: 'success',
        message: res.openedNative
          ? `Excel "${res.savedFileName}" (${res.count} KPM) berhasil dibuat dan dibuka.`
          : `Excel "${res.savedFileName}" (${res.count} KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setExcelFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file Excel.',
      });
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {isNativeApp && (
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali ke Menu"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Download Data</h1>
      </header>
      )}

      <div
        className={`space-y-3.5 px-4 pt-3.5 ${
          !isNativeApp
            ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6 md:grid md:grid-cols-12 md:items-start md:gap-6 md:space-y-0'
            : ''
        }`}
      >
        {!isNativeApp && (
          <div className="flex items-center gap-3 md:col-span-12">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Kembali ke Menu"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
              Download Data
            </h1>
          </div>
        )}

        {/* Card 1: Filter Cetak PDF (Tahun, Pengelola, Proposal) */}
        <section
          className={`rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 ${
            !isNativeApp ? 'md:col-span-5 md:col-start-1 md:p-4' : ''
          }`}
        >
          <h2 className="text-sm font-bold text-slate-900">Filter Cetak PDF</h2>

          {/* Baris 1: Tahun + Pengelola */}
          <div className="grid grid-cols-[108px_1fr] gap-2">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tahun
              </span>
              <button
                type="button"
                onClick={() => setIsTahunModalOpen(true)}
                className="mt-1 flex min-h-[42px] w-full items-center justify-between gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-left text-xs font-medium text-slate-900 hover:bg-slate-50"
              >
                <span className="truncate">
                  {selectedTahun === 'all' ? 'Semua' : selectedTahun}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              </button>
            </div>

            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Pengelola
              </span>
              <button
                type="button"
                onClick={() => setIsPengelolaModalOpen(true)}
                className="mt-1 flex min-h-[42px] w-full items-center justify-between gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-left text-xs font-medium text-slate-900 hover:bg-slate-50"
              >
                <span className="truncate">
                  {selectedPengelola === 'all' ? 'Semua Pengelola' : selectedPengelola}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Baris 2: Proposal penuh agar nama kecamatan/kelurahan terbaca utuh */}
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Proposal
            </span>
            <button
              type="button"
              onClick={() => setIsProposalModalOpen(true)}
              className="mt-1 flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-xs font-medium text-slate-900 hover:bg-slate-50"
            >
              <span className="truncate">
                {selectedProposal === 'all' ? 'Semua Proposal' : selectedProposal}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>
          </div>
        </section>

        {/* Card 2: Pilih Kolom Add-On PDF (Wajib: NO, ITEM, NAMA, ALAMAT | Maks 10 Kolom Total) */}
        <section
          className={`rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 ${
            !isNativeApp ? 'md:col-span-7 md:col-start-6 md:row-span-3 md:p-5' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Pilih Kolom Tabel PDF</h2>
            <span
              className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                isAtColumnLimit ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              {totalColumnCount}/{MAX_PDF_TOTAL_COLUMNS} Kolom
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {ADDON_PDF_COLUMN_DEFINITIONS.map((col) => {
              const checked = selectedAddonColumns.includes(col.key);
              const blockedByLimit = !checked && isAtColumnLimit;
              return (
                <button
                  key={col.key}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleAddonColumn(col.key)}
                  className={`flex min-h-[42px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    checked
                      ? 'border-teal-700/50 bg-teal-50/70 text-slate-900'
                      : blockedByLimit
                        ? 'border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : blockedByLimit
                          ? 'border-slate-200 bg-slate-100'
                          : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate text-xs font-semibold">{col.uiLabel}</span>
                </button>
              );
            })}
          </div>

          {limitNotice && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span>
                Maksimal {MAX_PDF_TOTAL_COLUMNS} kolom agar tabel tetap rapi di kertas F4 Portrait.
                Hapus salah satu centang terlebih dahulu.
              </span>
            </div>
          )}

          {/* Pratinjau Urutan Kolom Aktif */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Urutan Kolom PDF Aktif
            </p>
            <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-800">
              {activeColumns.map((c) => c.pdfHeader).join('  |  ')}
            </p>
          </div>

          <button
            type="button"
            role="checkbox"
            aria-checked={includeSummary}
            onClick={() => setIncludeSummary((prev) => !prev)}
            className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
          >
            <span
              className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                includeSummary
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {includeSummary && <Check className="h-3 w-3" />}
            </span>
            <span className="text-xs font-medium text-slate-700">
              Sertakan ringkasan <strong>Daftar Item</strong> &amp; <strong>Pengelola</strong> di akhir PDF
            </span>
          </button>

          {pdfFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                pdfFeedback.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              {pdfFeedback.type === 'success' ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <p className="font-medium leading-snug">{pdfFeedback.message}</p>
            </div>
          )}

          <button
            type="button"
            disabled={filteredRecords.length === 0 || isGeneratingPdf}
            onClick={() => void handleDownloadPdf()}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
                <span>Menyiapkan PDF F4...</span>
              </>
            ) : (
              <>
                <Printer className="h-4.5 w-4.5" />
                <span>Download PDF F4 ({filteredRecords.length} KPM)</span>
              </>
            )}
          </button>

          {/* Keterangan spesifikasi kertas F4 Portrait di bawah tombol Download PDF */}
          <p className="text-center text-[11px] leading-relaxed text-slate-500">
            Kertas F4 Portrait (216 × 310 mm) · Margin Kiri 1,5 cm · Atas, Kanan &amp; Bawah 1 cm
          </p>
        </section>

        {/* Card 3: Ekspor Excel (.xlsx) Sesuai Filter */}
        <section
          className={`rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 ${
            !isNativeApp ? 'md:col-span-5 md:col-start-1 md:p-4' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-900">Ekspor Excel (.xlsx)</h2>
          </div>

          {excelFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                excelFeedback.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              {excelFeedback.type === 'success' ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <p className="font-medium leading-snug">{excelFeedback.message}</p>
            </div>
          )}

          <button
            type="button"
            disabled={filteredRecords.length === 0 || isGeneratingExcel}
            onClick={() => void handleDownloadExcel()}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {isGeneratingExcel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menyiapkan Excel...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                <span>Download Excel (.xlsx) ({filteredRecords.length} KPM)</span>
              </>
            )}
          </button>
        </section>

        {/* Card 4: Template Kop Surat & Penandatangan Resmi */}
        <section
          className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${
            !isNativeApp ? 'md:col-span-5 md:col-start-1' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setShowTemplateEditor((prev) => !prev)}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  Template Kop &amp; Penandatangan Resmi
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {templateDraft.enabled
                    ? `${templateDraft.orgHeaderLine2} · Aktif pada PDF, Excel & BAST`
                    : 'Nonaktif · Ketuk untuk mengaktifkan kop instansi'}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                showTemplateEditor ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showTemplateEditor && (
            <div className="space-y-3 border-t border-slate-100 px-4 py-3.5">
              <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800">
                <span>Sertakan Kop Surat &amp; Blok Tanda Tangan</span>
                <input
                  type="checkbox"
                  checked={templateDraft.enabled}
                  onChange={(e) => {
                    setTemplateSavedNotice(false);
                    setTemplateDraft((prev) => ({ ...prev, enabled: e.target.checked }));
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
              </label>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Baris Atas Kop Instansi
                  </label>
                  <input
                    type="text"
                    value={templateDraft.orgHeaderLine1}
                    onChange={(e) => {
                      setTemplateSavedNotice(false);
                      setTemplateDraft((prev) => ({ ...prev, orgHeaderLine1: e.target.value }));
                    }}
                    placeholder="Contoh: PEMERINTAH KOTA PONTIANAK"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nama Dinas / Unit Pengelola
                  </label>
                  <input
                    type="text"
                    value={templateDraft.orgHeaderLine2}
                    onChange={(e) => {
                      setTemplateSavedNotice(false);
                      setTemplateDraft((prev) => ({ ...prev, orgHeaderLine2: e.target.value }));
                    }}
                    placeholder="Contoh: DINAS SOSIAL / TIM KOORDINASI MASDETA"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Alamat / Kontak Sekretariat
                  </label>
                  <input
                    type="text"
                    value={templateDraft.orgAddress}
                    onChange={(e) => {
                      setTemplateSavedNotice(false);
                      setTemplateDraft((prev) => ({ ...prev, orgAddress: e.target.value }));
                    }}
                    placeholder="Alamat sekretariat"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Kota Penandatanganan
                    </label>
                    <input
                      type="text"
                      value={templateDraft.city}
                      onChange={(e) => {
                        setTemplateSavedNotice(false);
                        setTemplateDraft((prev) => ({ ...prev, city: e.target.value }));
                      }}
                      placeholder="Pontianak"
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Jabatan Penandatangan
                    </label>
                    <input
                      type="text"
                      value={templateDraft.signatoryTitle}
                      onChange={(e) => {
                        setTemplateSavedNotice(false);
                        setTemplateDraft((prev) => ({ ...prev, signatoryTitle: e.target.value }));
                      }}
                      placeholder="Koordinator Pelaksana"
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Nama Penandatangan
                    </label>
                    <input
                      type="text"
                      value={templateDraft.signatoryName}
                      onChange={(e) => {
                        setTemplateSavedNotice(false);
                        setTemplateDraft((prev) => ({ ...prev, signatoryName: e.target.value }));
                      }}
                      placeholder="( ................................ )"
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      NIP / NRP (Opsional)
                    </label>
                    <input
                      type="text"
                      value={templateDraft.signatoryNip || ''}
                      onChange={(e) => {
                        setTemplateSavedNotice(false);
                        setTemplateDraft((prev) => ({ ...prev, signatoryNip: e.target.value }));
                      }}
                      placeholder="NIP. ..."
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {templateSavedNotice && (
                <p className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>Template Kop &amp; Penandatangan berhasil disimpan.</span>
                </p>
              )}

              {onSaveReportTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveReportTemplate(templateDraft);
                    setTemplateSavedNotice(true);
                  }}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Simpan Template</span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Pop-up Pilihan Tahun */}
      <SelectionPickerModal
        isOpen={isTahunModalOpen}
        title="Pilih Tahun"
        options={[
          { value: 'all', label: 'Semua Tahun', subtitle: 'Gabungkan seluruh tahun anggaran' },
          ...yearOptions.map(
            (yr): SelectionPickerOption => ({
              value: yr,
              label: `Tahun ${yr}`,
            })
          ),
        ]}
        selectedValue={selectedTahun}
        onClose={() => setIsTahunModalOpen(false)}
        onSelect={handleSelectTahun}
      />

      {/* Pop-up Pilihan Proposal (Terkelompok per Kecamatan) */}
      <SelectionPickerModal
        isOpen={isProposalModalOpen}
        title="Pilih Proposal"
        options={[
          {
            value: 'all',
            label: 'Semua Proposal',
            group: 'Pilihan Umum',
            subtitle: 'Gabungkan semua proposal yang cocok',
          },
          ...availableProposalItems.map(
            (item): SelectionPickerOption => ({
              value: item.name,
              label: item.name,
              group: item.kecamatanGroup,
              subtitle: item.tipe ? `Proposal ${item.tipe}` : undefined,
            })
          ),
        ]}
        selectedValue={selectedProposal}
        onClose={() => setIsProposalModalOpen(false)}
        onSelect={handleSelectProposal}
        searchable
        searchPlaceholder="Pencarian..."
      />

      {/* Pop-up Pilihan Pengelola */}
      <SelectionPickerModal
        isOpen={isPengelolaModalOpen}
        title="Pilih Pengelola"
        options={[
          {
            value: 'all',
            label: 'Semua Pengelola',
            subtitle: `${recordsBeforePengelola.length} KPM tersedia`,
          },
          ...pengelolaOptions.map(
            (p): SelectionPickerOption => ({
              value: p.name,
              label: p.name,
              subtitle: `${p.count} KPM sesuai filter`,
            })
          ),
        ]}
        selectedValue={selectedPengelola}
        onClose={() => setIsPengelolaModalOpen(false)}
        onSelect={(val) => {
          setSelectedPengelola(val);
          setPdfFeedback(null);
          setExcelFeedback(null);
        }}
        searchable
        searchPlaceholder="Pencarian..."
      />
    </div>
  );
}
