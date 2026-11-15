import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { KpmDocumentFile } from '../types/kpm';
import {
  formatBytes,
  formatUploadDateTime,
  getDocumentDownloadHref,
  removeDocumentFromDrive,
  uploadProposalDocumentToDrive,
} from '../utils/imageProcessor';

interface ProposalDocumentUploadCardProps {
  id: string;
  label: string;
  helperText: string;
  accept?: string;
  formatLabel?: string;
  variant?: 'pdf' | 'rab';
  disabled?: boolean;
  value?: KpmDocumentFile;
  onChange: (file?: KpmDocumentFile) => void;
  onPreview: (file: KpmDocumentFile, title: string) => void;
}

export function ProposalDocumentUploadCard({
  id,
  label,
  helperText,
  accept = '.pdf,.doc,.docx,image/*',
  formatLabel = 'PDF, Word (.doc/.docx), atau Gambar · Maks 15 MB',
  variant = 'pdf',
  disabled = false,
  value,
  onChange,
  onPreview,
}: ProposalDocumentUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Memproses berkas...');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = async (file?: File) => {
    if (!file || disabled || isProcessing) return;
    setLocalError(null);
    setConfirmDeleteOpen(false);
    setStatusLabel(
      value ? 'Mengganti berkas di Google Drive...' : 'Mengunggah berkas ke Google Drive...'
    );
    setIsProcessing(true);
    try {
      const processed = await uploadProposalDocumentToDrive(file, value);
      onChange(processed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal mengunggah berkas dokumen.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!value || disabled || isProcessing) return;
    setLocalError(null);
    setStatusLabel('Menghapus berkas dari Google Drive...');
    setIsProcessing(true);
    try {
      await removeDocumentFromDrive(value);
      setConfirmDeleteOpen(false);
      onChange(undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal menghapus berkas dari Drive.');
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

  const IconComp = variant === 'rab' ? FileSpreadsheet : FileText;
  const isImage = value?.mimeType.startsWith('image/');
  const isPdf =
    value?.mimeType === 'application/pdf' ||
    value?.fileName.toLowerCase().endsWith('.pdf');
  const fileExt = value?.fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const downloadHref = getDocumentDownloadHref(value);

  return (
    <div id={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-semibold text-slate-900">{label}</label>
        <span className="text-xs text-slate-500">
          {value ? (
            <span className="inline-flex items-center gap-1 font-medium text-teal-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Tersimpan di Drive
            </span>
          ) : (
            'Opsional'
          )}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        aria-label={`Unggah ${label}`}
      />

      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {isProcessing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-slate-950/60 text-xs font-semibold text-white backdrop-blur-[1px]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{statusLabel}</span>
            </div>
          )}

          <div className="flex items-start gap-3 p-3.5">
            {isImage ? (
              <DriveImage
                doc={value}
                alt={`Pratinjau ${label}`}
                className="h-14 w-14 rounded-xl border border-slate-200 object-cover shrink-0"
              />
            ) : (
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-teal-700 shrink-0">
                <IconComp className="h-5 w-5" />
                <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-600">
                  {fileExt.slice(0, 4)}
                </span>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-xs font-semibold text-slate-900" title={value.fileName}>
                {value.fileName}
              </p>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums">
                <span className="text-slate-500 whitespace-nowrap">
                  {fileExt} ·{' '}
                  {value.compressedSize > 0 ? formatBytes(value.compressedSize) : 'Google Drive'}
                </span>
                {value.uploadedAt && (
                  <span className="inline-flex items-center gap-1 font-medium text-teal-700 whitespace-nowrap">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatUploadDateTime(value.uploadedAt)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {confirmDeleteOpen ? (
            <div className="border-t border-rose-200 bg-rose-50 px-3.5 py-2.5">
              <p className="text-xs font-semibold text-rose-900">
                Hapus berkas {label} dari Google Drive?
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void handleConfirmDelete()}
                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Ya, Hapus</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
              {(isImage || isPdf) && (
                <button
                  type="button"
                  onClick={() => onPreview(value, label)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-600" />
                  <span>Lihat</span>
                </button>
              )}

              <a
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                download={value.fileName}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-slate-600" />
                <span>Unduh</span>
              </a>

              {!disabled && (
                <>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-600" />
                    <span>Ganti</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 text-rose-600 transition-colors hover:bg-rose-100 shrink-0 disabled:opacity-50"
                    aria-label={`Hapus ${label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
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
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
          }`}
        >
          <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:justify-between sm:gap-4">
            <div className="flex flex-col items-center gap-2.5 sm:flex-row">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-teal-700 shrink-0">
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <IconComp className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-800">
                  {disabled
                    ? 'Proposal terkunci — unggahan dinonaktifkan'
                    : isProcessing
                      ? statusLabel
                      : helperText}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{formatLabel}</p>
              </div>
            </div>

            <button
              type="button"
              disabled={isProcessing || disabled}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4 text-teal-700 shrink-0" />
              <span>Unggah Berkas</span>
            </button>
          </div>
        </div>
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
