import { ReactNode, TouchEvent, useRef, useState } from 'react';

export interface SwipeAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone: 'teal' | 'amber' | 'neutral' | 'danger' | 'locked';
  disabled?: boolean;
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
  const totalWidth = actions.length * ACTION_WIDTH;
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
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
                action.onClick();
              }}
              style={{ width: `${ACTION_WIDTH}px` }}
              className={`flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors ${TONE_CLASSES[action.tone]} ${
                action.disabled ? 'cursor-not-allowed opacity-60' : ''
              }`}
            >
              {action.icon}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
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
