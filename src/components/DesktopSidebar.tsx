import {
  CalendarClock,
  CopyCheck,
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
import { InternalUser } from '../types/kpm';
import { DriveImage } from './DriveImage';
import { MainTab } from './BottomNavBar';
import { MenuSection } from './MenuHubView';
import { PresenceDot, getPresenceMeta } from './PresenceDot';

interface DesktopSidebarProps {
  logo: React.ReactNode;
  currentUser: InternalUser;
  activeTab: MainTab;
  activeSubView: string;
  activeMenuSection: MenuSection;
  kpmCount: number;
  proposalCount: number;
  unreadChatCount: number;
  pendingUsersCount: number;
  urgentSchedulesCount: number;
  duplicateNikCount: number;
  hasAppUpdate: boolean;
  canAdd: boolean;
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
  currentUser,
  activeTab,
  activeSubView,
  activeMenuSection,
  kpmCount,
  proposalCount,
  unreadChatCount,
  pendingUsersCount,
  urgentSchedulesCount,
  duplicateNikCount,
  hasAppUpdate,
  canAdd,
  onSelectTab,
  onOpenSubItemRecap,
  onOpenChat,
  onOpenMenuSection,
  onOpenQuickAdd,
  onOpenProfile,
  onLogout,
}: DesktopSidebarProps) {
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
  const isMenuActive =
    activeSubView === 'none' &&
    activeTab === 'menu' &&
    activeMenuSection !== 'jadwal' &&
    activeMenuSection !== 'duplikasi' &&
    activeMenuSection !== 'download';

  return (
    <aside
      aria-label="Navigasi desktop"
      className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white"
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
                v{APP_VERSION}
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
            onClick={onOpenQuickAdd}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Tambah Data Baru</span>
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-3.5">
        <div className="space-y-1">
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
            <span className="flex-1 truncate">Calon KPM</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 tabular-nums">
              {kpmCount}
            </span>
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
            <span className="flex-1 truncate">Rekap Sub-Item</span>
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
            <span className="flex-1 truncate">Menu &amp; Alat</span>
            {menuBadgeCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                {menuBadgeCount > 99 ? '99+' : menuBadgeCount}
              </span>
            )}
          </button>
        </div>

        <div className="space-y-1 border-t border-slate-100 pt-3">
          <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Akses Cepat
          </p>

          <button
            type="button"
            onClick={() => onOpenMenuSection('jadwal')}
            className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'jadwal'
                ? 'bg-teal-50 font-semibold text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1 truncate">Jadwal &amp; Target</span>
            {urgentSchedulesCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 tabular-nums">
                {urgentSchedulesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('duplikasi')}
            className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'duplikasi'
                ? 'bg-teal-50 font-semibold text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <CopyCheck className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="flex-1 truncate">Duplikasi NIK/KK</span>
            {duplicateNikCount > 0 && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 tabular-nums">
                {duplicateNikCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenMenuSection('download')}
            className={`flex min-h-[38px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium transition-colors ${
              activeSubView === 'none' && activeTab === 'menu' && activeMenuSection === 'download'
                ? 'bg-teal-50 font-semibold text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Download className="h-4 w-4 shrink-0 text-teal-700" />
            <span className="flex-1 truncate">Download PDF / Excel</span>
          </button>
        </div>
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
