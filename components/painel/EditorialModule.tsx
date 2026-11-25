'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, ExternalLink, Upload } from 'lucide-react';
import { hasPermission, VOZ_JURIDICA_CATEGORIES } from '@/lib/domain';
import type { PanelProps } from './types';

interface PubRow {
  id: number;
  slug: string;
  title: string;
  category: string;
  author_name: string;
  status: string;
  views_count: number;
  published_at: string | null;
}

export function EditorialModule({ user }: PanelProps) {
  const [pubs, setPubs] = useState<PubRow[]>([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<string>(VOZ_JURIDICA_CATEGORIES[0]);
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [status, setStatus] = useState('PUBLICADO');
  const [scheduledAt, setScheduledAt] = useState('');
  const [msg, setMsg] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const canPublish = hasPermission(user.role_code, 'PUBLISH_EDITORIAL');
  const canApprove = hasPermission(user.role_code, 'APPROVE_EDITORIAL');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/publications?all=1')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPubs(data.publications || []);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  async function handleCoverUpload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'editorial');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) setCoverImage(data.filePath);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/publications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        subtitle,
        category,
        summary,
        content,
        cover_image: coverImage || null,
        video_url: videoUrl || null,
        status: canApprove ? status : 'PENDENTE_APROVACAO',
        scheduled_at: status === 'AGENDADO' ? scheduledAt : null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Publicação criada (${data.status}) em /voz-juridica/${data.slug}`);
      setTitle('');
      setSubtitle('');
      setSummary('');
      setContent('');
      setReloadTick((t) => t + 1);
    }
  }

  async function handleApprove(id: number, nextStatus: string) {
    await fetch('/api/publications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: nextStatus }),
    });
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#A6863A]">Comunicação e Imagem · SEO</p>
        <h2 className="font-serif-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
          A Voz Jurídica — Gestão Editorial
        </h2>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {canPublish && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#A6863A]" /> Novo Artigo, Comunicado ou Conteúdo Multimédia
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Título *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título principal da publicação"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Categoria *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              >
                {VOZ_JURIDICA_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Subtítulo</label>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Vídeo / Transmissão (URL opcional)</label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">Resumo / Meta Descrição SEO *</label>
              <input
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Síntese de 1 a 2 frases para o portal e motores de busca"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">Corpo do Texto *</label>
              <textarea
                required
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Redija aqui o artigo jurídico completo..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Imagem de Capa</label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs cursor-pointer">
                <Upload className="h-4 w-4 text-[#A6863A]" />
                <span>{coverImage ? 'Capa carregada' : 'Carregar imagem de capa'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverUpload(f);
                  }}
                />
              </label>
            </div>
            {canApprove && (
              <div>
                <label className="block text-xs font-semibold mb-1">Estado Editorial</label>
                <div className="flex gap-2">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-3 py-2 text-xs"
                  >
                    <option value="PUBLICADO">Publicar Imediatamente</option>
                    <option value="AGENDADO">Agendar Publicação</option>
                    <option value="RASCUNHO">Guardar Rascunho</option>
                  </select>
                  {status === 'AGENDADO' && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071121] px-2 py-2 text-xs"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            {canApprove ? 'Publicar em A Voz Jurídica' : 'Submeter para Aprovação Editorial'}
          </button>
        </form>
      )}

      {/* Editorial Queue */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B30] p-6">
        <h3 className="text-sm font-bold text-[#0B1F3A] dark:text-white mb-4">Publicações Registadas ({pubs.length})</h3>
        {pubs.length === 0 ? (
          <p className="text-xs text-slate-500">Sem publicações ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pubs.map((p) => (
              <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A] dark:text-white">{p.title}</p>
                  <p className="text-xs text-slate-500">
                    {p.category} · {p.author_name} · {p.status} · <span className="font-mono-tabular">{p.views_count}</span> leituras
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === 'PUBLICADO' && (
                    <Link
                      href={`/voz-juridica/${p.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px]"
                    >
                      <ExternalLink className="h-3 w-3" /> Ver
                    </Link>
                  )}
                  {canApprove && p.status !== 'PUBLICADO' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(p.id, 'PUBLICADO')}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Aprovar & Publicar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
