import type Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import type { RoleScope } from './domain';
import { syncSingleEntityToSupabase } from './supabase';

export type EmailProvider = 'SMTP' | 'RESEND' | 'SENDGRID' | 'WEBHOOK_HTTP' | 'SGAJJ_EMAIL_OUTBOX_LOCAL';
export type EmailStatus = 'PENDENTE' | 'ENVIADO_GATEWAY' | 'ENFILEIRADO_LOCAL' | 'FALHA_ENVIO';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidEmailAddress(email: string): boolean {
  const clean = (email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function maskEmailAddress(email: string): string {
  const clean = (email || '').trim();
  const at = clean.indexOf('@');
  if (at <= 1) return clean;
  const local = clean.slice(0, at);
  const domain = clean.slice(at);
  return `${local.slice(0, 2)}***${domain}`;
}

export function resolvePublicBaseUrl(req?: { headers: Headers; nextUrl?: URL }): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes('MY_APP_URL')) {
    return envUrl;
  }
  if (req) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host')?.trim();
    if (host) {
      return `${proto || (host.includes('localhost') ? 'http' : 'https')}://${host}`.replace(/\/$/, '');
    }
    if (req.nextUrl?.origin && req.nextUrl.origin !== 'null') {
      return req.nextUrl.origin.replace(/\/$/, '');
    }
  }
  return '';
}

export function getConfiguredEmailProvider(): EmailProvider {
  if (process.env.SMTP_HOST?.trim()) {
    return 'SMTP';
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return 'RESEND';
  }
  if (process.env.SENDGRID_API_KEY?.trim()) {
    return 'SENDGRID';
  }
  if (process.env.EMAIL_WEBHOOK_URL?.trim()) {
    return 'WEBHOOK_HTTP';
  }
  return 'SGAJJ_EMAIL_OUTBOX_LOCAL';
}

export function hasExternalEmailGatewayConfigured(): boolean {
  return getConfiguredEmailProvider() !== 'SGAJJ_EMAIL_OUTBOX_LOCAL';
}

export interface EmailGatewayDiagnostics {
  provider: EmailProvider;
  gatewayConfigured: boolean;
  fromEmail: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpAuthConfigured: boolean;
}

export function getEmailGatewayDiagnostics(): EmailGatewayDiagnostics {
  const provider = getConfiguredEmailProvider();
  const fromEmail = (process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@ajj-angola.org').trim();
  const smtpHost = process.env.SMTP_HOST?.trim() || null;
  const smtpPort = smtpHost ? Number(process.env.SMTP_PORT?.trim() || '587') || 587 : null;
  const smtpAuthConfigured = Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
  return {
    provider,
    gatewayConfigured: provider !== 'SGAJJ_EMAIL_OUTBOX_LOCAL',
    fromEmail,
    smtpHost,
    smtpPort,
    smtpAuthConfigured,
  };
}

export function buildInstitutionalTestEmailHtml(params: {
  recipientName: string;
  provider: EmailProvider;
  fromEmail: string;
  sentAtIso: string;
}): string {
  const safeName = escapeHtml(params.recipientName.trim() || 'Administrador SGAJJ');
  const safeProvider = escapeHtml(params.provider);
  const safeFrom = escapeHtml(params.fromEmail);
  const safeDate = escapeHtml(params.sentAtIso);

  return `<!DOCTYPE html>
<html lang="pt-AO">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8f9fb;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:#0b1f3a;padding:22px 28px;border-bottom:3px solid #a6863a;">
        <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#d6b76b;font-weight:700;">Associação de Jovens Juristas · Angola</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;">Teste de Integração de E-mail do SGAJJ</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 14px;font-size:14px;color:#0b1f3a;">Prezado(a) <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">Esta mensagem confirma que o envio automático de e-mails institucionais do <strong>Sistema de Gestão Nacional da Associação de Jovens Juristas (SGAJJ)</strong> foi testado com êxito.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Provedor Ativo</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeProvider}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Remetente Configurado</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeFrom}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Data/Hora UTC</td><td style="padding:6px 0;color:#64748b;font-size:12px;font-family:monospace;text-align:right;">${safeDate}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildInstitutionalActivationEmailHtml(params: {
  fullName: string;
  activationUrl: string;
  kind: 'ADESAO' | 'NOMEACAO';
  phase?: 'INSCRICAO' | 'APROVACAO';
  trackingNumber?: string | null;
  roleName?: string;
  roleScope?: RoleScope;
  provinceName?: string | null;
  memberCode?: string | null;
  dispatchNumber?: string | null;
}): string {
  const safeName = escapeHtml(params.fullName.trim());
  const safeUrl = escapeHtml(params.activationUrl.trim());
  const isNational = params.roleScope === 'NATIONAL' || !params.provinceName;
  const safeRole = escapeHtml(
    params.roleName || (isNational ? 'Diretor da Direção Central' : 'Coordenador Provincial')
  );
  const safeProvince = params.provinceName ? escapeHtml(params.provinceName.trim()) : '';
  const safeCode =
    params.memberCode && params.memberCode !== 'CONTA-INSTITUCIONAL' ? escapeHtml(params.memberCode.trim()) : '';
  const safeDispatch = params.dispatchNumber ? escapeHtml(params.dispatchNumber.trim()) : '';
  const safeTracking = params.trackingNumber ? escapeHtml(params.trackingNumber.trim()) : '';

  const introParagraph =
    params.kind === 'NOMEACAO'
      ? isNational
        ? `A sua nomeação para o cargo de <strong>${safeRole}</strong> na <strong>Direção Central da Associação de Jovens Juristas (AJJ)</strong> foi oficializada na plataforma SGAJJ. Para concluir o seu primeiro acesso, ative a sua conta e crie a sua palavra-passe individual.`
        : `A sua nomeação para o cargo de <strong>${safeRole}</strong> na província de <strong>${safeProvince}</strong> foi oficializada na plataforma SGAJJ. Para concluir o seu primeiro acesso, ative a sua conta e crie a sua palavra-passe individual.`
      : params.phase === 'INSCRICAO'
        ? `Recebemos a sua inscrição no <strong>Sistema de Gestão Nacional da Associação de Jovens Juristas (SGAJJ)</strong>${safeProvince ? ` (${safeProvince})` : ''}. Para ter acesso ao sistema, é necessário ativar a sua conta e definir a sua palavra-passe individual através do botão abaixo.`
        : 'A sua inscrição e adesão institucional foram aprovadas na plataforma nacional da <strong>Associação de Jovens Juristas (AJJ)</strong>. Caso ainda não tenha ativado a sua conta, utilize o botão abaixo para definir a sua palavra-passe individual.';

  const metadataRows = [
    params.kind === 'NOMEACAO'
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Cargo Estatutário</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;text-align:right;">${safeRole}${safeProvince ? ` · ${safeProvince}` : ' · Direção Central'}</td></tr>`
      : '',
    safeTracking
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:12px;">N.º de Inscrição</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeTracking}</td></tr>`
      : '',
    safeDispatch
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Despacho Oficial</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeDispatch}</td></tr>`
      : '',
    safeCode
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Código Permanente</td><td style="padding:6px 0;color:#a6863a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeCode}</td></tr>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-AO">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8f9fb;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:#0b1f3a;padding:22px 28px;border-bottom:3px solid #a6863a;">
        <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#d6b76b;font-weight:700;">Associação de Jovens Juristas · Angola</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;">Ativação Segura de Conta no SGAJJ</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 14px;font-size:14px;color:#0b1f3a;">Prezado(a) <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">${introParagraph}</p>
        ${
          metadataRows
            ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">${metadataRows}</table>`
            : ''
        }
        <p style="margin:0 0 20px;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background:#0b1f3a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.6px;padding:13px 26px;border-radius:8px;border:1px solid #a6863a;">ATIVAR MINHA CONTA</a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;">Caso o botão não funcione, copie e cole a ligação exclusiva abaixo no navegador (válida por 48 horas · utilização única):</p>
        <p style="margin:0 0 18px;padding:10px 12px;background:#f1f5f9;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all;color:#0b1f3a;">${safeUrl}</p>
        <p style="margin:0;font-size:11px;line-height:1.5;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px;">
          Por segurança e em conformidade com a Lei n.º 22/11 (Lei da Proteção de Dados Pessoais de Angola), nenhuma palavra-passe é transmitida em texto simples por e-mail ou SMS.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildInstitutionalApprovedNoticeHtml(params: {
  fullName: string;
  memberCode: string;
  trackingNumber: string;
  provinceName?: string | null;
  loginUrl: string;
}): string {
  const safeName = escapeHtml(params.fullName.trim());
  const safeCode = escapeHtml(params.memberCode.trim());
  const safeTracking = escapeHtml(params.trackingNumber.trim());
  const safeProvince = params.provinceName ? escapeHtml(params.provinceName.trim()) : '';
  const safeLoginUrl = escapeHtml(params.loginUrl.trim());

  return `<!DOCTYPE html>
<html lang="pt-AO">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8f9fb;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:#0b1f3a;padding:22px 28px;border-bottom:3px solid #a6863a;">
        <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#d6b76b;font-weight:700;">Associação de Jovens Juristas · Angola</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;">Adesão Oficialmente Aprovada</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 14px;font-size:14px;color:#0b1f3a;">Prezado(a) <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">A sua candidatura à <strong>Associação de Jovens Juristas (AJJ)</strong>${safeProvince ? ` (${safeProvince})` : ''} foi aprovada estatutariamente. A sua conta já se encontra ativa e o seu código permanente de associado e cartão digital foram emitidos.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">N.º de Inscrição</td><td style="padding:6px 0;color:#0b1f3a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeTracking}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Código Permanente</td><td style="padding:6px 0;color:#a6863a;font-size:12px;font-weight:700;font-family:monospace;text-align:right;">${safeCode}</td></tr>
        </table>
        <p style="margin:0 0 20px;text-align:center;">
          <a href="${safeLoginUrl}" style="display:inline-block;background:#0b1f3a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;border-radius:8px;">ACEDER AO PORTAL SGAJJ</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface EmailTransportResult {
  provider: EmailProvider;
  status: EmailStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
}

export async function dispatchEmailViaGateway(
  params: {
    toEmail: string;
    toName: string;
    subject: string;
    textBody: string;
    htmlBody: string;
    category: string;
    relatedEntity?: string | null;
    relatedId?: string | null;
  },
  fetchImpl: typeof fetch = fetch
): Promise<EmailTransportResult> {
  const provider = getConfiguredEmailProvider();
  const fromEmail = (process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@ajj-angola.org').trim();
  const fromName = (process.env.EMAIL_FROM_NAME || 'SGAJJ — Associação de Jovens Juristas').trim();

  if (provider === 'SMTP') {
    try {
      const host = process.env.SMTP_HOST!.trim();
      const port = Number(process.env.SMTP_PORT?.trim() || '587') || 587;
      const secure =
        process.env.SMTP_SECURE?.trim().toLowerCase() === 'true' || port === 465;
      const user = process.env.SMTP_USER?.trim();
      const pass = process.env.SMTP_PASS?.trim();
      const rejectUnauthorized =
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== 'false';

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(user && pass ? { auth: { user, pass } } : {}),
        tls: { rejectUnauthorized },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      });

      const info = await transporter.sendMail({
        from: `"${fromName.replace(/"/g, '')}" <${fromEmail}>`,
        to: params.toName ? `"${params.toName.replace(/"/g, '')}" <${params.toEmail}>` : params.toEmail,
        subject: params.subject,
        text: params.textBody,
        html: params.htmlBody || undefined,
      });

      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: info.messageId || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao servidor SMTP.',
      };
    }
  }

  if (provider === 'RESEND') {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [params.toEmail],
          subject: params.subject,
          text: params.textBody,
          html: params.htmlBody || undefined,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return {
          provider,
          status: 'FALHA_ENVIO',
          providerMessageId: null,
          errorMessage: json.message || `Erro Resend HTTP ${res.status}`,
        };
      }
      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: json.id || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao gateway Resend.',
      };
    }
  }

  if (provider === 'SENDGRID') {
    try {
      const res = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: params.toEmail, name: params.toName }] }],
          from: { email: fromEmail, name: fromName },
          subject: params.subject,
          content: [
            { type: 'text/plain', value: params.textBody },
            ...(params.htmlBody ? [{ type: 'text/html', value: params.htmlBody }] : []),
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          provider,
          status: 'FALHA_ENVIO',
          providerMessageId: null,
          errorMessage: errText.slice(0, 220) || `Erro SendGrid HTTP ${res.status}`,
        };
      }
      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: res.headers.get('x-message-id') || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao gateway SendGrid.',
      };
    }
  }

  if (provider === 'WEBHOOK_HTTP') {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.EMAIL_API_KEY?.trim()) {
        headers.Authorization = `Bearer ${process.env.EMAIL_API_KEY.trim()}`;
      }
      const res = await fetchImpl(process.env.EMAIL_WEBHOOK_URL!.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: fromEmail,
          fromName,
          to: params.toEmail,
          toName: params.toName,
          subject: params.subject,
          text: params.textBody,
          html: params.htmlBody,
          category: params.category,
          relatedEntity: params.relatedEntity || null,
          relatedId: params.relatedId || null,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string; error?: string };
      if (!res.ok) {
        return {
          provider,
          status: 'FALHA_ENVIO',
          providerMessageId: null,
          errorMessage: json.error || `Erro Webhook E-mail HTTP ${res.status}`,
        };
      }
      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: json.id || json.messageId || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao webhook de e-mail.',
      };
    }
  }

  return {
    provider: 'SGAJJ_EMAIL_OUTBOX_LOCAL',
    status: 'ENFILEIRADO_LOCAL',
    providerMessageId: `EMAIL-LOCAL-${Date.now().toString(36).toUpperCase()}`,
    errorMessage: null,
  };
}

export interface SendAndLogEmailResult {
  logId: number;
  status: EmailStatus;
  provider: EmailProvider;
  recipientEmail: string;
  emailMasked: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  subject: string;
  sentAt: string | null;
}

export async function sendAndLogEmail(
  db: Database.Database,
  params: {
    recipientName: string;
    recipientEmail: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
    category: string;
    relatedEntity?: string | null;
    relatedId?: string | null;
    fetchImpl?: typeof fetch;
  }
): Promise<SendAndLogEmailResult> {
  const cleanEmail = (params.recipientEmail || '').trim().toLowerCase();
  const cleanName = params.recipientName.trim() || 'Destinatário AJJ';
  const masked = maskEmailAddress(cleanEmail);
  const providerInitial = getConfiguredEmailProvider();

  const insertRes = db
    .prepare(
      `
      INSERT INTO email_logs (
        recipient_name, recipient_email, subject, text_body, html_body, category,
        related_entity, related_id, provider, status, attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 1)
    `
    )
    .run(
      cleanName,
      cleanEmail,
      params.subject,
      params.textBody,
      params.htmlBody || '',
      params.category,
      params.relatedEntity || null,
      params.relatedId || null,
      providerInitial
    );

  const logId = Number(insertRes.lastInsertRowid);

  if (!isValidEmailAddress(cleanEmail)) {
    const errMsg = 'Endereço de e-mail inválido para envio.';
    db.prepare(`UPDATE email_logs SET status = 'FALHA_ENVIO', error_message = ? WHERE id = ?`).run(errMsg, logId);
    return {
      logId,
      status: 'FALHA_ENVIO',
      provider: providerInitial,
      recipientEmail: cleanEmail,
      emailMasked: masked,
      providerMessageId: null,
      errorMessage: errMsg,
      subject: params.subject,
      sentAt: null,
    };
  }

  const transport = await dispatchEmailViaGateway(
    {
      toEmail: cleanEmail,
      toName: cleanName,
      subject: params.subject,
      textBody: params.textBody,
      htmlBody: params.htmlBody || '',
      category: params.category,
      relatedEntity: params.relatedEntity,
      relatedId: params.relatedId,
    },
    params.fetchImpl
  );

  const sentAt = transport.status === 'FALHA_ENVIO' ? null : new Date().toISOString();

  db.prepare(
    `
    UPDATE email_logs
    SET provider = ?, status = ?, provider_message_id = ?, error_message = ?,
        sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `
  ).run(transport.provider, transport.status, transport.providerMessageId, transport.errorMessage, sentAt, logId);

  const row = db.prepare(`SELECT * FROM email_logs WHERE id = ?`).get(logId) as Record<string, unknown> | undefined;
  if (row) {
    void syncSingleEntityToSupabase('email_logs', [row], 'id');
  }

  return {
    logId,
    status: transport.status,
    provider: transport.provider,
    recipientEmail: cleanEmail,
    emailMasked: masked,
    providerMessageId: transport.providerMessageId,
    errorMessage: transport.errorMessage,
    subject: params.subject,
    sentAt,
  };
}

export async function resendEmailLog(
  db: Database.Database,
  logId: number,
  fetchImpl: typeof fetch = fetch
): Promise<SendAndLogEmailResult | null> {
  const row = db.prepare(`SELECT * FROM email_logs WHERE id = ?`).get(logId) as
    | {
        id: number;
        recipient_name: string;
        recipient_email: string;
        subject: string;
        text_body: string;
        html_body: string;
        category: string;
        related_entity: string | null;
        related_id: string | null;
      }
    | undefined;

  if (!row) return null;

  if (!isValidEmailAddress(row.recipient_email)) {
    const errMsg = 'Endereço de e-mail inválido para reenvio.';
    db.prepare(`UPDATE email_logs SET attempts = attempts + 1, status = 'FALHA_ENVIO', error_message = ? WHERE id = ?`).run(
      errMsg,
      row.id
    );
    return {
      logId: row.id,
      status: 'FALHA_ENVIO',
      provider: getConfiguredEmailProvider(),
      recipientEmail: row.recipient_email,
      emailMasked: maskEmailAddress(row.recipient_email),
      providerMessageId: null,
      errorMessage: errMsg,
      subject: row.subject,
      sentAt: null,
    };
  }

  const transport = await dispatchEmailViaGateway(
    {
      toEmail: row.recipient_email,
      toName: row.recipient_name,
      subject: row.subject,
      textBody: row.text_body,
      htmlBody: row.html_body,
      category: row.category,
      relatedEntity: row.related_entity,
      relatedId: row.related_id,
    },
    fetchImpl
  );

  const sentAt = transport.status === 'FALHA_ENVIO' ? null : new Date().toISOString();

  db.prepare(
    `
    UPDATE email_logs
    SET provider = ?, status = ?, provider_message_id = ?, error_message = ?,
        attempts = attempts + 1, sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `
  ).run(transport.provider, transport.status, transport.providerMessageId, transport.errorMessage, sentAt, row.id);

  const updatedRow = db.prepare(`SELECT * FROM email_logs WHERE id = ?`).get(row.id) as Record<string, unknown> | undefined;
  if (updatedRow) {
    void syncSingleEntityToSupabase('email_logs', [updatedRow], 'id');
  }

  return {
    logId: row.id,
    status: transport.status,
    provider: transport.provider,
    recipientEmail: row.recipient_email,
    emailMasked: maskEmailAddress(row.recipient_email),
    providerMessageId: transport.providerMessageId,
    errorMessage: transport.errorMessage,
    subject: row.subject,
    sentAt,
  };
}
