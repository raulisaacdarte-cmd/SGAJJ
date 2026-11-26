import { NextRequest, NextResponse } from 'next/server';
import { createActivationToken, createNotification, getDb, writeAuditLog } from '@/lib/db';
import { buildActivationNotificationTemplates, type RoleScope } from '@/lib/domain';
import {
  buildInstitutionalActivationEmailHtml,
  hasExternalEmailGatewayConfigured,
  isValidEmailAddress,
  resolvePublicBaseUrl,
  sendAndLogEmail,
} from '@/lib/email';
import { syncSingleEntityToSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cleanEmail = String(body.email || '').trim().toLowerCase();
  const trackingParam = body.tracking_number ? String(body.tracking_number).trim() : '';

  if (!isValidEmailAddress(cleanEmail)) {
    return NextResponse.json(
      { code: 'INVALID_EMAIL', error: 'Introduza um endereço de e-mail válido.' },
      { status: 400 }
    );
  }

  const db = getDb();

  const recentCountRow = db
    .prepare(
      `
    SELECT COUNT(*) as c FROM email_logs
    WHERE LOWER(recipient_email) = LOWER(?)
      AND category = 'REENVIO_ATIVACAO'
      AND created_at > datetime('now', '-15 minutes')
  `
    )
    .get(cleanEmail) as { c: number };

  if (recentCountRow.c >= 5) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Limite de reenvios atingido nos últimos 15 minutos. Aguarde alguns minutos ou verifique a pasta de spam.',
      },
      { status: 429 }
    );
  }

  const user = db
    .prepare(
      `
    SELECT u.id, u.full_name, u.email, u.role_code, u.activation_pending, u.is_active,
           r.name as role_name, r.scope as role_scope,
           p.name as province_name,
           m.member_code
    FROM users u
    JOIN roles r ON r.code = u.role_code
    LEFT JOIN provinces p ON p.id = u.province_id
    LEFT JOIN members m ON m.id = u.member_id
    WHERE LOWER(u.email) = LOWER(?)
    LIMIT 1
  `
    )
    .get(cleanEmail) as
    | {
        id: number;
        full_name: string;
        email: string;
        role_code: string;
        activation_pending: number;
        is_active: number;
        role_name: string;
        role_scope: RoleScope;
        province_name: string | null;
        member_code: string | null;
      }
    | undefined;

  if (!user) {
    return NextResponse.json(
      {
        code: 'NOT_FOUND',
        error: 'Não encontrámos nenhuma inscrição ou conta associada a este endereço eletrónico.',
      },
      { status: 404 }
    );
  }

  if (!user.is_active) {
    return NextResponse.json(
      {
        code: 'ACCOUNT_INACTIVE',
        error: 'Esta conta encontra-se suspensa ou desativada. Contacte a Direção Central.',
      },
      { status: 403 }
    );
  }

  if (user.activation_pending === 0) {
    return NextResponse.json({
      success: false,
      alreadyActivated: true,
      code: 'ALREADY_ACTIVATED',
      message:
        'Esta conta já se encontra ativada. Pode iniciar sessão normalmente utilizando o seu endereço de e-mail e a palavra-passe definida.',
    });
  }

  const latestApp = db
    .prepare(
      `
    SELECT tracking_number FROM applications
    WHERE LOWER(email) = LOWER(?)
    ORDER BY id DESC LIMIT 1
  `
    )
    .get(cleanEmail) as { tracking_number: string } | undefined;

  const trackingNumber = trackingParam || latestApp?.tracking_number || null;
  const baseUrl = resolvePublicBaseUrl(req);
  const { rawToken } = createActivationToken(db, user.id, 'ACTIVATE', 48);
  const activationUrl = `${baseUrl}/ativar?token=${rawToken}`;

  const kind: 'ADESAO' | 'NOMEACAO' = user.role_code === 'ASSOCIADO' ? 'ADESAO' : 'NOMEACAO';
  const phase: 'INSCRICAO' | 'APROVACAO' = user.member_code ? 'APROVACAO' : 'INSCRICAO';

  const templates = buildActivationNotificationTemplates({
    fullName: user.full_name,
    memberCode: user.member_code,
    activationUrl,
    kind,
    phase,
    trackingNumber,
    roleName: user.role_name,
    roleScope: user.role_scope,
    provinceName: user.province_name,
  });

  const htmlBody = buildInstitutionalActivationEmailHtml({
    fullName: user.full_name,
    memberCode: user.member_code,
    activationUrl,
    kind,
    phase,
    trackingNumber,
    roleName: user.role_name,
    roleScope: user.role_scope,
    provinceName: user.province_name,
  });

  createNotification(db, {
    userId: user.id,
    category: kind,
    title: templates.emailSubject,
    message: templates.emailBody,
    linkUrl: `/ativar?token=${rawToken}`,
    channel: 'EMAIL',
  });

  const emailDelivery = await sendAndLogEmail(db, {
    recipientName: user.full_name,
    recipientEmail: user.email,
    subject: templates.emailSubject,
    textBody: templates.emailBody,
    htmlBody,
    category: 'REENVIO_ATIVACAO',
    relatedEntity: trackingNumber ? 'application' : 'user',
    relatedId: trackingNumber || String(user.id),
  });

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'REENVIO_LINK_ATIVACAO_PROPRIO',
    entityType: 'user',
    entityId: user.id,
    details: {
      trackingNumber,
      emailStatus: emailDelivery.status,
      emailProvider: emailDelivery.provider,
      emailLogId: emailDelivery.logId,
    },
    ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
  });

  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id) as Record<string, unknown> | undefined;
  if (updatedUser) {
    void syncSingleEntityToSupabase('users', [updatedUser], 'id');
  }

  return NextResponse.json({
    success: emailDelivery.status !== 'FALHA_ENVIO',
    code: emailDelivery.status === 'ENVIADO_GATEWAY' ? 'RESENT_GATEWAY' : emailDelivery.status === 'ENFILEIRADO_LOCAL' ? 'RESENT_LOCAL' : 'RESENT_FAILED',
    message:
      emailDelivery.status === 'ENVIADO_GATEWAY'
        ? `Novo e-mail com o botão «ATIVAR MINHA CONTA» enviado para ${emailDelivery.emailMasked}.`
        : emailDelivery.status === 'ENFILEIRADO_LOCAL'
          ? `Novo link de ativação gerado para ${emailDelivery.emailMasked}, mas o servidor de e-mail externo (SMTP/API) ainda não está configurado no ambiente.`
          : emailDelivery.errorMessage || 'Falha ao enviar o e-mail de ativação.',
    emailDelivery: {
      logId: emailDelivery.logId,
      status: emailDelivery.status,
      provider: emailDelivery.provider,
      emailMasked: emailDelivery.emailMasked,
      sentAt: emailDelivery.sentAt,
      errorMessage: emailDelivery.errorMessage,
      gatewayConfigured: hasExternalEmailGatewayConfigured(),
    },
  });
}
