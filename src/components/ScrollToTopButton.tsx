import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { isNativeAppPlatform } from '../utils/platform';

interface ScrollToTopButtonProps {
  hasBottomNav?: boolean;
  hasFloatingAction?: boolean;
}

export function ScrollToTopButton({
  hasBottomNav = false,
  hasFloatingAction = false,
}: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);
  const isNativeApp = isNativeAppPlatform();

  useEffect(() => {
    const updateVisibility = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const viewportHeight = window.innerHeight || 0;
      const scrollHeight = document.documentElement.scrollHeight || 0;
      const isScrollable = scrollHeight > viewportHeight + 240;
      const nearBottom = scrollY + viewportHeight >= scrollHeight - 280;
      const scrolledFar = scrollY > 420;
      setVisible(isScrollable && scrollY > 200 && (nearBottom || scrolledFar));
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility, { passive: true });
    window.addEventListener('masdeta-scroll-sync', updateVisibility);
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      window.removeEventListener('masdeta-scroll-sync', updateVisibility);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-end px-4 transition-all ${
        hasBottomNav || hasFloatingAction ? 'bottom-22' : 'bottom-6'
      } ${
        !isNativeApp
          ? `lg:left-auto lg:right-6 lg:w-auto lg:max-w-none lg:translate-x-0 lg:px-0 ${
              hasFloatingAction ? 'lg:bottom-22' : 'lg:bottom-6'
            }`
          : ''
      }`}
    >
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Kembali ke paling atas"
        className="pointer-events-auto inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border border-slate-700/20 bg-slate-900/90 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-teal-700 active:scale-95"
      >
        <ArrowUp className="h-6 w-6" />
      </button>
    </div>
  );
}
