import { useEffect, useMemo, useRef, useState } from 'react';
import {
  INITIAL_INTERNAL_USERS,
  INITIAL_ITEM_LIST,
  INITIAL_KPM_AUDIT_LOGS,
  INITIAL_PENGELOLA_LIST,
  INITIAL_PROPOSAL_HISTORY,
  INITIAL_PROPOSAL_LIST,
  INITIAL_WILAYAH_LIST,
  PEKERJAAN_OPTIONS,
  SAMPLE_KPM_RECORDS,
} from './data/kpmOptions';
import {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmFormValues,
  KpmRecord,
  PengelolaProfile,
  ProposalFormValues,
  ProposalKpmHistoryEntry,
  ProposalRecord,
  ValidationStatus,
  WilayahKabKota,
} from './types/kpm';
import {
  clearSampleRecordsOnce,
  diffKpmRecordChanges,
  formatValidationLabel,
  generateRegisterCode,
  loadInternalUsers,
  loadItemList,
  loadKpmAuditLogs,
  loadKpmRecords,
  loadPekerjaanList,
  loadPengelolaList,
  loadProposalHistory,
  loadProposals,
  loadWilayahList,
  recalculateProposalRegisterCodes,
  resolvePackageForKpm,
  saveInternalUsers,
  saveItemList,
  saveKpmAuditLogs,
  saveKpmRecords,
  savePekerjaanList,
  savePengelolaList,
  saveProposalHistory,
  saveProposals,
  saveWilayahList,
} from './utils/imageProcessor';
import { importProposalKpmFromCsv } from './utils/csvImporter';
import { KpmRegistrationForm } from './components/KpmRegistrationForm';
import { KpmDetailView } from './components/KpmDetailView';
import { SubItemRecapView } from './components/SubItemRecapView';
import { AddProposalForm } from './components/AddProposalForm';
import { ProposalForm } from './components/ProposalForm';
import { ProposalDetailView } from './components/ProposalDetailView';
import { DocumentLightbox } from './components/DocumentLightbox';
import { OfflineIndicator } from './components/PWAInstallButton';
import { BottomNavBar, MainTab, QuickAddSheet } from './components/BottomNavBar';
import { DashboardView } from './components/DashboardView';
import { KpmListView } from './components/KpmListView';
import { ProposalListView } from './components/ProposalListView';
import { MenuHubView, MenuSection } from './components/MenuHubView';

type SubView =
  | 'none'
  | 'kpm-form'
  | 'kpm-detail'
  | 'subitem-recap'
  | 'add-proposal'
  | 'edit-proposal'
  | 'proposal-detail';

interface FeedbackBanner {
  type: 'success' | 'error';
  message: string;
}

export function MasdetaLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
    >
      <rect width="36" height="36" rx="10" fill="#0F766E" />
      <path
        d="M9 24.5V12.5C9 11.6716 9.67157 11 10.5 11H12.05C12.5672 11 13.0478 11.2663 13.3219 11.7049L18 19.1899L22.6781 11.7049C22.9522 11.2663 23.4328 11 23.95 11H25.5C26.3284 11 27 11.6716 27 12.5V24.5"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 24.5L18 19.5L21.5 24.5"
        stroke="#99F6E4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [subView, setSubView] = useState<SubView>('none');
  const [returnToTab, setReturnToTab] = useState<MainTab>('dashboard');
  const [kpmFormReturnToDetail, setKpmFormReturnToDetail] = useState(false);
  const [kpmFormReturnToProposalDetail, setKpmFormReturnToProposalDetail] = useState(false);
  const [kpmDetailReturnToRecap, setKpmDetailReturnToRecap] = useState(false);
  const [kpmDetailReturnToProposalDetail, setKpmDetailReturnToProposalDetail] = useState(false);
  const [addProposalFromKpmForm, setAddProposalFromKpmForm] = useState(false);
  const [menuSection, setMenuSection] = useState<MenuSection>('root');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [kpmStatusFilter, setKpmStatusFilter] = useState<'all' | ValidationStatus>('all');
  const [kpmItemFilter, setKpmItemFilter] = useState<string>('all');
  const [kpmProposalFilter, setKpmProposalFilter] = useState<string>('all');
  const [kpmOpenedFromProposalDetail, setKpmOpenedFromProposalDetail] = useState(false);

  const [records, setRecords] = useState<KpmRecord[]>(() => {
    clearSampleRecordsOnce();
    return loadKpmRecords(SAMPLE_KPM_RECORDS);
  });
  const [pengelolaList, setPengelolaList] = useState<PengelolaProfile[]>(() =>
    loadPengelolaList(INITIAL_PENGELOLA_LIST)
  );
  const [proposals, setProposals] = useState<ProposalRecord[]>(() =>
    loadProposals(INITIAL_PROPOSAL_LIST)
  );
  const [proposalHistory, setProposalHistory] = useState<ProposalKpmHistoryEntry[]>(() =>
    loadProposalHistory(INITIAL_PROPOSAL_HISTORY)
  );
  const [kpmAuditLogs, setKpmAuditLogs] = useState<KpmAuditLogEntry[]>(() =>
    loadKpmAuditLogs(INITIAL_KPM_AUDIT_LOGS)
  );
  const [items, setItems] = useState<ItemBantuan[]>(() => loadItemList(INITIAL_ITEM_LIST));
  const [pekerjaanList, setPekerjaanList] = useState<string[]>(() =>
    loadPekerjaanList(PEKERJAAN_OPTIONS)
  );
  const [wilayahList, setWilayahList] = useState<WilayahKabKota[]>(() =>
    loadWilayahList(INITIAL_WILAYAH_LIST)
  );
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>(() =>
    loadInternalUsers(INITIAL_INTERNAL_USERS)
  );

  const [editingKpmRecord, setEditingKpmRecord] = useState<KpmRecord | null>(null);
  const [activeKpmId, setActiveKpmId] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [pendingSelectedProposal, setPendingSelectedProposal] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
  const [lockedKpmProposalScope, setLockedKpmProposalScope] = useState<{
    namaProposal: string;
    tahun: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [lightboxDoc, setLightboxDoc] = useState<{ file: KpmDocumentFile; title: string } | null>(
    null
  );

  const activeProposal = useMemo(
    () => (activeProposalId ? proposals.find((p) => p.id === activeProposalId) ?? null : null),
    [activeProposalId, proposals]
  );

  const activeKpmRecord = useMemo(
    () => (activeKpmId ? records.find((r) => r.id === activeKpmId) ?? null : null),
    [activeKpmId, records]
  );

  const currentActor = useMemo(() => {
    const activeAdmin = internalUsers.find((u) => u.status === 'active' && u.role === 'Admin');
    const anyActive = internalUsers.find((u) => u.status === 'active');
    return {
      nama: activeAdmin?.nama ?? anyActive?.nama ?? 'Petugas Internal',
      email: activeAdmin?.email ?? anyActive?.email,
    };
  }, [internalUsers]);

  const pendingUsersCount = useMemo(
    () => internalUsers.filter((u) => u.status === 'pending').length,
    [internalUsers]
  );

  const duplicateNikCount = useMemo(() => {
    const ktpCounts = new Map<string, number>();
    const kkCounts = new Map<string, number>();
    for (const r of records) {
      if (r.nikKtp) ktpCounts.set(r.nikKtp, (ktpCounts.get(r.nikKtp) ?? 0) + 1);
      if (r.nikKk) kkCounts.set(r.nikKk, (kkCounts.get(r.nikKk) ?? 0) + 1);
    }
    let dupes = 0;
    ktpCounts.forEach((c) => {
      if (c > 1) dupes += 1;
    });
    kkCounts.forEach((c) => {
      if (c > 1) dupes += 1;
    });
    return dupes;
  }, [records]);

  useEffect(() => {
    const saved = saveKpmRecords(records);
    if (!saved) {
      setFeedback({
        type: 'error',
        message: 'Penyimpanan lokal penuh. Hapus beberapa data lama untuk menyimpan berkas baru.',
      });
    }
  }, [records]);

  useEffect(() => {
    savePengelolaList(pengelolaList);
  }, [pengelolaList]);

  useEffect(() => {
    const saved = saveProposals(proposals);
    if (!saved) {
      setFeedback({
        type: 'error',
        message:
          'Penyimpanan lokal penuh saat menyimpan data proposal. Gunakan file berukuran lebih ringkas.',
      });
    }
  }, [proposals]);

  useEffect(() => {
    saveProposalHistory(proposalHistory);
  }, [proposalHistory]);

  useEffect(() => {
    saveKpmAuditLogs(kpmAuditLogs);
  }, [kpmAuditLogs]);

  useEffect(() => {
    saveItemList(items);
  }, [items]);

  useEffect(() => {
    savePekerjaanList(pekerjaanList);
  }, [pekerjaanList]);

  useEffect(() => {
    saveWilayahList(wilayahList);
  }, [wilayahList]);

  useEffect(() => {
    saveInternalUsers(internalUsers);
  }, [internalUsers]);

  useEffect(() => {
    setRecords((prev) => recalculateProposalRegisterCodes(prev, proposals, items, wilayahList));
  }, [proposals, items, wilayahList]);

  const latestImportStateRef = useRef({
    records,
    proposals,
    pengelolaList,
    pekerjaanList,
    items,
    wilayahList,
    currentActor,
  });

  latestImportStateRef.current = {
    records,
    proposals,
    pengelolaList,
    pekerjaanList,
    items,
    wilayahList,
    currentActor,
  };

  const handleImportCsv = (
    csvText: string,
    sourceLabel?: string
  ): {
    importedRecords: number;
    importedProposals: number;
    addedPengelola: number;
    skipped: number;
    error?: string;
  } => {
    const state = latestImportStateRef.current;
    const result = importProposalKpmFromCsv({
      csvText,
      existingRecords: state.records,
      existingProposals: state.proposals,
      existingPengelolaList: state.pengelolaList,
      existingPekerjaanList: state.pekerjaanList,
      items: state.items,
      wilayahList: state.wilayahList,
      actorName: state.currentActor.nama,
      actorEmail: state.currentActor.email,
    });

    if (result.importedRecordsCount > 0) {
      setProposals(result.nextProposals);
      setPengelolaList(result.nextPengelolaList);
      setPekerjaanList(result.nextPekerjaanList);
      setRecords(result.nextRecords);
      if (result.newAuditLogs.length > 0) {
        setKpmAuditLogs((prev) => [...result.newAuditLogs, ...prev]);
      }
      if (result.newProposalHistory.length > 0) {
        setProposalHistory((prev) => [...result.newProposalHistory, ...prev]);
      }
      setFeedback({
        type: 'success',
        message: `${result.importedRecordsCount} calon KPM${
          sourceLabel ? ` dari "${sourceLabel}"` : ''
        } berhasil diimpor otomatis.${
          result.skippedCount > 0 ? ` (${result.skippedCount} duplikat dilewati)` : ''
        }`,
      });
    }

    return {
      importedRecords: result.importedRecordsCount,
      importedProposals: result.importedProposalsCount,
      addedPengelola: result.addedPengelolaCount,
      skipped: result.skippedCount,
      error: result.error,
    };
  };

  const seedCsvAttemptedRef = useRef(false);

  useEffect(() => {
    if (seedCsvAttemptedRef.current) return;
    seedCsvAttemptedRef.current = true;

    const SEED_FLAG_KEY = 'masdeta_csv_seed_ptk_kota_2026_v1';
    try {
      if (localStorage.getItem(SEED_FLAG_KEY) === 'done') return;
    } catch {
      // Ignore storage access errors
    }

    let cancelled = false;
    fetch('/assets/aistudio/Kecamatan_Pontianak_Kota_2026_ab18452d.csv')
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('CSV tidak ditemukan'))))
      .then((csvText) => {
        if (cancelled || !csvText) return;
        const summary = handleImportCsv(csvText, 'Kecamatan Pontianak Kota 2026.csv');
        if (summary.importedRecords > 0 || summary.skipped > 0) {
          try {
            localStorage.setItem(SEED_FLAG_KEY, 'done');
          } catch {
            // Ignore storage access errors
          }
        }
      })
      .catch(() => {
        // Ignore seed fetch failure silently
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openKpmDetail = (
    record: KpmRecord,
    fromTab: MainTab = activeTab,
    fromRecap = false
  ) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmDetailReturnToRecap(fromRecap);
    setActiveKpmId(record.id);
    setSubView('kpm-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openSubItemRecap = (fromTab: MainTab = activeTab) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setSubView('subitem-recap');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openKpmForm = (
    record: KpmRecord | null,
    fromTab: MainTab = activeTab,
    returnToDetail = false,
    returnToProposalDetail = false,
    lockedScope: { namaProposal: string; tahun: string } | null = null
  ) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setKpmFormReturnToDetail(returnToDetail);
    setKpmFormReturnToProposalDetail(returnToProposalDetail);
    setLockedKpmProposalScope(lockedScope);
    setEditingKpmRecord(record);
    setSubView('kpm-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAddProposalForm = (fromTab: MainTab = activeTab, fromKpmForm = false) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setAddProposalFromKpmForm(fromKpmForm);
    setSubView('add-proposal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProposalDetailById = (proposalId: string, fromTab: MainTab = activeTab) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('proposal-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditProposalById = (proposalId: string, fromTab: MainTab = returnToTab) => {
    setFeedback(null);
    setReturnToTab(fromTab);
    setActiveProposalId(proposalId);
    setSubView('edit-proposal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenProposalDetailByName = (proposalName: string, tahun: string) => {
    const existing =
      proposals.find((p) => p.namaProposal === proposalName && p.tahun === tahun) ??
      proposals.find((p) => p.namaProposal === proposalName);

    if (existing) {
      openProposalDetailById(existing.id, returnToTab);
    } else {
      const now = new Date().toISOString();
      const created: ProposalRecord = {
        id: `prop-${Date.now()}`,
        tahun: tahun || '2026',
        tipe: 'Murni',
        namaProposal: proposalName,
        jumlahKpm: 66,
        status: 'unlocked',
        checklist: {
          docx: false,
          dinas: false,
          rab: false,
          rt: false,
          rw: false,
          lurah: false,
          camat: false,
        },
        catatan: '',
        documents: {},
        createdAt: now,
        updatedAt: now,
      };
      setProposals((prev) => [created, ...prev]);
      openProposalDetailById(created.id, returnToTab);
    }
  };

  const handleCreatePengelola = (profile: PengelolaProfile) => {
    setPengelolaList((prev) => [profile, ...prev]);
  };

  const handleSaveKpm = (values: KpmFormValues, editingId?: string) => {
    const matchingProposal =
      proposals.find((p) => p.namaProposal === values.proposal && p.tahun === values.tahun) ??
      proposals.find((p) => p.namaProposal === values.proposal);

    if (matchingProposal?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${matchingProposal.namaProposal}" berstatus Terkunci. Data KPM tidak dapat ditambahkan atau diubah.`,
      });
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      const previousRecord = records.find((r) => r.id === editingId);
      if (previousRecord) {
        const prevProp =
          proposals.find(
            (p) => p.namaProposal === previousRecord.proposal && p.tahun === previousRecord.tahun
          ) ?? proposals.find((p) => p.namaProposal === previousRecord.proposal);

        if (prevProp?.status === 'locked') {
          setFeedback({
            type: 'error',
            message: `Proposal "${prevProp.namaProposal}" berstatus Terkunci. Calon KPM tidak dapat dipindahkan atau diubah.`,
          });
          return;
        }

        // Field-level diff audit log for this KPM
        const fieldChanges = diffKpmRecordChanges(previousRecord, values);
        if (fieldChanges.length > 0) {
          const auditEntry: KpmAuditLogEntry = {
            id: `audit-upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kpmId: previousRecord.id,
            action: 'updated',
            actorName: currentActor.nama,
            actorEmail: currentActor.email,
            timestamp: now,
            proposal: values.proposal,
            tahun: values.tahun,
            changes: fieldChanges,
          };
          setKpmAuditLogs((prev) => [auditEntry, ...prev]);
        }

        // Track proposal move history if proposal or tahun changed
        if (
          previousRecord.proposal !== values.proposal ||
          previousRecord.tahun !== values.tahun
        ) {
          const moveOutEntry: ProposalKpmHistoryEntry = {
            id: `hist-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tahun: previousRecord.tahun,
            proposalName: previousRecord.proposal,
            kpmId: previousRecord.id,
            kpmName: values.nama,
            registerCode: previousRecord.registerCode,
            action: 'moved_out',
            fromProposal: previousRecord.proposal,
            toProposal: values.proposal,
            actorName: currentActor.nama,
            timestamp: now,
          };
          const moveInEntry: ProposalKpmHistoryEntry = {
            id: `hist-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tahun: values.tahun,
            proposalName: values.proposal,
            kpmId: previousRecord.id,
            kpmName: values.nama,
            registerCode: previousRecord.registerCode,
            action: 'moved_in',
            fromProposal: previousRecord.proposal,
            toProposal: values.proposal,
            actorName: currentActor.nama,
            timestamp: now,
          };
          setProposalHistory((prev) => [moveInEntry, moveOutEntry, ...prev]);
        }
      }

      setRecords((prev) => {
        const mapped = prev.map((rec) =>
          rec.id === editingId
            ? {
                ...rec,
                ...values,
                validasi: values.validasi || rec.validasi,
                updatedAt: now,
              }
            : rec
        );
        return recalculateProposalRegisterCodes(mapped, proposals, items, wilayahList);
      });
      setEditingKpmRecord(null);
      if (kpmFormReturnToDetail && activeKpmId) {
        setKpmFormReturnToDetail(false);
        setSubView('kpm-detail');
      } else {
        setSubView('none');
        setActiveTab(returnToTab);
      }
      setFeedback({
        type: 'success',
        message: `Data calon KPM "${values.nama}" berhasil diperbarui.`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const rawNewRecord: KpmRecord = {
      id: `kpm-${Date.now()}`,
      registerCode: generateRegisterCode(
        values.tahun,
        values.item,
        records.filter((r) => r.proposal === values.proposal && r.tahun === values.tahun).length
      ),
      ...values,
      validasi: values.validasi || 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const nextRecordsList = recalculateProposalRegisterCodes(
      [rawNewRecord, ...records],
      proposals,
      items,
      wilayahList
    );
    const savedNewRecord =
      nextRecordsList.find((r) => r.id === rawNewRecord.id) ?? rawNewRecord;

    const itemMatch = resolvePackageForKpm(items, savedNewRecord.tahun, savedNewRecord.item);
    const itemDisplay =
      itemMatch && itemMatch.name !== itemMatch.code
        ? `${itemMatch.code} — ${itemMatch.name}`
        : savedNewRecord.item;

    const createdAuditEntry: KpmAuditLogEntry = {
      id: `audit-create-${Date.now()}`,
      kpmId: savedNewRecord.id,
      action: 'created',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: savedNewRecord.proposal,
      tahun: savedNewRecord.tahun,
      changes: [
        {
          field: 'Proposal Awal',
          before: '-',
          after: `${savedNewRecord.proposal} (${savedNewRecord.tahun})`,
        },
        { field: 'Item Bantuan', before: '-', after: itemDisplay },
        {
          field: 'Status Validasi',
          before: '-',
          after: formatValidationLabel(savedNewRecord.validasi),
        },
      ],
    };

    const enteredHistory: ProposalKpmHistoryEntry = {
      id: `hist-enter-${Date.now()}`,
      tahun: savedNewRecord.tahun,
      proposalName: savedNewRecord.proposal,
      kpmId: savedNewRecord.id,
      kpmName: savedNewRecord.nama,
      registerCode: savedNewRecord.registerCode,
      action: 'entered',
      toProposal: savedNewRecord.proposal,
      actorName: currentActor.nama,
      timestamp: now,
    };

    setRecords(nextRecordsList);
    setKpmAuditLogs((prev) => [createdAuditEntry, ...prev]);
    setProposalHistory((prev) => [enteredHistory, ...prev]);
    setPendingSelectedProposal(null);
    setLockedKpmProposalScope(null);
    setSelectedYear(savedNewRecord.tahun);
    setActiveKpmId(savedNewRecord.id);
    setKpmDetailReturnToRecap(false);
    if (kpmFormReturnToProposalDetail && activeProposal) {
      setKpmFormReturnToProposalDetail(false);
      setKpmDetailReturnToProposalDetail(true);
    } else {
      setKpmDetailReturnToProposalDetail(false);
      setReturnToTab('kpm');
    }
    setSubView('kpm-detail');
    setFeedback({
      type: 'success',
      message: `Calon KPM "${savedNewRecord.nama}" (${savedNewRecord.registerCode}) berhasil disimpan.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteKpm = (id: string) => {
    const target = records.find((r) => r.id === id);
    if (!target) return;
    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${prop.namaProposal}" sedang Terkunci. Data KPM tidak dapat dihapus.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const removedHistory: ProposalKpmHistoryEntry = {
      id: `hist-del-${Date.now()}`,
      tahun: target.tahun,
      proposalName: target.proposal,
      kpmId: target.id,
      kpmName: target.nama,
      registerCode: target.registerCode,
      action: 'removed',
      fromProposal: target.proposal,
      actorName: currentActor.nama,
      timestamp: now,
    };

    setProposalHistory((prev) => [removedHistory, ...prev]);
    setRecords((prev) =>
      recalculateProposalRegisterCodes(
        prev.filter((r) => r.id !== id),
        proposals,
        items,
        wilayahList
      )
    );
    if (activeKpmId === id) {
      setActiveKpmId(null);
      setSubView('none');
      setActiveTab('kpm');
    }
    setFeedback({
      type: 'success',
      message: `Data calon KPM "${target.nama}" telah dihapus.`,
    });
  };

  const handleUpdateKpmStatus = (id: string, status: ValidationStatus) => {
    const target = records.find((r) => r.id === id);
    if (!target || target.validasi === status) return;
    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const statusAudit: KpmAuditLogEntry = {
      id: `audit-st-${Date.now()}`,
      kpmId: target.id,
      action: 'status_changed',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: 'Status Validasi',
          before: formatValidationLabel(target.validasi),
          after: formatValidationLabel(status),
        },
      ],
    };

    setKpmAuditLogs((prev) => [statusAudit, ...prev]);
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, validasi: status, updatedAt: now } : r))
    );
  };

  const handleToggleSubItem = (
    kpmId: string,
    subItemKey: string,
    subItemName: string,
    nextDelivered: boolean
  ) => {
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const prevState = target.subItemDeliveries?.[subItemKey]?.delivered ?? false;
    if (prevState === nextDelivered) return;

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: [
        {
          field: `Sub-Item: ${subItemName}`,
          before: prevState ? 'Sudah diterima' : 'Belum diterima',
          after: nextDelivered ? 'Sudah diterima' : 'Belum diterima',
        },
      ],
    };

    setKpmAuditLogs((prev) => [auditEntry, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === kpmId
          ? {
              ...r,
              subItemDeliveries: {
                ...(r.subItemDeliveries || {}),
                [subItemKey]: {
                  delivered: nextDelivered,
                  updatedAt: now,
                  updatedBy: currentActor.nama,
                },
              },
              updatedAt: now,
            }
          : r
      )
    );
  };

  const handleMarkAllSubItemsDelivered = (
    kpmId: string,
    subItems: { key: string; name: string }[]
  ) => {
    const target = records.find((r) => r.id === kpmId);
    if (!target) return;

    const prop =
      proposals.find((p) => p.namaProposal === target.proposal && p.tahun === target.tahun) ??
      proposals.find((p) => p.namaProposal === target.proposal);
    if (prop?.status === 'locked') return;

    const now = new Date().toISOString();
    const existing = target.subItemDeliveries || {};
    const changedSubs = subItems.filter((s) => !(existing[s.key]?.delivered ?? false));
    if (changedSubs.length === 0) return;

    const nextDeliveries = { ...existing };
    for (const s of subItems) {
      nextDeliveries[s.key] = {
        delivered: true,
        updatedAt: now,
        updatedBy: currentActor.nama,
      };
    }

    const auditEntry: KpmAuditLogEntry = {
      id: `audit-suball-${Date.now()}`,
      kpmId: target.id,
      action: 'updated',
      actorName: currentActor.nama,
      actorEmail: currentActor.email,
      timestamp: now,
      proposal: target.proposal,
      tahun: target.tahun,
      changes: changedSubs.map((s) => ({
        field: `Sub-Item: ${s.name}`,
        before: 'Belum diterima',
        after: 'Sudah diterima',
      })),
    };

    setKpmAuditLogs((prev) => [auditEntry, ...prev]);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === kpmId
          ? {
              ...r,
              subItemDeliveries: nextDeliveries,
              updatedAt: now,
            }
          : r
      )
    );
  };

  const handleDeleteCatalogItem = (tahun: string, code: string) => {
    setItems((prev) => prev.filter((i) => !(i.tahun === tahun && i.code === code)));
  };

  const handleMoveItemOrder = (tahun: string, code: string, direction: 'up' | 'down') => {
    setItems((prev) => {
      const yearIndices: number[] = [];
      prev.forEach((item, idx) => {
        if (item.tahun === tahun) yearIndices.push(idx);
      });
      const pos = yearIndices.findIndex((idx) => prev[idx].code === code);
      if (pos < 0) return prev;
      const targetPos = direction === 'up' ? pos - 1 : pos + 1;
      if (targetPos < 0 || targetPos >= yearIndices.length) return prev;
      const next = [...prev];
      const idxA = yearIndices[pos];
      const idxB = yearIndices[targetPos];
      [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
      return next;
    });
  };

  const handleUpdateItemSubItems = (tahun: string, code: string, subItems: string[]) => {
    setItems((prev) =>
      prev.map((i) =>
        i.tahun === tahun && i.code === code
          ? { ...i, subItems }
          : i
      )
    );
  };

  const handleCopyItemsFromYear = (fromYear: string, toYear: string) => {
    setItems((prev) => {
      const source = prev.filter((i) => i.tahun === fromYear);
      const existingCodes = new Set(prev.filter((i) => i.tahun === toYear).map((i) => i.code));
      const additions = source
        .filter((s) => !existingCodes.has(s.code))
        .map((s) => ({
          ...s,
          id: `${toYear}-${s.code}`,
          tahun: toYear,
          subItems: [...s.subItems],
        }));
      return [...prev, ...additions];
    });
  };

  const handleCreateProposal = (values: ProposalFormValues) => {
    const now = new Date().toISOString();
    if (!values.tipe) return;

    const newProposal: ProposalRecord = {
      id: `prop-${Date.now()}`,
      tahun: values.tahun,
      tipe: values.tipe,
      kabKota: values.kabKota,
      kecamatan: values.kecamatan,
      kelurahan: values.kelurahan,
      jalan: values.jalan,
      namaProposal: values.namaProposal,
      jumlahKpm: values.jumlahKpm ?? 66,
      status: values.status,
      checklist: values.checklist,
      catatan: values.catatan,
      documents: values.documents,
      createdAt: now,
      updatedAt: now,
    };

    setProposals((prev) => [newProposal, ...prev]);

    if (addProposalFromKpmForm && newProposal.status === 'unlocked') {
      setPendingSelectedProposal({
        namaProposal: newProposal.namaProposal,
        tahun: newProposal.tahun,
      });
    } else {
      setPendingSelectedProposal(null);
    }

    setSelectedYear(newProposal.tahun);
    if (addProposalFromKpmForm) {
      setAddProposalFromKpmForm(false);
      setSubView('kpm-form');
    } else {
      setSubView('none');
      setActiveTab(returnToTab === 'kpm' ? 'proposal' : returnToTab);
    }
    setFeedback({
      type: 'success',
      message:
        newProposal.status === 'locked'
          ? `Proposal "${newProposal.namaProposal}" (${newProposal.tahun}) disimpan dalam status Terkunci.`
          : `Proposal "${newProposal.namaProposal}" (${newProposal.tahun}) berhasil ditambahkan.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateProposal = (proposalId: string, values: ProposalFormValues) => {
    const existing = proposals.find((p) => p.id === proposalId);
    if (!existing || !values.tipe) return;

    if (existing.status === 'locked') {
      setFeedback({
        type: 'error',
        message: `Proposal "${existing.namaProposal}" sedang Terkunci dan tidak dapat diubah.`,
      });
      return;
    }

    const now = new Date().toISOString();
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              tahun: values.tahun,
              tipe: values.tipe as ProposalRecord['tipe'],
              jumlahKpm: values.jumlahKpm ?? p.jumlahKpm ?? 66,
              status: values.status,
              checklist: values.checklist,
              catatan: values.catatan,
              documents: values.documents,
              updatedAt: now,
            }
          : p
      )
    );

    setSubView('proposal-detail');
    setFeedback({
      type: 'success',
      message: `Proposal "${existing.namaProposal}" (${values.tahun}) berhasil diperbarui.`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleProposalLock = (proposalId: string) => {
    const target = proposals.find((p) => p.id === proposalId);
    if (!target) return;

    const nextStatus = target.status === 'locked' ? 'unlocked' : 'locked';
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    setFeedback({
      type: 'success',
      message:
        nextStatus === 'locked'
          ? `Proposal "${target.namaProposal}" dikunci. Seluruh data proposal & KPM di dalamnya kini tidak dapat diedit.`
          : `Kunci proposal "${target.namaProposal}" dibuka. Data kembali dapat diedit.`,
    });
  };

  const handleUpdateUserStatus = (
    userId: string,
    status: InternalUserStatus,
    role?: InternalUserRole
  ) => {
    const now = new Date().toISOString();
    setInternalUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status,
              role: role ?? u.role,
              updatedAt: now,
            }
          : u
      )
    );
  };

  const handleRegisterInternalUser = (
    user: Omit<InternalUser, 'id' | 'status' | 'registeredAt' | 'updatedAt'>
  ) => {
    const now = new Date().toISOString();
    const created: InternalUser = {
      id: `usr-${Date.now()}`,
      ...user,
      status: 'pending',
      registeredAt: now,
      updatedAt: now,
    };
    setInternalUsers((prev) => [created, ...prev]);
  };

  const showBottomNav = subView === 'none' && !(activeTab === 'menu' && menuSection !== 'root');

  return (
    <div className="min-h-screen bg-slate-200/70 sm:py-3">
      <OfflineIndicator />
      {/* Dedicated Mobile Viewport Shell */}
      <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
        {/* Sub-Views */}
        {subView === 'kpm-detail' && activeKpmRecord && (
          <KpmDetailView
            record={activeKpmRecord}
            allRecords={records}
            proposals={proposals}
            items={items}
            wilayahList={wilayahList}
            auditLogs={kpmAuditLogs}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              setFeedback(null);
              setActiveKpmId(null);
              if (kpmDetailReturnToProposalDetail && activeProposal) {
                setKpmDetailReturnToProposalDetail(false);
                setSubView('proposal-detail');
              } else if (kpmDetailReturnToRecap) {
                setKpmDetailReturnToRecap(false);
                setSubView('subitem-recap');
              } else {
                setSubView('none');
                setActiveTab(returnToTab);
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEditRecord={(rec) => openKpmForm(rec, returnToTab, true)}
            onDeleteRecord={handleDeleteKpm}
            onUpdateStatus={handleUpdateKpmStatus}
            onToggleSubItem={handleToggleSubItem}
            onMarkAllSubItemsDelivered={handleMarkAllSubItemsDelivered}
            onSelectDuplicateRecord={(dup) => {
              setActiveKpmId(dup.id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProposal={(proposalName, tahun) =>
              handleOpenProposalDetailByName(proposalName, tahun)
            }
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}

        {subView === 'subitem-recap' && (
          <SubItemRecapView
            records={records}
            items={items}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            onBack={() => {
              setFeedback(null);
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSelectKpm={(rec) => openKpmDetail(rec, returnToTab, true)}
          />
        )}

        {(subView === 'kpm-form' || (subView === 'add-proposal' && addProposalFromKpmForm)) && (
          <div className={subView === 'kpm-form' ? '' : 'hidden'}>
            <KpmRegistrationForm
              editingRecord={editingKpmRecord}
              pengelolaList={pengelolaList}
              proposals={proposals}
              itemOptions={items}
              pekerjaanOptions={pekerjaanList}
              wilayahList={wilayahList}
              feedback={feedback}
              onDismissFeedback={() => setFeedback(null)}
              preselectedProposal={pendingSelectedProposal}
              lockedProposalScope={lockedKpmProposalScope}
              onClearPreselectedProposal={() => setPendingSelectedProposal(null)}
              onBack={() => {
                setFeedback(null);
                setEditingKpmRecord(null);
                setLockedKpmProposalScope(null);
                if (kpmFormReturnToDetail && activeKpmId) {
                  setKpmFormReturnToDetail(false);
                  setSubView('kpm-detail');
                } else if (kpmFormReturnToProposalDetail && activeProposal) {
                  setKpmFormReturnToProposalDetail(false);
                  setSubView('proposal-detail');
                } else {
                  setSubView('none');
                  setActiveTab(returnToTab);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenAddProposal={() => openAddProposalForm('kpm', true)}
              onCreatePengelola={handleCreatePengelola}
              onSave={handleSaveKpm}
              onCancelEdit={() => {
                setEditingKpmRecord(null);
                setLockedKpmProposalScope(null);
                if (kpmFormReturnToDetail && activeKpmId) {
                  setKpmFormReturnToDetail(false);
                  setSubView('kpm-detail');
                } else if (kpmFormReturnToProposalDetail && activeProposal) {
                  setKpmFormReturnToProposalDetail(false);
                  setSubView('proposal-detail');
                } else {
                  setSubView('none');
                  setActiveTab(returnToTab);
                }
              }}
              onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
            />
          </div>
        )}

        {subView === 'add-proposal' && (
          <AddProposalForm
            existingProposals={proposals}
            wilayahList={wilayahList}
            onBack={() => {
              setFeedback(null);
              if (addProposalFromKpmForm) {
                setAddProposalFromKpmForm(false);
                setSubView('kpm-form');
              } else {
                setSubView('none');
                setActiveTab(returnToTab);
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveNewProposal={handleCreateProposal}
          />
        )}

        {subView === 'proposal-detail' && activeProposal && (
          <ProposalDetailView
            proposal={activeProposal}
            records={records}
            items={items}
            historyEntries={proposalHistory}
            onBack={() => {
              setFeedback(null);
              setSubView('none');
              setActiveTab(returnToTab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEditProposal={(id) => openEditProposalById(id, returnToTab)}
            onAddKpmInProposal={(proposalName, tahun) => {
              openKpmForm(null, returnToTab, false, true, {
                namaProposal: proposalName,
                tahun,
              });
            }}
            onViewKpmInProposal={(proposalName, tahun) => {
              setSelectedYear(tahun);
              setKpmStatusFilter('all');
              setKpmItemFilter('all');
              setKpmProposalFilter(proposalName);
              setKpmOpenedFromProposalDetail(true);
              setSubView('none');
              setActiveTab('kpm');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'edit-proposal' && activeProposal && (
          <ProposalForm
            proposal={activeProposal}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => {
              setFeedback(null);
              setSubView('proposal-detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSaveProposal={handleUpdateProposal}
            onToggleProposalLock={handleToggleProposalLock}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}

        {/* Top-Level Main Tabs */}
        {subView === 'none' && activeTab === 'dashboard' && (
          <DashboardView
            logo={<MasdetaLogo />}
            selectedYear={selectedYear}
            onChangeYear={(y) => setSelectedYear(y)}
            records={records}
            proposals={proposals}
            items={items}
            pendingUsersCount={pendingUsersCount}
            duplicateNikCount={duplicateNikCount}
            feedback={feedback}
            onDismissFeedback={() => setFeedback(null)}
            onOpenKpmList={(filter) => {
              setKpmStatusFilter(filter?.status ?? 'all');
              setKpmItemFilter(filter?.item ?? 'all');
              setKpmProposalFilter('all');
              setKpmOpenedFromProposalDetail(false);
              setActiveTab('kpm');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenSubItemRecap={() => openSubItemRecap('dashboard')}
            onOpenProposalList={() => {
              setActiveTab('proposal');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'dashboard')}
            onOpenAddProposal={() => openAddProposalForm('dashboard')}
            onOpenUserApproval={() => {
              setMenuSection('users');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenDuplicateCheck={() => {
              setMenuSection('duplikasi');
              setActiveTab('menu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {subView === 'none' && activeTab === 'kpm' && (
          <KpmListView
            records={records}
            proposals={proposals}
            items={items}
            wilayahList={wilayahList}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            statusFilter={kpmStatusFilter}
            onChangeStatusFilter={setKpmStatusFilter}
            itemFilter={kpmItemFilter}
            onChangeItemFilter={setKpmItemFilter}
            proposalFilter={kpmProposalFilter}
            onChangeProposalFilter={setKpmProposalFilter}
            onBack={() => {
              if (kpmOpenedFromProposalDetail && activeProposal) {
                setKpmOpenedFromProposalDetail(false);
                setSubView('proposal-detail');
              } else {
                setActiveTab('dashboard');
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onCreateNew={() => openKpmForm(null, 'kpm')}
            onSelectRecord={(rec) => openKpmDetail(rec, 'kpm')}
          />
        )}

        {subView === 'none' && activeTab === 'proposal' && (
          <ProposalListView
            proposals={proposals}
            records={records}
            selectedYear={selectedYear}
            onChangeYear={setSelectedYear}
            onOpenProposalDetail={(id) => openProposalDetailById(id, 'proposal')}
            onOpenAddProposal={() => openAddProposalForm('proposal')}
          />
        )}

        {subView === 'none' && activeTab === 'menu' && (
          <MenuHubView
            activeSection={menuSection}
            onChangeSection={setMenuSection}
            records={records}
            proposals={proposals}
            items={items}
            pekerjaanList={pekerjaanList}
            pengelolaList={pengelolaList}
            wilayahList={wilayahList}
            internalUsers={internalUsers}
            onAddItem={(item) => setItems((prev) => [...prev, item])}
            onDeleteItem={handleDeleteCatalogItem}
            onMoveItemOrder={handleMoveItemOrder}
            onUpdateItemSubItems={handleUpdateItemSubItems}
            onCopyItemsFromYear={handleCopyItemsFromYear}
            onAddPekerjaan={(job) => setPekerjaanList((prev) => [...prev, job])}
            onUpdateWilayahList={setWilayahList}
            onOpenAddProposal={() => openAddProposalForm('menu')}
            onOpenSubItemRecap={() => openSubItemRecap('menu')}
            onAddPengelola={handleCreatePengelola}
            onUpdateUserStatus={handleUpdateUserStatus}
            onRegisterInternalUser={handleRegisterInternalUser}
            onImportCsv={handleImportCsv}
            onSelectKpmFromDuplicate={(rec) => openKpmDetail(rec, 'menu')}
            onPreviewDocument={(file, title) => setLightboxDoc({ file, title })}
          />
        )}
      </div>

      {/* Bottom Navigation Bar with Central Circular Add Button */}
      {showBottomNav && (
        <BottomNavBar
          activeTab={activeTab}
          pendingUsersCount={pendingUsersCount}
          onSelectTab={(tab) => {
            setFeedback(null);
            if (tab === 'menu') setMenuSection('root');
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        />
      )}

      {/* Center "+" Action Sheet */}
      <QuickAddSheet
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddKpm={() => openKpmForm(null, activeTab)}
        onAddProposal={() => openAddProposalForm(activeTab)}
      />

      {/* Fullscreen Document & PDF Lightbox */}
      <DocumentLightbox
        documentFile={lightboxDoc?.file ?? null}
        title={lightboxDoc?.title ?? ''}
        onClose={() => setLightboxDoc(null)}
      />
    </div>
  );
}
