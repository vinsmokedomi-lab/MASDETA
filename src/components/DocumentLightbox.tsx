import {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Download, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { DriveImage } from './DriveImage';
import { extractDriveFileId } from '../services/driveManager';
import { KpmDocumentFile } from '../types/kpm';
import {
  formatBytes,
  formatUploadDateTime,
  getDocumentDirectUrl,
  getDocumentDownloadHref,
} from '../utils/imageProcessor';

interface DocumentLightboxProps {
  documentFile: KpmDocumentFile | null;
  title: string;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DocumentLightbox({ documentFile, title, onClose }: DocumentLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);

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

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setIsInteracting(false);
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
  const directUrl = getDocumentDirectUrl(documentFile);
  const downloadHref = getDocumentDownloadHref(documentFile);
  const driveId = documentFile.fileId || extractDriveFileId(directUrl);
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
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold sm:text-base">{title}</h3>
          <p className="truncate text-[11px] text-slate-400 tabular-nums sm:text-xs">
            {documentFile.fileName} ·{' '}
            {isImage && documentFile.width > 0
              ? `${documentFile.width} × ${documentFile.height} px · `
              : ''}
            {documentFile.compressedSize > 0
              ? formatBytes(documentFile.compressedSize)
              : 'Google Drive'}
            {uploadTimeText ? ` · Diunggah ${uploadTimeText}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isImage && (
            <>
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

        {/* Bottom Panning Hint / Reset Bar when zoomed */}
        {isImage && isZoomed && (
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
    </div>
  );
}
