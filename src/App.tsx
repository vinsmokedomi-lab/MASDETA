import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, MessageSquare, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import {
  checkSupabaseSchemaReady,
  deleteKpmRecordInSupabase,
  fetchOperationalDataFromSupabase,
  isSchemaMissingError,
  runAdminDataActionInSupabase,
  supabaseAdminControlInternalUser,
  supabaseCreateInternalUserBySuperAdmin,
  supabaseDeleteInternalUser,
  supabaseFetchDirectMessages,
  supabaseFetchInternalUsers,
  supabaseLogin,
  supabaseMarkDirectMessagesRead,
  supabaseRegisterInternalUser,
  supabaseSendDirectMessage,
  supabaseSetUserPresence,
  supabaseUpdateInternalUserProfile,
  supabaseVerifyUserPassword,
  syncAllOperationalDataToSupabase,
  updateKpmDocumentsInSupabase,
  upsertProposalInSupabase,
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
  DirectChatMessage,
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmDocuments,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalChecklist,
  ProposalDocuments,
  ProposalFormValues,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  SharedKpmCard,
  UserPermissions,
  UserPresenceStatus,
  ValidationStatus,
  WilayahKabKota,
} from './types/kpm';
import {
  clearSampleRecordsOnce,
  diffKpmRecordChanges,
  formatValidationLabel,
  generateRegisterCode,
  loadInternalUsers,
  loadItemList,
  loadKpmAuditLogs,
  loadKpmRecords,
  loadPekerjaanList,
  loadPengelolaList,
  loadProposalHistory,
  loadProposals,
  loadWilayahList,
  normalizeSubItemKey,
  recalculateProposalRegisterCodes,
  removeDocumentFromDrive,
  resolvePackageForKpm,
  saveInternalUsers,
  saveItemList,
  saveKpmAuditLogs,
  saveKpmRecords,
  savePekerjaanList,
  savePengelolaList,
  saveProposalHistory,
  saveProposals,
  saveWilayahList,
} from './utils/imageProcessor';
import { importProposalKpmFromCsv } from './utils/csvImporter';
import { KpmRegistrationForm } from './components/KpmRegistrationForm';
import { KpmDetailView } from './components/KpmDetailView';
import { SubItemRecapView } from './components/SubItemRecapView';
import { AddProposalForm } from './components/AddProposalForm';
import { ProposalForm } from './components/ProposalForm';
import { ProposalDetailView } from './components/ProposalDetailView';
import { DocumentLightbox } from './components/DocumentLightbox';
import { OfflineIndicator } from './components/PWAInstallButton';
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
import { ChatView } from './components/ChatView';
import { UserProfileView } from './components/UserProfileView';
import { AppUpdateModal } from './components/AppUpdateModal';
import { PullToRefresh } from './components/PullToRefresh';
import { AppUpdateInfo, checkForAppUpdate } from './services/appUpdater';
import { APP_VERSION } from './config/appVersion';

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

async function triggerPushNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `masdeta-chat-${Date.now()}`,
        });
        return;
      }
    }
    new Notification(title, { body, icon: '/icons/icon-192.png' });
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
    loadProposals(INITIAL_PROPOSAL_LIST)
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

  const [editingKpmRecord, setEditingKpmRecord] = useState<KpmRecord | null>(null);
  const [activeKpmId, setActiveKpmId] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [pendingSelectedProposal, setPendingSelectedProposal] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
  const [lockedKpmProposalScope, setLockedKpmProposalScope] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
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
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
      }
      return Notification.permission;
    }
  );
  const [incomingToast, setIncomingToast] = useState<IncomingToastBanner | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);
  const [supabaseSchemaMissing, setSupabaseSchemaMissing] = useState<boolean>(false);
  const [dismissedSchemaNotice, setDismissedSchemaNotice] = useState<boolean>(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const subViewRef = useRef<SubView>(subView);
  const activeChatPeerIdRef = useRef<string | null>(activeChatPeerId);
  const pushEnabledRef = useRef<boolean>(pushEnabled);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  const currentUserIdRef = useRef<string | null>(sessionUserId);
  const supabaseReadyRef = useRef<boolean>(supabaseReady);
  const lastLocalSyncAtRef = useRef<number>(0);
  const isManualRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const runStartupUpdateCheck = async () => {
      try {
        const info = await checkForAppUpdate();
        if (!cancelled && info.hasUpdate) {
          setAppUpdateInfo(info);
          setIsUpdateModalOpen(true);
        }
      } catch {
        // Abaikan error jaringan diam-diam saat pengecekan otomatis di latar
      }
    };
    void runStartupUpdateCheck();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleManualCheckAppUpdate = async () => {
    if (checkingAppUpdate) return;
    setCheckingAppUpdate(true);
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

  const currentUser = useMemo(() => {
    if (!sessionUserId) return null;
    return internalUsers.find((u) => u.id === sessionUserId && u.status === 'active') ?? null;
  }, [internalUsers, sessionUserId]);
  currentUserIdRef.current = currentUser?.id ?? null;

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

  const unreadChatCount = useMemo(() => {
    if (!currentUser) return 0;
    return directMessages.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
  }, [directMessages, currentUser]);

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
    const ktpCounts = new Map<string, number>();
    const kkCounts = new Map<string, number>();
    for (const r of records) {
      if (selectedYear !== 'all' && r.tahun !== selectedYear) continue;
      if (r.nikKtp) ktpCounts.set(r.nikKtp, (ktpCounts.get(r.nikKtp) ?? 0) + 1);
      if (r.nikKk) kkCounts.set(r.nikKk, (kkCounts.get(r.nikKk) ?? 0) + 1);
    }
    let dupes = 0;
    ktpCounts.forEach((c) => {
      if (c > 1) dupes += 1;
    });
    kkCounts.forEach((c) => {
      if (c > 1) dupes += 1;
    });
    return dupes;
  }, [records, selectedYear]);

  useEffect(() => {
    const saved = saveKpmRecords(records);
    if (!saved) {
      setFeedback({
        type: 'error',
        message: 'Penyimpanan lokal penuh. Hapus beberapa data lama untuk menyimpan berkas baru.',
      });
    }
  }, [records]);

  useEffect(() => {
    savePengelolaList(pengelolaList);
  }, [pengelolaList]);

  useEffect(() => {
    const saved = saveProposals(proposals);
    if (!saved) {
      setFeedback({
        type: 'error',
        message:
          'Penyimpanan lokal penuh saat menyimpan data proposal. Gunakan file berukuran lebih ringkas.',
      });
    }
  }, [proposals]);

  useEffect(() => {
    saveProposalHistory(proposalHistory);
  }, [proposalHistory]);

  useEffect(() => {
    saveKpmAuditLogs(kpmAuditLogs);
  }, [kpmAuditLogs]);

  useEffect(() => {
    saveItemList(items);
  }, [items]);

  useEffect(() => {
    savePekerjaanList(pekerjaanList);
  }, [pekerjaanList]);

  useEffect(() => {
    saveWilayahList(wilayahList);
  }, [wilayahList]);

  useEffect(() => {
    saveInternalUsers(internalUsers);
  }, [internalUsers]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const clearSessionState = useCallback(() => {
    setSessionToken(null);
    setSessionUserId(null);
    setDirectMessages([]);
    setActiveChatPeerId(null);
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

  const applyRemoteOperationalState = useCallback((state: Partial<OperationalDataPayload>) => {
    const nextProposals = Array.isArray(state.proposals) ? state.proposals : latestDataRef.current.proposals;
    const nextItems = Array.isArray(state.items) ? state.items : latestDataRef.current.items;
    const nextWilayah = Array.isArray(state.wilayahList) ? state.wilayahList : latestDataRef.current.wilayahList;
    const rawRecords = Array.isArray(state.records) ? state.records : latestDataRef.current.records;

    setProposals(nextProposals);
    setItems(nextItems);
    setWilayahList(nextWilayah);
    setRecords(recalculateProposalRegisterCodes(rawRecords, nextProposals, nextItems, nextWilayah));
    if (Array.isArray(state.pengelolaList)) setPengelolaList(state.pengelolaList);
    if (Array.isArray(state.pekerjaanList)) setPekerjaanList(state.pekerjaanList);
    if (Array.isArray(state.proposalHistory)) setProposalHistory(state.proposalHistory);
    if (Array.isArray(state.kpmAuditLogs)) setKpmAuditLogs(state.kpmAuditLogs);
  }, []);

  const loadOrBootstrapOperationalData = useCallback(
    async (
      token: string,
      actor?: { nama: string; email?: string },
      useSupabaseOverride?: boolean
    ) => {
      const useSupabase = useSupabaseOverride ?? supabaseReadyRef.current;

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
    },
    [authFetch, applyRemoteOperationalState]
  );

  const syncOperationalData = useCallback(
    async (
      patch: Partial<OperationalDataPayload>,
      requiredPermission: keyof UserPermissions
    ): Promise<boolean> => {
      if (!sessionTokenRef.current && !supabaseReadyRef.current) return false;
      const merged: OperationalDataPayload = {
        ...latestDataRef.current,
        ...patch,
      };

      if (supabaseReadyRef.current) {
        try {
          lastLocalSyncAtRef.current = Date.now();
          await syncAllOperationalDataToSupabase(merged);
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
            message: `Gagal sinkronisasi ke Supabase: ${msg}`,
          });
          return false;
        }
      }

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
    },
    [authFetch]
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
            setInternalUsers(users);
          }

          if (!sessionUserId) {
            setAuthReady(true);
            return;
          }

          const activeUser = users.find((u) => u.id === sessionUserId && u.status === 'active');
          if (!activeUser) {
            clearSessionState();
            setAuthReady(true);
            return;
          }

          const msgs = await supabaseFetchDirectMessages();
          if (cancelled) return;
          const userMsgs = msgs.filter(
            (m) => m.senderId === activeUser.id || m.recipientId === activeUser.id
          );
          prevMessageIdsRef.current = new Set(userMsgs.map((m) => m.id));
          setDirectMessages(userMsgs);

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
        } finally {
          if (!cancelled) setAuthReady(true);
        }
        return;
      }

      if (!sessionToken) {
        if (sessionUserId) {
          clearSessionState();
        }
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
              setInternalUsers(data.users);
            }
            if (Array.isArray(data.messages)) {
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
  }, [sessionToken, authFetch, clearSessionState, loadOrBootstrapOperationalData, sessionUserId]);

  const handleMarkChatRead = useCallback(
    async (peerId: string) => {
      if (!currentUser || !peerId) return;
      const hasUnread = directMessages.some(
        (m) => m.senderId === peerId && m.recipientId === currentUser.id && !m.readAt
      );
      if (!hasUnread) return;

      const now = new Date().toISOString();
      setDirectMessages((prev) =>
        prev.map((m) =>
          m.senderId === peerId && m.recipientId === currentUser.id && !m.readAt
            ? { ...m, readAt: now }
            : m
        )
      );

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
    [currentUser, directMessages, authFetch]
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
          setInternalUsers(users);
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
          prevMessageIdsRef.current = new Set(userMsgs.map((m) => m.id));
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
            setInternalUsers(collab.users);
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
      if (Date.now() - lastLocalSyncAtRef.current < 1500) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(async () => {
        try {
          const snapshot = await fetchOperationalDataFromSupabase();
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
      }, 500);
    };

    const syncMessagesFromSupabase = async () => {
      try {
        const all = await supabaseFetchDirectMessages();
        const mine = all.filter((m) => m.senderId === uid || m.recipientId === uid);
        const latestNew = mine.find(
          (m) => m.recipientId === uid && !prevMessageIdsRef.current.has(m.id)
        );
        prevMessageIdsRef.current = new Set(mine.map((m) => m.id));
        setDirectMessages(mine);

        if (latestNew) {
          const isViewingThread =
            subViewRef.current === 'chat' &&
            activeChatPeerIdRef.current === latestNew.senderId &&
            document.visibilityState === 'visible';

          if (isViewingThread) {
            const sorted = [uid, latestNew.senderId].sort();
            void supabaseMarkDirectMessagesRead(`${sorted[0]}::${sorted[1]}`, uid);
          } else {
            const sender = internalUsers.find((u) => u.id === latestNew.senderId);
            const senderName = sender?.nama || 'Pengguna Internal';
            const senderRole = sender?.role || 'Admin';
            const displayMsgText =
              latestNew.text ||
              (latestNew.sharedKpm
                ? `Kartu KPM: ${latestNew.sharedKpm.nama} (${latestNew.sharedKpm.proposal})`
                : 'Pesan baru');

            playMessageChime();
            setIncomingToast({
              id: latestNew.id,
              senderId: latestNew.senderId,
              senderName,
              senderRole,
              text: displayMsgText,
            });
            if (toastTimer) window.clearTimeout(toastTimer);
            toastTimer = window.setTimeout(() => {
              setIncomingToast((curr) => (curr?.id === latestNew.id ? null : curr));
            }, 6500);

            if (pushEnabledRef.current) {
              void triggerPushNotification(
                `Pesan dari ${senderName} (${senderRole})`,
                displayMsgText
              );
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    const channel = supabase
      .channel('masdeta-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_users' },
        () => {
          void supabaseFetchInternalUsers().then((users) => {
            if (users.length > 0) setInternalUsers(users);
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
        { event: '*', schema: 'public', table: 'proposals' },
        scheduleOperationalRefresh
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
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.id, supabaseReady, applyRemoteOperationalState, internalUsers]);

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
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (data.type === 'users:updated' && Array.isArray(data.users)) {
            setInternalUsers(data.users as InternalUser[]);
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

            setDirectMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });

            if (msg.recipientId === uid) {
              const isViewingThread =
                subViewRef.current === 'chat' &&
                activeChatPeerIdRef.current === msg.senderId &&
                document.visibilityState === 'visible';

              if (isViewingThread) {
                authFetch('/api/chat/read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ peerId: msg.senderId }),
                }).catch(() => {});
              } else {
                const senderName = String(data.senderName || 'Pengguna Internal');
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
                    `Pesan dari ${senderName} (${senderRole})`,
                    displayMsgText
                  );
                }
              }
            }
            return;
          }

          if (data.type === 'chat:read' && Array.isArray(data.messageIds)) {
            const ids = new Set(data.messageIds as string[]);
            const readAt = String(data.readAt || new Date().toISOString());
            setDirectMessages((prev) =>
              prev.map((m) => (ids.has(m.id) ? { ...m, readAt } : m))
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

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [currentUser?.id, sessionToken, supabaseReady, authFetch, applyRemoteOperationalState]);

  // Pelacak Aktivitas Otomatis untuk Presence Dot (Hijau = Aktif, Oranye = Idle)
  useEffect(() => {
    if (!currentUser || currentUser.presenceManual) return;

    let idleTimer: number | undefined;
    let lastSent: UserPresenceStatus | null = null;

    const sendPresence = (status: UserPresenceStatus) => {
      if (lastSent === status) return;
      lastSent = status;
      if (supabaseReadyRef.current) {
        void supabaseSetUserPresence(currentUser.id, status, false);
        return;
      }
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'presence:activity', status }));
      }
    };

    const scheduleIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      if (document.visibilityState === 'hidden') {
        sendPresence('idle');
        return;
      }
      sendPresence('online');
      idleTimer = window.setTimeout(() => {
        sendPresence('idle');
      }, 120_000);
    };

    scheduleIdle();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, scheduleIdle, { passive: true }));
    document.addEventListener('visibilitychange', scheduleIdle);

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, scheduleIdle));
      document.removeEventListener('visibilitychange', scheduleIdle);
    };
  }, [currentUser?.id, currentUser?.presenceManual]);

  // Tombol Back Android: TERKUNCI saat BottomNav (botnavig) tampil di layar,
  // dan HANYA berfungsi melakukan navigasi kembali jika tidak ada BottomNav di layar.
  const handleAndroidBackRef = useRef<() => void>(() => {});
  handleAndroidBackRef.current = () => {
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

    if (isUpdateModalOpen) {
      setIsUpdateModalOpen(false);
      return;
    }

    if (subView === 'kpm-history') {
      setSubView('kpm-detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'proposal-history') {
      setSubView('proposal-detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'edit-proposal') {
      setFeedback(null);
      setSubView('proposal-detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'add-proposal') {
      setFeedback(null);
      if (addProposalFromKpmForm) {
        setAddProposalFromKpmForm(false);
        setSubView('kpm-form');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'kpm-form') {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'kpm-detail') {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'proposal-detail' || subView === 'subitem-recap') {
      setFeedback(null);
      setSubView('none');
      setActiveTab(returnToTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'chat') {
      if (activeChatPeerId) {
        setActiveChatPeerId(null);
      } else {
        setActiveChatPeerId(null);
        setSubView('none');
        setActiveTab(returnToTab);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'profile') {
      setSubView('none');
      setActiveTab(returnToTab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (subView === 'none' && activeTab === 'menu' && menuSection !== 'root') {
      if (menuSection === 'pengelola' && selectedPengelolaDrill) {
        setSelectedPengelolaDrill(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (menuSection === 'pekerjaan' && selectedPekerjaanDrill) {
        setSelectedPekerjaanDrill(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (menuSection === 'users' && usersOpenedFromSuperAdmin) {
        setUsersOpenedFromSuperAdmin(false);
        setMenuSection('superadmin');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (menuOpenedFromDashboard) {
        setMenuOpenedFromDashboard(false);
        setMenuSection('root');
        setActiveTab('dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setSelectedPengelolaDrill(null);
      setSelectedPekerjaanDrill(null);
      setUsersOpenedFromSuperAdmin(false);
      setMenuSection('root');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      setActiveKpmId(null);
      setSubView('none');
      setActiveTab(returnToTab);
    } else if (
      (subView === 'proposal-detail' ||
        subView === 'proposal-history' ||
        subView === 'edit-proposal') &&
      !activeProposal
    ) {
      setActiveProposalId(null);
      setSubView('none');
      setActiveTab(returnToTab);
    }
  }, [subView, activeKpmRecord, activeProposal, returnToTab]);

  useEffect(() => {
    setRecords((prev) => recalculateProposalRegisterCodes(prev, proposals, items, wilayahList));
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
    sourceLabel?: string
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
    });

    if (result.importedRecordsCount > 0) {
      const nextAuditLogs = [...result.newAuditLogs, ...kpmAuditLogs];
      const nextProposalHistory = [...result.newProposalHistory, ...proposalHistory];

      setProposals(result.nextProposals);
      setPengelolaList(result.nextPengelolaList);
      setPekerjaanList(result.nextPekerjaanList);
      setRecords(result.nextRecords);
      if (result.newAuditLogs.length > 0) {
        setKpmAuditLogs(nextAuditLogs);
      }
      if (result.newProposalHistory.length > 0) {
        setProposalHistory(nextProposalHistory);
      }
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
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmDetailReturnToRecap(fromRecap);
    setKpmDetailReturnToProposalDetail(false);
    setKpmDetailReturnToChatPeerId(fromChatPeerId);
    setActiveKpmId(record.id);
    setSubView('kpm-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openSubItemRecap = (fromTab: MainTab = activeTab) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setSubView('subitem-recap');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openKpmForm = (
    record: KpmRecord | null,
    fromTab: MainTab = activeTab,
    returnToDetail = false,
    returnToProposalDetail = false,
    lockedScope: { namaProposal: string; tahun: string } | null = null
  ) => {
    if (record) {
      if (!requirePermission('update', 'mengubah data calon KPM')) return;
    } else {
      if (!requirePermission('add', 'mendaftarkan calon KPM baru')) return;
    }
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmFormReturnToDetail(returnToDetail);
    setKpmFormReturnToProposalDetail(returnToProposalDetail);
    setLockedKpmProposalScope(lockedScope);
    setEditingKpmRecord(record);
    setSubView('kpm-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAddProposalForm = (fromTab: MainTab = activeTab, fromKpmForm = false) => {
    if (!requirePermission('add', 'menambah proposal baru')) return;
    setFeedback(null);
    setReturnToTab(fromTab);
    setAddProposalFromKpmForm(fromKpmForm);
    setSubView('add-proposal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProposalDetailById = (proposalId: string, fromTab: MainTab = activeTab) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('proposal-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditProposalById = (proposalId: string, fromTab: MainTab = returnToTab) => {
    if (!requirePermission('update', 'mengubah data proposal')) return;
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('edit-proposal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      setProposals(nextProposals);
      void syncOperationalData({ proposals: nextProposals }, 'add');
      openProposalDetailById(created.id, returnToTab);
    }
  };

  const handleCreatePengelola = (profile: PengelolaProfile) => {
    if (!requirePermission('add', 'menambah pengelola lapangan')) return;
    const nextPengelola = [profile, ...pengelolaList];
    setPengelolaList(nextPengelola);
    void syncOperationalData({ pengelolaList: nextPengelola }, 'add');
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

    void syncOperationalData(
      nameChanged ? { pengelolaList: nextPengelola, records: nextRecords } : { pengelolaList: nextPengelola },
      'update'
    );
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
    void syncOperationalData({ pengelolaList: nextPengelola }, 'delete');
    setFeedback({
      type: 'success',
      message: `Pengelola "${target.displayName}" berhasil dihapus.`,
    });
  };

  const handleSaveKpm = async (
    values: KpmFormValues,
    editingId?: string
  ): Promise<boolean> => {
    if (editingId) {
      if (!requirePermission('update', 'memperbarui data calon KPM')) return false;
    } else {
      if (!requirePermission('add', 'menyimpan calon KPM baru')) return false;
    }

    const matchingProposal =
      proposals.find((p) => p.namaProposal === values.proposal && p.tahun === values.tahun) ??
      proposals.find((p) => p.namaProposal === values.proposal);

    if (matchingProposal?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${matchingProposal.namaProposal}" berstatus Terkunci. Data KPM tidak dapat ditambahkan atau diubah.`,
      });
      return false;
    }

    const now = new Date().toISOString();

    if (editingId) {
      const previousRecord = records.find((r) => r.id === editingId);
      let nextAuditLogs = kpmAuditLogs;
      let nextProposalHistory = proposalHistory;

      if (previousRecord) {
        const prevProp =
          proposals.find(
            (p) => p.namaProposal === previousRecord.proposal && p.tahun === previousRecord.tahun
          ) ?? proposals.find((p) => p.namaProposal === previousRecord.proposal);

        if (prevProp?.status === 'locked') {
          setFeedback({
            type: 'error',
            message: `Proposal "${prevProp.namaProposal}" berstatus Terkunci. Calon KPM tidak dapat dipindahkan atau diubah.`,
          });
          return false;
        }

        const fieldChanges = diffKpmRecordChanges(previousRecord, values);
        if (fieldChanges.length > 0) {
          const auditEntry: KpmAuditLogEntry = {
            id: `audit-upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kpmId: previousRecord.id,
            action: 'updated',
            actorName: currentActor.nama,
            actorEmail: currentActor.email,
            timestamp: now,
            proposal: values.proposal,
            tahun: values.tahun,
            changes: fieldChanges,
          };
          nextAuditLogs = [auditEntry, ...kpmAuditLogs];
        }

        if (
          previousRecord.proposal !== values.proposal ||
          previousRecord.tahun !== values.tahun
        ) {
          const moveOutEntry: ProposalKpmHistoryEntry = {
            id: `hist-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tahun: previousRecord.tahun,
            proposalName: previousRecord.proposal,
            kpmId: previousRecord.id,
            kpmName: values.nama,
            registerCode: previousRecord.registerCode,
            action: 'moved_out',
            fromProposal: previousRecord.proposal,
            toProposal: values.proposal,
            actorName: currentActor.nama,
            timestamp: now,
          };
          const moveInEntry: ProposalKpmHistoryEntry = {
            id: `hist-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tahun: values.tahun,
            proposalName: values.proposal,
            kpmId: previousRecord.id,
            kpmName: values.nama,
            registerCode: previousRecord.registerCode,
            action: 'moved_in',
            fromProposal: previousRecord.proposal,
            toProposal: values.proposal,
            actorName: currentActor.nama,
            timestamp: now,
          };
          nextProposalHistory = [moveInEntry, moveOutEntry, ...proposalHistory];
        }
      }

      const mapped = records.map((rec) =>
        rec.id === editingId
          ? {
              ...rec,
              ...values,
              validasi: values.validasi || rec.validasi,
              updatedAt: now,
            }
          : rec
      );
      const nextRecords = recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList);

      const ok = await syncOperationalData(
        {
          records: nextRecords,
          kpmAuditLogs: nextAuditLogs,
          proposalHistory: nextProposalHistory,
        },
        'update'
      );
      if (!ok) return false;

      setKpmAuditLogs(nextAuditLogs);
      setProposalHistory(nextProposalHistory);
      setRecords(nextRecords);
      setEditingKpmRecord(null);
      if (kpmFormReturnToDetail && activeKpmId) {
        setKpmFormReturnToDetail(false);
        setSubView('kpm-detail');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      setFeedback({
        type: 'success',
        message: `Data calon KPM "${values.nama}" berhasil diperbarui.`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    const rawNewRecord: KpmRecord = {
      id: `kpm-${Date.now()}`,
      registerCode: generateRegisterCode(
        values.tahun,
        values.item,
        records.filter((r) => r.proposal === values.proposal && r.tahun === values.tahun).length
      ),
      ...values,
      validasi: values.validasi || 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const nextRecordsList = recalculateProposalRegisterCodes(
      [rawNewRecord, ...records],
      proposals,
      items,
      wilayahList
    );
    const savedNewRecord =
      nextRecordsList.find((r) => r.id === rawNewRecord.id) ?? rawNewRecord;

    const itemMatch = resolvePackageForKpm(items, savedNewRecord.tahun, savedNewRecord.item);
    const itemDisplay =
      itemMatch && itemMatch.name !== itemMatch.code
        ? `${itemMatch.code} — ${itemMatch.name}`
        : savedNewRecord.item;

    const createdAuditEntry: KpmAuditLogEntry = {
      id: `audit-create-${Date.now()}`,
      kpmId: savedNewRecord.id,
      action: 'created',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: savedNewRecord.proposal,
      tahun: savedNewRecord.tahun,
      changes: [
        {
          field: 'Proposal Awal',
          before: '-',
          after: `${savedNewRecord.proposal} (${savedNewRecord.tahun})`,
        },
        { field: 'Item Bantuan', before: '-', after: itemDisplay },
        {
          field: 'Status Validasi',
          before: '-',
          after: formatValidationLabel(savedNewRecord.validasi),
        },
      ],
    };

    const enteredHistory: ProposalKpmHistoryEntry = {
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
    };

    const nextAuditLogs = [createdAuditEntry, ...kpmAuditLogs];
    const nextProposalHistory = [enteredHistory, ...proposalHistory];

    const ok = await syncOperationalData(
      {
        records: nextRecordsList,
        kpmAuditLogs: nextAuditLogs,
        proposalHistory: nextProposalHistory,
      },
      'add'
    );
    if (!ok) return false;

    setRecords(nextRecordsList);
    setKpmAuditLogs(nextAuditLogs);
    setProposalHistory(nextProposalHistory);
    setPendingSelectedProposal(null);
    setLockedKpmProposalScope(null);
    setSelectedYear(savedNewRecord.tahun);
    setActiveKpmId(savedNewRecord.id);
    setKpmDetailReturnToRecap(false);
    setKpmDetailReturnToChatPeerId(null);
    if (kpmFormReturnToProposalDetail && activeProposal) {
      setKpmFormReturnToProposalDetail(false);
      setKpmDetailReturnToProposalDetail(true);
    } else {
      setKpmDetailReturnToProposalDetail(false);
      setReturnToTab('kpm');
    }
    setSubView('kpm-detail');
    setFeedback({
      type: 'success',
      message: `Calon KPM "${savedNewRecord.nama}" (${savedNewRecord.registerCode}) berhasil disimpan.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleDeleteKpm = (id: string) => {
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

    // Hapus seluruh foto KPM dari Google Drive agar tidak meninggalkan berkas yatim
    const docsToTrash: (KpmDocumentFile | undefined)[] = [
      target.documents.ktp,
      target.documents.kk,
      target.documents.penerima,
      target.documents.survey,
      ...(target.documents.rumah || []),
      ...(target.documents.lainnya || []),
    ];
    void Promise.allSettled(
      docsToTrash.filter((d): d is KpmDocumentFile => Boolean(d)).map((d) => removeDocumentFromDrive(d))
    );

    const now = new Date().toISOString();
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

    const nextHistory = [removedHistory, ...proposalHistory];
    const nextRecords = recalculateProposalRegisterCodes(
      records.filter((r) => r.id !== id),
      proposals,
      items,
      wilayahList
    );

    setProposalHistory(nextHistory);
    setRecords(nextRecords);

    if (supabaseReadyRef.current) {
      lastLocalSyncAtRef.current = Date.now();
      void deleteKpmRecordInSupabase(id)
        .then(() =>
          syncOperationalData({ records: nextRecords, proposalHistory: nextHistory }, 'delete')
        )
        .catch(() => {
          void syncOperationalData({ records: nextRecords, proposalHistory: nextHistory }, 'delete');
        });
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
      message: `Data calon KPM "${target.nama}" dan foto terkait telah dihapus.`,
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
      try {
        lastLocalSyncAtRef.current = Date.now();
        await updateKpmDocumentsInSupabase(updatedRecord, proposals, pengelolaList);
        await syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
        setFeedback({
          type: 'success',
          message: `${auditChange.field} berhasil diperbarui di Google Drive & Supabase.`,
        });
        return;
      } catch (err) {
        console.error('Supabase doc update failed:', err);
      }
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

  const handleUpdateKpmStatus = (id: string, status: ValidationStatus) => {
    if (!requirePermission('update', 'mengubah status validasi KPM')) return;
    const target = records.find((r) => r.id === id);
    if (!target || target.validasi === status) return;
    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const statusAudit: KpmAuditLogEntry = {
      id: `audit-st-${Date.now()}`,
      kpmId: target.id,
      action: 'status_changed',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: 'Status Validasi',
          before: formatValidationLabel(target.validasi),
          after: formatValidationLabel(status),
        },
      ],
    };

    const nextLogs = [statusAudit, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === id ? { ...r, validasi: status, updatedAt: now } : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
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

    const nextLogs = [auditEntry, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      r.id === kpmId
        ? {
            ...r,
            subItemDeliveries: {
              ...(r.subItemDeliveries || {}),
              [subItemKey]: {
                delivered: nextDelivered,
                updatedAt: now,
                updatedBy: currentActor.nama,
              },
            },
            updatedAt: now,
          }
        : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
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
    void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
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
        ? recalculateProposalRegisterCodes(mappedRecords, proposals, nextItems, wilayahList)
        : mappedRecords;
      setRecords(nextRecords);
    }

    setItems(nextItems);
    void syncOperationalData(
      { items: nextItems, records: nextRecords },
      originalCode ? 'update' : 'add'
    );
  };

  const handleDeleteCatalogItem = (tahun: string, code: string) => {
    if (!requirePermission('delete', 'menghapus master item')) return;
    const nextItems = items.filter((i) => !(i.tahun === tahun && i.code === code));
    setItems(nextItems);
    void syncOperationalData({ items: nextItems }, 'delete');
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
    void syncOperationalData({ items: nextItems }, 'update');
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

    setItems(nextItems);
    if (oldItem) setRecords(nextRecords);
    void syncOperationalData({ items: nextItems, records: nextRecords }, 'update');
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
    setItems(nextItems);
    void syncOperationalData({ items: nextItems }, 'add');
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
    setProposals(nextProposals);
    void syncOperationalData({ proposals: nextProposals }, 'add');

    if (addProposalFromKpmForm && newProposal.status === 'unlocked') {
      setPendingSelectedProposal({
        namaProposal: newProposal.namaProposal,
        tahun: newProposal.tahun,
      });
    } else {
      setPendingSelectedProposal(null);
    }

    setSelectedYear(newProposal.tahun);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const updatedRecords = records.map((rec) =>
        rec.proposal === existing.namaProposal && rec.tahun === existing.tahun
          ? { ...rec, tahun: values.tahun, updatedAt: now }
          : rec
      );
      nextRecords = recalculateProposalRegisterCodes(
        updatedRecords,
        nextProposals,
        items,
        wilayahList
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
      setProposalHistory(nextProposalHistory);
      setKpmAuditLogs(nextKpmAuditLogs);
    }

    setProposals(nextProposals);
    void syncOperationalData(
      {
        proposals: nextProposals,
        records: nextRecords,
        proposalHistory: nextProposalHistory,
        kpmAuditLogs: nextKpmAuditLogs,
      },
      'update'
    );

    setSubView('proposal-detail');
    setFeedback({
      type: 'success',
      message: `Proposal "${existing.namaProposal}" (${values.tahun}) berhasil diperbarui.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleProposalLock = (proposalId: string) => {
    if (!requirePermission('update', 'mengunci/membuka proposal')) return;
    const target = proposals.find((p) => p.id === proposalId);
    if (!target) return;

    const nextStatus = target.status === 'locked' ? 'unlocked' : 'locked';
    const nextProposals: ProposalRecord[] = proposals.map((p) =>
      p.id === proposalId
        ? {
            ...p,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
          }
        : p
    );
    setProposals(nextProposals);
    void syncOperationalData({ proposals: nextProposals }, 'update');
    setFeedback({
      type: 'success',
      message:
        nextStatus === 'locked'
          ? `Proposal "${target.namaProposal}" dikunci. Seluruh data proposal & KPM di dalamnya kini tidak dapat diedit.`
          : `Kunci proposal "${target.namaProposal}" dibuka. Data kembali dapat diedit.`,
    });
  };

  const handleDeleteProposal = (proposalId: string) => {
    if (!requirePermission('delete', 'menghapus proposal')) return;
    const target = proposals.find((p) => p.id === proposalId);
    if (!target) return;

    if (target.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${target.namaProposal}" sedang Terkunci. Buka kunci terlebih dahulu untuk menghapusnya.`,
      });
      return;
    }

    const docsToTrash = Object.values(target.documents || {}).filter(
      (d): d is KpmDocumentFile => Boolean(d)
    );
    if (docsToTrash.length > 0) {
      void Promise.allSettled(docsToTrash.map((d) => removeDocumentFromDrive(d)));
    }

    const nextProposals = proposals.filter((p) => p.id !== proposalId);
    setProposals(nextProposals);
    if (activeProposalId === proposalId) {
      setActiveProposalId(null);
      setSubView('none');
      setActiveTab('proposal');
    }
    void syncOperationalData({ proposals: nextProposals }, 'delete');
    setFeedback({
      type: 'success',
      message: `Proposal "${target.namaProposal}" (${target.tahun}) berhasil dihapus.`,
    });
  };

  const handleLogin = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (supabaseReadyRef.current) {
      try {
        const res = await supabaseLogin(email, password);
        if (!res.ok || !res.user) {
          return { ok: false, error: res.error || 'Email atau kata sandi tidak sesuai.' };
        }
        const [users, msgs] = await Promise.all([
          supabaseFetchInternalUsers(),
          supabaseFetchDirectMessages(),
        ]);
        const userMsgs = msgs.filter(
          (m) => m.senderId === res.user!.id || m.recipientId === res.user!.id
        );
        prevMessageIdsRef.current = new Set(userMsgs.map((m) => m.id));
        if (users.length > 0) setInternalUsers(users);
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
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        token?: string;
        user?: InternalUser;
        users?: InternalUser[];
        messages?: DirectChatMessage[];
      };
      if (!res.ok || !data.user || !data.token) {
        return { ok: false, error: data.error || 'Email atau kata sandi tidak sesuai.' };
      }

      if (Array.isArray(data.users)) {
        setInternalUsers(data.users);
      }
      if (Array.isArray(data.messages)) {
        setDirectMessages(data.messages);
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
    email: string;
    kontak: string;
    password: string;
    fotoDataUrl?: string;
    fotoThumbnailUrl?: string;
    fotoFileId?: string;
  }): Promise<{ ok: boolean; error?: string; message?: string }> => {
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
        setInternalUsers(freshUsers);
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
        setInternalUsers(data.users);
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
        setInternalUsers(freshUsers);
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
        setInternalUsers(data.users);
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
          setActiveKpmId(null);
          setFeedback({
            type: 'success',
            message: 'Seluruh data calon KPM dan log audit KPM telah dihapus.',
          });
        } else if (action === 'delete_all_proposal') {
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
          setActiveKpmId(null);
          setActiveProposalId(null);
          setFeedback({
            type: 'success',
            message: 'Seluruh data KPM, proposal, item, wilayah, pengelola, dan riwayat telah dihapus.',
          });
        } else if (action === 'reset_total') {
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
        setActiveKpmId(null);
        setFeedback({
          type: 'success',
          message: 'Seluruh data calon KPM dan log audit KPM telah dihapus.',
        });
      } else if (action === 'delete_all_proposal') {
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
        setActiveKpmId(null);
        setActiveProposalId(null);
        setFeedback({
          type: 'success',
          message: 'Seluruh data KPM, proposal, item, wilayah, pengelola, dan riwayat telah dihapus.',
        });
      } else if (action === 'reset_total') {
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
        setInternalUsers(freshUsers.length > 0 ? freshUsers : [res.user, ...internalUsers]);
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
        setInternalUsers(data.users);
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
    try {
      localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore
    }
  };

  const openChatView = (peerId?: string) => {
    setFeedback(null);
    setIncomingToast(null);
    setReturnToTab(activeTab);
    setActiveChatPeerId(peerId ?? null);
    setSubView('chat');
    if (peerId) {
      void handleMarkChatRead(peerId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProfileView = () => {
    setFeedback(null);
    setReturnToTab(activeTab);
    setSubView('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAcceptAllInProposal = (proposalName: string, tahun: string) => {
    if (!requirePermission('update', 'menyetujui seluruh KPM pada proposal')) return;
    const prop =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" sedang Terkunci.`,
      });
      return;
    }

    const targets = records.filter(
      (r) =>
        r.proposal === proposalName &&
        r.tahun === tahun &&
        (r.validasi === 'pending' || r.validasi === 'rejected')
    );
    if (targets.length === 0) return;

    const now = new Date().toISOString();
    const targetIds = new Set(targets.map((t) => t.id));
    const newLogs: KpmAuditLogEntry[] = targets.map((t, idx) => ({
      id: `audit-accall-${Date.now()}-${idx}`,
      kpmId: t.id,
      action: 'status_changed',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: t.proposal,
      tahun: t.tahun,
      changes: [
        {
          field: 'Status Validasi',
          before: formatValidationLabel(t.validasi),
          after: 'Diterima',
        },
      ],
    }));

    const nextLogs = [...newLogs, ...kpmAuditLogs];
    const nextRecords = records.map((r) =>
      targetIds.has(r.id) ? { ...r, validasi: 'accepted' as ValidationStatus, updatedAt: now } : r
    );
    setKpmAuditLogs(nextLogs);
    setRecords(nextRecords);
    void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
    setFeedback({
      type: 'success',
      message: `${targets.length} calon KPM pada "${proposalName}" (${tahun}) disetujui menjadi Diterima.`,
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
    void syncOperationalData({ records: nextRecords, kpmAuditLogs: nextLogs }, 'update');
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

    void syncOperationalData(
      anyRecordChanged ? { pekerjaanList: nextPekerjaan, records: nextRecords } : { pekerjaanList: nextPekerjaan },
      'update'
    );
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
    void syncOperationalData({ pekerjaanList: nextPekerjaan }, 'delete');
    setFeedback({
      type: 'success',
      message: `Pekerjaan "${name}" berhasil dihapus.`,
    });
  };

  const showBottomNav = subView === 'none' && !(activeTab === 'menu' && menuSection !== 'root');

  if ((sessionToken || supabaseReady) && !authReady && !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-xs">
          <MasdetaLogo />
          <p className="text-xs font-semibold text-slate-600">Memuat sesi MASDETA...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-200/70 sm:py-3">
        <OfflineIndicator />
        <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
          {supabaseSchemaMissing && !dismissedSchemaNotice && (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
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
            open={isUpdateModalOpen}
            onDismiss={() => setIsUpdateModalOpen(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200/70 sm:py-3">
      <OfflineIndicator />

      {supabaseSchemaMissing && !dismissedSchemaNotice && (
        <div className="mx-auto mb-2 w-full max-w-md px-3 sm:px-0">
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
        <div className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2">
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

      {/* Dedicated Mobile Viewport Shell with Pull-to-Refresh */}
      <PullToRefresh
        onRefresh={handleManualRefresh}
        disabled={
          subView === 'kpm-form' ||
          subView === 'add-proposal' ||
          subView === 'edit-proposal' ||
          subView === 'chat' ||
          Boolean(lightboxDoc) ||
          isQuickAddOpen ||
          isUpdateModalOpen
        }
      >
        <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
        {/* Sub-Views */}
        {subView === 'chat' && (
          <ChatView
            currentUser={currentUser}
            users={internalUsers}
            messages={directMessages}
            activePeerId={activeChatPeerId}
            onSelectPeer={(peerId) => {
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
              setActiveChatPeerId(null);
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'profile' && (
          <UserProfileView
            user={currentUser}
            pushEnabled={pushEnabled}
            pushPermission={pushPermission}
            onRequestPushPermission={handleRequestPushPermission}
            onTogglePushEnabled={handleTogglePushEnabled}
            onUpdateProfile={handleUpdateProfile}
            onLogout={handleLogout}
            onCheckAppUpdate={() => void handleManualCheckAppUpdate()}
            checkingAppUpdate={checkingAppUpdate}
            onBack={() => {
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
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
            auditLogs={kpmAuditLogs}
            currentUserId={currentUser.id}
            internalUsers={internalUsers}
            canUpdate={hasPermission('update')}
            canDelete={hasPermission('delete')}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
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
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEditRecord={(rec) => openKpmForm(rec, returnToTab, true)}
            onDeleteRecord={handleDeleteKpm}
            onUpdateStatus={handleUpdateKpmStatus}
            onToggleSubItem={handleToggleSubItem}
            onMarkAllSubItemsDelivered={handleMarkAllSubItemsDelivered}
            onShareToChat={handleShareKpmToChat}
            onSelectDuplicateRecord={(dup) => {
              setActiveKpmId(dup.id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProposal={(proposalName, tahun) =>
              handleOpenProposalDetailByName(proposalName, tahun)
            }
            onOpenFullHistory={() => {
              setSubView('kpm-history');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            onUpdateKpmDocuments={handleUpdateKpmDocuments}
          />
        )}

        {subView === 'kpm-history' && activeKpmRecord && (
          <HistoryDetailView
            mode="kpm"
            record={activeKpmRecord}
            kpmAuditLogs={kpmAuditLogs.filter((l) => l.kpmId === activeKpmRecord.id)}
            onBack={() => {
              setSubView('kpm-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'subitem-recap' && (
          <SubItemRecapView
            records={records}
            items={items}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            onBack={() => {
              setFeedback(null);
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectKpm={(rec) => openKpmDetail(rec, returnToTab, true)}
          />
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
              wilayahList={wilayahList}
              feedback={feedback}
              onDismissFeedback={() => setFeedback(null)}
              preselectedProposal={pendingSelectedProposal}
              lockedProposalScope={lockedKpmProposalScope}
              onClearPreselectedProposal={() => setPendingSelectedProposal(null)}
              onBack={() => {
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
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenAddProposal={() => openAddProposalForm('kpm', true)}
              onCreatePengelola={handleCreatePengelola}
              onSave={handleSaveKpm}
              onQuickSyncKpmDocuments={handleQuickSyncKpmDocuments}
              onCancelEdit={() => {
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
              }}
              onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            />
          </div>
        )}

        {subView === 'add-proposal' && (
          <AddProposalForm
            existingProposals={proposals}
            wilayahList={wilayahList}
            onBack={() => {
              setFeedback(null);
              if (addProposalFromKpmForm) {
                setAddProposalFromKpmForm(false);
                setSubView('kpm-form');
              } else {
                setSubView('none');
                setActiveTab(returnToTab);
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveNewProposal={handleCreateProposal}
          />
        )}

        {subView === 'proposal-detail' && activeProposal && (
          <ProposalDetailView
            proposal={activeProposal}
            records={records}
            items={items}
            historyEntries={proposalHistory}
            canAdd={hasPermission('add')}
            canUpdate={hasPermission('update')}
            onBack={() => {
              setFeedback(null);
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEditProposal={(id) => openEditProposalById(id, returnToTab)}
            onAddKpmInProposal={(proposalName, tahun) => {
              openKpmForm(null, returnToTab, false, true, {
                namaProposal: proposalName,
                tahun,
              });
            }}
            onViewKpmInProposal={(proposalName, tahun) => {
              setSelectedYear(tahun);
              setKpmStatusFilter('all');
              setKpmItemFilter('all');
              setKpmProposalFilter(proposalName);
              setKpmOpenedFromProposalDetail(true);
              setSubView('none');
              setActiveTab('kpm');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onAcceptAllKpm={handleAcceptAllInProposal}
            onOpenFullHistory={() => {
              setSubView('proposal-history');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
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
              setSubView('proposal-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'edit-proposal' && activeProposal && (
          <ProposalForm
            proposal={activeProposal}
            existingProposals={proposals}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              setFeedback(null);
              setSubView('proposal-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveProposal={handleUpdateProposal}
            onQuickSyncProposalDocuments={handleQuickSyncProposalDocuments}
            onToggleProposalLock={handleToggleProposalLock}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}

        {/* Top-Level Main Tabs */}
        {subView === 'none' && activeTab === 'dashboard' && (
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
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onOpenChat={() => openChatView()}
            onOpenProfile={openProfileView}
            onLogout={handleLogout}
            onOpenKpmList={(filter) => {
              setKpmStatusFilter(filter?.status ?? 'all');
              setKpmItemFilter(filter?.item ?? 'all');
              setKpmProposalFilter('all');
              setKpmOpenedFromProposalDetail(false);
              setActiveTab('kpm');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenKpmDetail={(rec) => openKpmDetail(rec, 'dashboard')}
            onOpenSubItemRecap={() => openSubItemRecap('dashboard')}
            onOpenProposalList={() => {
              setActiveTab('proposal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'dashboard')}
            onOpenAddProposal={() => openAddProposalForm('dashboard')}
            onOpenUserApproval={() => {
              setMenuOpenedFromDashboard(true);
              setMenuSection('users');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenDuplicateCheck={() => {
              setMenuOpenedFromDashboard(true);
              setMenuSection('duplikasi');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenArsip={() => {
              setMenuOpenedFromDashboard(true);
              setMenuSection('arsip');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenDtsen={() => {
              setMenuOpenedFromDashboard(true);
              setMenuSection('dtsen');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenAdministrasi={() => {
              setMenuOpenedFromDashboard(true);
              setMenuSection('administrasi');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'none' && activeTab === 'kpm' && (
          <KpmListView
            records={records}
            proposals={proposals}
            items={items}
            wilayahList={wilayahList}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            statusFilter={kpmStatusFilter}
            onChangeStatusFilter={setKpmStatusFilter}
            itemFilter={kpmItemFilter}
            onChangeItemFilter={setKpmItemFilter}
            proposalFilter={kpmProposalFilter}
            onChangeProposalFilter={setKpmProposalFilter}
            canDelete={hasPermission('delete')}
            onBack={() => {
              if (kpmOpenedFromProposalDetail && activeProposal) {
                setKpmOpenedFromProposalDetail(false);
                setSubView('proposal-detail');
              } else {
                setActiveTab('dashboard');
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onCreateNew={() => openKpmForm(null, 'kpm')}
            onSelectRecord={(rec) => openKpmDetail(rec, 'kpm')}
            onDeleteRecord={handleDeleteKpm}
          />
        )}

        {subView === 'none' && activeTab === 'proposal' && (
          <ProposalListView
            proposals={proposals}
            records={records}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            canUpdate={hasPermission('update')}
            canDelete={hasPermission('delete')}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'proposal')}
            onToggleProposalLock={handleToggleProposalLock}
            onDeleteProposal={handleDeleteProposal}
          />
        )}

        {subView === 'none' && activeTab === 'menu' && (
          <MenuHubView
            activeSection={menuSection}
            onChangeSection={(section) => {
              setSelectedPengelolaDrill(null);
              setSelectedPekerjaanDrill(null);
              if (section !== 'users' && section !== 'superadmin') {
                setUsersOpenedFromSuperAdmin(false);
              }
              if (section === 'root' && menuOpenedFromDashboard) {
                setMenuOpenedFromDashboard(false);
                setMenuSection('root');
                setActiveTab('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
              }
              setMenuSection(section);
            }}
            selectedPengelolaDrill={selectedPengelolaDrill}
            onSelectPengelolaDrill={setSelectedPengelolaDrill}
            selectedPekerjaanDrill={selectedPekerjaanDrill}
            onSelectPekerjaanDrill={setSelectedPekerjaanDrill}
            usersOpenedFromSuperAdmin={usersOpenedFromSuperAdmin}
            onChangeUsersOpenedFromSuperAdmin={setUsersOpenedFromSuperAdmin}
            currentUser={currentUser}
            unreadChatCount={unreadChatCount}
            records={records}
            proposals={proposals}
            items={items}
            pekerjaanList={pekerjaanList}
            pengelolaList={pengelolaList}
            wilayahList={wilayahList}
            internalUsers={internalUsers}
            onOpenChat={(peerId) => openChatView(peerId)}
            onOpenProfile={openProfileView}
            onCheckAppUpdate={() => void handleManualCheckAppUpdate()}
            checkingAppUpdate={checkingAppUpdate}
            onSaveItem={handleSaveCatalogItem}
            onDeleteItem={handleDeleteCatalogItem}
            onMoveItemOrder={handleMoveItemOrder}
            onUpdateItemSubItems={handleUpdateItemSubItems}
            onCopyItemsFromYear={handleCopyItemsFromYear}
            onAddPekerjaan={(job) => {
              if (!requirePermission('add', 'menambah daftar pekerjaan')) return;
              const nextPekerjaan = [...pekerjaanList, job];
              setPekerjaanList(nextPekerjaan);
              void syncOperationalData({ pekerjaanList: nextPekerjaan }, 'add');
            }}
            onUpdatePekerjaan={handleUpdatePekerjaan}
            onDeletePekerjaan={handleDeletePekerjaan}
            onUpdateWilayahList={(nextList) => {
              if (!requirePermission('update', 'mengubah data wilayah')) return;
              setWilayahList(nextList);
              void syncOperationalData({ wilayahList: nextList }, 'update');
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
          />
        )}
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
          onSelectTab={(tab) => {
            setFeedback(null);
            setMenuOpenedFromDashboard(false);
            if (tab === 'menu') {
              setMenuSection('root');
              setUsersOpenedFromSuperAdmin(false);
              setSelectedPengelolaDrill(null);
              setSelectedPekerjaanDrill(null);
            }
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

      {/* In-App Android APK Auto-Updater Modal */}
      <AppUpdateModal
        updateInfo={appUpdateInfo}
        open={isUpdateModalOpen}
        onDismiss={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
}
