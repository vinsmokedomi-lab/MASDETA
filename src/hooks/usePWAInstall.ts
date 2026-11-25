import { useCallback, useEffect, useRef, useState } from 'react';

const PROBE_TIMEOUT_MS = 6000;

async function probeRemoteInternet(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  // Never probe Supabase REST API without auth (generates HTTP 401 log spam)
  const probeUrl = `https://www.gstatic.com/generate_204?_t=${Date.now()}`;

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

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [runProbe]);

  return { isOnline, onlineVerified, isChecking, checkConnection };
}
