import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Banknote,
  Briefcase,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CopyCheck,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  Layers,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { ExcelImportWizardModal } from './ExcelImportWizardModal';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { ItemManagerView } from './ItemManagerView';
import { MenuDownloadView } from './MenuDownloadView';
import { AddPengelolaModal } from './PengelolaSelectorModal';
import { PresenceDot, getPresenceMeta } from './PresenceDot';
import { SwipeAction, SwipeableRow } from './SwipeableRow';
import { APP_VERSION } from '../config/appVersion';
import { APP_CHANGELOG, ChangelogRelease } from '../data/changelogData';
import { fetchGithubReleasesChangelog } from '../services/appUpdater';
import { CorrespondentKpmListPanel } from './CorrespondentKpmListPanel';
import { StandaloneKpmView } from './StandaloneKpmView';
import { DTSEN_OPTION_ITEMS } from '../data/kpmOptions';
import {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmRecord,
  PengelolaProfile,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ReportTemplateConfig,
  ScheduleCategory,
  ScheduleEventItem,
  TrashRecordItem,
  UserPermissions,
  WilayahKabKota,
} from '../types/kpm';
import {
  capitalizeWords,
  formatNikDisplay,
  formatRupiah,
  formatUploadDateTime,
  formatWhatsAppUrl,
  getAbsenSeq,
  getPrimaryKpmPhoto,
  isArchivedKpm,
} from '../utils/imageProcessor';
import { useIsDesktopWeb } from '../utils/platform';

export type MenuSection =
  | 'root'
  | 'superadmin'
  | 'items'
  | 'wilayah'
  | 'users'
  | 'duplikasi'
  | 'database-kpm'
  | 'arsip'
  | 'administrasi'
  | 'dtsen'
  | 'pengelola'
  | 'pekerjaan'
  | 'activity'
  | 'download'
  | 'kelengkapan'
  | 'jadwal'
  | 'sampah'
  | 'changelog'
  | 'laporan';

export type AdminDataActionType =
  | 'reset_total'
  | 'delete_all_data'
  | 'delete_all_kpm'
  | 'delete_all_proposal'
  | 'delete_all_items';

interface MenuHubViewProps {
  activeSection: MenuSection;
  onChangeSection: (section: MenuSection) => void;
  selectedPengelolaDrill?: string | null;
  onSelectPengelolaDrill?: (name: string | null) => void;
  selectedPekerjaanDrill?: string | null;
  onSelectPekerjaanDrill?: (name: string | null) => void;
  selectedDtsenDrill?: string | null;
  onSelectDtsenDrill?: (value: string | null) => void;
  usersOpenedFromSuperAdmin?: boolean;
  onChangeUsersOpenedFromSuperAdmin?: (value: boolean) => void;
  currentUser: InternalUser;
  unreadChatCount: number;
  selectedYear?: string;
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pekerjaanList: string[];
  wilayahList: WilayahKabKota[];
  pengelolaList: PengelolaProfile[];
  internalUsers: InternalUser[];
  userAliases?: Record<string, string>;
  onSaveUserAlias?: (userId: string, alias: string) => void;
  proposalHistory?: ProposalKpmHistoryEntry[];
  kpmAuditLogs?: KpmAuditLogEntry[];
  onOpenChat: (peerId?: string) => void;
  onOpenProfile: () => void;
  onCheckAppUpdate?: () => void;
  checkingAppUpdate?: boolean;
  hasAppUpdate?: boolean;
  availableUpdateVersion?: string;
  appVersion?: string;
  githubReleases?: ChangelogRelease[];
  onGithubReleasesUpdated?: (releases: ChangelogRelease[]) => void;
  onSaveItem: (item: ItemBantuan, orderIndex: number, originalCode?: string) => void;
  onDeleteItem: (tahun: string, code: string) => void;
  onMoveItemOrder: (tahun: string, code: string, direction: 'up' | 'down') => void;
  onUpdateItemSubItems: (tahun: string, code: string, subItems: string[]) => void;
  onCopyItemsFromYear: (fromYear: string, toYear: string) => void;
  onAddPekerjaan: (name: string) => void;
  onUpdatePekerjaan?: (oldName: string, newName: string) => void;
  onDeletePekerjaan?: (name: string) => void;
  onUpdateWilayahList: (nextList: WilayahKabKota[]) => void;
  onOpenSubItemRecap: () => void;
  onAddPengelola: (profile: PengelolaProfile) => void;
  onUpdatePengelola?: (profile: PengelolaProfile, previousDisplayName: string) => void;
  onDeletePengelola?: (pengelolaId: string) => void;
  onAdminControlUser: (
    userId: string,
    patch: {
      status?: InternalUserStatus;
      role?: InternalUserRole;
      permissions?: UserPermissions;
      nama?: string;
      jabatan?: string;
      kontak?: string;
      newPassword?: string;
    }
  ) => void;
  onDeleteInternalUser: (userId: string) => Promise<void> | void;
  onAdminDataAction: (action: AdminDataActionType) => Promise<void> | void;
  onVerifySuperAdminPassword?: (password: string) => Promise<{ ok: boolean; error?: string }>;
  onRegisterInternalUser: (user: {
    nama: string;
    username?: string;
    email: string;
    jabatan: string;
    kontak: string;
    role: InternalUserRole;
    password?: string;
  }) => Promise<{ ok: boolean; error?: string }> | void;
  onImportCsv?: (
    csvText: string,
    fileName: string,
    skipDuplicates?: boolean
  ) => {
    importedRecords: number;
    importedProposals: number;
    addedPengelola: number;
    skipped: number;
    error?: string;
  };
  onSelectKpm?: (record: KpmRecord) => void;
  onToggleBerkasDikembalikan?: (kpmId: string, nextValue: boolean) => void;
  onSelectKpmFromDuplicate: (record: KpmRecord) => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
  schedules?: ScheduleEventItem[];
  onAddSchedule?: (payload: {
    title: string;
    category: ScheduleCategory;
    targetDate: string;
    proposalName?: string;
    notes?: string;
  }) => void;
  onToggleSchedule?: (id: string) => void;
  onDeleteSchedule?: (id: string) => void;
  trashBin?: TrashRecordItem[];
  onRestoreTrashItem?: (trashId: string) => void;
  onPermanentDeleteTrashItem?: (trashId: string) => void;
  reportTemplate?: ReportTemplateConfig;
  onSaveReportTemplate?: (next: ReportTemplateConfig) => void;
  onOpenCreateStandaloneDatabaseKpm?: () => void;
  onBulkRecoverToDatabase?: (kpmIds: string[]) => Promise<void> | void;
  onBulkRejectToArsip?: (kpmIds: string[]) => Promise<void> | void;
  onBulkAssignToProposal?: (kpmIds: string[], targetProposal: ProposalRecord) => Promise<void> | void;
  onBulkPermanentDeleteKpms?: (kpmIds: string[]) => Promise<void> | void;
}

export function MenuHubView({
  activeSection,
  onChangeSection,
  selectedPengelolaDrill,
  onSelectPengelolaDrill,
  selectedPekerjaanDrill,
  onSelectPekerjaanDrill,
  selectedDtsenDrill,
  onSelectDtsenDrill,
  usersOpenedFromSuperAdmin: controlledUsersFromSuperAdmin,
  onChangeUsersOpenedFromSuperAdmin,
  currentUser,
  unreadChatCount,
  selectedYear = 'all',
  records,
  proposals,
  items,
  pekerjaanList,
  wilayahList,
  pengelolaList,
  internalUsers,
  userAliases = {},
  onSaveUserAlias,
  proposalHistory = [],
  kpmAuditLogs = [],
  onOpenChat,
  onOpenProfile,
  onCheckAppUpdate,
  checkingAppUpdate = false,
  hasAppUpdate = false,
  availableUpdateVersion,
  appVersion,
  githubReleases: controlledGithubReleases,
  onGithubReleasesUpdated,
  onSaveItem,
  onDeleteItem,
  onMoveItemOrder,
  onUpdateItemSubItems,
  onCopyItemsFromYear,
  onAddPekerjaan,
  onUpdatePekerjaan,
  onDeletePekerjaan,
  onUpdateWilayahList,
  onOpenSubItemRecap,
  onAddPengelola,
  onUpdatePengelola,
  onDeletePengelola,
  onAdminControlUser,
  onDeleteInternalUser,
  onAdminDataAction,
  onVerifySuperAdminPassword,
  onRegisterInternalUser,
  onImportCsv,
  onSelectKpm,
  onToggleBerkasDikembalikan,
  onSelectKpmFromDuplicate,
  onPreviewDocument,
  schedules = [],
  onAddSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  trashBin = [],
  onRestoreTrashItem,
  onPermanentDeleteTrashItem,
  reportTemplate,
  onSaveReportTemplate,
  onOpenCreateStandaloneDatabaseKpm,
  onBulkRecoverToDatabase,
  onBulkRejectToArsip,
  onBulkAssignToProposal,
  onBulkPermanentDeleteKpms,
}: MenuHubViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const isSuperAdminRole = currentUser.role === 'SuperAdmin';
  const canAdd =
    isSuperAdminRole || (currentUser.role !== 'Viewer' && Boolean(currentUser.permissions?.add));
  const canUpdate =
    isSuperAdminRole ||
    (currentUser.role !== 'Viewer' && Boolean(currentUser.permissions?.update));
  const canDelete =
    isSuperAdminRole ||
    (currentUser.role !== 'Viewer' && Boolean(currentUser.permissions?.delete));

  // Master Pekerjaan modal state
  const [isAddPekerjaanOpen, setIsAddPekerjaanOpen] = useState(false);
  const [newPekerjaan, setNewPekerjaan] = useState('');
  const [pekerjaanError, setPekerjaanError] = useState<string | null>(null);

  // Master Wilayah state
  const [newKabKotaInput, setNewKabKotaInput] = useState('');
  const [wilayahError, setWilayahError] = useState<string | null>(null);
  const [expandedKabId, setExpandedKabId] = useState<string | null>(
    () => wilayahList[0]?.id ?? null
  );
  const [expandedKecId, setExpandedKecId] = useState<string | null>(null);
  const [newKecamatanByKab, setNewKecamatanByKab] = useState<Record<string, string>>({});
  const [newKelurahanByKec, setNewKelurahanByKec] = useState<Record<string, string>>({});

  // Pengelola, Pekerjaan & DTSEN drill-down state (lifted when provided)
  const [isAddPengelolaOpen, setIsAddPengelolaOpen] = useState(false);
  const [localPengelolaDrill, setLocalPengelolaDrill] = useState<string | null>(null);
  const [localPekerjaanDrill, setLocalPekerjaanDrill] = useState<string | null>(null);
  const [localDtsenDrill, setLocalDtsenDrill] = useState<string | null>(null);
  const activePengelolaDrill =
    selectedPengelolaDrill !== undefined ? selectedPengelolaDrill : localPengelolaDrill;
  const setPengelolaDrill = (name: string | null) => {
    if (onSelectPengelolaDrill) {
      onSelectPengelolaDrill(name);
    } else {
      setLocalPengelolaDrill(name);
    }
  };
  const activePekerjaanDrill =
    selectedPekerjaanDrill !== undefined ? selectedPekerjaanDrill : localPekerjaanDrill;
  const setPekerjaanDrill = (name: string | null) => {
    if (onSelectPekerjaanDrill) {
      onSelectPekerjaanDrill(name);
    } else {
      setLocalPekerjaanDrill(name);
    }
  };
  const dtsenDrill = selectedDtsenDrill !== undefined ? selectedDtsenDrill : localDtsenDrill;
  const setDtsenDrill = (value: string | null) => {
    if (onSelectDtsenDrill) {
      onSelectDtsenDrill(value);
    } else {
      setLocalDtsenDrill(value);
    }
  };

  // Internal User creation form (SuperAdmin adds active user with password)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regNama, setRegNama] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regJabatan, setRegJabatan] = useState('');
  const [regKontak, setRegKontak] = useState('');
  const [regRole, setRegRole] = useState<InternalUserRole>('Admin');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSubmitting, setRegSubmitting] = useState(false);

  // SuperAdmin drill flag (lifted when provided)
  const [localUsersOpenedFromSuperAdmin, setLocalUsersOpenedFromSuperAdmin] = useState(false);
  const [changelogSortNewestFirst, setChangelogSortNewestFirst] = useState(true);
  const [localGithubReleases, setLocalGithubReleases] = useState<ChangelogRelease[]>([]);
  const [loadingGithubReleases, setLoadingGithubReleases] = useState(false);
  const effectiveVersion = appVersion || APP_VERSION;
  const githubReleases =
    controlledGithubReleases && controlledGithubReleases.length > 0
      ? controlledGithubReleases
      : localGithubReleases;
  const usersOpenedFromSuperAdmin =
    controlledUsersFromSuperAdmin !== undefined
      ? controlledUsersFromSuperAdmin
      : localUsersOpenedFromSuperAdmin;
  const setUsersOpenedFromSuperAdmin = (value: boolean) => {
    if (onChangeUsersOpenedFromSuperAdmin) {
      onChangeUsersOpenedFromSuperAdmin(value);
    } else {
      setLocalUsersOpenedFromSuperAdmin(value);
    }
  };

  // Wilayah delete confirmation state
  const [pendingDeleteWilayah, setPendingDeleteWilayah] = useState<
    | { kind: 'kab'; kabId: string; label: string }
    | { kind: 'kec'; kabId: string; kecId: string; label: string }
    | { kind: 'kel'; kabId: string; kecId: string; kelName: string; label: string }
    | null
  >(null);

  // User filter, Personal Rename & SuperAdmin CRUD modals
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | InternalUserStatus>('all');
  const [personalRenameTarget, setPersonalRenameTarget] = useState<InternalUser | null>(null);
  const [personalRenameDraft, setPersonalRenameDraft] = useState('');
  const [editingUserTarget, setEditingUserTarget] = useState<InternalUser | null>(null);
  const [editUserNama, setEditUserNama] = useState('');
  const [editUserJabatan, setEditUserJabatan] = useState('');
  const [editUserKontak, setEditUserKontak] = useState('');
  const [editUserNewPassword, setEditUserNewPassword] = useState('');
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<InternalUser | null>(null);

  const getUserDisplayName = (u: InternalUser): string => {
    const alias = (userAliases[u.id] || '').trim();
    return alias || u.nama;
  };

  // SuperAdmin Password Gate & data reset confirmation state
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);
  const [superAdminPwdInput, setSuperAdminPwdInput] = useState('');
  const [showSuperAdminPwd, setShowSuperAdminPwd] = useState(false);
  const [superAdminPwdError, setSuperAdminPwdError] = useState<string | null>(null);
  const [verifyingSuperAdminPwd, setVerifyingSuperAdminPwd] = useState(false);
  const [pendingResetAction, setPendingResetAction] = useState<AdminDataActionType | null>(null);
  const [resetConfirmStep, setResetConfirmStep] = useState<'confirm' | 'password'>('confirm');
  const [resetPwdInput, setResetPwdInput] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetPwdError, setResetPwdError] = useState<string | null>(null);
  const [isRunningReset, setIsRunningReset] = useState(false);

  // General Activity Log state & unified feed
  const [activitySearch, setActivitySearch] = useState('');
  const [activityCategory, setActivityCategory] = useState<'all' | 'proposal' | 'kpm' | 'catalog'>('all');
  const [activityYear, setActivityYear] = useState<string>('all');

  const unifiedActivityLogs = useMemo(() => {
    interface ActivityTimelineItem {
      id: string;
      category: 'proposal' | 'kpm' | 'catalog';
      badge: string;
      tone: 'teal' | 'amber' | 'rose' | 'slate';
      title: string;
      detail: string;
      actorName: string;
      tahun: string;
      timestamp: string;
    }

    const itemsList: ActivityTimelineItem[] = [];
    const kpmNameById = new Map<string, string>();
    records.forEach((r) => kpmNameById.set(r.id, r.nama));

    const actLabelMap: Record<
      string,
      { badge: string; category: 'proposal' | 'kpm' | 'catalog'; tone: 'teal' | 'amber' | 'rose' | 'slate' }
    > = {
      proposal_created: { badge: 'Buat Proposal', category: 'proposal', tone: 'teal' },
      proposal_updated: { badge: 'Edit Proposal', category: 'proposal', tone: 'slate' },
      proposal_locked: { badge: 'Kunci Proposal', category: 'proposal', tone: 'amber' },
      proposal_unlocked: { badge: 'Buka Kunci', category: 'proposal', tone: 'teal' },
      proposal_deleted: { badge: 'Hapus Proposal', category: 'proposal', tone: 'rose' },
      kpm_accept_all: { badge: 'Terima Semua KPM', category: 'kpm', tone: 'teal' },
      kpm_transfer: { badge: 'Transfer KPM', category: 'kpm', tone: 'amber' },
      csv_imported: { badge: 'Import CSV', category: 'kpm', tone: 'teal' },
      item_saved: { badge: 'Kelola Item', category: 'catalog', tone: 'teal' },
      item_deleted: { badge: 'Hapus Item', category: 'catalog', tone: 'rose' },
      item_reordered: { badge: 'Urutan Item', category: 'catalog', tone: 'slate' },
      item_subitems: { badge: 'Sub-Item', category: 'catalog', tone: 'slate' },
      item_copied: { badge: 'Salin Item', category: 'catalog', tone: 'teal' },
      pengelola_added: { badge: 'Tambah Pengelola', category: 'catalog', tone: 'teal' },
      pengelola_updated: { badge: 'Edit Pengelola', category: 'catalog', tone: 'slate' },
      pengelola_deleted: { badge: 'Hapus Pengelola', category: 'catalog', tone: 'rose' },
      pekerjaan_updated: { badge: 'Edit Pekerjaan', category: 'catalog', tone: 'slate' },
      pekerjaan_deleted: { badge: 'Hapus Pekerjaan', category: 'catalog', tone: 'rose' },
      wilayah_updated: { badge: 'Kelola Wilayah', category: 'catalog', tone: 'slate' },
      admin_reset: { badge: 'Kontrol SuperAdmin', category: 'catalog', tone: 'rose' },
    };

    for (const h of proposalHistory) {
      if (h.registerCode?.startsWith('ACTLOG::')) {
        const key = h.registerCode.slice('ACTLOG::'.length);
        const meta = actLabelMap[key] ?? {
          badge: 'Aktivitas Sistem',
          category: 'catalog',
          tone: 'slate',
        };
        itemsList.push({
          id: `hist-${h.id}`,
          category: meta.category,
          badge: meta.badge,
          tone: meta.tone,
          title: h.proposalName || 'Operasional MASDETA',
          detail: h.kpmName || '-',
          actorName: h.actorName || 'Petugas Internal',
          tahun: h.tahun || '',
          timestamp: h.timestamp,
        });
      } else {
        const badge =
          h.action === 'moved_in'
            ? 'KPM Pindah Masuk'
            : h.action === 'moved_out'
              ? 'KPM Pindah Keluar'
              : h.action === 'removed'
                ? 'Hapus KPM'
                : 'KPM Masuk Proposal';
        const tone: 'teal' | 'amber' | 'rose' | 'slate' =
          h.action === 'removed'
            ? 'rose'
            : h.action === 'moved_out'
              ? 'amber'
              : 'teal';
        const detail =
          h.action === 'moved_in'
            ? `Pindah dari ${h.fromProposal || '-'} ke ${h.proposalName}`
            : h.action === 'moved_out'
              ? `Dipindahkan dari ${h.proposalName} ke ${h.toProposal || '-'}`
              : h.action === 'removed'
                ? `Dihapus dari proposal ${h.proposalName}`
                : `Didaftarkan ke proposal ${h.proposalName}`;
        itemsList.push({
          id: `hist-${h.id}`,
          category: 'kpm',
          badge,
          tone,
          title: h.kpmName || h.registerCode || 'Calon KPM',
          detail,
          actorName: h.actorName || 'Petugas Internal',
          tahun: h.tahun || '',
          timestamp: h.timestamp,
        });
      }
    }

    for (const a of kpmAuditLogs) {
      const targetName = kpmNameById.get(a.kpmId) || a.proposal || 'Data KPM';
      const badge =
        a.action === 'created'
          ? 'Tambah KPM'
          : a.action === 'status_changed'
            ? 'Verifikasi KPM'
            : 'Perubahan KPM';
      const tone: 'teal' | 'amber' | 'rose' | 'slate' =
        a.action === 'created' ? 'teal' : a.action === 'status_changed' ? 'amber' : 'slate';
      const changeSummary = a.changes
        .slice(0, 3)
        .map((c) => `${c.field}: ${c.before} → ${c.after}`)
        .join(' · ');
      const extraCount = a.changes.length > 3 ? ` (+${a.changes.length - 3} lainnya)` : '';
      itemsList.push({
        id: `audit-${a.id}`,
        category: 'kpm',
        badge,
        tone,
        title: `${targetName}${a.proposal ? ` · ${a.proposal}` : ''}`,
        detail: `${changeSummary || 'Pembaruan data KPM'}${extraCount}`,
        actorName: a.actorName || 'Petugas Internal',
        tahun: a.tahun || '',
        timestamp: a.timestamp,
      });
    }

    return itemsList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [proposalHistory, kpmAuditLogs, records]);

  // Re-lock Kontrol Super Admin whenever navigating away from SuperAdmin flow
  useEffect(() => {
    const insideSuperAdminFlow =
      activeSection === 'superadmin' ||
      activeSection === 'administrasi' ||
      (activeSection === 'users' && usersOpenedFromSuperAdmin);
    if (!insideSuperAdminFlow) {
      setSuperAdminUnlocked(false);
      setSuperAdminPwdInput('');
      setSuperAdminPwdError(null);
      setShowSuperAdminPwd(false);
    }
    if (activeSection !== 'dtsen' && dtsenDrill !== null) {
      setDtsenDrill(null);
    }
    if (activeSection !== 'duplikasi') {
      setDuplikasiYearFilter(selectedYear || 'all');
    }
  }, [activeSection, usersOpenedFromSuperAdmin, selectedYear, dtsenDrill]);

  const refreshGithubReleases = async () => {
    setLoadingGithubReleases(true);
    try {
      const parsed = await fetchGithubReleasesChangelog();
      setLocalGithubReleases(parsed);
      onGithubReleasesUpdated?.(parsed);
    } catch {
      // Fallback ke APP_CHANGELOG lokal
    } finally {
      setLoadingGithubReleases(false);
    }
  };

  useEffect(() => {
    if (activeSection !== 'changelog' || githubReleases.length > 0) return;
    let cancelled = false;
    setLoadingGithubReleases(true);

    void fetchGithubReleasesChangelog()
      .then((parsed) => {
        if (cancelled) return;
        setLocalGithubReleases(parsed);
        onGithubReleasesUpdated?.(parsed);
      })
      .catch(() => {
        // Fallback ke APP_CHANGELOG lokal
      })
      .finally(() => {
        if (!cancelled) setLoadingGithubReleases(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, githubReleases.length, onGithubReleasesUpdated]);

  const [duplikasiYearFilter, setDuplikasiYearFilter] = useState<string>(selectedYear || 'all');
  const seenDuplicatesStorageKey = useMemo(
    () => `masdeta_seen_duplicates_v1_${currentUser.id}`,
    [currentUser.id]
  );
  const [seenDuplicateSignatures, setSeenDuplicateSignatures] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`masdeta_seen_duplicates_v1_${currentUser.id}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(seenDuplicatesStorageKey);
      if (!raw) {
        setSeenDuplicateSignatures([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setSeenDuplicateSignatures(
        Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : []
      );
    } catch {
      setSeenDuplicateSignatures([]);
    }
  }, [seenDuplicatesStorageKey]);

  // Administrasi search & filter state
  const [adminQuery, setAdminQuery] = useState('');
  const [showAdminFilters, setShowAdminFilters] = useState(false);
  const [adminYearFilter, setAdminYearFilter] = useState<string>('all');
  const [adminProposalFilter, setAdminProposalFilter] = useState<string>('all');
  const [adminSortBy, setAdminSortBy] = useState<'absen' | 'amount_desc' | 'amount_asc' | 'name_asc'>('absen');

  // Pengelola Lapangan search, filter & sorting
  const [pengelolaQuery, setPengelolaQuery] = useState('');
  const [pengelolaWilayahFilter, setPengelolaWilayahFilter] = useState<string>('all');
  const [pengelolaKpmFilter, setPengelolaKpmFilter] = useState<'all' | 'with_kpm' | 'empty'>('all');
  const [pengelolaSortBy, setPengelolaSortBy] = useState<
    'name_asc' | 'name_desc' | 'count_desc' | 'count_asc' | 'wilayah_asc'
  >('name_asc');
  const [showPengelolaFilters, setShowPengelolaFilters] = useState(false);
  const [openPengelolaSwipeId, setOpenPengelolaSwipeId] = useState<string | null>(null);
  const [editingPengelolaTarget, setEditingPengelolaTarget] = useState<PengelolaProfile | null>(null);
  const [pendingDeletePengelola, setPendingDeletePengelola] = useState<{
    profile: PengelolaProfile;
    kpmCount: number;
  } | null>(null);

  // Profesi & Pekerjaan search, filter & sorting
  const [pekerjaanQuery, setPekerjaanQuery] = useState('');
  const [pekerjaanKpmFilter, setPekerjaanKpmFilter] = useState<'all' | 'with_kpm' | 'empty'>('all');
  const [pekerjaanSortBy, setPekerjaanSortBy] = useState<
    'name_asc' | 'name_desc' | 'count_desc' | 'count_asc'
  >('name_asc');
  const [showPekerjaanFilters, setShowPekerjaanFilters] = useState(false);
  const [openPekerjaanSwipeId, setOpenPekerjaanSwipeId] = useState<string | null>(null);
  const [editingPekerjaanTarget, setEditingPekerjaanTarget] = useState<string | null>(null);
  const [editPekerjaanValue, setEditPekerjaanValue] = useState('');
  const [editPekerjaanError, setEditPekerjaanError] = useState<string | null>(null);
  const [pendingDeletePekerjaan, setPendingDeletePekerjaan] = useState<{
    name: string;
    kpmCount: number;
  } | null>(null);

  // Excel / CSV Import Wizard modal
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);

  // Matriks Kelengkapan Berkas KPM state
  const [matrixQuery, setMatrixQuery] = useState('');
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'incomplete'>('incomplete');

  // Jadwal & Target Proposal form state
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleCategory, setScheduleCategory] = useState<ScheduleCategory>('distribusi');
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleProposal, setScheduleProposal] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Tempat Sampah confirmation state
  const [pendingPermanentDeleteTrashId, setPendingPermanentDeleteTrashId] = useState<string | null>(null);

  const databaseKpmRecords = useMemo(
    () => records.filter((r) => r.validasi === 'pending' && !(r.proposal || '').trim()),
    [records]
  );

  const archivedRecords = useMemo(
    () => records.filter((r) => isArchivedKpm(r) && !(r.proposal || '').trim()),
    [records]
  );

  const pendingUsersCount = useMemo(
    () => internalUsers.filter((u) => u.status === 'pending').length,
    [internalUsers]
  );

  // Detect duplicate NIK KTP or NIK KK across ALL years (cross-year + same-year)
  const allDuplicateGroups = useMemo(() => {
    const byKtp = new Map<string, KpmRecord[]>();
    const byKk = new Map<string, KpmRecord[]>();

    for (const r of records) {
      const ktp = (r.nikKtp || '').trim();
      const kk = (r.nikKk || '').trim();
      if (ktp) {
        const arr = byKtp.get(ktp) ?? [];
        arr.push(r);
        byKtp.set(ktp, arr);
      }
      if (kk) {
        const arr = byKk.get(kk) ?? [];
        arr.push(r);
        byKk.set(kk, arr);
      }
    }

    const groups: {
      type: 'NIK KTP' | 'Nomor KK';
      value: string;
      years: string[];
      records: KpmRecord[];
      signature: string;
    }[] = [];
    byKtp.forEach((recs, key) => {
      if (recs.length > 1) {
        const years = Array.from(
          new Set(recs.map((r) => (r.tahun || '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        const sortedRecs = [...recs].sort(
          (a, b) => b.tahun.localeCompare(a.tahun) || a.nama.localeCompare(b.nama, 'id')
        );
        const signature = `NIK KTP|${key}|${recs.map((r) => r.id).sort().join(',')}`;
        groups.push({
          type: 'NIK KTP',
          value: key,
          years,
          records: sortedRecs,
          signature,
        });
      }
    });
    byKk.forEach((recs, key) => {
      if (recs.length > 1) {
        const years = Array.from(
          new Set(recs.map((r) => (r.tahun || '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        const sortedRecs = [...recs].sort(
          (a, b) => b.tahun.localeCompare(a.tahun) || a.nama.localeCompare(b.nama, 'id')
        );
        const signature = `Nomor KK|${key}|${recs.map((r) => r.id).sort().join(',')}`;
        groups.push({
          type: 'Nomor KK',
          value: key,
          years,
          records: sortedRecs,
          signature,
        });
      }
    });
    return groups.sort(
      (a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value)
    );
  }, [records]);

  const duplicateGroups = useMemo(() => {
    if (duplikasiYearFilter === 'all') return allDuplicateGroups;
    return allDuplicateGroups.filter((g) =>
      g.records.some((r) => (r.tahun || '').trim() === duplikasiYearFilter)
    );
  }, [allDuplicateGroups, duplikasiYearFilter]);

  useEffect(() => {
    if (activeSection !== 'duplikasi' || duplicateGroups.length === 0) return;
    const visibleSignatures = duplicateGroups.map((g) => g.signature);
    setSeenDuplicateSignatures((prev) => {
      const nextSet = new Set(prev);
      let changed = false;
      for (const sig of visibleSignatures) {
        if (!nextSet.has(sig)) {
          nextSet.add(sig);
          changed = true;
        }
      }
      if (!changed) return prev;
      const nextList = Array.from(nextSet).slice(-500);
      try {
        localStorage.setItem(seenDuplicatesStorageKey, JSON.stringify(nextList));
      } catch {
        // Ignore storage quota errors
      }
      return nextList;
    });
  }, [activeSection, duplicateGroups, seenDuplicatesStorageKey]);

  const seenDuplicateSignatureSet = useMemo(
    () => new Set(seenDuplicateSignatures),
    [seenDuplicateSignatures]
  );

  const activeDuplicateBadgeCount = useMemo(() => {
    const yearGroups =
      selectedYear === 'all'
        ? allDuplicateGroups
        : allDuplicateGroups.filter((g) =>
            g.records.some((r) => (r.tahun || '').trim() === selectedYear)
          );
    return yearGroups.filter((g) => !seenDuplicateSignatureSet.has(g.signature)).length;
  }, [allDuplicateGroups, selectedYear, seenDuplicateSignatureSet]);

  const urgentSchedulesCount = useMemo(() => {
    const limitDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return schedules.filter((s) => !s.completed && s.targetDate <= limitDate).length;
  }, [schedules]);

  const expiringTrashCount = useMemo(() => {
    const thresholdMs = Date.now() + 3 * 24 * 60 * 60 * 1000;
    return trashBin.filter((item) => new Date(item.expiresAt).getTime() <= thresholdMs).length;
  }, [trashBin]);

  const adminStats = useMemo(() => {
    const paidRecords = records.filter((r) => r.payment > 0);
    const totalAmount = paidRecords.reduce((sum, r) => sum + (r.payment || 0), 0);
    return { paidRecords, totalAmount };
  }, [records]);

  const dtsenSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      const key = r.dtsen || 'Belum Ada Desil';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return DTSEN_OPTION_ITEMS.map((opt) => ({
      ...opt,
      count: map.get(opt.value) ?? 0,
    }));
  }, [records]);



  const handleAddPekerjaanSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = capitalizeWords(newPekerjaan.trim());
    if (!name) {
      setPekerjaanError('Nama pekerjaan wajib diisi.');
      return;
    }
    if (pekerjaanList.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setPekerjaanError(`Pekerjaan "${name}" sudah terdaftar.`);
      return;
    }
    onAddPekerjaan(name);
    setNewPekerjaan('');
    setPekerjaanError(null);
    setIsAddPekerjaanOpen(false);
  };

  const handleAddKabKotaSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = capitalizeWords(newKabKotaInput.trim());
    if (!clean) {
      setWilayahError('Nama Kabupaten / Kota wajib diisi.');
      return;
    }
    if (wilayahList.some((w) => w.nama.toLowerCase() === clean.toLowerCase())) {
      setWilayahError(`Wilayah "${clean}" sudah terdaftar.`);
      return;
    }
    const created: WilayahKabKota = {
      id: `wil-${Date.now()}`,
      nama: clean,
      kecamatanList: [],
    };
    onUpdateWilayahList([...wilayahList, created]);
    setNewKabKotaInput('');
    setWilayahError(null);
    setExpandedKabId(created.id);
  };

  const handleDeleteKabKota = (kabId: string) => {
    onUpdateWilayahList(wilayahList.filter((w) => w.id !== kabId));
    if (expandedKabId === kabId) setExpandedKabId(null);
  };

  const handleAddKecamatan = (kabId: string) => {
    const raw = (newKecamatanByKab[kabId] || '').trim().replace(/^(?:kec\.?|kecamatan)\s+/i, '');
    const clean = capitalizeWords(raw);
    if (!clean) return;
    const newKecId = `kec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        if (kab.kecamatanList.some((k) => k.nama.toLowerCase() === clean.toLowerCase())) {
          return kab;
        }
        return {
          ...kab,
          kecamatanList: [
            ...kab.kecamatanList,
            { id: newKecId, nama: clean, kelurahanList: [] },
          ],
        };
      })
    );
    setNewKecamatanByKab((prev) => ({ ...prev, [kabId]: '' }));
    setExpandedKecId(newKecId);
  };

  const handleDeleteKecamatan = (kabId: string, kecId: string) => {
    onUpdateWilayahList(
      wilayahList.map((kab) =>
        kab.id === kabId
          ? { ...kab, kecamatanList: kab.kecamatanList.filter((k) => k.id !== kecId) }
          : kab
      )
    );
    if (expandedKecId === kecId) setExpandedKecId(null);
  };

  const handleAddKelurahan = (kabId: string, kecId: string) => {
    const raw = (newKelurahanByKec[kecId] || '').trim().replace(/^kel\.?\s+/i, 'Kelurahan ');
    const clean = capitalizeWords(raw);
    if (!clean) return;
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        return {
          ...kab,
          kecamatanList: kab.kecamatanList.map((kec) => {
            if (kec.id !== kecId) return kec;
            if (kec.kelurahanList.some((kel) => kel.toLowerCase() === clean.toLowerCase())) {
              return kec;
            }
            return {
              ...kec,
              kelurahanList: [...kec.kelurahanList, clean],
            };
          }),
        };
      })
    );
    setNewKelurahanByKec((prev) => ({ ...prev, [kecId]: '' }));
  };

  const handleDeleteKelurahan = (kabId: string, kecId: string, kelName: string) => {
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        return {
          ...kab,
          kecamatanList: kab.kecamatanList.map((kec) =>
            kec.id === kecId
              ? { ...kec, kelurahanList: kec.kelurahanList.filter((k) => k !== kelName) }
              : kec
          ),
        };
      })
    );
  };

  const handleRegisterUserSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRegError(null);
    const cleanUsername = regUsername.trim().toLowerCase().replace(/^@+/, '');
    if (!regNama.trim() || !regEmail.trim()) {
      setRegError('Nama lengkap dan email wajib diisi.');
      return;
    }
    if (cleanUsername && !/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) {
      setRegError(
        'Username harus 3–30 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).'
      );
      return;
    }
    if (regPassword.trim() && regPassword.trim().length < 6) {
      setRegError('Kata sandi minimal 6 karakter.');
      return;
    }
    setRegSubmitting(true);
    try {
      const result = await onRegisterInternalUser({
        nama: capitalizeWords(regNama.trim()),
        username: cleanUsername || undefined,
        email: regEmail.trim().toLowerCase(),
        jabatan: regJabatan.trim() || regRole,
        kontak: regKontak.trim(),
        role: regRole,
        password: regPassword.trim() || undefined,
      });
      if (result && result.ok === false) {
        setRegError(result.error || 'Gagal menambahkan akun internal.');
        return;
      }
      setRegNama('');
      setRegUsername('');
      setRegEmail('');
      setRegJabatan('');
      setRegKontak('');
      setRegRole('Admin');
      setRegPassword('');
      setShowRegPassword(false);
      setIsRegisterModalOpen(false);
    } finally {
      setRegSubmitting(false);
    }
  };

  const renderSubHeader = (
    title: string,
    onBack: () => void,
    webMaxWidthClass = 'md:max-w-[1440px]'
  ) =>
    isNativeApp ? (
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">{title}</h1>
      </header>
    ) : (
      <div
        className={`mx-auto flex w-full items-center gap-3 px-4 pt-4 md:px-6 md:pt-6 ${webMaxWidthClass}`}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali</span>
        </button>
        <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{title}</h1>
      </div>
    );

  // 1. ROOT MENU HUB
  if (activeSection === 'root') {
    const profilePresence = getPresenceMeta(currentUser.presenceStatus);

    return (
      <div className="min-h-screen pb-24">
        {isNativeApp && (
          <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
            <h1 className="truncate text-base font-bold text-slate-900">Menu</h1>
          </header>
        )}

        <div
          className={`space-y-5 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          {!isNativeApp && (
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Menu &amp; Alat</h1>
          )}
          {/* Active Profile Card */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:bg-slate-50"
          >
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
              {currentUser.fotoDataUrl ? (
                <DriveImage
                  src={currentUser.fotoDataUrl}
                  thumbnailUrl={currentUser.fotoThumbnailUrl}
                  alt={currentUser.nama}
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
              <PresenceDot
                status={currentUser.presenceStatus}
                size="md"
                className="absolute -right-1 -bottom-1"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-slate-900">{currentUser.nama}</p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    currentUser.role === 'SuperAdmin'
                      ? 'bg-slate-900 text-white'
                      : 'bg-teal-50 text-teal-800'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {profilePresence.label}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>

          <div
            className={
              !isNativeApp
                ? 'space-y-5 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0'
                : 'space-y-5'
            }
          >
          {/* Group 1: Komunikasi & Koordinasi */}
          <section className={!isNativeApp ? 'md:col-start-1' : ''}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Komunikasi Tim
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => onOpenChat()}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <MessageSquare className="h-5 w-5" />
                  {unreadChatCount > 0 && (
                    <span
                      aria-label={`${unreadChatCount} pesan belum dibaca`}
                      className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Obrolan</p>
                    {unreadChatCount > 0 && (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                        {unreadChatCount}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>
          </section>

          {/* Group 2: Audit & Rekapitulasi */}
          <section className={!isNativeApp ? 'md:col-start-2 md:row-span-3' : ''}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Audit &amp; Rekapitulasi
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <button
                type="button"
                onClick={onOpenSubItemRecap}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Rekapitulasi Item &amp; Sub-Item</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Akumulasi barang dan hutang penyaluran
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('dtsen')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Klasifikasi DTSEN</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Sebaran Desil 1–10 Kemensos
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('duplikasi')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <CopyCheck className="h-5 w-5" />
                  {activeDuplicateBadgeCount > 0 && (
                    <span
                      aria-label={`${activeDuplicateBadgeCount} duplikasi terdeteksi`}
                      className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Duplikasi NIK / KK</p>
                    {activeDuplicateBadgeCount > 0 && (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                        {activeDuplicateBadgeCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Deteksi NIK atau KK ganda
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('database-kpm')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Database className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Database KPM</p>
                    <span className="text-xs font-bold text-amber-700 tabular-nums">
                      {databaseKpmRecords.length}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Calon KPM standalone berstatus menunggu (berbasis domisili)
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('arsip')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                  <Archive className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Arsip Berkas Ditolak</p>
                    <span className="text-xs font-bold text-rose-700 tabular-nums">
                      {archivedRecords.length}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Daftar berkas KPM standalone berstatus ditolak
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('kelengkapan')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Matriks Kelengkapan Berkas</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Audit NIK, KK, foto lapangan &amp; DTSEN per KPM
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('jadwal')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <CalendarClock className="h-5 w-5" />
                  {urgentSchedulesCount > 0 && (
                    <span
                      aria-label={`${urgentSchedulesCount} jadwal mendesak`}
                      className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Jadwal &amp; Target Proposal</p>
                    {schedules.filter((s) => !s.completed).length > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                          urgentSchedulesCount > 0
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {schedules.filter((s) => !s.completed).length}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {urgentSchedulesCount > 0
                      ? `${urgentSchedulesCount} agenda jatuh tempo / mendekati target`
                      : 'Agenda survey, antar Dinas & penyaluran'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('download')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Download className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Download</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Unduh PDF F4 &amp; ekspor Excel (.xlsx)
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('activity')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <History className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Log Aktivitas Umum</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Rekam pergerakan proposal, KPM &amp; pelaku
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('laporan')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Laporan</p>
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      Coming Soon
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Laporan &amp; rekapitulasi analitik berkala
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>
          </section>

          {/* Group 3: Basis Data Lapangan */}
          <section className={!isNativeApp ? 'md:col-start-1' : ''}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Basis Data Lapangan
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => onChangeSection('pengelola')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Pengelola Lapangan</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Daftar pengelola dan koordinator
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('pekerjaan')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Profesi &amp; Pekerjaan</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Daftar profesi dan sebaran KPM
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('wilayah')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Wilayah</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Kabupaten / Kota, Kecamatan, dan Desa / Kelurahan
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('items')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <PackagePlus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Kelola Item &amp; Sub-Item</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Katalog paket dan sub-item per tahun
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              {onImportCsv && canAdd && (
                <button
                  type="button"
                  onClick={() => setIsImportWizardOpen(true)}
                  className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Impor Data Excel / CSV</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      Pratinjau &amp; cek duplikasi otomatis sebelum impor massal
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}
            </div>
          </section>

          {/* Group 4: Administrasi Sistem & Pengaturan */}
          <section className={!isNativeApp ? 'md:col-start-1' : ''}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Sistem &amp; Pengaturan
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {currentUser.role === 'SuperAdmin' && (
                <button
                  type="button"
                  onClick={() => onChangeSection('superadmin')}
                  className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                    <ShieldAlert className="h-5 w-5" />
                    {(pendingUsersCount > 0 || expiringTrashCount > 0) && (
                      <span
                        aria-label={`${pendingUsersCount + expiringTrashCount} notifikasi Super Admin`}
                        className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Kontrol Super Admin</p>
                      {pendingUsersCount > 0 && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                          {pendingUsersCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {pendingUsersCount > 0
                        ? `${pendingUsersCount} pendaftar menunggu persetujuan`
                        : 'Reset data & kendali penuh admin'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}

              {onCheckAppUpdate && (
                <button
                  type="button"
                  disabled={checkingAppUpdate}
                  onClick={onCheckAppUpdate}
                  className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <RefreshCw
                      className={`h-5 w-5 ${checkingAppUpdate ? 'animate-spin' : ''}`}
                    />
                    {hasAppUpdate && (
                      <span
                        aria-label="Pembaruan aplikasi tersedia"
                        className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {checkingAppUpdate ? 'Memeriksa Pembaruan...' : 'Cek Pembaruan Aplikasi'}
                      </p>
                      {hasAppUpdate && !checkingAppUpdate && (
                        <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Update
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {hasAppUpdate
                        ? `Tersedia versi v${availableUpdateVersion || 'terbaru'} · Ketuk untuk perbarui`
                        : `Versi terpasang v${APP_VERSION} · Unduh rilis terbaru`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onChangeSection('changelog')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <ScrollText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Riwayat Pembaruan</p>
                    <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-inset ring-teal-200 tabular-nums">
                      v{effectiveVersion}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Changelog lengkap dari v1.0.0 hingga v{effectiveVersion}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>
          </section>
          </div>
        </div>

        {onImportCsv && (
          <ExcelImportWizardModal
            isOpen={isImportWizardOpen}
            existingRecords={records}
            existingProposals={proposals}
            onClose={() => setIsImportWizardOpen(false)}
            onConfirmImport={async (csvText, skipDuplicates) => {
              onImportCsv(csvText, 'Wizard Impor', skipDuplicates);
            }}
          />
        )}
      </div>
    );
  }

  // 1B. KONTROL SUPER ADMIN (Khusus SuperAdmin: Reset, Hapus Massal & Akses Manajemen Admin)
  if (activeSection === 'superadmin') {
    const isSuperAdmin = currentUser.role === 'SuperAdmin';

    const resetActionMeta: Record<
      AdminDataActionType,
      {
        title: string;
        subtitle: string;
        confirmMessage: string;
        buttonLabel: string;
        dangerLevel: 'high' | 'medium';
      }
    > = {
      delete_all_kpm: {
        title: 'Hapus Semua KPM',
        subtitle: `Menghapus seluruh calon KPM dan log auditnya (${records.length} tercatat)`,
        confirmMessage:
          'Seluruh data calon KPM beserta riwayat audit KPM dan keluar-masuk proposal akan dihapus permanen. Data master proposal dan katalog item tetap dipertahankan.',
        buttonLabel: 'Hapus Semua KPM',
        dangerLevel: 'medium',
      },
      delete_all_proposal: {
        title: 'Hapus Semua Proposal',
        subtitle: `Menghapus seluruh daftar proposal (${proposals.length} proposal)`,
        confirmMessage:
          'Seluruh daftar proposal dan rekam jejak proposal akan dihapus permanen dari penyimpanan lokal.',
        buttonLabel: 'Hapus Semua Proposal',
        dangerLevel: 'medium',
      },
      delete_all_items: {
        title: 'Hapus Semua Item & Sub-Item',
        subtitle: `Mengosongkan katalog paket bantuan (${items.length} paket)`,
        confirmMessage:
          'Seluruh katalog item dan daftar sub-item di semua tahun anggaran akan dihapus permanen.',
        buttonLabel: 'Hapus Semua Item',
        dangerLevel: 'medium',
      },
      delete_all_data: {
        title: 'Hapus Semua Data',
        subtitle: 'Kosongkan KPM, proposal, pengelola lapangan, & riwayat',
        confirmMessage:
          'Seluruh data KPM, proposal, pengelola lapangan, riwayat proposal, dan log audit KPM akan dihapus. Katalog item serta akun Admin/SuperAdmin tetap aman.',
        buttonLabel: 'Hapus Semua Data',
        dangerLevel: 'high',
      },
      reset_total: {
        title: 'Reset Total',
        subtitle: 'Kosongkan proposal, KPM, item, pengelola, pekerjaan & chat',
        confirmMessage:
          'TINDAKAN EKSTREM: Seluruh data proposal, KPM, item & sub-item, pengelola, daftar pekerjaan, log riwayat, serta seluruh pesan chat langsung akan dihapus bersih. Akun Admin/SuperAdmin tetap aktif.',
        buttonLabel: 'Jalankan Reset Total',
        dangerLevel: 'high',
      },
    };

    const selectedMeta = pendingResetAction ? resetActionMeta[pendingResetAction] : null;

    const handleUnlockSuperAdmin = async (e: FormEvent) => {
      e.preventDefault();
      setSuperAdminPwdError(null);
      if (!superAdminPwdInput) {
        setSuperAdminPwdError('Masukkan kata sandi login SuperAdmin.');
        return;
      }
      if (!onVerifySuperAdminPassword) {
        setSuperAdminPwdError('Verifikasi server belum tersedia.');
        return;
      }
      setVerifyingSuperAdminPwd(true);
      try {
        const res = await onVerifySuperAdminPassword(superAdminPwdInput);
        if (res.ok) {
          setSuperAdminUnlocked(true);
          setSuperAdminPwdInput('');
        } else {
          setSuperAdminPwdError(res.error || 'Kata sandi tidak sesuai.');
        }
      } finally {
        setVerifyingSuperAdminPwd(false);
      }
    };

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Kontrol Super Admin', () => onChangeSection('root'), 'md:max-w-4xl')}

        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-4xl md:px-6 md:pt-6' : ''
          }`}
        >
          {!isSuperAdmin ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-rose-600" />
              <p className="mt-2 text-sm font-bold text-rose-900">Akses Ditolak</p>
              <p className="mt-1 text-xs text-rose-700">
                Halaman Kontrol Super Admin hanya dapat diakses oleh akun berstatus SuperAdmin.
              </p>
            </div>
          ) : !superAdminUnlocked ? (
            <form
              onSubmit={handleUnlockSuperAdmin}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs"
            >
              {pendingUsersCount > 0 && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600" />
                  <span>
                    Ada {pendingUsersCount} pendaftar akun baru menunggu persetujuan di dalam Kelola Akun Admin.
                  </span>
                </div>
              )}

              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-900">
                  Verifikasi Password Super Admin
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Masukkan kata sandi login akun <strong>{currentUser.email}</strong> untuk membuka
                  akses reset sistem &amp; kendali penuh admin.
                </p>
              </div>

              <div>
                <label
                  htmlFor="superadmin-gate-pwd"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password Login SuperAdmin
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="superadmin-gate-pwd"
                    type={showSuperAdminPwd ? 'text' : 'password'}
                    autoFocus
                    value={superAdminPwdInput}
                    onChange={(e) => {
                      setSuperAdminPwdInput(e.target.value);
                      if (superAdminPwdError) setSuperAdminPwdError(null);
                    }}
                    placeholder="Masukkan password login Anda"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-11 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminPwd((prev) => !prev)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                    aria-label={showSuperAdminPwd ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  >
                    {showSuperAdminPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {superAdminPwdError && (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">{superAdminPwdError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={verifyingSuperAdminPwd}
                className="min-h-[46px] w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
              >
                {verifyingSuperAdminPwd ? 'Memverifikasi...' : 'Buka Kontrol Super Admin'}
              </button>
            </form>
          ) : (
            <>
              {/* Manajemen Admin */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-xs font-bold tracking-wide text-slate-900">
                    Manajemen Admin
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUsersOpenedFromSuperAdmin(true);
                      onChangeSection('users');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                      <Users className="h-5 w-5" />
                      {pendingUsersCount > 0 && (
                        <span
                          aria-label={`${pendingUsersCount} akun menunggu persetujuan`}
                          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          Kelola Akun Admin
                        </p>
                        {pendingUsersCount > 0 && (
                          <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
                            {pendingUsersCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {internalUsers.length} akun terdaftar · {pendingUsersCount} menunggu persetujuan
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </div>
              </section>

              {/* Administrasi (khusus SuperAdmin) */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-xs font-bold tracking-wide text-slate-900">
                    Administrasi
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => onChangeSection('administrasi')}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Administrasi
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {formatRupiah(adminStats.totalAmount)} · {adminStats.paidRecords.length} KPM tercatat
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeSection('sampah')}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                      <Trash2 className="h-5 w-5" />
                      {expiringTrashCount > 0 && (
                        <span
                          aria-label={`${expiringTrashCount} item hampir kedaluwarsa`}
                          className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          Tempat Sampah (30 Hari)
                        </p>
                        {trashBin.length > 0 && (
                          <span
                            className={`flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                              expiringTrashCount > 0
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {trashBin.length}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {trashBin.length} item terhapus sementara · Pulihkan atau hapus permanen
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </div>
              </section>

              {/* Pengendalian & Reset Data */}
              <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white">
                <div className="border-b border-rose-100 bg-rose-50/70 px-4 py-3">
                  <h2 className="text-xs font-bold tracking-wide text-rose-900">
                    Pengendalian Data &amp; Reset Sistem
                  </h2>
                  <p className="mt-0.5 text-[11px] text-rose-700">
                    Setiap tindakan di bawah ini menghapus data secara permanen setelah konfirmasi &amp; verifikasi password.
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {(
                    [
                      'delete_all_kpm',
                      'delete_all_proposal',
                      'delete_all_items',
                      'delete_all_data',
                      'reset_total',
                    ] as AdminDataActionType[]
                  ).map((actionKey) => {
                    const meta = resetActionMeta[actionKey];
                    const isExtreme = actionKey === 'reset_total';
                    return (
                      <button
                        key={actionKey}
                        type="button"
                        onClick={() => {
                          setPendingResetAction(actionKey);
                          setResetConfirmStep('confirm');
                          setResetPwdInput('');
                          setResetPwdError(null);
                          setShowResetPwd(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-rose-50/40"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            isExtreme
                              ? 'bg-rose-600 text-white'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isExtreme ? (
                            <RotateCcw className="h-4.5 w-4.5" />
                          ) : (
                            <Trash2 className="h-4.5 w-4.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{meta.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{meta.subtitle}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>

        {/* 2-Step Confirmation + Password Verification Modal for Reset / Bulk Delete */}
        {pendingResetAction && selectedMeta && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => {
              if (!isRunningReset) {
                setPendingResetAction(null);
                setResetConfirmStep('confirm');
                setResetPwdInput('');
                setResetPwdError(null);
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            {resetConfirmStep === 'confirm' ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
              >
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-900">
                      Yakin {selectedMeta.title}?
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {selectedMeta.confirmMessage}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingResetAction(null);
                      setResetConfirmStep('confirm');
                    }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetPwdInput('');
                      setResetPwdError(null);
                      setShowResetPwd(false);
                      setResetConfirmStep('password');
                    }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    Ya, Saya Yakin
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setResetPwdError(null);
                  if (!resetPwdInput) {
                    setResetPwdError('Masukkan kata sandi SuperAdmin untuk melanjutkan.');
                    return;
                  }
                  if (!onVerifySuperAdminPassword) {
                    setResetPwdError('Verifikasi password belum tersedia.');
                    return;
                  }
                  setIsRunningReset(true);
                  try {
                    const check = await onVerifySuperAdminPassword(resetPwdInput);
                    if (!check.ok) {
                      setResetPwdError(check.error || 'Kata sandi salah. Silakan coba lagi.');
                      return;
                    }
                    await onAdminDataAction(pendingResetAction);
                    setPendingResetAction(null);
                    setResetConfirmStep('confirm');
                    setResetPwdInput('');
                    setResetPwdError(null);
                  } finally {
                    setIsRunningReset(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
              >
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-900">
                      Verifikasi Password — {selectedMeta.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Masukkan kata sandi akun SuperAdmin <strong>{currentUser.email}</strong> untuk
                      mengeksekusi penghapusan permanen ini.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="reset-confirm-pwd"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Kata Sandi SuperAdmin
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="reset-confirm-pwd"
                      type={showResetPwd ? 'text' : 'password'}
                      autoFocus
                      value={resetPwdInput}
                      onChange={(e) => {
                        setResetPwdInput(e.target.value);
                        if (resetPwdError) setResetPwdError(null);
                      }}
                      placeholder="Masukkan password Anda"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-11 pl-10 text-sm text-slate-900 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPwd((prev) => !prev)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                      aria-label={showResetPwd ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {resetPwdError && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600">{resetPwdError}</p>
                  )}
                </div>

                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isRunningReset}
                    onClick={() => {
                      setResetConfirmStep('confirm');
                      setResetPwdInput('');
                      setResetPwdError(null);
                    }}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    disabled={isRunningReset}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {isRunningReset ? 'Memproses...' : selectedMeta.buttonLabel}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // 2. MANAJEMEN USER & AKSES (Kontrol SuperAdmin -> Admin)
  if (activeSection === 'users') {
    const isSuperAdmin = currentUser.role === 'SuperAdmin';
    const visibleUsers = isSuperAdmin
      ? internalUsers
      : internalUsers.filter((u) => u.status !== 'pending');
    const filteredUsers = visibleUsers.filter((u) =>
      userStatusFilter === 'all' ? true : u.status === userStatusFilter
    );

    const pendingVisibleCount = visibleUsers.filter((u) => u.status === 'pending').length;
    const userTabs: Array<{
      key: 'all' | InternalUserStatus;
      label: string;
      count: number;
      dot?: boolean;
    }> = [
      { key: 'all', label: 'Semua', count: visibleUsers.length },
      ...(isSuperAdmin
        ? [
            {
              key: 'pending' as const,
              label: 'Menunggu',
              count: pendingVisibleCount,
              dot: pendingVisibleCount > 0,
            },
          ]
        : []),
      {
        key: 'active',
        label: 'Aktif',
        count: visibleUsers.filter((u) => u.status === 'active').length,
      },
      {
        key: 'rejected',
        label: 'Nonaktif',
        count: visibleUsers.filter((u) => u.status === 'rejected').length,
      },
    ];

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Manajemen User & Akses', () => {
          if (usersOpenedFromSuperAdmin) {
            setUsersOpenedFromSuperAdmin(false);
            onChangeSection('superadmin');
          } else {
            onChangeSection('root');
          }
        })}

        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-teal-800">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-xs font-bold">
                    {isSuperAdmin ? 'Kendali Penuh SuperAdmin' : 'Daftar Tim Operasional'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {isSuperAdmin
                    ? 'Atur persetujuan akun, peran, serta izin ADD, UPDATE, dan DELETE Admin.'
                    : 'Hanya SuperAdmin yang dapat mengubah hak akses dan persetujuan Admin.'}
                </p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Tambah User</span>
                </button>
              )}
            </div>

            <SegmentedTabs<'all' | InternalUserStatus>
              className="mt-3"
              value={userStatusFilter === 'pending' && !isSuperAdmin ? 'all' : userStatusFilter}
              onChange={setUserStatusFilter}
              tabs={userTabs}
            />
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Tidak ada akun pada kategori ini</p>
            </div>
          ) : (
            <div
              className={`space-y-3 ${
                !isNativeApp ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' : ''
              }`}
            >
              {filteredUsers.map((user) => {
                const isSelf = user.id === currentUser.id;
                const pMeta = getPresenceMeta(user.presenceStatus);
                const perms = user.permissions || { add: true, update: true, delete: false };
                const userDisplayName = getUserDisplayName(user);
                const hasCustomAlias = userDisplayName !== user.nama;

                return (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                          {user.fotoDataUrl ? (
                            <DriveImage
                              src={user.fotoDataUrl}
                              thumbnailUrl={user.fotoThumbnailUrl}
                              alt={userDisplayName}
                              className="h-full w-full rounded-xl object-cover"
                            />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                          <PresenceDot
                            status={user.presenceStatus}
                            size="sm"
                            className="absolute -right-0.5 -bottom-0.5"
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {userDisplayName}
                            </p>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                user.role === 'SuperAdmin'
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-teal-50 text-teal-800'
                              }`}
                            >
                              {user.role}
                            </span>
                          </div>
                          {hasCustomAlias && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-teal-700">
                              Nama asli: {user.nama}
                            </p>
                          )}
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {user.username ? `@${user.username} · ` : ''}
                            {user.email}
                          </p>
                          <p className={`mt-0.5 text-[11px] font-medium ${pMeta.textClass}`}>
                            {pMeta.label} · {user.jabatan}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={`text-xs font-bold ${
                            user.status === 'active'
                              ? 'text-teal-700'
                              : user.status === 'pending'
                                ? 'text-amber-700'
                                : 'text-rose-600'
                          }`}
                        >
                          {user.status === 'active'
                            ? 'Aktif'
                            : user.status === 'pending'
                              ? 'Menunggu'
                              : 'Nonaktif'}
                        </span>
                        <div className="flex items-center gap-1">
                          {!isSelf && onSaveUserAlias && (
                            <button
                              type="button"
                              onClick={() => {
                                setPersonalRenameTarget(user);
                                setPersonalRenameDraft((userAliases[user.id] || '').trim());
                              }}
                              title="Ubah nama panggilan pribadi"
                              aria-label={`Ubah nama pribadi ${userDisplayName}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Nama</span>
                            </button>
                          )}
                          {!isSelf && user.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => onOpenChat(user.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>Chat</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SuperAdmin Permission Presets, Toggles (ADD / UPDATE / DELETE) & CRUD */}
                    {isSuperAdmin && !isSelf && (
                      <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
                        {/* Quick Role/Permission Presets */}
                        {user.role !== 'SuperAdmin' && (
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Preset Izin Cepat
                            </p>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                {
                                  label: 'View Only',
                                  active: user.role === 'Viewer',
                                  patch: {
                                    role: 'Viewer' as InternalUserRole,
                                    permissions: { add: false, update: false, delete: false },
                                  },
                                },
                                {
                                  label: 'Add Only',
                                  active:
                                    user.role === 'Admin' &&
                                    perms.add &&
                                    !perms.update &&
                                    !perms.delete,
                                  patch: {
                                    role: 'Admin' as InternalUserRole,
                                    permissions: { add: true, update: false, delete: false },
                                  },
                                },
                                {
                                  label: 'Tanpa Hapus',
                                  active:
                                    user.role === 'Admin' &&
                                    perms.add &&
                                    perms.update &&
                                    !perms.delete,
                                  patch: {
                                    role: 'Admin' as InternalUserRole,
                                    permissions: { add: true, update: true, delete: false },
                                  },
                                },
                                {
                                  label: 'Penuh',
                                  active:
                                    user.role === 'Admin' &&
                                    perms.add &&
                                    perms.update &&
                                    perms.delete,
                                  patch: {
                                    role: 'Admin' as InternalUserRole,
                                    permissions: { add: true, update: true, delete: true },
                                  },
                                },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => onAdminControlUser(user.id, preset.patch)}
                                  className={`min-h-[32px] rounded-lg border px-1.5 text-[10px] font-semibold transition-colors ${
                                    preset.active
                                      ? 'border-teal-700 bg-teal-700 text-white'
                                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { key: 'add', label: 'ADD' },
                              { key: 'update', label: 'UPDATE' },
                              { key: 'delete', label: 'DELETE' },
                            ] as const
                          ).map((item) => {
                            const checked =
                              user.role === 'SuperAdmin'
                                ? true
                                : user.role === 'Viewer'
                                  ? false
                                  : perms[item.key];
                            const toggleDisabled = user.role === 'SuperAdmin';
                            return (
                              <button
                                key={item.key}
                                type="button"
                                disabled={toggleDisabled}
                                onClick={() => {
                                  const nextPerms: UserPermissions =
                                    user.role === 'Viewer'
                                      ? {
                                          add: false,
                                          update: false,
                                          delete: false,
                                          [item.key]: true,
                                        }
                                      : {
                                          ...perms,
                                          [item.key]: !perms[item.key],
                                        };
                                  onAdminControlUser(user.id, {
                                    role: user.role === 'Viewer' ? 'Admin' : user.role,
                                    permissions: nextPerms,
                                  });
                                }}
                                className={`flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11px] font-bold transition-colors ${
                                  checked
                                    ? 'border-teal-200 bg-teal-50 text-teal-900'
                                    : 'border-slate-200 bg-slate-50 text-slate-400'
                                } disabled:opacity-60`}
                              >
                                <span>{item.label}</span>
                                <span
                                  className={`inline-block h-3.5 w-6 rounded-full p-0.5 transition-colors ${
                                    checked ? 'bg-teal-700' : 'bg-slate-300'
                                  }`}
                                >
                                  <span
                                    className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${
                                      checked ? 'translate-x-2.5' : 'translate-x-0'
                                    }`}
                                  />
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <select
                            aria-label={`Jabatan / Peran untuk ${user.nama}`}
                            value={user.role}
                            onChange={(e) =>
                              onAdminControlUser(user.id, {
                                role: e.target.value as InternalUserRole,
                              })
                            }
                            className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                          >
                            <option value="SuperAdmin">SuperAdmin</option>
                            <option value="Admin">Admin</option>
                            <option value="Viewer">Viewer</option>
                          </select>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserTarget(user);
                                setEditUserNama(user.nama);
                                setEditUserJabatan(user.jabatan);
                                setEditUserKontak(user.kontak || '');
                                setEditUserNewPassword('');
                                setShowEditUserPassword(false);
                              }}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              aria-label={`Edit ${user.nama}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            {user.status !== 'active' && (
                              <button
                                type="button"
                                onClick={() => onAdminControlUser(user.id, { status: 'active' })}
                                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Setujui</span>
                              </button>
                            )}
                            {user.status !== 'rejected' && (
                              <button
                                type="button"
                                onClick={() => onAdminControlUser(user.id, { status: 'rejected' })}
                                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>{user.status === 'active' ? 'Nonaktif' : 'Tolak'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPendingDeleteUser(user)}
                              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              aria-label={`Hapus akun ${user.nama}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Internal User Modal (SuperAdmin) */}
        {isRegisterModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setIsRegisterModalOpen(false)}
          >
            <form
              onSubmit={handleRegisterUserSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Tambah Akun Internal Baru
                </h2>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Akun yang ditambahkan oleh SuperAdmin langsung berstatus <strong>Aktif</strong>.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  required
                  value={regNama}
                  onChange={(e) => setRegNama(e.target.value)}
                  placeholder="Nama lengkap *"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <div>
                  <input
                    type="text"
                    minLength={3}
                    maxLength={30}
                    autoCapitalize="none"
                    spellCheck={false}
                    value={regUsername}
                    onChange={(e) =>
                      setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
                    }
                    placeholder="Username (opsional, permanen)"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Bila diisi, username hanya ditetapkan sekali dan tidak dapat diubah.
                  </p>
                </div>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="Email internal *"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="text"
                  value={regJabatan}
                  onChange={(e) => setRegJabatan(e.target.value)}
                  placeholder="Jabatan / Wilayah tugas"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="tel"
                    value={regKontak}
                    onChange={(e) => setRegKontak(e.target.value)}
                    placeholder="No. HP / WhatsApp"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as InternalUserRole)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="SuperAdmin">SuperAdmin</option>
                    <option value="Admin">Admin</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Kata Sandi Awal (Opsional)
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Kosongkan untuk default: masdeta123"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 pr-10 pl-3.5 text-sm focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((p) => !p)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                      aria-label={showRegPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showRegPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {regError && (
                  <p className="text-xs font-medium text-rose-600">{regError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={regSubmitting}
                className="mt-4 min-h-[46px] w-full rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {regSubmitting ? 'Menyimpan...' : 'Simpan & Aktifkan Akun'}
              </button>
            </form>
          </div>
        )}

        {/* Edit User Info Modal (SuperAdmin) */}
        {editingUserTarget && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setEditingUserTarget(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editUserNama.trim()) return;
                if (editUserNewPassword.trim() && editUserNewPassword.trim().length < 6) return;
                onAdminControlUser(editingUserTarget.id, {
                  nama: capitalizeWords(editUserNama.trim()),
                  jabatan: editUserJabatan.trim() || editingUserTarget.role,
                  kontak: editUserKontak.trim(),
                  ...(editUserNewPassword.trim()
                    ? { newPassword: editUserNewPassword.trim() }
                    : {}),
                });
                setEditUserNewPassword('');
                setEditingUserTarget(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">Edit Data Akun</h2>
                <button
                  type="button"
                  onClick={() => setEditingUserTarget(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={editUserNama}
                    onChange={(e) => setEditUserNama(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Jabatan / Wilayah Tugas</label>
                  <input
                    type="text"
                    value={editUserJabatan}
                    onChange={(e) => setEditUserJabatan(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">No. HP / WhatsApp</label>
                  <input
                    type="tel"
                    value={editUserKontak}
                    onChange={(e) => setEditUserKontak(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Reset Kata Sandi Baru (Opsional)
                  </label>
                  <div className="relative">
                    <input
                      type={showEditUserPassword ? 'text' : 'password'}
                      minLength={6}
                      value={editUserNewPassword}
                      onChange={(e) => setEditUserNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter (kosongkan jika tetap)"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 pr-10 pl-3.5 text-sm focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditUserPassword((p) => !p)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                      aria-label={showEditUserPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showEditUserPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingUserTarget(null)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Delete Internal User Confirm Modal (SuperAdmin) */}
        {pendingDeleteUser && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setPendingDeleteUser(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900">Hapus Akun Pengguna?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Akun <strong>{pendingDeleteUser.nama}</strong> ({pendingDeleteUser.email}) akan dihapus permanen dari sistem.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPendingDeleteUser(null)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const targetId = pendingDeleteUser.id;
                    setPendingDeleteUser(null);
                    await onDeleteInternalUser(targetId);
                  }}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Ya, Hapus Akun
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Personal Rename Modal (Private Nickname Only) */}
        {personalRenameTarget && onSaveUserAlias && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setPersonalRenameTarget(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Ubah nama tampilan pribadi"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSaveUserAlias(personalRenameTarget.id, personalRenameDraft.trim());
                setPersonalRenameTarget(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Ubah Nama Pribadi</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Hanya tampil untuk akun Anda. Nama asli akun{' '}
                    <strong className="text-slate-700">{personalRenameTarget.nama}</strong> tidak berubah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPersonalRenameTarget(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Nama Panggilan / Tampilan Pribadi
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={personalRenameDraft}
                    onChange={(e) => setPersonalRenameDraft(e.target.value)}
                    placeholder={`Contoh: ${personalRenameTarget.nama} (Tim Survey)`}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>

                {(userAliases[personalRenameTarget.id] || '').trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveUserAlias(personalRenameTarget.id, '');
                      setPersonalRenameTarget(null);
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Kembalikan ke nama asli ({personalRenameTarget.nama})
                  </button>
                )}
              </div>

              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPersonalRenameTarget(null)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan Nama
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // 3A. KELOLA ITEM & SUB-ITEM
  if (activeSection === 'items') {
    return (
      <ItemManagerView
        items={items}
        records={records}
        canAdd={canAdd}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onBack={() => onChangeSection('root')}
        onSaveItem={onSaveItem}
        onDeleteItem={onDeleteItem}
        onMoveItemOrder={onMoveItemOrder}
        onUpdateItemSubItems={onUpdateItemSubItems}
        onCopyItemsFromYear={onCopyItemsFromYear}
      />
    );
  }

  // 3B. WILAYAH
  if (activeSection === 'wilayah') {
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Wilayah', () => onChangeSection('root'), 'md:max-w-5xl')}
          <div
            className={`space-y-4 px-4 pt-4 ${
              !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
            }`}
          >
            {canAdd && (
              <form
                onSubmit={handleAddKabKotaSubmit}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Tambah Kabupaten / Kota</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Tambahkan wilayah ekspansi baru beserta daftar kecamatan dan desa/kelurahan di dalamnya.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoCapitalize="words"
                    value={newKabKotaInput}
                    onChange={(e) => {
                      setNewKabKotaInput(capitalizeWords(e.target.value));
                      if (wilayahError) setWilayahError(null);
                    }}
                    placeholder="Contoh: Kabupaten Kubu Raya"
                    className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah</span>
                  </button>
                </div>
                {wilayahError && <p className="text-xs text-rose-600">{wilayahError}</p>}
              </form>
            )}

            <div className="space-y-3">
              {wilayahList.map((kab) => {
                const isKabExpanded = expandedKabId === kab.id;
                const totalVillages = kab.kecamatanList.reduce(
                  (sum, k) => sum + k.kelurahanList.length,
                  0
                );

                return (
                  <div
                    key={kab.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center justify-between gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedKabId(isKabExpanded ? null : kab.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{kab.nama}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {kab.kecamatanList.length} Kecamatan · {totalVillages} Kelurahan / Desa
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                            isKabExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDeleteWilayah({
                              kind: 'kab',
                              kabId: kab.id,
                              label: kab.nama,
                            })
                          }
                          aria-label={`Hapus wilayah ${kab.nama}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {isKabExpanded && (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                        {(canAdd || canUpdate) && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              autoCapitalize="words"
                              value={newKecamatanByKab[kab.id] || ''}
                              onChange={(e) =>
                                setNewKecamatanByKab((prev) => ({
                                  ...prev,
                                  [kab.id]: capitalizeWords(e.target.value),
                                }))
                              }
                              placeholder={`Tambah kecamatan di ${kab.nama}...`}
                              className="min-h-[40px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-teal-700 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddKecamatan(kab.id)}
                              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Kecamatan</span>
                            </button>
                          </div>
                        )}

                        {kab.kecamatanList.length === 0 ? (
                          <p className="py-3 text-center text-xs text-slate-500">
                            Belum ada kecamatan di {kab.nama}. Tambahkan di atas.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {kab.kecamatanList.map((kec) => {
                              const isKecExpanded = expandedKecId === kec.id;
                              return (
                                <div
                                  key={kec.id}
                                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedKecId(isKecExpanded ? null : kec.id)
                                      }
                                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-medium text-slate-900">
                                          {kec.nama.toLowerCase().startsWith('kecamatan ')
                                            ? kec.nama
                                            : `Kecamatan ${kec.nama}`}
                                        </p>
                                        <p className="text-[11px] text-slate-500 tabular-nums">
                                          {kec.kelurahanList.length} Kelurahan / Desa
                                        </p>
                                      </div>
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                                          isKecExpanded ? 'rotate-180' : ''
                                        }`}
                                      />
                                    </button>

                                    {canDelete && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingDeleteWilayah({
                                            kind: 'kec',
                                            kabId: kab.id,
                                            kecId: kec.id,
                                            label: `${kec.nama} (${kab.nama})`,
                                          })
                                        }
                                        aria-label={`Hapus kecamatan ${kec.nama}`}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {isKecExpanded && (
                                    <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
                                      {(canAdd || canUpdate) && (
                                        <div className="flex gap-2">
                                          <input
                                            type="text"
                                            autoCapitalize="words"
                                            value={newKelurahanByKec[kec.id] || ''}
                                            onChange={(e) =>
                                              setNewKelurahanByKec((prev) => ({
                                                ...prev,
                                                [kec.id]: capitalizeWords(e.target.value),
                                              }))
                                            }
                                            placeholder="Contoh: Desa Kapur / Kelurahan Mariana"
                                            className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs focus:border-teal-700 focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleAddKelurahan(kab.id, kec.id)}
                                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                            <span>Tambah</span>
                                          </button>
                                        </div>
                                      )}

                                      {kec.kelurahanList.length === 0 ? (
                                        <p className="text-[11px] text-slate-400">
                                          Belum ada kelurahan / desa terdaftar.
                                        </p>
                                      ) : (
                                        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          {kec.kelurahanList.map((kel) => (
                                            <div
                                              key={kel}
                                              className="flex items-center justify-between gap-2 px-2.5 py-2"
                                            >
                                              <span className="truncate text-xs font-medium text-slate-800">
                                                {kel}
                                              </span>
                                              {canDelete && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setPendingDeleteWilayah({
                                                      kind: 'kel',
                                                      kabId: kab.id,
                                                      kecId: kec.id,
                                                      kelName: kel,
                                                      label: kel,
                                                    })
                                                  }
                                                  aria-label={`Hapus ${kel}`}
                                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {pendingDeleteWilayah && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-[1px] sm:items-center">
              <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Hapus Data Wilayah?</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Wilayah <strong>{pendingDeleteWilayah.label}</strong> akan dihapus dari
                      daftar master wilayah.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteWilayah(null)}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingDeleteWilayah.kind === 'kab') {
                        handleDeleteKabKota(pendingDeleteWilayah.kabId);
                      } else if (pendingDeleteWilayah.kind === 'kec') {
                        handleDeleteKecamatan(
                          pendingDeleteWilayah.kabId,
                          pendingDeleteWilayah.kecId
                        );
                      } else {
                        handleDeleteKelurahan(
                          pendingDeleteWilayah.kabId,
                          pendingDeleteWilayah.kecId,
                          pendingDeleteWilayah.kelName
                        );
                      }
                      setPendingDeleteWilayah(null);
                    }}
                    className="min-h-[42px] flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    Ya, Hapus
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
    );
  }

  // 4. DUPLIKASI NIK / KK
  if (activeSection === 'duplikasi') {
    const ktpDupCount = duplicateGroups.filter((g) => g.type === 'NIK KTP').length;
    const kkDupCount = duplicateGroups.filter((g) => g.type === 'Nomor KK').length;
    const dupYearOptions = Array.from(
      new Set([
        ...records.map((r) => (r.tahun || '').trim()).filter(Boolean),
        ...proposals.map((p) => (p.tahun || '').trim()).filter(Boolean),
      ])
    ).sort((a, b) => b.localeCompare(a));

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Duplikasi NIK / KK', () => onChangeSection('root'), 'md:max-w-5xl')}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  duplicateGroups.length > 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-teal-50 text-teal-700'
                }`}
              >
                <CopyCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  {duplikasiYearFilter === 'all'
                    ? 'Total Duplikasi Terdeteksi (Semua Tahun)'
                    : `Duplikasi Terkait Tahun ${duplikasiYearFilter}`}
                </p>
                <p className="text-lg font-bold text-slate-900 tabular-nums">
                  {duplicateGroups.length} Duplikat
                </p>
                {duplicateGroups.length > 0 && (
                  <p className="text-[11px] font-semibold text-slate-500 tabular-nums">
                    {ktpDupCount} NIK KTP · {kkDupCount} Nomor KK
                  </p>
                )}
              </div>
            </div>
            <FilterSelect
              ariaLabel="Filter tahun duplikasi"
              value={duplikasiYearFilter}
              onChange={setDuplikasiYearFilter}
              className="w-[96px] shrink-0"
            >
              <option value="all">Semua</option>
              {dupYearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </FilterSelect>
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-bold text-slate-900">Data Bersih dari Duplikasi</p>
              <p className="mt-1 text-xs text-slate-500">
                {duplikasiYearFilter === 'all'
                  ? 'Tidak ditemukan NIK KTP atau Nomor KK yang sama di seluruh data calon KPM.'
                  : `Tidak ditemukan NIK KTP atau Nomor KK ganda yang melibatkan data tahun ${duplikasiYearFilter}.`}
              </p>
            </div>
          ) : (
            duplicateGroups.map((group) => (
              <div
                key={`${group.type}-${group.value}`}
                className="overflow-hidden rounded-2xl border border-rose-200 bg-white"
              >
                <div className="flex items-center justify-between gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                    <p className="truncate text-xs font-bold text-rose-900 tabular-nums">
                      {group.type}: {formatNikDisplay(group.value)} ({group.records.length} data)
                    </p>
                  </div>
                  {group.years.length > 0 && (
                    <span className="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 tabular-nums">
                      {group.years.join(' · ')}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {group.records.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => onSelectKpmFromDuplicate(rec)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{rec.nama}</p>
                        <p className="truncate text-xs text-slate-500">
                          {rec.tahun} · {rec.proposal} · {rec.item}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 4A. DATABASE KPM STANDALONE (Status Menunggu, Tanpa Proposal)
  if (activeSection === 'database-kpm') {
    return (
      <StandaloneKpmView
        mode="database"
        records={databaseKpmRecords}
        proposals={proposals}
        items={items}
        pengelolaList={pengelolaList}
        wilayahList={wilayahList}
        canAdd={canAdd}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onBack={() => onChangeSection('root')}
        onSelectKpm={(rec) => onSelectKpm?.(rec)}
        onCreateNewStandalone={onOpenCreateStandaloneDatabaseKpm}
        onBulkAssignToProposal={onBulkAssignToProposal}
        onBulkRejectToArsip={onBulkRejectToArsip}
        onBulkPermanentDelete={onBulkPermanentDeleteKpms}
      />
    );
  }

  // 4B. ARSIP BERKAS DITOLAK STANDALONE (Status Ditolak, Tanpa Proposal)
  if (activeSection === 'arsip') {
    return (
      <StandaloneKpmView
        mode="arsip"
        records={archivedRecords}
        proposals={proposals}
        items={items}
        pengelolaList={pengelolaList}
        wilayahList={wilayahList}
        canAdd={false}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onBack={() => onChangeSection('root')}
        onSelectKpm={(rec) => onSelectKpm?.(rec)}
        onBulkRecoverToDatabase={onBulkRecoverToDatabase}
        onBulkPermanentDelete={onBulkPermanentDeleteKpms}
      />
    );
  }

  // 5. ADMINISTRASI (Khusus SuperAdmin)
  if (activeSection === 'administrasi') {
    const isSuperAdmin = currentUser.role === 'SuperAdmin';
    const paidBase = adminStats.paidRecords;
    const adminYearOptions = Array.from(
      new Set(paidBase.map((r) => r.tahun).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));

    const adminProposalOptions = Array.from(
      new Set(
        paidBase
          .filter((r) => adminYearFilter === 'all' || r.tahun === adminYearFilter)
          .map((r) => r.proposal)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'id'));

    const activeAdminFilterCount =
      (adminYearFilter !== 'all' ? 1 : 0) +
      (adminProposalFilter !== 'all' ? 1 : 0) +
      (adminSortBy !== 'absen' ? 1 : 0);

    const qAdmin = adminQuery.trim().toLowerCase();
    const filteredAdminRecords = paidBase
      .filter((rec) => {
        if (adminYearFilter !== 'all' && rec.tahun !== adminYearFilter) return false;
        if (adminProposalFilter !== 'all' && rec.proposal !== adminProposalFilter) return false;
        if (!qAdmin) return true;
        return (
          rec.nama.toLowerCase().includes(qAdmin) ||
          rec.registerCode.toLowerCase().includes(qAdmin) ||
          rec.proposal.toLowerCase().includes(qAdmin) ||
          (rec.kelurahan || '').toLowerCase().includes(qAdmin) ||
          (rec.kecamatan || '').toLowerCase().includes(qAdmin) ||
          rec.nikKtp.includes(qAdmin)
        );
      })
      .sort((a, b) => {
        switch (adminSortBy) {
          case 'amount_desc':
            return (b.payment || 0) - (a.payment || 0) || a.nama.localeCompare(b.nama, 'id');
          case 'amount_asc':
            return (a.payment || 0) - (b.payment || 0) || a.nama.localeCompare(b.nama, 'id');
          case 'name_asc':
            return a.nama.localeCompare(b.nama, 'id');
          case 'absen':
          default:
            return (
              b.tahun.localeCompare(a.tahun, 'id') ||
              a.proposal.localeCompare(b.proposal, 'id') ||
              getAbsenSeq(a.registerCode) - getAbsenSeq(b.registerCode) ||
              a.nama.localeCompare(b.nama, 'id')
            );
        }
      });

    const filteredAdminTotal = filteredAdminRecords.reduce(
      (sum, r) => sum + (r.payment || 0),
      0
    );

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader(
          'Administrasi',
          () => onChangeSection(isSuperAdmin ? 'superadmin' : 'root'),
          'md:max-w-5xl'
        )}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
          }`}
        >
          {!isSuperAdmin ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-rose-600" />
              <p className="mt-2 text-sm font-bold text-rose-900">Akses Ditolak</p>
              <p className="mt-1 text-xs text-rose-700">
                Halaman Administrasi hanya dapat diakses melalui Kontrol Super Admin.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-slate-900 p-5 text-white">
                <p className="text-xs text-slate-300">Total Biaya Administrasi Tercatat</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatRupiah(filteredAdminTotal)}
                </p>
                <p className="mt-1 text-xs text-slate-300 tabular-nums">
                  Dari {filteredAdminRecords.length} penerima dengan nominal biaya administrasi
                </p>
              </div>

              {/* Search Bar + Filter Button */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={adminQuery}
                      onChange={(e) => setAdminQuery(e.target.value)}
                      placeholder="Pencarian..."
                      className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdminFilters((prev) => !prev)}
                    aria-label="Filter dan urutkan administrasi"
                    aria-expanded={showAdminFilters}
                    className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      showAdminFilters || activeAdminFilterCount > 0
                        ? 'border-teal-700 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeAdminFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white tabular-nums">
                        {activeAdminFilterCount}
                      </span>
                    )}
                  </button>
                </div>

                {showAdminFilters && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <FilterSelect
                        ariaLabel="Filter tahun administrasi"
                        value={adminYearFilter}
                        onChange={(yr) => {
                          setAdminYearFilter(yr);
                          setAdminProposalFilter('all');
                        }}
                      >
                        <option value="all">Semua Tahun</option>
                        {adminYearOptions.map((y) => (
                          <option key={y} value={y}>
                            Tahun {y}
                          </option>
                        ))}
                      </FilterSelect>

                      <FilterSelect
                        ariaLabel="Urutkan daftar administrasi"
                        value={adminSortBy}
                        onChange={(v) =>
                          setAdminSortBy(v as 'absen' | 'amount_desc' | 'amount_asc' | 'name_asc')
                        }
                      >
                        <option value="absen">Urut: Proposal &amp; Absen</option>
                        <option value="amount_desc">Urut: Nominal Terbesar</option>
                        <option value="amount_asc">Urut: Nominal Terkecil</option>
                        <option value="name_asc">Urut: Nama (A–Z)</option>
                      </FilterSelect>
                    </div>

                    {adminProposalOptions.length > 0 && (
                      <div className="border-t border-slate-100 pt-2.5">
                        <FilterSelect
                          ariaLabel="Filter proposal administrasi"
                          value={adminProposalFilter}
                          onChange={setAdminProposalFilter}
                        >
                          <option value="all">Semua Proposal</option>
                          {adminProposalOptions.map((prop) => (
                            <option key={prop} value={prop}>
                              {prop}
                            </option>
                          ))}
                        </FilterSelect>
                      </div>
                    )}

                    {activeAdminFilterCount > 0 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminYearFilter('all');
                            setAdminProposalFilter('all');
                            setAdminSortBy('absen');
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Reset Filter</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                {filteredAdminRecords.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">
                    {paidBase.length === 0
                      ? 'Belum ada catatan biaya administrasi.'
                      : 'Tidak ada data administrasi yang sesuai pencarian atau filter.'}
                  </p>
                ) : (
                  filteredAdminRecords.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => onSelectKpm?.(rec)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{rec.nama}</p>
                        <p className="truncate text-xs text-slate-500">
                          {rec.registerCode} · {rec.proposal}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium text-teal-700 tabular-nums">
                          {formatRupiah(rec.payment)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 6. SEBARAN DTSEN
  if (activeSection === 'dtsen') {
    const getDtsenDisplayLabel = (val: string) =>
      val === 'Data Tidak Ditemukan' || val === 'Belum Ada Desil'
        ? val
        : `Desil ${val}`;

    if (dtsenDrill) {
      const drillLabel = getDtsenDisplayLabel(dtsenDrill);
      const drillRecords = records.filter(
        (r) => (r.dtsen || 'Belum Ada Desil') === dtsenDrill
      );

      return (
        <div className="min-h-screen pb-24">
          {renderSubHeader(drillLabel, () => setDtsenDrill(null))}
          <div
            className={`px-4 pt-4 ${
              !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
            }`}
          >
            <CorrespondentKpmListPanel
              key={dtsenDrill}
              records={drillRecords}
              items={items}
              proposals={proposals}
              wilayahList={wilayahList}
              emptyTitle={`Belum ada KPM di kategori ${drillLabel}`}
              emptySubtitle={`Tidak ada data calon KPM dengan status klasifikasi ${drillLabel}.`}
              onSelectRecord={onSelectKpm}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Klasifikasi DTSEN', () => onChangeSection('root'), 'md:max-w-5xl')}
        <div
          className={`px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {dtsenSummary.map((row) => {
              const dotClass = ['1', '2', '3', '4'].includes(row.value)
                ? 'bg-teal-700'
                : row.value === '5'
                  ? 'bg-amber-500'
                  : ['6', '7', '8', '9', '10', '6 - 10'].includes(row.value)
                    ? 'bg-rose-600'
                    : row.value === 'Data Tidak Ditemukan'
                      ? 'bg-slate-950'
                      : 'bg-slate-400';
              const rowTitle = getDtsenDisplayLabel(row.value);
              return (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => setDtsenDrill(row.value)}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                    <span className="truncate text-xs font-medium text-slate-800">
                      {rowTitle}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                      {row.count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 7. PENGELOLA
  if (activeSection === 'pengelola') {
    if (activePengelolaDrill) {
      const targetKey = activePengelolaDrill.trim().toLowerCase();
      const matchedPengelola = pengelolaList.find(
        (p) => p.displayName.trim().toLowerCase() === targetKey
      );
      const pengelolaTitle = matchedPengelola?.displayName || activePengelolaDrill;
      const correspondentRecords = records.filter(
        (r) => (r.pengelola || '').trim().toLowerCase() === targetKey
      );
      const domicileText = matchedPengelola
        ? [
            matchedPengelola.kelurahan
              ? matchedPengelola.kelurahan.replace(/^kel\.?\s+/i, 'Kelurahan ')
              : '',
            matchedPengelola.kecamatan
              ? matchedPengelola.kecamatan.toLowerCase().startsWith('kecamatan ')
                ? matchedPengelola.kecamatan
                : `Kecamatan ${matchedPengelola.kecamatan.replace(/^kec\.?\s+/i, '')}`
              : '',
            matchedPengelola.kabKota || '',
          ]
            .filter(Boolean)
            .join(' · ')
        : '';
      const waUrl = matchedPengelola ? formatWhatsAppUrl(matchedPengelola.kontak) : null;

      return (
        <div className="min-h-screen pb-24">
          {renderSubHeader(pengelolaTitle, () => setPengelolaDrill(null))}
          <div
            className={`px-4 pt-4 ${
              !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
            }`}
          >
            <CorrespondentKpmListPanel
              key={pengelolaTitle}
              records={correspondentRecords}
              items={items}
              proposals={proposals}
              wilayahList={wilayahList}
              emptyTitle="Belum ada KPM untuk pengelola ini"
              emptySubtitle={`Pengelola ${pengelolaTitle} belum memiliki data calon KPM yang terdaftar.`}
              onSelectRecord={onSelectKpm}
              headerCard={
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {matchedPengelola?.foto ? (
                      <button
                        type="button"
                        onClick={() => onPreviewDocument(matchedPengelola.foto!, pengelolaTitle)}
                        className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                        aria-label={`Lihat foto ${pengelolaTitle}`}
                      >
                        <DriveImage
                          doc={matchedPengelola.foto}
                          alt={pengelolaTitle}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{pengelolaTitle}</p>
                      {domicileText && (
                        <p className="truncate text-xs text-slate-500">{domicileText}</p>
                      )}
                      {waUrl && matchedPengelola?.kontak && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          <MessageCircle className="h-3 w-3 shrink-0" />
                          <span>{matchedPengelola.kontak}</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 tabular-nums">
                    {correspondentRecords.length} KPM
                  </span>
                </div>
              }
            />
          </div>
        </div>
      );
    }

    const pengelolaKpmCounts = new Map<string, number>();
    for (const r of records) {
      const key = (r.pengelola || '').trim().toLowerCase();
      if (key) {
        pengelolaKpmCounts.set(key, (pengelolaKpmCounts.get(key) ?? 0) + 1);
      }
    }

    const getPengelolaWilayahLabel = (p: PengelolaProfile) =>
      [
        p.kelurahan ? p.kelurahan.replace(/^kel\.?\s+/i, 'Kelurahan ') : '',
        p.kecamatan
          ? p.kecamatan.toLowerCase().startsWith('kecamatan ')
            ? p.kecamatan
            : `Kecamatan ${p.kecamatan.replace(/^kec\.?\s+/i, '')}`
          : '',
        p.kabKota || '',
      ]
        .filter(Boolean)
        .join(' · ');

    const pengelolaWilayahOptions = Array.from(
      new Set(
        pengelolaList
          .map((p) => (p.kecamatan || p.kabKota || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'id'));

    const activePengelolaFilterCount =
      (pengelolaWilayahFilter !== 'all' ? 1 : 0) +
      (pengelolaKpmFilter !== 'all' ? 1 : 0) +
      (pengelolaSortBy !== 'name_asc' ? 1 : 0);

    const qPengelola = pengelolaQuery.trim().toLowerCase();
    const filteredPengelolaList = pengelolaList
      .filter((p) => {
        const count = pengelolaKpmCounts.get(p.displayName.trim().toLowerCase()) ?? 0;
        const wilayahKey = (p.kecamatan || p.kabKota || '').trim();
        if (pengelolaWilayahFilter !== 'all' && wilayahKey !== pengelolaWilayahFilter) {
          return false;
        }
        if (pengelolaKpmFilter === 'with_kpm' && count === 0) return false;
        if (pengelolaKpmFilter === 'empty' && count > 0) return false;
        if (!qPengelola) return true;
        return (
          p.displayName.toLowerCase().includes(qPengelola) ||
          p.nama.toLowerCase().includes(qPengelola) ||
          (p.kabKota || '').toLowerCase().includes(qPengelola) ||
          (p.kecamatan || '').toLowerCase().includes(qPengelola) ||
          (p.kelurahan || '').toLowerCase().includes(qPengelola) ||
          (p.alamat || '').toLowerCase().includes(qPengelola) ||
          (p.kontak || '').toLowerCase().includes(qPengelola)
        );
      })
      .sort((a, b) => {
        const countA = pengelolaKpmCounts.get(a.displayName.trim().toLowerCase()) ?? 0;
        const countB = pengelolaKpmCounts.get(b.displayName.trim().toLowerCase()) ?? 0;
        switch (pengelolaSortBy) {
          case 'name_desc':
            return b.displayName.localeCompare(a.displayName, 'id');
          case 'count_desc':
            return countB - countA || a.displayName.localeCompare(b.displayName, 'id');
          case 'count_asc':
            return countA - countB || a.displayName.localeCompare(b.displayName, 'id');
          case 'wilayah_asc':
            return (
              getPengelolaWilayahLabel(a).localeCompare(getPengelolaWilayahLabel(b), 'id') ||
              a.displayName.localeCompare(b.displayName, 'id')
            );
          case 'name_asc':
          default:
            return a.displayName.localeCompare(b.displayName, 'id');
        }
      });

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Pengelola Lapangan', () => onChangeSection('root'))}
        <div
          className={`space-y-3 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          {canAdd && (
            <button
              type="button"
              onClick={() => setIsAddPengelolaOpen(true)}
              className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.99] ${
                !isNativeApp ? 'md:w-auto md:px-5' : ''
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Pengelola Baru</span>
            </button>
          )}

          {pengelolaList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={pengelolaQuery}
                    onChange={(e) => setPengelolaQuery(e.target.value)}
                    placeholder="Pencarian..."
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPengelolaFilters((prev) => !prev)}
                  aria-label="Filter dan urutkan pengelola"
                  aria-expanded={showPengelolaFilters}
                  className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    showPengelolaFilters || activePengelolaFilterCount > 0
                      ? 'border-teal-700 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {activePengelolaFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white tabular-nums">
                      {activePengelolaFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {showPengelolaFilters && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <FilterSelect
                      ariaLabel="Filter jumlah KPM pengelola"
                      value={pengelolaKpmFilter}
                      onChange={(v) => setPengelolaKpmFilter(v as 'all' | 'with_kpm' | 'empty')}
                    >
                      <option value="all">Semua Pengelola</option>
                      <option value="with_kpm">Memiliki KPM (&gt;0)</option>
                      <option value="empty">Belum Ada KPM (0)</option>
                    </FilterSelect>

                    <FilterSelect
                      ariaLabel="Urutkan pengelola lapangan"
                      value={pengelolaSortBy}
                      onChange={(v) =>
                        setPengelolaSortBy(
                          v as 'name_asc' | 'name_desc' | 'count_desc' | 'count_asc' | 'wilayah_asc'
                        )
                      }
                    >
                      <option value="name_asc">Urut: Nama (A–Z)</option>
                      <option value="name_desc">Urut: Nama (Z–A)</option>
                      <option value="count_desc">Urut: KPM Terbanyak</option>
                      <option value="count_asc">Urut: KPM Tersedikit</option>
                      <option value="wilayah_asc">Urut: Wilayah (A–Z)</option>
                    </FilterSelect>
                  </div>

                  {pengelolaWilayahOptions.length > 0 && (
                    <div className="border-t border-slate-100 pt-2.5">
                      <FilterSelect
                        ariaLabel="Filter wilayah pengelola"
                        value={pengelolaWilayahFilter}
                        onChange={setPengelolaWilayahFilter}
                      >
                        <option value="all">Semua Wilayah</option>
                        {pengelolaWilayahOptions.map((wil) => (
                          <option key={wil} value={wil}>
                            {wil}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  )}

                  {activePengelolaFilterCount > 0 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPengelolaWilayahFilter('all');
                          setPengelolaKpmFilter('all');
                          setPengelolaSortBy('name_asc');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reset Filter</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {pengelolaList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                Belum ada data pengelola lapangan
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ketuk tombol di atas untuk mendaftarkan pengelola lapangan baru.
              </p>
            </div>
          ) : filteredPengelolaList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center space-y-2.5">
              <p className="text-sm font-semibold text-slate-900">
                Tidak ada pengelola yang cocok
              </p>
              <p className="text-xs text-slate-500">
                Ubah kata kunci pencarian atau reset filter untuk melihat semua pengelola.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPengelolaQuery('');
                  setPengelolaWilayahFilter('all');
                  setPengelolaKpmFilter('all');
                  setPengelolaSortBy('name_asc');
                }}
                className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-teal-700 hover:bg-slate-50"
              >
                Reset Pencarian &amp; Filter
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {filteredPengelolaList.map((p) => {
                const count = pengelolaKpmCounts.get(p.displayName.trim().toLowerCase()) ?? 0;
                const swipeActions: SwipeAction[] = [];
                if (canUpdate && onUpdatePengelola) {
                  swipeActions.push({
                    key: 'edit',
                    label: 'Edit',
                    icon: <Edit3 className="h-4 w-4" />,
                    tone: 'teal',
                    onClick: () => setEditingPengelolaTarget(p),
                  });
                }
                if (canDelete && onDeletePengelola) {
                  swipeActions.push({
                    key: 'delete',
                    label: 'Hapus',
                    icon: <Trash2 className="h-4 w-4" />,
                    tone: 'danger',
                    onClick: () => setPendingDeletePengelola({ profile: p, kpmCount: count }),
                  });
                }

                return (
                  <SwipeableRow
                    key={p.id}
                    id={p.id}
                    isOpen={openPengelolaSwipeId === p.id}
                    onOpen={setOpenPengelolaSwipeId}
                    onClose={() => setOpenPengelolaSwipeId(null)}
                    actions={swipeActions}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPengelolaDrill(p.displayName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPengelolaDrill(p.displayName);
                        }
                      }}
                      className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 focus:outline-none focus-visible:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {p.foto ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewDocument(p.foto!, p.displayName);
                            }}
                            className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                            aria-label={`Lihat foto ${p.displayName}`}
                          >
                            <DriveImage
                              doc={p.foto}
                              alt={p.displayName}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                            <User className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {p.displayName}
                          </p>
                          {(p.kelurahan || p.kecamatan || p.kabKota) && (
                            <p className="truncate text-xs text-slate-500">
                              {getPengelolaWilayahLabel(p)}
                            </p>
                          )}
                          {(() => {
                            const waUrl = formatWhatsAppUrl(p.kontak);
                            if (!waUrl || !p.kontak) return null;
                            return (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                              >
                                <MessageCircle className="h-3 w-3 shrink-0" />
                                <span>{p.kontak}</span>
                              </a>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isNativeApp && canUpdate && onUpdatePengelola && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPengelolaTarget(p);
                            }}
                            aria-label={`Edit pengelola ${p.displayName}`}
                            title="Edit pengelola"
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 md:inline-flex"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!isNativeApp && canDelete && onDeletePengelola && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeletePengelola({ profile: p, kpmCount: count });
                            }}
                            aria-label={`Hapus pengelola ${p.displayName}`}
                            title="Hapus pengelola"
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 md:inline-flex"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">
                          {count}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </SwipeableRow>
                );
              })}
            </div>
          )}
        </div>

        <AddPengelolaModal
          isOpen={isAddPengelolaOpen || Boolean(editingPengelolaTarget)}
          editingProfile={editingPengelolaTarget}
          wilayahList={wilayahList}
          onClose={() => {
            setIsAddPengelolaOpen(false);
            setEditingPengelolaTarget(null);
          }}
          onCreatePengelola={(profile) => {
            if (editingPengelolaTarget && onUpdatePengelola) {
              onUpdatePengelola(profile, editingPengelolaTarget.displayName);
              setEditingPengelolaTarget(null);
            } else {
              onAddPengelola(profile);
            }
          }}
          onPreviewDocument={onPreviewDocument}
        />

        {pendingDeletePengelola && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setPendingDeletePengelola(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Hapus Pengelola"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">Hapus Pengelola?</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Apakah Anda yakin ingin menghapus pengelola{' '}
                    <strong>&ldquo;{pendingDeletePengelola.profile.displayName}&rdquo;</strong> dari
                    daftar master?
                  </p>
                  {pendingDeletePengelola.kpmCount > 0 && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                      Terdapat {pendingDeletePengelola.kpmCount} data KPM yang tercatat dengan
                      pengelola ini. Data KPM tetap tersimpan.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPendingDeletePengelola(null)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = pendingDeletePengelola.profile.id;
                    setPendingDeletePengelola(null);
                    onDeletePengelola?.(id);
                  }}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 8. PEKERJAAN
  if (activeSection === 'pekerjaan') {
    if (activePekerjaanDrill) {
      const targetKey = activePekerjaanDrill.trim().toLowerCase();
      const correspondentRecords = records.filter(
        (r) => (r.pekerjaan || '').trim().toLowerCase() === targetKey
      );

      return (
        <div className="min-h-screen pb-24">
          {renderSubHeader(activePekerjaanDrill, () => setPekerjaanDrill(null))}
          <div
            className={`px-4 pt-4 ${
              !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
            }`}
          >
            <CorrespondentKpmListPanel
              key={activePekerjaanDrill}
              records={correspondentRecords}
              items={items}
              proposals={proposals}
              wilayahList={wilayahList}
              emptyTitle="Belum ada KPM untuk pekerjaan ini"
              emptySubtitle={`Belum ada calon KPM dengan profesi/pekerjaan ${activePekerjaanDrill}.`}
              onSelectRecord={onSelectKpm}
              headerCard={
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-teal-700">
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {activePekerjaanDrill}
                      </p>
                      <p className="text-xs text-slate-500">Daftar KPM Koresponden</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 tabular-nums">
                    {correspondentRecords.length} KPM
                  </span>
                </div>
              }
            />
          </div>
        </div>
      );
    }

    const jobCounts = new Map<string, number>();
    for (const rec of records) {
      if (rec.pekerjaan) {
        const key = rec.pekerjaan.trim().toLowerCase();
        jobCounts.set(key, (jobCounts.get(key) ?? 0) + 1);
      }
    }

    const activePekerjaanFilterCount =
      (pekerjaanKpmFilter !== 'all' ? 1 : 0) + (pekerjaanSortBy !== 'name_asc' ? 1 : 0);

    const qPekerjaan = pekerjaanQuery.trim().toLowerCase();
    const filteredPekerjaanList = pekerjaanList
      .filter((job) => {
        const count = jobCounts.get(job.trim().toLowerCase()) ?? 0;
        if (pekerjaanKpmFilter === 'with_kpm' && count === 0) return false;
        if (pekerjaanKpmFilter === 'empty' && count > 0) return false;
        if (!qPekerjaan) return true;
        return job.toLowerCase().includes(qPekerjaan);
      })
      .sort((a, b) => {
        const countA = jobCounts.get(a.trim().toLowerCase()) ?? 0;
        const countB = jobCounts.get(b.trim().toLowerCase()) ?? 0;
        switch (pekerjaanSortBy) {
          case 'name_desc':
            return b.localeCompare(a, 'id');
          case 'count_desc':
            return countB - countA || a.localeCompare(b, 'id');
          case 'count_asc':
            return countA - countB || a.localeCompare(b, 'id');
          case 'name_asc':
          default:
            return a.localeCompare(b, 'id');
        }
      });

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Profesi & Pekerjaan', () => onChangeSection('root'))}
        <div
          className={`space-y-3 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setNewPekerjaan('');
                setPekerjaanError(null);
                setIsAddPekerjaanOpen(true);
              }}
              className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.99] ${
                !isNativeApp ? 'md:w-auto md:px-5' : ''
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Pekerjaan Baru</span>
            </button>
          )}

          {pekerjaanList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={pekerjaanQuery}
                    onChange={(e) => setPekerjaanQuery(e.target.value)}
                    placeholder="Pencarian..."
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPekerjaanFilters((prev) => !prev)}
                  aria-label="Filter dan urutkan pekerjaan"
                  aria-expanded={showPekerjaanFilters}
                  className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    showPekerjaanFilters || activePekerjaanFilterCount > 0
                      ? 'border-teal-700 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {activePekerjaanFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white tabular-nums">
                      {activePekerjaanFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {showPekerjaanFilters && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <FilterSelect
                      ariaLabel="Filter jumlah KPM pekerjaan"
                      value={pekerjaanKpmFilter}
                      onChange={(v) => setPekerjaanKpmFilter(v as 'all' | 'with_kpm' | 'empty')}
                    >
                      <option value="all">Semua Pekerjaan</option>
                      <option value="with_kpm">Memiliki KPM (&gt;0)</option>
                      <option value="empty">Belum Ada KPM (0)</option>
                    </FilterSelect>

                    <FilterSelect
                      ariaLabel="Urutkan daftar pekerjaan"
                      value={pekerjaanSortBy}
                      onChange={(v) =>
                        setPekerjaanSortBy(
                          v as 'name_asc' | 'name_desc' | 'count_desc' | 'count_asc'
                        )
                      }
                    >
                      <option value="name_asc">Urut: Nama (A–Z)</option>
                      <option value="name_desc">Urut: Nama (Z–A)</option>
                      <option value="count_desc">Urut: KPM Terbanyak</option>
                      <option value="count_asc">Urut: KPM Tersedikit</option>
                    </FilterSelect>
                  </div>

                  {activePekerjaanFilterCount > 0 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPekerjaanKpmFilter('all');
                          setPekerjaanSortBy('name_asc');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reset Filter</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {pekerjaanList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Belum ada daftar pekerjaan</p>
              <p className="mt-1 text-xs text-slate-500">
                Ketuk tombol di atas untuk menambahkan jenis pekerjaan baru.
              </p>
            </div>
          ) : filteredPekerjaanList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center space-y-2.5">
              <p className="text-sm font-semibold text-slate-900">
                Tidak ada pekerjaan yang cocok
              </p>
              <p className="text-xs text-slate-500">
                Ubah kata kunci pencarian atau reset filter untuk melihat semua profesi.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPekerjaanQuery('');
                  setPekerjaanKpmFilter('all');
                  setPekerjaanSortBy('name_asc');
                }}
                className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-teal-700 hover:bg-slate-50"
              >
                Reset Pencarian &amp; Filter
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {filteredPekerjaanList.map((job) => {
                const count = jobCounts.get(job.trim().toLowerCase()) ?? 0;
                const swipeActions: SwipeAction[] = [];
                if (canUpdate && onUpdatePekerjaan) {
                  swipeActions.push({
                    key: 'edit',
                    label: 'Edit',
                    icon: <Edit3 className="h-4 w-4" />,
                    tone: 'teal',
                    onClick: () => {
                      setEditingPekerjaanTarget(job);
                      setEditPekerjaanValue(job);
                      setEditPekerjaanError(null);
                    },
                  });
                }
                if (canDelete && onDeletePekerjaan) {
                  swipeActions.push({
                    key: 'delete',
                    label: 'Hapus',
                    icon: <Trash2 className="h-4 w-4" />,
                    tone: 'danger',
                    onClick: () => setPendingDeletePekerjaan({ name: job, kpmCount: count }),
                  });
                }

                return (
                  <SwipeableRow
                    key={job}
                    id={job}
                    isOpen={openPekerjaanSwipeId === job}
                    onOpen={setOpenPekerjaanSwipeId}
                    onClose={() => setOpenPekerjaanSwipeId(null)}
                    actions={swipeActions}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPekerjaanDrill(job)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPekerjaanDrill(job);
                        }
                      }}
                      className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70 focus:outline-none focus-visible:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {job}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isNativeApp && canUpdate && onUpdatePekerjaan && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPekerjaanTarget(job);
                              setEditPekerjaanValue(job);
                              setEditPekerjaanError(null);
                            }}
                            aria-label={`Edit pekerjaan ${job}`}
                            title="Edit pekerjaan"
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 md:inline-flex"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!isNativeApp && canDelete && onDeletePekerjaan && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeletePekerjaan({ name: job, kpmCount: count });
                            }}
                            aria-label={`Hapus pekerjaan ${job}`}
                            title="Hapus pekerjaan"
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 md:inline-flex"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">
                          {count}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </SwipeableRow>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Pekerjaan Modal */}
        {isAddPekerjaanOpen && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setIsAddPekerjaanOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Tambah Pekerjaan Baru"
          >
            <form
              onSubmit={handleAddPekerjaanSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">Tambah Pekerjaan Baru</h2>
                <button
                  type="button"
                  onClick={() => setIsAddPekerjaanOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div>
                <label htmlFor="modal-pekerjaan-nama" className="block text-xs font-semibold text-slate-700">
                  Nama Pekerjaan <span className="text-rose-600">*</span>
                </label>
                <input
                  id="modal-pekerjaan-nama"
                  type="text"
                  autoFocus
                  autoCapitalize="words"
                  value={newPekerjaan}
                  onChange={(e) => {
                    setNewPekerjaan(capitalizeWords(e.target.value));
                    if (pekerjaanError) setPekerjaanError(null);
                  }}
                  placeholder="Contoh: Penjahit Rumahan"
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                    pekerjaanError ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Huruf awal setiap kata otomatis kapital.
                </p>
                {pekerjaanError && (
                  <p className="mt-1 text-xs text-rose-600">{pekerjaanError}</p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPekerjaanOpen(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan Pekerjaan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Pekerjaan Modal */}
        {editingPekerjaanTarget !== null && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setEditingPekerjaanTarget(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Edit Profesi & Pekerjaan"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = capitalizeWords(editPekerjaanValue.trim());
                if (!clean) {
                  setEditPekerjaanError('Nama pekerjaan wajib diisi.');
                  return;
                }
                const duplicate = pekerjaanList.some(
                  (p) => p !== editingPekerjaanTarget && p.toLowerCase() === clean.toLowerCase()
                );
                if (duplicate) {
                  setEditPekerjaanError(`Pekerjaan "${clean}" sudah terdaftar.`);
                  return;
                }
                onUpdatePekerjaan?.(editingPekerjaanTarget, clean);
                setEditingPekerjaanTarget(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">Edit Pekerjaan</h2>
                <button
                  type="button"
                  onClick={() => setEditingPekerjaanTarget(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div>
                <label htmlFor="modal-edit-pekerjaan-nama" className="block text-xs font-semibold text-slate-700">
                  Nama Pekerjaan <span className="text-rose-600">*</span>
                </label>
                <input
                  id="modal-edit-pekerjaan-nama"
                  type="text"
                  autoFocus
                  autoCapitalize="words"
                  value={editPekerjaanValue}
                  onChange={(e) => {
                    setEditPekerjaanValue(capitalizeWords(e.target.value));
                    if (editPekerjaanError) setEditPekerjaanError(null);
                  }}
                  placeholder="Contoh: Penjahit Rumahan"
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                    editPekerjaanError ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                {editPekerjaanError && (
                  <p className="mt-1 text-xs text-rose-600">{editPekerjaanError}</p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingPekerjaanTarget(null)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Delete Pekerjaan Confirmation Modal */}
        {pendingDeletePekerjaan && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setPendingDeletePekerjaan(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Hapus Pekerjaan"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">Hapus Pekerjaan?</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Apakah Anda yakin ingin menghapus pekerjaan{' '}
                    <strong>&ldquo;{pendingDeletePekerjaan.name}&rdquo;</strong> dari daftar master?
                  </p>
                  {pendingDeletePekerjaan.kpmCount > 0 && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                      Terdapat {pendingDeletePekerjaan.kpmCount} data KPM yang tercatat dengan
                      pekerjaan ini. Data KPM tetap tersimpan.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPendingDeletePekerjaan(null)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = pendingDeletePekerjaan.name;
                    setPendingDeletePekerjaan(null);
                    onDeletePekerjaan?.(name);
                  }}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 8. LOG AKTIVITAS UMUM
  if (activeSection === 'activity') {
    const activityYearOptions = Array.from(
      new Set(unifiedActivityLogs.map((a) => a.tahun).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));

    const queryLower = activitySearch.trim().toLowerCase();
    const filteredActivities = unifiedActivityLogs.filter((entry) => {
      if (activityCategory !== 'all' && entry.category !== activityCategory) return false;
      if (activityYear !== 'all' && entry.tahun !== activityYear) return false;
      if (!queryLower) return true;
      return (
        entry.actorName.toLowerCase().includes(queryLower) ||
        entry.title.toLowerCase().includes(queryLower) ||
        entry.detail.toLowerCase().includes(queryLower) ||
        entry.badge.toLowerCase().includes(queryLower)
      );
    });

    const toneBadgeClass: Record<'teal' | 'amber' | 'rose' | 'slate', string> = {
      teal: 'bg-teal-50 text-teal-800 border-teal-200',
      amber: 'bg-amber-50 text-amber-800 border-amber-200',
      rose: 'bg-rose-50 text-rose-700 border-rose-200',
      slate: 'bg-slate-100 text-slate-700 border-slate-200',
    };

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Log Aktivitas Umum', () => onChangeSection('root'), 'md:max-w-5xl')}

        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
                  <History className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900">
                    Jejak Aktivitas Tim
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Rekaman perubahan proposal, KPM, &amp; katalog
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-bold text-[#0F766E] tabular-nums">
                {filteredActivities.length} log
              </span>
            </div>

            <div className="space-y-2.5 p-3.5">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    placeholder="Pencarian..."
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
                  />
                </div>
                {activityYearOptions.length > 0 && (
                  <div className="w-[116px] shrink-0">
                    <FilterSelect
                      ariaLabel="Filter tahun log aktivitas"
                      value={activityYear}
                      onChange={setActivityYear}
                    >
                      <option value="all">Semua</option>
                      {activityYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                )}
              </div>

              <SegmentedTabs
                value={activityCategory}
                onChange={(val) => setActivityCategory(val)}
                tabs={[
                  { key: 'all', label: 'Semua' },
                  { key: 'proposal', label: 'Proposal' },
                  { key: 'kpm', label: 'KPM' },
                  { key: 'catalog', label: 'Katalog' },
                ]}
              />
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredActivities.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <History className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Belum ada aktivitas yang cocok dengan filter.
                </p>
              </div>
            ) : (
              filteredActivities.slice(0, 200).map((entry) => (
                <div key={entry.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${toneBadgeClass[entry.tone]}`}
                    >
                      {entry.badge}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                      {formatUploadDateTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900">{entry.title}</p>
                  <p className="text-xs leading-relaxed text-slate-600">{entry.detail}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[11px] text-slate-500">
                    <span>
                      Pelaku: <strong className="font-semibold text-slate-700">{entry.actorName}</strong>
                    </span>
                    {entry.tahun && <span>· Tahun {entry.tahun}</span>}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    );
  }

  // 9. MATRIKS KELENGKAPAN BERKAS KPM
  if (activeSection === 'kelengkapan') {
    const q = matrixQuery.trim().toLowerCase();
    const rows = records
      .map((rec) => {
        const checks = [
          { key: 'nik', label: 'NIK', ok: /^\d{16}$/.test(rec.nikKtp || '') },
          { key: 'kk', label: 'KK', ok: /^\d{16}$/.test(rec.nikKk || '') },
          { key: 'ktpFoto', label: 'KTP', ok: Boolean(rec.documents?.ktp) },
          { key: 'kkFoto', label: 'KK Foto', ok: Boolean(rec.documents?.kk) },
          { key: 'survey', label: 'Survey', ok: Boolean(rec.documents?.survey) },
          { key: 'penerima', label: 'Penerima', ok: Boolean(rec.documents?.penerima) },
          {
            key: 'dtsen',
            label: 'DTSEN',
            ok: Boolean(rec.dtsen && rec.dtsen !== 'Belum Ada Desil'),
          },
          { key: 'validasi', label: 'Diterima', ok: rec.validasi === 'accepted' },
        ];
        const score = checks.filter((c) => c.ok).length;
        return { rec, checks, score };
      })
      .filter(({ rec, score }) => {
        if (matrixFilter === 'incomplete' && score === 8) return false;
        if (!q) return true;
        return (
          rec.nama.toLowerCase().includes(q) ||
          rec.proposal.toLowerCase().includes(q) ||
          (rec.registerCode || '').toLowerCase().includes(q) ||
          rec.nikKtp.includes(q)
        );
      })
      .sort((a, b) => a.score - b.score || a.rec.nama.localeCompare(b.rec.nama, 'id'));

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Matriks Kelengkapan Berkas', () => onChangeSection('root'))}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={matrixQuery}
                onChange={(e) => setMatrixQuery(e.target.value)}
                placeholder="Pencarian..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <SegmentedTabs<'incomplete' | 'all'>
            value={matrixFilter}
            onChange={setMatrixFilter}
            tabs={[
              {
                key: 'incomplete',
                label: 'Belum Lengkap',
                count: records.filter((r) => {
                  const okCount =
                    (/^\d{16}$/.test(r.nikKtp || '') ? 1 : 0) +
                    (/^\d{16}$/.test(r.nikKk || '') ? 1 : 0) +
                    (r.documents?.ktp ? 1 : 0) +
                    (r.documents?.kk ? 1 : 0) +
                    (r.documents?.survey ? 1 : 0) +
                    (r.documents?.penerima ? 1 : 0) +
                    (r.dtsen && r.dtsen !== 'Belum Ada Desil' ? 1 : 0) +
                    (r.validasi === 'accepted' ? 1 : 0);
                  return okCount < 8;
                }).length,
              },
              { key: 'all', label: 'Semua KPM', count: records.length },
            ]}
          />

          <div
            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 ${
              !isNativeApp
                ? 'md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent'
                : ''
            }`}
          >
            {rows.length === 0 ? (
              <div
                className={`px-4 py-10 text-center text-xs text-slate-500 ${
                  !isNativeApp ? 'md:col-span-2 md:rounded-2xl md:border md:border-slate-200 md:bg-white' : ''
                }`}
              >
                Tidak ada KPM pada filter ini.
              </div>
            ) : (
              rows.slice(0, 80).map(({ rec, checks, score }) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectKpm?.(rec)}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                    !isNativeApp ? 'md:rounded-2xl md:border md:border-slate-200 md:bg-white' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-slate-900">{rec.nama}</p>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        score === 8
                          ? 'bg-teal-50 text-teal-800'
                          : score >= 5
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {score}/8
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {rec.proposal} · {rec.tahun}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {checks.map((c) => (
                      <span
                        key={c.key}
                        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          c.ok
                            ? 'bg-teal-50 text-teal-800'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {c.ok ? '✓' : '·'} {c.label}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // 10. JADWAL & TARGET PROPOSAL
  if (activeSection === 'jadwal') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const catLabelMap: Record<ScheduleCategory, string> = {
      survey: 'Survey Lapangan',
      dinas: 'Antar ke Dinas',
      distribusi: 'Penyaluran / Distribusi',
      lainnya: 'Agenda Lainnya',
    };

    const sortedSchedules = [...schedules].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.targetDate.localeCompare(b.targetDate);
    });

    const handleSubmitSchedule = (e: FormEvent) => {
      e.preventDefault();
      if (!scheduleTitle.trim() || !scheduleDate || !onAddSchedule) return;
      onAddSchedule({
        title: scheduleTitle.trim(),
        category: scheduleCategory,
        targetDate: scheduleDate,
        proposalName: scheduleProposal.trim() || undefined,
        notes: scheduleNotes.trim() || undefined,
      });
      setScheduleTitle('');
      setScheduleProposal('');
      setScheduleNotes('');
    };

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader(
          'Jadwal & Target Proposal',
          () => onChangeSection('root'),
          onAddSchedule && canAdd ? 'md:max-w-[1440px]' : 'md:max-w-5xl'
        )}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp
              ? `md:mx-auto ${onAddSchedule && canAdd ? 'md:max-w-[1440px] md:grid md:grid-cols-12 md:items-start md:gap-6 md:space-y-0' : 'md:max-w-5xl'} md:px-6 md:pt-6`
              : ''
          }`}
        >
          {onAddSchedule && canAdd && (
            <form
              onSubmit={handleSubmitSchedule}
              className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-3 ${
                !isNativeApp ? 'md:col-span-5' : ''
              }`}
            >
              <h2 className="text-sm font-bold text-slate-900">Tambah Agenda Baru</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Judul Agenda / Target
                </label>
                <input
                  type="text"
                  required
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="Contoh: Antar Proposal Kel. Sungai Beliung ke Dinas"
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Kategori</label>
                  <select
                    value={scheduleCategory}
                    onChange={(e) => setScheduleCategory(e.target.value as ScheduleCategory)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="survey">Survey Lapangan</option>
                    <option value="dinas">Antar ke Dinas</option>
                    <option value="distribusi">Penyaluran / Distribusi</option>
                    <option value="lainnya">Agenda Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tanggal Target
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-2.5 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={scheduleProposal}
                  onChange={(e) => setScheduleProposal(e.target.value)}
                  placeholder="Nama Proposal (opsional)"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="text"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="Catatan singkat (opsional)"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <Plus className="h-4 w-4" />
                <span>Simpan Jadwal</span>
              </button>
            </form>
          )}

          <div
            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 ${
              !isNativeApp && onAddSchedule && canAdd ? 'md:col-span-7' : ''
            }`}
          >
            {sortedSchedules.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CalendarClock className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Belum ada jadwal kegiatan atau tenggat proposal.
                </p>
              </div>
            ) : (
              sortedSchedules.map((ev) => {
                const isOverdue = !ev.completed && ev.targetDate < todayStr;
                return (
                  <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                    {onToggleSchedule && (
                      <button
                        type="button"
                        onClick={() => onToggleSchedule(ev.id)}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          ev.completed
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-300 bg-white text-transparent hover:border-teal-600'
                        }`}
                        aria-label={ev.completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ev.completed
                              ? 'bg-slate-100 text-slate-500'
                              : isOverdue
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-teal-50 text-teal-800'
                          }`}
                        >
                          {catLabelMap[ev.category]}
                        </span>
                        <span
                          className={`text-[11px] font-bold tabular-nums ${
                            ev.completed
                              ? 'text-slate-400'
                              : isOverdue
                                ? 'text-rose-600'
                                : 'text-slate-700'
                          }`}
                        >
                          {ev.targetDate}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          ev.completed ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {ev.title}
                      </p>
                      {(ev.proposalName || ev.notes) && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[ev.proposalName, ev.notes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    {onDeleteSchedule && canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteSchedule(ev.id)}
                        aria-label="Hapus jadwal"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // 11. TEMPAT SAMPAH (RECYCLE BIN 30 HARI - SUPERADMIN)
  if (activeSection === 'sampah') {
    const nowMs = Date.now();
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Tempat Sampah (30 Hari)', () => onChangeSection('superadmin'), 'md:max-w-5xl')}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-5xl md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 leading-relaxed">
            Data KPM dan Proposal yang dihapus disimpan sementara selama <strong>30 hari</strong>{' '}
            sebelum foto Drive &amp; datanya dibersihkan otomatis.
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {trashBin.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Trash2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs font-medium text-slate-600">Tempat sampah kosong.</p>
              </div>
            ) : (
              trashBin.map((item) => {
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(item.expiresAt).getTime() - nowMs) / (24 * 60 * 60 * 1000))
                );
                return (
                  <div key={item.id} className="space-y-2.5 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            item.kind === 'kpm'
                              ? 'bg-teal-50 text-teal-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {item.kind === 'kpm' ? 'Calon KPM' : 'Proposal'}
                        </span>
                        <p className="mt-1 truncate text-sm font-bold text-slate-900">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                        <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
                          Dihapus {formatUploadDateTime(item.deletedAt)} oleh {item.deletedBy} ·
                          Sisa {daysLeft} hari
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onRestoreTrashItem && (
                        <button
                          type="button"
                          onClick={() => onRestoreTrashItem(item.id)}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Pulihkan</span>
                        </button>
                      )}
                      {onPermanentDeleteTrashItem && (
                        <button
                          type="button"
                          onClick={() => setPendingPermanentDeleteTrashId(item.id)}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus Permanen</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {pendingPermanentDeleteTrashId && onPermanentDeleteTrashItem && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-xs sm:items-center"
            onClick={() => setPendingPermanentDeleteTrashId(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900">Hapus Permanen?</h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Data beserta seluruh dokumen foto Google Drive pada item ini akan dihapus permanen
                dan tidak dapat dipulihkan lagi.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingPermanentDeleteTrashId(null)}
                  className="min-h-[42px] flex-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tid = pendingPermanentDeleteTrashId;
                    setPendingPermanentDeleteTrashId(null);
                    onPermanentDeleteTrashItem(tid);
                  }}
                  className="min-h-[42px] flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Ya, Hapus Permanen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 12. DOWNLOAD DATA (PDF F4 & EXCEL)
  if (activeSection === 'download') {
    return (
      <MenuDownloadView
        records={records}
        proposals={proposals}
        items={items}
        wilayahList={wilayahList}
        pengelolaList={pengelolaList}
        reportTemplate={reportTemplate}
        onSaveReportTemplate={onSaveReportTemplate}
        onBack={() => onChangeSection('root')}
      />
    );
  }

  // 13. RIWAYAT PEMBARUAN (CHANGELOG + SINKRONISASI GITHUB RELEASES)
  if (activeSection === 'changelog') {
    const compareSemverDesc = (a: string, b: string) => {
      const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
      const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const diff = (pb[i] || 0) - (pa[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    };

    const mergedMap = new Map<string, ChangelogRelease>();
    for (const rel of githubReleases) {
      mergedMap.set(rel.version, { ...rel, badge: undefined });
    }
    for (const localRel of APP_CHANGELOG) {
      mergedMap.set(localRel.version, { ...localRel, badge: undefined });
    }
    const sortedNewest = Array.from(mergedMap.values()).sort((a, b) =>
      compareSemverDesc(a.version, b.version)
    );
    if (sortedNewest.length > 0) {
      sortedNewest[0] = {
        ...sortedNewest[0],
        badge:
          sortedNewest[0].version === effectiveVersion
            ? isNativeApp
              ? 'Versi Terpasang'
              : 'Versi Aktif'
            : 'Versi Terbaru GitHub',
      };
    }

    const latestVersionLabel = sortedNewest[0]?.version || effectiveVersion;
    const orderedReleases = changelogSortNewestFirst
      ? sortedNewest
      : [...sortedNewest].reverse();

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Riwayat Pembaruan', () => onChangeSection('root'), 'md:max-w-4xl')}
        <div
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-4xl md:px-6 md:pt-6' : ''
          }`}
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                  Changelog Aplikasi
                </p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900">
                  {isNativeApp ? `Versi Terpasang v${effectiveVersion}` : `Versi Web Aktif v${effectiveVersion}`}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Daftar lengkap pembaruan dari versi 1.0.0 hingga versi {latestVersionLabel}
                  {loadingGithubReleases ? ' (menyinkronkan GitHub Releases...)' : '.'}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <ScrollText className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Total {sortedNewest.length} rilis tercatat
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loadingGithubReleases}
                  onClick={() => void refreshGithubReleases()}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-teal-700 ${loadingGithubReleases ? 'animate-spin' : ''}`} />
                  <span>Sinkronkan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChangelogSortNewestFirst((prev) => !prev)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <History className="h-3.5 w-3.5 text-teal-700" />
                  <span>
                    {changelogSortNewestFirst
                      ? `Urutan: v${latestVersionLabel} → v1.0.0`
                      : `Urutan: v1.0.0 → v${latestVersionLabel}`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {orderedReleases.map((release) => {
              const isLatest = release.version === latestVersionLabel;
              return (
                <article
                  key={release.version}
                  className={`rounded-2xl border bg-white p-4 shadow-xs ${
                    isLatest ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                          isLatest
                            ? 'bg-teal-700 text-white'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        v{release.version}
                      </span>
                      {release.badge && (
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          {release.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                      {release.highlights.length} pembaruan
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-sm font-bold text-slate-900">{release.title}</h3>

                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 tabular-nums">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>Diperbarui {release.releasedAt}</span>
                  </div>

                  <ul className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5">
                    {release.highlights.map((item, idx) => {
                      const colonIdx = item.indexOf(':');
                      const hasPrefix = colonIdx > 0 && colonIdx < 48;
                      const label = hasPrefix ? item.slice(0, colonIdx) : '';
                      const desc = hasPrefix ? item.slice(colonIdx + 1).trim() : item;

                      return (
                        <li
                          key={`${release.version}-${idx}`}
                          className="flex items-start gap-2 text-xs leading-relaxed text-slate-600"
                        >
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              isLatest ? 'bg-teal-600' : 'bg-slate-400'
                            }`}
                          />
                          <span>
                            {hasPrefix ? (
                              <>
                                <strong className="font-semibold text-slate-800">{label}:</strong>{' '}
                                {desc}
                              </>
                            ) : (
                              item
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 9. LAPORAN (COMING SOON)
  return (
    <div className="min-h-screen pb-24">
      {renderSubHeader('Laporan', () => onChangeSection('root'), 'md:max-w-4xl')}
      <div
        className={`space-y-4 px-4 pt-6 ${
          !isNativeApp ? 'md:mx-auto md:max-w-4xl md:px-6 md:pt-6' : ''
        }`}
      >
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
            <Clock className="h-7 w-7" />
          </div>
          <span className="mt-4 inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Coming Soon
          </span>
          <h2 className="mt-3 text-base font-bold text-slate-900">
            Fitur Laporan Segera Hadir
          </h2>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
            Modul penyusunan laporan berkala, grafik ringkasan, dan rekapitulasi resmi sedang dalam
            tahap pengembangan.
          </p>

          <button
            type="button"
            onClick={() => onChangeSection('download')}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
          >
            <Download className="h-4 w-4" />
            <span>Buka Menu Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
