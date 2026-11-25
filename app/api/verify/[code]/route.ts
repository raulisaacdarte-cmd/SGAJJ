import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const cleanCode = decodeURIComponent(code).trim();
  const db = getDb();

  // 1. Check Digital Cards by qr_token, member_code, or card_number
  const card = db.prepare(`
    SELECT dc.card_number, dc.member_code, dc.qr_token, dc.issued_at, dc.expires_at,
           dc.issuer_name, dc.status as card_status, dc.invalidated_reason,
           m.full_name, m.photo_path, m.status as member_status, m.joined_at,
           mc.name as category_name, p.name as province_name
    FROM digital_cards dc
    JOIN members m ON m.id = dc.member_id
    JOIN member_categories mc ON mc.id = m.category_id
    JOIN provinces p ON p.id = m.province_id
    WHERE dc.qr_token = ? OR UPPER(dc.member_code) = UPPER(?) OR UPPER(dc.card_number) = UPPER(?)
    ORDER BY dc.id DESC LIMIT 1
  `).get(cleanCode, cleanCode, cleanCode) as
    | {
        card_number: string;
        member_code: string;
        issued_at: string;
        expires_at: string;
        issuer_name: string;
        card_status: string;
        invalidated_reason: string | null;
        full_name: string;
        photo_path: string | null;
        member_status: string;
        joined_at: string;
        category_name: string;
        province_name: string;
      }
    | undefined;

  if (card) {
    const isExpired = new Date(card.expires_at).getTime() < Date.now();
    const valid = card.card_status === 'ATIVO' && card.member_status === 'ATIVO' && !isExpired;
    return NextResponse.json({
      type: 'MEMBER_CARD',
      valid,
      record: {
        full_name: card.full_name,
        photo_path: card.photo_path,
        member_code: card.member_code,
        card_number: card.card_number,
        category_name: card.category_name,
        province_name: card.province_name,
        member_status: card.member_status,
        card_status: isExpired && card.card_status === 'ATIVO' ? 'EXPIRADO' : card.card_status,
        issued_at: card.issued_at,
        expires_at: card.expires_at,
        issuer_name: card.issuer_name,
        invalidated_reason: card.invalidated_reason,
      },
    });
  }

  // 2. Check Activity Certificates by certificate_code
  const cert = db.prepare(`
    SELECT ar.certificate_code, ar.participant_name, ar.certificate_issued_at,
           a.title as activity_title, a.activity_type, a.start_datetime, a.location,
           p.name as province_name
    FROM activity_registrations ar
    JOIN activities a ON a.id = ar.activity_id
    LEFT JOIN provinces p ON p.id = a.province_id
    WHERE UPPER(ar.certificate_code) = UPPER(?)
  `).get(cleanCode);

  if (cert) {
    return NextResponse.json({
      type: 'CERTIFICATE',
      valid: true,
      record: cert,
    });
  }

  return NextResponse.json({ valid: false, error: 'Registo ou QR Code não encontrado na base oficial da AJJ.' }, { status: 404 });
}
