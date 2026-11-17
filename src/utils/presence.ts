import { InternalUser, UserPresenceStatus } from '../types/kpm';

export const PRESENCE_STALE_MS = 90_000;

export function resolveEffectiveUserPresence(
  user: Pick<InternalUser, 'presenceStatus' | 'presenceManual' | 'lastActiveAt' | 'updatedAt'>,
  nowMs: number = Date.now()
): UserPresenceStatus {
  if (user.presenceManual) {
    return user.presenceStatus;
  }
  if (user.presenceStatus === 'offline') {
    return 'offline';
  }
  const tsIso = user.lastActiveAt || user.updatedAt;
  if (tsIso) {
    const ts = new Date(tsIso).getTime();
    if (Number.isFinite(ts) && nowMs - ts > PRESENCE_STALE_MS) {
      return 'offline';
    }
  }
  return user.presenceStatus;
}

export function withEffectiveUserPresence(
  users: InternalUser[],
  currentUserId?: string | null,
  nowMs: number = Date.now()
): InternalUser[] {
  let changed = false;
  const next = users.map((u) => {
    if (currentUserId && u.id === currentUserId) {
      return u;
    }
    const effective = resolveEffectiveUserPresence(u, nowMs);
    if (effective !== u.presenceStatus) {
      changed = true;
      return { ...u, presenceStatus: effective };
    }
    return u;
  });
  return changed ? next : users;
}
