import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from './db';
import { hashToken, generateToken } from './crypto';
import { hasPermission, Permission } from './domain';

export const SESSION_COOKIE_NAME = 'sgajj_session';

export interface AuthUser {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role_code: string;
  role_name: string;
  role_scope: 'NATIONAL' | 'PROVINCIAL' | 'MEMBER';
  province_id: number | null;
  province_name: string | null;
  department_id: number | null;
  department_name: string | null;
  member_id: number | null;
  member_code: string | null;
  photo_path: string | null;
  activation_pending: number;
  mfa_enabled: number;
  is_active: number;
  created_at: string;
}

export function createUserSession(
  userId: number,
  userAgent = '',
  ipAddress = '127.0.0.1',
  trustedDevice = false
): { rawToken: string; expiresAt: string } {
  const db = getDb();
  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const durationMs = trustedDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, trusted_device, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, tokenHash, userAgent.slice(0, 250), ipAddress, trustedDevice ? 1 : 0, expiresAt);

  db.prepare(`
    UPDATE users
    SET last_login_at = datetime('now'), failed_login_attempts = 0, locked_until = NULL
    WHERE id = ?
  `).run(userId);
  return { rawToken, expiresAt };
}

export function revokeAllUserSessions(userId: number) {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

export function revokeSessionById(sessionId: number, userId?: number) {
  const db = getDb();
  if (userId !== undefined) {
    db.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`).run(sessionId, userId);
  } else {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const row = db.prepare(`
    SELECT
      u.id, u.email, u.phone, u.full_name, u.role_code, u.province_id, u.department_id,
      u.member_id, u.mfa_enabled, u.is_active, u.activation_pending, u.created_at,
      COALESCE(u.photo_path, m.photo_path) as photo_path,
      r.name as role_name, r.scope as role_scope,
      p.name as province_name,
      d.name as department_name,
      m.member_code as member_code,
      s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.code = u.role_code
    LEFT JOIN provinces p ON p.id = u.province_id
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN members m ON m.id = u.member_id
    WHERE s.token_hash = ? AND u.is_active = 1 AND u.activation_pending = 0
  `).get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    full_name: row.full_name,
    role_code: row.role_code,
    role_name: row.role_name,
    role_scope: row.role_scope,
    province_id: row.province_id,
    province_name: row.province_name,
    department_id: row.department_id,
    department_name: row.department_name,
    member_id: row.member_id,
    member_code: row.member_code,
    photo_path: row.photo_path,
    activation_pending: row.activation_pending ?? 0,
    mfa_enabled: row.mfa_enabled,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export async function requireAuth(permission?: Permission): Promise<{
  user: AuthUser | null;
  errorResponse: NextResponse | null;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json({ error: 'Sessão não autenticada.' }, { status: 401 }),
    };
  }
  if (permission && !hasPermission(user.role_code, permission)) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: 'Permissões insuficientes para esta operação estatutária.' },
        { status: 403 }
      ),
    };
  }
  return { user, errorResponse: null };
}
