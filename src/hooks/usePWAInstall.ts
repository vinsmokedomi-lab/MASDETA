import { useCallback, useEffect, useRef, useState } from 'react';
import { SUPABASE_URL, isSupabaseConfigured } from '../lib/supabaseClient';

const PROBE_TIMEOUT_MS = 6000;
const PERIODIC_CHECK_INTERVAL_MS = 15000;

async function probeRemoteInternet(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  const probeBase = isSupabaseConfigured
    ? `${SUPABASE_URL}/rest/v1/`
    : 'https://www.gstatic.com/generate_204';
  const separator = probeBase.includes('?') ? '&' : '?';
  const probeUrl = `${probeBase}${separator}_t=${Date.now()}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    await fetch(probeUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export interface OnlineStatusState {
  isOnline: boolean;
  onlineVerified: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
}

export function useOnlineStatus(): OnlineStatusState {
  const initialNavigatorOnline =
    typeof navigator !== 'undefined' ? navigator.onLine : true;

  const [isOnline, setIsOnline] = useState<boolean>(initialNavigatorOnline);
  const [onlineVerified, setOnlineVerified] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const isOnlineRef = useRef<boolean>(initialNavigatorOnline);
  const consecutiveFailuresRef = useRef<number>(0);
  const inFlightProbeRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const runProbe = useCallback(async (strictSingleFailure: boolean): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      consecutiveFailuresRef.current = 0;
      isOnlineRef.current = false;
      setIsOnline(false);
      setOnlineVerified(true);
      return false;
    }

    if (inFlightProbeRef.current) {
      return inFlightProbeRef.current;
    }

    setIsChecking(true);
    const task = (async () => {
      try {
        const reachable = await probeRemoteInternet();
        if (reachable) {
          consecutiveFailuresRef.current = 0;
          isOnlineRef.current = true;
          setIsOnline(true);
          setOnlineVerified(true);
          return true;
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          consecutiveFailuresRef.current = 0;
          isOnlineRef.current = false;
          setIsOnline(false);
          setOnlineVerified(true);
          return false;
        }

        consecutiveFailuresRef.current += 1;
        if (strictSingleFailure || consecutiveFailuresRef.current >= 2 || !isOnlineRef.current) {
          isOnlineRef.current = false;
          setIsOnline(false);
          setOnlineVerified(true);
          return false;
        }

        return isOnlineRef.current;
      } finally {
        setIsChecking(false);
        inFlightProbeRef.current = null;
      }
    })();

    inFlightProbeRef.current = task;
    return task;
  }, []);

  const checkConnection = useCallback(() => runProbe(true), [runProbe]);

  useEffect(() => {
    let cancelled = false;

    void runProbe(true).then((ok) => {
      if (!cancelled && !ok) {
        isOnlineRef.current = false;
        setIsOnline(false);
        setOnlineVerified(true);
      }
    });

    const handleOffline = () => {
      consecutiveFailuresRef.current = 0;
      isOnlineRef.current = false;
      setIsOnline(false);
      setOnlineVerified(true);
    };

    const handleOnline = () => {
      void runProbe(true);
    };

    const handleResumeCheck = () => {
      if (document.visibilityState === 'visible') {
        void runProbe(!isOnlineRef.current);
      }
    };

    const handleWindowFocus = () => {
      void runProbe(!isOnlineRef.current);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleResumeCheck);

    const intervalId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        handleOffline();
        return;
      }
      if (document.visibilityState === 'visible') {
        void runProbe(!isOnlineRef.current);
      }
    }, PERIODIC_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleResumeCheck);
      window.clearInterval(intervalId);
    };
  }, [runProbe]);

  return { isOnline, onlineVerified, isChecking, checkConnection };
}
