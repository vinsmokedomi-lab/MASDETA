import { ChangeEvent, FormEvent, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import { capitalizeWords, processImageUpload } from '../utils/imageProcessor';

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
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // Internal Forgot Password state (guidance only)
  const [forgotEmail, setForgotEmail] = useState(initialSaved.email);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

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
    try {
      const processed = await processImageUpload(file);
      setRegFotoDataUrl(processed.dataUrl);
    } catch {
      setError('Gagal memproses foto profil. Pastikan file berupa gambar yang valid.');
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
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || 'Pendaftaran gagal diproses.');
      return;
    }

    setSuccessMsg(
      result.message ||
        'Pendaftaran dikirim. Menunggu persetujuan & penetapan jabatan oleh SuperAdmin.'
    );
    setRegNama('');
    setRegEmail('');
    setRegKontak('');
    setRegFotoDataUrl(undefined);
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
          'Hubungi SuperAdmin internal untuk mereset kata sandi akun Anda melalui Manajemen User & Akses.'
      );
    } catch {
      setError('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-200/70 sm:py-3">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between bg-slate-50 px-5 py-8 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center gap-3 pt-2">
            {logo}
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">MASDETA</h1>
              <p className="text-xs text-slate-500">
                Sistem Manajemen Data &amp; Bantuan KPM
              </p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all ${
                mode === 'login' || mode === 'forgot'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk Akun
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Registrasi Baru
            </button>
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
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div>
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
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                      Kata Sandi
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
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                    >
                      Lupa Password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-11 pl-10 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                    />
                    <span className="text-xs font-semibold text-slate-700">Ingat Email</span>
                  </div>
                  <span className="text-[11px] text-slate-400">Simpan email masuk cepat</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[46px] w-full rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                >
                  {submitting ? 'Memverifikasi...' : 'Masuk'}
                </button>
              </div>
            </form>
          ) : mode === 'forgot' ? (
            <div className="space-y-4">
              <form
                onSubmit={handleForgotLookupSubmit}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Kembali ke Masuk"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Lupa Password</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Masukkan email terdaftar untuk melihat atau mengganti kata sandi internal.
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
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{submitting ? 'Memproses...' : 'Minta Reset Kata Sandi'}</span>
                </button>
              </form>

              {forgotNotice && (
                <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-2">
                  <p className="text-xs font-bold text-teal-900">Prosedur Keamanan Akun</p>
                  <p className="text-xs leading-relaxed text-teal-800">{forgotNotice}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="mt-1 min-h-[38px] w-full rounded-xl border border-teal-300 bg-white text-xs font-bold text-teal-800 hover:bg-teal-100/50"
                  >
                    Kembali ke Halaman Masuk
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleRegisterSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3.5"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Registrasi Akun Baru</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Jabatan (SuperAdmin, Admin, atau Viewer) akan ditetapkan oleh SuperAdmin saat persetujuan.
                </p>
              </div>

              {/* Upload Foto Profil (Opsional) */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-400">
                  {regFotoDataUrl ? (
                    <img
                      src={regFotoDataUrl}
                      alt="Foto Profil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800">Foto Profil (Opsional)</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    JPG / PNG untuk profil dan chat tim.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100">
                      <Camera className="h-3.5 w-3.5" />
                      <span>{regFotoDataUrl ? 'Ganti Foto' : 'Pilih Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleRegPhotoChange}
                        className="sr-only"
                      />
                    </label>
                    {regFotoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setRegFotoDataUrl(undefined)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
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
                disabled={submitting}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                <span>{submitting ? 'Mengirim...' : 'Daftar Akun Baru'}</span>
              </button>
            </form>
          )}
        </div>

        <p className="pt-6 text-center text-[11px] text-slate-400">
          MASDETA Operasional · Akses Terkendali SuperAdmin
        </p>
      </div>
    </div>
  );
}
