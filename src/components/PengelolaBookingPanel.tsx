import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  PengelolaBookingItem,
  PengelolaBookingPriority,
  PengelolaBookingStatus,
  PengelolaProfile,
  ProposalRecord,
  WilayahKabKota,
} from '../types/kpm';
import { FilterSelect } from './FormControls';
import {
  exportPengelolaBookingsToPdf,
  exportPengelolaBookingsToXlsx,
} from '../utils/bookingExporter';

interface PengelolaBookingPrefill {
  pengelolaId?: string;
  pengelolaName: string;
  kontak?: string;
  kecamatan?: string;
  kelurahan?: string;
  alamatCatatan?: string;
}

interface PengelolaBookingPanelProps {
  bookings: PengelolaBookingItem[];
  pengelolaList: PengelolaProfile[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  currentUserName: string;
  canAdd?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  isOffline?: boolean;
  initialPrefill?: PengelolaBookingPrefill | null;
  onConsumePrefill?: () => void;
  onSaveBookings: (next: PengelolaBookingItem[]) => void;
}

const STATUS_META: Record<
  PengelolaBookingStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  booked: {
    label: 'Dibooking',
    dotClass: 'bg-teal-600',
    textClass: 'text-teal-800',
  },
  assigned: {
    label: 'Masuk Proposal',
    dotClass: 'bg-emerald-600',
    textClass: 'text-emerald-700',
  },
  cancelled: {
    label: 'Batal',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-500',
  },
};

function formatWhatsAppLink(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : `62${digits}`;
  return `https://wa.me/${normalized}`;
}

function getDefaultNextYear(): string {
  const nowYear = new Date().getFullYear();
  return String(nowYear + 1);
}

export function PengelolaBookingPanel({
  bookings,
  pengelolaList,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  currentUserName,
  canAdd = true,
  canUpdate = true,
  canDelete = true,
  isOffline = false,
  initialPrefill = null,
  onConsumePrefill,
  onSaveBookings,
}: PengelolaBookingPanelProps) {
  const defaultNextYear = useMemo(() => getDefaultNextYear(), []);

  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PengelolaBookingStatus>('all');
  const [groupByProposal, setGroupByProposal] = useState<boolean>(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'xlsx' | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Form state
  const [formPengelolaId, setFormPengelolaId] = useState<string>('');
  const [formPengelolaName, setFormPengelolaName] = useState('');
  const [formKontak, setFormKontak] = useState('');
  const [formKecamatan, setFormKecamatan] = useState('');
  const [formKelurahan, setFormKelurahan] = useState('');
  const [formAlamatCatatan, setFormAlamatCatatan] = useState('');
  const [formTargetTahun, setFormTargetTahun] = useState(defaultNextYear);
  const [formTargetProposal, setFormTargetProposal] = useState('');
  const [formEstimasiKpm, setFormEstimasiKpm] = useState<string>('5');
  const [formRencanaItem, setFormRencanaItem] = useState('');
  const [formPriority, setFormPriority] = useState<PengelolaBookingPriority>('normal');
  const [formStatus, setFormStatus] = useState<PengelolaBookingStatus>('booked');
  const [formCatatan, setFormCatatan] = useState('');

  // Buka modal otomatis ketika dipicu tombol "Booking" dari baris Pengelola
  useEffect(() => {
    if (!initialPrefill) return;
    setEditingId(null);
    setFormPengelolaId(initialPrefill.pengelolaId || '');
    setFormPengelolaName(initialPrefill.pengelolaName || '');
    setFormKontak(initialPrefill.kontak || '');
    setFormKecamatan(initialPrefill.kecamatan || '');
    setFormKelurahan(initialPrefill.kelurahan || '');
    setFormAlamatCatatan(initialPrefill.alamatCatatan || '');
    setFormTargetTahun(defaultNextYear);
    setFormTargetProposal(
      initialPrefill.kecamatan
        ? `Proposal ${initialPrefill.kecamatan} ${defaultNextYear}`
        : ''
    );
    setFormEstimasiKpm('5');
    setFormRencanaItem('');
    setFormPriority('normal');
    setFormStatus('booked');
    setFormCatatan('');
    setIsModalOpen(true);
    onConsumePrefill?.();
  }, [initialPrefill, defaultNextYear, onConsumePrefill]);

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    const set = new Set<string>([String(nowY), String(nowY + 1), String(nowY + 2)]);
    bookings.forEach((b) => {
      if (b.targetTahun?.trim()) set.add(b.targetTahun.trim());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [bookings]);

  const kecamatanOptions = useMemo(() => {
    const set = new Set<string>();
    wilayahList.forEach((w) => w.kecamatanList.forEach((k) => set.add(k.nama)));
    bookings.forEach((b) => {
      if (b.kecamatan?.trim()) set.add(b.kecamatan.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [wilayahList, bookings]);

  const kelurahanOptionsForForm = useMemo(() => {
    const set = new Set<string>();
    wilayahList.forEach((w) =>
      w.kecamatanList.forEach((k) => {
        if (!formKecamatan || k.nama.toLowerCase() === formKecamatan.toLowerCase()) {
          k.kelurahanList.forEach((kel) => set.add(kel));
        }
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [wilayahList, formKecamatan]);

  const proposalSuggestionList = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => {
      if (b.targetProposal?.trim()) set.add(b.targetProposal.trim());
    });
    proposals.forEach((p) => {
      if (p.namaProposal?.trim()) set.add(p.namaProposal.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [bookings, proposals]);

  const filteredBookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (yearFilter !== 'all' && b.targetTahun !== yearFilter) return false;
        if (statusFilter !== 'all' && b.status !== statusFilter) return false;
        if (!q) return true;
        return (
          b.pengelolaName.toLowerCase().includes(q) ||
          (b.targetProposal || '').toLowerCase().includes(q) ||
          (b.kecamatan || '').toLowerCase().includes(q) ||
          (b.kelurahan || '').toLowerCase().includes(q) ||
          (b.alamatCatatan || '').toLowerCase().includes(q) ||
          (b.rencanaItem || '').toLowerCase().includes(q) ||
          (b.catatan || '').toLowerCase().includes(q) ||
          (b.kontak || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const statusRank = (s: PengelolaBookingStatus) =>
          s === 'booked' ? 0 : s === 'assigned' ? 1 : 2;
        const sr = statusRank(a.status) - statusRank(b.status);
        if (sr !== 0) return sr;
        if (a.priority !== b.priority) return a.priority === 'prioritas' ? -1 : 1;
        const yr = (a.targetTahun || '').localeCompare(b.targetTahun || '');
        if (yr !== 0) return yr;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [bookings, yearFilter, statusFilter, query]);

  const summaryStats = useMemo(() => {
    const active = filteredBookings.filter((b) => b.status === 'booked');
    const assigned = filteredBookings.filter((b) => b.status === 'assigned');
    const totalEstKpm = filteredBookings
      .filter((b) => b.status !== 'cancelled')
      .reduce((acc, b) => acc + Math.max(0, Number(b.estimasiKpm) || 0), 0);
    const proposalGroups = new Set(
      filteredBookings
        .filter((b) => b.status !== 'cancelled')
        .map((b) => (b.targetProposal || 'Belum Ditentukan').trim())
    );
    const priorityCount = active.filter((b) => b.priority === 'prioritas').length;
    return {
      activeCount: active.length,
      assignedCount: assigned.length,
      totalEstKpm,
      proposalGroupCount: proposalGroups.size,
      priorityCount,
    };
  }, [filteredBookings]);

  const groupedByTargetProposal = useMemo(() => {
    const map = new Map<string, PengelolaBookingItem[]>();
    filteredBookings.forEach((b) => {
      const key = `${b.targetTahun || '-'}::${(b.targetProposal || 'Rencana Proposal Belum Ditentukan').trim()}`;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([key, list]) => {
      const [tahun, proposalLabel] = key.split('::');
      const estKpm = list
        .filter((item) => item.status !== 'cancelled')
        .reduce((sum, item) => sum + Math.max(0, Number(item.estimasiKpm) || 0), 0);
      return { key, tahun, proposalLabel, list, estKpm };
    });
  }, [filteredBookings]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormPengelolaId('');
    setFormPengelolaName('');
    setFormKontak('');
    setFormKecamatan('');
    setFormKelurahan('');
    setFormAlamatCatatan('');
    setFormTargetTahun(yearFilter !== 'all' ? yearFilter : defaultNextYear);
    setFormTargetProposal('');
    setFormEstimasiKpm('5');
    setFormRencanaItem('');
    setFormPriority('normal');
    setFormStatus('booked');
    setFormCatatan('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: PengelolaBookingItem) => {
    setEditingId(item.id);
    setFormPengelolaId(item.pengelolaId || '');
    setFormPengelolaName(item.pengelolaName);
    setFormKontak(item.kontak || '');
    setFormKecamatan(item.kecamatan || '');
    setFormKelurahan(item.kelurahan || '');
    setFormAlamatCatatan(item.alamatCatatan || '');
    setFormTargetTahun(item.targetTahun || defaultNextYear);
    setFormTargetProposal(item.targetProposal || '');
    setFormEstimasiKpm(String(item.estimasiKpm || 0));
    setFormRencanaItem(item.rencanaItem || '');
    setFormPriority(item.priority || 'normal');
    setFormStatus(item.status || 'booked');
    setFormCatatan(item.catatan || '');
    setIsModalOpen(true);
  };

  const handleSelectExistingPengelola = (pengelolaId: string) => {
    setFormPengelolaId(pengelolaId);
    const found = pengelolaList.find((p) => p.id === pengelolaId);
    if (!found) return;
    setFormPengelolaName(found.displayName);
    if (found.kontak) setFormKontak(found.kontak);
    if (found.kecamatan) setFormKecamatan(found.kecamatan);
    if (found.kelurahan) setFormKelurahan(found.kelurahan);
    if (found.alamat) setFormAlamatCatatan(found.alamat);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formPengelolaName.trim();
    if (!trimmedName) return;

    const nowIso = new Date().toISOString();
    const estNumber = Math.max(0, Math.round(Number(formEstimasiKpm) || 0));

    if (editingId) {
      const next = bookings.map((b) =>
        b.id === editingId
          ? {
              ...b,
              pengelolaId: formPengelolaId || undefined,
              pengelolaName: trimmedName,
              kontak: formKontak.trim() || undefined,
              kecamatan: formKecamatan.trim() || undefined,
              kelurahan: formKelurahan.trim() || undefined,
              alamatCatatan: formAlamatCatatan.trim() || undefined,
              targetTahun: formTargetTahun.trim() || defaultNextYear,
              targetProposal: formTargetProposal.trim() || 'Rencana Proposal Belum Ditentukan',
              estimasiKpm: estNumber,
              rencanaItem: formRencanaItem.trim() || undefined,
              priority: formPriority,
              status: formStatus,
              catatan: formCatatan.trim(),
              updatedAt: nowIso,
            }
          : b
      );
      onSaveBookings(next);
      setToastMsg(`Booking ${trimmedName} diperbarui.`);
    } else {
      const newBooking: PengelolaBookingItem = {
        id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        pengelolaId: formPengelolaId || undefined,
        pengelolaName: trimmedName,
        kontak: formKontak.trim() || undefined,
        kecamatan: formKecamatan.trim() || undefined,
        kelurahan: formKelurahan.trim() || undefined,
        alamatCatatan: formAlamatCatatan.trim() || undefined,
        targetTahun: formTargetTahun.trim() || defaultNextYear,
        targetProposal: formTargetProposal.trim() || 'Rencana Proposal Belum Ditentukan',
        estimasiKpm: estNumber,
        rencanaItem: formRencanaItem.trim() || undefined,
        priority: formPriority,
        status: formStatus,
        catatan: formCatatan.trim(),
        createdAt: nowIso,
        createdBy: currentUserName,
        updatedAt: nowIso,
      };
      onSaveBookings([newBooking, ...bookings]);
      setToastMsg(`Booking ${trimmedName} untuk tahun ${newBooking.targetTahun} disimpan.`);
    }

    setIsModalOpen(false);
    window.setTimeout(() => setToastMsg(null), 3500);
  };

  const handleQuickStatusChange = (id: string, nextStatus: PengelolaBookingStatus) => {
    if (!canUpdate || isOffline) return;
    const nowIso = new Date().toISOString();
    onSaveBookings(
      bookings.map((b) => (b.id === id ? { ...b, status: nextStatus, updatedAt: nowIso } : b))
    );
  };

  const handleDeleteBooking = (id: string) => {
    if (!canDelete || isOffline) return;
    onSaveBookings(bookings.filter((b) => b.id !== id));
    setPendingDeleteId(null);
  };

  const handleExportBookings = async (format: 'pdf' | 'xlsx') => {
    if (filteredBookings.length === 0 || exportingFormat) return;
    setExportingFormat(format);
    const yearLabel = yearFilter !== 'all' ? `Tahun ${yearFilter}` : 'Semua Tahun';
    const title = `DAFTAR BOOKING PENGELOLA (${yearLabel.toUpperCase()})`;
    const fileName = `Booking_Pengelola_${yearFilter !== 'all' ? yearFilter : 'Semua'}`;
    try {
      if (format === 'pdf') {
        const res = await exportPengelolaBookingsToPdf({
          bookings: filteredBookings,
          title,
          subtitle:
            statusFilter !== 'all'
              ? `Status: ${STATUS_META[statusFilter].label}`
              : 'Rencana Kuota & Proposal Tahun Berikutnya',
          fileName,
        });
        setToastMsg(`PDF booking tersimpan (${res.count} data).`);
      } else {
        const res = await exportPengelolaBookingsToXlsx({
          bookings: filteredBookings,
          title,
          fileName,
        });
        setToastMsg(`Excel booking tersimpan (${res.count} data).`);
      }
      window.setTimeout(() => setToastMsg(null), 3500);
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : 'Gagal mengekspor daftar booking.');
    } finally {
      setExportingFormat(null);
    }
  };

  const renderBookingRow = (item: PengelolaBookingItem) => {
    const waUrl = formatWhatsAppLink(item.kontak);
    const statusInfo = STATUS_META[item.status] || STATUS_META.booked;
    const wilayahParts = [item.kelurahan, item.kecamatan, item.alamatCatatan].filter(Boolean);

    return (
      <div
        key={item.id}
        className={`flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-start sm:justify-between ${
          item.status === 'cancelled' ? 'opacity-65' : ''
        }`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900">{item.pengelolaName}</span>
            {item.priority === 'prioritas' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                Prioritas
              </span>
            )}
            <span className="text-slate-300">·</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusInfo.textClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotClass}`} />
              {statusInfo.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {!groupByProposal && (
              <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                <FolderKanban className="h-3.5 w-3.5 text-teal-700" />
                {item.targetProposal} ({item.targetTahun})
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-teal-800 tabular-nums">
              <Users className="h-3.5 w-3.5 text-teal-700" />
              Est. {item.estimasiKpm} KPM
            </span>
            {item.rencanaItem && (
              <span className="text-slate-600">Item: {item.rencanaItem}</span>
            )}
            {wilayahParts.length > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {wilayahParts.join(' · ')}
              </span>
            )}
            {waUrl && item.kontak && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {item.kontak}
              </a>
            )}
          </div>

          {item.catatan && (
            <p className="text-xs leading-relaxed text-slate-600">{item.catatan}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {canUpdate && (
            <select
              aria-label={`Ubah status booking ${item.pengelolaName}`}
              disabled={isOffline}
              value={item.status}
              onChange={(e) =>
                handleQuickStatusChange(item.id, e.target.value as PengelolaBookingStatus)
              }
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none disabled:opacity-45"
            >
              <option value="booked">Dibooking</option>
              <option value="assigned">Masuk Proposal</option>
              <option value="cancelled">Batal</option>
            </select>
          )}

          {canUpdate && (
            <button
              type="button"
              disabled={isOffline}
              onClick={() => openEditModal(item)}
              aria-label={`Edit booking ${item.pengelolaName}`}
              title="Edit booking"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-45"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              disabled={isOffline}
              onClick={() => setPendingDeleteId(item.id)}
              aria-label={`Hapus booking ${item.pengelolaName}`}
              title="Hapus booking"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-45"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Strip — flat, unboxed metrics with hairline dividers */}
      <div className="grid grid-cols-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Booking Aktif</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
            {summaryStats.activeCount}
          </p>
          {summaryStats.priorityCount > 0 && (
            <p className="text-[11px] font-medium text-amber-700 tabular-nums">
              {summaryStats.priorityCount} prioritas
            </p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Estimasi Total KPM</p>
          <p className="mt-0.5 text-xl font-bold text-teal-700 tabular-nums">
            {summaryStats.totalEstKpm}
          </p>
          <p className="text-[11px] text-slate-500">Kuota dipesan</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Rencana Proposal</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
            {summaryStats.proposalGroupCount}
          </p>
          <p className="text-[11px] text-slate-500">Target tahap</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">Sudah Masuk Proposal</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-700 tabular-nums">
            {summaryStats.assignedCount}
          </p>
          <p className="text-[11px] text-slate-500">Terealisasi</p>
        </div>
      </div>

      {/* Action & Filter Toolbar */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {canAdd && (
            <button
              type="button"
              disabled={isOffline}
              onClick={openCreateModal}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>Tambah Booking</span>
            </button>
          )}

          <button
            type="button"
            disabled={filteredBookings.length === 0 || exportingFormat !== null}
            onClick={() => void handleExportBookings('pdf')}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap disabled:opacity-45"
          >
            {exportingFormat === 'pdf' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-teal-700" />
            )}
            <span>PDF</span>
          </button>

          <button
            type="button"
            disabled={filteredBookings.length === 0 || exportingFormat !== null}
            onClick={() => void handleExportBookings('xlsx')}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap disabled:opacity-45"
          >
            {exportingFormat === 'xlsx' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-700" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            )}
            <span>Excel</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 lg:w-60 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pengelola, gang, proposal..."
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <FilterSelect
            ariaLabel="Filter tahun target booking"
            value={yearFilter}
            onChange={setYearFilter}
            className="w-[122px] shrink-0"
          >
            <option value="all">Semua Tahun</option>
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                Tahun {yr}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            ariaLabel="Filter status booking"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as 'all' | PengelolaBookingStatus)}
            className="w-[144px] shrink-0"
          >
            <option value="all">Semua Status</option>
            <option value="booked">Dibooking</option>
            <option value="assigned">Masuk Proposal</option>
            <option value="cancelled">Batal</option>
          </FilterSelect>

          <button
            type="button"
            onClick={() => setGroupByProposal((prev) => !prev)}
            className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              groupByProposal
                ? 'border-teal-700 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Per Proposal</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Booking List / Grouped View */}
      {filteredBookings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            {bookings.length === 0
              ? 'Belum ada catatan booking pengelola untuk tahun berikutnya'
              : 'Tidak ada data booking yang cocok dengan filter'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Catat pengelola atau kontak lapangan yang sudah mengajukan antrean agar mudah
            dimasukkan ke proposal tahap atau tahun anggaran berikutnya.
          </p>
          {canAdd && bookings.length === 0 && (
            <button
              type="button"
              disabled={isOffline}
              onClick={openCreateModal}
              className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Buat Booking Pertama</span>
            </button>
          )}
        </div>
      ) : groupByProposal ? (
        <div className="space-y-4">
          {groupedByTargetProposal.map((group) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {group.proposalLabel}
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Target Tahun {group.tahun} · {group.list.length} Pengelola · Estimasi{' '}
                    <span className="font-semibold text-teal-800">{group.estKpm} KPM</span>
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {group.list.map(renderBookingRow)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filteredBookings.map(renderBookingRow)}
        </div>
      )}

      {/* Modal Tambah / Edit Booking */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSubmitForm}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingId ? 'Edit Booking Pengelola' : 'Booking Pengelola Tahun Berikutnya'}
                </h3>
                <p className="text-xs text-slate-500">
                  Tentukan pengelola, target proposal, estimasi KPM, dan catatan lapangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Pilih Pengelola Terdaftar (opsional auto-fill) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Pilih dari Daftar Pengelola (opsional)
                </label>
                <FilterSelect
                  ariaLabel="Pilih pengelola terdaftar"
                  value={formPengelolaId}
                  onChange={handleSelectExistingPengelola}
                >
                  <option value="">-- Ketik manual atau pilih pengelola terdaftar --</option>
                  {pengelolaList
                    .slice()
                    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'id'))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                        {p.kecamatan ? ` (${p.kecamatan})` : ''}
                      </option>
                    ))}
                </FilterSelect>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Nama Pengelola / Koordinator *
                  </label>
                  <input
                    type="text"
                    required
                    value={formPengelolaName}
                    onChange={(e) => setFormPengelolaName(e.target.value)}
                    placeholder="Contoh: Bang Man Awang"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    No. HP / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={formKontak}
                    onChange={(e) => setFormKontak(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Tahun Target *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTargetTahun}
                    onChange={(e) => setFormTargetTahun(e.target.value)}
                    placeholder={defaultNextYear}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Rencana Proposal / Tahap *
                  </label>
                  <input
                    type="text"
                    required
                    list="booking-proposal-suggestions"
                    value={formTargetProposal}
                    onChange={(e) => setFormTargetProposal(e.target.value)}
                    placeholder={`Contoh: Proposal Pontianak Utara ${defaultNextYear}`}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  <datalist id="booking-proposal-suggestions">
                    {proposalSuggestionList.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Kecamatan
                  </label>
                  <FilterSelect
                    ariaLabel="Pilih kecamatan booking"
                    value={formKecamatan}
                    onChange={(v) => {
                      setFormKecamatan(v);
                      setFormKelurahan('');
                    }}
                  >
                    <option value="">-- Pilih Kecamatan --</option>
                    {kecamatanOptions.map((kec) => (
                      <option key={kec} value={kec}>
                        {kec}
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Kelurahan
                  </label>
                  <FilterSelect
                    ariaLabel="Pilih kelurahan booking"
                    value={formKelurahan}
                    onChange={setFormKelurahan}
                  >
                    <option value="">-- Pilih Kelurahan --</option>
                    {kelurahanOptionsForForm.map((kel) => (
                      <option key={kel} value={kel}>
                        {kel}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Gang / Wilayah Spesifik
                </label>
                <input
                  type="text"
                  value={formAlamatCatatan}
                  onChange={(e) => setFormAlamatCatatan(e.target.value)}
                  placeholder="Contoh: Gang Karimata & Maluku, Siantan"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Estimasi Jumlah KPM
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formEstimasiKpm}
                    onChange={(e) => setFormEstimasiKpm(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Rencana Item
                  </label>
                  <input
                    type="text"
                    list="booking-item-suggestions"
                    value={formRencanaItem}
                    onChange={(e) => setFormRencanaItem(e.target.value)}
                    placeholder="OV, MC, Campuran..."
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  <datalist id="booking-item-suggestions">
                    {items.map((it) => (
                      <option key={it.id} value={`${it.code} - ${it.name}`} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Prioritas
                  </label>
                  <FilterSelect
                    ariaLabel="Prioritas booking"
                    value={formPriority}
                    onChange={(v) => setFormPriority(v as PengelolaBookingPriority)}
                  >
                    <option value="normal">Normal</option>
                    <option value="prioritas">Prioritas Tinggi</option>
                  </FilterSelect>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Catatan / Keterangan Lapangan
                </label>
                <textarea
                  rows={3}
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  placeholder="Contoh: Sudah menunggu 3 tahun, KK sudah diserahkan, prioritaskan masuk tahap 1..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{editingId ? 'Simpan Perubahan' : 'Simpan Booking'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900">Hapus Catatan Booking?</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Catatan booking ini akan dihapus dari daftar rencana tahun berikutnya.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBooking(pendingDeleteId)}
                className="inline-flex min-h-[38px] items-center rounded-xl bg-rose-600 px-3.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
