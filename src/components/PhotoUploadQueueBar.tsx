import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  CloudUpload,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { useOfflineStatus } from '../contexts/OfflineContext';
import { formatBytes } from '../utils/imageProcessor';
import {
  cancelPendingPhotoUploadJob,
  downloadPendingJobToGallery,
  getAutoSaveGallerySetting,
  PhotoUploadJobSummary,
  retryAllPendingPhotoUploads,
  retryPhotoUploadJob,
  setAutoSaveGallerySetting,
  subscribePhotoUploadJobs,
} from '../utils/photoUploadManager';

interface PhotoUploadQueueBarProps {
  hasBottomNav?: boolean;
  isNativeApp?: boolean;
  onSelectKpm?: (kpmId: string) => void;
  onJobRemoved?: (job: PhotoUploadJobSummary) => void;
}

export function PhotoUploadQueueBar({
  hasBottomNav = false,
  isNativeApp = false,
  onSelectKpm,
  onJobRemoved,
}: PhotoUploadQueueBarProps) {
  const { isOffline } = useOfflineStatus();
  const [jobs, setJobs] = useState<PhotoUploadJobSummary[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autoSaveGallery, setAutoSaveGallery] = useState<boolean>(() =>
    getAutoSaveGallerySetting()
  );
  const [confirmRemoveJobId, setConfirmRemoveJobId] = useState<string | null>(null);
  const [galleryToast, setGalleryToast] = useState<string | null>(null);

  useEffect(() => {
    return subscribePhotoUploadJobs((nextJobs) => {
      setJobs(nextJobs);
      setAutoSaveGallery(getAutoSaveGallerySetting());
      if (nextJobs.length === 0) {
        setConfirmRemoveJobId(null);
      }
    });
  }, []);

  if (jobs.length === 0) return null;

  const uploadingCount = jobs.filter((j) => j.status === 'uploading').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;

  const handleToggleAutoSave = () => {
    const next = !autoSaveGallery;
    setAutoSaveGallery(next);
    setAutoSaveGallerySetting(next);
  };

  const handleManualSaveGallery = async (jobId: string) => {
    const ok = await downloadPendingJobToGallery(jobId);
    setGalleryToast(
      ok
        ? 'Salinan foto berhasil dikirim ke Galeri / Unduhan perangkat.'
        : 'Memori perangkat terbatas atau izin ditolak. Foto tetap aman di cache aplikasi.'
    );
    window.setTimeout(() => setGalleryToast(null), 3500);
  };

  const handleConfirmDelete = async (job: PhotoUploadJobSummary) => {
    setConfirmRemoveJobId(null);
    await cancelPendingPhotoUploadJob(job.id);
    onJobRemoved?.(job);
  };

  const bottomPositionClass = hasBottomNav
    ? 'bottom-[74px]'
    : 'bottom-4';

  const pillColorClass = isOffline
    ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-amber-900/10'
    : failedCount > 0 && uploadingCount === 0
      ? 'border-rose-300 bg-rose-50 text-rose-950 shadow-rose-900/10'
      : 'border-teal-300 bg-white text-slate-900 shadow-teal-900/15';

  return (
    <>
      <div
        className={`fixed z-40 print:hidden masdeta-no-print ${bottomPositionClass} ${
          isNativeApp ? 'left-3' : 'left-3 md:left-[272px]'
        }`}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-left shadow-lg backdrop-blur-md transition-all hover:scale-[1.01] active:scale-[0.98] ${pillColorClass}`}
          title="Lihat antrean foto yang diamankan di perangkat"
        >
          {isOffline ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800">
              <WifiOff className="h-3.5 w-3.5" />
            </span>
          ) : uploadingCount > 0 ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          ) : failedCount > 0 ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700">
              <CloudUpload className="h-3.5 w-3.5" />
            </span>
          )}

          <div className="min-w-0">
            <p className="text-[11px] font-extrabold leading-tight whitespace-nowrap tabular-nums">
              {isOffline
                ? `${jobs.length} Foto Tersimpan Lokal`
                : uploadingCount > 0
                  ? `Mengunggah ${uploadingCount}/${jobs.length} Foto...`
                  : failedCount > 0
                    ? `${failedCount} Foto Menunggu Kirim Ulang`
                    : `${queuedCount} Foto Dalam Antrean`}
            </p>
            <p className="text-[10px] leading-tight text-slate-600 whitespace-nowrap">
              {isOffline
                ? 'Aman di perangkat · Otomatis kirim saat online'
                : 'Berjalan di latar · Bebas pindah KPM'}
            </p>
          </div>
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setDrawerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Brankas Antrean Foto Penyaluran"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Brankas Foto Penyaluran ({jobs.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Foto tersimpan permanen di perangkat sampai sukses masuk Google Drive
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="Tutup panel antrean"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Settings & Actions */}
            <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">
                    Simpan foto kamera ke Galeri HP otomatis
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    Otomatis dilewati ke cache browser bila memori HP penuh agar tidak gagal foto.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSaveGallery}
                  onClick={handleToggleAutoSave}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    autoSaveGallery ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                      autoSaveGallery ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <HardDrive className="h-3.5 w-3.5 text-teal-700" />
                  <span>
                    {isOffline
                      ? 'Menunggu sinyal internet kembali...'
                      : uploadingCount > 0
                        ? `Sedang mengirim ${uploadingCount} foto paralel...`
                        : 'Siap dikirim ke Google Drive'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => void retryAllPendingPhotoUploads()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Kirim Semua Sekarang</span>
                </button>
              </div>

              {galleryToast && (
                <p className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-900">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                  <span>{galleryToast}</span>
                </p>
              )}
            </div>

            {/* Job List */}
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
              {jobs.map((job) => {
                const isConfirmingDelete = confirmRemoveJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {job.previewUrl ? (
                          <img
                            src={job.previewUrl}
                            alt={`${job.slotLabel} ${job.kpmName}`}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {job.kpmName}
                            </p>
                            <p className="truncate text-[11px] font-medium text-teal-700">
                              {job.slotLabel} ·{' '}
                              <span className="text-slate-500 tabular-nums">
                                {job.originalSize > job.compressedSize
                                  ? `${formatBytes(job.originalSize)} → ${formatBytes(job.compressedSize)}`
                                  : formatBytes(job.compressedSize)}
                              </span>
                            </p>
                          </div>

                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              job.status === 'uploading'
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : job.status === 'failed'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {job.status === 'uploading' && (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            )}
                            {job.status === 'uploading'
                              ? 'Mengunggah...'
                              : job.status === 'failed'
                                ? `Gagal (${job.attempts}x)`
                                : isOffline
                                  ? 'Menunggu Sinyal'
                                  : 'Antrean'}
                          </span>
                        </div>

                        <p className="text-[10px] leading-snug text-slate-500">
                          {job.galleryStatusNote}
                        </p>

                        {job.lastError && (
                          <p className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700">
                            {job.lastError}
                          </p>
                        )}
                      </div>
                    </div>

                    {isConfirmingDelete ? (
                      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2">
                        <span className="text-[11px] font-semibold text-rose-900">
                          Batalkan &amp; hapus foto dari perangkat?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveJobId(null)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete(job)}
                            className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                          >
                            Ya, Hapus
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                        {job.kpmId && onSelectKpm && (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerOpen(false);
                              onSelectKpm(job.kpmId!);
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Buka KPM
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isOffline || job.status === 'uploading'}
                          onClick={() => void retryPhotoUploadJob(job.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Kirim Ulang</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleManualSaveGallery(job.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3 w-3" />
                          <span>Simpan Galeri</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmRemoveJobId(job.id)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                          title="Batalkan antrean unggahan ini"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
