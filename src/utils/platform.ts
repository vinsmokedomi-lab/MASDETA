import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * True when running inside the native Capacitor Android/iOS shell.
 * Native APK builds always preserve the mobile-first layout even on tablets.
 */
export function isNativeAppPlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * True ONLY when running in a web browser at web workspace viewport width (>= 768px).
 * Never returns true inside the native Android APK.
 */
export function useIsDesktopWeb(): boolean {
  const isNative = isNativeAppPlatform();
  const [isDesktopWidth, setIsDesktopWidth] = useState<boolean>(() => {
    if (isNative || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (isNative || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsDesktopWidth(false);
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktopWidth(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [isNative]);

  return !isNative && isDesktopWidth;
}
