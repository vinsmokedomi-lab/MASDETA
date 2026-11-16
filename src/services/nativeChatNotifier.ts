import { Capacitor, registerPlugin } from '@capacitor/core';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabaseClient';

export interface NativeChatNotifierConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl?: string;
  sessionToken?: string;
  userId: string;
  senderNames: Record<string, string>;
  lastSeenAt: string;
  notifiedIds: string[];
  enabled: boolean;
}

interface MasdetaChatNotifierPlugin {
  configure(options: NativeChatNotifierConfig): Promise<void>;
  setForeground(options: { isForeground: boolean }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  markNotified(options: { ids: string[]; lastSeenAt?: string }): Promise<void>;
  consumePendingSender(): Promise<{ senderId?: string }>;
  clear(): Promise<void>;
}

const MasdetaChatNotifier = registerPlugin<MasdetaChatNotifierPlugin>('MasdetaChatNotifier');

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function syncNativeChatNotifierConfig(params: {
  userId: string;
  senderNames: Record<string, string>;
  lastSeenAt: string;
  notifiedIds: string[];
  enabled: boolean;
  sessionToken?: string | null;
}): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    const apiBaseUrl =
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
        ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
        : '';
    await MasdetaChatNotifier.configure({
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      apiBaseUrl,
      sessionToken: params.sessionToken || '',
      userId: params.userId,
      senderNames: params.senderNames,
      lastSeenAt: params.lastSeenAt,
      notifiedIds: params.notifiedIds.slice(-80),
      enabled: params.enabled,
    });
  } catch {
    // Aman diabaikan jika APK versi lama belum memiliki plugin native ini
  }
}

export async function setNativeAppForeground(isForeground: boolean): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await MasdetaChatNotifier.setForeground({ isForeground });
  } catch {
    // Ignore
  }
}

export async function setNativeNotifierEnabled(enabled: boolean): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await MasdetaChatNotifier.setEnabled({ enabled });
  } catch {
    // Ignore
  }
}

export async function markNativeNotifiedIds(ids: string[], lastSeenAt?: string): Promise<void> {
  if (!isNativeAndroid() || ids.length === 0) return;
  try {
    await MasdetaChatNotifier.markNotified({ ids: ids.slice(-80), lastSeenAt });
  } catch {
    // Ignore
  }
}

export async function consumePendingNotificationSender(): Promise<string | null> {
  if (!isNativeAndroid()) return null;
  try {
    const res = await MasdetaChatNotifier.consumePendingSender();
    return res?.senderId ? String(res.senderId) : null;
  } catch {
    return null;
  }
}

export async function clearNativeChatNotifier(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await MasdetaChatNotifier.clear();
  } catch {
    // Ignore
  }
}
