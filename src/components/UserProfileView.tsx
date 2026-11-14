import { ChangeEvent, FormEvent, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Camera,
  CheckCircle2,
  LogOut,
  Shield,
  User,
} from 'lucide-react';
import { InternalUser, UserPresenceStatus } from '../types/kpm';
import { capitalizeWords, processImageUpload } from '../utils/imageProcessor';
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
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await processImageUpload(file);
      setFotoDataUrl(compressed.dataUrl);
    } catch {
      setFeedback({ type: 'error', message: 'Gagal memproses foto profil.' });
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
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold ${
              feedback.type === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Centered Profile Hero Summary */}
        <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
          <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-visible">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-200 bg-slate-100 text-slate-500 shadow-xs">
              {fotoDataUrl ? (
                <img src={fotoDataUrl} alt={nama} className="h-full w-full object-cover" />
              ) : (
                <User className="h-10 w-10" />
              )}
            </div>
            <span className="absolute -right-1.5 -bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-teal-700 text-white shadow-sm">
              <Camera className="h-4 w-4" />
            </span>
            <PresenceDot
              status={user.presenceStatus || 'online'}
              size="lg"
              className="absolute -top-1 -right-1"
            />
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </label>

          <div className="mt-3.5 flex items-center justify-center gap-2">
            <p className="text-lg font-bold text-slate-900">{user.nama}</p>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                user.role === 'SuperAdmin'
                  ? 'bg-slate-900 text-white'
                  : user.role === 'Admin'
                    ? 'bg-teal-50 text-teal-800'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {user.role}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-slate-500">{user.email}</p>

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
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                {pushEnabled ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Push Notification Chat</p>
                <p className="truncate text-xs text-slate-500">
                  {pushPermission === 'granted'
                    ? 'Izin notifikasi perangkat aktif'
                    : pushPermission === 'denied'
                      ? 'Diblokir browser (aktif via notis in-app)'
                      : pushPermission === 'unsupported'
                        ? 'Notifikasi aktif di dalam aplikasi'
                        : 'Ketuk Aktifkan untuk push notis chat'}
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

        {/* Permissions Summary */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Shield className="h-4 w-4 text-teal-700" />
            <span>Hak Akses Akun ({user.role})</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center">
            {[
              { label: 'ADD', allowed: user.role === 'SuperAdmin' || user.permissions?.add },
              { label: 'UPDATE', allowed: user.role === 'SuperAdmin' || user.permissions?.update },
              { label: 'DELETE', allowed: user.role === 'SuperAdmin' || user.permissions?.delete },
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
                  className={`text-[11px] font-bold tracking-wider ${
                    perm.allowed ? 'text-teal-900' : 'text-slate-500'
                  }`}
                >
                  {perm.label}
                </span>
                <span
                  className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
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
        </section>

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
    </div>
  );
}
