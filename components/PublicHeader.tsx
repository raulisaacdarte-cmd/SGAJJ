'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

const DEFAULT_LOGO = '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg';

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoPath, setLogoPath] = useState(DEFAULT_LOGO);
  const [acronym, setAcronym] = useState('SGAJJ');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.settings) {
          if (d.settings.logo_path) setLogoPath(d.settings.logo_path);
          if (d.settings.acronym) setAcronym(d.settings.acronym);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#071121]/95 backdrop-blur-sm no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
        {/* Zone 1: Brand Wordmark + Official Seal */}
        <Link
          href="/"
          className="flex items-center gap-3 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#A6863A]"
        >
          <img
            src={logoPath}
            alt="Logotipo Oficial da Associação de Jovens Juristas"
            className="h-10 w-10 rounded-full object-cover border border-[#A6863A]/40"
          />
          <span className="font-serif-display text-xl font-bold tracking-tight text-[#0B1F3A] dark:text-white whitespace-nowrap shrink-0">
            {acronym}
          </span>
        </Link>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Link href="/" className="hover:text-[#0B1F3A] dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0">
            Início
          </Link>
          <Link href="/adesao" className="hover:text-[#0B1F3A] dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0">
            Adesão
          </Link>
          <Link href="/voz-juridica" className="hover:text-[#0B1F3A] dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0">
            A Voz Jurídica
          </Link>
          <Link href="/verificar" className="hover:text-[#0B1F3A] dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0">
            Verificar QR
          </Link>
          <Link href="/instalar" className="hover:text-[#0B1F3A] dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0">
            Instalar App
          </Link>
        </nav>

        {/* Zone 3: 1 Primary Action + Theme Toggle + Mobile Menu Trigger */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            aria-label="Alternar tema claro ou escuro"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#A6863A] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C5A24D]" /> : <Moon className="h-4 w-4 text-[#0B1F3A]" />}
          </button>
          <Link
            href="/painel"
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#132E54] dark:hover:bg-[#8E712F] transition-colors whitespace-nowrap shrink-0"
          >
            Portal Interno
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] px-4 py-4 space-y-2">
          <Link href="/" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            Início
          </Link>
          <Link href="/adesao" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            Adesão de Associados
          </Link>
          <Link href="/voz-juridica" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            A Voz Jurídica
          </Link>
          <Link href="/verificar" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            Verificar QR Code
          </Link>
          <Link href="/instalar" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            Instalar Aplicação
          </Link>
          <Link
            href="/painel"
            onClick={() => setMenuOpen(false)}
            className="mt-2 block w-full rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2.5 text-center text-sm font-semibold text-white"
          >
            Portal Interno
          </Link>
        </div>
      )}
    </header>
  );
}
