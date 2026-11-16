import { Capacitor, registerPlugin } from '@capacitor/core';

interface CekBansosPlugin {
  open(options: { nik: string }): Promise<void>;
}

const CekBansos = registerPlugin<CekBansosPlugin>('CekBansos');

export const CEK_BANSOS_URL = 'https://cekbansos.kemensos.go.id/';

async function copyNikToClipboard(nik: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(nik);
      return true;
    }
  } catch {
    // Fallback ke execCommand
  }

  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = nik;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // Ignore
  }
  return false;
}

export function openExternalUrlInNewTab(url: string): void {
  if (typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export async function openCekBansosWithNik(rawNik: string): Promise<{
  nik: string;
  copied: boolean;
  openedInNativeWebView: boolean;
}> {
  const nik = rawNik.replace(/\D/g, '').trim();
  if (!nik) {
    throw new Error('NIK KTP belum diisi atau tidak valid.');
  }

  const copied = await copyNikToClipboard(nik);

  if (Capacitor.isNativePlatform()) {
    try {
      await CekBansos.open({ nik });
      return { nik, copied, openedInNativeWebView: true };
    } catch {
      // Fallback ke browser eksternal jika shell APK belum memiliki plugin native
    }
  }

  openExternalUrlInNewTab(CEK_BANSOS_URL);
  return { nik, copied, openedInNativeWebView: false };
}
