import { NextRequest, NextResponse } from 'next/server';
import { getDb, getNextSequence, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateCaseNumber, isCentralDirectorate } from '@/lib/domain';

export async function GET() {
  const { user, errorResponse } = await requireAuth('ACCESS_ETHICS');
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const isCentral = isCentralDirectorate(user.role_code);
  let sql = `
    SELECT ec.*, p.name as province_name, u.full_name as created_by_name
    FROM ethics_cases ec
    LEFT JOIN provinces p ON p.id = ec.province_id
    LEFT JOIN users u ON u.id = ec.created_by
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (!isCentral) {
    sql += ` AND ec.province_id = ?`;
    params.push(user.province_id || -1);
  }
  const cases = db.prepare(sql + ` ORDER BY ec.updated_at DESC`).all(...params);
  return NextResponse.json({ cases });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('ACCESS_ETHICS');
  if (errorResponse || !user) return errorResponse!;

  const { case_type, subject, description, province_id, accused_info, complainant_info } = await req.json();
  if (!case_type || !subject?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'Tipo, assunto e descrição dos factos são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const year = new Date().getFullYear();
  const seq = getNextSequence(db, `ETICA_${year}`);
  const caseNumber = generateCaseNumber(year, seq);
  const initialProceedings = [
    {
      date: new Date().toISOString(),
      author: user.full_name,
      note: 'Abertura de registo e garantia de confidencialidade e direito ao contraditório.',
    },
  ];

  const res = db.prepare(`
    INSERT INTO ethics_cases (
      case_number, case_type, subject, description, province_id,
      accused_info, complainant_info, status, proceedings_log_json, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEBIDO', ?, ?)
  `).run(
    caseNumber,
    case_type,
    subject.trim(),
    description.trim(),
    isCentralDirectorate(user.role_code) ? (province_id ? Number(province_id) : null) : user.province_id,
    accused_info?.trim() || '',
    complainant_info?.trim() || '',
    JSON.stringify(initialProceedings),
    user.id
  );

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'ETICA_PROCESSO_ABERTO',
    entityType: 'ethics_case',
    entityId: Number(res.lastInsertRowid),
    details: { caseNumber, case_type },
  });

  return NextResponse.json({ success: true, id: Number(res.lastInsertRowid), case_number: caseNumber });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('ACCESS_ETHICS');
  if (errorResponse || !user) return errorResponse!;

  const { id, status, proceeding_note, recommendations, forwarded_to, decision_summary } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'ID do processo é obrigatório.' }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare(`SELECT * FROM ethics_cases WHERE id = ?`).get(Number(id)) as
    | { id: number; case_number: string; proceedings_log_json: string; status: string }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 });
  }

  const log = JSON.parse(row.proceedings_log_json || '[]') as Array<{ date: string; author: string; note: string }>;
  if (proceeding_note?.trim()) {
    log.push({
      date: new Date().toISOString(),
      author: user.full_name,
      note: proceeding_note.trim(),
    });
  }

  db.prepare(`
    UPDATE ethics_cases
    SET status = COALESCE(?, status),
        proceedings_log_json = ?,
        recommendations = COALESCE(?, recommendations),
        forwarded_to = COALESCE(?, forwarded_to),
        decision_summary = COALESCE(?, decision_summary),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status || null,
    JSON.stringify(log),
    recommendations ?? null,
    forwarded_to ?? null,
    decision_summary ?? null,
    row.id
  );

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'ETICA_DILIGENCIA_ATUALIZADA',
    entityType: 'ethics_case',
    entityId: row.id,
    details: { caseNumber: row.case_number, status: status || row.status },
  });

  return NextResponse.json({ success: true });
}
