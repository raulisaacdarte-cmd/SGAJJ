'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Eye, Search } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { VOZ_JURIDICA_CATEGORIES } from '@/lib/domain';

interface Publication {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  category: string;
  cover_image: string | null;
  author_name: string;
  published_at: string;
  views_count: number;
}

export default function VozJuridicaPage() {
  const [articles, setArticles] = useState<Publication[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedCategory !== 'Todas') params.set('category', selectedCategory);
    if (search.trim()) params.set('q', search.trim());

    fetch(`/api/publications?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setArticles(data.publications || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCategory, search]);

  const leadStory = articles[0];
  const restStories = articles.slice(1);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Editorial Masthead */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-8 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A6863A] dark:text-[#C5A24D]">
              Órgão Oficial de Publicações Jurídicas · AJJ Angola
            </p>
            <h1 className="font-serif-display text-4xl sm:text-5xl font-bold text-[#0B1F3A] dark:text-white">
              A Voz Jurídica
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
              Doutrina, atualidade jurídica angolana, direitos humanos, investigação científica e comunicados institucionais da Associação de Jovens Juristas.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar artigos, temas ou leis..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1B30] pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-10">
          <button
            type="button"
            onClick={() => setSelectedCategory('Todas')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              selectedCategory === 'Todas'
                ? 'bg-[#0B1F3A] dark:bg-[#A6863A] text-white'
                : 'bg-white dark:bg-[#0D1B30] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#A6863A]'
            }`}
          >
            Todas
          </button>
          {VOZ_JURIDICA_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#0B1F3A] dark:bg-[#A6863A] text-white'
                  : 'bg-white dark:bg-[#0D1B30] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#A6863A]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">A carregar edições de A Voz Jurídica...</div>
        ) : articles.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-12 text-center space-y-3">
            <BookOpen className="h-10 w-10 text-[#A6863A] mx-auto" />
            <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
              Nenhuma publicação encontrada nesta categoria
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              Os textos submetidos pelos associados e aprovados pela Direção de Comunicação aparecerão automaticamente nesta secção editorial.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Lead Story */}
            {leadStory && (
              <Link
                href={`/voz-juridica/${leadStory.slug}`}
                className="block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] overflow-hidden hover:border-[#A6863A] transition-colors"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                  {leadStory.cover_image && (
                    <div className="lg:col-span-5 bg-slate-100 dark:bg-slate-900">
                      <img
                        src={leadStory.cover_image}
                        alt={leadStory.title}
                        className="h-64 lg:h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className={`${leadStory.cover_image ? 'lg:col-span-7' : 'lg:col-span-12'} p-8 space-y-4`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-[#A6863A] dark:text-[#C5A24D]">{leadStory.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{leadStory.author_name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{leadStory.published_at?.slice(0, 10)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular">
                        <Eye className="h-3.5 w-3.5" /> {leadStory.views_count}
                      </span>
                    </div>
                    <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#0B1F3A] dark:text-white text-balance">
                      {leadStory.title}
                    </h2>
                    {leadStory.subtitle && (
                      <p className="text-base font-medium text-slate-700 dark:text-slate-200">{leadStory.subtitle}</p>
                    )}
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                      {leadStory.summary}
                    </p>
                    <p className="text-xs font-semibold text-[#0B1F3A] dark:text-[#C5A24D] pt-2">
                      Ler artigo completo →
                    </p>
                  </div>
                </div>
              </Link>
            )}

            {/* Secondary Grid */}
            {restStories.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {restStories.map((art) => (
                  <Link
                    key={art.id}
                    href={`/voz-juridica/${art.slug}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 flex flex-col justify-between space-y-4 hover:border-[#A6863A] transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-[#A6863A] dark:text-[#C5A24D]">{art.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{art.published_at?.slice(0, 10)}</span>
                      </div>
                      <h3 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
                        {art.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{art.summary}</p>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{art.author_name}</span>
                      <span className="font-mono-tabular">{art.views_count} leituras</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
