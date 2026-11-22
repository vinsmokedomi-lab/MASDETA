import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabaseClient';
import {
  buildDriveFallbackThumbnailUrl,
  extractDriveFileId,
} from './driveManager';
import {
  DirectChatMessage,
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
  ItemBantuan,
  KpmAuditLogEntry,
  KpmDocumentFile,
  KpmDocuments,
  KpmRecord,
  PengelolaProfile,
  ProposalChecklist,
  ProposalDestinationType,
  ProposalDocuments,
  ProposalKpmHistoryEntry,
  ProposalLockStatus,
  ProposalRabMap,
  ProposalRecord,
  ProposalStyleUsageRecord,
  SavedProposalRabConfig,
  SavedRabPackage,
  ScheduleCategory,
  ScheduleEventItem,
  SharedKpmCard,
  SubItemDeliveryState,
  UserPermissions,
  UserPresenceStatus,
  WilayahKabKota,
} from '../types/kpm';

export type AdminDataActionType =
  | 'reset_total'
  | 'delete_all_data'
  | 'delete_all_kpm'
  | 'delete_all_proposal'
  | 'delete_all_items';

export interface SupabaseOperationalSnapshot {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  pekerjaanList: string[];
  wilayahList: WilayahKabKota[];
  pengelolaList: PengelolaProfile[];
  proposalHistory: ProposalKpmHistoryEntry[];
  kpmAuditLogs: KpmAuditLogEntry[];
}

const SUPABASE_PAGE_SIZE = 1000;

const SAFE_INTERNAL_USER_COLUMNS =
  'id,nama,email,jabatan,kontak,role,status,perm_add,perm_update,perm_delete,presence_status,presence_manual,foto_url,foto_thumb_url,foto_file_id,last_active_at,registered_at,updated_at';
const SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME =
  'id,nama,username,email,jabatan,kontak,role,status,perm_add,perm_update,perm_delete,presence_status,presence_manual,foto_url,foto_thumb_url,foto_file_id,last_active_at,registered_at,updated_at';
const USERNAMES_STATE_KEY = 'user_usernames_v1';

function isMissingUsernameColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(err.code || '');
  const msg = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  return (
    (code === '42703' || code === 'PGRST204' || msg.includes('does not exist') || msg.includes('could not find')) &&
    msg.includes('username')
  );
}

function normalizeUsername(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(username);
}

async function fetchFallbackUsernameMap(): Promise<Record<string, string>> {
  try {
    const raw = await fetchAppStateSlice<Record<string, unknown>>(USERNAMES_STATE_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [uid, uname] of Object.entries(raw)) {
      const clean = normalizeUsername(typeof uname === 'string' ? uname : '');
      if (uid && clean) out[uid] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

async function saveFallbackUsername(userId: string, username: string): Promise<void> {
  const clean = normalizeUsername(username);
  if (!userId || !clean) return;
  try {
    const current = await fetchFallbackUsernameMap();
    await saveAppStateSlice(USERNAMES_STATE_KEY, {
      ...current,
      [userId]: clean,
    });
  } catch {
    // Ignore fallback state failure
  }
}

async function fetchAllPages<T = Record<string, unknown>>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 250_000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  if (all.length >= maxRows) {
    console.warn(`[MASDETA] fetchAllPages mencapai batas maksimum ${maxRows} baris; sebagian data mungkin terpotong.`);
  }
  return all;
}

export function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const code = String(err.code || '');
  const msg = `${err.message || ''} ${err.details || ''}`.toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

/**
 * Pastikan hanya URL valid (non-Base64) yang boleh disimpan ke Supabase PostgreSQL.
 */
export function sanitizeMediaUrl(url?: string | null): string | null {
  const clean = (url || '').trim();
  if (!clean || clean.startsWith('data:')) return null;
  return clean;
}

function sanitizeYearValue(raw?: string | null): string {
  const clean = (raw || '').trim();
  if (!clean || clean.toLowerCase() === 'tanpa tahun') return '';
  return clean.slice(0, 10);
}

function buildDocFileFromRow(row: Record<string, unknown>): KpmDocumentFile | undefined {
  const directUrl = sanitizeMediaUrl(String(row.direct_url || ''));
  if (!directUrl) return undefined;
  const fileId =
    (typeof row.drive_file_id === 'string' && row.drive_file_id) ||
    extractDriveFileId(directUrl) ||
    undefined;
  const thumbnailUrl =
    sanitizeMediaUrl(String(row.thumbnail_url || '')) ||
    buildDriveFallbackThumbnailUrl(fileId || directUrl) ||
    undefined;
  const viewUrl =
    sanitizeMediaUrl(String(row.view_url || '')) ||
    (fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view` : undefined);

  return {
    id: String(row.id || `doc-${Date.now()}`),
    dataUrl: directUrl,
    fileId,
    directUrl,
    thumbnailUrl,
    viewUrl,
    fileName: String(row.file_name || 'dokumen-drive'),
    originalSize: Number(row.original_size || 0),
    compressedSize: Number(row.compressed_size || row.original_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    mimeType: String(row.mime_type || 'image/jpeg'),
    uploadedAt: String(row.uploaded_at || new Date().toISOString()),
  };
}

function isRenderableMediaUrl(url?: string | null): boolean {
  const clean = sanitizeMediaUrl(url);
  if (!clean) return false;
  if (/^https?:\/\//i.test(clean) || clean.startsWith('/') || clean.startsWith('blob:')) {
    return true;
  }
  return Boolean(extractDriveFileId(clean));
}

function buildDocFileFromUrlFallback(
  url?: string | null,
  thumbUrl?: string | null,
  fallbackId = 'doc-url',
  fileName = 'dokumen-drive'
): KpmDocumentFile | undefined {
  if (!isRenderableMediaUrl(url)) return undefined;
  const directUrl = sanitizeMediaUrl(url);
  if (!directUrl) return undefined;
  const fileId = extractDriveFileId(directUrl) || undefined;
  const thumbnailUrl =
    sanitizeMediaUrl(thumbUrl) ||
    buildDriveFallbackThumbnailUrl(fileId || directUrl) ||
    undefined;

  return {
    id: fallbackId,
    dataUrl: directUrl,
    fileId,
    directUrl,
    thumbnailUrl,
    viewUrl: fileId
      ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
      : undefined,
    fileName,
    originalSize: 0,
    compressedSize: 0,
    width: 0,
    height: 0,
    mimeType: 'image/jpeg',
    uploadedAt: new Date().toISOString(),
  };
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPasswordForSupabase(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(8));
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hex = await sha256Hex(`${salt}:${password}`);
  return `sha256:${salt}:${hex}`;
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPasswordHashForSupabase(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith('sha256:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actualHex = await sha256Hex(`${salt}:${password}`);
    return timingSafeEqualString(actualHex, expectedHex);
  }
  return timingSafeEqualString(storedHash, password);
}

export function mapSupabaseUserRow(row: Record<string, unknown>): InternalUser {
  const fotoUrl = sanitizeMediaUrl(row.foto_url as string | null);
  const fotoFileId =
    (typeof row.foto_file_id === 'string' && row.foto_file_id) ||
    extractDriveFileId(fotoUrl) ||
    undefined;
  const fotoThumbUrl =
    sanitizeMediaUrl(row.foto_thumb_url as string | null) ||
    (fotoUrl ? buildDriveFallbackThumbnailUrl(fotoFileId || fotoUrl) : null) ||
    undefined;

  const cleanUsername = normalizeUsername(row.username as string | null);

  return {
    id: String(row.id),
    nama: String(row.nama || ''),
    ...(cleanUsername ? { username: cleanUsername } : {}),
    email: String(row.email || '').toLowerCase(),
    jabatan: String(row.jabatan || 'Admin Lapangan'),
    kontak: String(row.kontak || ''),
    role: (row.role as InternalUserRole) || 'Admin',
    status: (row.status as InternalUserStatus) || 'pending',
    permissions: {
      add: Boolean(row.perm_add),
      update: Boolean(row.perm_update),
      delete: Boolean(row.perm_delete),
    },
    presenceStatus: (row.presence_status as UserPresenceStatus) || 'offline',
    presenceManual: Boolean(row.presence_manual),
    fotoDataUrl: fotoUrl || undefined,
    fotoThumbnailUrl: fotoThumbUrl,
    fotoFileId,
    lastActiveAt: row.last_active_at ? String(row.last_active_at) : undefined,
    registeredAt: String(row.registered_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function mapSupabaseChatRow(row: Record<string, unknown>): DirectChatMessage {
  const snapshotRaw = row.shared_kpm_snapshot as SharedKpmCard | null | undefined;
  const sharedFoto = sanitizeMediaUrl(row.shared_kpm_foto_url as string | null);
  const sharedKpm: SharedKpmCard | undefined = snapshotRaw
    ? {
        ...snapshotRaw,
        fotoDataUrl: sharedFoto || sanitizeMediaUrl(snapshotRaw.fotoDataUrl) || undefined,
        fotoThumbnailUrl:
          sanitizeMediaUrl(snapshotRaw.fotoThumbnailUrl) ||
          (sharedFoto ? buildDriveFallbackThumbnailUrl(sharedFoto) : undefined),
      }
    : undefined;

  return {
    id: String(row.id),
    conversationKey: String(row.conversation_key),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    text: String(row.text || ''),
    sharedKpm,
    createdAt: String(row.created_at || new Date().toISOString()),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
    readAt: row.read_at ? String(row.read_at) : undefined,
  };
}

export async function checkSupabaseSchemaReady(): Promise<{
  ready: boolean;
  schemaMissing: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return { ready: false, schemaMissing: false, error: 'Konfigurasi Supabase belum lengkap.' };
  }
  const { error } = await supabase.from('internal_users').select('id').limit(1);
  if (!error) {
    return { ready: true, schemaMissing: false };
  }
  return {
    ready: false,
    schemaMissing: isSchemaMissingError(error),
    error: error.message,
  };
}

// ============================================================================
// OPERATIONAL DATA: FETCH RELATIONAL SNAPSHOT
// ============================================================================
export async function fetchOperationalDataFromSupabase(): Promise<SupabaseOperationalSnapshot> {
  const [
    kabData,
    kecData,
    kelData,
    pekerjaanData,
    itemsData,
    subItemsData,
    pengelolaData,
    proposalsData,
    proposalDocsData,
    kpmData,
    kpmDocsData,
    deliveriesData,
    historyData,
    auditData,
  ] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kabkota')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kecamatan')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kelurahan')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('pekerjaan_master')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('item_bantuan')
        .select('*')
        .order('tahun', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('item_sub_items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('pengelola')
        .select('*')
        .order('display_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from('proposal_documents').select('*').order('id', { ascending: true }).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('kpm_records')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('kpm_documents')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('kpm_sub_item_deliveries')
        .select('*')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages(
      (from, to) =>
        supabase
          .from('proposal_kpm_history')
          .select('*')
          .order('timestamp', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      3000
    ),
    fetchAllPages(
      (from, to) =>
        supabase
          .from('kpm_audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      5000
    ),
  ]);

  const kabRes = { data: kabData };
  const kecRes = { data: kecData };
  const kelRes = { data: kelData };
  const pekerjaanRes = { data: pekerjaanData };
  const itemsRes = { data: itemsData };
  const subItemsRes = { data: subItemsData };
  const pengelolaRes = { data: pengelolaData };
  const proposalsRes = { data: proposalsData };
  const proposalDocsRes = { data: proposalDocsData };
  const kpmRes = { data: kpmData };
  const kpmDocsRes = { data: kpmDocsData };
  const deliveriesRes = { data: deliveriesData };
  const historyRes = { data: historyData };
  const auditRes = { data: auditData };

  // 1. Reconstruct Wilayah hierarchy
  const kelByKec = new Map<string, string[]>();
  for (const kel of kelRes.data || []) {
    const kecId = String(kel.kecamatan_id);
    const arr = kelByKec.get(kecId) || [];
    arr.push(String(kel.nama));
    kelByKec.set(kecId, arr);
  }
  const kecByKab = new Map<string, WilayahKabKota['kecamatanList']>();
  for (const kec of kecRes.data || []) {
    const kabId = String(kec.kabkota_id);
    const arr = kecByKab.get(kabId) || [];
    arr.push({
      id: String(kec.id),
      nama: String(kec.nama),
      kelurahanList: kelByKec.get(String(kec.id)) || [],
    });
    kecByKab.set(kabId, arr);
  }
  const wilayahList: WilayahKabKota[] = (kabRes.data || []).map((kab) => ({
    id: String(kab.id),
    nama: String(kab.nama),
    kecamatanList: kecByKab.get(String(kab.id)) || [],
  }));

  // 2. Pekerjaan
  const pekerjaanList: string[] = (pekerjaanRes.data || []).map((p) => String(p.nama));

  // 3. Item Bantuan & Sub-Items
  const subByItem = new Map<string, string[]>();
  for (const sub of subItemsRes.data || []) {
    const itemId = String(sub.item_id);
    const arr = subByItem.get(itemId) || [];
    arr.push(String(sub.sub_item_name));
    subByItem.set(itemId, arr);
  }
  const items: ItemBantuan[] = (itemsRes.data || []).map((it) => ({
    id: String(it.id),
    tahun: String(it.tahun),
    code: String(it.code),
    name: String(it.name),
    subItems: subByItem.get(String(it.id)) || [],
  }));

  // 4. Pengelola
  const pengelolaList: PengelolaProfile[] = (pengelolaRes.data || []).map((p) => {
    const fotoUrl = sanitizeMediaUrl(p.foto_url as string | null);
    const meta = (p.foto_meta as Record<string, unknown> | null) || {};
    const foto: KpmDocumentFile | undefined = fotoUrl
      ? {
          id: String(meta.id || `pengelola-foto-${p.id}`),
          dataUrl: fotoUrl,
          fileId:
            (typeof p.foto_file_id === 'string' && p.foto_file_id) ||
            extractDriveFileId(fotoUrl) ||
            undefined,
          directUrl: fotoUrl,
          thumbnailUrl:
            sanitizeMediaUrl(p.foto_thumb_url as string | null) ||
            buildDriveFallbackThumbnailUrl(fotoUrl) ||
            undefined,
          viewUrl: sanitizeMediaUrl(p.foto_view_url as string | null) || undefined,
          fileName: String(p.foto_file_name || 'foto-pengelola.jpg'),
          originalSize: Number(meta.originalSize || 0),
          compressedSize: Number(meta.compressedSize || 0),
          width: Number(meta.width || 0),
          height: Number(meta.height || 0),
          mimeType: String(meta.mimeType || 'image/jpeg'),
          uploadedAt: String(meta.uploadedAt || p.updated_at || new Date().toISOString()),
        }
      : undefined;

    return {
      id: String(p.id),
      title: String(p.title || 'Bapak'),
      nama: String(p.nama || ''),
      displayName: String(p.display_name || ''),
      kabKota: String(p.kab_kota || ''),
      kecamatan: String(p.kecamatan || ''),
      kelurahan: String(p.kelurahan || ''),
      alamat: String(p.alamat || ''),
      kontak: String(p.kontak || ''),
      foto,
      createdAt: String(p.created_at || new Date().toISOString()),
    };
  });

  // 5. Proposals & Proposal Documents
  const docsByProposal = new Map<string, ProposalDocuments>();
  for (const docRow of proposalDocsRes.data || []) {
    const propId = String(docRow.proposal_id);
    const slot = String(docRow.doc_slot) as keyof ProposalDocuments;
    const parsed = buildDocFileFromRow(docRow);
    if (!parsed) continue;
    const existing = docsByProposal.get(propId) || {};
    existing[slot] = parsed;
    docsByProposal.set(propId, existing);
  }

  const removedDummyPropIds = new Set<string>();
  const removedDummyPropNames = new Set<string>();
  const proposals: ProposalRecord[] = (proposalsRes.data || [])
    .filter((p) => {
      const tipeRaw = String(p.tipe || '').trim();
      if (tipeRaw !== 'Murni' && tipeRaw !== 'Perubahan') {
        removedDummyPropIds.add(String(p.id));
        const nameLower = String(p.nama_proposal || '').trim().toLowerCase();
        if (nameLower) removedDummyPropNames.add(nameLower);
        return false;
      }
      return true;
    })
    .map((p) => {
      const propId = String(p.id);
      const docMap = docsByProposal.get(propId) || {};
      const documents: ProposalDocuments = {
        proposalOpd:
          docMap.proposalOpd ||
          buildDocFileFromUrlFallback(p.proposal_opd_url as string | null, null, `${propId}-opd`, 'Proposal OPD'),
        proposalLurahCamat:
          docMap.proposalLurahCamat ||
          buildDocFileFromUrlFallback(
            p.proposal_lurah_camat_url as string | null,
            null,
            `${propId}-lc`,
            'Proposal Lurah & Camat'
          ),
        rab: docMap.rab || buildDocFileFromUrlFallback(p.rab_url as string | null, null, `${propId}-rab`, 'RAB'),
        capRt: docMap.capRt || buildDocFileFromUrlFallback(p.cap_rt_url as string | null, null, `${propId}-rt`, 'Cap RT'),
        capRw: docMap.capRw || buildDocFileFromUrlFallback(p.cap_rw_url as string | null, null, `${propId}-rw`, 'Cap RW'),
        capLurah:
          docMap.capLurah ||
          buildDocFileFromUrlFallback(p.cap_lurah_url as string | null, null, `${propId}-lurah`, 'Cap Lurah'),
        capCamat:
          docMap.capCamat ||
          buildDocFileFromUrlFallback(p.cap_camat_url as string | null, null, `${propId}-camat`, 'Cap Camat'),
      };

      const rawChecklist = (p.checklist as Partial<ProposalChecklist> | null) || {};
      return {
        id: propId,
        tahun: String(p.tahun),
        tipe: String(p.tipe) === 'Perubahan' ? 'Perubahan' : 'Murni',
        kabKota: String(p.kab_kota || ''),
        kecamatan: String(p.kecamatan || ''),
        kelurahan: String(p.kelurahan || ''),
        jalan: String(p.jalan || ''),
        namaProposal: String(p.nama_proposal || ''),
        jumlahKpm: Number(p.jumlah_kpm ?? 66),
        status: (p.status as ProposalRecord['status']) || 'unlocked',
        checklist: {
          docx: Boolean(documents.proposalOpd || documents.proposalLurahCamat),
          dinas: Boolean(rawChecklist.dinas),
          dinasAt: rawChecklist.dinasAt,
          rab: Boolean(documents.rab),
          rt: Boolean(documents.capRt),
          rw: Boolean(documents.capRw),
          lurah: Boolean(documents.capLurah),
          camat: Boolean(documents.capCamat),
        },
        catatan: String(p.catatan || ''),
        documents,
        createdAt: String(p.created_at || new Date().toISOString()),
        updatedAt: String(p.updated_at || new Date().toISOString()),
      };
    });

  // 6. KPM Records, KPM Documents & Sub-Item Deliveries
  const docsByKpm = new Map<string, KpmDocuments>();
  for (const row of kpmDocsRes.data || []) {
    const kpmId = String(row.kpm_id);
    const cat = String(row.doc_category);
    const doc = buildDocFileFromRow(row);
    if (!doc) continue;
    const bag = docsByKpm.get(kpmId) || { rumah: [], lainnya: [] };
    if (cat === 'ktp' || cat === 'kk' || cat === 'penerima' || cat === 'survey') {
      bag[cat] = doc;
    } else if (cat === 'rumah') {
      bag.rumah.push(doc);
    } else if (cat === 'lainnya') {
      bag.lainnya.push(doc);
    }
    docsByKpm.set(kpmId, bag);
  }

  const deliveriesByKpm = new Map<string, Record<string, SubItemDeliveryState>>();
  for (const row of deliveriesRes.data || []) {
    const kpmId = String(row.kpm_id);
    const subName = String(row.sub_item_name);
    const bag = deliveriesByKpm.get(kpmId) || {};
    bag[subName] = {
      delivered: Boolean(row.delivered),
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      updatedBy: row.updated_by ? String(row.updated_by) : undefined,
    };
    deliveriesByKpm.set(kpmId, bag);
  }

  const records: KpmRecord[] = (kpmRes.data || []).map((r) => {
    const kpmId = String(r.id);
    const bag = docsByKpm.get(kpmId) || { rumah: [], lainnya: [] };
    const documents: KpmDocuments = {
      ktp:
        bag.ktp ||
        buildDocFileFromUrlFallback(
          r.foto_ktp_url as string | null,
          r.foto_ktp_thumb_url as string | null,
          `${kpmId}-ktp`,
          'Foto KTP'
        ),
      kk:
        bag.kk ||
        buildDocFileFromUrlFallback(
          r.foto_kk_url as string | null,
          r.foto_kk_thumb_url as string | null,
          `${kpmId}-kk`,
          'Foto KK'
        ),
      penerima:
        bag.penerima ||
        buildDocFileFromUrlFallback(
          r.foto_penerima_url as string | null,
          r.foto_penerima_thumb_url as string | null,
          `${kpmId}-penerima`,
          'Foto Penerima'
        ),
      survey:
        bag.survey ||
        buildDocFileFromUrlFallback(
          r.foto_survey_url as string | null,
          r.foto_survey_thumb_url as string | null,
          `${kpmId}-survey`,
          'Foto Survey'
        ),
      rumah: bag.rumah,
      lainnya: bag.lainnya,
    };

    const rawValidasi = (r.validasi as KpmRecord['validasi']) || 'pending';
    const rawPropId = r.proposal_id ? String(r.proposal_id) : null;
    const rawPropName = r.proposal ? String(r.proposal).trim() : '';
    const isPhantomArsip = !rawPropId && /^arsip\b/i.test(rawPropName);
    const isDetached =
      rawValidasi !== 'accepted' ||
      isPhantomArsip ||
      Boolean(rawPropId && removedDummyPropIds.has(rawPropId)) ||
      Boolean(rawPropName && removedDummyPropNames.has(rawPropName.toLowerCase()));
    const effectiveValidasi: KpmRecord['validasi'] =
      rawValidasi === 'accepted' && isDetached ? 'pending' : rawValidasi;
    const matchedProp = !isDetached
      ? (rawPropId ? proposals.find((p) => p.id === rawPropId) : undefined) ??
        proposals.find((p) => p.namaProposal === rawPropName && p.tahun === String(r.tahun || '')) ??
        proposals.find((p) => p.namaProposal === rawPropName)
      : undefined;

    return {
      id: kpmId,
      registerCode: isDetached ? '' : String(r.register_code || ''),
      tahun: isDetached ? '' : sanitizeYearValue(r.tahun ? String(r.tahun) : ''),
      proposalId: isDetached ? null : matchedProp?.id ?? rawPropId,
      proposal: isDetached ? '' : matchedProp?.namaProposal ?? rawPropName,
      kabKota: matchedProp?.kabKota || '',
      kecamatan: String(r.kecamatan || '') || matchedProp?.kecamatan || '',
      kelurahan: String(r.kelurahan || '') || matchedProp?.kelurahan || '',
      item: String(r.item || ''),
      nama: String(r.nama || ''),
      alamat: String(r.alamat || ''),
      rt: String(r.rt || ''),
      rw: String(r.rw || ''),
      nikKk: String(r.nik_kk || ''),
      nikKtp: String(r.nik_ktp || ''),
      dtsen: String(r.dtsen || ''),
      validasi: effectiveValidasi,
      kontak: String(r.kontak || ''),
      pekerjaan: String(r.pekerjaan || ''),
      pengelola: String(r.pengelola || ''),
      catatan: String(r.catatan || ''),
      payment: Number(r.payment || 0),
      documents,
      subItemDeliveries: deliveriesByKpm.get(kpmId),
      berkasDikembalikan: Boolean(r.berkas_dikembalikan),
      berkasDikembalikanAt: r.berkas_dikembalikan_at
        ? String(r.berkas_dikembalikan_at)
        : undefined,
      berkasDikembalikanBy: r.berkas_dikembalikan_by
        ? String(r.berkas_dikembalikan_by)
        : undefined,
      createdAt: String(r.created_at || new Date().toISOString()),
      updatedAt: String(r.updated_at || new Date().toISOString()),
    };
  });

  // 7. History & Audit Logs
  const proposalHistory: ProposalKpmHistoryEntry[] = (historyRes.data || []).map((h) => ({
    id: String(h.id),
    tahun: String(h.tahun || ''),
    proposalName: String(h.proposal_name || ''),
    kpmId: String(h.kpm_id || ''),
    kpmName: String(h.kpm_name || ''),
    registerCode: String(h.register_code || ''),
    action: (h.action as ProposalKpmHistoryEntry['action']) || 'entered',
    fromProposal: h.from_proposal ? String(h.from_proposal) : undefined,
    toProposal: h.to_proposal ? String(h.to_proposal) : undefined,
    actorName: String(h.actor_name || 'Admin'),
    timestamp: String(h.timestamp || new Date().toISOString()),
  }));

  const kpmAuditLogs: KpmAuditLogEntry[] = (auditRes.data || []).map((a) => ({
    id: String(a.id),
    kpmId: String(a.kpm_id),
    action: (a.action as KpmAuditLogEntry['action']) || 'updated',
    actorName: String(a.actor_name || 'Admin'),
    actorEmail: a.actor_email ? String(a.actor_email) : undefined,
    timestamp: String(a.timestamp || new Date().toISOString()),
    proposal: String(a.proposal || ''),
    tahun: String(a.tahun || ''),
    changes: Array.isArray(a.changes) ? (a.changes as KpmAuditLogEntry['changes']) : [],
  }));

  return {
    records,
    proposals,
    items,
    pekerjaanList,
    wilayahList,
    pengelolaList,
    proposalHistory,
    kpmAuditLogs,
  };
}

// ============================================================================
// RELATIONAL WRITERS (Strictly URL-only for Media!)
// ============================================================================
async function upsertInChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 100
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

async function deleteByIdsInChunks(
  table: string,
  column: string,
  ids: string[],
  chunkSize = 100
): Promise<void> {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
}

function buildKpmDocumentRows(kpmId: string, docs: KpmDocuments) {
  const rows: Record<string, unknown>[] = [];
  const usedIds = new Set<string>();
  const pushDoc = (cat: string, doc: KpmDocumentFile | undefined, idx: number) => {
    if (!doc) return;
    const directUrl = sanitizeMediaUrl(doc.directUrl || doc.dataUrl);
    if (!directUrl) return;
    const fileId = doc.fileId || extractDriveFileId(directUrl) || null;
    const baseId = doc.id || `${kpmId}-${cat}-${idx}`;
    const docRowId = usedIds.has(baseId) ? `${kpmId}-${cat}-${idx}-${rows.length}` : baseId;
    usedIds.add(docRowId);
    rows.push({
      id: docRowId,
      kpm_id: kpmId,
      doc_category: cat,
      direct_url: directUrl,
      thumbnail_url:
        sanitizeMediaUrl(doc.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(fileId || directUrl) ||
        null,
      view_url: sanitizeMediaUrl(doc.viewUrl),
      drive_file_id: fileId,
      file_name: doc.fileName || '',
      mime_type: doc.mimeType || 'image/jpeg',
      original_size: doc.originalSize || 0,
      compressed_size: doc.compressedSize || 0,
      width: doc.width || 0,
      height: doc.height || 0,
      sort_order: idx,
      uploaded_at: doc.uploadedAt || new Date().toISOString(),
    });
  };

  pushDoc('ktp', docs.ktp, 0);
  pushDoc('kk', docs.kk, 0);
  pushDoc('penerima', docs.penerima, 0);
  pushDoc('survey', docs.survey, 0);
  (docs.rumah || []).forEach((d, i) => pushDoc('rumah', d, i));
  (docs.lainnya || []).forEach((d, i) => pushDoc('lainnya', d, i));
  return rows;
}

function buildKpmRecordRow(
  record: KpmRecord,
  proposals: ProposalRecord[],
  pengelolaList: PengelolaProfile[]
) {
  const isAccepted = record.validasi === 'accepted';
  const matchedProposal = isAccepted
    ? (record.proposalId ? proposals.find((p) => p.id === record.proposalId) : undefined) ??
      proposals.find((p) => p.namaProposal === record.proposal && p.tahun === record.tahun) ??
      proposals.find((p) => p.namaProposal === record.proposal)
    : undefined;
  const matchedPengelola = pengelolaList.find((p) => p.displayName === record.pengelola);

  const ktpUrl = sanitizeMediaUrl(record.documents.ktp?.directUrl || record.documents.ktp?.dataUrl);
  const kkUrl = sanitizeMediaUrl(record.documents.kk?.directUrl || record.documents.kk?.dataUrl);
  const penerimaUrl = sanitizeMediaUrl(
    record.documents.penerima?.directUrl || record.documents.penerima?.dataUrl
  );
  const surveyUrl = sanitizeMediaUrl(
    record.documents.survey?.directUrl || record.documents.survey?.dataUrl
  );

  const tahunVal = isAccepted
    ? sanitizeYearValue(record.tahun) || sanitizeYearValue(matchedProposal?.tahun) || null
    : null;
  const proposalIdVal = isAccepted ? matchedProposal?.id || record.proposalId || null : null;
  const proposalNameVal = isAccepted
    ? matchedProposal?.namaProposal || (record.proposal?.trim() ? record.proposal.trim() : null)
    : null;

  return {
    id: record.id,
    register_code: isAccepted ? record.registerCode || '' : '',
    tahun: tahunVal,
    proposal_id: proposalIdVal,
    proposal: proposalNameVal,
    kecamatan: record.kecamatan || '',
    kelurahan: record.kelurahan || '',
    item: (record.item || '').slice(0, 20),
    nama: record.nama,
    alamat: record.alamat || '',
    rt: (record.rt || '').slice(0, 10),
    rw: (record.rw || '').slice(0, 10),
    nik_kk: (record.nikKk || '').slice(0, 16),
    nik_ktp: (record.nikKtp || '').slice(0, 16),
    dtsen: (record.dtsen || '').slice(0, 20),
    validasi: record.validasi,
    kontak: record.kontak || '',
    pekerjaan: record.pekerjaan || '',
    pengelola_id: matchedPengelola?.id || null,
    pengelola: record.pengelola || '',
    catatan: record.catatan || '',
    payment: record.payment || 0,
    foto_ktp_url: ktpUrl,
    foto_ktp_thumb_url: ktpUrl
      ? sanitizeMediaUrl(record.documents.ktp?.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(record.documents.ktp?.fileId || ktpUrl) ||
        null
      : null,
    foto_kk_url: kkUrl,
    foto_kk_thumb_url: kkUrl
      ? sanitizeMediaUrl(record.documents.kk?.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(record.documents.kk?.fileId || kkUrl) ||
        null
      : null,
    foto_penerima_url: penerimaUrl,
    foto_penerima_thumb_url: penerimaUrl
      ? sanitizeMediaUrl(record.documents.penerima?.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(record.documents.penerima?.fileId || penerimaUrl) ||
        null
      : null,
    foto_survey_url: surveyUrl,
    foto_survey_thumb_url: surveyUrl
      ? sanitizeMediaUrl(record.documents.survey?.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(record.documents.survey?.fileId || surveyUrl) ||
        null
      : null,
    berkas_dikembalikan: Boolean(record.berkasDikembalikan),
    berkas_dikembalikan_at: record.berkasDikembalikanAt || null,
    berkas_dikembalikan_by: record.berkasDikembalikanBy || null,
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
  };
}

async function fetchExistingIdsByForeignKeyInChunks(
  table: string,
  fkColumn: string,
  fkValues: string[],
  chunkSize = 100
): Promise<string[]> {
  const existingIds: string[] = [];
  for (let i = 0; i < fkValues.length; i += chunkSize) {
    const chunk = fkValues.slice(i, i + chunkSize);
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from(table)
        .select('id')
        .in(fkColumn, chunk)
        .order('id', { ascending: true })
        .range(from, to)
    );
    rows.forEach((r) => existingIds.push(String(r.id)));
  }
  return existingIds;
}

async function syncKpmDocsAndDeliveriesNonDestructive(
  recordsToSync: KpmRecord[],
  includeDeliveries = true
): Promise<void> {
  if (recordsToSync.length === 0) return;
  const nowIso = new Date().toISOString();
  const kpmIds = Array.from(new Set(recordsToSync.map((r) => r.id).filter(Boolean)));

  const allDocRows: Record<string, unknown>[] = [];
  const keepDocIds = new Set<string>();
  const deliveryKpmIds: string[] = [];
  const allDeliveryRows: Record<string, unknown>[] = [];
  const keepDeliveryIds = new Set<string>();

  for (const rec of recordsToSync) {
    const docRows = buildKpmDocumentRows(rec.id, rec.documents);
    docRows.forEach((row) => {
      keepDocIds.add(String(row.id));
      allDocRows.push(row);
    });

    if (includeDeliveries && rec.subItemDeliveries) {
      deliveryKpmIds.push(rec.id);
      const seenSubNames = new Set<string>();
      for (const [subName, state] of Object.entries(rec.subItemDeliveries)) {
        const cleanSub = subName.trim();
        if (!cleanSub || seenSubNames.has(cleanSub)) continue;
        seenSubNames.add(cleanSub);
        const delivId = `${rec.id}::${cleanSub}`;
        keepDeliveryIds.add(delivId);
        allDeliveryRows.push({
          id: delivId,
          kpm_id: rec.id,
          sub_item_name: cleanSub,
          delivered: Boolean(state.delivered),
          updated_at: state.updatedAt || nowIso,
          updated_by: state.updatedBy || null,
        });
      }
    }
  }

  // Upsert terlebih dahulu agar data tidak pernah hilang jika jaringan terputus di tengah jalan
  const existingDocIds = await fetchExistingIdsByForeignKeyInChunks('kpm_documents', 'kpm_id', kpmIds);
  if (allDocRows.length > 0) {
    await upsertInChunks('kpm_documents', allDocRows, 'id');
  }
  const obsoleteDocIds = existingDocIds.filter((id) => !keepDocIds.has(id));
  if (obsoleteDocIds.length > 0) {
    await deleteByIdsInChunks('kpm_documents', 'id', obsoleteDocIds);
  }

  if (includeDeliveries && deliveryKpmIds.length > 0) {
    const existingDelivIds = await fetchExistingIdsByForeignKeyInChunks(
      'kpm_sub_item_deliveries',
      'kpm_id',
      deliveryKpmIds
    );
    if (allDeliveryRows.length > 0) {
      await upsertInChunks('kpm_sub_item_deliveries', allDeliveryRows, 'kpm_id,sub_item_name');
    }
    const obsoleteDelivIds = existingDelivIds.filter((id) => !keepDeliveryIds.has(id));
    if (obsoleteDelivIds.length > 0) {
      await deleteByIdsInChunks('kpm_sub_item_deliveries', 'id', obsoleteDelivIds);
    }
  }
}

export async function appendKpmAuditLogsInSupabase(
  auditLogs: KpmAuditLogEntry[],
  validKpmIdsHint?: Set<string>
): Promise<void> {
  if (auditLogs.length === 0) return;
  const nowIso = new Date().toISOString();
  const seenIds = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const a of auditLogs) {
    if (!a.kpmId || seenIds.has(a.id)) continue;
    if (validKpmIdsHint && !validKpmIdsHint.has(a.kpmId)) continue;
    seenIds.add(a.id);
    const cleanTahun = sanitizeYearValue(a.tahun);
    rows.push({
      id: a.id,
      kpm_id: a.kpmId,
      action: a.action,
      actor_name: a.actorName || 'Admin',
      actor_email: a.actorEmail || null,
      timestamp: a.timestamp || nowIso,
      proposal: a.proposal || '',
      tahun: cleanTahun,
      changes: a.changes || [],
    });
  }
  if (rows.length > 0) {
    await upsertInChunks('kpm_audit_logs', rows, 'id');
  }
}

export async function appendProposalHistoryInSupabase(
  historyEntries: ProposalKpmHistoryEntry[],
  proposalsHint: ProposalRecord[] = [],
  validKpmIdsHint?: Set<string>
): Promise<void> {
  if (historyEntries.length === 0) return;
  const nowIso = new Date().toISOString();
  const propIdByKey = new Map<string, string>();
  proposalsHint.forEach((p) => {
    propIdByKey.set(`${p.tahun}::${p.namaProposal.trim().toLowerCase()}`, p.id);
  });

  const seenIds = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const h of historyEntries) {
    if (seenIds.has(h.id)) continue;
    seenIds.add(h.id);
    const cleanKpmId =
      h.kpmId && (!validKpmIdsHint || validKpmIdsHint.has(h.kpmId)) ? h.kpmId : null;
    const cleanHistTahun = sanitizeYearValue(h.tahun);
    rows.push({
      id: h.id,
      tahun: cleanHistTahun,
      proposal_id:
        propIdByKey.get(`${cleanHistTahun}::${(h.proposalName || '').trim().toLowerCase()}`) || null,
      proposal_name: h.proposalName || '',
      kpm_id: cleanKpmId,
      kpm_name: h.kpmName,
      register_code: h.registerCode || '',
      action: h.action,
      from_proposal: h.fromProposal || null,
      to_proposal: h.toProposal || null,
      actor_name: h.actorName || 'Admin',
      timestamp: h.timestamp || nowIso,
    });
  }
  if (rows.length > 0) {
    await upsertInChunks('proposal_kpm_history', rows, 'id');
  }
}

export async function upsertKpmRecordInSupabase(
  record: KpmRecord,
  proposals: ProposalRecord[],
  pengelolaList: PengelolaProfile[]
): Promise<void> {
  const rowPayload = buildKpmRecordRow(record, proposals, pengelolaList);

  const { error: upsertErr } = await supabase
    .from('kpm_records')
    .upsert(rowPayload, { onConflict: 'id' });
  if (upsertErr) throw upsertErr;

  await syncKpmDocsAndDeliveriesNonDestructive([record], true);
}

export async function updateKpmDocumentsInSupabase(
  record: KpmRecord,
  proposals: ProposalRecord[],
  pengelolaList: PengelolaProfile[]
): Promise<void> {
  await upsertKpmRecordInSupabase(record, proposals, pengelolaList);
}

export async function deleteKpmRecordInSupabase(kpmId: string): Promise<void> {
  const { error } = await supabase.from('kpm_records').delete().eq('id', kpmId);
  if (error) throw error;
}

export async function upsertKpmRecordsBatchInSupabase(params: {
  records: KpmRecord[];
  proposals: ProposalRecord[];
  pengelolaList: PengelolaProfile[];
  auditLogs?: KpmAuditLogEntry[];
  historyEntries?: ProposalKpmHistoryEntry[];
  includeDeliveries?: boolean;
}): Promise<void> {
  const {
    records,
    proposals,
    pengelolaList,
    auditLogs = [],
    historyEntries = [],
    includeDeliveries = true,
  } = params;

  if (records.length > 0) {
    const kpmRows = records.map((rec) => buildKpmRecordRow(rec, proposals, pengelolaList));
    await upsertInChunks('kpm_records', kpmRows, 'id');
    await syncKpmDocsAndDeliveriesNonDestructive(records, includeDeliveries);
  }

  if (auditLogs.length > 0) {
    const upsertedIds = records.length > 0 ? new Set(records.map((r) => r.id)) : undefined;
    await appendKpmAuditLogsInSupabase(auditLogs, upsertedIds);
  }
  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals);
  }
}

export async function deleteKpmRecordWithSideEffectsInSupabase(params: {
  kpmId: string;
  updatedRecordsInProposal?: KpmRecord[];
  proposals: ProposalRecord[];
  pengelolaList: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const {
    kpmId,
    updatedRecordsInProposal = [],
    proposals,
    pengelolaList,
    historyEntries = [],
  } = params;

  await deleteKpmRecordInSupabase(kpmId);

  if (updatedRecordsInProposal.length > 0) {
    const kpmRows = updatedRecordsInProposal.map((rec) =>
      buildKpmRecordRow(rec, proposals, pengelolaList)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }

  if (historyEntries.length > 0) {
    // KPM sudah dihapus, pastikan kpm_id menjadi null agar tidak melanggar FK
    await appendProposalHistoryInSupabase(historyEntries, proposals, new Set());
  }
}

export async function deleteKpmsBatchInSupabase(params: {
  kpmIds: string[];
  updatedRecords?: KpmRecord[];
  proposals: ProposalRecord[];
  pengelolaList: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const {
    kpmIds,
    updatedRecords = [],
    proposals,
    pengelolaList,
    historyEntries = [],
  } = params;

  const uniqueIds = Array.from(new Set(kpmIds.filter(Boolean)));
  if (uniqueIds.length > 0) {
    await deleteByIdsInChunks('kpm_records', 'id', uniqueIds);
  }

  if (updatedRecords.length > 0) {
    const kpmRows = updatedRecords.map((rec) =>
      buildKpmRecordRow(rec, proposals, pengelolaList)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }

  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals, new Set());
  }
}

export async function updateKpmStatusesBatchInSupabase(params: {
  updates: Array<{
    id: string;
    validasi: KpmRecord['validasi'];
    proposalId?: string | null;
    proposal?: string | null;
    tahun?: string | null;
    registerCode?: string;
    updatedAt: string;
  }>;
  auditLogs?: KpmAuditLogEntry[];
  historyEntries?: ProposalKpmHistoryEntry[];
  proposals?: ProposalRecord[];
}): Promise<void> {
  const { updates, auditLogs = [], historyEntries = [], proposals = [] } = params;
  const groupedUpdates = new Map<string, typeof updates>();
  for (const u of updates) {
    const isAccepted = u.validasi === 'accepted';
    const propId = isAccepted ? u.proposalId ?? null : null;
    const propName = isAccepted ? u.proposal?.trim() || null : null;
    const tahunKey = isAccepted ? (u.tahun ?? '__keep__') : '__null__';
    const key = `${u.validasi}::${propId || ''}::${propName || ''}::${tahunKey}`;
    const list = groupedUpdates.get(key) || [];
    list.push(u);
    groupedUpdates.set(key, list);
  }
  for (const list of groupedUpdates.values()) {
    const first = list[0];
    if (!first) continue;
    const isAccepted = first.validasi === 'accepted';
    const updatedAt = first.updatedAt || new Date().toISOString();
    const hasCustomRegister = list.some((x) => Boolean(x.registerCode));

    if (hasCustomRegister) {
      for (const u of list) {
        const patch: Record<string, unknown> = {
          validasi: u.validasi,
          proposal_id: isAccepted ? u.proposalId ?? null : null,
          proposal: isAccepted ? u.proposal?.trim() || null : null,
          updated_at: u.updatedAt || updatedAt,
        };
        if (!isAccepted) {
          patch.tahun = null;
          patch.register_code = '';
        } else {
          if (u.tahun !== undefined) {
            patch.tahun = sanitizeYearValue(u.tahun) || null;
          }
          if (u.registerCode) patch.register_code = u.registerCode;
        }
        const { error } = await supabase.from('kpm_records').update(patch).eq('id', u.id);
        if (error) throw error;
      }
      continue;
    }

    const ids = Array.from(new Set(list.map((x) => x.id).filter(Boolean)));
    const batchPatch: Record<string, unknown> = {
      validasi: first.validasi,
      proposal_id: isAccepted ? first.proposalId ?? null : null,
      proposal: isAccepted ? first.proposal?.trim() || null : null,
      updated_at: updatedAt,
    };
    if (!isAccepted) {
      batchPatch.tahun = null;
      batchPatch.register_code = '';
    } else if (first.tahun !== undefined) {
      batchPatch.tahun = sanitizeYearValue(first.tahun) || null;
    }
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await supabase
        .from('kpm_records')
        .update(batchPatch)
        .in('id', chunk);
      if (error) throw error;
    }
  }
  if (auditLogs.length > 0) {
    await appendKpmAuditLogsInSupabase(auditLogs);
  }
  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals);
  }
}

export async function upsertKpmSubItemDeliveriesInSupabase(params: {
  kpmId: string;
  deliveries: Record<string, SubItemDeliveryState>;
  updatedAt: string;
  auditLogs?: KpmAuditLogEntry[];
}): Promise<void> {
  const { kpmId, deliveries, updatedAt, auditLogs = [] } = params;
  const rows = Object.entries(deliveries)
    .map(([subName, state]) => {
      const cleanSub = subName.trim();
      if (!cleanSub) return null;
      return {
        id: `${kpmId}::${cleanSub}`,
        kpm_id: kpmId,
        sub_item_name: cleanSub,
        delivered: Boolean(state.delivered),
        updated_at: state.updatedAt || updatedAt,
        updated_by: state.updatedBy || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length > 0) {
    await upsertInChunks('kpm_sub_item_deliveries', rows, 'kpm_id,sub_item_name');
  }
  const { error: updErr } = await supabase
    .from('kpm_records')
    .update({ updated_at: updatedAt })
    .eq('id', kpmId);
  if (updErr) throw updErr;

  if (auditLogs.length > 0) {
    await appendKpmAuditLogsInSupabase(auditLogs, new Set([kpmId]));
  }
}

export async function updateKpmBerkasDikembalikanInSupabase(params: {
  kpmId: string;
  berkasDikembalikan: boolean;
  berkasDikembalikanAt?: string | null;
  berkasDikembalikanBy?: string | null;
  updatedAt: string;
  auditLogs?: KpmAuditLogEntry[];
}): Promise<void> {
  const { error } = await supabase
    .from('kpm_records')
    .update({
      berkas_dikembalikan: params.berkasDikembalikan,
      berkas_dikembalikan_at: params.berkasDikembalikanAt || null,
      berkas_dikembalikan_by: params.berkasDikembalikanBy || null,
      updated_at: params.updatedAt,
    })
    .eq('id', params.kpmId);
  if (error) throw error;

  if (params.auditLogs && params.auditLogs.length > 0) {
    await appendKpmAuditLogsInSupabase(params.auditLogs, new Set([params.kpmId]));
  }
}

function buildProposalRow(proposal: ProposalRecord, resolvedId: string) {
  const getUrl = (d?: KpmDocumentFile) => sanitizeMediaUrl(d?.directUrl || d?.dataUrl);
  return {
    id: resolvedId,
    tahun: proposal.tahun,
    tipe: proposal.tipe,
    kab_kota: proposal.kabKota || '',
    kecamatan: proposal.kecamatan || '',
    kelurahan: proposal.kelurahan || '',
    jalan: proposal.jalan || '',
    nama_proposal: proposal.namaProposal,
    jumlah_kpm: proposal.jumlahKpm ?? 66,
    status: proposal.status,
    checklist: {
      ...proposal.checklist,
      docx: Boolean(proposal.documents?.proposalOpd || proposal.documents?.proposalLurahCamat),
      rab: Boolean(proposal.documents?.rab),
      rt: Boolean(proposal.documents?.capRt),
      rw: Boolean(proposal.documents?.capRw),
      lurah: Boolean(proposal.documents?.capLurah),
      camat: Boolean(proposal.documents?.capCamat),
    },
    catatan: proposal.catatan || '',
    proposal_opd_url: getUrl(proposal.documents.proposalOpd),
    proposal_lurah_camat_url: getUrl(proposal.documents.proposalLurahCamat),
    rab_url: getUrl(proposal.documents.rab),
    cap_rt_url: getUrl(proposal.documents.capRt),
    cap_rw_url: getUrl(proposal.documents.capRw),
    cap_lurah_url: getUrl(proposal.documents.capLurah),
    cap_camat_url: getUrl(proposal.documents.capCamat),
    created_at: proposal.createdAt || new Date().toISOString(),
    updated_at: proposal.updatedAt || new Date().toISOString(),
  };
}

function buildProposalDocumentRows(proposal: ProposalRecord, resolvedId: string) {
  const getUrl = (d?: KpmDocumentFile) => sanitizeMediaUrl(d?.directUrl || d?.dataUrl);
  const slots: (keyof ProposalDocuments)[] = [
    'proposalOpd',
    'proposalLurahCamat',
    'rab',
    'capRt',
    'capRw',
    'capLurah',
    'capCamat',
  ];
  const docRows: Record<string, unknown>[] = [];
  const usedIds = new Set<string>();
  for (const slot of slots) {
    const doc = proposal.documents[slot];
    const directUrl = getUrl(doc);
    if (!doc || !directUrl) continue;
    const fileId = doc.fileId || extractDriveFileId(directUrl) || null;
    const baseId = doc.id || `${resolvedId}-${slot}`;
    const docId = usedIds.has(baseId) ? `${resolvedId}-${slot}` : baseId;
    usedIds.add(docId);
    docRows.push({
      id: docId,
      proposal_id: resolvedId,
      doc_slot: slot,
      direct_url: directUrl,
      thumbnail_url:
        sanitizeMediaUrl(doc.thumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(fileId || directUrl) ||
        null,
      view_url: sanitizeMediaUrl(doc.viewUrl),
      drive_file_id: fileId,
      file_name: doc.fileName || '',
      mime_type: doc.mimeType || 'application/octet-stream',
      original_size: doc.originalSize || 0,
      compressed_size: doc.compressedSize || 0,
      width: doc.width || 0,
      height: doc.height || 0,
      uploaded_at: doc.uploadedAt || new Date().toISOString(),
    });
  }
  return docRows;
}

export async function upsertProposalInSupabase(proposal: ProposalRecord): Promise<string> {
  // Resolve existing proposal ID if (tahun, nama_proposal) already exists under another ID
  let resolvedId = proposal.id;
  const { data: existingByKey, error: lookupErr } = await supabase
    .from('proposals')
    .select('id')
    .eq('tahun', proposal.tahun)
    .eq('nama_proposal', proposal.namaProposal)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (existingByKey?.id) {
    resolvedId = String(existingByKey.id);
  }

  const rowPayload = buildProposalRow(proposal, resolvedId);
  const { error: propErr } = await supabase
    .from('proposals')
    .upsert(rowPayload, { onConflict: 'id' });
  if (propErr) throw propErr;

  const docRows = buildProposalDocumentRows(proposal, resolvedId);
  const keepSlots = new Set(docRows.map((d) => String(d.doc_slot)));

  const { data: existingDocs, error: fetchDocsErr } = await supabase
    .from('proposal_documents')
    .select('id,doc_slot')
    .eq('proposal_id', resolvedId);
  if (fetchDocsErr) throw fetchDocsErr;

  // Reuse canonical row ID per (proposal_id, doc_slot) & upsert before deleting obsolete slots
  const existingIdBySlot = new Map<string, string>();
  (existingDocs || []).forEach((d) => {
    existingIdBySlot.set(String(d.doc_slot), String(d.id));
  });
  const mergedDocRows = docRows.map((row) => ({
    ...row,
    id: existingIdBySlot.get(String(row.doc_slot)) || row.id,
  }));

  if (mergedDocRows.length > 0) {
    const { error: insErr } = await supabase
      .from('proposal_documents')
      .upsert(mergedDocRows, { onConflict: 'proposal_id,doc_slot' });
    if (insErr) throw insErr;
  }

  const obsoleteDocIds = (existingDocs || [])
    .filter((d) => !keepSlots.has(String(d.doc_slot)))
    .map((d) => String(d.id));
  if (obsoleteDocIds.length > 0) {
    await deleteByIdsInChunks('proposal_documents', 'id', obsoleteDocIds);
  }

  return resolvedId;
}

export async function upsertProposalsBatchInSupabase(params: {
  proposals: ProposalRecord[];
  updatedRecords?: KpmRecord[];
  pengelolaList?: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
  auditLogs?: KpmAuditLogEntry[];
}): Promise<ProposalRecord[]> {
  const {
    proposals: proposalsToSave,
    updatedRecords = [],
    pengelolaList = [],
    historyEntries = [],
    auditLogs = [],
  } = params;

  const resolvedProposals: ProposalRecord[] = [];
  for (const prop of proposalsToSave) {
    const resolvedId = await upsertProposalInSupabase(prop);
    resolvedProposals.push({ ...prop, id: resolvedId });
  }

  if (updatedRecords.length > 0) {
    const kpmRows = updatedRecords.map((rec) =>
      buildKpmRecordRow(rec, resolvedProposals, pengelolaList)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }

  if (auditLogs.length > 0) {
    await appendKpmAuditLogsInSupabase(auditLogs);
  }
  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, resolvedProposals);
  }

  return resolvedProposals;
}

function buildPengelolaRow(p: PengelolaProfile, resolvedId: string, nowIso: string) {
  const dispName = (p.displayName || '').trim();
  const fotoUrl = sanitizeMediaUrl(p.foto?.directUrl || p.foto?.dataUrl);
  const fileId = p.foto?.fileId || extractDriveFileId(fotoUrl) || null;
  return {
    id: resolvedId,
    title: p.title,
    nama: p.nama,
    display_name: dispName,
    kab_kota: p.kabKota || '',
    kecamatan: p.kecamatan || '',
    kelurahan: p.kelurahan || '',
    alamat: p.alamat || '',
    kontak: p.kontak || '',
    foto_url: fotoUrl,
    foto_thumb_url: fotoUrl
      ? sanitizeMediaUrl(p.foto?.thumbnailUrl) || buildDriveFallbackThumbnailUrl(fileId || fotoUrl) || null
      : null,
    foto_view_url: sanitizeMediaUrl(p.foto?.viewUrl),
    foto_file_id: fileId,
    foto_file_name: p.foto?.fileName || null,
    foto_meta: p.foto
      ? {
          id: p.foto.id,
          originalSize: p.foto.originalSize,
          compressedSize: p.foto.compressedSize,
          width: p.foto.width,
          height: p.foto.height,
          mimeType: p.foto.mimeType,
          uploadedAt: p.foto.uploadedAt,
        }
      : null,
    created_at: p.createdAt || nowIso,
    updated_at: nowIso,
  };
}

export async function upsertPengelolaInSupabase(params: {
  profile: PengelolaProfile;
  updatedRecords?: KpmRecord[];
  proposals?: ProposalRecord[];
  pengelolaList?: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<string> {
  const nowIso = new Date().toISOString();
  const {
    profile,
    updatedRecords = [],
    proposals = [],
    pengelolaList = [],
    historyEntries = [],
  } = params;

  let resolvedId = profile.id;
  const { data: existingById } = await supabase
    .from('pengelola')
    .select('id')
    .eq('id', profile.id)
    .maybeSingle();
  if (!existingById?.id && profile.displayName.trim()) {
    const { data: existingByName } = await supabase
      .from('pengelola')
      .select('id')
      .eq('display_name', profile.displayName.trim())
      .maybeSingle();
    if (existingByName?.id) {
      resolvedId = String(existingByName.id);
    }
  }

  const { error } = await supabase
    .from('pengelola')
    .upsert(buildPengelolaRow(profile, resolvedId, nowIso), { onConflict: 'id' });
  if (error) throw error;

  if (updatedRecords.length > 0) {
    const mergedPengelola = pengelolaList.some((p) => p.id === profile.id)
      ? pengelolaList.map((p) => (p.id === profile.id ? { ...profile, id: resolvedId } : p))
      : [{ ...profile, id: resolvedId }, ...pengelolaList];
    const kpmRows = updatedRecords.map((rec) =>
      buildKpmRecordRow(rec, proposals, mergedPengelola)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }

  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals);
  }
  return resolvedId;
}

export async function deletePengelolaInSupabase(params: {
  pengelolaId: string;
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const { error } = await supabase.from('pengelola').delete().eq('id', params.pengelolaId);
  if (error) throw error;
  if (params.historyEntries && params.historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(params.historyEntries);
  }
}

export async function upsertCatalogItemsInSupabase(params: {
  itemsToSync: ItemBantuan[];
  renamedFrom?: { tahun: string; oldCode: string };
  deletedItem?: { tahun: string; code: string };
  updatedRecords?: KpmRecord[];
  proposals?: ProposalRecord[];
  pengelolaList?: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const {
    itemsToSync,
    renamedFrom,
    deletedItem,
    updatedRecords = [],
    proposals = [],
    pengelolaList = [],
    historyEntries = [],
  } = params;

  if (deletedItem) {
    const { error: delErr } = await supabase
      .from('item_bantuan')
      .delete()
      .eq('tahun', deletedItem.tahun)
      .eq('code', deletedItem.code);
    if (delErr) throw delErr;
  }

  const existingItemsData = await fetchAllPages((from, to) =>
    supabase
      .from('item_bantuan')
      .select('id,tahun,code')
      .order('id', { ascending: true })
      .range(from, to)
  );
  const existingItemByKey = new Map<string, string>();
  existingItemsData.forEach((r) => {
    existingItemByKey.set(`${String(r.tahun)}::${String(r.code)}`, String(r.id));
  });

  // Jika kode item diubah, pindahkan key peta ke kode baru agar ID kanonis database tetap terjaga
  if (renamedFrom) {
    const oldRealId = existingItemByKey.get(`${renamedFrom.tahun}::${renamedFrom.oldCode}`);
    const targetItem = itemsToSync.find((i) => i.tahun === renamedFrom.tahun);
    if (oldRealId && targetItem) {
      existingItemByKey.set(`${targetItem.tahun}::${targetItem.code}`, oldRealId);
    }
  }

  const itemRows: Record<string, unknown>[] = [];
  const keepItemIds = new Set<string>();
  const resolvedIdByKey = new Map<string, string>();

  itemsToSync.forEach((it, idx) => {
    const key = `${it.tahun}::${it.code}`;
    if (resolvedIdByKey.has(key)) return;
    let realId = existingItemByKey.get(key) || it.id || `${it.tahun}-${it.code}`;
    if (keepItemIds.has(realId)) {
      realId = `${it.tahun}-${it.code}-${idx + 1}`;
    }
    keepItemIds.add(realId);
    resolvedIdByKey.set(key, realId);
    itemRows.push({
      id: realId,
      tahun: it.tahun,
      code: it.code,
      name: it.name,
      sort_order: idx + 1,
      updated_at: nowIso,
    });
  });

  if (itemRows.length > 0) {
    await upsertInChunks('item_bantuan', itemRows, 'id');
  }

  const syncedItemIdList = Array.from(keepItemIds);
  if (syncedItemIdList.length > 0) {
    const existingSubRows: Record<string, unknown>[] = [];
    for (let i = 0; i < syncedItemIdList.length; i += 100) {
      const chunk = syncedItemIdList.slice(i, i + 100);
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from('item_sub_items')
          .select('id,item_id,sub_item_name')
          .in('item_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      );
      existingSubRows.push(...rows);
    }
    const existingSubIdByKey = new Map<string, string>();
    existingSubRows.forEach((r) => {
      existingSubIdByKey.set(
        `${String(r.item_id)}::${String(r.sub_item_name).trim().toLowerCase()}`,
        String(r.id)
      );
    });

    const subItemRows: Record<string, unknown>[] = [];
    const keepSubIds = new Set<string>();
    const seenSubKeys = new Set<string>();

    for (const it of itemsToSync) {
      const realId =
        resolvedIdByKey.get(`${it.tahun}::${it.code}`) || it.id || `${it.tahun}-${it.code}`;
      (it.subItems || []).forEach((rawSubName, idx) => {
        const subName = (rawSubName || '').trim();
        if (!subName) return;
        const subKey = `${realId}::${subName.toLowerCase()}`;
        if (seenSubKeys.has(subKey)) return;
        seenSubKeys.add(subKey);
        const subId =
          existingSubIdByKey.get(subKey) || `${realId}-sub-${subItemRows.length + 1}`;
        keepSubIds.add(subId);
        subItemRows.push({
          id: subId,
          item_id: realId,
          sub_item_name: subName,
          sort_order: idx + 1,
        });
      });
    }

    if (subItemRows.length > 0) {
      await upsertInChunks('item_sub_items', subItemRows, 'item_id,sub_item_name');
    }
    const obsoleteSubIds = existingSubRows
      .map((r) => String(r.id))
      .filter((id) => !keepSubIds.has(id));
    if (obsoleteSubIds.length > 0) {
      await deleteByIdsInChunks('item_sub_items', 'id', obsoleteSubIds);
    }
  }

  if (updatedRecords.length > 0) {
    const kpmRows = updatedRecords.map((rec) =>
      buildKpmRecordRow(rec, proposals, pengelolaList)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
    await syncKpmDocsAndDeliveriesNonDestructive(updatedRecords, true);
  }

  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals);
  }
}

export async function upsertPekerjaanListInSupabase(params: {
  pekerjaanList: string[];
  deletedName?: string;
  updatedRecords?: KpmRecord[];
  proposals?: ProposalRecord[];
  pengelolaList?: PengelolaProfile[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const {
    pekerjaanList,
    deletedName,
    updatedRecords = [],
    proposals = [],
    pengelolaList = [],
    historyEntries = [],
  } = params;

  const existingJobsData = await fetchAllPages((from, to) =>
    supabase
      .from('pekerjaan_master')
      .select('id,nama')
      .order('id', { ascending: true })
      .range(from, to)
  );
  const existingJobByName = new Map<string, string>();
  existingJobsData.forEach((r) => {
    existingJobByName.set(String(r.nama).trim().toLowerCase(), String(r.id));
  });

  if (deletedName) {
    const delId = existingJobByName.get(deletedName.trim().toLowerCase());
    if (delId) {
      await deleteByIdsInChunks('pekerjaan_master', 'id', [delId]);
    }
  }

  const jobRows: Record<string, unknown>[] = [];
  const seenNames = new Set<string>();
  const usedIds = new Set<string>();
  pekerjaanList.forEach((rawNama, idx) => {
    const nama = (rawNama || '').trim();
    if (!nama) return;
    const key = nama.toLowerCase();
    if (seenNames.has(key)) return;
    seenNames.add(key);

    let jobId =
      existingJobByName.get(key) ||
      `job-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || idx + 1}`;
    if (usedIds.has(jobId)) {
      jobId = `${jobId}-${idx + 1}`;
    }
    usedIds.add(jobId);
    jobRows.push({
      id: jobId,
      nama,
      sort_order: idx + 1,
    });
  });

  if (jobRows.length > 0) {
    await upsertInChunks('pekerjaan_master', jobRows, 'id');
  }

  if (updatedRecords.length > 0) {
    const kpmRows = updatedRecords.map((rec) =>
      buildKpmRecordRow(rec, proposals, pengelolaList)
    );
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }

  if (historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(historyEntries, proposals);
  }
}

export async function syncWilayahInSupabase(params: {
  wilayahList: WilayahKabKota[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const [existingKabsData, existingKecData, existingKelData] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('wilayah_kabkota').select('id,nama').order('id', { ascending: true }).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kecamatan')
        .select('id,kabkota_id,nama')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kelurahan')
        .select('id,kecamatan_id,nama')
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const existingKabByName = new Map<string, string>();
  existingKabsData.forEach((r) => {
    existingKabByName.set(String(r.nama).trim().toLowerCase(), String(r.id));
  });
  const existingKecByKey = new Map<string, string>();
  existingKecData.forEach((r) => {
    existingKecByKey.set(
      `${String(r.kabkota_id)}::${String(r.nama).trim().toLowerCase()}`,
      String(r.id)
    );
  });
  const existingKelByKey = new Map<string, string>();
  existingKelData.forEach((r) => {
    existingKelByKey.set(
      `${String(r.kecamatan_id)}::${String(r.nama).trim().toLowerCase()}`,
      String(r.id)
    );
  });

  const kabRows: Record<string, unknown>[] = [];
  const kecRows: Record<string, unknown>[] = [];
  const kelRows: Record<string, unknown>[] = [];
  const keepKabIds = new Set<string>();
  const keepKecIds = new Set<string>();
  const keepKelIds = new Set<string>();
  const seenKabNames = new Set<string>();
  const seenKecKeys = new Set<string>();
  const seenKelKeys = new Set<string>();

  params.wilayahList.forEach((kab, kabIdx) => {
    const kabNama = (kab.nama || '').trim();
    if (!kabNama) return;
    const kabNameKey = kabNama.toLowerCase();
    if (seenKabNames.has(kabNameKey)) return;
    seenKabNames.add(kabNameKey);

    let kabId = existingKabByName.get(kabNameKey) || kab.id || `kab-${kabIdx + 1}`;
    if (keepKabIds.has(kabId)) kabId = `${kabId}-${kabIdx + 1}`;
    keepKabIds.add(kabId);
    kabRows.push({ id: kabId, nama: kabNama, sort_order: kabIdx + 1, updated_at: nowIso });

    (kab.kecamatanList || []).forEach((kec, kIdx) => {
      const kecNama = (kec.nama || '').trim();
      if (!kecNama) return;
      const kecKey = `${kabId}::${kecNama.toLowerCase()}`;
      if (seenKecKeys.has(kecKey)) return;
      seenKecKeys.add(kecKey);

      let kecId = existingKecByKey.get(kecKey) || kec.id || `${kabId}-kec-${kIdx + 1}`;
      if (keepKecIds.has(kecId)) kecId = `${kecId}-${kIdx + 1}`;
      keepKecIds.add(kecId);
      kecRows.push({
        id: kecId,
        kabkota_id: kabId,
        nama: kecNama,
        sort_order: kIdx + 1,
        updated_at: nowIso,
      });

      (kec.kelurahanList || []).forEach((kel, vIdx) => {
        const kelNama = (kel || '').trim();
        if (!kelNama) return;
        const kelKey = `${kecId}::${kelNama.toLowerCase()}`;
        if (seenKelKeys.has(kelKey)) return;
        seenKelKeys.add(kelKey);

        let kelId = existingKelByKey.get(kelKey) || `${kecId}::${kelNama}`;
        if (keepKelIds.has(kelId)) kelId = `${kelId}-${vIdx + 1}`;
        keepKelIds.add(kelId);
        kelRows.push({
          id: kelId,
          kecamatan_id: kecId,
          nama: kelNama,
          sort_order: vIdx + 1,
          updated_at: nowIso,
        });
      });
    });
  });

  const deleteKelIds = existingKelData
    .map((r) => String(r.id))
    .filter((id) => !keepKelIds.has(id));
  if (deleteKelIds.length > 0) await deleteByIdsInChunks('wilayah_kelurahan', 'id', deleteKelIds);
  const deleteKecIds = existingKecData
    .map((r) => String(r.id))
    .filter((id) => !keepKecIds.has(id));
  if (deleteKecIds.length > 0) await deleteByIdsInChunks('wilayah_kecamatan', 'id', deleteKecIds);
  const deleteKabIds = existingKabsData
    .map((r) => String(r.id))
    .filter((id) => !keepKabIds.has(id));
  if (deleteKabIds.length > 0) await deleteByIdsInChunks('wilayah_kabkota', 'id', deleteKabIds);

  if (kabRows.length > 0) await upsertInChunks('wilayah_kabkota', kabRows, 'id');
  if (kecRows.length > 0) await upsertInChunks('wilayah_kecamatan', kecRows, 'id');
  if (kelRows.length > 0) await upsertInChunks('wilayah_kelurahan', kelRows, 'id');

  if (params.historyEntries && params.historyEntries.length > 0) {
    await appendProposalHistoryInSupabase(params.historyEntries);
  }
}

export async function importOperationalDeltaToSupabase(params: {
  recordsToSave: KpmRecord[];
  proposalsToSave: ProposalRecord[];
  pengelolaToSave: PengelolaProfile[];
  pekerjaanToAdd: string[];
  allProposals: ProposalRecord[];
  allPengelolaList: PengelolaProfile[];
  auditLogs?: KpmAuditLogEntry[];
  historyEntries?: ProposalKpmHistoryEntry[];
}): Promise<void> {
  const nowIso = new Date().toISOString();

  if (params.pekerjaanToAdd.length > 0) {
    const existingJobsData = await fetchAllPages((from, to) =>
      supabase
        .from('pekerjaan_master')
        .select('id,nama,sort_order')
        .order('id', { ascending: true })
        .range(from, to)
    );
    const existingJobByName = new Map<string, string>();
    let maxOrder = 0;
    existingJobsData.forEach((r) => {
      existingJobByName.set(String(r.nama).trim().toLowerCase(), String(r.id));
      maxOrder = Math.max(maxOrder, Number(r.sort_order || 0));
    });
    const newJobRows: Record<string, unknown>[] = [];
    params.pekerjaanToAdd.forEach((rawNama) => {
      const nama = rawNama.trim();
      if (!nama) return;
      const key = nama.toLowerCase();
      if (existingJobByName.has(key)) return;
      maxOrder += 1;
      const jobId = `job-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || maxOrder}`;
      existingJobByName.set(key, jobId);
      newJobRows.push({ id: jobId, nama, sort_order: maxOrder });
    });
    if (newJobRows.length > 0) {
      await upsertInChunks('pekerjaan_master', newJobRows, 'id');
    }
  }

  let resolvedPengelolaAll = params.allPengelolaList;
  if (params.pengelolaToSave.length > 0) {
    const idMap = new Map<string, string>();
    for (const p of params.pengelolaToSave) {
      const realId = await upsertPengelolaInSupabase({ profile: p });
      idMap.set(p.id, realId);
    }
    resolvedPengelolaAll = params.allPengelolaList.map((p) =>
      idMap.has(p.id) ? { ...p, id: idMap.get(p.id)! } : p
    );
  }

  let resolvedProposalsAll = params.allProposals;
  if (params.proposalsToSave.length > 0) {
    const propIdMap = new Map<string, string>();
    for (const prop of params.proposalsToSave) {
      const realId = await upsertProposalInSupabase(prop);
      propIdMap.set(prop.id, realId);
    }
    resolvedProposalsAll = params.allProposals.map((p) =>
      propIdMap.has(p.id) ? { ...p, id: propIdMap.get(p.id)! } : p
    );
  }

  if (params.recordsToSave.length > 0) {
    await upsertKpmRecordsBatchInSupabase({
      records: params.recordsToSave,
      proposals: resolvedProposalsAll,
      pengelolaList: resolvedPengelolaAll,
      auditLogs: params.auditLogs,
      historyEntries: params.historyEntries,
      includeDeliveries: true,
    });
  } else {
    if (params.auditLogs && params.auditLogs.length > 0) {
      await appendKpmAuditLogsInSupabase(params.auditLogs);
    }
    if (params.historyEntries && params.historyEntries.length > 0) {
      await appendProposalHistoryInSupabase(params.historyEntries, resolvedProposalsAll);
    }
  }
  void nowIso;
}

export async function supabaseUpdateProposalLockStatus(
  targets: Array<{
    id: string;
    tahun: string;
    namaProposal: string;
    status: ProposalLockStatus;
    updatedAt: string;
  }>,
  historyEntries: ProposalKpmHistoryEntry[] = []
): Promise<void> {
  if (targets.length === 0) return;

  const byStatus = new Map<ProposalLockStatus, typeof targets>();
  for (const t of targets) {
    const bucket = byStatus.get(t.status) || [];
    bucket.push(t);
    byStatus.set(t.status, bucket);
  }

  for (const [status, list] of byStatus.entries()) {
    const updatedAt = list[0]?.updatedAt || new Date().toISOString();
    const matchedIds = new Set<string>();
    const idList = Array.from(new Set(list.map((t) => t.id).filter(Boolean)));

    for (let i = 0; i < idList.length; i += 100) {
      const chunk = idList.slice(i, i + 100);
      const { data, error } = await supabase
        .from('proposals')
        .update({ status, updated_at: updatedAt })
        .in('id', chunk)
        .select('id');
      if (error) throw error;
      (data || []).forEach((row) => matchedIds.add(String(row.id)));
    }

    const unmatched = list.filter((t) => !matchedIds.has(t.id));
    for (const t of unmatched) {
      const { error } = await supabase
        .from('proposals')
        .update({ status, updated_at: t.updatedAt || updatedAt })
        .eq('tahun', t.tahun)
        .eq('nama_proposal', t.namaProposal);
      if (error) throw error;
    }
  }

  if (historyEntries.length > 0) {
    const histRows = historyEntries.map((h) => {
      const matchedTarget = targets.find(
        (t) =>
          t.tahun === h.tahun &&
          t.namaProposal.trim().toLowerCase() === h.proposalName.trim().toLowerCase()
      );
      return {
        id: h.id,
        tahun: sanitizeYearValue(h.tahun),
        proposal_id: matchedTarget?.id || null,
        proposal_name: h.proposalName,
        kpm_id: h.kpmId || null,
        kpm_name: h.kpmName,
        register_code: h.registerCode || '',
        action: h.action,
        from_proposal: h.fromProposal || null,
        to_proposal: h.toProposal || null,
        actor_name: h.actorName || 'Admin',
        timestamp: h.timestamp || new Date().toISOString(),
      };
    });
    await upsertInChunks('proposal_kpm_history', histRows, 'id');
  }
}

export async function supabaseDeleteProposalDirect(
  proposal: ProposalRecord,
  historyEntries: ProposalKpmHistoryEntry[] = []
): Promise<void> {
  const { data: deletedById, error: delErr } = await supabase
    .from('proposals')
    .delete()
    .eq('id', proposal.id)
    .select('id');
  if (delErr) throw delErr;

  if (!deletedById || deletedById.length === 0) {
    const { error: delByKeyErr } = await supabase
      .from('proposals')
      .delete()
      .eq('tahun', proposal.tahun)
      .eq('nama_proposal', proposal.namaProposal);
    if (delByKeyErr) throw delByKeyErr;
  }

  if (historyEntries.length > 0) {
    const histRows = historyEntries.map((h) => ({
      id: h.id,
      tahun: sanitizeYearValue(h.tahun),
      proposal_id: null,
      proposal_name: h.proposalName,
      kpm_id: h.kpmId || null,
      kpm_name: h.kpmName,
      register_code: h.registerCode || '',
      action: h.action,
      from_proposal: h.fromProposal || null,
      to_proposal: h.toProposal || null,
      actor_name: h.actorName || 'Admin',
      timestamp: h.timestamp || new Date().toISOString(),
    }));
    await upsertInChunks('proposal_kpm_history', histRows, 'id');
  }
}

export async function syncAllOperationalDataToSupabase(
  snapshot: SupabaseOperationalSnapshot
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Wilayah: fetch existing rows to preserve canonical DB IDs and avoid 23505 on natural unique keys
  const [existingKabsData, existingKecData, existingKelData] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('wilayah_kabkota').select('id,nama').order('id', { ascending: true }).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kecamatan')
        .select('id,kabkota_id,nama')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('wilayah_kelurahan')
        .select('id,kecamatan_id,nama')
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);
  const existingKabsRes = { data: existingKabsData };
  const existingKecRes = { data: existingKecData };
  const existingKelRes = { data: existingKelData };

  const existingKabByName = new Map<string, string>();
  (existingKabsRes.data || []).forEach((r) => {
    existingKabByName.set(String(r.nama).trim().toLowerCase(), String(r.id));
  });
  const existingKecByKey = new Map<string, string>();
  (existingKecRes.data || []).forEach((r) => {
    existingKecByKey.set(
      `${String(r.kabkota_id)}::${String(r.nama).trim().toLowerCase()}`,
      String(r.id)
    );
  });
  const existingKelByKey = new Map<string, string>();
  (existingKelRes.data || []).forEach((r) => {
    existingKelByKey.set(
      `${String(r.kecamatan_id)}::${String(r.nama).trim().toLowerCase()}`,
      String(r.id)
    );
  });

  const kabRows: Record<string, unknown>[] = [];
  const kecRows: Record<string, unknown>[] = [];
  const kelRows: Record<string, unknown>[] = [];
  const keepKabIds = new Set<string>();
  const keepKecIds = new Set<string>();
  const keepKelIds = new Set<string>();
  const seenKabNames = new Set<string>();
  const seenKecKeys = new Set<string>();
  const seenKelKeys = new Set<string>();

  snapshot.wilayahList.forEach((kab, kabIdx) => {
    const kabNama = (kab.nama || '').trim();
    if (!kabNama) return;
    const kabNameKey = kabNama.toLowerCase();
    if (seenKabNames.has(kabNameKey)) return;
    seenKabNames.add(kabNameKey);

    let kabId = existingKabByName.get(kabNameKey) || kab.id || `kab-${kabIdx + 1}`;
    if (keepKabIds.has(kabId)) {
      kabId = `${kabId}-${kabIdx + 1}`;
    }
    keepKabIds.add(kabId);
    kabRows.push({
      id: kabId,
      nama: kabNama,
      sort_order: kabIdx + 1,
      updated_at: nowIso,
    });

    (kab.kecamatanList || []).forEach((kec, kIdx) => {
      const kecNama = (kec.nama || '').trim();
      if (!kecNama) return;
      const kecKey = `${kabId}::${kecNama.toLowerCase()}`;
      if (seenKecKeys.has(kecKey)) return;
      seenKecKeys.add(kecKey);

      let kecId = existingKecByKey.get(kecKey) || kec.id || `${kabId}-kec-${kIdx + 1}`;
      if (keepKecIds.has(kecId)) {
        kecId = `${kecId}-${kIdx + 1}`;
      }
      keepKecIds.add(kecId);
      kecRows.push({
        id: kecId,
        kabkota_id: kabId,
        nama: kecNama,
        sort_order: kIdx + 1,
        updated_at: nowIso,
      });

      (kec.kelurahanList || []).forEach((kel, vIdx) => {
        const kelNama = (kel || '').trim();
        if (!kelNama) return;
        const kelKey = `${kecId}::${kelNama.toLowerCase()}`;
        if (seenKelKeys.has(kelKey)) return;
        seenKelKeys.add(kelKey);

        let kelId = existingKelByKey.get(kelKey) || `${kecId}::${kelNama}`;
        if (keepKelIds.has(kelId)) {
          kelId = `${kelId}-${vIdx + 1}`;
        }
        keepKelIds.add(kelId);
        kelRows.push({
          id: kelId,
          kecamatan_id: kecId,
          nama: kelNama,
          sort_order: vIdx + 1,
          updated_at: nowIso,
        });
      });
    });
  });

  // Delete removed Wilayah children-first before upserting so deleted rows never collide on nama
  const deleteKelIds = (existingKelRes.data || [])
    .map((r) => String(r.id))
    .filter((id) => !keepKelIds.has(id));
  if (deleteKelIds.length > 0) {
    await deleteByIdsInChunks('wilayah_kelurahan', 'id', deleteKelIds);
  }
  const deleteKecIds = (existingKecRes.data || [])
    .map((r) => String(r.id))
    .filter((id) => !keepKecIds.has(id));
  if (deleteKecIds.length > 0) {
    await deleteByIdsInChunks('wilayah_kecamatan', 'id', deleteKecIds);
  }
  const deleteKabIds = (existingKabsRes.data || [])
    .map((r) => String(r.id))
    .filter((id) => !keepKabIds.has(id));
  if (deleteKabIds.length > 0) {
    await deleteByIdsInChunks('wilayah_kabkota', 'id', deleteKabIds);
  }

  if (kabRows.length > 0) {
    await upsertInChunks('wilayah_kabkota', kabRows, 'id');
  }
  if (kecRows.length > 0) {
    await upsertInChunks('wilayah_kecamatan', kecRows, 'id');
  }
  if (kelRows.length > 0) {
    await upsertInChunks('wilayah_kelurahan', kelRows, 'id');
  }

  // 2. Pekerjaan (deduplicated, preserving canonical DB IDs, deleting removed rows)
  const existingJobsData = await fetchAllPages((from, to) =>
    supabase.from('pekerjaan_master').select('id,nama').order('id', { ascending: true }).range(from, to)
  );
  const existingJobsRes = { data: existingJobsData };
  const existingJobByName = new Map<string, string>();
  (existingJobsRes.data || []).forEach((r) => {
    existingJobByName.set(String(r.nama).trim().toLowerCase(), String(r.id));
  });

  const jobRows: Record<string, unknown>[] = [];
  const seenJobNames = new Set<string>();
  const usedJobIds = new Set<string>();
  snapshot.pekerjaanList.forEach((rawNama, idx) => {
    const nama = (rawNama || '').trim();
    if (!nama) return;
    const key = nama.toLowerCase();
    if (seenJobNames.has(key)) return;
    seenJobNames.add(key);

    let jobId =
      existingJobByName.get(key) || `job-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || idx + 1}`;
    if (usedJobIds.has(jobId)) {
      jobId = `${jobId}-${idx + 1}`;
    }
    usedJobIds.add(jobId);
    jobRows.push({
      id: jobId,
      nama,
      sort_order: idx + 1,
    });
  });
  const deleteJobIds = (existingJobsRes.data || [])
    .map((r) => String(r.id))
    .filter((id) => !usedJobIds.has(id));
  if (deleteJobIds.length > 0) {
    await deleteByIdsInChunks('pekerjaan_master', 'id', deleteJobIds);
  }
  if (jobRows.length > 0) {
    await upsertInChunks('pekerjaan_master', jobRows, 'id');
  }

  // 3. Items & Sub-Items (preserve canonical item IDs before upserting to prevent FK breakage)
  const existingItemsData = await fetchAllPages((from, to) =>
    supabase.from('item_bantuan').select('id,tahun,code').order('id', { ascending: true }).range(from, to)
  );
  const existingItemsRes = { data: existingItemsData };
  const existingItemByKey = new Map<string, string>();
  (existingItemsRes.data || []).forEach((r) => {
    existingItemByKey.set(`${String(r.tahun)}::${String(r.code)}`, String(r.id));
  });

  const itemRows: Record<string, unknown>[] = [];
  const seenItemKeys = new Set<string>();
  const keepItemIds = new Set<string>();
  const resolvedItemIdByKey = new Map<string, string>();

  snapshot.items.forEach((it, idx) => {
    const key = `${it.tahun}::${it.code}`;
    if (seenItemKeys.has(key)) return;
    seenItemKeys.add(key);

    let realId = existingItemByKey.get(key) || it.id || `${it.tahun}-${it.code}`;
    if (keepItemIds.has(realId)) {
      realId = `${it.tahun}-${it.code}-${idx + 1}`;
    }
    keepItemIds.add(realId);
    resolvedItemIdByKey.set(key, realId);

    itemRows.push({
      id: realId,
      tahun: it.tahun,
      code: it.code,
      name: it.name,
      sort_order: idx + 1,
      updated_at: nowIso,
    });
  });

  const deleteItemIds = (existingItemsRes.data || [])
    .filter((r) => !seenItemKeys.has(`${r.tahun}::${r.code}`))
    .map((r) => String(r.id));
  if (deleteItemIds.length > 0) {
    await deleteByIdsInChunks('item_bantuan', 'id', deleteItemIds);
  }
  if (itemRows.length > 0) {
    await upsertInChunks('item_bantuan', itemRows, 'id');
  }

  const existingSubsData = await fetchAllPages((from, to) =>
    supabase
      .from('item_sub_items')
      .select('id,item_id,sub_item_name')
      .order('id', { ascending: true })
      .range(from, to)
  );
  const existingSubIdByKey = new Map<string, string>();
  existingSubsData.forEach((r) => {
    existingSubIdByKey.set(
      `${String(r.item_id)}::${String(r.sub_item_name).trim().toLowerCase()}`,
      String(r.id)
    );
  });

  const subItemRows: Record<string, unknown>[] = [];
  const keepSubIds = new Set<string>();
  const seenSubItemKeys = new Set<string>();
  for (const it of snapshot.items) {
    const realId = resolvedItemIdByKey.get(`${it.tahun}::${it.code}`) || it.id || `${it.tahun}-${it.code}`;
    (it.subItems || []).forEach((rawSubName, idx) => {
      const subName = (rawSubName || '').trim();
      if (!subName) return;
      const subKey = `${realId}::${subName.toLowerCase()}`;
      if (seenSubItemKeys.has(subKey)) return;
      seenSubItemKeys.add(subKey);
      const subId = existingSubIdByKey.get(subKey) || `${realId}-sub-${subItemRows.length + 1}`;
      keepSubIds.add(subId);
      subItemRows.push({
        id: subId,
        item_id: realId,
        sub_item_name: subName,
        sort_order: idx + 1,
      });
    });
  }
  if (subItemRows.length > 0) {
    await upsertInChunks('item_sub_items', subItemRows, 'item_id,sub_item_name');
  }
  const obsoleteSubIds = existingSubsData
    .map((r) => String(r.id))
    .filter((id) => !keepSubIds.has(id));
  if (obsoleteSubIds.length > 0) {
    await deleteByIdsInChunks('item_sub_items', 'id', obsoleteSubIds);
  }

  // 4. Pengelola (preserve existing IDs on edit, delete removed rows)
  const existingPengelolaData = await fetchAllPages((from, to) =>
    supabase.from('pengelola').select('id,display_name').order('id', { ascending: true }).range(from, to)
  );
  const existingPengelolaRes = { data: existingPengelolaData };
  const existingPengelolaIds = new Set<string>();
  const existingPengelolaByName = new Map<string, string>();
  (existingPengelolaRes.data || []).forEach((r) => {
    const pid = String(r.id);
    existingPengelolaIds.add(pid);
    existingPengelolaByName.set(String(r.display_name).trim().toLowerCase(), pid);
  });

  const pengelolaRows: Record<string, unknown>[] = [];
  const effectivePengelolaList: PengelolaProfile[] = [];
  const seenPengelolaNames = new Set<string>();
  const usedPengelolaIds = new Set<string>();

  for (const p of snapshot.pengelolaList) {
    const dispName = (p.displayName || '').trim();
    if (!dispName) continue;
    const nameKey = dispName.toLowerCase();
    if (seenPengelolaNames.has(nameKey)) continue;
    seenPengelolaNames.add(nameKey);

    let resolvedPglId = existingPengelolaIds.has(p.id)
      ? p.id
      : existingPengelolaByName.get(nameKey) || p.id;
    if (usedPengelolaIds.has(resolvedPglId)) {
      resolvedPglId = `${resolvedPglId}-${pengelolaRows.length + 1}`;
    }
    usedPengelolaIds.add(resolvedPglId);
    effectivePengelolaList.push({ ...p, id: resolvedPglId });

    const fotoUrl = sanitizeMediaUrl(p.foto?.directUrl || p.foto?.dataUrl);
    const fileId = p.foto?.fileId || extractDriveFileId(fotoUrl) || null;
    pengelolaRows.push({
      id: resolvedPglId,
      title: p.title,
      nama: p.nama,
      display_name: dispName,
      kab_kota: p.kabKota || '',
      kecamatan: p.kecamatan || '',
      kelurahan: p.kelurahan || '',
      alamat: p.alamat || '',
      kontak: p.kontak || '',
      foto_url: fotoUrl,
      foto_thumb_url: fotoUrl
        ? sanitizeMediaUrl(p.foto?.thumbnailUrl) || buildDriveFallbackThumbnailUrl(fileId || fotoUrl) || null
        : null,
      foto_view_url: sanitizeMediaUrl(p.foto?.viewUrl),
      foto_file_id: fileId,
      foto_file_name: p.foto?.fileName || null,
      foto_meta: p.foto
        ? {
            id: p.foto.id,
            originalSize: p.foto.originalSize,
            compressedSize: p.foto.compressedSize,
            width: p.foto.width,
            height: p.foto.height,
            mimeType: p.foto.mimeType,
            uploadedAt: p.foto.uploadedAt,
          }
        : null,
      created_at: p.createdAt || nowIso,
      updated_at: nowIso,
    });
  }
  const deletePengelolaIds = Array.from(existingPengelolaIds).filter(
    (id) => !usedPengelolaIds.has(id)
  );
  if (deletePengelolaIds.length > 0) {
    await deleteByIdsInChunks('pengelola', 'id', deletePengelolaIds);
  }
  if (pengelolaRows.length > 0) {
    await upsertInChunks('pengelola', pengelolaRows, 'id');
  }

  // 5. Proposals & Proposal Documents (resolve canonical IDs by (tahun, nama_proposal))
  const existingPropsData = await fetchAllPages((from, to) =>
    supabase
      .from('proposals')
      .select('id,tahun,nama_proposal')
      .order('id', { ascending: true })
      .range(from, to)
  );
  const existingPropsRes = { data: existingPropsData };
  const existingPropByKey = new Map<string, string>();
  const existingPropIds = new Set<string>();
  (existingPropsRes.data || []).forEach((p) => {
    const pid = String(p.id);
    existingPropIds.add(pid);
    existingPropByKey.set(`${String(p.tahun)}::${String(p.nama_proposal).trim().toLowerCase()}`, pid);
  });

  const effectiveProposals: ProposalRecord[] = [];
  const proposalRows: Record<string, unknown>[] = [];
  const proposalDocRowsRaw: Record<string, unknown>[] = [];
  const seenPropKeys = new Set<string>();
  const keepPropIds = new Set<string>();

  for (const prop of snapshot.proposals) {
    if (String(prop.tipe) !== 'Murni' && String(prop.tipe) !== 'Perubahan') continue;
    const propKey = `${prop.tahun}::${prop.namaProposal.trim().toLowerCase()}`;
    if (seenPropKeys.has(propKey)) continue;
    seenPropKeys.add(propKey);

    let resolvedPropId = existingPropByKey.get(propKey) || prop.id;
    if (keepPropIds.has(resolvedPropId)) {
      resolvedPropId = `${resolvedPropId}-${effectiveProposals.length + 1}`;
    }
    keepPropIds.add(resolvedPropId);
    effectiveProposals.push({ ...prop, id: resolvedPropId });
    proposalRows.push(buildProposalRow(prop, resolvedPropId));
    proposalDocRowsRaw.push(...buildProposalDocumentRows(prop, resolvedPropId));
  }

  const deletePropIds = Array.from(existingPropIds).filter((id) => !keepPropIds.has(id));
  if (deletePropIds.length > 0) {
    await deleteByIdsInChunks('proposals', 'id', deletePropIds);
  }
  if (proposalRows.length > 0) {
    await upsertInChunks('proposals', proposalRows, 'id');
  }
  const keepPropIdList = Array.from(keepPropIds);
  if (keepPropIdList.length > 0) {
    const existingPropDocs: Record<string, unknown>[] = [];
    for (let i = 0; i < keepPropIdList.length; i += 100) {
      const chunk = keepPropIdList.slice(i, i + 100);
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from('proposal_documents')
          .select('id,proposal_id,doc_slot')
          .in('proposal_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      );
      existingPropDocs.push(...rows);
    }
    const propDocIdByKey = new Map<string, string>();
    existingPropDocs.forEach((d) => {
      propDocIdByKey.set(`${String(d.proposal_id)}::${String(d.doc_slot)}`, String(d.id));
    });
    const keepPropDocIds = new Set<string>();
    const mergedPropDocs = proposalDocRowsRaw.map((row) => {
      const k = `${String(row.proposal_id)}::${String(row.doc_slot)}`;
      const realDocId = propDocIdByKey.get(k) || String(row.id);
      keepPropDocIds.add(realDocId);
      return { ...row, id: realDocId };
    });
    if (mergedPropDocs.length > 0) {
      await upsertInChunks('proposal_documents', mergedPropDocs, 'proposal_id,doc_slot');
    }
    const obsoletePropDocIds = existingPropDocs
      .map((d) => String(d.id))
      .filter((id) => !keepPropDocIds.has(id));
    if (obsoletePropDocIds.length > 0) {
      await deleteByIdsInChunks('proposal_documents', 'id', obsoletePropDocIds);
    }
  }

  // 6. KPM Records, Documents & Sub-Item Deliveries (bulk batched, paginated lookup, non-destructive child upsert)
  const existingKpmsData = await fetchAllPages((from, to) =>
    supabase.from('kpm_records').select('id').order('id', { ascending: true }).range(from, to)
  );

  const kpmRows: Record<string, unknown>[] = [];
  const keepKpmIds = new Set<string>();
  const dedupedRecords: KpmRecord[] = [];

  for (const rec of snapshot.records) {
    if (keepKpmIds.has(rec.id)) continue;
    keepKpmIds.add(rec.id);
    dedupedRecords.push(rec);
    kpmRows.push(buildKpmRecordRow(rec, effectiveProposals, effectivePengelolaList));
  }

  const deleteKpmIds = existingKpmsData
    .map((r) => String(r.id))
    .filter((id) => !keepKpmIds.has(id));
  if (deleteKpmIds.length > 0) {
    await deleteByIdsInChunks('kpm_records', 'id', deleteKpmIds);
  }
  if (kpmRows.length > 0) {
    await upsertInChunks('kpm_records', kpmRows, 'id');
  }
  if (dedupedRecords.length > 0) {
    await syncKpmDocsAndDeliveriesNonDestructive(dedupedRecords, true);
  }

  // 7. History & Audit Logs (upsert latest in chunks)
  if (snapshot.proposalHistory.length > 0) {
    const propIdByKey = new Map<string, string>();
    effectiveProposals.forEach((p) =>
      propIdByKey.set(`${p.tahun}::${p.namaProposal.trim().toLowerCase()}`, p.id)
    );
    const seenHistIds = new Set<string>();
    const histRows: Record<string, unknown>[] = [];
    for (const h of snapshot.proposalHistory.slice(0, 1000)) {
      if (seenHistIds.has(h.id)) continue;
      seenHistIds.add(h.id);
      const cleanHistTahun = sanitizeYearValue(h.tahun);
      histRows.push({
        id: h.id,
        tahun: cleanHistTahun,
        proposal_id:
          propIdByKey.get(`${cleanHistTahun}::${h.proposalName.trim().toLowerCase()}`) || null,
        proposal_name: h.proposalName,
        kpm_id: keepKpmIds.has(h.kpmId) ? h.kpmId : null,
        kpm_name: h.kpmName,
        register_code: h.registerCode || '',
        action: h.action,
        from_proposal: h.fromProposal || null,
        to_proposal: h.toProposal || null,
        actor_name: h.actorName || 'Admin',
        timestamp: h.timestamp || nowIso,
      });
    }
    if (histRows.length > 0) {
      await upsertInChunks('proposal_kpm_history', histRows, 'id');
    }
  }

  if (snapshot.kpmAuditLogs.length > 0) {
    const seenAuditIds = new Set<string>();
    const validLogs: Record<string, unknown>[] = [];
    for (const a of snapshot.kpmAuditLogs) {
      if (!keepKpmIds.has(a.kpmId) || seenAuditIds.has(a.id)) continue;
      seenAuditIds.add(a.id);
      validLogs.push({
        id: a.id,
        kpm_id: a.kpmId,
        action: a.action,
        actor_name: a.actorName || 'Admin',
        actor_email: a.actorEmail || null,
        timestamp: a.timestamp || nowIso,
        proposal: a.proposal || '',
        tahun: sanitizeYearValue(a.tahun),
        changes: a.changes || [],
      });
      if (validLogs.length >= 1500) break;
    }
    if (validLogs.length > 0) {
      await upsertInChunks('kpm_audit_logs', validLogs, 'id');
    }
  }
}

export async function runAdminDataActionInSupabase(
  action: AdminDataActionType
): Promise<void> {
  const deleteAllByCol = async (table: string, col = 'id', optional = false) => {
    const { error } = await supabase.from(table).delete().neq(col, '');
    if (error) {
      if (optional && isSchemaMissingError(error)) return;
      throw error;
    }
  };

  const clearOperationalAppStateKeys = async (keys: string[]) => {
    if (keys.length === 0) return;
    const { error } = await supabase.from('masdeta_app_state').delete().in('state_key', keys);
    if (error && !isSchemaMissingError(error)) {
      console.warn('App state cleanup warning:', error.message);
    }
  };

  if (action === 'delete_all_kpm') {
    await deleteAllByCol('kpm_audit_logs');
    await deleteAllByCol('kpm_sub_item_deliveries');
    await deleteAllByCol('kpm_documents');
    await deleteAllByCol('proposal_kpm_history');
    await deleteAllByCol('kpm_records');
    await clearOperationalAppStateKeys(['masdeta_proposal_slots_v1', 'masdeta_reconcile_snapshots_v1']);
    return;
  }

  if (action === 'delete_all_proposal') {
    // Hapus KPM yang terikat ke proposal beserta dokumen/auditnya agar tidak menyisakan data yatim
    const boundRows = await fetchAllPages<{ id: string }>((from, to) =>
      supabase
        .from('kpm_records')
        .select('id')
        .or('proposal_id.not.is.null,proposal.neq.')
        .order('id', { ascending: true })
        .range(from, to)
    );
    const boundIds = boundRows.map((r) => String(r.id)).filter(Boolean);
    for (let i = 0; i < boundIds.length; i += 200) {
      const chunk = boundIds.slice(i, i + 200);
      await supabase.from('kpm_audit_logs').delete().in('kpm_id', chunk);
      await supabase.from('kpm_sub_item_deliveries').delete().in('kpm_id', chunk);
      await supabase.from('kpm_documents').delete().in('kpm_id', chunk);
      const { error: delKpmErr } = await supabase.from('kpm_records').delete().in('id', chunk);
      if (delKpmErr) throw delKpmErr;
    }
    await deleteAllByCol('proposal_style_history', 'id', true);
    await deleteAllByCol('proposal_rab_configs', 'proposal_id', true);
    await deleteAllByCol('proposal_kpm_history');
    await deleteAllByCol('proposal_documents');
    await deleteAllByCol('proposals');
    await clearOperationalAppStateKeys([
      'masdeta_proposal_slots_v1',
      'masdeta_proposal_rab_configs_v1',
      'masdeta_proposal_style_history_v1',
      'masdeta_reconcile_snapshots_v1',
      'masdeta_proposal_bast_v1',
    ]);
    return;
  }

  if (action === 'delete_all_items') {
    await deleteAllByCol('item_sub_items');
    await deleteAllByCol('item_bantuan');
    return;
  }

  if (action === 'delete_all_data') {
    await deleteAllByCol('kpm_audit_logs');
    await deleteAllByCol('kpm_sub_item_deliveries');
    await deleteAllByCol('kpm_documents');
    await deleteAllByCol('proposal_kpm_history');
    await deleteAllByCol('kpm_records');
    await deleteAllByCol('proposal_style_history', 'id', true);
    await deleteAllByCol('proposal_rab_configs', 'proposal_id', true);
    await deleteAllByCol('proposal_documents');
    await deleteAllByCol('proposals');
    await deleteAllByCol('pengelola');
    await deleteAllByCol('schedules', 'id', true);
    await clearOperationalAppStateKeys([
      'masdeta_proposal_slots_v1',
      'masdeta_proposal_rab_configs_v1',
      'masdeta_proposal_style_history_v1',
      'masdeta_reconcile_snapshots_v1',
      'masdeta_trash_bin_v1',
      'masdeta_schedules_v1',
      'masdeta_proposal_bast_v1',
    ]);
    return;
  }

  if (action === 'reset_total') {
    await deleteAllByCol('direct_chat_messages');
    await deleteAllByCol('kpm_audit_logs');
    await deleteAllByCol('kpm_sub_item_deliveries');
    await deleteAllByCol('kpm_documents');
    await deleteAllByCol('proposal_kpm_history');
    await deleteAllByCol('kpm_records');
    await deleteAllByCol('proposal_style_history', 'id', true);
    await deleteAllByCol('proposal_rab_configs', 'proposal_id', true);
    await deleteAllByCol('proposal_documents');
    await deleteAllByCol('proposals');
    await deleteAllByCol('pengelola');
    await deleteAllByCol('item_sub_items');
    await deleteAllByCol('item_bantuan');
    await deleteAllByCol('pekerjaan_master');
    await deleteAllByCol('schedules', 'id', true);
    await clearOperationalAppStateKeys([
      'masdeta_proposal_slots_v1',
      'masdeta_proposal_rab_configs_v1',
      'masdeta_proposal_style_history_v1',
      'masdeta_reconcile_snapshots_v1',
      'masdeta_trash_bin_v1',
      'masdeta_schedules_v1',
      'masdeta_proposal_bast_v1',
    ]);
  }
}

// ============================================================================
// AUTH, USERS & CHAT (SUPABASE)
// ============================================================================
export async function supabaseFetchInternalUsers(): Promise<InternalUser[]> {
  try {
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from('internal_users')
        .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
        .order('registered_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    );
    const fallbackMap = await fetchFallbackUsernameMap();
    return rows.map((r) => {
      const mapped = mapSupabaseUserRow(r as Record<string, unknown>);
      if (!mapped.username && fallbackMap[mapped.id]) {
        return { ...mapped, username: fallbackMap[mapped.id] };
      }
      return mapped;
    });
  } catch (err) {
    if (!isMissingUsernameColumnError(err)) throw err;
    const [rows, fallbackMap] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase
          .from('internal_users')
          .select(SAFE_INTERNAL_USER_COLUMNS)
          .order('registered_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchFallbackUsernameMap(),
    ]);
    return rows.map((r) => {
      const mapped = mapSupabaseUserRow(r as Record<string, unknown>);
      return fallbackMap[mapped.id] ? { ...mapped, username: fallbackMap[mapped.id] } : mapped;
    });
  }
}

export async function supabaseLogin(
  identifierInput: string,
  password: string
): Promise<{ ok: boolean; user?: InternalUser; error?: string }> {
  const normalized = identifierInput.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false, error: 'Username/email dan kata sandi wajib diisi.' };
  }

  let useUsernameCol = true;
  let data: Record<string, unknown> | null = null;

  const findByColumn = async (
    col: 'email' | 'username' | 'id',
    val: string,
    cols: string
  ): Promise<Record<string, unknown> | null> => {
    const q = supabase.from('internal_users').select(`${cols},password_hash`);
    const res =
      col === 'id'
        ? await q.eq('id', val).limit(1).maybeSingle()
        : await q.ilike(col, val).limit(1).maybeSingle();
    if (res.error) throw res.error;
    return (res.data as Record<string, unknown> | null) ?? null;
  };

  try {
    data = await findByColumn(
      'email',
      normalized,
      SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME
    );
    if (!data) {
      data = await findByColumn(
        'username',
        normalized,
        SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME
      );
    }
  } catch (err) {
    if (!isMissingUsernameColumnError(err)) throw err;
    useUsernameCol = false;
    data = await findByColumn('email', normalized, SAFE_INTERNAL_USER_COLUMNS);
  }

  if (!data) {
    const fallbackMap = await fetchFallbackUsernameMap();
    const matchedUid = Object.entries(fallbackMap).find(
      ([, uname]) => uname.toLowerCase() === normalized
    )?.[0];
    if (matchedUid) {
      data = await findByColumn(
        'id',
        matchedUid,
        useUsernameCol ? SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME : SAFE_INTERNAL_USER_COLUMNS
      );
      if (data && !data.username) {
        data = { ...data, username: fallbackMap[matchedUid] };
      }
    }
  }

  if (!data) {
    return { ok: false, error: 'Username/email atau kata sandi salah.' };
  }

  const validPwd = await verifyPasswordHashForSupabase(
    password,
    String(data.password_hash || '')
  );
  if (!validPwd) {
    return { ok: false, error: 'Username/email atau kata sandi salah.' };
  }

  if (data.status === 'pending') {
    return {
      ok: false,
      error: 'Akun Anda masih menunggu persetujuan SuperAdmin.',
    };
  }
  if (data.status === 'rejected') {
    return {
      ok: false,
      error: 'Akun ini telah dinonaktifkan oleh SuperAdmin.',
    };
  }

  const nowIso = new Date().toISOString();
  const shouldSetOnline = !data.presence_manual;
  const updatePayload = {
    presence_status: shouldSetOnline ? 'online' : data.presence_status,
    last_active_at: nowIso,
    updated_at: nowIso,
  };
  const { data: updated, error: updErr } = useUsernameCol
    ? await supabase
        .from('internal_users')
        .update(updatePayload)
        .eq('id', data.id)
        .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
        .single()
    : await supabase
        .from('internal_users')
        .update(updatePayload)
        .eq('id', data.id)
        .select(SAFE_INTERNAL_USER_COLUMNS)
        .single();

  if (updErr || !updated) {
    const mapped = mapSupabaseUserRow(data);
    if (!mapped.username && typeof data.username === 'string') {
      mapped.username = normalizeUsername(data.username);
    }
    return { ok: true, user: mapped };
  }
  const mappedUpdated = mapSupabaseUserRow(updated as Record<string, unknown>);
  if (!mappedUpdated.username && typeof data.username === 'string') {
    mappedUpdated.username = normalizeUsername(data.username);
  }
  return { ok: true, user: mappedUpdated };
}

export async function supabaseRegisterInternalUser(payload: {
  nama: string;
  username: string;
  email: string;
  jabatan: string;
  kontak: string;
  password: string;
  fotoDataUrl?: string;
  fotoThumbnailUrl?: string;
  fotoFileId?: string;
}): Promise<{ ok: boolean; user?: InternalUser; error?: string }> {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedUsername = normalizeUsername(payload.username);

  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    return {
      ok: false,
      error:
        'Username harus 3–30 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).',
    };
  }

  const { data: existingEmail, error: chkEmailErr } = await supabase
    .from('internal_users')
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1);
  if (chkEmailErr) throw chkEmailErr;
  if (existingEmail && existingEmail.length > 0) {
    return { ok: false, error: 'Email tersebut sudah terdaftar di sistem MASDETA.' };
  }

  const { data: emailCollision, error: chkEmailUnameErr } = await supabase
    .from('internal_users')
    .select('id')
    .ilike('email', normalizedUsername)
    .limit(1);
  if (chkEmailUnameErr) throw chkEmailUnameErr;
  if (emailCollision && emailCollision.length > 0) {
    return { ok: false, error: 'Username tersebut tidak tersedia.' };
  }

  try {
    const { data: existingUname, error: chkUnameErr } = await supabase
      .from('internal_users')
      .select('id')
      .ilike('username', normalizedUsername)
      .limit(1);
    if (chkUnameErr) throw chkUnameErr;
    if (existingUname && existingUname.length > 0) {
      return { ok: false, error: 'Username tersebut sudah digunakan oleh akun lain.' };
    }
  } catch (err) {
    if (!isMissingUsernameColumnError(err)) throw err;
  }

  const fallbackMap = await fetchFallbackUsernameMap();
  if (Object.values(fallbackMap).some((u) => u.toLowerCase() === normalizedUsername)) {
    return { ok: false, error: 'Username tersebut sudah digunakan oleh akun lain.' };
  }

  const nowIso = new Date().toISOString();
  const passwordHash = await hashPasswordForSupabase(payload.password);
  const cleanFoto = sanitizeMediaUrl(payload.fotoDataUrl);
  const cleanFileId = payload.fotoFileId || extractDriveFileId(cleanFoto) || null;
  const cleanThumb = cleanFoto
    ? sanitizeMediaUrl(payload.fotoThumbnailUrl) ||
      buildDriveFallbackThumbnailUrl(cleanFileId || cleanFoto) ||
      null
    : null;

  const baseInsert = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nama: payload.nama.trim(),
    email: normalizedEmail,
    jabatan: payload.jabatan.trim() || 'Menunggu Penetapan SuperAdmin',
    kontak: payload.kontak.trim(),
    role: 'Viewer',
    status: 'pending',
    perm_add: false,
    perm_update: false,
    perm_delete: false,
    presence_status: 'offline',
    presence_manual: false,
    foto_url: cleanFoto,
    foto_thumb_url: cleanThumb,
    foto_file_id: cleanFileId,
    password_hash: passwordHash,
    registered_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('internal_users')
    .insert({ ...baseInsert, username: normalizedUsername })
    .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
    .single();

  if (error) {
    if (!isMissingUsernameColumnError(error)) {
      return { ok: false, error: error.message };
    }
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from('internal_users')
      .insert(baseInsert)
      .select(SAFE_INTERNAL_USER_COLUMNS)
      .single();
    if (fallbackErr || !fallbackData) {
      return { ok: false, error: fallbackErr?.message || 'Gagal mendaftar.' };
    }
    const createdUser = mapSupabaseUserRow(fallbackData as Record<string, unknown>);
    await saveFallbackUsername(createdUser.id, normalizedUsername);
    return { ok: true, user: { ...createdUser, username: normalizedUsername } };
  }

  return { ok: true, user: mapSupabaseUserRow(data as Record<string, unknown>) };
}

export async function supabaseCreateInternalUserBySuperAdmin(payload: {
  nama: string;
  username?: string;
  email: string;
  jabatan: string;
  kontak: string;
  role: InternalUserRole;
  password?: string;
}): Promise<{ ok: boolean; user?: InternalUser; error?: string }> {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const normalizedUsername = normalizeUsername(payload.username);

  if (normalizedUsername && !isValidUsername(normalizedUsername)) {
    return {
      ok: false,
      error:
        'Username harus 3–30 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).',
    };
  }

  const { data: existing, error: chkErr } = await supabase
    .from('internal_users')
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1);
  if (chkErr) throw chkErr;
  if (existing && existing.length > 0) {
    return { ok: false, error: 'Email tersebut sudah terdaftar.' };
  }

  if (normalizedUsername) {
    try {
      const { data: existingUname, error: chkUnameErr } = await supabase
        .from('internal_users')
        .select('id')
        .ilike('username', normalizedUsername)
        .limit(1);
      if (chkUnameErr) throw chkUnameErr;
      if (existingUname && existingUname.length > 0) {
        return { ok: false, error: 'Username tersebut sudah digunakan oleh akun lain.' };
      }
    } catch (err) {
      if (!isMissingUsernameColumnError(err)) throw err;
    }
    const fallbackMap = await fetchFallbackUsernameMap();
    if (Object.values(fallbackMap).some((u) => u.toLowerCase() === normalizedUsername)) {
      return { ok: false, error: 'Username tersebut sudah digunakan oleh akun lain.' };
    }
  }

  const nowIso = new Date().toISOString();
  const passwordHash = await hashPasswordForSupabase(payload.password?.trim() || 'masdeta123');
  const perms: UserPermissions =
    payload.role === 'SuperAdmin'
      ? { add: true, update: true, delete: true }
      : payload.role === 'Viewer'
        ? { add: false, update: false, delete: false }
        : { add: true, update: true, delete: false };

  const baseInsert: Record<string, unknown> = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nama: payload.nama.trim(),
    email: normalizedEmail,
    jabatan: payload.jabatan.trim() || payload.role,
    kontak: payload.kontak.trim(),
    role: payload.role,
    status: 'active',
    perm_add: perms.add,
    perm_update: perms.update,
    perm_delete: perms.delete,
    presence_status: 'offline',
    presence_manual: false,
    password_hash: passwordHash,
    registered_at: nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('internal_users')
    .insert(normalizedUsername ? { ...baseInsert, username: normalizedUsername } : baseInsert)
    .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
    .single();

  if (error) {
    if (!isMissingUsernameColumnError(error)) {
      return { ok: false, error: error.message };
    }
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from('internal_users')
      .insert(baseInsert)
      .select(SAFE_INTERNAL_USER_COLUMNS)
      .single();
    if (fallbackErr || !fallbackData) {
      return { ok: false, error: fallbackErr?.message || 'Gagal membuat user.' };
    }
    const createdUser = mapSupabaseUserRow(fallbackData as Record<string, unknown>);
    if (normalizedUsername) {
      await saveFallbackUsername(createdUser.id, normalizedUsername);
      return { ok: true, user: { ...createdUser, username: normalizedUsername } };
    }
    return { ok: true, user: createdUser };
  }

  return { ok: true, user: mapSupabaseUserRow(data as Record<string, unknown>) };
}

export async function supabaseUpdateInternalUserProfile(
  userId: string,
  patch: {
    nama?: string;
    jabatan?: string;
    kontak?: string;
    fotoDataUrl?: string | null;
    fotoThumbnailUrl?: string | null;
    fotoFileId?: string | null;
    presenceStatus?: UserPresenceStatus;
    presenceManual?: boolean;
  }
): Promise<InternalUser | null> {
  const updateBody: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.nama !== undefined) updateBody.nama = patch.nama;
  if (patch.jabatan !== undefined) updateBody.jabatan = patch.jabatan;
  if (patch.kontak !== undefined) updateBody.kontak = patch.kontak;
  if (patch.presenceStatus !== undefined) updateBody.presence_status = patch.presenceStatus;
  if (patch.presenceManual !== undefined) updateBody.presence_manual = patch.presenceManual;

  if (patch.fotoDataUrl !== undefined) {
    const cleanFoto = sanitizeMediaUrl(patch.fotoDataUrl);
    updateBody.foto_url = cleanFoto;
    updateBody.foto_file_id = cleanFoto
      ? patch.fotoFileId || extractDriveFileId(cleanFoto) || null
      : null;
    updateBody.foto_thumb_url = cleanFoto
      ? sanitizeMediaUrl(patch.fotoThumbnailUrl) ||
        buildDriveFallbackThumbnailUrl(updateBody.foto_file_id as string | null || cleanFoto) ||
        null
      : null;
  }

  const { data, error } = await supabase
    .from('internal_users')
    .update(updateBody)
    .eq('id', userId)
    .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
    .single();

  if (error) {
    if (!isMissingUsernameColumnError(error)) throw error;
    const { data: fbData, error: fbErr } = await supabase
      .from('internal_users')
      .update(updateBody)
      .eq('id', userId)
      .select(SAFE_INTERNAL_USER_COLUMNS)
      .single();
    if (fbErr) throw fbErr;
    return fbData ? mapSupabaseUserRow(fbData as Record<string, unknown>) : null;
  }
  return data ? mapSupabaseUserRow(data as Record<string, unknown>) : null;
}

export async function supabaseAdminControlInternalUser(
  userId: string,
  patch: {
    status?: InternalUserStatus;
    role?: InternalUserRole;
    permissions?: UserPermissions;
    nama?: string;
    jabatan?: string;
    kontak?: string;
    newPassword?: string;
  }
): Promise<InternalUser | null> {
  const updateBody: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) updateBody.status = patch.status;
  if (patch.role !== undefined) {
    updateBody.role = patch.role;
    if (patch.role === 'SuperAdmin') {
      updateBody.perm_add = true;
      updateBody.perm_update = true;
      updateBody.perm_delete = true;
    } else if (patch.role === 'Viewer') {
      updateBody.perm_add = false;
      updateBody.perm_update = false;
      updateBody.perm_delete = false;
    }
  }
  if (patch.permissions) {
    updateBody.perm_add = patch.permissions.add;
    updateBody.perm_update = patch.permissions.update;
    updateBody.perm_delete = patch.permissions.delete;
  }
  if (patch.nama !== undefined) updateBody.nama = patch.nama;
  if (patch.jabatan !== undefined) updateBody.jabatan = patch.jabatan;
  if (patch.kontak !== undefined) updateBody.kontak = patch.kontak;
  if (patch.newPassword?.trim()) {
    updateBody.password_hash = await hashPasswordForSupabase(patch.newPassword.trim());
  }

  const { data, error } = await supabase
    .from('internal_users')
    .update(updateBody)
    .eq('id', userId)
    .select(SAFE_INTERNAL_USER_COLUMNS_WITH_USERNAME)
    .single();

  if (error) {
    if (!isMissingUsernameColumnError(error)) throw error;
    const { data: fbData, error: fbErr } = await supabase
      .from('internal_users')
      .update(updateBody)
      .eq('id', userId)
      .select(SAFE_INTERNAL_USER_COLUMNS)
      .single();
    if (fbErr) throw fbErr;
    return fbData ? mapSupabaseUserRow(fbData as Record<string, unknown>) : null;
  }
  return data ? mapSupabaseUserRow(data as Record<string, unknown>) : null;
}

export async function supabaseDeleteInternalUser(userId: string): Promise<void> {
  const { error } = await supabase.from('internal_users').delete().eq('id', userId);
  if (error) throw error;
}

export async function supabaseVerifyUserPassword(
  userId: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('internal_users')
    .select('password_hash')
    .eq('id', userId)
    .single();
  if (error || !data) {
    return { ok: false, error: 'Akun tidak ditemukan.' };
  }
  const ok = await verifyPasswordHashForSupabase(password, String(data.password_hash || ''));
  return ok ? { ok: true } : { ok: false, error: 'Kata sandi salah.' };
}

export async function supabaseSetUserPresence(
  userId: string,
  presenceStatus: UserPresenceStatus,
  presenceManual = false
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('internal_users')
      .update({
        presence_status: presenceStatus,
        presence_manual: presenceManual,
        last_active_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

export function supabaseMarkOfflineKeepalive(userId: string): void {
  if (!isSupabaseConfigured || !userId || typeof fetch !== 'function') return;
  const nowIso = new Date().toISOString();
  const endpoint = `${SUPABASE_URL}/rest/v1/internal_users?id=eq.${encodeURIComponent(userId)}`;
  try {
    void fetch(endpoint, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        presence_status: 'offline',
        presence_manual: false,
        last_active_at: nowIso,
        updated_at: nowIso,
      }),
    }).catch(() => {});
  } catch {
    // Ignore unload fetch failure
  }
}

export async function supabaseFetchDirectMessages(): Promise<DirectChatMessage[]> {
  const rows = await fetchAllPages(
    (from, to) =>
      supabase
        .from('direct_chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    20_000
  );
  return rows.map((r) => mapSupabaseChatRow(r as Record<string, unknown>));
}

export async function supabaseSendDirectMessage(payload: {
  senderId: string;
  recipientId: string;
  text: string;
  sharedKpm?: SharedKpmCard;
}): Promise<DirectChatMessage> {
  const sorted = [payload.senderId, payload.recipientId].sort();
  const conversationKey = `${sorted[0]}::${sorted[1]}`;
  const cleanSharedFoto = sanitizeMediaUrl(payload.sharedKpm?.fotoDataUrl);
  const sanitizedSnapshot: SharedKpmCard | null = payload.sharedKpm
    ? {
        ...payload.sharedKpm,
        fotoDataUrl: cleanSharedFoto || undefined,
        fotoThumbnailUrl:
          sanitizeMediaUrl(payload.sharedKpm.fotoThumbnailUrl) ||
          (cleanSharedFoto ? buildDriveFallbackThumbnailUrl(cleanSharedFoto) : undefined),
      }
    : null;

  const { data, error } = await supabase
    .from('direct_chat_messages')
    .insert({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversation_key: conversationKey,
      sender_id: payload.senderId,
      recipient_id: payload.recipientId,
      text: payload.text.trim(),
      shared_kpm_id: payload.sharedKpm?.kpmId || null,
      shared_kpm_foto_url: cleanSharedFoto,
      shared_kpm_snapshot: sanitizedSnapshot,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapSupabaseChatRow(data as Record<string, unknown>);
}

export async function supabaseMarkDirectMessagesRead(
  conversationKey: string,
  readerId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('direct_chat_messages')
    .update({ read_at: now })
    .eq('conversation_key', conversationKey)
    .eq('recipient_id', readerId)
    .is('read_at', null);
  if (error) throw error;
}

const CHAT_DELIVERY_WATERMARKS_KEY = 'chat_delivery_watermarks';

export async function fetchChatDeliveryWatermarks(): Promise<Record<string, string>> {
  const raw = await fetchAppStateSlice<Record<string, string>>(CHAT_DELIVERY_WATERMARKS_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

export async function supabaseMarkDirectMessagesDelivered(
  recipientId: string,
  latestCreatedAtIso: string,
  messageIds?: string[]
): Promise<Record<string, string>> {
  const now = new Date().toISOString();

  // Attempt native column update if migration has been run; ignore missing-column errors safely
  try {
    let query = supabase
      .from('direct_chat_messages')
      .update({ delivered_at: now })
      .eq('recipient_id', recipientId)
      .is('delivered_at', null);
    if (messageIds && messageIds.length > 0) {
      query = query.in('id', messageIds);
    }
    await query;
  } catch {
    // Fallback watermark in masdeta_app_state guarantees cross-device delivery ticks even without column migration
  }

  const current = await fetchChatDeliveryWatermarks();
  const prevWatermark = current[recipientId];
  const prevTs = prevWatermark ? new Date(prevWatermark).getTime() : 0;
  const candidateTs = new Date(latestCreatedAtIso).getTime();
  const nextIso =
    Number.isFinite(candidateTs) && candidateTs > prevTs
      ? new Date(candidateTs).toISOString()
      : prevWatermark || now;

  if (nextIso === prevWatermark) {
    return current;
  }

  const next = {
    ...current,
    [recipientId]: nextIso,
  };
  await saveAppStateSlice(CHAT_DELIVERY_WATERMARKS_KEY, next);
  return next;
}

// ============================================================================
// APP STATE SLICES (Jadwal, Tempat Sampah 30 Hari, Kop Laporan, Metadata BAST)
// ============================================================================
export async function fetchAppStateSlice<T>(stateKey: string, fallback: T): Promise<T> {
  const localKey = `masdeta_slice_${stateKey}`;
  let localValue: T = fallback;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localValue = JSON.parse(raw) as T;
  } catch {
    // ignore storage errors
  }

  if (!isSupabaseConfigured) return localValue;
  try {
    const { data, error } = await supabase
      .from('masdeta_app_state')
      .select('payload')
      .eq('state_key', stateKey)
      .maybeSingle();
    if (error) {
      return localValue;
    }
    if (data && data.payload !== undefined && data.payload !== null) {
      const remoteVal = data.payload as T;
      try {
        localStorage.setItem(localKey, JSON.stringify(remoteVal));
      } catch {
        // ignore quota errors
      }
      return remoteVal;
    }
  } catch {
    // fallback to local cache
  }
  return localValue;
}

export async function saveAppStateSlice<T>(stateKey: string, payload: T): Promise<void> {
  const localKey = `masdeta_slice_${stateKey}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from('masdeta_app_state').upsert(
      {
        state_key: stateKey,
        payload: payload as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'state_key' }
    );
    if (error && !isSchemaMissingError(error)) {
      console.warn(`App state sync (${stateKey}) warning:`, error.message);
    }
  } catch {
    // keep local cache intact
  }
}

// ============================================================================
// JADWAL KEGIATAN (public.schedules) & TEMPLATE DOKUMEN (public.document_templates)
// ============================================================================
const SCHEDULES_LEGACY_STATE_KEY = 'masdeta_schedules_v1';

function mapRowToSchedule(row: Record<string, unknown>): ScheduleEventItem {
  return {
    id: String(row.id || ''),
    title: String(row.title || 'Agenda Kegiatan'),
    category: (String(row.category || 'lainnya') as ScheduleCategory) || 'lainnya',
    targetDay: row.target_day ? String(row.target_day) : undefined,
    targetDate: String(row.target_date || ''),
    targetTime: row.target_time ? String(row.target_time) : undefined,
    tahun: row.tahun
      ? String(row.tahun)
      : row.target_date
        ? String(row.target_date).slice(0, 4)
        : '2026',
    proposalName: row.proposal_name ? String(row.proposal_name) : undefined,
    location: row.location ? String(row.location) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    completed: Boolean(row.completed),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdBy: String(row.created_by || 'Petugas Internal'),
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
  };
}

function mapScheduleToRow(item: ScheduleEventItem) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    target_day: item.targetDay || null,
    target_date: item.targetDate,
    target_time: item.targetTime || null,
    tahun: item.tahun || null,
    proposal_name: item.proposalName || null,
    location: item.location || null,
    notes: item.notes || null,
    completed: Boolean(item.completed),
    completed_at: item.completedAt || null,
    created_by: item.createdBy || 'Petugas Internal',
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchSchedulesFromSupabase(): Promise<ScheduleEventItem[]> {
  const localKey = `masdeta_slice_${SCHEDULES_LEGACY_STATE_KEY}`;
  let localList: ScheduleEventItem[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) localList = parsed as ScheduleEventItem[];
    }
  } catch {
    // ignore storage errors
  }

  if (!isSupabaseConfigured) return localList;

  try {
    let data: Record<string, unknown>[] = [];
    try {
      data = await fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('schedules')
          .select('*')
          .order('target_date', { ascending: true })
          .order('target_time', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return await fetchAppStateSlice<ScheduleEventItem[]>(SCHEDULES_LEGACY_STATE_KEY, localList);
      }
      return localList;
    }

    if (data.length > 0) {
      const mapped = data.map((row) => mapRowToSchedule(row));
      try {
        localStorage.setItem(localKey, JSON.stringify(mapped));
      } catch {
        // ignore quota errors
      }
      return mapped;
    }

    // Tabel schedules ada namun masih kosong: migrasikan otomatis dari masdeta_app_state atau localStorage bila ada
    const legacyRemote = await fetchAppStateSlice<ScheduleEventItem[]>(SCHEDULES_LEGACY_STATE_KEY, []);
    const seedSource = legacyRemote.length > 0 ? legacyRemote : localList;
    if (seedSource.length > 0) {
      const { error: seedErr } = await supabase
        .from('schedules')
        .upsert(seedSource.map(mapScheduleToRow), { onConflict: 'id' });
      if (!seedErr) {
        try {
          localStorage.setItem(localKey, JSON.stringify(seedSource));
        } catch {
          // ignore
        }
      }
      return seedSource;
    }

    try {
      localStorage.setItem(localKey, JSON.stringify([]));
    } catch {
      // ignore
    }
    return [];
  } catch {
    return localList;
  }
}

export async function upsertScheduleInSupabase(
  item: ScheduleEventItem,
  fullNextList?: ScheduleEventItem[]
): Promise<void> {
  const localKey = `masdeta_slice_${SCHEDULES_LEGACY_STATE_KEY}`;
  if (fullNextList) {
    try {
      localStorage.setItem(localKey, JSON.stringify(fullNextList));
    } catch {
      // ignore
    }
  }
  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase
      .from('schedules')
      .upsert(mapScheduleToRow(item), { onConflict: 'id' });
    if (error) {
      if (isSchemaMissingError(error) && fullNextList) {
        await saveAppStateSlice(SCHEDULES_LEGACY_STATE_KEY, fullNextList);
      } else if (!isSchemaMissingError(error)) {
        console.warn('Schedule upsert warning:', error.message);
      }
    }
  } catch {
    // keep local cache intact
  }
}

export async function deleteScheduleFromSupabase(
  id: string,
  fullNextList?: ScheduleEventItem[]
): Promise<void> {
  const localKey = `masdeta_slice_${SCHEDULES_LEGACY_STATE_KEY}`;
  if (fullNextList) {
    try {
      localStorage.setItem(localKey, JSON.stringify(fullNextList));
    } catch {
      // ignore
    }
  }
  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) {
      if (isSchemaMissingError(error) && fullNextList) {
        await saveAppStateSlice(SCHEDULES_LEGACY_STATE_KEY, fullNextList);
      } else if (!isSchemaMissingError(error)) {
        console.warn('Schedule delete warning:', error.message);
      }
    }
  } catch {
    // keep local cache intact
  }
}

export type DocumentTemplateKey = 'report' | 'bast' | 'sptjm' | 'kupon' | 'proposal_bast' | 'pejabat';

export async function fetchDocumentTemplateFromSupabase<T>(
  templateKey: DocumentTemplateKey,
  legacyStateKey: string,
  fallback: T
): Promise<T> {
  const localKey = `masdeta_slice_${legacyStateKey}`;
  let localValue: T = fallback;
  let hasLocalValue = false;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      localValue = JSON.parse(raw) as T;
      hasLocalValue = true;
    }
  } catch {
    // ignore storage errors
  }

  if (!isSupabaseConfigured) return localValue;

  try {
    const { data, error } = await supabase
      .from('document_templates')
      .select('payload')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error)) {
        return await fetchAppStateSlice<T>(legacyStateKey, localValue);
      }
      return localValue;
    }

    if (data && data.payload !== undefined && data.payload !== null) {
      const remoteVal = data.payload as T;
      try {
        localStorage.setItem(localKey, JSON.stringify(remoteVal));
      } catch {
        // ignore quota errors
      }
      return remoteVal;
    }

    // Jika document_templates belum memiliki baris ini, cek masdeta_app_state atau localStorage
    const legacyRemote = await fetchAppStateSlice<T>(legacyStateKey, fallback);
    const fallbackJson = JSON.stringify(fallback);
    const hasLegacyRemote = JSON.stringify(legacyRemote) !== fallbackJson;
    const hasCustomLocal = hasLocalValue && JSON.stringify(localValue) !== fallbackJson;
    const seedPayload = hasLegacyRemote ? legacyRemote : hasCustomLocal ? localValue : null;
    if (seedPayload !== null) {
      await supabase.from('document_templates').upsert(
        {
          template_key: templateKey,
          payload: seedPayload as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'template_key' }
      );
      return seedPayload;
    }
  } catch {
    // fallback to local cache
  }
  return localValue;
}

export async function saveDocumentTemplateInSupabase<T>(
  templateKey: DocumentTemplateKey,
  legacyStateKey: string,
  payload: T
): Promise<void> {
  const localKey = `masdeta_slice_${legacyStateKey}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase.from('document_templates').upsert(
      {
        template_key: templateKey,
        payload: payload as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'template_key' }
    );
    if (error) {
      if (isSchemaMissingError(error)) {
        await saveAppStateSlice(legacyStateKey, payload);
      } else {
        console.warn(`Document template sync (${templateKey}) warning:`, error.message);
      }
    }
  } catch {
    // keep local cache intact
  }
}

export interface PublicKpmContext {
  record: KpmRecord;
  proposals: ProposalRecord[];
  items: ItemBantuan[];
  wilayahList: WilayahKabKota[];
}

export async function fetchPublicKpmContextFromSupabase(
  kpmIdOrCode: string
): Promise<PublicKpmContext | null> {
  if (!isSupabaseConfigured) return null;
  const clean = kpmIdOrCode.trim();
  if (!clean) return null;

  try {
    let kpmRow: Record<string, unknown> | null = null;
    const byIdRes = await supabase
      .from('kpm_records')
      .select('*')
      .eq('id', clean)
      .maybeSingle();

    if (!byIdRes.error && byIdRes.data) {
      kpmRow = byIdRes.data as Record<string, unknown>;
    } else {
      const byCodeRes = await supabase
        .from('kpm_records')
        .select('*')
        .ilike('register_code', clean)
        .limit(1);
      if (!byCodeRes.error && byCodeRes.data && byCodeRes.data.length > 0) {
        kpmRow = byCodeRes.data[0] as Record<string, unknown>;
      }
    }

    if (!kpmRow) return null;
    const kpmId = String(kpmRow.id);

    const matchedProposalId = kpmRow.proposal_id ? String(kpmRow.proposal_id) : '';
    const matchedProposalName = String(kpmRow.proposal || '').trim();
    const matchedProposalYear = String(kpmRow.tahun || '').trim();

    const [
      docsRes,
      deliveriesRes,
      proposalsRows,
      itemsRows,
      subItemsRows,
      kabRows,
      kecRows,
      kelRows,
    ] = await Promise.all([
      supabase
        .from('kpm_documents')
        .select('*')
        .eq('kpm_id', kpmId)
        .not('doc_category', 'in', '("ktp","kk")')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true }),
      supabase.from('kpm_sub_item_deliveries').select('*').eq('kpm_id', kpmId),
      (async (): Promise<Record<string, unknown>[]> => {
        if (matchedProposalId) {
          const { data, error } = await supabase
            .from('proposals')
            .select('*')
            .eq('id', matchedProposalId)
            .limit(1);
          if (!error && Array.isArray(data) && data.length > 0) {
            return data as Record<string, unknown>[];
          }
        }
        if (matchedProposalName) {
          let q = supabase
            .from('proposals')
            .select('*')
            .eq('nama_proposal', matchedProposalName)
            .limit(1);
          if (matchedProposalYear) q = q.eq('tahun', matchedProposalYear);
          const { data, error } = await q;
          if (!error && Array.isArray(data)) {
            return data as Record<string, unknown>[];
          }
        }
        return [];
      })().catch(() => [] as Record<string, unknown>[]),
      fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('item_bantuan')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ).catch(() => [] as Record<string, unknown>[]),
      fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('item_sub_items')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ).catch(() => [] as Record<string, unknown>[]),
      fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('wilayah_kabkota')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ).catch(() => [] as Record<string, unknown>[]),
      fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('wilayah_kecamatan')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ).catch(() => [] as Record<string, unknown>[]),
      fetchAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from('wilayah_kelurahan')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ).catch(() => [] as Record<string, unknown>[]),
    ]);

    const kelByKec = new Map<string, string[]>();
    for (const kel of kelRows) {
      const kecId = String(kel.kecamatan_id);
      const arr = kelByKec.get(kecId) || [];
      arr.push(String(kel.nama));
      kelByKec.set(kecId, arr);
    }
    const kecByKab = new Map<string, WilayahKabKota['kecamatanList']>();
    for (const kec of kecRows) {
      const kabId = String(kec.kabkota_id);
      const arr = kecByKab.get(kabId) || [];
      arr.push({
        id: String(kec.id),
        nama: String(kec.nama),
        kelurahanList: kelByKec.get(String(kec.id)) || [],
      });
      kecByKab.set(kabId, arr);
    }
    const wilayahList: WilayahKabKota[] = kabRows.map((kab) => ({
      id: String(kab.id),
      nama: String(kab.nama),
      kecamatanList: kecByKab.get(String(kab.id)) || [],
    }));

    const subByItem = new Map<string, string[]>();
    for (const sub of subItemsRows) {
      const itemId = String(sub.item_id);
      const arr = subByItem.get(itemId) || [];
      arr.push(String(sub.sub_item_name));
      subByItem.set(itemId, arr);
    }
    const items: ItemBantuan[] = itemsRows.map((it) => ({
      id: String(it.id),
      tahun: String(it.tahun),
      code: String(it.code),
      name: String(it.name),
      subItems: subByItem.get(String(it.id)) || [],
    }));

    const proposals: ProposalRecord[] = proposalsRows
      .filter((p) => {
        const tipeRaw = String(p.tipe || '').trim();
        return tipeRaw === 'Murni' || tipeRaw === 'Perubahan';
      })
      .map((p) => ({
        id: String(p.id),
        tahun: String(p.tahun),
        tipe: String(p.tipe) === 'Perubahan' ? 'Perubahan' : 'Murni',
        kabKota: String(p.kab_kota || ''),
        kecamatan: String(p.kecamatan || ''),
        kelurahan: String(p.kelurahan || ''),
        jalan: String(p.jalan || ''),
        namaProposal: String(p.nama_proposal || ''),
        jumlahKpm: Number(p.jumlah_kpm ?? 66),
        status: (p.status as ProposalRecord['status']) || 'unlocked',
        checklist: {
          docx: false,
          dinas: false,
          rab: false,
          rt: false,
          rw: false,
          lurah: false,
          camat: false,
        },
        catatan: String(p.catatan || ''),
        documents: {},
        createdAt: String(p.created_at || new Date().toISOString()),
        updatedAt: String(p.updated_at || new Date().toISOString()),
      }));

    const bag: KpmDocuments = { rumah: [], lainnya: [] };
    for (const row of docsRes.data || []) {
      const cat = String(row.doc_category);
      const doc = buildDocFileFromRow(row as Record<string, unknown>);
      if (!doc) continue;
      if (cat === 'ktp' || cat === 'kk' || cat === 'penerima' || cat === 'survey') {
        bag[cat] = doc;
      } else if (cat === 'rumah') {
        bag.rumah.push(doc);
      } else if (cat === 'lainnya') {
        bag.lainnya.push(doc);
      }
    }

    const documents: KpmDocuments = {
      ktp: undefined,
      kk: undefined,
      penerima:
        bag.penerima ||
        buildDocFileFromUrlFallback(
          kpmRow.foto_penerima_url as string | null,
          kpmRow.foto_penerima_thumb_url as string | null,
          `${kpmId}-penerima`,
          'Foto Penerima'
        ),
      survey:
        bag.survey ||
        buildDocFileFromUrlFallback(
          kpmRow.foto_survey_url as string | null,
          kpmRow.foto_survey_thumb_url as string | null,
          `${kpmId}-survey`,
          'Foto Survey'
        ),
      rumah: bag.rumah,
      lainnya: bag.lainnya,
    };

    const subItemDeliveries: Record<string, SubItemDeliveryState> = {};
    for (const row of deliveriesRes.data || []) {
      subItemDeliveries[String(row.sub_item_name)] = {
        delivered: Boolean(row.delivered),
        updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        updatedBy: row.updated_by ? String(row.updated_by) : undefined,
      };
    }

    const rawValidasi = (kpmRow.validasi as KpmRecord['validasi']) || 'pending';
    const rawPropId = kpmRow.proposal_id ? String(kpmRow.proposal_id) : null;
    const rawPropName = kpmRow.proposal ? String(kpmRow.proposal).trim() : '';
    const isPhantomArsip = !rawPropId && /^arsip\b/i.test(rawPropName);
    const isDetached = rawValidasi !== 'accepted' || isPhantomArsip;
    const effectiveValidasi: KpmRecord['validasi'] =
      rawValidasi === 'accepted' && isDetached ? 'pending' : rawValidasi;
    const matchedProp = !isDetached
      ? (rawPropId ? proposals.find((p) => p.id === rawPropId) : undefined) ??
        proposals.find((p) => p.namaProposal === rawPropName && p.tahun === String(kpmRow.tahun || '')) ??
        proposals.find((p) => p.namaProposal === rawPropName)
      : undefined;

    const rawNikDigits = String(kpmRow.nik_ktp || '').replace(/\D+/g, '');
    const maskedNikKtp =
      rawNikDigits.length >= 10
        ? `${rawNikDigits.slice(0, 6)}${'*'.repeat(Math.max(4, rawNikDigits.length - 10))}${rawNikDigits.slice(-4)}`
        : rawNikDigits;

    const record: KpmRecord = {
      id: kpmId,
      registerCode: isDetached ? '' : String(kpmRow.register_code || ''),
      tahun: isDetached ? '' : sanitizeYearValue(kpmRow.tahun ? String(kpmRow.tahun) : ''),
      proposalId: isDetached ? null : matchedProp?.id ?? rawPropId,
      proposal: isDetached ? '' : matchedProp?.namaProposal ?? rawPropName,
      kabKota: matchedProp?.kabKota || '',
      kecamatan: String(kpmRow.kecamatan || '') || matchedProp?.kecamatan || '',
      kelurahan: String(kpmRow.kelurahan || '') || matchedProp?.kelurahan || '',
      item: String(kpmRow.item || ''),
      nama: String(kpmRow.nama || ''),
      alamat: String(kpmRow.alamat || ''),
      rt: String(kpmRow.rt || ''),
      rw: String(kpmRow.rw || ''),
      nikKk: '',
      nikKtp: maskedNikKtp,
      dtsen: String(kpmRow.dtsen || ''),
      validasi: effectiveValidasi,
      kontak: '',
      pekerjaan: String(kpmRow.pekerjaan || ''),
      pengelola: String(kpmRow.pengelola || ''),
      catatan: '',
      payment: 0,
      documents,
      subItemDeliveries,
      berkasDikembalikan: Boolean(kpmRow.berkas_dikembalikan),
      berkasDikembalikanAt: kpmRow.berkas_dikembalikan_at
        ? String(kpmRow.berkas_dikembalikan_at)
        : undefined,
      berkasDikembalikanBy: kpmRow.berkas_dikembalikan_by
        ? String(kpmRow.berkas_dikembalikan_by)
        : undefined,
      createdAt: String(kpmRow.created_at || new Date().toISOString()),
      updatedAt: String(kpmRow.updated_at || new Date().toISOString()),
    };

    return { record, proposals, items, wilayahList };
  } catch {
    return null;
  }
}

// ============================================================================
// PROPOSAL RAB CONFIGS (public.proposal_rab_configs) &
// PROPOSAL STYLE HISTORY (public.proposal_style_history)
// ============================================================================
const PROPOSAL_RAB_FALLBACK_STATE_KEY = 'masdeta_proposal_rab_configs_v1';
const PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY = 'masdeta_proposal_style_history_v1';

function mapRowToSavedProposalRabConfig(row: Record<string, unknown>): SavedProposalRabConfig {
  const rawCounts = (row.item_counts_snapshot as Record<string, unknown> | null) || {};
  const itemCountsSnapshot: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawCounts)) {
    const cleanKey = String(k || '').trim().toUpperCase();
    const num = Number(v || 0);
    if (cleanKey && Number.isFinite(num) && num >= 0) {
      itemCountsSnapshot[cleanKey] = Math.floor(num);
    }
  }
  const rawPackagesSource = row.packages_json ?? row.packages;
  const rawPackages = Array.isArray(rawPackagesSource) ? (rawPackagesSource as SavedRabPackage[]) : [];
  return {
    proposalId: String(row.proposal_id || ''),
    proposalName: String(row.proposal_name || ''),
    tahun: String(row.tahun || ''),
    judulRab: String(row.judul_rab || ''),
    totalAnggaran: Number(row.total_anggaran || 0),
    totalTerhitung: Number(row.total_terhitung || 0),
    paguStandarPerKpm: Number(row.pagu_standar_per_kpm || 0),
    totalKpmSnapshot: Number(row.total_kpm_snapshot || 0),
    itemCountsSnapshot,
    packages: rawPackages,
    updatedAt: String(row.updated_at || new Date().toISOString()),
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
  };
}

function mapRowToStyleUsageRecord(row: Record<string, unknown>): ProposalStyleUsageRecord {
  const rawDest = String(row.jenis_tujuan || 'OPD');
  const jenisTujuan: ProposalDestinationType =
    rawDest === 'Kecamatan' || rawDest === 'Kelurahan' ? rawDest : 'OPD';
  return {
    id: String(row.id || ''),
    styleId: Math.min(15, Math.max(1, Number(row.style_id || 1))),
    proposalId: String(row.proposal_id || ''),
    namaProposal: String(row.nama_proposal || ''),
    tahun: String(row.tahun || ''),
    jenisTujuan,
    createdAt: String(row.created_at || new Date().toISOString()),
    createdBy: row.created_by ? String(row.created_by) : undefined,
  };
}

export async function fetchProposalRabConfigsFromSupabase(): Promise<{
  map: ProposalRabMap;
  schemaMissing: boolean;
}> {
  const localKey = `masdeta_slice_${PROPOSAL_RAB_FALLBACK_STATE_KEY}`;
  let localMap: ProposalRabMap = {};
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localMap = JSON.parse(raw) as ProposalRabMap;
  } catch {
    // ignore storage error
  }

  if (!isSupabaseConfigured) {
    return { map: localMap, schemaMissing: false };
  }

  try {
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from('proposal_rab_configs')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(from, to)
    );
    const map: ProposalRabMap = {};
    for (const row of rows) {
      const cfg = mapRowToSavedProposalRabConfig(row as Record<string, unknown>);
      if (cfg.proposalId) {
        map[cfg.proposalId] = cfg;
      }
    }
    try {
      localStorage.setItem(localKey, JSON.stringify(map));
    } catch {
      // ignore quota error
    }
    return { map, schemaMissing: false };
  } catch (error) {
    if (isSchemaMissingError(error)) {
      const fallbackMap = await fetchAppStateSlice<ProposalRabMap>(
        PROPOSAL_RAB_FALLBACK_STATE_KEY,
        localMap
      );
      return { map: fallbackMap, schemaMissing: true };
    }
    return { map: localMap, schemaMissing: false };
  }
}

export async function saveProposalRabConfigInSupabase(
  config: SavedProposalRabConfig,
  currentMap: ProposalRabMap
): Promise<{ schemaMissing: boolean }> {
  const nextMap: ProposalRabMap = {
    ...currentMap,
    [config.proposalId]: config,
  };
  const localKey = `masdeta_slice_${PROPOSAL_RAB_FALLBACK_STATE_KEY}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(nextMap));
  } catch {
    // ignore quota error
  }

  if (!isSupabaseConfigured) {
    return { schemaMissing: false };
  }

  const payload = {
    proposal_id: config.proposalId,
    proposal_name: config.proposalName,
    tahun: config.tahun,
    judul_rab: config.judulRab,
    total_anggaran: Math.round(config.totalAnggaran),
    total_terhitung: Math.round(config.totalTerhitung),
    pagu_standar_per_kpm: Math.round(config.paguStandarPerKpm),
    total_kpm_snapshot: Math.floor(config.totalKpmSnapshot),
    item_counts_snapshot: config.itemCountsSnapshot,
    packages_json: config.packages,
    updated_by: (config.updatedBy || 'Admin').trim() || 'Admin',
    updated_at: config.updatedAt || new Date().toISOString(),
  };

  const { error } = await supabase
    .from('proposal_rab_configs')
    .upsert(payload, { onConflict: 'proposal_id' });

  if (error) {
    if (isSchemaMissingError(error)) {
      await saveAppStateSlice(PROPOSAL_RAB_FALLBACK_STATE_KEY, nextMap);
      return { schemaMissing: true };
    }
    // Kembalikan cache lokal ke kondisi sebelumnya bila gagal simpan ke Supabase
    try {
      localStorage.setItem(localKey, JSON.stringify(currentMap));
    } catch {
      // ignore quota error
    }
    throw error;
  }

  return { schemaMissing: false };
}

export async function deleteProposalRabConfigFromSupabase(
  proposalId: string,
  currentMap: ProposalRabMap
): Promise<void> {
  const nextMap: ProposalRabMap = { ...currentMap };
  delete nextMap[proposalId];
  const localKey = `masdeta_slice_${PROPOSAL_RAB_FALLBACK_STATE_KEY}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(nextMap));
  } catch {
    // ignore quota error
  }
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('proposal_rab_configs')
    .delete()
    .eq('proposal_id', proposalId);
  if (error && isSchemaMissingError(error)) {
    await saveAppStateSlice(PROPOSAL_RAB_FALLBACK_STATE_KEY, nextMap);
  }
}

export async function fetchProposalStyleHistoryFromSupabase(): Promise<{
  items: ProposalStyleUsageRecord[];
  schemaMissing: boolean;
}> {
  const localKey = `masdeta_slice_${PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY}`;
  let localItems: ProposalStyleUsageRecord[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localItems = JSON.parse(raw) as ProposalStyleUsageRecord[];
  } catch {
    // ignore storage error
  }

  if (!isSupabaseConfigured) {
    return { items: localItems, schemaMissing: false };
  }

  try {
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from('proposal_style_history')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to)
    );
    const items = rows
      .map((row) => mapRowToStyleUsageRecord(row as Record<string, unknown>))
      .filter((item) => Boolean(item.id));
    try {
      localStorage.setItem(localKey, JSON.stringify(items));
    } catch {
      // ignore quota error
    }
    return { items, schemaMissing: false };
  } catch (error) {
    if (isSchemaMissingError(error)) {
      const fallbackItems = await fetchAppStateSlice<ProposalStyleUsageRecord[]>(
        PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY,
        localItems
      );
      return { items: Array.isArray(fallbackItems) ? fallbackItems : [], schemaMissing: true };
    }
    return { items: localItems, schemaMissing: false };
  }
}

export async function recordProposalStyleUsageInSupabase(
  entry: ProposalStyleUsageRecord,
  currentList: ProposalStyleUsageRecord[]
): Promise<{ schemaMissing: boolean }> {
  const deduped = currentList.filter(
    (item) =>
      !(
        item.styleId === entry.styleId &&
        item.proposalId === entry.proposalId &&
        item.jenisTujuan === entry.jenisTujuan
      )
  );
  const nextList = [entry, ...deduped];
  const localKey = `masdeta_slice_${PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(nextList));
  } catch {
    // ignore quota error
  }

  if (!isSupabaseConfigured) {
    return { schemaMissing: false };
  }

  // Hapus entri duplikat sebelumnya untuk kombinasi style + proposal + jenis_tujuan yang sama agar riwayat rapi
  const { error: delDupErr } = await supabase
    .from('proposal_style_history')
    .delete()
    .eq('style_id', entry.styleId)
    .eq('proposal_id', entry.proposalId)
    .eq('jenis_tujuan', entry.jenisTujuan);

  if (delDupErr && isSchemaMissingError(delDupErr)) {
    await saveAppStateSlice(PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY, nextList);
    return { schemaMissing: true };
  }

  const { error } = await supabase.from('proposal_style_history').upsert(
    {
      id: entry.id,
      style_id: entry.styleId,
      proposal_id: entry.proposalId,
      nama_proposal: entry.namaProposal,
      tahun: entry.tahun,
      jenis_tujuan: entry.jenisTujuan,
      created_by: (entry.createdBy || 'Admin').trim() || 'Admin',
      created_at: entry.createdAt || new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    if (isSchemaMissingError(error)) {
      await saveAppStateSlice(PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY, nextList);
      return { schemaMissing: true };
    }
    throw error;
  }

  return { schemaMissing: false };
}

export async function deleteProposalStyleUsageInSupabase(
  id: string,
  currentList: ProposalStyleUsageRecord[]
): Promise<{ schemaMissing: boolean }> {
  const nextList = currentList.filter((item) => item.id !== id);
  const localKey = `masdeta_slice_${PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(nextList));
  } catch {
    // ignore quota error
  }

  if (!isSupabaseConfigured) {
    return { schemaMissing: false };
  }

  const { error } = await supabase.from('proposal_style_history').delete().eq('id', id);
  if (error) {
    if (isSchemaMissingError(error)) {
      await saveAppStateSlice(PROPOSAL_STYLE_HISTORY_FALLBACK_STATE_KEY, nextList);
      return { schemaMissing: true };
    }
    throw error;
  }

  return { schemaMissing: false };
}



