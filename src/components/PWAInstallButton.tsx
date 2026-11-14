import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guideType, setGuideType] = useState<'ios' | 'android' | null>(null);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>Pasang App</span>
      </button>
    );
  }

  if (!isIOS && !isAndroid) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setGuideType(isIOS ? 'ios' : 'android')}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 whitespace-nowrap shrink-0"
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        <span>Pasang HP</span>
      </button>

      {guideType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="pwa-guide-title" className="text-base font-bold text-slate-900">
                {guideType === 'ios' ? 'Pasang MASDETA di iPhone / iPad' : 'Pasang MASDETA di Android'}
              </h3>
              <button
                type="button"
                onClick={() => setGuideType(null)}
                className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Tutup panduan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {guideType === 'ios' ? (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-slate-600 leading-relaxed">
                <li>Buka tautan aplikasi ini melalui browser <strong>Safari</strong>.</li>
                <li>Ketuk tombol <strong>Bagikan (Share)</strong> pada bilah Safari.</li>
                <li>Pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</li>
              </ol>
            ) : (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-slate-600 leading-relaxed">
                <li>Buka tautan aplikasi ini langsung di browser <strong>Google Chrome</strong> (bukan di dalam frame pratinjau).</li>
                <li>Ketuk ikon menu titik tiga (<strong>⋮</strong>) di pojok kanan atas Chrome.</li>
                <li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setGuideType(null)}
              className="mt-4 min-h-[42px] w-full rounded-xl bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-3 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Mode Offline — Data lokal tetap tersimpan di perangkat.</span>
    </div>
  );
}
