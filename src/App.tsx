import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  MessageSquare,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import {
  appendKpmAuditLogsInSupabase,
  checkSupabaseSchemaReady,
  deleteKpmRecordWithSideEffectsInSupabase,
  deleteKpmsBatchInSupabase,
  deletePengelolaInSupabase,
  fetchAppStateSlice,
  fetchChatDeliveryWatermarks,
  fetchOperationalDataFromSupabase,
  importOperationalDeltaToSupabase,
  isSchemaMissingError,
  runAdminDataActionInSupabase,
  saveAppStateSlice,
  supabaseAdminControlInternalUser,
  supabaseCreateInternalUserBySuperAdmin,
  supabaseDeleteInternalUser,
  supabaseDeleteProposalDirect,
  supabaseFetchDirectMessages,
  supabaseFetchInternalUsers,
  supabaseLogin,
  supabaseMarkDirectMessagesDelivered,
  supabaseMarkDirectMessagesRead,
  supabaseMarkOfflineKeepalive,
  supabaseRegisterInternalUser,
  supabaseSendDirectMessage,
  supabaseSetUserPresence,
  supabaseUpdateInternalUserProfile,
  supabaseUpdateProposalLockStatus,
  supabaseVerifyUserPassword,
  syncWilayahInSupabase,
  updateKpmBerkasDikembalikanInSupabase,
  updateKpmDocumentsInSupabase,
  updateKpmStatusesBatchInSupabase,
  upsertCatalogItemsInSupabase,
  upsertKpmRecordsBatchInSupabase,
  upsertKpmSubItemDeliveriesInSupabase,
  upsertPekerjaanListInSupabase,
  upsertPengelolaInSupabase,
  upsertProposalInSupabase,
  upsertProposalsBatchInSupabase,
} from './services/supabaseData';
import {
  INITIAL_INTERNAL_USERS,
  INITIAL_ITEM_LIST,
  INITIAL_KPM_AUDIT_LOGS,
  INITIAL_PENGELOLA_LIST,
  INITIAL_PROPOSAL_HISTORY,
  INITIAL_PROPOSAL_LIST,
  INITIAL_WILAYAH_LIST,
  PEKERJAAN_OPTIONS,
  SAMPLE_KPM_RECORDS,
} from './data/kpmOptions';
import {
  AppNotificationItem,
  BastTemplateConfig,
  CouponPrintConfig,
  DEFAULT_BAST_TEMPLATE,
  DEFAULT_COUPON_CONFIG,
  DEFAULT_REPORT_TEMPLATE,
  DirectChatMessage,
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmBastInfo,
  KpmDocumentFile,
  KpmDocuments,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalBastMap,
  ProposalChecklist,
  ProposalDocuments,
  ProposalFormValues,
  ProposalKpmHistoryEntry,
  ProposalLockStatus,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  ScheduleCategory,
  ScheduleEventItem,
  SharedKpmCard,
  SlotRemovalMode,
  TrashRecordItem,
  UserPermissions,
  UserPresenceStatus,
  ValidationStatus,
  WilayahKabKota,
} from './types/kpm';
import {
  assignKpmToProposalSlot,
  clearSampleRecordsOnce,
  collapseKpmSlotsInMap,
  diffKpmRecordChanges,
  formatValidationLabel,
  generateRegisterCode,
  getProposalSlotKey,
  isLegacyDummyProposal,
  loadCustomYears,
  loadInternalUsers,
  loadItemList,
  loadKpmAuditLogs,
  loadKpmRecords,
  loadPekerjaanList,
  loadPengelolaList,
  loadProposalHistory,
  loadProposals,
  loadWilayahList,
  moveProposalSlotDirection,
  normalizeKpmRouting,
  normalizeSubItemKey,
  recalculateProposalRegisterCodes,
  removeDocumentFromDrive,
  removeEmptySlotFromMap,
  resolveKpmDomicile,
  resolvePackageForKpm,
  resolveProposalDomicile,
  sanitizeProposalSlotMap,
  saveCustomYears,
  saveInternalUsers,
  saveItemList,
  saveKpmAuditLogs,
  saveKpmRecords,
  savePekerjaanList,
  savePengelolaList,
  saveProposalHistory,
  saveProposals,
  saveWilayahList,
  uploadImageDocumentToDrive,
  vacateKpmSlotsInMap,
} from './utils/imageProcessor';
import { loadIdbSnapshot, saveIdbValue } from './utils/indexedDbStorage';
import {
  enqueueOfflineAction,
  getOfflineQueue,
  removeOfflineAction,
} from './utils/offlineQueue';
import { TAHUN_OPTIONS } from './data/kpmOptions';
import { importProposalKpmFromCsv } from './utils/csvImporter';
import { KpmRegistrationForm } from './components/KpmRegistrationForm';
import { KpmDetailView } from './components/KpmDetailView';
import { RecapDrillTarget, SubItemRecapView } from './components/SubItemRecapView';
import { AddProposalForm } from './components/AddProposalForm';
import { ProposalForm } from './components/ProposalForm';
import { ProposalDetailView } from './components/ProposalDetailView';
import { DocumentLightbox } from './components/DocumentLightbox';
import { OfflineIndicator } from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { BottomNavBar, MainTab, QuickAddSheet } from './components/BottomNavBar';
import { DashboardView } from './components/DashboardView';
import { KpmListView } from './components/KpmListView';
import { ProposalListView } from './components/ProposalListView';
import { AdminDataActionType, MenuHubView, MenuSection } from './components/MenuHubView';
import { HistoryDetailView } from './components/HistoryDetailView';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { AuthView } from './components/AuthView';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ChatView } from './components/ChatView';
import { UserProfileView } from './components/UserProfileView';
import { PublicKpmProfileView } from './components/PublicKpmProfileView';
import { AppUpdateModal } from './components/AppUpdateModal';
import { PullToRefresh } from './components/PullToRefresh';
import {
  AppUpdateInfo,
  checkForAppUpdate,
  fetchGithubReleasesChangelog,
  getCachedGithubReleasesChangelog,
  getCachedMandatoryUpdate,
  resolveEffectiveAppVersion,
} from './services/appUpdater';
import type { ChangelogRelease } from './data/changelogData';
import {
  clearNativeChatNotifier,
  consumePendingNotificationSender,
  markNativeNotifiedIds,
  setNativeAppForeground,
  setNativeNotifierEnabled,
  syncNativeChatNotifierConfig,
} from './services/nativeChatNotifier';
import { APP_VERSION } from './config/appVersion';
import { DesktopSidebar } from './components/DesktopSidebar';
import { NotificationPageView } from './components/NotificationPageView';
import { isNativeAppPlatform, useIsDesktopWeb } from './utils/platform';
import { withEffectiveUserPresence } from './utils/presence';
import {
  consumeUrlChatPeerId,
  ensureBrowserPushSubscription,
  listenSwOpenChat,
} from './utils/pwaPush';

type SubView =
  | 'none'
  | 'kpm-form'
  | 'kpm-detail'
  | 'kpm-history'
  | 'subitem-recap'
  | 'add-proposal'
  | 'edit-proposal'
  | 'proposal-detail'
  | 'proposal-history'
  | 'chat'
  | 'notifications'
  | 'profile';

interface FeedbackBanner {
  type: 'success' | 'error';
  message: string;
}

interface IncomingToastBanner {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
}

interface OperationalDataPayload {
  initialized?: boolean;
  updatedAt?: string;
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pengelolaList: PengelolaProfile[];
  pekerjaanList: string[];
  wilayahList: WilayahKabKota[];
  proposalHistory: ProposalKpmHistoryEntry[];
  kpmAuditLogs: KpmAuditLogEntry[];
}

const SESSION_STORAGE_KEY = 'masdeta_session_user_id_v1';
const SESSION_TOKEN_STORAGE_KEY = 'masdeta_session_token_v1';
const PUSH_ENABLED_STORAGE_KEY = 'masdeta_push_enabled_v1';
const APP_NOTIFICATIONS_STORAGE_KEY = 'masdeta_app_notifications_v1';
const CHAT_NOTIFIED_IDS_STORAGE_PREFIX = 'masdeta_notified_chat_ids_v1_';

function loadPersistedNotifiedChatIds(userId: string): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(`${CHAT_NOTIFIED_IDS_STORAGE_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function savePersistedNotifiedChatIds(userId: string, ids: Set<string>): void {
  if (!userId) return;
  try {
    const trimmed = Array.from(ids).slice(-400);
    localStorage.setItem(`${CHAT_NOTIFIED_IDS_STORAGE_PREFIX}${userId}`, JSON.stringify(trimmed));
  } catch {
    // Ignore storage write error
  }
}

function playMessageChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.setValueAtTime(988, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Abaikan jika browser memblokir audio sebelum interaksi
  }
}

const ANDROID_CHAT_CHANNEL_ID = 'masdeta_chat_v2';
let androidNotifChannelCreated = false;

function hashNotificationId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.max(100, Math.abs(hash) % 2_000_000_000);
}

async function ensureAndroidNotificationChannel() {
  if (!Capacitor.isNativePlatform() || androidNotifChannelCreated) return;
  try {
    // Hapus channel lama yang sempat memakai sound:'default' (tidak ada di res/raw -> bisu di Android 8+)
    await LocalNotifications.deleteChannel({ id: 'masdeta_chat' }).catch(() => {});
    // Jangan isi properti sound agar Android otomatis memakai nada dering notifikasi bawaan sistem
    await LocalNotifications.createChannel({
      id: ANDROID_CHAT_CHANNEL_ID,
      name: 'Pesan Masuk MASDETA',
      description: 'Notifikasi pesan chat langsung dengan suara dan tampilan layar kunci',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#0F766E',
    });
    androidNotifChannelCreated = true;
  } catch {
    // Abaikan jika channel sudah ada atau device tidak mendukung
  }
}

async function triggerPushNotification(
  title: string,
  body: string,
  options?: { senderId?: string; tag?: string }
) {
  if (typeof window === 'undefined') return;

  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await ensureAndroidNotificationChannel();
      const notifId = options?.senderId
        ? hashNotificationId(`chat:${options.senderId}`)
        : Math.max(1000, Math.floor((Date.now() + Math.random() * 1000) % 2_147_483_000));
      // Sengaja tanpa `schedule` agar Capacitor langsung memanggil NotificationManager.notify()
      // tanpa tertahan pembatasan AlarmManager di Android 12-14.
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title,
            body,
            channelId: ANDROID_CHAT_CHANNEL_ID,
            smallIcon: 'ic_stat_masdeta',
            iconColor: '#0F766E',
            autoCancel: true,
            extra: options?.senderId ? { senderId: options.senderId } : undefined,
          },
        ],
      });
    } catch {
      // Abaikan jika plugin notifikasi native sementara dibatasi OS
    }
    return;
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const tag = options?.tag || `masdeta-chat-${Date.now()}`;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
        });
        return;
      }
    }
    new Notification(title, { body, icon: '/pwa-192x192.png', tag });
  } catch {
    // Fallback diam-diam jika Notification API dibatasi
  }
}

export function MasdetaLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
    >
      <rect width="36" height="36" rx="10" fill="#0F766E" />
      <path
        d="M9 24.5V12.5C9 11.6716 9.67157 11 10.5 11H12.05C12.5672 11 13.0478 11.2663 13.3219 11.7049L18 19.1899L22.6781 11.7049C22.9522 11.2663 23.4328 11 23.95 11H25.5C26.3284 11 27 11.6716 27 12.5V24.5"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 24.5L18 19.5L21.5 24.5"
        stroke="#99F6E4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const isNativeApp = isNativeAppPlatform();
  const isDesktopWeb = useIsDesktopWeb();
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [subView, setSubView] = useState<SubView>('none');
  const [returnToTab, setReturnToTab] = useState<MainTab>('dashboard');
  const [kpmFormReturnToDetail, setKpmFormReturnToDetail] = useState(false);
  const [kpmFormReturnToProposalDetail, setKpmFormReturnToProposalDetail] = useState(false);
  const [kpmDetailReturnToRecap, setKpmDetailReturnToRecap] = useState(false);
  const [kpmDetailReturnToProposalDetail, setKpmDetailReturnToProposalDetail] = useState(false);
  const [kpmDetailReturnToChatPeerId, setKpmDetailReturnToChatPeerId] = useState<string | null>(null);
  const [addProposalFromKpmForm, setAddProposalFromKpmForm] = useState(false);
  const [menuSection, setMenuSection] = useState<MenuSection>('root');
  const [usersOpenedFromSuperAdmin, setUsersOpenedFromSuperAdmin] = useState(false);
  const [selectedPengelolaDrill, setSelectedPengelolaDrill] = useState<string | null>(null);
  const [selectedPekerjaanDrill, setSelectedPekerjaanDrill] = useState<string | null>(null);
  const [selectedDtsenDrill, setSelectedDtsenDrill] = useState<string | null>(null);
  const [menuOpenedFromDashboard, setMenuOpenedFromDashboard] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [kpmStatusFilter, setKpmStatusFilter] = useState<'all' | ValidationStatus>('all');
  const [kpmItemFilter, setKpmItemFilter] = useState<string>('all');
  const [kpmProposalFilter, setKpmProposalFilter] = useState<string>('all');
  const [kpmOpenedFromProposalDetail, setKpmOpenedFromProposalDetail] = useState(false);

  const [records, setRecords] = useState<KpmRecord[]>(() => {
    clearSampleRecordsOnce();
    return loadKpmRecords(SAMPLE_KPM_RECORDS);
  });
  const [pengelolaList, setPengelolaList] = useState<PengelolaProfile[]>(() =>
    loadPengelolaList(INITIAL_PENGELOLA_LIST)
  );
  const [proposals, setProposals] = useState<ProposalRecord[]>(() =>
    loadProposals(INITIAL_PROPOSAL_LIST).filter((p) => !isLegacyDummyProposal(p))
  );
  const [proposalHistory, setProposalHistory] = useState<ProposalKpmHistoryEntry[]>(() =>
    loadProposalHistory(INITIAL_PROPOSAL_HISTORY)
  );
  const [kpmAuditLogs, setKpmAuditLogs] = useState<KpmAuditLogEntry[]>(() =>
    loadKpmAuditLogs(INITIAL_KPM_AUDIT_LOGS)
  );
  const [items, setItems] = useState<ItemBantuan[]>(() =>
    loadItemList(isSupabaseConfigured ? [] : INITIAL_ITEM_LIST)
  );
  const [pekerjaanList, setPekerjaanList] = useState<string[]>(() =>
    loadPekerjaanList(isSupabaseConfigured ? [] : PEKERJAAN_OPTIONS)
  );
  const [wilayahList, setWilayahList] = useState<WilayahKabKota[]>(() =>
    loadWilayahList(INITIAL_WILAYAH_LIST)
  );
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>(() =>
    loadInternalUsers(INITIAL_INTERNAL_USERS)
  );
  const [customYears, setCustomYears] = useState<string[]>(() => loadCustomYears([]));
  const [idbHydrated, setIdbHydrated] = useState(false);

  const [editingKpmRecord, setEditingKpmRecord] = useState<KpmRecord | null>(null);
  const [activeKpmId, setActiveKpmId] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [addProposalInitialYear, setAddProposalInitialYear] = useState<string | undefined>(undefined);
  const [pendingSelectedProposal, setPendingSelectedProposal] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
  const [lockedKpmProposalScope, setLockedKpmProposalScope] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
  const [kpmFormInitialStandaloneStatus, setKpmFormInitialStandaloneStatus] = useState<
    'pending' | 'rejected' | null
  >(null);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [lightboxDoc, setLightboxDoc] = useState<{ file: KpmDocumentFile; title: string } | null>(
    null
  );

  // Auth, 1-on-1 Direct Chat, Presence & Push Notification states
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(false);
  const [directMessages, setDirectMessages] = useState<DirectChatMessage[]>([]);
  const [chatDeliveryWatermarks, setChatDeliveryWatermarks] = useState<Record<string, string>>({});
  const [activeChatPeerId, setActiveChatPeerId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PUSH_ENABLED_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    () => {
      if (typeof window === 'undefined') return 'unsupported';
      if (Capacitor.isNativePlatform()) return 'default';
      if (!('Notification' in window)) {
        return 'unsupported';
      }
      return Notification.permission;
    }
  );
  const [incomingToast, setIncomingToast] = useState<IncomingToastBanner | null>(null);
  const [bellAckChatCount, setBellAckChatCount] = useState<number>(0);
  const [appNotifications, setAppNotifications] = useState<AppNotificationItem[]>(() => {
    try {
      const raw = localStorage.getItem(APP_NOTIFICATIONS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as AppNotificationItem[]).slice(0, 25) : [];
    } catch {
      return [];
    }
  });
  const [appAlertToast, setAppAlertToast] = useState<AppNotificationItem | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);
  const [supabaseSchemaMissing, setSupabaseSchemaMissing] = useState<boolean>(false);
  const [dismissedSchemaNotice, setDismissedSchemaNotice] = useState<boolean>(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(() =>
    Capacitor.isNativePlatform() ? getCachedMandatoryUpdate() : null
  );
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(() =>
    Capacitor.isNativePlatform() ? Boolean(getCachedMandatoryUpdate()) : false
  );
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);
  const [githubReleases, setGithubReleases] = useState<ChangelogRelease[]>(() =>
    getCachedGithubReleasesChangelog()
  );
  const effectiveAppVersion = useMemo(
    () => resolveEffectiveAppVersion(githubReleases),
    [githubReleases]
  );
  const [recapDrillTarget, setRecapDrillTarget] = useState<RecapDrillTarget>(null);
  const [chatBaselineReady, setChatBaselineReady] = useState<boolean>(false);
  const [isOperationalLoading, setIsOperationalLoading] = useState<boolean>(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
  const [schedules, setSchedules] = useState<ScheduleEventItem[]>([]);
  const [trashBin, setTrashBin] = useState<TrashRecordItem[]>([]);
  const [reportTemplate, setReportTemplate] = useState<ReportTemplateConfig>(DEFAULT_REPORT_TEMPLATE);
  const [couponConfig, setCouponConfig] = useState<CouponPrintConfig>(DEFAULT_COUPON_CONFIG);
  const [bastTemplate, setBastTemplate] = useState<BastTemplateConfig>(DEFAULT_BAST_TEMPLATE);
  const [proposalBastMap, setProposalBastMap] = useState<ProposalBastMap>({});
  const [publicKpmToken, setPublicKpmToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const val = params.get('kpm') || params.get('kpmQr');
      return val && val.trim() ? val.trim() : null;
    } catch {
      return null;
    }
  });
  const [kpmBastMap, setKpmBastMap] = useState<Record<string, KpmBastInfo>>({});
  const [proposalSlotMap, setProposalSlotMap] = useState<ProposalSlotMap>({});
  const [targetKpmFormSlot, setTargetKpmFormSlot] = useState<{
    proposalId: string;
    proposalName: string;
    tahun: string;
    slotNumber: number;
    item?: string;
  } | null>(null);
  const [presenceTickNow, setPresenceTickNow] = useState<number>(() => Date.now());
  const [userAliasesByOwner, setUserAliasesByOwner] = useState<
    Record<string, Record<string, string>>
  >({});

  const {
    isOnline,
    onlineVerified,
    isChecking: checkingInternet,
    checkConnection,
  } = useOnlineStatus();

  const wsRef = useRef<WebSocket | null>(null);
  const subViewRef = useRef<SubView>(subView);
  const activeChatPeerIdRef = useRef<string | null>(activeChatPeerId);
  const pushEnabledRef = useRef<boolean>(pushEnabled);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  const currentUserIdRef = useRef<string | null>(sessionUserId);
  const currentUserRoleRef = useRef<InternalUserRole | null>(null);
  const currentUserPresenceRef = useRef<UserPresenceStatus>('offline');
  const supabaseReadyRef = useRef<boolean>(supabaseReady);
  const isOnlineRef = useRef<boolean>(isOnline);
  const lastLocalSyncAtRef = useRef<number>(0);
  const activeLocalSyncCountRef = useRef<number>(0);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const desiredAutoPresenceRef = useRef<UserPresenceStatus>('online');
  const isManualRefreshingRef = useRef<boolean>(false);
  const hasAppliedRemoteRef = useRef<boolean>(false);
  const lastUpdateCheckAtRef = useRef<number>(0);
  const lastWebChangelogSyncAtRef = useRef<number>(0);
  const internalUsersRef = useRef<InternalUser[]>(internalUsers);
  const proposalsRef = useRef<ProposalRecord[]>(proposals);
  const proposalHistoryRef = useRef<ProposalKpmHistoryEntry[]>(proposalHistory);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const knownPendingUserIdsRef = useRef<Set<string> | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const notifiedDeletedProposalIdsRef = useRef<Set<string>>(new Set());
  const appAlertToastTimerRef = useRef<number | undefined>(undefined);
  const nativePushRequestedRef = useRef<boolean>(false);
  const kpmBastMapRef = useRef<Record<string, KpmBastInfo>>(kpmBastMap);
  const proposalSlotMapRef = useRef<ProposalSlotMap>(proposalSlotMap);
  const loadAppStateSlicesRef = useRef<() => Promise<void>>(async () => {});
  const currentUserAliasesRef = useRef<Record<string, string>>({});
  const isFlushingQueueRef = useRef<boolean>(false);
  const notifiedChatMsgIdsRef = useRef<Set<string>>(new Set());
  const initialMessagesHydratedRef = useRef<boolean>(false);
  const directMessagesRef = useRef<DirectChatMessage[]>(directMessages);
  const dismissedUpdateVersionRef = useRef<string | null>(dismissedUpdateVersion);
  const syncIncomingMessagesRef = useRef<() => Promise<void>>(async () => {});
  const openChatViewRef = useRef<(peerId?: string) => void>(() => {});
  const scrollMemoryRef = useRef<Record<string, number>>({});
  const activeScrollKeyRef = useRef<string>('tab:dashboard');
  const prevScrollKeyRef = useRef<string>('tab:dashboard');
  const pendingScrollModeRef = useRef<'top' | 'top-smooth' | 'restore' | null>(null);
  const isRestoringScrollRef = useRef<boolean>(false);
  const prevAuthenticatedRef = useRef<boolean>(false);

  kpmBastMapRef.current = kpmBastMap;
  proposalSlotMapRef.current = proposalSlotMap;
  directMessagesRef.current = directMessages;
  dismissedUpdateVersionRef.current = dismissedUpdateVersion;

  useEffect(() => {
    isOnlineRef.current = isOnline;
    if (isOnline) {
      window.dispatchEvent(new CustomEvent('masdeta-network-online'));
    }
  }, [isOnline]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let cancelled = false;

    const runBackgroundUpdateCheck = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastUpdateCheckAtRef.current < 60_000) return;
      lastUpdateCheckAtRef.current = now;
      try {
        const info = await checkForAppUpdate();
        if (!cancelled && info.hasUpdate) {
          setAppUpdateInfo(info);
          if (info.isMandatory || dismissedUpdateVersionRef.current !== info.latestVersion) {
            setIsUpdateModalOpen(true);
          }
        }
      } catch {
        // Abaikan error jaringan diam-diam; versi lama tetap terkunci jika cache update wajib sudah tercatat
      }
    };

    void runBackgroundUpdateCheck(true);

    const handleOnline = () => {
      void runBackgroundUpdateCheck(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runBackgroundUpdateCheck(false);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return;
    }

    let cancelled = false;

    const syncWebReleases = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastWebChangelogSyncAtRef.current < 120_000) return;
      lastWebChangelogSyncAtRef.current = now;
      try {
        const latest = await fetchGithubReleasesChangelog();
        if (!cancelled && latest.length > 0) {
          setGithubReleases(latest);
        }
      } catch {
        // Gunakan cache lokal / fallback changelog bawaan jika offline
      }
    };

    void syncWebReleases(true);

    const handleOnline = () => {
      void syncWebReleases(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncWebReleases(false);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleManualCheckAppUpdate = async () => {
    if (!Capacitor.isNativePlatform()) {
      setFeedback({
        type: 'success',
        message: `Versi Web MASDETA otomatis mengikuti rilis terbaru (v${effectiveAppVersion}).`,
      });
      return;
    }
    if (checkingAppUpdate) return;
    setCheckingAppUpdate(true);
    setDismissedUpdateVersion(null);
    dismissedUpdateVersionRef.current = null;
    try {
      const info = await checkForAppUpdate();
      if (info.hasUpdate) {
        setAppUpdateInfo(info);
        setIsUpdateModalOpen(true);
      } else {
        setFeedback({
          type: 'success',
          message: `Aplikasi MASDETA sudah versi terbaru (v${APP_VERSION}).`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Gagal memeriksa pembaruan aplikasi. Periksa koneksi internet Anda.',
      });
    } finally {
      setCheckingAppUpdate(false);
    }
  };
  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  subViewRef.current = subView;
  activeChatPeerIdRef.current = activeChatPeerId;
  pushEnabledRef.current = pushEnabled;
  sessionTokenRef.current = sessionToken;
  supabaseReadyRef.current = supabaseReady;
  internalUsersRef.current = internalUsers;
  proposalsRef.current = proposals;
  proposalHistoryRef.current = proposalHistory;

  const currentUser = useMemo(() => {
    if (!sessionUserId) return null;
    return internalUsers.find((u) => u.id === sessionUserId && u.status === 'active') ?? null;
  }, [internalUsers, sessionUserId]);
  const effectiveInternalUsers = useMemo(
    () => withEffectiveUserPresence(internalUsers, currentUser?.id, presenceTickNow),
    [internalUsers, currentUser?.id, presenceTickNow]
  );
  currentUserIdRef.current = currentUser?.id ?? null;
  currentUserRoleRef.current = currentUser?.role ?? null;
  currentUserPresenceRef.current = currentUser?.presenceStatus ?? 'offline';

  const messagesWithDelivery = useMemo(() => {
    if (!chatDeliveryWatermarks || Object.keys(chatDeliveryWatermarks).length === 0) {
      return directMessages.map((m) =>
        m.readAt && !m.deliveredAt ? { ...m, deliveredAt: m.readAt } : m
      );
    }
    return directMessages.map((m) => {
      if (m.deliveredAt) return m;
      if (m.readAt) return { ...m, deliveredAt: m.readAt };
      const wm = chatDeliveryWatermarks[m.recipientId];
      if (!wm) return m;
      const wmTs = new Date(wm).getTime();
      const createdTs = new Date(m.createdAt).getTime();
      if (Number.isFinite(wmTs) && Number.isFinite(createdTs) && createdTs <= wmTs) {
        return { ...m, deliveredAt: wm };
      }
      return m;
    });
  }, [directMessages, chatDeliveryWatermarks]);

  const mergeFetchedInternalUsers = useCallback((fetchedUsers: InternalUser[]): InternalUser[] => {
    if (fetchedUsers.length === 0) return fetchedUsers;
    const uid = currentUserIdRef.current;
    if (!uid) return fetchedUsers;
    const targetPresence = desiredAutoPresenceRef.current;
    const nowIso = new Date().toISOString();
    let shouldHealRemoteOnline = false;

    const merged = fetchedUsers.map((u) => {
      if (u.id !== uid || u.presenceManual) return u;
      if (targetPresence === 'online' && u.presenceStatus !== 'online') {
        shouldHealRemoteOnline = true;
        return {
          ...u,
          presenceStatus: 'online' as UserPresenceStatus,
          lastActiveAt: nowIso,
        };
      }
      if (targetPresence === 'idle' && u.presenceStatus !== 'idle') {
        return {
          ...u,
          presenceStatus: 'idle' as UserPresenceStatus,
        };
      }
      return u;
    });

    if (shouldHealRemoteOnline && supabaseReadyRef.current && isOnlineRef.current) {
      void supabaseSetUserPresence(uid, 'online', false);
    }
    return merged;
  }, []);

  const pushAppNotification = useCallback(
    (
      notif: AppNotificationItem,
      options?: { showToast?: boolean; playSound?: boolean; push?: boolean }
    ) => {
      // Notifikasi pendaftaran user baru HANYA untuk SuperAdmin
      if (notif.type === 'user_registered' && currentUserRoleRef.current !== 'SuperAdmin') {
        return;
      }
      if (seenNotificationIdsRef.current.has(notif.id)) return;
      seenNotificationIdsRef.current.add(notif.id);

      setAppNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 25);
      });

      if (options?.showToast !== false) {
        setAppAlertToast(notif);
        if (appAlertToastTimerRef.current) {
          window.clearTimeout(appAlertToastTimerRef.current);
        }
        appAlertToastTimerRef.current = window.setTimeout(() => {
          setAppAlertToast((curr) => (curr?.id === notif.id ? null : curr));
        }, 6500);
      }

      if (options?.playSound !== false) {
        playMessageChime();
      }

      if (options?.push !== false && pushEnabledRef.current) {
        void triggerPushNotification(notif.title, notif.message);
      }
    },
    []
  );

  const latestDataRef = useRef<OperationalDataPayload>({
    records,
    proposals,
    items,
    pengelolaList,
    pekerjaanList,
    wilayahList,
    proposalHistory,
    kpmAuditLogs,
  });
  latestDataRef.current = {
    records,
    proposals,
    items,
    pengelolaList,
    pekerjaanList,
    wilayahList,
    proposalHistory,
    kpmAuditLogs,
  };

  const activeProposal = useMemo(
    () => (activeProposalId ? proposals.find((p) => p.id === activeProposalId) ?? null : null),
    [activeProposalId, proposals]
  );

  const activeKpmRecord = useMemo(
    () => (activeKpmId ? records.find((r) => r.id === activeKpmId) ?? null : null),
    [activeKpmId, records]
  );

  const currentActor = useMemo(() => {
    return {
      nama: currentUser?.nama ?? 'Petugas Internal',
      email: currentUser?.email,
    };
  }, [currentUser]);

  const currentUserAliases = useMemo(() => {
    if (!currentUser) return {};
    return userAliasesByOwner[currentUser.id] || {};
  }, [userAliasesByOwner, currentUser]);

  currentUserAliasesRef.current = currentUserAliases;

  const urgentSchedulesCount = useMemo(() => {
    const limitDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return schedules.filter((s) => !s.completed && s.targetDate <= limitDate).length;
  }, [schedules]);

  const unreadChatCount = useMemo(() => {
    if (!currentUser) return 0;
    return directMessages.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
  }, [directMessages, currentUser]);

  useEffect(() => {
    setBellAckChatCount((prev) => (unreadChatCount < prev ? unreadChatCount : prev));
  }, [unreadChatCount]);

  const visibleUnreadAppNotifCount = useMemo(() => {
    if (!currentUser) return 0;
    return appNotifications.filter(
      (n) => !n.read && (n.type !== 'user_registered' || currentUser.role === 'SuperAdmin')
    ).length;
  }, [appNotifications, currentUser]);

  const bellHasUnread =
    visibleUnreadAppNotifCount > 0 || unreadChatCount > bellAckChatCount;

  const createActivityHistoryEntry = useCallback(
    (
      eventKey: string,
      params: {
        proposalName: string;
        detail: string;
        tahun?: string;
        action?: ProposalKpmHistoryEntry['action'];
        actorName?: string;
      }
    ): ProposalKpmHistoryEntry => ({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tahun: params.tahun || selectedYear || '2026',
      proposalName: params.proposalName,
      kpmId: '',
      kpmName: params.detail,
      registerCode: `ACTLOG::${eventKey}`,
      action: params.action || 'entered',
      fromProposal: currentUser?.role || 'Admin',
      toProposal: eventKey,
      actorName: params.actorName || currentActor.nama,
      timestamp: new Date().toISOString(),
    }),
    [currentActor.nama, currentUser?.role, selectedYear]
  );

  // Sinkronkan izin notifikasi native Android (Capacitor APK) & listener klik notifikasi
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let actionHandle: PluginListenerHandle | null = null;

    void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const senderId = event.notification?.extra?.senderId;
      if (senderId && currentUserIdRef.current) {
        openChatViewRef.current(String(senderId));
      } else if (currentUserIdRef.current) {
        openChatViewRef.current();
      }
    })
      .then((handle) => {
        if (cancelled) {
          void handle.remove();
        } else {
          actionHandle = handle;
        }
      })
      .catch(() => {});

    void LocalNotifications.checkPermissions()
      .then(async (perm) => {
        if (cancelled) return;
        const mapped: NotificationPermission =
          perm.display === 'granted'
            ? 'granted'
            : perm.display === 'denied'
              ? 'denied'
              : 'default';
        setPushPermission(mapped);
        if (mapped === 'granted') {
          await ensureAndroidNotificationChannel();
        } else if (
          currentUser &&
          pushEnabledRef.current &&
          perm.display !== 'denied' &&
          !nativePushRequestedRef.current
        ) {
          nativePushRequestedRef.current = true;
          const req = await LocalNotifications.requestPermissions();
          if (cancelled) return;
          const nextMapped: NotificationPermission =
            req.display === 'granted'
              ? 'granted'
              : req.display === 'denied'
                ? 'denied'
                : 'default';
          setPushPermission(nextMapped);
          if (nextMapped === 'granted') {
            await ensureAndroidNotificationChannel();
          }
        }
      })
      .catch(() => {});

    if (currentUser) {
      void consumePendingNotificationSender().then((senderId) => {
        if (!cancelled && senderId) {
          openChatViewRef.current(senderId);
        }
      });
    }

    return () => {
      cancelled = true;
      if (actionHandle) {
        void actionHandle.remove();
      }
    };
  }, [currentUser]);

  const pendingUsersCount = useMemo(
    () => internalUsers.filter((u) => u.status === 'pending').length,
    [internalUsers]
  );

  const hasPermission = useCallback(
    (perm: keyof UserPermissions): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'SuperAdmin') return true;
      return Boolean(currentUser.permissions?.[perm]);
    },
    [currentUser]
  );

  const requirePermission = useCallback(
    (perm: keyof UserPermissions, actionLabel: string): boolean => {
      if (hasPermission(perm)) return true;
      const permLabel = perm === 'add' ? 'ADD' : perm === 'update' ? 'UPDATE' : 'DELETE';
      setFeedback({
        type: 'error',
        message: `Izin ${permLabel} (${actionLabel}) dinonaktifkan oleh SuperAdmin untuk akun ${currentUser?.nama || 'Anda'}.`,
      });
      return false;
    },
    [hasPermission, currentUser]
  );

  const duplicateNikCount = useMemo(() => {
    const ktpGroups = new Map<string, KpmRecord[]>();
    const kkGroups = new Map<string, KpmRecord[]>();
    for (const r of records) {
      const ktp = (r.nikKtp || '').trim();
      const kk = (r.nikKk || '').trim();
      if (ktp) {
        const arr = ktpGroups.get(ktp) ?? [];
        arr.push(r);
        ktpGroups.set(ktp, arr);
      }
      if (kk) {
        const arr = kkGroups.get(kk) ?? [];
        arr.push(r);
        kkGroups.set(kk, arr);
      }
    }
    const involvesSelectedYear = (recs: KpmRecord[]) =>
      selectedYear === 'all' || recs.some((r) => (r.tahun || '').trim() === selectedYear);

    let dupes = 0;
    ktpGroups.forEach((recs) => {
      if (recs.length > 1 && involvesSelectedYear(recs)) dupes += 1;
    });
    kkGroups.forEach((recs) => {
      if (recs.length > 1 && involvesSelectedYear(recs)) dupes += 1;
    });
    return dupes;
  }, [records, selectedYear]);

  // Hydrate last known operational state from IndexedDB for reliable offline startup
  useEffect(() => {
    let cancelled = false;
    void loadIdbSnapshot()
      .then((snapshot) => {
        if (cancelled || hasAppliedRemoteRef.current) return;
        if (snapshot.customYears && snapshot.customYears.length > 0) {
          setCustomYears((prev) => Array.from(new Set([...prev, ...snapshot.customYears!])));
        }
        if (snapshot.proposals && (snapshot.proposals.length > 0 || latestDataRef.current.proposals.length === 0)) {
          setProposals(
            snapshot.proposals.map((prop) => {
              const docs = prop.documents || {};
              return {
                ...prop,
                checklist: {
                  docx: Boolean(docs.proposalOpd || docs.proposalLurahCamat),
                  dinas: Boolean(prop.checklist?.dinas),
                  dinasAt: prop.checklist?.dinasAt,
                  rab: Boolean(docs.rab),
                  rt: Boolean(docs.capRt),
                  rw: Boolean(docs.capRw),
                  lurah: Boolean(docs.capLurah),
                  camat: Boolean(docs.capCamat),
                },
              };
            })
          );
        }
        if (snapshot.items && snapshot.items.length > 0) {
          setItems(snapshot.items);
        }
        if (snapshot.pengelolaList && snapshot.pengelolaList.length > 0) {
          setPengelolaList(snapshot.pengelolaList);
        }
        if (snapshot.pekerjaanList && snapshot.pekerjaanList.length > 0) {
          setPekerjaanList(snapshot.pekerjaanList);
        }
        if (snapshot.wilayahList && snapshot.wilayahList.length > 0) {
          setWilayahList(snapshot.wilayahList);
        }
        if (snapshot.proposalHistory && snapshot.proposalHistory.length > 0) {
          setProposalHistory(snapshot.proposalHistory);
        }
        if (snapshot.kpmAuditLogs && snapshot.kpmAuditLogs.length > 0) {
          setKpmAuditLogs(snapshot.kpmAuditLogs);
        }
        if (snapshot.records && (snapshot.records.length > 0 || latestDataRef.current.records.length === 0)) {
          setRecords(
            snapshot.records.map((r) =>
              kpmBastMapRef.current[r.id] ? { ...r, bast: kpmBastMapRef.current[r.id] } : r
            )
          );
        }
        if (snapshot.internalUsers && snapshot.internalUsers.length > 0) {
          setInternalUsers(mergeFetchedInternalUsers(snapshot.internalUsers));
        }
        if (snapshot.directMessages && snapshot.directMessages.length > 0) {
          setDirectMessages((prev) => (prev.length === 0 ? snapshot.directMessages! : prev));
        }
      })
      .finally(() => {
        if (!cancelled) setIdbHydrated(true);
      });
    void getOfflineQueue().then((q) => {
      if (!cancelled) setOfflineQueueCount(q.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const savedLocal = saveKpmRecords(records);
    if (idbHydrated) {
      void saveIdbValue('records', records).then((savedIdb) => {
        if (!savedLocal && !savedIdb) {
          setFeedback({
            type: 'error',
            message: 'Penyimpanan lokal penuh. Hapus beberapa data lama untuk menyimpan berkas baru.',
          });
        }
      });
    } else if (!savedLocal && typeof window !== 'undefined' && !('indexedDB' in window)) {
      setFeedback({
        type: 'error',
        message: 'Penyimpanan lokal penuh. Hapus beberapa data lama untuk menyimpan berkas baru.',
      });
    }
  }, [records, idbHydrated]);

  useEffect(() => {
    savePengelolaList(pengelolaList);
    if (idbHydrated) void saveIdbValue('pengelolaList', pengelolaList);
  }, [pengelolaList, idbHydrated]);

  useEffect(() => {
    const savedLocal = saveProposals(proposals);
    if (idbHydrated) {
      void saveIdbValue('proposals', proposals).then((savedIdb) => {
        if (!savedLocal && !savedIdb) {
          setFeedback({
            type: 'error',
            message:
              'Penyimpanan lokal penuh saat menyimpan data proposal. Gunakan file berukuran lebih ringkas.',
          });
        }
      });
    }
  }, [proposals, idbHydrated]);

  useEffect(() => {
    saveProposalHistory(proposalHistory);
    if (idbHydrated) void saveIdbValue('proposalHistory', proposalHistory);
  }, [proposalHistory, idbHydrated]);

  useEffect(() => {
    saveKpmAuditLogs(kpmAuditLogs);
    if (idbHydrated) void saveIdbValue('kpmAuditLogs', kpmAuditLogs);
  }, [kpmAuditLogs, idbHydrated]);

  useEffect(() => {
    saveItemList(items);
    if (idbHydrated) void saveIdbValue('items', items);
  }, [items, idbHydrated]);

  useEffect(() => {
    savePekerjaanList(pekerjaanList);
    if (idbHydrated) void saveIdbValue('pekerjaanList', pekerjaanList);
  }, [pekerjaanList, idbHydrated]);

  useEffect(() => {
    saveWilayahList(wilayahList);
    if (idbHydrated) void saveIdbValue('wilayahList', wilayahList);
  }, [wilayahList, idbHydrated]);

  useEffect(() => {
    saveInternalUsers(internalUsers);
    if (idbHydrated) void saveIdbValue('internalUsers', internalUsers);
  }, [internalUsers, idbHydrated]);

  useEffect(() => {
    saveCustomYears(customYears);
    if (idbHydrated) void saveIdbValue('customYears', customYears);
  }, [customYears, idbHydrated]);

  useEffect(() => {
    if (idbHydrated && directMessages.length > 0) {
      void saveIdbValue('directMessages', directMessages);
    }
  }, [directMessages, idbHydrated]);

  useEffect(() => {
    if (!feedback) return;
    const delay = feedback.type === 'success' ? 3000 : 5000;
    const timer = window.setTimeout(() => setFeedback(null), delay);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    try {
      localStorage.setItem(APP_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(appNotifications));
    } catch {
      // Ignore storage write error
    }
  }, [appNotifications]);

  // Deteksi pendaftar user baru secara real-time -> HANYA SuperAdmin yang mendapat notifikasi
  useEffect(() => {
    if (!currentUser || !authReady) {
      knownPendingUserIdsRef.current = null;
      return;
    }

    // Pastikan Admin/Viewer tidak menyimpan sisa notifikasi atau toast pendaftaran user baru
    if (currentUser.role !== 'SuperAdmin') {
      setAppNotifications((prev) => {
        const filtered = prev.filter((n) => n.type !== 'user_registered');
        return filtered.length === prev.length ? prev : filtered;
      });
      setAppAlertToast((curr) => (curr?.type === 'user_registered' ? null : curr));
    }

    const pendingUsers = internalUsers.filter((u) => u.status === 'pending');
    if (knownPendingUserIdsRef.current === null) {
      knownPendingUserIdsRef.current = new Set(pendingUsers.map((u) => u.id));
      return;
    }

    const newlyPending = pendingUsers.filter((u) => !knownPendingUserIdsRef.current!.has(u.id));
    knownPendingUserIdsRef.current = new Set(pendingUsers.map((u) => u.id));

    if (newlyPending.length > 0 && currentUser.role === 'SuperAdmin') {
      for (const nu of newlyPending) {
        pushAppNotification({
          id: `notif-reg-${nu.id}`,
          type: 'user_registered',
          title: 'Pendaftar User Baru',
          message: `${nu.nama} (${nu.email}) mendaftar dan menunggu persetujuan SuperAdmin.`,
          createdAt: nu.registeredAt || new Date().toISOString(),
          read: false,
          targetAction: 'users',
        });
      }
    }
  }, [internalUsers, currentUser, authReady, pushAppNotification]);

  const markMessagesAsNotified = useCallback((uid: string, msgIds: string[]) => {
    if (!uid || msgIds.length === 0) return;
    let changed = false;
    for (const id of msgIds) {
      if (id && !notifiedChatMsgIdsRef.current.has(id)) {
        notifiedChatMsgIdsRef.current.add(id);
        changed = true;
      }
    }
    if (changed) {
      savePersistedNotifiedChatIds(uid, notifiedChatMsgIdsRef.current);
    }
  }, []);

  const seedChatNotificationBaseline = useCallback(
    (uid: string, userMsgs: DirectChatMessage[]) => {
      const persisted = loadPersistedNotifiedChatIds(uid);
      notifiedChatMsgIdsRef.current = persisted;
      const alreadyHandledIds = userMsgs
        .filter((m) => Boolean(m.readAt) || m.senderId === uid)
        .map((m) => m.id);
      markMessagesAsNotified(uid, alreadyHandledIds);
      prevMessageIdsRef.current = new Set(userMsgs.map((m) => m.id));
      initialMessagesHydratedRef.current = true;
      setChatBaselineReady(true);
    },
    [markMessagesAsNotified]
  );

  const clearSessionState = useCallback(() => {
    setSessionToken(null);
    setSessionUserId(null);
    setDirectMessages([]);
    setChatDeliveryWatermarks({});
    setActiveChatPeerId(null);
    setBellAckChatCount(0);
    notifiedChatMsgIdsRef.current.clear();
    prevMessageIdsRef.current.clear();
    initialMessagesHydratedRef.current = false;
    setChatBaselineReady(false);
    void clearNativeChatNotifier();
    try {
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
  }, []);

  const authFetch = useCallback(
    async (
      url: string,
      options: RequestInit = {},
      overrideToken?: string,
      preserveSessionOn401 = false
    ) => {
      const token = overrideToken ?? sessionTokenRef.current;
      const headers = new Headers(options.headers || undefined);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 && !preserveSessionOn401) {
        clearSessionState();
      }
      return res;
    },
    [clearSessionState]
  );

  const mergeBastIntoRecords = useCallback(
    (list: KpmRecord[], bastMap: Record<string, KpmBastInfo>): KpmRecord[] =>
      list.map((r) => (bastMap[r.id] ? { ...r, bast: bastMap[r.id] } : r)),
    []
  );

  const persistProposalSlotMap = useCallback(
    (nextSlotMap: ProposalSlotMap, recordsOverride?: KpmRecord[]) => {
      const refRecords = recordsOverride ?? latestDataRef.current.records;
      const cleanSlotMap =
        refRecords.length > 0
          ? sanitizeProposalSlotMap(nextSlotMap, refRecords, proposalsRef.current)
          : nextSlotMap;
      proposalSlotMapRef.current = cleanSlotMap;
      setProposalSlotMap(cleanSlotMap);
      void saveAppStateSlice('masdeta_proposal_slots_v1', cleanSlotMap);
    },
    []
  );

  const loadAppStateSlices = useCallback(async () => {
    try {
      const [
        fetchedSchedules,
        fetchedTrash,
        fetchedTemplate,
        fetchedCouponConfig,
        fetchedBastTemplate,
        fetchedBastMap,
        fetchedWatermarks,
        fetchedAliases,
        fetchedSlotMap,
        fetchedProposalBastMap,
      ] = await Promise.all([
        fetchAppStateSlice<ScheduleEventItem[]>('masdeta_schedules_v1', []),
        fetchAppStateSlice<TrashRecordItem[]>('masdeta_trash_bin_v1', []),
        fetchAppStateSlice<ReportTemplateConfig>(
          'masdeta_report_template_v1',
          DEFAULT_REPORT_TEMPLATE
        ),
        fetchAppStateSlice<CouponPrintConfig>(
          'masdeta_coupon_config_v1',
          DEFAULT_COUPON_CONFIG
        ),
        fetchAppStateSlice<BastTemplateConfig>(
          'masdeta_bast_template_v1',
          DEFAULT_BAST_TEMPLATE
        ),
        fetchAppStateSlice<Record<string, KpmBastInfo>>('masdeta_kpm_bast_v1', {}),
        fetchChatDeliveryWatermarks(),
        fetchAppStateSlice<Record<string, Record<string, string>>>('masdeta_user_aliases_v1', {}),
        fetchAppStateSlice<ProposalSlotMap>('masdeta_proposal_slots_v1', {}),
        fetchAppStateSlice<ProposalBastMap>('masdeta_proposal_bast_v1', {}),
      ]);

      const nowMs = Date.now();
      const rawTrash = Array.isArray(fetchedTrash) ? fetchedTrash : [];
      const expiredTrash = rawTrash.filter((t) => new Date(t.expiresAt).getTime() <= nowMs);
      const activeTrash = rawTrash.filter((t) => new Date(t.expiresAt).getTime() > nowMs);

      if (expiredTrash.length > 0) {
        const docsToRemove: KpmDocumentFile[] = [];
        for (const item of expiredTrash) {
          if (item.kpmRecord) {
            const d = item.kpmRecord.documents;
            if (d.ktp) docsToRemove.push(d.ktp);
            if (d.kk) docsToRemove.push(d.kk);
            if (d.penerima) docsToRemove.push(d.penerima);
            if (d.survey) docsToRemove.push(d.survey);
            (d.rumah || []).forEach((x) => docsToRemove.push(x));
            (d.lainnya || []).forEach((x) => docsToRemove.push(x));
            if (item.kpmRecord.bast?.signatureDoc) {
              docsToRemove.push(item.kpmRecord.bast.signatureDoc);
            }
          }
          if (item.proposalRecord) {
            Object.values(item.proposalRecord.documents || {}).forEach((doc) => {
              if (doc) docsToRemove.push(doc);
            });
          }
        }
        if (docsToRemove.length > 0) {
          void Promise.allSettled(docsToRemove.map((doc) => removeDocumentFromDrive(doc)));
        }
        void saveAppStateSlice('masdeta_trash_bin_v1', activeTrash);
      }

      const safeBastMap =
        fetchedBastMap && typeof fetchedBastMap === 'object' ? fetchedBastMap : {};
      const rawSlotMap: ProposalSlotMap =
        fetchedSlotMap && typeof fetchedSlotMap === 'object' && !Array.isArray(fetchedSlotMap)
          ? fetchedSlotMap
          : {};
      const safeSlotMap: ProposalSlotMap =
        latestDataRef.current.records.length > 0
          ? sanitizeProposalSlotMap(rawSlotMap, latestDataRef.current.records, proposalsRef.current)
          : rawSlotMap;
      kpmBastMapRef.current = safeBastMap;
      proposalSlotMapRef.current = safeSlotMap;
      setSchedules(Array.isArray(fetchedSchedules) ? fetchedSchedules : []);
      setTrashBin(activeTrash);
      setReportTemplate(
        fetchedTemplate && typeof fetchedTemplate === 'object'
          ? { ...DEFAULT_REPORT_TEMPLATE, ...fetchedTemplate }
          : DEFAULT_REPORT_TEMPLATE
      );
      setCouponConfig(
        fetchedCouponConfig && typeof fetchedCouponConfig === 'object'
          ? { ...DEFAULT_COUPON_CONFIG, ...fetchedCouponConfig }
          : DEFAULT_COUPON_CONFIG
      );
      setBastTemplate(
        fetchedBastTemplate && typeof fetchedBastTemplate === 'object'
          ? { ...DEFAULT_BAST_TEMPLATE, ...fetchedBastTemplate }
          : DEFAULT_BAST_TEMPLATE
      );
      setKpmBastMap(safeBastMap);
      setProposalSlotMap(safeSlotMap);
      setProposalBastMap(
        fetchedProposalBastMap &&
          typeof fetchedProposalBastMap === 'object' &&
          !Array.isArray(fetchedProposalBastMap)
          ? fetchedProposalBastMap
          : {}
      );
      if (fetchedWatermarks && typeof fetchedWatermarks === 'object') {
        setChatDeliveryWatermarks(fetchedWatermarks);
      }
      if (fetchedAliases && typeof fetchedAliases === 'object' && !Array.isArray(fetchedAliases)) {
        setUserAliasesByOwner(fetchedAliases);
      }
      setRecords((prev) =>
        mergeBastIntoRecords(
          recalculateProposalRegisterCodes(
            prev,
            proposalsRef.current,
            latestDataRef.current.items,
            latestDataRef.current.wilayahList,
            safeSlotMap
          ),
          safeBastMap
        )
      );
    } catch {
      // Abaikan gangguan sementara saat memuat slice tambahan
    }
  }, [mergeBastIntoRecords]);

  loadAppStateSlicesRef.current = loadAppStateSlices;

  const applyRemoteOperationalState = useCallback(
    (state: Partial<OperationalDataPayload>) => {
      hasAppliedRemoteRef.current = true;
      const rawProposals = Array.isArray(state.proposals)
        ? state.proposals
        : latestDataRef.current.proposals;
      const nextProposals = rawProposals.filter((p) => !isLegacyDummyProposal(p));
      const nextItems = Array.isArray(state.items) ? state.items : latestDataRef.current.items;
      const nextWilayah = Array.isArray(state.wilayahList)
        ? state.wilayahList
        : latestDataRef.current.wilayahList;
      const rawRecords = (Array.isArray(state.records)
        ? state.records
        : latestDataRef.current.records
      ).map((r) => normalizeKpmRouting(r, nextProposals, nextWilayah));

      setProposals(nextProposals);
      setItems(nextItems);
      setWilayahList(nextWilayah);
      const recalculated = recalculateProposalRegisterCodes(
        rawRecords,
        nextProposals,
        nextItems,
        nextWilayah,
        proposalSlotMapRef.current
      );
      setRecords(mergeBastIntoRecords(recalculated, kpmBastMapRef.current));
      if (Array.isArray(state.pengelolaList)) setPengelolaList(state.pengelolaList);
      if (Array.isArray(state.pekerjaanList)) setPekerjaanList(state.pekerjaanList);
      if (Array.isArray(state.proposalHistory)) setProposalHistory(state.proposalHistory);
      if (Array.isArray(state.kpmAuditLogs)) setKpmAuditLogs(state.kpmAuditLogs);
    },
    [mergeBastIntoRecords]
  );

  const loadOrBootstrapOperationalData = useCallback(
    async (
      token: string,
      actor?: { nama: string; email?: string },
      useSupabaseOverride?: boolean
    ) => {
      const useSupabase = useSupabaseOverride ?? supabaseReadyRef.current;
      setIsOperationalLoading(true);
      void loadAppStateSlices();

      try {
        if (useSupabase) {
          try {
            const snapshot = await fetchOperationalDataFromSupabase();
            applyRemoteOperationalState({
              records: snapshot.records,
              proposals: snapshot.proposals,
              items: snapshot.items,
              pekerjaanList: snapshot.pekerjaanList,
              wilayahList:
                snapshot.wilayahList.length > 0
                  ? snapshot.wilayahList
                  : latestDataRef.current.wilayahList,
              pengelolaList: snapshot.pengelolaList,
              proposalHistory: snapshot.proposalHistory,
              kpmAuditLogs: snapshot.kpmAuditLogs,
            });
            return;
          } catch (err) {
            if (isSchemaMissingError(err)) {
              setSupabaseSchemaMissing(true);
              setSupabaseReady(false);
            } else {
              console.error('Supabase operational load error:', err);
            }
          }
        }

        try {
          const res = await authFetch('/api/data/state', {}, token);
          if (!res.ok) return;
          const remote = (await res.json()) as OperationalDataPayload;
          if (remote.initialized) {
            applyRemoteOperationalState(remote);
            return;
          }

          let seedPayload: OperationalDataPayload = { ...latestDataRef.current };
          const SEED_FLAG_KEY = 'masdeta_csv_seed_ptk_kota_2026_v1';
          let seedDone = false;
          try {
            seedDone = localStorage.getItem(SEED_FLAG_KEY) === 'done';
          } catch {
            seedDone = false;
          }

          if (seedPayload.records.length === 0 && !seedDone) {
            try {
              const csvRes = await fetch('/assets/aistudio/Kecamatan_Pontianak_Kota_2026_ab18452d.csv');
              if (csvRes.ok) {
                const csvText = await csvRes.text();
                if (csvText) {
                  const imported = importProposalKpmFromCsv({
                    csvText,
                    existingRecords: seedPayload.records,
                    existingProposals: seedPayload.proposals,
                    existingPengelolaList: seedPayload.pengelolaList,
                    existingPekerjaanList: seedPayload.pekerjaanList,
                    items: seedPayload.items,
                    wilayahList: seedPayload.wilayahList,
                    actorName: actor?.nama ?? 'SuperAdmin',
                    actorEmail: actor?.email,
                  });
                  if (imported.importedRecordsCount > 0) {
                    seedPayload = {
                      ...seedPayload,
                      records: imported.nextRecords,
                      proposals: imported.nextProposals,
                      pengelolaList: imported.nextPengelolaList,
                      pekerjaanList: imported.nextPekerjaanList,
                      kpmAuditLogs: [...imported.newAuditLogs, ...seedPayload.kpmAuditLogs],
                      proposalHistory: [...imported.newProposalHistory, ...seedPayload.proposalHistory],
                    };
                    try {
                      localStorage.setItem(SEED_FLAG_KEY, 'done');
                    } catch {
                      // Ignore storage write error
                    }
                  }
                }
              }
            } catch {
              // Ignore CSV seed error
            }
          }

          const bootRes = await authFetch(
            '/api/data/bootstrap',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(seedPayload),
            },
            token
          );
          if (bootRes.ok) {
            const bootData = (await bootRes.json()) as { state?: OperationalDataPayload };
            if (bootData.state) {
              applyRemoteOperationalState(bootData.state);
            }
          }
        } catch {
          // Fallback ke state lokal jika server data sementara tidak terjangkau
        }
      } finally {
        setIsOperationalLoading(false);
      }
    },
    [authFetch, applyRemoteOperationalState, loadAppStateSlices]
  );

  const enqueueOperationalSync = useCallback((task: () => Promise<boolean>): Promise<boolean> => {
    activeLocalSyncCountRef.current += 1;
    lastLocalSyncAtRef.current = Date.now();
    const run = syncQueueRef.current.then(async () => {
      lastLocalSyncAtRef.current = Date.now();
      try {
        return await task();
      } finally {
        lastLocalSyncAtRef.current = Date.now();
        activeLocalSyncCountRef.current = Math.max(0, activeLocalSyncCountRef.current - 1);
      }
    });
    syncQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }, []);

  const runSupabaseMutation = useCallback(
    async (task: () => Promise<unknown>, errorPrefix: string): Promise<boolean> => {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
        setFeedback({
          type: 'error',
          message: 'Aksi ditolak: Aplikasi MASDETA wajib terhubung ke internet aktif.',
        });
        return false;
      }
      return enqueueOperationalSync(async () => {
        try {
          await task();
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Gagal menyimpan perubahan ke Supabase.';
          setFeedback({
            type: 'error',
            message: `${errorPrefix}: ${msg}`,
          });
          return false;
        }
      });
    },
    [enqueueOperationalSync]
  );

  const syncOperationalData = useCallback(
    async (
      patch: Partial<OperationalDataPayload>,
      requiredPermission: keyof UserPermissions
    ): Promise<boolean> => {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
        setFeedback({
          type: 'error',
          message: 'Aksi ditolak: Aplikasi MASDETA wajib terhubung ke internet aktif.',
        });
        return false;
      }
      if (!sessionTokenRef.current && !supabaseReadyRef.current) return false;

      return enqueueOperationalSync(async () => {
        const merged: OperationalDataPayload = {
          ...latestDataRef.current,
          ...patch,
        };

        if (!sessionTokenRef.current) return false;
        try {
          const res = await authFetch('/api/data/sync', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...merged,
              requiredPermission,
            }),
          });
          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { error?: string };
            setFeedback({
              type: 'error',
              message: errData.error || 'Gagal menyimpan perubahan ke server.',
            });
            return false;
          }
          return true;
        } catch {
          setFeedback({
            type: 'error',
            message: 'Koneksi ke server terputus. Perubahan belum tersinkron ke pengguna lain.',
          });
          return false;
        }
      });
    },
    [authFetch, enqueueOperationalSync]
  );

  // Sinkronisasi awal Supabase / Server: status schema, user, pesan 1-on-1 & data operasional
  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      let useSupabase = false;
      if (isSupabaseConfigured) {
        const check = await checkSupabaseSchemaReady();
        if (cancelled) return;
        if (check.ready) {
          useSupabase = true;
          setSupabaseReady(true);
          setSupabaseSchemaMissing(false);
        } else {
          setSupabaseReady(false);
          setSupabaseSchemaMissing(check.schemaMissing);
        }
      }

      if (useSupabase) {
        try {
          const users = await supabaseFetchInternalUsers();
          if (cancelled) return;
          if (users.length > 0) {
            const activeTarget = users.find((u) => u.id === sessionUserId && u.status === 'active');
            const nowIso = new Date().toISOString();
            setInternalUsers(
              activeTarget && !activeTarget.presenceManual
                ? users.map((u) =>
                    u.id === activeTarget.id
                      ? { ...u, presenceStatus: 'online', lastActiveAt: nowIso }
                      : u
                  )
                : users
            );
          }

          if (!sessionUserId) {
            setIsOperationalLoading(false);
            setAuthReady(true);
            return;
          }

          const activeUser = users.find((u) => u.id === sessionUserId && u.status === 'active');
          if (!activeUser) {
            clearSessionState();
            setIsOperationalLoading(false);
            setAuthReady(true);
            return;
          }

          if (!activeUser.presenceManual) {
            desiredAutoPresenceRef.current = 'online';
            await supabaseSetUserPresence(activeUser.id, 'online', false);
          }

          const [msgs, watermarks] = await Promise.all([
            supabaseFetchDirectMessages(),
            fetchChatDeliveryWatermarks(),
          ]);
          if (cancelled) return;
          const userMsgs = msgs.filter(
            (m) => m.senderId === activeUser.id || m.recipientId === activeUser.id
          );
          seedChatNotificationBaseline(activeUser.id, userMsgs);
          setChatDeliveryWatermarks(watermarks);
          setDirectMessages(userMsgs);

          const incomingForUser = userMsgs.filter((m) => m.recipientId === activeUser.id);
          if (incomingForUser.length > 0) {
            const latestIncoming = incomingForUser[incomingForUser.length - 1];
            const prevWmTs = watermarks[activeUser.id]
              ? new Date(watermarks[activeUser.id]).getTime()
              : 0;
            const latestTs = new Date(latestIncoming.createdAt).getTime();
            const undeliveredIds = incomingForUser
              .filter((m) => !m.deliveredAt)
              .map((m) => m.id);
            if (undeliveredIds.length > 0 || latestTs > prevWmTs) {
              void supabaseMarkDirectMessagesDelivered(
                activeUser.id,
                latestIncoming.createdAt,
                undeliveredIds
              )
                .then((nextWm) => {
                  if (!cancelled) setChatDeliveryWatermarks(nextWm);
                })
                .catch(() => {});
            }
          }

          if (!sessionToken) {
            const supaTok = `supabase-session-${activeUser.id}`;
            setSessionToken(supaTok);
            try {
              localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, supaTok);
            } catch {
              // Ignore
            }
          }

          await loadOrBootstrapOperationalData(
            sessionToken || `supabase-session-${activeUser.id}`,
            activeUser,
            true
          );
        } catch (err) {
          console.error('Supabase initial sync error:', err);
          setIsOperationalLoading(false);
        } finally {
          if (!cancelled) setAuthReady(true);
        }
        return;
      }

      if (!sessionToken) {
        if (sessionUserId) {
          clearSessionState();
        }
        setIsOperationalLoading(false);
        setAuthReady(true);
        return;
      }

      authFetch('/api/collab/state', {}, sessionToken)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Sync gagal'))))
        .then(
          async (data: {
            user?: InternalUser | null;
            users?: InternalUser[];
            messages?: DirectChatMessage[];
          }) => {
            if (cancelled) return;
            if (!data.user || data.user.status !== 'active') {
              clearSessionState();
              return;
            }
            if (Array.isArray(data.users) && data.users.length > 0) {
              setInternalUsers(mergeFetchedInternalUsers(data.users));
            }
            if (Array.isArray(data.messages)) {
              seedChatNotificationBaseline(data.user.id, data.messages);
              setDirectMessages(data.messages);
            }
            setSessionUserId(data.user.id);
            try {
              localStorage.setItem(SESSION_STORAGE_KEY, data.user.id);
            } catch {
              // Ignore
            }
            await loadOrBootstrapOperationalData(sessionToken, data.user, false);
          }
        )
        .catch(() => {
          // Fallback diam-diam jika offline sementara
        })
        .finally(() => {
          if (!cancelled) setAuthReady(true);
        });
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [
    sessionToken,
    authFetch,
    clearSessionState,
    loadOrBootstrapOperationalData,
    sessionUserId,
    seedChatNotificationBaseline,
  ]);

  const handleMarkChatRead = useCallback(
    async (peerId: string) => {
      if (!currentUser || !peerId) return;
      const incomingFromPeer = directMessagesRef.current.filter(
        (m) => m.senderId === peerId && m.recipientId === currentUser.id
      );
      const incomingIds = incomingFromPeer.map((m) => m.id);
      if (incomingIds.length > 0) {
        markMessagesAsNotified(currentUser.id, incomingIds);
        const latestIncoming = incomingFromPeer[incomingFromPeer.length - 1];
        void markNativeNotifiedIds(incomingIds, latestIncoming?.createdAt);
      }

      const hasUnread = incomingFromPeer.some((m) => !m.readAt);
      if (!hasUnread && initialMessagesHydratedRef.current) return;

      const now = new Date().toISOString();
      if (hasUnread) {
        setDirectMessages((prev) =>
          prev.map((m) =>
            m.senderId === peerId && m.recipientId === currentUser.id && !m.readAt
              ? { ...m, deliveredAt: m.deliveredAt || now, readAt: now }
              : m
          )
        );
      }

      if (supabaseReadyRef.current) {
        try {
          const sorted = [currentUser.id, peerId].sort();
          await supabaseMarkDirectMessagesRead(`${sorted[0]}::${sorted[1]}`, currentUser.id);
        } catch {
          // Abaikan jika offline sementara
        }
        return;
      }

      try {
        await authFetch('/api/chat/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId }),
        });
      } catch {
        // Abaikan jika offline sementara
      }
    },
    [currentUser, authFetch, markMessagesAsNotified]
  );

  const handleManualRefresh = useCallback(async () => {
    if (isManualRefreshingRef.current) return;
    isManualRefreshingRef.current = true;
    try {
      const uid = currentUserIdRef.current;
      if (supabaseReadyRef.current) {
        const [snapshot, users, msgs] = await Promise.all([
          fetchOperationalDataFromSupabase(),
          supabaseFetchInternalUsers(),
          supabaseFetchDirectMessages(),
          loadAppStateSlices(),
        ]);

        applyRemoteOperationalState({
          records: snapshot.records,
          proposals: snapshot.proposals,
          items: snapshot.items,
          pekerjaanList: snapshot.pekerjaanList,
          wilayahList:
            snapshot.wilayahList.length > 0
              ? snapshot.wilayahList
              : latestDataRef.current.wilayahList,
          pengelolaList: snapshot.pengelolaList,
          proposalHistory: snapshot.proposalHistory,
          kpmAuditLogs: snapshot.kpmAuditLogs,
        });

        if (users.length > 0) {
          setInternalUsers(mergeFetchedInternalUsers(users));
          if (uid) {
            const refreshedUser = users.find((u) => u.id === uid);
            if (!refreshedUser || refreshedUser.status !== 'active') {
              clearSessionState();
              return;
            }
          }
        }

        if (uid) {
          const userMsgs = msgs.filter((m) => m.senderId === uid || m.recipientId === uid);
          seedChatNotificationBaseline(uid, userMsgs);
          setDirectMessages(userMsgs);
        }

        setFeedback({
          type: 'success',
          message: 'Data terbaru berhasil dimuat ulang.',
        });
        return;
      }

      if (sessionTokenRef.current) {
        const [stateRes, collabRes] = await Promise.all([
          authFetch('/api/data/state'),
          authFetch('/api/collab/state'),
        ]);
        if (stateRes.ok) {
          const remote = (await stateRes.json()) as OperationalDataPayload;
          if (remote.initialized) {
            applyRemoteOperationalState(remote);
          }
        }
        if (collabRes.ok) {
          const collab = (await collabRes.json()) as {
            user?: InternalUser | null;
            users?: InternalUser[];
            messages?: DirectChatMessage[];
          };
          if (Array.isArray(collab.users) && collab.users.length > 0) {
            setInternalUsers(mergeFetchedInternalUsers(collab.users));
          }
          if (Array.isArray(collab.messages)) {
            setDirectMessages(collab.messages);
          }
        }
        setFeedback({
          type: 'success',
          message: 'Data berhasil disegarkan.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal memuat ulang data. Periksa koneksi internet Anda.',
      });
    } finally {
      isManualRefreshingRef.current = false;
    }
  }, [applyRemoteOperationalState, authFetch, clearSessionState]);

  // Supabase Realtime Multi-Admin Sync (saat supabaseReady = true)
  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid || !supabaseReady) return;

    let refreshTimer: number | undefined;
    let toastTimer: number | undefined;

    const scheduleOperationalRefresh = () => {
      if (activeLocalSyncCountRef.current > 0 || Date.now() - lastLocalSyncAtRef.current < 4000) {
        return;
      }
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(async () => {
        if (activeLocalSyncCountRef.current > 0 || Date.now() - lastLocalSyncAtRef.current < 4000) {
          return;
        }
        try {
          const snapshot = await fetchOperationalDataFromSupabase();
          if (activeLocalSyncCountRef.current > 0 || Date.now() - lastLocalSyncAtRef.current < 4000) {
            return;
          }
          applyRemoteOperationalState({
            records: snapshot.records,
            proposals: snapshot.proposals,
            items: snapshot.items.length > 0 ? snapshot.items : latestDataRef.current.items,
            pekerjaanList:
              snapshot.pekerjaanList.length > 0
                ? snapshot.pekerjaanList
                : latestDataRef.current.pekerjaanList,
            wilayahList:
              snapshot.wilayahList.length > 0
                ? snapshot.wilayahList
                : latestDataRef.current.wilayahList,
            pengelolaList: snapshot.pengelolaList,
            proposalHistory: snapshot.proposalHistory,
            kpmAuditLogs: snapshot.kpmAuditLogs,
          });
        } catch {
          // Abaikan gangguan jaringan sementara
        }
      }, 600);
    };

    let disposed = false;

    const syncMessagesFromSupabase = async () => {
      try {
        const [all, watermarks] = await Promise.all([
          supabaseFetchDirectMessages(),
          fetchChatDeliveryWatermarks(),
        ]);
        if (disposed) return;

        const mine = all.filter((m) => m.senderId === uid || m.recipientId === uid);
        const wasHydrated = initialMessagesHydratedRef.current;
        if (!wasHydrated) {
          seedChatNotificationBaseline(uid, mine);
        }
        const newIncoming = wasHydrated
          ? mine.filter(
              (m) => m.recipientId === uid && !m.readAt && !prevMessageIdsRef.current.has(m.id)
            )
          : [];
        prevMessageIdsRef.current = new Set(mine.map((m) => m.id));
        setChatDeliveryWatermarks(watermarks);
        setDirectMessages(mine);

        // Tandai pesan masuk sebagai "terkirim / masuk ke perangkat penerima" (centang 2)
        const incomingForMe = mine.filter((m) => m.recipientId === uid);
        if (incomingForMe.length > 0) {
          const latestIncoming = incomingForMe[incomingForMe.length - 1];
          const prevWmTs = watermarks[uid] ? new Date(watermarks[uid]).getTime() : 0;
          const latestTs = new Date(latestIncoming.createdAt).getTime();
          const undeliveredIds = incomingForMe.filter((m) => !m.deliveredAt).map((m) => m.id);
          if (undeliveredIds.length > 0 || latestTs > prevWmTs) {
            void supabaseMarkDirectMessagesDelivered(uid, latestIncoming.createdAt, undeliveredIds)
              .then((nextWm) => {
                if (!disposed) setChatDeliveryWatermarks(nextWm);
                const nowIso = nextWm[uid] || new Date().toISOString();
                void realtimeChannelRef.current?.send({
                  type: 'broadcast',
                  event: 'chat:delivered',
                  payload: {
                    recipientId: uid,
                    deliveredAt: nowIso,
                    messageIds: undeliveredIds,
                  },
                });
              })
              .catch(() => {});
          }
        }

        const latestNew = newIncoming[newIncoming.length - 1];
        if (latestNew) {
          const isViewingThread =
            subViewRef.current === 'chat' &&
            activeChatPeerIdRef.current === latestNew.senderId &&
            document.visibilityState === 'visible';

          if (isViewingThread) {
            const readAtNow = new Date().toISOString();
            const incomingIds = newIncoming.map((m) => m.id);
            const incomingIdSet = new Set(incomingIds);
            setDirectMessages((prev) =>
              prev.map((m) =>
                incomingIdSet.has(m.id) ? { ...m, deliveredAt: m.deliveredAt || readAtNow, readAt: readAtNow } : m
              )
            );
            markMessagesAsNotified(uid, incomingIds);
            const sorted = [uid, latestNew.senderId].sort();
            void supabaseMarkDirectMessagesRead(`${sorted[0]}::${sorted[1]}`, uid);
            void markNativeNotifiedIds(incomingIds, latestNew.createdAt);
          } else {
            const unnotified = newIncoming.filter(
              (m) => !notifiedChatMsgIdsRef.current.has(m.id)
            );
            const newIncomingIds = newIncoming.map((m) => m.id);
            markMessagesAsNotified(uid, newIncomingIds);
            void markNativeNotifiedIds(newIncomingIds, latestNew.createdAt);

            if (unnotified.length > 0) {
              const targetMsg = unnotified[unnotified.length - 1];
              const sender = internalUsersRef.current.find((u) => u.id === targetMsg.senderId);
              const senderName =
                (currentUserAliasesRef.current[targetMsg.senderId] || '').trim() ||
                sender?.nama ||
                'Pengguna Internal';
              const senderRole = sender?.role || 'Admin';
              const displayMsgText =
                targetMsg.text ||
                (targetMsg.sharedKpm
                  ? `Kartu KPM: ${targetMsg.sharedKpm.nama} (${targetMsg.sharedKpm.proposal})`
                  : 'Pesan baru');

              const unreadFromSender = mine.filter(
                (m) => m.senderId === targetMsg.senderId && m.recipientId === uid && !m.readAt
              ).length;
              const notifCount = Math.max(1, unreadFromSender);
              const notifTitle = `${notifCount} pesan masuk dari ${senderName}`;

              playMessageChime();
              setIncomingToast({
                id: targetMsg.id,
                senderId: targetMsg.senderId,
                senderName,
                senderRole,
                text: displayMsgText,
              });
              if (toastTimer) window.clearTimeout(toastTimer);
              toastTimer = window.setTimeout(() => {
                setIncomingToast((curr) => (curr?.id === targetMsg.id ? null : curr));
              }, 6500);

              if (pushEnabledRef.current) {
                void triggerPushNotification(notifTitle, displayMsgText, {
                  senderId: targetMsg.senderId,
                  tag: `masdeta-chat-${targetMsg.senderId}`,
                });
              }
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    syncIncomingMessagesRef.current = syncMessagesFromSupabase;

    const channel = supabase
      .channel('masdeta-realtime-sync', {
        config: {
          broadcast: { self: false },
        },
      })
      .on('broadcast', { event: 'chat:delivered' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as {
          recipientId?: string;
          deliveredAt?: string;
          messageIds?: string[];
        };
        const recId = p.recipientId ? String(p.recipientId) : '';
        const deliveredAt = p.deliveredAt ? String(p.deliveredAt) : new Date().toISOString();
        if (recId) {
          setChatDeliveryWatermarks((prev) => {
            const prevTs = prev[recId] ? new Date(prev[recId]).getTime() : 0;
            const nextTs = new Date(deliveredAt).getTime();
            if (Number.isFinite(nextTs) && nextTs <= prevTs) return prev;
            return { ...prev, [recId]: deliveredAt };
          });
        }
        if (Array.isArray(p.messageIds) && p.messageIds.length > 0) {
          const ids = new Set(p.messageIds.map(String));
          setDirectMessages((prev) =>
            prev.map((m) => (ids.has(m.id) && !m.deliveredAt ? { ...m, deliveredAt } : m))
          );
        }
      })
      .on('broadcast', { event: 'app:notification' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as Record<string, unknown>;
        if (p.actorId && String(p.actorId) === currentUserIdRef.current) return;
        const notifId = String(p.id || '');
        const notifType = p.type === 'user_registered' ? 'user_registered' : 'proposal_deleted';
        if (notifType === 'user_registered' && currentUserRoleRef.current !== 'SuperAdmin') {
          return;
        }
        const proposalId = p.proposalId ? String(p.proposalId) : '';
        if (proposalId) {
          if (notifiedDeletedProposalIdsRef.current.has(proposalId)) return;
          notifiedDeletedProposalIdsRef.current.add(proposalId);
        }
        pushAppNotification({
          id: notifId || `notif-rt-${Date.now()}`,
          type: notifType,
          title: String(p.title || 'Notifikasi Sistem'),
          message: String(p.message || ''),
          actorName: p.actorName ? String(p.actorName) : undefined,
          createdAt: String(p.createdAt || new Date().toISOString()),
          read: false,
          targetAction: p.targetAction === 'users' ? 'users' : 'proposals',
        });
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_users' },
        () => {
          void supabaseFetchInternalUsers().then((users) => {
            if (users.length > 0) setInternalUsers(mergeFetchedInternalUsers(users));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_chat_messages' },
        () => {
          void syncMessagesFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpm_records' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpm_documents' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'proposals' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'proposals' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'proposals' },
        (payload) => {
          const oldRow = (payload.old || {}) as Record<string, unknown>;
          const deletedId = String(oldRow.id || '');
          const isLocalAction =
            activeLocalSyncCountRef.current > 0 || Date.now() - lastLocalSyncAtRef.current < 4000;
          if (deletedId && !isLocalAction && !notifiedDeletedProposalIdsRef.current.has(deletedId)) {
            const known = proposalsRef.current.find((p) => p.id === deletedId);
            const propName = String(oldRow.nama_proposal || known?.namaProposal || 'Proposal');
            const propYear = String(oldRow.tahun || known?.tahun || '');
            window.setTimeout(() => {
              if (notifiedDeletedProposalIdsRef.current.has(deletedId)) return;
              notifiedDeletedProposalIdsRef.current.add(deletedId);
              pushAppNotification({
                id: `notif-prop-del-${deletedId}`,
                type: 'proposal_deleted',
                title: 'Proposal Dihapus',
                message: `Proposal "${propName}"${propYear ? ` (${propYear})` : ''} telah dihapus.`,
                createdAt: new Date().toISOString(),
                read: false,
                targetAction: 'proposals',
              });
            }, 350);
          }
          scheduleOperationalRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_documents' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pengelola' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_bantuan' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_kpm_history' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpm_audit_logs' },
        scheduleOperationalRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'masdeta_app_state' },
        () => {
          void loadAppStateSlicesRef.current();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void syncMessagesFromSupabase();
        }
      });

    realtimeChannelRef.current = channel;

    const fallbackPollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncMessagesFromSupabase();
      }
    }, 12_000);

    return () => {
      disposed = true;
      window.clearInterval(fallbackPollId);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      syncIncomingMessagesRef.current = async () => {};
      void supabase.removeChannel(channel);
    };
  }, [
    currentUser?.id,
    supabaseReady,
    applyRemoteOperationalState,
    pushAppNotification,
    markMessagesAsNotified,
    seedChatNotificationBaseline,
  ]);

  // Koneksi WebSocket Real-time (Fallback saat schema Supabase belum dijalankan)
  useEffect(() => {
    const uid = currentUser?.id;
    const token = sessionToken;
    if (supabaseReady || !uid || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let closedByCleanup = false;
    let reconnectTimer: number | undefined;
    let toastTimer: number | undefined;

    const connect = () => {
      if (closedByCleanup) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token: sessionTokenRef.current || token }));
        window.dispatchEvent(new CustomEvent('masdeta-ws-open'));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (data.type === 'users:updated' && Array.isArray(data.users)) {
            setInternalUsers(mergeFetchedInternalUsers(data.users as InternalUser[]));
            return;
          }

          if (data.type === 'user:registered' && data.user) {
            if (currentUserRoleRef.current !== 'SuperAdmin') return;
            const nu = data.user as InternalUser;
            pushAppNotification({
              id: `notif-reg-${nu.id}`,
              type: 'user_registered',
              title: 'Pendaftar User Baru',
              message: `${nu.nama} (${nu.email}) mendaftar dan menunggu persetujuan SuperAdmin.`,
              createdAt: nu.registeredAt || new Date().toISOString(),
              read: false,
              targetAction: 'users',
            });
            return;
          }

          if (data.type === 'app:notification' && data.notification) {
            const notif = data.notification as AppNotificationItem;
            if (notif.type === 'user_registered' && currentUserRoleRef.current !== 'SuperAdmin') {
              return;
            }
            if (data.actorId && String(data.actorId) === currentUserIdRef.current) {
              return;
            }
            const propId = data.proposalId ? String(data.proposalId) : '';
            if (propId) {
              if (notifiedDeletedProposalIdsRef.current.has(propId)) return;
              notifiedDeletedProposalIdsRef.current.add(propId);
            }
            pushAppNotification({
              ...notif,
              read: false,
            });
            return;
          }

          if (data.type === 'data:updated' && data.state) {
            if (data.updatedBy && data.updatedBy === currentUserIdRef.current) {
              return;
            }
            applyRemoteOperationalState(data.state as Partial<OperationalDataPayload>);
            return;
          }

          if (data.type === 'chat:message' && data.message) {
            const msg = data.message as DirectChatMessage;
            const displayMsgText =
              msg.text ||
              (msg.sharedKpm
                ? `Kartu KPM: ${msg.sharedKpm.nama} (${msg.sharedKpm.proposal})`
                : 'Pesan baru');

            prevMessageIdsRef.current.add(msg.id);
            let nextUnreadFromSender = 1;
            setDirectMessages((prev) => {
              const updated = prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
              nextUnreadFromSender = Math.max(
                1,
                updated.filter(
                  (m) => m.senderId === msg.senderId && m.recipientId === uid && !m.readAt
                ).length
              );
              return updated;
            });

            if (msg.recipientId === uid) {
              const isViewingThread =
                subViewRef.current === 'chat' &&
                activeChatPeerIdRef.current === msg.senderId &&
                document.visibilityState === 'visible';

              void markNativeNotifiedIds([msg.id], msg.createdAt);

              if (isViewingThread) {
                markMessagesAsNotified(uid, [msg.id]);
                authFetch('/api/chat/read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ peerId: msg.senderId }),
                }).catch(() => {});
              } else {
                authFetch('/api/chat/delivered', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messageIds: [msg.id] }),
                }).catch(() => {});

                if (!notifiedChatMsgIdsRef.current.has(msg.id)) {
                  markMessagesAsNotified(uid, [msg.id]);
                  const senderName =
                    (currentUserAliasesRef.current[msg.senderId] || '').trim() ||
                    String(data.senderName || 'Pengguna Internal');
                  const senderRole = String(data.senderRole || 'Admin');
                  playMessageChime();
                  setIncomingToast({
                    id: msg.id,
                    senderId: msg.senderId,
                    senderName,
                    senderRole,
                    text: displayMsgText,
                  });
                  if (toastTimer) window.clearTimeout(toastTimer);
                  toastTimer = window.setTimeout(() => {
                    setIncomingToast((curr) => (curr?.id === msg.id ? null : curr));
                  }, 6500);

                  if (pushEnabledRef.current) {
                    void triggerPushNotification(
                      `${nextUnreadFromSender} pesan masuk dari ${senderName}`,
                      displayMsgText,
                      {
                        senderId: msg.senderId,
                        tag: `masdeta-chat-${msg.senderId}`,
                      }
                    );
                  }
                }
              }
            }
            return;
          }

          if (data.type === 'chat:delivered' && Array.isArray(data.messageIds)) {
            const ids = new Set(data.messageIds as string[]);
            const deliveredAt = String(data.deliveredAt || new Date().toISOString());
            setDirectMessages((prev) =>
              prev.map((m) => (ids.has(m.id) && !m.deliveredAt ? { ...m, deliveredAt } : m))
            );
            return;
          }

          if (data.type === 'chat:read' && Array.isArray(data.messageIds)) {
            const ids = new Set(data.messageIds as string[]);
            const readAt = String(data.readAt || new Date().toISOString());
            setDirectMessages((prev) =>
              prev.map((m) =>
                ids.has(m.id) ? { ...m, deliveredAt: m.deliveredAt || readAt, readAt } : m
              )
            );
            return;
          }

          if (data.type === 'chat:reset') {
            setDirectMessages([]);
          }
        } catch {
          // Abaikan payload tidak valid
        }
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    const syncCollabFromBackend = async () => {
      try {
        const res = await authFetch('/api/collab/state');
        if (!res.ok) return;
        const data = (await res.json()) as {
          users?: InternalUser[];
          messages?: DirectChatMessage[];
        };
        if (Array.isArray(data.users) && data.users.length > 0) {
          setInternalUsers(mergeFetchedInternalUsers(data.users));
        }
        if (Array.isArray(data.messages)) {
          const wasHydrated = initialMessagesHydratedRef.current;
          if (!wasHydrated) {
            seedChatNotificationBaseline(uid, data.messages);
          }
          const incomingNew = wasHydrated
            ? data.messages.filter(
                (m) => m.recipientId === uid && !m.readAt && !prevMessageIdsRef.current.has(m.id)
              )
            : [];
          prevMessageIdsRef.current = new Set(data.messages.map((m) => m.id));
          setDirectMessages(data.messages);

          const latestNew = incomingNew[incomingNew.length - 1];
          if (latestNew) {
            const incomingIds = incomingNew.map((m) => m.id);
            const alreadyNotifiedAll = incomingNew.every((m) =>
              notifiedChatMsgIdsRef.current.has(m.id)
            );
            markMessagesAsNotified(uid, incomingIds);
            void markNativeNotifiedIds(incomingIds, latestNew.createdAt);
            const isViewingThread =
              subViewRef.current === 'chat' &&
              activeChatPeerIdRef.current === latestNew.senderId &&
              document.visibilityState === 'visible';
            if (isViewingThread) {
              void authFetch('/api/chat/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ peerId: latestNew.senderId }),
              }).catch(() => {});
            } else if (!alreadyNotifiedAll && pushEnabledRef.current) {
              const sender = internalUsersRef.current.find((u) => u.id === latestNew.senderId);
              const senderName =
                (currentUserAliasesRef.current[latestNew.senderId] || '').trim() ||
                sender?.nama ||
                'Pengguna Internal';
              const displayMsgText =
                latestNew.text ||
                (latestNew.sharedKpm
                  ? `Kartu KPM: ${latestNew.sharedKpm.nama} (${latestNew.sharedKpm.proposal})`
                  : 'Pesan baru');
              const unreadFromSender = Math.max(
                1,
                data.messages.filter(
                  (m) => m.senderId === latestNew.senderId && m.recipientId === uid && !m.readAt
                ).length
              );
              playMessageChime();
              void triggerPushNotification(
                `${unreadFromSender} pesan masuk dari ${senderName}`,
                displayMsgText,
                {
                  senderId: latestNew.senderId,
                  tag: `masdeta-chat-${latestNew.senderId}`,
                }
              );
            }
          }
        }
      } catch {
        // Ignore transient network error
      }
    };

    syncIncomingMessagesRef.current = syncCollabFromBackend;
    connect();
    const fallbackPollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncCollabFromBackend();
      }
    }, 12_000);

    return () => {
      closedByCleanup = true;
      window.clearInterval(fallbackPollId);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      syncIncomingMessagesRef.current = async () => {};
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    currentUser?.id,
    sessionToken,
    supabaseReady,
    authFetch,
    applyRemoteOperationalState,
    pushAppNotification,
    markMessagesAsNotified,
    seedChatNotificationBaseline,
  ]);

  // Sinkronisasi native Android background notifier (saat layar terkunci / app ditutup) + wake-up resync
  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid || !chatBaselineReady || !initialMessagesHydratedRef.current) return;

    const senderNames: Record<string, string> = {};
    internalUsers.forEach((u) => {
      if (u.id !== uid && u.status === 'active') {
        senderNames[u.id] = (currentUserAliases[u.id] || '').trim() || u.nama;
      }
    });

    let maxMsgIso = directMessages.length === 0 ? new Date().toISOString() : '';
    let maxMsgTs = 0;
    directMessages.forEach((m) => {
      const ts = new Date(m.createdAt).getTime();
      if (Number.isFinite(ts) && ts > maxMsgTs) {
        maxMsgTs = ts;
        maxMsgIso = m.createdAt;
      }
    });
    if (!maxMsgIso) {
      maxMsgIso = new Date().toISOString();
    }

    void syncNativeChatNotifierConfig({
      userId: uid,
      senderNames,
      lastSeenAt: maxMsgIso,
      notifiedIds: Array.from(notifiedChatMsgIdsRef.current),
      enabled: pushEnabled,
      sessionToken: supabaseReady ? '' : sessionToken,
    });
  }, [
    currentUser?.id,
    chatBaselineReady,
    internalUsers,
    currentUserAliases,
    pushEnabled,
    directMessages,
    supabaseReady,
    sessionToken,
  ]);

  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) return;

    const handleWakeSync = () => {
      const visible = document.visibilityState === 'visible';
      void setNativeAppForeground(visible);
      if (visible) {
        void syncIncomingMessagesRef.current();
      }
    };

    void setNativeAppForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleWakeSync);
    window.addEventListener('focus', handleWakeSync);
    window.addEventListener('online', handleWakeSync);

    let appStateHandle: PluginListenerHandle | null = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (disposed) return;
        void setNativeAppForeground(isActive);
        if (isActive) {
          void syncIncomingMessagesRef.current();
          void consumePendingNotificationSender().then((senderId) => {
            if (!disposed && senderId) {
              openChatViewRef.current(senderId);
            }
          });
        }
      })
        .then((handle) => {
          if (disposed) {
            void handle.remove();
          } else {
            appStateHandle = handle;
          }
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleWakeSync);
      window.removeEventListener('focus', handleWakeSync);
      window.removeEventListener('online', handleWakeSync);
      if (appStateHandle) {
        void appStateHandle.remove();
      }
    };
  }, [currentUser?.id]);

  // Pelacak Aktivitas Otomatis Presisi Tinggi untuk Presence Dot (Hijau = Aktif, Oranye = Idle, Abu-abu = Offline)
  useEffect(() => {
    const uid = currentUser?.id;
    const isManual = currentUser?.presenceManual;
    if (!uid || isManual) return;

    const VISIBLE_IDLE_MS = 300_000; // 5 menit tanpa interaksi di layar aktif
    const HIDDEN_IDLE_MS = 45_000; // Grace 45 detik saat APK ke background/kamera/file picker
    const HEARTBEAT_MS = 25_000; // Segarkan status online & lastActiveAt berkala
    const ONLINE_RETRY_MS = 2_500; // Coba ulang cepat jika sinkronisasi 'online' sempat gagal saat wake-up

    const isDocumentVisible = () =>
      document.visibilityState === 'visible' ||
      (document.visibilityState !== 'hidden' && document.hidden === false);

    let idleTimer: number | undefined;
    let hiddenIdleTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let retryOnlineTimer: number | undefined;
    let committedStatus: UserPresenceStatus | null = null;
    let isForegroundActive = isDocumentVisible();
    let lastInteractionAt = Date.now();
    let lastCommittedAt = 0;
    let presenceSeq = 0;
    let presenceWriteChain: Promise<void> = Promise.resolve();
    let disposed = false;
    let appStateHandle: PluginListenerHandle | undefined;

    const clearRetryOnlineTimer = () => {
      if (retryOnlineTimer) {
        window.clearTimeout(retryOnlineTimer);
        retryOnlineTimer = undefined;
      }
    };

    const applyLocalPresence = (status: UserPresenceStatus) => {
      desiredAutoPresenceRef.current = status;
      const nowIso = new Date().toISOString();
      setInternalUsers((prev) => {
        let changed = false;
        const next = prev.map((u) => {
          if (u.id !== uid || u.presenceManual) return u;
          const prevActiveMs = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0;
          if (
            u.presenceStatus === status &&
            Number.isFinite(prevActiveMs) &&
            Date.now() - prevActiveMs < 20_000
          ) {
            return u;
          }
          changed = true;
          return {
            ...u,
            presenceStatus: status,
            lastActiveAt: nowIso,
          };
        });
        return changed ? next : prev;
      });
    };

    const sendPresence = (status: UserPresenceStatus, forceNetworkSync = false) => {
      const statusChanged =
        committedStatus !== status || currentUserPresenceRef.current !== status;
      const mustSync = forceNetworkSync || statusChanged;
      applyLocalPresence(status);

      if (supabaseReadyRef.current) {
        const shouldSkip =
          !mustSync &&
          committedStatus === status &&
          currentUserPresenceRef.current === status &&
          Date.now() - lastCommittedAt < HEARTBEAT_MS;
        if (shouldSkip) return;

        clearRetryOnlineTimer();
        const seq = ++presenceSeq;

        presenceWriteChain = presenceWriteChain.then(async () => {
          if (disposed || seq !== presenceSeq) return;
          const ok = await supabaseSetUserPresence(uid, status, false);
          if (disposed || seq !== presenceSeq) return;
          if (ok) {
            committedStatus = status;
            lastCommittedAt = Date.now();
            clearRetryOnlineTimer();
          } else if (status === 'online' && (isForegroundActive || isDocumentVisible())) {
            clearRetryOnlineTimer();
            retryOnlineTimer = window.setTimeout(() => {
              retryOnlineTimer = undefined;
              if (!disposed && (isForegroundActive || isDocumentVisible())) {
                sendPresence('online', true);
              }
            }, ONLINE_RETRY_MS);
          }
        });
        return;
      }

      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        const shouldSkip =
          !mustSync &&
          committedStatus === status &&
          currentUserPresenceRef.current === status &&
          Date.now() - lastCommittedAt < HEARTBEAT_MS;
        if (shouldSkip) return;
        committedStatus = status;
        lastCommittedAt = Date.now();
        sock.send(JSON.stringify({ type: 'presence:activity', status }));
      }
    };

    const isNative = Capacitor.isNativePlatform();
    const startHiddenIdleCountdown = () => {
      isForegroundActive = false;
      clearRetryOnlineTimer();
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      if (!isNative) {
        // Di Web / iOS Safari / WebView browser: segera tandai idle saat tab/app disembunyikan
        sendPresence('idle', true);
        return;
      }
      if (hiddenIdleTimer) return;
      hiddenIdleTimer = window.setTimeout(() => {
        hiddenIdleTimer = undefined;
        if (!disposed && !isForegroundActive && !isDocumentVisible()) {
          sendPresence('idle', true);
        }
      }, HIDDEN_IDLE_MS);
    };

    const scheduleVisibleIdleCheck = (delayMs = VISIBLE_IDLE_MS) => {
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      idleTimer = window.setTimeout(() => {
        idleTimer = undefined;
        if (disposed) return;
        const elapsed = Date.now() - lastInteractionAt;
        if (elapsed >= VISIBLE_IDLE_MS) {
          sendPresence('idle', true);
        } else {
          scheduleVisibleIdleCheck(Math.max(1000, VISIBLE_IDLE_MS - elapsed));
        }
      }, delayMs);
    };

    const markActive = (throttled = false, forceForeground = false) => {
      if (disposed) return;
      const now = Date.now();
      const docVisible = isDocumentVisible();
      if (forceForeground || docVisible) {
        isForegroundActive = true;
      }

      // Hanya masuk hitungan background idle jika benar-benar hidden dan tidak ada sinyal foreground
      if (!isForegroundActive && !docVisible) {
        startHiddenIdleCountdown();
        return;
      }

      if (
        throttled &&
        !forceForeground &&
        committedStatus === 'online' &&
        currentUserPresenceRef.current === 'online' &&
        now - lastInteractionAt < 1000
      ) {
        return;
      }
      lastInteractionAt = now;

      if (hiddenIdleTimer) {
        window.clearTimeout(hiddenIdleTimer);
        hiddenIdleTimer = undefined;
      }

      sendPresence('online', forceForeground || committedStatus !== 'online');
      scheduleVisibleIdleCheck(VISIBLE_IDLE_MS);
    };

    const handleVisibilityChange = () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden' || document.hidden) {
        startHiddenIdleCountdown();
      } else {
        markActive(false, true);
      }
    };

    const handleFocusResume = () => {
      if (disposed) return;
      if (document.visibilityState !== 'hidden' && !document.hidden) {
        markActive(false, true);
      }
    };

    const handlePointerMove = () => markActive(true, false);
    const handleImmediateInteraction = () => markActive(false, true);
    const handleWsOpen = () => {
      if (!disposed && (isForegroundActive || isDocumentVisible())) {
        markActive(false, true);
      }
    };
    const handleOnlineRestore = () => {
      if (!disposed && (isForegroundActive || isDocumentVisible())) {
        markActive(false, true);
      }
    };
    const handleOfflineEvent = () => {
      clearRetryOnlineTimer();
    };
    const handleUnload = () => {
      clearRetryOnlineTimer();
      if (idleTimer) window.clearTimeout(idleTimer);
      if (hiddenIdleTimer) window.clearTimeout(hiddenIdleTimer);
      if (supabaseReadyRef.current) {
        supabaseMarkOfflineKeepalive(uid);
      } else if (
        sessionTokenRef.current &&
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        try {
          const payload = new Blob([JSON.stringify({ token: sessionTokenRef.current })], {
            type: 'application/json',
          });
          navigator.sendBeacon('/api/presence/offline', payload);
        } catch {
          // Abaikan kegagalan beacon saat window ditutup
        }
      }
    };

    markActive(false, true);

    heartbeatTimer = window.setInterval(() => {
      if (disposed) return;
      const isVisible = isForegroundActive || isDocumentVisible();
      if (!isVisible) return;
      const sinceInteraction = Date.now() - lastInteractionAt;
      if (sinceInteraction >= VISIBLE_IDLE_MS) {
        if (committedStatus !== 'idle') {
          sendPresence('idle', true);
        }
        return;
      }
      if (
        committedStatus !== 'online' ||
        currentUserPresenceRef.current !== 'online' ||
        Date.now() - lastCommittedAt >= HEARTBEAT_MS
      ) {
        sendPresence('online', true);
      }
    }, HEARTBEAT_MS);

    const immediateEvents: (keyof WindowEventMap)[] = [
      'pointerdown',
      'touchstart',
      'touchmove',
      'keydown',
      'click',
      'wheel',
      'input',
      'change',
    ];
    immediateEvents.forEach((ev) =>
      window.addEventListener(ev, handleImmediateInteraction, { passive: true, capture: true })
    );
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    // capture: true wajib agar scroll pada container internal (overflow-y-auto) ikut terdeteksi
    window.addEventListener('scroll', handlePointerMove, { capture: true, passive: true });
    window.addEventListener('focus', handleFocusResume);
    window.addEventListener('pageshow', handleFocusResume);
    window.addEventListener('online', handleOnlineRestore);
    window.addEventListener('offline', handleOfflineEvent);
    window.addEventListener('masdeta-network-online', handleOnlineRestore);
    window.addEventListener('masdeta-ws-open', handleWsOpen);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (disposed) return;
        if (isActive) {
          // Android WebView kadang menunda update document.visibilityState beberapa milidetik setelah resume
          markActive(false, true);
          window.setTimeout(() => {
            if (!disposed && (isForegroundActive || isDocumentVisible())) {
              markActive(false, true);
            }
          }, 250);
        } else {
          startHiddenIdleCountdown();
        }
      })
        .then((handle) => {
          if (disposed) {
            void handle.remove();
          } else {
            appStateHandle = handle;
          }
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      clearRetryOnlineTimer();
      if (idleTimer) window.clearTimeout(idleTimer);
      if (hiddenIdleTimer) window.clearTimeout(hiddenIdleTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      immediateEvents.forEach((ev) =>
        window.removeEventListener(ev, handleImmediateInteraction, { capture: true })
      );
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handlePointerMove, { capture: true });
      window.removeEventListener('focus', handleFocusResume);
      window.removeEventListener('pageshow', handleFocusResume);
      window.removeEventListener('online', handleOnlineRestore);
      window.removeEventListener('offline', handleOfflineEvent);
      window.removeEventListener('masdeta-network-online', handleOnlineRestore);
      window.removeEventListener('masdeta-ws-open', handleWsOpen);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (appStateHandle) {
        void appStateHandle.remove();
      }
    };
  }, [currentUser?.id, currentUser?.presenceManual, supabaseReady]);

  // Evaluasi staleness presence 90 detik & sinkronisasi daftar pengguna aktif di Web/Mobile
  useEffect(() => {
    if (!currentUser?.id) return;
    const id = window.setInterval(() => {
      setPresenceTickNow(Date.now());
      if (supabaseReadyRef.current && document.visibilityState === 'visible') {
        void supabaseFetchInternalUsers()
          .then((users) => {
            if (users.length > 0) setInternalUsers(mergeFetchedInternalUsers(users));
          })
          .catch(() => {});
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [currentUser?.id, mergeFetchedInternalUsers]);

  // Web Push registration & deep-link notifikasi Service Worker (?chatPeer=...)
  useEffect(() => {
    if (!currentUser?.id || Capacitor.isNativePlatform()) return;
    const initialPeer = consumeUrlChatPeerId();
    if (initialPeer) {
      openChatViewRef.current(initialPeer);
    }
    const stopListenSw = listenSwOpenChat((peerId) => {
      openChatViewRef.current(peerId);
    });
    if (pushPermission === 'granted') {
      void ensureBrowserPushSubscription();
    }
    return () => {
      stopListenSw();
    };
  }, [currentUser?.id, pushPermission]);

  // Kunci pinch-in / pinch-out zoom aplikasi secara global (kecuali di pratinjau foto lightbox)
  useEffect(() => {
    const isInsideAllowedZoomStage = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('[data-allow-pinch-zoom="true"]'));

    const handleTouchGuard = (e: TouchEvent) => {
      if (e.touches.length > 1 && !isInsideAllowedZoomStage(e.target)) {
        e.preventDefault();
      }
    };

    const handleGestureGuard = (e: Event) => {
      if (!isInsideAllowedZoomStage(e.target)) {
        e.preventDefault();
      }
    };

    const handleWheelGuard = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isInsideAllowedZoomStage(e.target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', handleTouchGuard, { passive: false });
    document.addEventListener('touchmove', handleTouchGuard, { passive: false });
    document.addEventListener('gesturestart', handleGestureGuard, { passive: false });
    document.addEventListener('gesturechange', handleGestureGuard, { passive: false });
    document.addEventListener('gestureend', handleGestureGuard, { passive: false });
    document.addEventListener('wheel', handleWheelGuard, { passive: false });

    return () => {
      document.removeEventListener('touchstart', handleTouchGuard);
      document.removeEventListener('touchmove', handleTouchGuard);
      document.removeEventListener('gesturestart', handleGestureGuard);
      document.removeEventListener('gesturechange', handleGestureGuard);
      document.removeEventListener('gestureend', handleGestureGuard);
      document.removeEventListener('wheel', handleWheelGuard);
    };
  }, []);

  const currentScrollKey = (() => {
    switch (subView) {
      case 'none':
        if (activeTab === 'menu') {
          if (menuSection === 'pengelola' && selectedPengelolaDrill) {
            return `menu:pengelola:drill:${selectedPengelolaDrill}`;
          }
          if (menuSection === 'pekerjaan' && selectedPekerjaanDrill) {
            return `menu:pekerjaan:drill:${selectedPekerjaanDrill}`;
          }
          if (menuSection === 'dtsen' && selectedDtsenDrill) {
            return `menu:dtsen:drill:${selectedDtsenDrill}`;
          }
          return `menu:${menuSection}`;
        }
        return `tab:${activeTab}`;
      case 'kpm-detail':
        return `sub:kpm-detail:${activeKpmId ?? ''}`;
      case 'proposal-detail':
        return `sub:proposal-detail:${activeProposalId ?? ''}`;
      case 'subitem-recap':
        if (recapDrillTarget?.kind === 'item') return `sub:subitem-recap:item:${recapDrillTarget.code}`;
        if (recapDrillTarget?.kind === 'subitem') return `sub:subitem-recap:sub:${recapDrillTarget.key}`;
        if (recapDrillTarget?.kind === 'pending_all') return 'sub:subitem-recap:pending_all';
        return 'sub:subitem-recap';
      case 'chat':
        return `sub:chat:${activeChatPeerId ?? '__list__'}`;
      default:
        return `sub:${subView}`;
    }
  })();

  const captureCurrentScroll = () => {
    const key = activeScrollKeyRef.current;
    if (key && !pendingScrollModeRef.current && !isRestoringScrollRef.current) {
      scrollMemoryRef.current[key] =
        window.scrollY || document.documentElement.scrollTop || 0;
    }
  };

  const navigateForwardScroll = (behavior: 'auto' | 'smooth' = 'auto') => {
    captureCurrentScroll();
    pendingScrollModeRef.current = behavior === 'smooth' ? 'top-smooth' : 'top';
  };

  const navigateRestoreScroll = () => {
    captureCurrentScroll();
    pendingScrollModeRef.current = 'restore';
  };

  useEffect(() => {
    const handleWindowScroll = () => {
      if (isRestoringScrollRef.current || pendingScrollModeRef.current) return;
      const key = activeScrollKeyRef.current;
      if (!key) return;
      scrollMemoryRef.current[key] =
        window.scrollY || document.documentElement.scrollTop || 0;
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  const isUserAuthenticated = Boolean(currentUserIdRef.current || sessionUserId);

  useLayoutEffect(() => {
    const wasAuth = prevAuthenticatedRef.current;
    prevAuthenticatedRef.current = isUserAuthenticated;

    if (!isUserAuthenticated) {
      activeScrollKeyRef.current = currentScrollKey;
      prevScrollKeyRef.current = currentScrollKey;
      pendingScrollModeRef.current = null;
      return;
    }

    if (!wasAuth) {
      activeScrollKeyRef.current = currentScrollKey;
      prevScrollKeyRef.current = currentScrollKey;
      pendingScrollModeRef.current = null;
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.dispatchEvent(new Event('masdeta-scroll-sync'));
      return;
    }

    const prevKey = prevScrollKeyRef.current;
    if (prevKey === currentScrollKey) return;
    prevScrollKeyRef.current = currentScrollKey;

    const mode = pendingScrollModeRef.current ?? 'restore';
    pendingScrollModeRef.current = null;
    activeScrollKeyRef.current = currentScrollKey;

    let targetY = 0;
    let behavior: ScrollBehavior = 'auto';

    if (mode === 'top') {
      targetY = 0;
      scrollMemoryRef.current[currentScrollKey] = 0;
    } else if (mode === 'top-smooth') {
      targetY = 0;
      behavior = 'smooth';
      scrollMemoryRef.current[currentScrollKey] = 0;
    } else {
      targetY = scrollMemoryRef.current[currentScrollKey] ?? 0;
    }

    isRestoringScrollRef.current = true;
    window.scrollTo({ top: targetY, behavior });

    let raf1 = 0;
    let raf2 = 0;
    let timer = 0;

    if (behavior === 'auto') {
      raf1 = window.requestAnimationFrame(() => {
        if (targetY > 0 && Math.abs((window.scrollY || 0) - targetY) > 2) {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        }
        window.dispatchEvent(new Event('masdeta-scroll-sync'));
        raf2 = window.requestAnimationFrame(() => {
          isRestoringScrollRef.current = false;
          window.dispatchEvent(new Event('masdeta-scroll-sync'));
        });
      });
    } else {
      timer = window.setTimeout(() => {
        isRestoringScrollRef.current = false;
        window.dispatchEvent(new Event('masdeta-scroll-sync'));
      }, 450);
    }

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (timer) window.clearTimeout(timer);
      isRestoringScrollRef.current = false;
    };
  }, [currentScrollKey, isUserAuthenticated]);

  // Tombol Back Android: TERKUNCI saat BottomNav (botnavig) tampil di layar,
  // dan HANYA berfungsi melakukan navigasi kembali jika tidak ada BottomNav di layar.
  const handleAndroidBackRef = useRef<() => void>(() => {});
  handleAndroidBackRef.current = () => {
    if (isUpdateModalOpen) {
      if (appUpdateInfo && !appUpdateInfo.isMandatory) {
        setDismissedUpdateVersion(appUpdateInfo.latestVersion);
        dismissedUpdateVersionRef.current = appUpdateInfo.latestVersion;
        setIsUpdateModalOpen(false);
      }
      // Update wajib: tombol Back tidak boleh menutup popup
      return;
    }

    const bottomNavVisible =
      subView === 'none' && !(activeTab === 'menu' && menuSection !== 'root');

    // JIKA ADA BOTNAVIG DI LAYAR (atau belum login), tombol back Android dikunci total
    if (!currentUser || bottomNavVisible) {
      return;
    }

    if (lightboxDoc) {
      setLightboxDoc(null);
      return;
    }

    if (subView === 'kpm-history') {
      navigateRestoreScroll();
      setSubView('kpm-detail');
      return;
    }

    if (subView === 'proposal-history') {
      navigateRestoreScroll();
      setSubView('proposal-detail');
      return;
    }

    if (subView === 'edit-proposal') {
      navigateRestoreScroll();
      setFeedback(null);
      setSubView('proposal-detail');
      return;
    }

    if (subView === 'add-proposal') {
      navigateRestoreScroll();
      setFeedback(null);
      if (addProposalFromKpmForm) {
        setAddProposalFromKpmForm(false);
        setSubView('kpm-form');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      return;
    }

    if (subView === 'kpm-form') {
      navigateRestoreScroll();
      setFeedback(null);
      setEditingKpmRecord(null);
      setLockedKpmProposalScope(null);
      if (kpmFormReturnToDetail && activeKpmId) {
        setKpmFormReturnToDetail(false);
        setSubView('kpm-detail');
      } else if (kpmFormReturnToProposalDetail && activeProposal) {
        setKpmFormReturnToProposalDetail(false);
        setSubView('proposal-detail');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      return;
    }

    if (subView === 'kpm-detail') {
      navigateRestoreScroll();
      setFeedback(null);
      setActiveKpmId(null);
      if (kpmDetailReturnToChatPeerId) {
        const peer =
          kpmDetailReturnToChatPeerId === '__list__' ? null : kpmDetailReturnToChatPeerId;
        setKpmDetailReturnToChatPeerId(null);
        setActiveChatPeerId(peer);
        setSubView('chat');
        if (peer) void handleMarkChatRead(peer);
      } else if (kpmDetailReturnToProposalDetail && activeProposal) {
        setKpmDetailReturnToProposalDetail(false);
        setSubView('proposal-detail');
      } else if (kpmDetailReturnToRecap) {
        setKpmDetailReturnToRecap(false);
        setSubView('subitem-recap');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      return;
    }

    if (subView === 'subitem-recap') {
      navigateRestoreScroll();
      if (recapDrillTarget) {
        setRecapDrillTarget(null);
      } else {
        setFeedback(null);
        setSubView('none');
        setActiveTab(returnToTab);
      }
      return;
    }

    if (subView === 'proposal-detail') {
      navigateRestoreScroll();
      setFeedback(null);
      setSubView('none');
      setActiveTab(returnToTab);
      return;
    }

    if (subView === 'chat') {
      navigateRestoreScroll();
      if (activeChatPeerId) {
        setActiveChatPeerId(null);
      } else {
        setActiveChatPeerId(null);
        setSubView('none');
        setActiveTab(returnToTab);
      }
      return;
    }

    if (subView === 'profile' || subView === 'notifications') {
      navigateRestoreScroll();
      setSubView('none');
      setActiveTab(returnToTab);
      return;
    }

    if (subView === 'none' && activeTab === 'menu' && menuSection !== 'root') {
      if (menuSection === 'pengelola' && selectedPengelolaDrill) {
        navigateRestoreScroll();
        setSelectedPengelolaDrill(null);
        return;
      }
      if (menuSection === 'pekerjaan' && selectedPekerjaanDrill) {
        navigateRestoreScroll();
        setSelectedPekerjaanDrill(null);
        return;
      }
      if (menuSection === 'dtsen' && selectedDtsenDrill) {
        navigateRestoreScroll();
        setSelectedDtsenDrill(null);
        return;
      }
      if (menuSection === 'users' && usersOpenedFromSuperAdmin) {
        navigateRestoreScroll();
        setUsersOpenedFromSuperAdmin(false);
        setMenuSection('superadmin');
        return;
      }
      if (menuSection === 'administrasi' || menuSection === 'sampah') {
        navigateRestoreScroll();
        setMenuSection('superadmin');
        return;
      }
      if (menuOpenedFromDashboard) {
        navigateRestoreScroll();
        setMenuOpenedFromDashboard(false);
        setMenuSection('root');
        setActiveTab('dashboard');
        return;
      }
      navigateRestoreScroll();
      setSelectedPengelolaDrill(null);
      setSelectedPekerjaanDrill(null);
      setSelectedDtsenDrill(null);
      setUsersOpenedFromSuperAdmin(false);
      setMenuSection('root');
    }
  };

  useEffect(() => {
    try {
      window.history.pushState({ masdetaLocked: true }, '', window.location.href);
    } catch {
      // Abaikan jika environment membatasi history API
    }

    const handlePopState = () => {
      try {
        window.history.pushState({ masdetaLocked: true }, '', window.location.href);
      } catch {
        // Abaikan
      }
      handleAndroidBackRef.current();
    };

    const handleCordovaBack = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      handleAndroidBackRef.current();
    };

    const handleIonBack = (ev: Event) => {
      const customEv = ev as CustomEvent<{
        register?: (priority: number, handler: () => void) => void;
      }>;
      if (customEv.detail?.register) {
        customEv.detail.register(999, () => {
          handleAndroidBackRef.current();
        });
      } else {
        ev.preventDefault();
        handleAndroidBackRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('backbutton', handleCordovaBack, false);
    document.addEventListener('ionBackButton', handleIonBack);

    let disposed = false;
    let capListenerHandle: PluginListenerHandle | undefined;

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        handleAndroidBackRef.current();
      })
        .then((handle) => {
          if (disposed) {
            void handle.remove();
          } else {
            capListenerHandle = handle;
          }
        })
        .catch(() => {
          // Abaikan jika plugin native tidak tersedia
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('backbutton', handleCordovaBack, false);
      document.removeEventListener('ionBackButton', handleIonBack);
      if (capListenerHandle) {
        void capListenerHandle.remove();
      }
    };
  }, []);

  // Fallback navigasi jika data KPM atau Proposal target terhapus saat sedang dilihat
  useEffect(() => {
    if ((subView === 'kpm-detail' || subView === 'kpm-history') && !activeKpmRecord) {
      navigateRestoreScroll();
      setActiveKpmId(null);
      setSubView('none');
      setActiveTab(returnToTab);
    } else if (
      (subView === 'proposal-detail' ||
        subView === 'proposal-history' ||
        subView === 'edit-proposal') &&
      !activeProposal
    ) {
      navigateRestoreScroll();
      setActiveProposalId(null);
      setSubView('none');
      setActiveTab(returnToTab);
    }
  }, [subView, activeKpmRecord, activeProposal, returnToTab]);

  useEffect(() => {
    setRecords((prev) =>
      recalculateProposalRegisterCodes(
        prev,
        proposals,
        items,
        wilayahList,
        proposalSlotMapRef.current
      )
    );
  }, [proposals, items, wilayahList]);

  const latestImportStateRef = useRef({
    records,
    proposals,
    pengelolaList,
    pekerjaanList,
    items,
    wilayahList,
    currentActor,
  });

  latestImportStateRef.current = {
    records,
    proposals,
    pengelolaList,
    pekerjaanList,
    items,
    wilayahList,
    currentActor,
  };

  const handleImportCsv = (
    csvText: string,
    sourceLabel?: string,
    skipDuplicates = true
  ): {
    importedRecords: number;
    importedProposals: number;
    addedPengelola: number;
    skipped: number;
    error?: string;
  } => {
    if (
      sourceLabel !== 'Kecamatan Pontianak Kota 2026.csv' &&
      !requirePermission('add', 'mengimpor data CSV')
    ) {
      return {
        importedRecords: 0,
        importedProposals: 0,
        addedPengelola: 0,
        skipped: 0,
        error: 'Izin ADD dinonaktifkan oleh SuperAdmin.',
      };
    }
    const state = latestImportStateRef.current;
    const result = importProposalKpmFromCsv({
      csvText,
      existingRecords: state.records,
      existingProposals: state.proposals,
      existingPengelolaList: state.pengelolaList,
      existingPekerjaanList: state.pekerjaanList,
      items: state.items,
      wilayahList: state.wilayahList,
      actorName: state.currentActor.nama,
      actorEmail: state.currentActor.email,
      skipDuplicates,
    });

    if (result.importedRecordsCount > 0) {
      const importSummaryLog = createActivityHistoryEntry('csv_imported', {
        proposalName: sourceLabel || 'Import CSV Massal',
        detail: `Mengimpor ${result.importedRecordsCount} KPM (${result.importedProposalsCount} proposal baru${result.skippedCount > 0 ? `, ${result.skippedCount} dilewati` : ''}).`,
        tahun: result.nextRecords[0]?.tahun || selectedYear,
        action: 'entered',
        actorName: state.currentActor.nama,
      });
      const nextAuditLogs = [...result.newAuditLogs, ...kpmAuditLogs];
      const nextProposalHistory = [importSummaryLog, ...result.newProposalHistory, ...proposalHistory];

      const prevRecById = new Map(state.records.map((r) => [r.id, r]));
      const existingPropIds = new Set(state.proposals.map((p) => p.id));
      const existingPengelolaIds = new Set(state.pengelolaList.map((p) => p.id));
      const existingPekerjaanLower = new Set(
        state.pekerjaanList.map((p) => p.trim().toLowerCase())
      );

      const recordsToSave = result.nextRecords.filter((r) => {
        const old = prevRecById.get(r.id);
        return !old || old.registerCode !== r.registerCode || old.updatedAt !== r.updatedAt;
      });
      const proposalsToSave = result.nextProposals.filter((p) => !existingPropIds.has(p.id));
      const pengelolaToSave = result.nextPengelolaList.filter((p) => !existingPengelolaIds.has(p.id));
      const pekerjaanToAdd = result.nextPekerjaanList.filter(
        (j) => !existingPekerjaanLower.has(j.trim().toLowerCase())
      );

      setProposals(result.nextProposals);
      setPengelolaList(result.nextPengelolaList);
      setPekerjaanList(result.nextPekerjaanList);
      setRecords(result.nextRecords);
      if (result.newAuditLogs.length > 0) {
        setKpmAuditLogs(nextAuditLogs);
      }
      setProposalHistory(nextProposalHistory);
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            importOperationalDeltaToSupabase({
              recordsToSave,
              proposalsToSave,
              pengelolaToSave,
              pekerjaanToAdd,
              allProposals: result.nextProposals,
              allPengelolaList: result.nextPengelolaList,
              auditLogs: result.newAuditLogs,
              historyEntries: [importSummaryLog, ...result.newProposalHistory],
            }),
          'Gagal menyinkronkan impor CSV ke Supabase'
        );
      } else {
        void syncOperationalData(
          {
            records: result.nextRecords,
            proposals: result.nextProposals,
            pengelolaList: result.nextPengelolaList,
            pekerjaanList: result.nextPekerjaanList,
            kpmAuditLogs: nextAuditLogs,
            proposalHistory: nextProposalHistory,
          },
          'add'
        );
      }
      setFeedback({
        type: 'success',
        message: `${result.importedRecordsCount} calon KPM${
          sourceLabel ? ` dari "${sourceLabel}"` : ''
        } berhasil diimpor otomatis.${
          result.skippedCount > 0 ? ` (${result.skippedCount} duplikat dilewati)` : ''
        }`,
      });
    }

    return {
      importedRecords: result.importedRecordsCount,
      importedProposals: result.importedProposalsCount,
      addedPengelola: result.addedPengelolaCount,
      skipped: result.skippedCount,
      error: result.error,
    };
  };

  const openKpmDetail = (
    record: KpmRecord,
    fromTab: MainTab = activeTab,
    fromRecap = false,
    fromChatPeerId: string | null = null
  ) => {
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmDetailReturnToRecap(fromRecap);
    setKpmDetailReturnToProposalDetail(false);
    setKpmDetailReturnToChatPeerId(fromChatPeerId);
    setActiveKpmId(record.id);
    setSubView('kpm-detail');
  };

  const openSubItemRecap = (fromTab: MainTab = activeTab) => {
    navigateForwardScroll();
    setFeedback(null);
    setRecapDrillTarget(null);
    setReturnToTab(fromTab);
    setSubView('subitem-recap');
  };

  const openKpmForm = (
    record: KpmRecord | null,
    fromTab: MainTab = activeTab,
    returnToDetail = false,
    returnToProposalDetail = false,
    lockedScope: { namaProposal: string; tahun: string } | null = null,
    standaloneStatus: 'pending' | 'rejected' | null = null,
    targetSlot: {
      proposalId: string;
      proposalName: string;
      tahun: string;
      slotNumber: number;
      item?: string;
    } | null = null
  ) => {
    if (record) {
      if (!requirePermission('update', 'mengubah data calon KPM')) return;
    } else {
      if (!requirePermission('add', 'mendaftarkan calon KPM baru')) return;
    }
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmFormReturnToDetail(returnToDetail);
    setKpmFormReturnToProposalDetail(returnToProposalDetail);
    setLockedKpmProposalScope(lockedScope);
    setKpmFormInitialStandaloneStatus(record ? null : standaloneStatus);
    setTargetKpmFormSlot(record ? null : targetSlot);
    setEditingKpmRecord(record);
    setSubView('kpm-form');
  };

  const openAddProposalForm = (
    fromTab: MainTab = activeTab,
    fromKpmForm = false,
    initialTahun?: string
  ) => {
    if (!requirePermission('add', 'menambah proposal baru')) return;
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(fromTab);
    setAddProposalFromKpmForm(fromKpmForm);
    setAddProposalInitialYear(initialTahun);
    setSubView('add-proposal');
  };

  const openProposalDetailById = (proposalId: string, fromTab: MainTab = activeTab) => {
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('proposal-detail');
  };

  const openEditProposalById = (proposalId: string, fromTab: MainTab = returnToTab) => {
    if (!requirePermission('update', 'mengubah data proposal')) return;
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('edit-proposal');
  };

  const handleOpenProposalDetailByName = (proposalName: string, tahun: string) => {
    const existing =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);

    if (existing) {
      openProposalDetailById(existing.id, returnToTab);
    } else {
      if (!requirePermission('add', 'membuat proposal baru')) return;
      const now = new Date().toISOString();
      const created: ProposalRecord = {
        id: `prop-${Date.now()}`,
        tahun: tahun || '2026',
        tipe: 'Murni',
        namaProposal: proposalName,
        jumlahKpm: 66,
        status: 'unlocked',
        checklist: {
          docx: false,
          dinas: false,
          rab: false,
          rt: false,
          rw: false,
          lurah: false,
          camat: false,
        },
        catatan: '',
        documents: {},
        createdAt: now,
        updatedAt: now,
      };
      const nextProposals = [created, ...proposals];
      const actEntry = createActivityHistoryEntry('proposal_created', {
        proposalName: created.namaProposal,
        detail: `Proposal baru "${created.namaProposal}" (${created.tahun}) dibuat otomatis dari detail KPM.`,
        tahun: created.tahun,
        action: 'entered',
      });
      const nextHistory = [actEntry, ...proposalHistory];
      setProposals(nextProposals);
      setProposalHistory(nextHistory);
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            upsertProposalsBatchInSupabase({
              proposals: [created],
              historyEntries: [actEntry],
            }),
          'Gagal menyimpan proposal ke Supabase'
        );
      } else {
        void syncOperationalData({ proposals: nextProposals, proposalHistory: nextHistory }, 'add');
      }
      openProposalDetailById(created.id, returnToTab);
    }
  };

  const handleCreatePengelola = (profile: PengelolaProfile) => {
    if (!requirePermission('add', 'menambah pengelola lapangan')) return;
    const nextPengelola = [profile, ...pengelolaList];
    const actEntry = createActivityHistoryEntry('pengelola_added', {
      proposalName: profile.displayName,
      detail: `Menambahkan pengelola lapangan "${profile.displayName}"${profile.kecamatan ? ` · Kec. ${profile.kecamatan}` : ''}.`,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setPengelolaList(nextPengelola);
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertPengelolaInSupabase({
            profile,
            historyEntries: [actEntry],
          }),
        'Gagal menyimpan pengelola ke Supabase'
      );
    } else {
      void syncOperationalData({ pengelolaList: nextPengelola, proposalHistory: nextHistory }, 'add');
    }
  };

  const handleUpdatePengelola = (profile: PengelolaProfile, previousDisplayName: string) => {
    if (!requirePermission('update', 'mengubah data pengelola lapangan')) return;
    const duplicate = pengelolaList.some(
      (p) =>
        p.id !== profile.id &&
        p.displayName.trim().toLowerCase() === profile.displayName.trim().toLowerCase()
    );
    if (duplicate) {
      setFeedback({
        type: 'error',
        message: `Pengelola "${profile.displayName}" sudah terdaftar.`,
      });
      return;
    }

    const nextPengelola = pengelolaList.map((p) => (p.id === profile.id ? profile : p));
    setPengelolaList(nextPengelola);

    const oldKey = previousDisplayName.trim().toLowerCase();
    const nameChanged = oldKey !== profile.displayName.trim().toLowerCase();
    const now = new Date().toISOString();
    let nextRecords = records;
    if (nameChanged) {
      let anyRecordChanged = false;
      nextRecords = records.map((rec) => {
        if ((rec.pengelola || '').trim().toLowerCase() !== oldKey) return rec;
        const prop =
          proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
          proposals.find((p) => p.namaProposal === rec.proposal);
        if (prop?.status === 'locked') return rec;
        anyRecordChanged = true;
        return { ...rec, pengelola: profile.displayName, updatedAt: now };
      });
      if (anyRecordChanged) {
        setRecords(nextRecords);
      }
      if (selectedPengelolaDrill?.trim().toLowerCase() === oldKey) {
        setSelectedPengelolaDrill(profile.displayName);
      }
    }

    const actEntry = createActivityHistoryEntry('pengelola_updated', {
      proposalName: profile.displayName,
      detail: nameChanged
        ? `Memperbarui pengelola "${previousDisplayName}" menjadi "${profile.displayName}".`
        : `Memperbarui profil pengelola "${profile.displayName}".`,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setProposalHistory(nextHistory);

    const changedRecords = nameChanged
      ? nextRecords.filter((rec, idx) => rec !== records[idx])
      : [];
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertPengelolaInSupabase({
            profile,
            updatedRecords: changedRecords,
            proposals,
            pengelolaList: nextPengelola,
            historyEntries: [actEntry],
          }),
        'Gagal memperbarui pengelola di Supabase'
      );
    } else {
      void syncOperationalData(
        nameChanged
          ? { pengelolaList: nextPengelola, records: nextRecords, proposalHistory: nextHistory }
          : { pengelolaList: nextPengelola, proposalHistory: nextHistory },
        'update'
      );
    }
    setFeedback({
      type: 'success',
      message: `Data pengelola "${profile.displayName}" berhasil diperbarui.`,
    });
  };

  const handleDeletePengelola = (pengelolaId: string) => {
    if (!requirePermission('delete', 'menghapus pengelola lapangan')) return;
    const target = pengelolaList.find((p) => p.id === pengelolaId);
    if (!target) return;

    if (target.foto) {
      void removeDocumentFromDrive(target.foto);
    }
    const nextPengelola = pengelolaList.filter((p) => p.id !== pengelolaId);
    setPengelolaList(nextPengelola);
    if (
      selectedPengelolaDrill &&
      selectedPengelolaDrill.trim().toLowerCase() === target.displayName.trim().toLowerCase()
    ) {
      setSelectedPengelolaDrill(null);
    }
    const actEntry = createActivityHistoryEntry('pengelola_deleted', {
      proposalName: target.displayName,
      detail: `Menghapus pengelola lapangan "${target.displayName}".`,
      action: 'removed',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          deletePengelolaInSupabase({
            pengelolaId,
            historyEntries: [actEntry],
          }),
        'Gagal menghapus pengelola dari Supabase'
      );
    } else {
      void syncOperationalData({ pengelolaList: nextPengelola, proposalHistory: nextHistory }, 'delete');
    }
    setFeedback({
      type: 'success',
      message: `Pengelola "${target.displayName}" berhasil dihapus.`,
    });
  };

  const handleSaveKpm = async (
    values: KpmFormValues,
    editingId?: string,
    targetSlotNumber?: number | null,
    oldSlotHandling: SlotRemovalMode = 'vacate'
  ): Promise<boolean> => {
    if (editingId) {
      if (!requirePermission('update', 'memperbarui data calon KPM')) return false;
    } else {
      if (!requirePermission('add', 'menyimpan calon KPM baru')) return false;
    }

    const targetStatus: ValidationStatus = values.validasi || 'pending';
    const isAcceptedTarget = targetStatus === 'accepted';

    const matchingProposal = isAcceptedTarget
      ? (values.proposalId
          ? proposals.find((p) => !isLegacyDummyProposal(p) && p.id === values.proposalId)
          : undefined) ??
        proposals.find(
          (p) =>
            !isLegacyDummyProposal(p) &&
            p.namaProposal === values.proposal &&
            (!values.tahun || p.tahun === values.tahun)
        ) ??
        proposals.find(
          (p) => !isLegacyDummyProposal(p) && p.namaProposal === values.proposal
        )
      : undefined;

    if (isAcceptedTarget && !matchingProposal && !values.proposal?.trim()) {
      setFeedback({
        type: 'error',
        message: 'Calon KPM berstatus Diterima wajib memilih Proposal tujuan (Murni / Perubahan).',
      });
      return false;
    }

    if (matchingProposal?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${matchingProposal.namaProposal}" berstatus Terkunci. Data KPM tidak dapat ditambahkan atau diubah.`,
      });
      return false;
    }

    const resolvedDom = resolveKpmDomicile(
      {
        ...values,
        proposal: matchingProposal?.namaProposal ?? values.proposal,
        proposalId: matchingProposal?.id ?? values.proposalId,
      },
      proposals,
      wilayahList
    );

    const normalizedValues: KpmFormValues & { validasi: ValidationStatus } = {
      ...values,
      validasi: targetStatus,
      tahun: isAcceptedTarget
        ? values.tahun?.trim() || matchingProposal?.tahun || ''
        : values.tahun?.trim() || '',
      proposalId: isAcceptedTarget ? (matchingProposal?.id ?? values.proposalId ?? null) : null,
      proposal: isAcceptedTarget ? (matchingProposal?.namaProposal ?? values.proposal.trim()) : '',
      kabKota: resolvedDom.kabKota,
      kecamatan: resolvedDom.kecamatan,
      kelurahan: resolvedDom.kelurahan,
    };

    const now = new Date().toISOString();

    if (editingId) {
      const previousRecord = records.find((r) => r.id === editingId);
      let nextAuditLogs = kpmAuditLogs;
      let nextProposalHistory = proposalHistory;

      if (previousRecord) {
        const prevProp = previousRecord.proposal?.trim()
          ? (previousRecord.proposalId
              ? proposals.find((p) => p.id === previousRecord.proposalId)
              : undefined) ??
            proposals.find(
              (p) => p.namaProposal === previousRecord.proposal && p.tahun === previousRecord.tahun
            ) ??
            proposals.find((p) => p.namaProposal === previousRecord.proposal)
          : undefined;

        if (prevProp?.status === 'locked') {
          setFeedback({
            type: 'error',
            message: `Proposal "${prevProp.namaProposal}" berstatus Terkunci. Calon KPM tidak dapat dipindahkan atau diubah.`,
          });
          return false;
        }

        const fieldChanges = diffKpmRecordChanges(previousRecord, normalizedValues);
        if (fieldChanges.length > 0) {
          const auditEntry: KpmAuditLogEntry = {
            id: `audit-upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kpmId: previousRecord.id,
            action: 'updated',
            actorName: currentActor.nama,
            actorEmail: currentActor.email,
            timestamp: now,
            proposal:
              normalizedValues.proposal ||
              (normalizedValues.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM'),
            tahun: normalizedValues.tahun || 'Tanpa Tahun',
            changes: fieldChanges,
          };
          nextAuditLogs = [auditEntry, ...kpmAuditLogs];
        }

        if (
          previousRecord.proposal !== normalizedValues.proposal ||
          (normalizedValues.proposal && previousRecord.tahun !== normalizedValues.tahun)
        ) {
          const addedHist: ProposalKpmHistoryEntry[] = [];
          const prevLabel =
            previousRecord.proposal ||
            (previousRecord.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');
          const nextLabel =
            normalizedValues.proposal ||
            (normalizedValues.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');

          if (previousRecord.proposal?.trim()) {
            addedHist.push({
              id: `hist-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tahun: previousRecord.tahun,
              proposalName: previousRecord.proposal,
              kpmId: previousRecord.id,
              kpmName: normalizedValues.nama,
              registerCode: previousRecord.registerCode,
              action: 'moved_out',
              fromProposal: previousRecord.proposal,
              toProposal: nextLabel,
              actorName: currentActor.nama,
              timestamp: now,
            });
          }
          if (normalizedValues.proposal?.trim()) {
            addedHist.push({
              id: `hist-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tahun: normalizedValues.tahun,
              proposalName: normalizedValues.proposal,
              kpmId: previousRecord.id,
              kpmName: normalizedValues.nama,
              registerCode: previousRecord.registerCode,
              action: 'moved_in',
              fromProposal: prevLabel,
              toProposal: normalizedValues.proposal,
              actorName: currentActor.nama,
              timestamp: now,
            });
          }
          if (addedHist.length > 0) {
            nextProposalHistory = [...addedHist, ...proposalHistory];
          }
        }
      }

      const mapped = records.map((rec) =>
        rec.id === editingId
          ? {
              ...rec,
              ...normalizedValues,
              updatedAt: now,
            }
          : rec
      );

      let nextSlotMap = proposalSlotMapRef.current;
      const leftPreviousProposal =
        previousRecord &&
        previousRecord.validasi === 'accepted' &&
        Boolean(previousRecord.proposal?.trim()) &&
        (normalizedValues.validasi !== 'accepted' ||
          previousRecord.proposal !== normalizedValues.proposal ||
          previousRecord.tahun !== normalizedValues.tahun);
      if (leftPreviousProposal && previousRecord) {
        nextSlotMap =
          oldSlotHandling === 'collapse'
            ? collapseKpmSlotsInMap(
                nextSlotMap,
                [previousRecord],
                records,
                proposals,
                items,
                wilayahList
              )
            : vacateKpmSlotsInMap(
                nextSlotMap,
                [previousRecord],
                records,
                proposals,
                items,
                wilayahList
              );
      }

      const enteredOrTargetedProposal =
        normalizedValues.validasi === 'accepted' &&
        Boolean(normalizedValues.proposal?.trim()) &&
        (leftPreviousProposal ||
          !previousRecord ||
          previousRecord.validasi !== 'accepted' ||
          Boolean(targetSlotNumber));
      if (enteredOrTargetedProposal) {
        nextSlotMap = assignKpmToProposalSlot(
          nextSlotMap,
          normalizedValues.proposalId,
          normalizedValues.proposal,
          normalizedValues.tahun,
          editingId,
          targetSlotNumber ?? null,
          mapped,
          proposals,
          items,
          wilayahList
        );
      }

      const nextRecords = recalculateProposalRegisterCodes(
        mapped,
        proposals,
        items,
        wilayahList,
        nextSlotMap
      );

      if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        await enqueueOfflineAction({
          id: `off-save-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: now,
          kind: 'save_kpm',
          label: `Edit KPM: ${normalizedValues.nama}`,
          editingRecordId: editingId,
          values: normalizedValues,
        });
        const queue = await getOfflineQueue();
        setOfflineQueueCount(queue.length);
        if (nextSlotMap !== proposalSlotMapRef.current) {
          persistProposalSlotMap(nextSlotMap, nextRecords);
        }
        setKpmAuditLogs(nextAuditLogs);
        setProposalHistory(nextProposalHistory);
        setRecords(nextRecords);
        setEditingKpmRecord(null);
        setKpmFormInitialStandaloneStatus(null);
        setTargetKpmFormSlot(null);
        if (kpmFormReturnToDetail && activeKpmId) {
          setKpmFormReturnToDetail(false);
          navigateRestoreScroll();
          setSubView('kpm-detail');
        } else if (kpmFormReturnToProposalDetail && activeProposal) {
          setKpmFormReturnToProposalDetail(false);
          navigateRestoreScroll();
          setSubView('proposal-detail');
        } else {
          navigateRestoreScroll();
          setSubView('none');
          setActiveTab(returnToTab);
        }
        setFeedback({
          type: 'success',
          message: `Mode Offline: Perubahan "${normalizedValues.nama}" disimpan ke antrean & akan disinkronkan saat internet kembali.`,
        });
        return true;
      }

      const prevById = new Map(records.map((r) => [r.id, r]));
      const affectedRecords = nextRecords.filter(
        (r) => r.id === editingId || prevById.get(r.id)?.registerCode !== r.registerCode
      );
      const addedLogs =
        nextAuditLogs.length > kpmAuditLogs.length ? [nextAuditLogs[0]] : [];
      const addedHistory = nextProposalHistory.slice(
        0,
        Math.max(0, nextProposalHistory.length - proposalHistory.length)
      );

      const ok = supabaseReadyRef.current
        ? await runSupabaseMutation(
            () =>
              upsertKpmRecordsBatchInSupabase({
                records: affectedRecords,
                proposals,
                pengelolaList,
                auditLogs: addedLogs,
                historyEntries: addedHistory,
                includeDeliveries: false,
              }),
            'Gagal menyimpan perubahan KPM ke Supabase'
          )
        : await syncOperationalData(
            {
              records: nextRecords,
              kpmAuditLogs: nextAuditLogs,
              proposalHistory: nextProposalHistory,
            },
            'update'
          );
      if (!ok) return false;

      if (nextSlotMap !== proposalSlotMapRef.current) {
        persistProposalSlotMap(nextSlotMap, nextRecords);
      }
      setKpmAuditLogs(nextAuditLogs);
      setProposalHistory(nextProposalHistory);
      setRecords(nextRecords);
      setEditingKpmRecord(null);
      setKpmFormInitialStandaloneStatus(null);
      setTargetKpmFormSlot(null);
      navigateRestoreScroll();
      if (kpmFormReturnToDetail && activeKpmId) {
        setKpmFormReturnToDetail(false);
        setSubView('kpm-detail');
      } else if (kpmFormReturnToProposalDetail && activeProposal) {
        setKpmFormReturnToProposalDetail(false);
        setSubView('proposal-detail');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      setFeedback({
        type: 'success',
        message: `Data calon KPM "${normalizedValues.nama}" berhasil diperbarui.`,
      });
      return true;
    }

    const rawNewRecord: KpmRecord = {
      id: `kpm-${Date.now()}`,
      registerCode: generateRegisterCode(
        normalizedValues.tahun,
        normalizedValues.item,
        normalizedValues.proposal
          ? records.filter(
              (r) => r.proposal === normalizedValues.proposal && r.tahun === normalizedValues.tahun
            ).length
          : records.length
      ),
      ...normalizedValues,
      createdAt: now,
      updatedAt: now,
    };

    const effectiveTargetSlot = targetSlotNumber ?? targetKpmFormSlot?.slotNumber ?? null;
    const baseNewList = [rawNewRecord, ...records];
    const nextSlotMap =
      normalizedValues.validasi === 'accepted' && normalizedValues.proposal?.trim()
        ? assignKpmToProposalSlot(
            proposalSlotMapRef.current,
            normalizedValues.proposalId,
            normalizedValues.proposal,
            normalizedValues.tahun,
            rawNewRecord.id,
            effectiveTargetSlot,
            baseNewList,
            proposals,
            items,
            wilayahList
          )
        : proposalSlotMapRef.current;

    const nextRecordsList = recalculateProposalRegisterCodes(
      baseNewList,
      proposals,
      items,
      wilayahList,
      nextSlotMap
    );
    const savedNewRecord =
      nextRecordsList.find((r) => r.id === rawNewRecord.id) ?? rawNewRecord;

    const itemMatch = resolvePackageForKpm(items, savedNewRecord.tahun, savedNewRecord.item);
    const itemDisplay =
      itemMatch && itemMatch.name !== itemMatch.code
        ? `${itemMatch.code} — ${itemMatch.name}`
        : savedNewRecord.item || '-';

    const containerLabel =
      savedNewRecord.proposal ||
      (savedNewRecord.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');

    const createdAuditEntry: KpmAuditLogEntry = {
      id: `audit-create-${Date.now()}`,
      kpmId: savedNewRecord.id,
      action: 'created',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: containerLabel,
      tahun: savedNewRecord.tahun || 'Tanpa Tahun',
      changes: [
        {
          field: 'Penempatan Awal',
          before: '-',
          after: `${containerLabel} (${savedNewRecord.tahun || 'Tanpa Tahun'})`,
        },
        { field: 'Item Bantuan', before: '-', after: itemDisplay },
        {
          field: 'Status Validasi',
          before: '-',
          after: formatValidationLabel(savedNewRecord.validasi),
        },
      ],
    };

    const enteredHistory: ProposalKpmHistoryEntry | null = savedNewRecord.proposal
      ? {
          id: `hist-enter-${Date.now()}`,
          tahun: savedNewRecord.tahun,
          proposalName: savedNewRecord.proposal,
          kpmId: savedNewRecord.id,
          kpmName: savedNewRecord.nama,
          registerCode: savedNewRecord.registerCode,
          action: 'entered',
          toProposal: savedNewRecord.proposal,
          actorName: currentActor.nama,
          timestamp: now,
        }
      : null;

    const nextAuditLogs = [createdAuditEntry, ...kpmAuditLogs];
    const nextProposalHistory = enteredHistory
      ? [enteredHistory, ...proposalHistory]
      : proposalHistory;

    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await enqueueOfflineAction({
        id: `off-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        kind: 'save_kpm',
        label: `Tambah KPM: ${normalizedValues.nama}`,
        clientRecordId: rawNewRecord.id,
        values: normalizedValues,
      });
      const queue = await getOfflineQueue();
      setOfflineQueueCount(queue.length);
      if (nextSlotMap !== proposalSlotMapRef.current) {
        persistProposalSlotMap(nextSlotMap);
      }
      setRecords(nextRecordsList);
      setKpmAuditLogs(nextAuditLogs);
      setProposalHistory(nextProposalHistory);
      setPendingSelectedProposal(null);
      setLockedKpmProposalScope(null);
      setKpmFormInitialStandaloneStatus(null);
      setTargetKpmFormSlot(null);
      if (savedNewRecord.tahun) setSelectedYear(savedNewRecord.tahun);
      setActiveKpmId(savedNewRecord.id);
      setKpmDetailReturnToRecap(false);
      setKpmDetailReturnToChatPeerId(null);
      if (kpmFormReturnToProposalDetail && activeProposal) {
        setKpmFormReturnToProposalDetail(false);
        setKpmDetailReturnToProposalDetail(true);
      } else {
        setKpmDetailReturnToProposalDetail(false);
        setReturnToTab(returnToTab);
      }
      navigateForwardScroll('smooth');
      setSubView('kpm-detail');
      setFeedback({
        type: 'success',
        message: `Mode Offline: "${savedNewRecord.nama}" disimpan ke antrean & akan dikirim saat internet kembali.`,
      });
      return true;
    }

    const prevCreateById = new Map(records.map((r) => [r.id, r]));
    const affectedCreatedRecords = nextRecordsList.filter(
      (r) =>
        r.id === savedNewRecord.id || prevCreateById.get(r.id)?.registerCode !== r.registerCode
    );

    const ok = supabaseReadyRef.current
      ? await runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: affectedCreatedRecords,
              proposals,
              pengelolaList,
              auditLogs: [createdAuditEntry],
              historyEntries: enteredHistory ? [enteredHistory] : [],
              includeDeliveries: true,
            }),
          'Gagal menyimpan calon KPM ke Supabase'
        )
      : await syncOperationalData(
          {
            records: nextRecordsList,
            kpmAuditLogs: nextAuditLogs,
            proposalHistory: nextProposalHistory,
          },
          'add'
        );
    if (!ok) return false;

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap);
    }
    setRecords(nextRecordsList);
    setKpmAuditLogs(nextAuditLogs);
    setProposalHistory(nextProposalHistory);
    setPendingSelectedProposal(null);
    setLockedKpmProposalScope(null);
    setKpmFormInitialStandaloneStatus(null);
    setTargetKpmFormSlot(null);
    if (savedNewRecord.tahun) setSelectedYear(savedNewRecord.tahun);
    setActiveKpmId(savedNewRecord.id);
    setKpmDetailReturnToRecap(false);
    setKpmDetailReturnToChatPeerId(null);
    if (kpmFormReturnToProposalDetail && activeProposal) {
      setKpmFormReturnToProposalDetail(false);
      setKpmDetailReturnToProposalDetail(true);
    } else {
      setKpmDetailReturnToProposalDetail(false);
      setReturnToTab(returnToTab);
    }
    navigateForwardScroll('smooth');
    setSubView('kpm-detail');
    setFeedback({
      type: 'success',
      message: `Calon KPM "${savedNewRecord.nama}" (${savedNewRecord.registerCode}) disimpan ke ${containerLabel}.`,
    });
    return true;
  };

  const handleDeleteKpm = (id: string, slotHandling: SlotRemovalMode = 'vacate') => {
    if (!requirePermission('delete', 'menghapus data calon KPM')) return;
    const target = records.find((r) => r.id === id);
    if (!target) return;
    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" sedang Terkunci. Data KPM tidak dapat dihapus.`,
      });
      return;
    }

    // Pindahkan ke Tempat Sampah 30 hari (berkas Drive tetap dipertahankan sampai kedaluwarsa atau dihapus permanen)
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const containerSubtitle =
      target.proposal?.trim() ||
      (target.validasi === 'rejected' ? 'Arsip Ditolak' : 'Database KPM');
    const trashEntry: TrashRecordItem = {
      id: `trash-kpm-${target.id}-${Date.now()}`,
      kind: 'kpm',
      title: target.nama,
      subtitle: [containerSubtitle, target.tahun || 'Tanpa Tahun', target.registerCode]
        .filter(Boolean)
        .join(' · '),
      tahun: target.tahun,
      deletedAt: now,
      expiresAt,
      deletedBy: currentActor.nama,
      kpmRecord: target,
    };
    const nextTrash = [trashEntry, ...trashBin];
    setTrashBin(nextTrash);
    void saveAppStateSlice('masdeta_trash_bin_v1', nextTrash);

    const removedHistory: ProposalKpmHistoryEntry = {
      id: `hist-del-${Date.now()}`,
      tahun: target.tahun,
      proposalName: target.proposal,
      kpmId: target.id,
      kpmName: target.nama,
      registerCode: target.registerCode,
      action: 'removed',
      fromProposal: target.proposal,
      actorName: currentActor.nama,
      timestamp: now,
    };

    const wasInAcceptedProposal =
      target.validasi === 'accepted' && Boolean(target.proposal?.trim());
    const nextSlotMap = wasInAcceptedProposal
      ? slotHandling === 'collapse'
        ? collapseKpmSlotsInMap(
            proposalSlotMapRef.current,
            [target],
            records,
            proposals,
            items,
            wilayahList
          )
        : vacateKpmSlotsInMap(
            proposalSlotMapRef.current,
            [target],
            records,
            proposals,
            items,
            wilayahList
          )
      : proposalSlotMapRef.current;

    const nextHistory = [removedHistory, ...proposalHistory];
    const remainingRecords = records.filter((r) => r.id !== id);
    const nextRecords = recalculateProposalRegisterCodes(
      remainingRecords,
      proposals,
      items,
      wilayahList,
      nextSlotMap
    );

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap, nextRecords);
    }
    setProposalHistory(nextHistory);
    setRecords(nextRecords);

    const prevById = new Map(records.map((r) => [r.id, r]));
    const updatedRecordsInProposal = nextRecords.filter(
      (r) => prevById.get(r.id)?.registerCode !== r.registerCode
    );

    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          deleteKpmRecordWithSideEffectsInSupabase({
            kpmId: id,
            updatedRecordsInProposal,
            proposals,
            pengelolaList,
            historyEntries: [removedHistory],
          }),
        'Gagal menghapus calon KPM dari Supabase'
      );
    } else {
      void syncOperationalData({ records: nextRecords, proposalHistory: nextHistory }, 'delete');
    }

    if (activeKpmId === id) {
      setActiveKpmId(null);
      setSubView('none');
      setActiveTab('kpm');
    }
    setFeedback({
      type: 'success',
      message: `Data calon KPM "${target.nama}" dipindahkan ke Tempat Sampah (tersimpan 30 hari).`,
    });
  };

  const handleUpdateKpmDocuments = async (
    kpmId: string,
    nextDocuments: KpmDocuments,
    auditChange: { field: string; before: string; after: string }
  ) => {
    if (!requirePermission('update', 'mengubah foto/dokumen calon KPM')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const now = new Date().toISOString();
    const updatedRecord: KpmRecord = {
      ...target,
      documents: nextDocuments,
      updatedAt: now,
    };

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-doc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [auditChange],
    };

    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) => (r.id === kpmId ? updatedRecord : r));
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);

    if (supabaseReadyRef.current) {
      const ok = await runSupabaseMutation(async () => {
        await updateKpmDocumentsInSupabase(updatedRecord, proposals, pengelolaList);
        await appendKpmAuditLogsInSupabase([auditEntry], new Set([kpmId]));
      }, 'Gagal memperbarui dokumen KPM di Supabase');
      if (ok) {
        setFeedback({
          type: 'success',
          message: `${auditChange.field} berhasil diperbarui di Google Drive & Supabase.`,
        });
      }
      return;
    }

    await syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    setFeedback({
      type: 'success',
      message: `${auditChange.field} berhasil diperbarui.`,
    });
  };

  const handleQuickSyncKpmDocuments = async (
    kpmId: string,
    nextDocuments: KpmDocuments
  ) => {
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;
    const now = new Date().toISOString();
    const updatedRecord: KpmRecord = {
      ...target,
      documents: nextDocuments,
      updatedAt: now,
    };
    const nextRecords = records.map((r) => (r.id === kpmId ? updatedRecord : r));
    setRecords(nextRecords);

    if (supabaseReadyRef.current) {
      try {
        lastLocalSyncAtRef.current = Date.now();
        await updateKpmDocumentsInSupabase(updatedRecord, proposals, pengelolaList);
        return;
      } catch {
        // Fallback ke full sync
      }
    }
    await syncOperationalData({ records: nextRecords }, 'update');
  };

  const handleQuickSyncProposalDocuments = async (
    proposalId: string,
    documents: ProposalDocuments,
    checklist: ProposalChecklist
  ) => {
    const target = proposals.find((p) => p.id === proposalId);
    if (!target) return;
    const updatedProposal: ProposalRecord = {
      ...target,
      documents,
      checklist,
      updatedAt: new Date().toISOString(),
    };
    const nextProposals = proposals.map((p) => (p.id === proposalId ? updatedProposal : p));
    setProposals(nextProposals);

    if (supabaseReadyRef.current) {
      try {
        lastLocalSyncAtRef.current = Date.now();
        await upsertProposalInSupabase(updatedProposal);
        return;
      } catch {
        // Fallback ke full sync
      }
    }
    await syncOperationalData({ proposals: nextProposals }, 'update');
  };

  const handleUpdateKpmStatus = (
    id: string,
    status: ValidationStatus,
    targetProposalId?: string,
    slotHandling: SlotRemovalMode = 'vacate'
  ) => {
    if (!requirePermission('update', 'mengubah status validasi KPM')) return;
    const target = records.find((r) => r.id === id);
    if (!target) return;
    if (
      target.validasi === status &&
      (status !== 'accepted' || !targetProposalId || target.proposalId === targetProposalId)
    ) {
      return;
    }

    const currentProp = target.proposal?.trim()
      ? (target.proposalId ? proposals.find((p) => p.id === target.proposalId) : undefined) ??
        proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
        proposals.find((p) => p.namaProposal === target.proposal)
      : undefined;
    if (currentProp?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${currentProp.namaProposal}" berstatus Terkunci.`,
      });
      return;
    }

    let nextProp: ProposalRecord | undefined;
    if (status === 'accepted') {
      nextProp =
        (targetProposalId
          ? proposals.find((p) => !isLegacyDummyProposal(p) && p.id === targetProposalId)
          : undefined) ??
        (target.proposal?.trim()
          ? proposals.find(
              (p) =>
                !isLegacyDummyProposal(p) &&
                p.namaProposal === target.proposal &&
                (!target.tahun || p.tahun === target.tahun)
            ) ??
            proposals.find(
              (p) => !isLegacyDummyProposal(p) && p.namaProposal === target.proposal
            )
          : undefined);
      if (!nextProp) {
        setFeedback({
          type: 'error',
          message: 'KPM berstatus Diterima wajib memilih Proposal aktif (Murni / Perubahan).',
        });
        return;
      }
      if (nextProp.status === 'locked') {
        setFeedback({
          type: 'error',
          message: `Proposal tujuan "${nextProp.namaProposal}" sedang Terkunci.`,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const dom = resolveKpmDomicile(target, proposals, wilayahList);
    const nextProposalId = status === 'accepted' && nextProp ? nextProp.id : null;
    const nextProposalName = status === 'accepted' && nextProp ? nextProp.namaProposal : '';
    const nextTahun =
      status === 'accepted' && nextProp
        ? target.tahun?.trim() || nextProp.tahun
        : target.tahun;

    const prevPlaceLabel =
      target.proposal ||
      (target.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');
    const nextPlaceLabel =
      nextProposalName || (status === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');

    const auditChanges: KpmAuditLogEntry['changes'] = [
      {
        field: 'Status Validasi',
        before: formatValidationLabel(target.validasi),
        after: formatValidationLabel(status),
      },
    ];
    if (prevPlaceLabel !== nextPlaceLabel) {
      auditChanges.push({
        field: 'Penempatan',
        before: prevPlaceLabel,
        after: nextPlaceLabel,
      });
    }

    const statusAudit: KpmAuditLogEntry = {
      id: `audit-st-${Date.now()}`,
      kpmId: target.id,
      action: 'status_changed',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: nextPlaceLabel,
      tahun: nextTahun || 'Tanpa Tahun',
      changes: auditChanges,
    };

    const addedHist: ProposalKpmHistoryEntry[] = [];
    if (target.proposal?.trim() && target.proposal !== nextProposalName) {
      addedHist.push({
        id: `hist-out-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tahun: target.tahun,
        proposalName: target.proposal,
        kpmId: target.id,
        kpmName: target.nama,
        registerCode: target.registerCode,
        action: 'moved_out',
        fromProposal: target.proposal,
        toProposal: nextPlaceLabel,
        actorName: currentActor.nama,
        timestamp: now,
      });
    }
    if (nextProposalName && target.proposal !== nextProposalName) {
      addedHist.push({
        id: `hist-in-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tahun: nextTahun,
        proposalName: nextProposalName,
        kpmId: target.id,
        kpmName: target.nama,
        registerCode: target.registerCode,
        action: 'moved_in',
        fromProposal: prevPlaceLabel,
        toProposal: nextProposalName,
        actorName: currentActor.nama,
        timestamp: now,
      });
    }

    const mapped = records.map((r) =>
      r.id === id
        ? {
            ...r,
            validasi: status,
            proposalId: nextProposalId,
            proposal: nextProposalName,
            tahun: nextTahun,
            kabKota: dom.kabKota,
            kecamatan: dom.kecamatan,
            kelurahan: dom.kelurahan,
            updatedAt: now,
          }
        : r
    );
    let nextSlotMap = proposalSlotMapRef.current;
    const isLeavingPrevProp =
      target.validasi === 'accepted' &&
      Boolean(target.proposal?.trim()) &&
      (status !== 'accepted' || nextProposalName !== target.proposal || nextTahun !== target.tahun);
    if (isLeavingPrevProp) {
      nextSlotMap =
        slotHandling === 'collapse'
          ? collapseKpmSlotsInMap(
              nextSlotMap,
              [target],
              records,
              proposals,
              items,
              wilayahList
            )
          : vacateKpmSlotsInMap(
              nextSlotMap,
              [target],
              records,
              proposals,
              items,
              wilayahList
            );
    }
    if (status === 'accepted' && nextProp && (target.validasi !== 'accepted' || isLeavingPrevProp)) {
      nextSlotMap = assignKpmToProposalSlot(
        nextSlotMap,
        nextProp.id,
        nextProp.namaProposal,
        nextTahun,
        id,
        null,
        mapped,
        proposals,
        items,
        wilayahList
      );
    }

    const nextRecords = mergeBastIntoRecords(
      recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList, nextSlotMap),
      kpmBastMapRef.current
    );
    const nextLogs = [statusAudit, ...kpmAuditLogs];
    const nextHistory = addedHist.length > 0 ? [...addedHist, ...proposalHistory] : proposalHistory;

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap, nextRecords);
    }
    setKpmAuditLogs(nextLogs);
    setProposalHistory(nextHistory);
    setRecords(nextRecords);

    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      void enqueueOfflineAction({
        id: `off-st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        kind: 'update_status',
        label: `Status ${target.nama} → ${formatValidationLabel(status)}`,
        kpmId: id,
        status,
        targetProposalId: nextProp?.id,
      }).then(() => getOfflineQueue().then((q) => setOfflineQueueCount(q.length)));
      setFeedback({
        type: 'success',
        message: `Mode Offline: Perubahan status "${target.nama}" masuk antrean sinkronisasi.`,
      });
      return;
    }

    const prevById = new Map(records.map((r) => [r.id, r]));
    const changedRecords = nextRecords.filter(
      (r) => r.id === id || prevById.get(r.id)?.registerCode !== r.registerCode
    );

    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertKpmRecordsBatchInSupabase({
            records: changedRecords,
            proposals,
            pengelolaList,
            auditLogs: [statusAudit],
            historyEntries: addedHist,
            includeDeliveries: false,
          }),
        'Gagal memperbarui status & penempatan KPM ke Supabase'
      );
    } else {
      void syncOperationalData(
        { records: nextRecords, kpmAuditLogs: nextLogs, proposalHistory: nextHistory },
        'update'
      );
    }
    setFeedback({
      type: 'success',
      message: `Status "${target.nama}" diperbarui ke ${formatValidationLabel(status)} (${nextPlaceLabel}).`,
    });
  };

  const handleToggleSubItem = (
    kpmId: string,
    subItemKey: string,
    subItemName: string,
    nextDelivered: boolean
  ) => {
    if (!requirePermission('update', 'mengubah checklist sub-item KPM')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const prevState = target.subItemDeliveries?.[subItemKey]?.delivered ?? false;
    if (prevState === nextDelivered) return;

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: `Sub-Item: ${subItemName}`,
          before: prevState ? 'Sudah diterima' : 'Belum diterima',
          after: nextDelivered ? 'Sudah diterima' : 'Belum diterima',
        },
      ],
    };

    const nextDeliveriesMap = {
      ...(target.subItemDeliveries || {}),
      [subItemKey]: {
        delivered: nextDelivered,
        updatedAt: now,
        updatedBy: currentActor.nama,
      },
    };
    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === kpmId
        ? {
            ...r,
            subItemDeliveries: nextDeliveriesMap,
            updatedAt: now,
          }
        : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);

    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      void enqueueOfflineAction({
        id: `off-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        kind: 'toggle_subitem',
        label: `Checklist ${subItemName} (${target.nama})`,
        kpmId,
        subItemKey,
        subItemName,
        delivered: nextDelivered,
      }).then(() => getOfflineQueue().then((q) => setOfflineQueueCount(q.length)));
      setFeedback({
        type: 'success',
        message: `Mode Offline: Checklist "${subItemName}" masuk antrean sinkronisasi.`,
      });
      return;
    }

    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertKpmSubItemDeliveriesInSupabase({
            kpmId,
            deliveries: nextDeliveriesMap,
            updatedAt: now,
            auditLogs: [auditEntry],
          }),
        'Gagal memperbarui checklist sub-item ke Supabase'
      );
    } else {
      void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    }
  };

  const handleMarkAllSubItemsDelivered = (
    kpmId: string,
    subItems: { key: string; name: string }[]
  ) => {
    if (!requirePermission('update', 'menandai semua sub-item diterima')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const existing = target.subItemDeliveries || {};
    const changedSubs = subItems.filter((s) => !(existing[s.key]?.delivered ?? false));
    if (changedSubs.length === 0) return;

    const nextDeliveries = { ...existing };
    for (const s of subItems) {
      nextDeliveries[s.key] = {
        delivered: true,
        updatedAt: now,
        updatedBy: currentActor.nama,
      };
    }

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-suball-${Date.now()}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: changedSubs.map((s) => ({
        field: `Sub-Item: ${s.name}`,
        before: 'Belum diterima',
        after: 'Sudah diterima',
      })),
    };

    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === kpmId
        ? {
            ...r,
            subItemDeliveries: nextDeliveries,
            updatedAt: now,
          }
        : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertKpmSubItemDeliveriesInSupabase({
            kpmId,
            deliveries: nextDeliveries,
            updatedAt: now,
            auditLogs: [auditEntry],
          }),
        'Gagal memperbarui sub-item KPM ke Supabase'
      );
    } else {
      void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    }
  };

  const handleFlushOfflineQueue = useCallback(async () => {
    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    if (isFlushingQueueRef.current) return;

    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      setOfflineQueueCount(0);
      return;
    }

    isFlushingQueueRef.current = true;
    try {
      let baseSnapshot = latestDataRef.current;
      if (supabaseReadyRef.current) {
        try {
          const freshRemote = await fetchOperationalDataFromSupabase();
          baseSnapshot = {
            ...freshRemote,
            wilayahList:
              freshRemote.wilayahList.length > 0
                ? freshRemote.wilayahList
                : latestDataRef.current.wilayahList,
          };
        } catch {
          // Fallback ke snapshot lokal terakhir jika fetch sementara gagal
        }
      }

      const prevRecordById = new Map(baseSnapshot.records.map((r) => [r.id, r]));
      let workRecords = [...baseSnapshot.records];
      let workAuditLogs = [...baseSnapshot.kpmAuditLogs];
      const workHistory = [...baseSnapshot.proposalHistory];
      const workProposals = baseSnapshot.proposals;
      const workItems = baseSnapshot.items;
      const workWilayah = baseSnapshot.wilayahList;
      const workPengelola = baseSnapshot.pengelolaList;
      const actor = {
        nama: currentUser?.nama ?? 'Petugas Internal',
        email: currentUser?.email,
      };

      const touchedRecordIds = new Set<string>();
      const addedAuditLogs: KpmAuditLogEntry[] = [];
      let processedCount = 0;
      const processedIds: string[] = [];

      for (const act of queue) {
        try {
          if (act.kind === 'save_kpm') {
            if (act.editingRecordId) {
              const prev = workRecords.find((r) => r.id === act.editingRecordId);
              if (prev) {
                workRecords = workRecords.map((r) =>
                  r.id === act.editingRecordId
                    ? {
                        ...r,
                        ...act.values,
                        validasi: act.values.validasi || r.validasi,
                        updatedAt: act.createdAt,
                      }
                    : r
                );
                touchedRecordIds.add(act.editingRecordId);
              }
            } else {
              const targetId =
                act.clientRecordId ||
                `kpm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
              const dupById = workRecords.some((r) => r.id === targetId);
              const dupByNik =
                act.values.nikKtp &&
                workRecords.some((r) => r.nikKtp === act.values.nikKtp && r.nama === act.values.nama);
              if (!dupById && !dupByNik) {
                const newRec: KpmRecord = {
                  id: targetId,
                  registerCode: generateRegisterCode(
                    act.values.tahun,
                    act.values.item,
                    workRecords.filter(
                      (r) => r.proposal === act.values.proposal && r.tahun === act.values.tahun
                    ).length
                  ),
                  ...act.values,
                  validasi: act.values.validasi || 'pending',
                  createdAt: act.createdAt,
                  updatedAt: act.createdAt,
                };
                workRecords = [newRec, ...workRecords];
                touchedRecordIds.add(targetId);
              } else if (dupById) {
                touchedRecordIds.add(targetId);
              }
            }
            processedIds.push(act.id);
            processedCount++;
          } else if (act.kind === 'update_status') {
            const target = workRecords.find((r) => r.id === act.kpmId);
            if (target && target.validasi !== act.status) {
              const targetProp =
                act.status === 'accepted'
                  ? (act.targetProposalId
                      ? workProposals.find((p) => !isLegacyDummyProposal(p) && p.id === act.targetProposalId)
                      : undefined) ??
                    (target.proposal
                      ? workProposals.find(
                          (p) => !isLegacyDummyProposal(p) && p.namaProposal === target.proposal
                        )
                      : undefined)
                  : undefined;
              const resolvedStatus: ValidationStatus =
                act.status === 'accepted' && !targetProp ? 'pending' : act.status;
              const dom = resolveKpmDomicile(target, workProposals, workWilayah);
              const nextPropName = resolvedStatus === 'accepted' && targetProp ? targetProp.namaProposal : '';
              const nextPropId = resolvedStatus === 'accepted' && targetProp ? targetProp.id : null;

              const auditEntry: KpmAuditLogEntry = {
                id: `audit-off-st-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                kpmId: target.id,
                action: 'status_changed',
                actorName: actor.nama,
                actorEmail: actor.email,
                timestamp: act.createdAt,
                proposal: nextPropName || (resolvedStatus === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM'),
                tahun: target.tahun || targetProp?.tahun || 'Tanpa Tahun',
                changes: [
                  {
                    field: 'Status Validasi',
                    before: formatValidationLabel(target.validasi),
                    after: formatValidationLabel(resolvedStatus),
                  },
                ],
              };
              workAuditLogs = [auditEntry, ...workAuditLogs];
              addedAuditLogs.push(auditEntry);
              workRecords = workRecords.map((r) =>
                r.id === act.kpmId
                  ? {
                      ...r,
                      validasi: resolvedStatus,
                      proposalId: nextPropId,
                      proposal: nextPropName,
                      tahun: target.tahun || targetProp?.tahun || '',
                      kabKota: dom.kabKota,
                      kecamatan: dom.kecamatan,
                      kelurahan: dom.kelurahan,
                      updatedAt: act.createdAt,
                    }
                  : r
              );
              touchedRecordIds.add(act.kpmId);
            }
            processedIds.push(act.id);
            processedCount++;
          } else if (act.kind === 'toggle_subitem') {
            const target = workRecords.find((r) => r.id === act.kpmId);
            if (target) {
              workRecords = workRecords.map((r) =>
                r.id === act.kpmId
                  ? {
                      ...r,
                      subItemDeliveries: {
                        ...(r.subItemDeliveries || {}),
                        [act.subItemKey]: {
                          delivered: act.delivered,
                          updatedAt: act.createdAt,
                          updatedBy: actor.nama,
                        },
                      },
                      updatedAt: act.createdAt,
                    }
                  : r
              );
              touchedRecordIds.add(act.kpmId);
            }
            processedIds.push(act.id);
            processedCount++;
          } else if (act.kind === 'upload_doc') {
            const target = workRecords.find((r) => r.id === act.kpmId);
            if (target) {
              const fileObj = new File([act.fileBlob], act.fileName, { type: act.mimeType });
              const uploaded = await uploadImageDocumentToDrive(fileObj);
              const docs = { ...target.documents };
              if (act.category === 'rumah') {
                docs.rumah = [...(docs.rumah || []), uploaded];
              } else if (act.category === 'lainnya') {
                docs.lainnya = [...(docs.lainnya || []), uploaded];
              } else {
                docs[act.category] = uploaded;
              }
              workRecords = workRecords.map((r) =>
                r.id === act.kpmId ? { ...r, documents: docs, updatedAt: act.createdAt } : r
              );
              touchedRecordIds.add(act.kpmId);
            }
            processedIds.push(act.id);
            processedCount++;
          }
        } catch {
          // Biarkan aksi tetap di antrean jika satu langkah gagal
        }
      }

      workRecords = recalculateProposalRegisterCodes(
        workRecords,
        workProposals,
        workItems,
        workWilayah,
        proposalSlotMapRef.current
      );

      if (processedIds.length > 0) {
        const changedRecords = workRecords.filter(
          (r) =>
            touchedRecordIds.has(r.id) ||
            !prevRecordById.has(r.id) ||
            prevRecordById.get(r.id)?.registerCode !== r.registerCode
        );

        const ok = supabaseReadyRef.current
          ? await runSupabaseMutation(
              () =>
                upsertKpmRecordsBatchInSupabase({
                  records: changedRecords,
                  proposals: workProposals,
                  pengelolaList: workPengelola,
                  auditLogs: addedAuditLogs,
                  includeDeliveries: true,
                }),
              'Gagal menyinkronkan antrean offline ke Supabase'
            )
          : await syncOperationalData(
              {
                records: workRecords,
                kpmAuditLogs: workAuditLogs,
                proposalHistory: workHistory,
              },
              'update'
            );
        if (ok) {
          for (const id of processedIds) {
            await removeOfflineAction(id);
          }
          applyRemoteOperationalState({
            ...baseSnapshot,
            records: workRecords,
            kpmAuditLogs: workAuditLogs,
            proposalHistory: workHistory,
          });
          const remaining = await getOfflineQueue();
          setOfflineQueueCount(remaining.length);
          setFeedback({
            type: 'success',
            message: `Sinkronisasi offline selesai: ${processedCount} perubahan berhasil diunggah ke server.`,
          });
        }
      }
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [currentUser, applyRemoteOperationalState, runSupabaseMutation, syncOperationalData]);

  useEffect(() => {
    const onOnline = () => {
      void handleFlushOfflineQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [handleFlushOfflineQueue]);

  useEffect(() => {
    if (isOnline && offlineQueueCount > 0 && authReady && currentUser) {
      void handleFlushOfflineQueue();
    }
  }, [isOnline, offlineQueueCount, authReady, currentUser, handleFlushOfflineQueue]);

  const handleBulkUpdateKpms = async (
    ids: string[],
    patch: {
      validasi?: ValidationStatus;
      targetProposalId?: string;
      dtsen?: string;
      item?: string;
      markAllSubItems?: boolean;
    }
  ) => {
    if (!requirePermission('update', 'mengubah data KPM secara massal')) return;
    if (ids.length === 0) return;

    const targetProposalForBulk = patch.targetProposalId
      ? proposals.find((p) => !isLegacyDummyProposal(p) && p.id === patch.targetProposalId)
      : undefined;

    if (targetProposalForBulk?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal tujuan "${targetProposalForBulk.namaProposal}" berstatus Terkunci.`,
      });
      return;
    }

    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const newLogs: KpmAuditLogEntry[] = [];
    const newHistEntries: ProposalKpmHistoryEntry[] = [];
    let updatedCount = 0;

    const mapped = records.map((rec, idx) => {
      if (!idSet.has(rec.id)) return rec;
      const prop = rec.proposal?.trim()
        ? (rec.proposalId ? proposals.find((p) => p.id === rec.proposalId) : undefined) ??
          proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
          proposals.find((p) => p.namaProposal === rec.proposal)
        : undefined;
      if (prop?.status === 'locked') return rec;

      const changes: KpmAuditLogEntry['changes'] = [];
      let nextRec = { ...rec };

      if (patch.validasi) {
        const dom = resolveKpmDomicile(rec, proposals, wilayahList);
        if (patch.validasi === 'accepted') {
          const resolvedProp =
            targetProposalForBulk ??
            (prop && !isLegacyDummyProposal(prop) ? prop : undefined);
          if (!resolvedProp) {
            return rec;
          }
          const statusChanged = rec.validasi !== 'accepted';
          const propChanged = rec.proposal !== resolvedProp.namaProposal || rec.proposalId !== resolvedProp.id;
          if (statusChanged) {
            changes.push({
              field: 'Status Validasi (Massal)',
              before: formatValidationLabel(rec.validasi),
              after: 'Diterima',
            });
          }
          if (propChanged) {
            const prevPlace =
              rec.proposal ||
              (rec.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM');
            changes.push({
              field: 'Penempatan (Massal)',
              before: prevPlace,
              after: resolvedProp.namaProposal,
            });
            if (rec.proposal?.trim()) {
              newHistEntries.push({
                id: `hist-bout-${Date.now()}-${idx}`,
                tahun: rec.tahun,
                proposalName: rec.proposal,
                kpmId: rec.id,
                kpmName: rec.nama,
                registerCode: rec.registerCode,
                action: 'moved_out',
                fromProposal: rec.proposal,
                toProposal: resolvedProp.namaProposal,
                actorName: currentActor.nama,
                timestamp: now,
              });
            }
            newHistEntries.push({
              id: `hist-bin-${Date.now()}-${idx}`,
              tahun: rec.tahun?.trim() || resolvedProp.tahun,
              proposalName: resolvedProp.namaProposal,
              kpmId: rec.id,
              kpmName: rec.nama,
              registerCode: rec.registerCode,
              action: 'moved_in',
              fromProposal: prevPlace,
              toProposal: resolvedProp.namaProposal,
              actorName: currentActor.nama,
              timestamp: now,
            });
          }
          nextRec = {
            ...nextRec,
            validasi: 'accepted',
            proposalId: resolvedProp.id,
            proposal: resolvedProp.namaProposal,
            tahun: rec.tahun?.trim() || resolvedProp.tahun,
            kabKota: dom.kabKota,
            kecamatan: dom.kecamatan,
            kelurahan: dom.kelurahan,
          };
        } else {
          const nextPlace =
            patch.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM';
          if (rec.validasi !== patch.validasi) {
            changes.push({
              field: 'Status Validasi (Massal)',
              before: formatValidationLabel(rec.validasi),
              after: formatValidationLabel(patch.validasi),
            });
          }
          if (rec.proposal?.trim()) {
            changes.push({
              field: 'Penempatan (Massal)',
              before: rec.proposal,
              after: nextPlace,
            });
            newHistEntries.push({
              id: `hist-bdetach-${Date.now()}-${idx}`,
              tahun: rec.tahun,
              proposalName: rec.proposal,
              kpmId: rec.id,
              kpmName: rec.nama,
              registerCode: rec.registerCode,
              action: 'moved_out',
              fromProposal: rec.proposal,
              toProposal: nextPlace,
              actorName: currentActor.nama,
              timestamp: now,
            });
          }
          nextRec = {
            ...nextRec,
            validasi: patch.validasi,
            proposalId: null,
            proposal: '',
            kabKota: dom.kabKota,
            kecamatan: dom.kecamatan,
            kelurahan: dom.kelurahan,
          };
        }
      }

      if (patch.dtsen !== undefined && patch.dtsen !== rec.dtsen) {
        changes.push({
          field: 'Klasifikasi DTSEN (Massal)',
          before: rec.dtsen || '-',
          after: patch.dtsen || '-',
        });
        nextRec.dtsen = patch.dtsen;
      }
      if (patch.item && patch.item !== rec.item) {
        changes.push({
          field: 'Item Bantuan (Massal)',
          before: rec.item || '-',
          after: patch.item,
        });
        nextRec.item = patch.item;
      }
      if (patch.markAllSubItems) {
        const pkg = resolvePackageForKpm(items, rec.tahun, patch.item || rec.item);
        const subNames = pkg?.subItems || [];
        if (subNames.length > 0) {
          const nextDeliveries = { ...(rec.subItemDeliveries || {}) };
          let subChanged = 0;
          for (const subName of subNames) {
            const key = normalizeSubItemKey(subName);
            if (!nextDeliveries[key]?.delivered) {
              nextDeliveries[key] = {
                delivered: true,
                updatedAt: now,
                updatedBy: currentActor.nama,
              };
              subChanged++;
            }
          }
          if (subChanged > 0) {
            changes.push({
              field: 'Sub-Item Diterima (Massal)',
              before: `${subNames.length - subChanged}/${subNames.length}`,
              after: `${subNames.length}/${subNames.length}`,
            });
            nextRec.subItemDeliveries = nextDeliveries;
          }
        }
      }

      if (changes.length === 0) return rec;
      updatedCount++;
      nextRec.updatedAt = now;
      newLogs.push({
        id: `audit-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kpmId: rec.id,
        action: patch.validasi ? 'status_changed' : 'updated',
        actorName: currentActor.nama,
        actorEmail: currentActor.email,
        timestamp: now,
        proposal:
          nextRec.proposal ||
          (nextRec.validasi === 'rejected' ? 'Arsip Berkas Ditolak' : 'Database KPM'),
        tahun: nextRec.tahun || 'Tanpa Tahun',
        changes,
      });
      return nextRec;
    });

    if (updatedCount === 0) {
      setFeedback({
        type: 'error',
        message: 'Tidak ada KPM yang berubah (proposal terkunci atau nilai sudah sama).',
      });
      return;
    }

    let nextSlotMap = proposalSlotMapRef.current;
    if (patch.validasi) {
      const updatedIdSet = new Set(newLogs.map((l) => l.kpmId));
      const vacatedTargets = records.filter((oldRec) => {
        if (!updatedIdSet.has(oldRec.id)) return false;
        if (oldRec.validasi !== 'accepted' || !oldRec.proposal?.trim()) return false;
        const newRec = mapped.find((m) => m.id === oldRec.id);
        return (
          !newRec ||
          newRec.validasi !== 'accepted' ||
          newRec.proposal !== oldRec.proposal ||
          newRec.tahun !== oldRec.tahun
        );
      });
      if (vacatedTargets.length > 0) {
        nextSlotMap = vacateKpmSlotsInMap(
          nextSlotMap,
          vacatedTargets,
          records,
          proposals,
          items,
          wilayahList
        );
      }
      const enteredTargets = mapped.filter((newRec) => {
        if (!updatedIdSet.has(newRec.id)) return false;
        if (newRec.validasi !== 'accepted' || !newRec.proposal?.trim()) return false;
        const oldRec = records.find((r) => r.id === newRec.id);
        return (
          !oldRec ||
          oldRec.validasi !== 'accepted' ||
          oldRec.proposal !== newRec.proposal ||
          oldRec.tahun !== newRec.tahun
        );
      });
      for (const entered of enteredTargets) {
        nextSlotMap = assignKpmToProposalSlot(
          nextSlotMap,
          entered.proposalId,
          entered.proposal,
          entered.tahun,
          entered.id,
          null,
          mapped,
          proposals,
          items,
          wilayahList
        );
      }
    }

    const nextRecords =
      patch.item || patch.validasi
        ? mergeBastIntoRecords(
            recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList, nextSlotMap),
            kpmBastMapRef.current
          )
        : mapped;
    const nextLogs = [...newLogs, ...kpmAuditLogs];
    const nextHistory =
      newHistEntries.length > 0 ? [...newHistEntries, ...proposalHistory] : proposalHistory;

    const prevById = new Map(records.map((r) => [r.id, r]));
    const changedIdSet = new Set(newLogs.map((l) => l.kpmId));
    const changedRecords = nextRecords.filter(
      (r) => changedIdSet.has(r.id) || prevById.get(r.id)?.registerCode !== r.registerCode
    );

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap);
    }
    setRecords(nextRecords);
    setKpmAuditLogs(nextLogs);
    setProposalHistory(nextHistory);
    const ok = supabaseReadyRef.current
      ? await runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: changedRecords,
              proposals,
              pengelolaList,
              auditLogs: newLogs,
              historyEntries: newHistEntries,
              includeDeliveries: Boolean(patch.markAllSubItems),
            }),
          'Gagal memperbarui data massal ke Supabase'
        )
      : await syncOperationalData(
          { records: nextRecords, kpmAuditLogs: nextLogs, proposalHistory: nextHistory },
          'update'
        );
    if (ok) {
      setFeedback({
        type: 'success',
        message: `${updatedCount} calon KPM berhasil diperbarui secara massal.`,
      });
    }
  };

  const handleBulkRecoverToDatabase = async (kpmIds: string[]) => {
    await handleBulkUpdateKpms(kpmIds, { validasi: 'pending' });
  };

  const handleBulkRejectToArsip = async (kpmIds: string[]) => {
    await handleBulkUpdateKpms(kpmIds, { validasi: 'rejected' });
  };

  const handleBulkAssignToProposal = async (
    kpmIds: string[],
    targetProposal: ProposalRecord
  ) => {
    await handleBulkUpdateKpms(kpmIds, {
      validasi: 'accepted',
      targetProposalId: targetProposal.id,
    });
  };

  const handleBulkPermanentDeleteKpms = async (kpmIds: string[]) => {
    if (!requirePermission('delete', 'menghapus data KPM secara permanen')) return;
    if (kpmIds.length === 0) return;

    const idSet = new Set(kpmIds);
    const deletableTargets = records.filter((rec) => {
      if (!idSet.has(rec.id)) return false;
      if (rec.proposal?.trim()) {
        const prop =
          (rec.proposalId ? proposals.find((p) => p.id === rec.proposalId) : undefined) ??
          proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
          proposals.find((p) => p.namaProposal === rec.proposal);
        if (prop?.status === 'locked') return false;
      }
      return true;
    });

    if (deletableTargets.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Tidak ada KPM yang dapat dihapus permanen.',
      });
      return;
    }

    const deleteSet = new Set(deletableTargets.map((r) => r.id));
    const now = new Date().toISOString();
    const removedHistory: ProposalKpmHistoryEntry[] = deletableTargets
      .filter((t) => Boolean(t.proposal?.trim()))
      .map((t, idx) => ({
        id: `hist-pdel-${Date.now()}-${idx}`,
        tahun: t.tahun,
        proposalName: t.proposal,
        kpmId: t.id,
        kpmName: t.nama,
        registerCode: t.registerCode,
        action: 'removed',
        fromProposal: t.proposal,
        actorName: currentActor.nama,
        timestamp: now,
      }));

    const nextSlotMap = vacateKpmSlotsInMap(
      proposalSlotMapRef.current,
      deletableTargets,
      records,
      proposals,
      items,
      wilayahList
    );

    const remainingRecords = recalculateProposalRegisterCodes(
      records.filter((r) => !deleteSet.has(r.id)),
      proposals,
      items,
      wilayahList,
      nextSlotMap
    );
    const nextRecords = mergeBastIntoRecords(remainingRecords, kpmBastMapRef.current);
    const nextLogs = kpmAuditLogs.filter((l) => !deleteSet.has(l.kpmId));
    const nextHistory =
      removedHistory.length > 0 ? [...removedHistory, ...proposalHistory] : proposalHistory;

    const prevById = new Map(records.map((r) => [r.id, r]));
    const updatedShiftRecords = nextRecords.filter(
      (r) => prevById.get(r.id)?.registerCode !== r.registerCode
    );

    const ok = supabaseReadyRef.current
      ? await runSupabaseMutation(
          () =>
            deleteKpmsBatchInSupabase({
              kpmIds: deletableTargets.map((t) => t.id),
              updatedRecords: updatedShiftRecords,
              proposals,
              pengelolaList,
              historyEntries: removedHistory,
            }),
          'Gagal menghapus KPM permanen dari Supabase'
        )
      : await syncOperationalData(
          {
            records: nextRecords,
            kpmAuditLogs: nextLogs,
            proposalHistory: nextHistory,
          },
          'delete'
        );
    if (!ok) return;

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap);
    }
    setRecords(nextRecords);
    setKpmAuditLogs(nextLogs);
    setProposalHistory(nextHistory);
    if (activeKpmId && deleteSet.has(activeKpmId)) {
      setActiveKpmId(null);
      setSubView('none');
    }
    setFeedback({
      type: 'success',
      message: `${deletableTargets.length} data KPM berhasil dihapus permanen beserta dokumen dan riwayat terkait.`,
    });
  };

  const handleSaveKpmBast = async (
    kpmId: string,
    file: File,
    meta: { recipientName: string; lat?: number; lng?: number; accuracy?: number }
  ) => {
    if (!requirePermission('update', 'menyimpan tanda terima BAST digital')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const uploadedDoc = await uploadImageDocumentToDrive(file, target.bast?.signatureDoc);
    const now = new Date().toISOString();
    const bastInfo: KpmBastInfo = {
      signedAt: now,
      signedBy: currentActor.nama,
      recipientName: meta.recipientName,
      lat: meta.lat,
      lng: meta.lng,
      accuracy: meta.accuracy,
      signatureDoc: uploadedDoc,
    };

    const nextBastMap = { ...kpmBastMapRef.current, [kpmId]: bastInfo };
    kpmBastMapRef.current = nextBastMap;
    setKpmBastMap(nextBastMap);
    void saveAppStateSlice('masdeta_kpm_bast_v1', nextBastMap);

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-bast-${Date.now()}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: 'Tanda Terima Digital (BAST)',
          before: target.bast?.recipientName || 'Belum ditandatangani',
          after: `Ditandatangani oleh ${meta.recipientName}`,
        },
      ],
    };

    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === kpmId ? { ...r, bast: bastInfo, updatedAt: now } : r
    );
    const updatedRec = nextRecords.find((r) => r.id === kpmId);
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    if (supabaseReadyRef.current && updatedRec) {
      await runSupabaseMutation(
        () =>
          upsertKpmRecordsBatchInSupabase({
            records: [updatedRec],
            proposals,
            pengelolaList,
            auditLogs: [auditEntry],
            includeDeliveries: false,
          }),
        'Gagal menyimpan tanda terima BAST ke Supabase'
      );
    } else {
      await syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    }
    setFeedback({
      type: 'success',
      message: `Tanda terima digital (BAST) "${target.nama}" berhasil disimpan ke Google Drive & Supabase.`,
    });
  };

  const handleRestoreTrashItem = (trashId: string) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang dapat memulihkan data dari Tempat Sampah.',
      });
      return;
    }
    const target = trashBin.find((t) => t.id === trashId);
    if (!target) return;

    const now = new Date().toISOString();
    const nextTrash = trashBin.filter((t) => t.id !== trashId);

    if (target.kind === 'kpm' && target.kpmRecord) {
      const kpm = target.kpmRecord;
      const alreadyExists = records.some((r) => r.id === kpm.id);
      const baseRecords = alreadyExists ? records : [{ ...kpm, updatedAt: now }, ...records];
      const nextSlotMap =
        !alreadyExists && kpm.validasi === 'accepted' && kpm.proposal?.trim()
          ? assignKpmToProposalSlot(
              proposalSlotMapRef.current,
              kpm.proposalId,
              kpm.proposal,
              kpm.tahun,
              kpm.id,
              null,
              baseRecords,
              proposals,
              items,
              wilayahList
            )
          : proposalSlotMapRef.current;
      const nextRecords = mergeBastIntoRecords(
        recalculateProposalRegisterCodes(baseRecords, proposals, items, wilayahList, nextSlotMap),
        kpmBastMapRef.current
      );
      const restoreHist: ProposalKpmHistoryEntry = {
        id: `hist-restore-kpm-${Date.now()}`,
        tahun: kpm.tahun,
        proposalName: kpm.proposal,
        kpmId: kpm.id,
        kpmName: kpm.nama,
        registerCode: kpm.registerCode,
        action: 'entered',
        toProposal: kpm.proposal,
        actorName: `${currentActor.nama} (Pulihkan Sampah)`,
        timestamp: now,
      };
      const nextHistory = [restoreHist, ...proposalHistory];

      const prevById = new Map(records.map((r) => [r.id, r]));
      const affectedRecords = nextRecords.filter(
        (r) => r.id === kpm.id || prevById.get(r.id)?.registerCode !== r.registerCode
      );

      if (nextSlotMap !== proposalSlotMapRef.current) {
        persistProposalSlotMap(nextSlotMap);
      }
      setTrashBin(nextTrash);
      setRecords(nextRecords);
      setProposalHistory(nextHistory);
      void saveAppStateSlice('masdeta_trash_bin_v1', nextTrash);
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: affectedRecords,
              proposals,
              pengelolaList,
              historyEntries: [restoreHist],
              includeDeliveries: true,
            }),
          'Gagal memulihkan data KPM ke Supabase'
        );
      } else {
        void syncOperationalData(
          { records: nextRecords, proposalHistory: nextHistory },
          'add'
        );
      }
      setFeedback({
        type: 'success',
        message: `Calon KPM "${kpm.nama}" berhasil dipulihkan beserta foto terkait.`,
      });
      return;
    }

    if (target.kind === 'proposal' && target.proposalRecord) {
      const prop = target.proposalRecord;
      const exists = proposals.some(
        (p) =>
          p.id === prop.id ||
          (p.namaProposal.toLowerCase() === prop.namaProposal.toLowerCase() &&
            p.tahun === prop.tahun)
      );
      const restoredProp: ProposalRecord = { ...prop, updatedAt: now };
      const nextProposals = exists ? proposals : [restoredProp, ...proposals];
      const restoreHist = createActivityHistoryEntry('proposal_restored', {
        proposalName: prop.namaProposal,
        detail: `Memulihkan proposal "${prop.namaProposal}" (${prop.tahun}) dari Tempat Sampah.`,
        tahun: prop.tahun,
        action: 'entered',
      });
      const nextHistory = [restoreHist, ...proposalHistory];

      setTrashBin(nextTrash);
      setProposals(nextProposals);
      setProposalHistory(nextHistory);
      void saveAppStateSlice('masdeta_trash_bin_v1', nextTrash);
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            upsertProposalsBatchInSupabase({
              proposals: exists ? [] : [restoredProp],
              historyEntries: [restoreHist],
            }),
          'Gagal memulihkan proposal ke Supabase'
        );
      } else {
        void syncOperationalData(
          { proposals: nextProposals, proposalHistory: nextHistory },
          'add'
        );
      }
      setFeedback({
        type: 'success',
        message: `Proposal "${prop.namaProposal}" berhasil dipulihkan dari Tempat Sampah.`,
      });
    }
  };

  const handlePermanentDeleteTrashItem = (trashId: string) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang dapat menghapus data secara permanen.',
      });
      return;
    }
    const target = trashBin.find((t) => t.id === trashId);
    if (!target) return;

    const docsToDelete: KpmDocumentFile[] = [];
    if (target.kpmRecord) {
      const d = target.kpmRecord.documents;
      if (d.ktp) docsToDelete.push(d.ktp);
      if (d.kk) docsToDelete.push(d.kk);
      if (d.penerima) docsToDelete.push(d.penerima);
      if (d.survey) docsToDelete.push(d.survey);
      (d.rumah || []).forEach((x) => docsToDelete.push(x));
      (d.lainnya || []).forEach((x) => docsToDelete.push(x));
      if (target.kpmRecord.bast?.signatureDoc) {
        docsToDelete.push(target.kpmRecord.bast.signatureDoc);
      }
    }
    if (target.proposalRecord) {
      Object.values(target.proposalRecord.documents || {}).forEach((doc) => {
        if (doc) docsToDelete.push(doc);
      });
    }
    if (docsToDelete.length > 0) {
      void Promise.allSettled(docsToDelete.map((doc) => removeDocumentFromDrive(doc)));
    }

    const nextTrash = trashBin.filter((t) => t.id !== trashId);
    setTrashBin(nextTrash);
    void saveAppStateSlice('masdeta_trash_bin_v1', nextTrash);
    setFeedback({
      type: 'success',
      message: `"${target.title}" beserta berkas Drive terkait dihapus permanen.`,
    });
  };

  const handleAddSchedule = (payload: {
    title: string;
    category: ScheduleCategory;
    targetDate: string;
    targetTime?: string;
    tahun?: string;
    proposalName?: string;
    location?: string;
    footerNote?: string;
    notes?: string;
  }) => {
    const newItem: ScheduleEventItem = {
      id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: payload.title,
      category: payload.category,
      targetDate: payload.targetDate,
      targetTime: payload.targetTime?.trim() || undefined,
      tahun: payload.tahun?.trim() || selectedYear,
      proposalName: payload.proposalName,
      location: payload.location?.trim() || undefined,
      footerNote: payload.footerNote?.trim() || undefined,
      notes: payload.notes,
      completed: false,
      createdBy: currentActor.nama,
      createdAt: new Date().toISOString(),
    };
    const next = [newItem, ...schedules].sort((a, b) => {
      const dateCmp = a.targetDate.localeCompare(b.targetDate);
      if (dateCmp !== 0) return dateCmp;
      return (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99');
    });
    setSchedules(next);
    void saveAppStateSlice('masdeta_schedules_v1', next);
    setFeedback({
      type: 'success',
      message: `Agenda "${payload.title}" berhasil ditambahkan ke jadwal.`,
    });
  };

  const handleUpdateSchedule = (
    id: string,
    payload: {
      title: string;
      category: ScheduleCategory;
      targetDate: string;
      targetTime?: string;
      tahun?: string;
      proposalName?: string;
      location?: string;
      footerNote?: string;
      notes?: string;
    }
  ) => {
    const next = schedules
      .map((s) =>
        s.id === id
          ? {
              ...s,
              title: payload.title,
              category: payload.category,
              targetDate: payload.targetDate,
              targetTime: payload.targetTime?.trim() || undefined,
              tahun: payload.tahun?.trim() || s.tahun,
              proposalName: payload.proposalName,
              location: payload.location?.trim() || undefined,
              footerNote: payload.footerNote?.trim() || undefined,
              notes: payload.notes,
            }
          : s
      )
      .sort((a, b) => {
        const dateCmp = a.targetDate.localeCompare(b.targetDate);
        if (dateCmp !== 0) return dateCmp;
        return (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99');
      });
    setSchedules(next);
    void saveAppStateSlice('masdeta_schedules_v1', next);
    setFeedback({
      type: 'success',
      message: `Agenda "${payload.title}" berhasil diperbarui.`,
    });
  };

  const handleToggleSchedule = (id: string) => {
    const now = new Date().toISOString();
    const next = schedules.map((s) =>
      s.id === id
        ? {
            ...s,
            completed: !s.completed,
            completedAt: !s.completed ? now : undefined,
          }
        : s
    );
    setSchedules(next);
    void saveAppStateSlice('masdeta_schedules_v1', next);
  };

  const handleDeleteSchedule = (id: string) => {
    const next = schedules.filter((s) => s.id !== id);
    setSchedules(next);
    void saveAppStateSlice('masdeta_schedules_v1', next);
  };

  const handleSaveReportTemplate = (next: ReportTemplateConfig) => {
    setReportTemplate(next);
    void saveAppStateSlice('masdeta_report_template_v1', next);
    setFeedback({
      type: 'success',
      message: 'Template Kop Surat & penandatangan resmi berhasil disimpan.',
    });
  };

  const handleSaveCouponConfig = (next: CouponPrintConfig) => {
    setCouponConfig(next);
    void saveAppStateSlice('masdeta_coupon_config_v1', next);
    setFeedback({
      type: 'success',
      message: 'Pengaturan cetak kupon pembagian berhasil disimpan.',
    });
  };

  const handleSaveBastTemplate = (next: BastTemplateConfig) => {
    setBastTemplate(next);
    void saveAppStateSlice('masdeta_bast_template_v1', next);
    setFeedback({
      type: 'success',
      message: 'Template BAST resmi Dinas Sosial berhasil disimpan.',
    });
  };

  const handleSaveProposalBastConfig = (
    proposalId: string,
    config: Partial<BastTemplateConfig> | null
  ) => {
    const next: ProposalBastMap = { ...proposalBastMap };
    if (config === null) {
      delete next[proposalId];
    } else {
      next[proposalId] = config;
    }
    setProposalBastMap(next);
    void saveAppStateSlice('masdeta_proposal_bast_v1', next);
    const propLabel =
      proposals.find((p) => p.id === proposalId)?.namaProposal || 'proposal';
    setFeedback({
      type: 'success',
      message:
        config === null
          ? `Pengaturan BAST ${propLabel} dikembalikan ke template default.`
          : `Pengaturan info BAST khusus "${propLabel}" berhasil disimpan.`,
    });
  };

  const handleSaveUserAlias = (targetUserId: string, alias: string) => {
    if (!currentUser) return;
    const ownerId = currentUser.id;
    const trimmed = alias.trim();
    const targetUser = internalUsers.find((u) => u.id === targetUserId);
    const nextOwnerMap = { ...(userAliasesByOwner[ownerId] || {}) };
    if (trimmed) {
      nextOwnerMap[targetUserId] = trimmed;
    } else {
      delete nextOwnerMap[targetUserId];
    }
    const nextAll: Record<string, Record<string, string>> = {
      ...userAliasesByOwner,
      [ownerId]: nextOwnerMap,
    };
    setUserAliasesByOwner(nextAll);
    void saveAppStateSlice('masdeta_user_aliases_v1', nextAll);
    setFeedback({
      type: 'success',
      message: trimmed
        ? `Nama panggilan pribadi "${trimmed}" disimpan (khusus tampilan akun Anda).`
        : `Nama dikembalikan ke nama asli (${targetUser?.nama || 'Pengguna'}).`,
    });
  };

  const remapSubItemDeliveries = (
    prevDeliveries: KpmRecord['subItemDeliveries'],
    oldSubItems: string[],
    newSubItems: string[]
  ): KpmRecord['subItemDeliveries'] => {
    if (!prevDeliveries) return prevDeliveries;
    const next = { ...prevDeliveries };
    const oldKeys = oldSubItems.map((s) => normalizeSubItemKey(s));
    const newKeys = newSubItems.map((s) => normalizeSubItemKey(s));
    if (oldKeys.length === newKeys.length) {
      oldKeys.forEach((ok, idx) => {
        const nk = newKeys[idx];
        const state = prevDeliveries[ok] ?? prevDeliveries[oldSubItems[idx]];
        if (ok !== nk && state && !next[nk]) {
          next[nk] = state;
        }
      });
    }
    return next;
  };

  const handleSaveCatalogItem = (
    savedItem: ItemBantuan,
    orderIndex: number,
    originalCode?: string
  ) => {
    if (originalCode) {
      if (!requirePermission('update', 'mengubah master item')) return;
    } else {
      if (!requirePermission('add', 'menambah master item')) return;
    }
    const codeToRemove = originalCode || savedItem.code;
    const oldItem = items.find((i) => i.tahun === savedItem.tahun && i.code === codeToRemove);
    const remaining = items.filter(
      (i) => !(i.tahun === savedItem.tahun && i.code === codeToRemove)
    );
    const otherYears = remaining.filter((i) => i.tahun !== savedItem.tahun);
    const sameYear = remaining.filter((i) => i.tahun === savedItem.tahun);
    const clampedIndex = Math.max(0, Math.min(orderIndex, sameYear.length));
    const nextItems = [
      ...otherYears,
      ...sameYear.slice(0, clampedIndex),
      savedItem,
      ...sameYear.slice(clampedIndex),
    ];

    let nextRecords = records;
    if (originalCode) {
      const codeChanged = originalCode !== savedItem.code;
      const oldSubs = oldItem?.subItems ?? [];
      const mappedRecords = records.map((rec) => {
        if (rec.tahun !== savedItem.tahun || rec.item !== originalCode) return rec;
        return {
          ...rec,
          item: savedItem.code,
          subItemDeliveries: remapSubItemDeliveries(
            rec.subItemDeliveries,
            oldSubs,
            savedItem.subItems
          ),
        };
      });
      nextRecords = codeChanged
        ? recalculateProposalRegisterCodes(
            mappedRecords,
            proposals,
            nextItems,
            wilayahList,
            proposalSlotMapRef.current
          )
        : mappedRecords;
      setRecords(nextRecords);
    }

    const actEntry = createActivityHistoryEntry('item_saved', {
      proposalName: `${savedItem.code} — ${savedItem.name}`,
      detail: originalCode
        ? `Memperbarui master item "${savedItem.name}" (${savedItem.code}) dengan ${savedItem.subItems.length} sub-item.`
        : `Menambahkan master item baru "${savedItem.name}" (${savedItem.code}) dengan ${savedItem.subItems.length} sub-item.`,
      tahun: savedItem.tahun,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];

    const prevRecById = new Map(records.map((r) => [r.id, r]));
    const changedRecords = originalCode
      ? nextRecords.filter((r) => {
          const old = prevRecById.get(r.id);
          return (
            !old ||
            old.item !== r.item ||
            old.registerCode !== r.registerCode ||
            (r.tahun === savedItem.tahun && r.item === savedItem.code)
          );
        })
      : [];
    const codeChanged = Boolean(originalCode && originalCode !== savedItem.code);

    setItems(nextItems);
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertCatalogItemsInSupabase({
            itemsToSync: nextItems.filter((i) => i.tahun === savedItem.tahun),
            renamedFrom: codeChanged
              ? { tahun: savedItem.tahun, oldCode: originalCode! }
              : undefined,
            updatedRecords: changedRecords,
            proposals,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal menyimpan master item ke Supabase'
      );
    } else {
      void syncOperationalData(
        { items: nextItems, records: nextRecords, proposalHistory: nextHistory },
        originalCode ? 'update' : 'add'
      );
    }
  };

  const handleDeleteCatalogItem = (tahun: string, code: string) => {
    if (!requirePermission('delete', 'menghapus master item')) return;
    const removed = items.find((i) => i.tahun === tahun && i.code === code);
    const nextItems = items.filter((i) => !(i.tahun === tahun && i.code === code));
    const actEntry = createActivityHistoryEntry('item_deleted', {
      proposalName: removed ? `${removed.code} — ${removed.name}` : code,
      detail: `Menghapus master item "${removed?.name || code}" (${code}) tahun ${tahun}.`,
      tahun,
      action: 'removed',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setItems(nextItems);
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertCatalogItemsInSupabase({
            itemsToSync: nextItems.filter((i) => i.tahun === tahun),
            deletedItem: { tahun, code },
            proposals,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal menghapus master item dari Supabase'
      );
    } else {
      void syncOperationalData({ items: nextItems, proposalHistory: nextHistory }, 'delete');
    }
  };

  const handleMoveItemOrder = (tahun: string, code: string, direction: 'up' | 'down') => {
    if (!requirePermission('update', 'mengubah urutan item')) return;
    const yearIndices: number[] = [];
    items.forEach((item, idx) => {
      if (item.tahun === tahun) yearIndices.push(idx);
    });
    const pos = yearIndices.findIndex((idx) => items[idx].code === code);
    if (pos < 0) return;
    const targetPos = direction === 'up' ? pos - 1 : pos + 1;
    if (targetPos < 0 || targetPos >= yearIndices.length) return;
    const nextItems = [...items];
    const idxA = yearIndices[pos];
    const idxB = yearIndices[targetPos];
    [nextItems[idxA], nextItems[idxB]] = [nextItems[idxB], nextItems[idxA]];
    setItems(nextItems);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertCatalogItemsInSupabase({
            itemsToSync: nextItems.filter((i) => i.tahun === tahun),
            proposals,
            pengelolaList,
          }),
        'Gagal memperbarui urutan item di Supabase'
      );
    } else {
      void syncOperationalData({ items: nextItems }, 'update');
    }
  };

  const handleUpdateItemSubItems = (tahun: string, code: string, subItems: string[]) => {
    if (!requirePermission('update', 'mengubah sub-item bantuan')) return;
    const oldItem = items.find((i) => i.tahun === tahun && i.code === code);
    const nextItems = items.map((i) =>
      i.tahun === tahun && i.code === code ? { ...i, subItems } : i
    );
    const nextRecords = oldItem
      ? records.map((rec) =>
          rec.tahun === tahun && rec.item === code
            ? {
                ...rec,
                subItemDeliveries: remapSubItemDeliveries(
                  rec.subItemDeliveries,
                  oldItem.subItems,
                  subItems
                ),
              }
            : rec
        )
      : records;

    const actEntry = createActivityHistoryEntry('item_subitems', {
      proposalName: oldItem ? `${oldItem.code} — ${oldItem.name}` : code,
      detail: `Memperbarui daftar sub-item (${subItems.length} item) pada "${oldItem?.name || code}".`,
      tahun,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    const affectedSubRecords = oldItem
      ? nextRecords.filter((r) => r.tahun === tahun && r.item === code)
      : [];

    setItems(nextItems);
    if (oldItem) setRecords(nextRecords);
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertCatalogItemsInSupabase({
            itemsToSync: nextItems.filter((i) => i.tahun === tahun),
            updatedRecords: affectedSubRecords,
            proposals,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal memperbarui sub-item di Supabase'
      );
    } else {
      void syncOperationalData(
        { items: nextItems, records: nextRecords, proposalHistory: nextHistory },
        'update'
      );
    }
  };

  const handleCopyItemsFromYear = (fromYear: string, toYear: string) => {
    if (!requirePermission('add', 'menyalin item antar tahun')) return;
    const source = items.filter((i) => i.tahun === fromYear);
    const existingCodes = new Set(items.filter((i) => i.tahun === toYear).map((i) => i.code));
    const additions = source
      .filter((s) => !existingCodes.has(s.code))
      .map((s) => ({
        ...s,
        id: `${toYear}-${s.code}`,
        tahun: toYear,
        subItems: [...s.subItems],
      }));
    const nextItems = [...items, ...additions];
    const actEntry = createActivityHistoryEntry('item_copied', {
      proposalName: `Salin Katalog ${fromYear} → ${toYear}`,
      detail: `Menyalin ${additions.length} master item dari tahun ${fromYear} ke ${toYear}.`,
      tahun: toYear,
      action: 'entered',
    });
    const nextHistory = additions.length > 0 ? [actEntry, ...proposalHistory] : proposalHistory;
    setItems(nextItems);
    if (additions.length > 0) setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertCatalogItemsInSupabase({
            itemsToSync: nextItems.filter((i) => i.tahun === toYear),
            proposals,
            pengelolaList,
            historyEntries: additions.length > 0 ? [actEntry] : [],
          }),
        'Gagal menyalin katalog item ke Supabase'
      );
    } else {
      void syncOperationalData({ items: nextItems, proposalHistory: nextHistory }, 'add');
    }
  };

  const handleCreateProposal = (values: ProposalFormValues) => {
    if (!requirePermission('add', 'membuat proposal baru')) return;
    const now = new Date().toISOString();
    if (!values.tipe) return;

    const newProposal: ProposalRecord = {
      id: `prop-${Date.now()}`,
      tahun: values.tahun,
      tipe: values.tipe,
      kabKota: values.kabKota,
      kecamatan: values.kecamatan,
      kelurahan: values.kelurahan,
      jalan: values.jalan,
      namaProposal: values.namaProposal,
      jumlahKpm: values.jumlahKpm ?? 66,
      status: values.status,
      checklist: values.checklist,
      catatan: values.catatan,
      documents: values.documents,
      createdAt: now,
      updatedAt: now,
    };

    const nextProposals = [newProposal, ...proposals];
    const actEntry = createActivityHistoryEntry('proposal_created', {
      proposalName: newProposal.namaProposal,
      detail: `Membuat proposal "${newProposal.namaProposal}" (${newProposal.tipe}, ${newProposal.tahun}) · Target ${newProposal.jumlahKpm} KPM.`,
      tahun: newProposal.tahun,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];

    setProposals(nextProposals);
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertProposalsBatchInSupabase({
            proposals: [newProposal],
            historyEntries: [actEntry],
          }),
        'Gagal menyimpan proposal baru ke Supabase'
      );
    } else {
      void syncOperationalData({ proposals: nextProposals, proposalHistory: nextHistory }, 'add');
    }

    if (addProposalFromKpmForm && newProposal.status === 'unlocked') {
      setPendingSelectedProposal({
        namaProposal: newProposal.namaProposal,
        tahun: newProposal.tahun,
      });
    } else {
      setPendingSelectedProposal(null);
    }

    setSelectedYear(newProposal.tahun);
    navigateForwardScroll('smooth');
    if (addProposalFromKpmForm) {
      setAddProposalFromKpmForm(false);
      setSubView('kpm-form');
    } else {
      setSubView('none');
      setActiveTab(returnToTab === 'kpm' ? 'proposal' : returnToTab);
    }
    setFeedback({
      type: 'success',
      message:
        newProposal.status === 'locked'
          ? `Proposal "${newProposal.namaProposal}" (${newProposal.tahun}) disimpan dalam status Terkunci.`
          : `Proposal "${newProposal.namaProposal}" (${newProposal.tahun}) berhasil ditambahkan.`,
    });
  };

  const handleUpdateProposal = (proposalId: string, values: ProposalFormValues) => {
    if (!requirePermission('update', 'memperbarui proposal')) return;
    const existing = proposals.find((p) => p.id === proposalId);
    if (!existing || !values.tipe) return;

    if (existing.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${existing.namaProposal}" sedang Terkunci dan tidak dapat diubah.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const nextProposals = proposals.map((p) =>
      p.id === proposalId
        ? {
            ...p,
            tahun: values.tahun,
            tipe: values.tipe as ProposalRecord['tipe'],
            jumlahKpm: values.jumlahKpm ?? p.jumlahKpm ?? 66,
            status: values.status,
            checklist: values.checklist,
            catatan: values.catatan,
            documents: values.documents,
            updatedAt: now,
          }
        : p
    );

    let nextRecords = records;
    let nextProposalHistory = proposalHistory;
    let nextKpmAuditLogs = kpmAuditLogs;

    if (values.tahun !== existing.tahun) {
      const oldSlotKey = getProposalSlotKey(
        existing.id,
        existing.namaProposal,
        existing.tahun,
        proposals
      );
      const newSlotKey = getProposalSlotKey(
        existing.id,
        existing.namaProposal,
        values.tahun,
        nextProposals
      );
      let nextSlotMap = proposalSlotMapRef.current;
      if (oldSlotKey !== newSlotKey && nextSlotMap[oldSlotKey]) {
        const cloned = { ...nextSlotMap };
        cloned[newSlotKey] = cloned[oldSlotKey];
        delete cloned[oldSlotKey];
        nextSlotMap = cloned;
        persistProposalSlotMap(nextSlotMap);
      }

      const updatedRecords = records.map((rec) =>
        rec.proposal === existing.namaProposal && rec.tahun === existing.tahun
          ? { ...rec, tahun: values.tahun, updatedAt: now }
          : rec
      );
      nextRecords = recalculateProposalRegisterCodes(
        updatedRecords,
        nextProposals,
        items,
        wilayahList,
        nextSlotMap
      );
      nextProposalHistory = proposalHistory.map((h) =>
        h.proposalName === existing.namaProposal && h.tahun === existing.tahun
          ? { ...h, tahun: values.tahun }
          : h
      );
      nextKpmAuditLogs = kpmAuditLogs.map((l) =>
        l.proposal === existing.namaProposal && l.tahun === existing.tahun
          ? { ...l, tahun: values.tahun }
          : l
      );
      setRecords(nextRecords);
      setKpmAuditLogs(nextKpmAuditLogs);
    }

    const actEntry = createActivityHistoryEntry('proposal_updated', {
      proposalName: existing.namaProposal,
      detail: `Memperbarui detail/berkas proposal "${existing.namaProposal}" (${values.tipe}, ${values.tahun}).`,
      tahun: values.tahun,
      action: 'entered',
    });
    nextProposalHistory = [actEntry, ...nextProposalHistory];

    const updatedProposal = nextProposals.find((p) => p.id === proposalId);
    const prevPropRecById = new Map(records.map((r) => [r.id, r]));
    const changedPropRecords =
      values.tahun !== existing.tahun
        ? nextRecords.filter((r) => {
            const old = prevPropRecById.get(r.id);
            return !old || old.tahun !== r.tahun || old.registerCode !== r.registerCode;
          })
        : [];

    setProposalHistory(nextProposalHistory);
    setProposals(nextProposals);
    if (supabaseReadyRef.current && updatedProposal) {
      void runSupabaseMutation(
        () =>
          upsertProposalsBatchInSupabase({
            proposals: [updatedProposal],
            updatedRecords: changedPropRecords,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal memperbarui proposal di Supabase'
      );
    } else {
      void syncOperationalData(
        {
          proposals: nextProposals,
          records: nextRecords,
          proposalHistory: nextProposalHistory,
          kpmAuditLogs: nextKpmAuditLogs,
        },
        'update'
      );
    }

    navigateRestoreScroll();
    setSubView('proposal-detail');
    setFeedback({
      type: 'success',
      message: `Proposal "${existing.namaProposal}" (${values.tahun}) berhasil diperbarui.`,
    });
  };

  const handleToggleProposalLock = (proposalId: string) => {
    if (!requirePermission('update', 'mengunci/membuka proposal')) return;
    const currentProposals = proposalsRef.current;
    const target = currentProposals.find((p) => p.id === proposalId);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const nextStatus: ProposalLockStatus = target.status === 'locked' ? 'unlocked' : 'locked';
    const nextProposals: ProposalRecord[] = currentProposals.map((p) =>
      p.id === proposalId
        ? {
            ...p,
            status: nextStatus,
            updatedAt: nowIso,
          }
        : p
    );
    const actEntry = createActivityHistoryEntry(
      nextStatus === 'locked' ? 'proposal_locked' : 'proposal_unlocked',
      {
        proposalName: target.namaProposal,
        detail:
          nextStatus === 'locked'
            ? `Mengunci proposal "${target.namaProposal}" (${target.tahun}).`
            : `Membuka kunci proposal "${target.namaProposal}" (${target.tahun}).`,
        tahun: target.tahun,
        action: nextStatus === 'locked' ? 'removed' : 'entered',
      }
    );
    const nextHistory = [actEntry, ...proposalHistoryRef.current];

    proposalsRef.current = nextProposals;
    proposalHistoryRef.current = nextHistory;
    latestDataRef.current = {
      ...latestDataRef.current,
      proposals: nextProposals,
      proposalHistory: nextHistory,
    };

    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: nextStatus,
              updatedAt: nowIso,
            }
          : p
      )
    );
    setProposalHistory((prev) => [actEntry, ...prev]);

    if (supabaseReadyRef.current) {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
        setFeedback({
          type: 'error',
          message: 'Aksi ditolak: Aplikasi MASDETA wajib terhubung ke internet aktif.',
        });
        return;
      }
      void enqueueOperationalSync(async () => {
        try {
          await supabaseUpdateProposalLockStatus(
            [
              {
                id: target.id,
                tahun: target.tahun,
                namaProposal: target.namaProposal,
                status: nextStatus,
                updatedAt: nowIso,
              },
            ],
            [actEntry]
          );
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Gagal memperbarui status kunci proposal.';
          setFeedback({
            type: 'error',
            message: `Gagal menyimpan status kunci proposal ke Supabase: ${msg}`,
          });
          // Pulihkan snapshot dari database agar status di layar tetap jujur
          try {
            const snapshot = await fetchOperationalDataFromSupabase();
            applyRemoteOperationalState({
              proposals: snapshot.proposals,
              proposalHistory: snapshot.proposalHistory,
            });
          } catch {
            // Abaikan error pemulihan
          }
          return false;
        }
      });
    } else {
      void syncOperationalData(
        { proposals: nextProposals, proposalHistory: nextHistory },
        'update'
      );
    }

    setFeedback({
      type: 'success',
      message:
        nextStatus === 'locked'
          ? `Proposal "${target.namaProposal}" dikunci. Seluruh data proposal & KPM di dalamnya kini tidak dapat diedit.`
          : `Kunci proposal "${target.namaProposal}" dibuka. Data kembali dapat diedit.`,
    });
  };

  const handleBulkSetProposalLock = (proposalIds: string[], nextStatus: ProposalLockStatus) => {
    if (!requirePermission('update', 'mengunci/membuka semua proposal')) return;
    if (proposalIds.length === 0) return;

    const currentProposals = proposalsRef.current;
    const idSet = new Set(proposalIds);
    const affected = currentProposals.filter((p) => idSet.has(p.id) && p.status !== nextStatus);
    if (affected.length === 0) return;

    const nowIso = new Date().toISOString();
    const affectedIdSet = new Set(affected.map((p) => p.id));
    const nextProposals: ProposalRecord[] = currentProposals.map((p) =>
      affectedIdSet.has(p.id)
        ? {
            ...p,
            status: nextStatus,
            updatedAt: nowIso,
          }
        : p
    );

    const yearsInBatch = Array.from(new Set(affected.map((p) => p.tahun).filter(Boolean)));
    const scopeLabel =
      yearsInBatch.length === 1 ? `Tahun ${yearsInBatch[0]}` : 'Semua Tahun';
    const actEntry = createActivityHistoryEntry(
      nextStatus === 'locked' ? 'proposal_bulk_locked' : 'proposal_bulk_unlocked',
      {
        proposalName: affected.length === 1 ? affected[0].namaProposal : `Semua Proposal (${scopeLabel})`,
        detail:
          nextStatus === 'locked'
            ? `Mengunci sekaligus ${affected.length} proposal (${scopeLabel}).`
            : `Membuka kunci sekaligus ${affected.length} proposal (${scopeLabel}).`,
        tahun: yearsInBatch.length === 1 ? yearsInBatch[0] : selectedYear || '2026',
        action: nextStatus === 'locked' ? 'removed' : 'entered',
      }
    );
    const nextHistory = [actEntry, ...proposalHistoryRef.current];

    proposalsRef.current = nextProposals;
    proposalHistoryRef.current = nextHistory;
    latestDataRef.current = {
      ...latestDataRef.current,
      proposals: nextProposals,
      proposalHistory: nextHistory,
    };

    setProposals((prev) =>
      prev.map((p) =>
        affectedIdSet.has(p.id)
          ? {
              ...p,
              status: nextStatus,
              updatedAt: nowIso,
            }
          : p
      )
    );
    setProposalHistory((prev) => [actEntry, ...prev]);

    if (supabaseReadyRef.current) {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
        setFeedback({
          type: 'error',
          message: 'Aksi ditolak: Aplikasi MASDETA wajib terhubung ke internet aktif.',
        });
        return;
      }
      void enqueueOperationalSync(async () => {
        try {
          await supabaseUpdateProposalLockStatus(
            affected.map((p) => ({
              id: p.id,
              tahun: p.tahun,
              namaProposal: p.namaProposal,
              status: nextStatus,
              updatedAt: nowIso,
            })),
            [actEntry]
          );
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Gagal memperbarui status kunci massal.';
          setFeedback({
            type: 'error',
            message: `Gagal menyimpan status kunci massal ke Supabase: ${msg}`,
          });
          try {
            const snapshot = await fetchOperationalDataFromSupabase();
            applyRemoteOperationalState({
              proposals: snapshot.proposals,
              proposalHistory: snapshot.proposalHistory,
            });
          } catch {
            // Abaikan error pemulihan
          }
          return false;
        }
      });
    } else {
      void syncOperationalData(
        { proposals: nextProposals, proposalHistory: nextHistory },
        'update'
      );
    }

    setFeedback({
      type: 'success',
      message:
        nextStatus === 'locked'
          ? `${affected.length} proposal berhasil dikunci. Seluruh KPM di dalamnya ikut terkunci.`
          : `Kunci ${affected.length} proposal berhasil dibuka.`,
    });
  };

  const handleDeleteProposal = (proposalId: string) => {
    if (!requirePermission('delete', 'menghapus proposal')) return;
    const target = proposalsRef.current.find((p) => p.id === proposalId);
    if (!target) return;

    if (target.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${target.namaProposal}" sedang Terkunci. Buka kunci terlebih dahulu untuk menghapusnya.`,
      });
      return;
    }

    // Pindahkan proposal ke Tempat Sampah 30 hari (berkas Drive tetap aman hingga dihapus permanen/kedaluwarsa)
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const actorName = currentUser?.nama || 'Petugas Internal';
    const trashEntry: TrashRecordItem = {
      id: `trash-prop-${target.id}-${Date.now()}`,
      kind: 'proposal',
      title: target.namaProposal,
      subtitle: `${target.tipe} · ${target.tahun} · Target ${target.jumlahKpm} KPM`,
      tahun: target.tahun,
      deletedAt: nowIso,
      expiresAt,
      deletedBy: actorName,
      proposalRecord: target,
    };
    const nextTrash = [trashEntry, ...trashBin];
    setTrashBin(nextTrash);
    void saveAppStateSlice('masdeta_trash_bin_v1', nextTrash);

    const nextProposals = proposalsRef.current.filter((p) => p.id !== proposalId);
    const deletedNotif: AppNotificationItem = {
      id: `notif-prop-del-${proposalId}-${Date.now()}`,
      type: 'proposal_deleted',
      title: 'Proposal Dihapus',
      message: `Proposal "${target.namaProposal}" (${target.tahun}) dipindahkan ke Tempat Sampah oleh ${actorName}.`,
      actorName,
      createdAt: nowIso,
      read: true,
      targetAction: 'proposals',
    };

    const actEntry = createActivityHistoryEntry('proposal_deleted', {
      proposalName: target.namaProposal,
      detail: `Memindahkan proposal "${target.namaProposal}" (${target.tipe}, ${target.tahun}) ke Tempat Sampah.`,
      tahun: target.tahun,
      action: 'removed',
      actorName,
    });
    const nextHistory = [actEntry, ...proposalHistoryRef.current];

    notifiedDeletedProposalIdsRef.current.add(proposalId);
    seenNotificationIdsRef.current.add(deletedNotif.id);
    setAppNotifications((prev) => [deletedNotif, ...prev].slice(0, 25));

    proposalsRef.current = nextProposals;
    proposalHistoryRef.current = nextHistory;
    latestDataRef.current = {
      ...latestDataRef.current,
      proposals: nextProposals,
      proposalHistory: nextHistory,
    };

    setProposals((prev) => prev.filter((p) => p.id !== proposalId));
    const deletedSlotKey = getProposalSlotKey(target.id, target.namaProposal, target.tahun, proposals);
    if (proposalSlotMapRef.current[deletedSlotKey]) {
      const nextSlotMap = { ...proposalSlotMapRef.current };
      delete nextSlotMap[deletedSlotKey];
      persistProposalSlotMap(nextSlotMap);
    }
    setProposalHistory((prev) => [actEntry, ...prev]);
    if (activeProposalId === proposalId) {
      setActiveProposalId(null);
      setSubView('none');
      setActiveTab('proposal');
    }

    if (supabaseReadyRef.current) {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
        setFeedback({
          type: 'error',
          message: 'Aksi ditolak: Aplikasi MASDETA wajib terhubung ke internet aktif.',
        });
        return;
      }
      void enqueueOperationalSync(async () => {
        try {
          await supabaseDeleteProposalDirect(target, [actEntry]);
          if (realtimeChannelRef.current) {
            void realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'app:notification',
              payload: {
                ...deletedNotif,
                read: false,
                proposalId,
                actorId: currentUser?.id,
              },
            });
          }
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'Gagal menghapus proposal.';
          setFeedback({
            type: 'error',
            message: `Gagal menghapus proposal di Supabase: ${msg}`,
          });
          return false;
        }
      });
    } else {
      void syncOperationalData(
        { proposals: nextProposals, proposalHistory: nextHistory },
        'delete'
      );
    }

    setFeedback({
      type: 'success',
      message: `Proposal "${target.namaProposal}" (${target.tahun}) dipindahkan ke Tempat Sampah (tersimpan 30 hari).`,
    });
  };

  const handleLogin = async (
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
      return {
        ok: false,
        error: 'Koneksi internet aktif wajib tersedia untuk masuk ke MASDETA.',
      };
    }
    if (supabaseReadyRef.current) {
      try {
        const res = await supabaseLogin(identifier, password);
        if (!res.ok || !res.user) {
          return {
            ok: false,
            error: res.error || 'Username/email atau kata sandi tidak sesuai.',
          };
        }
        const [users, msgs] = await Promise.all([
          supabaseFetchInternalUsers(),
          supabaseFetchDirectMessages(),
        ]);
        const userMsgs = msgs.filter(
          (m) => m.senderId === res.user!.id || m.recipientId === res.user!.id
        );
        seedChatNotificationBaseline(res.user.id, userMsgs);
        if (users.length > 0) {
          const loggedInId = res.user.id;
          const nowIso = new Date().toISOString();
          if (!res.user.presenceManual) {
            desiredAutoPresenceRef.current = 'online';
          }
          setInternalUsers(
            users.map((u) =>
              u.id === loggedInId && !u.presenceManual
                ? { ...u, presenceStatus: 'online', lastActiveAt: nowIso }
                : u
            )
          );
        }
        setDirectMessages(userMsgs);

        const supaToken = `supabase-session-${res.user.id}`;
        setSessionToken(supaToken);
        setSessionUserId(res.user.id);
        try {
          localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, supaToken);
          localStorage.setItem(SESSION_STORAGE_KEY, res.user.id);
        } catch {
          // Ignore
        }
        await loadOrBootstrapOperationalData(supaToken, res.user, true);
        setSubView('none');
        setActiveTab('dashboard');
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal masuk ke Supabase.',
        };
      }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, identifier, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        token?: string;
        user?: InternalUser;
        users?: InternalUser[];
        messages?: DirectChatMessage[];
      };
      if (!res.ok || !data.user || !data.token) {
        return {
          ok: false,
          error: data.error || 'Username/email atau kata sandi tidak sesuai.',
        };
      }

      if (Array.isArray(data.users)) {
        setInternalUsers(data.users);
      }
      if (Array.isArray(data.messages)) {
        seedChatNotificationBaseline(data.user.id, data.messages);
        setDirectMessages(data.messages);
      } else {
        seedChatNotificationBaseline(data.user.id, []);
      }
      setSessionToken(data.token);
      setSessionUserId(data.user.id);
      try {
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, data.token);
        localStorage.setItem(SESSION_STORAGE_KEY, data.user.id);
      } catch {
        // Ignore
      }
      await loadOrBootstrapOperationalData(data.token, data.user, false);
      setSubView('none');
      setActiveTab('dashboard');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal terhubung ke server autentikasi.' };
    }
  };

  const handleRegister = async (payload: {
    nama: string;
    username: string;
    email: string;
    kontak: string;
    password: string;
    fotoDataUrl?: string;
    fotoThumbnailUrl?: string;
    fotoFileId?: string;
  }): Promise<{ ok: boolean; error?: string; message?: string }> => {
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
      return {
        ok: false,
        error: 'Koneksi internet aktif wajib tersedia untuk mendaftarkan akun.',
      };
    }
    if (supabaseReadyRef.current) {
      try {
        const res = await supabaseRegisterInternalUser({
          ...payload,
          jabatan: 'Menunggu Penetapan SuperAdmin',
        });
        if (!res.ok || !res.user) {
          return { ok: false, error: res.error || 'Gagal mendaftar.' };
        }
        setInternalUsers((prev) => [
          res.user as InternalUser,
          ...prev.filter((u) => u.id !== res.user?.id),
        ]);
        return {
          ok: true,
          message:
            'Pendaftaran berhasil dikirim ke Supabase. Menunggu persetujuan & penetapan jabatan oleh SuperAdmin.',
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal mendaftar.',
        };
      }
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        user?: InternalUser;
      };
      if (!res.ok || !data.user) {
        return { ok: false, error: data.error || 'Gagal mendaftar.' };
      }
      setInternalUsers((prev) => [
        data.user as InternalUser,
        ...prev.filter((u) => u.id !== data.user?.id),
      ]);
      return {
        ok: true,
        message:
          data.message ||
          'Pendaftaran berhasil dikirim. Menunggu persetujuan & penetapan jabatan oleh SuperAdmin.',
      };
    } catch {
      return { ok: false, error: 'Gagal terhubung ke server.' };
    }
  };

  const handleVerifySuperAdminPassword = async (
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (supabaseReadyRef.current && currentUser) {
      return supabaseVerifyUserPassword(currentUser.id, password);
    }

    try {
      const res = await authFetch(
        '/api/auth/verify-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        },
        undefined,
        true
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Kata sandi salah.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal terhubung ke server autentikasi.' };
    }
  };

  const handleLogout = async () => {
    if (supabaseReadyRef.current && currentUser && !currentUser.presenceManual) {
      await supabaseSetUserPresence(currentUser.id, 'offline', false).catch(() => {});
    }
    const token = sessionTokenRef.current;
    if (token && !supabaseReadyRef.current) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    wsRef.current?.close();
    wsRef.current = null;
    clearSessionState();
    scrollMemoryRef.current = {};
    pendingScrollModeRef.current = null;
    setRecapDrillTarget(null);
    setSelectedPengelolaDrill(null);
    setSelectedPekerjaanDrill(null);
    setSelectedDtsenDrill(null);
    setMenuSection('root');
    setSubView('none');
    setActiveTab('dashboard');
  };

  const handleUpdateProfile = async (patch: {
    nama: string;
    jabatan: string;
    kontak: string;
    fotoDataUrl?: string | null;
    fotoThumbnailUrl?: string | null;
    fotoFileId?: string | null;
    newPassword?: string;
    presenceManual: boolean;
    presenceStatus: UserPresenceStatus;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak ditemukan.' };

    if (supabaseReadyRef.current) {
      try {
        if (patch.newPassword?.trim()) {
          await supabaseAdminControlInternalUser(currentUser.id, {
            newPassword: patch.newPassword.trim(),
          });
        }
        const updated = await supabaseUpdateInternalUserProfile(currentUser.id, patch);
        desiredAutoPresenceRef.current = patch.presenceStatus;
        if (updated) {
          setInternalUsers((prev) =>
            prev.some((u) => u.id === updated.id)
              ? prev.map((u) => (u.id === updated.id ? updated : u))
              : [...prev, updated]
          );
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal memperbarui profil di Supabase.',
        };
      }
    }

    try {
      const res = await authFetch(`/api/users/${encodeURIComponent(currentUser.id)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string; user?: InternalUser };
      if (!res.ok || !data.user) {
        return { ok: false, error: data.error || 'Gagal memperbarui profil.' };
      }
      setInternalUsers((prev) =>
        prev.some((u) => u.id === data.user?.id)
          ? prev.map((u) => (u.id === data.user?.id ? (data.user as InternalUser) : u))
          : [...prev, data.user as InternalUser]
      );
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal terhubung ke server.' };
    }
  };

  const handleAdminControlUser = async (
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
  ) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang dapat mengatur status, peran, dan izin Admin.',
      });
      return;
    }

    if (supabaseReadyRef.current) {
      try {
        await supabaseAdminControlInternalUser(userId, patch);
        const freshUsers = await supabaseFetchInternalUsers();
        setInternalUsers(mergeFetchedInternalUsers(freshUsers));
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Gagal memperbarui akses user.',
        });
      }
      return;
    }

    try {
      const res = await authFetch(`/api/users/${encodeURIComponent(userId)}/admin-control`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string; users?: InternalUser[] };
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Gagal memperbarui akses user.' });
        return;
      }
      if (Array.isArray(data.users)) {
        setInternalUsers(mergeFetchedInternalUsers(data.users));
      }
    } catch {
      setFeedback({ type: 'error', message: 'Gagal terhubung ke server saat mengubah akses user.' });
    }
  };

  const handleDeleteInternalUser = async (userId: string) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang dapat menghapus akun pengguna.',
      });
      return;
    }

    if (supabaseReadyRef.current) {
      try {
        await supabaseDeleteInternalUser(userId);
        const freshUsers = await supabaseFetchInternalUsers();
        setInternalUsers(mergeFetchedInternalUsers(freshUsers));
        setFeedback({ type: 'success', message: 'Akun pengguna berhasil dihapus dari Supabase.' });
      } catch (err) {
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Gagal menghapus akun pengguna.',
        });
      }
      return;
    }

    try {
      const res = await authFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as { error?: string; users?: InternalUser[] };
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Gagal menghapus akun pengguna.' });
        return;
      }
      if (Array.isArray(data.users)) {
        setInternalUsers(mergeFetchedInternalUsers(data.users));
      }
      setFeedback({ type: 'success', message: 'Akun pengguna berhasil dihapus.' });
    } catch {
      setFeedback({ type: 'error', message: 'Gagal terhubung ke server saat menghapus akun.' });
    }
  };

  const handleAdminDataAction = async (action: AdminDataActionType) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang berhak menjalankan kontrol reset data.',
      });
      return;
    }

    if (supabaseReadyRef.current) {
      try {
        lastLocalSyncAtRef.current = Date.now();
        await runAdminDataActionInSupabase(action);
        const freshSnapshot = await fetchOperationalDataFromSupabase();
        try {
          localStorage.setItem('masdeta_csv_seed_ptk_kota_2026_v1', 'done');
        } catch {
          // Ignore storage write error
        }
        applyRemoteOperationalState(freshSnapshot);
        if (action === 'delete_all_kpm') {
          persistProposalSlotMap({});
          setActiveKpmId(null);
          setFeedback({
            type: 'success',
            message: 'Seluruh data calon KPM dan log audit KPM telah dihapus.',
          });
        } else if (action === 'delete_all_proposal') {
          persistProposalSlotMap({});
          setActiveProposalId(null);
          setActiveKpmId(null);
          setFeedback({
            type: 'success',
            message: 'Seluruh daftar proposal, KPM terkait, dan rekam jejak telah dihapus.',
          });
        } else if (action === 'delete_all_items') {
          setFeedback({
            type: 'success',
            message: 'Seluruh katalog item dan sub-item telah dikosongkan.',
          });
        } else if (action === 'delete_all_data') {
          persistProposalSlotMap({});
          setActiveKpmId(null);
          setActiveProposalId(null);
          setFeedback({
            type: 'success',
            message: 'Seluruh data KPM, proposal, item, wilayah, pengelola, dan riwayat telah dihapus.',
          });
        } else if (action === 'reset_total') {
          persistProposalSlotMap({});
          setDirectMessages([]);
          setActiveKpmId(null);
          setActiveProposalId(null);
          setFeedback({
            type: 'success',
            message:
              'Reset total selesai. Seluruh data proposal, KPM, item, pengelola, pekerjaan, dan riwayat chat telah dikosongkan.',
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Gagal menjalankan kontrol data Supabase.';
        setFeedback({
          type: 'error',
          message: msg,
        });
      }
      return;
    }

    try {
      const res = await authFetch('/api/admin/data-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        state?: OperationalDataPayload;
      };
      if (!res.ok || !data.state) {
        setFeedback({
          type: 'error',
          message: data.error || 'Gagal menjalankan kontrol data pada server.',
        });
        return;
      }

      try {
        localStorage.setItem('masdeta_csv_seed_ptk_kota_2026_v1', 'done');
      } catch {
        // Ignore storage write error
      }

      applyRemoteOperationalState(data.state);

      if (action === 'delete_all_kpm') {
        persistProposalSlotMap({});
        setActiveKpmId(null);
        setFeedback({
          type: 'success',
          message: 'Seluruh data calon KPM dan log audit KPM telah dihapus.',
        });
      } else if (action === 'delete_all_proposal') {
        persistProposalSlotMap({});
        setActiveProposalId(null);
        setActiveKpmId(null);
        setFeedback({
          type: 'success',
          message: 'Seluruh daftar proposal, KPM terkait, dan rekam jejak telah dihapus.',
        });
      } else if (action === 'delete_all_items') {
        setFeedback({
          type: 'success',
          message: 'Seluruh katalog item dan sub-item telah dikosongkan.',
        });
      } else if (action === 'delete_all_data') {
        persistProposalSlotMap({});
        setActiveKpmId(null);
        setActiveProposalId(null);
        setFeedback({
          type: 'success',
          message: 'Seluruh data KPM, proposal, item, wilayah, pengelola, dan riwayat telah dihapus.',
        });
      } else if (action === 'reset_total') {
        persistProposalSlotMap({});
        setDirectMessages([]);
        setActiveKpmId(null);
        setActiveProposalId(null);
        setFeedback({
          type: 'success',
          message: 'Reset total selesai. Seluruh data aplikasi dan riwayat chat telah dikosongkan.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal terhubung ke server saat menjalankan kontrol reset data.',
      });
    }
  };

  const handleRegisterInternalUser = async (user: {
    nama: string;
    username?: string;
    email: string;
    jabatan: string;
    kontak: string;
    role: InternalUserRole;
    password?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    const initialPassword = user.password?.trim() || 'masdeta123';

    if (supabaseReadyRef.current) {
      try {
        const res = await supabaseCreateInternalUserBySuperAdmin({
          ...user,
          password: initialPassword,
        });
        if (!res.ok || !res.user) {
          const errMsg = res.error || 'Gagal menambahkan user baru.';
          setFeedback({ type: 'error', message: errMsg });
          return { ok: false, error: errMsg };
        }
        const freshUsers = await supabaseFetchInternalUsers();
        setInternalUsers(
          freshUsers.length > 0
            ? mergeFetchedInternalUsers(freshUsers)
            : [res.user, ...internalUsers]
        );
        setFeedback({
          type: 'success',
          message: `Akun "${user.nama}" (${user.email}) aktif ditambahkan di Supabase dengan kata sandi awal: ${initialPassword}`,
        });
        return { ok: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Gagal terhubung ke Supabase.';
        setFeedback({ type: 'error', message: errMsg });
        return { ok: false, error: errMsg };
      }
    }

    try {
      const res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...user,
          password: initialPassword,
          permissions:
            user.role === 'SuperAdmin'
              ? { add: true, update: true, delete: true }
              : user.role === 'Viewer'
                ? { add: false, update: false, delete: false }
                : { add: true, update: true, delete: false },
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: InternalUser;
        users?: InternalUser[];
      };
      if (!res.ok || !data.user) {
        const errMsg = data.error || 'Gagal menambahkan user baru.';
        setFeedback({ type: 'error', message: errMsg });
        return { ok: false, error: errMsg };
      }

      if (Array.isArray(data.users)) {
        setInternalUsers(mergeFetchedInternalUsers(data.users));
      } else {
        setInternalUsers((prev) => [data.user as InternalUser, ...prev]);
      }

      setFeedback({
        type: 'success',
        message: `Akun "${user.nama}" (${user.email}) aktif ditambahkan dengan kata sandi awal: ${initialPassword}`,
      });
      return { ok: true };
    } catch {
      const errMsg = 'Gagal terhubung ke server.';
      setFeedback({ type: 'error', message: errMsg });
      return { ok: false, error: errMsg };
    }
  };

  const handleSendChatMessage = async (
    recipientId: string,
    text: string,
    sharedKpm?: SharedKpmCard
  ) => {
    if (!currentUser) return;
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnlineRef.current) {
      setFeedback({
        type: 'error',
        message: 'Koneksi internet aktif diperlukan untuk mengirim pesan.',
      });
      throw new Error('Offline');
    }

    if (supabaseReadyRef.current) {
      const savedMsg = await supabaseSendDirectMessage({
        senderId: currentUser.id,
        recipientId,
        text,
        sharedKpm,
      });
      prevMessageIdsRef.current.add(savedMsg.id);
      setDirectMessages((prev) =>
        prev.some((m) => m.id === savedMsg.id) ? prev : [...prev, savedMsg]
      );
      return;
    }

    const clientMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const res = await authFetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: clientMsgId,
        recipientId,
        text,
        sharedKpm,
      }),
    });
    const data = (await res.json()) as { message?: DirectChatMessage };
    if (res.ok && data.message) {
      const savedMsg = data.message;
      setDirectMessages((prev) =>
        prev.some((m) => m.id === savedMsg.id) ? prev : [...prev, savedMsg]
      );
    }
  };

  const handleShareKpmToChat = async (
    recipientId: string,
    card: SharedKpmCard,
    messageText: string
  ) => {
    await handleSendChatMessage(recipientId, messageText, card);
    openChatView(recipientId);
    setFeedback({
      type: 'success',
      message: `Kartu KPM "${card.nama}" berhasil dikirim ke chat.`,
    });
  };

  const handleRequestPushPermission = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await LocalNotifications.requestPermissions();
        const mapped: NotificationPermission =
          res.display === 'granted'
            ? 'granted'
            : res.display === 'denied'
              ? 'denied'
              : 'default';
        setPushPermission(mapped);
        if (mapped === 'granted') {
          await ensureAndroidNotificationChannel();
          setPushEnabled(true);
          try {
            localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, 'true');
          } catch {
            // Ignore
          }
          void triggerPushNotification(
            'Notifikasi MASDETA Aktif',
            'Pesan masuk dan pemberitahuan penting akan muncul di notifikasi Android Anda.'
          );
        }
      } catch {
        // Ignore
      }
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPushPermission(result);
      if (result === 'granted') {
        setPushEnabled(true);
        try {
          localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, 'true');
        } catch {
          // Ignore
        }
        void triggerPushNotification(
          'Notifikasi MASDETA Aktif',
          'Pesan langsung antar Admin & SuperAdmin akan muncul sebagai notifikasi push.'
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleTogglePushEnabled = (enabled: boolean) => {
    setPushEnabled(enabled);
    void setNativeNotifierEnabled(enabled);
    try {
      localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore
    }
  };

  const openChatView = (peerId?: string) => {
    navigateForwardScroll();
    setFeedback(null);
    setIncomingToast(null);
    setReturnToTab(activeTab);
    setActiveChatPeerId(peerId ?? null);
    setSubView('chat');
    if (peerId) {
      void handleMarkChatRead(peerId);
    }
  };
  openChatViewRef.current = openChatView;

  const openProfileView = () => {
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(activeTab);
    setSubView('profile');
  };

  const openNotificationsView = () => {
    navigateForwardScroll();
    setFeedback(null);
    setReturnToTab(activeTab);
    setBellAckChatCount(unreadChatCount);
    setAppNotifications((prev) =>
      prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev
    );
    setSubView('notifications');
  };

  const handleTransferProposalKpms = async (
    kpmIds: string[],
    targetProposalId: string
  ): Promise<boolean> => {
    if (!requirePermission('update', 'memindahkan KPM antar proposal')) return false;

    const targetProposal = proposals.find((p) => p.id === targetProposalId);
    if (!targetProposal) {
      setFeedback({
        type: 'error',
        message: 'Proposal tujuan transfer tidak ditemukan.',
      });
      return false;
    }

    if (targetProposal.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal tujuan "${targetProposal.namaProposal}" sedang Terkunci.`,
      });
      return false;
    }

    const selectedIdSet = new Set(kpmIds);
    const eligibleTargets = records.filter((rec) => {
      if (!selectedIdSet.has(rec.id)) return false;
      if (
        rec.proposal === targetProposal.namaProposal &&
        rec.tahun === targetProposal.tahun
      ) {
        return false;
      }
      const sourceProposal =
        proposals.find(
          (p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun
        ) ?? proposals.find((p) => p.namaProposal === rec.proposal);
      if (sourceProposal?.status === 'locked') {
        return false;
      }
      return true;
    });

    if (eligibleTargets.length === 0) {
      setFeedback({
        type: 'error',
        message:
          'Tidak ada calon KPM yang dapat ditransfer (pastikan proposal asal dan tujuan berstatus Terbuka).',
      });
      return false;
    }

    const now = new Date().toISOString();
    const eligibleIdSet = new Set(eligibleTargets.map((t) => t.id));
    const targetDomicile = resolveProposalDomicile(
      targetProposal.namaProposal,
      proposals,
      targetProposal.tahun,
      wilayahList
    );

    const addedAuditLogs: KpmAuditLogEntry[] = [];
    const addedHistoryEntries: ProposalKpmHistoryEntry[] = [];

    eligibleTargets.forEach((prev, idx) => {
      const changes: KpmAuditLogEntry['changes'] = [
        {
          field: 'Proposal',
          before: prev.proposal,
          after: targetProposal.namaProposal,
        },
      ];
      if (prev.tahun !== targetProposal.tahun) {
        changes.push({
          field: 'Tahun',
          before: prev.tahun,
          after: targetProposal.tahun,
        });
      }

      addedAuditLogs.push({
        id: `audit-transfer-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        kpmId: prev.id,
        action: 'updated',
        actorName: currentActor.nama,
        actorEmail: currentActor.email,
        timestamp: now,
        proposal: targetProposal.namaProposal,
        tahun: targetProposal.tahun,
        changes,
      });

      addedHistoryEntries.push(
        {
          id: `hist-in-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          tahun: targetProposal.tahun,
          proposalName: targetProposal.namaProposal,
          kpmId: prev.id,
          kpmName: prev.nama,
          registerCode: prev.registerCode,
          action: 'moved_in',
          fromProposal: prev.proposal,
          toProposal: targetProposal.namaProposal,
          actorName: currentActor.nama,
          timestamp: now,
        },
        {
          id: `hist-out-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          tahun: prev.tahun,
          proposalName: prev.proposal,
          kpmId: prev.id,
          kpmName: prev.nama,
          registerCode: prev.registerCode,
          action: 'moved_out',
          fromProposal: prev.proposal,
          toProposal: targetProposal.namaProposal,
          actorName: currentActor.nama,
          timestamp: now,
        }
      );
    });

    const mapped = records.map((rec) =>
      eligibleIdSet.has(rec.id)
        ? {
            ...rec,
            proposalId: targetProposal.id,
            proposal: targetProposal.namaProposal,
            tahun: targetProposal.tahun,
            kabKota: targetDomicile.kabKota || rec.kabKota,
            kecamatan: targetDomicile.kecamatan || rec.kecamatan,
            kelurahan: targetDomicile.kelurahan || rec.kelurahan,
            updatedAt: now,
          }
        : rec
    );

    let nextSlotMap = vacateKpmSlotsInMap(
      proposalSlotMapRef.current,
      eligibleTargets,
      records,
      proposals,
      items,
      wilayahList
    );
    for (const transferred of eligibleTargets) {
      nextSlotMap = assignKpmToProposalSlot(
        nextSlotMap,
        targetProposal.id,
        targetProposal.namaProposal,
        targetProposal.tahun,
        transferred.id,
        null,
        mapped,
        proposals,
        items,
        wilayahList
      );
    }

    const nextRecords = recalculateProposalRegisterCodes(
      mapped,
      proposals,
      items,
      wilayahList,
      nextSlotMap
    );
    const nextAuditLogs = [...addedAuditLogs, ...kpmAuditLogs];
    const nextProposalHistory = [...addedHistoryEntries, ...proposalHistory];

    const prevTransferById = new Map(records.map((r) => [r.id, r]));
    const changedTransferRecords = nextRecords.filter(
      (r) => eligibleIdSet.has(r.id) || prevTransferById.get(r.id)?.registerCode !== r.registerCode
    );
    const ok = supabaseReadyRef.current
      ? await runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: changedTransferRecords,
              proposals,
              pengelolaList,
              auditLogs: addedAuditLogs,
              historyEntries: addedHistoryEntries,
              includeDeliveries: false,
            }),
          'Gagal mentransfer KPM ke Supabase'
        )
      : await syncOperationalData(
          {
            records: nextRecords,
            kpmAuditLogs: nextAuditLogs,
            proposalHistory: nextProposalHistory,
          },
          'update'
        );
    if (!ok) return false;

    if (nextSlotMap !== proposalSlotMapRef.current) {
      persistProposalSlotMap(nextSlotMap);
    }
    setKpmAuditLogs(nextAuditLogs);
    setProposalHistory(nextProposalHistory);
    setRecords(nextRecords);
    setFeedback({
      type: 'success',
      message: `${eligibleTargets.length} calon KPM berhasil ditransfer ke "${targetProposal.namaProposal}" (${targetProposal.tahun}).`,
    });
    return true;
  };

  const handleMoveKpmSlot = async (
    proposalName: string,
    tahun: string,
    target: { kind: 'kpm'; kpmId: string } | { kind: 'empty'; slotNumber: number },
    direction: 'up' | 'down'
  ) => {
    if (!requirePermission('update', 'mengubah urutan nomor slot KPM')) return;
    const prop =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" berstatus Terkunci.`,
      });
      return;
    }

    const nextSlotMap = moveProposalSlotDirection(
      proposalSlotMapRef.current,
      prop?.id,
      proposalName,
      tahun,
      target,
      direction,
      records,
      proposals,
      items,
      wilayahList
    );
    if (!nextSlotMap) return;

    const nextRecords = mergeBastIntoRecords(
      recalculateProposalRegisterCodes(records, proposals, items, wilayahList, nextSlotMap),
      kpmBastMapRef.current
    );
    const prevById = new Map(records.map((r) => [r.id, r]));
    const changedRecords = nextRecords.filter(
      (r) => prevById.get(r.id)?.registerCode !== r.registerCode
    );

    persistProposalSlotMap(nextSlotMap);
    setRecords(nextRecords);

    if (changedRecords.length > 0) {
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: changedRecords,
              proposals,
              pengelolaList,
              includeDeliveries: false,
            }),
          'Gagal menyinkronkan urutan nomor KPM ke Supabase'
        );
      } else {
        void syncOperationalData({ records: nextRecords }, 'update');
      }
    }
  };

  const handleRemoveEmptySlot = async (
    proposalName: string,
    tahun: string,
    slotNumber: number
  ) => {
    if (!requirePermission('update', 'menghapus baris kosong slot KPM')) return;
    const prop =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" berstatus Terkunci.`,
      });
      return;
    }

    const nextSlotMap = removeEmptySlotFromMap(
      proposalSlotMapRef.current,
      prop?.id,
      proposalName,
      tahun,
      slotNumber,
      records,
      proposals,
      items,
      wilayahList
    );
    const nextRecords = mergeBastIntoRecords(
      recalculateProposalRegisterCodes(records, proposals, items, wilayahList, nextSlotMap),
      kpmBastMapRef.current
    );
    const prevById = new Map(records.map((r) => [r.id, r]));
    const changedRecords = nextRecords.filter(
      (r) => prevById.get(r.id)?.registerCode !== r.registerCode
    );

    persistProposalSlotMap(nextSlotMap);
    setRecords(nextRecords);

    if (changedRecords.length > 0) {
      if (supabaseReadyRef.current) {
        void runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: changedRecords,
              proposals,
              pengelolaList,
              includeDeliveries: false,
            }),
          'Gagal menyinkronkan nomor urut setelah menghapus baris kosong'
        );
      } else {
        void syncOperationalData({ records: nextRecords }, 'update');
      }
    }

    setFeedback({
      type: 'success',
      message: `Baris kosong #${String(slotNumber).padStart(2, '0')} dihapus dan urutan KPM berikutnya dirapatkan.`,
    });
  };

  const handleFillEmptySlotFromDatabase = async (
    kpmId: string,
    proposalName: string,
    tahun: string,
    slotNumber: number
  ) => {
    if (!requirePermission('update', 'mengisi baris kosong dari Database KPM')) return;
    const prop =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);
    if (!prop) {
      setFeedback({ type: 'error', message: 'Proposal tujuan tidak ditemukan.' });
      return;
    }
    if (prop.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" berstatus Terkunci.`,
      });
      return;
    }

    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const now = new Date().toISOString();
    const dom = resolveKpmDomicile(
      { ...target, proposalId: prop.id, proposal: prop.namaProposal },
      proposals,
      wilayahList
    );
    const nextTahun = target.tahun?.trim() || prop.tahun;

    const mapped = records.map((r) =>
      r.id === kpmId
        ? {
            ...r,
            validasi: 'accepted' as ValidationStatus,
            proposalId: prop.id,
            proposal: prop.namaProposal,
            tahun: nextTahun,
            kabKota: dom.kabKota,
            kecamatan: dom.kecamatan,
            kelurahan: dom.kelurahan,
            updatedAt: now,
          }
        : r
    );

    const nextSlotMap = assignKpmToProposalSlot(
      proposalSlotMapRef.current,
      prop.id,
      prop.namaProposal,
      prop.tahun,
      kpmId,
      slotNumber,
      mapped,
      proposals,
      items,
      wilayahList
    );

    const nextRecords = mergeBastIntoRecords(
      recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList, nextSlotMap),
      kpmBastMapRef.current
    );

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-slot-${Date.now()}`,
      kpmId: target.id,
      action: 'status_changed',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: prop.namaProposal,
      tahun: nextTahun || 'Tanpa Tahun',
      changes: [
        {
          field: 'Pengisian Slot Tetap',
          before: target.proposal || 'Database KPM',
          after: `${prop.namaProposal} · Nomor #${String(slotNumber).padStart(2, '0')}`,
        },
        {
          field: 'Status Validasi',
          before: formatValidationLabel(target.validasi),
          after: 'Diterima',
        },
      ],
    };

    const histEntry: ProposalKpmHistoryEntry = {
      id: `hist-slot-${Date.now()}`,
      tahun: prop.tahun,
      proposalName: prop.namaProposal,
      kpmId: target.id,
      kpmName: target.nama,
      registerCode:
        nextRecords.find((r) => r.id === kpmId)?.registerCode || target.registerCode,
      action: 'moved_in',
      fromProposal: target.proposal || 'Database KPM',
      toProposal: prop.namaProposal,
      actorName: currentActor.nama,
      timestamp: now,
    };

    const prevById = new Map(records.map((r) => [r.id, r]));
    const changedRecords = nextRecords.filter(
      (r) => r.id === kpmId || prevById.get(r.id)?.registerCode !== r.registerCode
    );

    const ok = supabaseReadyRef.current
      ? await runSupabaseMutation(
          () =>
            upsertKpmRecordsBatchInSupabase({
              records: changedRecords,
              proposals,
              pengelolaList,
              auditLogs: [auditEntry],
              historyEntries: [histEntry],
              includeDeliveries: false,
            }),
          'Gagal mengisi baris kosong dari Database KPM ke Supabase'
        )
      : await syncOperationalData(
          {
            records: nextRecords,
            kpmAuditLogs: [auditEntry, ...kpmAuditLogs],
            proposalHistory: [histEntry, ...proposalHistory],
          },
          'update'
        );
    if (!ok) return;

    persistProposalSlotMap(nextSlotMap);
    setKpmAuditLogs([auditEntry, ...kpmAuditLogs]);
    setProposalHistory([histEntry, ...proposalHistory]);
    setRecords(nextRecords);
    setFeedback({
      type: 'success',
      message: `"${target.nama}" ditempatkan ke nomor urut #${String(slotNumber).padStart(2, '0')} di ${prop.namaProposal}.`,
    });
  };

  const handleToggleBerkasDikembalikan = (kpmId: string, nextValue: boolean) => {
    if (!requirePermission('update', 'mengubah status pengembalian berkas')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;
    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" sedang Terkunci. Status berkas KPM tidak dapat diubah.`,
      });
      return;
    }
    const now = new Date().toISOString();

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-berkas-${Date.now()}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: 'Pengembalian Berkas Fisik',
          before: target.berkasDikembalikan ? 'Sudah Dikembalikan' : 'Belum Dikembalikan',
          after: nextValue ? 'Sudah Dikembalikan' : 'Belum Dikembalikan',
        },
      ],
    };

    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === kpmId
        ? {
            ...r,
            berkasDikembalikan: nextValue,
            berkasDikembalikanAt: nextValue ? now : undefined,
            berkasDikembalikanBy: nextValue ? currentActor.nama : undefined,
            updatedAt: now,
          }
        : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          updateKpmBerkasDikembalikanInSupabase({
            kpmId,
            berkasDikembalikan: nextValue,
            berkasDikembalikanAt: nextValue ? now : null,
            berkasDikembalikanBy: nextValue ? currentActor.nama : null,
            updatedAt: now,
            auditLogs: [auditEntry],
          }),
        'Gagal memperbarui status pengembalian berkas ke Supabase'
      );
    } else {
      void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    }
  };

  const handleUpdatePekerjaan = (oldName: string, newName: string) => {
    if (!requirePermission('update', 'mengubah daftar pekerjaan')) return;
    const duplicate = pekerjaanList.some(
      (j) => j !== oldName && j.trim().toLowerCase() === newName.trim().toLowerCase()
    );
    if (duplicate) {
      setFeedback({
        type: 'error',
        message: `Pekerjaan "${newName}" sudah terdaftar.`,
      });
      return;
    }

    const nextPekerjaan = pekerjaanList.map((j) => (j === oldName ? newName : j));
    setPekerjaanList(nextPekerjaan);

    const oldKey = oldName.trim().toLowerCase();
    const now = new Date().toISOString();
    let anyRecordChanged = false;
    const nextRecords = records.map((rec) => {
      if ((rec.pekerjaan || '').trim().toLowerCase() !== oldKey) return rec;
      const prop =
        proposals.find((p) => p.namaProposal === rec.proposal && p.tahun === rec.tahun) ??
        proposals.find((p) => p.namaProposal === rec.proposal);
      if (prop?.status === 'locked') return rec;
      anyRecordChanged = true;
      return { ...rec, pekerjaan: newName, updatedAt: now };
    });
    if (anyRecordChanged) {
      setRecords(nextRecords);
    }
    if (selectedPekerjaanDrill?.trim().toLowerCase() === oldKey) {
      setSelectedPekerjaanDrill(newName);
    }

    const actEntry = createActivityHistoryEntry('pekerjaan_updated', {
      proposalName: newName,
      detail: `Mengubah nama pekerjaan "${oldName}" menjadi "${newName}".`,
      action: 'entered',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setProposalHistory(nextHistory);

    const changedJobRecords = anyRecordChanged
      ? nextRecords.filter((rec, idx) => rec !== records[idx])
      : [];
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertPekerjaanListInSupabase({
            pekerjaanList: nextPekerjaan,
            deletedName: oldName,
            updatedRecords: changedJobRecords,
            proposals,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal memperbarui master pekerjaan di Supabase'
      );
    } else {
      void syncOperationalData(
        anyRecordChanged
          ? { pekerjaanList: nextPekerjaan, records: nextRecords, proposalHistory: nextHistory }
          : { pekerjaanList: nextPekerjaan, proposalHistory: nextHistory },
        'update'
      );
    }
    setFeedback({
      type: 'success',
      message: `Pekerjaan "${oldName}" berhasil diperbarui menjadi "${newName}".`,
    });
  };

  const handleDeletePekerjaan = (name: string) => {
    if (!requirePermission('delete', 'menghapus daftar pekerjaan')) return;
    const nextPekerjaan = pekerjaanList.filter((j) => j !== name);
    setPekerjaanList(nextPekerjaan);
    if (
      selectedPekerjaanDrill &&
      selectedPekerjaanDrill.trim().toLowerCase() === name.trim().toLowerCase()
    ) {
      setSelectedPekerjaanDrill(null);
    }
    const actEntry = createActivityHistoryEntry('pekerjaan_deleted', {
      proposalName: name,
      detail: `Menghapus master pekerjaan "${name}".`,
      action: 'removed',
    });
    const nextHistory = [actEntry, ...proposalHistory];
    setProposalHistory(nextHistory);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertPekerjaanListInSupabase({
            pekerjaanList: nextPekerjaan,
            deletedName: name,
            proposals,
            pengelolaList,
            historyEntries: [actEntry],
          }),
        'Gagal menghapus master pekerjaan di Supabase'
      );
    } else {
      void syncOperationalData({ pekerjaanList: nextPekerjaan, proposalHistory: nextHistory }, 'delete');
    }
    setFeedback({
      type: 'success',
      message: `Pekerjaan "${name}" berhasil dihapus.`,
    });
  };

  const handleAddPekerjaanFromForm = (job: string) => {
    if (!hasPermission('add') && !hasPermission('update')) {
      requirePermission('add', 'menambah daftar pekerjaan');
      return;
    }
    const clean = job.trim();
    if (!clean) return;
    if (pekerjaanList.some((p) => p.trim().toLowerCase() === clean.toLowerCase())) return;
    const nextPekerjaan = [...pekerjaanList, clean];
    setPekerjaanList(nextPekerjaan);
    if (supabaseReadyRef.current) {
      void runSupabaseMutation(
        () =>
          upsertPekerjaanListInSupabase({
            pekerjaanList: nextPekerjaan,
            proposals,
            pengelolaList,
          }),
        'Gagal menambahkan pekerjaan ke Supabase'
      );
    } else {
      void syncOperationalData({ pekerjaanList: nextPekerjaan }, hasPermission('add') ? 'add' : 'update');
    }
  };

  const handleAddCustomYear = (year: string) => {
    const clean = year.trim();
    if (!/^\d{4}$/.test(clean)) return;
    setCustomYears((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
  };

  const allKnownYears = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    customYears.forEach((y) => {
      if (y) set.add(y);
    });
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    items.forEach((i) => {
      if (i.tahun) set.add(i.tahun);
    });
    records.forEach((r) => {
      if (r.tahun) set.add(r.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [customYears, proposals, items, records]);

  const databaseKpmCount = useMemo(
    () => records.filter((r) => r.validasi === 'pending' && !(r.proposal || '').trim()).length,
    [records]
  );

  const archivedKpmCount = useMemo(
    () => records.filter((r) => r.validasi === 'rejected' && !(r.proposal || '').trim()).length,
    [records]
  );

  const handleDismissUpdateLater = () => {
    if (appUpdateInfo && !appUpdateInfo.isMandatory) {
      setDismissedUpdateVersion(appUpdateInfo.latestVersion);
      dismissedUpdateVersionRef.current = appUpdateInfo.latestVersion;
      setIsUpdateModalOpen(false);
    }
  };

  const showBottomNav = subView === 'none' && !(activeTab === 'menu' && menuSection !== 'root');

  if (!onlineVerified || (!currentUser && !isOnline)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-xs">
          <MasdetaLogo />
          <p className="text-xs font-semibold text-slate-600">
            Memeriksa koneksi &amp; sesi MASDETA...
          </p>
        </div>
        <OfflineIndicator
          isOnline={isOnline}
          isChecking={checkingInternet}
          onRetry={checkConnection}
        />
        <AppUpdateModal
          updateInfo={appUpdateInfo}
          open={isNativeApp && isUpdateModalOpen}
          onDismissLater={
            appUpdateInfo && !appUpdateInfo.isMandatory ? handleDismissUpdateLater : undefined
          }
        />
      </div>
    );
  }

  if ((sessionToken || supabaseReady) && !authReady && !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-xs">
          <MasdetaLogo />
          <p className="text-xs font-semibold text-slate-600">Memuat sesi MASDETA...</p>
        </div>
        <OfflineIndicator
          isOnline={isOnline}
          isChecking={checkingInternet}
          onRetry={checkConnection}
        />
        <AppUpdateModal
          updateInfo={appUpdateInfo}
          open={isNativeApp && isUpdateModalOpen}
          onDismissLater={
            appUpdateInfo && !appUpdateInfo.isMandatory ? handleDismissUpdateLater : undefined
          }
        />
      </div>
    );
  }

  if (publicKpmToken) {
    return (
      <PublicKpmProfileView
        kpmToken={publicKpmToken}
        inMemoryRecords={records}
        inMemoryProposals={proposals}
        inMemoryItems={items}
        inMemoryWilayah={wilayahList}
        onOpenMainApp={() => {
          setPublicKpmToken(null);
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('kpm');
            url.searchParams.delete('kpmQr');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          }
        }}
      />
    );
  }

  if (!currentUser) {
    return (
      <div className={isNativeApp ? 'min-h-screen bg-slate-200/70 sm:py-3' : 'min-h-screen bg-slate-100'}>
        <OfflineIndicator
          isOnline={isOnline}
          isChecking={checkingInternet}
          onRetry={checkConnection}
        />
        <div
          className={
            isNativeApp
              ? 'mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm'
              : 'min-h-screen w-full bg-slate-100'
          }
        >
          {supabaseSchemaMissing && !dismissedSchemaNotice && (
            <div className={`mx-4 mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 ${!isNativeApp ? 'md:mx-auto md:max-w-5xl' : ''}`}>
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Tabel Supabase belum dibuat</p>
                <p className="mt-0.5 leading-snug text-amber-800">
                  Jalankan skrip <span className="font-mono font-semibold">supabase/schema.sql</span> pada Supabase SQL Editor agar seluruh data multi-admin tersimpan di PostgreSQL. Mode lokal sementara aktif.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDismissedSchemaNotice(true)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100"
                aria-label="Tutup pemberitahuan"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <AuthView
            logo={<MasdetaLogo />}
            onLogin={handleLogin}
            onRegister={handleRegister}
          />
          <AppUpdateModal
            updateInfo={appUpdateInfo}
            open={isNativeApp && isUpdateModalOpen}
            onDismissLater={
              appUpdateInfo && !appUpdateInfo.isMandatory ? handleDismissUpdateLater : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={isNativeApp ? 'min-h-screen bg-slate-200/70 sm:py-3' : 'min-h-screen bg-slate-100'}>
      <OfflineIndicator
        isOnline={isOnline}
        isChecking={checkingInternet}
        onRetry={checkConnection}
      />

      {isDesktopWeb && (
        <DesktopSidebar
          logo={<MasdetaLogo />}
          appVersion={effectiveAppVersion}
          currentUser={currentUser}
          activeTab={activeTab}
          activeSubView={subView}
          activeMenuSection={menuSection}
          kpmCount={records.length}
          proposalCount={proposals.length}
          databaseKpmCount={databaseKpmCount}
          archivedKpmCount={archivedKpmCount}
          unreadChatCount={unreadChatCount}
          pendingUsersCount={currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0}
          urgentSchedulesCount={urgentSchedulesCount}
          duplicateNikCount={duplicateNikCount}
          hasAppUpdate={isNativeApp && Boolean(appUpdateInfo?.hasUpdate)}
          canAdd={hasPermission('add')}
          appNotifications={appNotifications}
          bellHasUnread={bellHasUnread}
          onOpenNotifications={openNotificationsView}
          onSelectTab={(tab) => {
            setFeedback(null);
            setMenuOpenedFromDashboard(false);
            const isSameActiveRootTab =
              subView === 'none' &&
              activeTab === tab &&
              !(tab === 'menu' && menuSection !== 'root');
            if (isSameActiveRootTab) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            navigateForwardScroll();
            setSubView('none');
            if (tab === 'menu') {
              setMenuSection('root');
              setUsersOpenedFromSuperAdmin(false);
              setSelectedPengelolaDrill(null);
              setSelectedPekerjaanDrill(null);
              setSelectedDtsenDrill(null);
            }
            setActiveTab(tab);
          }}
          onOpenSubItemRecap={() => openSubItemRecap(activeTab)}
          onOpenChat={() => openChatView()}
          onOpenMenuSection={(section) => {
            navigateForwardScroll();
            setSubView('none');
            setMenuOpenedFromDashboard(false);
            setUsersOpenedFromSuperAdmin(false);
            setSelectedPengelolaDrill(null);
            setSelectedPekerjaanDrill(null);
            setSelectedDtsenDrill(null);
            setMenuSection(section);
            setActiveTab('menu');
          }}
          onOpenQuickAdd={() => {
            if (!requirePermission('add', 'menambah data KPM atau proposal baru')) return;
            setIsQuickAddOpen(true);
          }}
          onOpenProfile={openProfileView}
          onLogout={handleLogout}
        />
      )}

      {supabaseSchemaMissing && !dismissedSchemaNotice && (
        <div className={isNativeApp ? 'mx-auto mb-2 w-full max-w-md px-3 sm:px-0' : 'mx-auto mb-2 w-full px-4 pt-3 md:pl-64 md:pr-6'}>
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-xs">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Skema SQL Supabase belum dijalankan</p>
              <p className="mt-0.5 leading-snug text-amber-800">
                Tempel &amp; jalankan <span className="font-mono font-semibold">supabase/schema.sql</span> di Supabase SQL Editor untuk mengaktifkan database PostgreSQL multi-admin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissedSchemaNotice(true)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100"
              aria-label="Tutup pemberitahuan"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Global Bottom Toast Notification for Success / Error Feedback */}
      {feedback && (
        <div
          className={`fixed left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 animate-[toastSlideUp_0.22s_ease-out] ${
            showBottomNav ||
            subView === 'kpm-detail' ||
            subView === 'proposal-detail' ||
            subView === 'kpm-form' ||
            subView === 'edit-proposal'
              ? 'bottom-24'
              : 'bottom-5'
          } ${
            !isNativeApp ? 'md:left-auto md:right-6 md:bottom-6 md:w-96 md:translate-x-0' : ''
          }`}
        >
          <div
            role="status"
            className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-3 text-xs shadow-xl ${
              feedback.type === 'success'
                ? 'border-teal-300 bg-teal-50 text-teal-950'
                : 'border-rose-300 bg-rose-50 text-rose-950'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <p className="font-medium leading-snug">{feedback.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Tutup notifikasi"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Interactive In-App Push Toast for Incoming 1-on-1 Direct Message */}
      {incomingToast && (
        <div
          className={`fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 ${
            !isNativeApp ? 'md:top-4 md:right-6 md:left-auto md:w-96 md:translate-x-0' : ''
          }`}
        >
          <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <button
              type="button"
              onClick={() => {
                const peerId = incomingToast.senderId;
                setIncomingToast(null);
                openChatView(peerId);
              }}
              className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                <MessageSquare className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">
                  {incomingToast.senderName}{' '}
                  <span className="font-normal text-teal-700">· {incomingToast.senderRole}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{incomingToast.text}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIncomingToast(null)}
              aria-label="Tutup notifikasi pesan"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Interactive In-App System Alert Toast (Proposal Deleted / SuperAdmin New Registration) */}
      {appAlertToast &&
        !incomingToast &&
        (appAlertToast.type !== 'user_registered' || currentUser.role === 'SuperAdmin') && (
        <div
          className={`fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 ${
            !isNativeApp ? 'md:top-4 md:right-6 md:left-auto md:w-96 md:translate-x-0' : ''
          }`}
        >
          <div
            className={`flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-lg shadow-slate-900/10 ${
              appAlertToast.type === 'proposal_deleted'
                ? 'border-rose-200'
                : 'border-amber-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                const action = appAlertToast.targetAction;
                const notifId = appAlertToast.id;
                setAppAlertToast(null);
                setAppNotifications((prev) =>
                  prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
                );
                if (action === 'users' && currentUser.role === 'SuperAdmin') {
                  navigateForwardScroll();
                  setSubView('none');
                  setMenuOpenedFromDashboard(false);
                  setMenuSection('users');
                  setActiveTab('menu');
                } else if (action === 'proposals') {
                  navigateForwardScroll();
                  setSubView('none');
                  setActiveTab('proposal');
                }
              }}
              className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  appAlertToast.type === 'proposal_deleted'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {appAlertToast.type === 'proposal_deleted' ? (
                  <Trash2 className="h-4.5 w-4.5" />
                ) : (
                  <UserPlus className="h-4.5 w-4.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{appAlertToast.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                  {appAlertToast.message}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAppAlertToast(null)}
              aria-label="Tutup notifikasi"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Mobile Viewport Shell with Pull-to-Refresh */}
      <PullToRefresh
        onRefresh={handleManualRefresh}
        disabled={
          isDesktopWeb ||
          !isOnline ||
          subView === 'kpm-form' ||
          subView === 'add-proposal' ||
          subView === 'edit-proposal' ||
          subView === 'chat' ||
          Boolean(lightboxDoc) ||
          isQuickAddOpen ||
          isUpdateModalOpen
        }
      >
        <div
          className={
            isNativeApp
              ? 'mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm'
              : 'min-h-screen w-full overflow-x-hidden bg-slate-100 md:overflow-x-visible md:pl-64'
          }
        >
        {/* Sub-Views */}
        {(subView === 'chat' ||
          (Boolean(kpmDetailReturnToChatPeerId) &&
            (subView === 'kpm-detail' ||
              subView === 'kpm-history' ||
              subView === 'kpm-form'))) && (
          <div className={subView === 'chat' ? '' : 'hidden'}>
            <ChatView
              currentUser={currentUser}
              users={effectiveInternalUsers}
              userAliases={currentUserAliases}
              onSaveUserAlias={handleSaveUserAlias}
              messages={messagesWithDelivery}
              records={records}
              activePeerId={activeChatPeerId}
              onSelectPeer={(peerId) => {
                if (peerId) {
                  navigateForwardScroll();
                } else {
                  navigateRestoreScroll();
                }
                setActiveChatPeerId(peerId);
                if (peerId) {
                  void handleMarkChatRead(peerId);
                }
              }}
              onSendMessage={handleSendChatMessage}
              onMarkConversationRead={handleMarkChatRead}
              onOpenSharedKpm={(kpmId) => {
                const found = records.find((r) => r.id === kpmId);
                if (found) {
                  openKpmDetail(found, returnToTab, false, activeChatPeerId || '__list__');
                } else {
                  setFeedback({
                    type: 'error',
                    message: 'Data KPM ini sudah tidak tersedia atau telah dihapus.',
                  });
                }
              }}
              pushPermission={pushPermission}
              onRequestPushPermission={handleRequestPushPermission}
              onBack={() => {
                navigateRestoreScroll();
                setActiveChatPeerId(null);
                setSubView('none');
                setActiveTab(returnToTab);
              }}
            />
          </div>
        )}

        {subView === 'notifications' && (
          <NotificationPageView
            currentUser={currentUser}
            unreadChatCount={unreadChatCount}
            pendingUsersCount={currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0}
            appNotifications={appNotifications}
            onMarkNotificationsRead={() =>
              setAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            onDismissNotification={(id) =>
              setAppNotifications((prev) => prev.filter((n) => n.id !== id))
            }
            onClearNotifications={() => {
              setBellAckChatCount(unreadChatCount);
              setAppNotifications([]);
              setAppAlertToast(null);
            }}
            onOpenChat={() => openChatView()}
            onOpenUserApproval={() => {
              navigateForwardScroll();
              setSubView('none');
              setMenuOpenedFromDashboard(false);
              setMenuSection('users');
              setActiveTab('menu');
            }}
            onOpenProposalList={() => {
              navigateForwardScroll();
              setSubView('none');
              setActiveTab('proposal');
            }}
          />
        )}

        {subView === 'profile' && (
          <UserProfileView
            user={currentUser}
            appVersion={effectiveAppVersion}
            pushEnabled={pushEnabled}
            pushPermission={pushPermission}
            onRequestPushPermission={handleRequestPushPermission}
            onTogglePushEnabled={handleTogglePushEnabled}
            onUpdateProfile={handleUpdateProfile}
            onLogout={handleLogout}
            onCheckAppUpdate={isNativeApp ? () => void handleManualCheckAppUpdate() : undefined}
            checkingAppUpdate={checkingAppUpdate}
            onBack={() => {
              navigateRestoreScroll();
              setSubView('none');
              setActiveTab(returnToTab);
            }}
          />
        )}

        {subView === 'kpm-detail' && activeKpmRecord && (
          <KpmDetailView
            record={activeKpmRecord}
            allRecords={records}
            proposals={proposals}
            items={items}
            wilayahList={wilayahList}
            proposalSlotMap={proposalSlotMap}
            auditLogs={kpmAuditLogs}
            currentUserId={currentUser.id}
            internalUsers={effectiveInternalUsers}
            userAliases={currentUserAliases}
            canUpdate={hasPermission('update')}
            canDelete={hasPermission('delete')}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              navigateRestoreScroll();
              setFeedback(null);
              setActiveKpmId(null);
              if (kpmDetailReturnToChatPeerId) {
                const peer =
                  kpmDetailReturnToChatPeerId === '__list__' ? null : kpmDetailReturnToChatPeerId;
                setKpmDetailReturnToChatPeerId(null);
                setActiveChatPeerId(peer);
                setSubView('chat');
                if (peer) void handleMarkChatRead(peer);
              } else if (kpmDetailReturnToProposalDetail && activeProposal) {
                setKpmDetailReturnToProposalDetail(false);
                setSubView('proposal-detail');
              } else if (kpmDetailReturnToRecap) {
                setKpmDetailReturnToRecap(false);
                setSubView('subitem-recap');
              } else {
                setSubView('none');
                setActiveTab(returnToTab);
              }
            }}
            onEditRecord={(rec) => openKpmForm(rec, returnToTab, true)}
            onDeleteRecord={handleDeleteKpm}
            onUpdateStatus={handleUpdateKpmStatus}
            onToggleSubItem={handleToggleSubItem}
            onMarkAllSubItemsDelivered={handleMarkAllSubItemsDelivered}
            onShareToChat={handleShareKpmToChat}
            onSelectDuplicateRecord={(dup) => {
              navigateForwardScroll();
              setActiveKpmId(dup.id);
            }}
            onOpenProposal={(proposalName, tahun) =>
              handleOpenProposalDetailByName(proposalName, tahun)
            }
            onOpenFullHistory={() => {
              navigateForwardScroll();
              setSubView('kpm-history');
            }}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            onUpdateKpmDocuments={handleUpdateKpmDocuments}
            reportTemplate={reportTemplate}
            schedules={schedules}
            couponConfig={couponConfig}
            onSaveCouponConfig={handleSaveCouponConfig}
            bastTemplate={bastTemplate}
            onSaveBastTemplate={handleSaveBastTemplate}
            proposalBastMap={proposalBastMap}
            onSaveProposalBastConfig={handleSaveProposalBastConfig}
            onSaveBast={handleSaveKpmBast}
          />
        )}

        {subView === 'kpm-history' && activeKpmRecord && (
          <HistoryDetailView
            mode="kpm"
            record={activeKpmRecord}
            kpmAuditLogs={kpmAuditLogs.filter((l) => l.kpmId === activeKpmRecord.id)}
            onBack={() => {
              navigateRestoreScroll();
              setSubView('kpm-detail');
            }}
          />
        )}

        {(subView === 'subitem-recap' ||
          (kpmDetailReturnToRecap &&
            (subView === 'kpm-detail' ||
              subView === 'kpm-history' ||
              subView === 'kpm-form'))) && (
          <div className={subView === 'subitem-recap' ? '' : 'hidden'}>
            <SubItemRecapView
              records={records}
              items={items}
              selectedYear={selectedYear}
              reportTemplate={reportTemplate}
              onChangeYear={setSelectedYear}
              drillTarget={recapDrillTarget}
              onChangeDrillTarget={(next) => {
                if (next) {
                  navigateForwardScroll();
                } else {
                  navigateRestoreScroll();
                }
                setRecapDrillTarget(next);
              }}
              onBack={() => {
                navigateRestoreScroll();
                setRecapDrillTarget(null);
                setFeedback(null);
                setSubView('none');
                setActiveTab(returnToTab);
              }}
              onSelectKpm={(rec) => openKpmDetail(rec, returnToTab, true)}
            />
          </div>
        )}

        {(subView === 'kpm-form' || (subView === 'add-proposal' && addProposalFromKpmForm)) && (
          <div className={subView === 'kpm-form' ? '' : 'hidden'}>
            <KpmRegistrationForm
              editingRecord={editingKpmRecord}
              existingRecords={records}
              pengelolaList={pengelolaList}
              proposals={proposals}
              itemOptions={items}
              pekerjaanOptions={pekerjaanList}
              yearOptions={allKnownYears}
              wilayahList={wilayahList}
              feedback={feedback}
              onDismissFeedback={() => setFeedback(null)}
              preselectedProposal={pendingSelectedProposal}
              lockedProposalScope={lockedKpmProposalScope}
              initialStandaloneStatus={kpmFormInitialStandaloneStatus}
              proposalSlotMap={proposalSlotMap}
              targetSlot={targetKpmFormSlot}
              onClearPreselectedProposal={() => setPendingSelectedProposal(null)}
              onBack={() => {
                navigateRestoreScroll();
                setFeedback(null);
                setEditingKpmRecord(null);
                setLockedKpmProposalScope(null);
                setKpmFormInitialStandaloneStatus(null);
                setTargetKpmFormSlot(null);
                if (kpmFormReturnToDetail && activeKpmId) {
                  setKpmFormReturnToDetail(false);
                  setSubView('kpm-detail');
                } else if (kpmFormReturnToProposalDetail && activeProposal) {
                  setKpmFormReturnToProposalDetail(false);
                  setSubView('proposal-detail');
                } else {
                  setSubView('none');
                  setActiveTab(returnToTab);
                }
              }}
              onOpenAddProposal={(selectedYr) => openAddProposalForm('kpm', true, selectedYr)}
              onCreatePengelola={handleCreatePengelola}
              onAddPekerjaan={handleAddPekerjaanFromForm}
              onAddYear={handleAddCustomYear}
              onSave={handleSaveKpm}
              onQuickSyncKpmDocuments={handleQuickSyncKpmDocuments}
              onCancelEdit={() => {
                navigateRestoreScroll();
                setEditingKpmRecord(null);
                setLockedKpmProposalScope(null);
                setKpmFormInitialStandaloneStatus(null);
                setTargetKpmFormSlot(null);
                if (kpmFormReturnToDetail && activeKpmId) {
                  setKpmFormReturnToDetail(false);
                  setSubView('kpm-detail');
                } else if (kpmFormReturnToProposalDetail && activeProposal) {
                  setKpmFormReturnToProposalDetail(false);
                  setSubView('proposal-detail');
                } else {
                  setSubView('none');
                  setActiveTab(returnToTab);
                }
              }}
              onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            />
          </div>
        )}

        {subView === 'add-proposal' && (
          <AddProposalForm
            existingProposals={proposals}
            wilayahList={wilayahList}
            yearOptions={allKnownYears}
            initialTahun={addProposalInitialYear}
            onBack={() => {
              navigateRestoreScroll();
              setFeedback(null);
              if (addProposalFromKpmForm) {
                setAddProposalFromKpmForm(false);
                setSubView('kpm-form');
              } else {
                setSubView('none');
                setActiveTab(returnToTab);
              }
            }}
            onSaveNewProposal={handleCreateProposal}
          />
        )}

        {activeProposal &&
          (subView === 'proposal-detail' ||
            subView === 'proposal-history' ||
            subView === 'edit-proposal' ||
            (subView === 'kpm-detail' && kpmDetailReturnToProposalDetail) ||
            (subView === 'kpm-form' && kpmFormReturnToProposalDetail) ||
            (subView === 'none' && activeTab === 'kpm' && kpmOpenedFromProposalDetail)) && (
          <div className={subView === 'proposal-detail' ? '' : 'hidden'}>
            <ProposalDetailView
              proposal={activeProposal}
              allProposals={proposals}
              records={records}
              items={items}
              historyEntries={proposalHistory}
              proposalSlotMap={proposalSlotMap}
              schedules={schedules}
              reportTemplate={reportTemplate}
              bastTemplate={bastTemplate}
              proposalBastMap={proposalBastMap}
              onSaveProposalBastConfig={handleSaveProposalBastConfig}
              canAdd={hasPermission('add')}
              canUpdate={hasPermission('update')}
              onBack={() => {
                navigateRestoreScroll();
                setFeedback(null);
                setSubView('none');
                setActiveTab(returnToTab);
              }}
              onEditProposal={(id) => openEditProposalById(id, returnToTab)}
              onAddKpmInProposal={(proposalName, tahun) => {
                openKpmForm(null, returnToTab, false, true, {
                  namaProposal: proposalName,
                  tahun,
                });
              }}
              onViewKpmInProposal={(proposalName, tahun) => {
                navigateForwardScroll();
                setSelectedYear(tahun);
                setKpmStatusFilter('accepted');
                setKpmItemFilter('all');
                setKpmProposalFilter(proposalName);
                setKpmOpenedFromProposalDetail(true);
                setSubView('none');
                setActiveTab('kpm');
              }}
              onTransferKpm={handleTransferProposalKpms}
              onOpenFullHistory={() => {
                navigateForwardScroll();
                setSubView('proposal-history');
              }}
              onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
              onUpdateProposalDocuments={handleQuickSyncProposalDocuments}
            />
          </div>
        )}

        {subView === 'proposal-history' && activeProposal && (
          <HistoryDetailView
            mode="proposal"
            proposal={activeProposal}
            proposalHistory={proposalHistory.filter(
              (h) =>
                h.proposalName === activeProposal.namaProposal &&
                (!h.tahun || h.tahun === activeProposal.tahun)
            )}
            onBack={() => {
              navigateRestoreScroll();
              setSubView('proposal-detail');
            }}
          />
        )}

        {subView === 'edit-proposal' && activeProposal && (
          <ProposalForm
            proposal={activeProposal}
            existingProposals={proposals}
            yearOptions={allKnownYears}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              navigateRestoreScroll();
              setFeedback(null);
              setSubView('proposal-detail');
            }}
            onSaveProposal={handleUpdateProposal}
            onQuickSyncProposalDocuments={handleQuickSyncProposalDocuments}
            onToggleProposalLock={handleToggleProposalLock}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}

        {/* Top-Level Main Tabs (kept mounted so scroll position, pagination & local filters persist across sub-views) */}
        <div className={subView === 'none' && activeTab === 'dashboard' ? '' : 'hidden'}>
          <DashboardView
            logo={<MasdetaLogo />}
            currentUser={currentUser}
            unreadChatCount={unreadChatCount}
            selectedYear={selectedYear}
            onChangeYear={(y) => setSelectedYear(y)}
            records={records}
            proposals={proposals}
            items={items}
            pendingUsersCount={currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0}
            duplicateNikCount={duplicateNikCount}
            appNotifications={appNotifications}
            bellHasUnread={bellHasUnread}
            onOpenBell={() => {
              setBellAckChatCount(unreadChatCount);
              setAppNotifications((prev) =>
                prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev
              );
            }}
            onMarkNotificationsRead={() =>
              setAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            onDismissNotification={(id) =>
              setAppNotifications((prev) => prev.filter((n) => n.id !== id))
            }
            onClearNotifications={() => {
              setBellAckChatCount(unreadChatCount);
              setAppNotifications([]);
              setAppAlertToast(null);
            }}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            isLoading={isOperationalLoading}
            isOnline={isOnline}
            offlineQueueCount={offlineQueueCount}
            onSyncOfflineQueue={() => void handleFlushOfflineQueue()}
            schedules={schedules}
            onOpenSchedules={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('jadwal');
              setActiveTab('menu');
            }}
            onOpenChat={() => openChatView()}
            onOpenProfile={openProfileView}
            onLogout={handleLogout}
            onOpenKpmList={(filter) => {
              navigateForwardScroll();
              setKpmStatusFilter(filter?.status ?? 'all');
              setKpmItemFilter(filter?.item ?? 'all');
              setKpmProposalFilter('all');
              setKpmOpenedFromProposalDetail(false);
              setActiveTab('kpm');
            }}
            onOpenKpmDetail={(rec) => openKpmDetail(rec, 'dashboard')}
            onOpenSubItemRecap={() => openSubItemRecap('dashboard')}
            onOpenProposalList={() => {
              navigateForwardScroll();
              setActiveTab('proposal');
            }}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'dashboard')}
            onOpenAddProposal={() => openAddProposalForm('dashboard')}
            onOpenUserApproval={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('users');
              setActiveTab('menu');
            }}
            onOpenDuplicateCheck={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('duplikasi');
              setActiveTab('menu');
            }}
            onOpenArsip={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('arsip');
              setActiveTab('menu');
            }}
            onOpenDatabaseKpm={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('database-kpm');
              setActiveTab('menu');
            }}
            onOpenDtsen={() => {
              navigateForwardScroll();
              setMenuOpenedFromDashboard(true);
              setMenuSection('dtsen');
              setActiveTab('menu');
            }}
          />
        </div>

        <div className={subView === 'none' && activeTab === 'kpm' ? '' : 'hidden'}>
          <KpmListView
            records={records}
            proposals={proposals}
            items={items}
            wilayahList={wilayahList}
            proposalSlotMap={proposalSlotMap}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            statusFilter={kpmStatusFilter}
            onChangeStatusFilter={setKpmStatusFilter}
            itemFilter={kpmItemFilter}
            onChangeItemFilter={setKpmItemFilter}
            proposalFilter={kpmProposalFilter}
            onChangeProposalFilter={setKpmProposalFilter}
            canUpdate={hasPermission('update')}
            canDelete={hasPermission('delete')}
            isLoading={isOperationalLoading}
            onBack={() => {
              navigateRestoreScroll();
              if (kpmOpenedFromProposalDetail && activeProposal) {
                setKpmOpenedFromProposalDetail(false);
                setSubView('proposal-detail');
              } else {
                setActiveTab('dashboard');
              }
            }}
            onCreateNew={() => openKpmForm(null, 'kpm')}
            onCreateForEmptySlot={(proposalId, proposalName, tahun, slotNumber, item) =>
              openKpmForm(
                null,
                'kpm',
                false,
                false,
                { namaProposal: proposalName, tahun },
                null,
                { proposalId, proposalName, tahun, slotNumber, item }
              )
            }
            onMoveSlot={(proposalName, tahun, target, direction) =>
              void handleMoveKpmSlot(proposalName, tahun, target, direction)
            }
            onRemoveEmptySlot={(proposalName, tahun, slotNumber) =>
              void handleRemoveEmptySlot(proposalName, tahun, slotNumber)
            }
            onFillEmptySlotFromDatabase={(kpmId, proposalName, tahun, slotNumber) =>
              void handleFillEmptySlotFromDatabase(kpmId, proposalName, tahun, slotNumber)
            }
            onSelectRecord={(rec) => openKpmDetail(rec, 'kpm')}
            onDeleteRecord={handleDeleteKpm}
            onBulkUpdateKpms={handleBulkUpdateKpms}
          />
        </div>

        <div className={subView === 'none' && activeTab === 'proposal' ? '' : 'hidden'}>
          <ProposalListView
            proposals={proposals}
            records={records}
            wilayahList={wilayahList}
            yearOptions={allKnownYears}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            canUpdate={hasPermission('update')}
            canDelete={hasPermission('delete')}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'proposal')}
            onToggleProposalLock={handleToggleProposalLock}
            onBulkSetProposalLock={handleBulkSetProposalLock}
            onDeleteProposal={handleDeleteProposal}
          />
        </div>

        <div className={subView === 'none' && activeTab === 'menu' ? '' : 'hidden'}>
          <MenuHubView
            activeSection={menuSection}
            onChangeSection={(section) => {
              if (section === 'root') {
                navigateRestoreScroll();
              } else if (
                section === 'superadmin' &&
                (menuSection === 'users' ||
                  menuSection === 'administrasi' ||
                  menuSection === 'sampah')
              ) {
                navigateRestoreScroll();
              } else {
                navigateForwardScroll();
              }
              setSelectedPengelolaDrill(null);
              setSelectedPekerjaanDrill(null);
              setSelectedDtsenDrill(null);
              if (section !== 'users' && section !== 'superadmin') {
                setUsersOpenedFromSuperAdmin(false);
              }
              if (section === 'root' && menuOpenedFromDashboard) {
                setMenuOpenedFromDashboard(false);
                setMenuSection('root');
                setActiveTab('dashboard');
                return;
              }
              setMenuSection(section);
            }}
            selectedPengelolaDrill={selectedPengelolaDrill}
            onSelectPengelolaDrill={(name) => {
              if (name) {
                navigateForwardScroll();
              } else {
                navigateRestoreScroll();
              }
              setSelectedPengelolaDrill(name);
            }}
            selectedPekerjaanDrill={selectedPekerjaanDrill}
            onSelectPekerjaanDrill={(name) => {
              if (name) {
                navigateForwardScroll();
              } else {
                navigateRestoreScroll();
              }
              setSelectedPekerjaanDrill(name);
            }}
            selectedDtsenDrill={selectedDtsenDrill}
            onSelectDtsenDrill={(val) => {
              if (val) {
                navigateForwardScroll();
              } else {
                navigateRestoreScroll();
              }
              setSelectedDtsenDrill(val);
            }}
            usersOpenedFromSuperAdmin={usersOpenedFromSuperAdmin}
            onChangeUsersOpenedFromSuperAdmin={setUsersOpenedFromSuperAdmin}
            currentUser={currentUser}
            unreadChatCount={unreadChatCount}
            selectedYear={selectedYear}
            records={records}
            proposals={proposals}
            items={items}
            pekerjaanList={pekerjaanList}
            pengelolaList={pengelolaList}
            wilayahList={wilayahList}
            internalUsers={effectiveInternalUsers}
            userAliases={currentUserAliases}
            onSaveUserAlias={handleSaveUserAlias}
            proposalHistory={proposalHistory}
            kpmAuditLogs={kpmAuditLogs}
            onOpenChat={(peerId) => openChatView(peerId)}
            onOpenProfile={openProfileView}
            onCheckAppUpdate={isNativeApp ? () => void handleManualCheckAppUpdate() : undefined}
            checkingAppUpdate={checkingAppUpdate}
            hasAppUpdate={isNativeApp && Boolean(appUpdateInfo?.hasUpdate)}
            availableUpdateVersion={isNativeApp ? appUpdateInfo?.latestVersion : undefined}
            appVersion={effectiveAppVersion}
            githubReleases={githubReleases}
            onGithubReleasesUpdated={setGithubReleases}
            onSaveItem={handleSaveCatalogItem}
            onDeleteItem={handleDeleteCatalogItem}
            onMoveItemOrder={handleMoveItemOrder}
            onUpdateItemSubItems={handleUpdateItemSubItems}
            onCopyItemsFromYear={handleCopyItemsFromYear}
            onAddPekerjaan={(job) => {
              if (!requirePermission('add', 'menambah daftar pekerjaan')) return;
              const nextPekerjaan = [...pekerjaanList, job];
              setPekerjaanList(nextPekerjaan);
              if (supabaseReadyRef.current) {
                void runSupabaseMutation(
                  () =>
                    upsertPekerjaanListInSupabase({
                      pekerjaanList: nextPekerjaan,
                      proposals,
                      pengelolaList,
                    }),
                  'Gagal menambahkan pekerjaan ke Supabase'
                );
              } else {
                void syncOperationalData({ pekerjaanList: nextPekerjaan }, 'add');
              }
            }}
            onUpdatePekerjaan={handleUpdatePekerjaan}
            onDeletePekerjaan={handleDeletePekerjaan}
            onUpdateWilayahList={(nextList) => {
              if (!requirePermission('update', 'mengubah data wilayah')) return;
              const actEntry = createActivityHistoryEntry('wilayah_updated', {
                proposalName: 'Master Wilayah',
                detail: `Memperbarui daftar wilayah operasional (${nextList.length} Kab/Kota).`,
                action: 'entered',
              });
              const nextHistory = [actEntry, ...proposalHistory];
              setWilayahList(nextList);
              setProposalHistory(nextHistory);
              if (supabaseReadyRef.current) {
                void runSupabaseMutation(
                  () =>
                    syncWilayahInSupabase({
                      wilayahList: nextList,
                      historyEntries: [actEntry],
                    }),
                  'Gagal memperbarui data wilayah di Supabase'
                );
              } else {
                void syncOperationalData(
                  { wilayahList: nextList, proposalHistory: nextHistory },
                  'update'
                );
              }
            }}
            onOpenSubItemRecap={() => openSubItemRecap('menu')}
            onAddPengelola={handleCreatePengelola}
            onUpdatePengelola={handleUpdatePengelola}
            onDeletePengelola={handleDeletePengelola}
            onAdminControlUser={handleAdminControlUser}
            onDeleteInternalUser={handleDeleteInternalUser}
            onAdminDataAction={handleAdminDataAction}
            onVerifySuperAdminPassword={handleVerifySuperAdminPassword}
            onRegisterInternalUser={handleRegisterInternalUser}
            onImportCsv={handleImportCsv}
            onSelectKpm={(rec) => openKpmDetail(rec, 'menu')}
            onToggleBerkasDikembalikan={handleToggleBerkasDikembalikan}
            onSelectKpmFromDuplicate={(rec) => openKpmDetail(rec, 'menu')}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            schedules={schedules}
            onAddSchedule={handleAddSchedule}
            onUpdateSchedule={handleUpdateSchedule}
            onToggleSchedule={handleToggleSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            trashBin={trashBin}
            onRestoreTrashItem={handleRestoreTrashItem}
            onPermanentDeleteTrashItem={handlePermanentDeleteTrashItem}
            proposalSlotMap={proposalSlotMap}
            reportTemplate={reportTemplate}
            onSaveReportTemplate={handleSaveReportTemplate}
            couponConfig={couponConfig}
            onSaveCouponConfig={handleSaveCouponConfig}
            bastTemplate={bastTemplate}
            onSaveBastTemplate={handleSaveBastTemplate}
            proposalBastMap={proposalBastMap}
            onSaveProposalBastConfig={handleSaveProposalBastConfig}
            onOpenCreateStandaloneDatabaseKpm={() =>
              openKpmForm(null, 'menu', false, false, null, 'pending')
            }
            onBulkRecoverToDatabase={handleBulkRecoverToDatabase}
            onBulkRejectToArsip={handleBulkRejectToArsip}
            onBulkAssignToProposal={handleBulkAssignToProposal}
            onBulkPermanentDeleteKpms={handleBulkPermanentDeleteKpms}
          />
        </div>
        </div>
      </PullToRefresh>

      {/* Floating Scroll-To-Top Hover Button */}
      <ScrollToTopButton
        hasBottomNav={showBottomNav}
        hasFloatingAction={subView === 'kpm-detail' || subView === 'proposal-detail'}
      />

      {/* Bottom Navigation Bar with Central Circular Add Button */}
      {showBottomNav && (
        <BottomNavBar
          activeTab={activeTab}
          pendingUsersCount={currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0}
          unreadChatCount={unreadChatCount}
          urgentSchedulesCount={urgentSchedulesCount}
          hasAppUpdate={isNativeApp && Boolean(appUpdateInfo?.hasUpdate)}
          onSelectTab={(tab) => {
            setFeedback(null);
            setMenuOpenedFromDashboard(false);
            const isSameActiveRootTab =
              subView === 'none' &&
              activeTab === tab &&
              !(tab === 'menu' && menuSection !== 'root');
            if (isSameActiveRootTab) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            navigateRestoreScroll();
            if (tab === 'menu') {
              setMenuSection('root');
              setUsersOpenedFromSuperAdmin(false);
              setSelectedPengelolaDrill(null);
              setSelectedPekerjaanDrill(null);
              setSelectedDtsenDrill(null);
            }
            setActiveTab(tab);
          }}
          onOpenQuickAdd={() => {
            if (!requirePermission('add', 'menambah data KPM atau proposal baru')) return;
            setIsQuickAddOpen(true);
          }}
        />
      )}

      {/* Center "+" Action Sheet */}
      <QuickAddSheet
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddKpm={() => openKpmForm(null, activeTab)}
        onAddProposal={() => openAddProposalForm(activeTab)}
      />

      {/* Fullscreen Document & PDF Lightbox */}
      <DocumentLightbox
        documentFile={lightboxDoc?.file ?? null}
        title={lightboxDoc?.title ?? ''}
        onClose={() => setLightboxDoc(null)}
      />

      {/* In-App Android APK Auto-Updater Modal (Update Wajib / Patch Opsional) */}
      <AppUpdateModal
        updateInfo={appUpdateInfo}
        open={isNativeApp && isUpdateModalOpen}
        onDismissLater={
          appUpdateInfo && !appUpdateInfo.isMandatory ? handleDismissUpdateLater : undefined
        }
      />
    </div>
  );
}
