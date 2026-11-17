import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
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
                Profil Data KPM
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            {/* Bar Aksi Atas */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-600">
                Hasil verifikasi resmi QR Kupon · Data terhubung MASDETA
              </p>
              <button
                type="button"
                disabled={isDownloadingPdf}
                onClick={() => void handleDownloadPdf()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isDownloadingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>
                  {isDownloadingPdf ? 'Menyiapkan PDF...' : 'Download PDF Profil KPM (A4)'}
                </span>
              </button>
            </div>
            {pdfMessage && (
              <div className="border-b border-teal-100 bg-teal-50/70 px-4 py-2 text-center text-[11px] font-medium text-teal-800">
                {pdfMessage}
              </div>
            )}

            {/* Lembar Resmi PROFIL DATA KPM (Selaras dengan Hasil PDF Detail KPM) */}
            <div className="p-4 sm:p-6 space-y-5">
              {/* Header Dokumen */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-teal-700 pb-3.5">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                    PROFIL DATA KPM
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                    Kode Register: {record.registerCode || record.id} &nbsp;·&nbsp; Tahun Anggaran:{' '}
                    {record.tahun || '-'}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p
                    className={`text-xs font-extrabold tracking-wide uppercase ${
                      record.validasi === 'accepted'
                        ? 'text-teal-700'
                        : record.validasi === 'rejected'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                    }`}
                  >
                    STATUS: {formatValidationLabel(record.validasi).toUpperCase()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold tracking-wider text-slate-500">
                    MASDETA
                  </p>
                </div>
              </div>

              {/* Blok Foto + 01. IDENTITAS & DOMISILI */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-4 flex flex-col items-center">
                  {heroPhoto ? (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ file: heroPhoto, title: record.nama })}
                      className="relative aspect-[3/4] w-40 sm:w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-50"
                    >
                      <DriveImage
                        doc={heroPhoto}
                        alt={record.nama}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex aspect-[3/4] w-40 sm:w-full items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-400">
                      <User className="h-10 w-10" />
                    </div>
                  )}
                  <span className="mt-1.5 text-[11px] text-slate-500">Foto Survey / Penerima</span>
                </div>

                <div className="sm:col-span-8 overflow-hidden rounded-lg border border-slate-300">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-teal-700 text-white">
                        <th className="w-[42%] px-3 py-2 text-left font-bold">
                          01. IDENTITAS &amp; DOMISILI
                        </th>
                        <th className="px-3 py-2 text-left font-bold">KETERANGAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[
                        ['Nama Lengkap', (record.nama || '-').toUpperCase()],
                        ['NIK KTP', formatNikDisplay(record.nikKtp)],
                        ['Nomor Kartu Keluarga', formatNikDisplay(record.nikKk)],
                        ['Pekerjaan', record.pekerjaan || '-'],
                        ['No. HP / Kontak', record.kontak || '-'],
                        [
                          'RT / RW',
                          `${record.rt ? record.rt.padStart(3, '0') : '-'} / ${record.rw ? record.rw.padStart(3, '0') : '-'}`,
                        ],
                        ['Kelurahan / Desa', domicile?.kelurahan || '-'],
                        ['Kecamatan', domicile?.kecamatan || '-'],
                      ].map(([label, val]) => (
                        <tr key={label}>
                          <td className="bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 border-r border-slate-200">
                            {label}
                          </td>
                          <td className="px-3 py-1.5 text-slate-900 tabular-nums break-words">
                            {val}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 02. DATA ALAMAT, USULAN & VALIDASI */}
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                      <th className="w-[34%] px-3 py-2 text-left font-bold">
                        02. DATA ALAMAT, USULAN &amp; VALIDASI
                      </th>
                      <th className="px-3 py-2 text-left font-bold">KETERANGAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[
                      ['Alamat Lengkap', record.alamat || '-'],
                      [
                        'Proposal Pengajuan',
                        record.proposal
                          ? `${record.proposal}${record.tahun ? ` (Tahun ${record.tahun})` : ''}`
                          : record.validasi === 'rejected'
                            ? 'Standalone · Arsip Berkas Ditolak'
                            : 'Standalone · Database KPM',
                      ],
                      [
                        'Item Bantuan',
                        record.item
                          ? `${record.item}${itemPkg?.name ? ` — ${itemPkg.name}` : ''}`
                          : '-',
                      ],
                      ['Klasifikasi DTSEN', dtsenLabel],
                      ['Pengelola Lapangan', record.pengelola || '-'],
                      ['Status Validasi Berkas', formatValidationLabel(record.validasi)],
                      [
                        'Administrasi',
                        record.payment > 0
                          ? `Sudah Bayar · ${formatRupiah(record.payment)}`
                          : 'Belum Bayar',
                      ],
                      ['Catatan Petugas', record.catatan || '-'],
                    ].map(([label, val]) => (
                      <tr key={label}>
                        <td className="bg-slate-50 px-3 py-2 font-semibold text-slate-700 border-r border-slate-200">
                          {label}
                        </td>
                        <td className="px-3 py-2 text-slate-900 break-words">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 03. RINCIAN SUB-ITEM BANTUAN */}
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                      <th className="w-10 px-2 py-2 text-center font-bold border-r border-slate-300">
                        NO
                      </th>
                      <th className="px-3 py-2 text-left font-bold border-r border-slate-300">
                        03. RINCIAN SUB-ITEM BANTUAN ({deliveredCount}/{subItemStatuses.length})
                      </th>
                      <th className="w-32 px-2 py-2 text-center font-bold border-r border-slate-300">
                        STATUS PENYALURAN
                      </th>
                      <th className="hidden sm:table-cell w-36 px-2 py-2 text-center font-bold">
                        PEMBARUAN
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {subItemStatuses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-center text-slate-500">
                          Paket item bantuan belum memiliki rincian sub-item.
                        </td>
                      </tr>
                    ) : (
                      subItemStatuses.map((sub, idx) => (
                        <tr key={sub.key}>
                          <td className="px-2 py-2 text-center font-medium text-slate-700 border-r border-slate-200 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-3 py-2 text-slate-900 border-r border-slate-200">
                            {sub.name}
                          </td>
                          <td className="px-2 py-2 text-center border-r border-slate-200">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
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
                          </td>
                          <td className="hidden sm:table-cell px-2 py-2 text-center text-slate-500 tabular-nums">
                            {sub.updatedAt ? formatUploadDateTime(sub.updatedAt) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 04. KELENGKAPAN DOKUMEN */}
              <div className="overflow-hidden rounded-lg border border-slate-300">
                <div className="bg-slate-100 border-b border-slate-300 px-3 py-2">
                  <h3 className="text-xs font-bold text-slate-900">04. KELENGKAPAN DOKUMEN</h3>
                </div>
                <div className="divide-y divide-slate-200 text-xs">
                  {documentRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3 px-3 py-2"
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
              </div>
            </div>
          </div>
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
