import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
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
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalFormValues,
  ProposalKpmHistoryEntry,
  ProposalRecord,
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
  recalculateProposalRegisterCodes,
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
import { MenuHubView, MenuSection } from './components/MenuHubView';
import { HistoryDetailView } from './components/HistoryDetailView';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { AuthView } from './components/AuthView';
import { ChatView } from './components/ChatView';
import { UserProfileView } from './components/UserProfileView';

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

const SESSION_STORAGE_KEY = 'masdeta_session_user_id_v1';
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
  const [addProposalFromKpmForm, setAddProposalFromKpmForm] = useState(false);
  const [menuSection, setMenuSection] = useState<MenuSection>('root');
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
  const [items, setItems] = useState<ItemBantuan[]>(() => loadItemList(INITIAL_ITEM_LIST));
  const [pekerjaanList, setPekerjaanList] = useState<string[]>(() =>
    loadPekerjaanList(PEKERJAAN_OPTIONS)
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

  const wsRef = useRef<WebSocket | null>(null);
  const subViewRef = useRef<SubView>(subView);
  const activeChatPeerIdRef = useRef<string | null>(activeChatPeerId);
  const pushEnabledRef = useRef<boolean>(pushEnabled);
  subViewRef.current = subView;
  activeChatPeerIdRef.current = activeChatPeerId;
  pushEnabledRef.current = pushEnabled;

  const currentUser = useMemo(() => {
    if (!sessionUserId) return null;
    return internalUsers.find((u) => u.id === sessionUserId && u.status === 'active') ?? null;
  }, [internalUsers, sessionUserId]);

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
  }, [records]);

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

  // Sinkronisasi awal state user & pesan 1-on-1 dari server
  useEffect(() => {
    let cancelled = false;
    const url = sessionUserId
      ? `/api/collab/state?userId=${encodeURIComponent(sessionUserId)}`
      : '/api/collab/state';

    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Sync gagal'))))
      .then(
        (data: {
          user?: InternalUser | null;
          users?: InternalUser[];
          messages?: DirectChatMessage[];
        }) => {
          if (cancelled) return;
          if (Array.isArray(data.users) && data.users.length > 0) {
            setInternalUsers(data.users);
          }
          if (Array.isArray(data.messages)) {
            setDirectMessages(data.messages);
          }
          if (sessionUserId && (!data.user || data.user.status !== 'active')) {
            setSessionUserId(null);
            try {
              localStorage.removeItem(SESSION_STORAGE_KEY);
            } catch {
              // Ignore
            }
          }
        }
      )
      .catch(() => {
        // Fallback ke cache lokal bila offline
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

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

      try {
        await fetch('/api/chat/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, peerId }),
        });
      } catch {
        // Abaikan jika offline sementara
      }
    },
    [currentUser, directMessages]
  );

  // Koneksi WebSocket Real-time (Presence Dot & 1-on-1 Direct Chat Push)
  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) {
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
        socket.send(JSON.stringify({ type: 'auth', userId: uid }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (data.type === 'users:updated' && Array.isArray(data.users)) {
            setInternalUsers(data.users as InternalUser[]);
            return;
          }

          if (data.type === 'chat:message' && data.message) {
            const msg = data.message as DirectChatMessage;
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
                fetch('/api/chat/read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: uid, peerId: msg.senderId }),
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
                  text: msg.text,
                });
                if (toastTimer) window.clearTimeout(toastTimer);
                toastTimer = window.setTimeout(() => {
                  setIncomingToast((curr) => (curr?.id === msg.id ? null : curr));
                }, 6500);

                if (pushEnabledRef.current) {
                  void triggerPushNotification(
                    `Pesan dari ${senderName} (${senderRole})`,
                    msg.text
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
  }, [currentUser?.id]);

  // Pelacak Aktivitas Otomatis untuk Presence Dot (Hijau = Aktif, Oranye = Idle)
  useEffect(() => {
    if (!currentUser || currentUser.presenceManual) return;

    let idleTimer: number | undefined;
    let lastSent: UserPresenceStatus | null = null;

    const sendPresence = (status: UserPresenceStatus) => {
      if (lastSent === status) return;
      lastSent = status;
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

  // Matikan tombol back bawaan Android / browser agar semua navigasi berasal dari UI dalam aplikasi
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
    };

    const handleCordovaBack = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    const handleIonBack = (ev: Event) => {
      const customEv = ev as CustomEvent<{
        register?: (priority: number, handler: () => void) => void;
      }>;
      if (customEv.detail?.register) {
        customEv.detail.register(999, () => {});
      } else {
        ev.preventDefault();
      }
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('backbutton', handleCordovaBack, false);
    document.addEventListener('ionBackButton', handleIonBack);

    let capListenerHandle: { remove?: () => void } | undefined;
    const capApp = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            App?: {
              addListener?: (
                eventName: string,
                cb: () => void
              ) => Promise<{ remove: () => void }> | { remove: () => void };
            };
          };
        };
      }
    ).Capacitor?.Plugins?.App;

    if (capApp?.addListener) {
      const maybePromise = capApp.addListener('backButton', () => {
        // Sengaja dikosongkan agar tombol back Android tidak keluar/kembali
      });
      if (
        maybePromise &&
        typeof (maybePromise as Promise<{ remove: () => void }>).then === 'function'
      ) {
        (maybePromise as Promise<{ remove: () => void }>).then((handle) => {
          capListenerHandle = handle;
        });
      } else {
        capListenerHandle = maybePromise as { remove?: () => void };
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('backbutton', handleCordovaBack, false);
      document.removeEventListener('ionBackButton', handleIonBack);
      capListenerHandle?.remove?.();
    };
  }, []);

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
    if (sourceLabel !== 'Kecamatan Pontianak Kota 2026.csv' && !requirePermission('add', 'mengimpor data CSV')) {
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
      setProposals(result.nextProposals);
      setPengelolaList(result.nextPengelolaList);
      setPekerjaanList(result.nextPekerjaanList);
      setRecords(result.nextRecords);
      if (result.newAuditLogs.length > 0) {
        setKpmAuditLogs((prev) => [...result.newAuditLogs, ...prev]);
      }
      if (result.newProposalHistory.length > 0) {
        setProposalHistory((prev) => [...result.newProposalHistory, ...prev]);
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

  const seedCsvAttemptedRef = useRef(false);

  useEffect(() => {
    if (seedCsvAttemptedRef.current) return;
    seedCsvAttemptedRef.current = true;

    const SEED_FLAG_KEY = 'masdeta_csv_seed_ptk_kota_2026_v1';
    try {
      if (localStorage.getItem(SEED_FLAG_KEY) === 'done') return;
    } catch {
      // Ignore storage access errors
    }

    let cancelled = false;
    fetch('/assets/aistudio/Kecamatan_Pontianak_Kota_2026_ab18452d.csv')
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('CSV tidak ditemukan'))))
      .then((csvText) => {
        if (cancelled || !csvText) return;
        const summary = handleImportCsv(csvText, 'Kecamatan Pontianak Kota 2026.csv');
        if (summary.importedRecords > 0 || summary.skipped > 0) {
          try {
            localStorage.setItem(SEED_FLAG_KEY, 'done');
          } catch {
            // Ignore storage access errors
          }
        }
      })
      .catch(() => {
        // Ignore seed fetch failure silently
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openKpmDetail = (
    record: KpmRecord,
    fromTab: MainTab = activeTab,
    fromRecap = false
  ) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmDetailReturnToRecap(fromRecap);
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
      setProposals((prev) => [created, ...prev]);
      openProposalDetailById(created.id, returnToTab);
    }
  };

  const handleCreatePengelola = (profile: PengelolaProfile) => {
    if (!requirePermission('add', 'menambah pengelola lapangan')) return;
    setPengelolaList((prev) => [profile, ...prev]);
  };

  const handleSaveKpm = (values: KpmFormValues, editingId?: string) => {
    if (editingId) {
      if (!requirePermission('update', 'memperbarui data calon KPM')) return;
    } else {
      if (!requirePermission('add', 'menyimpan calon KPM baru')) return;
    }

    const matchingProposal =
      proposals.find((p) => p.namaProposal === values.proposal && p.tahun === values.tahun) ??
      proposals.find((p) => p.namaProposal === values.proposal);

    if (matchingProposal?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${matchingProposal.namaProposal}" berstatus Terkunci. Data KPM tidak dapat ditambahkan atau diubah.`,
      });
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      const previousRecord = records.find((r) => r.id === editingId);
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
          return;
        }

        // Field-level diff audit log for this KPM
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
          setKpmAuditLogs((prev) => [auditEntry, ...prev]);
        }

        // Track proposal move history if proposal or tahun changed
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
          setProposalHistory((prev) => [moveInEntry, moveOutEntry, ...prev]);
        }
      }

      setRecords((prev) => {
        const mapped = prev.map((rec) =>
          rec.id === editingId
            ? {
                ...rec,
                ...values,
                validasi: values.validasi || rec.validasi,
                updatedAt: now,
              }
            : rec
        );
        return recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList);
      });
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
      return;
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

    setRecords(nextRecordsList);
    setKpmAuditLogs((prev) => [createdAuditEntry, ...prev]);
    setProposalHistory((prev) => [enteredHistory, ...prev]);
    setPendingSelectedProposal(null);
    setLockedKpmProposalScope(null);
    setSelectedYear(savedNewRecord.tahun);
    setActiveKpmId(savedNewRecord.id);
    setKpmDetailReturnToRecap(false);
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

    setProposalHistory((prev) => [removedHistory, ...prev]);
    setRecords((prev) =>
      recalculateProposalRegisterCodes(
        prev.filter((r) => r.id !== id),
        proposals,
        items,
        wilayahList
      )
    );
    if (activeKpmId === id) {
      setActiveKpmId(null);
      setSubView('none');
      setActiveTab('kpm');
    }
    setFeedback({
      type: 'success',
      message: `Data calon KPM "${target.nama}" telah dihapus.`,
    });
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

    setKpmAuditLogs((prev) => [statusAudit, ...prev]);
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, validasi: status, updatedAt: now } : r))
    );
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

    setKpmAuditLogs((prev) => [auditEntry, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
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
      )
    );
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

    setKpmAuditLogs((prev) => [auditEntry, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === kpmId
          ? {
              ...r,
              subItemDeliveries: nextDeliveries,
              updatedAt: now,
            }
          : r
      )
    );
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
    setItems((prev) => {
      const codeToRemove = originalCode || savedItem.code;
      const remaining = prev.filter(
        (i) => !(i.tahun === savedItem.tahun && i.code === codeToRemove)
      );
      const otherYears = remaining.filter((i) => i.tahun !== savedItem.tahun);
      const sameYear = remaining.filter((i) => i.tahun === savedItem.tahun);
      const clampedIndex = Math.max(0, Math.min(orderIndex, sameYear.length));
      const reorderedSameYear = [
        ...sameYear.slice(0, clampedIndex),
        savedItem,
        ...sameYear.slice(clampedIndex),
      ];
      return [...otherYears, ...reorderedSameYear];
    });
  };

  const handleDeleteCatalogItem = (tahun: string, code: string) => {
    if (!requirePermission('delete', 'menghapus master item')) return;
    setItems((prev) => prev.filter((i) => !(i.tahun === tahun && i.code === code)));
  };

  const handleMoveItemOrder = (tahun: string, code: string, direction: 'up' | 'down') => {
    if (!requirePermission('update', 'mengubah urutan item')) return;
    setItems((prev) => {
      const yearIndices: number[] = [];
      prev.forEach((item, idx) => {
        if (item.tahun === tahun) yearIndices.push(idx);
      });
      const pos = yearIndices.findIndex((idx) => prev[idx].code === code);
      if (pos < 0) return prev;
      const targetPos = direction === 'up' ? pos - 1 : pos + 1;
      if (targetPos < 0 || targetPos >= yearIndices.length) return prev;
      const next = [...prev];
      const idxA = yearIndices[pos];
      const idxB = yearIndices[targetPos];
      [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
      return next;
    });
  };

  const handleUpdateItemSubItems = (tahun: string, code: string, subItems: string[]) => {
    if (!requirePermission('update', 'mengubah sub-item bantuan')) return;
    setItems((prev) =>
      prev.map((i) =>
        i.tahun === tahun && i.code === code
          ? { ...i, subItems }
          : i
      )
    );
  };

  const handleCopyItemsFromYear = (fromYear: string, toYear: string) => {
    if (!requirePermission('add', 'menyalin item antar tahun')) return;
    setItems((prev) => {
      const source = prev.filter((i) => i.tahun === fromYear);
      const existingCodes = new Set(prev.filter((i) => i.tahun === toYear).map((i) => i.code));
      const additions = source
        .filter((s) => !existingCodes.has(s.code))
        .map((s) => ({
          ...s,
          id: `${toYear}-${s.code}`,
          tahun: toYear,
          subItems: [...s.subItems],
        }));
      return [...prev, ...additions];
    });
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

    setProposals((prev) => [newProposal, ...prev]);

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
    setProposals((prev) =>
      prev.map((p) =>
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
      )
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
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    setFeedback({
      type: 'success',
      message:
        nextStatus === 'locked'
          ? `Proposal "${target.namaProposal}" dikunci. Seluruh data proposal & KPM di dalamnya kini tidak dapat diedit.`
          : `Kunci proposal "${target.namaProposal}" dibuka. Data kembali dapat diedit.`,
    });
  };

  const handleLogin = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: InternalUser;
        users?: InternalUser[];
        messages?: DirectChatMessage[];
      };
      if (!res.ok || !data.user) {
        return { ok: false, error: data.error || 'Email atau kata sandi tidak sesuai.' };
      }

      if (Array.isArray(data.users)) {
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
  }): Promise<{ ok: boolean; error?: string; message?: string }> => {
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
      setInternalUsers((prev) => [data.user as InternalUser, ...prev.filter((u) => u.id !== data.user?.id)]);
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

  const handleLogout = async () => {
    const uid = currentUser?.id;
    if (uid) {
      fetch(`/api/users/${encodeURIComponent(uid)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceManual: false, presenceStatus: 'offline' }),
      }).catch(() => {});
    }
    wsRef.current?.close();
    wsRef.current = null;
    setSessionUserId(null);
    setDirectMessages([]);
    setActiveChatPeerId(null);
    setSubView('none');
    setActiveTab('dashboard');
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handleUpdateProfile = async (patch: {
    nama: string;
    jabatan: string;
    kontak: string;
    fotoDataUrl?: string | null;
    newPassword?: string;
    presenceManual: boolean;
    presenceStatus: UserPresenceStatus;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak ditemukan.' };
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string; user?: InternalUser };
      if (!res.ok || !data.user) {
        return { ok: false, error: data.error || 'Gagal memperbarui profil.' };
      }
      setInternalUsers((prev) =>
        prev.map((u) => (u.id === data.user?.id ? data.user : u))
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
    }
  ) => {
    if (!currentUser || currentUser.role !== 'SuperAdmin') {
      setFeedback({
        type: 'error',
        message: 'Hanya SuperAdmin yang dapat mengatur status, peran, dan izin Admin.',
      });
      return;
    }

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/admin-control`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: currentUser.id, ...patch }),
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

  const handleRegisterInternalUser = async (user: {
    nama: string;
    email: string;
    jabatan: string;
    kontak: string;
    role: InternalUserRole;
  }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, password: 'masdeta123' }),
      });
      const data = (await res.json()) as { error?: string; user?: InternalUser };
      if (!res.ok || !data.user) {
        setFeedback({ type: 'error', message: data.error || 'Gagal menambahkan user baru.' });
        return;
      }
      setInternalUsers((prev) => [data.user as InternalUser, ...prev]);

      if (currentUser?.role === 'SuperAdmin') {
        await handleAdminControlUser(data.user.id, {
          status: 'active',
          role: user.role,
          permissions: { add: true, update: true, delete: false },
        });
      }
      setFeedback({
        type: 'success',
        message: `Akun "${user.nama}" (${user.email}) ditambahkan dengan kata sandi awal: masdeta123`,
      });
    } catch {
      setFeedback({ type: 'error', message: 'Gagal terhubung ke server.' });
    }
  };

  const handleSendChatMessage = async (recipientId: string, text: string) => {
    if (!currentUser) return;
    const clientMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: clientMsgId,
        senderId: currentUser.id,
        recipientId,
        text,
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

    setKpmAuditLogs((prev) => [...newLogs, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
        targetIds.has(r.id) ? { ...r, validasi: 'accepted', updatedAt: now } : r
      )
    );
    setFeedback({
      type: 'success',
      message: `${targets.length} calon KPM pada "${proposalName}" (${tahun}) disetujui menjadi Diterima.`,
    });
  };

  const handleToggleBerkasDikembalikan = (kpmId: string, nextValue: boolean) => {
    if (!requirePermission('update', 'mengubah status pengembalian berkas')) return;
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;
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

    setKpmAuditLogs((prev) => [auditEntry, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === kpmId
          ? {
              ...r,
              berkasDikembalikan: nextValue,
              berkasDikembalikanAt: nextValue ? now : undefined,
              berkasDikembalikanBy: nextValue ? currentActor.nama : undefined,
              updatedAt: now,
            }
          : r
      )
    );
  };

  const showBottomNav = subView === 'none' && !(activeTab === 'menu' && menuSection !== 'root');

  if (sessionUserId && !authReady && !currentUser) {
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
          <AuthView
            logo={<MasdetaLogo />}
            onLogin={handleLogin}
            onRegister={handleRegister}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200/70 sm:py-3">
      <OfflineIndicator />

      {/* Global Feedback Banner for views without inline feedback slot */}
      {feedback &&
        subView !== 'kpm-detail' &&
        subView !== 'kpm-form' &&
        subView !== 'edit-proposal' &&
        !(subView === 'none' && activeTab === 'dashboard') && (
          <div className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2">
            <div
              role="status"
              className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs shadow-lg ${
                feedback.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <p className="font-medium leading-snug">{feedback.message}</p>
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

      {/* Dedicated Mobile Viewport Shell */}
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
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              setFeedback(null);
              setActiveKpmId(null);
              if (kpmDetailReturnToProposalDetail && activeProposal) {
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
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              setFeedback(null);
              setSubView('proposal-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveProposal={handleUpdateProposal}
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
            onOpenKpmList={(filter) => {
              setKpmStatusFilter(filter?.status ?? 'all');
              setKpmItemFilter(filter?.item ?? 'all');
              setKpmProposalFilter('all');
              setKpmOpenedFromProposalDetail(false);
              setActiveTab('kpm');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenSubItemRecap={() => openSubItemRecap('dashboard')}
            onOpenProposalList={() => {
              setActiveTab('proposal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'dashboard')}
            onOpenAddProposal={() => openAddProposalForm('dashboard')}
            onOpenUserApproval={() => {
              setMenuSection('users');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenDuplicateCheck={() => {
              setMenuSection('duplikasi');
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
          />
        )}

        {subView === 'none' && activeTab === 'proposal' && (
          <ProposalListView
            proposals={proposals}
            records={records}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'proposal')}
          />
        )}

        {subView === 'none' && activeTab === 'menu' && (
          <MenuHubView
            activeSection={menuSection}
            onChangeSection={setMenuSection}
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
            onSaveItem={handleSaveCatalogItem}
            onDeleteItem={handleDeleteCatalogItem}
            onMoveItemOrder={handleMoveItemOrder}
            onUpdateItemSubItems={handleUpdateItemSubItems}
            onCopyItemsFromYear={handleCopyItemsFromYear}
            onAddPekerjaan={(job) => {
              if (!requirePermission('add', 'menambah daftar pekerjaan')) return;
              setPekerjaanList((prev) => [...prev, job]);
            }}
            onUpdateWilayahList={(nextList) => {
              if (!requirePermission('update', 'mengubah data wilayah')) return;
              setWilayahList(nextList);
            }}
            onOpenAddProposal={() => openAddProposalForm('menu')}
            onOpenSubItemRecap={() => openSubItemRecap('menu')}
            onAddPengelola={handleCreatePengelola}
            onAdminControlUser={handleAdminControlUser}
            onRegisterInternalUser={handleRegisterInternalUser}
            onImportCsv={handleImportCsv}
            onSelectKpm={(rec) => openKpmDetail(rec, 'menu')}
            onToggleBerkasDikembalikan={handleToggleBerkasDikembalikan}
            onSelectKpmFromDuplicate={(rec) => openKpmDetail(rec, 'menu')}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}
      </div>

      {/* Floating Scroll-To-Top Hover Button */}
      <ScrollToTopButton hasBottomNav={showBottomNav} />

      {/* Bottom Navigation Bar with Central Circular Add Button */}
      {showBottomNav && (
        <BottomNavBar
          activeTab={activeTab}
          pendingUsersCount={currentUser.role === 'SuperAdmin' ? pendingUsersCount : 0}
          unreadChatCount={unreadChatCount}
          onSelectTab={(tab) => {
            setFeedback(null);
            if (tab === 'menu') setMenuSection('root');
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
    </div>
  );
}
