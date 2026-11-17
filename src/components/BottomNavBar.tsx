import { FilePlus2, FolderOpen, Home, LayoutGrid, Plus, UserPlus, Users, X } from 'lucide-react';
import { isNativeAppPlatform } from '../utils/platform';

export type MainTab = 'dashboard' | 'kpm' | 'proposal' | 'menu';

interface BottomNavBarProps {
  activeTab: MainTab;
  pendingUsersCount?: number;
  unreadChatCount?: number;
  urgentSchedulesCount?: number;
  hasAppUpdate?: boolean;
  onSelectTab: (tab: MainTab) => void;
  onOpenQuickAdd: () => void;
}

export function BottomNavBar({
  activeTab,
  pendingUsersCount = 0,
  unreadChatCount = 0,
  urgentSchedulesCount = 0,
  hasAppUpdate = false,
  onSelectTab,
  onOpenQuickAdd,
}: BottomNavBarProps) {
  const menuBadgeCount =
    pendingUsersCount + unreadChatCount + urgentSchedulesCount + (hasAppUpdate ? 1 : 0);
  const isNativeApp = isNativeAppPlatform();
  return (
    <nav
      aria-label="Navigasi utama"
      className={`fixed bottom-0 left-1/2 z-30 w-full -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur-md ${
        !isNativeApp ? 'md:hidden' : 'max-w-md'
      }`}
    >
      <div className="grid h-16 grid-cols-5 items-center px-1">
        {/* Tab 1: Beranda */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'dashboard'
              ? 'text-teal-700'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
        >
          <Home className="h-5 w-5" strokeWidth={activeTab === 'dashboard' ? 2.3 : 1.9} />
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
            Beranda
          </span>
        </button>

        {/* Tab 2: Calon KPM */}
        <button
          type="button"
          onClick={() => onSelectTab('kpm')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'kpm' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-current={activeTab === 'kpm' ? 'page' : undefined}
        >
          <Users className="h-5 w-5" strokeWidth={activeTab === 'kpm' ? 2.3 : 1.9} />
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
            KPM
          </span>
        </button>

        {/* Center Raised Circular Add Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenQuickAdd}
            aria-label="Tambah data baru"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/20 ring-4 ring-slate-50 transition-transform hover:bg-teal-800 active:scale-95"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>

        {/* Tab 3: Proposal */}
        <button
          type="button"
          onClick={() => onSelectTab('proposal')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'proposal'
              ? 'text-teal-700'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-current={activeTab === 'proposal' ? 'page' : undefined}
        >
          <FolderOpen className="h-5 w-5" strokeWidth={activeTab === 'proposal' ? 2.3 : 1.9} />
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
            Proposal
          </span>
        </button>

        {/* Tab 4: Menu */}
        <button
          type="button"
          onClick={() => onSelectTab('menu')}
          className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            activeTab === 'menu' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-current={activeTab === 'menu' ? 'page' : undefined}
        >
          <div className="relative">
            <LayoutGrid className="h-5 w-5" strokeWidth={activeTab === 'menu' ? 2.3 : 1.9} />
            {menuBadgeCount > 0 && (
              <span
                aria-label={`${menuBadgeCount} notifikasi`}
                className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-white tabular-nums"
              >
                {menuBadgeCount > 99 ? '99+' : menuBadgeCount}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
}

interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAddKpm: () => void;
  onAddProposal: () => void;
}

export function QuickAddSheet({
  isOpen,
  onClose,
  onAddKpm,
  onAddProposal,
}: QuickAddSheetProps) {
  if (!isOpen) return null;

  const isNativeApp = isNativeAppPlatform();

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs ${
        !isNativeApp ? 'md:items-center md:p-4' : ''
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pilih tindakan tambah data"
    >
      <div
        className={`w-full max-w-md rounded-t-3xl bg-white px-4 pt-3 pb-7 shadow-xl ${
          !isNativeApp ? 'md:rounded-3xl md:pb-5' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 ${!isNativeApp ? 'md:hidden' : ''}`} />

        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-bold text-slate-900">Tambah Data Baru</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pilihan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onAddKpm();
            }}
            className="flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-teal-600 hover:bg-teal-50/40 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Pendaftaran Calon KPM</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Input biodata KPM, DTSEN, KTP/KK, dan foto lapangan
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onAddProposal();
            }}
            className="flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-teal-600 hover:bg-teal-50/40 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Tambah Proposal Baru</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Buat proposal wilayah baru per tahun & tipe pengajuan
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
