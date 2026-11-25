'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#8E712F] whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-4 w-4" />
        {compact ? 'Instalar' : 'Instalar Aplicação'}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-4 w-4" />
          Instalar no iOS
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#0D1B30] p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
              <h3 className="text-lg font-semibold text-[#0B1F3A] dark:text-white">Instalar no iPhone / iPad</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Toque no botão <strong>Partilhar</strong> na barra inferior do Safari.<br />
                2. Selecione <strong>Adicionar ao Ecrã Principal</strong>.<br />
                3. Confirme tocando em <strong>Adicionar</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#0B1F3A] py-2 text-sm font-medium text-white hover:bg-[#132E54] cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Link
      href="/instalar"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-[#0B1F3A] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap shrink-0"
    >
      <Download className="h-4 w-4 text-[#A6863A]" />
      {compact ? 'Instalar' : 'Instalar App'}
    </Link>
  );
}

export function OfflineIndicator() {
  const { isOnline } = usePWAInstall();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#0B1F3A] border border-[#A6863A] px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="h-4 w-4 text-[#C5A24D]" />
      <span>Modo Offline — Dados em cache local ativos</span>
    </div>
  );
}
