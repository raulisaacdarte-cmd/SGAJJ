import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { generateToken } from '@/lib/crypto';
import { requireAuth } from '@/lib/auth';
import { hasPermission, isCentralDirectorate } from '@/lib/domain';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get('memberId');

  let sql = `
    SELECT dc.*, m.full_name, m.photo_path, m.status as member_status,
           p.name as province_name, mc.name as category_name
    FROM digital_cards dc
    JOIN members m ON m.id = dc.member_id
    JOIN provinces p ON p.id = m.province_id
    JOIN member_categories mc ON mc.id = m.category_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (memberId) {
    sql += ` AND dc.member_id = ?`;
    params.push(Number(memberId));
  }

  if (!isCentralDirectorate(user.role_code)) {
    if (hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE') && user.province_id) {
      sql += ` AND m.province_id = ?`;
      params.push(user.province_id);
    } else if (user.member_id) {
      sql += ` AND dc.member_id = ?`;
      params.push(user.member_id);
    } else {
      return NextResponse.json({ cards: [] });
    }
  }

  sql += ` ORDER BY dc.issued_at DESC`;
  const cards = db.prepare(sql).all(...params);
  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canManage =
    hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canManage) {
    return NextResponse.json({ error: 'Sem permissão para emitir cartões.' }, { status: 403 });
  }

  const { member_id, validity_years = 2 } = await req.json();
  const db = getDb();
  const member = db.prepare(`SELECT id, member_code, province_id, full_name FROM members WHERE id = ?`).get(Number(member_id)) as
    | { id: number; member_code: string; province_id: number; full_name: string }
    | undefined;
  if (!member) {
    return NextResponse.json({ error: 'Associado não encontrado.' }, { status: 404 });
  }
  if (!isCentralDirectorate(user.role_code) && user.province_id !== member.province_id) {
    return NextResponse.json({ error: 'Apenas pode emitir cartões da sua província.' }, { status: 403 });
  }

  const year = new Date().getFullYear();
  const card = db.transaction(() => {
    db.prepare(`
      UPDATE digital_cards
      SET status = 'INVALIDADO', invalidated_reason = 'Substituído por reemissão oficial', invalidated_at = datetime('now')
      WHERE member_id = ? AND status = 'ATIVO'
    `).run(member.id);

    const cardSeq = getNextSequence(db, `CARD_${year}`);
    const cardNumber = `CART-${year}-${String(cardSeq).padStart(6, '0')}`;
    const qrToken = generateToken(16);
    const expiresAt = new Date(Date.now() + Number(validity_years) * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = db.prepare(`
      INSERT INTO digital_cards (member_id, card_number, member_code, qr_token, expires_at, issuer_name, status)
      VALUES (?, ?, ?, ?, ?, 'Presidência Nacional da AJJ', 'ATIVO')
    `).run(member.id, cardNumber, member.member_code, qrToken, expiresAt);

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'CARTAO_EMITIDO',
      entityType: 'digital_card',
      entityId: Number(res.lastInsertRowid),
      details: { memberCode: member.member_code, cardNumber },
    });

    return { id: Number(res.lastInsertRowid), cardNumber, qrToken, expiresAt };
  })();

  return NextResponse.json({ success: true, card });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canManage =
    hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canManage) {
    return NextResponse.json({ error: 'Sem permissão para invalidar cartões.' }, { status: 403 });
  }

  const { id, reason } = await req.json();
  const db = getDb();
  db.prepare(`
    UPDATE digital_cards
    SET status = 'INVALIDADO', invalidated_reason = ?, invalidated_at = datetime('now')
    WHERE id = ?
  `).run(reason || 'Invalidado pela administração', Number(id));

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'CARTAO_INVALIDADO',
    entityType: 'digital_card',
    entityId: Number(id),
    details: { reason },
  });

  return NextResponse.json({ success: true });
}
