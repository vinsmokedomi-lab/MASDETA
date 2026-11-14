export type ValidationStatus = 'pending' | 'accepted' | 'rejected';

export type SingleDocumentKey = 'ktp' | 'kk' | 'penerima' | 'survey';

export interface KpmDocumentFile {
  id: string;
  dataUrl: string;
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

export interface KpmRecord {
  id: string;
  registerCode: string;
  tahun: string;
  proposal: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface KpmFormValues {
  tahun: string;
  proposal: string;
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

export type ProposalTipe = 'Murni' | 'Perubahan' | 'Database' | 'Arsip';

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

export type InternalUserRole = 'Admin' | 'Verifikator' | 'Petugas';

export type InternalUserStatus = 'pending' | 'active' | 'rejected';

export interface InternalUser {
  id: string;
  nama: string;
  email: string;
  jabatan: string;
  kontak: string;
  role: InternalUserRole;
  status: InternalUserStatus;
  registeredAt: string;
  updatedAt: string;
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



