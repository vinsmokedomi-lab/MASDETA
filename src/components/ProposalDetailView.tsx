import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  History,
  Lock,
  Pencil,
  Unlock,
  UserPlus,
  Users,
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
  onOpenFullHistory: () => void;
}

export function ProposalDetailView({
  proposal,
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
  onOpenFullHistory,
}: ProposalDetailViewProps) {
  const [confirmAcceptAll, setConfirmAcceptAll] = useState(false);
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

  // DTSEN Breakdown (Desil 1-4, Desil 5, Desil 6-10 / Lainnya)
  const dtsenBreakdown = useMemo(() => {
    let desil1to4 = 0;
    let desil5 = 0;
    let others = 0;

    for (const rec of proposalRecords) {
      if (['1', '2', '3', '4'].includes(rec.dtsen)) {
        desil1to4 += 1;
      } else if (rec.dtsen === '5') {
        desil5 += 1;
      } else {
        others += 1;
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
        color: '#D97706',
        dotClass: 'bg-amber-600',
      },
      {
        key: 'other',
        label: 'Desil 6 - 10',
        shortLabel: 'Desil 6 - 10',
        count: others,
        pct: pct(others),
        color: '#64748B',
        dotClass: 'bg-slate-500',
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
      const code = rec.item || 'LAIN';
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

  // History for this proposal (newest first)
  const proposalHistory = useMemo(() => {
    return historyEntries
      .filter(
        (h) =>
          h.proposalName === proposal.namaProposal &&
          (!h.tahun || h.tahun === proposal.tahun)
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [historyEntries, proposal.namaProposal, proposal.tahun]);

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
        <h1 className="truncate text-base font-bold text-slate-900">
          {proposal.namaProposal} {proposal.tahun}
        </h1>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Hero Overview Card */}
        <section className="rounded-3xl bg-white p-5 border border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {proposal.tipe} · Tahun {proposal.tahun}
              </p>
              <p className="text-xs text-slate-600">
                Status Dinas:{' '}
                <span
                  className={
                    proposal.checklist.dinas
                      ? 'font-semibold text-teal-700'
                      : 'font-medium text-slate-700'
                  }
                >
                  {proposal.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                </span>
              </p>
              <p className="text-xs text-slate-400 tabular-nums">
                Diperbarui {formatUploadDateTime(proposal.updatedAt)}
              </p>
            </div>

            <div
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold ${
                proposal.status === 'locked'
                  ? 'bg-slate-900 text-white'
                  : 'bg-teal-50 text-teal-800'
              }`}
            >
              {proposal.status === 'locked' ? (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Terkunci</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Terbuka</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 border-t border-b border-slate-100 py-3.5">
            <div className="flex flex-col items-center justify-start px-2 text-center">
              <div className="flex min-h-[28px] items-center justify-center">
                <p className="text-[11px] font-medium leading-tight text-slate-500">Total</p>
              </div>
              <p className="mt-1.5 text-lg font-bold leading-none text-slate-900 tabular-nums">
                {kpmCounts.total}{' '}
                <span className="text-xs font-medium text-slate-400">
                  / {proposal.jumlahKpm ?? 66}
                </span>
              </p>
            </div>
            <div className="flex flex-col items-center justify-start px-2 text-center">
              <div className="flex min-h-[28px] items-center justify-center">
                <p className="text-[11px] font-medium leading-tight text-slate-500">Diterima</p>
              </div>
              <p className="mt-1.5 text-lg font-bold leading-none text-teal-700 tabular-nums">
                {kpmCounts.accepted}
              </p>
            </div>
            <div className="flex flex-col items-center justify-start px-2 text-center">
              <div className="flex min-h-[28px] items-center justify-center">
                <p className="text-[11px] font-medium leading-tight text-slate-500">
                  Menunggu /
                  <br />
                  Ditolak
                </p>
              </div>
              <p className="mt-1.5 text-lg font-bold leading-none text-slate-700 tabular-nums">
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
            <div className="mt-4">
              <button
                type="button"
                disabled={proposal.status === 'locked' || !canAdd}
                onClick={() => onAddKpmInProposal(proposal.namaProposal, proposal.tahun)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap"
              >
                <UserPlus className="h-4 w-4" />
                <span>Tambah Calon KPM</span>
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
              >
                <Users className="h-4 w-4" />
                <span>Lihat Daftar Calon KPM ({kpmCounts.total})</span>
              </button>

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
    </div>
  );
}
