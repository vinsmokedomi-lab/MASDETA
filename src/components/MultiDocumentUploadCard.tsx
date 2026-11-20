import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  AlertCircle,
  Camera,
  Eye,
  Images,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { KpmDocumentFile } from '../types/kpm';
import {
  formatBytes,
  formatUploadDateTime,
  removeDocumentFromDrive,
  uploadImageDocumentToDrive,
} from '../utils/imageProcessor';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface MultiDocumentUploadCardProps {
  id: string;
  label: string;
  helperText: string;
  maxFiles?: number;
  disabled?: boolean;
  values: KpmDocumentFile[];
  onChange: (files: KpmDocumentFile[]) => void;
  onPreview: (file: KpmDocumentFile, title: string) => void;
}

export function MultiDocumentUploadCard({
  id,
  label,
  helperText,
  maxFiles = 5,
  disabled = false,
  values,
  onChange,
  onPreview,
}: MultiDocumentUploadCardProps) {
  const { isOffline } = useOfflineStatus();
  const effectiveDisabled = disabled || isOffline;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<KpmDocumentFile | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const remainingSlots = Math.max(0, maxFiles - values.length);
  const isAtLimit = remainingSlots === 0;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isProcessing || effectiveDisabled) return;

    if (values.length >= maxFiles) {
      setLocalError(
        `Maksimal ${maxFiles} foto sudah tercapai. Hapus salah satu foto terlebih dahulu.`
      );
      return;
    }

    setLocalError(null);
    setIsProcessing(true);

    try {
      const incoming = Array.from(fileList);
      const allowedCount = maxFiles - values.length;
      const filesToProcess = incoming.slice(0, allowedCount);
      const skippedDueToLimit = incoming.length > allowedCount;

      const processedList: KpmDocumentFile[] = [];
      const failedNames: string[] = [];

      for (const file of filesToProcess) {
        try {
          const processed = await uploadImageDocumentToDrive(file);
          processedList.push(processed);
        } catch {
          failedNames.push(file.name);
        }
      }

      if (processedList.length > 0) {
        onChange([...values, ...processedList]);
      }

      if (failedNames.length > 0) {
        setLocalError(
          `Sebagian file gagal diunggah ke Drive (${failedNames.join(', ')}). Pastikan format JPG/PNG/WebP dan ukuran maks 15 MB.`
        );
      } else if (skippedDueToLimit) {
        setLocalError(
          `Maksimal ${maxFiles} foto. Hanya ${allowedCount} foto pertama yang ditambahkan.`
        );
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isAtLimit && !effectiveDisabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (effectiveDisabled) return;
    void handleFiles(e.dataTransfer.files);
  };

  const handleConfirmRemove = async () => {
    if (!confirmDeleteDoc || deletingDocId || effectiveDisabled) return;
    setLocalError(null);
    setDeletingDocId(confirmDeleteDoc.id);
    try {
      await removeDocumentFromDrive(confirmDeleteDoc);
      onChange(values.filter((item) => item.id !== confirmDeleteDoc.id));
      setConfirmDeleteDoc(null);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Gagal menghapus foto dari Google Drive.'
      );
    } finally {
      setDeletingDocId(null);
    }
  };

  return (
    <div id={id} className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-semibold text-slate-900">{label}</label>
        <span className="text-xs text-slate-500 tabular-nums">
          {values.length > 0 ? (
            <span className="font-medium text-teal-700">
              {values.length}/{maxFiles} foto di Drive
            </span>
          ) : (
            `Maks. ${maxFiles} foto · Opsional`
          )}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        className="sr-only"
        aria-label={`Pilih beberapa file ${label}`}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="sr-only"
        aria-label={`Ambil foto kamera ${label}`}
      />

      {/* Uploaded Photos Grid */}
      {values.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {values.map((doc, idx) => {
            const isDeletingThis = deletingDocId === doc.id;
            return (
              <div
                key={doc.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <DriveImage
                    doc={doc}
                    alt={`${label} ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {isDeletingThis && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-slate-950/65 text-white">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-[10px] font-semibold">Menghapus...</span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={isDeletingThis}
                    onClick={() => onPreview(doc, `${label} #${idx + 1}`)}
                    className="absolute right-1.5 bottom-1.5 inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-slate-900/80 text-white backdrop-blur-sm transition-colors hover:bg-slate-900 disabled:opacity-50"
                    aria-label={`Perbesar ${label} ${idx + 1}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-1.5 border-t border-slate-100 px-2.5 py-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p
                      className="truncate text-[11px] font-semibold text-slate-900"
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </p>
                    <p className="truncate text-[10px] text-slate-500 tabular-nums">
                      {doc.compressedSize > 0 ? formatBytes(doc.compressedSize) : 'Google Drive'}
                      {doc.uploadedAt ? ` · ${formatUploadDateTime(doc.uploadedAt)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(deletingDocId) || effectiveDisabled}
                    onClick={() => setConfirmDeleteDoc(doc)}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Hapus ${label} ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation inline box */}
      {confirmDeleteDoc && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-900">
            Hapus foto <strong>{confirmDeleteDoc.fileName}</strong> dari Google Drive?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={Boolean(deletingDocId)}
              onClick={() => setConfirmDeleteDoc(null)}
              className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={Boolean(deletingDocId)}
              onClick={() => void handleConfirmRemove()}
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deletingDocId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>Ya, Hapus Foto</span>
            </button>
          </div>
        </div>
      )}

      {/* Upload / Add More Dropzone (visible while < maxFiles) */}
      {!isAtLimit ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
            effectiveDisabled
              ? 'border-slate-200 bg-slate-100/70 opacity-75'
              : isDragging
                ? 'border-teal-600 bg-teal-50/60'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            {(values.length === 0 || isProcessing) && (
              <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-teal-700">
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Images className="h-5 w-5" />
                )}
              </div>
            )}

            <p className="text-xs font-medium text-slate-700">
              {isOffline
                ? 'Mode Read-Only (Offline) — unggahan dinonaktifkan'
                : isProcessing
                  ? 'Mengunggah foto ke Google Drive...'
                  : values.length > 0
                    ? `Tambah foto lagi (sisa kuota ${remainingSlots} dari ${maxFiles} foto)`
                    : helperText}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Maksimal {maxFiles} foto · JPG, PNG, WebP · Maks 15 MB/file
            </p>

            <div className="mt-3 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessing || effectiveDisabled}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <Camera className="h-4 w-4 shrink-0" />
                <span>{values.length > 0 ? 'Tambah Kamera' : 'Ambil Foto'}</span>
              </button>

              <button
                type="button"
                disabled={isProcessing || effectiveDisabled}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {values.length > 0 ? (
                  <Plus className="h-4 w-4 shrink-0" />
                ) : (
                  <Upload className="h-4 w-4 shrink-0" />
                )}
                <span>{values.length > 0 ? 'Tambah File' : 'Pilih Banyak'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 tabular-nums">
          Batas maksimal {maxFiles}/{maxFiles} foto sudah tercapai. Hapus salah satu foto di atas
          jika ingin mengganti.
        </p>
      )}

      {localError && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{localError}</span>
        </p>
      )}
    </div>
  );
}
