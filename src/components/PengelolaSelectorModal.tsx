import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { KECAMATAN_OPTIONS, PENGELOLA_TITLE_OPTIONS } from '../data/kpmOptions';
import { KpmDocumentFile, PengelolaProfile } from '../types/kpm';
import {
  blockNonNumericKeyDown,
  capitalizeWords,
  sanitizeDigits,
} from '../utils/imageProcessor';
import { DocumentUploadCard } from './DocumentUploadCard';

interface PengelolaSelectorModalProps {
  isOpen: boolean;
  pengelolaList: PengelolaProfile[];
  selectedName: string;
  onClose: () => void;
  onSelect: (displayName: string) => void;
  onCreatePengelola: (profile: PengelolaProfile) => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
}

export function PengelolaSelectorModal({
  isOpen,
  pengelolaList,
  selectedName,
  onClose,
  onSelect,
  onCreatePengelola,
  onPreviewDocument,
}: PengelolaSelectorModalProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState('');

  // New Pengelola form state
  const [title, setTitle] = useState('');
  const [nama, setNama] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [alamat, setAlamat] = useState('');
  const [kontak, setKontak] = useState('');
  const [foto, setFoto] = useState<KpmDocumentFile | undefined>(undefined);
  const [namaError, setNamaError] = useState<string | null>(null);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pengelolaList;
    return pengelolaList.filter(
      (item) =>
        item.displayName.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        item.kecamatan.toLowerCase().includes(q)
    );
  }, [pengelolaList, searchQuery]);

  if (!isOpen) return null;

  const resetCreateForm = () => {
    setTitle('');
    setNama('');
    setKecamatan('');
    setAlamat('');
    setKontak('');
    setFoto(undefined);
    setNamaError(null);
  };

  const handleClose = () => {
    setMode('select');
    setSearchQuery('');
    resetCreateForm();
    onClose();
  };

  const handleSaveNewPengelola = () => {
    const trimmedNama = capitalizeWords(nama.trim());
    if (!trimmedNama) {
      setNamaError('Nama pengelola wajib diisi.');
      return;
    }

    const displayName = title ? `${title} ${trimmedNama}` : trimmedNama;
    const newProfile: PengelolaProfile = {
      id: `peng-${Date.now()}`,
      title,
      nama: trimmedNama,
      displayName,
      kecamatan,
      alamat: capitalizeWords(alamat.trim()),
      kontak: kontak.trim(),
      foto,
      createdAt: new Date().toISOString(),
    };

    onCreatePengelola(newProfile);
    onSelect(displayName);
    resetCreateForm();
    setMode('select');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'select' ? 'Pilih Pengelola' : 'Tambah Pengelola Baru'}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'create' && (
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setNamaError(null);
                }}
                className="inline-flex min-h-[44px] min-w-[44px] -ml-2 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 shrink-0"
                aria-label="Kembali ke daftar pengelola"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">
              {mode === 'select' ? 'Pilih Pengelola' : 'Tambah Pengelola Baru'}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === 'select' ? (
          <>
            {/* Search & Add New Trigger */}
            <div className="space-y-2.5 border-b border-slate-100 px-5 py-3.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama pengelola atau kecamatan..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
              </div>

              <button
                type="button"
                onClick={() => setMode('create')}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100/70 active:scale-[0.99]"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Tambah Pengelola Baru (New)</span>
              </button>
            </div>

            {/* Pengelola List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    {searchQuery.trim()
                      ? `Pengelola "${searchQuery}" tidak ditemukan`
                      : 'Belum ada data pengelola tersimpan'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNama(capitalizeWords(searchQuery.trim()));
                      setMode('create');
                    }}
                    className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {searchQuery.trim()
                        ? `Buat "${capitalizeWords(searchQuery.trim())}" sebagai Pengelola Baru`
                        : 'Tambah Pengelola Pertama'}
                    </span>
                  </button>
                </div>
              ) : (
                filteredList.map((item) => {
                  const isSelected = selectedName === item.displayName;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item.displayName);
                        handleClose();
                      }}
                      className={`flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
                        isSelected ? 'bg-teal-50/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                          {item.foto ? (
                            <img
                              src={item.foto.dataUrl}
                              alt={item.displayName}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.displayName}
                          </p>
                          {(item.kecamatan || item.kontak) && (
                            <p className="truncate text-xs text-slate-500">
                              {[
                                item.kecamatan ? `Kec. ${item.kecamatan}` : '',
                                item.kontak,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-3 text-right">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
          </>
        ) : (
          /* Mode 2: Create New Pengelola */
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="pengelola-title" className="block text-xs font-semibold text-slate-700">
                    Title
                  </label>
                  <select
                    id="pengelola-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  >
                    <option value="">-- Tanpa Title --</option>
                    {PENGELOLA_TITLE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="pengelola-nama" className="block text-xs font-semibold text-slate-700">
                    Nama Pengelola <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="pengelola-nama"
                    type="text"
                    autoCapitalize="words"
                    placeholder="Contoh: Abdul Rahman"
                    value={nama}
                    onChange={(e) => {
                      setNama(capitalizeWords(e.target.value));
                      if (namaError) setNamaError(null);
                    }}
                    className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                      namaError ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Huruf awal setiap kata otomatis kapital.
                  </p>
                  {namaError && <p className="mt-1 text-xs text-rose-600">{namaError}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="pengelola-kecamatan" className="block text-xs font-semibold text-slate-700">
                  Kecamatan
                </label>
                <select
                  id="pengelola-kecamatan"
                  value={kecamatan}
                  onChange={(e) => setKecamatan(e.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                >
                  <option value="">-- Pilih Kecamatan --</option>
                  {KECAMATAN_OPTIONS.map((kec) => (
                    <option key={kec} value={kec}>
                      {kec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pengelola-alamat" className="block text-xs font-semibold text-slate-700">
                  Alamat
                </label>
                <input
                  id="pengelola-alamat"
                  type="text"
                  autoCapitalize="words"
                  placeholder="Contoh: Jl. Sepakat II No. 10"
                  value={alamat}
                  onChange={(e) => setAlamat(capitalizeWords(e.target.value))}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Huruf awal setiap kata otomatis kapital.
                </p>
              </div>

              <div>
                <label htmlFor="pengelola-kontak" className="block text-xs font-semibold text-slate-700">
                  Nomor Kontak (Hanya Angka)
                </label>
                <input
                  id="pengelola-kontak"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  placeholder="08xxxxxxxxxx"
                  value={kontak}
                  onKeyDown={blockNonNumericKeyDown}
                  onChange={(e) => setKontak(sanitizeDigits(e.target.value, 15))}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:font-sans placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
              </div>

              <DocumentUploadCard
                id="upload-foto-pengelola"
                label="Foto Pengelola"
                helperText="Ambil foto atau unggah profil pengelola"
                variant="penerima"
                value={foto}
                onChange={setFoto}
                onPreview={onPreviewDocument}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5">
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  resetCreateForm();
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNewPengelola}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Simpan Pengelola
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
