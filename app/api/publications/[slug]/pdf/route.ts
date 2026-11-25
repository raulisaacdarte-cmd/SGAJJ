import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/domain';
import { generateArticlePdfBuffer } from '@/lib/article-pdf';

interface PublicationRow {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  content: string;
  category: string;
  author_name: string;
  status: string;
  published_at: string | null;
}

interface SystemSettingsRow {
  organization_name: string;
  slogan: string;
  logo_path: string;
  contact_email: string;
  headquarters_address: string;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const db = getDb();

  const article = db
    .prepare(
      `SELECT id, slug, title, subtitle, summary, content, category, author_name, status, published_at
       FROM publications
       WHERE slug = ?`
    )
    .get(slug) as PublicationRow | undefined;

  if (!article) {
    return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404 });
  }

  if (article.status !== 'PUBLICADO') {
    const user = await getCurrentUser();
    const canModerate = user && hasPermission(user.role_code, 'APPROVE_EDITORIAL');
    if (!canModerate) {
      return NextResponse.json({ error: 'Publicação indisponível.' }, { status: 404 });
    }
  }

  const settings = db
    .prepare(`SELECT organization_name, slogan, logo_path, contact_email, headquarters_address FROM system_settings WHERE id = 1`)
    .get() as SystemSettingsRow | undefined;

  const pdfBytes = generateArticlePdfBuffer({
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle,
    summary: article.summary,
    content: article.content,
    category: article.category,
    author_name: article.author_name,
    published_at: article.published_at,
    organization_name: settings?.organization_name || 'Associação de Jovens Juristas (AJJ)',
    slogan: settings?.slogan || 'Juntos em prol do bem maior.',
    logo_path: settings?.logo_path || null,
    contact_email: settings?.contact_email || '',
    headquarters_address: settings?.headquarters_address || '',
  });

  const safeFileSlug = article.slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'artigo';

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="AJJ-${safeFileSlug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
