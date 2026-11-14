import { useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  History,
  Lock,
  MapPin,
  Unlock,
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
  isKecamatanProposal,
  resolvePackageForKpm,
} from '../utils/imageProcessor';

interface ProposalDetailViewProps {
  proposal: ProposalRecord;
  records: KpmRecord[];
  items: ItemBantuan[];
  historyEntries: ProposalKpmHistoryEntry[];
  onBack: () => void;
  onEditProposal: (proposalId: string) => void;
  onViewKpmInProposal: (proposalName: string, tahun: string) => void;
}

export function ProposalDetailView({
  proposal,
  records,
  items,
  historyEntries,
  onBack,
  onEditProposal,
  onViewKpmInProposal,
}: ProposalDetailViewProps) {
  const proposalRecords = useMemo(
    () =>
      records.filter(
        (r) => r.proposal === proposal.namaProposal && r.tahun === proposal.tahun
      ),
    [records, proposal.namaProposal, proposal.tahun]
  );

  const isKecamatan = isKecamatanProposal(proposal.namaProposal);

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
        label: 'Desil 1 – 4 (Prioritas)',
        shortLabel: 'Desil 1–4',
        count: desil1to4,
        pct: pct(desil1to4),
        color: '#0F766E',
        dotClass: 'bg-teal-700',
      },
      {
        key: 'd5',
        label: 'Desil 5 (Menengah Bawah)',
        shortLabel: 'Desil 5',
        count: desil5,
        pct: pct(desil5),
        color: '#D97706',
        dotClass: 'bg-amber-600',
      },
      {
        key: 'other',
        label: 'Desil 6–10 / Belum Ada Desil',
        shortLabel: 'Lainnya',
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

  // Conditional Kelurahan Distribution (only for Kecamatan proposals)
  const kelurahanBreakdown = useMemo(() => {
    if (!isKecamatan) return [];
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
  }, [isKecamatan, proposalRecords]);

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
    return Array.from(map.values()).sort(
      (a, b) => b.total - a.total || a.code.localeCompare(b.code)
    );
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
    <div className="min-h-screen pb-10">
      {/* Native Mobile Sub-Screen Header (Back + Title + Edit Trigger) */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">
            {proposal.namaProposal}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => onEditProposal(proposal.id)}
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
        >
          <Edit3 className="h-3.5 w-3.5 text-teal-700" />
          <span>Edit</span>
        </button>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Hero Overview Card */}
        <section className="rounded-3xl bg-white p-5 border border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 tabular-nums">
                Tahun {proposal.tahun} · {proposal.tipe} ·{' '}
                <span
                  className={
                    proposal.checklist.dinas
                      ? 'font-semibold text-teal-700'
                      : 'text-slate-600'
                  }
                >
                  {proposal.checklist.dinas ? 'Sudah ke Dinas' : 'Belum ke Dinas'}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
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
            <div className="pr-2">
              <p className="text-[11px] text-slate-500">Total KPM</p>
              <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                {kpmCounts.total}
              </p>
            </div>
            <div className="px-3">
              <p className="text-[11px] text-slate-500">Diterima</p>
              <p className="mt-0.5 text-xl font-bold text-teal-700 tabular-nums">
                {kpmCounts.accepted}
              </p>
            </div>
            <div className="pl-3">
              <p className="text-[11px] text-slate-500">Menunggu / Ditolak</p>
              <p className="mt-0.5 text-xl font-bold text-slate-700 tabular-nums">
                {kpmCounts.pending + kpmCounts.rejected}
              </p>
            </div>
          </div>

          {/* Document Checklist Inline Strip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
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
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {item.label}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onViewKpmInProposal(proposal.namaProposal, proposal.tahun)}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
          >
            <Users className="h-4 w-4" />
            <span>Lihat Daftar Calon KPM ({kpmCounts.total})</span>
          </button>
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
                    <span className="shrink-0 font-bold text-slate-900 tabular-nums">
                      {seg.count} ({seg.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Conditional Listing: Per Kelurahan (Hanya muncul jika Proposal Kecamatan) */}
        {isKecamatan && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-teal-700" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Sebaran Per Kelurahan</h2>
                  <p className="text-[11px] text-slate-500">
                    Daftar kelurahan KPM di proposal kecamatan ini
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-700 tabular-nums">
                {kelurahanBreakdown.length} Kelurahan
              </span>
            </div>

            {kelurahanBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Belum ada calon KPM pada proposal kecamatan ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {kelurahanBreakdown.map((kel) => {
                  const widthPct =
                    kpmCounts.total > 0 ? Math.round((kel.total / kpmCounts.total) * 100) : 0;
                  return (
                    <div key={kel.name} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {kel.name}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-slate-900 tabular-nums">
                          {kel.total} KPM
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

        {/* Rekap Item Bantuan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Item Bantuan</h2>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
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
                    <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-bold text-teal-800">
                      {row.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {row.accepted} Diterima
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
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
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Akumulasi Sub-Item</h2>
                <p className="text-[11px] text-slate-500">
                  Total gabungan barang lintas paket pada proposal ini
                </p>
              </div>
              <span className="text-xs font-bold text-teal-700 tabular-nums">
                {subItemRecap.totalDelivered}/{subItemRecap.totalUnits} Terbagi
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {subItemRecap.aggregates.map((sub) => (
                <div key={sub.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{sub.name}</p>
                    <p className="truncate text-[11px] text-slate-500 tabular-nums">
                      {sub.packageSources.map((p) => `${p.code} (${p.total})`).join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className="text-sm font-bold text-slate-900">{sub.totalNeeded} Unit</p>
                    <p
                      className={`text-[11px] font-semibold ${
                        sub.pendingCount > 0 ? 'text-amber-700' : 'text-teal-700'
                      }`}
                    >
                      {sub.pendingCount > 0 ? `Kurang ${sub.pendingCount}` : 'Terpenuhi'}
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
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
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
                  <span className="truncate text-sm font-medium text-slate-900">{row.name}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                    {row.count} KPM
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Rekap Pekerjaan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Pekerjaan Calon KPM</h2>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
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
                  <span className="truncate text-sm font-medium text-slate-900">{row.name}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Paling Bawah: Riwayat Perpindahan Calon KPM (Masuk & Keluar) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-700" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Riwayat Masuk & Keluar KPM
                </h2>
                <p className="text-[11px] text-slate-500">
                  Jejak perpindahan calon KPM beserta waktu dan petugas
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-700 tabular-nums">
              {proposalHistory.length}
            </span>
          </div>

          {proposalHistory.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Belum ada riwayat perpindahan KPM pada proposal ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {proposalHistory.map((entry) => {
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
                        <p className="truncate text-sm font-bold text-slate-900">
                          {entry.kpmName}
                        </p>
                        <span
                          className={`shrink-0 text-[11px] font-bold ${
                            isIncoming ? 'text-teal-700' : 'text-amber-700'
                          }`}
                        >
                          {isIncoming ? 'Masuk' : 'Keluar'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-700">{actionSummary}</p>
                      <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
