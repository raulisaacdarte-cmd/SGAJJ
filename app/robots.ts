import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL || 'https://ajj-angola.org';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/adesao', '/voz-juridica', '/verificar', '/instalar'],
        disallow: ['/painel', '/api/', '/setup'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
