import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/domain';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const db = getDb();
  const article = db.prepare(`SELECT * FROM publications WHERE slug = ?`).get(slug) as
    | { id: number; status: string }
    | undefined;

  if (!article) {
    return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  const canModerate = user && hasPermission(user.role_code, 'APPROVE_EDITORIAL');

  if (article.status !== 'PUBLICADO' && !canModerate) {
    return NextResponse.json({ error: 'Publicação indisponível.' }, { status: 404 });
  }

  db.prepare(`UPDATE publications SET views_count = views_count + 1 WHERE id = ?`).run(article.id);
  const updated = db.prepare(`SELECT * FROM publications WHERE id = ?`).get(article.id);

  const comments = db.prepare(`
    SELECT * FROM publication_comments
    WHERE publication_id = ? ${canModerate ? '' : "AND status = 'APROVADO'"}
    ORDER BY created_at DESC
  `).all(article.id);

  return NextResponse.json({ publication: updated, comments });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const { author_name, author_email, content } = await req.json();

  if (!author_name?.trim() || !author_email?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Nome, e-mail e comentário são obrigatórios.' }, { status: 400 });
  }

  const db = getDb();
  const article = db.prepare(`SELECT id FROM publications WHERE slug = ? AND status = 'PUBLICADO'`).get(slug) as
    | { id: number }
    | undefined;
  if (!article) {
    return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404 });
  }

  db.prepare(`
    INSERT INTO publication_comments (publication_id, author_name, author_email, content, status)
    VALUES (?, ?, ?, ?, 'PENDENTE')
  `).run(article.id, author_name.trim(), author_email.trim().toLowerCase(), content.trim());

  return NextResponse.json({
    success: true,
    message: 'Comentário submetido com sucesso. Será publicado após moderação editorial.',
  });
}
