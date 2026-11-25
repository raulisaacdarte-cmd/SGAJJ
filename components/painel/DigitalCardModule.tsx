'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { generateQrDataUrl } from '@/lib/qr';
import { downloadMemberCardPdf } from '@/lib/pdf';
import { getPersonInitials, hasPermission } from '@/lib/domain';
import type { PanelProps } from './types';

interface CardItem {
  id: number;
  member_id: number;
  card_number: string;
  member_code: string;
  qr_token: string;
  issued_at: string;
  expires_at: string;
  issuer_name: string;
  status: string;
  full_name: string;
  photo_path: string | null;
  province_name: string;
  category_name: string;
}

export function DigitalCardModule({ user, catalog }: PanelProps) {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const canManage =
    hasPermission(user.role_code, 'MANAGE_MEMBERS_ALL') || hasPermission(user.role_code, 'MANAGE_MEMBERS_PROVINCE');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/cards');
        const data = await res.json();
        const list = (data.cards || []) as CardItem[];
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const map: Record<number, string> = {};
        for (const c of list) {
          map[c.id] = await generateQrDataUrl(`${origin}/verificar/${c.qr_token}`);
        }
        if (!cancelled) {
          setCards(list);
          setQrMap(map);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  async function handleInvalidate(id: number) {
    await fetch('/api/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason: 'Invalidado manualmente via SGAJJ' }),
    });
    setReloadTick((t) => t + 1);
  }

  async function handleReissue(memberId: number) {
    await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, validity_years: 2 }),
    });
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Identificação Digital Oficial</p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          Cartões Digitais e Verificação por QR Code
        </h2>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">A carregar cartões digitais...</p>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-8 text-center text-sm text-slate-500">
          Nenhum cartão digital emitido ainda. Aprove uma candidatura ou registe um associado para gerar automaticamente o cartão e o QR Code.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cards.map((card) => {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const verifyPath = `/verificar/${card.qr_token}`;
            return (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] overflow-hidden"
              >
                {/* Official Card Header */}
                <div className="bg-[#0B1F3A] px-5 py-3.5 border-b-2 border-[#A6863A] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={catalog.settings.logo_path || '/assets/aistudio/IMG-20260804-WA0073_3cc94a37.jpg'}
                      alt="Logotipo AJJ"
                      className="h-9 w-9 rounded-full object-cover bg-white"
                    />
                    <div>
                      <p className="text-xs font-bold text-white tracking-wide">ASSOCIAÇÃO DE JOVENS JURISTAS</p>
                      <p className="text-[10px] text-[#D9B965] uppercase tracking-widest">Cartão Oficial de Associado</p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      card.status === 'ATIVO' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {card.status}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-5 flex flex-col sm:flex-row items-center gap-5">
                  {card.photo_path ? (
                    <img
                      src={card.photo_path}
                      alt={card.full_name}
                      className="h-24 w-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="h-24 w-20 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center font-serif-display text-xl font-bold shrink-0">
                      {getPersonInitials(card.full_name)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                    <h3 className="font-serif-display text-lg font-bold text-[#0B1F3A] dark:text-white truncate">
                      {card.full_name}
                    </h3>
                    <p className="font-mono-tabular text-xs font-bold text-[#A6863A] dark:text-[#C5A24D]">
                      {card.member_code}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {card.category_name} · {card.province_name}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-slate-500 flex flex-wrap justify-center sm:justify-start gap-x-2">
                      <span className="whitespace-nowrap">Emissão: {card.issued_at.slice(0, 10)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">Validade: {card.expires_at.slice(0, 10)}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">Emissor: {card.issuer_name}</p>
                  </div>

                  {qrMap[card.id] && (
                    <div className="shrink-0 text-center">
                      <img
                        src={qrMap[card.id]}
                        alt={`QR Code ${card.member_code}`}
                        className="h-24 w-24 rounded border border-slate-200 bg-white p-1"
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-[#F8F9FB] dark:bg-[#071121] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadMemberCardPdf({
                          ...card,
                          verifyUrl: `${origin}${verifyPath}`,
                          logoPath: catalog.settings.logo_path,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#0B1F3A] dark:bg-[#A6863A] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Descarregar PDF
                    </button>
                    <Link
                      href={verifyPath}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Validar QR
                    </Link>
                  </div>

                  {canManage && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReissue(card.member_id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0B1F3A] dark:text-[#C5A24D] hover:underline cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reemitir
                      </button>
                      {card.status === 'ATIVO' && (
                        <button
                          type="button"
                          onClick={() => handleInvalidate(card.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Invalidar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
