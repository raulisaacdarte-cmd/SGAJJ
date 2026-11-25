'use client';

import React from 'react';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function PublicFooter() {
  const { theme, toggleTheme } = useTheme();

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#071121] text-slate-600 dark:text-slate-400 no-print">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg"
                alt="Selo Oficial da Associação de Jovens Juristas"
                className="h-12 w-12 rounded-full object-cover border border-[#A6863A]/40"
              />
              <div>
                <p className="font-serif-display text-lg font-bold text-[#0B1F3A] dark:text-white">
                  Associação de Jovens Juristas (AJJ)
                </p>
                <p className="text-xs italic text-[#A6863A] dark:text-[#C5A24D]">
                  Juntos em prol do bem maior.
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed max-w-md">
              Organização não governamental de âmbito nacional dedicada à promoção da cultura jurídica, educação para a cidadania, defesa dos direitos humanos e valorização da justiça na República de Angola.
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="font-semibold text-[#0B1F3A] dark:text-white">Plataforma</p>
            <ul className="space-y-1.5">
              <li><Link href="/adesao" className="hover:text-[#0B1F3A] dark:hover:text-white">Portal de Adesão</Link></li>
              <li><Link href="/voz-juridica" className="hover:text-[#0B1F3A] dark:hover:text-white">A Voz Jurídica</Link></li>
              <li><Link href="/verificar" className="hover:text-[#0B1F3A] dark:hover:text-white">Verificação por QR Code</Link></li>
              <li><Link href="/instalar" className="hover:text-[#0B1F3A] dark:hover:text-white">Instalar a Aplicação (PWA)</Link></li>
            </ul>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="font-semibold text-[#0B1F3A] dark:text-white">Governança & Documentação</p>
            <ul className="space-y-1.5">
              <li><Link href="/login" className="hover:text-[#0B1F3A] dark:hover:text-white">Acesso Institucional</Link></li>
              <li><Link href="/setup" className="hover:text-[#0B1F3A] dark:hover:text-white">Configuração Inicial</Link></li>
              <li><Link href="/manual" className="hover:text-[#0B1F3A] dark:hover:text-white">Manual e Documentação Técnica</Link></li>
              <li>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 pt-1 text-xs font-medium text-[#0B1F3A] dark:text-[#C5A24D] hover:underline cursor-pointer"
                >
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Associação de Jovens Juristas — Angola · SGAJJ</p>
          <p>Proteção de Dados em conformidade com a Lei n.º 22/11 da República de Angola</p>
        </div>
      </div>
    </footer>
  );
}
