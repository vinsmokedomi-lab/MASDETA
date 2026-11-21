import { useMemo } from 'react';
import {
  Archive,
  Bell,
  Calculator,
  CalendarClock,
  CopyCheck,
  Database,
  Download,
  FolderOpen,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  User,
  Users,
} from 'lucide-react';
import { APP_VERSION } from '../config/appVersion';
import { AppNotificationItem, InternalUser } from '../types/kpm';
import { DriveImage } from './DriveImage';
import { MainTab } from './BottomNavBar';
import { MenuSection } from './MenuHubView';
import { PresenceDot, getPresenceMeta } from './PresenceDot';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface DesktopSidebarProps {
  logo: React.ReactNode;
  appVersion?: string;
  currentUser: InternalUser;
  activeTab: MainTab;
  activeSubView: string;
  activeMenuSection: MenuSection;
  kpmCount: number;
  proposalCount: number;
  databaseKpmCount?: number;
  archivedKpmCount?: number;
  unreadChatCount: number;
  pendingUsersCount: number;
  urgentSchedulesCount: number;
  hasAppUpdate: boolean;
  canAdd: boolean;
  appNotifications: AppNotificationItem[];
  bellHasUnread: boolean;
  onOpenNotifications: () => void;
  onSelectTab: (tab: MainTab) => void;
  onOpenSubItemRecap: () => void;
  onOpenChat: () => void;
  onOpenMenuSection: (section: MenuSection) => void;
  onOpenQuickAdd: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function DesktopSidebar({
  logo,
  appVersion,
  currentUser,
  activeTab,
  activeSubView,
  activeMenuSection,
  kpmCount,
  proposalCount,
  databaseKpmCount = 0,
  archivedKpmCount = 0,
  unreadChatCount,
  pendingUsersCount,
  urgentSchedulesCount,
  hasAppUpdate,
  canAdd,
  appNotifications,
  bellHasUnread,
  onOpenNotifications,
  onSelectTab,
  onOpenSubItemRecap,
  onOpenChat,
  onOpenMenuSection,
  onOpenQuickAdd,
  onOpenProfile,
  onLogout,
}: DesktopSidebarProps) {
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

  const totalNotifCount =
    unreadChatCount +
    unreadAppNotifCount +
    (currentUser.role === 'SuperAdmin' && pendingUsersCount > 0 ? pendingUsersCount : 0);

  const showBellRedDot = bellHasUnread || totalNotifCount > 0;

  const menuBadgeCount = pendingUsersCount + urgentSchedulesCount + (hasAppUpdate ? 1 : 0);
  const presenceMeta = getPresenceMeta(currentUser.presenceStatus);

  const isDashboardActive = activeSubView === 'none' && activeTab === 'dashboard';
  const isKpmActive =
    (activeSubView === 'none' && activeTab === 'kpm') ||
    activeSubView === 'kpm-detail' ||
    activeSubView === 'kpm-history' ||
    activeSubView === 'kpm-form';
  const isProposalActive =
    (activeSubView === 'none' && activeTab === 'proposal') ||
    activeSubView === 'proposal-detail' ||
    activeSubView === 'proposal-history' ||
    activeSubView === 'add-proposal' ||
    activeSubView === 'edit-proposal';
  const isRecapActive = activeSubView === 'subitem-recap';
  const isChatActive = activeSubView === 'chat';
  const isNotificationsActive = activeSubView === 'notifications';
  const isDatabaseKpmActive =
    activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'database-kpm';
  const isArsipActive =
    activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'arsip';
  const isMenuActive =
    activeSubView === 'none' &&
    activeTab === 'menu' &&
    activeMenuSection !== 'database-kpm' &&
    activeMenuSection !== 'arsip' &&
    activeMenuSection !== 'jadwal' &&
    activeMenuSection !== 'duplikasi' &&
    activeMenuSection !== 'download' &&
    activeMenuSection !== 'rab';

  return (
    <aside
      aria-label="Navigasi desktop"
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col md:border-r md:border-slate-200 md:bg-white"
    >
        {/* Top Brand Header */}
        <div className="flex items-center justify-between gap-2.5 border-b border-slate-100 px-4 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-1.5 [&>svg]:h-full [&>svg]:w-full">
              {logo}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-extrabold tracking-tight text-slate-900">
                  MASDETA
                </span>
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 tabular-nums">
                  v{appVersion || APP_VERSION}
                </span>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-500">Web Workspace</p>
            </div>
          </div>
        </div>

        {/* Primary Quick Add CTA */}
        {canAdd && (
          <div className="px-3.5 pt-3.5 pb-1">
            <button
              type="button"
              disabled={isOffline}
              onClick={onOpenQuickAdd}
              title={isOffline ? 'Mode Offline (Read-Only) · Tambah data dinonaktifkan' : 'Tambah Data Baru'}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>Tambah Data Baru</span>
            </button>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3.5">
          <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Menu Utama
          </p>

          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isDashboardActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Home
              className={`h-4 w-4 shrink-0 ${isDashboardActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('proposal')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isProposalActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <FolderOpen
              className={`h-4 w-4 shrink-0 ${isProposalActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Proposal</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 tabular-nums">
              {proposalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('kpm')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isKpmActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users
              className={`h-4 w-4 shrink-0 ${isKpmActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">KPM</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 tabular-nums">
              {kpmCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSubItemRecap}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isRecapActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Package
              className={`h-4 w-4 shrink-0 ${isRecapActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Rekap Item</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('database-kpm')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isDatabaseKpmActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Database
              className={`h-4 w-4 shrink-0 ${isDatabaseKpmActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Database</span>
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 tabular-nums">
              {databaseKpmCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('arsip')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isArsipActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Archive
              className={`h-4 w-4 shrink-0 ${isArsipActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Arsip Ditolak</span>
            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 tabular-nums">
              {archivedKpmCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('jadwal')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'jadwal'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <CalendarClock
              className={`h-4 w-4 shrink-0 ${
                activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'jadwal'
                  ? 'text-teal-700'
                  : 'text-slate-400'
              }`}
            />
            <span className="flex-1 truncate">Jadwal &amp; Target</span>
            {urgentSchedulesCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 tabular-nums">
                {urgentSchedulesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('download')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'download'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Download
              className={`h-4 w-4 shrink-0 ${
                activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'download'
                  ? 'text-teal-700'
                  : 'text-slate-400'
              }`}
            />
            <span className="flex-1 truncate">Download PDF</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('rab')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'rab'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Calculator
              className={`h-4 w-4 shrink-0 ${
                activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'rab'
                  ? 'text-teal-700'
                  : 'text-slate-400'
              }`}
            />
            <span className="flex-1 truncate">Pembuat RAB</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('duplikasi')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'duplikasi'
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <CopyCheck
              className={`h-4 w-4 shrink-0 ${
                activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'duplikasi'
                  ? 'text-teal-700'
                  : 'text-slate-400'
              }`}
            />
            <span className="flex-1 truncate">Duplikasi NIK/KK</span>
          </button>

          <button
            type="button"
            onClick={onOpenChat}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isChatActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <MessageSquare
              className={`h-4 w-4 shrink-0 ${isChatActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Obrolan Tim</span>
            {unreadChatCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-current={isNotificationsActive ? 'page' : undefined}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isNotificationsActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Bell
              className={`h-4 w-4 shrink-0 ${
                isNotificationsActive ? 'text-teal-700' : 'text-slate-400'
              }`}
            />
            <span className="flex-1 truncate">Notifikasi</span>
            {totalNotifCount > 0 ? (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                {totalNotifCount > 99 ? '99+' : totalNotifCount}
              </span>
            ) : (
              showBellRedDot && <span className="h-2 w-2 rounded-full bg-rose-600" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('menu')}
            className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold transition-colors ${
              isMenuActive
                ? 'bg-teal-50 text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <LayoutGrid
              className={`h-4 w-4 shrink-0 ${isMenuActive ? 'text-teal-700' : 'text-slate-400'}`}
            />
            <span className="flex-1 truncate">Menu</span>
            {menuBadgeCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                {menuBadgeCount > 99 ? '99+' : menuBadgeCount}
              </span>
            )}
          </button>
        </div>

        {/* Bottom User Card */}
        <div className="border-t border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-white"
              title="Buka Pengaturan Profil"
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                {currentUser.fotoDataUrl ? (
                  <DriveImage
                    src={currentUser.fotoDataUrl}
                    thumbnailUrl={currentUser.fotoThumbnailUrl}
                    alt={currentUser.nama}
                    className="h-full w-full rounded-xl object-cover"
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{currentUser.nama}</p>
                <p className="truncate text-[10px] font-medium text-slate-500">
                  {currentUser.role} · {presenceMeta.label}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar dari akun"
              title="Keluar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
  );
}
