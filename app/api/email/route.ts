import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasPermission, isCentralDirectorate } from '@/lib/domain';
import {
  buildInstitutionalTestEmailHtml,
  getConfiguredEmailProvider,
  getEmailGatewayDiagnostics,
  isValidEmailAddress,
  resendEmailLog,
  sendAndLogEmail,
} from '@/lib/email';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isNat = isCentralDirectorate(user.role_code);
  const canViewAll =
    isNat ||
    hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE') ||
    hasPermission(user.role_code, 'PUBLISH_OFFICIAL_COMMUNIQUE');

  const diagnostics = getEmailGatewayDiagnostics();

  if (!canViewAll) {
    return NextResponse.json({
      logs: [],
      stats: { total: 0, sent: 0, queued: 0, failed: 0 },
      provider: getConfiguredEmailProvider(),
      diagnostics,
    });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  let sql = `SELECT * FROM email_logs WHERE 1=1`;
  const params: unknown[] = [];

  if (!isNat && user.province_id) {
    sql += `
      AND (
        related_entity != 'application'
        OR EXISTS (
          SELECT 1 FROM applications a
          WHERE a.tracking_number = email_logs.related_id AND a.province_id = ?
        )
      )
    `;
    params.push(user.province_id);
  }

  if (statusFilter) {
    sql += ` AND status = ?`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY id DESC LIMIT 100`;
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
    provider: diagnostics.provider,
    diagnostics,
  });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const canSend =
    isCentralDirectorate(user.role_code) || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');
  if (!canSend) {
    return NextResponse.json({ error: 'Sem permissão para gerir envios de e-mail.' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  if (body.action === 'RESEND') {
    const logId = Number(body.logId);
    if (!logId) {
      return NextResponse.json({ error: 'ID do registo de e-mail inválido.' }, { status: 400 });
    }
    const result = await resendEmailLog(db, logId);
    if (!result) {
      return NextResponse.json({ error: 'Registo de e-mail não encontrado.' }, { status: 404 });
    }
    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'REENVIO_EMAIL',
      entityType: 'email_log',
      entityId: logId,
      details: { status: result.status, provider: result.provider, emailMasked: result.emailMasked },
    });
    return NextResponse.json({ success: true, emailDelivery: result });
  }

  if (body.action === 'TEST') {
    if (!isCentralDirectorate(user.role_code)) {
      return NextResponse.json(
        { error: 'Apenas a Direção Central pode executar testes de gateway de e-mail.' },
        { status: 403 }
      );
    }

    const targetEmail = String(body.recipientEmail || user.email || '').trim().toLowerCase();
    if (!isValidEmailAddress(targetEmail)) {
      return NextResponse.json(
        { error: 'Indique um endereço de e-mail de destino válido para o teste.' },
        { status: 400 }
      );
    }

    const diagnostics = getEmailGatewayDiagnostics();
    const sentAtIso = new Date().toISOString();
    const result = await sendAndLogEmail(db, {
      recipientName: user.full_name,
      recipientEmail: targetEmail,
      subject: 'SGAJJ — Teste de Envio Real de E-mail Institucional',
      textBody:
        `Associação de Jovens Juristas (AJJ) — Teste de integração de e-mail no SGAJJ.\n` +
        `Provedor ativo: ${diagnostics.provider}\n` +
        `Remetente: ${diagnostics.fromEmail}\n` +
        `Data UTC: ${sentAtIso}`,
      htmlBody: buildInstitutionalTestEmailHtml({
        recipientName: user.full_name,
        provider: diagnostics.provider,
        fromEmail: diagnostics.fromEmail,
        sentAtIso,
      }),
      category: 'TESTE_GATEWAY_EMAIL',
      relatedEntity: 'user',
      relatedId: String(user.id),
    });

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'TESTE_ENVIO_EMAIL',
      entityType: 'email_log',
      entityId: result.logId,
      details: {
        status: result.status,
        provider: result.provider,
        emailMasked: result.emailMasked,
        errorMessage: result.errorMessage,
      },
    });

    return NextResponse.json({
      success: true,
      deliveredExternally: result.status === 'ENVIADO_GATEWAY',
      emailDelivery: result,
      diagnostics,
    });
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
