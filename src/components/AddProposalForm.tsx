import { FormEvent, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Lock, Save, Unlock, X } from 'lucide-react';
import {
  KAB_KOTA_OPTIONS,
  KECAMATAN_OPTIONS,
  KELURAHAN_BY_KECAMATAN,
  PROPOSAL_TIPE_OPTIONS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  ProposalFormValues,
  ProposalLockStatus,
  ProposalRecord,
  ProposalTipe,
} from '../types/kpm';
import { buildCombinedProposalName, capitalizeWords } from '../utils/imageProcessor';
import { PlaceholderSelect } from './FormControls';

interface AddProposalFormProps {
  existingProposals: ProposalRecord[];
  onBack: () => void;
  onSaveNewProposal: (values: ProposalFormValues) => void;
}

type AddProposalErrors = Partial<
  Record<'tahun' | 'tipe' | 'kabKota' | 'kecamatan' | 'duplicate', string>
>;

export function AddProposalForm({
  existingProposals,
  onBack,
  onSaveNewProposal,
}: AddProposalFormProps) {
  const [tahun, setTahun] = useState('2026');
  const [tipe, setTipe] = useState<ProposalTipe | ''>('');
  const [kabKota, setKabKota] = useState('Pontianak');
  const [kecamatan, setKecamatan] = useState('');
  const [kelurahan, setKelurahan] = useState('');
  const [jalan, setJalan] = useState('');
  const [status, setStatus] = useState<ProposalLockStatus>('unlocked');
  const [errors, setErrors] = useState<AddProposalErrors>({});

  const kelurahanList = useMemo(() => {
    if (!kecamatan) return [];
    const list = KELURAHAN_BY_KECAMATAN[kecamatan] || [];
    return list.map((item) => item.replace(/^Kelurahan\s+/i, '').trim());
  }, [kecamatan]);

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

  const handleKecamatanChange = (nextKec: string) => {
    setKecamatan(nextKec);
    setKelurahan('');
    setErrors((prev) => ({ ...prev, kecamatan: undefined, duplicate: undefined }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: AddProposalErrors = {};
    if (!tahun) nextErrors.tahun = 'Tahun anggaran wajib dipilih.';
    if (!tipe) nextErrors.tipe = 'Tipe proposal wajib dipilih.';
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
      status,
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
      {/* Native Mobile Sub-Screen Header (Back + Title Only) */}
      <div className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md">
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
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 px-4 pt-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">
            Data Proposal Baru
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Lengkapi Tahun, Tipe, Kab / Kota, dan Kecamatan. Kelurahan dan Jalan bersifat opsional untuk membentuk judul proposal otomatis.
          </p>

          <div className="mt-4 space-y-4">
            {/* Tahun * */}
            <div>
              <label htmlFor="add-prop-tahun" className="block text-xs font-semibold text-slate-700">
                Tahun <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder="Pilih Tahun"
                id="add-prop-tahun"
                value={tahun}
                onChange={(v) => {
                  setTahun(v);
                  setErrors((prev) => ({ ...prev, tahun: undefined, duplicate: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                  errors.tahun ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {TAHUN_OPTIONS.map((yr) => (
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
                value={tipe}
                onChange={(v) => {
                  setTipe(v as ProposalTipe | '');
                  setErrors((prev) => ({ ...prev, tipe: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
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

            {/* Kab / Kota * */}
            <div>
              <label htmlFor="add-prop-kabkota" className="block text-xs font-semibold text-slate-700">
                Kab / Kota <span className="text-rose-600">*</span>
              </label>
              <PlaceholderSelect
                placeholder="Pilih Kab / Kota"
                id="add-prop-kabkota"
                value={kabKota}
                onChange={(v) => {
                  setKabKota(v);
                  setErrors((prev) => ({ ...prev, kabKota: undefined }));
                }}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                  errors.kabKota ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {KAB_KOTA_OPTIONS.map((item) => (
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
                placeholder="Pilih Kecamatan"
                id="add-prop-kecamatan"
                value={kecamatan}
                onChange={(v) => handleKecamatanChange(v)}
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                  errors.kecamatan ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                {KECAMATAN_OPTIONS.map((kec) => (
                  <option key={kec} value={kec}>
                    {kec}
                  </option>
                ))}
              </PlaceholderSelect>
              {errors.kecamatan && (
                <p className="mt-1 text-xs text-rose-600">{errors.kecamatan}</p>
              )}
            </div>

            {/* Kelurahan (Opsional) */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="add-prop-kelurahan" className="block text-xs font-semibold text-slate-700">
                  Kelurahan
                </label>
                <span className="text-[11px] text-slate-400">Opsional</span>
              </div>
              <PlaceholderSelect
                placeholder={kecamatan ? 'Pilih Kelurahan (Opsional)' : 'Pilih Kecamatan terlebih dahulu'}
                clearLabel="Tanpa kelurahan"
                id="add-prop-kelurahan"
                disabled={!kecamatan}
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
                placeholder="Contoh: Tanjung Raya 2"
                value={jalan}
                onChange={(e) => {
                  setJalan(capitalizeWords(e.target.value));
                  setErrors((prev) => ({ ...prev, duplicate: undefined }));
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            {/* Proposal Combined Name Display (Read-Only) */}
            <div>
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

            {/* Status Proposal */}
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                Status Proposal
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStatus('unlocked')}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors ${
                    status === 'unlocked'
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Unlock className="h-4 w-4 shrink-0" />
                  <span>Terbuka</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus('locked')}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors ${
                    status === 'locked'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Terkunci</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
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
              disabled={isDuplicateProposal}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap"
            >
              <Save className="h-4 w-4" />
              <span>Simpan</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
