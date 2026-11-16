import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Lock, RefreshCw, WifiOff } from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  isChecking?: boolean;
  onRetry?: () => Promise<boolean> | void;
}

export function OfflineIndicator({
  isOnline,
  isChecking = false,
  onRetry,
}: OfflineIndicatorProps) {
  const [retryFailed, setRetryFailed] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setRetryFailed(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOnline]);

  if (isOnline) return null;

  const handleRetryClick = async () => {
    if (isChecking || !onRetry) return;
    setRetryFailed(false);
    const ok = await onRetry();
    if (ok === false) {
      setRetryFailed(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="masdeta-online-required-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/92 p-4 backdrop-blur-md"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Terkunci */}
        <div className="bg-[#0F766E] px-5 pt-5 pb-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <WifiOff className="h-5.5 w-5.5 text-white" />
            </div>
            <div className="min-w-0">
              <h2
                id="masdeta-online-required-title"
                className="text-base font-bold tracking-tight text-white"
              >
                Koneksi Internet Diperlukan
              </h2>
              <p className="mt-0.5 text-xs text-teal-100">
                Akses offline dinonaktifkan
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="leading-relaxed">
              Aplikasi <span className="font-bold">MASDETA</span> wajib terhubung ke internet aktif untuk dibuka dan dijalankan demi menjaga keaslian data real-time serta mencegah pengoperasian offline.
            </p>
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Langkah membuka akses:</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span>Aktifkan Data Seluler atau sambungkan ke Wi-Fi</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span>Pastikan Mode Pesawat tidak aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span>Pastikan jaringan memiliki akses internet aktif</span>
            </div>
          </div>

          {retryFailed && !isChecking && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700">
              Koneksi internet belum terdeteksi. Periksa jaringan Anda lalu coba lagi.
            </p>
          )}

          <button
            type="button"
            disabled={isChecking}
            onClick={() => void handleRetryClick()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memeriksa Koneksi...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Periksa Koneksi Ulang</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
