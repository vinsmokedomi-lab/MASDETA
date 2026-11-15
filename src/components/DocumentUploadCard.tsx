import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Eye,
  FileImage,
  FileText,
  Home,
  Loader2,
  Trash2,
  Upload,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { KpmDocumentFile } from '../types/kpm';
import {
  formatBytes,
  formatUploadDateTime,
  removeDocumentFromDrive,
  uploadImageDocumentToDrive,
} from '../utils/imageProcessor';

interface DocumentUploadCardProps {
  id: string;
  label: string;
  helperText: string;
  required?: boolean;
  disabled?: boolean;
  showUploadTime?: boolean;
  variant?: 'ktp' | 'kk' | 'penerima' | 'survey' | 'rumah' | 'photo';
  value?: KpmDocumentFile;
  error?: string;
  onChange: (file?: KpmDocumentFile) => void;
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
  value,
  error,
  onChange,
  onPreview,
}: DocumentUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>('Memproses media...');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeError = localError || error;

  const handleFile = async (file?: File) => {
    if (!file || disabled || isProcessing) return;
    setLocalError(null);
    setConfirmDeleteOpen(false);
    setStatusLabel(
      value ? 'Mengganti foto di Google Drive...' : 'Mengunggah foto ke Google Drive...'
    );
    setIsProcessing(true);
    try {
      const processed = await uploadImageDocumentToDrive(file, value);
      onChange(processed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal mengunggah foto ke Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!value || disabled || isProcessing) return;
    setLocalError(null);
    setStatusLabel('Menghapus foto dari Google Drive...');
    setIsProcessing(true);
    try {
      await removeDocumentFromDrive(value);
      setConfirmDeleteOpen(false);
      onChange(undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal menghapus foto di Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
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
            <span className="inline-flex items-center gap-1 font-medium text-teal-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Tersimpan di Drive
            </span>
          ) : required ? (
            'Wajib diunggah'
          ) : (
            'Opsional'
          )}
        </span>
      </div>

      {/* Hidden native inputs for Gallery/File and Direct Mobile Camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="sr-only"
        aria-label={`Pilih file ${label}`}
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

      {value ? (
        <div
          className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
            activeError ? 'border-rose-300' : 'border-slate-200'
          }`}
        >
          <div className={`relative w-full overflow-hidden bg-slate-100 ${aspectClass}`}>
            <DriveImage
              doc={value}
              alt={`Pratinjau ${label}`}
              className="h-full w-full object-cover"
            />
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
                <span className="inline-flex items-center gap-1 font-medium text-teal-700 whitespace-nowrap">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{formatUploadDateTime(value.uploadedAt)}</span>
                </span>
              )}
            </div>
          </div>

          {!disabled && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2">
              {confirmDeleteOpen ? (
                <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                  <p className="text-xs font-semibold text-rose-900">
                    Hapus foto {label} dari Google Drive?
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
                      <span>Ya, Hapus Foto</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap disabled:opacity-50"
                    title="Ganti file dari galeri"
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    <span>Ganti</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 shrink-0 disabled:opacity-50"
                    aria-label={`Hapus Foto ${label}`}
                    title="Hapus Foto"
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
            disabled
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
                  : helperText}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Format JPG, PNG, WebP · Maks 15 MB
            </p>

            <div className="mt-3.5 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessing || disabled}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
              >
                <Camera className="h-4 w-4 shrink-0" />
                <span>Ambil Foto</span>
              </button>

              <button
                type="button"
                disabled={isProcessing || disabled}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>Pilih File</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeError && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{activeError}</span>
        </p>
      )}
    </div>
  );
}
