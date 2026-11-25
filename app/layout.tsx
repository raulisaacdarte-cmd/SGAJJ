import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FirebaseProvider } from '@/components/FirebaseProvider';
import { OfflineIndicator } from '@/components/PWAInstallBanner';

export const viewport: Viewport = {
  themeColor: '#0B1F3A',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SGAJJ — Associação de Jovens Juristas | Juntos em prol do bem maior',
  description:
    'Plataforma nacional de gestão institucional, administrativa, financeira e editorial da Associação de Jovens Juristas (AJJ) na República de Angola.',
  openGraph: {
    title: 'SGAJJ — Associação de Jovens Juristas',
    description:
      'Plataforma nacional da Associação de Jovens Juristas em Angola: adesão online, cartão digital com QR Code, coordenações provinciais e portal A Voz Jurídica.',
    type: 'website',
    locale: 'pt_AO',
    siteName: 'SGAJJ — AJJ Angola',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SGAJJ — Associação de Jovens Juristas',
    description: 'Juntos em prol do bem maior. Gestão institucional e portal jurídico nacional da AJJ em Angola.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SGAJJ',
  },
  icons: {
    icon: '/pwa-192x192.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: 'Associação de Jovens Juristas (AJJ)',
    alternateName: 'SGAJJ',
    slogan: 'Juntos em prol do bem maior.',
    areaServed: 'Angola',
    description:
      'Organização não governamental nacional em Angola dedicada à cultura jurídica, defesa dos direitos humanos, cidadania e formação de jovens juristas.',
  };

  return (
    <html
      lang="pt-AO"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col antialiased selection:bg-[#A6863A]/20" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider>
          <FirebaseProvider>
            {children}
            <OfflineIndicator />
          </FirebaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

