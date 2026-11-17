import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Layers, SquareDashed, Trash2 } from 'lucide-react';
import { SlotRemovalMode } from '../types/kpm';

interface SlotHandlingConfirmModalProps {
  isOpen: boolean;
  actionType: 'delete' | 'move';
  kpmName: string;
  registerCode?: string;
  originProposalName?: string;
  originSlotNumber?: number | null;
  destinationLabel?: string;
  requiresSlotChoice: boolean;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (slotHandling: SlotRemovalMode) => void;
}

export function SlotHandlingConfirmModal({
  isOpen,
  actionType,
  kpmName,
  registerCode,
  originProposalName,
  originSlotNumber,
  destinationLabel,
  requiresSlotChoice,
  isBusy = false,
  onCancel,
  onConfirm,
}: SlotHandlingConfirmModalProps) {
  const [step, setStep] = useState<'choose' | 'confirm'>(
    requiresSlotChoice ? 'choose' : 'confirm'
  );
  const [selectedMode, setSelectedMode] = useState<SlotRemovalMode>('vacate');

  useEffect(() => {
    if (isOpen) {
      setStep(requiresSlotChoice ? 'choose' : 'confirm');
      setSelectedMode(requiresSlotChoice ? 'vacate' : 'collapse');
    }
  }, [isOpen, requiresSlotChoice]);

  if (!isOpen) return null;

  const slotLabel =
    originSlotNumber && originSlotNumber > 0
      ? `#${String(originSlotNumber).padStart(2, '0')}`
      : 'ini';
  const isDelete = actionType === 'delete';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={() => !isBusy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={
        step === 'choose'
          ? 'Pilih Penanganan Nomor Urut'
          : 'Konfirmasi Apakah Anda Yakin'
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-3xl space-y-4"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

        {step === 'choose' ? (
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
                    ? 'Pilih Cara Hapus & Nomor Urut'
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
                  Pilih bagaimana nomor urut ini ditangani:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setSelectedMode('vacate');
                  setStep('confirm');
                }}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 active:scale-[0.99]"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 border border-amber-200">
                  <SquareDashed className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {isDelete
                      ? 'Hapus Data, Kosongkan Nomor Urut'
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
                disabled={isBusy}
                onClick={() => {
                  setSelectedMode('collapse');
                  setStep('confirm');
                }}
                className="flex w-full items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-rose-300 hover:bg-rose-50/40 active:scale-[0.99]"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {isDelete
                      ? 'Hapus Beserta Nomor Urutnya'
                      : 'Pindahkan Beserta Nomor Urutnya'}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Menghapus nomor urut <strong className="font-mono">{slotLabel}</strong>{' '}
                    sehingga KPM di bawahnya otomatis bergeser naik mengisi urutan.
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
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isDelete ? 'bg-rose-50 text-rose-600' : 'bg-teal-50 text-teal-700'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">Apakah Anda yakin?</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {isDelete ? (
                    <>
                      Data calon KPM <strong>&ldquo;{kpmName}&rdquo;</strong>
                      {registerCode ? ` (${registerCode})` : ''} akan dihapus dari daftar aktif dan
                      dipindahkan ke Tempat Sampah (tersimpan 30 hari).
                    </>
                  ) : (
                    <>
                      Data calon KPM <strong>&ldquo;{kpmName}&rdquo;</strong> akan disimpan dan
                      dipindahkan dari <strong>{originProposalName}</strong> ke{' '}
                      <strong>{destinationLabel || 'tujuan baru'}</strong>.
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
                onClick={() => (requiresSlotChoice ? setStep('choose') : onCancel())}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {requiresSlotChoice && <ArrowLeft className="h-4 w-4" />}
                <span>{requiresSlotChoice ? 'Pilih Ulang' : 'Batal'}</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onConfirm(selectedMode)}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${
                  isDelete
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {isBusy
                  ? 'Memproses...'
                  : isDelete
                    ? 'Ya, Hapus'
                    : 'Ya, Simpan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
