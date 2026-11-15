import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Camera,
  CheckCircle2,
  Loader2,
  LogOut,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import {
  deleteMediaFromDrive,
  replaceMediaInDrive,
  uploadMediaToDrive,
} from '../services/driveManager';
import { InternalUser, UserPresenceStatus } from '../types/kpm';
import { capitalizeWords, validateImageUploadFile } from '../utils/imageProcessor';
import { PresenceDot, getPresenceMeta } from './PresenceDot';

interface UserProfileViewProps {
  user: InternalUser;
  pushEnabled: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  onRequestPushPermission: () => Promise<void>;
  onTogglePushEnabled: (enabled: boolean) => void;
  onUpdateProfile: (patch: {
    nama: string;
    jabatan: string;
    kontak: string;
    fotoDataUrl?: string | null;
    fotoThumbnailUrl?: string | null;
    fotoFileId?: string | null;
    newPassword?: string;
    presenceManual: boolean;
    presenceStatus: UserPresenceStatus;
  }) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => void;
  onBack: () => void;
}

export function UserProfileView({
  user,
  pushEnabled,
  pushPermission,
  onRequestPushPermission,
  onTogglePushEnabled,
  onUpdateProfile,
  onLogout,
  onBack,
}: UserProfileViewProps) {
  const [nama, setNama] = useState(user.nama);
  const [kontak, setKontak] = useState(user.kontak || '');
  const [fotoDataUrl, setFotoDataUrl] = useState<string | undefined>(user.fotoDataUrl);
  const [fotoThumbnailUrl, setFotoThumbnailUrl] = useState<string | undefined>(
    user.fotoThumbnailUrl
  );
  const [fotoFileId, setFotoFileId] = useState<string | undefined>(user.fotoFileId);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    setFotoDataUrl(user.fotoDataUrl);
    setFotoThumbnailUrl(user.fotoThumbnailUrl);
    setFotoFileId(user.fotoFileId);
  }, [user.fotoDataUrl, user.fotoThumbnailUrl, user.fotoFileId]);

  useEffect(() => {
    setNama(user.nama);
    setKontak(user.kontak || '');
  }, [user.id, user.nama, user.kontak]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFeedback(null);
    setConfirmDeleteFoto(false);
    setUploadingPhoto(true);
    try {
      validateImageUploadFile(file);
      const oldTarget = fotoFileId || fotoDataUrl;
      const driveRes =
        oldTarget && !oldTarget.startsWith('data:')
          ? await replaceMediaInDrive(file, oldTarget)
          : await uploadMediaToDrive(file);

      setFotoDataUrl(driveRes.directUrl);
      setFotoThumbnailUrl(driveRes.thumbnailUrl);
      setFotoFileId(driveRes.fileId);

      const res = await onUpdateProfile({
        nama: capitalizeWords((nama.trim() || user.nama).trim()),
        jabatan: user.jabatan,
        kontak: kontak.trim(),
        fotoDataUrl: driveRes.directUrl,
        fotoThumbnailUrl: driveRes.thumbnailUrl,
        fotoFileId: driveRes.fileId,
        presenceManual: false,
        presenceStatus: user.presenceStatus || 'online',
      });
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Foto profil berhasil disimpan ke Google Drive.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Gagal menyimpan foto profil.' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengunggah foto profil ke Google Drive.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async () => {
    const target = fotoFileId || fotoDataUrl;
    if (!target) return;
    setFeedback(null);
    setUploadingPhoto(true);
    try {
      await deleteMediaFromDrive(target);
      setFotoDataUrl(undefined);
      setFotoThumbnailUrl(undefined);
      setFotoFileId(undefined);
      setConfirmDeleteFoto(false);
      const res = await onUpdateProfile({
        nama: capitalizeWords((nama.trim() || user.nama).trim()),
        jabatan: user.jabatan,
        kontak: kontak.trim(),
        fotoDataUrl: null,
        fotoThumbnailUrl: null,
        fotoFileId: null,
        presenceManual: false,
        presenceStatus: user.presenceStatus || 'online',
      });
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Foto profil dihapus dari Drive & database.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Gagal menghapus foto profil.' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menghapus foto dari Google Drive.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!nama.trim()) {
      setFeedback({ type: 'error', message: 'Nama lengkap tidak boleh kosong.' });
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setFeedback({ type: 'error', message: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }

    setSaving(true);
    const res = await onUpdateProfile({
      nama: capitalizeWords(nama.trim()),
      jabatan: user.jabatan,
      kontak: kontak.trim(),
      fotoDataUrl: fotoDataUrl ?? null,
      fotoThumbnailUrl: fotoThumbnailUrl ?? null,
      fotoFileId: fotoFileId ?? null,
      newPassword: newPassword.trim() || undefined,
      presenceManual: false,
      presenceStatus: user.presenceStatus || 'online',
    });
    setSaving(false);

    if (res.ok) {
      setNewPassword('');
      setFeedback({ type: 'success', message: 'Profil akun berhasil disimpan.' });
    } else {
      setFeedback({ type: 'error', message: res.error || 'Gagal menyimpan profil.' });
    }
  };

  const presenceMeta = getPresenceMeta(user.presenceStatus);

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">Atur Profil User</h1>
      </header>

      <div className="space-y-4 px-4 pt-4">
        {/* Centered Profile Hero Summary */}
        <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
          <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-visible">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-200 bg-slate-100 text-slate-500 shadow-xs">
              {fotoDataUrl ? (
                <DriveImage
                  src={fotoDataUrl}
                  thumbnailUrl={fotoThumbnailUrl}
                  alt={nama}
                  className={`h-full w-full object-cover transition-opacity ${
                    uploadingPhoto ? 'opacity-50' : 'opacity-100'
                  }`}
                />
              ) : (
                <User className="h-10 w-10" />
              )}
            </div>
            <span className="absolute -right-1.5 -bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-teal-700 text-white shadow-sm">
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </span>
            <PresenceDot
              status={user.presenceStatus || 'online'}
              size="lg"
              className="absolute -bottom-1 -left-1"
            />
            <input
              type="file"
              accept="image/*"
              disabled={uploadingPhoto}
              className="hidden"
              onChange={handlePhotoChange}
            />
          </label>

          {fotoDataUrl && !confirmDeleteFoto && (
            <button
              type="button"
              disabled={uploadingPhoto}
              onClick={() => setConfirmDeleteFoto(true)}
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              <span>Hapus Foto</span>
            </button>
          )}

          {confirmDeleteFoto && (
            <div className="mt-3 w-full max-w-xs rounded-xl border border-rose-200 bg-rose-50 p-2.5">
              <p className="text-[11px] font-semibold text-rose-900">
                Hapus foto profil dari Google Drive?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => setConfirmDeleteFoto(false)}
                  className="min-h-[32px] flex-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => void handleDeletePhoto()}
                  className="min-h-[32px] flex-1 rounded-lg bg-rose-600 text-[11px] font-semibold text-white"
                >
                  {uploadingPhoto ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          )}

          <p className="mt-3.5 text-lg font-bold text-slate-900">{user.nama}</p>

          <span
            className={`mt-1.5 inline-block shrink-0 rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
              user.role === 'SuperAdmin'
                ? 'bg-slate-900 text-white'
                : user.role === 'Admin'
                  ? 'bg-teal-50 text-teal-800'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {user.role}
          </span>

          <p className="mt-1.5 text-xs text-slate-500">{user.email}</p>

          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1">
            <span className={`h-2 w-2 rounded-full ${presenceMeta.dotClass}`} />
            <span className={`text-xs font-semibold ${presenceMeta.textClass}`}>
              {presenceMeta.label}
            </span>
          </div>
        </section>

        {/* Push Notification Settings */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                {pushEnabled ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">Push Notification Chat</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-500">
                  {pushPermission === 'granted'
                    ? 'Izin notifikasi perangkat aktif'
                    : pushPermission === 'denied'
                      ? 'Diblokir browser (aktif via notis in-app)'
                      : pushPermission === 'unsupported'
                        ? 'Notifikasi aktif di dalam aplikasi'
                        : 'Ketuk Aktifkan untuk menerima push notifikasi chat'}
                </p>
              </div>
            </div>

            {pushPermission === 'default' ? (
              <button
                type="button"
                onClick={onRequestPushPermission}
                className="min-h-[36px] shrink-0 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Aktifkan
              </button>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                onClick={() => onTogglePushEnabled(!pushEnabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  pushEnabled ? 'bg-teal-700' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                    pushEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}
          </div>
        </section>

        {/* Permissions Summary (Read-only for Admin & Viewer; hidden for SuperAdmin) */}
        {user.role !== 'SuperAdmin' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Shield className="h-4 w-4 text-teal-700" />
                <span>Hak Akses Akun ({user.role})</span>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Hanya Baca
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              {[
                { label: 'ADD', allowed: Boolean(user.permissions?.add) },
                { label: 'UPDATE', allowed: Boolean(user.permissions?.update) },
                { label: 'DELETE', allowed: Boolean(user.permissions?.delete) },
              ].map((perm) => (
                <div
                  key={perm.label}
                  className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 ${
                    perm.allowed
                      ? 'border-teal-200 bg-teal-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold tracking-wider ${
                      perm.allowed ? 'text-teal-900' : 'text-slate-500'
                    }`}
                  >
                    {perm.label}
                  </span>
                  <span
                    className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      perm.allowed
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {perm.allowed ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              Izin akses ditetapkan oleh SuperAdmin dan tidak dapat diubah langsung dari akun ini.
            </p>
          </section>
        )}

        {/* Edit Profile Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3.5"
        >
          <h2 className="text-sm font-bold text-slate-900">Biodata &amp; Keamanan</h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nama Lengkap</label>
            <input
              type="text"
              autoCapitalize="words"
              value={nama}
              onChange={(e) => setNama(capitalizeWords(e.target.value))}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">No. HP / WhatsApp</label>
            <input
              type="tel"
              value={kontak}
              onChange={(e) => setKontak(e.target.value)}
              placeholder="08..."
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Kata Sandi Baru (Opsional)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kosongkan jika tidak ingin mengubah"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[46px] w-full rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar dari Akun</span>
        </button>
      </div>

      {feedback && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[416px] -translate-x-1/2 animate-[toastSlideUp_0.22s_ease-out]">
          <div
            role="status"
            className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-3 text-xs shadow-xl ${
              feedback.type === 'success'
                ? 'border-teal-300 bg-teal-50 text-teal-950'
                : 'border-rose-300 bg-rose-50 text-rose-950'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <CheckCircle2
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  feedback.type === 'success' ? 'text-teal-700' : 'text-rose-600'
                }`}
              />
              <span className="font-medium leading-snug">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Tutup notifikasi"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
