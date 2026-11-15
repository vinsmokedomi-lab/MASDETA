import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Search,
  Send,
  User,
} from 'lucide-react';
import { DirectChatMessage, InternalUser, SharedKpmCard } from '../types/kpm';
import { DriveImage } from './DriveImage';
import { PresenceDot, getPresenceMeta } from './PresenceDot';

interface ChatViewProps {
  currentUser: InternalUser;
  users: InternalUser[];
  messages: DirectChatMessage[];
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

export function ChatView({
  currentUser,
  users,
  messages,
  activePeerId,
  onSelectPeer,
  onSendMessage,
  onMarkConversationRead,
  onOpenSharedKpm,
  pushPermission,
  onRequestPushPermission,
  onBack,
}: ChatViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
        return a.nama.localeCompare(b.nama, 'id');
      });
  }, [users, currentUser.id, currentUser.email, messages]);

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
    if (!activePeer || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    await onSendMessage(activePeer.id, text);
    setSending(false);
  };

  // 1-on-1 Chat Thread Screen
  if (activePeer) {
    const meta = getPresenceMeta(activePeer.presenceStatus);

    return (
      <div className="flex min-h-screen flex-col bg-slate-100">
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
                alt={activePeer.nama}
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
              <p className="truncate text-sm font-bold text-slate-900">{activePeer.nama}</p>
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
            </p>
          </div>
        </header>

        {/* Thread Body */}
        <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4 pb-24">
          {threadMessages.length === 0 ? (
            <div className="mx-auto mt-10 max-w-xs rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-xs font-bold text-slate-800">
                Mulai percakapan pribadi dengan {activePeer.nama}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Pesan dikirim langsung 1-on-1 dan memicu notifikasi ke penerima.
              </p>
            </div>
          ) : (
            threadMessages.map((msg) => {
              const isMine = msg.senderId === currentUser.id;
              const kpmCard = msg.sharedKpm;
              const kpmStatusLabel =
                kpmCard?.validasi === 'accepted'
                  ? 'Diterima'
                  : kpmCard?.validasi === 'rejected'
                    ? 'Ditolak'
                    : 'Menunggu';

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${
                      isMine
                        ? 'rounded-br-md bg-teal-700 text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                    }`}
                  >
                    {kpmCard && (
                      <button
                        type="button"
                        onClick={() => onOpenSharedKpm?.(kpmCard.kpmId)}
                        className={`mb-2 block w-full overflow-hidden rounded-xl border text-left transition-colors ${
                          isMine
                            ? 'border-teal-500/50 bg-teal-800/70 text-white hover:bg-teal-800'
                            : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 p-2.5">
                          <div
                            className={`flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                              isMine
                                ? 'border-teal-600 bg-teal-900/60 text-teal-100'
                                : 'border-slate-200 bg-white text-slate-400'
                            }`}
                          >
                            {kpmCard.fotoDataUrl ? (
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
                              <span
                                className={`truncate text-[10px] font-medium tabular-nums ${
                                  isMine ? 'text-teal-200' : 'text-teal-700'
                                }`}
                              >
                                {kpmCard.registerCode}
                              </span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                  kpmCard.validasi === 'accepted'
                                    ? isMine
                                      ? 'bg-teal-600 text-white'
                                      : 'bg-teal-50 text-teal-800'
                                    : kpmCard.validasi === 'rejected'
                                      ? isMine
                                        ? 'bg-rose-500/80 text-white'
                                        : 'bg-rose-50 text-rose-700'
                                      : isMine
                                        ? 'bg-amber-500/80 text-white'
                                        : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {kpmStatusLabel}
                              </span>
                            </div>

                            <p className="mt-0.5 truncate text-xs font-bold leading-snug">
                              {kpmCard.nama}
                            </p>
                            <p
                              className={`truncate text-[11px] ${
                                isMine ? 'text-teal-100' : 'text-slate-600'
                              }`}
                            >
                              {kpmCard.itemName || kpmCard.item} · {kpmCard.proposal} ({kpmCard.tahun})
                            </p>
                            {kpmCard.kontak && (
                              <p
                                className={`truncate text-[10px] tabular-nums ${
                                  isMine ? 'text-teal-200' : 'text-slate-500'
                                }`}
                              >
                                HP: {kpmCard.kontak}
                              </p>
                            )}
                          </div>
                        </div>

                        <div
                          className={`flex items-center justify-between border-t px-2.5 py-1.5 text-[10px] font-semibold ${
                            isMine
                              ? 'border-teal-600/60 bg-teal-900/30 text-teal-100'
                              : 'border-slate-200 bg-white text-teal-700'
                          }`}
                        >
                          <span>Kartu Data KPM</span>
                          <span className="inline-flex items-center gap-0.5">
                            Buka Detail <ChevronRight className="h-3 w-3" />
                          </span>
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
                          <CheckCheck className="h-3 w-3" />
                        ) : (
                          <Check className="h-3 w-3" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer */}
        <form
          onSubmit={handleSend}
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Tulis pesan untuk ${activePeer.nama}...`}
            className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Kirim pesan"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  }

  // Contact List Screen (Strictly 1-on-1 Direct Contacts)
  const q = searchQuery.trim().toLowerCase();
  const filteredPeers = peers.filter(
    (p) =>
      !q ||
      p.nama.toLowerCase().includes(q) ||
      p.jabatan.toLowerCase().includes(q)
  );

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Chat</h1>
      </header>

      <div className="space-y-4 px-4 pt-4">
        {pushPermission === 'default' && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Bell className="h-4 w-4 shrink-0 text-teal-700" />
              <p className="text-xs font-medium text-teal-900">
                Aktifkan Push Notification agar pesan masuk langsung tampil.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestPushPermission}
              className="min-h-[34px] shrink-0 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800"
            >
              Aktifkan
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari Admin atau SuperAdmin..."
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filteredPeers.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">
              Tidak ada kontak Admin atau SuperAdmin ditemukan.
            </p>
          ) : (
            filteredPeers.map((peer) => {
              const peerMsgs = messages
                .filter(
                  (m) =>
                    (m.senderId === currentUser.id && m.recipientId === peer.id) ||
                    (m.senderId === peer.id && m.recipientId === currentUser.id)
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
              const lastMsg = peerMsgs[0];
              const unreadCount = peerMsgs.filter(
                (m) => m.senderId === peer.id && m.recipientId === currentUser.id && !m.readAt
              ).length;
              const presenceMeta = getPresenceMeta(peer.presenceStatus);

              return (
                <button
                  key={peer.id}
                  type="button"
                  onClick={() => onSelectPeer(peer.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/70"
                >
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                    {peer.fotoDataUrl ? (
                      <DriveImage
                        src={peer.fotoDataUrl}
                        thumbnailUrl={peer.fotoThumbnailUrl}
                        alt={peer.nama}
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                    <PresenceDot
                      status={peer.presenceStatus}
                      size="md"
                      className="absolute -right-1 -bottom-1"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-slate-900">{peer.nama}</p>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            peer.role === 'SuperAdmin'
                              ? 'bg-slate-900 text-white'
                              : 'bg-teal-50 text-teal-800'
                          }`}
                        >
                          {peer.role}
                        </span>
                      </div>
                      {lastMsg && (
                        <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                          {formatChatTime(lastMsg.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">
                        {lastMsg
                          ? `${lastMsg.senderId === currentUser.id ? 'Anda: ' : ''}${
                              lastMsg.text ||
                              (lastMsg.sharedKpm
                                ? `[Kartu KPM: ${lastMsg.sharedKpm.nama}]`
                                : '')
                            }`
                          : presenceMeta.label}
                      </p>
                      {unreadCount > 0 && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-teal-700 px-1.5 text-[10px] font-bold text-white tabular-nums">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
