import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  AppUpdateInfo,
  downloadAndInstallApk,
  formatBytes,
  openCachedUpdateApk,
  triggerManualBrowserDownload,
} from '../services/appUpdater';

interface AppUpdateModalProps {
  updateInfo: AppUpdateInfo | null;
  open: boolean;
  onDismiss: () => void;
}

export function AppUpdateModal({ updateInfo, open, onDismiss }: AppUpdateModalProps) {
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCachedApk, setHasCachedApk] = useState(false);

  if (!open || !updateInfo) return null;

  const isNative = Capacitor.isNativePlatform();
  const sizeLabel = formatBytes(totalBytes || updateInfo.apkSizeBytes);
  const downloadedLabel = formatBytes(downloadedBytes);
  const manualUrl = updateInfo.apkDownloadUrl || updateInfo.releaseUrl;

  const handleStartUpdate = async () => {
    if (!updateInfo.apkDownloadUrl) {
      triggerManualBrowserDownload(updateInfo.releaseUrl);
      return;
    }

    setErrorMessage(null);
    setPhase('downloading');
    setProgress(0);

    try {
      const result = await downloadAndInstallApk(
        updateInfo.apkDownloadUrl,
        (pct, bytes, total) => {
          setProgress(pct);
          if (typeof bytes === 'number') setDownloadedBytes(bytes);
          if (typeof total === 'number') setTotalBytes(total);
          if (pct >= 100) {
            setPhase('installing');
          }
        }
      );

      if (result.downloadedPath) {
        setHasCachedApk(true);
      }

      if (!result.openedNativeInstaller) {
        onDismiss();
      } else {
        setPhase('idle');
      }
    } catch (err) {
      setPhase('error');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Gagal mengunduh atau membuka pemasang APK otomatis.'
      );
    }
  };

  const handleFallbackOpenOrDownload = async () => {
    setErrorMessage(null);
    if (isNative && hasCachedApk) {
      try {
        await openCachedUpdateApk();
        return;
      } catch {
        // Lanjut ke unduh manual melalui browser jika intent tetap diblokir
      }
    }
    triggerManualBrowserDownload(manualUrl);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="masdeta-update-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
        {/* Header Bertema #0F766E */}
        <div className="bg-[#0F766E] px-5 pt-5 pb-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 id="masdeta-update-title" className="text-base font-bold tracking-tight">
                  Pembaruan Aplikasi Tersedia
                </h2>
                <p className="mt-0.5 text-xs text-teal-100">
                  {updateInfo.releaseName || `MASDETA v${updateInfo.latestVersion}`}
                </p>
              </div>
            </div>

            {phase !== 'downloading' && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Tutup pembaruan"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-teal-100 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Perbandingan Versi Lama vs Baru */}
          <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-white/12 px-3.5 py-2.5 text-xs">
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-teal-100">
                Versi Terpasang
              </span>
              <span className="font-bold tabular-nums text-white">
                v{updateInfo.currentVersion}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-teal-200" />
            <div className="text-right">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-teal-100">
                Versi Terbaru
              </span>
              <span className="font-bold tabular-nums text-white">
                v{updateInfo.latestVersion}
              </span>
            </div>
          </div>
        </div>

        {/* Body & Release Notes */}
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">Catatan Pembaruan</p>
              {sizeLabel && (
                <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                  Ukuran: {sizeLabel}
                </span>
              )}
            </div>
            <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {updateInfo.releaseNotes ||
                'Pembaruan performa, perbaikan stabilitas, dan peningkatan fitur operasional MASDETA.'}
            </div>
          </div>

          {/* Progress Bar Real-time saat mengunduh */}
          {(phase === 'downloading' || phase === 'installing') && (
            <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-teal-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0F766E]" />
                  {phase === 'installing'
                    ? 'Membuka pemasang Android...'
                    : 'Mengunduh pembaruan APK...'}
                </span>
                <span className="tabular-nums font-bold text-[#0F766E]">{progress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-teal-100">
                <div
                  className="h-full rounded-full bg-[#0F766E] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {downloadedLabel && (
                <p className="text-[11px] tabular-nums text-teal-800">
                  {downloadedLabel}
                  {sizeLabel ? ` dari ${sizeLabel}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Error / Info Izin Instalasi */}
          {phase === 'error' && errorMessage && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="space-y-1">
                <p className="font-semibold leading-snug">{errorMessage}</p>
                <p className="text-[11px] text-rose-700">
                  Jika perangkat memblokir pemasangan otomatis, izinkan pemasangan dari sumber ini di Pengaturan atau unduh manual.
                </p>
              </div>
            </div>
          )}

          {isNative && phase === 'idle' && (
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
              <span>
                Pada pembaruan pertama, Android akan meminta izin &ldquo;Izinkan dari sumber ini&rdquo; sebelum popup instalasi muncul.
              </span>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={phase === 'downloading' || phase === 'installing'}
              onClick={() => void handleStartUpdate()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#0F766E] px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
            >
              {phase === 'downloading' || phase === 'installing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{phase === 'installing' ? 'Menyiapkan Pemasang...' : `Mengunduh (${progress}%)`}</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Update Sekarang</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleFallbackOpenOrDownload()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>Buka Halaman Pengaturan Izin / Unduh Manual</span>
            </button>

            <button
              type="button"
              disabled={phase === 'downloading'}
              onClick={onDismiss}
              className="min-h-[44px] w-full whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Nanti Saja
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
