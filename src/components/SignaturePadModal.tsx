import React, { useEffect, useRef, useState } from 'react';
import { Eraser, LocateFixed, Loader2, PenTool, Save, X } from 'lucide-react';

interface SignaturePadModalProps {
  isOpen: boolean;
  defaultRecipientName: string;
  registerCode: string;
  onClose: () => void;
  onSave: (payload: {
    file: File;
    recipientName: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
  }) => Promise<void>;
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  isOpen,
  defaultRecipientName,
  registerCode,
  onClose,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [hasStroke, setHasStroke] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gpsError, setGpsError] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRecipientName(defaultRecipientName);
    setHasStroke(false);
    setGpsStatus('idle');
    setGpsError('');
    setCoords(null);
    setSubmitting(false);

    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, defaultRecipientName]);

  if (!isOpen) return null;

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getPoint(e);
    lastPointRef.current = pt;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      setHasStroke(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const last = lastPointRef.current;
    if (!canvas || !last) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(e);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
    setHasStroke(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Abaikan jika pointer sudah dilepas
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Perangkat tidak mendukung GPS.');
      return;
    }
    setGpsStatus('loading');
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsStatus('ready');
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(err.message || 'Gagal mengambil koordinat lokasi.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke || submitting) return;
    setSubmitting(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.92)
      );
      if (!blob) throw new Error('Gagal memproses gambar tanda tangan.');
      const cleanCode = (registerCode || 'KPM').replace(/[^a-zA-Z0-9_-]/g, '_');
      const file = new File([blob], `BAST-TTD-${cleanCode}.png`, { type: 'image/png' });
      await onSave({
        file,
        recipientName: recipientName.trim() || defaultRecipientName,
        lat: coords?.lat,
        lng: coords?.lng,
        accuracy: coords?.accuracy,
      });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tanda Terima Digital (BAST)</h3>
              <p className="text-[11px] text-slate-500">Kode: {registerCode || '-'}</p>
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

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Penerima yang Menandatangani
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Nama lengkap penerima bantuan"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Area Tanda Tangan (Sentuh & Gores)
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-slate-100"
              >
                <Eraser className="w-3.5 h-3.5" />
                Ulangi
              </button>
            </div>
            <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={640}
                height={320}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-44 touch-none cursor-crosshair block bg-white"
              />
              {!hasStroke && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-slate-400">
                    Tanda tangan penerima di sini
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Titik GPS Penyerahan (Opsional)</p>
              <p className="text-[11px] text-slate-500 truncate tabular-nums">
                {gpsStatus === 'ready' && coords
                  ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${coords.accuracy ? ` (±${Math.round(coords.accuracy)}m)` : ''}`
                  : gpsStatus === 'error'
                    ? gpsError
                    : 'Sertakan lokasi serah terima barang'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gpsStatus === 'loading'}
              className="shrink-0 h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-teal-700 hover:bg-teal-50 inline-flex items-center gap-1.5"
            >
              {gpsStatus === 'loading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LocateFixed className="w-3.5 h-3.5" />
              )}
              {gpsStatus === 'ready' ? 'Perbarui' : 'Ambil GPS'}
            </button>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!hasStroke || submitting}
              onClick={handleSubmit}
              className="flex-[1.5] h-12 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan BAST...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Simpan Tanda Terima
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
