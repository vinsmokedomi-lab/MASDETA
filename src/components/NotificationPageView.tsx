import { useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { AppNotificationItem, InternalUser } from '../types/kpm';
import { formatUploadDateTime } from '../utils/imageProcessor';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface NotificationPageViewProps {
  currentUser: InternalUser;
  unreadChatCount: number;
  pendingUsersCount: number;
  appNotifications: AppNotificationItem[];
  onMarkNotificationsRead: () => void;
  onDismissNotification: (id: string) => void;
  onClearNotifications: () => void;
  onOpenChat: () => void;
  onOpenUserApproval: () => void;
  onOpenProposalList: () => void;
}

export function NotificationPageView({
  currentUser,
  unreadChatCount,
  pendingUsersCount,
  appNotifications,
  onMarkNotificationsRead,
  onDismissNotification,
  onClearNotifications,
  onOpenChat,
  onOpenUserApproval,
  onOpenProposalList,
}: NotificationPageViewProps) {
  const { isOffline } = useOfflineStatus();
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

  const showPendingUsersCard =
    currentUser.role === 'SuperAdmin' &&
    pendingUsersCount > 0 &&
    !visibleNotifications.some((n) => n.type === 'user_registered');

  const hasAnyItem =
    unreadChatCount > 0 || visibleNotifications.length > 0 || showPendingUsersCard;

  const totalPendingAlertCount =
    unreadChatCount +
    unreadAppNotifCount +
    (currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0);

  return (
    <div className="min-h-screen pb-12">
      <div className="mx-auto max-w-[1440px] space-y-5 px-6 pt-6">
        {/* In-Page Title & Action Bar (No <header>) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Notifikasi</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Pusat pemberitahuan sistem, pesan masuk, dan persetujuan akun tim.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {unreadAppNotifCount > 0 && (
              <button
                type="button"
                disabled={isOffline}
                onClick={onMarkNotificationsRead}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4 text-teal-700" />
                <span>Tandai Semua Dibaca</span>
              </button>
            )}
            {hasAnyItem && (
              <button
                type="button"
                disabled={isOffline}
                onClick={onClearNotifications}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Bersihkan Notifikasi</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 items-start gap-5">
          {/* Left Summary Panel */}
          <section className="col-span-12 space-y-4 lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ringkasan Pemberitahuan
                </span>
                <Bell className="h-4 w-4 text-teal-700" />
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {totalPendingAlertCount}
                </span>
                <span className="text-xs font-medium text-slate-500">Item Perlu Perhatian</span>
              </div>

              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-slate-600">Pesan Obrolan Belum Dibaca</span>
                  <span className="font-bold text-slate-900 tabular-nums">{unreadChatCount}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-slate-600">Notifikasi Sistem</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {visibleNotifications.length}
                  </span>
                </div>
                {currentUser.role === 'SuperAdmin' && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-600">Pendaftar User Menunggu</span>
                    <span className="font-bold text-amber-700 tabular-nums">
                      {pendingUsersCount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right Notification Feed */}
          <section className="col-span-12 space-y-3 lg:col-span-8">
            {!hasAnyItem ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Bell className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-sm font-bold text-slate-900">
                  Semua Notifikasi Sudah Terbaca
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Pemberitahuan pesan obrolan baru, pengajuan akun, dan perubahan proposal akan muncul di sini.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {unreadChatCount > 0 && (
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 tabular-nums">
                          {unreadChatCount} Pesan Obrolan Baru
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Klik untuk langsung membuka percakapan di Obrolan Tim.
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {showPendingUsersCard && (
                  <button
                    type="button"
                    onClick={onOpenUserApproval}
                    className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {pendingUsersCount} Pendaftar User Baru Menunggu Persetujuan
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Klik untuk meninjau, menetapkan jabatan, dan menyetujui akun.
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                )}

                {visibleNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-slate-50 ${
                      !notif.read ? 'bg-teal-50/30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (notif.targetAction === 'users' && currentUser.role === 'SuperAdmin') {
                          onOpenUserApproval();
                        } else if (notif.targetAction === 'proposals') {
                          onOpenProposalList();
                        }
                      }}
                      className="flex min-w-0 flex-1 items-start gap-3.5 text-left"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          notif.type === 'proposal_deleted'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {notif.type === 'proposal_deleted' ? (
                          <Trash2 className="h-5 w-5" />
                        ) : (
                          <UserPlus className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="shrink-0 text-[11px] font-bold text-teal-700">
                              Baru
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
                          {formatUploadDateTime(notif.createdAt)}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isOffline}
                      onClick={() => onDismissNotification(notif.id)}
                      aria-label="Hapus notifikasi"
                      className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
