import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Clock } from 'lucide-react';
import {
  KpmAuditLogEntry,
  KpmRecord,
  ProposalKpmHistoryEntry,
  ProposalRecord,
} from '../types/kpm';
import { formatUploadDateTime } from '../utils/imageProcessor';

interface HistoryDetailViewProps {
  mode: 'proposal' | 'kpm';
  proposal?: ProposalRecord | null;
  proposalHistory?: ProposalKpmHistoryEntry[];
  record?: KpmRecord | null;
  kpmAuditLogs?: KpmAuditLogEntry[];
  onBack: () => void;
}

export function HistoryDetailView({
  mode,
  proposal,
  proposalHistory = [],
  record,
  kpmAuditLogs = [],
  onBack,
}: HistoryDetailViewProps) {
  if (mode === 'proposal' && proposal) {
    const entries = [...proposalHistory].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );

    return (
      <div className="min-h-screen pb-10">
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

        <main className="space-y-4 px-4 pt-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-sm font-bold text-slate-900">
              {proposal.namaProposal} {proposal.tahun}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {entries.length} riwayat keluar/masuk KPM
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {entries.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                Belum ada riwayat perpindahan KPM pada proposal ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.map((entry) => {
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
                          <p className="truncate text-sm font-bold text-slate-900">
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
      </div>
    );
  }

  // KPM full history mode
  const logs = [...kpmAuditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const initialCreationEntry =
    logs.find((l) => l.action === 'created') ?? logs[logs.length - 1] ?? null;

  return (
    <div className="min-h-screen pb-10">
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

      <main className="space-y-4 px-4 pt-4">
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
              <p className="mt-1 text-xs font-bold text-slate-900 tabular-nums">
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
                        <p className="text-sm font-bold text-slate-900">{title}</p>
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
