import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  History,
  Lock,
  MessageCircle,
  Package,
  Pencil,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { DTSEN_OPTION_ITEMS, INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  InternalUser,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmRecord,
  ProposalRecord,
  SharedKpmCard,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatNikDisplay,
  formatRupiah,
  formatUploadDateTime,
  formatWhatsAppUrl,
  getKpmSubItemStatusList,
  resolvePackageForKpm,
  resolveProposalDomicile,
} from '../utils/imageProcessor';

interface KpmDetailViewProps {
  record: KpmRecord;
  allRecords: KpmRecord[];
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  items: ItemBantuan[];
  auditLogs: KpmAuditLogEntry[];
  currentUserId: string;
  internalUsers: InternalUser[];
  canUpdate?: boolean;
  canDelete?: boolean;
  onBack: () => void;
  onEditRecord: (record: KpmRecord) => void;
  onDeleteRecord: (id: string) => void;
  onUpdateStatus: (id: string, status: ValidationStatus) => void;
  onToggleSubItem: (
    kpmId: string,
    subItemKey: string,
    subItemName: string,
    nextDelivered: boolean
  ) => void;
  onMarkAllSubItemsDelivered: (
    kpmId: string,
    subItems: { key: string; name: string }[]
  ) => void;
  onShareToChat: (recipientId: string, card: SharedKpmCard, message: string) => Promise<void>;
  onSelectDuplicateRecord: (record: KpmRecord) => void;
  onOpenProposal: (proposalName: string, tahun: string) => void;
  onOpenFullHistory: () => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
}

export function KpmDetailView({
  record,
  allRecords,
  proposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  items,
  auditLogs,
  currentUserId,
  internalUsers,
  canUpdate = true,
  canDelete = true,
  onBack,
  onEditRecord,
  onDeleteRecord,
  onUpdateStatus,
  onToggleSubItem,
  onMarkAllSubItemsDelivered,
  onShareToChat,
  onSelectDuplicateRecord,
  onOpenProposal,
  onOpenFullHistory,
  onPreviewDocument,
  feedback,
  onDismissFeedback,
}: KpmDetailViewProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareRecipientId, setShareRecipientId] = useState<string>('');
  const [shareMessage, setShareMessage] = useState<string>('');
  const [sharingChat, setSharingChat] = useState(false);

  const matchingProposal = useMemo(
    () =>
      proposals.find(
        (p) => p.namaProposal === record.proposal && p.tahun === record.tahun
      ) ?? proposals.find((p) => p.namaProposal === record.proposal),
    [proposals, record.proposal, record.tahun]
  );

  const resolvedDomicile = useMemo(
    () => resolveProposalDomicile(record.proposal, proposals, record.tahun, wilayahList),
    [record.proposal, proposals, record.tahun, wilayahList]
  );

  const displayKelurahan = record.kelurahan?.trim() || resolvedDomicile.kelurahan;
  const rawKecamatan = record.kecamatan?.trim() || resolvedDomicile.kecamatan;
  const displayKecamatan = rawKecamatan
    ? /^kecamatan\s+/i.test(rawKecamatan)
      ? rawKecamatan
      : `Kecamatan ${rawKecamatan}`
    : '';

  const isProposalLocked = matchingProposal?.status === 'locked';

  const resolvedPackage = useMemo(
    () => resolvePackageForKpm(items, record.tahun, record.item),
    [items, record.tahun, record.item]
  );

  const itemName = useMemo(() => {
    return resolvedPackage.name && resolvedPackage.name !== resolvedPackage.code
      ? `${resolvedPackage.code} — ${resolvedPackage.name}`
      : record.item;
  }, [resolvedPackage, record.item]);

  const subItemStatuses = useMemo(
    () => getKpmSubItemStatusList(record, items),
    [record, items]
  );

  const subItemStats = useMemo(() => {
    const total = subItemStatuses.length;
    const delivered = subItemStatuses.filter((s) => s.delivered).length;
    const pending = total - delivered;
    return {
      total,
      delivered,
      pending,
      isPartialDebt: delivered > 0 && pending > 0,
      isComplete: total > 0 && pending === 0,
    };
  }, [subItemStatuses]);

  const dtsenLabel = useMemo(() => {
    const found = DTSEN_OPTION_ITEMS.find((d) => d.value === record.dtsen);
    return found ? found.label : record.dtsen || '-';
  }, [record.dtsen]);

  // Live Duplication Analysis (NIK KTP & Nomor KK against all other records)
  const duplicateInfo = useMemo(() => {
    const matches: {
      record: KpmRecord;
      sameKtp: boolean;
      sameKk: boolean;
    }[] = [];

    let hasKtpMatch = false;
    let hasKkMatch = false;

    for (const other of allRecords) {
      if (other.id === record.id) continue;
      const sameKtp = Boolean(record.nikKtp && other.nikKtp === record.nikKtp);
      const sameKk = Boolean(record.nikKk && other.nikKk === record.nikKk);
      if (sameKtp || sameKk) {
        if (sameKtp) hasKtpMatch = true;
        if (sameKk) hasKkMatch = true;
        matches.push({ record: other, sameKtp, sameKk });
      }
    }

    const statusLabel =
      hasKtpMatch && hasKkMatch
        ? 'Duplikat NIK KTP & KK'
        : hasKtpMatch
          ? 'Duplikat NIK KTP'
          : hasKkMatch
            ? 'Duplikat Nomor KK'
            : 'Tidak Ada Duplikasi';

    return {
      hasDuplicates: matches.length > 0,
      statusLabel,
      matches,
    };
  }, [allRecords, record]);

  // Audit logs for this specific KPM (sorted newest first, keeping initial creation clearly tagged)
  const recordAuditLogs = useMemo(() => {
    const logs = auditLogs
      .filter((entry) => entry.kpmId === record.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (logs.length > 0) return logs;

    // Fallback creation entry if no explicit audit logs existed yet
    return [
      {
        id: `fallback-create-${record.id}`,
        kpmId: record.id,
        action: 'created' as const,
        actorName: 'Petugas Internal',
        timestamp: record.createdAt,
        proposal: record.proposal,
        tahun: record.tahun,
        changes: [
          {
            field: 'Proposal Awal',
            before: '-',
            after: `${record.proposal} (${record.tahun})`,
          },
          { field: 'Item Bantuan', before: '-', after: itemName },
        ],
      },
    ];
  }, [auditLogs, record, itemName]);

  const initialCreationEntry = useMemo(() => {
    return (
      [...recordAuditLogs]
        .reverse()
        .find((l) => l.action === 'created') ?? recordAuditLogs[recordAuditLogs.length - 1]
    );
  }, [recordAuditLogs]);

  const renderStatusIndicator = (status: ValidationStatus) => {
    if (status === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Diterima
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Ditolak
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Menunggu
      </span>
    );
  };

  const rumahDocs = Array.isArray(record.documents.rumah)
    ? record.documents.rumah
    : record.documents.rumah
      ? [record.documents.rumah]
      : [];
  const lainnyaDocs = record.documents.lainnya || [];
  const heroPhotoDoc = record.documents.penerima || record.documents.ktp;
  const heroWaUrl = formatWhatsAppUrl(record.kontak);

  const chatRecipients = useMemo(() => {
    const currentUser = internalUsers.find((u) => u.id === currentUserId);
    const isPrimaryDomi = currentUser?.email.toLowerCase() === 'vinsmoke.domi@gmail.com';
    return internalUsers
      .filter((u) => {
        if (u.id === currentUserId || u.status !== 'active') return false;
        if (
          isPrimaryDomi &&
          u.email.toLowerCase() === 'la.qsas@gmail.com' &&
          u.presenceStatus === 'offline' &&
          !u.fotoDataUrl
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [internalUsers, currentUserId]);

  const handleOpenShareModal = () => {
    setShareRecipientId(chatRecipients[0]?.id || '');
    setShareMessage(`Mohon info terkait data KPM atas nama ${record.nama}.`);
    setIsShareModalOpen(true);
  };

  const handleConfirmShare = async () => {
    if (!shareRecipientId || sharingChat) return;
    setSharingChat(true);
    const card: SharedKpmCard = {
      kpmId: record.id,
      registerCode: record.registerCode,
      nama: record.nama,
      tahun: record.tahun,
      item: record.item,
      itemName,
      proposal: record.proposal,
      kontak: record.kontak,
      validasi: record.validasi,
      fotoDataUrl: heroPhotoDoc?.dataUrl,
    };
    await onShareToChat(shareRecipientId, card, shareMessage.trim());
    setSharingChat(false);
    setIsShareModalOpen(false);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sub-Screen Header: hanya panah kembali + judul */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali ke daftar KPM"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Detail Calon KPM</h1>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {feedback && (
          <div
            role="status"
            className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${
              feedback.type === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  feedback.type === 'success' ? 'text-teal-700' : 'text-rose-600'
                }`}
              />
              <p className="font-medium leading-snug">{feedback.message}</p>
            </div>

            {onDismissFeedback && (
              <button
                type="button"
                onClick={onDismissFeedback}
                className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 shrink-0"
                aria-label="Tutup pemberitahuan"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {isProposalLocked && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-100 px-3.5 py-2.5 text-xs font-medium text-slate-700">
            <Lock className="h-4 w-4 shrink-0 text-slate-700" />
            <span>
              Proposal <strong>{record.proposal}</strong> berstatus Terkunci. Data KPM ini tidak
              dapat diubah, dipindahkan, atau dihapus.
            </span>
          </div>
        )}

        {/* Hero Identity Card: Foto, Nama, Item, Proposal, Nomor HP */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          {/* Card Top Bar */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <p className="truncate text-xs font-medium text-teal-800 tabular-nums">
              {record.registerCode} · {record.tahun}
            </p>
            {renderStatusIndicator(record.validasi)}
          </div>

          {/* Core Identity Body */}
          <div className="p-4">
            <div className="flex items-start gap-3.5">
              {/* Foto KPM */}
              {heroPhotoDoc ? (
                <button
                  type="button"
                  onClick={() => onPreviewDocument(heroPhotoDoc, record.nama)}
                  className="h-22 w-18 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-xs"
                  aria-label={`Lihat foto ${record.nama}`}
                >
                  <img
                    src={heroPhotoDoc.dataUrl}
                    alt={record.nama}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex h-22 w-18 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-400">
                  <User className="h-8 w-8" />
                </div>
              )}

              {/* Nama, Item, Proposal, Nomor HP */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="break-words text-base font-bold leading-snug tracking-tight text-slate-900">
                  {record.nama}
                </h2>

                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Package className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span className="truncate font-medium">{itemName}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenProposal(record.proposal, record.tahun)}
                  className="flex w-full items-start gap-1 text-left text-xs font-medium leading-snug text-teal-700 hover:underline"
                >
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">
                    {displayKelurahan &&
                    !record.proposal.toLowerCase().includes(displayKelurahan.toLowerCase())
                      ? `${record.proposal} · ${displayKelurahan}`
                      : record.proposal}
                  </span>
                </button>

                <div className="pt-0.5">
                  {heroWaUrl && record.kontak ? (
                    <a
                      href={heroWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 tabular-nums"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{record.kontak}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Tanpa No. HP</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Validasi Quick Switch + Share ke Chat */}
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-3.5">
              <div>
                <p className="text-xs font-medium text-slate-500">Ubah Status Validasi</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { key: 'pending', label: 'Menunggu' },
                      { key: 'rejected', label: 'Ditolak' },
                      { key: 'accepted', label: 'Diterima' },
                    ] as { key: ValidationStatus; label: string }[]
                  ).map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      disabled={isProposalLocked || !canUpdate}
                      onClick={() => onUpdateStatus(record.id, st.key)}
                      className={`min-h-[38px] rounded-xl px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        record.validasi === st.key
                          ? st.key === 'accepted'
                            ? 'bg-teal-700 text-white'
                            : st.key === 'rejected'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenShareModal}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100"
              >
                <Share2 className="h-3.5 w-3.5 shrink-0" />
                <span>Bagikan Kartu KPM ke Chat</span>
              </button>
            </div>
          </div>
        </section>

        {/* Status Duplikasi NIK / KK */}
        {duplicateInfo.hasDuplicates ? (
          <section className="overflow-hidden rounded-2xl border border-amber-300 bg-white">
            <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-950">{duplicateInfo.statusLabel}</p>
                <p className="mt-0.5 text-xs text-amber-800 tabular-nums">
                  Ditemukan {duplicateInfo.matches.length} data KPM lain dengan NIK KTP atau Nomor KK
                  yang sama
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {duplicateInfo.matches.map(({ record: dup, sameKtp, sameKk }) => {
                const matchReason =
                  sameKtp && sameKk
                    ? 'NIK KTP & KK Sama'
                    : sameKtp
                      ? 'NIK KTP Sama'
                      : 'Nomor KK Sama';

                return (
                  <button
                    key={dup.id}
                    type="button"
                    onClick={() => onSelectDuplicateRecord(dup)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {dup.registerCode} · {dup.nama}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-amber-800">
                        {matchReason} · {renderStatusIndicator(dup.validasi)}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        {dup.proposal} ({dup.tahun}) · DTSEN: {dup.dtsen}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {dup.pekerjaan} · Pengelola: {dup.pengelola}
                      </p>
                      {dup.catatan && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                          Catatan: {dup.catatan}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">Pemeriksaan Duplikasi Bersih</p>
              <p className="text-[11px] text-slate-500">
                NIK KTP dan Nomor KK tidak tercatat ganda pada usulan lain
              </p>
            </div>
          </section>
        )}

        {/* Penyaluran Sub-Item Bantuan (Interactive Toggles & Hutang Tracking) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Package className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Penyaluran Sub-Item</h3>
                <p className="text-xs leading-snug text-slate-500">
                  {itemName} · {record.tahun}
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-slate-900 tabular-nums">
                {subItemStats.delivered} / {subItemStats.total} Diterima
              </p>
              {(subItemStats.total === 0 ||
                subItemStats.isComplete ||
                subItemStats.isPartialDebt) && (
                <p
                  className={`text-[11px] font-semibold tabular-nums ${
                    subItemStats.isComplete
                      ? 'text-teal-700'
                      : subItemStats.isPartialDebt
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {subItemStats.total === 0
                    ? 'Tanpa sub-item'
                    : subItemStats.isComplete
                      ? 'Lengkap Diterima'
                      : `Hutang ${subItemStats.pending} Item`}
                </p>
              )}
            </div>
          </div>

          {subItemStatuses.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">
              Belum ada rincian sub-item untuk paket {record.item} tahun {record.tahun}.
            </div>
          ) : (
            <>
              {subItemStats.isPartialDebt && (
                <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2 text-xs text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <span>
                    Penyelenggara masih berhutang{' '}
                    <strong>{subItemStats.pending} sub-item</strong> yang belum dibagikan.
                  </span>
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {subItemStatuses.map((sub) => (
                  <div
                    key={sub.key}
                    className="flex min-h-[58px] items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal text-slate-800">{sub.name}</p>
                      <p
                        className={`mt-0.5 text-[11px] font-medium ${
                          sub.delivered
                            ? 'text-teal-700'
                            : subItemStats.delivered > 0
                              ? 'text-amber-700'
                              : 'text-rose-600'
                        }`}
                      >
                        {sub.delivered
                          ? 'Sudah diterima'
                          : subItemStats.delivered > 0
                            ? 'Belum diterima · Hutang'
                            : 'Belum diterima'}
                        {sub.updatedAt ? ` · ${formatUploadDateTime(sub.updatedAt)}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={sub.delivered}
                      aria-label={`Status terima ${sub.name}`}
                      disabled={isProposalLocked || !canUpdate}
                      onClick={() =>
                        onToggleSubItem(record.id, sub.key, sub.name, !sub.delivered)
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                        sub.delivered ? 'bg-teal-700' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-xs transition duration-200 ${
                          sub.delivered ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {!subItemStats.isComplete && !isProposalLocked && canUpdate && (
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onMarkAllSubItemsDelivered(
                        record.id,
                        subItemStatuses.map((s) => ({ key: s.key, name: s.name }))
                      )
                    }
                    className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Tandai Semua Sub-Item Sudah Diterima</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Pengajuan & Bantuan */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Pengajuan Bantuan</h3>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Tahun</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {record.tahun}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Proposal</dt>
              <dd className="max-w-[64%] text-right text-xs font-medium text-teal-700">
                <button
                  type="button"
                  onClick={() => onOpenProposal(record.proposal, record.tahun)}
                  className="text-right hover:underline"
                >
                  {record.proposal}
                </button>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Item Bantuan</dt>
              <dd className="max-w-[64%] text-right text-xs font-medium text-slate-900">
                {itemName}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">DTSEN</dt>
              <dd className="text-right text-xs font-medium text-slate-900">{dtsenLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Biaya Administrasi</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {formatRupiah(record.payment)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Identitas & Domisili */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Identitas & Domisili</h3>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">NIK KTP</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {formatNikDisplay(record.nikKtp)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Nomor KK</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {formatNikDisplay(record.nikKk)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <dt className="shrink-0 text-xs text-slate-500">Alamat Lengkap</dt>
              <dd className="max-w-[64%] text-right text-xs font-medium leading-relaxed text-slate-900 break-words">
                <span>{record.alamat || '-'}</span>
                <span className="mt-0.5 block text-slate-600 tabular-nums">
                  RT {record.rt || '-'} / RW {record.rw || '-'}
                </span>
              </dd>
            </div>
            {displayKelurahan && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Kelurahan / Desa</dt>
                <dd className="text-right text-xs font-medium text-slate-900">
                  {displayKelurahan}
                </dd>
              </div>
            )}
            {displayKecamatan && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-xs text-slate-500 shrink-0">Kecamatan</dt>
                <dd className="text-right text-xs font-medium text-slate-900">
                  {displayKecamatan}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Pekerjaan</dt>
              <dd className="text-right text-xs font-medium text-slate-900">
                {record.pekerjaan}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Pengelola</dt>
              <dd className="text-right text-xs font-medium text-slate-900">
                {record.pengelola}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-slate-500 shrink-0">Nomor HP</dt>
              <dd className="text-right text-xs font-medium text-slate-900 tabular-nums">
                {(() => {
                  const waUrl = formatWhatsAppUrl(record.kontak);
                  if (!waUrl || !record.kontak) return '-';
                  return (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{record.kontak}</span>
                    </a>
                  );
                })()}
              </dd>
            </div>
            {record.catatan && (
              <div className="px-4 py-3">
                <dt className="text-xs text-slate-500">Catatan Petugas</dt>
                <dd className="mt-1 text-xs leading-relaxed text-slate-700">{record.catatan}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Dokumen & Foto Lapangan */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Dokumen & Foto Lapangan</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(
              [
                { key: 'ktp', label: 'Foto KTP', icon: CreditCard },
                { key: 'kk', label: 'Foto KK', icon: FileText },
                { key: 'penerima', label: 'Foto Penerima', icon: User },
                { key: 'survey', label: 'Foto Survey', icon: FileText },
              ] as const
            ).map((item) => {
              const doc = record.documents[item.key];
              const Icon = item.icon;
              if (!doc && item.key !== 'ktp' && item.key !== 'kk') return null;

              return (
                <div
                  key={item.key}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {doc ? (
                    <button
                      type="button"
                      onClick={() => onPreviewDocument(doc, item.label)}
                      className="relative block aspect-[1.45/1] w-full overflow-hidden bg-slate-200 text-left"
                    >
                      <img
                        src={doc.dataUrl}
                        alt={item.label}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {item.label}
                      </span>
                    </button>
                  ) : (
                    <div className="flex aspect-[1.45/1] flex-col items-center justify-center p-2 text-center text-slate-400">
                      <Icon className="h-5 w-5" />
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {item.label} kosong
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {rumahDocs.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onPreviewDocument(doc, `Foto Rumah #${idx + 1}`)}
                className="relative block aspect-[1.45/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-left"
              >
                <img
                  src={doc.dataUrl}
                  alt={`Foto Rumah ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Rumah #{idx + 1}
                </span>
              </button>
            ))}

            {lainnyaDocs.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onPreviewDocument(doc, `Foto Lainnya #${idx + 1}`)}
                className="relative block aspect-[1.45/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-left"
              >
                <img
                  src={doc.dataUrl}
                  alt={`Foto Lainnya ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Lainnya #{idx + 1}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Rekam Jejak */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Rekam Jejak</h3>
            </div>
            <button
              type="button"
              onClick={onOpenFullHistory}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 hover:underline"
            >
              <span>Lihat selengkapnya</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Ringkasan Input Awal */}
          {initialCreationEntry && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Clock className="h-3.5 w-3.5 text-teal-700" />
                <span>Waktu Input Awal</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-900 tabular-nums">
                {formatUploadDateTime(initialCreationEntry.timestamp)} · Oleh{' '}
                {initialCreationEntry.actorName}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Masuk ke <span className="font-medium text-slate-800">{initialCreationEntry.proposal}</span> · Tahun{' '}
                {initialCreationEntry.tahun}
              </p>
            </div>
          )}

          {recordAuditLogs.length > 0 && (
            <button
              type="button"
              onClick={onOpenFullHistory}
              className="flex min-h-[42px] w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-100"
            >
              <span>Lihat selengkapnya</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>

        {/* Action Footer (Safe Delete) */}
        {canDelete && (
          <section className="pt-1">
            {!confirmDelete ? (
              <button
                type="button"
                disabled={isProposalLocked}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Hapus Data KPM</span>
              </button>
            ) : (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
                <p className="text-xs font-bold text-rose-900">
                  Hapus calon KPM "{record.nama}" dari daftar?
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(record.id)}
                    className="min-h-[40px] flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    Ya, Hapus Data
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Persistent Bottom-Right Floating Pencil Edit KPM Button */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4">
        <button
          type="button"
          onClick={() => onEditRecord(record)}
          disabled={isProposalLocked || !canUpdate}
          aria-label={
            isProposalLocked
              ? 'Proposal Terkunci'
              : !canUpdate
                ? 'Akses Edit Dinonaktifkan'
                : 'Edit Data KPM'
          }
          title={
            isProposalLocked
              ? 'Proposal Terkunci'
              : !canUpdate
                ? 'Akses Edit Dinonaktifkan'
                : 'Edit Data KPM'
          }
          className={`pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
            isProposalLocked || !canUpdate
              ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-500 shadow-slate-900/10'
              : 'bg-teal-700 text-white shadow-teal-900/25 hover:bg-teal-800'
          }`}
        >
          {isProposalLocked || !canUpdate ? <Lock className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
        </button>
      </div>

      {/* Share KPM Card to Direct Chat Bottom-Sheet Modal */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setIsShareModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Bagikan Kartu KPM ke Chat"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-base font-bold text-slate-900">Bagikan Kartu KPM ke Chat</h2>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Compact Card Preview */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-400">
                {heroPhotoDoc ? (
                  <img
                    src={heroPhotoDoc.dataUrl}
                    alt={record.nama}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-teal-700 tabular-nums">
                  {record.registerCode} · {record.tahun}
                </p>
                <p className="truncate text-sm font-bold text-slate-900">{record.nama}</p>
                <p className="truncate text-xs text-slate-500">
                  {itemName} · {record.proposal}
                </p>
              </div>
            </div>

            {chatRecipients.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Belum ada akun Admin atau SuperAdmin aktif lainnya untuk diajak chat.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pilih Penerima Chat
                  </label>
                  <div className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                    {chatRecipients.map((recipient) => {
                      const selected = shareRecipientId === recipient.id;
                      return (
                        <button
                          key={recipient.id}
                          type="button"
                          onClick={() => setShareRecipientId(recipient.id)}
                          className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-teal-700 bg-teal-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
                              {recipient.fotoDataUrl ? (
                                <img
                                  src={recipient.fotoDataUrl}
                                  alt={recipient.nama}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {recipient.nama}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {recipient.role} · {recipient.email}
                              </p>
                            </div>
                          </div>
                          {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Catatan / Pertanyaan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Tulis pertanyaan atau catatan terkait KPM ini..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={!shareRecipientId || sharingChat}
                  onClick={handleConfirmShare}
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  <span>{sharingChat ? 'Mengirim...' : 'Kirim Kartu ke Chat'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
