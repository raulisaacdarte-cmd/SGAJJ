import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { getCurrentUser, requireAuth } from '@/lib/auth';
import { generateCertificateCode, hasPermission, isCentralDirectorate } from '@/lib/domain';

export async function GET() {
  const db = getDb();
  const user = await getCurrentUser();

  const activities = db.prepare(`
    SELECT a.*, p.name as province_name,
           (SELECT COUNT(*) FROM activity_registrations ar WHERE ar.activity_id = a.id) as registrations_count
    FROM activities a
    LEFT JOIN provinces p ON p.id = a.province_id
    ORDER BY a.start_datetime DESC
  `).all();

  const registrations = user
    ? db.prepare(`
        SELECT ar.*, a.title as activity_title, a.activity_type, a.start_datetime, a.location
        FROM activity_registrations ar
        JOIN activities a ON a.id = ar.activity_id
        ${isCentralDirectorate(user.role_code) || hasPermission(user.role_code, 'MANAGE_ACTIVITIES') ? '' : 'WHERE ar.member_id = ? OR LOWER(ar.participant_email) = LOWER(?)'}
        ORDER BY ar.created_at DESC
      `).all(
        ...(isCentralDirectorate(user.role_code) || hasPermission(user.role_code, 'MANAGE_ACTIVITIES')
          ? []
          : [user.member_id || -1, user.email])
      )
    : [];

  return NextResponse.json({ activities, registrations });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Registration to an activity (available to authenticated users or public visitors)
  if (body.action === 'REGISTER') {
    const db = getDb();
    const user = await getCurrentUser();
    const { activity_id, participant_name, participant_email, participant_phone } = body;
    if (!activity_id || !participant_name?.trim() || !participant_email?.trim()) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios para inscrição.' }, { status: 400 });
    }
    const res = db.prepare(`
      INSERT INTO activity_registrations (activity_id, member_id, participant_name, participant_email, participant_phone)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Number(activity_id),
      user?.member_id || null,
      participant_name.trim(),
      participant_email.trim().toLowerCase(),
      participant_phone?.trim() || ''
    );
    return NextResponse.json({ success: true, id: Number(res.lastInsertRowid) });
  }

  // Create new activity
  const { user, errorResponse } = await requireAuth('MANAGE_ACTIVITIES');
  if (errorResponse || !user) return errorResponse!;

  const {
    title,
    activity_type,
    description,
    organizer_name,
    location,
    is_online,
    start_datetime,
    end_datetime,
    target_audience,
    max_participants,
    province_id,
    requires_central_approval,
  } = body;

  if (!title?.trim() || !activity_type || !location?.trim() || !start_datetime) {
    return NextResponse.json({ error: 'Título, tipo, local e data de início são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const isNational = isCentralDirectorate(user.role_code);
  const approvalStatus = !isNational && requires_central_approval ? 'PENDENTE_DIRECAO' : 'APROVADA';
  const effectiveProvince = isNational ? (province_id ? Number(province_id) : null) : user.province_id;

  const res = db.prepare(`
    INSERT INTO activities (
      title, activity_type, description, organizer_name, location, is_online,
      start_datetime, end_datetime, target_audience, max_participants,
      province_id, approval_status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    activity_type,
    description?.trim() || '',
    organizer_name?.trim() || user.full_name,
    location.trim(),
    is_online ? 1 : 0,
    start_datetime,
    end_datetime || null,
    target_audience?.trim() || 'Associados e Cidadãos',
    Number(max_participants) || 200,
    effectiveProvince,
    approvalStatus,
    user.id
  );

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'ATIVIDADE_CRIADA',
    entityType: 'activity',
    entityId: Number(res.lastInsertRowid),
    details: { title: title.trim(), activity_type, approvalStatus },
  });

  return NextResponse.json({ success: true, id: Number(res.lastInsertRowid), approval_status: approvalStatus });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('MANAGE_ACTIVITIES');
  if (errorResponse || !user) return errorResponse!;

  const { action, id, registration_id, approval_status, final_report } = await req.json();
  const db = getDb();

  if (action === 'APPROVE_ACTIVITY') {
    if (!isCentralDirectorate(user.role_code)) {
      return NextResponse.json({ error: 'Apenas a Direção Central pode autorizar atividades pendentes.' }, { status: 403 });
    }
    db.prepare(`UPDATE activities SET approval_status = ? WHERE id = ?`).run(approval_status, Number(id));
    return NextResponse.json({ success: true });
  }

  if (action === 'SAVE_REPORT') {
    db.prepare(`UPDATE activities SET final_report = ? WHERE id = ?`).run(final_report || '', Number(id));
    return NextResponse.json({ success: true });
  }

  if (action === 'ISSUE_CERTIFICATE') {
    const reg = db.prepare(`SELECT id, certificate_code FROM activity_registrations WHERE id = ?`).get(Number(registration_id)) as
      | { id: number; certificate_code: string | null }
      | undefined;
    if (!reg) {
      return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
    }
    if (reg.certificate_code) {
      return NextResponse.json({ success: true, certificate_code: reg.certificate_code });
    }
    const year = new Date().getFullYear();
    const seq = getNextSequence(db, `CERT_${year}`);
    const certCode = generateCertificateCode(year, seq);
    db.prepare(`
      UPDATE activity_registrations
      SET attended = 1, certificate_code = ?, certificate_issued_at = datetime('now')
      WHERE id = ?
    `).run(certCode, reg.id);

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'CERTIFICADO_EMITIDO',
      entityType: 'activity_registration',
      entityId: reg.id,
      details: { certCode },
    });

    return NextResponse.json({ success: true, certificate_code: certCode });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
