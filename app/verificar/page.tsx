'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Search, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';

export default function VerificarIndexPage() {
  const [code, setCode] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    router.push(`/verificar/${encodeURIComponent(code.trim())}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <QrCode className="h-8 w-8 text-[#A6863A]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A] dark:text-[#C5A24D]">
                Autenticidade Institucional
              </p>
              <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white">
                Verificação por QR Code ou Código
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Introduza o código único de associado (ex.: <span className="font-mono-tabular">AJJ-LUA-2026-00001</span>), número de cartão digital, código de certificado ou token de validação QR para confirmar a autenticidade oficial perante a Associação de Jovens Juristas.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código de Associado, Certificado ou Token QR"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-4 py-2.5 text-sm font-mono-tabular text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              <Search className="h-4 w-4" />
              Verificar Agora
            </button>
          </form>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-[#A6863A]" />
            <span>Apenas os dados institucionais estritamente necessários à validação são apresentados.</span>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
