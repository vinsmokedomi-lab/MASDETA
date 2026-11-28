import { FormEvent, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Save, X } from 'lucide-react';
import {
  INITIAL_WILAYAH_LIST,
  PROPOSAL_TIPE_OPTIONS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  ProposalFormValues,
  ProposalRecord,
  ProposalTipe,
  WilayahKabKota,
} from '../types/kpm';
import {
  blockNonNumericKeyDown,
  buildCombinedProposalName,
  capitalizeWords,
  sanitizeDigits,
} from '../utils/imageProcessor';
import { PlaceholderSelect } from './FormControls';
import { useIsDesktopWeb } from '../utils/platform';
import { useOfflineStatus } from '../contexts/OfflineContext';

interface AddProposalFormProps {
  existingProposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  yearOptions?: string[];
  initialTahun?: string;
  onBack: () => void;
  onSaveNewProposal: (values: ProposalFormValues) => void;
}

type AddProposalErrors = Partial<
  Record<'tahun' | 'tipe' | 'jumlahKpm' | 'kabKota' | 'kecamatan' | 'duplicate', string>
>;

export function AddProposalForm({
  existingProposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  yearOptions,
  initialTahun,
  onBack,
  onSaveNewProposal,
}: AddProposalFormProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;
  const { isOffline } = useOfflineStatus();
  const resolvedYearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    (yearOptions || []).forEach((y) => {
      if (y) set.add(y);
    });
    existingProposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    if (initialTahun) set.add(initialTahun);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [yearOptions, existingProposals, initialTahun]);

  const [tahun, setTahun] = useState(initialTahun || '2026');
  const [tipe, setTipe] = useState<ProposalTipe | ''>('');
  const [kabKota, setKabKota] = useState(() => wilayahList[0]?.nama || 'Kota Pontianak');
  const [kecamatan, setKecamatan] = useState('');
  const [kelurahan, setKelurahan] = useState('');
  const [jalan, setJalan] = useState('');
  const [jumlahKpm, setJumlahKpm] = useState('66');
  const [errors, setErrors] = useState<AddProposalErrors>({});

  const kabKotaOptions = useMemo(() => wilayahList.map((w) => w.nama), [wilayahList]);

  const kecamatanOptions = useMemo(() => {
    const matchedKab = wilayahList.find((w) => w.nama === kabKota);
    return matchedKab ? matchedKab.kecamatanList.map((k) => k.nama) : [];
  }, [wilayahList, kabKota]);

  const kelurahanList = useMemo(() => {
    if (!kecamatan) return [];
    const matchedKab = wilayahList.find((w) => w.nama === kabKota);
    const matchedKec = matchedKab?.kecamatanList.find((k) => k.nama === kecamatan);
    return matchedKec ? matchedKec.kelurahanList : [];
  }, [wilayahList, kabKota, kecamatan]);

  const combinedProposalName = useMemo(
    () =>
      buildCombinedProposalName({
        kecamatan,
        kelurahan,
        jalan,
      }),
    [kecamatan, kelurahan, jalan]
  );

  const isDuplicateProposal = useMemo(() => {
    if (!tahun || !combinedProposalName) return false;
    const targetLower = combinedProposalName.trim().toLowerCase();
    return existingProposals.some(
      (p) => p.tahun === tahun && p.namaProposal.trim().toLowerCase() === targetLower
    );
  }, [existingProposals, tahun, combinedProposalName]);

  const handleKabKotaChange = (nextKab: string) => {
    setKabKota(nextKab);
    setKecamatan('');
    setKelurahan('');
    setErrors((prev) => ({ ...prev, kabKota: undefined, kecamatan: undefined, duplicate: undefined }));
  };

  const handleKecamatanChange = (nextKec: string) => {
    setKecamatan(nextKec);
    setKelurahan('');
    setErrors((prev) => ({ ...prev, kecamatan: undefined, duplicate: undefined }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isOffline) return;
    const nextErrors: AddProposalErrors = {};
    if (!tahun) nextErrors.tahun = 'Tahun anggaran wajib dipilih.';
    if (!tipe) nextErrors.tipe = 'Tipe proposal wajib dipilih.';
    const parsedJumlah = Number(jumlahKpm);
    if (!jumlahKpm || !Number.isFinite(parsedJumlah) || parsedJumlah < 1) {
      nextErrors.jumlahKpm = 'Jumlah KPM wajib diisi (minimal 1).';
    }
    if (!kabKota) nextErrors.kabKota = 'Kab / Kota wajib dipilih.';
    if (!kecamatan) nextErrors.kecamatan = 'Kecamatan wajib dipilih.';
    if (isDuplicateProposal) {
      nextErrors.duplicate = 'Proposal pada tahun ini sudah terdaftar';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSaveNewProposal({
      tahun,
      tipe: tipe as ProposalTipe,
      kabKota,
      kecamatan,
      kelurahan,
      jalan: jalan.trim(),
      namaProposal: combinedProposalName,
      jumlahKpm: parsedJumlah,
      status: 'unlocked',
      checklist: {
        docx: false,
        dinas: false,
        rab: false,
        rt: false,
        rw: false,
        lurah: false,
        camat: false,
      },
      catatan: '',
      documents: {},
    });
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Native Mobile Sub-Screen Header (Native APK only) */}
      {isNativeApp && (
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
          aria-label="Kembali ke formulir KPM"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-slate-900">
          Tambah Proposal Baru
        </h1>
      </header>
      )}

      {!isNativeApp && (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5 md:px-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali</span>
            </button>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
              Tambah Proposal Baru
            </h1>
          </div>
        </header>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'md:mx-auto md:max-w-3xl md:px-6 md:pt-5' : ''
        }`}
      >

        {isOffline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Mode Read-Only (Offline)</p>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Penambahan proposal baru dinonaktifkan saat koneksi internet terputus.
              </p>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="text-sm font-bold text-slate-900">
            Data Proposal Baru
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Lengkapi Tahun, Tipe, Kab / Kota, dan Kecamatan. Kelurahan dan Jalan bersifat opsional untuk membentuk judul proposal otomatis.
          </p>

          <div
            className={`mt-4 space-y-4 ${
              !isNativeApp ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' : ''
            }`}
          >
            {/* Tahun * */}
            <div>
              <label htmlFor="add-prop-tahun" className="block text-xs font-semibold text-slate-700">
                Tahun <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder="Pilih Tahun"
                id="add-prop-tahun"
                disabled={isOffline}
                value={tahun}
                onChange={(v) => {
                  setTahun(v);
                  setErrors((prev) => ({ ...prev, tahun: undefined, duplicate: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                  errors.tahun ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {resolvedYearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </PlaceholderSelect>
              {errors.tahun && <p className="mt-1 text-xs text-rose-600">{errors.tahun}</p>}
            </div>

            {/* Tipe * */}
            <div>
              <label htmlFor="add-prop-tipe" className="block text-xs font-semibold text-slate-700">
                Tipe <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder="Pilih Tipe"
                id="add-prop-tipe"
                disabled={isOffline}
                value={tipe}
                onChange={(v) => {
                  setTipe(v as ProposalTipe | '');
                  setErrors((prev) => ({ ...prev, tipe: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                  errors.tipe ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {PROPOSAL_TIPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </PlaceholderSelect>
              {errors.tipe && <p className="mt-1 text-xs text-rose-600">{errors.tipe}</p>}
            </div>

            {/* Jumlah KPM * */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="add-prop-jumlah-kpm" className="block text-xs font-semibold text-slate-700">
                  Jumlah KPM <span className="text-rose-600">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Default 66</span>
              </div>
              <input
                id="add-prop-jumlah-kpm"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                disabled={isOffline}
                placeholder="66"
                value={jumlahKpm}
                onKeyDown={blockNonNumericKeyDown}
                onChange={(e) => {
                  setJumlahKpm(sanitizeDigits(e.target.value, 5));
                  setErrors((prev) => ({ ...prev, jumlahKpm: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                  errors.jumlahKpm ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {errors.jumlahKpm && (
                <p className="mt-1 text-xs text-rose-600">{errors.jumlahKpm}</p>
              )}
            </div>

            {/* Kab / Kota * */}
            <div>
              <label htmlFor="add-prop-kabkota" className="block text-xs font-semibold text-slate-700">
                Kabupaten / Kota <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder="Pilih Kabupaten / Kota"
                id="add-prop-kabkota"
                disabled={isOffline}
                value={kabKota}
                onChange={(v) => handleKabKotaChange(v)}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                  errors.kabKota ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {kabKotaOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </PlaceholderSelect>
              {errors.kabKota && <p className="mt-1 text-xs text-rose-600">{errors.kabKota}</p>}
            </div>

            {/* Kecamatan * */}
            <div>
              <label htmlFor="add-prop-kecamatan" className="block text-xs font-semibold text-slate-700">
                Kecamatan <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder={kabKota ? 'Pilih Kecamatan' : 'Pilih Kabupaten / Kota terlebih dahulu'}
                id="add-prop-kecamatan"
                disabled={!kabKota || isOffline}
                value={kecamatan}
                onChange={(v) => handleKecamatanChange(v)}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                  errors.kecamatan ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {kecamatanOptions.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </PlaceholderSelect>
              {errors.kecamatan && (
                <p className="mt-1 text-xs text-rose-600">{errors.kecamatan}</p>
              )}
            </div>

            {/* Kelurahan / Desa (Opsional) */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="add-prop-kelurahan" className="block text-xs font-semibold text-slate-700">
                  Kelurahan / Desa
                </label>
                <span className="text-[11px] text-slate-400">Opsional</span>
              </div>
              <PlaceholderSelect
                placeholder={kecamatan ? 'Pilih Kelurahan / Desa (Opsional)' : 'Pilih Kecamatan terlebih dahulu'}
                clearLabel="Tanpa kelurahan / desa"
                id="add-prop-kelurahan"
                disabled={!kecamatan || isOffline}
                value={kelurahan}
                onChange={(v) => {
                  setKelurahan(v);
                  setErrors((prev) => ({ ...prev, duplicate: undefined }));
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {kelurahanList.map((kel) => (
                  <option key={kel} value={kel}>
                    {kel}
                  </option>
                ))}
              </PlaceholderSelect>
            </div>

            {/* Jalan (Opsional) */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="add-prop-jalan" className="block text-xs font-semibold text-slate-700">
                  Jalan
                </label>
                <span className="text-[11px] text-slate-400">Opsional</span>
              </div>
              <input
                id="add-prop-jalan"
                type="text"
                autoCapitalize="words"
                disabled={isOffline}
                placeholder="Contoh: Tanjung Raya 2"
                value={jalan}
                onChange={(e) => {
                  setJalan(capitalizeWords(e.target.value));
                  setErrors((prev) => ({ ...prev, duplicate: undefined }));
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {/* Proposal Combined Name Display (Read-Only) */}
            <div className={!isNativeApp ? 'md:col-span-2' : ''}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="add-prop-display" className="block text-xs font-semibold text-slate-700">
                  Proposal
                </label>
                <span className="text-[11px] text-slate-400">Otomatis · Read-only</span>
              </div>
              <input
                id="add-prop-display"
                type="text"
                readOnly
                value={combinedProposalName}
                placeholder="Kombinasi otomatis dari Kecamatan / Kelurahan / Jalan"
                className={`mt-1.5 min-h-[44px] w-full cursor-default rounded-xl border bg-slate-100 px-3.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none ${
                  isDuplicateProposal || errors.duplicate ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {(isDuplicateProposal || errors.duplicate) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Proposal pada tahun ini sudah terdaftar</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Sticky Bottom Action Bar */}
        <div
          className={`fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md ${
            !isNativeApp ? 'md:left-64 md:right-0 md:w-auto md:max-w-none md:translate-x-0 md:px-6' : ''
          }`}
        >
          <div
            className={`flex items-center gap-2.5 ${
              !isNativeApp ? 'md:mx-auto md:max-w-3xl md:justify-end' : ''
            }`}
          >
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <X className="h-4 w-4" />
              <span>Batal</span>
            </button>

            <button
              type="submit"
              disabled={isDuplicateProposal || isOffline}
              className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap ${
                !isNativeApp ? 'md:flex-none md:min-w-[180px]' : ''
              }`}
            >
              <Save className="h-4 w-4" />
              <span>{isOffline ? 'Mode Read-Only' : 'Simpan'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
