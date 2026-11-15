import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  X,
} from 'lucide-react';
import {
  PROPOSAL_TIPE_OPTIONS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  KpmDocumentFile,
  ProposalChecklist,
  ProposalDocuments,
  ProposalFormValues,
  ProposalRecord,
  ProposalTipe,
} from '../types/kpm';
import {
  blockNonNumericKeyDown,
  formatUploadDateTime,
  sanitizeDigits,
} from '../utils/imageProcessor';
import { DocumentUploadCard } from './DocumentUploadCard';
import { ProposalDocumentUploadCard } from './ProposalDocumentUploadCard';
import { PlaceholderSelect } from './FormControls';

interface ProposalFormProps {
  proposal: ProposalRecord;
  existingProposals?: ProposalRecord[];
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onDismissFeedback?: () => void;
  onBack: () => void;
  onSaveProposal: (proposalId: string, values: ProposalFormValues) => void;
  onToggleProposalLock: (proposalId: string) => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
}

type ProposalErrors = Partial<Record<'tahun' | 'tipe' | 'jumlahKpm', string>>;

interface ToggleRowConfig {
  key: 'docx' | 'dinas' | 'rab' | 'rt' | 'rw' | 'lurah' | 'camat';
  label: string;
  description: string;
  linkedLabel?: string;
  readOnly: boolean;
}

const TOGGLE_ROWS: ToggleRowConfig[] = [
  {
    key: 'dinas',
    label: 'Dinas',
    description: 'Proposal sudah diantar ke Dinas terkait',
    readOnly: false,
  },
  {
    key: 'docx',
    label: 'DOCX (Berkas Proposal)',
    description: 'Berkas proposal sudah dibuat & diunggah',
    linkedLabel: 'Otomatis aktif saat Proposal OPD / Lurah & Camat diunggah',
    readOnly: true,
  },
  {
    key: 'rab',
    label: 'RAB (Rencana Anggaran Biaya)',
    description: 'Proposal sudah disertai berkas RAB',
    linkedLabel: 'Otomatis aktif saat Berkas RAB diunggah',
    readOnly: true,
  },
  {
    key: 'rt',
    label: 'Cap RT',
    description: 'Foto cap pengesahan RT sudah diunggah',
    linkedLabel: 'Otomatis aktif saat foto Cap RT diunggah',
    readOnly: true,
  },
  {
    key: 'rw',
    label: 'Cap RW',
    description: 'Foto cap pengesahan RW sudah diunggah',
    linkedLabel: 'Otomatis aktif saat foto Cap RW diunggah',
    readOnly: true,
  },
  {
    key: 'lurah',
    label: 'Cap Lurah',
    description: 'Foto cap pengesahan Lurah sudah diunggah',
    linkedLabel: 'Otomatis aktif saat foto Cap Lurah diunggah',
    readOnly: true,
  },
  {
    key: 'camat',
    label: 'Cap Camat',
    description: 'Foto cap pengesahan Camat sudah diunggah',
    linkedLabel: 'Otomatis aktif saat foto Cap Camat diunggah',
    readOnly: true,
  },
];

function SwitchToggle({
  checked,
  readOnly,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const isBlocked = Boolean(readOnly || disabled);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-readonly={readOnly || undefined}
      aria-label={label}
      disabled={isBlocked}
      onClick={isBlocked ? undefined : onToggle}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-1 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 shrink-0 ${
        readOnly ? 'cursor-default' : disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <span
        className={`text-xs font-semibold tabular-nums ${
          checked ? 'text-teal-700' : 'text-slate-500'
        }`}
      >
        {checked ? 'Sudah' : 'Belum'}
      </span>
      <span
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? 'border-teal-700 bg-teal-700'
            : readOnly
              ? 'border-slate-200 bg-slate-200/80'
              : 'border-slate-300 bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function ProposalForm({
  proposal,
  existingProposals = [],
  feedback,
  onDismissFeedback,
  onBack,
  onSaveProposal,
  onToggleProposalLock,
  onPreviewDocument,
}: ProposalFormProps) {
  const [values, setValues] = useState<ProposalFormValues>({
    tahun: proposal.tahun,
    tipe: proposal.tipe,
    kabKota: proposal.kabKota,
    kecamatan: proposal.kecamatan,
    kelurahan: proposal.kelurahan,
    jalan: proposal.jalan,
    namaProposal: proposal.namaProposal,
    jumlahKpm: proposal.jumlahKpm ?? 66,
    status: proposal.status,
    checklist: { ...proposal.checklist },
    catatan: proposal.catatan,
    documents: { ...proposal.documents },
  });
  const [jumlahKpmInput, setJumlahKpmInput] = useState<string>(
    String(proposal.jumlahKpm ?? 66)
  );
  const [errors, setErrors] = useState<ProposalErrors>({});

  useEffect(() => {
    setValues({
      tahun: proposal.tahun,
      tipe: proposal.tipe,
      kabKota: proposal.kabKota,
      kecamatan: proposal.kecamatan,
      kelurahan: proposal.kelurahan,
      jalan: proposal.jalan,
      namaProposal: proposal.namaProposal,
      jumlahKpm: proposal.jumlahKpm ?? 66,
      status: proposal.status,
      checklist: { ...proposal.checklist },
      catatan: proposal.catatan,
      documents: { ...proposal.documents },
    });
    setJumlahKpmInput(String(proposal.jumlahKpm ?? 66));
    setErrors({});
  }, [proposal]);

  const isPersistedLocked = proposal.status === 'locked';

  const updateChecklist = (key: ToggleRowConfig['key'], nextVal: boolean) => {
    if (key !== 'dinas' || isPersistedLocked) return;
    setValues((prev) => {
      const nextChecklist: ProposalChecklist = {
        ...prev.checklist,
        [key]: nextVal,
        dinasAt: nextVal ? new Date().toISOString() : undefined,
      };
      return {
        ...prev,
        checklist: nextChecklist,
      };
    });
  };

  const handleProposalDocChange = (
    docKey: keyof ProposalDocuments,
    file?: KpmDocumentFile
  ) => {
    if (isPersistedLocked) return;
    setValues((prev) => {
      const nextDocs: ProposalDocuments = {
        ...prev.documents,
        [docKey]: file,
      };
      const nextChecklist: ProposalChecklist = { ...prev.checklist };

      if (docKey === 'proposalOpd' || docKey === 'proposalLurahCamat') {
        nextChecklist.docx = Boolean(nextDocs.proposalOpd || nextDocs.proposalLurahCamat);
      } else if (docKey === 'rab') {
        nextChecklist.rab = Boolean(nextDocs.rab);
      } else if (docKey === 'capRt') {
        nextChecklist.rt = Boolean(nextDocs.capRt);
      } else if (docKey === 'capRw') {
        nextChecklist.rw = Boolean(nextDocs.capRw);
      } else if (docKey === 'capLurah') {
        nextChecklist.lurah = Boolean(nextDocs.capLurah);
      } else if (docKey === 'capCamat') {
        nextChecklist.camat = Boolean(nextDocs.capCamat);
      }

      return {
        ...prev,
        documents: nextDocs,
        checklist: nextChecklist,
      };
    });
  };

  const handleTipeChange = (nextTipe: ProposalTipe | '') => {
    if (isPersistedLocked) return;
    setValues((prev) => ({
      ...prev,
      tipe: nextTipe,
    }));
    setErrors((prev) => ({ ...prev, tipe: undefined }));
  };

  const validate = (): ProposalErrors => {
    const nextErrors: ProposalErrors = {};
    if (!values.tahun) {
      nextErrors.tahun = 'Pilih tahun anggaran.';
    } else {
      const targetName = proposal.namaProposal.trim().toLowerCase();
      const hasDuplicate = existingProposals.some(
        (p) =>
          p.id !== proposal.id &&
          p.tahun === values.tahun &&
          p.namaProposal.trim().toLowerCase() === targetName
      );
      if (hasDuplicate) {
        nextErrors.tahun = `Proposal "${proposal.namaProposal}" sudah ada pada tahun ${values.tahun}.`;
      }
    }
    if (!values.tipe) nextErrors.tipe = 'Pilih tipe proposal.';
    const parsedJumlah = Number(jumlahKpmInput);
    if (!jumlahKpmInput || !Number.isFinite(parsedJumlah) || parsedJumlah < 1) {
      nextErrors.jumlahKpm = 'Jumlah KPM wajib diisi (minimal 1).';
    }
    return nextErrors;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isPersistedLocked) return;

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstKey = Object.keys(validationErrors)[0];
      document
        .getElementById(`proposal-field-${firstKey}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    onSaveProposal(proposal.id, {
      ...values,
      jumlahKpm: Number(jumlahKpmInput) || 66,
      namaProposal: proposal.namaProposal,
      catatan: values.catatan.trim(),
    });
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Native Mobile Sub-Screen Header (Back + Title Only) */}
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
          Edit Proposal
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

        {/* Locked Proposal Guard Banner */}
        {isPersistedLocked && (
          <div
            role="alert"
            className="space-y-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950"
          >
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Proposal Berstatus Terkunci</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Seluruh data proposal, status kelengkapan, berkas dokumen, serta seluruh data KPM di dalamnya tidak dapat diedit atau dipindahkan.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onToggleProposalLock(proposal.id)}
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-4 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              <Unlock className="h-4 w-4" />
              <span>Buka Kunci Proposal</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* 01. Identitas & Status Kunci Proposal */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              01. Identitas &amp; Status Proposal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Perbarui tahun, tipe, catatan, dan kunci pengeditan proposal. Judul proposal bersifat tetap.
            </p>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div id="proposal-field-tahun">
                  <label htmlFor="prop-tahun" className="block text-xs font-semibold text-slate-700">
                    Tahun <span className="text-rose-600">*</span>
                  </label>
                  <PlaceholderSelect
                    placeholder="Tahun"
                    id="prop-tahun"
                    disabled={isPersistedLocked}
                    value={values.tahun}
                    onChange={(v) => {
                      setValues((prev) => ({ ...prev, tahun: v }));
                      setErrors((prev) => ({ ...prev, tahun: undefined }));
                    }}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${
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

                <div id="proposal-field-tipe">
                  <label htmlFor="prop-tipe" className="block text-xs font-semibold text-slate-700">
                    Tipe <span className="text-rose-600">*</span>
                  </label>
                  <PlaceholderSelect
                    placeholder="Tipe"
                    id="prop-tipe"
                    disabled={isPersistedLocked}
                    value={values.tipe}
                    onChange={(v) => handleTipeChange(v as ProposalTipe | '')}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3 text-sm transition-colors focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${
                      errors.tipe ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  >
                    {PROPOSAL_TIPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </PlaceholderSelect>
                  {errors.tipe && <p className="mt-1 text-xs text-rose-600">{errors.tipe}</p>}
                </div>
              </div>

              {/* Judul Proposal FIXED / Read-Only */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="prop-nama-fixed" className="block text-xs font-semibold text-slate-700">
                    Judul Proposal
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">Tetap (Tidak dapat diubah)</span>
                </div>
                <input
                  id="prop-nama-fixed"
                  type="text"
                  readOnly
                  value={values.namaProposal}
                  className="mt-1.5 min-h-[44px] w-full cursor-not-allowed rounded-xl border border-slate-300 bg-slate-100 px-3.5 text-sm font-semibold text-slate-700 focus:outline-none"
                />
              </div>

              {/* Jumlah KPM */}
              <div id="proposal-field-jumlahKpm">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="prop-jumlah-kpm" className="block text-xs font-semibold text-slate-700">
                    Jumlah KPM <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Default 66</span>
                </div>
                <input
                  id="prop-jumlah-kpm"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  disabled={isPersistedLocked}
                  placeholder="66"
                  value={jumlahKpmInput}
                  onKeyDown={blockNonNumericKeyDown}
                  onChange={(e) => {
                    const digits = sanitizeDigits(e.target.value, 5);
                    setJumlahKpmInput(digits);
                    setValues((prev) => ({
                      ...prev,
                      jumlahKpm: Number(digits) || 0,
                    }));
                    setErrors((prev) => ({ ...prev, jumlahKpm: undefined }));
                  }}
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${
                    errors.jumlahKpm ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                {errors.jumlahKpm && (
                  <p className="mt-1 text-xs text-rose-600">{errors.jumlahKpm}</p>
                )}
              </div>

              {/* Status Kunci Proposal */}
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Status Proposal
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    disabled={isPersistedLocked}
                    onClick={() => setValues((prev) => ({ ...prev, status: 'unlocked' }))}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                      values.status === 'unlocked'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Unlock className="h-4 w-4 shrink-0" />
                    <span>Terbuka</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPersistedLocked}
                    onClick={() => setValues((prev) => ({ ...prev, status: 'locked' }))}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                      values.status === 'locked'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>Terkunci</span>
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                  Jika <strong>Terkunci</strong>, seluruh data proposal dan data KPM di dalamnya tidak dapat diedit maupun dipindahkan.
                </p>
              </div>

              {/* Catatan */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="prop-catatan" className="block text-xs font-semibold text-slate-700">
                    Catatan
                  </label>
                  <span className="text-[11px] text-slate-400">Opsional</span>
                </div>
                <textarea
                  id="prop-catatan"
                  rows={2}
                  disabled={isPersistedLocked}
                  placeholder="Keterangan tambahan progres proposal..."
                  value={values.catatan}
                  onChange={(e) => setValues((prev) => ({ ...prev, catatan: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                />
              </div>
            </div>
          </section>

          {/* 02. Status Kelengkapan Proposal (Toggle Switches) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              02. Status Kelengkapan Proposal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hanya status Dinas yang dapat diubah manual. Status lainnya otomatis aktif sesuai unggahan berkas &amp; foto cap.
            </p>

            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {TOGGLE_ROWS.map((row) => {
                const isOn = values.checklist[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-2.5 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-900">{row.label}</p>
                        {row.readOnly && (
                          <span className="text-xs font-medium text-slate-400">
                            · Otomatis
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{row.description}</p>
                      {row.linkedLabel && (
                        <p className="mt-0.5 text-xs text-teal-700 leading-tight">{row.linkedLabel}</p>
                      )}
                      {row.key === 'dinas' && isOn && values.checklist.dinasAt && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-teal-700 tabular-nums">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Diantar: {formatUploadDateTime(values.checklist.dinasAt)}</span>
                        </p>
                      )}
                    </div>

                    <SwitchToggle
                      checked={isOn}
                      readOnly={row.readOnly}
                      disabled={isPersistedLocked}
                      label={row.label}
                      onToggle={() => updateChecklist(row.key, !isOn)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* 03. Berkas Dokumen Proposal & RAB */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              03. Berkas Dokumen Proposal &amp; RAB
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Mencatat waktu upload otomatis dan mengaktifkan toggle status terkait.
            </p>

            <div className="mt-4 space-y-5">
              <ProposalDocumentUploadCard
                id="upload-proposal-opd"
                label="Proposal OPD"
                helperText="Unggah berkas Proposal OPD (PDF / DOCX / Scan)"
                accept=".pdf,.doc,.docx,image/*"
                formatLabel="PDF, Word (.doc/.docx), atau Gambar · Maks 5 MB"
                variant="pdf"
                disabled={isPersistedLocked}
                value={values.documents.proposalOpd}
                onChange={(file) => handleProposalDocChange('proposalOpd', file)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <ProposalDocumentUploadCard
                  id="upload-proposal-lurah-camat"
                  label="Proposal Lurah / Camat"
                  helperText="Unggah berkas Proposal Lurah atau Camat"
                  accept=".pdf,.doc,.docx,image/*"
                  formatLabel="PDF, Word (.doc/.docx), atau Gambar · Maks 5 MB"
                  variant="pdf"
                  disabled={isPersistedLocked}
                  value={values.documents.proposalLurahCamat}
                  onChange={(file) => handleProposalDocChange('proposalLurahCamat', file)}
                  onPreview={onPreviewDocument}
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <ProposalDocumentUploadCard
                  id="upload-proposal-rab"
                  label="Berkas RAB (Rencana Anggaran Biaya)"
                  helperText="Unggah dokumen RAB yang disertakan dalam proposal"
                  accept=".pdf,.xls,.xlsx,.doc,.docx,image/*"
                  formatLabel="PDF, Excel (.xls/.xlsx), Word, atau Gambar · Maks 5 MB"
                  variant="rab"
                  disabled={isPersistedLocked}
                  value={values.documents.rab}
                  onChange={(file) => handleProposalDocChange('rab', file)}
                  onPreview={onPreviewDocument}
                />
              </div>
            </div>
          </section>

          {/* 04. Bukti Cap Pengesahan (Kamera / Foto) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              04. Bukti Cap Pengesahan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Foto langsung atau unggah cap RT, RW, Lurah, dan Camat lengkap dengan waktu unggah.
            </p>

            <div className="mt-4 space-y-5">
              <DocumentUploadCard
                id="upload-cap-rt"
                label="Cap RT"
                helperText="Foto bukti cap & tanda tangan RT"
                variant="photo"
                showUploadTime
                disabled={isPersistedLocked}
                value={values.documents.capRt}
                onChange={(file) => handleProposalDocChange('capRt', file)}
                onPreview={onPreviewDocument}
              />

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-cap-rw"
                  label="Cap RW"
                  helperText="Foto bukti cap & tanda tangan RW"
                  variant="photo"
                  showUploadTime
                  disabled={isPersistedLocked}
                  value={values.documents.capRw}
                  onChange={(file) => handleProposalDocChange('capRw', file)}
                  onPreview={onPreviewDocument}
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-cap-lurah"
                  label="Cap Lurah"
                  helperText="Foto bukti cap & tanda tangan Lurah"
                  variant="photo"
                  showUploadTime
                  disabled={isPersistedLocked}
                  value={values.documents.capLurah}
                  onChange={(file) => handleProposalDocChange('capLurah', file)}
                  onPreview={onPreviewDocument}
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <DocumentUploadCard
                  id="upload-cap-camat"
                  label="Cap Camat"
                  helperText="Foto bukti cap & tanda tangan Camat"
                  variant="photo"
                  showUploadTime
                  disabled={isPersistedLocked}
                  value={values.documents.capCamat}
                  onChange={(file) => handleProposalDocChange('capCamat', file)}
                  onPreview={onPreviewDocument}
                />
              </div>
            </div>
          </section>

          {/* Sticky Bottom Action Bar constrained to Mobile Screen */}
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
                disabled={isPersistedLocked}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap"
              >
                {isPersistedLocked ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Terkunci</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
