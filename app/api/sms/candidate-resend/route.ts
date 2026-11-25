import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { normalizeAngolaPhoneE164, resendSmsLog, sendAndLogSms, buildCandidateRegistrationSmsMessage } from '@/lib/sms';

export async function POST(req: NextRequest) {
  const { tracking_number, phone } = await req.json();
  if (!tracking_number?.trim() || !phone?.trim()) {
    return NextResponse.json(
      { error: 'Indique o número de candidatura e o contacto telefónico registado.' },
      { status: 400 }
    );
  }

  const normalized = normalizeAngolaPhoneE164(phone);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const db = getDb();
  const app = db
    .prepare(
      `
      SELECT a.id, a.tracking_number, a.full_name, a.phone, p.name as province_name, c.name as category_name
      FROM applications a
      JOIN provinces p ON p.id = a.province_id
      JOIN member_categories c ON c.id = a.category_id
      WHERE UPPER(a.tracking_number) = UPPER(?)
    `
    )
    .get(tracking_number.trim()) as
    | {
        id: number;
        tracking_number: string;
        full_name: string;
        phone: string;
        province_name: string;
        category_name: string;
      }
    | undefined;

  if (!app) {
    return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 });
  }

  const storedNormalized = normalizeAngolaPhoneE164(app.phone);
  if (storedNormalized.e164 !== normalized.e164) {
    return NextResponse.json(
      { error: 'O número de telefone não corresponde ao processo indicado.' },
      { status: 403 }
    );
  }

  const existingLog = db
    .prepare(
      `
      SELECT id, attempts FROM sms_logs
      WHERE related_entity = 'application' AND related_id = ?
      ORDER BY id DESC LIMIT 1
    `
    )
    .get(app.tracking_number) as { id: number; attempts: number } | undefined;

  if (existingLog && existingLog.attempts >= 3) {
    return NextResponse.json(
      { error: 'Limite máximo de reenvios de SMS atingido para esta candidatura (3 tentativas).' },
      { status: 429 }
    );
  }

  const smsDelivery = existingLog
    ? await resendSmsLog(db, existingLog.id)
    : await sendAndLogSms(db, {
        recipientName: app.full_name,
        recipientPhone: normalized.e164,
        message: buildCandidateRegistrationSmsMessage({
          fullName: app.full_name,
          trackingNumber: app.tracking_number,
          provinceName: app.province_name,
          categoryName: app.category_name,
        }),
        category: 'CANDIDATURA_SUBMETIDA',
        relatedEntity: 'application',
        relatedId: app.tracking_number,
      });

  if (smsDelivery) {
    writeAuditLog(db, {
      userName: app.full_name,
      roleCode: 'CANDIDATO',
      action: 'REENVIO_SMS_CANDIDATURA',
      entityType: 'application',
      entityId: app.id,
      details: { trackingNumber: app.tracking_number, status: smsDelivery.status, logId: smsDelivery.logId },
    });
  }

  return NextResponse.json({ success: true, smsDelivery });
}
