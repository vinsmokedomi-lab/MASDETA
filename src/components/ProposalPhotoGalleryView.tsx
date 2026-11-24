import { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  Expand,
  FileDown,
  FolderArchive,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  RotateCcw,
  ScanSearch,
  Search,
  Share2,
  Upload,
  UserCheck,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  ReportTemplateConfig,
  SingleDocumentKey,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  formatNikDisplay,
  hasRenderableMedia,
  MergedProposalSlot,
  resolveKpmDomicile,
  resolveProposalKecamatanCategory,
  resolveProposalSlotStateForGroup,
  sortKecamatanCategoryNames,
  sortProposalsWithinKecamatan,
} from '../utils/imageProcessor';
import {
  isLocalPendingDocument,
  PhotoCaptureSource,
  PhotoDocCategory,
} from '../utils/photoUploadManager';
import { exportProposalPhotoLpjPdf } from '../utils/pdfExporter';
import {
  exportProposalPhotosZip,
  triggerIosShareZipFile,
  ZipPhotoCategory,
} from '../utils/photoZipExporter';
import { useIsDesktopWeb } from '../utils/platform';
import { DocumentLightbox } from './DocumentLightbox';
import { DriveImage } from './DriveImage';
import { FilterSelect, SegmentedTabs } from './FormControls';
import { SwapPenerimaPhotoModal } from './SwapPenerimaPhotoModal';

type GalleryPhotoCategoryFilter =
  | 'all'
  | 'penerima'
  | 'survey'
  | 'ktp'
  | 'kk'
  | 'rumah'
  | 'lainnya';

type GalleryStatusFilter = 'all' | 'has_penerima' | 'missing_penerima';
type GalleryAttendanceFilter = 'all' | 'present' | 'absent';
type GalleryLayoutMode = 'list' | 'grid' | 'dinsos_audit';
type DinsosAuditMark = 'verified' | 'mismatch';
type DinsosAuditFilter = 'all' | 'unchecked' | 'verified' | 'mismatch';

interface ProposalPhotoGalleryViewProps {
  proposals: ProposalRecord[];
  records: KpmRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  initialProposalId?: string | null;
  selectedYear?: string;
  canUpdate?: boolean;
  reportTemplate?: ReportTemplateConfig;
  onBack: () => void;
  onSelectKpm: (record: KpmRecord) => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
  onOpenProposalDetail?: (proposalId: string) => void;
  onEnqueuePhoto?: (
    kpmId: string,
    params: {
      file: File;
      source: PhotoCaptureSource;
      category: PhotoDocCategory;
      label: string;
      existingDoc?: KpmDocumentFile;
    }
  ) => Promise<void>;
  onSwapPenerimaPhoto?: (
    sourceKpmId: string,
    targetKpmId: string,
    category?: SingleDocumentKey
  ) => Promise<boolean | void> | boolean | void;
}

interface KpmPhotoEntry {
  key: string;
  category: PhotoDocCategory;
  categoryLabel: string;
  doc: KpmDocumentFile;
  isPending: boolean;
}

function collectKpmPhotos(
  rec: KpmRecord,
  categoryFilter: GalleryPhotoCategoryFilter
): KpmPhotoEntry[] {
  const list: KpmPhotoEntry[] = [];
  const pushDoc = (category: PhotoDocCategory, label: string, doc?: KpmDocumentFile) => {
    if (!doc || !hasRenderableMedia(doc)) return;
    if (categoryFilter !== 'all' && categoryFilter !== category) return;
    list.push({
      key: `${category}-${doc.id}`,
      category,
      categoryLabel: label,
      doc,
      isPending: isLocalPendingDocument(doc),
    });
  };

  pushDoc('penerima', 'Foto Penerima', rec.documents.penerima);
  pushDoc('survey', 'Foto Survey', rec.documents.survey);
  pushDoc('ktp', 'Foto KTP', rec.documents.ktp);
  pushDoc('kk', 'Foto KK', rec.documents.kk);

  const rumahDocs = Array.isArray(rec.documents.rumah)
    ? rec.documents.rumah
    : rec.documents.rumah
      ? [rec.documents.rumah]
      : [];
  rumahDocs.forEach((doc, idx) => {
    pushDoc('rumah', rumahDocs.length > 1 ? `Foto Rumah ${idx + 1}` : 'Foto Rumah', doc);
  });

  const lainnyaDocs = Array.isArray(rec.documents.lainnya) ? rec.documents.lainnya : [];
  lainnyaDocs.forEach((doc, idx) => {
    pushDoc('lainnya', lainnyaDocs.length > 1 ? `Foto Lainnya ${idx + 1}` : 'Foto Lainnya', doc);
  });

  return list;
}

function GalleryThumb({
  doc,
  alt,
  className,
  fallbackWidth = 720,
}: {
  doc: KpmDocumentFile;
  alt: string;
  className?: string;
  fallbackWidth?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [doc.id, doc.directUrl, doc.thumbnailUrl, doc.dataUrl]);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-2 text-center text-slate-400">
        <ImageIcon className="h-5 w-5" />
        <span className="mt-1 line-clamp-1 text-[10px] font-medium">Gagal muat</span>
      </div>
    );
  }

  return (
    <DriveImage
      doc={doc}
      alt={alt}
      loading="lazy"
      fallbackWidth={fallbackWidth}
      onBothFailed={() => setFailed(true)}
      className={className}
    />
  );
}

function AuditPhotoCanvas({
  doc,
  alt,
  zoom,
  focalPoint,
  isCalibratingFocus,
  onSetFocalPoint,
  onOpenLightbox,
}: {
  doc: KpmDocumentFile;
  alt: string;
  zoom: number;
  focalPoint: { x: number; y: number };
  isCalibratingFocus: boolean;
  onSetFocalPoint: (next: { x: number; y: number }) => void;
  onOpenLightbox: () => void;
}) {
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const effectiveZoom = isCalibratingFocus ? 1 : zoom;

  const computePercent = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (isCalibratingFocus) {
          onSetFocalPoint(computePercent(e));
        } else {
          onOpenLightbox();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenLightbox();
        }
      }}
      onMouseMove={(e) => {
        if (effectiveZoom <= 1.05 || isCalibratingFocus) {
          setHoverPos(computePercent(e));
        } else if (hoverPos) {
          setHoverPos(null);
        }
      }}
      onMouseLeave={() => setHoverPos(null)}
      className={`group relative aspect-[4/3] w-full overflow-hidden bg-slate-900/5 focus:outline-none focus:ring-2 focus:ring-teal-700 ${
        isCalibratingFocus ? 'cursor-crosshair' : 'cursor-zoom-in'
      }`}
    >
      <div
        className="h-full w-full transition-transform duration-200 ease-out"
        style={{
          transform: effectiveZoom > 1 ? `scale(${effectiveZoom})` : undefined,
          transformOrigin: `${focalPoint.x}% ${focalPoint.y}%`,
        }}
      >
        <GalleryThumb
          doc={doc}
          alt={alt}
          fallbackWidth={1000}
          className="h-full w-full object-contain bg-slate-950/90"
        />
      </div>

      {/* Focal calibration guide */}
      {isCalibratingFocus && (
        <>
          <div
            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-amber-400/20 shadow-md"
            style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-amber-600/95 px-3 py-1.5 text-center text-[11px] font-bold text-white shadow-lg">
            Klik tepat pada kertas DINSOS di foto ini untuk atur fokus semua kartu
          </div>
        </>
      )}

      {/* Hover magnifier loupe when viewing full 1x photo on desktop */}
      {!isCalibratingFocus && effectiveZoom <= 1.05 && hoverPos && (
        <div
          className="pointer-events-none hidden md:block absolute z-10 h-40 w-40 overflow-hidden rounded-2xl border-2 border-amber-400 bg-slate-950 shadow-2xl ring-2 ring-black/40"
          style={{
            left: hoverPos.x > 62 ? '10px' : 'auto',
            right: hoverPos.x > 62 ? 'auto' : '10px',
            top: hoverPos.y > 55 ? '10px' : 'auto',
            bottom: hoverPos.y > 55 ? 'auto' : '10px',
          }}
        >
          <div
            className="h-full w-full"
            style={{
              transform: 'scale(3.4)',
              transformOrigin: `${hoverPos.x}% ${hoverPos.y}%`,
            }}
          >
            <GalleryThumb
              doc={doc}
              alt=""
              fallbackWidth={1200}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="absolute top-1.5 left-1.5 rounded bg-amber-500/95 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-950">
            3.4× Kaca Pembesar
          </span>
        </div>
      )}
    </div>
  );
}

export function ProposalPhotoGalleryView({
  proposals,
  records,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  initialProposalId = null,
  selectedYear = 'all',
  canUpdate = true,
  reportTemplate,
  onBack,
  onSelectKpm,
  onPreviewDocument,
  onOpenProposalDetail,
  onEnqueuePhoto,
  onSwapPenerimaPhoto,
}: ProposalPhotoGalleryViewProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isNativeApp = !isDesktopWeb;

  const initialProposal = useMemo(
    () => (initialProposalId ? proposals.find((p) => p.id === initialProposalId) ?? null : null),
    [initialProposalId, proposals]
  );

  const [yearFilter, setYearFilter] = useState<string>(
    initialProposal?.tahun || (selectedYear && selectedYear !== 'all' ? selectedYear : 'all')
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string>(
    initialProposalId || proposals[0]?.id || ''
  );
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<GalleryPhotoCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<GalleryStatusFilter>('all');
  const [attendanceFilter, setAttendanceFilter] = useState<GalleryAttendanceFilter>('all');
  const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>('list');
  const [showEmptySlots, setShowEmptySlots] = useState<boolean>(true);
  const [query, setQuery] = useState('');
  const [dinsosAuditMarks, setDinsosAuditMarks] = useState<Record<string, DinsosAuditMark>>({});
  const [dinsosAuditFilter, setDinsosAuditFilter] = useState<DinsosAuditFilter>('all');
  const [auditZoom, setAuditZoom] = useState<1 | 2.4 | 3.2>(2.4);
  const [auditFocalPoint, setAuditFocalPoint] = useState<{ x: number; y: number }>({
    x: 56,
    y: 56,
  });
  const [isCalibratingFocus, setIsCalibratingFocus] = useState(false);
  const [cardFullViewMap, setCardFullViewMap] = useState<Record<string, boolean>>({});
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyKpmId, setBusyKpmId] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    record: KpmRecord;
    category: SingleDocumentKey;
  } | null>(null);
  const [lastSwapUndo, setLastSwapUndo] = useState<{
    sourceKpmId: string;
    targetKpmId: string;
    sourceName: string;
    targetName: string;
    category: SingleDocumentKey;
  } | null>(null);
  const [undoSwapBusy, setUndoSwapBusy] = useState(false);
  const [isExportingLpj, setIsExportingLpj] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportProgressLabel, setExportProgressLabel] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{
    type: 'success' | 'error';
    message: string;
    pendingIosFile?: File;
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{
    kpmId: string;
    existingDoc?: KpmDocumentFile;
    source: PhotoCaptureSource;
  } | null>(null);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    proposals.forEach((p) => {
      if (p.tahun) set.add(p.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [proposals]);

  const scopedProposals = useMemo(() => {
    const base =
      yearFilter === 'all' ? proposals : proposals.filter((p) => p.tahun === yearFilter);
    const groups = new Map<string, ProposalRecord[]>();
    for (const p of base) {
      const kec = resolveProposalKecamatanCategory(p.namaProposal, proposals, p.tahun, wilayahList);
      const list = groups.get(kec) ?? [];
      list.push(p);
      groups.set(kec, list);
    }
    const ordered: ProposalRecord[] = [];
    for (const [, list] of Array.from(groups.entries()).sort(([a], [b]) =>
      sortKecamatanCategoryNames(a, b)
    )) {
      ordered.push(...sortProposalsWithinKecamatan(list, (item) => item.namaProposal));
    }
    return ordered;
  }, [proposals, yearFilter, wilayahList]);

  useEffect(() => {
    if (scopedProposals.length === 0) return;
    if (!scopedProposals.some((p) => p.id === selectedProposalId)) {
      setSelectedProposalId(scopedProposals[0].id);
      setKelurahanFilter('all');
    }
  }, [scopedProposals, selectedProposalId]);

  const activeProposal = useMemo(
    () =>
      scopedProposals.find((p) => p.id === selectedProposalId) ??
      proposals.find((p) => p.id === selectedProposalId) ??
      scopedProposals[0] ??
      null,
    [scopedProposals, proposals, selectedProposalId]
  );

  // Load & persist DINSOS audit marks per proposal in localStorage
  useEffect(() => {
    if (!activeProposal?.id) {
      setDinsosAuditMarks({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(`masdeta_dinsos_audit_v1_${activeProposal.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, DinsosAuditMark>;
        setDinsosAuditMarks(parsed && typeof parsed === 'object' ? parsed : {});
      } else {
        setDinsosAuditMarks({});
      }
    } catch {
      setDinsosAuditMarks({});
    }
  }, [activeProposal?.id]);

  const setKpmAuditMark = (kpmId: string, nextMark: DinsosAuditMark | null) => {
    setDinsosAuditMarks((prev) => {
      const next = { ...prev };
      if (nextMark) {
        next[kpmId] = nextMark;
      } else {
        delete next[kpmId];
      }
      if (activeProposal?.id) {
        try {
          window.localStorage.setItem(
            `masdeta_dinsos_audit_v1_${activeProposal.id}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore storage quota errors
        }
      }
      return next;
    });
  };

  const clearProposalAuditMarks = () => {
    setDinsosAuditMarks({});
    if (activeProposal?.id) {
      try {
        window.localStorage.removeItem(`masdeta_dinsos_audit_v1_${activeProposal.id}`);
      } catch {
        // ignore
      }
    }
  };

  // Hitung ringkasan foto per proposal untuk label dropdown
  const proposalPhotoCountMap = useMemo(() => {
    const counts = new Map<string, { total: number; penerima: number }>();
    for (const r of records) {
      if (r.validasi !== 'accepted') continue;
      const key = r.proposalId || `${r.tahun}::${r.proposal}`;
      const cur = counts.get(key) ?? { total: 0, penerima: 0 };
      cur.total += 1;
      if (hasRenderableMedia(r.documents.penerima)) {
        cur.penerima += 1;
      }
      counts.set(key, cur);
    }
    return counts;
  }, [records]);

  const proposalRecords = useMemo(() => {
    if (!activeProposal) return [];
    return records.filter(
      (r) =>
        r.validasi === 'accepted' &&
        (r.proposalId
          ? r.proposalId === activeProposal.id
          : r.proposal === activeProposal.namaProposal && r.tahun === activeProposal.tahun)
    );
  }, [records, activeProposal]);

  const mergedSlots = useMemo(() => {
    if (!activeProposal) return [];
    const { state: slotState } = resolveProposalSlotStateForGroup(
      proposalSlotMap,
      activeProposal.id,
      activeProposal.namaProposal,
      activeProposal.tahun,
      proposals
    );
    return buildMergedProposalSlots({
      groupRecords: proposalRecords,
      slotState,
      proposals,
      catalog: items,
      wilayahList,
    });
  }, [activeProposal, proposalSlotMap, proposals, proposalRecords, items, wilayahList]);

  // Kelurahan options inside the selected proposal (useful for kecamatan-level proposals)
  const kelurahanOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const slot of mergedSlots) {
      if (slot.kind !== 'kpm') continue;
      const dom = resolveKpmDomicile(slot.record, proposals, wilayahList);
      const kel = dom.kelurahan?.trim() || slot.record.kelurahan?.trim() || 'Belum ditentukan';
      map.set(kel, (map.get(kel) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [mergedSlots, proposals, wilayahList]);

  useEffect(() => {
    if (
      kelurahanFilter !== 'all' &&
      !kelurahanOptions.some((opt) => opt.name === kelurahanFilter)
    ) {
      setKelurahanFilter('all');
    }
  }, [kelurahanFilter, kelurahanOptions]);

  const summaryStats = useMemo(() => {
    let totalKpm = 0;
    let withPenerima = 0;
    let totalPhotos = 0;
    let attendingCount = 0;
    let emptyCount = 0;

    for (const entry of mergedSlots) {
      if (entry.kind === 'empty') {
        emptyCount += 1;
        continue;
      }
      const rec = entry.record;
      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
      const kel = dom.kelurahan?.trim() || rec.kelurahan?.trim() || 'Belum ditentukan';
      if (kelurahanFilter !== 'all' && kel !== kelurahanFilter) continue;

      totalKpm += 1;
      if (hasRenderableMedia(rec.documents.penerima)) {
        withPenerima += 1;
      }
      if (rec.attendance?.present) {
        attendingCount += 1;
      }
      totalPhotos += collectKpmPhotos(rec, 'all').length;
    }

    const missingPenerima = Math.max(0, totalKpm - withPenerima);
    const pctPenerima = totalKpm > 0 ? Math.round((withPenerima / totalKpm) * 100) : 0;

    return {
      totalKpm,
      withPenerima,
      missingPenerima,
      totalPhotos,
      attendingCount,
      emptyCount,
      pctPenerima,
    };
  }, [mergedSlots, kelurahanFilter, proposals, wilayahList]);

  const filteredSlots = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    return mergedSlots.filter((entry) => {
      if (entry.kind === 'empty') {
        if (!showEmptySlots || layoutMode === 'grid') return false;
        if (kelurahanFilter !== 'all' || statusFilter !== 'all' || attendanceFilter !== 'all') return false;
        if (!q) return true;
        const seqStr = String(entry.slotNumber).padStart(2, '0');
        return (
          seqStr.includes(q) ||
          'baris kosong'.includes(q) ||
          (entry.emptySlot.item || '').toLowerCase().includes(q) ||
          (entry.emptySlot.previousKpmName || '').toLowerCase().includes(q)
        );
      }

      const rec = entry.record;
      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
      const kel = dom.kelurahan?.trim() || rec.kelurahan?.trim() || 'Belum ditentukan';
      if (kelurahanFilter !== 'all' && kel !== kelurahanFilter) return false;

      const hasPenerima = hasRenderableMedia(rec.documents.penerima);
      if (statusFilter === 'has_penerima' && !hasPenerima) return false;
      if (statusFilter === 'missing_penerima' && hasPenerima) return false;

      const isPresent = Boolean(rec.attendance?.present);
      if (attendanceFilter === 'present' && !isPresent) return false;
      if (attendanceFilter === 'absent' && isPresent) return false;

      const photos = collectKpmPhotos(rec, categoryFilter);
      if (layoutMode === 'grid' && categoryFilter !== 'all' && photos.length === 0) {
        return false;
      }

      if (!q) return true;
      const seqStr = String(entry.slotNumber).padStart(2, '0');
      const seqRaw = String(entry.slotNumber);
      return (
        seqStr.includes(q) ||
        seqRaw === q ||
        rec.nama.toLowerCase().includes(q) ||
        rec.nikKtp.toLowerCase().includes(q) ||
        rec.item.toLowerCase().includes(q) ||
        kel.toLowerCase().includes(q) ||
        (rec.pengelola || '').toLowerCase().includes(q)
      );
    });
  }, [
    mergedSlots,
    query,
    showEmptySlots,
    layoutMode,
    kelurahanFilter,
    statusFilter,
    attendanceFilter,
    categoryFilter,
    proposals,
    wilayahList,
  ]);

  const gridPhotoCards = useMemo(() => {
    if (layoutMode !== 'grid') return [];
    const cards: {
      key: string;
      slotNumber: number;
      record: KpmRecord;
      kelurahan: string;
      photo: KpmPhotoEntry | null;
    }[] = [];

    for (const entry of filteredSlots) {
      if (entry.kind !== 'kpm') continue;
      const rec = entry.record;
      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
      const kel = dom.kelurahan?.trim() || rec.kelurahan?.trim() || 'Belum ditentukan';
      const photos = collectKpmPhotos(rec, categoryFilter);

      if (photos.length === 0) {
        if (categoryFilter === 'all' || categoryFilter === 'penerima') {
          cards.push({
            key: `empty-photo-${rec.id}`,
            slotNumber: entry.slotNumber,
            record: rec,
            kelurahan: kel,
            photo: null,
          });
        }
      } else {
        for (const p of photos) {
          cards.push({
            key: `${rec.id}-${p.key}`,
            slotNumber: entry.slotNumber,
            record: rec,
            kelurahan: kel,
            photo: p,
          });
        }
      }
    }
    return cards;
  }, [layoutMode, filteredSlots, categoryFilter, proposals, wilayahList]);

  const dinsosAuditAllCards = useMemo(() => {
    const cards: {
      key: string;
      slotNumber: number;
      record: KpmRecord;
      kelurahan: string;
      photo: KpmPhotoEntry | null;
      auditStatus?: DinsosAuditMark;
    }[] = [];
    for (const entry of filteredSlots) {
      if (entry.kind !== 'kpm') continue;
      const rec = entry.record;
      const dom = resolveKpmDomicile(rec, proposals, wilayahList);
      const kel = dom.kelurahan?.trim() || rec.kelurahan?.trim() || 'Belum ditentukan';
      const targetCat: GalleryPhotoCategoryFilter =
        categoryFilter === 'all' ? 'penerima' : categoryFilter;
      const primaryPhotos = collectKpmPhotos(rec, targetCat);
      const photo = primaryPhotos[0] ?? null;
      cards.push({
        key: `audit-${rec.id}`,
        slotNumber: entry.slotNumber,
        record: rec,
        kelurahan: kel,
        photo,
        auditStatus: dinsosAuditMarks[rec.id],
      });
    }
    return cards;
  }, [filteredSlots, categoryFilter, proposals, wilayahList, dinsosAuditMarks]);

  const dinsosAuditStats = useMemo(() => {
    let verified = 0;
    let mismatch = 0;
    let unchecked = 0;
    for (const card of dinsosAuditAllCards) {
      if (card.auditStatus === 'verified') verified += 1;
      else if (card.auditStatus === 'mismatch') mismatch += 1;
      else unchecked += 1;
    }
    return {
      total: dinsosAuditAllCards.length,
      verified,
      mismatch,
      unchecked,
    };
  }, [dinsosAuditAllCards]);

  const dinsosAuditCards = useMemo(() => {
    if (dinsosAuditFilter === 'all') return dinsosAuditAllCards;
    return dinsosAuditAllCards.filter((card) => {
      if (dinsosAuditFilter === 'verified') return card.auditStatus === 'verified';
      if (dinsosAuditFilter === 'mismatch') return card.auditStatus === 'mismatch';
      return !card.auditStatus;
    });
  }, [dinsosAuditAllCards, dinsosAuditFilter]);

  interface GalleryPreviewSequenceItem {
    previewKey: string;
    slotNumber: number;
    seqLabel: string;
    record: KpmRecord;
    photo: KpmPhotoEntry;
  }

  const previewSequence = useMemo<GalleryPreviewSequenceItem[]>(() => {
    if (layoutMode === 'dinsos_audit') {
      return dinsosAuditCards
        .filter((c): c is typeof c & { photo: KpmPhotoEntry } => Boolean(c.photo))
        .map((c) => ({
          previewKey: `${c.record.id}::${c.photo.key}`,
          slotNumber: c.slotNumber,
          seqLabel: String(c.slotNumber).padStart(2, '0'),
          record: c.record,
          photo: c.photo,
        }));
    }
    if (layoutMode === 'grid') {
      return gridPhotoCards
        .filter((c): c is typeof c & { photo: KpmPhotoEntry } => Boolean(c.photo))
        .map((c) => ({
          previewKey: `${c.record.id}::${c.photo.key}`,
          slotNumber: c.slotNumber,
          seqLabel: String(c.slotNumber).padStart(2, '0'),
          record: c.record,
          photo: c.photo,
        }));
    }
    const list: GalleryPreviewSequenceItem[] = [];
    for (const entry of filteredSlots) {
      if (entry.kind !== 'kpm') continue;
      const photos = collectKpmPhotos(entry.record, categoryFilter);
      const seqLabel = String(entry.slotNumber).padStart(2, '0');
      for (const p of photos) {
        list.push({
          previewKey: `${entry.record.id}::${p.key}`,
          slotNumber: entry.slotNumber,
          seqLabel,
          record: entry.record,
          photo: p,
        });
      }
    }
    return list;
  }, [layoutMode, dinsosAuditCards, gridPhotoCards, filteredSlots, categoryFilter]);

  const activePreviewIdx = useMemo(
    () =>
      activePreviewKey
        ? previewSequence.findIndex((item) => item.previewKey === activePreviewKey)
        : -1,
    [activePreviewKey, previewSequence]
  );

  const activePreviewItem =
    activePreviewIdx >= 0 ? previewSequence[activePreviewIdx] : null;

  const openSequencePreview = (rec: KpmRecord, photo: KpmPhotoEntry) => {
    const key = `${rec.id}::${photo.key}`;
    if (previewSequence.some((item) => item.previewKey === key)) {
      setActivePreviewKey(key);
    } else {
      onPreviewDocument(photo.doc, `${rec.nama} — ${photo.categoryLabel}`);
    }
  };

  const triggerUploadPenerima = (
    rec: KpmRecord,
    source: PhotoCaptureSource
  ) => {
    if (!onEnqueuePhoto || !canUpdate || activeProposal?.status === 'locked') return;
    setUploadError(null);
    pendingUploadRef.current = {
      kpmId: rec.id,
      existingDoc: rec.documents.penerima,
      source,
    };
    if (source === 'camera') {
      cameraInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handlePhotoFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (!file || !target || !onEnqueuePhoto) return;

    setUploadError(null);
    setBusyKpmId(target.kpmId);
    try {
      await onEnqueuePhoto(target.kpmId, {
        file,
        source: target.source,
        category: 'penerima',
        label: 'Foto Penerima',
        existingDoc: target.existingDoc,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal menyimpan foto ke perangkat.');
    } finally {
      setBusyKpmId(null);
    }
  };

  const isProposalLocked = activeProposal?.status === 'locked';

  const activeSwapCategory: SingleDocumentKey =
    categoryFilter === 'survey' || categoryFilter === 'ktp' || categoryFilter === 'kk'
      ? categoryFilter
      : 'penerima';

  const exportTargetEntries = useMemo<MergedProposalSlot[]>(() => {
    const visibleKpm = filteredSlots.filter(
      (entry): entry is Extract<MergedProposalSlot, { kind: 'kpm' }> => entry.kind === 'kpm'
    );
    if (visibleKpm.length > 0) return visibleKpm;
    return mergedSlots.filter(
      (entry): entry is Extract<MergedProposalSlot, { kind: 'kpm' }> => entry.kind === 'kpm'
    );
  }, [filteredSlots, mergedSlots]);

  const handleExportLpjPdf = async (layout: '4up' | '6up') => {
    if (!activeProposal || exportTargetEntries.length === 0 || isExportingLpj || isExportingZip) {
      return;
    }
    setExportNotice(null);
    setIsExportingLpj(true);
    setExportProgressLabel(`Menyiapkan PDF LPJ (${layout === '4up' ? '4' : '6'} foto/hal)...`);
    try {
      const lpjCategory: SingleDocumentKey =
        categoryFilter === 'survey' || categoryFilter === 'ktp' || categoryFilter === 'kk'
          ? categoryFilter
          : 'penerima';
      const res = await exportProposalPhotoLpjPdf({
        proposal: activeProposal,
        mergedSlots: exportTargetEntries,
        items,
        wilayahList,
        reportTemplate,
        layoutMode: layout,
        photoCategory: lpjCategory,
        kelurahanFilter,
        onProgress: (done, total) => {
          setExportProgressLabel(`Memuat foto ${done}/${total}...`);
        },
      });
      setExportNotice({
        type: 'success',
        message: res.openedNative
          ? `PDF LPJ Foto "${res.savedFileName}" (${res.count} KPM) berhasil dibuat & dibuka.`
          : `PDF LPJ Foto "${res.savedFileName}" (${res.count} KPM) berhasil diunduh.`,
      });
    } catch (err) {
      setExportNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat PDF LPJ Foto.',
      });
    } finally {
      setIsExportingLpj(false);
      setExportProgressLabel(null);
    }
  };

  const handleExportZip = async () => {
    if (!activeProposal || exportTargetEntries.length === 0 || isExportingLpj || isExportingZip) {
      return;
    }
    setExportNotice(null);
    setIsExportingZip(true);
    setExportProgressLabel('Menyiapkan arsip .ZIP...');
    try {
      const zipCategory: ZipPhotoCategory =
        categoryFilter === 'survey' ||
        categoryFilter === 'ktp' ||
        categoryFilter === 'kk' ||
        categoryFilter === 'rumah' ||
        categoryFilter === 'lainnya'
          ? categoryFilter
          : 'penerima';
      const res = await exportProposalPhotosZip({
        proposalName: activeProposal.namaProposal,
        tahun: activeProposal.tahun,
        mergedSlots: exportTargetEntries,
        category: zipCategory,
        kelurahanFilter,
        onProgress: (done, total) => {
          setExportProgressLabel(`Mengemas foto ${done}/${total}...`);
        },
      });
      if (res.pendingIosFile) {
        setExportNotice({
          type: 'success',
          message: `Arsip ${res.savedFileName} (${res.exportedCount} foto) siap dibagikan.`,
          pendingIosFile: res.pendingIosFile,
        });
      } else {
        const skippedCount = Math.max(0, exportTargetEntries.length - res.totalWithPhoto);
        const skippedNote =
          skippedCount > 0 ? ` (${skippedCount} KPM belum memiliki foto)` : '';
        setExportNotice({
          type: 'success',
          message: res.openedNative
            ? `Arsip ${res.savedFileName} (${res.exportedCount} foto) berhasil dibuat & dibuka${skippedNote}.`
            : `Arsip ${res.savedFileName} (${res.exportedCount} foto) berhasil diunduh${skippedNote}.`,
        });
      }
    } catch (err) {
      setExportNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membuat file .ZIP foto.',
      });
    } finally {
      setIsExportingZip(false);
      setExportProgressLabel(null);
    }
  };

  const categoryOptions: { key: GalleryPhotoCategoryFilter; label: string }[] = [
    { key: 'all', label: 'Semua Foto' },
    { key: 'penerima', label: 'Penerima' },
    { key: 'survey', label: 'Survey' },
    { key: 'ktp', label: 'KTP' },
    { key: 'kk', label: 'KK' },
    { key: 'rumah', label: 'Rumah' },
    { key: 'lainnya', label: 'Lainnya' },
  ];

  return (
    <div className={`min-h-screen pb-24 ${!isNativeApp ? 'md:pb-12' : ''}`}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoFileSelected}
        className="sr-only"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoFileSelected}
        className="sr-only"
      />

      {isNativeApp && (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Kembali"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900">Galeri Foto Pembagian</h1>
            </div>
          </div>
          {activeProposal && onOpenProposalDetail && (
            <button
              type="button"
              onClick={() => onOpenProposalDetail(activeProposal.id)}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-teal-700 hover:bg-slate-50"
            >
              <span>Detail</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </header>
      )}

      <div
        className={`space-y-4 px-4 pt-4 ${
          !isNativeApp ? 'md:mx-auto md:max-w-[1440px] md:px-6 md:pt-6' : ''
        }`}
      >
        {!isNativeApp && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Kembali</span>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
                    Galeri Foto Pembagian
                  </h1>
                  {activeProposal && (
                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                      · {activeProposal.namaProposal} ({activeProposal.tahun})
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Daftar lengkap dokumentasi foto KPM per kelurahan / proposal sesuai nomor urut
                </p>
              </div>
            </div>

            {activeProposal && onOpenProposalDetail && (
              <button
                type="button"
                onClick={() => onOpenProposalDetail(activeProposal.id)}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Buka Detail Proposal</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Proposal / Kelurahan & Year Picker */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[120px_minmax(0,1fr)_auto]">
            <FilterSelect
              ariaLabel="Filter tahun proposal"
              value={yearFilter}
              onChange={(yr) => setYearFilter(yr)}
            >
              <option value="all">Semua Tahun</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              ariaLabel="Pilih Proposal atau Kelurahan"
              value={activeProposal?.id || ''}
              onChange={(id) => {
                setSelectedProposalId(id);
                setKelurahanFilter('all');
              }}
            >
              {scopedProposals.length === 0 ? (
                <option value="">Tidak ada proposal</option>
              ) : (
                scopedProposals.map((p) => {
                  const st =
                    proposalPhotoCountMap.get(p.id) ??
                    proposalPhotoCountMap.get(`${p.tahun}::${p.namaProposal}`) ?? {
                      total: 0,
                      penerima: 0,
                    };
                  return (
                    <option key={p.id} value={p.id}>
                      {p.namaProposal} ({p.tahun}) — {st.penerima}/{st.total} Foto Penerima
                    </option>
                  );
                })
              )}
            </FilterSelect>

            {kelurahanOptions.length > 1 && (
              <FilterSelect
                ariaLabel="Filter Kelurahan Domisili"
                value={kelurahanFilter}
                onChange={setKelurahanFilter}
                className="md:min-w-[200px]"
              >
                <option value="all">Semua Kelurahan ({proposalRecords.length})</option>
                {kelurahanOptions.map((k) => (
                  <option key={k.name} value={k.name}>
                    {k.name} ({k.count})
                  </option>
                ))}
              </FilterSelect>
            )}
          </div>

          {/* Summary Metrics Strip */}
          {activeProposal && (
            <div className="grid grid-cols-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70 md:grid-cols-4 md:divide-x md:divide-y-0">
              <div className="px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">KPM Aktif</p>
                <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  {summaryStats.totalKpm}
                  {summaryStats.emptyCount > 0 && (
                    <span className="ml-1.5 text-xs font-medium text-amber-700">
                      +{summaryStats.emptyCount} kosong
                    </span>
                  )}
                </p>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">Sudah Foto Penerima</p>
                <p className="mt-0.5 text-base font-bold text-teal-700 tabular-nums">
                  {summaryStats.withPenerima}{' '}
                  <span className="text-xs font-medium text-slate-500">
                    / {summaryStats.totalKpm} ({summaryStats.pctPenerima}%)
                  </span>
                </p>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">Belum Foto Penerima</p>
                <p
                  className={`mt-0.5 text-base font-bold tabular-nums ${
                    summaryStats.missingPenerima > 0 ? 'text-amber-700' : 'text-slate-700'
                  }`}
                >
                  {summaryStats.missingPenerima} KPM
                </p>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">Absensi Hadir · Total Foto</p>
                <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  {summaryStats.attendingCount}{' '}
                  <span className="text-xs font-medium text-slate-500">
                    hadir · {summaryStats.totalPhotos} foto
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Search, Status Tabs, Category & Layout Switch */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari no. urut, nama KPM, NIK, item, atau pengelola..."
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pr-9 pl-10 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Hapus pencarian"
                    className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setLayoutMode('list')}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    layoutMode === 'list'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>Daftar Urut</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('grid')}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    layoutMode === 'grid'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Grid Galeri</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('dinsos_audit')}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    layoutMode === 'dinsos_audit'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-800 hover:bg-amber-50 hover:text-amber-900'
                  }`}
                >
                  <ScanSearch className="h-3.5 w-3.5" />
                  <span>Cek DINSOS</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedTabs<GalleryStatusFilter>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  tabs={[
                    { key: 'all', label: `Semua (${summaryStats.totalKpm})` },
                    { key: 'has_penerima', label: `Sudah Foto (${summaryStats.withPenerima})` },
                    { key: 'missing_penerima', label: `Belum Foto (${summaryStats.missingPenerima})` },
                  ]}
                />

                <SegmentedTabs<GalleryAttendanceFilter>
                  value={attendanceFilter}
                  onChange={setAttendanceFilter}
                  tabs={[
                    { key: 'all', label: 'Semua Absen' },
                    { key: 'present', label: `Hadir (${summaryStats.attendingCount})` },
                    {
                      key: 'absent',
                      label: `Belum Hadir (${Math.max(0, summaryStats.totalKpm - summaryStats.attendingCount)})`,
                    },
                  ]}
                />
              </div>

              {layoutMode === 'list' && summaryStats.emptyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEmptySlots((v) => !v)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                >
                  <span>{showEmptySlots ? 'Sembunyikan Baris Kosong' : 'Tampilkan Baris Kosong'}</span>
                </button>
              )}
            </div>

            {/* Category filter strip */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {categoryOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCategoryFilter(opt.key)}
                    className={`min-h-[30px] rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      categoryFilter === opt.key
                        ? 'bg-teal-700 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {activeProposal && exportTargetEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isExportingLpj || isExportingZip}
                    onClick={() => void handleExportLpjPdf('4up')}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50 whitespace-nowrap"
                    title="Export PDF LPJ Dokumentasi Foto (4 foto per halaman F4)"
                  >
                    {isExportingLpj ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>PDF LPJ (4/hal)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isExportingLpj || isExportingZip}
                    onClick={() => void handleExportLpjPdf('6up')}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                    title="Export PDF LPJ Dokumentasi Foto (6 foto per halaman F4)"
                  >
                    <FileDown className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                    <span>PDF LPJ (6/hal)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isExportingLpj || isExportingZip}
                    onClick={() => void handleExportZip()}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-teal-700 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                    title="Download semua foto kelurahan terurut & rename otomatis dalam 1 file .ZIP"
                  >
                    {isExportingZip ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <FolderArchive className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>Download .ZIP</span>
                  </button>
                </div>
              )}
            </div>

            {exportProgressLabel && (
              <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-teal-700" />
                <span>{exportProgressLabel}</span>
              </div>
            )}

            {exportNotice && (
              <div
                role="status"
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                  exportNotice.type === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                <span className="font-medium">{exportNotice.message}</span>
                <div className="flex items-center gap-2">
                  {exportNotice.pendingIosFile && (
                    <button
                      type="button"
                      onClick={() => {
                        const f = exportNotice.pendingIosFile!;
                        void triggerIosShareZipFile(f).then(() => setExportNotice(null));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-800"
                    >
                      <Share2 className="h-3 w-3" />
                      <span>Bagikan / Simpan File</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExportNotice(null)}
                    className="rounded p-0.5 text-current/70 hover:text-current"
                    aria-label="Tutup notifikasi export"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {lastSwapUndo && onSwapPenerimaPhoto && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-900">
            <span>
              Foto antara <strong>{lastSwapUndo.sourceName}</strong> dan{' '}
              <strong>{lastSwapUndo.targetName}</strong> baru saja ditukar/dipindah.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={undoSwapBusy}
                onClick={async () => {
                  setUndoSwapBusy(true);
                  try {
                    await onSwapPenerimaPhoto(
                      lastSwapUndo.sourceKpmId,
                      lastSwapUndo.targetKpmId,
                      lastSwapUndo.category
                    );
                    setLastSwapUndo(null);
                  } finally {
                    setUndoSwapBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{undoSwapBusy ? 'Mengembalikan...' : 'Undo Cepat'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLastSwapUndo(null)}
                className="rounded-lg p-1 text-teal-700 hover:bg-teal-100"
                aria-label="Tutup notifikasi undo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
          >
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="rounded-lg p-1 text-rose-600 hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isProposalLocked && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700">
            <Lock className="h-4 w-4 shrink-0 text-slate-600" />
            <span>Proposal ini berstatus Terkunci. Foto hanya dapat dilihat/diunduh.</span>
          </div>
        )}

        {/* Content Area */}
        {!activeProposal ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <Images className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Belum ada proposal tersedia</p>
          </div>
        ) : layoutMode === 'dinsos_audit' ? (
          /* Mode Audit Nomor DINSOS */
          <div className="space-y-3.5">
            {/* Toolbar Zoom Serentak, Fokus Kertas, & Filter Audit */}
            <section className="sticky top-2 z-10 rounded-2xl border border-amber-200 bg-amber-50/95 p-3.5 shadow-sm backdrop-blur-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950">
                      <ScanSearch className="h-4 w-4 text-amber-700 shrink-0" />
                      <span>Mode Cek Nomor Kertas DINSOS</span>
                    </span>
                    <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-amber-200/80 tabular-nums">
                      {dinsosAuditStats.verified}/{dinsosAuditStats.total} Sesuai
                      {dinsosAuditStats.mismatch > 0
                        ? ` · ${dinsosAuditStats.mismatch} Tertukar`
                        : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-amber-900/80">
                    Gunakan <strong>Zoom Fokus</strong> agar semua foto otomatis menyorot kertas DINSOS, atau gunakan <strong>1× + Kaca Pembesar</strong> lalu klik foto untuk slide cepat (panah ←/→).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {([1, 2.4, 3.2] as const).map((preset) => {
                    const active = auditZoom === preset;
                    const label =
                      preset === 1 ? '1× Normal' : preset === 2.4 ? '2.4× Fokus Kertas' : '3.2× Dekat';
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAuditZoom(preset);
                          setIsCalibratingFocus(false);
                        }}
                        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-amber-700 text-white shadow-xs'
                            : 'border border-amber-300 bg-white text-amber-950 hover:bg-amber-100/70'
                        }`}
                      >
                        <ZoomIn className="h-3 w-3 shrink-0" />
                        <span>{label}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setIsCalibratingFocus((v) => !v)}
                    className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      isCalibratingFocus
                        ? 'bg-slate-900 text-white'
                        : 'border border-amber-300 bg-white text-slate-700 hover:bg-amber-100/60'
                    }`}
                    title="Klik posisi kertas DINSOS di salah satu foto untuk menyelaraskan titik fokus zoom semua kartu"
                  >
                    <Crosshair className="h-3 w-3 shrink-0" />
                    <span>{isCalibratingFocus ? 'Batal Atur Fokus' : 'Atur Titik Fokus'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200/70 pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'all', label: `Semua (${dinsosAuditStats.total})` },
                      { key: 'unchecked', label: `Belum Dicek (${dinsosAuditStats.unchecked})` },
                      { key: 'verified', label: `Sesuai (${dinsosAuditStats.verified})` },
                      { key: 'mismatch', label: `Tertukar (${dinsosAuditStats.mismatch})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setDinsosAuditFilter(f.key)}
                      className={`min-h-[28px] rounded-lg px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        dinsosAuditFilter === f.key
                          ? 'bg-slate-900 text-white'
                          : 'border border-amber-200 bg-white text-slate-700 hover:bg-amber-100/50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {(auditFocalPoint.x !== 56 || auditFocalPoint.y !== 56) && (
                    <button
                      type="button"
                      onClick={() => setAuditFocalPoint({ x: 56, y: 56 })}
                      className="text-[11px] font-semibold text-amber-900 underline hover:text-amber-700"
                    >
                      Reset Titik Fokus
                    </button>
                  )}
                  {(dinsosAuditStats.verified > 0 || dinsosAuditStats.mismatch > 0) && (
                    <button
                      type="button"
                      onClick={clearProposalAuditMarks}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-amber-100/50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset Tandai</span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            {dinsosAuditCards.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
                <Users className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-2.5 text-sm font-semibold text-slate-900">
                  Tidak ada KPM pada filter audit ini
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ubah filter audit atau kata kunci pencarian di atas.
                </p>
              </div>
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {dinsosAuditCards.map((card) => {
                  const seqLabel = String(card.slotNumber).padStart(2, '0');
                  const isVerified = card.auditStatus === 'verified';
                  const isMismatch = card.auditStatus === 'mismatch';
                  const isFullFrameOverride = Boolean(cardFullViewMap[card.record.id]);
                  const effectiveCardZoom = isFullFrameOverride ? 1 : auditZoom;
                  const canUploadHere =
                    Boolean(onEnqueuePhoto) && canUpdate && !isProposalLocked;

                  return (
                    <article
                      key={card.key}
                      className={`overflow-hidden rounded-2xl border bg-white transition-all ${
                        isMismatch
                          ? 'border-rose-300 ring-2 ring-rose-500/20'
                          : isVerified
                            ? 'border-emerald-300 ring-1 ring-emerald-500/20'
                            : 'border-slate-200'
                      }`}
                    >
                      {/* Top Header Bar showing target DINSOS number clearly */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-xl px-2.5 py-1 font-mono text-xs font-extrabold tracking-wide tabular-nums ${
                              isMismatch
                                ? 'bg-rose-600 text-white'
                                : isVerified
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 text-white'
                            }`}
                          >
                            DINSOS {seqLabel}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {card.record.nama}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {card.record.item || '-'} · {card.kelurahan}
                              {card.record.pengelola ? ` · ${card.record.pengelola}` : ''}
                            </p>
                          </div>
                        </div>

                        {card.photo && !isCalibratingFocus && (
                          <div className="flex shrink-0 items-center gap-1">
                            {auditZoom > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCardFullViewMap((prev) => ({
                                    ...prev,
                                    [card.record.id]: !prev[card.record.id],
                                  }))
                                }
                                className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Expand className="h-3 w-3" />
                                <span>{isFullFrameOverride ? `${auditZoom}× Fokus` : '1× Penuh'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openSequencePreview(card.record, card.photo!)}
                              className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-teal-700 hover:bg-teal-50"
                              title="Buka layar penuh (bisa geser panah ←/→)"
                            >
                              <ZoomIn className="h-3 w-3" />
                              <span>Perbesar</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Large High-Visibility Photo Stage */}
                      {card.photo ? (
                        <AuditPhotoCanvas
                          doc={card.photo.doc}
                          alt={`${seqLabel}. ${card.record.nama} - ${card.photo.categoryLabel}`}
                          zoom={effectiveCardZoom}
                          focalPoint={auditFocalPoint}
                          isCalibratingFocus={isCalibratingFocus}
                          onSetFocalPoint={(pt) => {
                            setAuditFocalPoint(pt);
                            setIsCalibratingFocus(false);
                            if (auditZoom === 1) setAuditZoom(2.4);
                          }}
                          onOpenLightbox={() => openSequencePreview(card.record, card.photo!)}
                        />
                      ) : (
                        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
                          <ImageIcon className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-500">
                            Belum ada Foto Penerima
                          </p>
                          {canUploadHere && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => triggerUploadPenerima(card.record, 'camera')}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-teal-700 px-3 text-[11px] font-semibold text-white hover:bg-teal-800"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                <span>Kamera</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerUploadPenerima(card.record, 'file')}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                <span>Galeri</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Audit Action Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setKpmAuditMark(card.record.id, isVerified ? null : 'verified')
                            }
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                              isVerified
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{isVerified ? 'Sesuai ✓' : 'Sesuai'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setKpmAuditMark(card.record.id, isMismatch ? null : 'mismatch')
                            }
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                              isMismatch
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                            }`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Tertukar</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {canUpdate && !isProposalLocked && onSwapPenerimaPhoto && (
                            <button
                              type="button"
                              onClick={() =>
                                setSwapTarget({
                                  record: card.record,
                                  category: activeSwapCategory,
                                })
                              }
                              className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold whitespace-nowrap ${
                                isMismatch
                                  ? 'bg-teal-700 text-white hover:bg-teal-800'
                                  : 'border border-teal-200 bg-teal-50/80 text-teal-800 hover:bg-teal-100'
                              }`}
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                              <span>Tukar / Pindah</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectKpm(card.record)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <span>Detail</span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        ) : filteredSlots.length === 0 || (layoutMode === 'grid' && gridPhotoCards.length === 0) ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <Users className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-2.5 text-sm font-semibold text-slate-900">
              Tidak ada data foto yang cocok
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah filter kategori foto, status penerima, atau kata kunci pencarian.
            </p>
          </div>
        ) : layoutMode === 'list' ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {filteredSlots.map((entry) => {
              const seqLabel = String(entry.slotNumber).padStart(2, '0');

              if (entry.kind === 'empty') {
                return (
                  <div
                    key={`empty-gallery-${entry.slotNumber}`}
                    className="flex items-center justify-between gap-3 bg-amber-50/50 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 font-mono text-xs font-bold text-amber-900 tabular-nums">
                        {seqLabel}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-amber-900">
                          Baris Kosong{entry.emptySlot.item ? ` · ${entry.emptySlot.item}` : ''}
                        </p>
                        <p className="truncate text-[11px] text-amber-800/80">
                          {entry.emptySlot.previousKpmName
                            ? `Bekas ${entry.emptySlot.previousKpmName}`
                            : 'Slot kuota BAST belum terisi'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const rec = entry.record;
              const dom = resolveKpmDomicile(rec, proposals, wilayahList);
              const kelName = dom.kelurahan?.trim() || rec.kelurahan?.trim() || 'Belum ditentukan';
              const photos = collectKpmPhotos(rec, categoryFilter);
              const hasPenerima = hasRenderableMedia(rec.documents.penerima);
              const isAttending = Boolean(rec.attendance?.present);
              const canUploadHere =
                Boolean(onEnqueuePhoto) && canUpdate && !isProposalLocked;
              const isBusy = busyKpmId === rec.id;

              return (
                <div key={rec.id} className="p-4 transition-colors hover:bg-slate-50/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectKpm(rec)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left group"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold tabular-nums ${
                          hasPenerima
                            ? 'bg-teal-700 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {seqLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-bold text-slate-900 group-hover:text-teal-700">
                            {rec.nama}
                          </span>
                          {rec.item && (
                            <span className="font-mono text-[11px] font-bold text-slate-600">
                              · {rec.item}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                          {formatNikDisplay(rec.nikKtp)} · {kelName}
                          {rec.pengelola ? ` · ${rec.pengelola}` : ''}
                        </p>
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isAttending ? 'text-teal-700' : 'text-slate-400'
                        }`}
                      >
                        {isAttending ? (
                          <UserCheck className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>
                          {isAttending
                            ? rec.attendance?.representativeName
                              ? `Hadir (Diwakilkan: ${rec.attendance.representativeName})`
                              : 'Hadir'
                            : 'Belum Hadir'}
                        </span>
                      </span>

                      {canUpdate && !isProposalLocked && onSwapPenerimaPhoto && (
                        <button
                          type="button"
                          onClick={() =>
                            setSwapTarget({ record: rec, category: activeSwapCategory })
                          }
                          title="Tukar atau pindahkan foto dengan KPM lain"
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/80 px-2.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 whitespace-nowrap"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                          <span>{hasPenerima ? 'Tukar / Pindah' : 'Tukar / Ambil'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectKpm(rec)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <span>Detail</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  {/* Photo thumbnails strip */}
                  <div className="mt-3 pl-12">
                    {photos.length === 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <span className="text-xs text-slate-500">
                          {categoryFilter === 'all'
                            ? 'Belum ada foto diunggah untuk KPM ini.'
                            : `Belum ada ${
                                categoryOptions.find((o) => o.key === categoryFilter)?.label || 'foto'
                              }.`}
                        </span>

                        {canUploadHere && !hasPenerima && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => triggerUploadPenerima(rec, 'camera')}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              <span>Foto Penerima</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => triggerUploadPenerima(rec, 'file')}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              <span>Galeri</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {photos.map((photo) => (
                            <button
                              key={photo.key}
                              type="button"
                              onClick={() => openSequencePreview(rec, photo)}
                              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left focus:outline-none focus:ring-2 focus:ring-teal-700"
                            >
                              <GalleryThumb
                                doc={photo.doc}
                                alt={`${rec.nama} - ${photo.categoryLabel}`}
                                fallbackWidth={720}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent px-2 pt-4 pb-1.5">
                                <p className="truncate text-[10px] font-semibold text-white">
                                  {photo.categoryLabel}
                                </p>
                              </div>
                              {photo.isPending && (
                                <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-bold text-white">
                                  Antrean
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {!hasPenerima && canUploadHere && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-[11px] font-medium text-amber-700">
                              Foto Penerima belum ada:
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => triggerUploadPenerima(rec, 'camera')}
                              className="inline-flex min-h-[28px] items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                            >
                              <Camera className="h-3 w-3" />
                              <span>Ambil Foto Penerima</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => triggerUploadPenerima(rec, 'file')}
                              className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Upload className="h-3 w-3" />
                              <span>Galeri</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          /* Grid Galeri Mode */
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {gridPhotoCards.map((card) => {
              const seqLabel = String(card.slotNumber).padStart(2, '0');
              const isAttending = Boolean(card.record.attendance?.present);
              const canUploadHere =
                Boolean(onEnqueuePhoto) && canUpdate && !isProposalLocked;

              return (
                <article
                  key={card.key}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  {card.photo ? (
                    <button
                      type="button"
                      onClick={() => openSequencePreview(card.record, card.photo!)}
                      className="group relative aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left"
                    >
                      <GalleryThumb
                        doc={card.photo.doc}
                        alt={`${seqLabel}. ${card.record.nama} - ${card.photo.categoryLabel}`}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <span className="pointer-events-none absolute top-2 left-2 rounded-lg bg-slate-950/75 px-2 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums backdrop-blur-xs">
                        #{seqLabel}
                      </span>
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                        {card.photo.categoryLabel}
                      </span>
                      {card.photo.isPending && (
                        <span className="pointer-events-none absolute top-2 right-2 rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Antrean
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-center">
                      <span className="absolute top-2 left-2 rounded-lg bg-slate-200 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                        #{seqLabel}
                      </span>
                      <ImageIcon className="h-7 w-7 text-slate-300" />
                      <span className="text-[11px] font-medium text-slate-500">Belum ada foto</span>
                      {canUploadHere && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => triggerUploadPenerima(card.record, 'camera')}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-lg bg-teal-700 px-2 text-[10px] font-semibold text-white hover:bg-teal-800"
                          >
                            <Camera className="h-3 w-3" />
                            <span>Kamera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerUploadPenerima(card.record, 'file')}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Upload className="h-3 w-3" />
                            <span>Galeri</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-1 flex-col justify-between gap-1.5 p-3">
                    <button
                      type="button"
                      onClick={() => onSelectKpm(card.record)}
                      className="min-w-0 text-left group"
                    >
                      <p className="truncate text-xs font-bold text-slate-900 group-hover:text-teal-700">
                        {card.record.nama}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {card.record.item || 'Tanpa Item'} · {card.kelurahan}
                      </p>
                    </button>
                    <div className="flex items-center justify-between gap-1.5 border-t border-slate-100 pt-1.5 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold truncate ${
                          isAttending ? 'text-teal-700' : 'text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {isAttending
                            ? card.record.attendance?.representativeName
                              ? `Hadir (${card.record.attendance.representativeName})`
                              : 'Hadir'
                            : 'Belum'}
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {canUpdate && !isProposalLocked && onSwapPenerimaPhoto && (
                            <button
                              type="button"
                              onClick={() => {
                                const cat: SingleDocumentKey =
                                  card.photo?.category === 'survey' ||
                                  card.photo?.category === 'ktp' ||
                                  card.photo?.category === 'kk'
                                    ? card.photo.category
                                    : activeSwapCategory;
                                setSwapTarget({ record: card.record, category: cat });
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50/80 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 hover:bg-teal-100 whitespace-nowrap"
                              title="Tukar / Pindah Foto dengan KPM lain"
                            >
                              <ArrowLeftRight className="h-2.5 w-2.5" />
                              <span>Tukar</span>
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => onSelectKpm(card.record)}
                          className="font-medium text-teal-700 hover:underline whitespace-nowrap"
                        >
                          Detail →
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      <DocumentLightbox
        documentFile={activePreviewItem?.photo.doc ?? null}
        title={
          activePreviewItem
            ? `${activePreviewItem.seqLabel}. ${activePreviewItem.record.nama} — ${activePreviewItem.photo.categoryLabel}`
            : ''
        }
        positionLabel={
          activePreviewItem
            ? `${activePreviewIdx + 1} / ${previewSequence.length}`
            : undefined
        }
        hasPrev={activePreviewIdx > 0}
        hasNext={activePreviewIdx >= 0 && activePreviewIdx < previewSequence.length - 1}
        onPrev={() => {
          if (activePreviewIdx > 0) {
            setActivePreviewKey(previewSequence[activePreviewIdx - 1].previewKey);
          }
        }}
        onNext={() => {
          if (activePreviewIdx >= 0 && activePreviewIdx < previewSequence.length - 1) {
            setActivePreviewKey(previewSequence[activePreviewIdx + 1].previewKey);
          }
        }}
        auditContext={
          activePreviewItem
            ? {
                expectedLabel: `Harus pegang: DINSOS ${activePreviewItem.seqLabel}`,
                status: dinsosAuditMarks[activePreviewItem.record.id],
                onMarkStatus: (nextStatus, advanceNext) => {
                  setKpmAuditMark(activePreviewItem.record.id, nextStatus);
                  if (
                    advanceNext &&
                    activePreviewIdx >= 0 &&
                    activePreviewIdx < previewSequence.length - 1
                  ) {
                    setActivePreviewKey(previewSequence[activePreviewIdx + 1].previewKey);
                  }
                },
                onSwapClick:
                  canUpdate && !isProposalLocked && onSwapPenerimaPhoto
                    ? () => {
                        const cat = activePreviewItem.photo.category;
                        const swapCat: SingleDocumentKey =
                          cat === 'survey' || cat === 'ktp' || cat === 'kk' ? cat : 'penerima';
                        setSwapTarget({
                          record: activePreviewItem.record,
                          category: swapCat,
                        });
                      }
                    : undefined,
              }
            : undefined
        }
        onClose={() => setActivePreviewKey(null)}
      />

      {onSwapPenerimaPhoto && (
        <SwapPenerimaPhotoModal
          open={Boolean(swapTarget)}
          sourceRecord={swapTarget?.record ?? null}
          initialCategory={swapTarget?.category ?? 'penerima'}
          allRecords={records}
          proposals={proposals}
          items={items}
          wilayahList={wilayahList}
          proposalSlotMap={proposalSlotMap}
          onClose={() => setSwapTarget(null)}
          onConfirmSwap={async (sourceId, targetId, cat = 'penerima') => {
            const ok = await onSwapPenerimaPhoto(sourceId, targetId, cat);
            if (ok !== false) {
              const src = records.find((r) => r.id === sourceId);
              const tgt = records.find((r) => r.id === targetId);
              setLastSwapUndo({
                sourceKpmId: sourceId,
                targetKpmId: targetId,
                sourceName: src?.nama || 'KPM asal',
                targetName: tgt?.nama || 'KPM tujuan',
                category: cat,
              });
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
