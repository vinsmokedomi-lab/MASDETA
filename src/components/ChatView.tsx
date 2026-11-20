import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  Edit3,
  Search,
  Send,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { DirectChatMessage, InternalUser, KpmRecord, SharedKpmCard } from '../types/kpm';
import { getPrimaryKpmPhoto } from '../utils/imageProcessor';
import { DriveImage } from './DriveImage';
import { PresenceDot, getPresenceMeta } from './PresenceDot';
import { isNativeAppPlatform, useIsDesktopWeb } from '../utils/platform';
import { getPushSupportMeta, usePWAInstall } from '../utils/pwaPush';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface ChatViewProps {
  currentUser: InternalUser;
  users: InternalUser[];
  userAliases?: Record<string, string>;
  onSaveUserAlias?: (userId: string, alias: string) => void;
  messages: DirectChatMessage[];
  records?: KpmRecord[];
  activePeerId: string | null;
  onSelectPeer: (peerId: string | null) => void;
  onSendMessage: (recipientId: string, text: string, sharedKpm?: SharedKpmCard) => Promise<void>;
  onMarkConversationRead: (peerId: string) => void;
  onOpenSharedKpm?: (kpmId: string) => void;
  pushPermission: NotificationPermission | 'unsupported';
  onRequestPushPermission: () => Promise<void>;
  onBack: () => void;
}

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatRelativeActiveTime(iso?: string, status?: InternalUser['presenceStatus']): string {
  if (!iso) {
    return status === 'online' ? 'Baru saja' : 'Belum tercatat';
  }
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) {
    return status === 'online' ? 'Baru saja' : 'Belum tercatat';
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function ChatView({
  currentUser,
  users,
  userAliases = {},
  onSaveUserAlias,
  messages,
  records = [],
  activePeerId,
  onSelectPeer,
  onSendMessage,
  onMarkConversationRead,
  onOpenSharedKpm,
  pushPermission,
  onRequestPushPermission,
  onBack,
}: ChatViewProps) {
  const { isOffline } = useOfflineStatus();
  const isNativeApp = isNativeAppPlatform();
  const isDesktopWeb = useIsDesktopWeb();
  const pushMeta = getPushSupportMeta();
  const { canPromptInstall, promptInstall } = usePWAInstall();
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [, setTimeTick] = useState(0);
  const [renameTargetUser, setRenameTargetUser] = useState<InternalUser | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const renderWebPushBanner = (compact: boolean) => {
    if (pushMeta.isNative) return null;

    if (pushMeta.requiresIosHomeScreenInstall) {
      return (
        <div
          className={`flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 ${
            compact ? 'px-3 py-2 text-[11px]' : 'rounded-2xl px-4 py-3 text-xs'
          }`}
        >
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="leading-snug">
            <strong>Pengguna iPhone/iOS:</strong> Ketuk <strong>Bagikan</strong> lalu pilih{' '}
            <strong>Tambah ke Layar Utama</strong> agar push notifikasi chat masuk saat Safari ditutup.
          </p>
        </div>
      );
    }

    if (pushPermission === 'default') {
      return (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 ${
            compact ? 'px-3 py-2' : 'rounded-2xl px-4 py-3'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-teal-700" />
            <p className={`${compact ? 'truncate text-[11px]' : 'text-xs'} font-medium text-teal-900`}>
              Aktifkan Push Notification agar pesan masuk saat browser diminimalkan.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestPushPermission}
            className="min-h-[32px] shrink-0 rounded-lg bg-teal-700 px-3 text-[11px] font-bold text-white hover:bg-teal-800"
          >
            Aktifkan
          </button>
        </div>
      );
    }

    if (canPromptInstall) {
      return (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 ${
            compact ? 'px-3 py-2' : 'rounded-2xl px-4 py-3'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Download className="h-4 w-4 shrink-0 text-teal-700" />
            <p className={`${compact ? 'truncate text-[11px]' : 'text-xs'} font-medium text-slate-700`}>
              Pasang MASDETA ke Layar Utama (PWA) untuk akses &amp; notifikasi lebih andal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="min-h-[32px] shrink-0 rounded-lg border border-teal-700 bg-white px-2.5 text-[11px] font-bold text-teal-800 hover:bg-teal-50"
          >
            Pasang
          </button>
        </div>
      );
    }

    return null;
  };

  const getPeerDisplayName = (u: InternalUser): string => {
    const alias = (userAliases[u.id] || '').trim();
    return alias || u.nama;
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      setTimeTick((n) => (n + 1) % 10000);
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const peers = useMemo(() => {
    const isPrimaryDomi = currentUser.email.toLowerCase() === 'vinsmoke.domi@gmail.com';
    return users
      .filter((u) => {
        if (u.id === currentUser.id || u.status !== 'active') return false;
        if (
          isPrimaryDomi &&
          u.email.toLowerCase() === 'la.qsas@gmail.com' &&
          u.presenceStatus === 'offline' &&
          !u.fotoDataUrl &&
          !messages.some(
            (m) =>
              (m.senderId === currentUser.id && m.recipientId === u.id) ||
              (m.senderId === u.id && m.recipientId === currentUser.id)
          )
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.role === 'SuperAdmin' && b.role !== 'SuperAdmin') return -1;
        if (b.role === 'SuperAdmin' && a.role !== 'SuperAdmin') return 1;
        const pOrder = { online: 0, idle: 1, offline: 2 };
        const pDiff = (pOrder[a.presenceStatus] ?? 2) - (pOrder[b.presenceStatus] ?? 2);
        if (pDiff !== 0) return pDiff;
        const aName = (userAliases[a.id] || '').trim() || a.nama;
        const bName = (userAliases[b.id] || '').trim() || b.nama;
        return aName.localeCompare(bName, 'id');
      });
  }, [users, currentUser.id, currentUser.email, messages, userAliases]);

  const activePeer = useMemo(
    () => (activePeerId ? users.find((u) => u.id === activePeerId) ?? null : null),
    [users, activePeerId]
  );

  const threadMessages = useMemo(() => {
    if (!activePeer) return [];
    return messages
      .filter(
        (m) =>
          (m.senderId === currentUser.id && m.recipientId === activePeer.id) ||
          (m.senderId === activePeer.id && m.recipientId === currentUser.id)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages, currentUser.id, activePeer]);

  useEffect(() => {
    if (activePeer) {
      onMarkConversationRead(activePeer.id);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activePeer?.id, threadMessages.length]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (isOffline || !activePeer || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    await onSendMessage(activePeer.id, text);
    setSending(false);
  };

  const openRenameModal = (target: InternalUser) => {
    setRenameTargetUser(target);
    setRenameDraft((userAliases[target.id] || '').trim());
  };

  const handleSaveRename = (e: FormEvent) => {
    e.preventDefault();
    if (!renameTargetUser || !onSaveUserAlias) return;
    onSaveUserAlias(renameTargetUser.id, renameDraft.trim());
    setRenameTargetUser(null);
  };

  const renderRenameModal = () => {
    if (!renameTargetUser || !onSaveUserAlias) return null;
    const currentAlias = (userAliases[renameTargetUser.id] || '').trim();
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
        onClick={() => setRenameTargetUser(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Ubah nama tampilan pribadi"
      >
        <form
          onSubmit={handleSaveRename}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
          <div className="flex items-center justify-between pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Ubah Nama Pribadi</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Hanya tampil untuk akun Anda. Nama asli akun{' '}
                <strong className="text-slate-700">{renameTargetUser.nama}</strong> tidak berubah.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRenameTargetUser(null)}
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
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                placeholder={`Contoh: ${renameTargetUser.nama} (Lapangan)`}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            {currentAlias && (
              <button
                type="button"
                onClick={() => {
                  onSaveUserAlias(renameTargetUser.id, '');
                  setRenameTargetUser(null);
                }}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Kembalikan ke nama asli ({renameTargetUser.nama})
              </button>
            )}
          </div>

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setRenameTargetUser(null)}
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
    );
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredPeers = peers.filter(
    (p) =>
      !q ||
      getPeerDisplayName(p).toLowerCase().includes(q) ||
      p.nama.toLowerCase().includes(q) ||
      p.jabatan.toLowerCase().includes(q)
  );

  const renderPeerItems = (isSplitPane: boolean) =>
    filteredPeers.length === 0 ? (
      <p className="px-4 py-8 text-center text-xs text-slate-500">
        Tidak ada kontak ditemukan
      </p>
    ) : (
      filteredPeers.map((peer) => {
        const displayName = getPeerDisplayName(peer);
        const isAliased = displayName !== peer.nama;
        const isSelected = isSplitPane && activePeer?.id === peer.id;
        const unreadCount = messages.filter(
          (m) => m.senderId === peer.id && m.recipientId === currentUser.id && !m.readAt
        ).length;
        const statusShortLabel =
          peer.presenceStatus === 'online'
            ? 'Online'
            : peer.presenceStatus === 'idle'
              ? 'Idle'
              : 'Offline';
        const statusDotColor =
          peer.presenceStatus === 'online'
            ? 'bg-emerald-500'
            : peer.presenceStatus === 'idle'
              ? 'bg-amber-500'
              : 'bg-slate-400';
        const statusTextColor =
          peer.presenceStatus === 'online'
            ? 'text-emerald-700'
            : peer.presenceStatus === 'idle'
              ? 'text-amber-700'
              : 'text-slate-500';
        const secondaryStatusLabel =
          peer.presenceStatus === 'online'
            ? 'Sedang aktif'
            : formatRelativeActiveTime(
                peer.lastActiveAt || peer.updatedAt,
                peer.presenceStatus
              );

        return (
          <div
            key={peer.id}
            className={`flex items-center gap-1.5 pr-2 transition-colors ${
              isSelected
                ? 'bg-teal-50/80 border-l-4 border-l-teal-700'
                : 'hover:bg-slate-50'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectPeer(peer.id)}
              className={`flex min-w-0 flex-1 items-center gap-3 py-3 pr-1 text-left active:bg-slate-100/70 ${
                isSelected ? 'pl-3' : 'pl-4'
              }`}
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                {peer.fotoDataUrl ? (
                  <DriveImage
                    src={peer.fotoDataUrl}
                    thumbnailUrl={peer.fotoThumbnailUrl}
                    alt={displayName}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <User className="h-5 w-5" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-bold text-white ring-2 ring-white tabular-nums">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      peer.role === 'SuperAdmin'
                        ? 'bg-slate-900 text-white'
                        : 'bg-teal-50 text-teal-800'
                    }`}
                  >
                    {peer.role}
                  </span>
                  {isAliased && (
                    <span className="truncate text-[11px] text-slate-400">
                      Asli: {peer.nama}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="inline-flex items-center justify-end gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor}`} />
                  <span className={`text-xs font-semibold ${statusTextColor}`}>
                    {statusShortLabel}
                  </span>
                </div>
                <p
                  className={`mt-0.5 text-[11px] tabular-nums ${
                    peer.presenceStatus === 'online'
                      ? 'font-medium text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {secondaryStatusLabel}
                </p>
              </div>
            </button>

            {onSaveUserAlias && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => openRenameModal(peer)}
                aria-label={`Ubah nama pribadi ${displayName}`}
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Ubah nama pribadi'}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })
    );

  const renderThreadMessagesBody = () =>
    threadMessages.length === 0 ? (
      <div className="mx-auto mt-10 max-w-xs rounded-2xl border border-slate-200 bg-white p-4 text-center">
        <p className="text-xs font-bold text-slate-800">
          Mulai percakapan pribadi dengan {activePeer ? getPeerDisplayName(activePeer) : ''}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Pesan dikirim langsung 1-on-1 dan memicu notifikasi ke penerima.
        </p>
      </div>
    ) : (
      threadMessages.map((msg) => {
        const isMine = msg.senderId === currentUser.id;
        const liveRecord = msg.sharedKpm
          ? records.find((r) => r.id === msg.sharedKpm!.kpmId)
          : undefined;
        const livePhoto = liveRecord ? getPrimaryKpmPhoto(liveRecord.documents) : undefined;
        const kpmCard = msg.sharedKpm
          ? {
              ...msg.sharedKpm,
              nama: liveRecord?.nama ?? msg.sharedKpm.nama,
              validasi: liveRecord?.validasi ?? msg.sharedKpm.validasi,
              item: liveRecord?.item ?? msg.sharedKpm.item,
              proposal: liveRecord?.proposal ?? msg.sharedKpm.proposal,
              registerCode: liveRecord?.registerCode ?? msg.sharedKpm.registerCode,
              fotoDataUrl: livePhoto?.dataUrl ?? msg.sharedKpm.fotoDataUrl,
              fotoThumbnailUrl:
                livePhoto?.thumbnailUrl ?? msg.sharedKpm.fotoThumbnailUrl,
            }
          : undefined;
        const shortStatus =
          kpmCard?.validasi === 'accepted'
            ? 'Diterima'
            : kpmCard?.validasi === 'rejected'
              ? 'Ditolak'
              : 'Menunggu';
        const shortStatusColor =
          kpmCard?.validasi === 'accepted'
            ? 'text-teal-700'
            : kpmCard?.validasi === 'rejected'
              ? 'text-rose-600'
              : 'text-amber-700';

        return (
          <div
            key={msg.id}
            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${
                !isNativeApp ? 'md:max-w-[68%]' : ''
              } ${
                isMine
                  ? 'rounded-br-md bg-teal-700 text-white'
                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
              }`}
            >
              {kpmCard && (
                <button
                  type="button"
                  onClick={() => onOpenSharedKpm?.(kpmCard.kpmId)}
                  className="mb-2 flex w-full max-w-[270px] items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-left text-slate-900 transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-11 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                    {livePhoto ? (
                      <DriveImage
                        doc={livePhoto}
                        alt={kpmCard.nama}
                        className="h-full w-full object-cover"
                      />
                    ) : kpmCard.fotoDataUrl ? (
                      <DriveImage
                        src={kpmCard.fotoDataUrl}
                        thumbnailUrl={kpmCard.fotoThumbnailUrl}
                        alt={kpmCard.nama}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate text-xs font-bold leading-snug text-slate-900">
                        {kpmCard.nama}
                      </p>
                      <span className={`shrink-0 text-[10px] font-bold ${shortStatusColor}`}>
                        {shortStatus}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-600">
                      {kpmCard.item} · {kpmCard.proposal}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate text-slate-400 tabular-nums">
                        {kpmCard.registerCode}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-teal-700">
                        Detail <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              )}

              {msg.text && (
                <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
              )}
              <div
                className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                  isMine ? 'text-teal-100' : 'text-slate-400'
                }`}
              >
                <span>{formatChatTime(msg.createdAt)}</span>
                {isMine &&
                  (msg.readAt ? (
                    <CheckCheck
                      className="h-4 w-4 text-[#53bdeb]"
                      strokeWidth={2.4}
                      aria-label="Dibaca"
                    />
                  ) : msg.deliveredAt ? (
                    <CheckCheck
                      className="h-4 w-4 text-teal-100"
                      strokeWidth={2.2}
                      aria-label="Pesan masuk"
                    />
                  ) : (
                    <Check
                      className="h-4 w-4 text-teal-100/80"
                      strokeWidth={2.2}
                      aria-label="Terkirim"
                    />
                  ))}
              </div>
            </div>
          </div>
        );
      })
    );

  // Desktop Web Split 2-Pane Chat Layout
  if (isDesktopWeb) {
    const activeMeta = activePeer ? getPresenceMeta(activePeer.presenceStatus) : null;
    const activePeerDisplayName = activePeer ? getPeerDisplayName(activePeer) : '';
    const activeHasCustomAlias = activePeer ? activePeerDisplayName !== activePeer.nama : false;

    return (
      <div className="min-h-screen px-6 py-5">
        <div className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[1440px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          {/* Left Pane: Contacts List */}
          <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white xl:w-96">
            <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                  aria-label="Kembali"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <h1 className="truncate text-base font-bold text-slate-900">Obrolan Tim</h1>
              </div>
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                {peers.length}
              </span>
            </div>

            <div className="space-y-3 border-b border-slate-100 p-3.5">
              {renderWebPushBanner(true)}

              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kontak atau jabatan..."
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
              </div>
            </div>

            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {renderPeerItems(true)}
            </div>
          </aside>

          {/* Right Pane: Active 1-on-1 Thread */}
          <section className="flex min-w-0 flex-1 flex-col bg-slate-50/70">
            {activePeer && activeMeta ? (
              <>
                <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                    {activePeer.fotoDataUrl ? (
                      <DriveImage
                        src={activePeer.fotoDataUrl}
                        thumbnailUrl={activePeer.fotoThumbnailUrl}
                        alt={activePeerDisplayName}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <User className="h-4.5 w-4.5" />
                    )}
                    <PresenceDot
                      status={activePeer.presenceStatus}
                      size="sm"
                      className="absolute -right-0.5 -bottom-0.5"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {activePeerDisplayName}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          activePeer.role === 'SuperAdmin'
                            ? 'bg-slate-900 text-white'
                            : 'bg-teal-50 text-teal-800'
                        }`}
                      >
                        {activePeer.role}
                      </span>
                    </div>
                    <p className={`truncate text-xs font-medium ${activeMeta.textClass}`}>
                      {activeMeta.label}
                      {activeHasCustomAlias ? ` · Asli: ${activePeer.nama}` : ''}
                    </p>
                  </div>

                  {onSaveUserAlias && (
                    <button
                      type="button"
                      disabled={isOffline}
                      onClick={() => openRenameModal(activePeer)}
                      aria-label={`Ubah nama pribadi ${activePeerDisplayName}`}
                      title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Ubah nama panggilan pribadi'}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                  {renderThreadMessagesBody()}
                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSend}
                  className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-5 py-3.5"
                >
                  <input
                    type="text"
                    disabled={isOffline}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      isOffline
                        ? 'Mode offline (hanya baca) — koneksi internet dibutuhkan untuk mengirim pesan'
                        : `Tulis pesan untuk ${activePeerDisplayName}...`
                    }
                    className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={isOffline || !draft.trim() || sending}
                    aria-label="Kirim pesan"
                    title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Kirim pesan'}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send className="h-4 w-4" />
                    <span>Kirim</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-teal-700 shadow-xs">
                  <User className="h-6 w-6" />
                </div>
                <p className="mt-4 text-base font-bold text-slate-900">
                  Pilih Kontak untuk Memulai Obrolan
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  Klik salah satu petugas di panel sebelah kiri untuk melihat riwayat pesan atau mengirim kartu data KPM secara langsung.
                </p>
              </div>
            )}
          </section>
        </div>

        {renderRenameModal()}
      </div>
    );
  }

  // 1-on-1 Chat Thread Screen (Mobile / APK)
  if (activePeer) {
    const meta = getPresenceMeta(activePeer.presenceStatus);
    const activePeerDisplayName = getPeerDisplayName(activePeer);
    const hasCustomAlias = activePeerDisplayName !== activePeer.nama;

    return (
      <div className="flex min-h-screen flex-col bg-slate-100">
        {!isDesktopWeb ? (
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
            <button
              type="button"
              onClick={() => onSelectPeer(null)}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
              aria-label="Kembali ke daftar chat"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
              {activePeer.fotoDataUrl ? (
                <DriveImage
                  src={activePeer.fotoDataUrl}
                  thumbnailUrl={activePeer.fotoThumbnailUrl}
                  alt={activePeerDisplayName}
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
              <PresenceDot
                status={activePeer.presenceStatus}
                size="sm"
                className="absolute -right-0.5 -bottom-0.5"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-slate-900">{activePeerDisplayName}</p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    activePeer.role === 'SuperAdmin'
                      ? 'bg-slate-900 text-white'
                      : 'bg-teal-50 text-teal-800'
                  }`}
                >
                  {activePeer.role}
                </span>
              </div>
              <p className={`truncate text-[11px] font-medium ${meta.textClass}`}>
                {meta.label}
                {hasCustomAlias ? ` · Asli: ${activePeer.nama}` : ''}
              </p>
            </div>

            {onSaveUserAlias && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => openRenameModal(activePeer)}
                aria-label={`Ubah nama pribadi ${activePeerDisplayName}`}
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Ubah nama panggilan pribadi'}
                className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </header>
        ) : (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <button
              type="button"
              onClick={() => onSelectPeer(null)}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              aria-label="Kembali ke daftar chat"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>

            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
              {activePeer.fotoDataUrl ? (
                <DriveImage
                  src={activePeer.fotoDataUrl}
                  thumbnailUrl={activePeer.fotoThumbnailUrl}
                  alt={activePeerDisplayName}
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
              <PresenceDot
                status={activePeer.presenceStatus}
                size="sm"
                className="absolute -right-0.5 -bottom-0.5"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{activePeerDisplayName}</p>
              <p className={`truncate text-[11px] font-medium ${meta.textClass}`}>
                {activePeer.role} · {meta.label}
              </p>
            </div>

            {onSaveUserAlias && (
              <button
                type="button"
                disabled={isOffline}
                onClick={() => openRenameModal(activePeer)}
                aria-label={`Ubah nama pribadi ${activePeerDisplayName}`}
                title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Ubah nama panggilan pribadi'}
                className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Thread Body */}
        <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4 pb-24">
          {renderThreadMessagesBody()}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer */}
        <form
          onSubmit={handleSend}
          className={`fixed bottom-0 left-1/2 z-30 flex w-full -translate-x-1/2 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5 ${
            isNativeApp ? 'max-w-md' : ''
          }`}
        >
          <input
            type="text"
            disabled={isOffline}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isOffline
                ? 'Mode offline (hanya baca)...'
                : `Tulis pesan untuk ${activePeerDisplayName}...`
            }
            className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={isOffline || !draft.trim() || sending}
            aria-label="Kirim pesan"
            title={isOffline ? 'Mode Offline (Hanya Baca)' : 'Kirim pesan'}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        {renderRenameModal()}
      </div>
    );
  }

  // Contact List Screen (Strictly 1-on-1 Direct Contacts)
  return (
    <div className="min-h-screen pb-24">
      {!isDesktopWeb && (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">Obrolan</h1>
        </header>
      )}

      <div className="space-y-4 px-4 pt-4">
        {isDesktopWeb && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">Obrolan</h1>
          </div>
        )}
        {renderWebPushBanner(false)}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pencarian..."
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {renderPeerItems(false)}
        </div>
      </div>

      {renderRenameModal()}
    </div>
  );
}
