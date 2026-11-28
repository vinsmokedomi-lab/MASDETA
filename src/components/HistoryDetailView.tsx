import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Loader2,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import {
  KpmAuditLogEntry,
  KpmRecord,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  TroubleshootingReconcileSnapshot,
} from '../types/kpm';
import { formatUploadDateTime } from '../utils/imageProcessor';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface HistoryDetailViewProps {
  mode: 'proposal' | 'kpm';
  proposal?: ProposalRecord | null;
  proposalHistory?: ProposalKpmHistoryEntry[];
  record?: KpmRecord | null;
  kpmAuditLogs?: KpmAuditLogEntry[];
  activeReconcileSnapshot?: TroubleshootingReconcileSnapshot | null;
  onUndoReconcileSnapshot?: (
    snapshotOrProposalId: string
  ) => Promise<{ ok: boolean; message?: string; warning?: string }>;
  canUpdate?: boolean;
  onBack: () => void;
}

export function HistoryDetailView({
  mode,
  proposal,
  proposalHistory = [],
  record,
  kpmAuditLogs = [],
  activeReconcileSnapshot = null,
  onUndoReconcileSnapshot,
  canUpdate = true,
  onBack,
}: HistoryDetailViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const { isOffline } = useOfflineStatus();
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);

  const handleConfirmUndo = async () => {
    if (!onUndoReconcileSnapshot || !activeReconcileSnapshot || undoBusy) return;
    setUndoBusy(true);
    try {
      const res = await onUndoReconcileSnapshot(activeReconcileSnapshot.id);
      if (res.ok) {
        setConfirmUndoOpen(false);
      }
    } finally {
      setUndoBusy(false);
    }
  };

  if (mode === 'proposal' && proposal) {
    const rawEntries = proposalHistory.filter(
      (h) =>
        !h.registerCode?.startsWith('ACTLOG::') ||
        h.registerCode === 'ACTLOG::reconcile_apply' ||
        h.registerCode === 'ACTLOG::reconcile_undo'
    );

    if (activeReconcileSnapshot && activeReconcileSnapshot.proposalId === proposal.id) {
      const hasMatchingApply = rawEntries.some(
        (h) =>
          h.registerCode === 'ACTLOG::reconcile_apply' &&
          (h.toProposal === activeReconcileSnapshot.id ||
            h.timestamp === activeReconcileSnapshot.appliedAt)
      );
      if (!hasMatchingApply) {
        rawEntries.push({
          id: `synth-reconcile-${activeReconcileSnapshot.id}`,
          tahun: activeReconcileSnapshot.tahun || proposal.tahun,
          proposalName: activeReconcileSnapshot.proposalName || proposal.namaProposal,
          kpmId: '',
          kpmName: `Penyesuaian BAST diterapkan pada ${activeReconcileSnapshot.proposalName} (${activeReconcileSnapshot.tahun}): ${activeReconcileSnapshot.summary.shiftedCount} bergeser, ${activeReconcileSnapshot.summary.emptySlotsCount} baris kosong, ${activeReconcileSnapshot.summary.movedToDatabaseCount} ke Database.`,
          registerCode: 'ACTLOG::reconcile_apply',
          action: 'entered',
          fromProposal: 'Admin',
          toProposal: activeReconcileSnapshot.id,
          actorName: activeReconcileSnapshot.appliedBy,
          timestamp: activeReconcileSnapshot.appliedAt,
        });
      }
    }

    const entries = rawEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return (
      <div className="min-h-screen pb-10">
        {isNativeApp && (
          <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-bold text-slate-900">Rekam Jejak</h1>
          </header>
        )}

        {!isNativeApp && (
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
            <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3.5 md:px-6">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                aria-label="Kembali"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali</span>
              </button>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                Rekam Jejak
              </h1>
            </div>
          </header>
        )}

        <main
          className={`space-y-4 px-4 pt-4 ${
            !isNativeApp ? 'md:mx-auto md:max-w-4xl md:px-6 md:pt-5' : ''
          }`}
        >
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-sm font-bold text-slate-900">
              {proposal.namaProposal} {proposal.tahun}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {entries.length} riwayat aktivitas KPM &amp; rekonsiliasi BAST
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {entries.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                Belum ada riwayat perpindahan KPM atau rekonsiliasi pada proposal ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const isReconcileApply = entry.registerCode === 'ACTLOG::reconcile_apply';
                  const isReconcileUndo = entry.registerCode === 'ACTLOG::reconcile_undo';

                  if (isReconcileApply || isReconcileUndo) {
                    const matchingActiveApply =
                      isReconcileApply &&
                      activeReconcileSnapshot &&
                      activeReconcileSnapshot.proposalId === proposal.id &&
                      (entry.toProposal === activeReconcileSnapshot.id ||
                        entry.timestamp === activeReconcileSnapshot.appliedAt);

                    return (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-3 px-4 py-3.5 ${
                          matchingActiveApply ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            isReconcileApply
                              ? 'bg-teal-50 text-teal-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {isReconcileApply ? (
                            <Wrench className="h-4 w-4" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {isReconcileApply
                                ? 'Troubleshooting & Rekonsiliasi BAST Dinas'
                                : 'Undo Rekonsiliasi BAST Dinas'}
                            </p>
                            <span
                              className={`shrink-0 text-xs font-bold ${
                                isReconcileApply ? 'text-teal-700' : 'text-amber-700'
                              }`}
                            >
                              {isReconcileApply ? 'Apply BAST' : 'Dibatalkan'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                            {entry.kpmName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 tabular-nums">
                            {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                          </p>
                          {matchingActiveApply && onUndoReconcileSnapshot && (
                            <div className="mt-2.5">
                              <button
                                type="button"
                                disabled={
                                  isOffline ||
                                  !canUpdate ||
                                  proposal.status === 'locked' ||
                                  undoBusy
                                }
                                onClick={() => setConfirmUndoOpen(true)}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Batalkan Apply (Undo)</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const isIncoming = entry.action === 'entered' || entry.action === 'moved_in';
                  const actionSummary =
                    entry.action === 'moved_in'
                      ? `Pindah masuk dari ${entry.fromProposal || 'proposal lain'}`
                      : entry.action === 'moved_out'
                        ? `Pindah keluar ke ${entry.toProposal || 'proposal lain'}`
                        : entry.action === 'removed'
                          ? 'Dihapus dari daftar proposal'
                          : 'Didaftarkan masuk ke proposal';

                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          isIncoming
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {isIncoming ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {entry.kpmName}
                          </p>
                          <span
                            className={`shrink-0 text-xs font-bold ${
                              isIncoming ? 'text-teal-700' : 'text-amber-700'
                            }`}
                          >
                            {isIncoming ? 'Masuk' : 'Keluar'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-700">{actionSummary}</p>
                        <p className="mt-1 text-xs text-slate-500 tabular-nums">
                          {formatUploadDateTime(entry.timestamp)} · Oleh {entry.actorName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        {confirmUndoOpen && activeReconcileSnapshot && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Undo Apply Terakhir"
            onClick={() => !undoBusy && setConfirmUndoOpen(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md space-y-4 rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
            >
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900">Batalkan Apply Terakhir?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Batalkan perubahan Apply terakhir dan kembalikan susunan Proposal{' '}
                    <strong>{activeReconcileSnapshot.proposalName}</strong> &amp; Database ke
                    kondisi sebelum Apply?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={undoBusy}
                  onClick={() => setConfirmUndoOpen(false)}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={undoBusy}
                  onClick={() => void handleConfirmUndo()}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {undoBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{undoBusy ? 'Mengembalikan...' : 'Ya, Batalkan Apply'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // KPM full history mode
  const logs = [...kpmAuditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const initialCreationEntry =
    logs.find((l) => l.action === 'created') ?? logs[logs.length - 1] ?? null;

  return (
    <div className="min-h-screen pb-10">
      {isNativeApp && (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">Rekam Jejak</h1>
        </header>
      )}

      {!isNativeApp && (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3.5 md:px-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
              Rekam Jejak
            </h1>
          </div>
        </header>
      )}

      <main
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'md:mx-auto md:max-w-4xl md:px-6 md:pt-5' : ''
        }`}
      >
        {record && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-sm font-bold text-slate-900">{record.nama}</p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {record.registerCode} · {record.proposal} ({record.tahun})
            </p>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {initialCreationEntry && (
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Clock className="h-3.5 w-3.5 text-teal-700" />
                <span>Waktu Input Awal</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-900 tabular-nums">
                {formatUploadDateTime(initialCreationEntry.timestamp)} · Oleh{' '}
                {initialCreationEntry.actorName}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Masuk ke <strong>{initialCreationEntry.proposal}</strong> · Tahun{' '}
                {initialCreationEntry.tahun}
              </p>
            </div>
          )}

          {logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              Belum ada riwayat perubahan data KPM ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((entry) => {
                const title =
                  entry.action === 'created'
                    ? 'Data KPM Didaftarkan'
                    : entry.action === 'status_changed'
                      ? 'Perubahan Status Validasi'
                      : 'Pembaruan Data KPM';

                return (
                  <div key={entry.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{title}</p>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {formatUploadDateTime(entry.timestamp)} · Oleh{' '}
                          <span className="font-semibold text-slate-700">{entry.actorName}</span>
                        </p>
                        {entry.actorEmail && (
                          <p className="text-xs text-slate-400">{entry.actorEmail}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-500 tabular-nums">
                        {entry.tahun}
                      </span>
                    </div>

                    {entry.changes.length > 0 && (
                      <div className="mt-2.5 space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        {entry.changes.map((chg, idx) => (
                          <div key={`${entry.id}-${chg.field}-${idx}`} className="text-xs">
                            <p className="font-semibold text-slate-700">{chg.field}</p>
                            {chg.before === '-' ? (
                              <p className="mt-0.5 font-medium text-teal-800">{chg.after}</p>
                            ) : (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="text-slate-500 line-through">{chg.before}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="font-semibold text-teal-800">{chg.after}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
