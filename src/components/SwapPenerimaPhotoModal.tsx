import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ImageOff,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { INITIAL_WILAYAH_LIST } from '../data/kpmOptions';
import {
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  ProposalRecord,
  ProposalSlotMap,
  WilayahKabKota,
} from '../types/kpm';
import {
  buildMergedProposalSlots,
  formatNikDisplay,
  hasRenderableMedia,
  resolveKpmDomicile,
  resolveProposalSlotStateForGroup,
} from '../utils/imageProcessor';
import { isLocalPendingDocument } from '../utils/photoUploadManager';
import { DriveImage } from './DriveImage';

interface SwapPenerimaPhotoModalProps {
  open: boolean;
  sourceRecord: KpmRecord | null;
  allRecords: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList?: WilayahKabKota[];
  proposalSlotMap?: ProposalSlotMap;
  onClose: () => void;
  onConfirmSwap: (sourceKpmId: string, targetKpmId: string) => Promise<boolean | void> | boolean | void;
}

interface CandidateKpmSlot {
  record: KpmRecord;
  slotNumber: number | null;
  kelurahan: string;
  penerimaDoc?: KpmDocumentFile;
  hasPenerima: boolean;
  isLockedProposal: boolean;
}

function MiniPhotoPreview({
  doc,
  alt,
  emptyLabel = 'Kosong',
}: {
  doc?: KpmDocumentFile;
  alt: string;
  emptyLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [doc?.id, doc?.directUrl, doc?.thumbnailUrl, doc?.dataUrl]);

  if (!doc || !hasRenderableMedia(doc) || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-400">
        <ImageOff className="h-4 w-4" />
        <span className="mt-0.5 text-[9px] font-medium">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <DriveImage
      doc={doc}
      alt={alt}
      loading="lazy"
      fallbackWidth={240}
      onBothFailed={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export function SwapPenerimaPhotoModal({
  open,
  sourceRecord,
  allRecords,
  proposals,
  items,
  wilayahList = INITIAL_WILAYAH_LIST,
  proposalSlotMap = {},
  onClose,
  onConfirmSwap,
}: SwapPenerimaPhotoModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    setSelectedTargetId('');
    setBusy(false);
  }, [open, sourceRecord?.id]);

  const sourceProposal = useMemo(() => {
    if (!sourceRecord) return null;
    if (sourceRecord.proposalId) {
      const byId = proposals.find((p) => p.id === sourceRecord.proposalId);
      if (byId) return byId;
    }
    if (sourceRecord.proposal) {
      return (
        proposals.find(
          (p) => p.namaProposal === sourceRecord.proposal && p.tahun === sourceRecord.tahun
        ) ??
        proposals.find((p) => p.namaProposal === sourceRecord.proposal) ??
        null
      );
    }
    return null;
  }, [sourceRecord, proposals]);

  const { sourceSlotNumber, candidates } = useMemo(() => {
    if (!sourceRecord) {
      return { sourceSlotNumber: null as number | null, candidates: [] as CandidateKpmSlot[] };
    }

    const lockedProposalIds = new Set(
      proposals.filter((p) => p.status === 'locked').map((p) => p.id)
    );
    const lockedProposalNames = new Set(
      proposals
        .filter((p) => p.status === 'locked')
        .map((p) => `${p.tahun}::${p.namaProposal}`)
    );

    const isRecordProposalLocked = (rec: KpmRecord) =>
      (rec.proposalId ? lockedProposalIds.has(rec.proposalId) : false) ||
      lockedProposalNames.has(`${rec.tahun}::${rec.proposal}`);

    if (sourceProposal) {
      const proposalRecords = allRecords.filter(
        (r) =>
          r.validasi === 'accepted' &&
          (r.proposalId
            ? r.proposalId === sourceProposal.id
            : r.proposal === sourceProposal.namaProposal && r.tahun === sourceProposal.tahun)
      );
      const { state: slotState } = resolveProposalSlotStateForGroup(
        proposalSlotMap,
        sourceProposal.id,
        sourceProposal.namaProposal,
        sourceProposal.tahun,
        proposals
      );
      const merged = buildMergedProposalSlots({
        groupRecords: proposalRecords,
        slotState,
        proposals,
        catalog: items,
        wilayahList,
      });

      let mySlot: number | null = null;
      const list: CandidateKpmSlot[] = [];

      for (const entry of merged) {
        if (entry.kind !== 'kpm') continue;
        if (entry.record.id === sourceRecord.id) {
          mySlot = entry.slotNumber;
          continue;
        }
        const dom = resolveKpmDomicile(entry.record, proposals, wilayahList);
        const kel = dom.kelurahan?.trim() || entry.record.kelurahan?.trim() || '-';
        const doc = entry.record.documents.penerima;
        const hasDoc = Boolean(doc && hasRenderableMedia(doc));
        list.push({
          record: entry.record,
          slotNumber: entry.slotNumber,
          kelurahan: kel,
          penerimaDoc: doc,
          hasPenerima: hasDoc,
          isLockedProposal: isRecordProposalLocked(entry.record),
        });
      }

      return { sourceSlotNumber: mySlot, candidates: list };
    }

    // Fallback for standalone / non-proposal KPM
    const list: CandidateKpmSlot[] = allRecords
      .filter((r) => r.id !== sourceRecord.id && r.validasi !== 'rejected')
      .map((rec) => {
        const dom = resolveKpmDomicile(rec, proposals, wilayahList);
        const kel = dom.kelurahan?.trim() || rec.kelurahan?.trim() || '-';
        const doc = rec.documents.penerima;
        return {
          record: rec,
          slotNumber: null,
          kelurahan: kel,
          penerimaDoc: doc,
          hasPenerima: Boolean(doc && hasRenderableMedia(doc)),
          isLockedProposal: isRecordProposalLocked(rec),
        };
      });

    return { sourceSlotNumber: null, candidates: list };
  }, [sourceRecord, sourceProposal, allRecords, proposals, items, wilayahList, proposalSlotMap]);

  if (!open || !sourceRecord) return null;

  const sourceDoc = sourceRecord.documents.penerima;
  const sourceHasPenerima = Boolean(sourceDoc && hasRenderableMedia(sourceDoc));

  // If source has NO Foto Penerima yet, only offer candidates that DO have a Foto Penerima to pull from
  const eligibleCandidates = candidates.filter((c) => {
    if (c.isLockedProposal) return false;
    if (!sourceHasPenerima && !c.hasPenerima) return false;
    return true;
  });

  const nearbyCandidates =
    sourceSlotNumber !== null
      ? eligibleCandidates.filter(
          (c) =>
            c.slotNumber !== null &&
            Math.abs(c.slotNumber - sourceSlotNumber) <= 3
        )
      : [];

  const q = searchQuery.trim().toLowerCase();
  const filteredCandidates = eligibleCandidates.filter((c) => {
    if (!q) return true;
    const seqPad = c.slotNumber !== null ? String(c.slotNumber).padStart(2, '0') : '';
    const seqRaw = c.slotNumber !== null ? String(c.slotNumber) : '';
    return (
      seqPad.includes(q) ||
      seqRaw === q ||
      c.record.nama.toLowerCase().includes(q) ||
      c.record.nikKtp.toLowerCase().includes(q) ||
      c.record.item.toLowerCase().includes(q) ||
      c.kelurahan.toLowerCase().includes(q)
    );
  });

  const selectedTarget =
    eligibleCandidates.find((c) => c.record.id === selectedTargetId) ?? null;

  const sourceSeqLabel =
    sourceSlotNumber !== null ? `#${String(sourceSlotNumber).padStart(2, '0')}` : 'KPM';
  const targetSeqLabel =
    selectedTarget?.slotNumber !== null && selectedTarget?.slotNumber !== undefined
      ? `#${String(selectedTarget.slotNumber).padStart(2, '0')}`
      : 'KPM';

  const isTwoWaySwap = Boolean(
    sourceHasPenerima && selectedTarget && selectedTarget.hasPenerima
  );

  const handleSubmit = async () => {
    if (!selectedTarget || busy) return;
    setBusy(true);
    try {
      const ok = await onConfirmSwap(sourceRecord.id, selectedTarget.record.id);
      if (ok !== false) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="swap-penerima-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ArrowLeftRight className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 id="swap-penerima-modal-title" className="text-base font-bold text-slate-900">
                Tukar / Pindah Foto Penerima
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {sourceHasPenerima
                  ? 'Pilih KPM tujuan untuk menukar atau memindahkan Foto Penerima tanpa upload ulang.'
                  : 'Pilih KPM lain yang sudah memiliki Foto Penerima untuk dipindahkan ke KPM ini.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Tutup modal tukar foto"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Source summary card */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <MiniPhotoPreview
                doc={sourceDoc}
                alt={sourceRecord.nama}
                emptyLabel="Belum ada"
              />
              {sourceDoc && isLocalPendingDocument(sourceDoc) && (
                <span className="absolute right-0.5 bottom-0.5 rounded bg-amber-500 px-1 text-[8px] font-bold text-white">
                  Antre
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-teal-700 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums">
                  {sourceSeqLabel}
                </span>
                <span className="truncate text-sm font-bold text-slate-900">
                  {sourceRecord.nama}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                {formatNikDisplay(sourceRecord.nikKtp)}
                {sourceProposal ? ` · ${sourceProposal.namaProposal}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-teal-800">
                {sourceHasPenerima
                  ? 'Memiliki Foto Penerima saat ini'
                  : 'Belum memiliki Foto Penerima (akan menerima foto)'}
              </p>
            </div>
          </div>

          {/* Nearby slots quick strip */}
          {nearbyCandidates.length > 0 && !q && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                Nomor Urut Terdekat
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {nearbyCandidates.slice(0, 6).map((cand) => {
                  const isSelected = cand.record.id === selectedTargetId;
                  const candSeq =
                    cand.slotNumber !== null
                      ? `#${String(cand.slotNumber).padStart(2, '0')}`
                      : '-';
                  return (
                    <button
                      key={cand.record.id}
                      type="button"
                      onClick={() => setSelectedTargetId(cand.record.id)}
                      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors ${
                        isSelected
                          ? 'border-teal-700 bg-teal-50/80 ring-1 ring-teal-700'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        <MiniPhotoPreview doc={cand.penerimaDoc} alt={cand.record.nama} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                            {candSeq}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-teal-700" />}
                        </div>
                        <p className="truncate text-[11px] font-medium text-slate-600">
                          {cand.record.nama}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search box */}
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nomor urut (misal 39), nama KPM, atau NIK..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-10 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Candidate list */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              <span>Daftar KPM dalam Proposal</span>
              <span className="tabular-nums">{filteredCandidates.length} KPM</span>
            </div>
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto bg-white">
              {filteredCandidates.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  Tidak ada KPM tujuan yang cocok.
                </div>
              ) : (
                filteredCandidates.map((cand) => {
                  const isSelected = cand.record.id === selectedTargetId;
                  const candSeq =
                    cand.slotNumber !== null
                      ? String(cand.slotNumber).padStart(2, '0')
                      : '-';
                  const actionHint =
                    sourceHasPenerima && cand.hasPenerima
                      ? 'Tukar 2 arah'
                      : sourceHasPenerima
                        ? 'Pindah ke sini'
                        : 'Ambil foto ini';

                  return (
                    <button
                      key={cand.record.id}
                      type="button"
                      onClick={() => setSelectedTargetId(cand.record.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-teal-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold tabular-nums ${
                          isSelected
                            ? 'bg-teal-700 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {candSeq}
                      </span>

                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        <MiniPhotoPreview doc={cand.penerimaDoc} alt={cand.record.nama} />
                        {cand.penerimaDoc && isLocalPendingDocument(cand.penerimaDoc) && (
                          <span className="absolute right-0.5 bottom-0.5 rounded bg-amber-500 px-1 text-[8px] font-bold text-white">
                            Antre
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {cand.record.nama}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 tabular-nums">
                          {formatNikDisplay(cand.record.nikKtp)}
                          {cand.record.item ? ` · ${cand.record.item}` : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`text-[11px] font-semibold whitespace-nowrap ${
                            cand.hasPenerima ? 'text-teal-700' : 'text-slate-500'
                          }`}
                        >
                          {actionHint}
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-teal-700" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Live visual preview of the swap/move */}
          {selectedTarget && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-teal-900">
                  {isTwoWaySwap
                    ? 'Pratinjau Tukar 2 Arah (Swap)'
                    : sourceHasPenerima
                      ? 'Pratinjau Pemindahan Foto (1 Arah)'
                      : 'Pratinjau Penarikan Foto (1 Arah)'}
                </span>
                <span className="font-mono text-[11px] font-bold text-teal-800 tabular-nums">
                  {sourceSeqLabel} {isTwoWaySwap ? '⇄' : sourceHasPenerima ? '→' : '←'} {targetSeqLabel}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Result on Source */}
                <div className="flex items-center gap-2 rounded-lg border border-teal-200/80 bg-white p-2 min-w-0">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    <MiniPhotoPreview
                      doc={selectedTarget.penerimaDoc}
                      alt={sourceRecord.nama}
                      emptyLabel="Kosong"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] font-bold text-teal-800 tabular-nums">
                      Hasil {sourceSeqLabel}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-slate-900">
                      {sourceRecord.nama}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {selectedTarget.hasPenerima ? 'Terima foto baru' : 'Foto menjadi kosong'}
                    </p>
                  </div>
                </div>

                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-white">
                  {isTwoWaySwap ? (
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowRight
                      className={`h-3.5 w-3.5 ${sourceHasPenerima ? '' : 'rotate-180'}`}
                    />
                  )}
                </div>

                {/* Result on Target */}
                <div className="flex items-center gap-2 rounded-lg border border-teal-200/80 bg-white p-2 min-w-0">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    <MiniPhotoPreview
                      doc={sourceDoc}
                      alt={selectedTarget.record.nama}
                      emptyLabel="Kosong"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] font-bold text-teal-800 tabular-nums">
                      Hasil {targetSeqLabel}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-slate-900">
                      {selectedTarget.record.nama}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {sourceHasPenerima ? 'Terima foto baru' : 'Foto dipindahkan'}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-teal-900/90">
                Status kehadiran (absensi otomatis) akan ikut menyesuaikan berdasarkan kepemilikan Foto Penerima setelah dipindah.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selectedTarget || busy}
            onClick={() => void handleSubmit()}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-4 w-4" />
                <span>
                  {isTwoWaySwap
                    ? 'Tukar Foto Penerima'
                    : sourceHasPenerima
                      ? 'Pindahkan Foto Penerima'
                      : 'Ambil Foto Penerima'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
