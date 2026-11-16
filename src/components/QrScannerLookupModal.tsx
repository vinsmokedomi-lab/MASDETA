import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, QrCode, Search, StopCircle, X } from 'lucide-react';
import QRCode from 'qrcode';
import { KpmRecord } from '../types/kpm';

interface QrScannerLookupModalProps {
  isOpen: boolean;
  records: KpmRecord[];
  onClose: () => void;
  onSelectRecord: (record: KpmRecord) => void;
}

export const QrScannerLookupModal: React.FC<QrScannerLookupModalProps> = ({
  isOpen,
  records,
  onClose,
  onSelectRecord,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [query, setQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setQuery('');
      setCameraError('');
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleRawScanText = (rawText: string) => {
    const clean = rawText.trim();
    const prefixMatch = clean.match(/^MASDETA:(?:KPM|BAST):(.+)$/i);
    const token = (prefixMatch ? prefixMatch[1] : clean).trim().toLowerCase();
    const matched = records.find(
      (r) =>
        (r.registerCode || '').toLowerCase() === token ||
        r.id.toLowerCase() === token ||
        r.nikKtp === token
    );
    if (matched) {
      stopCamera();
      onSelectRecord(matched);
      onClose();
    } else {
      setQuery(prefixMatch ? prefixMatch[1] : clean);
      stopCamera();
    }
  };

  const startCameraScanner = async () => {
    setCameraError('');
    const winAny = window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
      };
    };

    if (!winAny.BarcodeDetector) {
      setCameraError(
        'Pemindai kamera QR otomatis tidak didukung di peramban ini. Gunakan pencarian cepat 4 digit NIK atau Kode Register di bawah.'
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Kamera tidak tersedia atau izin ditolak.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      }, 60);

      const detector = new winAny.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          if (videoRef.current.readyState >= 2) {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              handleRawScanText(barcodes[0].rawValue);
              return;
            }
          }
        } catch {
          // Lanjutkan frame berikutnya
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    } catch {
      setCameraError('Tidak dapat mengakses kamera perangkat.');
      stopCamera();
    }
  };

  const matchingRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records.slice(0, 8);
    const digitsOnly = q.replace(/\D/g, '');
    return records
      .filter((r) => {
        if (digitsOnly.length >= 3) {
          if (r.nikKtp.endsWith(digitsOnly) || r.nikKtp.includes(digitsOnly)) return true;
          if (r.nikKk.endsWith(digitsOnly) || r.nikKk.includes(digitsOnly)) return true;
        }
        return (
          r.nama.toLowerCase().includes(q) ||
          (r.registerCode || '').toLowerCase().includes(q) ||
          r.proposal.toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [query, records]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Verifikasi Cepat KPM</h3>
              <p className="text-[11px] text-slate-500">Scan QR atau ketik 4 digit akhir NIK / Kode</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 overflow-y-auto">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {cameraActive ? (
              <div className="space-y-2.5">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-48 object-cover rounded-xl bg-slate-900"
                />
                <button
                  type="button"
                  onClick={stopCamera}
                  className="w-full h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <StopCircle className="w-4 h-4" />
                  Hentikan Kamera
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">Pemindai QR Kartu / PDF</p>
                  <p className="text-[11px] text-slate-500">
                    Arahkan kamera ke kode QR pada dokumen atau kartu KPM
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCameraScanner}
                  className="shrink-0 h-10 px-3.5 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  Buka Kamera
                </button>
              </div>
            )}
            {cameraError && (
              <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {cameraError}
              </p>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pencarian..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600"
              autoFocus
            />
          </div>

          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {matchingRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Tidak ada KPM yang cocok dengan pencarian "{query}".
              </div>
            ) : (
              matchingRecords.map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onSelectRecord(rec);
                    onClose();
                  }}
                  className="w-full px-3.5 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 min-h-[56px]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{rec.nama}</p>
                    <p className="text-[11px] text-slate-500 truncate tabular-nums">
                      {rec.nikKtp ? `NIK ···${rec.nikKtp.slice(-4)}` : 'Tanpa NIK'} · {rec.proposal}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-bold text-teal-700 tabular-nums">
                      {rec.registerCode || '-'}
                    </p>
                    <p className="text-[10px] text-slate-400">{rec.tahun}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface KpmQrCardModalProps {
  isOpen: boolean;
  record: KpmRecord | null;
  onClose: () => void;
}

export const KpmQrCardModal: React.FC<KpmQrCardModalProps> = ({ isOpen, record, onClose }) => {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    if (!isOpen || !record) return;
    QRCode.toDataURL(`MASDETA:KPM:${record.registerCode || record.id}`, {
      width: 360,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setQrUrl(url))
      .catch(() => setQrUrl(''));
  }, [isOpen, record]);

  if (!isOpen || !record) return null;

  const handleDownloadQr = () => {
    if (!qrUrl) return;
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `QR_${(record.registerCode || record.nama).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Kartu QR Verifikasi KPM</h3>
            <p className="text-[11px] text-slate-500">Tunjukkan saat verifikasi atau distribusi</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-3">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR Code ${record.nama}`}
              className="w-52 h-52 rounded-2xl border border-slate-200 p-2 bg-white"
            />
          ) : (
            <div className="w-52 h-52 rounded-2xl bg-slate-100 animate-pulse" />
          )}
          <div>
            <p className="text-base font-bold text-slate-900">{record.nama}</p>
            <p className="text-xs font-semibold text-teal-700 tabular-nums mt-0.5">
              {record.registerCode || record.id}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {record.proposal} · {record.item} · {record.tahun}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadQr}
            disabled={!qrUrl}
            className="w-full h-11 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Unduh Gambar QR (PNG)
          </button>
        </div>
      </div>
    </div>
  );
};
