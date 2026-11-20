import { Capacitor } from '@capacitor/core';
import { BastExtractedRow, ProposalExtractedRow } from '../utils/troubleshootingReconciler';

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

async function callExtractEndpoint(params: {
  kind: TroubleshootingPdfKind;
  fileName: string;
  base64: string;
}): Promise<RawExtractResponse> {
  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const endpoint = apiBase
    ? `${apiBase}/api/troubleshooting/extract-pdf`
    : '/api/troubleshooting/extract-pdf';

  if (Capacitor.isNativePlatform() && !apiBase) {
    throw new Error(
      'Ekstraksi PDF di aplikasi native membutuhkan URL server aktif (VITE_API_BASE_URL).'
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const json = (isJson ? await response.json().catch(() => ({})) : {}) as RawExtractResponse;

  if (!response.ok || !isJson) {
    throw new Error(
      typeof json.error === 'string' && json.error
        ? json.error
        : `Gagal mengekstrak file PDF (${response.status}).`
    );
  }

  return json;
}

export async function extractProposalPdfData(file: File): Promise<ExtractProposalPdfResult> {
  const base64 = await fileToBase64(file);
  const raw = await callExtractEndpoint({
    kind: 'proposal',
    fileName: file.name,
    base64,
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
  const base64 = await fileToBase64(file);
  const raw = await callExtractEndpoint({
    kind: 'bast',
    fileName: file.name,
    base64,
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
