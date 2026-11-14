import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  MessageSquare,
  Unlock,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { InternalUser, ItemBantuan, KpmRecord, ProposalRecord, ValidationStatus } from '../types/kpm';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import { getItemHierarchyRank, resolvePackageForKpm } from '../utils/imageProcessor';
import { PresenceDot } from './PresenceDot';

interface DashboardViewProps {
  logo: React.ReactNode;
  currentUser: InternalUser;
  unreadChatCount: number;
  selectedYear: string;
  onChangeYear: (year: string) => void;
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pendingUsersCount: number;
  duplicateNikCount: number;
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  onOpenChat: () => void;
  onOpenProfile: () => void;
  onOpenKpmList: (filter?: { status?: 'all' | ValidationStatus; item?: string }) => void;
  onOpenSubItemRecap?: () => void;
  onOpenProposalList?: () => void;
  onOpenProposalDetail: (proposalId: string) => void;
  onOpenAddProposal?: () => void;
  onOpenUserApproval: () => void;
  onOpenDuplicateCheck: () => void;
}

export function DashboardView({
  logo,
  currentUser,
  unreadChatCount,
  selectedYear,
  onChangeYear,
  records,
  proposals,
  items,
  pendingUsersCount,
  duplicateNikCount,
  feedback,
  onDismissFeedback,
  onOpenChat,
  onOpenProfile,
  onOpenKpmList,
  onOpenProposalDetail,
  onOpenUserApproval,
  onOpenDuplicateCheck,
}: DashboardViewProps) {
  const yearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    records.forEach((r) => {
      if (r.tahun) set.add(r.tahun);
    });
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records, proposals]);

  const filteredRecords = useMemo(() => {
    if (selectedYear === 'all') return records;
    return records.filter((r) => r.tahun === selectedYear);
  }, [records, selectedYear]);

  const filteredProposals = useMemo(() => {
    if (selectedYear === 'all') return proposals;
    return proposals.filter((p) => p.tahun === selectedYear);
  }, [proposals, selectedYear]);

  const kpmStats = useMemo(() => {
    const accepted = filteredRecords.filter((r) => r.validasi === 'accepted').length;
    const pending = filteredRecords.filter((r) => r.validasi === 'pending').length;
    const rejected = filteredRecords.filter((r) => r.validasi === 'rejected').length;
    const total = filteredRecords.length;
    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    return { accepted, pending, rejected, total, acceptanceRate };
  }, [filteredRecords]);

  const itemBreakdown = useMemo(() => {
    const itemMap = new Map<
      string,
      { code: string; name: string; total: number; accepted: number; pending: number }
    >();

    for (const rec of filteredRecords) {
      const code = rec.item || 'LAIN';
      const pkg = resolvePackageForKpm(items, rec.tahun, code);
      const existing = itemMap.get(code) ?? {
        code,
        name: pkg.name || code,
        total: 0,
        accepted: 0,
        pending: 0,
      };
      existing.total += 1;
      if (rec.validasi === 'accepted') existing.accepted += 1;
      if (rec.validasi === 'pending') existing.pending += 1;
      itemMap.set(code, existing);
    }

    return Array.from(itemMap.values()).sort((a, b) => {
      const rankA = getItemHierarchyRank(a.code, selectedYear, items);
      const rankB = getItemHierarchyRank(b.code, selectedYear, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code, 'id');
    });
  }, [filteredRecords, items, selectedYear]);

  const proposalSummaryList = useMemo(() => {
    return filteredProposals.map((prop) => {
      const propRecords = filteredRecords.filter((r) => r.proposal === prop.namaProposal);
      return {
        ...prop,
        totalKpm: propRecords.length,
      };
    });
  }, [filteredProposals, filteredRecords]);

  const visibleProposals = useMemo(
    () => proposalSummaryList.slice(0, 8),
    [proposalSummaryList]
  );

  const yearDisplayLabel = selectedYear === 'all' ? 'Semua Tahun' : `Tahun ${selectedYear}`;

  return (
    <div className="min-h-screen pb-24">
      {/* Main Brand Top Bar with Chat & Active User Profile Dot */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo}
          <h1 className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            MASDETA
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenChat}
            aria-label="Buka pesan langsung"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          >
            <MessageSquare className="h-4.5 w-4.5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white tabular-nums">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Profil dan status user"
            className="relative flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white pr-2.5 pl-1.5 transition-colors hover:bg-slate-50"
          >
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-teal-50 text-teal-800">
              {currentUser.fotoDataUrl ? (
                <img
                  src={currentUser.fotoDataUrl}
                  alt={currentUser.nama}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
              <PresenceDot
                status={currentUser.presenceStatus}
                size="sm"
                className="absolute -right-0.5 -bottom-0.5"
              />
            </div>
            <span className="max-w-[72px] truncate text-xs font-semibold text-slate-800">
              {currentUser.nama}
            </span>
          </button>
        </div>
      </header>

      <main className="space-y-5 px-4 pt-4">
        {feedback && (
          <div
            role="status"
            className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${
              feedback.type === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  feedback.type === 'success' ? 'text-teal-700' : 'text-rose-600'
                }`}
              />
              <p className="font-medium leading-snug">{feedback.message}</p>
            </div>
            {onDismissFeedback && (
              <button
                type="button"
                onClick={onDismissFeedback}
                aria-label="Tutup notifikasi"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Hero Metric: KPM yang Menerima */}
        <section className="rounded-3xl bg-teal-800 p-5 text-white shadow-sm">
          <div className="flex items-center gap-1 text-xs font-medium text-teal-100">
            <span>Penerima Bantuan ·</span>
            <span className="relative inline-flex items-center">
              <select
                aria-label="Pilih tahun anggaran"
                value={selectedYear}
                onChange={(e) => onChangeYear(e.target.value)}
                className="appearance-none bg-transparent py-1 pr-4 font-semibold text-white underline decoration-teal-300/60 decoration-dotted underline-offset-4 focus:outline-none"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year} className="text-slate-900">
                    {year}
                  </option>
                ))}
                <option value="all" className="text-slate-900">
                  Semua
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-teal-200" />
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenKpmList({ status: 'accepted' })}
            className="mt-1 flex items-baseline gap-2 text-left transition-opacity hover:opacity-90"
          >
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {kpmStats.accepted}
            </span>
            <span className="text-sm font-medium text-teal-100">KPM Menerima</span>
          </button>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-teal-100 tabular-nums">
              <span>Rasio Diterima</span>
              <span className="font-semibold text-white">
                {kpmStats.acceptanceRate}% dari {kpmStats.total} usulan
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-teal-950/40">
              <div
                className="h-full rounded-full bg-teal-300 transition-all duration-300"
                style={{ width: `${kpmStats.acceptanceRate}%` }}
              />
            </div>
          </div>

          {/* Inline Divider Breakdown */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-teal-700/80 border-t border-teal-700/80 pt-3.5">
            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'all' })}
              className="pr-2 text-left transition-opacity hover:opacity-80"
            >
              <p className="text-xs text-teal-100">Total Usulan</p>
              <p className="mt-0.5 text-base font-bold text-white tabular-nums">
                {kpmStats.total}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'pending' })}
              className="px-3 text-left transition-opacity hover:opacity-80"
            >
              <p className="text-xs text-teal-100">Menunggu</p>
              <p className="mt-0.5 text-base font-bold text-white tabular-nums">
                {kpmStats.pending}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'rejected' })}
              className="pl-3 text-left transition-opacity hover:opacity-80"
            >
              <p className="text-xs text-teal-100">Ditolak</p>
              <p className="mt-0.5 text-base font-bold text-white tabular-nums">
                {kpmStats.rejected}
              </p>
            </button>
          </div>
        </section>

        {/* Subtle Alerts (only shown when real action items exist) */}
        {(pendingUsersCount > 0 || duplicateNikCount > 0) && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {pendingUsersCount > 0 && (
              <button
                type="button"
                onClick={onOpenUserApproval}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <UserCheck className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900">
                    {pendingUsersCount} Pendaftar User Internal Menunggu Persetujuan
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Ketuk untuk tinjau & setujui akses aplikasi internal
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}

            {duplicateNikCount > 0 && (
              <button
                type="button"
                onClick={onOpenDuplicateCheck}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900">
                    Terdeteksi {duplicateNikCount} Indikasi Duplikasi NIK / KK
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Ketuk untuk periksa data KPM yang tercatat ganda
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}
          </section>
        )}

        {/* Section 1: List Proposal (Max 8 items, without + Tambah, without 0/7, clean subtitle) */}
        <section>
          <h2 className="mb-2.5 px-0.5 text-sm font-bold text-slate-900">List Proposal</h2>

          {visibleProposals.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
              <p className="text-xs font-semibold text-slate-800">
                Belum ada proposal terdaftar di {yearDisplayLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Tambahkan proposal lewat tombol + di bawah.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {visibleProposals.map((prop) => (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => onOpenProposalDetail(prop.id)}
                  className="flex min-h-[66px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      prop.status === 'locked'
                        ? 'bg-slate-900 text-white'
                        : 'bg-teal-50 text-teal-800'
                    }`}
                  >
                    {prop.status === 'locked' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {prop.namaProposal}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {prop.totalKpm}/{prop.jumlahKpm ?? 66} KPM · {prop.tipe} · {prop.tahun}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-medium ${
                        prop.checklist.dinas ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {prop.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: List Item */}
        <section>
          <h2 className="mb-2.5 px-0.5 text-sm font-bold text-slate-900">List Item</h2>

          {itemBreakdown.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
              <p className="text-xs font-semibold text-slate-800">
                Belum ada usulan item pada {yearDisplayLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Daftarkan calon KPM lewat tombol + di bawah.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {itemBreakdown.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => onOpenKpmList({ item: item.code })}
                  className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-bold text-teal-800">
                    {item.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {item.accepted} Diterima · {item.pending} Menunggu
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                      {item.total}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
