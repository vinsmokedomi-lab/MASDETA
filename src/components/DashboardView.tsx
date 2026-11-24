import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileCheck2,
  FolderPlus,
  Layers,
  LogOut,
  MessageSquare,
  Package,
  RefreshCw,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AppNotificationItem,
  InternalUser,
  ItemBantuan,
  KpmRecord,
  ProposalRecord,
  SCHEDULE_CATEGORY_LABELS,
  ScheduleEventItem,
  ValidationStatus,
} from '../types/kpm';
import { TAHUN_OPTIONS } from '../data/kpmOptions';
import {
  computeSubItemRecap,
  formatUploadDateTime,
  getItemHierarchyRank,
  resolvePackageForKpm,
} from '../utils/imageProcessor';
import { formatScheduleIndonesianDate, getTodayLocalIsoDate } from '../utils/pdfFormatHelpers';
import { useIsDesktopWeb } from '../utils/platform';
import { DriveImage } from './DriveImage';
import { PresenceDot } from './PresenceDot';
import { useOfflineStatus } from '../contexts/OfflineContext';

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
  appNotifications?: AppNotificationItem[];
  bellHasUnread?: boolean;
  onOpenBell?: () => void;
  onMarkNotificationsRead?: () => void;
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  isLoading?: boolean;
  isOnline?: boolean;
  offlineQueueCount?: number;
  onSyncOfflineQueue?: () => void;
  schedules?: ScheduleEventItem[];
  onOpenSchedules?: () => void;
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
  onOpenDatabaseKpm?: () => void;
  onOpenDtsen?: () => void;
  onOpenPengelolaList?: () => void;
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
  appNotifications = [],
  bellHasUnread,
  onOpenBell,
  onMarkNotificationsRead,
  onDismissNotification,
  onClearNotifications,
  feedback,
  onDismissFeedback,
  isLoading = false,
  isOnline = true,
  offlineQueueCount = 0,
  onSyncOfflineQueue,
  schedules = [],
  onOpenSchedules,
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
  onOpenDatabaseKpm,
  onOpenDtsen,
  onOpenPengelolaList,
}: DashboardViewProps) {
  const [openHeaderMenu, setOpenHeaderMenu] = useState<'none' | 'notifications' | 'profile'>('none');
  const [dismissedPendingBellCount, setDismissedPendingBellCount] = useState(0);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pendingUsersCount < dismissedPendingBellCount) {
      setDismissedPendingBellCount(pendingUsersCount);
    }
  }, [pendingUsersCount, dismissedPendingBellCount]);

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

  const acceptedYearRecords = useMemo(
    () => filteredRecords.filter((r) => r.validasi === 'accepted'),
    [filteredRecords]
  );

  const kpmStats = useMemo(() => {
    const accepted = acceptedYearRecords.length;
    // Database KPM & Arsip bersifat global (standalone, tanpa proposal) agar cocok dengan halaman tujuan saat diklik
    const pending = records.filter((r) => r.validasi === 'pending' && !(r.proposal || '').trim()).length;
    const rejected = records.filter((r) => r.validasi === 'rejected' && !(r.proposal || '').trim()).length;
    const total = accepted;
    return {
      accepted,
      pending,
      rejected,
      total,
    };
  }, [acceptedYearRecords, records]);

  // Item package delivery overview (per-KPM completed item package & sub-item unit status)
  const itemDeliveryOverview = useMemo(() => {
    const acceptedRecords = filteredRecords.filter((r) => r.validasi === 'accepted');
    const recap = computeSubItemRecap(acceptedRecords, items);
    const totalPackages = recap.kpmRows.length;
    const deliveredPackages = recap.kpmRows.filter((row) => row.debtStatus === 'complete').length;
    const pendingPackages = Math.max(0, totalPackages - deliveredPackages);
    const pctDelivered =
      totalPackages > 0 ? Math.round((deliveredPackages / totalPackages) * 100) : 0;
    const pctUnits =
      recap.totalUnits > 0 ? Math.round((recap.totalDelivered / recap.totalUnits) * 100) : 0;
    return {
      totalPackages,
      deliveredPackages,
      pendingPackages,
      pctDelivered,
      totalDeliveredUnits: recap.totalDelivered,
      totalUnits: recap.totalUnits,
      totalPendingUnits: recap.totalPending,
      pctUnits,
    };
  }, [filteredRecords, items]);

  // DTSEN classification breakdown (khusus KPM aktif berstatus Diterima agar tidak tercampur data Ditolak/Arsip)
  const dtsenStats = useMemo(() => {
    let priorityCount = 0; // Desil 1-4 (Hijau)
    let reviewCount = 0; // Desil 5 (Oranye)
    let highCount = 0; // Desil 6-10 (Merah)
    let notFoundCount = 0; // Data Tidak Ditemukan (Hitam)
    let unassignedCount = 0; // Belum Ada Desil (Abu-abu)

    for (const r of acceptedYearRecords) {
      const raw = (r.dtsen || '').trim();
      const d = raw.replace(/^desil\s+/i, '').trim();
      if (d === '1 - 5' || d === '1-5' || d === '1' || d === '2' || d === '3' || d === '4') {
        priorityCount += 1;
      } else if (d === '5') {
        reviewCount += 1;
      } else if (
        d === '6' ||
        d === '7' ||
        d === '8' ||
        d === '9' ||
        d === '10' ||
        d === '6 - 10' ||
        d === '6-10'
      ) {
        highCount += 1;
      } else if (raw.toLowerCase() === 'data tidak ditemukan') {
        notFoundCount += 1;
      } else {
        unassignedCount += 1;
      }
    }

    const total = acceptedYearRecords.length;
    const priorityPct = total > 0 ? Math.round((priorityCount / total) * 100) : 0;
    const rawSegments = [
      { key: 'd14', label: 'Desil 1–4', count: priorityCount, barClass: 'bg-teal-700' },
      { key: 'd5', label: 'Desil 5', count: reviewCount, barClass: 'bg-amber-500' },
      { key: 'd610', label: 'Desil 6–10', count: highCount, barClass: 'bg-rose-600' },
      { key: 'notfound', label: 'Data Tidak Ditemukan', count: notFoundCount, barClass: 'bg-slate-950' },
      { key: 'unassigned', label: 'Belum Ada Desil', count: unassignedCount, barClass: 'bg-slate-300' },
    ];
    const segments = rawSegments
      .filter((s) => s.count > 0)
      .map((s) => ({
        ...s,
        pct: total > 0 ? (s.count / total) * 100 : 0,
      }));

    return {
      priorityCount,
      reviewCount,
      highCount,
      notFoundCount,
      unassignedCount,
      total,
      priorityPct,
      segments,
    };
  }, [acceptedYearRecords]);

  // Dinas attention counts
  const attentionCounts = useMemo(() => {
    const pendingDinas = filteredProposals.filter((p) => !p.checklist.dinas).length;
    return { pendingDinas };
  }, [filteredProposals]);

  // Detailed proposal breakdown (smart-sorted: needing attention first, then newest update)
  const proposalSummaryList = useMemo(() => {
    const mapped = filteredProposals.map((prop) => {
      const propRecords = filteredRecords.filter((r) => {
        if (r.validasi !== 'accepted') return false;
        if (r.proposalId) return r.proposalId === prop.id;
        return r.proposal === prop.namaProposal && r.tahun === prop.tahun;
      });
      const acceptedCount = propRecords.length;
      const activeKpmCount = acceptedCount;
      const pendingCount = 0;
      const target = prop.jumlahKpm ?? 66;
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
        totalKpm: acceptedCount,
        activeKpmCount,
        acceptedCount,
        pendingCount,
        target,
        checklistDone,
      };
    });

    return mapped.sort((a, b) => {
      const aNeedsAttn = (a.target > 0 && a.activeKpmCount < a.target) || !a.checklist.dinas;
      const bNeedsAttn = (b.target > 0 && b.activeKpmCount < b.target) || !b.checklist.dinas;
      if (aNeedsAttn !== bNeedsAttn) return aNeedsAttn ? -1 : 1;
      return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
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

    for (const rec of acceptedYearRecords) {
      const code = (rec.item || '').trim();
      if (!code) continue;
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
      existing.accepted += 1;
      itemMap.set(code, existing);
    }

    return Array.from(itemMap.values()).sort((a, b) => {
      const rankA = getItemHierarchyRank(a.code, selectedYear, items);
      const rankB = getItemHierarchyRank(b.code, selectedYear, items);
      if (rankA !== rankB) return rankA - rankB;
      return a.code.localeCompare(b.code, 'id');
    });
  }, [acceptedYearRecords, items, selectedYear]);

  const missingItemCount = useMemo(
    () => acceptedYearRecords.filter((r) => !(r.item || '').trim()).length,
    [acceptedYearRecords]
  );

  // Top field coordinators (Pengelola — khusus KPM aktif Diterima agar konsisten dengan statistik Beranda)
  const pengelolaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of acceptedYearRecords) {
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

  const urgentSchedules = useMemo(() => {
    const limitDate = getTodayLocalIsoDate(3);
    return schedules
      .filter((s) => !s.completed && s.targetDate <= limitDate)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  }, [schedules]);

  const hasAttentionItems =
    (currentUser.role === 'SuperAdmin' && pendingUsersCount > 0) ||
    duplicateNikCount > 0 ||
    missingItemCount > 0 ||
    attentionCounts.pendingDinas > 0 ||
    incompleteQuotaProposals.length > 0 ||
    urgentSchedules.length > 0;

  const visibleNotifications = useMemo(
    () =>
      appNotifications.filter(
        (n) => n.type !== 'user_registered' || currentUser.role === 'SuperAdmin'
      ),
    [appNotifications, currentUser.role]
  );

  const unreadAppNotifCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read).length,
    [visibleNotifications]
  );

  const showBellRedDot =
    bellHasUnread !== undefined
      ? bellHasUnread
      : unreadChatCount > 0 || unreadAppNotifCount > 0;

  const { isOffline } = useOfflineStatus();
  const isDesktopWeb = useIsDesktopWeb();
  const acceptedPct =
    kpmStats.total > 0 ? Math.round((kpmStats.accepted / kpmStats.total) * 100) : 0;

  return (
    <div className={`min-h-screen pb-24 ${isDesktopWeb ? 'md:pb-12' : ''}`}>
      {/* Main Brand Top Bar (Android View: APK & Phone Browser — Web View uses DesktopSidebar) */}
      {!isDesktopWeb && (
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <div>{logo}</div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            MASDETA
          </h1>
        </div>

        <div ref={headerActionsRef} className="relative flex shrink-0 items-center gap-2">
          {/* Bell Notification Button */}
          <button
            type="button"
            onClick={() =>
              setOpenHeaderMenu((prev) => {
                const next = prev === 'notifications' ? 'none' : 'notifications';
                if (next === 'notifications') {
                  onOpenBell?.();
                  if (unreadAppNotifCount > 0) {
                    onMarkNotificationsRead?.();
                  }
                }
                return next;
              })
            }
            aria-label="Notifikasi"
            aria-expanded={openHeaderMenu === 'notifications'}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Bell className="h-4.5 w-4.5" />
            {showBellRedDot && (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-600" />
            )}
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
            <div className="absolute top-12 right-0 z-40 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Notifikasi</span>
                  {unreadChatCount > 0 && (
                    <span className="text-[11px] font-semibold text-rose-600 tabular-nums">
                      {unreadChatCount} chat
                    </span>
                  )}
                </div>
                {(visibleNotifications.length > 0 ||
                  unreadChatCount > 0 ||
                  (currentUser.role === 'SuperAdmin' &&
                    pendingUsersCount > dismissedPendingBellCount)) &&
                  onClearNotifications && (
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedPendingBellCount(pendingUsersCount);
                        onClearNotifications();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Bersihkan</span>
                    </button>
                  )}
              </div>

              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
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

                {visibleNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-slate-50 ${
                      !notif.read ? 'bg-teal-50/35' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenHeaderMenu('none');
                        if (notif.targetAction === 'users' && currentUser.role === 'SuperAdmin') {
                          onOpenUserApproval();
                        } else if (notif.targetAction === 'proposals') {
                          onOpenProposalList?.();
                        }
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          notif.type === 'proposal_deleted'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {notif.type === 'proposal_deleted' ? (
                          <Trash2 className="h-4 w-4" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900">{notif.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                          {notif.message}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatUploadDateTime(notif.createdAt)}
                        </p>
                      </div>
                    </button>
                    {onDismissNotification && (
                      <button
                        type="button"
                        onClick={() => onDismissNotification(notif.id)}
                        aria-label="Hapus notifikasi"
                        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {pendingUsersCount > dismissedPendingBellCount &&
                  currentUser.role === 'SuperAdmin' &&
                  !visibleNotifications.some((n) => n.type === 'user_registered') && (
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

                {unreadChatCount === 0 &&
                  visibleNotifications.length === 0 &&
                  (currentUser.role !== 'SuperAdmin' ||
                    pendingUsersCount <= dismissedPendingBellCount) && (
                    <div className="px-4 py-7 text-center text-xs text-slate-500">
                      Tidak ada notifikasi.
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
      )}

      <main className={`space-y-5 px-4 pt-4 ${isDesktopWeb ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''}`}>
        {isDesktopWeb && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Halo, {currentUser.nama}
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {currentUser.role} · Ringkasan Operasional {yearDisplayLabel}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="dashboard-web-year"
                className="text-xs font-semibold text-slate-500"
              >
                Tahun:
              </label>
              <div className="relative inline-flex min-h-[40px] min-w-[132px] items-center rounded-xl border border-slate-200 bg-white shadow-xs transition-colors hover:border-slate-300">
                <select
                  id="dashboard-web-year"
                  aria-label="Pilih tahun anggaran"
                  value={selectedYear}
                  onChange={(e) => onChangeYear(e.target.value)}
                  className="h-full min-h-[40px] w-full cursor-pointer appearance-none bg-transparent py-2 pr-9 pl-3.5 text-xs font-bold text-slate-800 focus:outline-none tabular-nums"
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
                <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" />
              </div>
            </div>
          </div>
        )}

        {(!isOnline || offlineQueueCount > 0) && (
          <section className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                {!isOnline ? <WifiOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="font-bold">
                  {!isOnline
                    ? 'Mode Offline Aktif'
                    : `${offlineQueueCount} Perubahan Menunggu Sinkronisasi`}
                </p>
                <p className="text-[11px] text-amber-800">
                  {!isOnline
                    ? offlineQueueCount > 0
                      ? `${offlineQueueCount} antrean tersimpan lokal dan siap dikirim otomatis.`
                      : 'Perubahan data akan disimpan sementara di perangkat.'
                    : 'Koneksi kembali aktif. Kirim antrean perubahan ke server sekarang.'}
                </p>
              </div>
            </div>
            {isOnline && offlineQueueCount > 0 && onSyncOfflineQueue && (
              <button
                type="button"
                onClick={onSyncOfflineQueue}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl bg-amber-700 px-3 text-[11px] font-semibold text-white hover:bg-amber-800"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Sinkronkan Sekarang</span>
              </button>
            )}
          </section>
        )}

        {isLoading && records.length === 0 ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-44 rounded-3xl bg-slate-200" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 rounded-2xl bg-slate-200" />
              <div className="h-24 rounded-2xl bg-slate-200" />
            </div>
            <div className="h-40 rounded-2xl bg-slate-200" />
          </div>
        ) : (
          <>
        {isDesktopWeb ? (
          /* WEB VIEW TOP KPI BENTO ROW (3 Balanced Cards, Year Selector Extracted) */
          <div className="grid grid-cols-12 items-stretch gap-5">
            {/* 1. REDESIGNED HEADING SUMMARY CONTAINER */}
            <section className="col-span-12 flex flex-col justify-between rounded-2xl bg-slate-900 p-5 text-white lg:col-span-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Total KPM
                  </span>
                  <span className="text-xs font-semibold text-teal-300 tabular-nums">
                    {acceptedPct}% Terverifikasi
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenKpmList({ status: 'all' })}
                  className="mt-2 flex items-baseline gap-2.5 text-left transition-opacity hover:opacity-90"
                >
                  <span className="text-4xl font-bold tracking-tight tabular-nums">
                    {kpmStats.total}
                  </span>
                  <span className="text-xs font-medium text-slate-400">{yearDisplayLabel}</span>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-4 divide-x divide-slate-800 border-t border-slate-800 pt-3.5">
                <button
                  type="button"
                  onClick={() => onOpenKpmList({ status: 'accepted' })}
                  className="px-1.5 text-center transition-opacity hover:opacity-80"
                >
                  <p className="text-[11px] text-slate-400">Diterima</p>
                  <p className="mt-0.5 text-lg font-bold text-teal-300 tabular-nums">
                    {kpmStats.accepted}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenDatabaseKpm ? onOpenDatabaseKpm() : onOpenKpmList({ status: 'pending' })
                  }
                  className="px-1.5 text-center transition-opacity hover:opacity-80"
                >
                  <p className="text-[11px] text-slate-400">Menunggu</p>
                  <p className="mt-0.5 text-lg font-bold text-amber-300 tabular-nums">
                    {kpmStats.pending}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenArsip ? onOpenArsip() : onOpenKpmList({ status: 'rejected' })
                  }
                  className="px-1.5 text-center transition-opacity hover:opacity-80"
                >
                  <p className="text-[11px] text-slate-400">Ditolak</p>
                  <p className="mt-0.5 text-lg font-bold text-rose-300 tabular-nums">
                    {kpmStats.rejected}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProposalList?.()}
                  className="px-1.5 text-center transition-opacity hover:opacity-80"
                >
                  <p className="text-[11px] text-slate-400">Proposal</p>
                  <p className="mt-0.5 text-lg font-bold text-white tabular-nums">
                    {filteredProposals.length}
                  </p>
                </button>
              </div>
            </section>

            {/* 2. DENSE PENYALURAN ITEM CARD */}
            <button
              type="button"
              onClick={() => onOpenSubItemRecap?.()}
              className="col-span-12 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:bg-slate-50/70 md:col-span-6 lg:col-span-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Penyaluran Item
                  </span>
                  <Package className="h-4 w-4 shrink-0 text-teal-700" />
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {itemDeliveryOverview.pctDelivered}%
                  </span>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {itemDeliveryOverview.deliveredPackages}/{itemDeliveryOverview.totalPackages} paket lengkap
                  </span>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-700 transition-all duration-300"
                    style={{ width: `${itemDeliveryOverview.pctDelivered}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-1 text-xs">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500">Unit Sub-Item Dibagikan</span>
                  <span className="font-semibold text-teal-700 tabular-nums">
                    {itemDeliveryOverview.totalDeliveredUnits}/{itemDeliveryOverview.totalUnits} ({itemDeliveryOverview.pctUnits}%)
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500">Paket Belum Lengkap</span>
                  <span className="font-semibold text-amber-700 tabular-nums">
                    {itemDeliveryOverview.pendingPackages} KPM
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5">
                  <span className="text-slate-500">Unit Sub-Item Tersisa</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {itemDeliveryOverview.totalPendingUnits} Unit
                  </span>
                </div>
              </div>
            </button>

            {/* 3. DENSE KELAYAKAN DTSEN CARD */}
            <button
              type="button"
              onClick={() => onOpenDtsen?.()}
              className="col-span-12 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:bg-slate-50/70 md:col-span-6 lg:col-span-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Kelayakan DTSEN
                  </span>
                  <Layers className="h-4 w-4 shrink-0 text-teal-700" />
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {dtsenStats.priorityCount}
                  </span>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    Desil 1–4 Prioritas ({dtsenStats.priorityPct}%)
                  </span>
                </div>

                <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  {dtsenStats.segments.map((seg) => (
                    <div
                      key={seg.key}
                      title={`${seg.label}: ${seg.count} (${Math.round(seg.pct)}%)`}
                      className={`h-full transition-all duration-300 ${seg.barClass}`}
                      style={{
                        width: `${seg.pct}%`,
                        minWidth: seg.count > 0 ? '3px' : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-1 text-xs">
                <div className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-teal-700" />
                    <span>Desil 1–4</span>
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {dtsenStats.priorityCount} KPM
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Desil 5</span>
                  </span>
                  <span className="font-semibold text-amber-700 tabular-nums">
                    {dtsenStats.reviewCount} KPM
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-rose-600" />
                    <span>Desil 6–10 &amp; Lainnya</span>
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {dtsenStats.highCount + dtsenStats.notFoundCount + dtsenStats.unassignedCount} KPM
                  </span>
                </div>
              </div>
            </button>
          </div>
        ) : (
        /* ANDROID VIEW (APK & Phone Browser): Compact Hero + 2-Col Bento */
        <div className="space-y-5">
        {/* 1. EXECUTIVE COMMAND HERO */}
        <section className="rounded-3xl bg-[#29384D] p-5 text-white">
          <div className="min-w-0">
            <p className="break-words text-lg leading-snug font-bold tracking-tight text-white">
              Halo, {currentUser.nama}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-300">
              {currentUser.role}
            </p>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'all' })}
              className="min-w-0 flex-1 text-left transition-opacity hover:opacity-90"
            >
              <p className="text-xs font-medium text-slate-300">
                Total KPM
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                {kpmStats.total}
              </p>
            </button>

            <div className="relative inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center rounded-xl border border-white/40 bg-white/12 transition-colors hover:border-white/65 hover:bg-white/18">
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

          {/* 4-Column Quick Status Strip */}
          <div className="mt-4 grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 pt-3.5">
            <button
              type="button"
              onClick={() => onOpenKpmList({ status: 'accepted' })}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-300">Diterima</p>
              <p className="mt-0.5 text-base font-bold text-teal-300 tabular-nums">
                {kpmStats.accepted}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenDatabaseKpm ? onOpenDatabaseKpm() : onOpenKpmList({ status: 'pending' })
              }
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-300">Menunggu</p>
              <p className="mt-0.5 text-base font-bold text-amber-300 tabular-nums">
                {kpmStats.pending}
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenArsip ? onOpenArsip() : onOpenKpmList({ status: 'rejected' })
              }
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-300">Ditolak</p>
              <p className="mt-0.5 text-base font-bold text-rose-300 tabular-nums">
                {kpmStats.rejected}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenProposalList?.()}
              className="px-2 text-center transition-opacity hover:opacity-80"
            >
              <p className="text-[11px] text-slate-300">Proposal</p>
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

              <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                {dtsenStats.segments.map((seg) => (
                  <div
                    key={seg.key}
                    title={`${seg.label}: ${seg.count} (${Math.round(seg.pct)}%)`}
                    className={`h-full transition-all duration-300 ${seg.barClass}`}
                    style={{
                      width: `${seg.pct}%`,
                      minWidth: seg.count > 0 ? '3px' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          </button>
        </section>
        </div>
        )}

        {/* DESKTOP 2-COLUMN OPERATIONAL BODY */}
        <div className={isDesktopWeb ? 'space-y-5 md:grid md:grid-cols-12 md:items-start md:gap-5 md:space-y-0' : 'space-y-5'}>
        <div className={isDesktopWeb ? 'space-y-5 md:col-span-7' : 'space-y-5'}>
        {/* 3. PERLU TINDAKAN / PENGINGAT OPERASIONAL */}
        {hasAttentionItems && (
          <section>
            <div className="mb-2 flex items-center justify-between px-0.5">
              <h2 className="text-sm font-bold text-slate-900">Perlu Tindakan</h2>
              <span className="text-xs font-medium text-slate-500">Tindak lanjut cepat</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {currentUser.role === 'SuperAdmin' && pendingUsersCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenUserApproval}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      Pendaftar User Menunggu Persetujuan
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      Tinjau akun baru pada Kontrol SuperAdmin
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-700 tabular-nums">
                      {pendingUsersCount}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              )}

              {duplicateNikCount > 0 && (
                <button
                  type="button"
                  onClick={onOpenDuplicateCheck}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      Duplikasi NIK / KK Terdeteksi
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      Periksa kesamaan data lintas tahun anggaran
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-rose-600 tabular-nums">
                      {duplicateNikCount}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              )}

              {missingItemCount > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenKpmList({ status: 'all', item: '__missing__' })}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      KPM Belum Memiliki Item Bantuan
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      Lengkapi penetapan paket bantuan penerima
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-700 tabular-nums">
                      {missingItemCount}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
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
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {incompleteQuotaProposals.length === 1
                        ? `Proposal ${incompleteQuotaProposals[0].namaProposal}`
                        : 'Proposal Belum Terisi Penuh'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                      {incompleteQuotaProposals.length === 1
                        ? `Terisi ${incompleteQuotaProposals[0].totalKpm} dari ${incompleteQuotaProposals[0].target} kuota KPM`
                        : 'Kuota KPM masih di bawah target'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-700 tabular-nums">
                      {incompleteQuotaProposals.length}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              )}

              {attentionCounts.pendingDinas > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenProposalList?.()}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      Proposal Belum Diantar ke Dinas
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      Perbarui status pengantaran berkas fisik
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      {attentionCounts.pendingDinas}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              )}

              {urgentSchedules.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenSchedules?.()}
                  className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {urgentSchedules.length === 1
                        ? urgentSchedules[0].proposalName?.trim()
                          ? `${urgentSchedules[0].proposalName.trim()} · ${
                              SCHEDULE_CATEGORY_LABELS[urgentSchedules[0].category] ||
                              urgentSchedules[0].title
                            }`
                          : SCHEDULE_CATEGORY_LABELS[urgentSchedules[0].category] ||
                            urgentSchedules[0].title
                        : 'Jadwal Kegiatan Mendekati Tenggat'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 tabular-nums">
                      {urgentSchedules.length === 1
                        ? `Tenggat ${formatScheduleIndonesianDate(
                            urgentSchedules[0].targetDate,
                            urgentSchedules[0].targetDay
                          )}`
                        : 'Agenda operasional dalam 3 hari ke depan'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold text-[#0F766E] tabular-nums">
                      {urgentSchedules.length}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
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
                className="inline-flex min-h-[36px] items-center gap-0.5 text-xs font-semibold text-[#0F766E] hover:underline"
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
                  disabled={isOffline}
                  onClick={onOpenAddProposal}
                  title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Tambah Proposal'}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0F766E] px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
                  className="flex min-h-[68px] w-full flex-col justify-center px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {prop.namaProposal}
                      </p>
                      <span className="shrink-0 text-xs font-bold text-slate-800 tabular-nums">
                        {prop.totalKpm}/{prop.target}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                      <span className="min-w-0 truncate text-slate-500">
                        {prop.tipe} · {prop.tahun} · {prop.acceptedCount} Diterima · Berkas{' '}
                        {prop.checklistDone}/7
                      </span>
                      <span
                        className={`shrink-0 font-semibold whitespace-nowrap ${
                          prop.checklist.dinas ? 'text-[#0F766E]' : 'text-amber-700'
                        }`}
                      >
                        {prop.checklist.dinas ? 'Sudah diantar' : 'Belum diantar'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        </div>

        <div className={isDesktopWeb ? 'space-y-5 md:col-span-5' : 'space-y-5'}>
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
                <span>Rekap Item</span>
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
                Daftarkan KPM lewat tombol + di bawah.
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

        {/* 6. KOORDINATOR LAPANGAN */}
        {pengelolaBreakdown.top.length > 0 && (
          <section>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-700" />
                  <h2 className="text-sm font-bold text-slate-900">Pengelola Teraktif</h2>
                </div>
                {onOpenPengelolaList ? (
                  <button
                    type="button"
                    onClick={onOpenPengelolaList}
                    className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap"
                  >
                    <span>Semua</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 tabular-nums">
                    {pengelolaBreakdown.totalCoordinators} pengelola
                  </span>
                )}
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
                        {rec.item?.trim() ? `${rec.item} · ` : ''}
                        {rec.proposal ||
                          (rec.validasi === 'rejected'
                            ? 'Arsip Ditolak'
                            : 'Database KPM')}{' '}
                        ·{' '}
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
        </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
