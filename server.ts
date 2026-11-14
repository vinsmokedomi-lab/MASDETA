import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

type InternalUserRole = 'SuperAdmin' | 'Admin' | 'Viewer';
type InternalUserStatus = 'pending' | 'active' | 'rejected';
type UserPresenceStatus = 'online' | 'idle' | 'offline';

interface UserPermissions {
  add: boolean;
  update: boolean;
  delete: boolean;
}

interface StoredUser {
  id: string;
  nama: string;
  email: string;
  jabatan: string;
  kontak: string;
  role: InternalUserRole;
  status: InternalUserStatus;
  permissions: UserPermissions;
  presenceStatus: UserPresenceStatus;
  presenceManual?: boolean;
  fotoDataUrl?: string;
  lastActiveAt?: string;
  registeredAt: string;
  updatedAt: string;
  passwordHash: string;
  passwordPlain?: string;
}

type PublicUser = Omit<StoredUser, 'passwordHash' | 'passwordPlain'>;

interface DirectChatMessage {
  id: string;
  conversationKey: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  readAt?: string;
}

interface CollabStore {
  users: StoredUser[];
  messages: DirectChatMessage[];
}

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'masdeta-collab.json');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function makeConversationKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function sanitizeUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, passwordPlain: _passwordPlain, ...rest } = user;
  return rest;
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
      passwordPlain: isVinsmoke ? 'germa666' : 'masdeta123',
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
      const users = Array.isArray(parsed.users) && parsed.users.length > 0
        ? parsed.users
        : createSeedUsers();
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      return { users, messages };
    }
  } catch (err) {
    console.error('Failed to load collab store:', err);
  }
  const initial: CollabStore = {
    users: createSeedUsers(),
    messages: [],
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

async function startServer() {
  const store = loadStore();
  // Ensure SuperAdmin accounts exist, migrate vinsmoke.domi@gmail.com -> SuperAdmin (germa666), and normalize roles
  const seedUsers = createSeedUsers();
  for (const seed of seedUsers) {
    if (!store.users.some((u) => u.email.toLowerCase() === seed.email.toLowerCase())) {
      store.users.push(seed);
    }
  }
  store.users = store.users.map((u) => {
    const emailLower = u.email.toLowerCase();
    let next = u.presenceManual ? u : { ...u, presenceStatus: 'offline' as UserPresenceStatus };
    if (emailLower === 'vinsmoke.domi@gmail.com') {
      const hasCustomPlain = Boolean(u.passwordPlain);
      next = {
        ...next,
        role: 'SuperAdmin',
        jabatan: 'SuperAdmin',
        status: 'active',
        permissions: { add: true, update: true, delete: true },
        passwordHash: hasCustomPlain
          ? u.passwordHash
          : verifyPassword('germa666', u.passwordHash)
            ? u.passwordHash
            : hashPassword('germa666'),
        passwordPlain: hasCustomPlain ? u.passwordPlain : 'germa666',
      };
    } else if (emailLower === 'la.qsas@gmail.com') {
      next = {
        ...next,
        role: 'SuperAdmin',
        jabatan: 'SuperAdmin',
        status: 'active',
        permissions: { add: true, update: true, delete: true },
        passwordPlain:
          u.passwordPlain ?? (verifyPassword('masdeta123', u.passwordHash) ? 'masdeta123' : undefined),
      };
    } else {
      if (!u.passwordPlain && verifyPassword('masdeta123', u.passwordHash)) {
        next = { ...next, passwordPlain: 'masdeta123' };
      }
      if ((next.role as string) === 'Verifikator' || (next.role as string) === 'Petugas') {
        next = { ...next, role: 'Admin' };
      }
    }
    return next;
  });
  saveStore(store);

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const socketsByUser = new Map<string, Set<WebSocket>>();
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
      const sockets = socketsByUser.get(uid);
      if (!sockets) continue;
      sockets.forEach((sock) => {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(json);
        }
      });
    }
  }

  function broadcastUsers() {
    broadcastAll({
      type: 'users:updated',
      users: store.users.map(sanitizeUser),
    });
  }

  function getUserMessages(userId: string): DirectChatMessage[] {
    return store.messages.filter(
      (m) => m.senderId === userId || m.recipientId === userId
    );
  }

  // REST: Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }

    const user = store.users.find((u) => u.email.toLowerCase() === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Email atau kata sandi tidak sesuai.' });
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

    const now = new Date().toISOString();
    if (!user.presenceManual) {
      user.presenceStatus = 'online';
    }
    user.lastActiveAt = now;
    saveStore(store);
    broadcastUsers();

    res.json({
      user: sanitizeUser(user),
      users: store.users.map(sanitizeUser),
      messages: getUserMessages(user.id),
    });
  });

  // REST: Register new account (pending SuperAdmin approval; jabatan/role assigned by SuperAdmin)
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const nama = String(req.body?.nama || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const kontak = String(req.body?.kontak || '').trim();
    const password = String(req.body?.password || '');
    const fotoDataUrl =
      typeof req.body?.fotoDataUrl === 'string' && req.body.fotoDataUrl.startsWith('data:image/')
        ? req.body.fotoDataUrl
        : undefined;

    if (!nama || !email || password.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, email, dan kata sandi (minimal 6 karakter) wajib diisi.',
      });
      return;
    }

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email sudah terdaftar di sistem.' });
      return;
    }

    const now = new Date().toISOString();
    const created: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nama,
      email,
      jabatan: 'Menunggu Penetapan SuperAdmin',
      kontak,
      role: 'Viewer',
      status: 'pending',
      permissions: { add: false, update: false, delete: false },
      presenceStatus: 'offline',
      presenceManual: false,
      fotoDataUrl,
      registeredAt: now,
      updatedAt: now,
      passwordHash: hashPassword(password),
      passwordPlain: password,
    };

    store.users.unshift(created);
    saveStore(store);
    broadcastUsers();

    res.status(201).json({
      user: sanitizeUser(created),
      message: 'Pendaftaran berhasil dikirim. Menunggu persetujuan & penetapan jabatan oleh SuperAdmin.',
    });
  });

  // REST: Internal forgot password lookup by email
  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Email wajib diisi.' });
      return;
    }

    const user = store.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      res.status(404).json({ error: 'Email tidak ditemukan di sistem MASDETA.' });
      return;
    }

    res.json({
      nama: user.nama,
      email: user.email,
      role: user.role,
      password: user.passwordPlain || null,
    });
  });

  // REST: Internal password reset by email
  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || newPassword.length < 6) {
      res.status(400).json({
        error: 'Email dan kata sandi baru (minimal 6 karakter) wajib diisi.',
      });
      return;
    }

    const user = store.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      res.status(404).json({ error: 'Email tidak ditemukan di sistem MASDETA.' });
      return;
    }

    user.passwordHash = hashPassword(newPassword);
    user.passwordPlain = newPassword;
    user.updatedAt = new Date().toISOString();
    saveStore(store);

    res.json({
      ok: true,
      message: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.',
    });
  });

  // REST: Full collaboration state sync
  app.get('/api/collab/state', (req: Request, res: Response) => {
    const userId = String(req.query.userId || '').trim();
    const currentUser = userId ? store.users.find((u) => u.id === userId) : undefined;

    res.json({
      user: currentUser ? sanitizeUser(currentUser) : null,
      users: store.users.map(sanitizeUser),
      messages: userId ? getUserMessages(userId) : [],
    });
  });

  // REST: Update own profile & presence setting
  app.patch('/api/users/:id/profile', (req: Request, res: Response) => {
    const { id } = req.params;
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
      user.fotoDataUrl = req.body.fotoDataUrl || undefined;
    }
    if (typeof req.body?.newPassword === 'string' && req.body.newPassword.length >= 6) {
      user.passwordHash = hashPassword(req.body.newPassword);
      user.passwordPlain = req.body.newPassword;
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

  // REST: SuperAdmin controls an Admin (status, role, ADD/UPDATE/DELETE permissions)
  app.patch('/api/users/:id/admin-control', (req: Request, res: Response) => {
    const { id } = req.params;
    const actorId = String(req.body?.actorId || '').trim();
    const actor = store.users.find((u) => u.id === actorId);

    if (!actor || actor.role !== 'SuperAdmin') {
      res.status(403).json({
        error: 'Hanya SuperAdmin yang berhak mengontrol akses dan izin Admin.',
      });
      return;
    }

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
    }
    if (
      req.body?.role === 'SuperAdmin' ||
      req.body?.role === 'Admin' ||
      req.body?.role === 'Viewer'
    ) {
      const nextRole = req.body.role as InternalUserRole;
      target.role = nextRole;
      target.jabatan = nextRole === 'SuperAdmin' ? 'SuperAdmin' : nextRole;
      if (nextRole === 'SuperAdmin') {
        target.permissions = { add: true, update: true, delete: true };
      } else if (nextRole === 'Viewer') {
        target.permissions = { add: false, update: false, delete: false };
      } else if (!target.permissions.add && !target.permissions.update && !target.permissions.delete) {
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

  // REST: Send 1-on-1 direct message (strictly sender -> recipient, never group chat)
  app.post('/api/chat/send', (req: Request, res: Response) => {
    const senderId = String(req.body?.senderId || '').trim();
    const recipientId = String(req.body?.recipientId || '').trim();
    const text = String(req.body?.text || '').trim();
    const clientMsgId = String(req.body?.id || '').trim();

    if (!senderId || !recipientId || senderId === recipientId || !text) {
      res.status(400).json({ error: 'Pengirim, penerima, dan isi pesan wajib valid.' });
      return;
    }

    const sender = store.users.find((u) => u.id === senderId);
    const recipient = store.users.find((u) => u.id === recipientId);
    if (!sender || !recipient) {
      res.status(404).json({ error: 'Pengirim atau penerima tidak ditemukan.' });
      return;
    }

    if (clientMsgId) {
      const existing = store.messages.find((m) => m.id === clientMsgId);
      if (existing) {
        res.json({ message: existing });
        return;
      }
    }

    const msg: DirectChatMessage = {
      id: clientMsgId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationKey: makeConversationKey(senderId, recipientId),
      senderId,
      recipientId,
      text,
      createdAt: new Date().toISOString(),
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

  // REST: Mark 1-on-1 conversation messages as read
  app.post('/api/chat/read', (req: Request, res: Response) => {
    const userId = String(req.body?.userId || '').trim();
    const peerId = String(req.body?.peerId || '').trim();
    if (!userId || !peerId) {
      res.status(400).json({ error: 'userId dan peerId wajib diisi.' });
      return;
    }

    const now = new Date().toISOString();
    let changed = false;
    const updatedIds: string[] = [];

    for (const msg of store.messages) {
      if (msg.senderId === peerId && msg.recipientId === userId && !msg.readAt) {
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

  // WebSocket handling for real-time presence & 1-on-1 chat push
  wss.on('connection', (ws: WebSocket) => {
    let boundUserId: string | null = null;

    ws.on('message', (rawData) => {
      try {
        const parsed = JSON.parse(String(rawData)) as Record<string, unknown>;
        const eventType = String(parsed.type || '');

        if (eventType === 'auth') {
          const userId = String(parsed.userId || '').trim();
          const user = store.users.find((u) => u.id === userId);
          if (!user) return;

          boundUserId = userId;
          const pendingTimer = userDisconnectTimers.get(userId);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            userDisconnectTimers.delete(userId);
          }

          let set = socketsByUser.get(userId);
          if (!set) {
            set = new Set();
            socketsByUser.set(userId, set);
          }
          set.add(ws);

          if (!user.presenceManual) {
            user.presenceStatus = 'online';
          }
          user.lastActiveAt = new Date().toISOString();
          saveStore(store);
          broadcastUsers();
          return;
        }

        if (eventType === 'presence:activity' && boundUserId) {
          const user = store.users.find((u) => u.id === boundUserId);
          if (!user) return;
          const status = parsed.status;
          if (!user.presenceManual && (status === 'online' || status === 'idle' || status === 'offline')) {
            if (user.presenceStatus !== status) {
              user.presenceStatus = status;
              user.lastActiveAt = new Date().toISOString();
              saveStore(store);
              broadcastUsers();
            }
          }
          return;
        }

        if (eventType === 'chat:send' && boundUserId) {
          const recipientId = String(parsed.recipientId || '').trim();
          const text = String(parsed.text || '').trim();
          const clientMsgId = String(parsed.id || '').trim();
          if (!recipientId || recipientId === boundUserId || !text) return;

          const sender = store.users.find((u) => u.id === boundUserId);
          const recipient = store.users.find((u) => u.id === recipientId);
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
      const set = socketsByUser.get(uid);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          socketsByUser.delete(uid);
          const timer = setTimeout(() => {
            const activeSet = socketsByUser.get(uid);
            if (!activeSet || activeSet.size === 0) {
              const user = store.users.find((u) => u.id === uid);
              if (user && !user.presenceManual) {
                user.presenceStatus = 'offline';
                user.lastActiveAt = new Date().toISOString();
                saveStore(store);
                broadcastUsers();
              }
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
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MASDETA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MASDETA server:', err);
  process.exit(1);
});
