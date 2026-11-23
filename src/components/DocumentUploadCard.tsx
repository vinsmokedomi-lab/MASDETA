import { useEffect, useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPaste,
  Clock,
  CreditCard,
  Eye,
  FileImage,
  FileText,
  FolderOpen,
  Home,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { KpmDocumentFile } from '../types/kpm';
import {
  compressImageFileForOcr,
  formatBytes,
  formatUploadDateTime,
  removeDocumentFromDrive,
} from '../utils/imageProcessor';
import {
  cancelPendingPhotoUploadJob,
  enqueuePhotoUploadJob,
  extractPendingJobId,
  isLocalPendingDocument,
  PhotoCaptureSource,
  PhotoDocCategory,
  PhotoUploadJobSummary,
  retryPhotoUploadJob,
  subscribePhotoUploadJobs,
} from '../utils/photoUploadManager';
import {
  convertPdfFirstPageToImageFile,
  getRememberedScannerDirHandle,
  isDirectoryPickerSupported,
  isPdfDocumentFile,
  listRecentScannerFiles,
  pickScannerOutputDirectory,
  ScannerDirEntryFile,
} from '../utils/scannerHelper';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface DocumentUploadCardProps {
  id: string;
  label: string;
  helperText: string;
  required?: boolean;
  disabled?: boolean;
  showUploadTime?: boolean;
  variant?: 'ktp' | 'kk' | 'penerima' | 'survey' | 'rumah' | 'photo';
  kpmId?: string;
  formDraftId?: string;
  kpmName?: string;
  category?: PhotoDocCategory;
  value?: KpmDocumentFile;
  error?: string;
  onChange: (file?: KpmDocumentFile) => void;
  onImageForOcrReady?: (payload: { base64: string; mimeType: string } | undefined) => void;
  onPreview: (file: KpmDocumentFile, title: string) => void;
}

export function DocumentUploadCard({
  id,
  label,
  helperText,
  required = false,
  disabled = false,
  showUploadTime = false,
  variant = 'photo',
  kpmId,
  formDraftId,
  kpmName,
  category,
  value,
  error,
  onChange,
  onImageForOcrReady,
  onPreview,
}: DocumentUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('Mengamankan foto...');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [vaultJobs, setVaultJobs] = useState<PhotoUploadJobSummary[]>([]);

  // Desktop PC Scanner modal & folder watcher state (only for KTP & KK on Desktop Web)
  const isDesktopWeb = useIsDesktopWeb();
  const isScannerCapable = variant === 'ktp' || variant === 'kk';
  const showDesktopScannerAction = isDesktopWeb && isScannerCapable;
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerFolderName, setScannerFolderName] = useState<string>(
    () => getRememberedScannerDirHandle()?.name || ''
  );
  const [scannerRecentFiles, setScannerRecentFiles] = useState<ScannerDirEntryFile[]>([]);
  const [scannerWatchActive, setScannerWatchActive] = useState(false);
  const [scannerModalError, setScannerModalError] = useState<string | null>(null);
  const [scannerLoadingList, setScannerLoadingList] = useState(false);
  const watchBaselineTimeRef = useRef<number>(0);
  const watchSeenKeysRef = useRef<Set<string>>(new Set());

  const { isOffline } = useOfflineStatus();
  const effectiveDisabled = disabled;
  const activeError = localError || error;
  const resolvedCategory: PhotoDocCategory =
    category || (variant === 'photo' ? 'lainnya' : variant);

  const isPendingValue = isLocalPendingDocument(value);
  const pendingJobId = isPendingValue ? extractPendingJobId(value) : '';
  const pendingJob = pendingJobId
    ? vaultJobs.find((j) => j.id === pendingJobId)
    : undefined;

  useEffect(() => {
    return subscribePhotoUploadJobs((jobs) => {
      setVaultJobs(jobs);
    });
  }, []);

  const handleFile = async (rawFile?: File, source: PhotoCaptureSource = 'file') => {
    if (!rawFile || effectiveDisabled || isProcessing) return;
    setLocalError(null);
    setConfirmDeleteOpen(false);
    setIsProcessing(true);
    try {
      let fileToUpload = rawFile;
      if (isScannerCapable && isPdfDocumentFile(rawFile)) {
        setStatusLabel('Mengonversi hasil scan PDF beresolusi tinggi...');
        fileToUpload = await convertPdfFirstPageToImageFile(rawFile);
      }

      setStatusLabel('Mengamankan foto di perangkat...');
      const [{ pendingDoc }, ocrPayload] = await Promise.all([
        enqueuePhotoUploadJob({
          file: fileToUpload,
          kpmId,
          formDraftId: kpmId ? undefined : formDraftId || `card-${id}`,
          kpmName: kpmName?.trim() || 'KPM',
          category: resolvedCategory,
          slotLabel: label,
          existingDoc: value,
          source,
        }),
        onImageForOcrReady
          ? compressImageFileForOcr(fileToUpload).catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      onImageForOcrReady?.(ocrPayload);
      onChange(pendingDoc);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal memproses foto.');
    } finally {
      setIsProcessing(false);
    }
  };

  const refreshScannerFolderFiles = async (seedBaseline = false) => {
    const dirHandle = getRememberedScannerDirHandle();
    if (!dirHandle) {
      setScannerFolderName('');
      setScannerRecentFiles([]);
      return;
    }
    setScannerFolderName(dirHandle.name);
    setScannerLoadingList(true);
    try {
      const files = await listRecentScannerFiles(dirHandle, 6);
      setScannerRecentFiles(files);
      if (seedBaseline) {
        watchBaselineTimeRef.current = Date.now() - 1500;
        watchSeenKeysRef.current = new Set(
          files.map((f) => `${f.name}::${f.lastModified}::${f.size}`)
        );
      }
    } catch {
      setScannerModalError(
        'Izin akses folder scanner terputus. Silakan pilih ulang folder output scanner.'
      );
      setScannerWatchActive(false);
    } finally {
      setScannerLoadingList(false);
    }
  };

  const handleOpenScannerModal = () => {
    if (effectiveDisabled || isProcessing) return;
    setScannerModalError(null);
    setIsScannerModalOpen(true);
    const remembered = getRememberedScannerDirHandle();
    if (remembered) {
      setScannerFolderName(remembered.name);
      void refreshScannerFolderFiles(true);
      setScannerWatchActive(true);
    } else {
      setScannerFolderName('');
      setScannerRecentFiles([]);
      setScannerWatchActive(false);
    }
  };

  const handlePickScannerFolder = async () => {
    setScannerModalError(null);
    try {
      const dir = await pickScannerOutputDirectory();
      if (!dir) return;
      setScannerFolderName(dir.name);
      await refreshScannerFolderFiles(true);
      setScannerWatchActive(true);
    } catch (err) {
      setScannerModalError(
        err instanceof Error ? err.message : 'Gagal membuka folder output scanner.'
      );
    }
  };

  const handleSelectScannerEntry = async (entry: ScannerDirEntryFile) => {
    setScannerModalError(null);
    try {
      const file = await entry.getFile();
      setScannerWatchActive(false);
      setIsScannerModalOpen(false);
      await handleFile(file);
    } catch (err) {
      setScannerModalError(
        err instanceof Error ? err.message : 'Gagal membaca file hasil scan dari folder.'
      );
    }
  };

  // Poll folder output scanner secara berkala saat modal Scanner PC terbuka
  useEffect(() => {
    if (!isScannerModalOpen || !scannerWatchActive) return;
    const dirHandle = getRememberedScannerDirHandle();
    if (!dirHandle) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || isProcessing) return;
      try {
        const files = await listRecentScannerFiles(dirHandle, 6);
        if (cancelled) return;
        setScannerRecentFiles(files);
        const newestNew = files.find((f) => {
          const key = `${f.name}::${f.lastModified}::${f.size}`;
          return !watchSeenKeysRef.current.has(key) && f.lastModified >= watchBaselineTimeRef.current;
        });
        if (newestNew) {
          watchSeenKeysRef.current.add(
            `${newestNew.name}::${newestNew.lastModified}::${newestNew.size}`
          );
          const fileObj = await newestNew.getFile();
          if (cancelled) return;
          setScannerWatchActive(false);
          setIsScannerModalOpen(false);
          void handleFile(fileObj);
        }
      } catch {
        // Ignore transient read error while scanner software is flushing file
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isScannerModalOpen, scannerWatchActive, isProcessing]);

  // Dukungan Paste langsung (Ctrl+V) saat modal Scanner PC terbuka
  useEffect(() => {
    if (!isScannerModalOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'file') {
          const pastedFile = item.getAsFile();
          if (pastedFile && (pastedFile.type.startsWith('image/') || isPdfDocumentFile(pastedFile))) {
            e.preventDefault();
            setScannerWatchActive(false);
            setIsScannerModalOpen(false);
            void handleFile(pastedFile);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isScannerModalOpen]);

  const handleConfirmDelete = async () => {
    if (!value || effectiveDisabled || isProcessing) return;
    if (isPendingValue && pendingJobId) {
      setLocalError(null);
      setIsProcessing(true);
      try {
        const restoreExisting = pendingJob?.existingDoc;
        await cancelPendingPhotoUploadJob(pendingJobId);
        setConfirmDeleteOpen(false);
        if (!restoreExisting) onImageForOcrReady?.(undefined);
        onChange(restoreExisting);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (isOffline) {
      setLocalError('Hapus foto yang sudah di Google Drive memerlukan koneksi internet.');
      return;
    }

    setLocalError(null);
    setStatusLabel('Menghapus foto dari Google Drive...');
    setIsProcessing(true);
    try {
      await removeDocumentFromDrive(value);
      setConfirmDeleteOpen(false);
      onImageForOcrReady?.(undefined);
      onChange(undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal menghapus foto di Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleFile(file, 'file');
    e.target.value = '';
  };

  const handleCameraInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleFile(file, 'camera');
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!effectiveDisabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (effectiveDisabled) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file, 'file');
  };

  const aspectClass =
    variant === 'ktp'
      ? 'aspect-[1.58/1]'
      : variant === 'kk'
        ? 'aspect-[1.41/1]'
        : 'aspect-[4/3]';

  const PlaceholderIcon =
    variant === 'ktp'
      ? CreditCard
      : variant === 'kk'
        ? FileText
        : variant === 'penerima'
          ? UserCheck
          : variant === 'survey'
            ? ClipboardCheck
            : variant === 'rumah'
              ? Home
              : FileImage;

  return (
    <div id={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-semibold text-slate-900">
          {label}
          {required && (
            <span className="ml-1 text-rose-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <span className="text-xs text-slate-500">
          {value ? (
            isPendingValue ? (
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  pendingJob?.status === 'failed'
                    ? 'text-rose-600'
                    : 'text-amber-700'
                }`}
              >
                {pendingJob?.status === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-700" />
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                )}
                {pendingJob?.status === 'uploading'
                  ? 'Mengunggah ke Drive...'
                  : pendingJob?.status === 'failed'
                    ? 'Tertunda · Kirim Ulang'
                    : isOffline
                      ? 'Tersimpan Lokal'
                      : 'Antrean Upload'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-teal-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Tersimpan di Drive
              </span>
            )
          ) : required ? (
            'Wajib diunggah'
          ) : (
            'Opsional'
          )}
        </span>
      </div>

      {/* Hidden native inputs for Gallery/File (supports Scanner PDF for KTP/KK) and Direct Mobile Camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept={isScannerCapable ? 'image/*,application/pdf,.pdf' : 'image/*'}
        onChange={handleFileInputChange}
        className="sr-only"
        aria-label={`Pilih file ${label}`}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraInputChange}
        className="sr-only"
        aria-label={`Ambil foto kamera ${label}`}
      />

      {value ? (
        <div
          className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
            activeError ? 'border-rose-300' : isPendingValue ? 'border-amber-300' : 'border-slate-200'
          }`}
        >
          <div className={`relative w-full overflow-hidden bg-slate-100 ${aspectClass}`}>
            <DriveImage
              doc={value}
              alt={`Pratinjau ${label}`}
              className="h-full w-full object-cover"
            />
            {isPendingValue && !isProcessing && (
              <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                {pendingJob?.status === 'uploading' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-teal-300" />
                    <span>Mengunggah di latar...</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3 text-amber-300" />
                    <span>
                      {isOffline
                        ? 'Tersimpan aman di perangkat'
                        : pendingJob?.status === 'failed'
                          ? 'Menunggu coba ulang'
                          : 'Dalam antrean Drive'}
                    </span>
                  </>
                )}
              </div>
            )}
            {isProcessing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/65 px-4 text-center text-white backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs font-semibold">{statusLabel}</span>
              </div>
            )}
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onPreview(value, label)}
              className="absolute right-2.5 bottom-2.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900/80 px-3.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              Perbesar
            </button>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 px-3.5 py-2.5">
            <p className="truncate text-xs font-semibold text-slate-900" title={value.fileName}>
              {value.fileName}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] tabular-nums">
              <span className="text-slate-500 whitespace-nowrap">
                {value.width > 0 ? `${value.width}×${value.height} px · ` : ''}
                {value.compressedSize > 0 ? formatBytes(value.compressedSize) : 'Google Drive'}
              </span>
              {(showUploadTime || value.uploadedAt) && (
                <span
                  className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                    isPendingValue ? 'text-amber-700' : 'text-teal-700'
                  }`}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>
                    {isPendingValue
                      ? 'Diamankan lokal'
                      : formatUploadDateTime(value.uploadedAt)}
                  </span>
                </span>
              )}
            </div>
            {isPendingValue && pendingJob && (
              <p className="text-[10px] leading-snug text-slate-500">
                {pendingJob.galleryStatusNote}
                {pendingJob.lastError ? ` · (${pendingJob.lastError})` : ''}
              </p>
            )}
          </div>

          {!effectiveDisabled && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2">
              {confirmDeleteOpen ? (
                <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                  <p className="text-xs font-semibold text-rose-900">
                    {isPendingValue
                      ? `Batalkan antrean unggahan foto ${label} ini?`
                      : `Hapus foto ${label} dari Google Drive?`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleConfirmDelete()}
                      className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>{isPendingValue ? 'Ya, Batalkan' : 'Ya, Hapus Foto'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {isPendingValue && pendingJob && pendingJob.status !== 'uploading' && !isOffline && (
                    <button
                      type="button"
                      onClick={() => void retryPhotoUploadJob(pendingJob.id)}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 whitespace-nowrap"
                    >
                      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                      <span>Kirim Ulang</span>
                    </button>
                  )}
                  {showDesktopScannerAction ? (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleOpenScannerModal}
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/80 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap disabled:opacity-50"
                      title="Ambil ulang dari printer/scanner PC"
                    >
                      <Printer className="h-3.5 w-3.5 shrink-0" />
                      <span>Scanner PC</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap disabled:opacity-50"
                      title="Foto ulang pakai kamera"
                    >
                      <Camera className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                      <span>Kamera</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap disabled:opacity-50"
                    title={isScannerCapable ? 'Ganti file gambar atau PDF scan' : 'Ganti file dari galeri'}
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    <span>Ganti</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing || (isOffline && !isPendingValue)}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={isPendingValue ? `Batalkan antrean ${label}` : `Hapus Foto ${label}`}
                    title={isPendingValue ? 'Batalkan antrean foto' : isOffline ? 'Hapus foto Drive butuh sinyal' : 'Hapus Foto'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
            effectiveDisabled
              ? 'border-slate-200 bg-slate-100/70 opacity-75'
              : isDragging
                ? 'border-teal-600 bg-teal-50/60'
                : activeError
                  ? 'border-rose-300 bg-rose-50/40'
                  : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className={`mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border ${
                activeError
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-slate-200 bg-white text-teal-700'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PlaceholderIcon className="h-5 w-5" />
              )}
            </div>

            <p className="text-xs font-medium text-slate-700">
              {disabled
                ? 'Proposal terkunci — unggahan dinonaktifkan'
                : isProcessing
                  ? statusLabel
                  : isOffline
                    ? 'Mode Offline — foto disimpan aman di perangkat & antre ke Drive'
                    : helperText}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isScannerCapable
                ? 'Format JPG, PNG, WebP, atau PDF hasil scan · Maks 15 MB'
                : 'Format JPG, PNG, WebP · Maks 15 MB'}
            </p>

            {showDesktopScannerAction ? (
              <div className="mt-3.5 grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isProcessing || effectiveDisabled}
                  onClick={handleOpenScannerModal}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
                >
                  <Printer className="h-4 w-4 shrink-0" />
                  <span>Scanner (PC)</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing || effectiveDisabled}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4 shrink-0" />
                  <span>Pilih File / PDF</span>
                </button>
              </div>
            ) : (
              <div className="mt-3.5 grid w-full grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isProcessing || effectiveDisabled}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  <span>Ambil Foto</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing || effectiveDisabled}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4 shrink-0" />
                  <span>Pilih File</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeError && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{activeError}</span>
        </p>
      )}

      {/* Modal Scanner PC (Desktop Web untuk KTP & KK) */}
      {isScannerModalOpen && showDesktopScannerAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Scan ${label} dari Scanner PC`}
          onClick={() => {
            setScannerWatchActive(false);
            setIsScannerModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Scan {label} dari Printer / Scanner PC
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mendukung Epson, Canon, HP, Brother &amp; Windows Scan (.JPG / .PNG / .PDF)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScannerWatchActive(false);
                  setIsScannerModalOpen(false);
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode 1: Pantau Folder Output Scanner Otomatis */}
            <div className="space-y-2.5 rounded-2xl border border-teal-200 bg-teal-50/50 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-teal-950">
                    1. Pantau Folder Output Scanner Otomatis
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-teal-900/80">
                    Hubungkan folder penyimpanan scanner Anda sekali (mis.{' '}
                    <em>Documents/Scanned Documents</em>). Begitu Anda menekan tombol Scan di
                    printer/scanner, hasilnya langsung masuk otomatis ke sini.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!isDirectoryPickerSupported()}
                  onClick={() => void handlePickScannerFolder()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>
                    {scannerFolderName ? 'Ganti Folder Scanner' : 'Pilih Folder Output Scanner'}
                  </span>
                </button>

                {scannerFolderName && (
                  <button
                    type="button"
                    onClick={() => void refreshScannerFolderFiles(false)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${scannerLoadingList ? 'animate-spin' : ''}`} />
                    <span>Muat Ulang</span>
                  </button>
                )}
              </div>

              {scannerFolderName && (
                <div className="space-y-2 rounded-xl border border-teal-200 bg-white p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate font-semibold text-slate-800">
                      Folder terhubung: <span className="text-teal-700">{scannerFolderName}</span>
                    </span>
                    {scannerWatchActive && (
                      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-700">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Menunggu hasil scan...</span>
                      </span>
                    )}
                  </div>

                  {scannerRecentFiles.length > 0 ? (
                    <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                      {scannerRecentFiles.map((entry) => (
                        <button
                          key={`${entry.name}-${entry.lastModified}`}
                          type="button"
                          onClick={() => void handleSelectScannerEntry(entry)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-teal-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {entry.name}
                            </p>
                            <p className="text-[10px] text-slate-500 tabular-nums">
                              {entry.isPdf ? 'PDF Scan (otomatis dikonversi ke gambar tajam)' : 'Gambar'} ·{' '}
                              {formatBytes(entry.size)}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white">
                            Gunakan
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-[11px] text-slate-500">
                      Belum ada file gambar/PDF di folder ini. Tekan tombol Scan pada printer/scanner
                      Anda sekarang.
                    </p>
                  )}
                </div>
              )}

              {!isDirectoryPickerSupported() && (
                <p className="text-[11px] text-amber-800">
                  Browser ini belum mendukung pantau folder otomatis. Gunakan Chrome/Edge versi
                  terbaru, atau gunakan cara 2 di bawah.
                </p>
              )}
            </div>

            {/* Mode 2: Paste Clipboard (Ctrl+V) atau Pilih File Scan (.PDF / .JPG / .PNG) */}
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs font-bold text-slate-900">
                2. Cara Cepat Lainnya (Tempel Ctrl+V / Pilih File PDF &amp; Gambar)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScannerWatchActive(false);
                    setIsScannerModalOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pilih File Hasil Scan (.PDF / .JPG / .PNG)</span>
                </button>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <ClipboardPaste className="h-3.5 w-3.5 text-teal-700" />
                  <span>atau tekan Ctrl+V di sini</span>
                </span>
              </div>
            </div>

            {scannerModalError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{scannerModalError}</span>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <p>
                Karena batas keamanan browser web, situs web tidak bisa memicu driver TWAIN/WIA
                printer secara langsung tanpa software pihak ketiga. Dengan menghubungkan{' '}
                <strong>Folder Output Scanner</strong> atau mengunggah file <strong>.PDF/.JPG</strong>{' '}
                hasil scan (200–300 DPI), gambar tetap sangat tajam untuk OCR otomatis.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
