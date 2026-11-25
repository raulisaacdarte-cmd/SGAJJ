import type Database from 'better-sqlite3';
import { syncSingleEntityToSupabase } from './supabase';

export type SmsProvider = 'TWILIO' | 'AFRICAS_TALKING' | 'WEBHOOK_HTTP' | 'SGAJJ_OUTBOX_LOCAL';
export type SmsStatus = 'PENDENTE' | 'ENVIADO_GATEWAY' | 'ENFILEIRADO_LOCAL' | 'FALHA_ENVIO';

export interface NormalizedPhoneResult {
  ok: boolean;
  e164: string;
  masked: string;
  error?: string;
}

export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length <= 6) return cleaned;
  return `${cleaned.slice(0, 7)}***${cleaned.slice(-3)}`;
}

/**
 * Normalizes Angola (+244) and international numbers to strict E.164 format.
 * Accepts: +244 923 456 789, 244923456789, 00244923456789, 923456789, or valid international +E.164.
 */
export function normalizeAngolaPhoneE164(rawPhone: string): NormalizedPhoneResult {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) {
    return { ok: false, e164: '', masked: '', error: 'O número de telefone é obrigatório para o envio de SMS.' };
  }

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) {
    digits = `+${digits.slice(2)}`;
  }

  let e164 = '';
  if (digits.startsWith('+')) {
    const bodyDigits = digits.slice(1).replace(/\D/g, '');
    e164 = `+${bodyDigits}`;
  } else {
    const onlyDigits = digits.replace(/\D/g, '');
    if (onlyDigits.length === 9 && onlyDigits.startsWith('9')) {
      e164 = `+244${onlyDigits}`;
    } else if (onlyDigits.length === 12 && onlyDigits.startsWith('244')) {
      e164 = `+${onlyDigits}`;
    } else if (onlyDigits.length >= 8 && onlyDigits.length <= 15) {
      e164 = `+${onlyDigits}`;
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    return {
      ok: false,
      e164: '',
      masked: trimmed,
      error: 'Número de telemóvel inválido. Utilize o formato angolano (+244 9XX XXX XXX ou 9 dígitos).',
    };
  }

  if (e164.startsWith('+244') && e164.length !== 13) {
    return {
      ok: false,
      e164: '',
      masked: trimmed,
      error: 'Os números angolanos (+244) devem conter 9 dígitos após o indicativo.',
    };
  }

  return {
    ok: true,
    e164,
    masked: maskPhoneNumber(e164),
  };
}

export function buildCandidateRegistrationSmsMessage(params: {
  fullName: string;
  trackingNumber: string;
  provinceName?: string;
  categoryName?: string;
}): string {
  const firstName = params.fullName.trim().split(/\s+/)[0] || 'Candidato(a)';
  const scope = [params.provinceName, params.categoryName].filter(Boolean).join(' · ');
  const scopePart = scope ? ` (${scope})` : '';
  return `AJJ Angola: Ola ${firstName}, a sua inscricao como candidato foi concluida com sucesso${scopePart}. Processo: ${params.trackingNumber}. Acompanhe o estado no portal da AJJ.`;
}

export function buildCandidateStatusSmsMessage(params: {
  fullName: string;
  trackingNumber: string;
  status: string;
  memberCode?: string | null;
}): string {
  const firstName = params.fullName.trim().split(/\s+/)[0] || 'Candidato(a)';
  if (params.status === 'APROVADA' && params.memberCode) {
    return `AJJ Angola: Parabens ${firstName}, a sua candidatura (${params.trackingNumber}) foi aprovada. Codigo permanente: ${params.memberCode}. Consulte o seu e-mail para ativar a conta.`;
  }
  if (params.status === 'AGUARDA_DOCUMENTACAO') {
    return `AJJ Angola: ${firstName}, o processo ${params.trackingNumber} necessita de documentacao complementar. Consulte o portal de adesao para detalhes.`;
  }
  if (params.status === 'REJEITADA') {
    return `AJJ Angola: ${firstName}, o processo de candidatura ${params.trackingNumber} foi indeferido apos avaliacao estatutaria.`;
  }
  return `AJJ Angola: ${firstName}, o estado da sua candidatura ${params.trackingNumber} foi atualizado para ${params.status}.`;
}

export function getConfiguredSmsProvider(): SmsProvider {
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    return 'TWILIO';
  }
  if (process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME) {
    return 'AFRICAS_TALKING';
  }
  if (process.env.SMS_WEBHOOK_URL) {
    return 'WEBHOOK_HTTP';
  }
  return 'SGAJJ_OUTBOX_LOCAL';
}

export interface SmsTransportResult {
  provider: SmsProvider;
  status: SmsStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
}

export async function dispatchSmsViaGateway(
  params: {
    toE164: string;
    message: string;
    category: string;
    relatedEntity?: string | null;
    relatedId?: string | null;
  },
  fetchImpl: typeof fetch = fetch
): Promise<SmsTransportResult> {
  const provider = getConfiguredSmsProvider();
  const senderId = process.env.SMS_SENDER_ID || 'AJJ Angola';

  if (provider === 'TWILIO') {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM_NUMBER!;
    try {
      const form = new URLSearchParams({
        To: params.toE164,
        From: from,
        Body: params.message,
      });
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) {
        return {
          provider,
          status: 'FALHA_ENVIO',
          providerMessageId: null,
          errorMessage: json.message || `Erro Twilio HTTP ${res.status}`,
        };
      }
      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: json.sid || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao gateway Twilio.',
      };
    }
  }

  if (provider === 'AFRICAS_TALKING') {
    const apiKey = process.env.AFRICASTALKING_API_KEY!;
    const username = process.env.AFRICASTALKING_USERNAME!;
    const isSandbox = username === 'sandbox';
    const endpoint = isSandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';
    try {
      const form = new URLSearchParams({
        username,
        to: params.toE164,
        message: params.message,
      });
      if (process.env.SMS_SENDER_ID) {
        form.set('from', senderId);
      }
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        SMSMessageData?: { Recipients?: Array<{ messageId?: string; status?: string }> };
      };
      const firstRecipient = json.SMSMessageData?.Recipients?.[0];
      if (!res.ok) {
        return {
          provider,
          status: 'FALHA_ENVIO',
          providerMessageId: null,
          errorMessage: `Erro Africa's Talking HTTP ${res.status}`,
        };
      }
      return {
        provider,
        status: 'ENVIADO_GATEWAY',
        providerMessageId: firstRecipient?.messageId || null,
        errorMessage: null,
      };
    } catch (err) {
      return {
        provider,
        status: 'FALHA_ENVIO',
        providerMessageId: null,
        errorMessage: err instanceof Error ? err.message : "Falha na ligação ao gateway Africa's Talking.",
      };
    }
  }

  if (provider === 'WEBHOOK_HTTP') {
    const webhookUrl = process.env.SMS_WEBHOOK_URL!;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (process.env.SMS_API_KEY) {
        headers.Authorization = `Bearer ${process.env.SMS_API_KEY}`;
      }
      const res = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: params.toE164,
          senderId,
          message: params.message,
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
          errorMessage: json.error || `Erro Webhook SMS HTTP ${res.status}`,
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
        errorMessage: err instanceof Error ? err.message : 'Falha na ligação ao webhook de SMS.',
      };
    }
  }

  // Local SGAJJ Outbox fallback when no external carrier credentials are configured yet
  return {
    provider: 'SGAJJ_OUTBOX_LOCAL',
    status: 'ENFILEIRADO_LOCAL',
    providerMessageId: `LOCAL-${Date.now().toString(36).toUpperCase()}`,
    errorMessage: null,
  };
}

export interface SendAndLogSmsResult {
  logId: number;
  status: SmsStatus;
  provider: SmsProvider;
  phoneE164: string;
  phoneMasked: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  message: string;
  sentAt: string | null;
}

export async function sendAndLogSms(
  db: Database.Database,
  params: {
    recipientName: string;
    recipientPhone: string;
    message: string;
    category: string;
    relatedEntity?: string | null;
    relatedId?: string | null;
    fetchImpl?: typeof fetch;
  }
): Promise<SendAndLogSmsResult> {
  const normalized = normalizeAngolaPhoneE164(params.recipientPhone);
  const toE164 = normalized.ok ? normalized.e164 : params.recipientPhone.trim();
  const masked = normalized.ok ? normalized.masked : maskPhoneNumber(params.recipientPhone);

  const insertRes = db
    .prepare(
      `
      INSERT INTO sms_logs (
        recipient_name, recipient_phone, phone_e164, message, category,
        related_entity, related_id, provider, status, attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 1)
    `
    )
    .run(
      params.recipientName.trim() || 'Destinatário',
      params.recipientPhone.trim(),
      toE164,
      params.message,
      params.category,
      params.relatedEntity || null,
      params.relatedId || null,
      getConfiguredSmsProvider()
    );

  const logId = Number(insertRes.lastInsertRowid);

  if (!normalized.ok) {
    db.prepare(
      `
      UPDATE sms_logs
      SET status = 'FALHA_ENVIO', error_message = ?
      WHERE id = ?
    `
    ).run(normalized.error || 'Número inválido.', logId);

    return {
      logId,
      status: 'FALHA_ENVIO',
      provider: getConfiguredSmsProvider(),
      phoneE164: toE164,
      phoneMasked: masked,
      providerMessageId: null,
      errorMessage: normalized.error || 'Número inválido.',
      message: params.message,
      sentAt: null,
    };
  }

  const transport = await dispatchSmsViaGateway(
    {
      toE164,
      message: params.message,
      category: params.category,
      relatedEntity: params.relatedEntity,
      relatedId: params.relatedId,
    },
    params.fetchImpl
  );

  const sentAt = transport.status === 'FALHA_ENVIO' ? null : new Date().toISOString();

  db.prepare(
    `
    UPDATE sms_logs
    SET provider = ?, status = ?, provider_message_id = ?, error_message = ?,
        sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `
  ).run(
    transport.provider,
    transport.status,
    transport.providerMessageId,
    transport.errorMessage,
    sentAt,
    logId
  );

  const smsRow = db.prepare(`SELECT * FROM sms_logs WHERE id = ?`).get(logId) as Record<string, unknown> | undefined;
  if (smsRow) {
    void syncSingleEntityToSupabase('sms_logs', [smsRow], 'id');
  }

  return {
    logId,
    status: transport.status,
    provider: transport.provider,
    phoneE164: toE164,
    phoneMasked: masked,
    providerMessageId: transport.providerMessageId,
    errorMessage: transport.errorMessage,
    message: params.message,
    sentAt,
  };
}

export async function resendSmsLog(
  db: Database.Database,
  logId: number,
  fetchImpl: typeof fetch = fetch
): Promise<SendAndLogSmsResult | null> {
  const row = db
    .prepare(`SELECT * FROM sms_logs WHERE id = ?`)
    .get(logId) as
    | {
        id: number;
        recipient_name: string;
        recipient_phone: string;
        phone_e164: string;
        message: string;
        category: string;
        related_entity: string | null;
        related_id: string | null;
        attempts: number;
      }
    | undefined;

  if (!row) return null;

  const normalized = normalizeAngolaPhoneE164(row.phone_e164 || row.recipient_phone);
  if (!normalized.ok) {
    db.prepare(`UPDATE sms_logs SET attempts = attempts + 1, status = 'FALHA_ENVIO', error_message = ? WHERE id = ?`).run(
      normalized.error || 'Número inválido.',
      row.id
    );
    return {
      logId: row.id,
      status: 'FALHA_ENVIO',
      provider: getConfiguredSmsProvider(),
      phoneE164: row.phone_e164 || row.recipient_phone,
      phoneMasked: maskPhoneNumber(row.recipient_phone),
      providerMessageId: null,
      errorMessage: normalized.error || 'Número inválido.',
      message: row.message,
      sentAt: null,
    };
  }

  const transport = await dispatchSmsViaGateway(
    {
      toE164: normalized.e164,
      message: row.message,
      category: row.category,
      relatedEntity: row.related_entity,
      relatedId: row.related_id,
    },
    fetchImpl
  );

  const sentAt = transport.status === 'FALHA_ENVIO' ? null : new Date().toISOString();

  db.prepare(
    `
    UPDATE sms_logs
    SET provider = ?, status = ?, provider_message_id = ?, error_message = ?,
        attempts = attempts + 1, sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `
  ).run(
    transport.provider,
    transport.status,
    transport.providerMessageId,
    transport.errorMessage,
    sentAt,
    row.id
  );

  const updatedSmsRow = db.prepare(`SELECT * FROM sms_logs WHERE id = ?`).get(row.id) as Record<string, unknown> | undefined;
  if (updatedSmsRow) {
    void syncSingleEntityToSupabase('sms_logs', [updatedSmsRow], 'id');
  }

  return {
    logId: row.id,
    status: transport.status,
    provider: transport.provider,
    phoneE164: normalized.e164,
    phoneMasked: normalized.masked,
    providerMessageId: transport.providerMessageId,
    errorMessage: transport.errorMessage,
    message: row.message,
    sentAt,
  };
}
