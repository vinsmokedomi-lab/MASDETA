import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  Download,
  FileSpreadsheet,
  FolderPlus,
  Layers,
  MapPin,
  Package,
  PackagePlus,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { SegmentedTabs } from './FormControls';
import { AddPengelolaModal } from './PengelolaSelectorModal';
import { PWAInstallButton } from './PWAInstallButton';
import {
  DTSEN_OPTION_ITEMS,
  TAHUN_OPTIONS,
} from '../data/kpmOptions';
import {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmDocumentFile,
  KpmRecord,
  PengelolaProfile,
  ProposalRecord,
  WilayahKabKota,
} from '../types/kpm';
import {
  capitalizeWords,
  exportKpmRecordsToCsv,
  formatNikDisplay,
  formatRupiah,
  formatUploadDateTime,
  getItemsForYear,
  normalizeSubItemKey,
} from '../utils/imageProcessor';

export type MenuSection =
  | 'root'
  | 'setting'
  | 'users'
  | 'duplikasi'
  | 'administrasi'
  | 'dtsen'
  | 'pengelola'
  | 'pekerjaan'
  | 'laporan';

interface MenuHubViewProps {
  activeSection: MenuSection;
  onChangeSection: (section: MenuSection) => void;
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pekerjaanList: string[];
  wilayahList: WilayahKabKota[];
  pengelolaList: PengelolaProfile[];
  internalUsers: InternalUser[];
  onAddItem: (item: ItemBantuan) => void;
  onDeleteItem: (tahun: string, code: string) => void;
  onUpdateItemSubItems: (tahun: string, code: string, subItems: string[]) => void;
  onCopyItemsFromYear: (fromYear: string, toYear: string) => void;
  onAddPekerjaan: (name: string) => void;
  onUpdateWilayahList: (nextList: WilayahKabKota[]) => void;
  onOpenAddProposal: () => void;
  onOpenSubItemRecap: () => void;
  onAddPengelola: (profile: PengelolaProfile) => void;
  onUpdateUserStatus: (userId: string, status: InternalUserStatus, role?: InternalUserRole) => void;
  onRegisterInternalUser: (user: Omit<InternalUser, 'id' | 'status' | 'registeredAt' | 'updatedAt'>) => void;
  onSelectKpmFromDuplicate: (record: KpmRecord) => void;
  onPreviewDocument: (file: KpmDocumentFile, title: string) => void;
}

export function MenuHubView({
  activeSection,
  onChangeSection,
  records,
  proposals,
  items,
  pekerjaanList,
  wilayahList,
  pengelolaList,
  internalUsers,
  onAddItem,
  onDeleteItem,
  onUpdateItemSubItems,
  onCopyItemsFromYear,
  onAddPekerjaan,
  onUpdateWilayahList,
  onOpenAddProposal,
  onOpenSubItemRecap,
  onAddPengelola,
  onUpdateUserStatus,
  onRegisterInternalUser,
  onSelectKpmFromDuplicate,
  onPreviewDocument,
}: MenuHubViewProps) {
  // Master Item & Sub-Item form (year-versioned)
  const [selectedItemYear, setSelectedItemYear] = useState<string>('2026');
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSubItemsText, setNewItemSubItemsText] = useState('');
  const [expandedItemCode, setExpandedItemCode] = useState<string | null>(null);
  const [newSubItemInput, setNewSubItemInput] = useState('');

  // Master Pekerjaan modal state
  const [isAddPekerjaanOpen, setIsAddPekerjaanOpen] = useState(false);
  const [newPekerjaan, setNewPekerjaan] = useState('');
  const [pekerjaanError, setPekerjaanError] = useState<string | null>(null);

  // Master Wilayah state
  const [newKabKotaInput, setNewKabKotaInput] = useState('');
  const [wilayahError, setWilayahError] = useState<string | null>(null);
  const [expandedKabId, setExpandedKabId] = useState<string | null>(
    () => wilayahList[0]?.id ?? null
  );
  const [expandedKecId, setExpandedKecId] = useState<string | null>(null);
  const [newKecamatanByKab, setNewKecamatanByKab] = useState<Record<string, string>>({});
  const [newKelurahanByKec, setNewKelurahanByKec] = useState<Record<string, string>>({});

  // Pengelola modal state
  const [isAddPengelolaOpen, setIsAddPengelolaOpen] = useState(false);

  // Internal User registration simulation / submission form (pending approval)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regNama, setRegNama] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regJabatan, setRegJabatan] = useState('');
  const [regKontak, setRegKontak] = useState('');
  const [regRole, setRegRole] = useState<InternalUserRole>('Petugas');

  // Active sub-tab in Setting
  const [settingPanel, setSettingPanel] = useState<'main' | 'items' | 'wilayah'>('main');

  // User filter
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | InternalUserStatus>('all');

  const pendingUsersCount = useMemo(
    () => internalUsers.filter((u) => u.status === 'pending').length,
    [internalUsers]
  );

  // Detect duplicate NIK KTP or NIK KK across KPM records
  const duplicateGroups = useMemo(() => {
    const byKtp = new Map<string, KpmRecord[]>();
    const byKk = new Map<string, KpmRecord[]>();

    for (const r of records) {
      if (r.nikKtp) {
        const arr = byKtp.get(r.nikKtp) ?? [];
        arr.push(r);
        byKtp.set(r.nikKtp, arr);
      }
      if (r.nikKk) {
        const arr = byKk.get(r.nikKk) ?? [];
        arr.push(r);
        byKk.set(r.nikKk, arr);
      }
    }

    const groups: { type: 'NIK KTP' | 'Nomor KK'; value: string; records: KpmRecord[] }[] = [];
    byKtp.forEach((recs, key) => {
      if (recs.length > 1) groups.push({ type: 'NIK KTP', value: key, records: recs });
    });
    byKk.forEach((recs, key) => {
      if (recs.length > 1) groups.push({ type: 'Nomor KK', value: key, records: recs });
    });
    return groups;
  }, [records]);

  const adminStats = useMemo(() => {
    const paidRecords = records.filter((r) => r.payment > 0);
    const totalAmount = paidRecords.reduce((sum, r) => sum + (r.payment || 0), 0);
    return { paidRecords, totalAmount };
  }, [records]);

  const dtsenSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      const key = r.dtsen || 'Belum Ada Desil';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return DTSEN_OPTION_ITEMS.map((opt) => ({
      ...opt,
      count: map.get(opt.value) ?? 0,
    }));
  }, [records]);

  const itemYearOptions = useMemo(() => {
    const set = new Set<string>(TAHUN_OPTIONS);
    items.forEach((i) => {
      if (i.tahun) set.add(i.tahun);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const yearCatalogItems = useMemo(
    () => getItemsForYear(items, selectedItemYear),
    [items, selectedItemYear]
  );

  const canonicalSubItemSuggestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of items) {
      for (const s of pkg.subItems) {
        const key = normalizeSubItemKey(s);
        if (key && !map.has(key)) map.set(key, s);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const handleAddItemSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = newItemCode.trim().toUpperCase();
    const name = capitalizeWords(newItemName.trim());
    if (!code || !name) return;
    if (yearCatalogItems.some((i) => i.code === code)) return;

    const parsedSubs = newItemSubItemsText
      .split(',')
      .map((s) => capitalizeWords(s.trim()))
      .filter(Boolean);

    onAddItem({
      id: `${selectedItemYear}-${code}`,
      tahun: selectedItemYear,
      code,
      name,
      subItems: parsedSubs.length > 0 ? parsedSubs : [name],
    });
    setNewItemCode('');
    setNewItemName('');
    setNewItemSubItemsText('');
  };

  const handleAddSubItemToPackage = (pkg: ItemBantuan) => {
    const raw = newSubItemInput.trim();
    if (!raw) return;
    const key = normalizeSubItemKey(raw);
    const existingCanonical =
      canonicalSubItemSuggestions.find((s) => normalizeSubItemKey(s) === key) ||
      capitalizeWords(raw);
    if (pkg.subItems.some((s) => normalizeSubItemKey(s) === key)) {
      setNewSubItemInput('');
      return;
    }
    onUpdateItemSubItems(pkg.tahun, pkg.code, [...pkg.subItems, existingCanonical]);
    setNewSubItemInput('');
  };

  const handleAddPekerjaanSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = capitalizeWords(newPekerjaan.trim());
    if (!name) {
      setPekerjaanError('Nama pekerjaan wajib diisi.');
      return;
    }
    if (pekerjaanList.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setPekerjaanError(`Pekerjaan "${name}" sudah terdaftar.`);
      return;
    }
    onAddPekerjaan(name);
    setNewPekerjaan('');
    setPekerjaanError(null);
    setIsAddPekerjaanOpen(false);
  };

  const handleAddKabKotaSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = capitalizeWords(newKabKotaInput.trim());
    if (!clean) {
      setWilayahError('Nama Kabupaten / Kota wajib diisi.');
      return;
    }
    if (wilayahList.some((w) => w.nama.toLowerCase() === clean.toLowerCase())) {
      setWilayahError(`Wilayah "${clean}" sudah terdaftar.`);
      return;
    }
    const created: WilayahKabKota = {
      id: `wil-${Date.now()}`,
      nama: clean,
      kecamatanList: [],
    };
    onUpdateWilayahList([...wilayahList, created]);
    setNewKabKotaInput('');
    setWilayahError(null);
    setExpandedKabId(created.id);
  };

  const handleDeleteKabKota = (kabId: string) => {
    onUpdateWilayahList(wilayahList.filter((w) => w.id !== kabId));
    if (expandedKabId === kabId) setExpandedKabId(null);
  };

  const handleAddKecamatan = (kabId: string) => {
    const raw = (newKecamatanByKab[kabId] || '').trim().replace(/^(?:kec\.?|kecamatan)\s+/i, '');
    const clean = capitalizeWords(raw);
    if (!clean) return;
    const newKecId = `kec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        if (kab.kecamatanList.some((k) => k.nama.toLowerCase() === clean.toLowerCase())) {
          return kab;
        }
        return {
          ...kab,
          kecamatanList: [
            ...kab.kecamatanList,
            { id: newKecId, nama: clean, kelurahanList: [] },
          ],
        };
      })
    );
    setNewKecamatanByKab((prev) => ({ ...prev, [kabId]: '' }));
    setExpandedKecId(newKecId);
  };

  const handleDeleteKecamatan = (kabId: string, kecId: string) => {
    onUpdateWilayahList(
      wilayahList.map((kab) =>
        kab.id === kabId
          ? { ...kab, kecamatanList: kab.kecamatanList.filter((k) => k.id !== kecId) }
          : kab
      )
    );
    if (expandedKecId === kecId) setExpandedKecId(null);
  };

  const handleAddKelurahan = (kabId: string, kecId: string) => {
    const raw = (newKelurahanByKec[kecId] || '').trim().replace(/^kel\.?\s+/i, 'Kelurahan ');
    const clean = capitalizeWords(raw);
    if (!clean) return;
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        return {
          ...kab,
          kecamatanList: kab.kecamatanList.map((kec) => {
            if (kec.id !== kecId) return kec;
            if (kec.kelurahanList.some((kel) => kel.toLowerCase() === clean.toLowerCase())) {
              return kec;
            }
            return {
              ...kec,
              kelurahanList: [...kec.kelurahanList, clean],
            };
          }),
        };
      })
    );
    setNewKelurahanByKec((prev) => ({ ...prev, [kecId]: '' }));
  };

  const handleDeleteKelurahan = (kabId: string, kecId: string, kelName: string) => {
    onUpdateWilayahList(
      wilayahList.map((kab) => {
        if (kab.id !== kabId) return kab;
        return {
          ...kab,
          kecamatanList: kab.kecamatanList.map((kec) =>
            kec.id === kecId
              ? { ...kec, kelurahanList: kec.kelurahanList.filter((k) => k !== kelName) }
              : kec
          ),
        };
      })
    );
  };

  const handleRegisterUserSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!regNama.trim() || !regEmail.trim()) return;
    onRegisterInternalUser({
      nama: capitalizeWords(regNama.trim()),
      email: regEmail.trim().toLowerCase(),
      jabatan: regJabatan.trim() || 'Petugas Internal',
      kontak: regKontak.trim(),
      role: regRole,
    });
    setRegNama('');
    setRegEmail('');
    setRegJabatan('');
    setRegKontak('');
    setRegRole('Petugas');
    setIsRegisterModalOpen(false);
  };

  const renderSubHeader = (title: string, onBack: () => void) => (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 shrink-0"
        aria-label="Kembali"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="truncate text-base font-bold text-slate-900">{title}</h1>
    </header>
  );

  // 1. ROOT MENU HUB
  if (activeSection === 'root') {
    return (
      <div className="min-h-screen pb-24">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md">
          <h1 className="truncate text-base font-bold text-slate-900">Menu Operasional</h1>
        </header>

        <div className="space-y-5 px-4 pt-4">
          {/* Group 1: Pemeriksaan & Rekap Data */}
          <section>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Audit & Rekapitulasi
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <button
                type="button"
                onClick={onOpenSubItemRecap}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">Rekapitulasi Item & Sub-Item</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Akumulasi sub-item dan daftar hutang penyaluran
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('duplikasi')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <CopyCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Cek Duplikasi NIK / KK</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Periksa NIK atau KK yang tercatat ganda
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('dtsen')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Sebaran Desil DTSEN</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Klasifikasi Desil 1–10 Kemensos
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('administrasi')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Administrasi & Pelayanan</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Catatan biaya administrasi calon KPM
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('pengelola')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Data Pengelola Lapangan</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Daftar pengelola dan penanggung jawab lapangan
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('pekerjaan')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Pekerjaan</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Daftar pekerjaan dan sebaran jumlah KPM
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onChangeSection('laporan')}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Laporan & Download CSV</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Unduh data KPM dan rekap proposal
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </section>

          {/* Group 2: Sistem Internal & Pengaturan */}
          <section>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-slate-500">
              Internal & Pengaturan
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => onChangeSection('users')}
                className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    Manajemen User Internal
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Persetujuan dan peran akun petugas internal
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettingPanel('main');
                  onChangeSection('setting');
                }}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Pengaturan Master Data</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Kelola item bantuan, pekerjaan, dan proposal
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </section>

          <div className="flex justify-center">
            <PWAInstallButton />
          </div>
        </div>
      </div>
    );
  }

  // 2. MANAJEMEN USER INTERNAL (Replaces "+ TAMBAH USER")
  if (activeSection === 'users') {
    const filteredUsers = internalUsers.filter((u) =>
      userStatusFilter === 'all' ? true : u.status === userStatusFilter
    );

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Manajemen User Internal', () => onChangeSection('root'))}

        <div className="space-y-4 px-4 pt-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-teal-800">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-xs font-bold">Persetujuan Akun Internal</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Tinjau petugas yang mendaftar sebelum memberi akses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(true)}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Simulasi Daftar</span>
              </button>
            </div>

            <SegmentedTabs<'all' | InternalUserStatus>
              className="mt-3"
              value={userStatusFilter}
              onChange={setUserStatusFilter}
              tabs={[
                { key: 'all', label: 'Semua', count: internalUsers.length },
                {
                  key: 'pending',
                  label: 'Menunggu',
                  count: internalUsers.filter((u) => u.status === 'pending').length,
                },
                {
                  key: 'active',
                  label: 'Aktif',
                  count: internalUsers.filter((u) => u.status === 'active').length,
                },
                {
                  key: 'rejected',
                  label: 'Ditolak',
                  count: internalUsers.filter((u) => u.status === 'rejected').length,
                },
              ]}
            />
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Tidak ada akun pada kategori ini</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{user.nama}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-600">{user.jabatan}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {user.email} · {user.kontak || '-'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
                        Terdaftar: {formatUploadDateTime(user.registeredAt)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 text-xs font-bold ${
                        user.status === 'active'
                          ? 'text-teal-700'
                          : user.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-rose-600'
                      }`}
                    >
                      {user.status === 'active'
                        ? 'Aktif'
                        : user.status === 'pending'
                          ? 'Menunggu'
                          : 'Ditolak'}
                    </span>
                  </div>

                  {/* Role Selector & Approval Buttons */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <select
                      aria-label={`Peran untuk ${user.nama}`}
                      value={user.role}
                      onChange={(e) =>
                        onUpdateUserStatus(user.id, user.status, e.target.value as InternalUserRole)
                      }
                      className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:border-teal-700 focus:outline-none"
                    >
                      <option value="Petugas">Petugas Lapangan</option>
                      <option value="Verifikator">Verifikator</option>
                      <option value="Admin">Admin Internal</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      {user.status !== 'active' && (
                        <button
                          type="button"
                          onClick={() => onUpdateUserStatus(user.id, 'active')}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Setujui</span>
                        </button>
                      )}
                      {user.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => onUpdateUserStatus(user.id, 'rejected')}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>{user.status === 'active' ? 'Nonaktifkan' : 'Tolak'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Registration Request Modal (Simulates Internal Staff Sign-Up for Approval) */}
        {isRegisterModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setIsRegisterModalOpen(false)}
          >
            <form
              onSubmit={handleRegisterUserSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Pendaftaran Akun Internal Baru
                </h2>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Pendaftaran baru otomatis berstatus <strong>Menunggu</strong> sampai disetujui
                Admin internal.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  required
                  value={regNama}
                  onChange={(e) => setRegNama(e.target.value)}
                  placeholder="Nama lengkap petugas *"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="Email internal *"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="text"
                  value={regJabatan}
                  onChange={(e) => setRegJabatan(e.target.value)}
                  placeholder="Jabatan / Wilayah tugas"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="tel"
                    value={regKontak}
                    onChange={(e) => setRegKontak(e.target.value)}
                    placeholder="No. HP / WhatsApp"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as InternalUserRole)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Petugas">Petugas</option>
                    <option value="Verifikator">Verifikator</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="mt-4 min-h-[46px] w-full rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Ajukan Pendaftaran Akun
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // 3. MENU SETTING (Master Data: Proposal, Item, Pekerjaan, Manajemen User)
  if (activeSection === 'setting') {
    if (settingPanel === 'items') {
      return (
        <div className="min-h-screen pb-24">
          {renderSubHeader('Kelola Item & Sub-Item', () => setSettingPanel('main'))}
          <div className="space-y-4 px-4 pt-4">
            {/* Year Selector for Package Catalog */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-xs font-bold text-slate-900">Katalog Paket per Tahun</p>
                <p className="text-[11px] text-slate-500">
                  Daftar paket dan sub-item dapat berbeda tiap tahun
                </p>
              </div>
              <div className="relative shrink-0">
                <select
                  aria-label="Pilih tahun katalog item"
                  value={selectedItemYear}
                  onChange={(e) => {
                    setSelectedItemYear(e.target.value);
                    setExpandedItemCode(null);
                  }}
                  className="min-h-[38px] appearance-none rounded-xl border border-slate-200 bg-slate-50 pr-7 pl-3 text-xs font-bold text-slate-900 focus:border-teal-700 focus:bg-white focus:outline-none tabular-nums"
                >
                  {itemYearOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            <form
              onSubmit={handleAddItemSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-900">
                Tambah Paket Item Tahun {selectedItemYear}
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={newItemCode}
                  onChange={(e) => setNewItemCode(e.target.value.toUpperCase())}
                  placeholder="Kode (OV)"
                  className="col-span-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-bold uppercase focus:border-teal-700 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Nama paket (cth: Paket Oven Gas)"
                  className="col-span-2 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={newItemSubItemsText}
                onChange={(e) => setNewItemSubItemsText(e.target.value)}
                placeholder="Sub-item pisah koma (cth: Oven Gas, Mixer, Blender)"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs focus:border-teal-700 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <Plus className="h-4 w-4" />
                <span>Simpan Paket ({selectedItemYear})</span>
              </button>
            </form>

            {yearCatalogItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  Belum ada paket terdaftar untuk tahun {selectedItemYear}
                </p>
                <button
                  type="button"
                  onClick={() => onCopyItemsFromYear('2026', selectedItemYear)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                >
                  Salin Susunan Paket dari Tahun 2026
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                <datalist id="canonical-subitem-suggestions">
                  {canonicalSubItemSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>

                {yearCatalogItems.map((item) => {
                  const isExpanded = expandedItemCode === item.code;
                  return (
                    <div key={`${item.tahun}-${item.code}`} className="bg-white">
                      <div className="flex items-center justify-between gap-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedItemCode(isExpanded ? null : item.code);
                            setNewSubItemInput('');
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-xs font-bold text-teal-800">
                            {item.code}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {item.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {item.subItems.length} sub-item:{' '}
                              {item.subItems.length > 0 ? item.subItems.join(', ') : 'Belum diisi'}
                            </p>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.tahun, item.code)}
                          aria-label={`Hapus item ${item.code} tahun ${item.tahun}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 space-y-2.5">
                          <p className="text-[11px] font-bold text-slate-600">
                            Daftar Sub-Item ({item.code} · {item.tahun})
                          </p>
                          {item.subItems.length > 0 && (
                            <div className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200 bg-white">
                              {item.subItems.map((sub, idx) => (
                                <div
                                  key={`${sub}-${idx}`}
                                  className="flex items-center justify-between gap-2 px-3 py-2"
                                >
                                  <span className="text-xs font-medium text-slate-800">
                                    {idx + 1}. {sub}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateItemSubItems(
                                        item.tahun,
                                        item.code,
                                        item.subItems.filter((_, i) => i !== idx)
                                      )
                                    }
                                    aria-label={`Hapus sub-item ${sub}`}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              list="canonical-subitem-suggestions"
                              value={newSubItemInput}
                              onChange={(e) => setNewSubItemInput(e.target.value)}
                              placeholder="Tambah sub-item (cth: Blender)"
                              className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-teal-700 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSubItemToPackage(item)}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Tambah</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (settingPanel === 'wilayah') {
      return (
        <div className="min-h-screen pb-24">
          {renderSubHeader('Wilayah', () => setSettingPanel('main'))}
          <div className="space-y-4 px-4 pt-4">
            <form
              onSubmit={handleAddKabKotaSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">Tambah Kabupaten / Kota</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tambahkan wilayah ekspansi baru beserta daftar kecamatan dan desa/kelurahan di dalamnya.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoCapitalize="words"
                  value={newKabKotaInput}
                  onChange={(e) => {
                    setNewKabKotaInput(capitalizeWords(e.target.value));
                    if (wilayahError) setWilayahError(null);
                  }}
                  placeholder="Contoh: Kabupaten Kubu Raya"
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm focus:border-teal-700 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah</span>
                </button>
              </div>
              {wilayahError && <p className="text-xs text-rose-600">{wilayahError}</p>}
            </form>

            <div className="space-y-3">
              {wilayahList.map((kab) => {
                const isKabExpanded = expandedKabId === kab.id;
                const totalVillages = kab.kecamatanList.reduce(
                  (sum, k) => sum + k.kelurahanList.length,
                  0
                );

                return (
                  <div
                    key={kab.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center justify-between gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedKabId(isKabExpanded ? null : kab.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{kab.nama}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {kab.kecamatanList.length} Kecamatan · {totalVillages} Kelurahan / Desa
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                            isKabExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteKabKota(kab.id)}
                        aria-label={`Hapus wilayah ${kab.nama}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {isKabExpanded && (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoCapitalize="words"
                            value={newKecamatanByKab[kab.id] || ''}
                            onChange={(e) =>
                              setNewKecamatanByKab((prev) => ({
                                ...prev,
                                [kab.id]: capitalizeWords(e.target.value),
                              }))
                            }
                            placeholder={`Tambah kecamatan di ${kab.nama}...`}
                            className="min-h-[40px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs focus:border-teal-700 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddKecamatan(kab.id)}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Kecamatan</span>
                          </button>
                        </div>

                        {kab.kecamatanList.length === 0 ? (
                          <p className="py-3 text-center text-xs text-slate-500">
                            Belum ada kecamatan di {kab.nama}. Tambahkan di atas.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {kab.kecamatanList.map((kec) => {
                              const isKecExpanded = expandedKecId === kec.id;
                              return (
                                <div
                                  key={kec.id}
                                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedKecId(isKecExpanded ? null : kec.id)
                                      }
                                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-slate-900">
                                          {kec.nama.toLowerCase().startsWith('kecamatan ')
                                            ? kec.nama
                                            : `Kecamatan ${kec.nama}`}
                                        </p>
                                        <p className="text-[11px] text-slate-500 tabular-nums">
                                          {kec.kelurahanList.length} Kelurahan / Desa
                                        </p>
                                      </div>
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                                          isKecExpanded ? 'rotate-180' : ''
                                        }`}
                                      />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteKecamatan(kab.id, kec.id)}
                                      aria-label={`Hapus kecamatan ${kec.nama}`}
                                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {isKecExpanded && (
                                    <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          autoCapitalize="words"
                                          value={newKelurahanByKec[kec.id] || ''}
                                          onChange={(e) =>
                                            setNewKelurahanByKec((prev) => ({
                                              ...prev,
                                              [kec.id]: capitalizeWords(e.target.value),
                                            }))
                                          }
                                          placeholder="Contoh: Desa Kapur / Kelurahan Mariana"
                                          className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs focus:border-teal-700 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleAddKelurahan(kab.id, kec.id)}
                                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                          <span>Tambah</span>
                                        </button>
                                      </div>

                                      {kec.kelurahanList.length === 0 ? (
                                        <p className="text-[11px] text-slate-400">
                                          Belum ada kelurahan / desa terdaftar.
                                        </p>
                                      ) : (
                                        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          {kec.kelurahanList.map((kel) => (
                                            <div
                                              key={kel}
                                              className="flex items-center justify-between gap-2 px-2.5 py-2"
                                            >
                                              <span className="truncate text-xs font-medium text-slate-800">
                                                {kel}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleDeleteKelurahan(kab.id, kec.id, kel)
                                                }
                                                aria-label={`Hapus ${kel}`}
                                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Pengaturan Aplikasi', () => onChangeSection('root'))}
        <div className="px-4 pt-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            <button
              type="button"
              onClick={onOpenAddProposal}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <FolderPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Tambah Proposal Baru</p>
                <p className="text-xs text-slate-500">Buat master proposal wilayah baru</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setSettingPanel('wilayah')}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Wilayah</p>
                <p className="text-xs text-slate-500">
                  Kabupaten / Kota, Kecamatan, dan Desa / Kelurahan
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setSettingPanel('items')}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <PackagePlus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Kelola Item & Sub-Item</p>
                <p className="text-xs text-slate-500">
                  Katalog paket dan sub-item per tahun
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onChangeSection('pekerjaan')}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Kelola Daftar Pekerjaan</p>
                <p className="text-xs text-slate-500">
                  Pilihan pekerjaan pada form calon KPM
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onChangeSection('pengelola')}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Kelola Pengelola Lapangan</p>
                <p className="text-xs text-slate-500">
                  Daftar pengelola lapangan
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onChangeSection('users')}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                <UserCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  Manajemen User Internal
                </p>
                <p className="text-xs text-slate-500">
                  Kelola izin akses petugas internal
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. CEK DUPLIKASI NIK / KK
  if (activeSection === 'duplikasi') {
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Cek Duplikasi NIK / KK', () => onChangeSection('root'))}
        <div className="space-y-4 px-4 pt-4">
          {duplicateGroups.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-bold text-slate-900">Data Bersih dari Duplikasi</p>
              <p className="mt-1 text-xs text-slate-500">
                Tidak ditemukan NIK KTP atau Nomor KK yang sama di seluruh data calon KPM.
              </p>
            </div>
          ) : (
            duplicateGroups.map((group) => (
              <div
                key={`${group.type}-${group.value}`}
                className="overflow-hidden rounded-2xl border border-rose-200 bg-white"
              >
                <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <p className="text-xs font-bold text-rose-900 tabular-nums">
                    {group.type}: {formatNikDisplay(group.value)} ({group.records.length} data)
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.records.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => onSelectKpmFromDuplicate(rec)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{rec.nama}</p>
                        <p className="truncate text-xs text-slate-500">
                          {rec.tahun} · {rec.proposal} · {rec.item}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 5. ADMINISTRASI / BIAYA PELAYANAN
  if (activeSection === 'administrasi') {
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Rekap Administrasi', () => onChangeSection('root'))}
        <div className="space-y-4 px-4 pt-4">
          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <p className="text-xs text-slate-300">Total Biaya Administrasi Tercatat</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatRupiah(adminStats.totalAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-300 tabular-nums">
              Dari {adminStats.paidRecords.length} calon KPM dengan nominal biaya administrasi
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {adminStats.paidRecords.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">
                Belum ada catatan biaya administrasi.
              </p>
            ) : (
              adminStats.paidRecords.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{rec.nama}</p>
                    <p className="truncate text-xs text-slate-500">
                      {rec.registerCode} · {rec.proposal}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-teal-700 tabular-nums shrink-0">
                    {formatRupiah(rec.payment)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // 6. SEBARAN DTSEN
  if (activeSection === 'dtsen') {
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Sebaran Desil DTSEN', () => onChangeSection('root'))}
        <div className="px-4 pt-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {dtsenSummary.map((row) => (
              <div key={row.value} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs font-medium text-slate-800">{row.label}</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 7. PENGELOLA
  if (activeSection === 'pengelola') {
    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Data Pengelola Lapangan', () => onChangeSection('root'))}
        <div className="space-y-4 px-4 pt-4">
          <button
            type="button"
            onClick={() => setIsAddPengelolaOpen(true)}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Pengelola Baru</span>
          </button>

          {pengelolaList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                Belum ada data pengelola lapangan
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ketuk tombol di atas untuk mendaftarkan pengelola lapangan baru.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {pengelolaList.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {p.foto ? (
                      <button
                        type="button"
                        onClick={() => onPreviewDocument(p.foto!, p.displayName)}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                        aria-label={`Lihat foto ${p.displayName}`}
                      >
                        <img
                          src={p.foto.dataUrl}
                          alt={p.displayName}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{p.displayName}</p>
                      {(p.kelurahan || p.kecamatan || p.kabKota || p.kontak) && (
                        <p className="truncate text-xs text-slate-500">
                          {[
                            p.kelurahan ? p.kelurahan.replace(/^kel\.?\s+/i, 'Kelurahan ') : '',
                            p.kecamatan
                              ? p.kecamatan.toLowerCase().startsWith('kecamatan ')
                                ? p.kecamatan
                                : `Kecamatan ${p.kecamatan.replace(/^kec\.?\s+/i, '')}`
                              : '',
                            p.kabKota || '',
                            p.kontak,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                    {records.filter((r) => r.pengelola === p.displayName).length} KPM
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <AddPengelolaModal
          isOpen={isAddPengelolaOpen}
          wilayahList={wilayahList}
          onClose={() => setIsAddPengelolaOpen(false)}
          onCreatePengelola={onAddPengelola}
          onPreviewDocument={onPreviewDocument}
        />
      </div>
    );
  }

  // 8. PEKERJAAN
  if (activeSection === 'pekerjaan') {
    const jobCounts = new Map<string, number>();
    for (const rec of records) {
      if (rec.pekerjaan) {
        const key = rec.pekerjaan.trim().toLowerCase();
        jobCounts.set(key, (jobCounts.get(key) ?? 0) + 1);
      }
    }

    return (
      <div className="min-h-screen pb-24">
        {renderSubHeader('Pekerjaan', () => onChangeSection('root'))}
        <div className="space-y-4 px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              setNewPekerjaan('');
              setPekerjaanError(null);
              setIsAddPekerjaanOpen(true);
            }}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Pekerjaan Baru</span>
          </button>

          {pekerjaanList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Belum ada daftar pekerjaan</p>
              <p className="mt-1 text-xs text-slate-500">
                Ketuk tombol di atas untuk menambahkan jenis pekerjaan baru.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {pekerjaanList.map((job) => {
                const count = jobCounts.get(job.trim().toLowerCase()) ?? 0;
                return (
                  <div key={job} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {job}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-700 tabular-nums">
                      {count} KPM
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Pekerjaan Modal */}
        {isAddPekerjaanOpen && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setIsAddPekerjaanOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Tambah Pekerjaan Baru"
          >
            <form
              onSubmit={handleAddPekerjaanSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-base font-bold text-slate-900">Tambah Pekerjaan Baru</h2>
                <button
                  type="button"
                  onClick={() => setIsAddPekerjaanOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div>
                <label htmlFor="modal-pekerjaan-nama" className="block text-xs font-semibold text-slate-700">
                  Nama Pekerjaan <span className="text-rose-600">*</span>
                </label>
                <input
                  id="modal-pekerjaan-nama"
                  type="text"
                  autoFocus
                  autoCapitalize="words"
                  value={newPekerjaan}
                  onChange={(e) => {
                    setNewPekerjaan(capitalizeWords(e.target.value));
                    if (pekerjaanError) setPekerjaanError(null);
                  }}
                  placeholder="Contoh: Penjahit Rumahan"
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 ${
                    pekerjaanError ? 'border-rose-400' : 'border-slate-300'
                  }`}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Huruf awal setiap kata otomatis kapital.
                </p>
                {pekerjaanError && (
                  <p className="mt-1 text-xs text-rose-600">{pekerjaanError}</p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPekerjaanOpen(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan Pekerjaan
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // 8. LAPORAN & DOWNLOAD CSV
  return (
    <div className="min-h-screen pb-24">
      {renderSubHeader('Laporan & Download Data', () => onChangeSection('root'))}
      <div className="space-y-4 px-4 pt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Ekspor Data Calon KPM (.CSV)</h2>
          <p className="text-xs text-slate-500">
            Unduh seluruh daftar calon KPM beserta NIK, item, DTSEN, validasi, dan biaya
            administrasi ke file Excel / CSV.
          </p>
          <div className="grid grid-cols-1 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => exportKpmRecordsToCsv(records, 'masdeta-semua-kpm.csv', items)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Download className="h-4 w-4" />
              <span>Download Semua KPM ({records.length})</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportKpmRecordsToCsv(
                  records.filter((r) => r.validasi === 'accepted'),
                  'masdeta-kpm-diterima.csv',
                  items
                )
              }
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              <span>
                Download KPM Diterima ({records.filter((r) => r.validasi === 'accepted').length})
              </span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Rekap Proposal per Tahun</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {Array.from(new Set(proposals.map((p) => p.tahun)))
              .sort((a, b) => b.localeCompare(a))
              .map((tahun) => {
                const propCount = proposals.filter((p) => p.tahun === tahun).length;
                const kpmCount = records.filter((r) => r.tahun === tahun).length;
                return (
                  <div key={tahun} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      Tahun {tahun} ({propCount} Proposal)
                    </span>
                    <span className="font-bold text-teal-700 tabular-nums">{kpmCount} KPM</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
