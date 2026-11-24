import { ImgHTMLAttributes, memo, useEffect, useState } from 'react';
import {
  buildDriveFallbackThumbnailUrl,
  extractDriveFileId,
} from '../services/driveManager';
import { KpmDocumentFile } from '../types/kpm';
import {
  ensurePendingPhotoObjectUrl,
  extractPendingJobId,
  getPendingPhotoObjectUrl,
  isLocalPendingDocument,
  LOCAL_PENDING_URL_PREFIX,
} from '../utils/photoUploadManager';

interface DriveImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  doc?: KpmDocumentFile | null;
  src?: string | null;
  thumbnailUrl?: string | null;
  fallbackWidth?: number;
  onBothFailed?: () => void;
}

/**
 * Render gambar dari Google Drive menggunakan directUrl terlebih dahulu,
 * serta mendukung preview lokal instan (local-pending://) dari brankas IndexedDB.
 */
export const DriveImage = memo(function DriveImage({
  doc,
  src,
  thumbnailUrl,
  fallbackWidth = 1000,
  onBothFailed,
  referrerPolicy = 'no-referrer',
  loading = 'lazy',
  decoding = 'async',
  alt = '',
  ...rest
}: DriveImageProps) {
  const primarySrc = (doc?.directUrl || doc?.dataUrl || src || '').trim();
  const explicitThumb = (doc?.thumbnailUrl || thumbnailUrl || '').trim();
  const isLocalPending =
    isLocalPendingDocument(doc) || primarySrc.startsWith(LOCAL_PENDING_URL_PREFIX);
  const pendingJobId = isLocalPending
    ? extractPendingJobId(doc) ||
      (primarySrc.startsWith(LOCAL_PENDING_URL_PREFIX)
        ? primarySrc.slice(LOCAL_PENDING_URL_PREFIX.length)
        : '')
    : '';

  const usableLocalThumb =
    explicitThumb && !explicitThumb.startsWith(LOCAL_PENDING_URL_PREFIX) ? explicitThumb : '';

  const initialSrc = isLocalPending
    ? (pendingJobId ? getPendingPhotoObjectUrl(pendingJobId) : '') || usableLocalThumb
    : primarySrc;

  const computedThumb = isLocalPending
    ? usableLocalThumb
    : explicitThumb ||
      buildDriveFallbackThumbnailUrl(doc?.fileId || primarySrc, fallbackWidth);

  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [usedFallback, setUsedFallback] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setUsedFallback(false);
    setHasFailed(false);
    if (isLocalPending && pendingJobId) {
      const syncUrl = getPendingPhotoObjectUrl(pendingJobId) || usableLocalThumb;
      setCurrentSrc(syncUrl);
      let cancelled = false;
      void ensurePendingPhotoObjectUrl(pendingJobId).then((resolved) => {
        if (!cancelled && resolved) {
          setCurrentSrc(resolved);
          setHasFailed(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    setCurrentSrc(primarySrc);
    return undefined;
  }, [isLocalPending, pendingJobId, usableLocalThumb, primarySrc, computedThumb]);

  if (!currentSrc || hasFailed) {
    return null;
  }

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      referrerPolicy={referrerPolicy}
      onError={() => {
        if (isLocalPending) {
          if (!usedFallback && usableLocalThumb && usableLocalThumb !== currentSrc) {
            setUsedFallback(true);
            setCurrentSrc(usableLocalThumb);
            return;
          }
          setHasFailed(true);
          onBothFailed?.();
          return;
        }

        if (currentSrc.startsWith('blob:') || currentSrc.startsWith('data:')) {
          setHasFailed(true);
          onBothFailed?.();
          return;
        }

        if (!usedFallback && computedThumb && computedThumb !== currentSrc) {
          setUsedFallback(true);
          setCurrentSrc(computedThumb);
          return;
        }
        const extractedId = extractDriveFileId(doc?.fileId || currentSrc);
        if (!usedFallback && extractedId) {
          const driveThumb = buildDriveFallbackThumbnailUrl(extractedId, fallbackWidth);
          if (driveThumb && driveThumb !== currentSrc) {
            setUsedFallback(true);
            setCurrentSrc(driveThumb);
            return;
          }
        }
        setHasFailed(true);
        onBothFailed?.();
      }}
    />
  );
});
