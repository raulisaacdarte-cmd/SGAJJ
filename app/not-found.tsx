import React from 'react';
import Link from 'next/link';
import { FileSearch, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 text-center space-y-5 shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-xl bg-[#0B1F3A]/10 dark:bg-slate-800 text-[#A6863A] flex items-center justify-center">
          <FileSearch className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Página Não Encontrada · 404</p>
          <h1 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Recurso não localizado
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            O endereço solicitado não existe ou foi movido dentro da plataforma SGAJJ.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white"
          >
            <Home className="h-4 w-4" /> Voltar ao Início
          </Link>
          <Link
            href="/painel"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Portal Interno
          </Link>
        </div>
      </div>
    </div>
  );
}
