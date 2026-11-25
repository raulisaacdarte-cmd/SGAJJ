import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isCentralDirectorate, hasPermission } from '@/lib/domain';
import { getConfiguredSmsProvider, resendSmsLog, sendAndLogSms } from '@/lib/sms';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isNat = isCentralDirectorate(user.role_code);
  const canViewAll =
    isNat ||
    hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE') ||
    hasPermission(user.role_code, 'PUBLISH_OFFICIAL_COMMUNIQUE');

  if (!canViewAll) {
    return NextResponse.json({ logs: [], stats: { total: 0, sent: 0, queued: 0, failed: 0 }, provider: getConfiguredSmsProvider() });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  let sql = `
    SELECT s.*
    FROM sms_logs s
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isNat && user.province_id) {
    sql += `
      AND (
        s.related_entity != 'application'
        OR EXISTS (
          SELECT 1 FROM applications a
          WHERE a.tracking_number = s.related_id AND a.province_id = ?
        )
      )
    `;
    params.push(user.province_id);
  }

  if (statusFilter) {
    sql += ` AND s.status = ?`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY s.id DESC LIMIT 100`;
  const logs = db.prepare(sql).all(...params) as Array<{ status: string }>;

  const stats = {
    total: logs.length,
    sent: logs.filter((l) => l.status === 'ENVIADO_GATEWAY').length,
    queued: logs.filter((l) => l.status === 'ENFILEIRADO_LOCAL').length,
    failed: logs.filter((l) => l.status === 'FALHA_ENVIO').length,
  };

  return NextResponse.json({
    logs,
    stats,
    provider: getConfiguredSmsProvider(),
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canSend =
    isCentralDirectorate(user.role_code) || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canSend) {
    return NextResponse.json({ error: 'Sem permissão para gerir envios de SMS.' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  if (body.action === 'RESEND') {
    const logId = Number(body.logId);
    if (!logId) {
      return NextResponse.json({ error: 'ID do registo de SMS inválido.' }, { status: 400 });
    }
    const result = await resendSmsLog(db, logId);
    if (!result) {
      return NextResponse.json({ error: 'Registo de SMS não encontrado.' }, { status: 404 });
    }
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'REENVIO_SMS',
      entityType: 'sms_log',
      entityId: logId,
      details: { status: result.status, provider: result.provider },
    });
    return NextResponse.json({ success: true, smsDelivery: result });
  }

  const { recipient_name, recipient_phone, message, related_entity, related_id } = body;
  if (!recipient_phone?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Número de telemóvel e mensagem são obrigatórios.' }, { status: 400 });
  }

  const result = await sendAndLogSms(db, {
    recipientName: recipient_name?.trim() || 'Destinatário AJJ',
    recipientPhone: recipient_phone.trim(),
    message: message.trim().slice(0, 480),
    category: 'ENVIO_DIRETO',
    relatedEntity: related_entity || null,
    relatedId: related_id || null,
  });

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'ENVIO_SMS_DIRETO',
    entityType: 'sms_log',
    entityId: result.logId,
    details: { status: result.status, provider: result.provider, phoneMasked: result.phoneMasked },
  });

  return NextResponse.json({ success: true, smsDelivery: result });
}
