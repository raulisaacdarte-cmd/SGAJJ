'use client';

import React from 'react';
import { Bell, CheckCircle2, Download, Laptop, RefreshCw, Share, Smartphone } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader';
import { PublicFooter } from '@/components/PublicFooter';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export default function InstalarPage() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#071121]">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A6863A] dark:text-[#C5A24D]">
              Aplicação Web Progressiva (PWA) · Distribuição Direta
            </p>
            <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#0B1F3A] dark:text-white">
              Instalar a Aplicação SGAJJ
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Instale o SGAJJ diretamente no seu telemóvel Android, iPhone ou computador através do navegador — sem necessidade de Google Play Store, com atualizações automáticas quando estiver online e suporte a notificações institucionais.
            </p>

            <div className="pt-2">
              {isInstalled ? (
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Aplicação já instalada e a funcionar em modo autónomo.</span>
                </div>
              ) : isInstallable ? (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#132E54] cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Instalar Agora Neste Dispositivo
                </button>
              ) : (
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isIOS
                    ? 'No iPhone/iPad, siga as instruções do Safari abaixo para adicionar ao ecrã principal.'
                    : 'Utilize o botão de instalação do seu navegador (barra de endereço ou menu) ou siga os passos abaixo.'}
                </p>
              )}
            </div>
          </div>

          <img
            src="/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg"
            alt="Ícone da Aplicação SGAJJ"
            className="h-32 w-32 rounded-2xl border border-[#A6863A]/40 object-cover shrink-0"
          />
        </div>

        {/* Step-by-step Platform Guides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
            <Smartphone className="h-6 w-6 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              Android (Chrome / Edge)
            </h2>
            <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-4">
              <li>Abra o endereço oficial da AJJ no Google Chrome ou Microsoft Edge.</li>
              <li>Toque no menu <strong>⋮</strong> no canto superior direito do navegador.</li>
              <li>Selecione <strong>“Instalar aplicação”</strong> ou <strong>“Adicionar ao ecrã principal”</strong>.</li>
              <li>Confirme a instalação; o ícone oficial da AJJ ficará disponível como aplicação nativa.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
            <Laptop className="h-6 w-6 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              Computador (Windows / macOS)
            </h2>
            <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-4">
              <li>Aceda à plataforma pelo Google Chrome, Edge ou Brave.</li>
              <li>Clique no ícone de instalação na extremidade direita da barra de endereços.</li>
              <li>Clique em <strong>“Instalar”</strong> para abrir o SGAJJ em janela própria dedicada.</li>
              <li>Pode fixar a aplicação na barra de tarefas ou no menu Iniciar.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
            <Share className="h-6 w-6 text-[#A6863A]" />
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              iPhone e iPad (Safari)
            </h2>
            <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-4">
              <li>Abra o portal no navegador <strong>Safari</strong>.</li>
              <li>Toque no ícone <strong>Partilhar</strong> (quadrado com seta para cima).</li>
              <li>Deslize para baixo e toque em <strong>“Adicionar ao ecrã principal”</strong>.</li>
              <li>Confirme o nome <strong>SGAJJ</strong> e toque em <strong>Adicionar</strong>.</li>
            </ol>
          </div>
        </div>

        {/* Capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 flex items-start gap-4">
            <RefreshCw className="h-5 w-5 text-[#A6863A] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">Atualizações Automáticas Online</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                O Service Worker mantém os recursos essenciais em cache e sincroniza automaticamente novas versões assim que o dispositivo estiver conectado à internet.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 flex items-start gap-4">
            <Bell className="h-5 w-5 text-[#A6863A] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white">Notificações Institucionais</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Receba alertas em tempo real sobre nomeações, convocatórias, aprovação de despesas, quotas e comunicados oficiais da Direção Central.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
