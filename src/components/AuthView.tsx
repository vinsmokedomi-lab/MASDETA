import { ChangeEvent, FormEvent, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import {
  deleteMediaFromDrive,
  replaceMediaInDrive,
  uploadMediaToDrive,
} from '../services/driveManager';
import { capitalizeWords, validateImageUploadFile } from '../utils/imageProcessor';

const REMEMBER_LOGIN_KEY = 'masdeta_remember_login_v1';

interface SavedLoginPrefs {
  remember: boolean;
  email: string;
}

function loadRememberedLogin(): SavedLoginPrefs {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (!raw) return { remember: true, email: '' };
    const parsed = JSON.parse(raw) as Partial<SavedLoginPrefs> & { password?: string };
    // Strip legacy plaintext password if previously stored
    if (parsed.password) {
      localStorage.setItem(
        REMEMBER_LOGIN_KEY,
        JSON.stringify({
          remember: parsed.remember !== false,
          email: typeof parsed.email === 'string' ? parsed.email : '',
        })
      );
    }
    return {
      remember: parsed.remember !== false,
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return { remember: true, email: '' };
  }
}

interface AuthViewProps {
  logo: React.ReactNode;
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onRegister: (payload: {
    nama: string;
    email: string;
    kontak: string;
    password: string;
    fotoDataUrl?: string;
    fotoThumbnailUrl?: string;
    fotoFileId?: string;
  }) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

export function AuthView({ logo, onLogin, onRegister }: AuthViewProps) {
  const initialSaved = loadRememberedLogin();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState(initialSaved.email);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(initialSaved.remember);
  const [showPassword, setShowPassword] = useState(false);

  // Registration fields (tanpa kolom jabatan — jabatan diberikan oleh SuperAdmin)
  const [regNama, setRegNama] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regKontak, setRegKontak] = useState('');
  const [regFotoDataUrl, setRegFotoDataUrl] = useState<string | undefined>(undefined);
  const [regFotoThumbUrl, setRegFotoThumbUrl] = useState<string | undefined>(undefined);
  const [regFotoFileId, setRegFotoFileId] = useState<string | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Internal Forgot Password state (guidance only)
  const [forgotEmail, setForgotEmail] = useState(initialSaved.email);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);
  const [registrationPopupMsg, setRegistrationPopupMsg] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    const result = await onLogin(email.trim(), password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || 'Gagal masuk. Periksa kembali kredensial Anda.');
      return;
    }

    try {
      if (rememberMe) {
        localStorage.setItem(
          REMEMBER_LOGIN_KEY,
          JSON.stringify({
            remember: true,
            email: email.trim(),
          })
        );
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }
    } catch {
      // Abaikan jika storage penuh
    }
  };

  const handleRegPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      validateImageUploadFile(file);
      const oldTarget = regFotoFileId || regFotoDataUrl;
      const driveRes =
        oldTarget && !oldTarget.startsWith('data:')
          ? await replaceMediaInDrive(file, oldTarget)
          : await uploadMediaToDrive(file);
      setRegFotoDataUrl(driveRes.directUrl);
      setRegFotoThumbUrl(driveRes.thumbnailUrl);
      setRegFotoFileId(driveRes.fileId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal mengunggah foto profil ke Google Drive.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveRegPhoto = async () => {
    const target = regFotoFileId || regFotoDataUrl;
    if (!target) return;
    setUploadingPhoto(true);
    try {
      await deleteMediaFromDrive(target);
      setRegFotoDataUrl(undefined);
      setRegFotoThumbUrl(undefined);
      setRegFotoFileId(undefined);
    } catch {
      setError('Gagal menghapus foto dari Google Drive.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!regNama.trim() || !regEmail.trim() || regPassword.length < 6) {
      setError('Nama lengkap, email, dan kata sandi (minimal 6 karakter) wajib diisi.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSubmitting(true);
    const result = await onRegister({
      nama: capitalizeWords(regNama.trim()),
      email: regEmail.trim().toLowerCase(),
      kontak: regKontak.trim(),
      password: regPassword,
      fotoDataUrl: regFotoDataUrl,
      fotoThumbnailUrl: regFotoThumbUrl,
      fotoFileId: regFotoFileId,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || 'Pendaftaran gagal diproses.');
      return;
    }

    setRegistrationPopupMsg(
      result.message ||
        'Registrasi akun Anda sudah berhasil dibuat dan saat ini menunggu persetujuan serta penetapan jabatan oleh SuperAdmin.'
    );
    setRegNama('');
    setRegEmail('');
    setRegKontak('');
    setRegFotoDataUrl(undefined);
    setRegFotoThumbUrl(undefined);
    setRegFotoFileId(undefined);
    setRegPassword('');
    setRegConfirm('');
  };

  const handleForgotLookupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setForgotNotice(null);

    if (!forgotEmail.trim()) {
      setError('Masukkan email akun Anda.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Gagal memproses permintaan.');
        setSubmitting(false);
        return;
      }
      setForgotNotice(
        data?.message ||
          'Hubungi SuperAdmin internal untuk mereset kata sandi akun Anda melalui Kontrol Super Admin.'
      );
    } catch {
      setError('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 px-5 py-7 sm:min-h-[calc(100vh-1.5rem)]">
      <div className="space-y-6">
        {/* Centered Elegant Brand Hero */}
        <div className="flex flex-col items-center pt-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200/80 bg-white shadow-sm [&>svg]:h-14 [&>svg]:w-14">
            {logo}
          </div>
          <h1 className="mt-3.5 text-2xl font-extrabold tracking-tight text-slate-900">
            MASDETA
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Sistem Manajemen Data &amp; Bantuan KPM
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-medium text-teal-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
              <div className="text-center">
                <h2 className="text-base font-bold text-slate-900">Masuk ke Aplikasi</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Masukkan email dan kata sandi akun Anda.
                </p>
              </div>

              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700">
                  Email
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@gmail.com"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                  Kata Sandi
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-12 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
                <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                  />
                  <span className="text-xs font-semibold text-slate-700">Ingat Saya</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setForgotEmail(email.trim());
                    setForgotNotice(null);
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="min-h-[36px] whitespace-nowrap text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  Lupa Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full whitespace-nowrap rounded-xl bg-teal-700 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? 'Memverifikasi...' : 'Masuk'}
              </button>

              <div className="mt-5 flex flex-col items-center gap-1.5 border-t border-slate-100 pt-4 text-center">
                <span className="text-xs text-slate-500">Belum punya akun?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-xl px-4 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
                >
                  Registrasi di sini
                </button>
              </div>
            </div>
          </form>
        ) : mode === 'forgot' ? (
          <div className="space-y-4">
            <form
              onSubmit={handleForgotLookupSubmit}
              className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs"
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Kembali ke Masuk"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Lupa Password</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Masukkan email terdaftar untuk melihat panduan reset kata sandi.
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700">
                  Email Akun
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="nama@gmail.com"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                <span>{submitting ? 'Memproses...' : 'Minta Reset Kata Sandi'}</span>
              </button>
            </form>

            {forgotNotice && (
              <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                <p className="text-xs font-bold text-teal-900">Prosedur Keamanan Akun</p>
                <p className="text-xs leading-relaxed text-teal-800">{forgotNotice}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="mt-1 min-h-[44px] w-full whitespace-nowrap rounded-xl border border-teal-300 bg-white text-xs font-bold text-teal-800 hover:bg-teal-100/50"
                >
                  Kembali ke Halaman Masuk
                </button>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleRegisterSubmit}
            className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs"
          >
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Kembali ke Masuk"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-base font-bold text-slate-900">Registrasi Akun Baru</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Silakan masukkan data diri Anda.
                </p>
              </div>
            </div>

            {/* Upload Foto Profil (Opsional) — Diperbesar & Bersih */}
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-50/90 px-4 py-4 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-400 shadow-xs">
                {regFotoDataUrl ? (
                  <DriveImage
                    src={regFotoDataUrl}
                    thumbnailUrl={regFotoThumbUrl}
                    alt="Foto Profil"
                    className="h-full w-full object-cover"
                  />
                ) : uploadingPhoto ? (
                  <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
                ) : (
                  <User className="h-10 w-10 text-slate-300" />
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">Foto Profil (Opsional)</p>
                <p className="text-[11px] text-slate-500">
                  {uploadingPhoto
                    ? 'Mengunggah ke Google Drive...'
                    : 'Format JPG / PNG untuk profil dan chat tim.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100">
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <span>{regFotoDataUrl ? 'Ganti Foto' : 'Pilih Foto'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPhoto}
                    onChange={handleRegPhotoChange}
                    className="sr-only"
                  />
                </label>
                {regFotoDataUrl && (
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => void handleRemoveRegPhoto()}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Nama Lengkap <span className="text-rose-600">*</span>
              </label>
              <div className="relative mt-1">
                <User className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoCapitalize="words"
                  value={regNama}
                  onChange={(e) => setRegNama(capitalizeWords(e.target.value))}
                  placeholder="Isi nama lengkap Anda"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Email <span className="text-rose-600">*</span>
              </label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="nama@gmail.com"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">No. HP / WhatsApp</label>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={regKontak}
                  onChange={(e) => setRegKontak(e.target.value)}
                  placeholder="08..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Kata Sandi <span className="text-rose-600">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Konfirmasi Kata Sandi <span className="text-rose-600">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Ulangi kata sandi"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || uploadingPhoto}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-teal-700 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              <span>{submitting ? 'Mengirim...' : 'Daftar Akun Baru'}</span>
            </button>

            <div className="mt-4 flex flex-col items-center gap-1 border-t border-slate-100 pt-3.5 text-center">
              <span className="text-xs text-slate-500">Sudah punya akun?</span>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="inline-flex min-h-[36px] items-center justify-center rounded-xl px-4 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
              >
                Masuk di sini
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="pt-6 text-center text-[11px] text-slate-400">
        MASDETA Operasional · Akses Terkendali SuperAdmin
      </p>

      {/* Pop-up Notifikasi Registrasi Berhasil */}
      {registrationPopupMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reg-success-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 id="reg-success-title" className="mt-4 text-lg font-bold text-slate-900">
              Registrasi Akun Berhasil
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {registrationPopupMsg}
            </p>
            <button
              type="button"
              onClick={() => {
                setRegistrationPopupMsg(null);
                setMode('login');
                setError(null);
              }}
              className="mt-5 min-h-[46px] w-full whitespace-nowrap rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
            >
              Mengerti &amp; Kembali Masuk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
