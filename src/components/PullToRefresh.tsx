import { ReactNode, TouchEvent, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  children: ReactNode;
}

const TRIGGER_THRESHOLD = 68;
const MAX_PULL = 104;

function isEligibleToPull(target: EventTarget | null): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const pageScrollTop =
    window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  if (pageScrollTop > 2) return false;

  // Jangan aktifkan pull-to-refresh jika ada modal/dialog atau lightbox terbuka
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
    return false;
  }

  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.scrollTop > 2 && el.scrollHeight > el.clientHeight + 2) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return false;
      }
    }
    el = el.parentElement;
  }

  return true;
}

export function PullToRefresh({ onRefresh, disabled = false, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    canPull: false,
    tracking: false,
    currentPull: 0,
  });

  const resetGesture = () => {
    gestureRef.current.canPull = false;
    gestureRef.current.tracking = false;
    gestureRef.current.currentPull = 0;
    setPullDistance(0);
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing || e.touches.length !== 1) {
      gestureRef.current.canPull = false;
      gestureRef.current.tracking = false;
      return;
    }

    if (!isEligibleToPull(e.target)) {
      gestureRef.current.canPull = false;
      gestureRef.current.tracking = false;
      return;
    }

    gestureRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      canPull: true,
      tracking: false,
      currentPull: 0,
    };
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const state = gestureRef.current;
    if (!state.canPull || disabled || isRefreshing || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    if (!state.tracking) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

      // Batalkan jika user menggeser ke samping atau scroll ke bawah halaman
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.9) {
        state.canPull = false;
        return;
      }

      const currentPageTop =
        window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (currentPageTop > 2) {
        state.canPull = false;
        return;
      }

      state.tracking = true;
    }

    if (dy <= 0) {
      state.currentPull = 0;
      setPullDistance(0);
      return;
    }

    // Kurva damping agar terasa halus & alami
    const damped = Math.min(MAX_PULL, Math.round(dy * 0.44));
    state.currentPull = damped;
    setPullDistance(damped);
  };

  const handleTouchEnd = async () => {
    const state = gestureRef.current;
    if (!state.tracking) {
      state.canPull = false;
      return;
    }

    const reachedThreshold = state.currentPull >= TRIGGER_THRESHOLD;
    state.canPull = false;
    state.tracking = false;
    state.currentPull = 0;

    if (!reachedThreshold || disabled || isRefreshing) {
      setPullDistance(0);
      return;
    }

    setIsRefreshing(true);
    setPullDistance(56);
    try {
      await Promise.all([
        onRefresh(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 420)),
      ]);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  const isVisible = isRefreshing || pullDistance > 6;
  const isReady = pullDistance >= TRIGGER_THRESHOLD;
  const progress = Math.min(1, pullDistance / TRIGGER_THRESHOLD);
  const translateY = isRefreshing ? 14 : Math.max(-44, Math.min(20, pullDistance - 44));

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={resetGesture}
      className="relative"
    >
      {isVisible && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-0 left-1/2 z-40 -translate-x-1/2 transition-opacity duration-150"
          style={{
            transform: `translate(-50%, ${translateY}px)`,
            opacity: isRefreshing ? 1 : Math.min(1, Math.max(0.15, progress)),
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2 shadow-lg backdrop-blur-xs">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                isRefreshing || isReady ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                style={
                  isRefreshing
                    ? undefined
                    : { transform: `rotate(${Math.round(progress * 260)}deg)` }
                }
              />
            </span>
            <span className="text-[11px] font-semibold tracking-tight text-slate-700">
              {isRefreshing
                ? 'Memuat ulang data...'
                : isReady
                  ? 'Lepas untuk menyegarkan'
                  : 'Tarik untuk muat ulang'}
            </span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
