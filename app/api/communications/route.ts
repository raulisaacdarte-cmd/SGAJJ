import { NextRequest, NextResponse } from 'next/server';
import { getDb, createNotification, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isCentralDirectorate } from '@/lib/domain';
import { sendAndLogSms } from '@/lib/sms';

export async function GET() {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? OR user_id IS NULL
    ORDER BY created_at DESC LIMIT 60
  `).all(user.id);

  const messages = db.prepare(`
    SELECT m.*, u.full_name as sender_name, u.role_code as sender_role,
           p.name as target_province_name, d.name as target_department_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN provinces p ON p.id = m.target_province_id
    LEFT JOIN departments d ON d.id = m.target_department_id
    WHERE m.sender_id = ?
       OR m.target_scope = 'TODOS_ASSOCIADOS'
       OR (m.target_scope = 'DIRECAO_CENTRAL' AND ? = 1)
       OR (m.target_scope = 'COORDENADORES_PROVINCIAIS' AND ? IN ('COORD_PROVINCIAL', 'PRESIDENTE'))
       OR (m.target_scope = 'COORDENACAO_ESPECIFICA' AND m.target_province_id = ?)
       OR (m.target_scope = 'DEPARTAMENTO_ESPECIFICO' AND m.target_department_id = ?)
       OR (m.target_scope = 'INDIVIDUAL' AND m.target_user_id = ?)
    ORDER BY m.created_at DESC LIMIT 80
  `).all(
    user.id,
    isCentralDirectorate(user.role_code) ? 1 : 0,
    user.role_code,
    user.province_id || -1,
    user.department_id || -1,
    user.id
  );

  const recipients = db.prepare(`
    SELECT u.id, u.full_name, u.email, r.name as role_name, p.name as province_name
    FROM users u
    JOIN roles r ON r.code = u.role_code
    LEFT JOIN provinces p ON p.id = u.province_id
    WHERE u.is_active = 1
    ORDER BY u.full_name ASC
  `).all();

  return NextResponse.json({ notifications, messages, recipients });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const {
    target_scope,
    target_province_id,
    target_department_id,
    target_user_id,
    subject,
    body,
    channels = ['IN_APP'],
  } = await req.json();

  if (!target_scope || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Destinatário, assunto e mensagem são obrigatórios.' }, { status: 400 });
  }

  // Provincial roles cannot broadcast to all national members or Central Directorate directly as official broadcast
  if (!isCentralDirectorate(user.role_code) && ['TODOS_ASSOCIADOS', 'COORDENADORES_PROVINCIAIS'].includes(target_scope)) {
    return NextResponse.json(
      { error: 'Comunicados de âmbito nacional são reservados à Direção Central.' },
      { status: 403 }
    );
  }

  const db = getDb();
  const effectiveProvince =
    !isCentralDirectorate(user.role_code) && target_scope === 'COORDENACAO_ESPECIFICA'
      ? user.province_id
      : target_province_id
        ? Number(target_province_id)
        : null;

  const msgRes = db.prepare(`
    INSERT INTO messages (
      sender_id, target_scope, target_province_id, target_department_id, target_user_id,
      subject, body, channels_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    target_scope,
    effectiveProvince,
    target_department_id ? Number(target_department_id) : null,
    target_user_id ? Number(target_user_id) : null,
    subject.trim(),
    body.trim(),
    JSON.stringify(channels)
  );

  // Resolve target users for notifications
  let targets: Array<{ id: number; full_name: string; phone: string; email: string }> = [];
  if (target_scope === 'TODOS_ASSOCIADOS') {
    targets = db.prepare(`SELECT id, full_name, phone, email FROM users WHERE is_active = 1`).all() as typeof targets;
  } else if (target_scope === 'DIRECAO_CENTRAL') {
    targets = db.prepare(`
      SELECT u.id, u.full_name, u.phone, u.email FROM users u JOIN roles r ON r.code = u.role_code
      WHERE u.is_active = 1 AND r.scope = 'NATIONAL'
    `).all() as typeof targets;
  } else if (target_scope === 'COORDENADORES_PROVINCIAIS') {
    targets = db.prepare(`SELECT id, full_name, phone, email FROM users WHERE is_active = 1 AND role_code = 'COORD_PROVINCIAL'`).all() as typeof targets;
  } else if (target_scope === 'COORDENACAO_ESPECIFICA' && effectiveProvince) {
    targets = db.prepare(`SELECT id, full_name, phone, email FROM users WHERE is_active = 1 AND province_id = ?`).all(effectiveProvince) as typeof targets;
  } else if (target_scope === 'DEPARTAMENTO_ESPECIFICO' && target_department_id) {
    targets = db.prepare(`SELECT id, full_name, phone, email FROM users WHERE is_active = 1 AND department_id = ?`).all(Number(target_department_id)) as typeof targets;
  } else if (target_scope === 'INDIVIDUAL' && target_user_id) {
    targets = db.prepare(`SELECT id, full_name, phone, email FROM users WHERE id = ?`).all(Number(target_user_id)) as typeof targets;
  }

  let smsDispatched = 0;
  for (const t of targets) {
    for (const ch of channels as Array<'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH'>) {
      createNotification(db, {
        userId: t.id,
        category: 'COMUNICADO',
        title: subject.trim(),
        message: body.trim().slice(0, 180),
        linkUrl: '/painel?tab=comunicacoes',
        channel: ch,
      });
      if (ch === 'SMS' && t.phone?.trim()) {
        const resSms = await sendAndLogSms(db, {
          recipientName: t.full_name,
          recipientPhone: t.phone,
          message: `AJJ: ${subject.trim()} — ${body.trim().slice(0, 220)}`,
          category: 'COMUNICADO',
          relatedEntity: 'message',
          relatedId: String(msgRes.lastInsertRowid),
        });
        if (resSms.status !== 'FALHA_ENVIO') smsDispatched += 1;
      }
    }
  }

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'COMUNICACAO_ENVIADA',
    entityType: 'message',
    entityId: Number(msgRes.lastInsertRowid),
    details: { target_scope, recipientsCount: targets.length, channels },
  });

  return NextResponse.json({ success: true, id: Number(msgRes.lastInsertRowid), deliveredTo: targets.length, smsDispatched });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { notification_id, mark_all } = await req.json();
  const db = getDb();
  if (mark_all) {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(user.id);
  } else if (notification_id) {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)`).run(
      Number(notification_id),
      user.id
    );
  }
  return NextResponse.json({ success: true });
}
