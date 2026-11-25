import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, FileCheck, Globe, Scale, Shield, Users } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { PWAInstallButton } from '@/components/PWAInstallBanner';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const db = getDb();

  const settings = db.prepare(`SELECT * FROM system_settings WHERE id = 1`).get() as {
    organization_name: string;
    slogan: string;
    logo_path: string;
    setup_completed: number;
  };

  const activeCoordinations = (db.prepare(`SELECT COUNT(*) as c FROM coordinations WHERE status = 'ATIVA'`).get() as {
    c: number;
  }).c;
  const publishedArticles = db.prepare(`
    SELECT id, slug, title, summary, category, author_name, published_at, views_count
    FROM publications
    WHERE status = 'PUBLICADO'
    ORDER BY published_at DESC
    LIMIT 3
  `).all() as Array<{
    id: number;
    slug: string;
    title: string;
    summary: string;
    category: string;
    author_name: string;
    published_at: string;
    views_count: number;
  }>;

  const upcomingActivities = db.prepare(`
    SELECT id, title, activity_type, location, start_datetime, is_online
    FROM activities
    WHERE approval_status = 'APROVADA'
    ORDER BY start_datetime DESC
    LIMIT 3
  `).all() as Array<{
    id: number;
    title: string;
    activity_type: string;
    location: string;
    start_datetime: string;
    is_online: number;
  }>;

  const categories = db.prepare(`SELECT code, name, monthly_quota_aoa, description FROM member_categories ORDER BY id ASC`).all() as Array<{
    code: string;
    name: string;
    monthly_quota_aoa: number;
    description: string;
  }>;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1">
        {/* Institutional Hero Section */}
        <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-7 space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A6863A] dark:text-[#C5A24D]">
                  República de Angola · Plataforma Nacional SGAJJ
                </p>
                <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#0B1F3A] dark:text-white leading-[1.08] text-balance">
                  {settings.organization_name}
                </h1>
                <p className="font-serif-display text-xl sm:text-2xl italic text-[#A6863A] dark:text-[#C5A24D]">
                  “{settings.slogan}”
                </p>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  Organização não governamental de âmbito nacional dedicada à promoção da cultura jurídica, educação para a cidadania, formação de jovens juristas, defesa dos direitos humanos e proteção dos direitos dos cidadãos em todas as províncias de Angola.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link
                    href="/adesao"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#132E54] dark:hover:bg-[#8E712F] transition-colors whitespace-nowrap shrink-0"
                  >
                    Tornar-se Associado
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/voz-juridica"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-transparent px-5 py-3 text-sm font-semibold text-[#0B1F3A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Portal A Voz Jurídica
                  </Link>
                  <PWAInstallButton />
                </div>

                {settings.setup_completed === 0 && (
                  <div className="pt-2">
                    <Link
                      href="/setup"
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[#A6863A] dark:text-[#C5A24D] underline underline-offset-4"
                    >
                      Ambiente inicial disponível: Configurar Presidência Nacional da AJJ →
                    </Link>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-8 flex flex-col items-center text-center">
                  <img
                    src={settings.logo_path || '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg'}
                    alt="Logotipo Oficial da Associação de Jovens Juristas"
                    className="h-52 w-52 rounded-full object-cover border-2 border-[#A6863A]/50 shadow-sm"
                  />
                  <div className="mt-6 w-full border-t border-slate-200 dark:border-slate-800 pt-5 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Selo Institucional Oficial
                    </p>
                    <p className="font-serif-display text-lg font-semibold text-[#0B1F3A] dark:text-white">
                      Justiça · Cidadania · Integridade
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Institutional Footprint Strip */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">18</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Províncias Estruturadas no Sistema</p>
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">7 + 7</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Órgãos Direção Central e Províncias</p>
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">{activeCoordinations}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Coordenações Provinciais Ativas</p>
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-[#0B1F3A] dark:text-white">QR</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Validação Pública de Cartões e Certificados</p>
              </div>
            </div>
          </div>
        </section>

        {/* Core Pillars */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-2xl space-y-2 mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A6863A] dark:text-[#C5A24D]">
              Missão e Competências
            </p>
            <h2 className="font-serif-display text-3xl font-bold text-[#0B1F3A] dark:text-white text-balance">
              Infraestrutura digital ao serviço do Direito em Angola
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
              <Scale className="h-6 w-6 text-[#A6863A]" />
              <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Cultura Jurídica e Direitos Humanos</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Educação cívica e jurídica acessível, proteção dos interesses legalmente reconhecidos e apoio à cidadania.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
              <Users className="h-6 w-6 text-[#A6863A]" />
              <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Coordenação Nacional Integrada</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Hierarquia estatutária rigorosa entre Presidência, Direção Central e as 18 Coordenações Provinciais.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
              <FileCheck className="h-6 w-6 text-[#A6863A]" />
              <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Identidade Digital e QR Code</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Códigos permanentes não reutilizáveis, cartões digitais em PDF e verificação pública instantânea.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
              <Shield className="h-6 w-6 text-[#A6863A]" />
              <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">Transparência e Fiscalização</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Auditoria imutável de movimentos financeiros, separação de contas nacionais e provinciais e ética associativa.
              </p>
            </div>
          </div>
        </section>

        {/* Membership Categories */}
        <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A6863A] dark:text-[#C5A24D]">
                  Categorias Estatutárias
                </p>
                <h2 className="font-serif-display text-3xl font-bold text-[#0B1F3A] dark:text-white">
                  Integre a Associação de Jovens Juristas
                </h2>
              </div>
              <Link
                href="/adesao"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] dark:text-[#C5A24D] hover:underline whitespace-nowrap shrink-0"
              >
                Iniciar Candidatura Online
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {categories.map((cat) => (
                <div
                  key={cat.code}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8F9FB] dark:bg-[#071121] p-6 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">{cat.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{cat.description}</p>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Quota mensal base</span>
                    <span className="font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#C5A24D]">
                      {cat.monthly_quota_aoa > 0 ? `${cat.monthly_quota_aoa.toLocaleString('pt-AO')} AOA` : 'Isento'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* A Voz Jurídica & Upcoming Activities */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A6863A] dark:text-[#C5A24D]">
                    Portal Editorial Oficial
                  </p>
                  <h2 className="font-serif-display text-3xl font-bold text-[#0B1F3A] dark:text-white">
                    A Voz Jurídica
                  </h2>
                </div>
                <Link href="/voz-juridica" className="text-sm font-semibold text-[#0B1F3A] dark:text-[#C5A24D] hover:underline whitespace-nowrap shrink-0">
                  Ver todas →
                </Link>
              </div>

              {publishedArticles.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-3">
                  <BookOpen className="h-6 w-6 text-[#A6863A]" />
                  <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">
                    Espaço Editorial Pronto para Publicação
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    As publicações científicas, comunicados oficiais e análises jurídicas da AJJ aparecerão aqui assim que forem aprovadas pela Direção de Comunicação e Imagem.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {publishedArticles.map((art) => (
                    <Link
                      key={art.id}
                      href={`/voz-juridica/${art.slug}`}
                      className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 hover:border-[#A6863A] transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-[#A6863A] dark:text-[#C5A24D]">{art.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{art.author_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{art.published_at?.slice(0, 10)}</span>
                      </div>
                      <h3 className="mt-2 font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
                        {art.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{art.summary}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A6863A] dark:text-[#C5A24D]">
                  Agenda & Formação
                </p>
                <h2 className="font-serif-display text-3xl font-bold text-[#0B1F3A] dark:text-white">
                  Atividades Institucionais
                </h2>
              </div>

              {upcomingActivities.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-3">
                  <Globe className="h-6 w-6 text-[#A6863A]" />
                  <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">
                    Nenhuma atividade publicada ainda
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Conferências, seminários, palestras e formações jurídicas criadas pela Direção Central ou Coordenações Provinciais serão listadas aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingActivities.map((act) => (
                    <div
                      key={act.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-5 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-[#A6863A] dark:text-[#C5A24D]">{act.activity_type}</span>
                        <span className="font-mono-tabular">{act.start_datetime.slice(0, 10)}</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#0B1F3A] dark:text-white">{act.title}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{act.location}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] dark:text-white">
                  <CheckCircle2 className="h-4 w-4 text-[#A6863A]" />
                  <span>Verificação Oficial de Autenticidade</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Valide publicamente cartões digitais de associados e certificados de participação emitidos pela AJJ.
                </p>
                <Link
                  href="/verificar"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B1F3A] dark:text-[#C5A24D] hover:underline"
                >
                  Aceder ao Portal de Verificação QR →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
