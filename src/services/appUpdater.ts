import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { APP_VERSION, GITHUB_REPO } from '../config/appVersion';

const UPDATE_APK_FILENAME = 'masdeta-update.apk';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const REQUIRED_UPDATE_CACHE_KEY = 'masdeta_required_update_info_v1';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

interface GitHubLatestReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  tagName: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  apkDownloadUrl: string | null;
  apkFileName: string | null;
  apkSizeBytes: number | null;
  publishedAt: string | null;
}

export function normalizeSemver(version: string): string {
  const cleaned = (version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0]
    .trim();
  return cleaned || '0.0.0';
}

export function compareSemver(a: string, b: string): number {
  const partsA = normalizeSemver(a)
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const partsB = normalizeSemver(b)
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);

  for (let i = 0; i < len; i++) {
    const valA = partsA[i] ?? 0;
    const valB = partsB[i] ?? 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }
  return 0;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const endpoint = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  // Tanpa custom headers agar bebas CORS preflight di WebView Android maupun browser
  const response = await fetch(endpoint);

  if (response.status === 404) {
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      tagName: `v${APP_VERSION}`,
      releaseName: `MASDETA v${APP_VERSION}`,
      releaseNotes: '',
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      apkDownloadUrl: null,
      apkFileName: null,
      apkSizeBytes: null,
      publishedAt: null,
    };
  }

  if (!response.ok) {
    throw new Error(`Gagal memeriksa pembaruan (${response.status}).`);
  }

  const release = (await response.json()) as GitHubLatestReleaseResponse;
  const tagName = (release.tag_name || `v${APP_VERSION}`).trim();
  const latestVersion = normalizeSemver(tagName);
  const apkAsset = Array.isArray(release.assets)
    ? release.assets.find(
        (asset) =>
          typeof asset?.name === 'string' &&
          asset.name.toLowerCase().endsWith('.apk') &&
          typeof asset.browser_download_url === 'string' &&
          asset.browser_download_url.length > 0
      )
    : undefined;

  const hasNewerTag = compareSemver(latestVersion, APP_VERSION) > 0;

  const result: AppUpdateInfo = {
    hasUpdate: hasNewerTag && Boolean(apkAsset?.browser_download_url),
    currentVersion: APP_VERSION,
    latestVersion,
    tagName,
    releaseName: (release.name || `MASDETA v${latestVersion}`).trim(),
    releaseNotes: (release.body || '').trim(),
    releaseUrl: (release.html_url || `https://github.com/${GITHUB_REPO}/releases`).trim(),
    apkDownloadUrl: apkAsset?.browser_download_url ?? null,
    apkFileName: apkAsset?.name ?? null,
    apkSizeBytes: typeof apkAsset?.size === 'number' ? apkAsset.size : null,
    publishedAt: release.published_at ?? null,
  };

  persistMandatoryUpdate(result);
  return result;
}

export function getCachedMandatoryUpdate(): AppUpdateInfo | null {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return null;
  try {
    const raw = window.localStorage.getItem(REQUIRED_UPDATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUpdateInfo;
    if (!parsed || !parsed.latestVersion || !parsed.apkDownloadUrl) {
      window.localStorage.removeItem(REQUIRED_UPDATE_CACHE_KEY);
      return null;
    }
    if (compareSemver(parsed.latestVersion, APP_VERSION) <= 0) {
      window.localStorage.removeItem(REQUIRED_UPDATE_CACHE_KEY);
      return null;
    }
    return {
      ...parsed,
      currentVersion: APP_VERSION,
      hasUpdate: true,
    };
  } catch {
    return null;
  }
}

export function persistMandatoryUpdate(info: AppUpdateInfo | null): void {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  try {
    if (info && info.hasUpdate && info.apkDownloadUrl) {
      window.localStorage.setItem(REQUIRED_UPDATE_CACHE_KEY, JSON.stringify(info));
    } else if (info && compareSemver(info.latestVersion, APP_VERSION) <= 0) {
      window.localStorage.removeItem(REQUIRED_UPDATE_CACHE_KEY);
    }
  } catch {
    // Abaikan jika penyimpanan lokal dibatasi
  }
}

export async function openCachedUpdateApk(): Promise<void> {
  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: UPDATE_APK_FILENAME,
  });

  await FileOpener.openFile({
    path: uri,
    mimeType: APK_MIME_TYPE,
  });
}

export function triggerManualBrowserDownload(url: string): void {
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (percent: number, downloadedBytes?: number, totalBytes?: number) => void
): Promise<{ downloadedPath: string | null; openedNativeInstaller: boolean }> {
  if (!apkUrl) {
    throw new Error('Tautan file APK tidak ditemukan pada rilis terbaru.');
  }

  if (!Capacitor.isNativePlatform()) {
    onProgress?.(100);
    triggerManualBrowserDownload(apkUrl);
    return { downloadedPath: null, openedNativeInstaller: false };
  }

  let progressListener: PluginListenerHandle | null = null;

  try {
    try {
      await Filesystem.deleteFile({
        directory: Directory.Cache,
        path: UPDATE_APK_FILENAME,
      });
    } catch {
      // Abaikan jika file cache lama belum ada
    }

    progressListener = await Filesystem.addListener('progress', (status) => {
      if (status.contentLength > 0) {
        const percent = Math.min(
          100,
          Math.max(0, Math.round((status.bytes / status.contentLength) * 100))
        );
        onProgress?.(percent, status.bytes, status.contentLength);
      }
    });

    const downloadResult = await Filesystem.downloadFile({
      url: apkUrl,
      path: UPDATE_APK_FILENAME,
      directory: Directory.Cache,
      progress: true,
    });

    onProgress?.(100);

    let targetPath = downloadResult.path;
    if (!targetPath) {
      const uriRes = await Filesystem.getUri({
        directory: Directory.Cache,
        path: UPDATE_APK_FILENAME,
      });
      targetPath = uriRes.uri;
    }

    if (!targetPath) {
      throw new Error('Lokasi file APK hasil unduhan tidak ditemukan.');
    }

    await FileOpener.openFile({
      path: targetPath,
      mimeType: APK_MIME_TYPE,
    });

    return { downloadedPath: targetPath, openedNativeInstaller: true };
  } finally {
    if (progressListener) {
      try {
        await progressListener.remove();
      } catch {
        // Abaikan kegagalan pembersihan listener
      }
    }
  }
}
