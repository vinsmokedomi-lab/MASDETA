import { ImgHTMLAttributes, useEffect, useState } from 'react';
import {
  buildDriveFallbackThumbnailUrl,
  extractDriveFileId,
} from '../services/driveManager';
import { KpmDocumentFile } from '../types/kpm';

interface DriveImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  doc?: KpmDocumentFile | null;
  src?: string | null;
  thumbnailUrl?: string | null;
  fallbackWidth?: number;
  onBothFailed?: () => void;
}

/**
 * Render gambar dari Google Drive menggunakan directUrl terlebih dahulu.
 * Jika event onError terpicu, otomatis beralih ke thumbnailUrl Drive.
 */
export function DriveImage({
  doc,
  src,
  thumbnailUrl,
  fallbackWidth = 1000,
  onBothFailed,
  referrerPolicy = 'no-referrer',
  alt = '',
  ...rest
}: DriveImageProps) {
  const primarySrc = (doc?.directUrl || doc?.dataUrl || src || '').trim();
  const explicitThumb = (doc?.thumbnailUrl || thumbnailUrl || '').trim();
  const computedThumb =
    explicitThumb ||
    buildDriveFallbackThumbnailUrl(doc?.fileId || primarySrc, fallbackWidth);

  const [currentSrc, setCurrentSrc] = useState(primarySrc);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setCurrentSrc(primarySrc);
    setUsedFallback(false);
  }, [primarySrc, computedThumb]);

  if (!currentSrc) {
    return null;
  }

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      referrerPolicy={referrerPolicy}
      onError={() => {
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
        onBothFailed?.();
      }}
    />
  );
}
