import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Package,
  Paintbrush,
  Users,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST, TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  ProposalTipe,
  ReportTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  computeSubItemRecap,
  getItemHierarchyRank,
  normalizeSubItemKey,
  resolvePackageForKpm,
} from '../utils/imageProcessor';
import {
  CatNomorOrientation,
  CatNomorPaperSize,
  buildCatNomorBarangMatrix,
} from '../utils/pdfFormatHelpers';
import { SegmentedTabs } from './FormControls';
import { useIsDesktopWeb } from '../utils/platform';

export type RecapDrillTarget =
  | { kind: 'item'; code: string; name: string }
  | { kind: 'subitem'; key: string; name: string; itemCode?: string }
  | { kind: 'pending_all' }
  | null;

interface SubItemRecapViewProps {
  records: KpmRecord[];
  proposals?: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  selectedYear: string;
  reportTemplate?: ReportTemplateConfig;
  onChangeYear: (year: string) => void;
  drillTarget?: RecapDrillTarget;
  onChangeDrillTarget?: (next: RecapDrillTarget) => void;
  onBack: () => void;
  onSelectKpm: (record: KpmRecord) => void;
}

type RecapMainTab = 'item' | 'subitem';
type ProposalTipeFilter = 'all' | ProposalTipe;

type PendingPdfDownload =
  | { kind: 'item_recap' }
  | {
      kind: 'kpm_checklist';
      sourceRecords: KpmRecord[];
      customTitle?: string;
      statusFilter?: 'all' | 'incomplete' | 'complete';
    }
  | null;

export function SubItemRecapView({
  records,
  proposals = [],
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  selectedYear,
  reportTemplate,
  onChangeYear,
  drillTarget: controlledDrillTarget,
  onChangeDrillTarget,
  onBack,
  onSelectKpm,
}: SubItemRecapViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const [activeTab, setActiveTab] = useState<RecapMainTab>('item');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('OV');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingKpmPdf, setExportingKpmPdf] = useState(false);
  const [isCatNomorModalOpen, setIsCatNomorModalOpen] = useState(false);
  const [catNomorOrientation, setCatNomorOrientation] = useState<CatNomorOrientation>('landscape');
  const [catNomorPaperSize, setCatNomorPaperSize] = useState<CatNomorPaperSize>('a4');
  const [catNomorTipeFilter, setCatNomorTipeFilter] = useState<ProposalTipeFilter>('all');
  const [exportingCatNomorPdf, setExportingCatNomorPdf] = useState(false);
  const [pendingPdfDownload, setPendingPdfDownload] = useState<PendingPdfDownload>(null);
  const [pdfNotice, setPdfNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
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

  const proposalLookup = useMemo(() => {
    const byId = new Map<string, ProposalRecord>();
    const byNameYear = new Map<string, ProposalRecord>();
    const byName = new Map<string, ProposalRecord>();
    for (const p of proposals) {
      if (p.id) byId.set(p.id, p);
      const name = (p.namaProposal || '').trim();
      const year = (p.tahun || '').trim();
      if (name) {
        if (year && !byNameYear.has(`${name}__${year}`)) {
          byNameYear.set(`${name}__${year}`, p);
        }
        if (!byName.has(name)) {
          byName.set(name, p);
        }
      }
    }
    return { byId, byNameYear, byName };
  }, [proposals]);

  // Scope: KPM Diterima pada tahun terpilih
  const scopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (selectedYear !== 'all' && rec.tahun !== selectedYear) return false;
      return rec.validasi === 'accepted';
    });
  }, [records, selectedYear]);

  const filterRecordsByProposalTipe = (
    list: KpmRecord[],
    tipeFilter: ProposalTipeFilter
  ): KpmRecord[] => {
    if (tipeFilter === 'all') return list;
    return list.filter((rec) => {
      const propName = (rec.proposal || '').trim();
      const propYear = (rec.tahun || '').trim();
      const matched =
        (rec.proposalId ? proposalLookup.byId.get(rec.proposalId) : undefined) ??
        (propName && propYear
          ? proposalLookup.byNameYear.get(`${propName}__${propYear}`)
          : undefined) ??
        (propName ? proposalLookup.byName.get(propName) : undefined);
      return matched?.tipe === tipeFilter;
    });
  };

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

  // Item terpilih untuk panel sub-item di versi web (default: OV, fallback ke item pertama)
  const activeItemRow = useMemo(() => {
    if (itemRows.length === 0) return null;
    const direct = itemRows.find(
      (r) => r.code.toUpperCase() === selectedItemCode.toUpperCase()
    );
    if (direct) return direct;
    const defaultOv = itemRows.find((r) => r.code.toUpperCase() === 'OV');
    return defaultOv || itemRows[0];
  }, [itemRows, selectedItemCode]);

  const activeItemSubRecap = useMemo(() => {
    if (!activeItemRow) {
      return { aggregates: [], kpmRows: [], totalUnits: 0, totalDelivered: 0, totalPending: 0 };
    }
    const itemRecs = scopedRecords.filter(
      (rec) => (rec.item || '').trim().toUpperCase() === activeItemRow.code.toUpperCase()
    );
    const computed = computeSubItemRecap(itemRecs, items);

    // Urutkan sub-item sesuai katalog item aktif agar rapi dan konsisten
    const pkg = resolvePackageForKpm(
      items,
      selectedYear !== 'all' ? selectedYear : itemRecs[0]?.tahun || '',
      activeItemRow.code
    );
    const catalogOrder = new Map<string, number>();
    pkg.subItems.forEach((subName, idx) => {
      catalogOrder.set(normalizeSubItemKey(subName), idx);
    });
    const sortedAggregates = [...computed.aggregates].sort((a, b) => {
      const ordA = catalogOrder.get(normalizeSubItemKey(a.key || a.name)) ?? 9999;
      const ordB = catalogOrder.get(normalizeSubItemKey(b.key || b.name)) ?? 9999;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name, 'id');
    });

    return {
      ...computed,
      aggregates: sortedAggregates,
    };
  }, [activeItemRow, scopedRecords, items, selectedYear]);

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

  const handleExportPdf = async (tipeFilter: ProposalTipeFilter = 'all') => {
    if (exportingPdf) return;
    const filtered = filterRecordsByProposalTipe(scopedRecords, tipeFilter);
    if (filtered.length === 0) return;
    setExportingPdf(true);
    setPdfNotice(null);
    try {
      const { exportSubItemRecapToPdf } = await import('../utils/pdfExporter');
      const res = await exportSubItemRecapToPdf({
        records: filtered,
        items,
        selectedYear,
        proposalTypeFilter: tipeFilter,
        reportTemplate,
      });
      setPdfNotice({
        type: 'success',
        message: `PDF rekap item & sub-item (${res.savedFileName}) berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF rekap item.',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportKpmChecklistPdf = async (
    targetRecs: KpmRecord[],
    tipeFilter: ProposalTipeFilter = 'all',
    customTitle?: string,
    statusFilter: 'all' | 'incomplete' | 'complete' = 'all'
  ) => {
    const filtered = filterRecordsByProposalTipe(targetRecs, tipeFilter);
    if (exportingKpmPdf || filtered.length === 0) return;
    setExportingKpmPdf(true);
    setPdfNotice(null);
    try {
      const yearLabel = selectedYear === 'all' ? 'Semua Tahun' : selectedYear;
      const tipeLabel = tipeFilter === 'all' ? 'Semua' : tipeFilter;
      const tipeSuffixSlug = tipeFilter === 'all' ? '' : `-${tipeFilter.toLowerCase()}`;
      const tipeTitleSuffix = tipeFilter === 'all' ? '' : ` · ${tipeFilter}`;
      const { exportKpmSubItemChecklistToPdf } = await import('../utils/pdfExporter');
      const res = await exportKpmSubItemChecklistToPdf({
        records: filtered,
        proposals,
        items,
        title: customTitle
          ? `${customTitle}${tipeTitleSuffix}`
          : `Rekap KPM Sub-Item (${yearLabel}${tipeTitleSuffix})`,
        subtitle: `Tahun Anggaran: ${yearLabel}  ·  Tipe Proposal: ${tipeLabel}  ·  Total: ${filtered.length} KPM`,
        fileName: `masdeta-rekap-kpm-subitem-${selectedYear === 'all' ? 'semua-tahun' : selectedYear}${tipeSuffixSlug}`,
        statusFilter,
        reportTemplate,
        splitByProposal: false,
        showProposalColumn: true,
        showKelurahanColumn: true,
      });
      setPdfNotice({
        type: 'success',
        message: `PDF listing KPM sub-item (${res.savedFileName}, ${res.count} KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal membuat file PDF listing KPM sub-item.',
      });
    } finally {
      setExportingKpmPdf(false);
    }
  };

  const downloadTypeModal = pendingPdfDownload ? (() => {
    const baseRecords =
      pendingPdfDownload.kind === 'item_recap'
        ? scopedRecords
        : pendingPdfDownload.sourceRecords;
    const allCount = baseRecords.length;
    const murniCount = filterRecordsByProposalTipe(baseRecords, 'Murni').length;
    const perubahanCount = filterRecordsByProposalTipe(baseRecords, 'Perubahan').length;
    const yearText = selectedYear === 'all' ? 'Semua Tahun' : selectedYear;
    const modalSubtitle =
      pendingPdfDownload.kind === 'item_recap'
        ? `Download Rekap Item & Sub-Item (${yearText})`
        : pendingPdfDownload.customTitle || `Download Rekap KPM Sub-Item (${yearText})`;

    const options: {
      key: ProposalTipeFilter;
      label: string;
      desc: string;
      count: number;
    }[] = [
      {
        key: 'all',
        label: 'Semua',
        desc: 'Gabungan seluruh proposal Murni & Perubahan',
        count: allCount,
      },
      {
        key: 'Murni',
        label: 'Murni',
        desc: 'Hanya KPM dari proposal tipe Murni',
        count: murniCount,
      },
      {
        key: 'Perubahan',
        label: 'Perubahan',
        desc: 'Hanya KPM dari proposal tipe Perubahan',
        count: perubahanCount,
      },
    ];

    const triggerChoice = (tipe: ProposalTipeFilter) => {
      const target = pendingPdfDownload;
      setPendingPdfDownload(null);
      if (target.kind === 'item_recap') {
        void handleExportPdf(tipe);
      } else {
        void handleExportKpmChecklistPdf(
          target.sourceRecords,
          tipe,
          target.customTitle,
          target.statusFilter ?? 'all'
        );
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={() => setPendingPdfDownload(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recap-download-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2
                id="recap-download-modal-title"
                className="text-sm font-bold text-slate-900"
              >
                Pilih Tipe Proposal PDF
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {modalSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingPdfDownload(null)}
              aria-label="Tutup pilihan download"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 p-3.5">
            {options.map((opt) => {
              const disabled = opt.count === 0;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => triggerChoice(opt.key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    disabled
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
                      : 'border-slate-200 bg-white hover:border-teal-600 hover:bg-teal-50/50 active:bg-teal-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{opt.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{opt.desc}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        disabled
                          ? 'bg-slate-200 text-slate-500'
                          : 'bg-teal-50 text-teal-800 border border-teal-200/70'
                      }`}
                    >
                      {opt.count} KPM
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setPendingPdfDownload(null)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  })() : null;

  const catNomorMatrixPreview = useMemo(() => {
    if (!isCatNomorModalOpen) return null;
    return buildCatNomorBarangMatrix({
      records,
      proposals,
      items,
      wilayahList,
      proposalSlotMap,
      selectedYear,
      proposalTipeFilter: catNomorTipeFilter,
    });
  }, [
    isCatNomorModalOpen,
    records,
    proposals,
    items,
    wilayahList,
    proposalSlotMap,
    selectedYear,
    catNomorTipeFilter,
  ]);

  const handleDownloadCatNomorPdf = async () => {
    if (exportingCatNomorPdf) return;
    setPdfNotice(null);
    setExportingCatNomorPdf(true);
    try {
      const orientText = catNomorOrientation === 'landscape' ? 'Landscape' : 'Portrait';
      const paperText = catNomorPaperSize.toUpperCase();
      const { exportCatNomorBarangToPdf } = await import('../utils/pdfExporter');
      const res = await exportCatNomorBarangToPdf({
        records,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        selectedYear,
        proposalTipeFilter: catNomorTipeFilter,
        orientation: catNomorOrientation,
        paperSize: catNomorPaperSize,
      });
      setIsCatNomorModalOpen(false);
      setPdfNotice({
        type: 'success',
        message: res.openedNative
          ? `PDF "${res.savedFileName}" (${res.proposalCount} lokasi · ${orientText} ${paperText}) berhasil dibuat dan dibuka.`
          : `PDF "${res.savedFileName}" (${res.proposalCount} lokasi · ${orientText} ${paperText}) berhasil diunduh.`,
      });
    } catch (err) {
      setPdfNotice({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal membuat file PDF Cat Nomor Barang.',
      });
    } finally {
      setExportingCatNomorPdf(false);
    }
  };

  const catNomorModal = isCatNomorModalOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-xs sm:items-center"
      onClick={() => !exportingCatNomorPdf && setIsCatNomorModalOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Paintbrush className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Download Cat Nomor Barang</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Tahun {selectedYear === 'all' ? 'Semua Tahun' : selectedYear} · Pilih orientasi &amp; ukuran kertas
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={exportingCatNomorPdf}
            onClick={() => setIsCatNomorModalOpen(false)}
            aria-label="Tutup modal Cat Nomor Barang"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 p-4">
          {/* Orientasi */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Orientasi Halaman
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'landscape', label: 'Landscape', desc: 'Mendatar — tabel lebih lega' },
                  { key: 'portrait', label: 'Portrait', desc: 'Tegak — ringkas 1–2 halaman' },
                ] as const
              ).map((opt) => {
                const active = catNomorOrientation === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCatNomorOrientation(opt.key)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-teal-700 bg-teal-700 text-white shadow-xs'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-teal-400 hover:bg-teal-50/40'
                    }`}
                  >
                    <span className="block text-xs font-bold">{opt.label}</span>
                    <span
                      className={`mt-0.5 block text-[10px] ${
                        active ? 'text-teal-100' : 'text-slate-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ukuran Kertas */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ukuran Kertas
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    key: 'a4',
                    label: 'A4',
                    desc: catNomorOrientation === 'landscape' ? '297 × 210 mm' : '210 × 297 mm',
                  },
                  {
                    key: 'f4',
                    label: 'F4',
                    desc: catNomorOrientation === 'landscape' ? '330 × 216 mm' : '216 × 330 mm',
                  },
                ] as const
              ).map((opt) => {
                const active = catNomorPaperSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCatNomorPaperSize(opt.key)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-teal-700 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-xs font-bold">{opt.label}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 tabular-nums">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Tipe Proposal */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tipe Proposal
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { key: 'all', label: 'Semua' },
                  { key: 'Murni', label: 'Murni' },
                  { key: 'Perubahan', label: 'Perubahan' },
                ] as const
              ).map((opt) => {
                const active = catNomorTipeFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCatNomorTipeFilter(opt.key)}
                    className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ringkasan Cakupan Data */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            {catNomorMatrixPreview && catNomorMatrixPreview.totalProposals > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {catNomorMatrixPreview.totalProposals} Proposal / Lokasi
                </span>
                <span className="text-[11px] font-semibold text-teal-700 tabular-nums">
                  {catNomorMatrixPreview.columns.length} Item · {catNomorMatrixPreview.totalSlots} Nomor
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-rose-600">
                Tidak ada proposal dengan KPM diterima pada filter ini.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          <button
            type="button"
            disabled={exportingCatNomorPdf}
            onClick={() => setIsCatNomorModalOpen(false)}
            className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={
              exportingCatNomorPdf ||
              !catNomorMatrixPreview ||
              catNomorMatrixPreview.totalProposals === 0
            }
            onClick={() => void handleDownloadCatNomorPdf()}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {exportingCatNomorPdf ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Menyusun PDF...</span>
              </>
            ) : (
              <>
                <Paintbrush className="h-3.5 w-3.5" />
                <span>
                  Download PDF ({catNomorOrientation === 'landscape' ? 'Landscape' : 'Portrait'})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Drill-down KPM rows
  const drillKpmRows = useMemo(() => {
    if (!drillTarget) return [];
    const list = recap.kpmRows.filter((row) => {
      if (drillTarget.kind === 'item') {
        return (row.record.item || '').trim() === drillTarget.code;
      }
      if (drillTarget.kind === 'subitem') {
        if (
          drillTarget.itemCode &&
          (row.record.item || '').trim().toUpperCase() !== drillTarget.itemCode.toUpperCase()
        ) {
          return false;
        }
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
      drillTarget.kind === 'pending_all'
        ? 'Belum Di Bagikan'
        : drillTarget.kind === 'subitem' && drillTarget.itemCode
          ? `${drillTarget.name} (${drillTarget.itemCode})`
          : drillTarget.name;

    return (
      <div className="min-h-screen pb-24">
        {!isDesktopWeb && (
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
        )}

        {isDesktopWeb && (
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDrillTarget(null)}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  aria-label="Kembali ke Rekap Item"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Kembali</span>
                </button>
                <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-slate-900">
                  {drillTitle}
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {drillKpmRows.length > 0 && (
                  <button
                    type="button"
                    disabled={exportingKpmPdf}
                    onClick={() =>
                      setPendingPdfDownload({
                        kind: 'kpm_checklist',
                        sourceRecords: drillKpmRows.map((r) => r.record),
                        customTitle: `Rekap Sub-Item KPM · ${drillTitle}`,
                        statusFilter: drillTarget.kind === 'pending_all' ? 'incomplete' : 'all',
                      })
                    }
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                  >
                    {exportingKpmPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span>Download PDF KPM</span>
                  </button>
                )}
                <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 tabular-nums">
                  {drillKpmRows.length} KPM
                </span>
              </div>
            </div>
          </header>
        )}

        <main
          className={`space-y-4 px-4 pt-4 ${
            isDesktopWeb ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-5' : ''
          }`}
        >

          {pdfNotice && (
            <div
              role="status"
              className={`rounded-2xl border px-4 py-2.5 text-xs font-medium ${
                pdfNotice.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {pdfNotice.message}
            </div>
          )}

          {drillKpmRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Belum ada data penerima</p>
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
                        {row.record.proposal || 'Database KPM'} · {row.record.item}
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
        {downloadTypeModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {!isDesktopWeb && (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-bold text-slate-900">Rekap Item</h1>
          </div>
          <button
            type="button"
            disabled={exportingPdf || scopedRecords.length === 0}
            onClick={() => setPendingPdfDownload({ kind: 'item_recap' })}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {exportingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-teal-700" />
            )}
            <span>PDF</span>
          </button>
        </header>
      )}

      {isDesktopWeb && (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
              Rekap Item
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportingKpmPdf || scopedRecords.length === 0}
                onClick={() =>
                  setPendingPdfDownload({
                    kind: 'kpm_checklist',
                    sourceRecords: scopedRecords,
                  })
                }
                className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {exportingKpmPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                <span>
                  {exportingKpmPdf
                    ? 'Menyusun PDF...'
                    : `Download Rekap KPM Sub-Item (${scopedRecords.length} KPM)`}
                </span>
              </button>

              <button
                type="button"
                disabled={exportingPdf || scopedRecords.length === 0}
                onClick={() => setPendingPdfDownload({ kind: 'item_recap' })}
                className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 shadow-xs transition-colors hover:border-teal-600 hover:bg-teal-50/40 disabled:opacity-60"
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                ) : (
                  <FileText className="h-4 w-4 text-teal-700" />
                )}
                <span>
                  {exportingPdf
                    ? 'Menyusun PDF Rekap...'
                    : `Download Rekap Item (${selectedYear === 'all' ? 'Semua Tahun' : selectedYear})`}
                </span>
              </button>

              <button
                type="button"
                disabled={exportingCatNomorPdf || scopedRecords.length === 0}
                onClick={() => setIsCatNomorModalOpen(true)}
                className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 text-xs font-semibold text-teal-800 shadow-xs transition-colors hover:border-teal-600 hover:bg-teal-50 disabled:opacity-60"
              >
                {exportingCatNomorPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                ) : (
                  <Paintbrush className="h-4 w-4 text-teal-700" />
                )}
                <span>Cat Nomor Barang</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <main
        className={`space-y-4 px-4 pt-4 ${
          isDesktopWeb ? 'md:mx-auto md:max-w-[1440px] md:space-y-5 md:px-6 md:pt-5' : ''
        }`}
      >

        {pdfNotice && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-2.5 text-xs font-medium ${
              pdfNotice.type === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-900'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {pdfNotice.message}
          </div>
        )}

        {/* MOBILE VIEW: Tetap pertahankan 2 tab Item vs Sub-Item agar ringkas di layar kecil */}
        {!isDesktopWeb && (
          <>
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

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exportingKpmPdf || scopedRecords.length === 0}
                onClick={() =>
                  setPendingPdfDownload({
                    kind: 'kpm_checklist',
                    sourceRecords: scopedRecords,
                  })
                }
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {exportingKpmPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <Users className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">KPM Sub-Item ({scopedRecords.length})</span>
              </button>
              <button
                type="button"
                disabled={exportingPdf || scopedRecords.length === 0}
                onClick={() => setPendingPdfDownload({ kind: 'item_recap' })}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {exportingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-teal-700" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                )}
                <span className="truncate">Rekap Item PDF</span>
              </button>
              <button
                type="button"
                disabled={exportingCatNomorPdf || scopedRecords.length === 0}
                onClick={() => setIsCatNomorModalOpen(true)}
                className="col-span-2 inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/80 px-3 text-xs font-semibold text-teal-800 shadow-xs transition-colors hover:bg-teal-100/70 disabled:opacity-60"
              >
                {exportingCatNomorPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-teal-700" />
                ) : (
                  <Paintbrush className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                )}
                <span className="truncate">Download PDF Cat Nomor Barang (Portrait / Landscape)</span>
              </button>
            </div>

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
                              {row.totalNeeded} {row.satuan || 'Unit'}
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
                )}
              </section>
            )}
          </>
        )}

        {/* DESKTOP WEB VIEW: Tanpa tab, Rekapitulasi + Daftar Item di Kiri, Sub-Item Item Terpilih di Kanan */}
        {isDesktopWeb && (
          <div className="grid grid-cols-12 items-start gap-5">
            {/* Kolom Kiri: Rekapitulasi Item + Daftar Item tepat di bawahnya */}
            <div className="col-span-5 space-y-4">
              <section className="rounded-3xl bg-slate-900 p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold tracking-tight text-white leading-snug">
                      Rekapitulasi Item
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-400">
                      KPM Diterima · {recap.totalUnits} Unit Sub-Item
                    </p>
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
                      {totalPackages}
                    </span>
                    <span className="text-xs font-medium text-slate-300">Total Paket</span>
                  </div>
                  <span className="text-xs font-bold text-teal-300 tabular-nums">
                    {pctItemComplete}% Lengkap
                  </span>
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-teal-400 transition-all duration-300"
                    style={{ width: `${pctItemComplete}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 divide-x divide-slate-800 border-t border-slate-800 pt-3.5">
                  <div className="px-2 text-center">
                    <p className="text-xs text-slate-400">Sudah Diterima</p>
                    <p className="mt-0.5 text-lg font-bold text-teal-300 tabular-nums">
                      {deliveredPackages} Paket
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrillTarget({ kind: 'pending_all' })}
                    className="px-2 text-center transition-opacity hover:opacity-80"
                  >
                    <p className="text-xs text-slate-400">Belum Di Bagikan</p>
                    <p className="mt-0.5 text-lg font-bold text-amber-300 tabular-nums">
                      {pendingPackages} Paket
                    </p>
                  </button>
                </div>
              </section>

              {/* Container Item tepat di bawah container Rekapitulasi */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Daftar Paket Item</h2>
                    <p className="text-[11px] text-slate-500">
                      Pilih item untuk melihat rincian sub-item di sebelah kanan
                    </p>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 tabular-nums">
                    {itemRows.length} Item
                  </span>
                </div>

                {itemRows.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      Belum ada data item diterima
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pilih tahun lain atau pastikan data KPM diterima sudah tersedia.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {itemRows.map((row) => {
                      const isActive =
                        activeItemRow?.code.toUpperCase() === row.code.toUpperCase();
                      return (
                        <button
                          key={row.code}
                          type="button"
                          onClick={() => setSelectedItemCode(row.code)}
                          className={`flex min-h-[60px] w-full items-center justify-between gap-3 border-l-4 px-4 py-3 text-left transition-colors ${
                            isActive
                              ? 'border-l-teal-700 bg-teal-50/70'
                              : 'border-l-transparent hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold ${
                                isActive
                                  ? 'bg-teal-700 text-white'
                                  : 'bg-teal-50 text-teal-800'
                              }`}
                            >
                              {row.code}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-sm font-semibold ${
                                  isActive ? 'text-teal-950' : 'text-slate-900'
                                }`}
                              >
                                {row.name}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                                {row.subItemCount} sub-item · {row.completeKpm}/{row.totalKpm}{' '}
                                lengkap
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
                            <ChevronRight
                              className={`h-4 w-4 ${
                                isActive ? 'text-teal-700' : 'text-slate-400'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Kolom Kanan: Listing Sub-Item dari Item yang diklik (sticky di viewport desktop) */}
            <div className="col-span-7 md:sticky md:top-24 self-start">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {!activeItemRow ? (
                  <div className="px-6 py-14 text-center">
                    <Package className="mx-auto h-9 w-9 text-slate-300" />
                    <p className="mt-2.5 text-sm font-semibold text-slate-900">
                      Belum ada sub-item untuk ditampilkan
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pilih tahun anggaran yang memiliki KPM diterima untuk melihat rincian sub-item.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 font-mono text-sm font-bold text-white">
                          {activeItemRow.code}
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-bold text-slate-900">
                            Sub-Item {activeItemRow.name}
                          </h2>
                          <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                            {activeItemSubRecap.aggregates.length} sub-item ·{' '}
                            {activeItemRow.totalKpm} Paket KPM ·{' '}
                            {activeItemSubRecap.totalDelivered}/{activeItemSubRecap.totalUnits} unit
                            diterima
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setDrillTarget({
                            kind: 'item',
                            code: activeItemRow.code,
                            name: activeItemRow.name,
                          })
                        }
                        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Lihat {activeItemRow.totalKpm} KPM</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {activeItemSubRecap.aggregates.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <p className="text-sm font-semibold text-slate-900">
                          Paket {activeItemRow.code} belum memiliki sub-item terdaftar
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Atur rincian sub-item melalui Menu &rarr; Kelola Item &amp; Sub-Item.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 md:max-h-[calc(100vh-14rem)] md:overflow-y-auto">
                        {activeItemSubRecap.aggregates.map((row) => (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() =>
                              setDrillTarget({
                                kind: 'subitem',
                                key: row.key,
                                name: row.name,
                                itemCode: activeItemRow.code,
                              })
                            }
                            className="flex min-h-[64px] w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
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
                                  Paket {activeItemRow.code} · {row.deliveredCount}/{row.totalNeeded}{' '}
                                  diterima
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2.5 text-right">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 tabular-nums">
                                  {row.totalNeeded} {row.satuan || 'Unit'}
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
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
      {downloadTypeModal}
      {catNomorModal}
    </div>
  );
}
