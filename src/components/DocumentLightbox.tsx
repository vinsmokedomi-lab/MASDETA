import {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  RotateCcw,
  RotateCw,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { extractDriveFileId } from '../services/driveManager';
import { KpmDocumentFile } from '../types/kpm';
import {
  formatBytes,
  formatUploadDateTime,
  getDocumentDirectUrl,
  getDocumentDownloadHref,
} from '../utils/imageProcessor';
import {
  downloadPendingJobToGallery,
  ensurePendingPhotoObjectUrl,
  extractPendingJobId,
  getPendingPhotoObjectUrl,
  isLocalPendingDocument,
} from '../utils/photoUploadManager';

export interface DocumentLightboxAuditContext {
  expectedLabel?: string;
  status?: 'verified' | 'mismatch';
  onMarkStatus?: (nextStatus: 'verified' | 'mismatch' | null, advanceNext?: boolean) => void;
  onSwapClick?: () => void;
}

interface DocumentLightboxProps {
  documentFile: KpmDocumentFile | null;
  title: string;
  onClose: () => void;
  positionLabel?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  auditContext?: DocumentLightboxAuditContext;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DocumentLightbox({
  documentFile,
  title,
  onClose,
  positionLabel,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  auditContext,
}: DocumentLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [keepViewLocked, setKeepViewLocked] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [pendingObjectUrl, setPendingObjectUrl] = useState<string>('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const keepViewLockedRef = useRef(keepViewLocked);
  keepViewLockedRef.current = keepViewLocked;

  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const baseSizeRef = useRef({ width: 0, height: 0 });

  // Pointer drag state (mouse / single pointer)
  const pointerDragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
  });

  // Touch gesture state (1-finger pan & 2-finger pinch-zoom + pan)
  const touchStateRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    startDistance: number;
    startZoom: number;
    startMidX: number;
    startMidY: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    startDistance: 0,
    startZoom: 1,
    startMidX: 0,
    startMidY: 0,
    moved: false,
  });

  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });

  const measureBaseSize = useCallback(() => {
    const el = contentRef.current;
    if (!el) return baseSizeRef.current;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width > 0 && height > 0) {
      baseSizeRef.current = { width, height };
    }
    return baseSizeRef.current;
  }, []);

  const clampPan = useCallback(
    (nextPan: { x: number; y: number }, targetZoom: number, targetRotation = rotation) => {
      if (targetZoom <= MIN_ZOOM + 0.01) {
        return { x: 0, y: 0 };
      }

      const stage = stageRef.current;
      const base = measureBaseSize();
      if (!stage || base.width === 0 || base.height === 0) {
        return nextPan;
      }

      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const isQuarterTurn = targetRotation % 180 !== 0;
      const effectiveW = (isQuarterTurn ? base.height : base.width) * targetZoom;
      const effectiveH = (isQuarterTurn ? base.width : base.height) * targetZoom;

      const maxX = effectiveW > stageW ? (effectiveW - stageW) / 2 + 24 : 0;
      const maxY = effectiveH > stageH ? (effectiveH - stageH) / 2 + 24 : 0;

      return {
        x: clamp(nextPan.x, -maxX, maxX),
        y: clamp(nextPan.y, -maxY, maxY),
      };
    },
    [measureBaseSize, rotation]
  );

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const prevDocOpenRef = useRef(false);
  useEffect(() => {
    const isOpenNow = Boolean(documentFile);
    if (isOpenNow && !prevDocOpenRef.current) {
      setKeepViewLocked(Boolean(auditContext));
    }
    prevDocOpenRef.current = isOpenNow;
  }, [documentFile, auditContext]);

  useEffect(() => {
    if (!keepViewLockedRef.current || !documentFile) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
    }
    setIsInteracting(false);
    setSaveToast(null);
    baseSizeRef.current = { width: 0, height: 0 };
  }, [documentFile?.id]);

  useEffect(() => {
    if (!documentFile) return;
    const handleResize = () => {
      setPan((prev) => clampPan(prev, zoom, rotation));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPan, documentFile, rotation, zoom]);

  useEffect(() => {
    if (!documentFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documentFile, onClose, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    if (!documentFile || !isLocalPendingDocument(documentFile)) {
      setPendingObjectUrl('');
      return;
    }
    const jobId = extractPendingJobId(documentFile);
    if (!jobId) {
      setPendingObjectUrl('');
      return;
    }
    setPendingObjectUrl(getPendingPhotoObjectUrl(jobId));
    let cancelled = false;
    void ensurePendingPhotoObjectUrl(jobId).then((url) => {
      if (!cancelled && url) setPendingObjectUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [documentFile]);

  if (!documentFile) return null;

  const isLocalPending = isLocalPendingDocument(documentFile);
  const isPdf =
    documentFile.mimeType === 'application/pdf' ||
    documentFile.fileName.toLowerCase().endsWith('.pdf');
  const isImage =
    !isPdf &&
    (documentFile.mimeType.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(documentFile.fileName));
  const uploadTimeText = formatUploadDateTime(documentFile.uploadedAt);
  const directUrl = getDocumentDirectUrl(documentFile);
  const downloadHref = isLocalPending
    ? pendingObjectUrl ||
      (documentFile.thumbnailUrl?.startsWith('data:') ? documentFile.thumbnailUrl : '')
    : getDocumentDownloadHref(documentFile);
  const driveId = isLocalPending ? undefined : documentFile.fileId || extractDriveFileId(directUrl);
  const pdfPreviewSrc = driveId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`
    : directUrl;

  const applyZoomAroundPoint = (nextZoomRaw: number, clientX?: number, clientY?: number) => {
    const nextZoom = clamp(Number(nextZoomRaw.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom <= MIN_ZOOM + 0.01) {
      setZoom(MIN_ZOOM);
      setPan({ x: 0, y: 0 });
      return;
    }

    const stage = stageRef.current;
    if (stage && clientX !== undefined && clientY !== undefined) {
      const rect = stage.getBoundingClientRect();
      const offsetX = clientX - (rect.left + rect.width / 2);
      const offsetY = clientY - (rect.top + rect.height / 2);
      const ratio = nextZoom / zoom;
      const targetPan = {
        x: offsetX - (offsetX - pan.x) * ratio,
        y: offsetY - (offsetY - pan.y) * ratio,
      };
      setZoom(nextZoom);
      setPan(clampPan(targetPan, nextZoom));
    } else {
      setZoom(nextZoom);
      setPan((prev) => clampPan(prev, nextZoom));
    }
  };

  const handleZoomIn = () => {
    const step = zoom < 2 ? 1 : zoom < 4 ? 1.5 : 1;
    applyZoomAroundPoint(zoom + step);
  };

  const handleZoomOut = () => {
    const step = zoom <= 2 ? 1 : zoom <= 4 ? 1.5 : 1;
    applyZoomAroundPoint(zoom - step);
  };

  const handleRotate = () => {
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    setPan((prev) => clampPan(prev, zoom, nextRotation));
  };

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!isImage) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    applyZoomAroundPoint(zoom * factor, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isImage || e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    measureBaseSize();
    pointerDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
    setIsInteracting(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointerDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true;
    }
    if (zoom > MIN_ZOOM) {
      setPan(clampPan({ x: drag.startPanX + dx, y: drag.startPanY + dy }, zoom));
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointerDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    pointerDragRef.current.active = false;
    pointerDragRef.current.pointerId = null;
    setIsInteracting(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }

    if (!drag.moved) {
      const target = e.target as HTMLElement;
      const clickedOnImage = Boolean(target.closest('[data-lightbox-image="true"]'));
      if (!clickedOnImage && zoom <= MIN_ZOOM) {
        onClose();
        return;
      }
      if (clickedOnImage) {
        if (zoom > MIN_ZOOM) {
          resetTransform();
        } else {
          applyZoomAroundPoint(2.5, e.clientX, e.clientY);
        }
      }
    }
  };

  const getTouchDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!isImage) return;
    e.stopPropagation();
    measureBaseSize();

    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.max(1, getTouchDistance(t1, t2));
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      touchStateRef.current = {
        mode: 'pinch',
        startX: midX,
        startY: midY,
        startPanX: pan.x,
        startPanY: pan.y,
        startDistance: dist,
        startZoom: zoom,
        startMidX: midX,
        startMidY: midY,
        moved: true,
      };
      setIsInteracting(true);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        startDistance: 0,
        startZoom: zoom,
        startMidX: t.clientX,
        startMidY: t.clientY,
        moved: false,
      };
      setIsInteracting(true);
    }
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!isImage) return;
    e.stopPropagation();
    const state = touchStateRef.current;

    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.max(1, getTouchDistance(t1, t2));
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      if (state.mode !== 'pinch') {
        touchStateRef.current = {
          mode: 'pinch',
          startX: midX,
          startY: midY,
          startPanX: pan.x,
          startPanY: pan.y,
          startDistance: dist,
          startZoom: zoom,
          startMidX: midX,
          startMidY: midY,
          moved: true,
        };
        return;
      }

      const nextZoom = clamp(state.startZoom * (dist / state.startDistance), MIN_ZOOM, MAX_ZOOM);
      const stage = stageRef.current;
      if (stage && nextZoom > MIN_ZOOM) {
        const rect = stage.getBoundingClientRect();
        const stageCenterX = rect.left + rect.width / 2;
        const stageCenterY = rect.top + rect.height / 2;
        const startRelX = state.startMidX - stageCenterX;
        const startRelY = state.startMidY - stageCenterY;
        const currRelX = midX - stageCenterX;
        const currRelY = midY - stageCenterY;
        const scaleRatio = nextZoom / state.startZoom;

        const targetPan = {
          x: currRelX - (startRelX - state.startPanX) * scaleRatio,
          y: currRelY - (startRelY - state.startPanY) * scaleRatio,
        };
        setZoom(nextZoom);
        setPan(clampPan(targetPan, nextZoom));
      } else {
        setZoom(nextZoom);
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    if (e.touches.length === 1 && state.mode === 'pan') {
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        state.moved = true;
      }
      if (zoom > MIN_ZOOM) {
        setPan(clampPan({ x: state.startPanX + dx, y: state.startPanY + dy }, zoom));
      }
    }
  };

  const handleTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!isImage) return;
    e.stopPropagation();
    const state = touchStateRef.current;

    // If lifting one finger from a 2-finger pinch, transition smoothly to 1-finger pan
    if (e.touches.length === 1) {
      const remaining = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startX: remaining.clientX,
        startY: remaining.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        startDistance: 0,
        startZoom: zoom,
        startMidX: remaining.clientX,
        startMidY: remaining.clientY,
        moved: true,
      };
      return;
    }

    setIsInteracting(false);
    touchStateRef.current.mode = 'none';

    if (!state.moved && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const now = Date.now();
      const target = e.target as HTMLElement;
      const tappedImage = Boolean(target.closest('[data-lightbox-image="true"]'));

      if (!tappedImage && zoom <= MIN_ZOOM) {
        onClose();
        return;
      }

      if (tappedImage) {
        const dt = now - lastTapRef.current.time;
        const dist = Math.hypot(t.clientX - lastTapRef.current.x, t.clientY - lastTapRef.current.y);
        if (dt < 280 && dist < 36) {
          if (zoom > MIN_ZOOM) {
            resetTransform();
          } else {
            applyZoomAroundPoint(2.8, t.clientX, t.clientY);
          }
          lastTapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        }
      }
    }
  };

  const isZoomed = zoom > MIN_ZOOM + 0.01;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau ${title}`}
    >
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {positionLabel && (
              <span className="shrink-0 rounded-lg bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-200 border border-teal-400/30 tabular-nums">
                {positionLabel}
              </span>
            )}
            <h3 className="truncate text-sm font-bold sm:text-base">{title}</h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400 tabular-nums sm:text-xs">
            {documentFile.fileName} ·{' '}
            {isImage && documentFile.width > 0
              ? `${documentFile.width} × ${documentFile.height} px · `
              : ''}
            {documentFile.compressedSize > 0
              ? formatBytes(documentFile.compressedSize)
              : isLocalPending
                ? 'Cache Lokal'
                : 'Google Drive'}
            {isLocalPending
              ? ' · Menunggu unggahan ke Google Drive (tersimpan aman di perangkat)'
              : uploadTimeText
                ? ` · Diunggah ${uploadTimeText}`
                : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {isImage && (
            <>
              <div className="hidden items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-0.5 md:flex">
                {[1, 2.5, 3.8].map((preset) => {
                  const active = Math.abs(zoom - preset) < 0.15;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        preset <= 1 ? resetTransform() : applyZoomAroundPoint(preset)
                      }
                      className={`h-8 rounded-lg px-2 text-[11px] font-semibold tabular-nums transition-colors ${
                        active
                          ? 'bg-teal-600 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      title={`Zoom ${Math.round(preset * 100)}%`}
                    >
                      {Math.round(preset * 100)}%
                    </button>
                  );
                })}
              </div>

              {(onPrev || onNext) && (
                <button
                  type="button"
                  onClick={() => setKeepViewLocked((v) => !v)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                    keepViewLocked
                      ? 'border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                      : 'border-white/15 bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  title="Pertahankan posisi & zoom saat geser ke foto berikutnya"
                >
                  {keepViewLocked ? (
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="hidden sm:inline">Kunci Zoom</span>
                </button>
              )}

              <button
                type="button"
                disabled={zoom <= MIN_ZOOM}
                onClick={handleZoomOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Perkecil gambar"
                title="Perkecil"
              >
                <ZoomOut className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={resetTransform}
                disabled={!isZoomed}
                className="inline-flex h-10 min-w-[50px] items-center justify-center rounded-xl border border-white/15 bg-white/10 px-2 text-xs font-semibold text-white tabular-nums transition-colors hover:bg-white/20 disabled:opacity-60"
                aria-label="Reset ukuran gambar"
                title="Ketuk untuk reset ke 100%"
              >
                {zoomPercent}%
              </button>

              <button
                type="button"
                disabled={zoom >= MAX_ZOOM}
                onClick={handleZoomIn}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Perbesar gambar"
                title="Perbesar hingga 600%"
              >
                <ZoomIn className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Putar gambar 90 derajat"
                title="Putar"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </>
          )}

          {isLocalPending ? (
            <button
              type="button"
              onClick={async () => {
                const jobId = extractPendingJobId(documentFile);
                if (!jobId) return;
                const res = await downloadPendingJobToGallery(jobId);
                setSaveToast(res.note);
                window.setTimeout(() => setSaveToast(null), 4500);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 sm:w-auto sm:gap-1.5 sm:px-3"
              aria-label={`Simpan ${documentFile.fileName}`}
              title="Simpan ke Perangkat"
            >
              <Download className="h-4 w-4" />
              <span className="hidden text-xs font-medium sm:inline">Simpan</span>
            </button>
          ) : (
            <a
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              download={documentFile.fileName}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 sm:w-auto sm:gap-1.5 sm:px-3"
              aria-label={`Unduh ${documentFile.fileName}`}
              title="Unduh"
            >
              <Download className="h-4 w-4" />
              <span className="hidden text-xs font-medium sm:inline">Unduh</span>
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Tutup pratinjau"
            title="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="border-b border-teal-500/30 bg-teal-950/90 px-4 py-2 text-center text-xs font-medium text-teal-100">
          {saveToast}
        </div>
      )}

      {/* Viewport Stage */}
      <div
        ref={stageRef}
        data-allow-pinch-zoom={isImage ? 'true' : undefined}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={!isImage ? onClose : undefined}
        className={`relative flex flex-1 items-center justify-center overflow-hidden p-3 select-none sm:p-6 ${
          isImage ? (isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in') : ''
        }`}
      >
        {isPdf ? (
          <iframe
            src={pdfPreviewSrc}
            title={title}
            onClick={(e) => e.stopPropagation()}
            className="h-full min-h-[70vh] w-full max-w-4xl rounded-xl bg-white"
          />
        ) : isImage ? (
          <div
            data-lightbox-image="true"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            className={`flex max-h-full max-w-full items-center justify-center ${
              isInteracting ? 'transition-none' : 'transition-transform duration-150 ease-out'
            }`}
          >
            <div
              ref={contentRef}
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              className="flex items-center justify-center"
            >
              <DriveImage
                doc={documentFile}
                alt={title}
                fallbackWidth={1600}
                draggable={false}
                onLoad={() => {
                  measureBaseSize();
                }}
                className="pointer-events-none block max-h-[calc(100vh-110px)] max-w-[calc(100vw-24px)] rounded-lg object-contain select-none sm:max-h-[calc(100vh-130px)] sm:max-w-[calc(100vw-48px)]"
              />
            </div>
          </div>
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
              href={downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              download={documentFile.fileName}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Download className="h-4 w-4" />
              <span>Unduh Berkas</span>
            </a>
          </div>
        )}

        {/* Floating Previous / Next Photo Navigation Buttons */}
        {hasPrev && onPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="Foto sebelumnya"
            title="Sebelumnya (Panah Kiri)"
            className="absolute top-1/2 left-2.5 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-900/75 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-slate-800 sm:left-4 sm:h-12 sm:w-12"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {hasNext && onNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="Foto berikutnya"
            title="Berikutnya (Panah Kanan)"
            className="absolute top-1/2 right-2.5 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-900/75 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-slate-800 sm:right-4 sm:h-12 sm:w-12"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Bottom Panning Hint / Reset Bar when zoomed (only when audit footer bar is absent) */}
        {isImage && isZoomed && !auditContext && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-slate-900/85 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-sm">
            <span className="whitespace-nowrap">Geser foto untuk melihat sisi lain</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetTransform();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.stopPropagation();
                resetTransform();
              }}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Audit & Navigation Bar for DINSOS Verification */}
      {auditContext && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-900/95 px-3 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {auditContext.expectedLabel && (
              <span className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-mono text-xs font-bold text-amber-200">
                {auditContext.expectedLabel}
              </span>
            )}
            {isImage && isZoomed && (
              <button
                type="button"
                onClick={resetTransform}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/20"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Zoom</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {auditContext.onMarkStatus && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    auditContext.onMarkStatus?.(
                      auditContext.status === 'verified' ? null : 'verified',
                      auditContext.status !== 'verified' && hasNext
                    )
                  }
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                    auditContext.status === 'verified'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  }`}
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {auditContext.status === 'verified'
                      ? 'Sudah Sesuai'
                      : hasNext
                        ? 'Sesuai & Lanjut'
                        : 'Tandai Sesuai'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    auditContext.onMarkStatus?.(
                      auditContext.status === 'mismatch' ? null : 'mismatch',
                      false
                    )
                  }
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                    auditContext.status === 'mismatch'
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'border border-rose-400/40 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Tertukar</span>
                </button>
              </>
            )}

            {auditContext.onSwapClick && (
              <button
                type="button"
                onClick={auditContext.onSwapClick}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-teal-400/40 bg-teal-500/20 px-3 text-xs font-semibold text-teal-100 hover:bg-teal-500/30"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                <span>Tukar / Pindah Foto</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
