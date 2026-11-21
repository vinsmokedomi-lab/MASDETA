import { ReactNode, TouchEvent, useRef, useState } from 'react';
import { useOfflineStatus } from '../contexts/OfflineContext';

export interface SwipeStackedSubAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone: 'teal' | 'amber' | 'neutral' | 'danger' | 'locked';
  disabled?: boolean;
  keepOpen?: boolean;
}

export interface SwipeAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone: 'teal' | 'amber' | 'neutral' | 'danger' | 'locked';
  disabled?: boolean;
  width?: number;
  keepOpen?: boolean;
  stackedActions?: SwipeStackedSubAction[];
}

interface SwipeableRowProps {
  id: string;
  isOpen: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  actions: SwipeAction[];
  children: ReactNode;
}

const ACTION_WIDTH = 68;

const TONE_CLASSES: Record<SwipeAction['tone'], string> = {
  teal: 'bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900',
  amber: 'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800',
  neutral: 'bg-slate-700 text-white hover:bg-slate-800 active:bg-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  locked: 'bg-slate-200 text-slate-600 hover:bg-slate-300 active:bg-slate-300',
};

export function SwipeableRow({
  id,
  isOpen,
  onOpen,
  onClose,
  actions,
  children,
}: SwipeableRowProps) {
  const { isOffline } = useOfflineStatus();
  const totalWidth = actions.reduce((sum, a) => sum + (a.width ?? ACTION_WIDTH), 0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    baseOffset: 0,
    axis: 'none' as 'none' | 'horizontal' | 'vertical',
    didSwipe: false,
  });

  if (actions.length === 0) {
    return <>{children}</>;
  }

  const currentOffset = dragOffset !== null ? dragOffset : isOpen ? -totalWidth : 0;
  const showTray = isOpen || (dragOffset !== null && dragOffset < -1);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    gestureRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      baseOffset: isOpen ? -totalWidth : 0,
      axis: 'none',
      didSwipe: false,
    };
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const g = gestureRef.current;
    if (g.axis === 'vertical') return;

    const dx = e.touches[0].clientX - g.startX;
    const dy = e.touches[0].clientY - g.startY;

    if (g.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        g.axis = 'vertical';
        return;
      }
      // Hanya mulai geser kiri jika belum terbuka atau sedang menutup baris yang terbuka
      if (!isOpen && dx > 0) {
        g.axis = 'vertical';
        return;
      }
      g.axis = 'horizontal';
      g.didSwipe = true;
    }

    const rawNext = g.baseOffset + dx;
    const clamped = Math.max(-(totalWidth + 14), Math.min(10, rawNext));
    setDragOffset(clamped);
  };

  const finishDrag = () => {
    const g = gestureRef.current;
    if (g.axis !== 'horizontal' || dragOffset === null) {
      setDragOffset(null);
      return;
    }

    const finalOffset = dragOffset;
    setDragOffset(null);

    if (!isOpen) {
      if (finalOffset <= -Math.min(40, totalWidth * 0.35)) {
        onOpen(id);
      } else {
        onClose();
      }
    } else {
      if (finalOffset >= -(totalWidth - 28)) {
        onClose();
      } else {
        onOpen(id);
      }
    }
  };

  return (
    <div
      className="relative overflow-hidden bg-white select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishDrag}
      onTouchCancel={finishDrag}
    >
      {/* Right-Side Action Drawer */}
      {showTray && (
        <div
          className="absolute inset-y-0 right-0 flex items-stretch"
          style={{ width: `${totalWidth}px` }}
        >
          {actions.map((action) => {
            const colWidth = action.width ?? ACTION_WIDTH;
            if (action.stackedActions && action.stackedActions.length > 0) {
              return (
                <div
                  key={action.key}
                  style={{ width: `${colWidth}px` }}
                  className="flex flex-col divide-y divide-white/20"
                >
                  {action.stackedActions.map((sub) => {
                    const isSubDisabled = Boolean(sub.disabled || isOffline);
                    return (
                      <button
                        key={sub.key}
                        type="button"
                        disabled={isSubDisabled}
                        title={isOffline ? 'Mode Offline (Read-Only)' : sub.label}
                        aria-label={sub.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSubDisabled) return;
                          if (!sub.keepOpen) {
                            onClose();
                          }
                          sub.onClick();
                        }}
                        className={`flex flex-1 items-center justify-center transition-colors ${TONE_CLASSES[sub.tone]} ${
                          isSubDisabled ? 'cursor-not-allowed opacity-40' : ''
                        }`}
                      >
                        {sub.icon}
                      </button>
                    );
                  })}
                </div>
              );
            }

            const isDisabled = Boolean(action.disabled || isOffline);
            return (
              <button
                key={action.key}
                type="button"
                disabled={isDisabled}
                title={isOffline ? 'Mode Offline (Read-Only)' : action.label}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDisabled) return;
                  if (!action.keepOpen) {
                    onClose();
                  }
                  action.onClick();
                }}
                style={{ width: `${colWidth}px` }}
                className={`flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors ${TONE_CLASSES[action.tone]} ${
                  isDisabled ? 'cursor-not-allowed opacity-45 grayscale' : ''
                }`}
              >
                {action.icon}
                <span className="truncate">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sliding Foreground Row */}
      <div
        onClickCapture={(e) => {
          if (gestureRef.current.didSwipe) {
            e.preventDefault();
            e.stopPropagation();
            gestureRef.current.didSwipe = false;
            return;
          }
          if (isOpen) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        className={`relative z-10 bg-white ${
          dragOffset !== null ? '' : 'transition-transform duration-200 ease-out'
        }`}
        style={{ transform: `translateX(${currentOffset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
