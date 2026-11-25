import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isCentralDirectorate } from '@/lib/domain';

export async function GET() {
  const { user, errorResponse } = await requireAuth('ACCESS_LEGAL_OFFICE');
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isCentral = isCentralDirectorate(user.role_code);
  let sql = `
    SELECT l.*, p.name as province_name, u.full_name as author_name
    FROM legal_office_items l
    LEFT JOIN provinces p ON p.id = l.province_id
    LEFT JOIN users u ON u.id = l.created_by
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isCentral) {
    sql += ` AND (l.confidentiality IN ('PUBLICO', 'PROVINCIAL') AND (l.province_id IS NULL OR l.province_id = ?))`;
    params.push(user.province_id || -1);
  }

  const items = db.prepare(sql + ` ORDER BY l.created_at DESC`).all(...params);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('ACCESS_LEGAL_OFFICE');
  if (errorResponse || !user) return errorResponse!;

  const { item_type, title, summary, content, confidentiality, submitted_to_central, file_path } = await req.json();
  if (!item_type || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Tipo, título e conteúdo jurídico são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const year = new Date().getFullYear();
  const seq = getNextSequence(db, `GJ_${year}`);
  const refCode = `GJ-${year}-${String(seq).padStart(4, '0')}`;

  const res = db.prepare(`
    INSERT INTO legal_office_items (
      item_type, reference_code, title, summary, content, confidentiality,
      submitted_to_central, province_id, status, file_path, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EM_ANALISE', ?, ?)
  `).run(
    item_type,
    refCode,
    title.trim(),
    summary?.trim() || title.trim(),
    content.trim(),
    confidentiality || (isCentralDirectorate(user.role_code) ? 'DIRECAO_CENTRAL' : 'PROVINCIAL'),
    submitted_to_central ? 1 : 0,
    isCentralDirectorate(user.role_code) ? null : user.province_id,
    file_path || null,
    user.id
  );

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'GABINETE_JURIDICO_REGISTO',
    entityType: 'legal_office_item',
    entityId: Number(res.lastInsertRowid),
    details: { refCode, item_type, confidentiality },
  });

  return NextResponse.json({ success: true, id: Number(res.lastInsertRowid), reference_code: refCode });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('ACCESS_LEGAL_OFFICE');
  if (errorResponse || !user) return errorResponse!;

  const { id, status, submitted_to_central } = await req.json();
  const db = getDb();
  db.prepare(`
    UPDATE legal_office_items
    SET status = COALESCE(?, status),
        submitted_to_central = COALESCE(?, submitted_to_central)
    WHERE id = ?
  `).run(status || null, submitted_to_central !== undefined ? (submitted_to_central ? 1 : 0) : null, Number(id));

  return NextResponse.json({ success: true });
}
