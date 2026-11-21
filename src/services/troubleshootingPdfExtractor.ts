import { Capacitor } from '@capacitor/core';
import { BastExtractedRow, ProposalExtractedRow } from '../utils/troubleshootingReconciler';
import {
  parseBastPdfLocally,
  parseProposalPdfLocally,
} from '../utils/troubleshootingPdfLocalParser';

export type TroubleshootingPdfKind = 'proposal' | 'bast';

export interface ExtractProposalPdfResult {
  documentTitle: string;
  rows: ProposalExtractedRow[];
  summaryPengelola: { name: string; count: number }[];
}

export interface ExtractBastPdfResult {
  documentTitle: string;
  rows: BastExtractedRow[];
}

interface RawExtractResponse {
  documentTitle?: unknown;
  rows?: unknown;
  summaryPengelola?: unknown;
  error?: unknown;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Gagal membaca file "${file.name}".`));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      if (!base64) {
        reject(new Error(`Isi file "${file.name}" kosong atau tidak dapat dibaca.`));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

async function callServerExtractFallback(params: {
  kind: TroubleshootingPdfKind;
  fileName: string;
  base64: string;
  hadTextLayer: boolean;
}): Promise<RawExtractResponse> {
  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const endpoint = apiBase
    ? `${apiBase}/api/troubleshooting/extract-pdf`
    : '/api/troubleshooting/extract-pdf';

  if (Capacitor.isNativePlatform() && !apiBase) {
    throw new Error(
      params.hadTextLayer
        ? `Format tabel pada "${params.fileName}" tidak dapat dikenali secara lokal. Pastikan file adalah PDF ${params.kind === 'bast' ? 'BAST Dinas' : 'Daftar KPM Proposal'} asli.`
        : `File "${params.fileName}" tampaknya berupa hasil scan gambar tanpa teks. Ekstraksi OCR membutuhkan server aktif (VITE_API_BASE_URL) atau gunakan PDF digital asli.`
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: params.kind,
        fileName: params.fileName,
        base64: params.base64,
      }),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const json = (isJson ? await response.json().catch(() => ({})) : {}) as RawExtractResponse;

    if (!response.ok || !isJson) {
      if (response.status === 404 || response.status === 405 || !isJson) {
        throw new Error(
          params.hadTextLayer
            ? `Format tabel pada "${params.fileName}" tidak dikenali secara lokal. Pastikan dokumen sesuai format PDF ${params.kind === 'bast' ? 'BAST Dinas' : 'Daftar KPM Proposal'}.`
            : `File "${params.fileName}" tidak memiliki lapisan teks (hasil scan gambar), sedangkan layanan OCR server tidak tersedia pada hosting statis ini. Gunakan PDF digital asli.`
        );
      }
      throw new Error(
        typeof json.error === 'string' && json.error
          ? json.error
          : `Gagal mengekstrak file PDF (${response.status}).`
      );
    }

    return json;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Waktu ekstraksi server untuk "${params.fileName}" habis (timeout). Gunakan PDF digital asli agar dapat dibaca instan secara lokal.`
      );
    }
    if (
      err instanceof TypeError ||
      (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message))
    ) {
      throw new Error(
        params.hadTextLayer
          ? `Format tabel pada "${params.fileName}" tidak dikenali secara lokal dan server ekstraksi tidak dapat dijangkau. Periksa apakah file PDF yang diunggah sudah benar.`
          : `File "${params.fileName}" berupa PDF scan gambar tanpa teks dan server OCR tidak dapat dijangkau. Gunakan file PDF digital asli (berisi teks).`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function extractProposalPdfData(file: File): Promise<ExtractProposalPdfResult> {
  // 1. Coba ekstraksi lokal instan di browser menggunakan pdfjs-dist (tanpa ketergantungan jaringan)
  let hadTextLayer = false;
  try {
    const buffer = await file.arrayBuffer();
    const localResult = await parseProposalPdfLocally(new Uint8Array(buffer), file.name);
    hadTextLayer = localResult.totalTextItems > 0;
    if (localResult.rows.length > 0) {
      return {
        documentTitle: localResult.documentTitle,
        rows: localResult.rows,
        summaryPengelola: localResult.summaryPengelola,
      };
    }
  } catch (localErr) {
    console.warn('[Troubleshooting] Local Proposal PDF parse fallback to server:', localErr);
  }

  // 2. Fallback ke server OCR hanya jika PDF berupa scan gambar / format tak standar
  const base64 = await fileToBase64(file);
  const raw = await callServerExtractFallback({
    kind: 'proposal',
    fileName: file.name,
    base64,
    hadTextLayer,
  });

  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rows: ProposalExtractedRow[] = rawRows
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const nama = String(obj.nama || '').trim().toUpperCase();
      const itemCode = String(obj.item || '').trim().toUpperCase();
      if (!nama || !itemCode) return null;
      return {
        no: String(obj.no || '').trim(),
        item: itemCode,
        nama,
        alamat: String(obj.alamat || '').trim(),
        rtRw: String(obj.rtRw || '').trim(),
        kelurahan: String(obj.kelurahan || '').trim(),
        pengelola: String(obj.pengelola || '').trim(),
      };
    })
    .filter((r): r is ProposalExtractedRow => Boolean(r));

  if (rows.length === 0) {
    throw new Error(
      `Tidak ditemukan baris data KPM pada file Proposal "${file.name}". Pastikan file adalah PDF Daftar KPM Proposal.`
    );
  }

  const summaryPengelola = Array.isArray(raw.summaryPengelola)
    ? raw.summaryPengelola
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as Record<string, unknown>;
          const name = String(obj.name || '').trim();
          const count = Number(obj.count || 0);
          return name && Number.isFinite(count) && count > 0 ? { name, count } : null;
        })
        .filter((x): x is { name: string; count: number } => Boolean(x))
    : [];

  return {
    documentTitle: String(raw.documentTitle || '').trim() || file.name.replace(/\.pdf$/i, ''),
    rows,
    summaryPengelola,
  };
}

export async function extractBastPdfData(file: File): Promise<ExtractBastPdfResult> {
  // 1. Coba ekstraksi lokal instan di browser menggunakan pdfjs-dist (tanpa ketergantungan jaringan)
  let hadTextLayer = false;
  try {
    const buffer = await file.arrayBuffer();
    const localResult = await parseBastPdfLocally(new Uint8Array(buffer), file.name);
    hadTextLayer = localResult.totalTextItems > 0;
    if (localResult.rows.length > 0) {
      return {
        documentTitle: localResult.documentTitle,
        rows: localResult.rows,
      };
    }
  } catch (localErr) {
    console.warn('[Troubleshooting] Local BAST PDF parse fallback to server:', localErr);
  }

  // 2. Fallback ke server OCR hanya jika PDF berupa scan gambar / format tak standar
  const base64 = await fileToBase64(file);
  const raw = await callServerExtractFallback({
    kind: 'bast',
    fileName: file.name,
    base64,
    hadTextLayer,
  });

  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rows: BastExtractedRow[] = rawRows
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const no = Number(obj.no);
      const nama = String(obj.nama || '').trim().toUpperCase();
      const barangList = Array.isArray(obj.barangList)
        ? obj.barangList.map((b) => String(b || '').trim()).filter(Boolean)
        : [];
      if (!Number.isFinite(no) || no <= 0 || !nama) return null;
      return {
        no,
        nama,
        nik: String(obj.nik || '').replace(/\s+/g, '').trim(),
        alamat: String(obj.alamat || '').replace(/\s+/g, ' ').trim(),
        barangList,
      };
    })
    .filter((r): r is BastExtractedRow => Boolean(r))
    .sort((a, b) => a.no - b.no);

  if (rows.length === 0) {
    throw new Error(
      `Tidak ditemukan baris data BAST pada file "${file.name}". Pastikan file adalah PDF BAST Dinas.`
    );
  }

  return {
    documentTitle: String(raw.documentTitle || '').trim() || file.name.replace(/\.pdf$/i, ''),
    rows,
  };
}
