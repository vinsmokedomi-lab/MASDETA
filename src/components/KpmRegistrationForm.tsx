import { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Lock,
  Plus,
  RotateCcw,
  Save,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ALL_KELURAHAN_OPTIONS,
  DTSEN_OPTION_ITEMS,
  INITIAL_FORM_VALUES,
  INITIAL_WILAYAH_LIST,
  ITEM_BANTUAN_OPTIONS,
  PEKERJAAN_OPTIONS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  SingleDocumentKey,
  ValidationStatus,
  WilayahKabKota,
} from '../types/kpm';
import {
  blockNonNumericKeyDown,
  formatAlamatLengkap,
  getItemsForYear,
  getKelurahanOptionsForProposal,
  getValidationForDtsen,
  isKecamatanProposal,
  isValidNik16,
  isValidRtRw,
  resolvePackageForKpm,
  resolveProposalDomicile,
  sanitizeDigits,
} from '../utils/imageProcessor';
import { DocumentUploadCard } from './DocumentUploadCard';
import { MultiDocumentUploadCard } from './MultiDocumentUploadCard';
import { PengelolaSelectorModal } from './PengelolaSelectorModal';
import { PlaceholderSelect } from './FormControls';

interface KpmRegistrationFormProps {
  editingRecord: KpmRecord | null;
  pengelolaList: PengelolaProfile[];
  proposals: ProposalRecord[];
  wilayahList?: WilayahKabKota[];
  itemOptions?: ItemBantuan[];
  pekerjaanOptions?: string[];
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  preselectedProposal?: { namaProposal: string; tahun: string } | null;
  lockedProposalScope?: { namaProposal: string; tahun: string } | null;
  onClearPreselectedProposal?: () => void;
  onBack?: () => void;
  onOpenAddProposal: () => void;
  onCreatePengelola: (profile: PengelolaProfile) => void;
  onSave: (values: KpmFormValues, editingId?: string) => void;
  onCancelEdit: () => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
}

type FormErrors = Partial<Record<keyof KpmFormValues | 'docKtp' | 'docKk', string>>;

export function KpmRegistrationForm({
  editingRecord,
  pengelolaList,
  proposals,
  wilayahList = INITIAL_WILAYAH_LIST,
  itemOptions,
  pekerjaanOptions,
  feedback,
  onDismissFeedback,
  preselectedProposal,
  lockedProposalScope,
  onClearPreselectedProposal,
  onBack,
  onOpenAddProposal,
  onCreatePengelola,
  onSave,
  onCancelEdit,
  onPreviewDocument,
}: KpmRegistrationFormProps) {
  const isProposalScopeLocked = Boolean(lockedProposalScope && !editingRecord);

  const [values, setValues] = useState<KpmFormValues>(() => {
    if (lockedProposalScope && !editingRecord) {
      return {
        ...INITIAL_FORM_VALUES,
        tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
        proposal: lockedProposalScope.namaProposal,
      };
    }
    return INITIAL_FORM_VALUES;
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPengelolaModalOpen, setIsPengelolaModalOpen] = useState(false);

  const resolvedPekerjaanOptions =
    pekerjaanOptions && pekerjaanOptions.length > 0 ? pekerjaanOptions : PEKERJAAN_OPTIONS;
  const resolvedItemOptions: ItemBantuan[] = useMemo(() => {
    const base =
      itemOptions && itemOptions.length > 0
        ? getItemsForYear(itemOptions, values.tahun || '2026')
        : ITEM_BANTUAN_OPTIONS.map((code) => ({
            tahun: values.tahun || '2026',
            code,
            name: code,
            subItems: [],
          }));
    if (values.item && !base.some((b) => b.code === values.item)) {
      const legacyPkg = resolvePackageForKpm(itemOptions || [], values.tahun || '2026', values.item);
      return [legacyPkg, ...base];
    }
    return base;
  }, [itemOptions, values.tahun, values.item]);

  const selectedPackageSubItems = useMemo(() => {
    if (!values.item) return [];
    return resolvePackageForKpm(itemOptions || [], values.tahun || '2026', values.item).subItems;
  }, [itemOptions, values.tahun, values.item]);

  useEffect(() => {
    if (editingRecord) {
      setValues({
        tahun: editingRecord.tahun,
        proposal: editingRecord.proposal,
        kecamatan: editingRecord.kecamatan || '',
        kelurahan: editingRecord.kelurahan || '',
        item: editingRecord.item,
        nama: editingRecord.nama,
        alamat: editingRecord.alamat,
        rt: editingRecord.rt,
        rw: editingRecord.rw,
        nikKk: editingRecord.nikKk,
        nikKtp: editingRecord.nikKtp,
        dtsen: editingRecord.dtsen,
        validasi: editingRecord.validasi,
        kontak: editingRecord.kontak,
        pekerjaan: editingRecord.pekerjaan,
        pengelola: editingRecord.pengelola,
        catatan: editingRecord.catatan,
        payment: editingRecord.payment,
        documents: {
          ...editingRecord.documents,
          rumah: Array.isArray(editingRecord.documents.rumah)
            ? editingRecord.documents.rumah
            : editingRecord.documents.rumah
              ? [editingRecord.documents.rumah]
              : [],
          lainnya: editingRecord.documents.lainnya || [],
        },
      });
      setErrors({});
    } else if (lockedProposalScope) {
      setValues({
        ...INITIAL_FORM_VALUES,
        tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
        proposal: lockedProposalScope.namaProposal,
      });
      setErrors({});
    } else {
      setValues(INITIAL_FORM_VALUES);
      setErrors({});
    }
  }, [editingRecord, lockedProposalScope]);

  useEffect(() => {
    if (preselectedProposal && !editingRecord && !lockedProposalScope) {
      const nextOptions = getKelurahanOptionsForProposal(
        preselectedProposal.namaProposal,
        wilayahList
      );
      setValues((prev) => ({
        ...prev,
        tahun: preselectedProposal.tahun || prev.tahun,
        proposal: preselectedProposal.namaProposal,
        kelurahan: nextOptions.includes(prev.kelurahan) ? prev.kelurahan : '',
      }));
      setErrors((prev) => ({ ...prev, proposal: undefined, kelurahan: undefined }));
      onClearPreselectedProposal?.();
    }
  }, [preselectedProposal, editingRecord, lockedProposalScope, onClearPreselectedProposal, wilayahList]);

  const proposalMenuItems = useMemo(() => {
    const map = new Map<string, { name: string; locked: boolean }>();
    for (const prop of proposals) {
      const existing = map.get(prop.namaProposal);
      const matchesYear = prop.tahun === values.tahun;
      if (!existing || matchesYear) {
        map.set(prop.namaProposal, {
          name: prop.namaProposal,
          locked: prop.status === 'locked',
        });
      }
    }
    if (values.proposal && !map.has(values.proposal)) {
      map.set(values.proposal, { name: values.proposal, locked: false });
    }
    return Array.from(map.values());
  }, [proposals, values.tahun, values.proposal]);

  const selectedProposalRecord = useMemo(
    () =>
      proposals.find((p) => p.namaProposal === values.proposal && p.tahun === values.tahun) ??
      proposals.find((p) => p.namaProposal === values.proposal),
    [proposals, values.proposal, values.tahun]
  );

  const editingProposalLocked = useMemo(() => {
    if (!editingRecord) return false;
    const recProp =
      proposals.find(
        (p) => p.namaProposal === editingRecord.proposal && p.tahun === editingRecord.tahun
      ) ?? proposals.find((p) => p.namaProposal === editingRecord.proposal);
    return recProp?.status === 'locked';
  }, [editingRecord, proposals]);

  const isKecamatanSelected = isKecamatanProposal(values.proposal);
  const showKelurahanField = isKecamatanSelected;
  const matchedKelurahanOptions = getKelurahanOptionsForProposal(values.proposal, wilayahList);
  const allWilayahKelurahanOptions = useMemo(() => {
    const list = wilayahList.flatMap((kab) =>
      kab.kecamatanList.flatMap((kec) => kec.kelurahanList)
    );
    return list.length > 0 ? Array.from(new Set(list)) : ALL_KELURAHAN_OPTIONS;
  }, [wilayahList]);
  const kelurahanOptions =
    matchedKelurahanOptions.length > 0
      ? matchedKelurahanOptions
      : isKecamatanSelected
        ? allWilayahKelurahanOptions
        : [];

  const updateField = <K extends keyof KpmFormValues>(key: K, val: KpmFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleProposalChange = (nextProposal: string) => {
    if (nextProposal === '__new_proposal__') {
      onOpenAddProposal();
      return;
    }
    const nextOptions = getKelurahanOptionsForProposal(nextProposal, wilayahList);
    setValues((prev) => ({
      ...prev,
      proposal: nextProposal,
      kelurahan: nextOptions.includes(prev.kelurahan) ? prev.kelurahan : '',
    }));
    setErrors((prev) => ({ ...prev, proposal: undefined, kelurahan: undefined }));
  };

  const handleDtsenChange = (nextDtsen: string) => {
    const autoValidasi = getValidationForDtsen(nextDtsen);
    setValues((prev) => ({
      ...prev,
      dtsen: nextDtsen,
      validasi: autoValidasi,
    }));
    setErrors((prev) => ({ ...prev, dtsen: undefined, validasi: undefined }));
  };

  const handleRtRwChange = (key: 'rt' | 'rw', rawVal: string) => {
    const digits = sanitizeDigits(rawVal, 3);
    updateField(key, digits);
  };

  const handleRtRwBlur = (key: 'rt' | 'rw') => {
    const current = values[key].trim();
    if (!current) return;
    if (current.length < 3) {
      const padded = current.padStart(3, '0');
      updateField(key, padded);
    }
  };

  const updateSingleDocument = (key: SingleDocumentKey, file?: KpmDocumentFile) => {
    setValues((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [key]: file,
      },
    }));
    if (key === 'ktp' && errors.docKtp) {
      setErrors((prev) => ({ ...prev, docKtp: undefined }));
    }
    if (key === 'kk' && errors.docKk) {
      setErrors((prev) => ({ ...prev, docKk: undefined }));
    }
  };

  const updateRumahDocuments = (files: KpmDocumentFile[]) => {
    setValues((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        rumah: files,
      },
    }));
  };

  const updateLainnyaDocuments = (files: KpmDocumentFile[]) => {
    setValues((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        lainnya: files,
      },
    }));
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    // Kategori 01: Wajib semua + cek kunci proposal
    if (!values.tahun) nextErrors.tahun = 'Pilih tahun anggaran.';
    if (!values.proposal) {
      nextErrors.proposal = 'Pilih proposal pengajuan.';
    } else if (selectedProposalRecord?.status === 'locked') {
      nextErrors.proposal =
        'Proposal ini berstatus Terkunci dan tidak dapat menerima atau mengubah data KPM.';
    }
    if (showKelurahanField && !values.kelurahan) {
      nextErrors.kelurahan = 'Pilih kelurahan domisili calon KPM.';
    }

    // Kategori 02: Wajib semua KECUALI Nomor HP (kontak)
    if (!isValidNik16(values.nikKk)) {
      nextErrors.nikKk = 'Nomor Kartu Keluarga (KK) harus terdiri dari tepat 16 digit angka.';
    }
    if (!isValidNik16(values.nikKtp)) {
      nextErrors.nikKtp = 'NIK KTP harus terdiri dari tepat 16 digit angka.';
    }
    if (!values.nama.trim()) nextErrors.nama = 'Nama lengkap wajib diisi.';
    if (!values.alamat.trim()) nextErrors.alamat = 'Alamat domisili wajib diisi.';

    const normalizedRt =
      values.rt.length > 0 && values.rt.length < 3 ? values.rt.padStart(3, '0') : values.rt;
    const normalizedRw =
      values.rw.length > 0 && values.rw.length < 3 ? values.rw.padStart(3, '0') : values.rw;

    if (!isValidRtRw(normalizedRt)) {
      nextErrors.rt = 'RT wajib 3 digit dan berawalan angka 0 (contoh: 001).';
    }
    if (!isValidRtRw(normalizedRw)) {
      nextErrors.rw = 'RW wajib 3 digit dan berawalan angka 0 (contoh: 001).';
    }
    if (!values.pekerjaan) nextErrors.pekerjaan = 'Pilih pekerjaan utama.';

    // Kategori 03: Wajib untuk Item, Pengelola, DTSEN, dan Validasi Berkas (Biaya Administrasi & Catatan Petugas opsional)
    if (!values.item) nextErrors.item = 'Pilih item bantuan.';
    if (!values.pengelola) nextErrors.pengelola = 'Pilih atau tambahkan pengelola.';
    if (!values.dtsen) nextErrors.dtsen = 'Pilih status DTSEN.';
    if (!values.validasi) nextErrors.validasi = 'Pilih status validasi berkas.';

    // Kategori 04: Wajib semua
    if (!values.documents.ktp) {
      nextErrors.docKtp = 'Foto dokumen KTP wajib diunggah.';
    }
    if (!values.documents.kk) {
      nextErrors.docKk = 'Foto dokumen Kartu Keluarga (KK) wajib diunggah.';
    }

    return nextErrors;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editingProposalLocked) return;
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstErrorKey = Object.keys(validationErrors)[0];
      const targetId =
        firstErrorKey === 'docKtp'
          ? 'upload-ktp'
          : firstErrorKey === 'docKk'
            ? 'upload-kk'
            : `field-${firstErrorKey}`;
      const el = document.getElementById(targetId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const resolvedDomicile = resolveProposalDomicile(
      values.proposal,
      proposals,
      values.tahun,
      wilayahList
    );

    onSave(
      {
        ...values,
        kecamatan: resolvedDomicile.kecamatan || values.kecamatan || '',
        kelurahan: showKelurahanField
          ? values.kelurahan
          : resolvedDomicile.kelurahan || values.kelurahan || '',
        nama: values.nama.trim().toUpperCase(),
        alamat: formatAlamatLengkap(values.alamat, true),
        catatan: values.catatan.trim(),
        rt: values.rt.trim().padStart(3, '0'),
        rw: values.rw.trim().padStart(3, '0'),
      },
      editingRecord?.id
    );

    if (!editingRecord) {
      setValues(
        lockedProposalScope
          ? {
              ...INITIAL_FORM_VALUES,
              tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
              proposal: lockedProposalScope.namaProposal,
            }
          : INITIAL_FORM_VALUES
      );
      setErrors({});
    }
  };

  const handleReset = () => {
    if (editingRecord) {
      onCancelEdit();
    } else {
      setValues(
        lockedProposalScope
          ? {
              ...INITIAL_FORM_VALUES,
              tahun: lockedProposalScope.tahun || INITIAL_FORM_VALUES.tahun,
              proposal: lockedProposalScope.namaProposal,
            }
          : INITIAL_FORM_VALUES
      );
      setErrors({});
    }
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  const selectedPengelolaObj = pengelolaList.find((p) => p.displayName === values.pengelola);
  const hasProposalSelected = Boolean(values.tahun && values.proposal);

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="min-h-screen pb-24">
        {/* Native Mobile Sub-Screen Header (Back + Title Only) */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              if (editingRecord) {
                onCancelEdit();
              } else if (onBack) {
                onBack();
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-slate-900">
            {editingRecord ? 'Perbarui Data Calon KPM' : 'Pendaftaran Calon KPM'}
          </h1>
        </header>

        <div className="space-y-4 px-4 pt-4">
          {feedback && (
            <div
              role="status"
              className={`flex items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${
                feedback.type === 'success'
                  ? 'border-teal-200 bg-teal-50 text-teal-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    feedback.type === 'success' ? 'text-teal-700' : 'text-rose-600'
                  }`}
                />
                <p className="font-medium leading-snug">{feedback.message}</p>
              </div>

              {onDismissFeedback && (
                <button
                  type="button"
                  onClick={onDismissFeedback}
                  className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 shrink-0"
                  aria-label="Tutup pemberitahuan"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {editingProposalLocked && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs text-amber-950"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Data KPM Terkunci oleh Status Proposal</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Proposal &ldquo;{editingRecord?.proposal}&rdquo; sedang berstatus Terkunci. Data KPM di dalamnya tidak dapat diedit atau dipindahkan ke proposal lain.
                </p>
              </div>
            </div>
          )}

          {errorCount > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="font-semibold">
                  Terdapat {errorCount} kolom wajib yang belum dilengkapi atau tidak valid.
                </p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">
                  Kategori 1, Kategori 2 (kecuali Nomor HP), Kategori 3 (kecuali Biaya Administrasi & Catatan Petugas), dan Kategori 4 wajib diisi sebelum menyimpan.
                </p>
              </div>
            </div>
          )}

          {/* Dedicated Single-Column Mobile Stack */}
          <div className="space-y-4">
          {/* Section 1: Data Usulan & Proposal */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              01. Data Usulan & Proposal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tentukan tahun anggaran dan proposal pengajuan bantuan.
            </p>

            <div className="mt-4 space-y-4">
              <div id="field-tahun">
                <label htmlFor="input-tahun" className="block text-xs font-semibold text-slate-700">
                  Tahun Anggaran <span className="text-rose-600">*</span>
                </label>
                <PlaceholderSelect
                  placeholder="Pilih Tahun"
                  id="input-tahun"
                  disabled={editingProposalLocked || isProposalScopeLocked}
                  value={values.tahun}
                  onChange={(v) => updateField('tahun', v)}
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 ${
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

              <div id="field-proposal">
                <label htmlFor="input-proposal" className="block text-xs font-semibold text-slate-700">
                  Proposal <span className="text-rose-600">*</span>
                </label>
                <PlaceholderSelect
                  placeholder="Pilih Kelurahan / Kecamatan"
                  id="input-proposal"
                  disabled={editingProposalLocked || isProposalScopeLocked}
                  value={values.proposal}
                  onChange={(v) => handleProposalChange(v)}
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 ${
                    errors.proposal ? 'border-rose-400' : 'border-slate-300'
                  }`}
                >
                  {proposalMenuItems.map((item) => (
                    <option key={item.name} value={item.name} disabled={item.locked}>
                      {item.locked ? `${item.name} (Terkunci)` : item.name}
                    </option>
                  ))}
                </PlaceholderSelect>

                {isProposalScopeLocked ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-teal-800">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Tahun dan proposal dikunci otomatis. Ubah nanti melalui menu Edit Data KPM jika perlu.
                    </span>
                  </p>
                ) : (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={onOpenAddProposal}
                      className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 active:opacity-80"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>Tambah proposal baru</span>
                    </button>
                  </div>
                )}

                {errors.proposal && <p className="mt-0.5 text-xs text-rose-600">{errors.proposal}</p>}
              </div>

              {/* Conditional Kelurahan Field when Proposal is Kecamatan */}
              {showKelurahanField && (
                <div id="field-kelurahan">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-kelurahan" className="block text-xs font-semibold text-slate-700">
                      Kelurahan / Desa Domisili Calon KPM <span className="text-rose-600">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Wajib (Kecamatan)
                    </span>
                  </div>
                  <PlaceholderSelect
                    placeholder={`Pilih Kelurahan / Desa di ${values.proposal}`}
                    id="input-kelurahan"
                    value={values.kelurahan}
                    onChange={(v) => updateField('kelurahan', v)}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.kelurahan ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {kelurahanOptions.map((kel) => (
                      <option key={kel} value={kel}>
                        {kel}
                      </option>
                    ))}
                  </PlaceholderSelect>
                  {errors.kelurahan && (
                    <p className="mt-1 text-xs text-rose-600">{errors.kelurahan}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {!hasProposalSelected ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-slate-800">
                Pilih Tahun dan Proposal Terlebih Dahulu
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Kolom pengisian profil calon KPM, bantuan, dan dokumen akan tampil otomatis setelah tahun anggaran dan proposal dipilih.
              </p>
            </div>
          ) : (
            <>
          {/* Section 2: Profil Calon KPM */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              02. Profil Calon KPM
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Seluruh data wajib diisi sesuai dokumen kecuali Nomor HP (opsional).
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3.5">
                <div id="field-nikKk" className="col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-nik-kk" className="text-xs font-semibold text-slate-700">
                      NIK KK (No. Kartu Keluarga) <span className="text-rose-600">*</span>
                    </label>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isValidNik16(values.nikKk) ? 'font-semibold text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {values.nikKk.length}/16
                    </span>
                  </div>
                  <input
                    id="input-nik-kk"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={16}
                    placeholder="16 digit angka Nomor KK"
                    value={values.nikKk}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('nikKk', sanitizeDigits(e.target.value, 16))}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 font-mono text-sm tracking-wide text-slate-900 tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nikKk ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.nikKk && <p className="mt-1 text-xs text-rose-600">{errors.nikKk}</p>}
                </div>

                <div id="field-nikKtp" className="col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-nik-ktp" className="text-xs font-semibold text-slate-700">
                      NIK KTP <span className="text-rose-600">*</span>
                    </label>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isValidNik16(values.nikKtp) ? 'font-semibold text-teal-700' : 'text-slate-400'
                      }`}
                    >
                      {values.nikKtp.length}/16
                    </span>
                  </div>
                  <input
                    id="input-nik-ktp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={16}
                    placeholder="16 digit angka NIK KTP"
                    value={values.nikKtp}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('nikKtp', sanitizeDigits(e.target.value, 16))}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 font-mono text-sm tracking-wide text-slate-900 tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nikKtp ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.nikKtp && <p className="mt-1 text-xs text-rose-600">{errors.nikKtp}</p>}
                </div>

                <div id="field-nama" className="col-span-2">
                  <label htmlFor="input-nama" className="block text-xs font-semibold text-slate-700">
                    Nama Lengkap Calon KPM <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="input-nama"
                    type="text"
                    autoCapitalize="characters"
                    placeholder="Sesuai KTP elektronik"
                    value={values.nama}
                    onChange={(e) => updateField('nama', e.target.value.toUpperCase())}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.nama ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.nama && <p className="mt-1 text-xs text-rose-600">{errors.nama}</p>}
                </div>

                <div id="field-alamat" className="col-span-2">
                  <label htmlFor="input-alamat" className="block text-xs font-semibold text-slate-700">
                    Alamat Lengkap <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="input-alamat"
                    type="text"
                    autoCapitalize="words"
                    placeholder="Contoh: Jl. Imam Bonjol Gg. 1 No. 5"
                    value={values.alamat}
                    onChange={(e) => updateField('alamat', formatAlamatLengkap(e.target.value, false))}
                    onBlur={() => {
                      if (values.alamat) {
                        updateField('alamat', formatAlamatLengkap(values.alamat, true));
                      }
                    }}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.alamat ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.alamat && <p className="mt-1 text-xs text-rose-600">{errors.alamat}</p>}
                </div>

                <div id="field-rt">
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="input-rt" className="block text-xs font-semibold text-slate-700">
                      RT <span className="text-rose-600">*</span>
                    </label>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {values.rt.length}/3
                    </span>
                  </div>
                  <input
                    id="input-rt"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="001"
                    value={values.rt}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => handleRtRwChange('rt', e.target.value)}
                    onBlur={() => handleRtRwBlur('rt')}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.rt ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">3 digit awalan 0</p>
                  {errors.rt && <p className="mt-1 text-xs text-rose-600">{errors.rt}</p>}
                </div>

                <div id="field-rw">
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="input-rw" className="block text-xs font-semibold text-slate-700">
                      RW <span className="text-rose-600">*</span>
                    </label>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {values.rw.length}/3
                    </span>
                  </div>
                  <input
                    id="input-rw"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="001"
                    value={values.rw}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => handleRtRwChange('rw', e.target.value)}
                    onBlur={() => handleRtRwBlur('rw')}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.rw ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">3 digit awalan 0</p>
                  {errors.rw && <p className="mt-1 text-xs text-rose-600">{errors.rw}</p>}
                </div>

                <div id="field-pekerjaan" className="col-span-2">
                  <label htmlFor="input-pekerjaan" className="block text-xs font-semibold text-slate-700">
                    Pekerjaan <span className="text-rose-600">*</span>
                  </label>
                  <PlaceholderSelect
                    placeholder="Pilih Pekerjaan"
                    id="input-pekerjaan"
                    value={values.pekerjaan}
                    onChange={(v) => updateField('pekerjaan', v)}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.pekerjaan ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {resolvedPekerjaanOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </PlaceholderSelect>
                  {errors.pekerjaan && <p className="mt-1 text-xs text-rose-600">{errors.pekerjaan}</p>}
                </div>

                <div id="field-kontak" className="col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-kontak" className="block text-xs font-semibold text-slate-700">
                      Nomor HP
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <input
                    id="input-kontak"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    placeholder="08xxxxxxxxxx"
                    value={values.kontak}
                    onKeyDown={blockNonNumericKeyDown}
                    onChange={(e) => updateField('kontak', sanitizeDigits(e.target.value, 15))}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:font-sans placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Item, Pengelola & Validasi */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">
                03. Item, Pengelola & Validasi
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Item Bantuan, Pengelola, DTSEN, dan Validasi Berkas wajib diisi sebelum menyimpan.
              </p>

              <div className="mt-4 space-y-4">
                <div id="field-item">
                  <label htmlFor="input-item" className="block text-xs font-semibold text-slate-700">
                    Item Bantuan <span className="text-rose-600">*</span>
                  </label>
                  <PlaceholderSelect
                    placeholder="Pilih Item"
                    id="input-item"
                    value={values.item}
                    onChange={(v) => updateField('item', v)}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 font-mono text-sm font-medium transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.item ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {resolvedItemOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name && item.name !== item.code
                          ? `${item.code} — ${item.name}`
                          : item.code}
                      </option>
                    ))}
                  </PlaceholderSelect>
                  {selectedPackageSubItems.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                      Sub-item ({values.tahun}):{' '}
                      <span className="font-medium text-slate-700">
                        {selectedPackageSubItems.join(', ')}
                      </span>
                    </p>
                  )}
                  {errors.item && <p className="mt-1 text-xs text-rose-600">{errors.item}</p>}
                </div>

                {/* Searchable Pengelola Picker + New Pengelola Trigger */}
                <div id="field-pengelola">
                  <span className="block text-xs font-semibold text-slate-700">
                    Pengelola <span className="text-rose-600">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPengelolaModalOpen(true)}
                    className={`mt-1.5 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.pengelola ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {selectedPengelolaObj?.foto ? (
                        <img
                          src={selectedPengelolaObj.foto.dataUrl}
                          alt={selectedPengelolaObj.displayName}
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`truncate ${
                          values.pengelola ? 'font-medium text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {values.pengelola || 'Pilih atau Tambah Pengelola'}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                  </button>
                  {errors.pengelola && (
                    <p className="mt-1 text-xs text-rose-600">{errors.pengelola}</p>
                  )}
                </div>

                <div id="field-dtsen">
                  <label htmlFor="input-dtsen" className="block text-xs font-semibold text-slate-700">
                    DTSEN <span className="text-rose-600">*</span>
                  </label>
                  <PlaceholderSelect
                    placeholder="Pilih Status DTSEN"
                    id="input-dtsen"
                    value={values.dtsen}
                    onChange={(v) => handleDtsenChange(v)}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      errors.dtsen ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {DTSEN_OPTION_ITEMS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </PlaceholderSelect>
                  {errors.dtsen && <p className="mt-1 text-xs text-rose-600">{errors.dtsen}</p>}
                </div>

                <div id="field-validasi">
                  <span className="block text-xs font-semibold text-slate-700">
                    Validasi Berkas <span className="text-rose-600">*</span>
                  </span>
                  <div
                    className={`mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 ${
                      errors.validasi ? 'ring-1 ring-rose-400' : ''
                    }`}
                  >
                    {(
                      [
                        { key: 'pending', label: 'Menunggu' },
                        { key: 'rejected', label: 'Ditolak' },
                        { key: 'accepted', label: 'Diterima' },
                      ] as { key: ValidationStatus; label: string }[]
                    ).map((opt) => {
                      const active = values.validasi === opt.key;
                      const activeTone =
                        opt.key === 'accepted'
                          ? 'bg-teal-700 text-white'
                          : opt.key === 'rejected'
                            ? 'bg-rose-600 text-white'
                            : 'bg-white text-slate-900 shadow-sm';
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => updateField('validasi', opt.key)}
                          className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                            active ? activeTone : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Otomatis Diterima untuk Desil 1–4, dan Menunggu untuk selain itu.
                  </p>
                  {errors.validasi && (
                    <p className="mt-1 text-xs text-rose-600">{errors.validasi}</p>
                  )}
                </div>

                <div id="field-payment" className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-payment" className="block text-xs font-semibold text-slate-700">
                      Biaya Administrasi / Pelayanan
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-xs font-medium text-slate-500">
                      Rp
                    </span>
                    <input
                      id="input-payment"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={values.payment === 0 ? '' : values.payment.toLocaleString('id-ID')}
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        updateField('payment', raw ? parseInt(raw, 10) : 0);
                      }}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Biaya pelayanan administrasi dari calon KPM (kosongkan jika tidak ada).
                  </p>
                </div>

                <div id="field-catatan" className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="input-catatan" className="block text-xs font-semibold text-slate-700">
                      Catatan Petugas
                    </label>
                    <span className="text-[11px] text-slate-400">Opsional</span>
                  </div>
                  <textarea
                    id="input-catatan"
                    rows={2}
                    placeholder="Keterangan hasil survei atau kondisi keluarga (jika ada)..."
                    value={values.catatan}
                    onChange={(e) => updateField('catatan', e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>
              </div>
            </section>

          {/* 04. Dokumen KTP & KK */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              04. Dokumen KTP & KK
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Wajib unggah langsung foto KTP dan Kartu Keluarga (single foto per kolom).
            </p>

            <div className="mt-4 space-y-5">
              <DocumentUploadCard
                id="upload-ktp"
                label="Foto KTP"
                helperText="Foto e-KTP asli dengan NIK terlihat jelas"
                variant="ktp"
                required
                value={values.documents.ktp}
                error={errors.docKtp}
                onChange={(file) => updateSingleDocument('ktp', file)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-kk"
                  label="Foto Kartu Keluarga (KK)"
                  helperText="Foto seluruh halaman Kartu Keluarga"
                  variant="kk"
                  required
                  value={values.documents.kk}
                  error={errors.docKk}
                  onChange={(file) => updateSingleDocument('kk', file)}
                  onPreview={onPreviewDocument}
                />
              </div>
            </div>
          </section>

          {/* 05. Dokumentasi Lapangan */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              05. Dokumentasi Lapangan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Foto penerima (1 foto), foto survey (1 foto), dan foto kondisi rumah (maks. 3 foto).
            </p>

            <div className="mt-4 space-y-5">
              <DocumentUploadCard
                id="upload-penerima"
                label="Foto Penerima"
                helperText="Foto diri calon penerima bantuan"
                variant="penerima"
                value={values.documents.penerima}
                onChange={(file) => updateSingleDocument('penerima', file)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-survey"
                  label="Foto Survey"
                  helperText="Foto kegiatan wawancara / survei lapangan"
                  variant="survey"
                  value={values.documents.survey}
                  onChange={(file) => updateSingleDocument('survey', file)}
                  onPreview={onPreviewDocument}
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <MultiDocumentUploadCard
                  id="upload-rumah"
                  label="Foto Rumah"
                  helperText="Tambahkan foto tampak depan atau kondisi rumah (maks. 3 foto)"
                  maxFiles={3}
                  values={values.documents.rumah}
                  onChange={updateRumahDocuments}
                  onPreview={onPreviewDocument}
                />
              </div>
            </div>
          </section>

          {/* 06. Foto Lainnya */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              06. Foto Lainnya
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bisa unggah bertahap atau langsung hingga maksimal 5 foto pendukung.
            </p>

            <div className="mt-4">
              <MultiDocumentUploadCard
                id="upload-lainnya"
                label="Foto Lainnya"
                helperText="Tambahkan satu atau beberapa foto pendukung (maks. 5 foto)"
                maxFiles={5}
                values={values.documents.lainnya}
                onChange={updateLainnyaDocuments}
                onPreview={onPreviewDocument}
              />
            </div>
          </section>
            </>
          )}
          </div>
        </div>

        {/* Sticky Bottom Action Bar constrained to Mobile Screen */}
        {hasProposalSelected && (
        <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              {editingRecord ? <X className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              <span>{editingRecord ? 'Batal' : 'Reset'}</span>
            </button>

            <button
              type="submit"
              disabled={editingProposalLocked}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap"
            >
              {editingProposalLocked ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Terkunci</span>
                </>
              ) : editingRecord ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Simpan Perubahan</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Simpan Calon KPM</span>
                </>
              )}
            </button>
          </div>
        </div>
        )}
      </form>

      {/* Searchable Pengelola Selector & Add New Pengelola Modal */}
      <PengelolaSelectorModal
        isOpen={isPengelolaModalOpen}
        pengelolaList={pengelolaList}
        wilayahList={wilayahList}
        selectedName={values.pengelola}
        onClose={() => setIsPengelolaModalOpen(false)}
        onSelect={(displayName) => updateField('pengelola', displayName)}
        onCreatePengelola={onCreatePengelola}
        onPreviewDocument={onPreviewDocument}
      />
    </>
  );
}
