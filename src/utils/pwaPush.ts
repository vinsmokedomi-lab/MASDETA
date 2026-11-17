import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

export function isMobileWebBrowser(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

export interface PushSupportMeta {
  isNative: boolean;
  isIOS: boolean;
  isMobileWeb: boolean;
  isStandalone: boolean;
  requiresIosHomeScreenInstall: boolean;
  canReceiveWebPush: boolean;
}

export function getPushSupportMeta(): PushSupportMeta {
  const isNative = Capacitor.isNativePlatform();
  const isIOS = isIOSDevice();
  const isMobileWeb = isMobileWebBrowser();
  const isStandalone = isStandalonePwa();
  const hasNotifApi = typeof window !== 'undefined' && 'Notification' in window;
  const requiresIosHomeScreenInstall = !isNative && isIOS && !isStandalone;
  const canReceiveWebPush =
    isNative || (!requiresIosHomeScreenInstall && hasNotifApi);

  return {
    isNative,
    isIOS,
    isMobileWeb,
    isStandalone,
    requiresIosHomeScreenInstall,
    canReceiveWebPush,
  };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandalonePwa());

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return {
    canPromptInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    promptInstall,
  };
}

export function consumeUrlChatPeerId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const peer = url.searchParams.get('chatPeer');
    if (peer && peer.trim()) {
      url.searchParams.delete('chatPeer');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return peer.trim();
    }
  } catch {
    // Abaikan URL malformed
  }
  return null;
}

export function listenSwOpenChat(onOpenPeer: (peerId: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; senderId?: string } | null;
    if (data?.type === 'masdeta:open-chat' && typeof data.senderId === 'string' && data.senderId) {
      onOpenPeer(data.senderId);
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

export async function ensureBrowserPushSubscription(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    Capacitor.isNativePlatform() ||
    !('serviceWorker' in navigator)
  ) {
    return null;
  }
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.ready.catch(() => undefined));
    return reg ?? null;
  } catch {
    return null;
  }
}
