import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  FileCheck2,
  FileText,
  ImagePlus,
  Loader2,
  Printer,
  Ticket,
  Trash2,
} from 'lucide-react';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_KOP_LOGO_URL,
  DEFAULT_REPORT_TEMPLATE,
  DEFAULT_SPTJM_TEMPLATE,
  ItemBantuan,
  KpmRecord,
  PengelolaProfile,
  ProposalBastMap,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  ScheduleEventItem,
  SptjmTemplateConfig,
  WilayahKabKota,
} from '../types/kpm';
import {
  isKecamatanProposal,
  resolveProposalKecamatanCategory,
  sortKecamatanCategoryNames,
} from '../utils/imageProcessor';
import {
  ADDON_PDF_COLUMN_DEFINITIONS,
  DEFAULT_ADDON_PDF_COLUMN_KEYS,
  MANDATORY_PDF_COLUMN_KEYS,
  MAX_PDF_TOTAL_COLUMNS,
  PDF_COLUMN_DEFINITIONS,
  PdfColumnKey,
  SPTJM_DAY_OPTIONS,
  exportKpmBastBulkToPdf,
  exportKpmSptjmBulkToPdf,
  exportKpmTableToPdf,
  exportKuponPdf,
  formatIndonesianDDMonthYYYY,
  formatIndonesianDateWords,
  formatScheduleDateTimeForCoupon,
  formatSptjmFullDate,
  getSptjmAutoDayFromIso,
  isKecamatanScopedProposalForCoupon,
  resolveCouponScheduleForRecord,
  resolveEffectiveBastConfig,
  resolveScheduleForProposal,
  shouldAutoIncludeKelurahanColumn,
} from '../utils/pdfExporter';
import { SelectionPickerModal, SelectionPickerOption } from './SelectionPickerModal';
import { useIsDesktopWeb } from '../utils/platform';

type DownloadPrintMode = 'kpm' | 'kupon' | 'bast' | 'sptjm';

interface MenuDownloadViewProps {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
  pengelolaList: PengelolaProfile[];
  proposalSlotMap?: ProposalSlotMap;
  schedules?: ScheduleEventItem[];
  reportTemplate?: ReportTemplateConfig;
  onSaveReportTemplate?: (next: ReportTemplateConfig) => void;
  couponConfig?: CouponPrintConfig;
  onSaveCouponConfig?: (next: CouponPrintConfig) => void;
  bastTemplate?: BastTemplateConfig;
  onSaveBastTemplate?: (next: BastTemplateConfig) => void;
  sptjmTemplate?: SptjmTemplateConfig;
  onSaveSptjmTemplate?: (next: SptjmTemplateConfig) => void;
  proposalBastMap?: ProposalBastMap;
  onSaveProposalBastConfig?: (
    proposalId: string,
    config: Partial<BastTemplateConfig> | null
  ) => void;
  onBack: () => void;
}

async function compressKopLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar kop.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('File gambar tidak valid.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar kop tidak didukung.'));
      img.onload = () => {
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim));
        const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function MenuDownloadView({
  records,
  proposals,
  items,
  wilayahList,
  pengelolaList,
  proposalSlotMap = {},
  schedules = [],
  reportTemplate,
  onSaveReportTemplate,
  couponConfig,
  onSaveCouponConfig,
  bastTemplate,
  onSaveBastTemplate,
  sptjmTemplate,
  onSaveSptjmTemplate,
  proposalBastMap = {},
  onSaveProposalBastConfig,
  onBack,
}: MenuDownloadViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const kopLogoInputRef = useRef<HTMLInputElement | null>(null);
  const reportKopLogoInputRef = useRef<HTMLInputElement | null>(null);
  const kuponKalbarInputRef = useRef<HTMLInputElement | null>(null);
  const kuponGerindraInputRef = useRef<HTMLInputElement | null>(null);

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

  const [printMode, setPrintMode] = useState<DownloadPrintMode>('kpm');
  const [selectedTahun, setSelectedTahun] = useState<string>(() => yearOptions[0] || '2026');
  const [selectedProposal, setSelectedProposal] = useState<string>('all');
  const [selectedPengelola, setSelectedPengelola] = useState<string>('all');
  const [selectedAddonColumns, setSelectedAddonColumns] = useState<PdfColumnKey[]>(() => {
    const initial: PdfColumnKey[] = DEFAULT_ADDON_PDF_COLUMN_KEYS.includes('kelurahan')
      ? [...DEFAULT_ADDON_PDF_COLUMN_KEYS]
      : [...DEFAULT_ADDON_PDF_COLUMN_KEYS, 'kelurahan'];
    return initial.slice(0, MAX_PDF_TOTAL_COLUMNS - MANDATORY_PDF_COLUMN_KEYS.length);
  });
  const [includeSummary, setIncludeSummary] = useState(true);

  const [isTahunModalOpen, setIsTahunModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isPengelolaModalOpen, setIsPengelolaModalOpen] = useState(false);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingKupon, setIsGeneratingKupon] = useState(false);
  const [isGeneratingBast, setIsGeneratingBast] = useState(false);
  const [isGeneratingSptjm, setIsGeneratingSptjm] = useState(false);
  const [limitNotice, setLimitNotice] = useState(false);

  const [pdfFeedback, setPdfFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [kuponFeedback, setKuponFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [bastFeedback, setBastFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [sptjmFeedback, setSptjmFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<ReportTemplateConfig>(
    () => reportTemplate ?? DEFAULT_REPORT_TEMPLATE
  );
  const [templateSavedNotice, setTemplateSavedNotice] = useState(false);

  const [couponDraft, setCouponDraft] = useState<CouponPrintConfig>(
    () => couponConfig ?? DEFAULT_COUPON_CONFIG
  );
  const [couponManualOverride, setCouponManualOverride] = useState(false);
  const [couponSavedNotice, setCouponSavedNotice] = useState(false);

  const [bastDraft, setBastDraft] = useState<BastTemplateConfig>(
    () => bastTemplate ?? DEFAULT_BAST_TEMPLATE
  );
  const [bastSavedNotice, setBastSavedNotice] = useState(false);
  const [bastSavedLabel, setBastSavedLabel] = useState<string>(
    'Template BAST berhasil disimpan sebagai default.'
  );
  const [showBastKopEditor, setShowBastKopEditor] = useState(false);

  const [sptjmDraft, setSptjmDraft] = useState<SptjmTemplateConfig>(
    () => sptjmTemplate ?? DEFAULT_SPTJM_TEMPLATE
  );
  const [sptjmSavedNotice, setSptjmSavedNotice] = useState(false);

  useEffect(() => {
    if (reportTemplate) setTemplateDraft(reportTemplate);
  }, [reportTemplate]);

  useEffect(() => {
    if (sptjmTemplate) setSptjmDraft({ ...DEFAULT_SPTJM_TEMPLATE, ...sptjmTemplate });
  }, [sptjmTemplate]);

  const yearScopedProposals = useMemo(() => {
    if (selectedTahun === 'all') return proposals;
    return proposals.filter((p) => p.tahun === selectedTahun);
  }, [proposals, selectedTahun]);

  const selectedProposalObj = useMemo(() => {
    if (selectedProposal === 'all') return undefined;
    return (
      yearScopedProposals.find((p) => p.namaProposal === selectedProposal) ??
      proposals.find((p) => p.namaProposal === selectedProposal)
    );
  }, [selectedProposal, yearScopedProposals, proposals]);

  const matchedProposalSchedule = useMemo(() => {
    if (selectedProposal === 'all') return undefined;
    const yr =
      selectedTahun !== 'all'
        ? selectedTahun
        : selectedProposalObj?.tahun;
    return resolveScheduleForProposal(selectedProposal, yr, schedules);
  }, [selectedProposal, selectedTahun, selectedProposalObj, schedules]);

  useEffect(() => {
    const baseCoupon = couponConfig ?? DEFAULT_COUPON_CONFIG;
    const preservedLogos = {
      logoKalbarUrl: baseCoupon.logoKalbarUrl || '',
      logoGerindraUrl: baseCoupon.logoGerindraUrl || '',
    };
    if (selectedProposal !== 'all' && matchedProposalSchedule) {
      setCouponDraft({
        jadwal:
          formatScheduleDateTimeForCoupon(
            matchedProposalSchedule.targetDate,
            matchedProposalSchedule.targetTime,
            matchedProposalSchedule.targetDay
          ) || baseCoupon.jadwal,
        lokasi: (matchedProposalSchedule.location || '').trim() || baseCoupon.lokasi,
        footerText: baseCoupon.footerText || DEFAULT_COUPON_CONFIG.footerText,
        ...preservedLogos,
      });
      setCouponManualOverride(false);
      return;
    }
    setCouponDraft({
      jadwal: baseCoupon.jadwal || '',
      lokasi: baseCoupon.lokasi || '',
      footerText: baseCoupon.footerText || DEFAULT_COUPON_CONFIG.footerText,
      ...preservedLogos,
    });
    setCouponManualOverride(false);
  }, [selectedProposal, matchedProposalSchedule, couponConfig]);

  const handleKuponLogoUpload = async (
    slot: 'kalbar' | 'gerindra',
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressKopLogoFile(file);
      setCouponSavedNotice(false);
      setCouponDraft((prev) => ({
        ...prev,
        ...(slot === 'kalbar' ? { logoKalbarUrl: dataUrl } : { logoGerindraUrl: dataUrl }),
      }));
    } catch (err) {
      setKuponFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses file logo kupon.',
      });
    }
  };

  useEffect(() => {
    setBastDraft(
      resolveEffectiveBastConfig(
        bastTemplate,
        proposalBastMap,
        selectedProposalObj?.id,
        reportTemplate
      )
    );
  }, [bastTemplate, proposalBastMap, selectedProposalObj?.id, reportTemplate]);

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

  // Kupon hanya mencetak KPM Diterima yang terikat ke proposal aktif (jumlah kupon = jumlah KPM per proposal)
  const eligibleKuponRecords = useMemo(
    () =>
      filteredRecords.filter(
        (rec) => rec.validasi === 'accepted' && Boolean((rec.proposal || '').trim())
      ),
    [filteredRecords]
  );

  // BAST dapat dicetak untuk KPM Diterima (atau semua bila difilter proposal spesifik)
  const eligibleBastRecords = useMemo(() => {
    const accepted = filteredRecords.filter((rec) => rec.validasi === 'accepted');
    return accepted.length > 0 ? accepted : filteredRecords;
  }, [filteredRecords]);

  const previewKuponSample = eligibleKuponRecords[0] || filteredRecords[0] || null;
  const previewKuponShowKelurahan = previewKuponSample
    ? isKecamatanScopedProposalForCoupon(previewKuponSample, proposals)
    : selectedProposal !== 'all' &&
      isKecamatanScopedProposalForCoupon(
        { proposal: selectedProposal, tahun: selectedTahun === 'all' ? '' : selectedTahun },
        proposals
      );

  const previewKuponConfig = useMemo(() => {
    if (
      previewKuponSample &&
      schedules.length > 0 &&
      (selectedProposal === 'all' || !couponManualOverride)
    ) {
      return resolveCouponScheduleForRecord(
        previewKuponSample,
        schedules,
        proposals,
        couponDraft
      );
    }
    return couponDraft;
  }, [previewKuponSample, schedules, proposals, selectedProposal, couponManualOverride, couponDraft]);

  const scheduledKuponCount = useMemo(() => {
    if (schedules.length === 0) return 0;
    return eligibleKuponRecords.filter((rec) =>
      Boolean(resolveCouponScheduleForRecord(rec, schedules, proposals, couponDraft).matchedSchedule)
    ).length;
  }, [eligibleKuponRecords, schedules, proposals, couponDraft]);

  const bastDatePreviewText = useMemo(() => {
    if (bastDraft.tanggalSerahTerimaCustomText?.trim()) {
      return bastDraft.tanggalSerahTerimaCustomText.trim();
    }
    return formatIndonesianDateWords(
      bastDraft.tanggalSerahTerimaIso?.trim() || new Date().toISOString().slice(0, 10)
    );
  }, [bastDraft.tanggalSerahTerimaCustomText, bastDraft.tanggalSerahTerimaIso]);

  const sptjmDatePreviewText = useMemo(
    () => formatSptjmFullDate(sptjmDraft),
    [sptjmDraft]
  );

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

  const applyProposalKelurahanDefault = (
    prev: PdfColumnKey[],
    proposalValue: string
  ): PdfColumnKey[] => {
    const shouldCheckKelurahan =
      proposalValue === 'all' || shouldAutoIncludeKelurahanColumn(proposalValue);
    if (shouldCheckKelurahan) {
      if (prev.includes('kelurahan')) return prev;
      if (prev.length < maxAddonCount) return [...prev, 'kelurahan'];
      const idxToDrop = [...prev].reverse().findIndex((k) => k !== 'catatan');
      if (idxToDrop >= 0) {
        const realIdx = prev.length - 1 - idxToDrop;
        return [...prev.slice(0, realIdx), ...prev.slice(realIdx + 1), 'kelurahan'];
      }
      return [...prev.slice(0, Math.max(0, maxAddonCount - 1)), 'kelurahan'];
    }
    return prev.filter((k) => k !== 'kelurahan');
  };

  const handleSelectTahun = (nextTahun: string) => {
    setSelectedTahun(nextTahun);
    setSelectedProposal('all');
    setSelectedPengelola('all');
    setSelectedAddonColumns((prev) => applyProposalKelurahanDefault(prev, 'all'));
    setLimitNotice(false);
    setPdfFeedback(null);
    setKuponFeedback(null);
    setBastFeedback(null);
    setSptjmFeedback(null);
  };

  const handleSelectProposal = (nextProp: string) => {
    setSelectedProposal(nextProp);
    setSelectedPengelola('all');
    setSelectedAddonColumns((prev) => applyProposalKelurahanDefault(prev, nextProp));
    setLimitNotice(false);
    setPdfFeedback(null);
    setKuponFeedback(null);
    setBastFeedback(null);
    setSptjmFeedback(null);
  };

  const buildScopeTitleAndFileName = (prefix?: string) => {
    const yearSuffix = selectedTahun === 'all' ? 'Semua Tahun' : selectedTahun;
    const baseScope =
      selectedProposal !== 'all' ? selectedProposal : 'Daftar KPM MASDETA';

    const title = `${baseScope} ${yearSuffix}`.trim();

    const subParts: string[] = [];
    if (selectedPengelola !== 'all') {
      subParts.push(`Pengelola: ${selectedPengelola}`);
    }
    subParts.push(`Total: ${filteredRecords.length} KPM`);

    const fileBase = `${prefix ? `${prefix}_` : ''}${
      selectedTahun === 'all' ? 'Semua_Tahun' : selectedTahun
    }_${baseScope}${selectedPengelola !== 'all' ? `_${selectedPengelola}` : ''}`;

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
        splitByProposal: selectedProposal === 'all',
        autoExcludeKelurahanWhenInProposalTitle: selectedProposal === 'all',
        selectedPengelolaLabel: selectedPengelola !== 'all' ? selectedPengelola : undefined,
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

  const handleDownloadKuponPdf = async () => {
    if (eligibleKuponRecords.length === 0 || isGeneratingKupon) return;
    setKuponFeedback(null);
    setIsGeneratingKupon(true);
    try {
      const { fileName } = buildScopeTitleAndFileName('Kupon');
      const res = await exportKuponPdf({
        records: eligibleKuponRecords,
        allRecords: records,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        schedules,
        couponConfig: couponDraft,
        resolvePerProposalSchedule: selectedProposal === 'all' || !couponManualOverride,
        mode: 'bulk',
        fileName,
      });
      setKuponFeedback({
        type: 'success',
        message: res.openedNative
          ? `Kupon "${res.savedFileName}" (${res.count} kupon) berhasil dibuat dan dibuka.`
          : `Kupon "${res.savedFileName}" (${res.count} kupon) berhasil diunduh.`,
      });
    } catch (err) {
      setKuponFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF Kupon.',
      });
    } finally {
      setIsGeneratingKupon(false);
    }
  };

  const handleDownloadBastBulkPdf = async () => {
    if (eligibleBastRecords.length === 0 || isGeneratingBast) return;
    setBastFeedback(null);
    setIsGeneratingBast(true);
    try {
      const { fileName } = buildScopeTitleAndFileName('BAST');
      const effectiveBulkMap: ProposalBastMap = selectedProposalObj
        ? { ...proposalBastMap, [selectedProposalObj.id]: bastDraft }
        : proposalBastMap;
      const res = await exportKpmBastBulkToPdf({
        records: eligibleBastRecords,
        allRecords: records,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        reportTemplate: templateDraft,
        bastConfig: bastDraft,
        proposalBastMap: effectiveBulkMap,
        fileName,
      });
      setBastFeedback({
        type: 'success',
        message: res.openedNative
          ? `BAST "${res.savedFileName}" (${res.count} halaman KPM) berhasil dibuat dan dibuka.`
          : `BAST "${res.savedFileName}" (${res.count} halaman KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setBastFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF BAST.',
      });
    } finally {
      setIsGeneratingBast(false);
    }
  };

  const handleDownloadSptjmBulkPdf = async () => {
    if (eligibleBastRecords.length === 0 || isGeneratingSptjm) return;
    setSptjmFeedback(null);
    setIsGeneratingSptjm(true);
    try {
      const { fileName } = buildScopeTitleAndFileName('SPTJM');
      const res = await exportKpmSptjmBulkToPdf({
        records: eligibleBastRecords,
        allRecords: records,
        proposals,
        items,
        wilayahList,
        proposalSlotMap,
        reportTemplate: templateDraft,
        bastConfig: bastDraft,
        sptjmConfig: sptjmDraft,
        fileName,
      });
      setSptjmFeedback({
        type: 'success',
        message: res.openedNative
          ? `SPTJM "${res.savedFileName}" (${res.count} halaman KPM) berhasil dibuat dan dibuka.`
          : `SPTJM "${res.savedFileName}" (${res.count} halaman KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setSptjmFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file PDF SPTJM.',
      });
    } finally {
      setIsGeneratingSptjm(false);
    }
  };

  const handleKopLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressKopLogoFile(file);
      setBastSavedNotice(false);
      setTemplateSavedNotice(false);
      setBastDraft((prev) => ({ ...prev, kopLogoDataUrl: compressed }));
      setTemplateDraft((prev) => ({ ...prev, kopLogoDataUrl: compressed }));
    } catch (err) {
      setBastFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses gambar logo kop.',
      });
    }
  };

  const activeKopLogoSrc =
    (templateDraft.kopLogoDataUrl || '').trim() ||
    (bastDraft.kopLogoDataUrl || '').trim() ||
    DEFAULT_KOP_LOGO_URL;

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

        {/* Kolom Kiri (Desktop) / Atas (Mobile): Filter, Excel & Kop Umum */}
        <div className={`space-y-3.5 ${!isNativeApp ? 'md:col-span-5 md:col-start-1' : ''}`}>
          {/* Card 1: Filter Cetak (Tahun, Pengelola, Proposal) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 md:p-4">
            <h2 className="text-sm font-bold text-slate-900">Filter Cetak Dokumen</h2>

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

          {/* Card 2: Pilihan Jenis Cetak */}
          <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 md:p-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pilih Jenis Cetak PDF</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Ukuran kertas F4 Portrait (216 × 310 mm)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
              {(
                [
                  { id: 'kpm', label: 'KPM', Icon: Printer },
                  { id: 'kupon', label: 'Kupon', Icon: Ticket },
                  { id: 'bast', label: 'BAST', Icon: FileCheck2 },
                  { id: 'sptjm', label: 'SPTJM', Icon: FileText },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = printMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPrintMode(id)}
                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-all whitespace-nowrap ${
                      active
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Template Kop Surat & Penandatangan (khusus mode KPM) */}
          {printMode === 'kpm' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setShowTemplateEditor((prev) => !prev)}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-teal-700" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Template Kop &amp; Penandatangan (KPM)
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {templateDraft.enabled
                      ? `${templateDraft.orgHeaderLine2} · Aktif pada Tabel PDF KPM`
                      : 'Nonaktif · Ketuk untuk mengaktifkan kop PDF KPM'}
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

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Logo Kop Surat Instansi (dipakai di Kop Laporan &amp; BAST)
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      ref={reportKopLogoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleKopLogoUpload(e)}
                    />
                    <img
                      src={activeKopLogoSrc}
                      alt="Logo Kop Instansi"
                      className="h-13 w-11 shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 object-contain"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => reportKopLogoInputRef.current?.click()}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        <span>Upload / Ganti Logo</span>
                      </button>
                      {activeKopLogoSrc !== DEFAULT_KOP_LOGO_URL && (
                        <button
                          type="button"
                          onClick={() => {
                            setTemplateSavedNotice(false);
                            setBastSavedNotice(false);
                            setTemplateDraft((prev) => ({
                              ...prev,
                              kopLogoDataUrl: DEFAULT_KOP_LOGO_URL,
                            }));
                            setBastDraft((prev) => ({
                              ...prev,
                              kopLogoDataUrl: DEFAULT_KOP_LOGO_URL,
                            }));
                          }}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          <span>Logo Default Kalbar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

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
                      placeholder="Contoh: PEMERINTAH PROVINSI KALIMANTAN BARAT"
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
                      if (
                        onSaveBastTemplate &&
                        templateDraft.kopLogoDataUrl &&
                        templateDraft.kopLogoDataUrl !== bastTemplate?.kopLogoDataUrl
                      ) {
                        onSaveBastTemplate({
                          ...(bastTemplate ?? DEFAULT_BAST_TEMPLATE),
                          kopLogoDataUrl: templateDraft.kopLogoDataUrl,
                        });
                      }
                      setTemplateSavedNotice(true);
                    }}
                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Simpan Template Laporan</span>
                  </button>
                )}
              </div>
            )}
          </section>
          )}
        </div>

        {/* Kolom Kanan (Desktop) / Bawah (Mobile): Panel sesuai Mode Cetak */}
        <div className={`${!isNativeApp ? 'md:col-span-7 md:col-start-6' : ''}`}>
          {/* MODE 1: PRINT KPM (TABEL DATA KPM) */}
          {printMode === 'kpm' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 md:p-5">
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
                      {col.key === 'kelurahan' && selectedProposal === 'all' && checked && (
                        <span className="ml-auto shrink-0 rounded-md bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold text-teal-800">
                          Auto
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {limitNotice && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <span>
                    Maksimal {MAX_PDF_TOTAL_COLUMNS} kolom agar tabel tetap rapi di kertas F4
                    Portrait. Hapus salah satu centang terlebih dahulu.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Urutan Kolom PDF Aktif
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-800">
                  {activeColumns.map((c) => c.pdfHeader).join('  |  ')}
                </p>
                {selectedProposal === 'all' && selectedAddonColumns.includes('kelurahan') && (
                  <p className="mt-1 text-[10px] leading-relaxed text-teal-700">
                    Mode <strong>Semua Proposal</strong>: setiap proposal dicetak dalam tabel terpisah. Proposal yang judulnya mengandung kata <strong>Kelurahan</strong> otomatis tidak menampilkan kolom KELURAHAN, sedangkan proposal Kecamatan/Umum menampilkannya.
                  </p>
                )}
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

              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                Kertas F4 Portrait (216 × 310 mm) · Margin Kiri 2 cm · Kanan 1,5 cm · Atas &amp; Bawah 1 cm
              </p>
            </section>
          )}

          {/* MODE 2: KUPON (10 KUPON PER LEMBAR F4) */}
          {printMode === 'kupon' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3.5 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Cetak Kupon Pembagian Massal (F4)
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Ukuran kartu 88 × 54 mm (10 kupon/halaman). Jumlah kupon sesuai jumlah KPM aktif per proposal.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-teal-700 tabular-nums">
                  {eligibleKuponRecords.length} Kupon
                </span>
              </div>

              {/* Pratinjau Kupon Mini (tanpa QR) */}
              {(() => {
                const hasKalbarLogo = Boolean(previewKuponConfig.logoKalbarUrl?.trim());
                const hasGerindraLogo = Boolean(previewKuponConfig.logoGerindraUrl?.trim());
                const hasAnyLogo = hasKalbarLogo || hasGerindraLogo;
                return (
                  <div className="rounded-xl border border-slate-300 bg-white p-3.5 shadow-xs space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col items-center shrink-0">
                        <span className="text-[9px] font-medium text-slate-500">No. Kupon</span>
                        <div className="mt-0.5 flex h-9 w-12 items-center justify-center rounded-lg border border-slate-900 text-base font-bold text-slate-900 tabular-nums">
                          01
                        </div>
                      </div>
                      {hasAnyLogo ? (
                        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                            {hasKalbarLogo && (
                              <img
                                src={previewKuponConfig.logoKalbarUrl}
                                alt="Logo Kalimantan Barat"
                                className="max-h-full max-w-full object-contain"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <p className="text-[11px] font-bold tracking-wide text-slate-900 leading-tight">
                              KUPON PEMBAGIAN
                            </p>
                            <p className="text-[11px] font-bold tracking-wide text-slate-900 leading-tight">
                              TAHUN {selectedTahun === 'all' ? '2026' : selectedTahun}
                            </p>
                          </div>
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                            {hasGerindraLogo && (
                              <img
                                src={previewKuponConfig.logoGerindraUrl}
                                alt="Logo Gerindra"
                                className="max-h-full max-w-full object-contain"
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 text-center pr-2">
                          <p className="text-sm font-black tracking-wide text-slate-950 leading-tight">
                            KUPON PEMBAGIAN
                          </p>
                          <p className="mt-0.5 text-sm font-black tracking-wide text-slate-950 leading-tight">
                            TAHUN {selectedTahun === 'all' ? '2026' : selectedTahun}
                          </p>
                        </div>
                      )}
                    </div>

                <div className="rounded-lg border border-slate-800 px-3 py-2 text-[11px] text-slate-800 space-y-0.5">
                  <p className="truncate font-bold text-slate-900">
                    Nama : {previewKuponSample?.nama?.toUpperCase() || 'CONTOH NAMA KPM'}
                  </p>
                  <p className="tabular-nums">
                    NIK : {previewKuponSample?.nikKtp || '6171040000000001'}
                  </p>
                  <p className="truncate">
                    Proposal :{' '}
                    {previewKuponSample?.proposal ||
                      (selectedProposal !== 'all' ? selectedProposal : 'Kecamatan Pontianak Barat')}
                  </p>
                  {previewKuponShowKelurahan && (
                    <p className="truncate text-teal-800 font-semibold">
                      Kelurahan : {previewKuponSample?.kelurahan || 'Sungai Jawi Dalam'}
                    </p>
                  )}
                  <p className="truncate">Jadwal : {previewKuponConfig.jadwal || '-'}</p>
                  <p className="truncate">Lokasi : {previewKuponConfig.lokasi || '-'}</p>
                </div>

                <p className="text-center text-[10px] font-bold text-slate-800">
                  {previewKuponConfig.footerText || DEFAULT_COUPON_CONFIG.footerText}
                </p>
                  </div>
                );
              })()}

              {selectedProposal !== 'all' && matchedProposalSchedule ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
                  Terisi otomatis dari jadwal proposal <strong>{selectedProposal}</strong>
                  {couponManualOverride ? ' (telah disesuaikan manual di bawah).' : '.'}
                </div>
              ) : selectedProposal === 'all' && scheduledKuponCount > 0 ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
                  <strong>{scheduledKuponCount} dari {eligibleKuponRecords.length} KPM</strong> akan otomatis mengisi Jadwal &amp; Lokasi dari jadwal masing-masing proposal. Kolom di bawah menjadi cadangan bila proposal belum dijadwalkan.
                </div>
              ) : (
                <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
                  Jenis item bantuan disembunyikan dari tampilan kupon fisik. Informasi Jadwal, Lokasi, dan Catatan Kaki dapat disesuaikan pada kolom di bawah.
                </div>
              )}

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Jadwal Pembagian {selectedProposal === 'all' ? '(Cadangan / Default)' : ''}
                  </label>
                  <input
                    type="text"
                    value={couponDraft.jadwal}
                    onChange={(e) => {
                      setCouponSavedNotice(false);
                      setCouponManualOverride(true);
                      setCouponDraft((prev) => ({ ...prev, jadwal: e.target.value }));
                    }}
                    placeholder="Contoh: Senin, 12 Oktober 2026 - Pukul : 08.00"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Lokasi Penyaluran {selectedProposal === 'all' ? '(Cadangan / Default)' : ''}
                  </label>
                  <input
                    type="text"
                    value={couponDraft.lokasi}
                    onChange={(e) => {
                      setCouponSavedNotice(false);
                      setCouponManualOverride(true);
                      setCouponDraft((prev) => ({ ...prev, lokasi: e.target.value }));
                    }}
                    placeholder="Contoh: Aula Kantor Camat Pontianak Barat"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Catatan Kaki Kupon {selectedProposal === 'all' ? '(Cadangan / Default)' : ''}
                  </label>
                  <input
                    type="text"
                    value={couponDraft.footerText}
                    onChange={(e) => {
                      setCouponSavedNotice(false);
                      setCouponManualOverride(true);
                      setCouponDraft((prev) => ({ ...prev, footerText: e.target.value }));
                    }}
                    placeholder={DEFAULT_COUPON_CONFIG.footerText}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                {/* Form Opsional Dual Logo Kupon */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                  <div>
                    <p className="text-[11px] font-bold text-slate-800">
                      Logo Header Kupon (Opsional)
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                      Jika ada logo yang diunggah, teks judul otomatis berada di tengah. Jika tanpa logo sama sekali, font judul kupon diperbesar dan ditebalkan.
                    </p>
                  </div>

                  <input
                    ref={kuponKalbarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleKuponLogoUpload('kalbar', e)}
                  />
                  <input
                    ref={kuponGerindraInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleKuponLogoUpload('gerindra', e)}
                  />

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {/* Slot Logo Kalimantan Barat */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {couponDraft.logoKalbarUrl ? (
                          <img
                            src={couponDraft.logoKalbarUrl}
                            alt="Logo Kalimantan Barat"
                            className="max-h-full max-w-full object-contain p-0.5"
                          />
                        ) : (
                          <ImagePlus className="h-4.5 w-4.5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          Logo Kalimantan Barat
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => kuponKalbarInputRef.current?.click()}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-100"
                          >
                            <ImagePlus className="h-3 w-3" />
                            <span>{couponDraft.logoKalbarUrl ? 'Ganti' : 'Unggah'}</span>
                          </button>
                          {couponDraft.logoKalbarUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setCouponSavedNotice(false);
                                setCouponDraft((prev) => ({ ...prev, logoKalbarUrl: '' }));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Slot Logo Gerindra */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {couponDraft.logoGerindraUrl ? (
                          <img
                            src={couponDraft.logoGerindraUrl}
                            alt="Logo Gerindra"
                            className="max-h-full max-w-full object-contain p-0.5"
                          />
                        ) : (
                          <ImagePlus className="h-4.5 w-4.5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          Logo Gerindra
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => kuponGerindraInputRef.current?.click()}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-100"
                          >
                            <ImagePlus className="h-3 w-3" />
                            <span>{couponDraft.logoGerindraUrl ? 'Ganti' : 'Unggah'}</span>
                          </button>
                          {couponDraft.logoGerindraUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setCouponSavedNotice(false);
                                setCouponDraft((prev) => ({ ...prev, logoGerindraUrl: '' }));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {couponSavedNotice && (
                <p className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>Pengaturan kupon berhasil disimpan sebagai default.</span>
                </p>
              )}

              {onSaveCouponConfig && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveCouponConfig(couponDraft);
                    setCouponSavedNotice(true);
                  }}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Simpan Pengaturan Kupon Default</span>
                </button>
              )}

              {kuponFeedback && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    kuponFeedback.type === 'success'
                      ? 'border-teal-200 bg-teal-50 text-teal-900'
                      : 'border-rose-200 bg-rose-50 text-rose-900'
                  }`}
                >
                  {kuponFeedback.type === 'success' ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <p className="font-medium leading-snug">{kuponFeedback.message}</p>
                </div>
              )}

              <button
                type="button"
                disabled={eligibleKuponRecords.length === 0 || isGeneratingKupon}
                onClick={() => void handleDownloadKuponPdf()}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {isGeneratingKupon ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>Menyiapkan PDF Kupon F4...</span>
                  </>
                ) : (
                  <>
                    <Ticket className="h-4.5 w-4.5" />
                    <span>Download Kupon PDF F4 ({eligibleKuponRecords.length} Kupon)</span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                Kertas F4 Portrait (216 × 310 mm) · Margin Kiri 2 cm · Kanan 1,5 cm · Atas &amp; Bawah 1 cm · 10 Kupon / Halaman
              </p>
            </section>
          )}

          {/* MODE 3: BAST ELEKTRONIK MASSAL (FORMAT RESMI DINAS SOSIAL PROV. KALBAR) */}
          {printMode === 'bast' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3.5 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Berita Acara Serah Terima Barang (BAST) Massal
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    1 halaman F4 per KPM · Otomatis menyesuaikan Lokasi Proposal, Nomor Bantuan &amp; Rincian Sub-Item KPM.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-teal-700 tabular-nums">
                  {eligibleBastRecords.length} KPM
                </span>
              </div>

              {selectedProposalObj ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
                  {proposalBastMap?.[selectedProposalObj.id]
                    ? `Menampilkan pengaturan BAST khusus untuk proposal "${selectedProposalObj.namaProposal}".`
                    : `Proposal "${selectedProposalObj.namaProposal}" saat ini menggunakan template BAST default (dapat disesuaikan per proposal di halaman Proposal atau di bawah ini).`}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                  Cetak massal otomatis memakai pengaturan BAST masing-masing proposal (bila diatur di halaman Proposal) dan fallback ke template default di bawah.
                </div>
              )}

              {/* Pengaturan Kop & Logo Dinas BAST */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => setShowBastKopEditor((p) => !p)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <img
                      src={(bastDraft.kopLogoDataUrl || '').trim() || activeKopLogoSrc}
                      alt="Logo BAST"
                      className="h-6 w-5 object-contain"
                    />
                    <span>Kop Surat &amp; Logo Instansi BAST</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform ${
                      showBastKopEditor ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {showBastKopEditor && (
                  <div className="space-y-2.5 border-t border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-3">
                      <input
                        ref={kopLogoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleKopLogoUpload(e)}
                      />
                      <img
                        src={(bastDraft.kopLogoDataUrl || '').trim() || activeKopLogoSrc}
                        alt="Logo Kop BAST"
                        className="h-12 w-10 shrink-0 rounded-lg border border-slate-200 object-contain bg-white p-0.5"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => kopLogoInputRef.current?.click()}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ImagePlus className="h-3.5 w-3.5" />
                          <span>Ganti Logo</span>
                        </button>
                        {((bastDraft.kopLogoDataUrl || '').trim() || activeKopLogoSrc) !==
                          DEFAULT_KOP_LOGO_URL && (
                          <button
                            type="button"
                            onClick={() => {
                              setBastSavedNotice(false);
                              setBastDraft((prev) => ({
                                ...prev,
                                kopLogoDataUrl: DEFAULT_KOP_LOGO_URL,
                              }));
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                          >
                            <span>Reset Logo Kalbar</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Baris Kop 1
                        </label>
                        <input
                          type="text"
                          value={bastDraft.orgHeaderLine1}
                          onChange={(e) => {
                            setBastSavedNotice(false);
                            setBastDraft((prev) => ({ ...prev, orgHeaderLine1: e.target.value }));
                          }}
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Baris Kop 2 (Dinas)
                        </label>
                        <input
                          type="text"
                          value={bastDraft.orgHeaderLine2}
                          onChange={(e) => {
                            setBastSavedNotice(false);
                            setBastDraft((prev) => ({ ...prev, orgHeaderLine2: e.target.value }));
                          }}
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Alamat Baris 1
                      </label>
                      <input
                        type="text"
                        value={bastDraft.orgAddress1}
                        onChange={(e) => {
                          setBastSavedNotice(false);
                          setBastDraft((prev) => ({ ...prev, orgAddress1: e.target.value }));
                        }}
                        className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Alamat Baris 2
                        </label>
                        <input
                          type="text"
                          value={bastDraft.orgAddress2}
                          onChange={(e) => {
                            setBastSavedNotice(false);
                            setBastDraft((prev) => ({ ...prev, orgAddress2: e.target.value }));
                          }}
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Alamat Baris 3
                        </label>
                        <input
                          type="text"
                          value={bastDraft.orgAddress3}
                          onChange={(e) => {
                            setBastSavedNotice(false);
                            setBastDraft((prev) => ({ ...prev, orgAddress3: e.target.value }));
                          }}
                          className="mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Field Dinamis BAST (#1 - #12) */}
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    1. Nomor BAST
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nomorBast}
                    onChange={(e) => {
                      setBastSavedNotice(false);
                      setBastDraft((prev) => ({ ...prev, nomorBast: e.target.value }));
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      2. Tanggal Serah Terima (Otomatis Terbilang)
                    </label>
                    <input
                      type="date"
                      value={bastDraft.tanggalSerahTerimaIso}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({
                          ...prev,
                          tanggalSerahTerimaIso: e.target.value,
                        }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Override Teks Tanggal (Opsional)
                    </label>
                    <input
                      type="text"
                      value={bastDraft.tanggalSerahTerimaCustomText || ''}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({
                          ...prev,
                          tanggalSerahTerimaCustomText: e.target.value,
                        }));
                      }}
                      placeholder="Kosongkan untuk teks otomatis"
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                  <span className="font-semibold text-slate-900">Pratinjau Hari &amp; Tanggal:</span>{' '}
                  {bastDatePreviewText}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    3. Nomor SK &amp; Tanggal SK
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nomorSk}
                    onChange={(e) => {
                      setBastSavedNotice(false);
                      setBastDraft((prev) => ({ ...prev, nomorSk: e.target.value }));
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      4. Nomor Pesanan (SP)
                    </label>
                    <input
                      type="text"
                      value={bastDraft.nomorPesanan}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, nomorPesanan: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      5. Tanggal Pemesanan
                    </label>
                    <input
                      type="text"
                      value={bastDraft.tanggalPemesanan}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, tanggalPemesanan: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      6. Nama Pejabat Dinas (Pihak Pertama)
                    </label>
                    <input
                      type="text"
                      value={bastDraft.pejabatNama}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, pejabatNama: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      7. Jabatan + OPD + Provinsi
                    </label>
                    <input
                      type="text"
                      value={bastDraft.pejabatJabatan}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, pejabatJabatan: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Pangkat / Golongan Pejabat
                    </label>
                    <input
                      type="text"
                      value={bastDraft.pejabatPangkat}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, pejabatPangkat: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      NIP Pejabat
                    </label>
                    <input
                      type="text"
                      value={bastDraft.pejabatNip}
                      onChange={(e) => {
                        setBastSavedNotice(false);
                        setBastDraft((prev) => ({ ...prev, pejabatNip: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Nilai Nominal BAST (Titik-titik untuk tulis tangan atau isi Rp ...)
                  </label>
                  <input
                    type="text"
                    value={bastDraft.nilaiNominalText}
                    onChange={(e) => {
                      setBastSavedNotice(false);
                      setBastDraft((prev) => ({ ...prev, nilaiNominalText: e.target.value }));
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              {bastSavedNotice && (
                <p className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>{bastSavedLabel}</span>
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectedProposalObj && onSaveProposalBastConfig && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveProposalBastConfig(selectedProposalObj.id, bastDraft);
                      setBastSavedLabel(
                        `Pengaturan BAST khusus "${selectedProposalObj.namaProposal}" berhasil disimpan.`
                      );
                      setBastSavedNotice(true);
                    }}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-teal-700/40 bg-teal-50 px-3 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Simpan Khusus Proposal Ini</span>
                  </button>
                )}

                {onSaveBastTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveBastTemplate(bastDraft);
                      setBastSavedLabel('Template BAST berhasil disimpan sebagai default.');
                      setBastSavedNotice(true);
                    }}
                    className={`inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 ${
                      !(selectedProposalObj && onSaveProposalBastConfig) ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>Simpan Template BAST Default</span>
                  </button>
                )}
              </div>

              {bastFeedback && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    bastFeedback.type === 'success'
                      ? 'border-teal-200 bg-teal-50 text-teal-900'
                      : 'border-rose-200 bg-rose-50 text-rose-900'
                  }`}
                >
                  {bastFeedback.type === 'success' ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <p className="font-medium leading-snug">{bastFeedback.message}</p>
                </div>
              )}

              <button
                type="button"
                disabled={eligibleBastRecords.length === 0 || isGeneratingBast}
                onClick={() => void handleDownloadBastBulkPdf()}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {isGeneratingBast ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>Menyiapkan PDF BAST F4...</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="h-4.5 w-4.5" />
                    <span>Download BAST PDF F4 ({eligibleBastRecords.length} KPM)</span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                Kertas F4 Portrait (216 × 310 mm) · Margin Kiri 2 cm · Kanan 1,5 cm · Atas &amp; Bawah 1 cm · 1 KPM / Halaman
              </p>
            </section>
          )}

          {/* MODE 4: SPTJM MINIMALIS MASSAL (SURAT PERNYATAAN TANGGUNG JAWAB MUTLAK) */}
          {printMode === 'sptjm' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3.5 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Surat Pernyataan Tanggung Jawab Mutlak (SPTJM)
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    1 halaman F4 per KPM · Sesuai template SPTJM Dinas Sosial (Kop atas &amp; TTD mengikuti baris akhir).
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-teal-700 tabular-nums">
                  {eligibleBastRecords.length} KPM
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Tempat Penandatanganan
                  </label>
                  <input
                    type="text"
                    value={sptjmDraft.tempat}
                    onChange={(e) => {
                      setSptjmSavedNotice(false);
                      setSptjmDraft((prev) => ({ ...prev, tempat: e.target.value }));
                    }}
                    placeholder="Pontianak"
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      1. Pilih Hari
                    </label>
                    <select
                      value={sptjmDraft.hari || ''}
                      onChange={(e) => {
                        setSptjmSavedNotice(false);
                        setSptjmDraft((prev) => ({
                          ...prev,
                          hari: e.target.value,
                          tanggalCustomText: '',
                        }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    >
                      <option value="">
                        Otomatis ({getSptjmAutoDayFromIso(sptjmDraft.tanggalIso)})
                      </option>
                      {SPTJM_DAY_OPTIONS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      2. Pilih Tanggal (00 Bulan 0000)
                    </label>
                    <input
                      type="date"
                      value={sptjmDraft.tanggalIso}
                      onChange={(e) => {
                        setSptjmSavedNotice(false);
                        setSptjmDraft((prev) => ({
                          ...prev,
                          tanggalIso: e.target.value,
                          tanggalCustomText: '',
                        }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-slate-500 tabular-nums">
                      Format: {formatIndonesianDDMonthYYYY(sptjmDraft.tanggalIso)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                  <span className="font-semibold text-slate-900">Pratinjau Tempat &amp; Tanggal:</span>{' '}
                  {(sptjmDraft.tempat || DEFAULT_SPTJM_TEMPLATE.tempat).trim()}, {sptjmDatePreviewText}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Jabatan Pejabat Penandatangan
                  </label>
                  <input
                    type="text"
                    value={sptjmDraft.pejabatJabatan}
                    onChange={(e) => {
                      setSptjmSavedNotice(false);
                      setSptjmDraft((prev) => ({ ...prev, pejabatJabatan: e.target.value }));
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Nama Pejabat
                    </label>
                    <input
                      type="text"
                      value={sptjmDraft.pejabatNama}
                      onChange={(e) => {
                        setSptjmSavedNotice(false);
                        setSptjmDraft((prev) => ({ ...prev, pejabatNama: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      NIP Pejabat
                    </label>
                    <input
                      type="text"
                      value={sptjmDraft.pejabatNip}
                      onChange={(e) => {
                        setSptjmSavedNotice(false);
                        setSptjmDraft((prev) => ({ ...prev, pejabatNip: e.target.value }));
                      }}
                      className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {sptjmSavedNotice && (
                <p className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>Template SPTJM berhasil disimpan sebagai default.</span>
                </p>
              )}

              {onSaveSptjmTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveSptjmTemplate(sptjmDraft);
                    setSptjmSavedNotice(true);
                  }}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>Simpan Template SPTJM Default</span>
                </button>
              )}

              {sptjmFeedback && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    sptjmFeedback.type === 'success'
                      ? 'border-teal-200 bg-teal-50 text-teal-900'
                      : 'border-rose-200 bg-rose-50 text-rose-900'
                  }`}
                >
                  {sptjmFeedback.type === 'success' ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <p className="font-medium leading-snug">{sptjmFeedback.message}</p>
                </div>
              )}

              <button
                type="button"
                disabled={eligibleBastRecords.length === 0 || isGeneratingSptjm}
                onClick={() => void handleDownloadSptjmBulkPdf()}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {isGeneratingSptjm ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>Menyiapkan PDF SPTJM F4...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4.5 w-4.5" />
                    <span>Download SPTJM PDF F4 ({eligibleBastRecords.length} KPM)</span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                Kertas F4 Portrait (216 × 310 mm) · Margin Kiri 2 cm · Kanan 1,5 cm · Atas &amp; Bawah 1 cm · 1 KPM / Halaman
              </p>
            </section>
          )}
        </div>
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
          setKuponFeedback(null);
          setBastFeedback(null);
          setSptjmFeedback(null);
        }}
        searchable
        searchPlaceholder="Pencarian..."
      />
    </div>
  );
}
