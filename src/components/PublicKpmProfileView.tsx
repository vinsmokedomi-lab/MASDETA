import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  MapPin,
  Package,
  ShieldCheck,
  User,
} from 'lucide-react';
import { DriveImage } from './DriveImage';
import { DTSEN_OPTION_ITEMS } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalRecord,
  WilayahKabKota,
} from '../types/kpm';
import {
  formatNikDisplay,
  formatRupiah,
  formatUploadDateTime,
  formatValidationLabel,
  getKpmSubItemStatusList,
  getPrimaryKpmPhoto,
  resolveKpmDomicile,
  resolvePackageForKpm,
} from '../utils/imageProcessor';
import { exportSingleKpmToPdf } from '../utils/pdfExporter';
import { fetchPublicKpmContextFromSupabase } from '../services/supabaseData';

interface PublicKpmProfileViewProps {
  kpmToken: string;
  inMemoryRecords?: KpmRecord[];
  inMemoryProposals?: ProposalRecord[];
  inMemoryItems?: ItemBantuan[];
  inMemoryWilayah?: WilayahKabKota[];
  onOpenMainApp: () => void;
}

export function PublicKpmProfileView({
  kpmToken,
  inMemoryRecords = [],
  inMemoryProposals = [],
  inMemoryItems = [],
  inMemoryWilayah = [],
  onOpenMainApp,
}: PublicKpmProfileViewProps) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [record, setRecord] = useState<KpmRecord | null>(null);
  const [proposals, setProposals] = useState<ProposalRecord[]>(inMemoryProposals);
  const [items, setItems] = useState<ItemBantuan[]>(inMemoryItems);
  const [wilayahList, setWilayahList] = useState<WilayahKabKota[]>(inMemoryWilayah);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ file: KpmDocumentFile; title: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const clean = kpmToken.trim();
    if (!clean) {
      setErrorMsg('Tautan QR KPM tidak valid.');
      setLoading(false);
      return;
    }

    const tokenLower = clean.toLowerCase();
    const localMatch = inMemoryRecords.find(
      (r) =>
        r.id.toLowerCase() === tokenLower ||
        (r.registerCode || '').toLowerCase() === tokenLower ||
        r.nikKtp === tokenLower
    );

    if (localMatch) {
      setRecord(localMatch);
      setProposals(inMemoryProposals);
      setItems(inMemoryItems);
      setWilayahList(inMemoryWilayah);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const resolvePublicData = async () => {
      try {
        const supa = await fetchPublicKpmContextFromSupabase(clean);
        if (!cancelled && supa) {
          setRecord(supa.record);
          setProposals(supa.proposals);
          setItems(supa.items);
          setWilayahList(supa.wilayahList);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to REST API
      }

      try {
        const resp = await fetch(`/api/public/kpm/${encodeURIComponent(clean)}`);
        if (resp.ok) {
          const json = (await resp.json()) as {
            record?: KpmRecord;
            proposals?: ProposalRecord[];
            items?: ItemBantuan[];
            wilayahList?: WilayahKabKota[];
          };
          if (!cancelled && json.record) {
            setRecord(json.record);
            setProposals(Array.isArray(json.proposals) ? json.proposals : []);
            setItems(Array.isArray(json.items) ? json.items : []);
            setWilayahList(Array.isArray(json.wilayahList) ? json.wilayahList : []);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Ignore network error
      }

      if (!cancelled) {
        setErrorMsg(
          'Data profil KPM tidak ditemukan atau belum tersinkron ke server. Pastikan tautan QR valid.'
        );
        setLoading(false);
      }
    };

    void resolvePublicData();
    return () => {
      cancelled = true;
    };
  }, [kpmToken, inMemoryRecords, inMemoryProposals, inMemoryItems, inMemoryWilayah]);

  const domicile = useMemo(
    () => (record ? resolveKpmDomicile(record, proposals, wilayahList) : null),
    [record, proposals, wilayahList]
  );

  const itemPkg = useMemo(
    () => (record ? resolvePackageForKpm(items, record.tahun, record.item) : undefined),
    [record, items]
  );

  const subItemStatuses = useMemo(
    () => (record ? getKpmSubItemStatusList(record, items) : []),
    [record, items]
  );

  const deliveredCount = useMemo(
    () => subItemStatuses.filter((s) => s.delivered).length,
    [subItemStatuses]
  );

  const heroPhoto = useMemo(
    () => (record ? getPrimaryKpmPhoto(record.documents) : undefined),
    [record]
  );

  const dtsenLabel = useMemo(() => {
    if (!record) return '-';
    const found = DTSEN_OPTION_ITEMS.find((d) => d.value === record.dtsen);
    return found ? `${found.value} · ${found.label}` : record.dtsen || '-';
  }, [record]);

  const documentRows = useMemo(() => {
    if (!record) return [];
    const list: { label: string; doc?: KpmDocumentFile }[] = [
      { label: 'Foto KTP', doc: record.documents.ktp },
      { label: 'Foto KK', doc: record.documents.kk },
      { label: 'Foto Penerima Manfaat', doc: record.documents.penerima },
      { label: 'Foto Survey / Pendukung', doc: record.documents.survey },
      ...(record.documents.rumah || []).map((doc, idx) => ({
        label: `Foto Kondisi Rumah ${idx + 1}`,
        doc,
      })),
      ...(record.documents.lainnya || []).map((doc, idx) => ({
        label: `Dokumen Tambahan ${idx + 1}`,
        doc,
      })),
    ];
    return list;
  }, [record]);

  const handleDownloadPdf = async () => {
    if (!record || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfMessage(null);
    try {
      const res = await exportSingleKpmToPdf({
        record,
        proposals,
        items,
        wilayahList,
      });
      setPdfMessage(`PDF "${res.savedFileName}" berhasil dibuat.`);
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : 'Gagal membuat file PDF profil.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <div className="mx-auto max-w-2xl px-4 pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                Verifikasi QR Kupon MASDETA
              </p>
              <h1 className="truncate text-sm font-bold text-slate-900">
                Profil Data Calon KPM
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenMainApp}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <span>Buka Aplikasi</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-xs">
            <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
            <p className="text-xs font-medium text-slate-600">
              Memuat profil lengkap penerima bantuan...
            </p>
          </div>
        )}

        {!loading && errorMsg && (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xs space-y-3">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
            <p className="text-sm font-bold text-slate-900">Data Tidak Ditemukan</p>
            <p className="text-xs leading-relaxed text-slate-600">{errorMsg}</p>
            <button
              type="button"
              onClick={onOpenMainApp}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <span>Masuk ke MASDETA</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!loading && record && (
          <>
            {/* Hero Identity */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <span className="text-xs font-bold text-teal-800 tabular-nums">
                  {record.registerCode || record.id} · Tahun {record.tahun || 'Tanpa Tahun'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    record.validasi === 'accepted'
                      ? 'text-teal-700'
                      : record.validasi === 'rejected'
                        ? 'text-rose-700'
                        : 'text-amber-700'
                  }`}
                >
                  {formatValidationLabel(record.validasi)}
                </span>
              </div>

              <div className="p-4 flex items-start gap-3.5">
                {heroPhoto ? (
                  <button
                    type="button"
                    onClick={() => setPreviewDoc({ file: heroPhoto, title: record.nama })}
                    className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                  >
                    <DriveImage
                      doc={heroPhoto}
                      alt={record.nama}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                    <User className="h-8 w-8" />
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-base font-bold text-slate-900 leading-snug">{record.nama}</h2>
                  <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {record.item
                        ? `${record.item}${itemPkg?.name ? ` - ${itemPkg.name}` : ''}`
                        : '-'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 flex items-start gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-500" />
                    <span>
                      {record.proposal
                        ? record.proposal
                        : record.validasi === 'rejected'
                          ? 'Standalone · Arsip Berkas Ditolak'
                          : 'Standalone · Database KPM'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-500" />
                    <span>
                      {[domicile?.kelurahan, domicile?.kecamatan, domicile?.kabKota]
                        .filter(Boolean)
                        .join(', ') || '-'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/70 space-y-2">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={() => void handleDownloadPdf()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>
                    {isDownloadingPdf ? 'Menyiapkan PDF...' : 'Download PDF Profil KPM (F4)'}
                  </span>
                </button>
                {pdfMessage && (
                  <p className="text-center text-[11px] font-medium text-teal-800">{pdfMessage}</p>
                )}
              </div>
            </section>

            {/* 01 Identitas & Domisili */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  01 · Identitas &amp; Domisili
                </h3>
              </div>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Nama Lengkap</dt>
                  <dd className="text-right font-semibold text-slate-900">{record.nama || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">NIK KTP</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">
                    {formatNikDisplay(record.nikKtp)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Nomor KK</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">
                    {formatNikDisplay(record.nikKk)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Pekerjaan</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.pekerjaan || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">No. HP / WhatsApp</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">
                    {record.kontak || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Alamat Lengkap</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.alamat || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">RT / RW</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">
                    RT {record.rt || '-'} / RW {record.rw || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Kelurahan / Desa</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {domicile?.kelurahan || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Kecamatan</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {domicile?.kecamatan || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Kabupaten / Kota</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {domicile?.kabKota || '-'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* 02 Data Pengajuan & Bantuan */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  02 · Data Pengajuan &amp; Bantuan
                </h3>
              </div>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Tahun</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.tahun || 'Tanpa Tahun'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Proposal / Sumber</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.proposal ||
                      (record.validasi === 'rejected'
                        ? 'Standalone · Arsip Berkas Ditolak'
                        : 'Standalone · Database KPM')}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Item Bantuan</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {record.item
                      ? `${record.item}${itemPkg?.name ? ` - ${itemPkg.name}` : ''}`
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Kategori DTSEN</dt>
                  <dd className="text-right font-medium text-slate-900">{dtsenLabel}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Pengelola</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.pengelola || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Status Validasi</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {formatValidationLabel(record.validasi)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Administrasi</dt>
                  <dd className="text-right font-medium text-slate-900 tabular-nums">
                    {record.payment > 0
                      ? `Sudah Bayar · ${formatRupiah(record.payment)}`
                      : 'Belum Bayar'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-slate-500 shrink-0">Catatan Petugas</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {record.catatan || '-'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* 03 Rincian Sub-Item Bantuan */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  03 · Rincian Sub-Item Bantuan
                </h3>
                <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                  {deliveredCount}/{subItemStatuses.length} Diterima
                </span>
              </div>
              {subItemStatuses.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">
                  Paket item bantuan belum memiliki rincian sub-item.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {subItemStatuses.map((sub, idx) => (
                    <div
                      key={sub.key}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {idx + 1}. {sub.name}
                        </p>
                        {sub.updatedAt && (
                          <p className="text-[11px] text-slate-500">
                            Diperbarui {formatUploadDateTime(sub.updatedAt)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 font-semibold ${
                          sub.delivered ? 'text-teal-700' : 'text-amber-700'
                        }`}
                      >
                        {sub.delivered ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Sudah Diterima</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            <span>Belum Diterima</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 04 Kelengkapan Dokumen */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  04 · Kelengkapan Dokumen
                </h3>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {documentRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="font-medium text-slate-800">{row.label}</span>
                    {row.doc ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ file: row.doc!, title: row.label })}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Tersimpan · Lihat Foto
                      </button>
                    ) : (
                      <span className="text-slate-400">Belum diunggah</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="truncate text-xs font-bold text-slate-900">{previewDoc.title}</p>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
            <div className="flex max-h-[75vh] items-center justify-center bg-slate-900 p-2">
              <DriveImage
                doc={previewDoc.file}
                alt={previewDoc.title}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
