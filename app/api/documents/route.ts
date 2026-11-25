import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasPermission, isCentralDirectorate } from '@/lib/domain';

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get('docType');
  const provinceId = searchParams.get('provinceId');
  const departmentId = searchParams.get('departmentId');
  const q = searchParams.get('q')?.trim() || '';

  let sql = `
    SELECT d.*, p.name as province_name, dep.name as department_name, u.full_name as uploaded_by_name
    FROM documents d
    LEFT JOIN provinces p ON p.id = d.province_id
    LEFT JOIN departments dep ON dep.id = d.department_id
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isCentralDirectorate(user.role_code)) {
    if (user.role_code === 'ASSOCIADO') {
      sql += ` AND d.access_level IN ('PUBLICO', 'ASSOCIADOS')`;
    } else {
      sql += ` AND (d.access_level IN ('PUBLICO', 'ASSOCIADOS') OR (d.access_level = 'COORDENACAO' AND (d.province_id IS NULL OR d.province_id = ?)))`;
      params.push(user.province_id || -1);
    }
  }

  if (docType) {
    sql += ` AND d.doc_type = ?`;
    params.push(docType);
  }
  if (provinceId) {
    sql += ` AND d.province_id = ?`;
    params.push(Number(provinceId));
  }
  if (departmentId) {
    sql += ` AND d.department_id = ?`;
    params.push(Number(departmentId));
  }
  if (q) {
    sql += ` AND (LOWER(d.title) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?))`;
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY d.doc_date DESC, d.id DESC`;
  const documents = db.prepare(sql).all(...params);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('MANAGE_DOCUMENTS');
  if (errorResponse || !user) return errorResponse!;

  const body = await req.json();
  const {
    title,
    doc_type,
    province_id,
    department_id,
    file_path,
    file_name,
    mime_type,
    file_size,
    access_level = 'COORDENACAO',
    doc_date,
    description,
  } = body;

  if (!title?.trim() || !doc_type || !file_path) {
    return NextResponse.json({ error: 'Título, tipo documental e ficheiro são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const effectiveProvince = isCentralDirectorate(user.role_code)
    ? province_id
      ? Number(province_id)
      : null
    : user.province_id;

  const docId = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO documents (
        title, doc_type, province_id, department_id, version, file_path, file_name,
        mime_type, file_size, access_level, doc_date, description, uploaded_by
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      doc_type,
      effectiveProvince,
      department_id ? Number(department_id) : null,
      file_path,
      file_name || 'documento',
      mime_type || 'application/octet-stream',
      Number(file_size) || 0,
      access_level,
      doc_date || new Date().toISOString().slice(0, 10),
      description?.trim() || '',
      user.id
    );

    const newId = Number(res.lastInsertRowid);
    db.prepare(`
      INSERT INTO document_versions (document_id, version, file_path, file_name, notes, uploaded_by)
      VALUES (?, 1, ?, ?, 'Versão inicial', ?)
    `).run(newId, file_path, file_name || 'documento', user.id);

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'DOCUMENTO_ARQUIVADO',
      entityType: 'document',
      entityId: newId,
      details: { title: title.trim(), doc_type, access_level },
    });

    return newId;
  })();

  return NextResponse.json({ success: true, id: docId });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('MANAGE_DOCUMENTS');
  if (errorResponse || !user) return errorResponse!;

  const { id, file_path, file_name, mime_type, file_size, notes } = await req.json();
  if (!id || !file_path) {
    return NextResponse.json({ error: 'ID do documento e novo ficheiro são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const doc = db.prepare(`SELECT id, version, province_id FROM documents WHERE id = ?`).get(Number(id)) as
    | { id: number; version: number; province_id: number | null }
    | undefined;
  if (!doc) {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  }
  if (!isCentralDirectorate(user.role_code) && doc.province_id !== user.province_id) {
    return NextResponse.json({ error: 'Sem permissão para versionar este documento.' }, { status: 403 });
  }

  const nextVersion = doc.version + 1;
  db.transaction(() => {
    db.prepare(`
      UPDATE documents
      SET version = ?, file_path = ?, file_name = ?, mime_type = ?, file_size = ?
      WHERE id = ?
    `).run(nextVersion, file_path, file_name || 'documento', mime_type || 'application/octet-stream', Number(file_size) || 0, doc.id);

    db.prepare(`
      INSERT INTO document_versions (document_id, version, file_path, file_name, notes, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(doc.id, nextVersion, file_path, file_name || 'documento', notes || `Atualização v${nextVersion}`, user.id);

    writeAuditLog(db, {
      userId: user.id,
      userName: user.full_name,
      roleCode: user.role_code,
      action: 'DOCUMENTO_NOVA_VERSAO',
      entityType: 'document',
      entityId: doc.id,
      details: { version: nextVersion },
    });
  })();

  return NextResponse.json({ success: true, version: nextVersion });
}
