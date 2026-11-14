import { useState, useEffect } from 'react';
import { Download, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { KpmDocumentFile } from '../types/kpm';
import { formatBytes, formatUploadDateTime } from '../utils/imageProcessor';

interface DocumentLightboxProps {
  documentFile: KpmDocumentFile | null;
  title: string;
  onClose: () => void;
}

export function DocumentLightbox({ documentFile, title, onClose }: DocumentLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setZoomed(false);
    setRotation(0);
  }, [documentFile?.id]);

  useEffect(() => {
    if (!documentFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documentFile, onClose]);

  if (!documentFile) return null;

  const isPdf =
    documentFile.mimeType === 'application/pdf' ||
    documentFile.fileName.toLowerCase().endsWith('.pdf');
  const isImage = documentFile.mimeType.startsWith('image/');
  const uploadTimeText = formatUploadDateTime(documentFile.uploadedAt);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau ${title}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold sm:text-base">{title}</h3>
          <p className="truncate text-xs text-slate-400 tabular-nums">
            {documentFile.fileName} ·{' '}
            {isImage && documentFile.width > 0
              ? `${documentFile.width} × ${documentFile.height} px · `
              : ''}
            {formatBytes(documentFile.compressedSize)}
            {uploadTimeText ? ` · Diunggah ${uploadTimeText}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => setZoomed((prev) => !prev)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 whitespace-nowrap shrink-0"
                aria-label={zoomed ? 'Perkecil gambar' : 'Perbesar gambar'}
              >
                {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                <span className="hidden sm:inline">{zoomed ? 'Normal' : 'Perbesar 2×'}</span>
              </button>

              <button
                type="button"
                onClick={() => setRotation((prev) => (prev + 90) % 360)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 whitespace-nowrap shrink-0"
                aria-label="Putar gambar 90 derajat"
              >
                <RotateCw className="h-4 w-4" />
                <span className="hidden sm:inline">Putar</span>
              </button>
            </>
          )}

          <a
            href={documentFile.dataUrl}
            download={documentFile.fileName}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 whitespace-nowrap shrink-0"
            aria-label={`Unduh ${documentFile.fileName}`}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Unduh</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 shrink-0"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8"
        onClick={onClose}
      >
        {isPdf ? (
          <iframe
            src={documentFile.dataUrl}
            title={title}
            onClick={(e) => e.stopPropagation()}
            className="h-full min-h-[70vh] w-full max-w-4xl rounded-xl bg-white"
          />
        ) : isImage ? (
          <img
            src={documentFile.dataUrl}
            alt={title}
            referrerPolicy="no-referrer"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed((prev) => !prev);
            }}
            style={{
              transform: `rotate(${rotation}deg) scale(${zoomed ? 1.85 : 1})`,
            }}
            className="max-h-full max-w-full cursor-zoom-in rounded-lg object-contain transition-transform duration-200"
          />
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl border border-white/15 bg-white/10 p-6 text-center"
          >
            <p className="text-sm font-semibold">{documentFile.fileName}</p>
            <p className="mt-1 text-xs text-slate-300">
              Pratinjau langsung tidak tersedia untuk format dokumen ini.
            </p>
            <a
              href={documentFile.dataUrl}
              download={documentFile.fileName}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Download className="h-4 w-4" />
              <span>Unduh Berkas</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

