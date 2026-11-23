import { useState } from 'react';
import { Eye, Loader2, RefreshCw, WifiOff } from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  isChecking?: boolean;
  onRetry?: () => Promise<boolean> | void;
  withSidebarOffset?: boolean;
  isNativeApp?: boolean;
}

export function OfflineIndicator({
  isOnline,
  isChecking = false,
  onRetry,
  withSidebarOffset = false,
  isNativeApp = false,
}: OfflineIndicatorProps) {
  const [retryFailed, setRetryFailed] = useState(false);

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
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-40 border-b border-amber-300/80 bg-amber-50/95 text-amber-950 shadow-xs backdrop-blur-md print:hidden masdeta-no-print ${
        withSidebarOffset && !isNativeApp ? 'md:pl-64' : ''
      }`}
    >
      <div
        className={`mx-auto flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 ${
          isNativeApp ? 'max-w-md' : 'max-w-[1440px] md:px-6'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 border border-amber-300/70">
            <WifiOff className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-tight text-amber-950">
                Mode Offline · Antrean Lokal Aktif
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                <Eye className="h-3 w-3" />
                Simpan di Perangkat
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-amber-900/90">
              {retryFailed && !isChecking
                ? 'Koneksi belum kembali. Anda tetap bisa foto & simpan KPM; semuanya diamankan di perangkat dan otomatis diunggah saat sinyal pulih.'
                : 'Pengambilan foto & input data tetap berjalan offline dan tersimpan aman di perangkat hingga sinyal kembali.'}
            </p>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            disabled={isChecking}
            onClick={() => void handleRetryClick()}
            className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 text-[11px] font-bold text-amber-950 shadow-2xs transition-colors hover:bg-amber-100/70 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Memeriksa...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Cek Koneksi</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
