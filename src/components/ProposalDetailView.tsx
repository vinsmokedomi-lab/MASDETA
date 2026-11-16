import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  History,
  Lock,
  Pencil,
  Search,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ItemBantuan,
  KpmRecord,
  ProposalKpmHistoryEntry,
  ProposalRecord,
} from '../types/kpm';
import {
  computeSubItemRecap,
  formatUploadDateTime,
  getItemHierarchyRank,
  resolvePackageForKpm,
} from '../utils/imageProcessor';

interface ProposalDetailViewProps {
  proposal: ProposalRecord;
  allProposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  historyEntries: ProposalKpmHistoryEntry[];
  canAdd?: boolean;
  canUpdate?: boolean;
  onBack: () => void;
  onEditProposal: (proposalId: string) => void;
  onAddKpmInProposal: (proposalName: string, tahun: string) => void;
  onViewKpmInProposal: (proposalName: string, tahun: string) => void;
  onAcceptAllKpm: (proposalName: string, tahun: string) => void;
  onTransferKpm?: (kpmIds: string[], targetProposalId: string) => Promise<boolean> | boolean;
  onOpenFullHistory: () => void;
}

export function ProposalDetailView({
  proposal,
  allProposals,
  records,
  items,
  historyEntries,
  canAdd = true,
  canUpdate = true,
  onBack,
  onEditProposal,
  onAddKpmInProposal,
  onViewKpmInProposal,
  onAcceptAllKpm,
  onTransferKpm,
  onOpenFullHistory,
}: ProposalDetailViewProps) {
  const [confirmAcceptAll, setConfirmAcceptAll] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferYear, setTransferYear] = useState<string>(proposal.tahun);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferKelurahanFilter, setTransferKelurahanFilter] = useState<string>('all');
  const [transferQuery, setTransferQuery] = useState<string>('');
  const [selectedTransferIds, setSelectedTransferIds] = useState<string[]>([]);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleFontPx, setTitleFontPx] = useState<number>(16);
  const [allowTitleWrap, setAllowTitleWrap] = useState(false);

  useLayoutEffect(() => {
    const fitTitle = () => {
      const el = titleRef.current;
      if (!el) return;

      const parentWidth = el.parentElement?.clientWidth ?? el.clientWidth;
      if (parentWidth <= 0) return;

      // Mulai dari ukuran normal 16px pada 1 baris, perkecil bertahap hingga 11.5px bila kepanjangan
      el.style.whiteSpace = 'nowrap';
      let currentSize = 16;
      const minSize = 11.5;
      el.style.fontSize = `${currentSize}px`;

      while (el.scrollWidth > parentWidth && currentSize > minSize) {
        currentSize = Math.max(minSize, Number((currentSize - 0.5).toFixed(1)));
        el.style.fontSize = `${currentSize}px`;
      }

      const stillOverflows = el.scrollWidth > parentWidth;
      if (stillOverflows) {
        el.style.whiteSpace = 'normal';
      }
      setTitleFontPx(currentSize);
      setAllowTitleWrap(stillOverflows);
    };

    fitTitle();
    window.addEventListener('resize', fitTitle);
    return () => window.removeEventListener('resize', fitTitle);
  }, [proposal.namaProposal]);
  const proposalRecords = useMemo(
    () =>
      records.filter(
        (r) => r.proposal === proposal.namaProposal && r.tahun === proposal.tahun
      ),
    [records, proposal.namaProposal, proposal.tahun]
  );

  const showKelurahanCard = !/\b(kelurahan|desa)\b/i.test(proposal.namaProposal);

  const subItemRecap = useMemo(
    () => computeSubItemRecap(proposalRecords, items),
    [proposalRecords, items]
  );

  // KPM Stats
  const kpmCounts = useMemo(() => {
    const total = proposalRecords.length;
    const accepted = proposalRecords.filter((r) => r.validasi === 'accepted').length;
    const pending = proposalRecords.filter((r) => r.validasi === 'pending').length;
    const rejected = proposalRecords.filter((r) => r.validasi === 'rejected').length;
    return { total, accepted, pending, rejected };
  }, [proposalRecords]);

  // DTSEN Breakdown (Desil 1-4, Desil 5, Desil 6-10, Belum Ada Desil, Data Tidak Ditemukan)
  const dtsenBreakdown = useMemo(() => {
    let desil1to4 = 0;
    let desil5 = 0;
    let desil6to10 = 0;
    let unassigned = 0;
    let notFound = 0;

    for (const rec of proposalRecords) {
      const d = (rec.dtsen || '').trim();
      if (['1', '2', '3', '4'].includes(d)) {
        desil1to4 += 1;
      } else if (d === '5') {
        desil5 += 1;
      } else if (['6', '7', '8', '9', '10', '6 - 10'].includes(d)) {
        desil6to10 += 1;
      } else if (d === 'Data Tidak Ditemukan') {
        notFound += 1;
      } else {
        unassigned += 1;
      }
    }

    const total = proposalRecords.length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    const allSegments = [
      {
        key: 'd14',
        label: 'Desil 1 - 4',
        shortLabel: 'Desil 1 - 4',
        count: desil1to4,
        pct: pct(desil1to4),
        color: '#0F766E',
        dotClass: 'bg-teal-700',
      },
      {
        key: 'd5',
        label: 'Desil 5',
        shortLabel: 'Desil 5',
        count: desil5,
        pct: pct(desil5),
        color: '#F59E0B',
        dotClass: 'bg-amber-500',
      },
      {
        key: 'd610',
        label: 'Desil 6 - 10',
        shortLabel: 'Desil 6 - 10',
        count: desil6to10,
        pct: pct(desil6to10),
        color: '#E11D48',
        dotClass: 'bg-rose-600',
      },
      {
        key: 'unassigned',
        label: 'Belum Ada Desil',
        shortLabel: 'Belum Ada',
        count: unassigned,
        pct: pct(unassigned),
        color: '#94A3B8',
        dotClass: 'bg-slate-400',
      },
      {
        key: 'notfound',
        label: 'Data Tidak Ditemukan',
        shortLabel: 'Tdk Ditemukan',
        count: notFound,
        pct: pct(notFound),
        color: '#0F172A',
        dotClass: 'bg-slate-950',
      },
    ];

    const activeSegments = allSegments.filter((seg) => seg.count > 0);
    const primarySegment =
      [...activeSegments].sort((a, b) => b.count - a.count)[0] ?? null;

    return {
      total,
      segments: activeSegments,
      primarySegment,
    };
  }, [proposalRecords]);

  // Conditional Kelurahan Distribution (tampil untuk proposal selain judul kelurahan)
  const kelurahanBreakdown = useMemo(() => {
    if (!showKelurahanCard) return [];
    const map = new Map<string, { name: string; total: number; accepted: number }>();
    for (const rec of proposalRecords) {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      const existing = map.get(kel) ?? { name: kel, total: 0, accepted: 0 };
      existing.total += 1;
      if (rec.validasi === 'accepted') existing.accepted += 1;
      map.set(kel, existing);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name)
    );
  }, [showKelurahanCard, proposalRecords]);

  // Item Breakdown (year-aware)
  const itemBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; total: number; accepted: number }
    >();
    for (const rec of proposalRecords) {
      const code = (rec.item || '').trim();
      if (!code) continue;
      const pkg = resolvePackageForKpm(items, proposal.tahun, code);
      const existing = map.get(code) ?? {
        code,
        name: pkg.name || code,
        total: 0,
        accepted: 0,
      };
      existing.total += 1;
      if (rec.validasi === 'accepted') existing.accepted += 1;
      map.set(code, existing);
    }
    return Array.from(map.values()).sort((a, b) => {
      const rankA = getItemHierarchyRank(a.code, proposal.tahun, items);
      const rankB = getItemHierarchyRank(b.code, proposal.tahun, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code, 'id');
    });
  }, [proposalRecords, items, proposal.tahun]);

  // Pengelola Breakdown
  const pengelolaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of proposalRecords) {
      const name = rec.pengelola?.trim() || 'Tanpa Pengelola';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [proposalRecords]);

  // Pekerjaan Breakdown
  const pekerjaanBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of proposalRecords) {
      const job = rec.pekerjaan?.trim() || 'Lainnya';
      map.set(job, (map.get(job) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [proposalRecords]);

  // History for this proposal (newest first, excluding general ACTLOG:: entries)
  const proposalHistory = useMemo(() => {
    return historyEntries
      .filter(
        (h) =>
          !h.registerCode?.startsWith('ACTLOG::') &&
          h.proposalName === proposal.namaProposal &&
          (!h.tahun || h.tahun === proposal.tahun)
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [historyEntries, proposal.namaProposal, proposal.tahun]);

  // Transfer KPM helpers
  const unlockedTargetProposals = useMemo(
    () =>
      allProposals.filter(
        (p) => p.id !== proposal.id && p.status !== 'locked'
      ),
    [allProposals, proposal.id]
  );

  const transferYearOptions = useMemo(() => {
    const years = Array.from(
      new Set(unlockedTargetProposals.map((p) => p.tahun).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));
    return years;
  }, [unlockedTargetProposals]);

  const transferTargetOptions = useMemo(() => {
    return unlockedTargetProposals
      .filter((p) => !transferYear || p.tahun === transferYear)
      .sort((a, b) => a.namaProposal.localeCompare(b.namaProposal, 'id'));
  }, [unlockedTargetProposals, transferYear]);

  const transferKelurahanOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of proposalRecords) {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      counts.set(kel, (counts.get(kel) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [proposalRecords]);

  const filteredTransferRecords = useMemo(() => {
    const q = transferQuery.trim().toLowerCase();
    return proposalRecords.filter((rec) => {
      const kel = rec.kelurahan?.trim() || 'Belum ditentukan';
      if (transferKelurahanFilter !== 'all' && kel !== transferKelurahanFilter) {
        return false;
      }
      if (!q) return true;
      return (
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.includes(q) ||
        rec.alamat.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q)
      );
    });
  }, [proposalRecords, transferKelurahanFilter, transferQuery]);

  const openTransferModal = () => {
    const defaultYear = transferYearOptions.includes(proposal.tahun)
      ? proposal.tahun
      : (transferYearOptions[0] ?? proposal.tahun);
    const candidates = unlockedTargetProposals.filter((p) => p.tahun === defaultYear);
    setTransferYear(defaultYear);
    setTransferTargetId(candidates[0]?.id ?? '');
    setTransferKelurahanFilter('all');
    setTransferQuery('');
    setSelectedTransferIds([]);
    setConfirmTransferOpen(false);
    setIsTransferModalOpen(true);
  };

  const handleTransferYearChange = (nextYear: string) => {
    setTransferYear(nextYear);
    const candidates = unlockedTargetProposals
      .filter((p) => p.tahun === nextYear)
      .sort((a, b) => a.namaProposal.localeCompare(b.namaProposal, 'id'));
    setTransferTargetId(candidates[0]?.id ?? '');
  };

  const toggleSelectTransferId = (id: string) => {
    setSelectedTransferIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allFilteredSelected =
    filteredTransferRecords.length > 0 &&
    filteredTransferRecords.every((r) => selectedTransferIds.includes(r.id));

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredTransferRecords.map((r) => r.id);
    if (allFilteredSelected) {
      const removeSet = new Set(filteredIds);
      setSelectedTransferIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      setSelectedTransferIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleConfirmTransfer = async () => {
    if (!onTransferKpm || selectedTransferIds.length === 0 || !transferTargetId || isTransferring) {
      return;
    }
    setIsTransferring(true);
    try {
      const ok = await onTransferKpm(selectedTransferIds, transferTargetId);
      if (ok) {
        setConfirmTransferOpen(false);
        setIsTransferModalOpen(false);
        setSelectedTransferIds([]);
      }
    } finally {
      setIsTransferring(false);
    }
  };

  // SVG Donut ring geometry
  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  let runningOffset = 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Sub-Screen Header: hanya panah kembali + judul */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Proposal</h1>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Hero Overview Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="space-y-2">
            {/* Baris 1: Judul Proposal Penuh di Atas Container (font otomatis mengecil bila panjang) */}
            <h2
              ref={titleRef}
              style={{ fontSize: `${titleFontPx}px` }}
              className={`font-bold leading-snug tracking-tight text-slate-900 ${
                allowTitleWrap ? 'whitespace-normal' : 'whitespace-nowrap'
              }`}
            >
              {proposal.namaProposal}
            </h2>

            {/* Baris 2: Tipe & Tahun + Status Kunci */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <p className="min-w-0 truncate text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                {proposal.tipe} · Tahun {proposal.tahun}
              </p>

              <div
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  proposal.status === 'locked'
                    ? 'bg-slate-900 text-white'
                    : 'bg-teal-50 text-teal-800'
                }`}
              >
                {proposal.status === 'locked' ? (
                  <>
                    <Lock className="h-3 w-3 shrink-0" />
                    <span>Terkunci</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-3 w-3 shrink-0" />
                    <span>Terbuka</span>
                  </>
                )}
              </div>
            </div>

            {/* Baris 3 & 4: Status & Waktu Pembaruan (1 baris rapi) */}
            <div className="space-y-1">
              <p className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-slate-600">
                <span className="shrink-0">Status :</span>
                <span
                  className={`truncate ${
                    proposal.checklist.dinas
                      ? 'font-semibold text-teal-700'
                      : 'font-medium text-slate-700'
                  }`}
                >
                  {proposal.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                </span>
              </p>
              <p className="truncate whitespace-nowrap text-xs text-slate-400 tabular-nums">
                Diperbarui {formatUploadDateTime(proposal.updatedAt)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t border-b border-slate-100 py-3.5">
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Total
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-slate-900 tabular-nums">
                {kpmCounts.total}{' '}
                <span className="text-xs font-medium text-slate-400">
                  / {proposal.jumlahKpm ?? 66}
                </span>
              </p>
            </div>
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Diterima
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-teal-700 tabular-nums">
                {kpmCounts.accepted}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center px-1.5 text-center">
              <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-slate-500">
                Menunggu / Ditolak
              </p>
              <p className="mt-1.5 whitespace-nowrap text-lg font-bold leading-none text-slate-700 tabular-nums">
                {kpmCounts.pending + kpmCounts.rejected}
              </p>
            </div>
          </div>

          {/* Document Checklist Inline Strip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {[
              { label: 'DOCX', done: proposal.checklist.docx },
              { label: 'RAB', done: proposal.checklist.rab },
              { label: 'Cap RT', done: proposal.checklist.rt },
              { label: 'Cap RW', done: proposal.checklist.rw },
              { label: 'Cap Lurah', done: proposal.checklist.lurah },
              { label: 'Cap Camat', done: proposal.checklist.camat },
            ].map((item) => (
              <span
                key={item.label}
                className={`inline-flex items-center gap-1 font-medium ${
                  item.done ? 'text-teal-700' : 'text-slate-400'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </span>
            ))}
          </div>

          {kpmCounts.total === 0 ? (
            proposal.status !== 'locked' && canAdd ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onAddKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Tambah Calon KPM</span>
                </button>
              </div>
            ) : null
          ) : (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">Lihat Daftar Calon KPM ({kpmCounts.total})</span>
                </button>

                {proposal.status !== 'locked' && canUpdate && onTransferKpm && (
                  <button
                    type="button"
                    onClick={openTransferModal}
                    aria-label="Transfer KPM ke Proposal Lain"
                    title="Transfer KPM ke Proposal Lain"
                    className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-teal-700 transition-colors hover:bg-slate-100 active:scale-[0.98]"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                )}
              </div>

              {kpmCounts.pending + kpmCounts.rejected > 0 && proposal.status !== 'locked' && canUpdate && (
                !confirmAcceptAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmAcceptAll(true)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 text-xs font-bold text-teal-800 transition-colors hover:bg-teal-100"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      Terima Semua ({kpmCounts.pending + kpmCounts.rejected} Menunggu / Ditolak)
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                    <p className="text-xs font-bold text-teal-950">
                      Ubah status {kpmCounts.pending + kpmCounts.rejected} (Menunggu / Ditolak)
                      menjadi Diterima?
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmAcceptAll(false)}
                        className="min-h-[38px] flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAcceptAll(false);
                          onAcceptAllKpm(proposal.namaProposal, proposal.tahun);
                        }}
                        className="min-h-[38px] flex-1 rounded-lg bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        Ya, Terima Semua
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* Proporsi DTSEN Donut Ring */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Klasifikasi DTSEN</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sebaran kategori desil calon KPM yang terdaftar
          </p>

          {dtsenBreakdown.total === 0 ? (
            <p className="mt-4 py-4 text-center text-xs text-slate-400">
              Belum ada data calon KPM pada proposal ini.
            </p>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-28 w-28 shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={ringRadius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="12"
                  />
                  {dtsenBreakdown.segments.map((seg) => {
                    const length = (seg.count / dtsenBreakdown.total) * ringCircumference;
                    const dashOffset = -runningOffset;
                    runningOffset += length;
                    return (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r={ringRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="12"
                        strokeDasharray={`${length} ${ringCircumference}`}
                        strokeDashoffset={dashOffset}
                      />
                    );
                  })}
                </svg>
                {dtsenBreakdown.primarySegment && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-bold text-slate-900 tabular-nums leading-none">
                      {dtsenBreakdown.primarySegment.pct}%
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-slate-500">
                      {dtsenBreakdown.primarySegment.shortLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                {dtsenBreakdown.segments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass}`} />
                      <span className="truncate text-slate-700">{seg.label}</span>
                    </div>
                    <span className="shrink-0 font-medium text-slate-900 tabular-nums">
                      {seg.count} ({seg.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Conditional Listing: Kelurahan (Tampil selain proposal dengan judul kelurahan) */}
        {showKelurahanCard && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Kelurahan</h2>
              <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500 tabular-nums">
                {kelurahanBreakdown.length} Kelurahan
              </span>
            </div>

            {kelurahanBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada calon KPM pada proposal ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {kelurahanBreakdown.map((kel) => {
                  const widthPct =
                    kpmCounts.total > 0 ? Math.round((kel.total / kpmCounts.total) * 100) : 0;
                  return (
                    <div key={kel.name} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-normal text-slate-800">
                          {kel.name}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-700 tabular-nums">
                          {kel.total}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-teal-700"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                          {kel.accepted} Diterima
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Rekap Item */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Item</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {itemBreakdown.length} Item
            </span>
          </div>
          {itemBreakdown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada item bantuan tercatat.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {itemBreakdown.map((row) => (
                <div key={row.code} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-semibold text-teal-800">
                      {row.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-normal text-slate-800">{row.name}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {row.accepted} Diterima
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-slate-700 tabular-nums">
                    {row.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Akumulasi Sub-Item dalam Proposal */}
        {subItemRecap.aggregates.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Akumulasi Sub-Item</h2>
              <p className="text-[11px] text-slate-500">
                Total gabungan barang lintas paket pada proposal ini
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {subItemRecap.aggregates.map((sub) => (
                <div key={sub.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-normal text-slate-800">{sub.name}</p>
                    <p className="truncate text-[11px] text-slate-500 tabular-nums">
                      {sub.packageSources.map((p) => `${p.code} (${p.total})`).join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className="text-sm font-medium text-slate-800">{sub.totalNeeded} Unit</p>
                    <p
                      className={`text-[11px] font-medium ${
                        sub.pendingCount > 0 ? 'text-amber-700' : 'text-teal-700'
                      }`}
                    >
                      {sub.pendingCount > 0 ? `Belum dibagi ${sub.pendingCount}` : 'Lengkap'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rekap Pengelola */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Pengelola</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {pengelolaBreakdown.length} Pengelola
            </span>
          </div>
          {pengelolaBreakdown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada pengelola tercatat.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pengelolaBreakdown.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-sm font-normal text-slate-800">{row.name}</span>
                  <span className="shrink-0 text-sm font-medium text-slate-700 tabular-nums">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Rekap Pekerjaan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Pekerjaan</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {pekerjaanBreakdown.length} Jenis
            </span>
          </div>
          {pekerjaanBreakdown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada data pekerjaan tercatat.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pekerjaanBreakdown.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-sm font-normal text-slate-800">{row.name}</span>
                  <span className="shrink-0 text-sm font-medium text-slate-700 tabular-nums">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Paling Bawah: Rekam Jejak (Ringkas + Lihat selengkapnya) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">Rekam Jejak</h2>
            </div>
            {proposalHistory.length > 0 && (
              <button
                type="button"
                onClick={onOpenFullHistory}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                <span>Lihat selengkapnya</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {proposalHistory.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada riwayat perpindahan KPM pada proposal ini.
            </p>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {proposalHistory.slice(0, 3).map((entry) => {
                  const isIncoming = entry.action === 'entered' || entry.action === 'moved_in';
                  const actionSummary =
                    entry.action === 'moved_in'
                      ? `Pindah masuk dari ${entry.fromProposal || 'proposal lain'}`
                      : entry.action === 'moved_out'
                        ? `Pindah keluar ke ${entry.toProposal || 'proposal lain'}`
                        : entry.action === 'removed'
                          ? 'Dihapus dari daftar proposal'
                          : 'Didaftarkan masuk ke proposal';

                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          isIncoming
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {isIncoming ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {entry.kpmName}
                          </p>
                          <span
                            className={`shrink-0 text-xs font-semibold ${
                              isIncoming ? 'text-teal-700' : 'text-amber-700'
                            }`}
                          >
                            {isIncoming ? 'Masuk' : 'Keluar'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">{actionSummary}</p>
                        <p className="mt-1 text-xs text-slate-500 tabular-nums">
                          {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onOpenFullHistory}
                className="flex min-h-[42px] w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100"
              >
                <span>Lihat selengkapnya ({proposalHistory.length})</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </section>
      </main>

      {/* Persistent Bottom-Right Floating Pencil Edit Proposal Button */}
      {canUpdate && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4">
          <button
            type="button"
            onClick={() => onEditProposal(proposal.id)}
            aria-label="Edit Proposal"
            title="Edit Proposal"
            className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/25 transition-all hover:bg-teal-800 active:scale-95"
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Modal Transfer KPM Antar Proposal / Tahun */}
      {isTransferModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-kpm-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => !isTransferring && setIsTransferModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 id="transfer-kpm-modal-title" className="text-base font-bold text-slate-900">
                  Transfer KPM Proposal
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Dari: {proposal.namaProposal} ({proposal.tahun})
                </p>
              </div>
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => setIsTransferModalOpen(false)}
                aria-label="Tutup"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Target Tahun & Proposal */}
              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-bold text-slate-800">1. Pilih Tujuan Transfer</p>
                {transferYearOptions.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Belum ada proposal lain yang berstatus Terbuka untuk menjadi tujuan transfer.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Tahun Tujuan
                      </label>
                      <select
                        value={transferYear}
                        onChange={(e) => handleTransferYearChange(e.target.value)}
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                      >
                        {transferYearOptions.map((yr) => (
                          <option key={yr} value={yr}>
                            Tahun {yr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Proposal Tujuan (Terbuka)
                      </label>
                      <select
                        value={transferTargetId}
                        onChange={(e) => setTransferTargetId(e.target.value)}
                        className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                      >
                        {transferTargetOptions.map((tp) => {
                          const existingCount = records.filter(
                            (r) => r.proposal === tp.namaProposal && r.tahun === tp.tahun
                          ).length;
                          return (
                            <option key={tp.id} value={tp.id}>
                              {tp.namaProposal} ({existingCount}/{tp.jumlahKpm ?? 66} KPM)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter & Select KPM */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate whitespace-nowrap text-xs font-bold text-slate-800">
                    2. Pilih KPM yang dipindahkan
                  </p>
                  {filteredTransferRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      className="shrink-0 whitespace-nowrap text-xs font-bold text-teal-700 hover:underline"
                    >
                      {allFilteredSelected ? 'Batalkan Semua' : 'Pilih Semua'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={transferQuery}
                      onChange={(e) => setTransferQuery(e.target.value)}
                      placeholder="Cari nama / NIK..."
                      className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <select
                    aria-label="Filter kelurahan domisili"
                    value={transferKelurahanFilter}
                    onChange={(e) => setTransferKelurahanFilter(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="all">
                      Semua Kelurahan ({proposalRecords.length})
                    </option>
                    {transferKelurahanOptions.map((kel) => (
                      <option key={kel.name} value={kel.name}>
                        {kel.name} ({kel.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {filteredTransferRecords.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-400">
                      Tidak ada KPM yang sesuai filter.
                    </p>
                  ) : (
                    filteredTransferRecords.map((rec) => {
                      const checked = selectedTransferIds.includes(rec.id);
                      const kelName = rec.kelurahan?.trim() || 'Belum ditentukan';
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => toggleSelectTransferId(rec.id)}
                          className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                            checked ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                              checked
                                ? 'border-teal-700 bg-teal-700 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {rec.nama}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {[kelName, rec.item?.trim() || 'Tanpa Item'].join(' · ')}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              rec.validasi === 'accepted'
                                ? 'bg-teal-50 text-teal-700'
                                : rec.validasi === 'rejected'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {rec.validasi === 'accepted'
                              ? 'Diterima'
                              : rec.validasi === 'rejected'
                                ? 'Ditolak'
                                : 'Menunggu'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5">
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => {
                  setConfirmTransferOpen(false);
                  setIsTransferModalOpen(false);
                }}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  isTransferring ||
                  selectedTransferIds.length === 0 ||
                  !transferTargetId
                }
                onClick={() => setConfirmTransferOpen(true)}
                className="min-h-[44px] flex-1 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {isTransferring
                  ? 'Memindahkan...'
                  : `Transfer (${selectedTransferIds.length} KPM)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal ("Yakin?") before executing Transfer KPM */}
      {confirmTransferOpen && isTransferModalOpen && (() => {
        const targetProp = transferTargetOptions.find((p) => p.id === transferTargetId);
        return (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => !isTransferring && setConfirmTransferOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Transfer KPM"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900">Yakin pindahkan KPM?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Apakah Anda yakin ingin memindahkan{' '}
                    <strong>{selectedTransferIds.length} KPM</strong> ke proposal{' '}
                    <strong>
                      {targetProp ? `${targetProp.namaProposal} (${targetProp.tahun})` : 'tujuan'}
                    </strong>
                    ?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={() => setConfirmTransferOpen(false)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={() => void handleConfirmTransfer()}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {isTransferring ? 'Memindahkan...' : 'Ya, Pindahkan'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
