import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { getDb } from '@/lib/db';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { ArticleInteractions } from '@/components/ArticleInteractions';
import { ExportArticlePdfButton } from '@/components/ExportArticlePdfButton';

export const dynamic = 'force-dynamic';

interface PublicationRow {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  content: string;
  category: string;
  cover_image: string | null;
  video_url: string | null;
  stream_embed_url: string | null;
  author_name: string;
  published_at: string;
  views_count: number;
  seo_title: string | null;
  seo_description: string | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  const art = db.prepare(`SELECT title, summary, seo_title, seo_description, cover_image FROM publications WHERE slug = ? AND status = 'PUBLICADO'`).get(slug) as
    | Partial<PublicationRow>
    | undefined;
  if (!art) return { title: 'Artigo não encontrado | A Voz Jurídica' };

  return {
    title: art.seo_title || `${art.title} | A Voz Jurídica — AJJ`,
    description: art.seo_description || art.summary,
    openGraph: {
      title: art.seo_title || art.title,
      description: art.seo_description || art.summary,
      type: 'article',
      images: art.cover_image ? [art.cover_image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const article = db.prepare(`SELECT * FROM publications WHERE slug = ? AND status = 'PUBLICADO'`).get(slug) as
    | PublicationRow
    | undefined;

  if (!article) notFound();

  db.prepare(`UPDATE publications SET views_count = views_count + 1 WHERE id = ?`).run(article.id);
  const comments = db.prepare(`
    SELECT id, author_name, content, created_at
    FROM publication_comments
    WHERE publication_id = ? AND status = 'APROVADO'
    ORDER BY created_at DESC
  `).all(article.id) as Array<{ id: number; author_name: string; content: string; created_at: string }>;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    author: { '@type': 'Person', name: article.author_name },
    publisher: { '@type': 'Organization', name: 'Associação de Jovens Juristas (AJJ)' },
    datePublished: article.published_at,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 no-print">
          <Link
            href="/voz-juridica"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] dark:hover:text-white whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar a A Voz Jurídica
          </Link>

          <ExportArticlePdfButton slug={article.slug} />
        </div>

        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 sm:p-10 space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-[#A6863A] dark:text-[#C5A24D]">{article.category}</span>
            <span aria-hidden="true">·</span>
            <span>Por {article.author_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{article.published_at?.slice(0, 10)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono-tabular">
              <Eye className="h-3.5 w-3.5" /> {article.views_count + 1} leituras
            </span>
          </div>

          <h1 className="font-serif-display text-3xl sm:text-5xl font-bold text-[#0B1F3A] dark:text-white leading-tight text-balance">
            {article.title}
          </h1>

          {article.subtitle && (
            <p className="text-lg text-slate-600 dark:text-slate-300 font-medium">{article.subtitle}</p>
          )}

          {article.cover_image && (
            <img
              src={article.cover_image}
              alt={article.title}
              className="w-full max-h-[420px] object-cover rounded-xl border border-slate-200 dark:border-slate-800"
            />
          )}

          {(article.video_url || article.stream_embed_url) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071121] p-4 space-y-2">
              <p className="text-xs font-semibold text-[#A6863A]">Conteúdo Multimédia / Transmissão</p>
              <a
                href={article.video_url || article.stream_embed_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#0B1F3A] dark:text-white underline break-all"
              >
                {article.video_url || article.stream_embed_url}
              </a>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4 text-base text-slate-800 dark:text-slate-200 leading-[1.8] max-w-prose">
            {article.content.split('\n').map((para, i) =>
              para.trim() ? (
                <p
                  key={i}
                  className={
                    i === 0
                      ? 'first-letter:font-serif-display first-letter:text-5xl first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-[#0B1F3A] dark:first-letter:text-[#C5A24D]'
                      : ''
                  }
                >
                  {para}
                </p>
              ) : null
            )}
          </div>

          <ArticleInteractions slug={article.slug} title={article.title} initialComments={comments} />
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
