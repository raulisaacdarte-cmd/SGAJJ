import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.APP_URL || 'https://ajj-angola.org';
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/adesao`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/voz-juridica`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/verificar`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/instalar`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ];

  try {
    const db = getDb();
    const articles = db.prepare(`
      SELECT slug, updated_at FROM publications WHERE status = 'PUBLICADO' ORDER BY published_at DESC LIMIT 200
    `).all() as Array<{ slug: string; updated_at: string }>;

    const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
      url: `${baseUrl}/voz-juridica/${a.slug}`,
      lastModified: new Date(a.updated_at || Date.now()),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...articleRoutes];
  } catch {
    return staticRoutes;
  }
}
