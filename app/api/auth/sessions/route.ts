import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { requireAuth, revokeAllUserSessions, revokeSessionById } from '@/lib/auth';
import { isPresident } from '@/lib/domain';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId');
  const effectiveUserId = targetUserId && isPresident(user.role_code) ? Number(targetUserId) : user.id;

  const db = getDb();
  const sessions = db
    .prepare(
      `
    SELECT id, user_id, user_agent, ip_address, trusted_device, expires_at, created_at
    FROM sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `
    )
    .all(effectiveUserId);

  return NextResponse.json({ sessions });
}

export async function DELETE(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const targetUserId = searchParams.get('userId');
  const db = getDb();

  if (targetUserId && isPresident(user.role_code)) {
    const uid = Number(targetUserId);
    revokeAllUserSessions(uid);
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'SESSOES_UTILIZADOR_REVOGADAS',
      entityType: 'user',
      entityId: uid,
    });
    return NextResponse.json({ success: true });
  }

  if (sessionId) {
    revokeSessionById(Number(sessionId), user.id);
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'SESSAO_REVOGADA_PROPRIA',
      entityType: 'session',
      entityId: Number(sessionId),
    });
    return NextResponse.json({ success: true });
  }

  revokeAllUserSessions(user.id);
  return NextResponse.json({ success: true });
}
