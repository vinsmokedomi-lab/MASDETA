import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileCheck2,
  FolderPlus,
  Layers,
  Lock,
  LogOut,
  MessageSquare,
  Package,
  Unlock,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { InternalUser, ItemBantuan, KpmRecord, ProposalRecord, ValidationStatus } from '../types/kpm';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  HIGH_DESIL_VALUES,
  computeSubItemRecap,
  formatRupiah,
  formatUploadDateTime,
  getItemHierarchyRank,
  resolvePackageForKpm,
} from '../utils/imageProcessor';
import { DriveImage } from './DriveImage';
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
  onLogout: () => void;
  onOpenKpmList: (filter?: { status?: 'all' | ValidationStatus; item?: string }) => void;
  onOpenKpmDetail?: (record: KpmRecord) => void;
  onOpenSubItemRecap?: () => void;
  onOpenProposalList?: () => void;
  onOpenProposalDetail: (proposalId: string) => void;
  onOpenAddProposal?: () => void;
  onOpenUserApproval: () => void;
  onOpenDuplicateCheck: () => void;
  onOpenArsip?: () => void;
  onOpenDtsen?: () => void;
  onOpenAdministrasi?: () => void;
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
  onLogout,
  onOpenKpmList,
  onOpenKpmDetail,
  onOpenSubItemRecap,
  onOpenProposalList,
  onOpenProposalDetail,
  onOpenAddProposal,
  onOpenUserApproval,
  onOpenDuplicateCheck,
  onOpenArsip,
  onOpenDtsen,
  onOpenAdministrasi,
}: DashboardViewProps) {
  const [openHeaderMenu, setOpenHeaderMenu] = useState<'none' | 'notifications' | 'profile'>('none');
  const headerActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openHeaderMenu === 'none') return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (headerActionsRef.current && !headerActionsRef.current.contains(e.target as Node)) {
        setOpenHeaderMenu('none');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenHeaderMenu('none');
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openHeaderMenu]);

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
    const acceptedPct = total > 0 ? (accepted / total) * 100 : 0;
    const pendingPct = total > 0 ? (pending / total) * 100 : 0;
    const rejectedPct = total > 0 ? (rejected / total) * 100 : 0;
    return {
      accepted,
      pending,
      rejected,
      total,
      acceptanceRate,
      acceptedPct,
      pendingPct,
      rejectedPct,
    };
  }, [filteredRecords]);

  // Item package delivery overview (per-KPM completed item package status)
  const itemDeliveryOverview = useMemo(() => {
    const recap = computeSubItemRecap(filteredRecords, items);
    const totalPackages = recap.kpmRows.length;
    const deliveredPackages = recap.kpmRows.filter((row) => row.debtStatus === 'complete').length;
    const pctDelivered =
      totalPackages > 0 ? Math.round((deliveredPackages / totalPackages) * 100) : 0;
    return {
      totalPackages,
      deliveredPackages,
      pctDelivered,
    };
  }, [filteredRecords, items]);

  // DTSEN classification breakdown
  const dtsenStats = useMemo(() => {
    let priorityCount = 0; // Desil 1-4
    let reviewCount = 0; // Desil 5
    let highCount = 0; // Desil 6-10 & others

    for (const r of filteredRecords) {
      const d = (r.dtsen || '').trim();
      if (d === '1' || d === '2' || d === '3' || d === '4') {
        priorityCount += 1;
      } else if (d === '5') {
        reviewCount += 1;
      } else if (HIGH_DESIL_VALUES.has(d) || d) {
        highCount += 1;
      }
    }

    const totalClassified = priorityCount + reviewCount + highCount;
    const priorityPct =
      totalClassified > 0 ? Math.round((priorityCount / totalClassified) * 100) : 0;
    return { priorityCount, reviewCount, highCount, totalClassified, priorityPct };
  }, [filteredRecords]);

  // Dinas attention counts
  const attentionCounts = useMemo(() => {
    const pendingDinas = filteredProposals.filter((p) => !p.checklist.dinas).length;
    return { pendingDinas };
  }, [filteredProposals]);

  // Detailed proposal breakdown
  const proposalSummaryList = useMemo(() => {
    return filteredProposals.map((prop) => {
      const propRecords = filteredRecords.filter(
        (r) => r.proposal === prop.namaProposal && r.tahun === prop.tahun
      );
      const activeKpmCount = propRecords.filter((r) => r.validasi !== 'rejected').length;
      const acceptedCount = propRecords.filter((r) => r.validasi === 'accepted').length;
      const pendingCount = propRecords.filter((r) => r.validasi === 'pending').length;
      const target = prop.jumlahKpm ?? 66;
      const fillPct = target > 0 ? Math.min(100, Math.round((propRecords.length / target) * 100)) : 0;
      const checklistDone = [
        prop.checklist.docx,
        prop.checklist.rt,
        prop.checklist.rw,
        prop.checklist.lurah,
        prop.checklist.camat,
        prop.checklist.rab,
        prop.checklist.dinas,
      ].filter(Boolean).length;

      return {
        ...prop,
        totalKpm: propRecords.length,
        activeKpmCount,
        acceptedCount,
        pendingCount,
        target,
        fillPct,
        checklistDone,
      };
    });
  }, [filteredProposals, filteredRecords]);

  const visibleProposals = useMemo(
    () => proposalSummaryList.slice(0, 6),
    [proposalSummaryList]
  );

  // Item packages breakdown
  const itemBreakdown = useMemo(() => {
    const itemMap = new Map<
      string,
      {
        code: string;
        name: string;
        subItemCount: number;
        total: number;
        accepted: number;
        pending: number;
      }
    >();

    for (const rec of filteredRecords) {
      const code = rec.item || 'LAIN';
      const pkg = resolvePackageForKpm(items, rec.tahun, code);
      const existing = itemMap.get(code) ?? {
        code,
        name: pkg.name || code,
        subItemCount: pkg.subItems.length,
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

  // Top field coordinators (Pengelola) & administration fees
  const pengelolaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRecords) {
      const name = (r.pengelola || '').trim();
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    const sorted = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'));
    const maxCount = sorted[0]?.count || 1;
    return {
      top: sorted.slice(0, 4),
      totalCoordinators: sorted.length,
      maxCount,
    };
  }, [filteredRecords]);

  const adminFeeSummary = useMemo(() => {
    const paid = filteredRecords.filter((r) => (r.payment || 0) > 0);
    const totalAmount = paid.reduce((sum, r) => sum + (r.payment || 0), 0);
    return { paidCount: paid.length, totalAmount };
  }, [filteredRecords]);

  const recentActivityRecords = useMemo(() => {
    return [...filteredRecords]
      .sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
      )
      .slice(0, 3);
  }, [filteredRecords]);

  const yearDisplayLabel = selectedYear === 'all' ? 'Semua Tahun' : `Tahun ${selectedYear}`;

  const incompleteQuotaProposals = useMemo(
    () => proposalSummaryList.filter((p) => p.target > 0 && p.activeKpmCount < p.target),
    [proposalSummaryList]
  );

  const totalQuotaShortage = useMemo(
    () =>
      incompleteQuotaProposals.reduce(
        (sum, p) => sum + Math.max(0, p.target - p.activeKpmCount),
        0
      ),
    [incompleteQuotaProposals]
  );

  const hasAttentionItems =
    pendingUsersCount > 0 ||
    duplicateNikCount > 0 ||
    attentionCounts.pendingDinas > 0 ||
    incompleteQuotaProposals.length > 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Main Brand Top Bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          {logo}
          <h1 className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            MASDETA
          </h1>
        </div>

        <div ref={headerActionsRef} className="relative flex shrink-0 items-center gap-2">
          {/* Bell Notification Button */}
          <button
            type="button"
            onClick={() =>
              setOpenHeaderMenu((prev) => (prev === 'notifications' ? 'none' : 'notifications'))
            }
            aria-label="Notifikasi"
            aria-expanded={openHeaderMenu === 'notifications'}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadChatCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white tabular-nums">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            ) : hasAttentionItems ? (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-600" />
            ) : null}
          </button>

          {/* Avatar-Only Profile Button -> Opens Mini Menu (Profil / Chat) */}
          <button
            type="button"
            onClick={() => setOpenHeaderMenu((prev) => (prev === 'profile' ? 'none' : 'profile'))}
            aria-label="Menu akun dan chat"
            aria-expanded={openHeaderMenu === 'profile'}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white transition-colors hover:bg-slate-50"
          >
            <div className="relative flex h-8 w-8 items-center justify-center overflow-visible rounded-lg bg-teal-50 text-teal-800">
              {currentUser.fotoDataUrl ? (
                <DriveImage
                  src={currentUser.fotoDataUrl}
                  thumbnailUrl={currentUser.fotoThumbnailUrl}
                  alt={currentUser.nama}
                  className="h-full w-full rounded-lg object-cover"
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
          </button>

          {/* Notification Bell Popover */}
          {openHeaderMenu === 'notifications' && (
            <div className="absolute top-12 right-0 z-40 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                <span className="text-xs font-bold text-slate-900">Notifikasi</span>
                {unreadChatCount > 0 && (
                  <span className="text-[11px] font-semibold text-rose-600 tabular-nums">
                    {unreadChatCount} chat masuk
                  </span>
                )}
              </div>

              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {unreadChatCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHeaderMenu('none');
                      onOpenChat();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {unreadChatCount} Pesan Chat Baru
                      </p>
                      <p className="text-[11px] text-slate-500">Ketuk untuk membuka Chat</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {pendingUsersCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHeaderMenu('none');
                      onOpenUserApproval();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {pendingUsersCount} Pendaftar User Baru
                      </p>
                      <p className="text-[11px] text-slate-500">Menunggu persetujuan SuperAdmin</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {incompleteQuotaProposals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHeaderMenu('none');
                      if (incompleteQuotaProposals.length === 1) {
                        onOpenProposalDetail(incompleteQuotaProposals[0].id);
                      } else {
                        onOpenProposalList?.();
                      }
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {incompleteQuotaProposals.length} Proposal Belum Penuh
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Kurang {totalQuotaShortage} calon penerima
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {duplicateNikCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHeaderMenu('none');
                      onOpenDuplicateCheck();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {duplicateNikCount} Terindikasi NIK Ganda
                      </p>
                      <p className="text-[11px] text-slate-500">Periksa &amp; bersihkan duplikasi</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {attentionCounts.pendingDinas > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHeaderMenu('none');
                      onOpenProposalList?.();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <FileCheck2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {attentionCounts.pendingDinas} Proposal Belum Diantar ke Dinas
                      </p>
                      <p className="text-[11px] text-slate-500">Periksa kelengkapan pengantaran</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {unreadChatCount === 0 &&
                  pendingUsersCount === 0 &&
                  duplicateNikCount === 0 &&
                  incompleteQuotaProposals.length === 0 &&
                  attentionCounts.pendingDinas === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">
                      Tidak ada notifikasi baru.
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Avatar Mini Menu (Profil & Chat) */}
          {openHeaderMenu === 'profile' && (
            <div className="absolute top-12 right-0 z-40 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 px-3.5 py-2.5">
                <p className="truncate text-xs font-bold text-slate-900">{currentUser.nama}</p>
                <p className="truncate text-[11px] text-slate-500">{currentUser.role}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setOpenHeaderMenu('none');
                    onOpenProfile();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <User className="h-4 w-4 text-teal-700" />
                  <span>Buka Profil</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenHeaderMenu('none');
                    onOpenChat();
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <MessageSquare className="h-4 w-4 text-teal-700" />
                    <span>Obrolan</span>
                  </span>
                  {unreadChatCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                      {unreadChatCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenHeaderMenu('none');
                    onLogout();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4 text-rose-600" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="space-y-5 px-4 pt-4">
        {/* 1. EXECUTIVE COMMAND HERO */}
        <section className="rounded-3xl bg-slate-900 p-5 text-white">
          <div className="min-w-0">
            <p className="break-words text-lg leading-snug font-bold tracking-tight text-white">
              Halo, {currentUser.nama}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              {currentUser.role}
            </p>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'all' })}
              className="min-w-0 flex-1 text-left transition-opacity hover:opacity-90"
            >
              <p className="text-xs font-medium text-slate-400">
                Total KPM
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-3xl font-bold tracking-tight tabular-nums">
                  {kpmStats.total}
                </span>
                <span className="text-sm font-medium text-slate-400">/</span>
                <span className="text-xs font-medium text-teal-300 tabular-nums">
                  {kpmStats.accepted} Diterima
                </span>
              </div>
            </button>

            <div className="relative inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center rounded-xl border border-white/50 bg-white/15 transition-colors hover:border-white/75 hover:bg-white/20">
              <select
                aria-label="Pilih tahun anggaran"
                value={selectedYear}
                onChange={(e) => onChangeYear(e.target.value)}
                className="h-full min-h-[44px] w-full cursor-pointer appearance-none bg-transparent py-2.5 pr-9 pl-3.5 text-sm font-bold text-white focus:outline-none"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year} className="text-slate-900">
                    {year}
                  </option>
                ))}
                <option value="all" className="text-slate-900">
                  Semua Tahun
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-white" />
            </div>
          </div>

          {/* Acceptance Ratio Bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-300"
              style={{ width: `${kpmStats.acceptanceRate}%` }}
            />
          </div>

          {/* 4-Column Quick Status Strip */}
          <div className="mt-4 grid grid-cols-4 divide-x divide-slate-800 border-t border-slate-800 pt-3.5">
            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'accepted' })}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-400">Diterima</p>
              <p className="mt-0.5 text-base font-bold text-teal-300 tabular-nums">
                {kpmStats.accepted}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'pending' })}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-400">Menunggu</p>
              <p className="mt-0.5 text-base font-bold text-amber-300 tabular-nums">
                {kpmStats.pending}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'rejected' })}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-400">Ditolak</p>
              <p className="mt-0.5 text-base font-bold text-rose-300 tabular-nums">
                {kpmStats.rejected}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenProposalList?.()}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-400">Proposal</p>
              <p className="mt-0.5 text-base font-bold text-white tabular-nums">
                {filteredProposals.length}
              </p>
            </button>
          </div>
        </section>

        {/* 2. STATUS ITEM DIBAGIKAN & KELAYAKAN DTSEN (2-COLUMN BENTO) */}
        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onOpenSubItemRecap?.()}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">ITEM</span>
              <Package className="h-4 w-4 shrink-0 text-teal-700" />
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-slate-900 tabular-nums">
                  {itemDeliveryOverview.pctDelivered}%
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {itemDeliveryOverview.deliveredPackages}/{itemDeliveryOverview.totalPackages} dibagi
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-700 transition-all duration-300"
                  style={{ width: `${itemDeliveryOverview.pctDelivered}%` }}
                />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenDtsen?.()}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">DTSEN</span>
              <Layers className="h-4 w-4 shrink-0 text-teal-700" />
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xl font-bold text-slate-900 tabular-nums">
                  {dtsenStats.priorityCount}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  Desil 1–4 ({dtsenStats.priorityPct}%)
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-700 transition-all duration-300"
                  style={{ width: `${dtsenStats.priorityPct}%` }}
                />
              </div>
            </div>
          </button>
        </section>

        {/* 3. PERLU TINDAKAN / PENGINGAT OPERASIONAL */}
        {hasAttentionItems && (
          <section>
            <h2 className="mb-2 px-0.5 text-sm font-bold text-slate-900">Perlu Tindakan</h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {pendingUsersCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenUserApproval}
                  className="flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900">
                      {pendingUsersCount} Pendaftar User Menunggu Persetujuan
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}

              {duplicateNikCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenDuplicateCheck}
                  className="flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900">
                      Terdeteksi {duplicateNikCount} Duplikasi NIK / KK
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}

              {incompleteQuotaProposals.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (incompleteQuotaProposals.length === 1) {
                      onOpenProposalDetail(incompleteQuotaProposals[0].id);
                    } else {
                      onOpenProposalList?.();
                    }
                  }}
                  className="flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900">
                      {incompleteQuotaProposals.length === 1
                        ? `Proposal ${incompleteQuotaProposals[0].namaProposal} Belum Penuh (${incompleteQuotaProposals[0].totalKpm}/${incompleteQuotaProposals[0].target})`
                        : `${incompleteQuotaProposals.length} Proposal Belum Terisi Penuh`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}

              {attentionCounts.pendingDinas > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenProposalList?.()}
                  className="flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900">
                      {attentionCounts.pendingDinas} Proposal Belum Diantar ke Dinas
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}
            </div>
          </section>
        )}

        {/* 4. PROGRES PROPOSAL */}
        <section>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h2 className="text-sm font-bold text-slate-900">Progres Proposal</h2>
            {filteredProposals.length > 0 && onOpenProposalList && (
              <button
                type="button"
                onClick={onOpenProposalList}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                <span>Semua ({filteredProposals.length})</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {visibleProposals.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
              <p className="text-xs font-medium text-slate-800">
                Belum ada proposal terdaftar di {yearDisplayLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Tambahkan proposal baru untuk mulai menghimpun usulan.
              </p>
              {onOpenAddProposal && (
                <button
                  type="button"
                  onClick={onOpenAddProposal}
                  className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>Tambah Proposal</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {visibleProposals.map((prop) => (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => onOpenProposalDetail(prop.id)}
                  className="block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {prop.namaProposal}
                        </p>
                        <span className="shrink-0 text-xs font-medium text-slate-800 tabular-nums">
                          {prop.totalKpm}/{prop.target}
                        </span>
                      </div>

                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            prop.fillPct >= 100 ? 'bg-teal-700' : 'bg-teal-600'
                          }`}
                          style={{ width: `${prop.fillPct}%` }}
                        />
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
                        <span className="text-slate-500">
                          {prop.tipe} · {prop.tahun} · {prop.acceptedCount} Diterima · Berkas{' '}
                          {prop.checklistDone}/7
                        </span>
                        <span
                          className={`font-medium ${
                            prop.checklist.dinas ? 'text-teal-700' : 'text-amber-700'
                          }`}
                        >
                          {prop.checklist.dinas ? 'Sudah diantar ke Dinas' : 'Belum diantar ke Dinas'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 5. DISTRIBUSI PAKET BANTUAN */}
        <section>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h2 className="text-sm font-bold text-slate-900">Paket Bantuan</h2>
            {itemBreakdown.length > 0 && onOpenSubItemRecap && (
              <button
                type="button"
                onClick={onOpenSubItemRecap}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                <span>Rekap Sub-Item</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {itemBreakdown.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
              <p className="text-xs font-medium text-slate-800">
                Belum ada usulan paket pada {yearDisplayLabel}
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
                  className="flex min-h-[62px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-bold text-teal-800">
                    {item.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                      <span className="shrink-0 text-sm font-medium text-slate-900 tabular-nums">
                        {item.total}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 6. KOORDINATOR LAPANGAN & ADMINISTRASI */}
        {(pengelolaBreakdown.top.length > 0 || adminFeeSummary.totalAmount > 0) && (
          <section className="space-y-3">
            {pengelolaBreakdown.top.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-teal-700" />
                    <h2 className="text-sm font-bold text-slate-900">Pengelola Teraktif</h2>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {pengelolaBreakdown.totalCoordinators} pengelola
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {pengelolaBreakdown.top.map((row) => {
                    const widthPct = Math.round((row.count / pengelolaBreakdown.maxCount) * 100);
                    return (
                      <div key={row.name} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-normal text-slate-900">{row.name}</span>
                          <span className="shrink-0 font-medium text-slate-700 tabular-nums">
                            {row.count}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-teal-600/80"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {adminFeeSummary.totalAmount > 0 && (
              <button
                type="button"
                onClick={() => onOpenAdministrasi?.()}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">Administrasi &amp; Pelayanan</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {formatRupiah(adminFeeSummary.totalAmount)} · {adminFeeSummary.paidCount}{' '}
                      tercatat
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}
          </section>
        )}

        {/* 7. PEMBARUAN DATA TERBARU */}
        {recentActivityRecords.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between px-0.5">
              <h2 className="text-sm font-bold text-slate-900">Pembaruan Terbaru</h2>
              <button
                type="button"
                onClick={() => onOpenKpmList({ status: 'all' })}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                <span>Semua</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {recentActivityRecords.map((rec) => {
                const statusText =
                  rec.validasi === 'accepted'
                    ? 'Diterima'
                    : rec.validasi === 'rejected'
                      ? 'Ditolak'
                      : 'Menunggu';
                const statusColor =
                  rec.validasi === 'accepted'
                    ? 'text-teal-700'
                    : rec.validasi === 'rejected'
                      ? 'text-rose-600'
                      : 'text-amber-700';

                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => onOpenKpmDetail?.(rec)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{rec.nama}</p>
                        <span className={`shrink-0 text-[11px] font-semibold ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                        {rec.item} · {rec.proposal} ·{' '}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="inline h-2.5 w-2.5" />{' '}
                          {formatUploadDateTime(rec.updatedAt || rec.createdAt)}
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
