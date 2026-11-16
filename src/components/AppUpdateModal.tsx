import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
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
  onDismissLater?: () => void;
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-800">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderReleaseNotesContent(rawNotes: string) {
  const text =
    (rawNotes || '').trim() ||
    'Pembaruan performa, perbaikan stabilitas, dan peningkatan fitur operasional MASDETA.';
  const lines = text.split(/\r?\n/);

  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-600">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        if (/^#{1,3}\s+/.test(line)) {
          return (
            <p key={idx} className="pt-1 text-xs font-bold text-slate-800">
              {renderInlineBold(line.replace(/^#{1,3}\s+/, ''))}
            </p>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          const itemText = line.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]"
              />
              <span className="min-w-0 flex-1">{renderInlineBold(itemText)}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export function AppUpdateModal({ updateInfo, open, onDismissLater }: AppUpdateModalProps) {
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasCachedApk, setHasCachedApk] = useState(false);

  useEffect(() => {
    if (!open || !updateInfo) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, updateInfo]);

  if (!open || !updateInfo) return null;

  const isNative = Capacitor.isNativePlatform();
  const sizeLabel = formatBytes(totalBytes || updateInfo.apkSizeBytes);
  const downloadedLabel = formatBytes(downloadedBytes);
  const manualUrl = updateInfo.apkDownloadUrl || updateInfo.releaseUrl;
  const trimmedNotes = (updateInfo.releaseNotes || '').trim();
  const hasLongNotes =
    trimmedNotes.split(/\r?\n/).filter((l) => l.trim().length > 0).length > 4 ||
    trimmedNotes.length > 200;

  const handleStartUpdate = async () => {
    if (!updateInfo.apkDownloadUrl) {
      triggerManualBrowserDownload(updateInfo.releaseUrl);
      setStatusMessage(
        'Halaman unduhan resmi dibuka. Pasang pembaruan terbaru lalu buka kembali aplikasi MASDETA.'
      );
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
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

      setPhase('idle');
      setStatusMessage(
        result.openedNativeInstaller
          ? 'Pemasang Android telah dibuka. Selesaikan proses instalasi agar aplikasi dapat digunakan kembali.'
          : 'Unduhan file APK pembaruan dimulai. Pasang versi terbaru agar kunci aplikasi terbuka.'
      );
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
        setStatusMessage(
          'Pemasang Android dibuka kembali. Selesaikan instalasi pembaruan untuk melanjutkan.'
        );
        return;
      } catch {
        // Lanjut ke unduh manual melalui browser jika intent tetap diblokir
      }
    }
    triggerManualBrowserDownload(manualUrl);
    setStatusMessage(
      'Unduhan manual dibuka. Setelah selesai mengunduh, pasang APK versi terbaru lalu buka kembali MASDETA.'
    );
  };

  const isMandatory = Boolean(updateInfo.isMandatory);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="masdeta-update-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (!isMandatory && phase !== 'downloading' && phase !== 'installing') {
          onDismissLater?.();
        }
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bertema #0F766E */}
        <div className="shrink-0 bg-[#0F766E] px-5 pt-5 pb-4 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="masdeta-update-title" className="text-base font-bold tracking-tight">
                Update MASDETA Tersedia
              </h2>
              <p className="mt-0.5 truncate text-xs text-teal-100">
                {updateInfo.releaseName || `MASDETA v${updateInfo.latestVersion}`}
              </p>
            </div>
            {!isMandatory && onDismissLater && (
              <button
                type="button"
                disabled={phase === 'downloading' || phase === 'installing'}
                onClick={onDismissLater}
                aria-label="Tutup sementara"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
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
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Peringatan Penguncian Versi Lama atau Info Anjuran Update */}
          {isMandatory ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="leading-snug">
                <span className="font-bold">Versi lama dikunci sementara.</span> Demi menjaga konsistensi data, Anda wajib memasang pembaruan terbaru sebelum melanjutkan menggunakan aplikasi.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" />
              <p className="leading-snug">
                <span className="font-bold">Pembaruan tambalan tersedia.</span> Disarankan segera memperbarui APK untuk perbaikan bug dan peningkatan performa terbaru.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
              <p className="text-xs font-bold text-slate-800">Catatan Pembaruan</p>
              {sizeLabel && (
                <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                  Ukuran: {sizeLabel}
                </span>
              )}
            </div>
            <div className="mt-2.5 max-h-44 touch-pan-y overflow-y-auto overscroll-contain pr-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
              {renderReleaseNotesContent(updateInfo.releaseNotes)}
            </div>
            {hasLongNotes && (
              <p className="mt-2 border-t border-slate-200/70 pt-1.5 text-center text-[10px] font-medium text-slate-400">
                Gulir ke bawah di kotak ini untuk melihat semua pembaruan
              </p>
            )}
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

          {/* Status Pasca Trigger Pemasang */}
          {statusMessage && phase === 'idle' && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200 bg-teal-50 p-3.5 text-xs text-teal-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" />
              <p className="leading-snug font-medium">{statusMessage}</p>
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

          {isNative && phase === 'idle' && !statusMessage && (
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
              <span>
                Pada pembaruan pertama, Android akan meminta izin &ldquo;Izinkan dari sumber ini&rdquo; sebelum popup instalasi muncul.
              </span>
            </div>
          )}

          {/* Tombol Aksi Wajib Update (Tanpa "Nanti Saja") */}
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
              disabled={phase === 'downloading'}
              onClick={() => void handleFallbackOpenOrDownload()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>Buka Halaman Pengaturan Izin / Unduh Manual</span>
            </button>

            {!isMandatory && onDismissLater && (
              <button
                type="button"
                disabled={phase === 'downloading' || phase === 'installing'}
                onClick={onDismissLater}
                className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                Ingatkan Nanti
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
