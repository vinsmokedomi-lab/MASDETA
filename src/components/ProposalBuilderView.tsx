import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkCheck,
  Calculator,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Printer,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  PROPOSAL_STYLE_TEMPLATES,
  ProposalStyleTemplate,
  ResolvedOpdNarrative,
  ResolvedWilayahNarrative,
  buildProposalKpmDataset,
  formatChapterHeading,
  formatRupiahTerbilang,
  getProposalStyleById,
  padTwoDigits,
  resolveNarrativeVariables,
  resolveOpdNarrative,
  resolveProposalDestinationContext,
  resolveWilayahNarrative,
  validateProposalForOpd,
} from '../data/proposalTemplates';
import {
  ItemBantuan,
  KpmRecord,
  ProposalDestinationType,
  ProposalRabMap,
  ProposalRecord,
  ProposalSlotMap,
  ProposalStyleUsageRecord,
  SavedRabPackage,
  WilayahKabKota,
} from '../types/kpm';
import { formatRupiahCurrency } from '../utils/rabCalculator';
import {
  OpdKetSourceMode,
  exportProposalDocumentToPdf,
} from '../utils/proposalPdfExporter';
import { ProposalCoverRenderer } from './ProposalCoverRenderer';

interface ProposalBuilderViewProps {
  proposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  savedRabMap: ProposalRabMap;
  styleHistory: ProposalStyleUsageRecord[];
  initialProposalId?: string | null;
  backLabel?: string;
  schemaMissingNotice?: boolean;
  canUpdate?: boolean;
  onBack: () => void;
  onOpenRabForProposal: (proposalId: string) => void;
  onRecordStyleUsage: (params: {
    styleId: number;
    proposalId: string;
    namaProposal: string;
    tahun: string;
    jenisTujuan: ProposalDestinationType;
  }) => Promise<void> | void;
  onDeleteStyleUsage: (id: string) => Promise<void> | void;
}

type StyleFilterMode = 'all' | 'unused';

function getPreviewFontCss(fontStyle: ProposalStyleTemplate['fontStyle']): string {
  if (fontStyle === 'serif' || fontStyle === 'classic') {
    return 'Georgia, "Times New Roman", serif';
  }
  return '"Roboto", ui-sans-serif, system-ui, -apple-system, sans-serif';
}

export function ProposalBuilderView({
  proposals,
  records,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  savedRabMap,
  styleHistory,
  initialProposalId = null,
  backLabel = 'Kembali',
  schemaMissingNotice = false,
  canUpdate = true,
  onBack,
  onOpenRabForProposal,
  onRecordStyleUsage,
  onDeleteStyleUsage,
}: ProposalBuilderViewProps) {
  // Urutkan proposal terbaru lebih dulu beserta jumlah KPM aktif (accepted)
  const sortedProposals = useMemo(() => {
    const countMap = new Map<string, number>();
    records.forEach((rec) => {
      if (rec.validasi !== 'accepted') return;
      if (rec.proposalId) {
        countMap.set(rec.proposalId, (countMap.get(rec.proposalId) || 0) + 1);
      } else if (rec.proposal) {
        const matched = proposals.find(
          (p) =>
            p.namaProposal.trim().toLowerCase() === rec.proposal.trim().toLowerCase() &&
            String(p.tahun) === String(rec.tahun)
        );
        if (matched) {
          countMap.set(matched.id, (countMap.get(matched.id) || 0) + 1);
        }
      }
    });

    return [...proposals]
      .map((proposal) => ({
        proposal,
        acceptedCount: countMap.get(proposal.id) || 0,
      }))
      .sort((a, b) => {
        const yearDiff = Number(b.proposal.tahun || 0) - Number(a.proposal.tahun || 0);
        if (yearDiff !== 0) return yearDiff;
        return a.proposal.namaProposal.localeCompare(b.proposal.namaProposal, 'id');
      });
  }, [proposals, records]);

  const [selectedProposalId, setSelectedProposalId] = useState<string>(() => {
    if (initialProposalId && proposals.some((p) => p.id === initialProposalId)) {
      return initialProposalId;
    }
    const firstWithKpm = sortedProposals.find((p) => p.acceptedCount > 0);
    return firstWithKpm?.proposal.id || sortedProposals[0]?.proposal.id || '';
  });

  useEffect(() => {
    if (initialProposalId && proposals.some((p) => p.id === initialProposalId)) {
      setSelectedProposalId(initialProposalId);
    }
  }, [initialProposalId, proposals]);

  const activeProposal = useMemo(
    () => proposals.find((p) => p.id === selectedProposalId) || sortedProposals[0]?.proposal || null,
    [proposals, selectedProposalId, sortedProposals]
  );

  const destinationContext = useMemo(() => {
    if (!activeProposal) return null;
    return resolveProposalDestinationContext(activeProposal, proposals, wilayahList);
  }, [activeProposal, proposals, wilayahList]);

  const [destination, setDestination] = useState<ProposalDestinationType>('OPD');

  // Pastikan pilihan tujuan selalu sesuai wilayah proposal (Kelurahan/OPD vs Kecamatan/OPD)
  useEffect(() => {
    if (!destinationContext) return;
    if (!destinationContext.allowedDestinations.includes(destination)) {
      setDestination(destinationContext.defaultDestination);
    }
  }, [destinationContext, destination]);

  // Pilih otomatis style pertama yang belum pernah digunakan saat awal buka
  const [selectedStyleId, setSelectedStyleId] = useState<number>(() => {
    const usedIds = new Set(styleHistory.map((h) => h.styleId));
    const firstUnused = PROPOSAL_STYLE_TEMPLATES.find((tpl) => !usedIds.has(tpl.id));
    return firstUnused ? firstUnused.id : 1;
  });

  const [styleFilter, setStyleFilter] = useState<StyleFilterMode>('all');
  const [opdKetSource, setOpdKetSource] = useState<OpdKetSourceMode>('pekerjaan');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isSavingHistory, setIsSavingHistory] = useState<boolean>(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [showNarrativeModal, setShowNarrativeModal] = useState<boolean>(false);
  const [dismissSchemaHint, setDismissSchemaHint] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<{
    tone: 'teal' | 'amber' | 'rose';
    text: string;
  } | null>(null);

  // Override narasi opsional (tidak memodifikasi 15 template bawaan)
  const [customOpdNarrative, setCustomOpdNarrative] = useState<ResolvedOpdNarrative | null>(null);
  const [customWilayahNarrative, setCustomWilayahNarrative] =
    useState<ResolvedWilayahNarrative | null>(null);

  // Draft teks mentah untuk modal Edit Narasi agar pengetikan Enter/spasi bebas & tidak melompat
  const [opdDraft, setOpdDraft] = useState({
    pengantar: '',
    tujuanIntro: '',
    tujuanPoints: '',
    kegiatan: '',
    anggaran: '',
    penutup: '',
  });
  const [wilayahDraft, setWilayahDraft] = useState({
    pendahuluan: '',
    maksud: '',
    tujuanPoints: '',
    lampiranIntro: '',
    penutup: '',
  });

  // Reset override narasi saat ganti proposal atau ganti style agar narasi selalu sinkron
  useEffect(() => {
    setCustomOpdNarrative(null);
    setCustomWilayahNarrative(null);
  }, [selectedProposalId, selectedStyleId, destination]);

  const activeStyle = useMemo(
    () => getProposalStyleById(selectedStyleId),
    [selectedStyleId]
  );

  const dataset = useMemo(() => {
    if (!activeProposal) return null;
    return buildProposalKpmDataset({
      proposal: activeProposal,
      allProposals: proposals,
      records,
      items,
      wilayahList,
      proposalSlotMap,
    });
  }, [activeProposal, proposals, records, items, wilayahList, proposalSlotMap]);

  const savedRab = activeProposal ? savedRabMap[activeProposal.id] || null : null;

  const opdValidation = useMemo(() => {
    if (!dataset) return null;
    return validateProposalForOpd(dataset, savedRab);
  }, [dataset, savedRab]);

  const narrativeVars = useMemo(() => {
    if (!destinationContext || !dataset) return null;
    return resolveNarrativeVariables({
      context: destinationContext,
      destination,
      totalKpm: dataset.totalActiveKpm,
      totalAnggaran: savedRab?.totalTerhitung || savedRab?.totalAnggaran || 0,
    });
  }, [destinationContext, destination, dataset, savedRab]);

  const defaultOpdNarrative = useMemo(() => {
    if (!narrativeVars) return null;
    return resolveOpdNarrative(activeStyle, narrativeVars);
  }, [activeStyle, narrativeVars]);

  const defaultWilayahNarrative = useMemo(() => {
    if (!narrativeVars) return null;
    return resolveWilayahNarrative(activeStyle, narrativeVars);
  }, [activeStyle, narrativeVars]);

  const effectiveOpdNarrative = customOpdNarrative || defaultOpdNarrative;
  const effectiveWilayahNarrative = customWilayahNarrative || defaultWilayahNarrative;

  // Muat draft mentah setiap kali modal Edit Narasi dibuka
  useEffect(() => {
    if (!showNarrativeModal) return;
    if (effectiveOpdNarrative) {
      setOpdDraft({
        pengantar: effectiveOpdNarrative.pengantar.join('\n\n'),
        tujuanIntro: effectiveOpdNarrative.tujuanIntro,
        tujuanPoints: effectiveOpdNarrative.tujuanPoints.join('\n'),
        kegiatan: effectiveOpdNarrative.kegiatan.join('\n\n'),
        anggaran: effectiveOpdNarrative.anggaran.join('\n\n'),
        penutup: effectiveOpdNarrative.penutup.join('\n\n'),
      });
    }
    if (effectiveWilayahNarrative) {
      setWilayahDraft({
        pendahuluan: effectiveWilayahNarrative.pendahuluan.join('\n\n'),
        maksud: effectiveWilayahNarrative.maksud,
        tujuanPoints: effectiveWilayahNarrative.tujuanPoints.join('\n'),
        lampiranIntro: effectiveWilayahNarrative.lampiranIntro,
        penutup: effectiveWilayahNarrative.penutup.join('\n\n'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNarrativeModal]);

  const handleApplyNarrativeDraft = () => {
    const splitParagraphs = (raw: string) =>
      raw
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);
    const splitLines = (raw: string) =>
      raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    if (destination === 'OPD' && effectiveOpdNarrative) {
      setCustomOpdNarrative({
        ...effectiveOpdNarrative,
        pengantar: splitParagraphs(opdDraft.pengantar),
        tujuanIntro: opdDraft.tujuanIntro.trim(),
        tujuanPoints: splitLines(opdDraft.tujuanPoints),
        kegiatan: splitParagraphs(opdDraft.kegiatan),
        anggaran: splitParagraphs(opdDraft.anggaran),
        penutup: splitParagraphs(opdDraft.penutup),
      });
    } else if (destination !== 'OPD' && effectiveWilayahNarrative) {
      setCustomWilayahNarrative({
        ...effectiveWilayahNarrative,
        pendahuluan: splitParagraphs(wilayahDraft.pendahuluan),
        maksud: wilayahDraft.maksud.trim(),
        tujuanPoints: splitLines(wilayahDraft.tujuanPoints),
        lampiranIntro: wilayahDraft.lampiranIntro.trim(),
        penutup: splitParagraphs(wilayahDraft.penutup),
      });
    }
    setShowNarrativeModal(false);
  };

  // Grupkan riwayat penggunaan per style_id (1..15)
  const historyByStyleId = useMemo(() => {
    const map = new Map<number, ProposalStyleUsageRecord[]>();
    styleHistory.forEach((entry) => {
      const list = map.get(entry.styleId) || [];
      list.push(entry);
      map.set(entry.styleId, list);
    });
    return map;
  }, [styleHistory]);

  const unusedStylesCount = useMemo(
    () => PROPOSAL_STYLE_TEMPLATES.filter((t) => (historyByStyleId.get(t.id)?.length || 0) === 0).length,
    [historyByStyleId]
  );

  const visibleStyles = useMemo(() => {
    if (styleFilter === 'unused') {
      return PROPOSAL_STYLE_TEMPLATES.filter(
        (t) => (historyByStyleId.get(t.id)?.length || 0) === 0
      );
    }
    return PROPOSAL_STYLE_TEMPLATES;
  }, [styleFilter, historyByStyleId]);

  const activeStyleHistory = historyByStyleId.get(activeStyle.id) || [];

  const isExportBlocked =
    !activeProposal ||
    !destinationContext ||
    !dataset ||
    dataset.totalActiveKpm === 0 ||
    (destination === 'OPD' && Boolean(opdValidation && !opdValidation.isReady));

  const autoRecordCurrentUsage = async () => {
    if (!activeProposal) return;
    try {
      await onRecordStyleUsage({
        styleId: activeStyle.id,
        proposalId: activeProposal.id,
        namaProposal: activeProposal.namaProposal,
        tahun: activeProposal.tahun,
        jenisTujuan: destination,
      });
    } catch {
      // Jangan menghalangi ekspor/cetak jika pencatatan riwayat gagal sementara
    }
  };

  const handleDownloadPdf = async () => {
    if (
      isExportBlocked ||
      isExportingPdf ||
      !activeProposal ||
      !destinationContext ||
      !dataset ||
      !effectiveOpdNarrative ||
      !effectiveWilayahNarrative
    ) {
      return;
    }

    setIsExportingPdf(true);
    setStatusNotice(null);
    try {
      const saved = await exportProposalDocumentToPdf({
        styleTemplate: activeStyle,
        context: destinationContext,
        destination,
        dataset,
        savedRab,
        opdNarrative: effectiveOpdNarrative,
        wilayahNarrative: effectiveWilayahNarrative,
        opdKetSource,
      });
      await autoRecordCurrentUsage();
      setStatusNotice({
        tone: 'teal',
        text: `PDF F4 berhasil dibuat (${saved.savedFileName}) dan penggunaan ${activeStyle.code} dicatat ke riwayat.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat file PDF Proposal.';
      setStatusNotice({ tone: 'rose', text: msg });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintF4 = async () => {
    if (isExportBlocked || !activeProposal) return;
    await autoRecordCurrentUsage();
    setStatusNotice({
      tone: 'teal',
      text: `Dialog cetak F4 (216×330mm) dibuka dan penggunaan ${activeStyle.code} telah dicatat.`,
    });
    window.setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleManualRecordHistory = async () => {
    if (!activeProposal || isSavingHistory) return;
    setIsSavingHistory(true);
    setStatusNotice(null);
    try {
      await onRecordStyleUsage({
        styleId: activeStyle.id,
        proposalId: activeProposal.id,
        namaProposal: activeProposal.namaProposal,
        tahun: activeProposal.tahun,
        jenisTujuan: destination,
      });
      setStatusNotice({
        tone: 'teal',
        text: `${activeStyle.code} tercatat telah digunakan untuk ${activeProposal.namaProposal} ${activeProposal.tahun} (${destination}).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan riwayat pemakaian style.';
      setStatusNotice({ tone: 'rose', text: msg });
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleDeleteHistory = async (entry: ProposalStyleUsageRecord) => {
    if (deletingHistoryId) return;
    setDeletingHistoryId(entry.id);
    try {
      await onDeleteStyleUsage(entry.id);
      setStatusNotice({
        tone: 'teal',
        text: `Riwayat pemakaian Style ${String(entry.styleId).padStart(2, '0')} untuk ${entry.namaProposal} (${entry.jenisTujuan}) dihapus.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus riwayat style.';
      setStatusNotice({ tone: 'rose', text: msg });
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const rabPkgByCode = useMemo(() => {
    const map = new Map<string, SavedRabPackage>();
    (savedRab?.packages || []).forEach((pkg) => {
      map.set(String(pkg.kode || '').trim().toUpperCase(), pkg);
    });
    return map;
  }, [savedRab]);

  const previewFileName = destinationContext ? destinationContext.buildFileName(destination) : '';

  // Render isi dokumen F4 (digunakan di Live Preview maupun Print Container)
  const renderDocumentBodyContent = (forPrint: boolean) => {
    if (
      !activeProposal ||
      !destinationContext ||
      !dataset ||
      !effectiveOpdNarrative ||
      !effectiveWilayahNarrative
    ) {
      return null;
    }

    const { primary, secondary, tint, border } = activeStyle.palette;
    const fontCss = getPreviewFontCss(activeStyle.fontStyle);
    const isSolidHead = activeStyle.tableTheme === 'solid-primary';
    const isDarkSlate = activeStyle.tableTheme === 'dark-slate';
    const isSoftTint = activeStyle.tableTheme === 'soft-tint';

    const thBg = isDarkSlate
      ? '#0F172A'
      : isSolidHead
      ? primary
      : isSoftTint
      ? tint
      : '#F1F5F9';
    const thColor = isDarkSlate || isSolidHead ? '#FFFFFF' : isSoftTint ? primary : '#0F172A';
    const tblBorder = isDarkSlate ? '#CBD5E1' : isSoftTint || isSolidHead ? border : '#64748B';

    const sectionHeadingStyle = {
      color: primary,
      borderBottom: `1.5px solid ${border}`,
    };

    const renderOpdClosing = (chapterNum: number) => (
      <section className="space-y-2.5 break-inside-avoid">
        <h3 className="pb-1 text-[13px] font-bold uppercase tracking-wide" style={sectionHeadingStyle}>
          {formatChapterHeading(
            activeStyle.chapterFormat,
            chapterNum,
            effectiveOpdNarrative.penutupTitle
          )}
        </h3>
        {effectiveOpdNarrative.penutup.map((para, i) => (
          <p key={`opd-close-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
            {para}
          </p>
        ))}
      </section>
    );

    const grandTotalOpd =
      savedRab?.totalTerhitung || savedRab?.totalAnggaran || 0;

    return (
      <div
        className={forPrint ? 'masdeta-proposal-print-doc' : 'space-y-6'}
        style={{ fontFamily: fontCss }}
      >
        {/* HALAMAN 1: COVER (Bersih tanpa running header) */}
        <div
          className={
            forPrint
              ? 'masdeta-proposal-cover-page'
              : 'mx-auto aspect-[216/330] w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm'
          }
        >
          <ProposalCoverRenderer
            styleTemplate={activeStyle}
            context={destinationContext}
            destination={destination}
            totalKpm={dataset.totalActiveKpm}
            variant="preview"
          />
        </div>

        {/* HALAMAN 2+: ISI DOKUMEN DENGAN RUNNING HEADER */}
        <div
          className={
            forPrint
              ? 'masdeta-proposal-body-pages'
              : 'mx-auto w-full max-w-[760px] rounded-xl border border-slate-300 bg-white shadow-sm'
          }
        >
          {/* Running Header untuk Live Preview (saat print ditangani oleh thead khusus print agar muncul di tiap halaman 2+) */}
          {forPrint ? (
            <table className="w-full border-collapse">
              <thead className="masdeta-print-running-header">
                <tr>
                  <td className="pb-3">
                    <div
                      className="flex items-center justify-between border-b pb-1.5"
                      style={{ borderColor: border }}
                    >
                      <span
                        className="text-[9.5px] font-bold uppercase tracking-wide"
                        style={{ color: primary }}
                      >
                        PROPOSAL BANTUAN USAHA MANDIRI — {destinationContext.runningHeaderLabel}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        Tahun {destinationContext.tahun} · {destination}
                      </span>
                    </div>
                  </td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="align-top">
                    {renderInnerBody({
                      primary,
                      secondary,
                      tint,
                      border,
                      thBg,
                      thColor,
                      tblBorder,
                      sectionHeadingStyle,
                      renderOpdClosing,
                      grandTotalOpd,
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="pl-[2cm] pr-[1.5cm] py-[1cm] max-sm:px-5 max-sm:py-6">
              <div
                className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                style={{ borderColor: border }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: primary }}
                >
                  PROPOSAL BANTUAN USAHA MANDIRI — {destinationContext.runningHeaderLabel}
                </span>
                <span className="text-[10px] text-slate-500">
                  Halaman 2+ · Tahun {destinationContext.tahun} · {destination}
                </span>
              </div>
              {renderInnerBody({
                primary,
                secondary,
                tint,
                border,
                thBg,
                thColor,
                tblBorder,
                sectionHeadingStyle,
                renderOpdClosing,
                grandTotalOpd,
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderInnerBody = (cfg: {
    primary: string;
    secondary: string;
    tint: string;
    border: string;
    thBg: string;
    thColor: string;
    tblBorder: string;
    sectionHeadingStyle: { color: string; borderBottom: string };
    renderOpdClosing: (chapterNum: number) => React.ReactNode;
    grandTotalOpd: number;
  }) => {
    if (
      !destinationContext ||
      !dataset ||
      !effectiveOpdNarrative ||
      !effectiveWilayahNarrative
    ) {
      return null;
    }

    const {
      primary,
      secondary,
      tint,
      border,
      thBg,
      thColor,
      tblBorder,
      sectionHeadingStyle,
      renderOpdClosing,
      grandTotalOpd,
    } = cfg;

    if (destination === 'OPD') {
      const closingBefore = activeStyle.opdClosingPosition === 'before-appendix';
      const appendixChapterNum = closingBefore ? 6 : 5;
      const closingChapterNum = closingBefore ? 5 : 6;

      return (
        <div className="space-y-5">
          {/* Judul Dokumen */}
          <div className="text-center">
            <h2 className="text-[15px] font-extrabold uppercase tracking-tight text-slate-900">
              PROPOSAL {activeStyle.coverMainTitle.replace(/^PROPOSAL\s+/i, '')}
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold uppercase" style={{ color: secondary }}>
              {destinationContext.wilayahUpper} · TAHUN {destinationContext.tahun}
            </p>
          </div>

          {/* Bab 1: Pengantar / Latar Belakang */}
          <section className="space-y-2">
            <h3
              className="pb-1 text-[13px] font-bold uppercase tracking-wide"
              style={sectionHeadingStyle}
            >
              {formatChapterHeading(
                activeStyle.chapterFormat,
                1,
                effectiveOpdNarrative.pengantarTitle
              )}
            </h3>
            {effectiveOpdNarrative.pengantar.map((para, i) => (
              <p key={`opd-p-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
                {para}
              </p>
            ))}
          </section>

          {/* Bab 2: Tujuan */}
          <section className="space-y-2">
            <h3
              className="pb-1 text-[13px] font-bold uppercase tracking-wide"
              style={sectionHeadingStyle}
            >
              {formatChapterHeading(activeStyle.chapterFormat, 2, effectiveOpdNarrative.tujuanTitle)}
            </h3>
            {effectiveOpdNarrative.tujuanIntro && (
              <p className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
                {effectiveOpdNarrative.tujuanIntro}
              </p>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-justify text-[11.5px] leading-[1.55] text-slate-800">
              {effectiveOpdNarrative.tujuanPoints.map((pt, i) => (
                <li key={`opd-t-${i}`}>{pt}</li>
              ))}
            </ol>
          </section>

          {/* Bab 3: Kegiatan */}
          <section className="space-y-2">
            <h3
              className="pb-1 text-[13px] font-bold uppercase tracking-wide"
              style={sectionHeadingStyle}
            >
              {formatChapterHeading(
                activeStyle.chapterFormat,
                3,
                effectiveOpdNarrative.kegiatanTitle
              )}
            </h3>
            {effectiveOpdNarrative.kegiatan.map((para, i) => (
              <p key={`opd-k-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
                {para}
              </p>
            ))}
          </section>

          {/* Bab 4: Rancangan Anggaran */}
          <section className="space-y-2">
            <h3
              className="pb-1 text-[13px] font-bold uppercase tracking-wide"
              style={sectionHeadingStyle}
            >
              {formatChapterHeading(
                activeStyle.chapterFormat,
                4,
                effectiveOpdNarrative.anggaranTitle
              )}
            </h3>
            {effectiveOpdNarrative.anggaran.map((para, i) => (
              <p key={`opd-a-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
                {para}
              </p>
            ))}
          </section>

          {/* Penutup sebelum Lampiran jika style menentukan begitu */}
          {closingBefore && renderOpdClosing(closingChapterNum)}

          {/* Lampiran: Per Kelompok Master Item (Tabel RAB + Tabel KPM Berlanjut) */}
          <section className="space-y-5 pt-2">
            <h3
              className="pb-1 text-[13px] font-bold uppercase tracking-wide"
              style={sectionHeadingStyle}
            >
              {formatChapterHeading(
                activeStyle.chapterFormat,
                appendixChapterNum,
                'LAMPIRAN RINCIAN ANGGARAN DAN DAFTAR CALON PENERIMA MANFAAT'
              )}
            </h3>

            {dataset.opdGroups.map((group, gIdx) => {
              const rabPkg = rabPkgByCode.get(group.itemCode);
              const subItems = rabPkg?.subItems || [];
              const penerimaCount = group.kpms.length;
              const groupSubtotal = subItems.reduce(
                (sum, sub) =>
                  sum +
                  Math.max(1, Math.floor(sub.volumePerPaket || 1)) *
                    penerimaCount *
                    Math.max(0, Math.round(sub.hargaSatuan || 0)),
                0
              );

              return (
                <div key={group.itemCode} className="space-y-2.5">
                  <div
                    className="flex items-center justify-between rounded border px-3 py-1.5 text-[11px] font-bold uppercase"
                    style={{
                      backgroundColor: tint,
                      borderColor: border,
                      color: primary,
                    }}
                  >
                    <span>
                      {gIdx + 1}. PAKET {group.itemCode} — {rabPkg?.namaPaket || group.itemName}
                    </span>
                    <span className="tabular-nums">{penerimaCount} Calon Penerima</span>
                  </div>

                  {/* Tabel RAB Kelompok */}
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-collapse text-[10px] tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: thBg, color: thColor }}>
                          <th
                            className="w-8 border px-1.5 py-1.5 text-center font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            NO
                          </th>
                          <th
                            className="border px-2 py-1.5 text-left font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            NAMA BARANG
                          </th>
                          <th
                            className="w-20 border px-1.5 py-1.5 text-center font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            SATUAN
                          </th>
                          <th
                            className="w-28 border px-2 py-1.5 text-right font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            HARGA SATUAN
                          </th>
                          <th
                            className="w-20 border px-1.5 py-1.5 text-center font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            TOTAL UNIT
                          </th>
                          <th
                            className="w-28 border px-2 py-1.5 text-right font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            TOTAL HARGA
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subItems.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="border px-2 py-2 text-center italic text-slate-500"
                              style={{ borderColor: tblBorder }}
                            >
                              Data rincian RAB untuk paket {group.itemCode} belum tersimpan.
                            </td>
                          </tr>
                        ) : (
                          subItems.map((sub, sIdx) => {
                            const vol = Math.max(1, Math.floor(sub.volumePerPaket || 1));
                            const unitPrice = Math.max(0, Math.round(sub.hargaSatuan || 0));
                            const totalUnit = vol * penerimaCount;
                            const totalHarga = totalUnit * unitPrice;
                            return (
                              <tr key={`${group.itemCode}-rab-${sub.id || sIdx}`}>
                                <td
                                  className="border px-1.5 py-1 text-center"
                                  style={{ borderColor: tblBorder }}
                                >
                                  {sIdx + 1}
                                </td>
                                <td className="border px-2 py-1" style={{ borderColor: tblBorder }}>
                                  {sub.namaBarang}
                                </td>
                                <td
                                  className="border px-1.5 py-1 text-center"
                                  style={{ borderColor: tblBorder }}
                                >
                                  {vol} {sub.satuan || 'Unit'}
                                </td>
                                <td
                                  className="border px-2 py-1 text-right"
                                  style={{ borderColor: tblBorder }}
                                >
                                  {formatRupiahCurrency(unitPrice)}
                                </td>
                                <td
                                  className="border px-1.5 py-1 text-center"
                                  style={{ borderColor: tblBorder }}
                                >
                                  {totalUnit} {sub.satuan || 'Unit'}
                                </td>
                                <td
                                  className="border px-2 py-1 text-right"
                                  style={{ borderColor: tblBorder }}
                                >
                                  {formatRupiahCurrency(totalHarga)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                        <tr style={{ backgroundColor: tint, color: primary }} className="font-bold">
                          <td
                            colSpan={4}
                            className="border px-2 py-1.5 text-left"
                            style={{ borderColor: tblBorder }}
                          >
                            Total Calon Penerima
                          </td>
                          <td
                            colSpan={2}
                            className="border px-2 py-1.5 text-right"
                            style={{ borderColor: tblBorder }}
                          >
                            {penerimaCount} Orang
                          </td>
                        </tr>
                        <tr style={{ backgroundColor: tint, color: primary }} className="font-bold">
                          <td
                            colSpan={4}
                            className="border px-2 py-1.5 text-left"
                            style={{ borderColor: tblBorder }}
                          >
                            Total Biaya
                          </td>
                          <td
                            colSpan={2}
                            className="border px-2 py-1.5 text-right"
                            style={{ borderColor: tblBorder }}
                          >
                            {formatRupiahCurrency(groupSubtotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Tabel Daftar KPM Kelompok (Nomor Berlanjut 01..NN) */}
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-collapse text-[10px]"
                      style={{ borderColor: tblBorder }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: thBg, color: thColor }}>
                          <th
                            className="w-9 border px-1.5 py-1.5 text-center font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            NO
                          </th>
                          <th
                            className="w-[22%] border px-2 py-1.5 text-left font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            NAMA
                          </th>
                          <th
                            className="border px-2 py-1.5 text-left font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            ALAMAT
                          </th>
                          <th
                            className="w-[125px] border px-2 py-1.5 text-center font-bold whitespace-nowrap"
                            style={{ borderColor: tblBorder }}
                          >
                            NIK KTP
                          </th>
                          <th
                            className="w-[20%] border px-2 py-1.5 text-left font-bold"
                            style={{ borderColor: tblBorder }}
                          >
                            KET / PEKERJAAN
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.kpms.map((kpm) => (
                          <tr key={kpm.record.id}>
                            <td
                              className="border px-1.5 py-1 text-center font-semibold tabular-nums"
                              style={{ borderColor: tblBorder }}
                            >
                              {padTwoDigits(kpm.continuousNo)}
                            </td>
                            <td
                              className="border px-2 py-1 font-medium text-slate-900"
                              style={{ borderColor: tblBorder }}
                            >
                              {kpm.nama}
                            </td>
                            <td
                              className="border px-2 py-1 text-slate-700"
                              style={{ borderColor: tblBorder }}
                            >
                              {kpm.alamatLengkap}
                            </td>
                            <td
                              className="border px-2 py-1 text-center font-medium whitespace-nowrap tabular-nums"
                              style={{ borderColor: tblBorder }}
                            >
                              {kpm.nikKtp}
                            </td>
                            <td
                              className="border px-2 py-1 text-slate-700"
                              style={{ borderColor: tblBorder }}
                            >
                              {opdKetSource === 'usaha' ? kpm.usahaByItem : kpm.pekerjaanDb}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Kotak Grand Total OPD */}
            <div
              className="rounded border px-3.5 py-2.5 break-inside-avoid"
              style={{ backgroundColor: tint, borderColor: primary }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-bold">
                <span style={{ color: primary }}>
                  TOTAL KESELURUHAN: {dataset.totalActiveKpm} CALON PENERIMA MANFAAT
                </span>
                <span className="tabular-nums" style={{ color: primary }}>
                  {formatRupiahCurrency(grandTotalOpd)}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] italic text-slate-700">
                Terbilang: {formatRupiahTerbilang(grandTotalOpd)}
              </p>
            </div>
          </section>

          {/* Penutup setelah Lampiran jika style menentukan begitu */}
          {!closingBefore && renderOpdClosing(closingChapterNum)}
        </div>
      );
    }

    // ============================================================================
    // MODE KELURAHAN / KECAMATAN (Tanpa RAB & Tanpa Harga, 1 Tabel KPM Utuh)
    // ============================================================================
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-[15px] font-extrabold uppercase tracking-tight text-slate-900">
            PROPOSAL {activeStyle.coverMainTitle.replace(/^PROPOSAL\s+/i, '')}
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold uppercase" style={{ color: secondary }}>
            {destinationContext.wilayahUpper} · TAHUN {destinationContext.tahun}
          </p>
        </div>

        {/* 1. Pendahuluan */}
        <section className="space-y-2">
          <h3
            className="pb-1 text-[13px] font-bold uppercase tracking-wide"
            style={sectionHeadingStyle}
          >
            {formatChapterHeading(
              activeStyle.chapterFormat,
              1,
              effectiveWilayahNarrative.pendahuluanTitle
            )}
          </h3>
          {effectiveWilayahNarrative.pendahuluan.map((para, i) => (
            <p key={`wil-p-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
              {para}
            </p>
          ))}
        </section>

        {/* 2. Maksud dan Tujuan */}
        <section className="space-y-2">
          <h3
            className="pb-1 text-[13px] font-bold uppercase tracking-wide"
            style={sectionHeadingStyle}
          >
            {formatChapterHeading(
              activeStyle.chapterFormat,
              2,
              effectiveWilayahNarrative.maksudTujuanTitle
            )}
          </h3>
          <div>
            <p className="text-[11.5px] font-bold" style={{ color: primary }}>
              {effectiveWilayahNarrative.maksudLabel}:
            </p>
            <p className="mt-0.5 text-justify text-[11.5px] leading-[1.6] text-slate-800">
              {effectiveWilayahNarrative.maksud}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] font-bold" style={{ color: primary }}>
              {effectiveWilayahNarrative.tujuanLabel}:
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-justify text-[11.5px] leading-[1.55] text-slate-800">
              {effectiveWilayahNarrative.tujuanPoints.map((pt, i) => (
                <li key={`wil-t-${i}`}>{pt}</li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. Lampiran (1 Tabel Utuh KPM tanpa RAB/Harga) */}
        <section className="space-y-2.5">
          <h3
            className="pb-1 text-[13px] font-bold uppercase tracking-wide"
            style={sectionHeadingStyle}
          >
            {formatChapterHeading(
              activeStyle.chapterFormat,
              3,
              effectiveWilayahNarrative.lampiranTitle
            )}
          </h3>
          <p className="text-justify text-[11.5px] leading-[1.55] text-slate-800">
            {effectiveWilayahNarrative.lampiranIntro}
          </p>

          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-[9.8px]"
              style={{ borderColor: tblBorder }}
            >
              <thead>
                <tr style={{ backgroundColor: thBg, color: thColor }}>
                  <th
                    className="w-8 border px-1 py-1.5 text-center font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    No.
                  </th>
                  <th
                    className="w-[21%] border px-1.5 py-1.5 text-left font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    Nama Calon KPM
                  </th>
                  <th
                    className="border px-1.5 py-1.5 text-left font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    Alamat
                  </th>
                  <th
                    className="w-10 border px-1 py-1.5 text-center font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    RT
                  </th>
                  <th
                    className="w-10 border px-1 py-1.5 text-center font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    RW
                  </th>
                  <th
                    className="w-[120px] border px-1.5 py-1.5 text-center font-bold whitespace-nowrap"
                    style={{ borderColor: tblBorder }}
                  >
                    NIK KTP
                  </th>
                  <th
                    className="w-11 border px-1 py-1.5 text-center font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    Desil
                  </th>
                  <th
                    className="w-[15%] border px-1.5 py-1.5 text-left font-bold"
                    style={{ borderColor: tblBorder }}
                  >
                    KEL
                  </th>
                </tr>
              </thead>
              <tbody>
                {dataset.wilayahSortedRows.map((row) => (
                  <tr key={row.record.id}>
                    <td
                      className="border px-1 py-1 text-center font-semibold tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      {padTwoDigits(row.seqNo)}
                    </td>
                    <td
                      className="border px-1.5 py-1 font-medium text-slate-900"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.nama}
                    </td>
                    <td
                      className="border px-1.5 py-1 text-slate-700"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.alamatJalan}
                    </td>
                    <td
                      className="border px-1 py-1 text-center tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.rtPadded}
                    </td>
                    <td
                      className="border px-1 py-1 text-center tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.rwPadded}
                    </td>
                    <td
                      className="border px-1.5 py-1 text-center font-medium whitespace-nowrap tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.nikKtp}
                    </td>
                    <td
                      className="border px-1 py-1 text-center tabular-nums"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.desilText}
                    </td>
                    <td
                      className="border px-1.5 py-1 text-slate-700"
                      style={{ borderColor: tblBorder }}
                    >
                      {row.kelurahan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Penutup */}
        <section className="space-y-2 break-inside-avoid">
          <h3
            className="pb-1 text-[13px] font-bold uppercase tracking-wide"
            style={sectionHeadingStyle}
          >
            {formatChapterHeading(
              activeStyle.chapterFormat,
              4,
              effectiveWilayahNarrative.penutupTitle
            )}
          </h3>
          {effectiveWilayahNarrative.penutup.map((para, i) => (
            <p key={`wil-c-${i}`} className="text-justify text-[11.5px] leading-[1.6] text-slate-800">
              {para}
            </p>
          ))}
        </section>
      </div>
    );
  };

  return (
    <>
      <div className="masdeta-no-print min-h-screen bg-[#F8FAFC] pb-28 text-slate-900">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{backLabel}</span>
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold tracking-tight text-slate-900">
                  Buat Proposal
                </h1>
                <p className="truncate text-xs text-slate-500">
                  15 Template Tetap F4 (216×330mm) · Validasi RAB OPD &amp; Riwayat Anti-Duplikat
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!activeProposal}
                onClick={() => setShowNarrativeModal(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Narasi</span>
              </button>

              <button
                type="button"
                disabled={isExportBlocked}
                onClick={handlePrintF4}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Cetak F4</span>
              </button>

              <button
                type="button"
                disabled={isExportBlocked || isExportingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isExportingPdf ? 'Menyiapkan PDF...' : 'Download PDF F4'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-5 px-4 pt-5 sm:px-6">
          {/* Peringatan migrasi SQL non-blocking jika tabel baru belum dijalankan */}
          {schemaMissingNotice && !dismissSchemaHint && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Tabel khusus <code className="font-semibold">proposal_rab_configs</code> /{' '}
                  <code className="font-semibold">proposal_style_history</code> belum terdeteksi di
                  Supabase. Fitur tetap berfungsi memakai penyimpanan cadangan; jalankan skrip SQL
                  migrasi di Supabase SQL Editor agar sinkronisasi relasional aktif penuh.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDismissSchemaHint(true)}
                className="shrink-0 font-semibold underline"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Inline Status Notice */}
          {statusNotice && (
            <div
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
                statusNotice.tone === 'teal'
                  ? 'border-teal-200 bg-teal-50/80 text-teal-900'
                  : statusNotice.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2">
                {statusNotice.tone === 'teal' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{statusNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="shrink-0 text-[11px] font-semibold underline"
              >
                Tutup
              </button>
            </div>
          )}

          {/* LANGKAH 1: PILIH PROPOSAL & JENIS TUJUAN */}
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">
                1. Pilih Proposal &amp; Jenis Tujuan Dokumen
              </h2>
              <p className="text-xs text-slate-500">
                Jenis tujuan menyesuaikan otomatis dengan tingkat wilayah Proposal (Kelurahan atau
                Kecamatan)
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Dropdown Proposal */}
                <div className="lg:col-span-5">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Proposal Sumber Data
                  </label>
                  <select
                    value={activeProposal?.id || ''}
                    onChange={(e) => {
                      setSelectedProposalId(e.target.value);
                      setStatusNotice(null);
                    }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    {sortedProposals.length === 0 && (
                      <option value="">Belum ada proposal tersedia</option>
                    )}
                    {sortedProposals.map(({ proposal, acceptedCount }) => (
                      <option key={proposal.id} value={proposal.id}>
                        {proposal.tahun} · {proposal.namaProposal} ({acceptedCount} KPM)
                      </option>
                    ))}
                  </select>
                  {destinationContext && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Wilayah terdeteksi:{' '}
                      <strong className="text-slate-700">
                        {destinationContext.isKelurahanLevel ? 'Tingkat Kelurahan' : 'Tingkat Kecamatan'}
                      </strong>{' '}
                      · {destinationContext.wilayahDisplay}
                    </p>
                  )}
                </div>

                {/* Pilihan Jenis Tujuan Dinamis */}
                <div className="lg:col-span-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Jenis Tujuan Proposal
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(destinationContext?.allowedDestinations || ['OPD']).map((destOption) => {
                      const active = destination === destOption;
                      return (
                        <button
                          key={destOption}
                          type="button"
                          onClick={() => {
                            setDestination(destOption);
                            setStatusNotice(null);
                          }}
                          className={`flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${
                            active
                              ? 'border-teal-700 bg-teal-700 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{destOption}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {destination === 'OPD'
                      ? 'Menampilkan narasi + RAB per kelompok Master Item + daftar KPM.'
                      : 'Tanpa RAB & harga · Narasi kewilayahan + 1 tabel daftar KPM utuh.'}
                  </p>
                </div>

                {/* Opsi Kolom KET / PEKERJAAN (khusus OPD) & Info Nama File */}
                <div className="lg:col-span-3">
                  {destination === 'OPD' ? (
                    <>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Isi Kolom KET / PEKERJAAN
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setOpdKetSource('pekerjaan')}
                          className={`h-10 rounded-xl border px-2 text-[11px] font-semibold transition-colors ${
                            opdKetSource === 'pekerjaan'
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Pekerjaan KPM
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpdKetSource('usaha')}
                          className={`h-10 rounded-xl border px-2 text-[11px] font-semibold transition-colors ${
                            opdKetSource === 'usaha'
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Jenis Usaha Item
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Format Nama File PDF
                      </label>
                      <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-700">
                        <span className="truncate">{previewFileName || '-'}</span>
                      </div>
                    </>
                  )}
                  {destination === 'OPD' && previewFileName && (
                    <p className="mt-1.5 truncate text-[11px] text-slate-500" title={previewFileName}>
                      File: <strong className="text-slate-700">{previewFileName}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Strip Validasi Ketat Mode OPD atau Ringkasan Mode Kelurahan/Kecamatan */}
              {activeProposal && dataset && destination === 'OPD' && opdValidation && (
                <div
                  className={`rounded-xl border p-4 ${
                    opdValidation.isReady
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-rose-200 bg-rose-50/80'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        {opdValidation.isReady ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                        )}
                        <p
                          className={`text-xs font-bold ${
                            opdValidation.isReady ? 'text-emerald-900' : 'text-rose-900'
                          }`}
                        >
                          {opdValidation.isReady
                            ? `Validasi Mode OPD Lolos · ${dataset.totalActiveKpm} KPM · ${formatRupiahCurrency(
                                savedRab?.totalTerhitung || 0
                              )}`
                            : 'Validasi Mode OPD Belum Terpenuhi — Cetak & Download PDF OPD Ditahan'}
                        </p>
                      </div>

                      {opdValidation.isReady ? (
                        <p className="text-xs text-emerald-800">
                          Data RAB tersimpan sinkron 100% dengan {dataset.opdGroups.length} kelompok
                          Master Item aktif ({dataset.totalActiveKpm} KPM).
                        </p>
                      ) : (
                        <ul className="list-disc space-y-1 pl-5 text-xs text-rose-800">
                          {opdValidation.reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenRabForProposal(activeProposal.id)}
                      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                        opdValidation.isReady
                          ? 'border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100/60'
                          : 'bg-rose-600 text-white hover:bg-rose-700'
                      }`}
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      <span>
                        {!opdValidation.hasSavedRab
                          ? 'Susun & Simpan RAB Proposal Ini'
                          : opdValidation.isReady
                          ? 'Ubah RAB Proposal'
                          : 'Sinkronkan & Simpan Ulang RAB'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {activeProposal && dataset && destination !== 'OPD' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-xs text-teal-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
                    <span>
                      <strong>Mode {destination} Siap:</strong> {dataset.totalActiveKpm} KPM aktif
                      disusun dalam 1 tabel lengkap (No, Nama, Alamat, RT, RW, NIK KTP, Desil, KEL)
                      tanpa rincian RAB/harga.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* LANGKAH 2: KATALOG 15 TEMPLATE TETAP & RIWAYAT ANTI-DUPLIKAT */}
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  2. Pilih Template Proposal (15 Style Tetap &amp; Riwayat Anti-Duplikat)
                </h2>
                <p className="text-xs text-slate-500">
                  Setiap style memiliki desain cover, tata letak bab, tabel, dan narasi Bahasa
                  Indonesia yang unik
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStyleFilter('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      styleFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua (15)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStyleFilter('unused')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      styleFilter === 'unused'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Belum Digunakan ({unusedStylesCount})
                  </button>
                </div>

                {canUpdate && activeProposal && (
                  <button
                    type="button"
                    disabled={isSavingHistory}
                    onClick={handleManualRecordHistory}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-50"
                  >
                    <BookmarkCheck className="h-3.5 w-3.5" />
                    <span>{isSavingHistory ? 'Mencatat...' : 'Catat Pemakaian Style'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4 p-5">
              {/* Peringatan jika style aktif sudah pernah dipakai */}
              {activeStyleHistory.length > 0 && (
                <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">
                      Perhatian: {activeStyle.code} ({activeStyle.name}) sudah pernah digunakan
                      sebelumnya
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      Digunakan oleh:{' '}
                      {activeStyleHistory
                        .map((h) => `${h.namaProposal} ${h.tahun} (${h.jenisTujuan})`)
                        .join(', ')}
                      . Anda tetap dapat menggunakannya atau memilih style lain berstatus Belum
                      Digunakan agar tiap wilayah tampil berbeda.
                    </p>
                  </div>
                </div>
              )}

              {visibleStyles.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
                  Seluruh 15 template telah memiliki riwayat penggunaan. Ubah filter ke{' '}
                  <strong>Semua (15)</strong> atau hapus riwayat tertentu bila diperlukan.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleStyles.map((tpl) => {
                    const isSelected = tpl.id === activeStyle.id;
                    const usages = historyByStyleId.get(tpl.id) || [];
                    const isUsed = usages.length > 0;

                    return (
                      <div
                        key={tpl.id}
                        className={`flex flex-col rounded-2xl border p-3 transition-colors ${
                          isSelected
                            ? 'border-teal-600 bg-teal-50/40 ring-1 ring-teal-600'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedStyleId(tpl.id)}
                          className="flex items-start gap-3 text-left"
                        >
                          <div className="w-[74px] shrink-0">
                            {destinationContext ? (
                              <ProposalCoverRenderer
                                styleTemplate={tpl}
                                context={destinationContext}
                                destination={destination}
                                totalKpm={dataset?.totalActiveKpm || 0}
                                variant="thumbnail"
                              />
                            ) : (
                              <div className="aspect-[216/330] w-full rounded-lg bg-slate-100" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span
                                className="text-[11px] font-extrabold uppercase tracking-wide"
                                style={{ color: tpl.palette.primary }}
                              >
                                {tpl.code}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-teal-700">
                                  Dipilih
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs font-bold text-slate-900">{tpl.name}</p>
                            <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">
                              {tpl.tagline}
                            </p>

                            {/* Status Riwayat Pemakaian */}
                            <div className="pt-1">
                              {!isUsed ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Belum Digunakan</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>Sudah digunakan ({usages.length}×)</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Daftar Riwayat + Tombol Hapus Riwayat */}
                        {isUsed && (
                          <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2">
                            {usages.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-amber-50/70 px-2 py-1 text-[10.5px] text-amber-900"
                              >
                                <span className="min-w-0 truncate font-medium">
                                  {entry.namaProposal} {entry.tahun} ({entry.jenisTujuan})
                                </span>
                                {canUpdate && (
                                  <button
                                    type="button"
                                    disabled={deletingHistoryId === entry.id}
                                    onClick={() => handleDeleteHistory(entry)}
                                    title="Hapus riwayat pemakaian ini"
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Hapus</span>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* LANGKAH 3: LIVE PREVIEW DOKUMEN F4 */}
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-teal-700" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    3. Pratinjau Dokumen F4 (216mm × 330mm)
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeStyle.code} — {activeStyle.name} · Margin Atas 1cm, Kanan 1,5cm, Bawah
                    1cm, Kiri 2cm · Cover bersih tanpa running header
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(customOpdNarrative || customWilayahNarrative) && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">
                    <Sparkles className="h-3 w-3" />
                    <span>Narasi Disesuaikan</span>
                  </span>
                )}
                <button
                  type="button"
                  disabled={!activeProposal}
                  onClick={() => setShowNarrativeModal(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Narasi</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-100/80 p-4 sm:p-6">
              {!activeProposal || !dataset ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
                  Pilih proposal terlebih dahulu untuk menampilkan pratinjau dokumen F4.
                </div>
              ) : dataset.totalActiveKpm === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-white p-8 text-center">
                  <p className="text-sm font-bold text-slate-800">
                    Proposal belum memiliki KPM aktif (status Diterima)
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tambahkan atau terima KPM ke dalam proposal ini terlebih dahulu agar dokumen
                    dapat dicetak atau diekspor ke PDF.
                  </p>
                </div>
              ) : (
                renderDocumentBodyContent(false)
              )}
            </div>
          </section>
        </main>
      </div>

      {/* AREA KHUSUS CETAK F4 (Hanya tampil saat window.print()) */}
      <div className="masdeta-proposal-print-only" aria-hidden="true">
        {!isExportBlocked && renderDocumentBodyContent(true)}
      </div>

      {/* MODAL EDIT NARASI OPSIONAL (Tanpa memodifikasi template bawaan) */}
      {showNarrativeModal && effectiveOpdNarrative && effectiveWilayahNarrative && (
        <div
          className="masdeta-no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Narasi Proposal"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Narasi ({activeStyle.code} · Mode {destination})
                </h3>
                <p className="text-xs text-slate-500">
                  Perubahan hanya berlaku pada pratinjau/ekspor saat ini dan tidak mengubah template
                  permanen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNarrativeModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {destination === 'OPD' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveOpdNarrative.pengantarTitle} (pisahkan paragraf dengan baris kosong)
                    </label>
                    <textarea
                      rows={4}
                      value={opdDraft.pengantar}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, pengantar: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Pengantar {effectiveOpdNarrative.tujuanTitle}
                    </label>
                    <input
                      type="text"
                      value={opdDraft.tujuanIntro}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, tujuanIntro: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Poin-poin {effectiveOpdNarrative.tujuanTitle} (1 baris = 1 poin)
                    </label>
                    <textarea
                      rows={4}
                      value={opdDraft.tujuanPoints}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, tujuanPoints: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveOpdNarrative.kegiatanTitle}
                    </label>
                    <textarea
                      rows={3}
                      value={opdDraft.kegiatan}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, kegiatan: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveOpdNarrative.anggaranTitle}
                    </label>
                    <textarea
                      rows={3}
                      value={opdDraft.anggaran}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, anggaran: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveOpdNarrative.penutupTitle}
                    </label>
                    <textarea
                      rows={3}
                      value={opdDraft.penutup}
                      onChange={(e) =>
                        setOpdDraft((prev) => ({ ...prev, penutup: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveWilayahNarrative.pendahuluanTitle}
                    </label>
                    <textarea
                      rows={4}
                      value={wilayahDraft.pendahuluan}
                      onChange={(e) =>
                        setWilayahDraft((prev) => ({ ...prev, pendahuluan: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveWilayahNarrative.maksudLabel}
                    </label>
                    <textarea
                      rows={2}
                      value={wilayahDraft.maksud}
                      onChange={(e) =>
                        setWilayahDraft((prev) => ({ ...prev, maksud: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveWilayahNarrative.tujuanLabel} (1 baris = 1 poin)
                    </label>
                    <textarea
                      rows={4}
                      value={wilayahDraft.tujuanPoints}
                      onChange={(e) =>
                        setWilayahDraft((prev) => ({ ...prev, tujuanPoints: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Pengantar {effectiveWilayahNarrative.lampiranTitle}
                    </label>
                    <textarea
                      rows={2}
                      value={wilayahDraft.lampiranIntro}
                      onChange={(e) =>
                        setWilayahDraft((prev) => ({ ...prev, lampiranIntro: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {effectiveWilayahNarrative.penutupTitle}
                    </label>
                    <textarea
                      rows={3}
                      value={wilayahDraft.penutup}
                      onChange={(e) =>
                        setWilayahDraft((prev) => ({ ...prev, penutup: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setCustomOpdNarrative(null);
                  setCustomWilayahNarrative(null);
                  if (defaultOpdNarrative) {
                    setOpdDraft({
                      pengantar: defaultOpdNarrative.pengantar.join('\n\n'),
                      tujuanIntro: defaultOpdNarrative.tujuanIntro,
                      tujuanPoints: defaultOpdNarrative.tujuanPoints.join('\n'),
                      kegiatan: defaultOpdNarrative.kegiatan.join('\n\n'),
                      anggaran: defaultOpdNarrative.anggaran.join('\n\n'),
                      penutup: defaultOpdNarrative.penutup.join('\n\n'),
                    });
                  }
                  if (defaultWilayahNarrative) {
                    setWilayahDraft({
                      pendahuluan: defaultWilayahNarrative.pendahuluan.join('\n\n'),
                      maksud: defaultWilayahNarrative.maksud,
                      tujuanPoints: defaultWilayahNarrative.tujuanPoints.join('\n'),
                      lampiranIntro: defaultWilayahNarrative.lampiranIntro,
                      penutup: defaultWilayahNarrative.penutup.join('\n\n'),
                    });
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset ke Bawaan {activeStyle.code}</span>
              </button>

              <button
                type="button"
                onClick={handleApplyNarrativeDraft}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <span>Terapkan ke Pratinjau</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
