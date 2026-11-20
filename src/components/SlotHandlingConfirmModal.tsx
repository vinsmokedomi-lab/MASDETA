import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  Database,
  Layers,
  SquareDashed,
  Trash2,
} from 'lucide-react';
import { KpmDeleteAction, SlotRemovalMode, ValidationStatus } from '../types/kpm';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface SlotHandlingConfirmModalProps {
  isOpen: boolean;
  actionType: 'delete' | 'move';
  kpmName: string;
  registerCode?: string;
  originProposalName?: string;
  originSlotNumber?: number | null;
  destinationLabel?: string;
  currentStatus?: ValidationStatus;
  requiresSlotChoice: boolean;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (slotHandling: SlotRemovalMode, deleteAction?: KpmDeleteAction) => void;
}

type ModalStep = 'disposition' | 'choose' | 'confirm';

export function SlotHandlingConfirmModal({
  isOpen,
  actionType,
  kpmName,
  registerCode,
  originProposalName,
  originSlotNumber,
  destinationLabel,
  currentStatus,
  requiresSlotChoice,
  isBusy = false,
  onCancel,
  onConfirm,
}: SlotHandlingConfirmModalProps) {
  const { isOffline } = useOfflineStatus();
  const isDelete = actionType === 'delete';

  const [step, setStep] = useState<ModalStep>(
    isDelete ? 'disposition' : requiresSlotChoice ? 'choose' : 'confirm'
  );
  const [selectedMode, setSelectedMode] = useState<SlotRemovalMode>(
    requiresSlotChoice ? 'vacate' : 'collapse'
  );
  const [selectedDeleteAction, setSelectedDeleteAction] =
    useState<KpmDeleteAction>('database');

  useEffect(() => {
    if (isOpen) {
      setStep(isDelete ? 'disposition' : requiresSlotChoice ? 'choose' : 'confirm');
      setSelectedMode(requiresSlotChoice ? 'vacate' : 'collapse');
      setSelectedDeleteAction('database');
    }
  }, [isOpen, isDelete, requiresSlotChoice]);

  if (!isOpen) return null;

  const slotLabel =
    originSlotNumber && originSlotNumber > 0
      ? `#${String(originSlotNumber).padStart(2, '0')}`
      : 'ini';

  const hasOriginProposal = Boolean(originProposalName?.trim());
  const alreadyInDatabase = currentStatus === 'pending' && !hasOriginProposal;
  const alreadyRejected = currentStatus === 'rejected' && !hasOriginProposal;
  const actionsDisabled = isBusy || isOffline;

  const handleSelectDeleteAction = (action: KpmDeleteAction) => {
    if (actionsDisabled) return;
    setSelectedDeleteAction(action);
    if (requiresSlotChoice) {
      setStep('choose');
    } else {
      setStep('confirm');
    }
  };

  const deleteActionLabel =
    selectedDeleteAction === 'database'
      ? 'Masukkan ke Database KPM'
      : selectedDeleteAction === 'rejected'
        ? 'Tandai Ditolak (Arsip)'
        : 'Hapus Permanen';

  const confirmIconBg = !isDelete
    ? 'bg-teal-50 text-teal-700'
    : selectedDeleteAction === 'database'
      ? 'bg-teal-50 text-teal-700'
      : selectedDeleteAction === 'rejected'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-rose-50 text-rose-600';

  const confirmBtnClass = !isDelete
    ? 'bg-teal-700 hover:bg-teal-800'
    : selectedDeleteAction === 'database'
      ? 'bg-teal-700 hover:bg-teal-800'
      : selectedDeleteAction === 'rejected'
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-rose-600 hover:bg-rose-700';

  const confirmBtnText = isBusy
    ? 'Memproses...'
    : !isDelete
      ? 'Ya, Simpan'
      : selectedDeleteAction === 'database'
        ? 'Ya, Simpan ke Database'
        : selectedDeleteAction === 'rejected'
          ? 'Ya, Tandai Ditolak'
          : 'Ya, Hapus Permanen';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={() => !isBusy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={
        step === 'disposition'
          ? 'Pilih Tindakan Hapus KPM'
          : step === 'choose'
            ? 'Pilih Penanganan Nomor Urut'
            : 'Konfirmasi Apakah Anda Yakin'
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

        {step === 'disposition' && isDelete ? (
          <>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  Pilih Tindakan Hapus KPM
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  <strong>{kpmName}</strong>
                  {registerCode ? (
                    <span className="font-mono text-slate-500"> ({registerCode})</span>
                  ) : null}
                  {hasOriginProposal ? (
                    <>
                      {' '}
                      di <strong>{originProposalName}</strong>
                    </>
                  ) : null}
                  . Pilih apakah data disimpan untuk dipakai ulang atau dihapus permanen:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={actionsDisabled || alreadyInDatabase}
                onClick={() => handleSelectDeleteAction('database')}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-teal-200 bg-teal-50/60 p-3.5 text-left transition-colors hover:border-teal-400 hover:bg-teal-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:opacity-60"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-700">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      Masukkan ke Database KPM
                    </p>
                    {alreadyInDatabase ? (
                      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        Sudah di Database
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                        Siap Pakai Ulang
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Data, foto KTP/KK &amp; berkas tetap tersimpan di{' '}
                    <strong>Database KPM</strong> agar bisa dimasukkan kembali ke proposal lain
                    tanpa input ulang.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={actionsDisabled || alreadyRejected}
                onClick={() => handleSelectDeleteAction('rejected')}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50/55 p-3.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:opacity-60"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
                  <Archive className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      Tandai Ditolak (Arsip)
                    </p>
                    {alreadyRejected && (
                      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        Sudah di Arsip
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Dipindahkan ke <strong>Arsip Berkas Ditolak</strong> sebagai catatan, data
                    tetap aman dan sewaktu-waktu bisa dipulihkan kembali.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => handleSelectDeleteAction('permanent')}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rose-700">Hapus Permanen</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Menghapus data KPM secara permanen beserta dokumen foto &amp; riwayat
                    terkait. Data yang dihapus permanen tidak dapat dikembalikan.
                  </p>
                </div>
              </button>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={onCancel}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
          </>
        ) : step === 'choose' ? (
          <>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isDelete ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {isDelete ? (
                  <Trash2 className="h-5 w-5" />
                ) : (
                  <ArrowRightLeft className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  {isDelete
                    ? 'Pilih Penanganan Nomor Urut'
                    : 'Pilih Penanganan Nomor Urut Lama'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  <strong>{kpmName}</strong>
                  {originProposalName ? (
                    <>
                      {' '}
                      saat ini berada pada nomor urut{' '}
                      <strong className="font-mono text-slate-900">{slotLabel}</strong> di{' '}
                      <strong>{originProposalName}</strong>.
                    </>
                  ) : (
                    '.'
                  )}{' '}
                  {isDelete ? (
                    <>
                      Tindakan: <strong>{deleteActionLabel}</strong>.{' '}
                    </>
                  ) : null}
                  Pilih bagaimana nomor urut ini ditangani:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => {
                  setSelectedMode('vacate');
                  setStep('confirm');
                }}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
                  <SquareDashed className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {isDelete
                      ? 'Keluarkan Data, Kosongkan Nomor Urut'
                      : 'Pindahkan Data, Kosongkan Nomor Urut'}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Menjadikan urutan <strong className="font-mono">{slotLabel}</strong> sebagai{' '}
                    <strong>Baris Kosong</strong> agar nomor urut KPM di bawahnya tetap aman
                    mengikuti SK Dinas / BAST.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => {
                  setSelectedMode('collapse');
                  setStep('confirm');
                }}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {isDelete
                      ? 'Keluarkan Beserta Nomor Urutnya'
                      : 'Pindahkan Beserta Nomor Urutnya'}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Menghapus nomor urut <strong className="font-mono">{slotLabel}</strong>{' '}
                    sehingga KPM di bawahnya otomatis bergeser naik mengisi urutan.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              {isDelete && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setStep('disposition')}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Kembali</span>
                </button>
              )}
              <button
                type="button"
                disabled={isBusy}
                onClick={onCancel}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${confirmIconBg}`}
              >
                {!isDelete ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : selectedDeleteAction === 'database' ? (
                  <Database className="h-5 w-5" />
                ) : selectedDeleteAction === 'rejected' ? (
                  <Archive className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">Apakah Anda yakin?</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {!isDelete ? (
                    <>
                      Data KPM <strong>&ldquo;{kpmName}&rdquo;</strong> akan disimpan dan
                      dipindahkan dari <strong>{originProposalName}</strong> ke{' '}
                      <strong>{destinationLabel || 'tujuan baru'}</strong>.
                    </>
                  ) : selectedDeleteAction === 'database' ? (
                    <>
                      Data KPM <strong>&ldquo;{kpmName}&rdquo;</strong>
                      {registerCode ? ` (${registerCode})` : ''} akan dilepas dari proposal aktif
                      dan disimpan ke <strong>Database KPM</strong> (lengkap dengan foto &amp;
                      berkas) agar dapat dipakai ulang kapan saja.
                    </>
                  ) : selectedDeleteAction === 'rejected' ? (
                    <>
                      Data KPM <strong>&ldquo;{kpmName}&rdquo;</strong>
                      {registerCode ? ` (${registerCode})` : ''} akan ditandai{' '}
                      <strong>Ditolak</strong> dan dipindahkan ke{' '}
                      <strong>Arsip Berkas Ditolak</strong> (tetap dapat dipulihkan nanti).
                    </>
                  ) : (
                    <>
                      Data KPM <strong>&ldquo;{kpmName}&rdquo;</strong>
                      {registerCode ? ` (${registerCode})` : ''} beserta dokumen foto &amp;
                      riwayat terkait akan <strong>dihapus permanen</strong> dan tidak dapat
                      dikembalikan.
                    </>
                  )}
                </p>
              </div>
            </div>

            {requiresSlotChoice && (
              <div
                className={`rounded-2xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                  selectedMode === 'vacate'
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-rose-200 bg-rose-50 text-rose-950'
                }`}
              >
                <p className="font-bold">
                  Pilihan Nomor Urut {slotLabel}:{' '}
                  {selectedMode === 'vacate'
                    ? 'Kosongkan Nomor Urut (Baris Kosong)'
                    : 'Hapus Beserta Nomor Urutnya'}
                </p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  {selectedMode === 'vacate'
                    ? `Urutan ${slotLabel} di ${originProposalName || 'proposal'} akan disisakan sebagai Baris Kosong sehingga KPM berikutnya tidak bergeser.`
                    : `Urutan ${slotLabel} ikut dihapus dan KPM di bawahnya akan langsung bergeser naik.`}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (requiresSlotChoice) {
                    setStep('choose');
                  } else if (isDelete) {
                    setStep('disposition');
                  } else {
                    onCancel();
                  }
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {(requiresSlotChoice || isDelete) && <ArrowLeft className="h-4 w-4" />}
                <span>{requiresSlotChoice || isDelete ? 'Pilih Ulang' : 'Batal'}</span>
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() =>
                  onConfirm(selectedMode, isDelete ? selectedDeleteAction : undefined)
                }
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${confirmBtnClass}`}
              >
                {confirmBtnText}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
