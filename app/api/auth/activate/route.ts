import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { hashPassword, hashToken } from '@/lib/crypto';
import { createUserSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getDefaultPanelTab } from '@/lib/domain';

interface ActivationRow {
  token_id: number;
  user_id: number;
  purpose: string;
  expires_at: string;
  used_at: string | null;
  email: string;
  full_name: string;
  role_code: string;
  role_name: string;
  province_name: string | null;
  member_code: string | null;
}

function findValidActivationToken(token: string): ActivationRow | null {
  if (!token || token.length < 16) return null;
  const db = getDb();
  const row = db
    .prepare(
      `
    SELECT at.id as token_id, at.user_id, at.purpose, at.expires_at, at.used_at,
           u.email, u.full_name, u.role_code,
           r.name as role_name,
           p.name as province_name,
           m.member_code
    FROM activation_tokens at
    JOIN users u ON u.id = at.user_id
    JOIN roles r ON r.code = u.role_code
    LEFT JOIN provinces p ON p.id = u.province_id
    LEFT JOIN members m ON m.id = u.member_id
    WHERE at.token_hash = ?
  `
    )
    .get(hashToken(token.trim())) as ActivationRow | undefined;

  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const row = findValidActivationToken(token);
  if (!row) {
    return NextResponse.json(
      { valid: false, error: 'Link de ativação inválido, já utilizado ou expirado.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    valid: true,
    full_name: row.full_name,
    email: row.email,
    member_code: row.member_code,
    role_code: row.role_code,
    role_name: row.role_name,
    province_name: row.province_name,
    expires_at: row.expires_at,
  });
}

export async function POST(req: NextRequest) {
  const { token, password, confirmPassword, trustedDevice } = await req.json();
  if (!token || !password) {
    return NextResponse.json({ error: 'Token e palavra-passe são obrigatórios.' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'A palavra-passe individual deve ter pelo menos 6 caracteres.' }, { status: 400 });
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return NextResponse.json({ error: 'As palavras-passe introduzidas não coincidem.' }, { status: 400 });
  }

  const row = findValidActivationToken(String(token));
  if (!row) {
    return NextResponse.json(
      { error: 'Link de ativação inválido, já utilizado ou expirado. Solicite um novo envio à coordenação ou administração.' },
      { status: 400 }
    );
  }

  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `
      UPDATE users
      SET password_hash = ?, activation_pending = 0, is_active = 1, failed_login_attempts = 0, locked_until = NULL
      WHERE id = ?
    `
    ).run(hashPassword(String(password)), row.user_id);

    db.prepare(`UPDATE activation_tokens SET used_at = datetime('now') WHERE id = ?`).run(row.token_id);

    writeAuditLog(db, {
      userId: row.user_id,
      userName: row.full_name,
      roleCode: row.role_code,
      action: 'CONTA_ATIVADA_LINK_SEGURO',
      entityType: 'user',
      entityId: row.user_id,
      details: { member_code: row.member_code, role_code: row.role_code },
      previousState: { activation_pending: 1 },
      newState: { activation_pending: 0, is_active: 1 },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });
  })();

  const { rawToken, expiresAt } = createUserSession(
    row.user_id,
    req.headers.get('user-agent') || '',
    req.headers.get('x-forwarded-for') || '127.0.0.1',
    Boolean(trustedDevice)
  );

  const defaultTab = getDefaultPanelTab(row.role_code);
  const response = NextResponse.json({
    success: true,
    defaultTab,
    user: {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      role_code: row.role_code,
      role_name: row.role_name,
      member_code: row.member_code,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });

  return response;
}
