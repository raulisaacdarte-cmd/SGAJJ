import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog, createNotification } from '@/lib/db';
import { getCurrentUser, requireAuth } from '@/lib/auth';
import { hasPermission, slugify } from '@/lib/domain';
import { syncSingleEntityToSupabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const q = searchParams.get('q')?.trim() || '';
  const all = searchParams.get('all') === '1';

  const user = all ? await getCurrentUser() : null;
  const canSeeDrafts = user && (hasPermission(user.role_code, 'PUBLISH_EDITORIAL') || hasPermission(user.role_code, 'APPROVE_EDITORIAL'));

  // Auto-publish scheduled items whose scheduled_at has arrived
  db.prepare(`
    UPDATE publications
    SET status = 'PUBLICADO', published_at = COALESCE(published_at, scheduled_at)
    WHERE status = 'AGENDADO' AND scheduled_at IS NOT NULL AND datetime(scheduled_at) <= datetime('now')
  `).run();

  let sql = `SELECT * FROM publications WHERE 1=1`;
  const params: unknown[] = [];

  if (!canSeeDrafts) {
    sql += ` AND status = 'PUBLICADO'`;
  }
  if (category && category !== 'Todas') {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (q) {
    sql += ` AND (LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?) OR LOWER(content) LIKE LOWER(?))`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY COALESCE(published_at, created_at) DESC`;
  const publications = db.prepare(sql).all(...params);
  return NextResponse.json({ publications });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuth('PUBLISH_EDITORIAL');
  if (errorResponse || !user) return errorResponse!;

  const body = await req.json();
  const {
    title,
    subtitle,
    summary,
    content,
    category,
    cover_image,
    video_url,
    stream_embed_url,
    status = 'PENDENTE_APROVACAO',
    scheduled_at,
    seo_title,
    seo_description,
  } = body;

  if (!title?.trim() || !summary?.trim() || !content?.trim() || !category) {
    return NextResponse.json({ error: 'Título, resumo, conteúdo e categoria são obrigatórios.' }, { status: 400 });
  }

  const canDirectPublish = hasPermission(user.role_code, 'APPROVE_EDITORIAL');
  let finalStatus = status;
  if (finalStatus === 'PUBLICADO' && !canDirectPublish) {
    finalStatus = 'PENDENTE_APROVACAO';
  }
  if (finalStatus === 'AGENDADO' && !scheduled_at) {
    return NextResponse.json({ error: 'Defina a data e hora para agendamento.' }, { status: 400 });
  }

  const db = getDb();
  let baseSlug = slugify(title.trim()) || `artigo-${Date.now()}`;
  const slugConflict = db.prepare(`SELECT id FROM publications WHERE slug = ?`).get(baseSlug);
  if (slugConflict) {
    baseSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
  }

  const publishedAt = finalStatus === 'PUBLICADO' ? new Date().toISOString() : null;
  const res = db.prepare(`
    INSERT INTO publications (
      slug, title, subtitle, summary, content, category, cover_image, video_url,
      stream_embed_url, author_id, author_name, status, scheduled_at, published_at,
      seo_title, seo_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    baseSlug,
    title.trim(),
    subtitle?.trim() || '',
    summary.trim(),
    content.trim(),
    category,
    cover_image || null,
    video_url?.trim() || null,
    stream_embed_url?.trim() || null,
    user.id,
    user.full_name,
    finalStatus,
    scheduled_at || null,
    publishedAt,
    seo_title?.trim() || `${title.trim()} | A Voz Jurídica — AJJ`,
    seo_description?.trim() || summary.trim().slice(0, 155)
  );

  if (finalStatus === 'PUBLICADO') {
    createNotification(db, {
      userId: null,
      category: 'PUBLICACAO',
      title: `Nova Publicação em A Voz Jurídica`,
      message: `${title.trim()} (${category})`,
      linkUrl: `/voz-juridica/${baseSlug}`,
    });
  }

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: 'PUBLICACAO_CRIADA',
    entityType: 'publication',
    entityId: Number(res.lastInsertRowid),
    details: { slug: baseSlug, category, status: finalStatus },
  });

  const insertedPub = db
    .prepare(`SELECT * FROM publications WHERE id = ?`)
    .get(Number(res.lastInsertRowid)) as Record<string, unknown> | undefined;
  if (insertedPub) {
    void syncSingleEntityToSupabase('publications', [insertedPub], 'id');
  }

  return NextResponse.json({ success: true, id: Number(res.lastInsertRowid), slug: baseSlug, status: finalStatus });
}

export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireAuth();
  if (errorResponse || !user) return errorResponse!;

  const { action, id, status, comment_id, comment_status } = await req.json();
  const db = getDb();

  if (action === 'MODERATE_COMMENT') {
    if (!hasPermission(user.role_code, 'APPROVE_EDITORIAL')) {
      return NextResponse.json({ error: 'Sem permissão para moderar comentários.' }, { status: 403 });
    }
    db.prepare(`UPDATE publication_comments SET status = ? WHERE id = ?`).run(comment_status, Number(comment_id));
    return NextResponse.json({ success: true });
  }

  if (!hasPermission(user.role_code, 'APPROVE_EDITORIAL')) {
    return NextResponse.json({ error: 'Apenas a Direção de Comunicação ou Presidência pode aprovar publicações.' }, { status: 403 });
  }

  db.prepare(`
    UPDATE publications
    SET status = ?,
        published_at = CASE WHEN ? = 'PUBLICADO' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, status, Number(id));

  writeAuditLog(db, {
    userId: user.id,
    userName: user.full_name,
    roleCode: user.role_code,
    action: `PUBLICACAO_${status}`,
    entityType: 'publication',
    entityId: Number(id),
  });

  const updatedPub = db
    .prepare(`SELECT * FROM publications WHERE id = ?`)
    .get(Number(id)) as Record<string, unknown> | undefined;
  if (updatedPub) {
    void syncSingleEntityToSupabase('publications', [updatedPub], 'id');
  }

  return NextResponse.json({ success: true });
}
