export type ValidationStatus = 'pending' | 'accepted' | 'rejected';

export type KpmDeleteAction = 'database' | 'rejected' | 'permanent';

export type SingleDocumentKey = 'ktp' | 'kk' | 'penerima' | 'survey';

export interface KpmDocumentFile {
  id: string;
  dataUrl: string;
  fileId?: string;
  directUrl?: string;
  thumbnailUrl?: string;
  viewUrl?: string;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  uploadedAt: string;
}

export interface KpmDocuments {
  ktp?: KpmDocumentFile;
  kk?: KpmDocumentFile;
  penerima?: KpmDocumentFile;
  survey?: KpmDocumentFile;
  rumah: KpmDocumentFile[];
  lainnya: KpmDocumentFile[];
}

export interface WilayahKecamatan {
  id: string;
  nama: string;
  kelurahanList: string[];
}

export interface WilayahKabKota {
  id: string;
  nama: string;
  kecamatanList: WilayahKecamatan[];
}

export interface PengelolaProfile {
  id: string;
  title: string;
  nama: string;
  displayName: string;
  kabKota?: string;
  kecamatan: string;
  kelurahan?: string;
  alamat: string;
  kontak: string;
  foto?: KpmDocumentFile;
  createdAt: string;
}

export interface SubItemDeliveryState {
  delivered: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface KpmBastInfo {
  recipientName: string;
  signedAt: string;
  signedBy: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  signatureDoc?: KpmDocumentFile;
}

export interface KpmAttendanceInfo {
  present: boolean;
  updatedAt: string;
  updatedBy: string;
  source?: 'manual' | 'auto_photo';
  representativeName?: string;
  representativeRelation?: string;
}

export interface KpmRecord {
  id: string;
  registerCode: string;
  tahun: string;
  proposalId?: string | null;
  proposal: string;
  kabKota?: string;
  kecamatan?: string;
  kelurahan: string;
  item: string;
  nama: string;
  alamat: string;
  rt: string;
  rw: string;
  nikKk: string;
  nikKtp: string;
  dtsen: string;
  validasi: ValidationStatus;
  kontak: string;
  pekerjaan: string;
  pengelola: string;
  catatan: string;
  payment: number;
  documents: KpmDocuments;
  subItemDeliveries?: Record<string, SubItemDeliveryState>;
  bast?: KpmBastInfo;
  attendance?: KpmAttendanceInfo;
  berkasDikembalikan?: boolean;
  berkasDikembalikanAt?: string;
  berkasDikembalikanBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KpmFormValues {
  tahun: string;
  proposalId?: string | null;
  proposal: string;
  kabKota?: string;
  kecamatan?: string;
  kelurahan: string;
  item: string;
  nama: string;
  alamat: string;
  rt: string;
  rw: string;
  nikKk: string;
  nikKtp: string;
  dtsen: string;
  validasi: ValidationStatus | '';
  kontak: string;
  pekerjaan: string;
  pengelola: string;
  catatan: string;
  payment: number;
  documents: KpmDocuments;
}

export type ProposalTipe = 'Murni' | 'Perubahan';

export type ProposalLockStatus = 'unlocked' | 'locked';

export interface ProposalChecklist {
  docx: boolean;
  dinas: boolean;
  dinasAt?: string;
  rab: boolean;
  rt: boolean;
  rw: boolean;
  lurah: boolean;
  camat: boolean;
}

export interface ProposalDocuments {
  proposalOpd?: KpmDocumentFile;
  proposalLurahCamat?: KpmDocumentFile;
  rab?: KpmDocumentFile;
  capRt?: KpmDocumentFile;
  capRw?: KpmDocumentFile;
  capLurah?: KpmDocumentFile;
  capCamat?: KpmDocumentFile;
}

export interface ProposalRecord {
  id: string;
  tahun: string;
  tipe: ProposalTipe;
  kabKota?: string;
  kecamatan?: string;
  kelurahan?: string;
  jalan?: string;
  namaProposal: string;
  jumlahKpm?: number;
  status: ProposalLockStatus;
  checklist: ProposalChecklist;
  catatan: string;
  documents: ProposalDocuments;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalFormValues {
  tahun: string;
  tipe: ProposalTipe | '';
  kabKota?: string;
  kecamatan?: string;
  kelurahan?: string;
  jalan?: string;
  namaProposal: string;
  jumlahKpm?: number;
  status: ProposalLockStatus;
  checklist: ProposalChecklist;
  catatan: string;
  documents: ProposalDocuments;
}

export interface ItemBantuan {
  id?: string;
  tahun: string;
  code: string;
  name: string;
  subItems: string[];
}

export type InternalUserRole = 'SuperAdmin' | 'Admin' | 'Viewer';

export type InternalUserStatus = 'pending' | 'active' | 'rejected';

export type UserPresenceStatus = 'online' | 'idle' | 'offline';

export interface UserPermissions {
  add: boolean;
  update: boolean;
  delete: boolean;
}

export interface InternalUser {
  id: string;
  nama: string;
  username?: string;
  email: string;
  jabatan: string;
  kontak: string;
  role: InternalUserRole;
  status: InternalUserStatus;
  permissions: UserPermissions;
  presenceStatus: UserPresenceStatus;
  presenceManual?: boolean;
  fotoDataUrl?: string;
  fotoThumbnailUrl?: string;
  fotoFileId?: string;
  lastActiveAt?: string;
  registeredAt: string;
  updatedAt: string;
}

export interface SharedKpmCard {
  kpmId: string;
  registerCode: string;
  nama: string;
  tahun: string;
  item: string;
  itemName?: string;
  proposal: string;
  kontak?: string;
  dtsen?: string;
  kelurahan?: string;
  kecamatan?: string;
  pengelola?: string;
  validasi: ValidationStatus;
  fotoDataUrl?: string;
  fotoThumbnailUrl?: string;
}

export interface DirectChatMessage {
  id: string;
  conversationKey: string;
  senderId: string;
  recipientId: string;
  text: string;
  sharedKpm?: SharedKpmCard;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export type ProposalHistoryAction = 'entered' | 'moved_in' | 'moved_out' | 'removed';

export interface ProposalKpmHistoryEntry {
  id: string;
  tahun: string;
  proposalName: string;
  kpmId: string;
  kpmName: string;
  registerCode: string;
  action: ProposalHistoryAction;
  fromProposal?: string;
  toProposal?: string;
  actorName: string;
  timestamp: string;
}

export interface KpmFieldChange {
  field: string;
  before: string;
  after: string;
}

export type KpmAuditAction = 'created' | 'updated' | 'status_changed';

export interface KpmAuditLogEntry {
  id: string;
  kpmId: string;
  action: KpmAuditAction;
  actorName: string;
  actorEmail?: string;
  timestamp: string;
  proposal: string;
  tahun: string;
  changes: KpmFieldChange[];
}

export type AppNotificationType = 'proposal_deleted' | 'user_registered';

export interface AppNotificationItem {
  id: string;
  type: AppNotificationType;
  title: string;
  message: string;
  actorName?: string;
  createdAt: string;
  read: boolean;
  targetAction?: 'proposals' | 'users';
}

export interface TrashRecordItem {
  id: string;
  kind: 'kpm' | 'proposal';
  title: string;
  subtitle: string;
  tahun: string;
  deletedAt: string;
  expiresAt: string;
  deletedBy: string;
  kpmRecord?: KpmRecord;
  proposalRecord?: ProposalRecord;
  attachedKpms?: KpmRecord[];
}

export type ScheduleCategory =
  | 'survey'
  | 'verifikasi'
  | 'dinas'
  | 'pemberkasan'
  | 'distribusi'
  | 'monitoring'
  | 'koordinasi'
  | 'lainnya';

export const SCHEDULE_CATEGORY_OPTIONS: { value: ScheduleCategory; label: string }[] = [
  { value: 'survey', label: 'Survey Lapangan' },
  { value: 'verifikasi', label: 'Verifikasi & Validasi Berkas' },
  { value: 'dinas', label: 'Antar ke Dinas' },
  { value: 'pemberkasan', label: 'Pemberkasan BAST & SPTJM' },
  { value: 'distribusi', label: 'Penyaluran Bantuan' },
  { value: 'monitoring', label: 'Monitoring & Evaluasi' },
  { value: 'koordinasi', label: 'Rapat / Koordinasi Dinas' },
  { value: 'lainnya', label: 'Agenda Lainnya' },
];

export const SCHEDULE_CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  survey: 'Survey Lapangan',
  verifikasi: 'Verifikasi & Validasi Berkas',
  dinas: 'Antar ke Dinas',
  pemberkasan: 'Pemberkasan BAST & SPTJM',
  distribusi: 'Penyaluran Bantuan',
  monitoring: 'Monitoring & Evaluasi',
  koordinasi: 'Rapat / Koordinasi Dinas',
  lainnya: 'Agenda Lainnya',
};

export interface ScheduleBook {
  id: string;
  title: string; // contoh: "Buku 1", "Buku 2"
  subtitle: string; // contoh: "Agenda BAST (Laporan)", "Kegiatan Penyaluran"
  defaultCategory: ScheduleCategory;
}

export interface ScheduleBooksState {
  books: ScheduleBook[];
  scheduleBookMap: Record<string, string>;
}

export const DEFAULT_SCHEDULE_BOOKS: ScheduleBook[] = [
  {
    id: 'book-1',
    title: 'Buku 1',
    subtitle: 'Agenda BAST (Laporan)',
    defaultCategory: 'pemberkasan',
  },
  {
    id: 'book-2',
    title: 'Buku 2',
    subtitle: 'Kegiatan Penyaluran',
    defaultCategory: 'distribusi',
  },
];

export interface ScheduleEventItem {
  id: string;
  title: string;
  category: ScheduleCategory;
  bookId?: string;
  targetDay?: string; // Senin, Selasa, Rabu, Kamis, Jum'at, Sabtu, Minggu
  targetDate: string; // YYYY-MM-DD
  targetTime?: string; // HH:mm
  tahun: string;
  proposalName?: string;
  location?: string;
  footerNote?: string;
  notes?: string;
  completed: boolean;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}

export function resolveScheduleBookId(
  ev: Pick<ScheduleEventItem, 'id' | 'bookId' | 'category'>,
  scheduleBookMap: Record<string, string> = {},
  books?: ScheduleBook[]
): string {
  const mapped = (ev.bookId || scheduleBookMap[ev.id] || '').trim();
  if (mapped) {
    if (!books || books.length === 0 || books.some((b) => b.id === mapped)) {
      return mapped;
    }
  }
  const effectiveBooks = books && books.length > 0 ? books : DEFAULT_SCHEDULE_BOOKS;
  if (ev.category === 'distribusi' && effectiveBooks.some((b) => b.id === 'book-2')) {
    return 'book-2';
  }
  return effectiveBooks[0]?.id || 'book-1';
}

export interface ProposalEmptySlot {
  slotNumber: number; // 1-based nomor urut SK / BAST (mis. 3 untuk "03")
  item?: string;
  previousKpmId?: string;
  previousKpmName?: string;
  vacatedAt: string;
}

export interface ProposalSlotState {
  pinnedOrder: string[]; // daftar ID KPM terurut jika proposal menggunakan urutan slot tetap
  emptySlots: ProposalEmptySlot[];
  updatedAt: string;
}

export type ProposalSlotMap = Record<string, ProposalSlotState>;

export type SlotRemovalMode = 'vacate' | 'collapse';

export const DEFAULT_KOP_LOGO_URL = '/assets/logo-dinsos-kalbar.png';
export const DEFAULT_DPRD_LOGO_URL = '/assets/logo-dprd-kalbar.png';

export interface ReportTemplateConfig {
  enabled: boolean;
  orgHeaderLine1: string;
  orgHeaderLine2: string;
  orgAddress: string;
  city: string;
  signatoryTitle: string;
  signatoryName: string;
  signatoryNip: string;
  kopLogoDataUrl?: string;
}

export const DEFAULT_REPORT_TEMPLATE: ReportTemplateConfig = {
  enabled: false,
  orgHeaderLine1: 'PEMERINTAH PROVINSI KALIMANTAN BARAT',
  orgHeaderLine2: 'DINAS SOSIAL · PROGRAM BANTUAN KPM MASDETA',
  orgAddress: 'Jalan Sutan Syahrir Nomor 3 Pontianak, Kalimantan Barat 78116',
  city: 'Pontianak',
  signatoryTitle: 'Koordinator / Penanggung Jawab',
  signatoryName: '',
  signatoryNip: '',
  kopLogoDataUrl: DEFAULT_KOP_LOGO_URL,
};

export interface CouponPrintConfig {
  jadwal: string;
  lokasi: string;
  footerText: string;
  qrBaseUrl?: string;
  logoKalbarUrl?: string;
  logoGerindraUrl?: string;
}

export const DEFAULT_COUPON_CONFIG: CouponPrintConfig = {
  jadwal: '',
  lokasi: '',
  footerText: 'Wajib membawa Kupon dan KTP asli saat pembagian.',
  logoKalbarUrl: '',
  logoGerindraUrl: '',
};

export interface BastTemplateConfig {
  orgHeaderLine1: string;
  orgHeaderLine2: string;
  orgAddress1: string;
  orgAddress2: string;
  orgAddress3: string;
  kopLogoDataUrl?: string;
  nomorBast: string;
  tanggalSerahTerimaIso: string;
  tanggalSerahTerimaCustomText?: string;
  nomorSk: string;
  nomorPesanan: string;
  tanggalPemesanan: string;
  pejabatNama: string;
  pejabatJabatan: string;
  pejabatPangkat: string;
  pejabatNip: string;
  nilaiNominalText: string;
}

export const DEFAULT_BAST_TEMPLATE: BastTemplateConfig = {
  orgHeaderLine1: 'PEMERINTAH PROVINSI KALIMANTAN BARAT',
  orgHeaderLine2: 'DINAS SOSIAL',
  orgAddress1: 'Jalan Sutan Syahrir Nomor 3 Pontianak, Kalimantan Barat 78116',
  orgAddress2: 'Telepon (0561) 732523 - 732524',
  orgAddress3: 'Laman www.dinsos.kalbarprov.go.id Pos-el dinsos@kalbarprov.go.id',
  kopLogoDataUrl: DEFAULT_KOP_LOGO_URL,
  nomorBast: '400.9.14.5 / ................... / DINSOS',
  tanggalSerahTerimaIso: '',
  tanggalSerahTerimaCustomText: '',
  nomorSk: '300.3.3/56/DINSOS tanggal 1 juli 2025',
  nomorPesanan: 'EP-01K6M49TRC1H4TS8M7FRPN4C99',
  tanggalPemesanan: '03 Oktober 2025',
  pejabatNama: 'Drs. RAMINUDDIN, M.Si',
  pejabatJabatan: 'Kepala Dinas Sosial Provinsi Kalimantan Barat',
  pejabatPangkat: 'Pembina Utama Muda / (IV/c)',
  pejabatNip: '19770830 199603 1 001',
  nilaiNominalText: '. . . . . . . . . . . . . . . . . . . . . . . . . . .',
};

export type ProposalBastMap = Record<string, Partial<BastTemplateConfig>>;

export interface SptjmTemplateConfig {
  tempat: string;
  hari?: string;
  tanggalIso: string;
  tanggalCustomText?: string;
  pejabatJabatan: string;
  pejabatNama: string;
  pejabatNip: string;
}

export const DEFAULT_SPTJM_TEMPLATE: SptjmTemplateConfig = {
  tempat: 'Pontianak',
  hari: '',
  tanggalIso: '',
  tanggalCustomText: '',
  pejabatJabatan: 'Kepala Bidang Pemberdayaan Fakir Miskin Dinas Sosial Provinsi Kalbar',
  pejabatNama: 'TATIK GESTYANINGSIH, A.Ks., M.Si',
  pejabatNip: '19680514 198901 2 002',
};

export interface PejabatProfile {
  id: string;
  nama: string;
  kelas: string;
  jabatan: string;
  nip: string;
  createdAt: string;
}

export const DEFAULT_PEJABAT_LIST: PejabatProfile[] = [
  {
    id: 'pejabat-default-1',
    nama: 'Drs. RAMINUDDIN, M.Si',
    kelas: 'Pembina Utama Muda / (IV/c)',
    jabatan: 'Kepala Dinas Sosial Provinsi Kalimantan Barat',
    nip: '19770830 199603 1 001',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'pejabat-default-2',
    nama: 'SHINTA IKASARI, S.STP',
    kelas: 'Pembina / (IV/a)',
    jabatan: 'Plt. Kepala Dinas Sosial Provinsi Kalimantan Barat',
    nip: '19780327 199612 2 001',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'pejabat-default-3',
    nama: 'TATIK GESTYANINGSIH, A.Ks., M.Si',
    kelas: 'Pembina / (IV/a)',
    jabatan: 'Kepala Bidang Pemberdayaan Fakir Miskin Dinas Sosial Provinsi Kalbar',
    nip: '19680514 198901 2 002',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'pejabat-default-4',
    nama: 'YELLY MANALU, S.Sos',
    kelas: '',
    jabatan: 'Pejabat Pelaksana Teknis Kegiatan',
    nip: '19801112 200903 2 003',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

export interface TroubleshootingKpmPreApplyState {
  id: string;
  validasi: ValidationStatus;
  proposalId: string | null;
  proposal: string;
  tahun: string;
  registerCode: string;
  alamat: string;
  rt: string;
  rw: string;
  catatan: string;
  kabKota: string;
  kecamatan: string;
  kelurahan: string;
}

export interface TroubleshootingReconcileSnapshot {
  id: string;
  proposalId: string;
  proposalName: string;
  tahun: string;
  appliedAt: string;
  appliedBy: string;
  summary: {
    shiftedCount: number;
    emptySlotsCount: number;
    movedToDatabaseCount: number;
    addressUpdatedCount: number;
    createdFromBastCount?: number;
  };
  slotKey: string;
  hadPreviousSlotState: boolean;
  previousSlotState: ProposalSlotState | null;
  previousKpmStates: TroubleshootingKpmPreApplyState[];
  movedOverQuotaKpmIds: string[];
  filledFromDatabaseKpmIds: string[];
  filledFromDatabaseOriginalItems?: Record<string, string>;
  createdFromBastKpmIds?: string[];
}

export type ProposalDestinationType = 'OPD' | 'Kecamatan' | 'Kelurahan';

export interface SavedRabSubItem {
  id: string;
  namaBarang: string;
  volumePerPaket: number;
  satuan: string;
  hargaDasar: number;
  hargaSatuan: number;
  isBalancer: boolean;
}

export interface SavedRabPackage {
  id: string;
  kode: string;
  namaPaket: string;
  jumlahPenerima: number;
  customTargetHarga: number | null;
  balancerMode: 'proportional' | 'primary';
  subItems: SavedRabSubItem[];
}

export interface SavedProposalRabConfig {
  proposalId: string;
  proposalName: string;
  tahun: string;
  judulRab: string;
  totalAnggaran: number;
  totalTerhitung: number;
  paguStandarPerKpm: number;
  totalKpmSnapshot: number;
  itemCountsSnapshot: Record<string, number>;
  packages: SavedRabPackage[];
  updatedAt: string;
  updatedBy?: string;
}

export type ProposalRabMap = Record<string, SavedProposalRabConfig>;

export interface ProposalStyleUsageRecord {
  id: string;
  styleId: number; // 1..15
  proposalId: string;
  namaProposal: string;
  tahun: string;
  jenisTujuan: ProposalDestinationType;
  createdAt: string;
  createdBy?: string;
}

export type ProposalChangeKind =
  | 'kpm_replaced'
  | 'item_changed'
  | 'kpm_vacated'
  | 'kpm_added';

export interface ProposalChangeLogEntry {
  id: string;
  proposalId: string;
  proposalName: string;
  tahun: string;
  slotNumber: number | null;
  kind: ProposalChangeKind;
  oldKpmId?: string;
  oldKpmName?: string;
  oldNik?: string;
  oldItem?: string;
  oldKelurahan?: string;
  newKpmId?: string;
  newKpmName?: string;
  newNik?: string;
  newItem?: string;
  newKelurahan?: string;
  reason?: string;
  source?: 'auto' | 'manual' | 'reconcile';
  actorName: string;
  timestamp: string;
}

