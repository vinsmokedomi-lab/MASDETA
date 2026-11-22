import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

type InternalUserRole = 'SuperAdmin' | 'Admin' | 'Viewer';
type InternalUserStatus = 'pending' | 'active' | 'rejected';
type UserPresenceStatus = 'online' | 'idle' | 'offline';
type PermissionAction = 'add' | 'update' | 'delete';

interface UserPermissions {
  add: boolean;
  update: boolean;
  delete: boolean;
}

interface StoredUser {
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
  passwordHash: string;
  passwordPlain?: string;
}

type PublicUser = Omit<StoredUser, 'passwordHash' | 'passwordPlain'>;

interface SharedKpmCard {
  kpmId: string;
  registerCode: string;
  nama: string;
  tahun: string;
  item: string;
  itemName?: string;
  proposal: string;
  kontak?: string;
  validasi: 'pending' | 'accepted' | 'rejected';
  fotoDataUrl?: string;
  fotoThumbnailUrl?: string;
}

interface DirectChatMessage {
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

interface SessionEntry {
  userId: string;
  createdAt: string;
}

interface CollabStore {
  users: StoredUser[];
  messages: DirectChatMessage[];
  sessions: Record<string, SessionEntry>;
}

interface OperationalDataStore {
  initialized: boolean;
  updatedAt: string;
  records: unknown[];
  proposals: unknown[];
  items: unknown[];
  pengelolaList: unknown[];
  pekerjaanList: string[];
  wilayahList: unknown[];
  proposalHistory: unknown[];
  kpmAuditLogs: unknown[];
}

function resolvePort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsed = Number(process.argv[portArgIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 3000;
}

const PORT = resolvePort();
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'masdeta-collab.json');
const OPERATIONAL_DATA_FILE = path.join(DATA_DIR, 'masdeta-data.json');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = (storedHash || '').split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function makeConversationKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

const PRESENCE_STALE_MS = 90_000;

function sanitizeUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, passwordPlain: _passwordPlain, ...rest } = user;
  if (!rest.presenceManual && rest.presenceStatus !== 'offline') {
    const tsIso = rest.lastActiveAt || rest.updatedAt;
    if (tsIso) {
      const ts = new Date(tsIso).getTime();
      if (Number.isFinite(ts) && Date.now() - ts > PRESENCE_STALE_MS) {
        rest.presenceStatus = 'offline';
      }
    }
  }
  return rest;
}

function normalizeUsernameInput(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(username);
}

function sanitizeMediaUrlOrDataImage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return undefined;
}

function sanitizeSharedKpm(raw: unknown): SharedKpmCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const kpmId = String(obj.kpmId || '').trim();
  const nama = String(obj.nama || '').trim();
  if (!kpmId || !nama) return undefined;
  const val = obj.validasi;
  const validasi: 'pending' | 'accepted' | 'rejected' =
    val === 'accepted' || val === 'rejected' || val === 'pending' ? val : 'pending';
  const fotoRaw = sanitizeMediaUrlOrDataImage(obj.fotoDataUrl);
  const fotoThumbRaw = sanitizeMediaUrlOrDataImage(obj.fotoThumbnailUrl);
  return {
    kpmId,
    registerCode: String(obj.registerCode || '').trim(),
    nama,
    tahun: String(obj.tahun || '').trim(),
    item: String(obj.item || '').trim(),
    itemName: obj.itemName ? String(obj.itemName).trim() : undefined,
    proposal: String(obj.proposal || '').trim(),
    kontak: obj.kontak ? String(obj.kontak).trim() : undefined,
    validasi,
    fotoDataUrl: fotoRaw,
    fotoThumbnailUrl: fotoThumbRaw,
  };
}

function createSeedUsers(): StoredUser[] {
  const defaultHash = hashPassword('masdeta123');
  const vinsmokeHash = hashPassword('germa666');
  const seed: Omit<StoredUser, 'passwordHash'>[] = [
    {
      id: 'usr-superadmin-domi',
      nama: 'Domi',
      email: 'la.qsas@gmail.com',
      jabatan: 'SuperAdmin',
      kontak: '',
      role: 'SuperAdmin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'usr-admin-domi2',
      nama: 'Domi',
      email: 'vinsmoke.domi@gmail.com',
      jabatan: 'SuperAdmin',
      kontak: '',
      role: 'SuperAdmin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'usr-admin-dea',
      nama: 'Dea',
      email: 'deacantik089689@gmail.com',
      jabatan: 'Admin',
      kontak: '',
      role: 'Admin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'usr-admin-dina',
      nama: 'Dina',
      email: 'dinalestaryw123@gmail.com',
      jabatan: 'Admin',
      kontak: '',
      role: 'Admin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'usr-admin-edo',
      nama: 'Bg Edo',
      email: 'rumahmakangratis55@gmail.com',
      jabatan: 'Admin',
      kontak: '',
      role: 'Admin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'usr-admin-zahra',
      nama: 'Zahra',
      email: 'zahrapariska646@gmail.com',
      jabatan: 'Admin',
      kontak: '',
      role: 'Admin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'usr-admin-iwan',
      nama: 'Bg Iwan',
      email: 'ridwanridwan8765@gmail.com',
      jabatan: 'Admin',
      kontak: '',
      role: 'Admin',
      status: 'active',
      permissions: { add: true, update: true, delete: true },
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ];
  return seed.map((u) => {
    const isVinsmoke = u.email.toLowerCase() === 'vinsmoke.domi@gmail.com';
    return {
      ...u,
      passwordHash: isVinsmoke ? vinsmokeHash : defaultHash,
    };
  });
}

function loadStore(): CollabStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CollabStore>;
      const users =
        Array.isArray(parsed.users) && parsed.users.length > 0
          ? parsed.users
          : createSeedUsers();
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const sessions =
        parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
      return { users, messages, sessions };
    }
  } catch (err) {
    console.error('Failed to load collab store:', err);
  }
  const initial: CollabStore = {
    users: createSeedUsers(),
    messages: [],
    sessions: {},
  };
  saveStore(initial);
  return initial;
}

function saveStore(store: CollabStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist collab store:', err);
  }
}

function createEmptyDataStore(): OperationalDataStore {
  return {
    initialized: false,
    updatedAt: new Date().toISOString(),
    records: [],
    proposals: [],
    items: [],
    pengelolaList: [],
    pekerjaanList: [],
    wilayahList: [],
    proposalHistory: [],
    kpmAuditLogs: [],
  };
}

function loadDataStore(): OperationalDataStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(OPERATIONAL_DATA_FILE)) {
      const raw = fs.readFileSync(OPERATIONAL_DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<OperationalDataStore>;
      return {
        initialized: Boolean(parsed.initialized),
        updatedAt:
          typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        records: Array.isArray(parsed.records) ? parsed.records : [],
        proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
        items: Array.isArray(parsed.items) ? parsed.items : [],
        pengelolaList: Array.isArray(parsed.pengelolaList) ? parsed.pengelolaList : [],
        pekerjaanList: Array.isArray(parsed.pekerjaanList)
          ? parsed.pekerjaanList.map((s) => String(s))
          : [],
        wilayahList: Array.isArray(parsed.wilayahList) ? parsed.wilayahList : [],
        proposalHistory: Array.isArray(parsed.proposalHistory) ? parsed.proposalHistory : [],
        kpmAuditLogs: Array.isArray(parsed.kpmAuditLogs) ? parsed.kpmAuditLogs : [],
      };
    }
  } catch (err) {
    console.error('Failed to load operational data store:', err);
  }
  const initial = createEmptyDataStore();
  saveDataStore(initial);
  return initial;
}

function saveDataStore(dataStore: OperationalDataStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(OPERATIONAL_DATA_FILE, JSON.stringify(dataStore), 'utf8');
  } catch (err) {
    console.error('Failed to persist operational data store:', err);
  }
}

async function startServer() {
  const store = loadStore();
  const dataStore = loadDataStore();

  const seedUsers = createSeedUsers();
  if (store.users.length === 0) {
    store.users.push(...seedUsers);
  } else {
    const hasSuperAdmin = store.users.some(
      (u) => u.role === 'SuperAdmin' && u.status === 'active'
    );
    if (!hasSuperAdmin) {
      for (const seed of seedUsers) {
        if (!store.users.some((u) => u.email.toLowerCase() === seed.email.toLowerCase())) {
          store.users.push(seed);
        }
      }
    }
  }

  store.users = store.users.map((u) => {
    const emailLower = u.email.toLowerCase();
    const { passwordPlain: _removedPlain, ...cleanUser } = u;
    let next: StoredUser = cleanUser.presenceManual
      ? { ...cleanUser }
      : { ...cleanUser, presenceStatus: 'offline' as UserPresenceStatus };

    if (emailLower === 'vinsmoke.domi@gmail.com') {
      next = {
        ...next,
        role: 'SuperAdmin',
        jabatan: 'SuperAdmin',
        status: 'active',
        permissions: { add: true, update: true, delete: true },
        passwordHash:
          next.passwordHash && next.passwordHash.includes(':')
            ? next.passwordHash
            : hashPassword('germa666'),
      };
    } else if (emailLower === 'la.qsas@gmail.com') {
      next = {
        ...next,
        role: 'SuperAdmin',
        jabatan: 'SuperAdmin',
        status: 'active',
        permissions: { add: true, update: true, delete: true },
      };
    } else if ((next.role as string) === 'Verifikator' || (next.role as string) === 'Petugas') {
      next = { ...next, role: 'Admin' };
    }
    return next;
  });
  saveStore(store);

  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

  function isSessionExpired(session: { createdAt?: string } | undefined): boolean {
    if (!session?.createdAt) return true;
    const createdMs = Date.parse(session.createdAt);
    if (!Number.isFinite(createdMs)) return true;
    return Date.now() - createdMs > SESSION_TTL_MS;
  }

  function pruneExpiredSessions(): boolean {
    let removed = false;
    for (const [token, sess] of Object.entries(store.sessions)) {
      if (isSessionExpired(sess)) {
        delete store.sessions[token];
        removed = true;
      }
    }
    if (removed) {
      saveStore(store);
    }
    return removed;
  }

  pruneExpiredSessions();

  function getClientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) {
      return fwd.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
  }

  function createRateLimiter(maxRequests: number, windowMs: number, message: string) {
    const hits = new Map<string, number[]>();
    return (req: Request, res: Response, next: express.NextFunction) => {
      const now = Date.now();
      const ip = getClientIp(req);
      const timestamps = (hits.get(ip) || []).filter((ts) => now - ts < windowMs);
      if (timestamps.length >= maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - timestamps[0])) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({ error: message });
        return;
      }
      timestamps.push(now);
      hits.set(ip, timestamps);
      if (hits.size > 5000) {
        for (const [key, list] of hits.entries()) {
          const fresh = list.filter((ts) => now - ts < windowMs);
          if (fresh.length === 0) hits.delete(key);
          else hits.set(key, fresh);
        }
      }
      next();
    };
  }

  const authRateLimiter = createRateLimiter(
    25,
    15 * 60 * 1000,
    'Terlalu banyak percobaan autentikasi. Tunggu beberapa menit lalu coba kembali.'
  );
  const ocrRateLimiter = createRateLimiter(
    30,
    10 * 60 * 1000,
    'Terlalu banyak permintaan pemindaian dokumen. Tunggu beberapa saat lalu coba lagi.'
  );
  const publicLookupRateLimiter = createRateLimiter(
    60,
    5 * 60 * 1000,
    'Terlalu banyak permintaan verifikasi QR. Silakan tunggu sejenak.'
  );

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('error', (err) => {
    console.error('HTTP server error:', err);
  });

  wss.on('error', (err) => {
    console.error('WebSocket server error:', err);
  });

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Multi-tab WebSocket presence map: userId -> Map<WebSocket, UserPresenceStatus>
  const socketStatesByUser = new Map<string, Map<WebSocket, UserPresenceStatus>>();
  const userDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function broadcastAll(payload: unknown) {
    const json = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  function sendToUsers(userIds: string[], payload: unknown) {
    const json = JSON.stringify(payload);
    for (const uid of new Set(userIds)) {
      const socketMap = socketStatesByUser.get(uid);
      if (!socketMap) continue;
      for (const sock of socketMap.keys()) {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(json);
        }
      }
    }
  }

  function sendToRole(role: InternalUserRole, payload: unknown) {
    const recipientIds = store.users
      .filter((u) => u.role === role && u.status === 'active')
      .map((u) => u.id);
    if (recipientIds.length > 0) {
      sendToUsers(recipientIds, payload);
    }
  }

  function broadcastUsers() {
    broadcastAll({
      type: 'users:updated',
      users: store.users.map(sanitizeUser),
    });
  }

  function computeAutoPresence(userId: string): UserPresenceStatus {
    const socketMap = socketStatesByUser.get(userId);
    if (!socketMap || socketMap.size === 0) return 'offline';
    let hasIdle = false;
    for (const status of socketMap.values()) {
      if (status === 'online') return 'online';
      if (status === 'idle') hasIdle = true;
    }
    return hasIdle ? 'idle' : 'offline';
  }

  function syncUserPresence(userId: string) {
    const user = store.users.find((u) => u.id === userId);
    if (!user || user.presenceManual) return;
    const nextPresence = computeAutoPresence(userId);
    const nowMs = Date.now();
    const prevMs = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    const shouldBumpHeartbeat =
      nextPresence === 'online' && (!Number.isFinite(prevMs) || nowMs - prevMs >= 30_000);

    if (user.presenceStatus !== nextPresence || shouldBumpHeartbeat) {
      user.presenceStatus = nextPresence;
      user.lastActiveAt = new Date(nowMs).toISOString();
      saveStore(store);
      broadcastUsers();
    }
  }

  function getUserMessages(userId: string): DirectChatMessage[] {
    return store.messages.filter(
      (m) => m.senderId === userId || m.recipientId === userId
    );
  }

  function extractBearerToken(req: Request): string {
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return '';
  }

  function getAuthenticatedUser(req: Request): StoredUser | null {
    const token = extractBearerToken(req);
    if (!token) return null;
    const session = store.sessions[token];
    if (!session) return null;
    if (isSessionExpired(session)) {
      delete store.sessions[token];
      saveStore(store);
      return null;
    }
    const user = store.users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'active') return null;
    return user;
  }

  function requireAuth(req: Request, res: Response): StoredUser | null {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.' });
      return null;
    }
    return user;
  }

  function hasDataPermission(user: StoredUser, action?: PermissionAction): boolean {
    if (user.role === 'SuperAdmin') return true;
    if (user.role === 'Viewer') return false;
    if (!action) {
      return Boolean(user.permissions?.add || user.permissions?.update || user.permissions?.delete);
    }
    return Boolean(user.permissions?.[action]);
  }

  // REST: Login (username atau email)
  app.post('/api/auth/login', authRateLimiter, (req: Request, res: Response) => {
    const identifier = String(req.body?.email || req.body?.identifier || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username atau email dan kata sandi wajib diisi.' });
      return;
    }

    const user = store.users.find(
      (u) =>
        u.email.toLowerCase() === identifier ||
        (u.username && u.username.toLowerCase() === identifier)
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Username/email atau kata sandi tidak sesuai.' });
      return;
    }

    if (user.status === 'pending') {
      res.status(403).json({
        error: 'Akun Anda masih menunggu persetujuan SuperAdmin.',
      });
      return;
    }

    if (user.status === 'rejected') {
      res.status(403).json({
        error: 'Akun Anda dinonaktifkan oleh SuperAdmin.',
      });
      return;
    }

    pruneExpiredSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    store.sessions[token] = { userId: user.id, createdAt: now };

    if (!user.presenceManual) {
      user.presenceStatus = 'online';
    }
    user.lastActiveAt = now;
    saveStore(store);
    broadcastUsers();

    res.json({
      token,
      user: sanitizeUser(user),
      users: store.users.map(sanitizeUser),
      messages: getUserMessages(user.id),
    });
  });

  // REST: Logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token && store.sessions[token]) {
      const uid = store.sessions[token].userId;
      delete store.sessions[token];
      saveStore(store);
      const sockMap = socketStatesByUser.get(uid);
      if (!sockMap || sockMap.size === 0) {
        const user = store.users.find((u) => u.id === uid);
        if (user && !user.presenceManual) {
          user.presenceStatus = 'offline';
          user.lastActiveAt = new Date().toISOString();
          saveStore(store);
          broadcastUsers();
        }
      }
    }
    res.json({ ok: true });
  });

  // REST: Beacon offline saat browser/WebView ditutup tanpa logout eksplisit
  app.post('/api/presence/offline', (req: Request, res: Response) => {
    const bodyToken =
      req.body && typeof req.body === 'object' && 'token' in req.body
        ? String((req.body as { token?: unknown }).token || '').trim()
        : '';
    const token = extractBearerToken(req) || bodyToken;
    const session = token ? store.sessions[token] : undefined;
    if (session) {
      const user = store.users.find((u) => u.id === session.userId);
      if (user && !user.presenceManual) {
        user.presenceStatus = 'offline';
        user.lastActiveAt = new Date().toISOString();
        saveStore(store);
        broadcastUsers();
      }
    }
    res.json({ ok: true });
  });

  // REST: Verify current user's login password (used to unlock Kontrol Super Admin)
  app.post('/api/auth/verify-password', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const password = String(req.body?.password || '');
    if (!password || !verifyPassword(password, authUser.passwordHash)) {
      res.status(401).json({ error: 'Kata sandi salah. Gunakan password login Anda.' });
      return;
    }

    res.json({ ok: true });
  });

  // REST: Register new account (pending SuperAdmin approval)
  app.post('/api/auth/register', authRateLimiter, (req: Request, res: Response) => {
    const nama = String(req.body?.nama || '').trim();
    const username = normalizeUsernameInput(req.body?.username);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const kontak = String(req.body?.kontak || '').trim();
    const password = String(req.body?.password || '');
    const fotoDataUrl = sanitizeMediaUrlOrDataImage(req.body?.fotoDataUrl);
    const fotoThumbnailUrl = sanitizeMediaUrlOrDataImage(req.body?.fotoThumbnailUrl);
    const fotoFileId =
      typeof req.body?.fotoFileId === 'string' && req.body.fotoFileId.trim()
        ? req.body.fotoFileId.trim()
        : undefined;

    if (!nama || !username || !email || password.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, username, email, dan kata sandi (minimal 6 karakter) wajib diisi.',
      });
      return;
    }

    if (!isValidUsernameFormat(username)) {
      res.status(400).json({
        error:
          'Username harus 3–30 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).',
      });
      return;
    }

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email sudah terdaftar di sistem.' });
      return;
    }

    if (
      store.users.some(
        (u) =>
          (u.username && u.username.toLowerCase() === username) ||
          u.email.toLowerCase() === username
      )
    ) {
      res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
      return;
    }

    const now = new Date().toISOString();
    const created: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nama,
      username,
      email,
      jabatan: 'Menunggu Penetapan SuperAdmin',
      kontak,
      role: 'Viewer',
      status: 'pending',
      permissions: { add: false, update: false, delete: false },
      presenceStatus: 'offline',
      presenceManual: false,
      fotoDataUrl,
      fotoThumbnailUrl,
      fotoFileId,
      registeredAt: now,
      updatedAt: now,
      passwordHash: hashPassword(password),
    };

    store.users.unshift(created);
    saveStore(store);
    broadcastUsers();
    sendToRole('SuperAdmin', {
      type: 'user:registered',
      user: sanitizeUser(created),
    });

    res.status(201).json({
      user: sanitizeUser(created),
      message: 'Pendaftaran berhasil dikirim. Menunggu persetujuan & penetapan jabatan oleh SuperAdmin.',
    });
  });

  // REST: Safe forgot-password guidance (never leaks account existence or passwords)
  app.post('/api/auth/forgot-password', authRateLimiter, (req: Request, res: Response) => {
    const identifier = String(req.body?.email || req.body?.identifier || '')
      .trim()
      .toLowerCase();
    if (!identifier) {
      res.status(400).json({ error: 'Username atau email wajib diisi.' });
      return;
    }

    res.json({
      ok: true,
      message:
        'Demi keamanan akun, reset kata sandi hanya dapat dilakukan oleh SuperAdmin melalui menu Manajemen User & Akses.',
    });
  });

  // REST: Unauthenticated reset disabled
  app.post('/api/auth/reset-password', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Reset kata sandi mandiri dinonaktifkan. Hubungi SuperAdmin untuk mengatur ulang kata sandi.',
    });
  });

  // REST: Full collaboration state sync (requires Bearer token)
  app.get('/api/collab/state', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const now = new Date().toISOString();
    const deliveredIds: string[] = [];
    const senderIdsToNotify = new Set<string>();
    for (const msg of store.messages) {
      if (msg.recipientId === authUser.id && !msg.deliveredAt) {
        msg.deliveredAt = now;
        deliveredIds.push(msg.id);
        senderIdsToNotify.add(msg.senderId);
      }
    }
    if (deliveredIds.length > 0) {
      saveStore(store);
      sendToUsers([authUser.id, ...Array.from(senderIdsToNotify)], {
        type: 'chat:delivered',
        recipientId: authUser.id,
        deliveredAt: now,
        messageIds: deliveredIds,
      });
    }

    res.json({
      user: sanitizeUser(authUser),
      users: store.users.map(sanitizeUser),
      messages: getUserMessages(authUser.id),
    });
  });

  // REST: SuperAdmin directly adds an active internal user with initial password
  app.post('/api/admin/users', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Hanya SuperAdmin yang berhak menambah akun internal.' });
      return;
    }

    const nama = String(req.body?.nama || '').trim();
    const usernameRaw = normalizeUsernameInput(req.body?.username);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const kontak = String(req.body?.kontak || '').trim();
    const passwordRaw = String(req.body?.password || '').trim();
    const password = passwordRaw || 'masdeta123';
    const roleInput = req.body?.role;
    const role: InternalUserRole =
      roleInput === 'SuperAdmin' || roleInput === 'Admin' || roleInput === 'Viewer'
        ? roleInput
        : 'Admin';
    const jabatan = String(req.body?.jabatan || '').trim() || role;

    if (!nama || !email) {
      res.status(400).json({ error: 'Nama lengkap dan email wajib diisi.' });
      return;
    }
    if (usernameRaw && !isValidUsernameFormat(usernameRaw)) {
      res.status(400).json({
        error:
          'Username harus 3–30 karakter dan hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).',
      });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email sudah terdaftar di sistem.' });
      return;
    }
    if (
      usernameRaw &&
      store.users.some(
        (u) =>
          (u.username && u.username.toLowerCase() === usernameRaw) ||
          u.email.toLowerCase() === usernameRaw
      )
    ) {
      res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
      return;
    }

    const reqPerms = req.body?.permissions;
    const permissions: UserPermissions =
      role === 'SuperAdmin'
        ? { add: true, update: true, delete: true }
        : role === 'Viewer'
          ? { add: false, update: false, delete: false }
          : {
              add: Boolean(reqPerms?.add ?? true),
              update: Boolean(reqPerms?.update ?? true),
              delete: Boolean(reqPerms?.delete ?? false),
            };

    const now = new Date().toISOString();
    const created: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nama,
      ...(usernameRaw ? { username: usernameRaw } : {}),
      email,
      jabatan,
      kontak,
      role,
      status: 'active',
      permissions,
      presenceStatus: 'offline',
      presenceManual: false,
      registeredAt: now,
      updatedAt: now,
      passwordHash: hashPassword(password),
    };

    store.users.unshift(created);
    saveStore(store);
    broadcastUsers();

    res.status(201).json({
      user: sanitizeUser(created),
      users: store.users.map(sanitizeUser),
    });
  });

  // REST: Update own profile & presence setting
  app.patch('/api/users/:id/profile', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const { id } = req.params;
    if (authUser.id !== id) {
      res.status(403).json({ error: 'Anda hanya dapat mengubah profil akun Anda sendiri.' });
      return;
    }

    const user = store.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    if (typeof req.body?.nama === 'string' && req.body.nama.trim()) {
      user.nama = req.body.nama.trim();
    }
    if (typeof req.body?.jabatan === 'string') {
      user.jabatan = req.body.jabatan.trim();
    }
    if (typeof req.body?.kontak === 'string') {
      user.kontak = req.body.kontak.trim();
    }
    if (typeof req.body?.fotoDataUrl === 'string' || req.body?.fotoDataUrl === null) {
      user.fotoDataUrl = sanitizeMediaUrlOrDataImage(req.body.fotoDataUrl);
      if (!user.fotoDataUrl) {
        user.fotoThumbnailUrl = undefined;
        user.fotoFileId = undefined;
      }
    }
    if (typeof req.body?.fotoThumbnailUrl === 'string' || req.body?.fotoThumbnailUrl === null) {
      user.fotoThumbnailUrl = sanitizeMediaUrlOrDataImage(req.body.fotoThumbnailUrl);
    }
    if (typeof req.body?.fotoFileId === 'string' || req.body?.fotoFileId === null) {
      user.fotoFileId = req.body.fotoFileId ? String(req.body.fotoFileId).trim() : undefined;
    }
    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.trim()) {
      if (req.body.newPassword.trim().length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      user.passwordHash = hashPassword(req.body.newPassword.trim());
    }
    if (typeof req.body?.presenceManual === 'boolean') {
      user.presenceManual = req.body.presenceManual;
    }
    if (
      req.body?.presenceStatus === 'online' ||
      req.body?.presenceStatus === 'idle' ||
      req.body?.presenceStatus === 'offline'
    ) {
      user.presenceStatus = req.body.presenceStatus;
    }
    user.lastActiveAt = now;
    user.updatedAt = now;

    saveStore(store);
    broadcastUsers();

    res.json({ user: sanitizeUser(user) });
  });

  // REST: SuperAdmin controls an Admin (status, role, permissions, optional password reset)
  app.patch('/api/users/:id/admin-control', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;

    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({
        error: 'Hanya SuperAdmin yang berhak mengontrol akses dan izin Admin.',
      });
      return;
    }

    const { id } = req.params;
    const target = store.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    if (target.role === 'SuperAdmin' && target.id === actor.id) {
      res.status(400).json({ error: 'Akun SuperAdmin utama selalu memiliki akses penuh.' });
      return;
    }

    const now = new Date().toISOString();
    if (
      req.body?.status === 'active' ||
      req.body?.status === 'pending' ||
      req.body?.status === 'rejected'
    ) {
      target.status = req.body.status;
      if (req.body.status !== 'active') {
        for (const [tok, sess] of Object.entries(store.sessions)) {
          if (sess.userId === target.id) {
            delete store.sessions[tok];
          }
        }
      }
    }
    if (typeof req.body?.nama === 'string' && req.body.nama.trim()) {
      target.nama = req.body.nama.trim();
    }
    if (typeof req.body?.jabatan === 'string' && req.body.jabatan.trim()) {
      target.jabatan = req.body.jabatan.trim();
    }
    if (typeof req.body?.kontak === 'string') {
      target.kontak = req.body.kontak.trim();
    }
    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.trim()) {
      const nextPwd = req.body.newPassword.trim();
      if (nextPwd.length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      target.passwordHash = hashPassword(nextPwd);
    }
    if (
      req.body?.role === 'SuperAdmin' ||
      req.body?.role === 'Admin' ||
      req.body?.role === 'Viewer'
    ) {
      const nextRole = req.body.role as InternalUserRole;
      target.role = nextRole;
      if (typeof req.body?.jabatan !== 'string' || !req.body.jabatan.trim()) {
        target.jabatan = nextRole === 'SuperAdmin' ? 'SuperAdmin' : nextRole;
      }
      if (nextRole === 'SuperAdmin') {
        target.permissions = { add: true, update: true, delete: true };
      } else if (nextRole === 'Viewer') {
        target.permissions = { add: false, update: false, delete: false };
      } else if (
        !target.permissions.add &&
        !target.permissions.update &&
        !target.permissions.delete
      ) {
        target.permissions = { add: true, update: true, delete: false };
      }
    }
    if (req.body?.permissions && typeof req.body.permissions === 'object') {
      if (target.role === 'SuperAdmin') {
        target.permissions = { add: true, update: true, delete: true };
      } else if (target.role === 'Viewer') {
        target.permissions = { add: false, update: false, delete: false };
      } else {
        target.permissions = {
          add: Boolean(req.body.permissions.add),
          update: Boolean(req.body.permissions.update),
          delete: Boolean(req.body.permissions.delete),
        };
      }
    }
    target.updatedAt = now;

    saveStore(store);
    broadcastUsers();

    res.json({ user: sanitizeUser(target), users: store.users.map(sanitizeUser) });
  });

  // REST: SuperAdmin deletes a user account
  app.delete('/api/users/:id', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;

    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({
        error: 'Hanya SuperAdmin yang berhak menghapus akun pengguna.',
      });
      return;
    }

    const { id } = req.params;
    if (id === actor.id) {
      res.status(400).json({ error: 'Tidak dapat menghapus akun yang sedang aktif digunakan.' });
      return;
    }

    const idx = store.users.findIndex((u) => u.id === id);
    if (idx < 0) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    const target = store.users[idx];
    if (
      target.role === 'SuperAdmin' &&
      store.users.filter((u) => u.role === 'SuperAdmin' && u.status === 'active').length <= 1
    ) {
      res.status(400).json({ error: 'Minimal harus tersisa satu SuperAdmin aktif.' });
      return;
    }

    store.users.splice(idx, 1);
    for (const [tok, sess] of Object.entries(store.sessions)) {
      if (sess.userId === id) {
        delete store.sessions[tok];
      }
    }
    const activeSockets = socketStatesByUser.get(id);
    if (activeSockets) {
      for (const sock of activeSockets.keys()) {
        try {
          sock.close();
        } catch {
          // Ignore socket close error
        }
      }
      socketStatesByUser.delete(id);
    }

    saveStore(store);
    broadcastUsers();

    res.json({ ok: true, users: store.users.map(sanitizeUser) });
  });

  // REST: SuperAdmin resets all chat history
  app.post('/api/admin/reset-chat', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;

    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Hanya SuperAdmin yang berhak mereset riwayat chat.' });
      return;
    }

    store.messages = [];
    saveStore(store);
    broadcastAll({ type: 'chat:reset' });

    res.json({ ok: true });
  });

  // REST: Send 1-on-1 direct message
  app.post('/api/chat/send', (req: Request, res: Response) => {
    const sender = requireAuth(req, res);
    if (!sender) return;

    const senderId = sender.id;
    const recipientId = String(req.body?.recipientId || '').trim();
    const text = String(req.body?.text || '').trim();
    const sharedKpm = sanitizeSharedKpm(req.body?.sharedKpm);
    const clientMsgId = String(req.body?.id || '').trim();

    if (!recipientId || senderId === recipientId || (!text && !sharedKpm)) {
      res.status(400).json({ error: 'Penerima dan isi pesan wajib valid.' });
      return;
    }

    const recipient = store.users.find((u) => u.id === recipientId && u.status === 'active');
    if (!recipient) {
      res.status(404).json({ error: 'Penerima aktif tidak ditemukan.' });
      return;
    }

    if (clientMsgId) {
      const existing = store.messages.find((m) => m.id === clientMsgId);
      if (existing) {
        res.json({ message: existing });
        return;
      }
    }

    const now = new Date().toISOString();
    const recipientSockets = socketStatesByUser.get(recipientId);
    const hasActiveRecipientSocket = Boolean(recipientSockets && recipientSockets.size > 0);
    const msg: DirectChatMessage = {
      id: clientMsgId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationKey: makeConversationKey(senderId, recipientId),
      senderId,
      recipientId,
      text,
      ...(sharedKpm ? { sharedKpm } : {}),
      createdAt: now,
      ...(hasActiveRecipientSocket ? { deliveredAt: now } : {}),
    };

    store.messages.push(msg);
    saveStore(store);

    sendToUsers([senderId, recipientId], {
      type: 'chat:message',
      message: msg,
      senderName: sender.nama,
      senderRole: sender.role,
    });

    res.status(201).json({ message: msg });
  });

  // REST: Acknowledge 1-on-1 direct message delivery on recipient device
  app.post('/api/chat/delivered', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const userId = authUser.id;
    const requestedIds = Array.isArray(req.body?.messageIds)
      ? new Set((req.body.messageIds as unknown[]).map((id) => String(id)))
      : null;

    const now = new Date().toISOString();
    const updatedIds: string[] = [];
    const senderIdsToNotify = new Set<string>();

    for (const msg of store.messages) {
      if (msg.recipientId !== userId || msg.deliveredAt) continue;
      if (requestedIds && !requestedIds.has(msg.id)) continue;
      msg.deliveredAt = now;
      updatedIds.push(msg.id);
      senderIdsToNotify.add(msg.senderId);
    }

    if (updatedIds.length > 0) {
      saveStore(store);
      sendToUsers([userId, ...Array.from(senderIdsToNotify)], {
        type: 'chat:delivered',
        recipientId: userId,
        deliveredAt: now,
        messageIds: updatedIds,
      });
    }

    res.json({ updatedCount: updatedIds.length, deliveredAt: now });
  });

  // REST: Mark 1-on-1 conversation messages as read
  app.post('/api/chat/read', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const userId = authUser.id;
    const peerId = String(req.body?.peerId || '').trim();
    if (!peerId) {
      res.status(400).json({ error: 'peerId wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    let changed = false;
    const updatedIds: string[] = [];

    for (const msg of store.messages) {
      if (msg.senderId === peerId && msg.recipientId === userId && !msg.readAt) {
        msg.deliveredAt = msg.deliveredAt || now;
        msg.readAt = now;
        changed = true;
        updatedIds.push(msg.id);
      }
    }

    if (changed) {
      saveStore(store);
      sendToUsers([userId, peerId], {
        type: 'chat:read',
        userId,
        peerId,
        readAt: now,
        messageIds: updatedIds,
      });
    }

    res.json({ updatedCount: updatedIds.length, readAt: now });
  });

  function normalizeOperationalStateOnServer() {
    const removedIds = new Set<string>();
    const removedNames = new Set<string>();
    const rawProps = Array.isArray(dataStore.proposals)
      ? (dataStore.proposals as Array<Record<string, unknown>>)
      : [];
    dataStore.proposals = rawProps.filter((p) => {
      const tipe = String(p?.tipe || '').trim();
      if (tipe !== 'Murni' && tipe !== 'Perubahan') {
        if (p?.id) removedIds.add(String(p.id));
        if (p?.namaProposal) removedNames.add(String(p.namaProposal).trim().toLowerCase());
        return false;
      }
      return true;
    });
    const rawRecs = Array.isArray(dataStore.records)
      ? (dataStore.records as Array<Record<string, unknown>>)
      : [];
    dataStore.records = rawRecs.map((r) => {
      const validasi = String(r?.validasi || 'pending');
      const propId = r?.proposalId ? String(r.proposalId) : null;
      const propName = r?.proposal ? String(r.proposal).trim() : '';
      const detached =
        validasi !== 'accepted' ||
        (propId && removedIds.has(propId)) ||
        (propName && removedNames.has(propName.toLowerCase()));
      if (detached) {
        return { ...r, proposalId: null, proposal: '' };
      }
      return r;
    });
  }

  // REST: Public read-only KPM profile lookup for QR code scans (PII-masked)
  app.get('/api/public/kpm/:id', publicLookupRateLimiter, (req: Request, res: Response) => {
    const token = String(req.params.id || '').trim().toLowerCase();
    if (!token) {
      res.status(400).json({ error: 'Parameter KPM tidak valid.' });
      return;
    }
    normalizeOperationalStateOnServer();
    const rawRecs = Array.isArray(dataStore.records)
      ? (dataStore.records as Array<Record<string, unknown>>)
      : [];
    const found = rawRecs.find((r) => {
      const id = String(r?.id || '').trim().toLowerCase();
      const reg = String(r?.registerCode || '').trim().toLowerCase();
      return id === token || reg === token;
    });
    if (!found) {
      res.status(404).json({ error: 'Data KPM tidak ditemukan.' });
      return;
    }

    const rawNik = String(found.nikKtp || '').replace(/\D+/g, '');
    const maskedNik =
      rawNik.length >= 10
        ? `${rawNik.slice(0, 6)}${'*'.repeat(Math.max(4, rawNik.length - 10))}${rawNik.slice(-4)}`
        : rawNik;
    const rawDocs =
      found.documents && typeof found.documents === 'object'
        ? (found.documents as Record<string, unknown>)
        : {};
    const safeRecord: Record<string, unknown> = {
      ...found,
      nikKtp: maskedNik,
      nikKk: '',
      kontak: '',
      payment: 0,
      catatan: '',
      documents: {
        ...rawDocs,
        ktp: null,
        kk: null,
      },
    };

    const allProps = Array.isArray(dataStore.proposals)
      ? (dataStore.proposals as Array<Record<string, unknown>>)
      : [];
    const matchedProp = allProps.find(
      (p) =>
        (found.proposalId && String(p?.id || '') === String(found.proposalId)) ||
        (found.proposal &&
          String(p?.namaProposal || '').trim().toLowerCase() ===
            String(found.proposal || '').trim().toLowerCase() &&
          String(p?.tahun || '').trim() === String(found.tahun || '').trim())
    );

    res.json({
      record: safeRecord,
      proposals: matchedProp ? [matchedProp] : [],
      items: Array.isArray(dataStore.items) ? dataStore.items : [],
      wilayahList: Array.isArray(dataStore.wilayahList) ? dataStore.wilayahList : [],
    });
  });

  // REST: Get full operational KPM/Proposal/Master data state
  app.get('/api/data/state', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;
    normalizeOperationalStateOnServer();
    res.json(dataStore);
  });

  // REST: Bootstrap operational data once when server store is not yet initialized
  app.post('/api/data/bootstrap', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    if (dataStore.initialized) {
      res.json({ bootstrapped: false, state: dataStore });
      return;
    }

    const body = req.body || {};
    if (Array.isArray(body.records)) dataStore.records = body.records;
    if (Array.isArray(body.proposals)) dataStore.proposals = body.proposals;
    if (Array.isArray(body.items)) dataStore.items = body.items;
    if (Array.isArray(body.pengelolaList)) dataStore.pengelolaList = body.pengelolaList;
    if (Array.isArray(body.pekerjaanList)) {
      dataStore.pekerjaanList = body.pekerjaanList.map((s: unknown) => String(s));
    }
    if (Array.isArray(body.wilayahList)) dataStore.wilayahList = body.wilayahList;
    if (Array.isArray(body.proposalHistory)) dataStore.proposalHistory = body.proposalHistory;
    if (Array.isArray(body.kpmAuditLogs)) dataStore.kpmAuditLogs = body.kpmAuditLogs;

    normalizeOperationalStateOnServer();
    dataStore.initialized = true;
    dataStore.updatedAt = new Date().toISOString();
    saveDataStore(dataStore);

    broadcastAll({
      type: 'data:updated',
      state: dataStore,
      updatedBy: authUser.id,
    });

    res.json({ bootstrapped: true, state: dataStore });
  });

  // REST: Sync operational data changes (enforces server-side RBAC)
  app.put('/api/data/sync', (req: Request, res: Response) => {
    const authUser = requireAuth(req, res);
    if (!authUser) return;

    const reqPermRaw = req.body?.requiredPermission;
    const reqPerm: PermissionAction | undefined =
      reqPermRaw === 'add' || reqPermRaw === 'update' || reqPermRaw === 'delete'
        ? reqPermRaw
        : undefined;

    if (!hasDataPermission(authUser, reqPerm)) {
      res.status(403).json({
        error: `Izin ${reqPerm ? reqPerm.toUpperCase() : 'ubah data'} Anda dinonaktifkan oleh SuperAdmin.`,
      });
      return;
    }

    const body = req.body || {};
    const previousProposals = Array.isArray(dataStore.proposals)
      ? (dataStore.proposals as Array<{ id?: unknown; namaProposal?: unknown; tahun?: unknown }>)
      : [];
    const deletedProposals =
      reqPerm === 'delete' && Array.isArray(body.proposals)
        ? (() => {
            const incomingIds = new Set(
              (body.proposals as Array<{ id?: unknown }>).map((p) => String(p?.id || ''))
            );
            return previousProposals.filter((p) => p?.id && !incomingIds.has(String(p.id)));
          })()
        : [];

    if (Array.isArray(body.records)) dataStore.records = body.records;
    if (Array.isArray(body.proposals)) dataStore.proposals = body.proposals;
    if (Array.isArray(body.items)) dataStore.items = body.items;
    if (Array.isArray(body.pengelolaList)) dataStore.pengelolaList = body.pengelolaList;
    if (Array.isArray(body.pekerjaanList)) {
      dataStore.pekerjaanList = body.pekerjaanList.map((s: unknown) => String(s));
    }
    if (Array.isArray(body.wilayahList)) dataStore.wilayahList = body.wilayahList;
    if (Array.isArray(body.proposalHistory)) dataStore.proposalHistory = body.proposalHistory;
    if (Array.isArray(body.kpmAuditLogs)) dataStore.kpmAuditLogs = body.kpmAuditLogs;

    normalizeOperationalStateOnServer();
    dataStore.initialized = true;
    dataStore.updatedAt = new Date().toISOString();
    saveDataStore(dataStore);

    broadcastAll({
      type: 'data:updated',
      state: dataStore,
      updatedBy: authUser.id,
    });

    for (const dp of deletedProposals) {
      const dpId = String(dp.id || '');
      const dpName = String(dp.namaProposal || 'Proposal');
      const dpYear = String(dp.tahun || '');
      broadcastAll({
        type: 'app:notification',
        actorId: authUser.id,
        proposalId: dpId,
        notification: {
          id: `notif-prop-del-${dpId}-${Date.now()}`,
          type: 'proposal_deleted',
          title: 'Proposal Dihapus',
          message: `Proposal "${dpName}"${dpYear ? ` (${dpYear})` : ''} telah dihapus oleh ${authUser.nama}.`,
          actorName: authUser.nama,
          createdAt: new Date().toISOString(),
          read: false,
          targetAction: 'proposals',
        },
      });
    }

    res.json({ ok: true, state: dataStore });
  });

  // REST: SuperAdmin destructive data actions (delete all KPM/proposal/items/data or reset total)
  app.post('/api/admin/data-action', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;

    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({
        error: 'Hanya SuperAdmin yang berhak menjalankan aksi reset/hapus massal.',
      });
      return;
    }

    const action = String(req.body?.action || '').trim();
    if (action === 'delete_all_kpm') {
      dataStore.records = [];
      dataStore.proposalHistory = [];
      dataStore.kpmAuditLogs = [];
    } else if (action === 'delete_all_proposal') {
      dataStore.proposals = [];
      dataStore.records = [];
      dataStore.proposalHistory = [];
      dataStore.kpmAuditLogs = [];
    } else if (action === 'delete_all_items') {
      dataStore.items = [];
    } else if (action === 'delete_all_data') {
      dataStore.records = [];
      dataStore.proposals = [];
      dataStore.items = [];
      dataStore.pengelolaList = [];
      dataStore.pekerjaanList = [];
      dataStore.wilayahList = [];
      dataStore.proposalHistory = [];
      dataStore.kpmAuditLogs = [];
    } else if (action === 'reset_total') {
      dataStore.records = [];
      dataStore.proposals = [];
      dataStore.items = [];
      dataStore.pengelolaList = [];
      dataStore.pekerjaanList = [];
      dataStore.wilayahList = [];
      dataStore.proposalHistory = [];
      dataStore.kpmAuditLogs = [];
      store.messages = [];
      saveStore(store);
      broadcastAll({ type: 'chat:reset' });
    } else {
      res.status(400).json({ error: 'Aksi tidak dikenal.' });
      return;
    }

    dataStore.initialized = true;
    dataStore.updatedAt = new Date().toISOString();
    saveDataStore(dataStore);

    broadcastAll({
      type: 'data:updated',
      state: dataStore,
      updatedBy: actor.id,
    });

    res.json({ ok: true, state: dataStore });
  });

  // REST: Server-side Gemini Vision OCR for KTP + Kartu Keluarga (KK)
  interface OcrDescriptor {
    base64?: string;
    mimeType?: string;
    fileId?: string;
    thumbnailUrl?: string;
    url?: string;
  }

  function isAllowedOcrImageUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
        host.includes(':')
      ) {
        return false;
      }
      return (
        host === 'drive.google.com' ||
        host === 'docs.google.com' ||
        host.endsWith('.googleusercontent.com') ||
        host.endsWith('.supabase.co')
      );
    } catch {
      return false;
    }
  }

  async function resolveImagePartForOcr(
    rawDescriptor: unknown,
    label: string
  ): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const desc = (rawDescriptor && typeof rawDescriptor === 'object'
      ? rawDescriptor
      : {}) as OcrDescriptor;

    const rawBase64 = typeof desc.base64 === 'string' ? desc.base64.trim() : '';
    if (rawBase64) {
      const cleanedBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
      const estimatedBytes = Math.floor((cleanedBase64.length * 3) / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        throw new Error(`Ukuran gambar ${label} melebihi batas maksimal 10 MB.`);
      }
      const mime =
        typeof desc.mimeType === 'string' && desc.mimeType.startsWith('image/')
          ? desc.mimeType
          : 'image/jpeg';
      return {
        inlineData: {
          mimeType: mime,
          data: cleanedBase64,
        },
      };
    }

    const candidates: string[] = [];
    const fileId = typeof desc.fileId === 'string' ? desc.fileId.trim() : '';
    if (fileId && /^[A-Za-z0-9_-]{10,120}$/.test(fileId)) {
      candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`);
      candidates.push(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`);
    }
    if (typeof desc.url === 'string' && isAllowedOcrImageUrl(desc.url.trim())) {
      candidates.push(desc.url.trim());
    }
    if (typeof desc.thumbnailUrl === 'string' && isAllowedOcrImageUrl(desc.thumbnailUrl.trim())) {
      candidates.push(desc.thumbnailUrl.trim());
    }

    for (const targetUrl of Array.from(new Set(candidates))) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        const resp = await fetch(targetUrl, {
          redirect: 'follow',
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (!resp.ok) continue;
        if (resp.url && !isAllowedOcrImageUrl(resp.url)) continue;
        const contentType = (resp.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) continue;

        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 10 * 1024 * 1024) continue;

        return {
          inlineData: {
            mimeType: contentType.split(';')[0] || 'image/jpeg',
            data: Buffer.from(arrayBuf).toString('base64'),
          },
        };
      } catch {
        // Try next candidate URL
      }
    }

    throw new Error(
      `Foto ${label} tidak dapat diakses untuk dipindai. Silakan unggah ulang foto ${label} secara langsung.`
    );
  }

  app.post('/api/ocr/ktp-kk', ocrRateLimiter, async (req: Request, res: Response) => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'Layanan scan KTP & KK belum aktif karena GEMINI_API_KEY belum terpasang di Settings > Secrets.',
      });
      return;
    }

    const ktpRaw = req.body?.ktp;
    const kkRaw = req.body?.kk;
    if (!ktpRaw || !kkRaw || typeof ktpRaw !== 'object' || typeof kkRaw !== 'object') {
      res.status(400).json({
        error: 'Foto KTP dan Foto Kartu Keluarga (KK) harus sama-sama diunggah terlebih dahulu.',
      });
      return;
    }

    const pekerjaanOptions = Array.isArray(req.body?.pekerjaanOptions)
      ? req.body.pekerjaanOptions.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const kelurahanOptions = Array.isArray(req.body?.kelurahanOptions)
      ? req.body.kelurahanOptions.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];

    try {
      const [ktpPart, kkPart] = await Promise.all([
        resolveImagePartForOcr(ktpRaw, 'KTP'),
        resolveImagePartForOcr(kkRaw, 'Kartu Keluarga (KK)'),
      ]);

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const pekerjaanHint =
        pekerjaanOptions.length > 0
          ? `Daftar pilihan Pekerjaan di form: ${pekerjaanOptions.join(', ')}. Jika pekerjaan pada KTP/KK cocok atau bermakna sama (misalnya "MENGURUS RUMAH TANGGA" / "IBU RUMAH TANGGA"), pilih yang paling sesuai dari daftar tersebut; jika tetap tidak terbaca atau buram, kosongkan "".`
          : '';
      const kelurahanHint =
        kelurahanOptions.length > 0
          ? `Daftar Kelurahan yang tersedia: ${kelurahanOptions.join(', ')}. Isi kelurahan jika terbaca jelas.`
          : '';

      const promptText = [
        'Ekstrak data pendaftaran KPM dari pasangan FOTO 1 (KTP) dan FOTO 2 (Kartu Keluarga / KK) dengan aturan KETAT berikut:',
        '1. PUSAT IDENTITAS WAJIB DARI KTP: Semua data personal (nikKtp, nama, alamat, rt, rw, pekerjaan) HARUS merujuk pada ORANG YANG TERTERA PADA KTP. JANGAN PERNAH mengambil anggota keluarga lain di KK sebagai pemohon utama.',
        '2. PERAN KARTU KELUARGA (KK): Gunakan foto KK untuk mengambil Nomor Kartu Keluarga 16 digit (nikKk), serta membantu memverifikasi atau melengkapi field alamat / rt / rw / pekerjaan HANYA untuk baris anggota keluarga yang SAMA persis (nama dan/atau NIK cocok) dengan orang di KTP jika bagian tersebut di KTP sedikit kurang tajam — namun JIKA tetap buram atau meragukan di kedua foto, JANGAN MENGARANG.',
        '3. ATURAN ANTI-MENGARANG (ZERO GUESSING): Jika ada bagian foto yang buram, silau, terpotong, terlalu kecil, atau bahkan hanya 1-2 digit angka pada NIK/No.KK/RT/RW yang tidak terbaca dengan keyakinan tinggi, WAJIB kembalikan string kosong "" untuk field tersebut, masukkan nama key field ("nikKk", "nikKtp", "nama", "alamat", "rt", "rw", "pekerjaan") ke dalam array blurryFields, dan tuliskan alasan singkat berbahasa Indonesia ke dalam fieldIssues.',
        '4. FORMAT FIELD:',
        '   - nikKk: tepat 16 digit angka tanpa spasi dari Nomor KK di bagian atas/tengah KK ("" jika kurang dari 16 digit atau ada angka buram).',
        '   - nikKtp: tepat 16 digit angka tanpa spasi dari NIK pada KTP ("" jika ada angka buram).',
        '   - nama: nama lengkap orang pada KTP dalam HURUF KAPITAL tanpa gelar mengarang ("" jika buram).',
        '   - alamat: alamat jalan/gang/nomor rumah (tanpa tulisan RT/RW atau Kel/Kec) dari KTP (atau baris alamat KK yang sama), format rapi.',
        '   - rt: 3 digit angka dengan awalan nol jika jelas terbaca (contoh "003"), "" jika buram.',
        '   - rw: 3 digit angka dengan awalan nol jika jelas terbaca (contoh "005"), "" jika buram.',
        '   - pekerjaan: pekerjaan orang pada KTP tersebut.',
        '   - ktpNameMatchesKk: true jika orang pada KTP juga teridentifikasi di dalam daftar KK atau nama pada KTP tidak bertentangan dengan KK; false jika foto KK jelas-jelas milik keluarga yang berbeda atau nama pemegang KTP sama sekali tidak ditemukan di tabel anggota KK padahal tabel KK terbaca jelas.',
        pekerjaanHint,
        kelurahanHint,
      ]
        .filter(Boolean)
        .join('\n');

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          nikKk: { type: Type.STRING, description: '16 digit Nomor KK atau "" jika buram' },
          nikKtp: { type: Type.STRING, description: '16 digit NIK KTP atau "" jika buram' },
          nama: { type: Type.STRING, description: 'Nama lengkap sesuai KTP dalam HURUF KAPITAL atau ""' },
          alamat: { type: Type.STRING, description: 'Alamat jalan/gang/nomor rumah tanpa RT/RW atau ""' },
          rt: { type: Type.STRING, description: '3 digit RT misal 001 atau ""' },
          rw: { type: Type.STRING, description: '3 digit RW misal 002 atau ""' },
          pekerjaan: { type: Type.STRING, description: 'Pekerjaan orang pada KTP atau ""' },
          kelurahan: { type: Type.STRING, description: 'Nama kelurahan/desa jika terbaca atau ""' },
          ktpNameMatchesKk: {
            type: Type.BOOLEAN,
            description: 'Apakah identitas KTP sesuai / ditemukan dalam KK tersebut',
          },
          blurryFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Daftar key field yang buram atau tidak terbaca yakin',
          },
          fieldIssues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                field: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
            description: 'Penjelasan singkat berbahasa Indonesia untuk field yang buram',
          },
        },
      };

      const systemInstruction =
        'Anda adalah asisten OCR dokumen kependudukan Indonesia (e-KTP dan Kartu Keluarga) yang sangat teliti dan konservatif. Jangan pernah menebak angka atau huruf yang buram/silau/terpotong. Kembalikan string kosong dan catat di blurryFields setiap kali ada keraguan sekecil apa pun.';

      const ocrContents = {
        parts: [
          { text: 'FOTO 1 (KTP):' },
          ktpPart,
          { text: 'FOTO 2 (KARTU KELUARGA / KK):' },
          kkPart,
          { text: promptText },
        ],
      };

      const modelAttempts: { model: string; thinkingLevel?: ThinkingLevel }[] = [
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      ];

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastModelErr: unknown = null;

      for (let attemptIdx = 0; attemptIdx < modelAttempts.length; attemptIdx += 1) {
        const attempt = modelAttempts[attemptIdx];
        try {
          response = await ai.models.generateContent({
            model: attempt.model,
            contents: ocrContents,
            config: {
              systemInstruction,
              ...(attempt.thinkingLevel
                ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
                : {}),
              responseMimeType: 'application/json',
              responseSchema,
            },
          });
          lastModelErr = null;
          break;
        } catch (modelErr: unknown) {
          lastModelErr = modelErr;
          const errText = modelErr instanceof Error ? modelErr.message : String(modelErr);
          const isTransient =
            errText.includes('503') ||
            errText.includes('UNAVAILABLE') ||
            errText.includes('high demand') ||
            errText.includes('500') ||
            errText.includes('INTERNAL') ||
            errText.includes('fetch failed') ||
            errText.includes('ECONNRESET');
          if (!isTransient || attemptIdx === modelAttempts.length - 1) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 900 * (attemptIdx + 1)));
        }
      }

      if (!response) {
        throw lastModelErr ?? new Error('Gagal memanggil layanan OCR Gemini.');
      }

      const rawText = (response.text || '{}').trim();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        res.status(502).json({
          error: 'Hasil pembacaan dokumen tidak valid. Silakan coba pindai ulang dengan foto yang lebih jelas.',
        });
        return;
      }

      res.json(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[OCR KTP/KK] Error:', msg);

      if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
        res.status(503).json({
          error:
            'Server pemindai AI sedang sibuk sementara (503). Tunggu beberapa detik lalu klik Scan ulang.',
        });
        return;
      }

      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Kuota permintaan API Gemini sedang penuh (429 RESOURCE_EXHAUSTED). Tunggu beberapa saat atau tingkatkan paket/billing API key di Settings > Secrets.',
        });
        return;
      }

      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error:
            'Kunci API Gemini tidak valid atau belum memiliki izin. Periksa GEMINI_API_KEY pada panel Settings > Secrets.',
        });
        return;
      }

      res.status(500).json({
        error: 'Terjadi gangguan saat memindai foto KTP & KK. Pastikan gambar jelas lalu coba lagi.',
      });
    }
  });

  app.post('/api/troubleshooting/extract-pdf', ocrRateLimiter, async (req: Request, res: Response) => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'Layanan ekstraksi PDF Troubleshooting belum aktif karena GEMINI_API_KEY belum terpasang di Settings > Secrets.',
      });
      return;
    }

    const kind = req.body?.kind === 'bast' ? 'bast' : req.body?.kind === 'proposal' ? 'proposal' : '';
    const fileName = String(req.body?.fileName || 'dokumen.pdf').trim();
    const rawBase64 = String(req.body?.base64 || '')
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s+/g, '')
      .trim();

    if (!kind || !rawBase64) {
      res.status(400).json({
        error: 'Jenis dokumen (proposal/bast) dan isi file PDF wajib dikirimkan.',
      });
      return;
    }

    const estimatedBytes = Math.floor((rawBase64.length * 3) / 4);
    if (estimatedBytes > 20 * 1024 * 1024) {
      res.status(400).json({
        error: `Ukuran file "${fileName}" melebihi batas maksimal 20 MB.`,
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const pdfPart = {
        inlineData: {
          mimeType: 'application/pdf',
          data: rawBase64,
        },
      };

      const runWithTransientRetry = async (
        callFn: () => Promise<Awaited<ReturnType<typeof ai.models.generateContent>>>
      ) => {
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await callFn();
          } catch (err: unknown) {
            lastErr = err;
            const errText = err instanceof Error ? err.message : String(err);
            const isTransient =
              errText.includes('503') ||
              errText.includes('UNAVAILABLE') ||
              errText.includes('high demand') ||
              errText.includes('500') ||
              errText.includes('INTERNAL') ||
              errText.includes('fetch failed') ||
              errText.includes('ECONNRESET');
            if (!isTransient || attempt === 1) break;
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
        throw lastErr ?? new Error('Gagal memanggil layanan ekstraksi PDF.');
      };

      if (kind === 'bast') {
        const bastPrompt = [
          'Ekstrak SELURUH tabel penerima bantuan dari dokumen PDF BAST Dinas ini mulai dari halaman pertama hingga halaman terakhir.',
          'ATURAN WAJIB:',
          '1. Baca setiap nomor urut (kolom NO) dari baris ke-1 hingga baris terakhir secara berurutan tanpa ada yang terlewat.',
          '2. Setiap penerima memiliki kolom NO (angka), NAMA, NIK (16 digit), ALAMAT, dan daftar rincian barang pada kolom BARANG / NAMA BARANG.',
          '3. PENANGANAN PINDAH HALAMAN (PAGE BREAK): Sering kali daftar barang untuk satu penerima terpotong ke bagian atas halaman berikutnya (kolom NO, NAMA, NIK, ALAMAT kosong di baris lanjutan atas halaman baru). WAJIB gabungkan barang-barang lanjutan tersebut ke dalam array barangList milik nomor urut penerima sebelumnya! Jangan membuat baris baru tanpa nomor urut dan jangan menghilangkan barang lanjutan.',
          '4. Gabungkan alamat atau nama yang terbungkus beberapa baris dalam sel yang sama menjadi satu string bersih dipisahkan spasi.',
          '5. Ekstrak nama setiap item barang di kolom BARANG/NAMA BARANG secara lengkap apa adanya (contoh: "MIXER", "OVEN GAS", "BLENDER", "TEFLON KUE", "SELANG GAS", "REGULATOR", "KOMPOR GAS", "DISPENSER", "RICE COOKER", "MESIN JAHIT", "MESIN CUCI", "KERANJANG PAKAIAN", "MESIN POTONG PAPAN", "MESIN GERINDA KAYU", "MESIN SERUT KAYU", "MESIN AMPLAS", "MESIN BOR", "ALAT CUP ES", "ALAT SERUT ES", "TERMOS ES", "MESIN CUCI KENDARAAN", "MESIN POTONG RUMPUT", "MINI CHAINSAW", "ALAT SEMPROT", "KOMPOR 1000", "PANCI 30 CM", "PANCI 28 CM", "PANCI 26 CM", "PANCI 24 CM", "TEKO SIUL", "TERMOS").',
        ].join('\n');

        const response = await runWithTransientRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: {
              parts: [pdfPart, { text: bastPrompt }],
            },
            config: {
              systemInstruction:
                'Anda adalah mesin ekstraksi tabel dokumen resmi BAST Dinas Indonesia yang sangat presisi. Selalu ekstrak semua baris dari halaman 1 sampai halaman terakhir secara lengkap dan akurat.',
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  documentTitle: {
                    type: Type.STRING,
                    description: 'Judul atau nama wilayah dokumen BAST jika ada, atau nama ringkas dokumen',
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        no: { type: Type.INTEGER, description: 'Nomor urut integer dari kolom NO' },
                        nama: { type: Type.STRING, description: 'Nama lengkap penerima' },
                        nik: { type: Type.STRING, description: 'NIK 16 digit tanpa spasi' },
                        alamat: { type: Type.STRING, description: 'Alamat lengkap 1 baris rapi' },
                        barangList: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: 'Daftar semua nama barang untuk penerima ini (termasuk lanjutan lintas halaman)',
                        },
                      },
                      required: ['no', 'nama', 'nik', 'alamat', 'barangList'],
                    },
                  },
                },
                required: ['documentTitle', 'rows'],
              },
            },
          })
        );

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse((response.text || '{}').trim()) as Record<string, unknown>;
        } catch {
          res.status(502).json({
            error: 'Format hasil ekstraksi PDF BAST tidak valid. Silakan unggah PDF digital asli atau coba ulang.',
          });
          return;
        }
        res.json(parsed);
        return;
      }

      // kind === 'proposal'
      const proposalPrompt = [
        'Ekstrak SELURUH baris KPM penerima bantuan dari dokumen PDF Daftar KPM Proposal ini mulai dari halaman pertama hingga halaman terakhir.',
        'ATURAN WAJIB:',
        '1. Ambil judul dokumen di bagian atas halaman 1 ke field documentTitle (contoh: "Kecamatan Pontianak Barat 2026" atau "Kelurahan Pal Lima 2026").',
        '2. Format kolom PDF bisa bervariasi: bisa 4 kolom (NO, ITEM, NAMA, ALAMAT) atau 9 kolom (NO, ITEM, DESIL, NAMA, ALAMAT, RT / RW, KONTAK, PENGELOLA, KELURAHAN).',
        '3. ABAIKAN BARIS KOSONG: Jika ada baris yang memiliki nomor urut di kolom NO (misal 15, 30, 32, 49, 61, 65) tetapi kolom ITEM dan NAMA-nya kosong/blank, JANGAN masukkan baris kosong tersebut ke dalam rows!',
        '4. Hanya ekstrak baris yang benar-benar berisi NAMA dan KODE ITEM (misal OV, KPR, JHT, MC, TKG, ES, CMT, TBS, MSK).',
        '5. Gabungkan teks sel yang terbungkus beberapa baris (misalnya nama atau alamat panjang) menjadi satu baris teks rapi dipisahkan spasi. Jangan memasukkan isi kolom lain ke kolom yang salah.',
        '6. Jika kolom RT/RW, KELURAHAN, atau PENGELOLA tidak ada di tabel, isi dengan string kosong "".',
        '7. JANGAN memasukkan daftar ringkasan di bagian paling bawah dokumen ("DAFTAR ITEM :" dan "PENGELOLA :") ke dalam rows. Jika terdapat daftar "PENGELOLA :" di ringkasan bawah, masukkan ke array summaryPengelola.',
      ].join('\n');

      const response = await runWithTransientRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [pdfPart, { text: proposalPrompt }],
          },
          config: {
            systemInstruction:
              'Anda adalah mesin ekstraksi tabel Daftar KPM Proposal yang sangat teliti. Ekstrak seluruh baris KPM non-kosong dari halaman 1 hingga halaman terakhir sesuai urutan tabel asli.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                documentTitle: {
                  type: Type.STRING,
                  description: 'Judul proposal pada header halaman pertama',
                },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      no: { type: Type.STRING, description: 'Nomor urut di tabel Proposal (misal "01")' },
                      item: { type: Type.STRING, description: 'Kode item (OV, KPR, JHT, MC, TKG, ES, CMT, TBS, MSK, dll.)' },
                      nama: { type: Type.STRING, description: 'Nama KPM lengkap' },
                      alamat: { type: Type.STRING, description: 'Alamat jalan/gang/no rumah' },
                      rtRw: { type: Type.STRING, description: 'Isi kolom RT / RW jika tersedia, atau ""' },
                      kelurahan: { type: Type.STRING, description: 'Isi kolom Kelurahan jika tersedia, atau ""' },
                      pengelola: { type: Type.STRING, description: 'Nama Pengelola jika tersedia di kolom tabel, atau ""' },
                    },
                    required: ['no', 'item', 'nama', 'alamat', 'rtRw', 'kelurahan', 'pengelola'],
                  },
                },
                summaryPengelola: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      count: { type: Type.INTEGER },
                    },
                  },
                },
              },
              required: ['documentTitle', 'rows'],
            },
          },
        })
      );

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse((response.text || '{}').trim()) as Record<string, unknown>;
      } catch {
        res.status(502).json({
          error: 'Format hasil ekstraksi PDF Proposal tidak valid. Silakan unggah PDF digital asli atau coba ulang.',
        });
        return;
      }
      res.json(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Troubleshooting PDF Extract] Error:', msg);

      if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
        res.status(503).json({
          error:
            'Server ekstraksi AI sedang sibuk sementara (503). Tunggu beberapa detik lalu coba proses ulang.',
        });
        return;
      }

      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Kuota permintaan API Gemini sedang penuh (429 RESOURCE_EXHAUSTED). Tunggu beberapa saat atau tingkatkan paket API key di Settings > Secrets.',
        });
        return;
      }

      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error:
            'Kunci API Gemini tidak valid atau belum memiliki izin. Periksa GEMINI_API_KEY pada panel Settings > Secrets.',
        });
        return;
      }

      res.status(500).json({
        error: 'Terjadi gangguan saat membaca file PDF. Gunakan file PDF digital asli atau coba lagi.',
      });
    }
  });

  app.get('/api/supabase-files/:filename', (req: Request, res: Response) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (actor.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Hanya SuperAdmin yang berhak mengunduh berkas skema/impor database.' });
      return;
    }

    const allowedFiles = new Set([
      'fix_standalone_kpm_no_year.sql',
      'kpm_records_import.sql',
      'kpm_records_import.csv',
      'schema.sql',
    ]);
    const filename = String(req.params.filename || '').trim();
    if (!allowedFiles.has(filename)) {
      res.status(404).json({ error: 'File tidak ditemukan.' });
      return;
    }
    const filePath = path.resolve(process.cwd(), 'supabase', filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File belum tersedia.' });
      return;
    }
    const contentType = filename.endsWith('.csv')
      ? 'text/csv; charset=utf-8'
      : 'application/sql; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(filePath);
  });

  // WebSocket handling for multi-tab presence & real-time push
  wss.on('connection', (ws: WebSocket) => {
    let boundUserId: string | null = null;

    ws.on('error', () => {
      // Ignore client socket errors
    });

    ws.on('message', (rawData) => {
      try {
        const parsed = JSON.parse(String(rawData)) as Record<string, unknown>;
        const eventType = String(parsed.type || '');

        if (eventType === 'auth') {
          const token = String(parsed.token || '').trim();
          const session = token ? store.sessions[token] : undefined;
          if (session && isSessionExpired(session)) {
            delete store.sessions[token];
            saveStore(store);
            return;
          }
          const userId = session?.userId || '';
          const user = store.users.find((u) => u.id === userId && u.status === 'active');
          if (!user) return;

          boundUserId = user.id;
          const pendingTimer = userDisconnectTimers.get(user.id);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            userDisconnectTimers.delete(user.id);
          }

          let sockMap = socketStatesByUser.get(user.id);
          if (!sockMap) {
            sockMap = new Map<WebSocket, UserPresenceStatus>();
            socketStatesByUser.set(user.id, sockMap);
          }
          sockMap.set(ws, 'online');

          if (!user.presenceManual) {
            user.presenceStatus = 'online';
          }
          user.lastActiveAt = new Date().toISOString();
          saveStore(store);
          broadcastUsers();
          return;
        }

        if (eventType === 'presence:activity' && boundUserId) {
          const status = parsed.status;
          if (status === 'online' || status === 'idle' || status === 'offline') {
            const sockMap = socketStatesByUser.get(boundUserId);
            if (sockMap) {
              sockMap.set(ws, status);
            }
            syncUserPresence(boundUserId);
          }
          return;
        }

        if (eventType === 'chat:send' && boundUserId) {
          const recipientId = String(parsed.recipientId || '').trim();
          const text = String(parsed.text || '').trim();
          const sharedKpm = sanitizeSharedKpm(parsed.sharedKpm);
          const clientMsgId = String(parsed.id || '').trim();
          if (!recipientId || recipientId === boundUserId || (!text && !sharedKpm)) return;

          const sender = store.users.find((u) => u.id === boundUserId && u.status === 'active');
          const recipient = store.users.find((u) => u.id === recipientId && u.status === 'active');
          if (!sender || !recipient) return;

          if (clientMsgId && store.messages.some((m) => m.id === clientMsgId)) {
            return;
          }

          const msg: DirectChatMessage = {
            id: clientMsgId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            conversationKey: makeConversationKey(boundUserId, recipientId),
            senderId: boundUserId,
            recipientId,
            text,
            ...(sharedKpm ? { sharedKpm } : {}),
            createdAt: new Date().toISOString(),
          };
          store.messages.push(msg);
          saveStore(store);

          sendToUsers([boundUserId, recipientId], {
            type: 'chat:message',
            message: msg,
            senderName: sender.nama,
            senderRole: sender.role,
          });
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      if (!boundUserId) return;
      const uid = boundUserId;
      const sockMap = socketStatesByUser.get(uid);
      if (sockMap) {
        sockMap.delete(ws);
        if (sockMap.size > 0) {
          syncUserPresence(uid);
        } else {
          socketStatesByUser.delete(uid);
          const timer = setTimeout(() => {
            const activeMap = socketStatesByUser.get(uid);
            if (!activeMap || activeMap.size === 0) {
              syncUserPresence(uid);
            }
            userDisconnectTimers.delete(uid);
          }, 5000);
          userDisconnectTimers.set(uid, timer);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      plugins: [
        {
          name: 'masdeta-disable-vite-hmr-ws',
          enforce: 'post',
          transform(code, id) {
            if (id.replace(/\\/g, '/').includes('vite/dist/client/client.mjs')) {
              return {
                code: code.replace(
                  /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
                  'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });'
                ),
                map: null,
              };
            }
          },
        },
      ],
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch:
          process.env.DISABLE_HMR === 'true'
            ? null
            : { ignored: ['**/.data/**', '**/dev-dist/**', '**/dist/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const noCachePaths = new Set([
      '/index.html',
      '/sw.js',
      '/registerSW.js',
      '/manifest.webmanifest',
      '/release-version.json',
    ]);
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          const normalized = `/${path.relative(distDir, filePath).replace(/\\/g, '/')}`;
          if (noCachePaths.has(normalized)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MASDETA server listening on http://0.0.0.0:${PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception:', err);
});

startServer().catch((err) => {
  console.error('Failed to start MASDETA server:', err);
  process.exit(1);
});
