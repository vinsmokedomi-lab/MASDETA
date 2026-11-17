import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {isNativeAppPlatform} from './utils/platform';

if (
  import.meta.env.PROD &&
  !isNativeAppPlatform() &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator
) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const checkSwUpdate = () => {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        void reg.update().catch(() => {});
      });
    });
  };

  window.addEventListener('load', checkSwUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSwUpdate();
  });
}

createRoot(document.getElementById('root')!).render(<App />);
