export type ValidationStatus = 'pending' | 'accepted' | 'rejected';

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

export interface ScheduleEventItem {
  id: string;
  title: string;
  category: ScheduleCategory;
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
  pejabatNip: 'NIP. 19770830 199603 1 001',
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
  pejabatNip: 'NIP. 19680514 198901 2 002',
};
